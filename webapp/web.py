# web.py — CORE API + Explainable AI (Grad-CAM sobre Detectron2) con resolución flexible del modelo
import os
import io
import time
import json
from pathlib import Path
import base64
import pickle
import requests
import numpy as np
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
import requests

# ML
import torch
import torch.nn.functional as F
from torchvision.transforms.functional import to_tensor

#Chatbot
CHATBOT_URL = "http://127.0.0.1:33518/generate-response"

# Tu predictor existente (NO lo tocamos para inferencia)
from infer import Predictor

# =========================
# Rutas de plantillas/estáticos (tu estructura actual)
# =========================
BASE_DIR = Path(__file__).parent.resolve()
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = TEMPLATES_DIR / "static"

# Host y puerto
host = "0.0.0.0"
port = 33517

# =========================
# App Flask
# =========================
app = Flask(
    __name__,
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
    static_url_path="/static",
)
app.config.update(
    TEMPLATES_AUTO_RELOAD=True,
    SEND_FILE_MAX_AGE_DEFAULT=0,
)
app.jinja_env.auto_reload = True
CORS(app, resources={r"/*": {"origins": "*"}})

import requests, base64, io

XAI_API = os.getenv("XAI_API_URL", "http://127.0.0.1:33519/predict")

@app.route("/xai/gradcam", methods=["POST"])
def xai_gradcam():
    # Espera JSON: { "image_b64": "data:image/jpeg;base64,..." }
    data = request.get_json(silent=True) or {}
    b64uri = data.get("image_b64")
    if not b64uri:
        return jsonify({"error":"Falta image_b64"}), 400
    try:
        raw = base64.b64decode(b64uri.split(",")[-1])
    except Exception as e:
        return jsonify({"error": f"Base64 inválido: {e}"}), 400

    files = {"file": ("image.jpg", raw, "image/jpeg")}
    try:
        r = requests.post(XAI_API, files=files, timeout=60)
    except Exception as e:
        return jsonify({"error": f"No conecta a XAI_API: {e}"}), 502

    if r.status_code != 200:
        return jsonify({"error": f"XAI API HTTP {r.status_code}", "body": r.text[:400]}), 502
    payload = r.json()
    act = payload.get("activation_map")
    if not act:
        return jsonify({"error": "XAI API sin 'activation_map'"}), 502
    return jsonify({"activation_map_b64": act}), 200

@app.route('/api/v1/chatbot', methods=['POST'])
def api_chatbot():
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"status":"error","message":"Invalid JSON"}), 400
    try:
        r = requests.post(CHATBOT_URL, json=payload, timeout=60)
        return (r.text, r.status_code, {"Content-Type":"application/json"})
    except requests.exceptions.RequestException as e:
        return jsonify({"status":"error","message":f"Chatbot unreachable: {e}"}), 502

# No-cache (dev)
@app.after_request
def add_header(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp

# =========================
# Utilidades
# =========================
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "nrrd"}
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def _data_uri_to_pil(data_uri: str) -> Image.Image:
    b64 = data_uri.split(",")[-1]
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw)).convert("RGB")

def _pil_to_b64_jpeg(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")

# =========================
# Predictor (para inferencia normal)
# =========================
predictor = Predictor()
device = "cuda" if torch.cuda.is_available() else "cpu"

# =========================
# Resolver un modelo Detectron2 para XAI
# =========================
_DETECTRON_MODEL = None

def _try_get_model_from_predictor():
    # 1) predictor.model
    m = getattr(predictor, "model", None)
    if m is not None:
        return m
    # 2) predictor.get_model()
    get_m = getattr(predictor, "get_model", None)
    if callable(get_m):
        try:
            return get_m()
        except Exception:
            pass
    return None

def _try_build_model_from_cfg_files():
    """
    Carga detectron2 usando detectron.cfg.pkl y model.pth en el mismo directorio de web.py
    (según tus instrucciones de la web).
    """
    cfg_pkl = BASE_DIR / "detectron.cfg.pkl"
    weights = BASE_DIR / "model.pth"
    if not cfg_pkl.exists() or not weights.exists():
        return None

    try:
        import detectron2
        from detectron2.checkpoint import DetectionCheckpointer
        from detectron2.modeling import build_model

        with open(cfg_pkl, "rb") as f:
            cfg = pickle.load(f)

        # Asegurar pesos correctos
        cfg.MODEL.WEIGHTS = str(weights)

        model = build_model(cfg)
        DetectionCheckpointer(model).load(cfg.MODEL.WEIGHTS)
        model.eval()
        return model
    except Exception as e:
        print("[XAI] No se pudo construir el modelo desde detectron.cfg.pkl/model.pth:", e)
        return None

def _resolve_model_for_xai():
    global _DETECTRON_MODEL
    if _DETECTRON_MODEL is not None:
        return _DETECTRON_MODEL

    # Orden de resolución
    model = _try_get_model_from_predictor()
    if model is None:
        model = _try_build_model_from_cfg_files()

    if model is not None:
        _DETECTRON_MODEL = model.to(device).eval()
        print("[XAI] Modelo Detectron2 listo para Grad-CAM en", device)
    else:
        print("[XAI] No se pudo resolver un modelo Detectron2 para XAI.")
    return _DETECTRON_MODEL

# =========================
# Historial simple (JSON junto al web.py)
# =========================
HISTORY_PATH = BASE_DIR / "history.json"
def _load_history():
    try:
        if HISTORY_PATH.exists():
            with open(HISTORY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print("No se pudo cargar history.json:", e)
    return []

def _save_history(items):
    try:
        with open(HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(items[-200:], f, indent=2)
    except Exception as e:
        print("No se pudo guardar history.json:", e)

# =========================
# Dibujo de cajas para GT
# =========================
def draw_boxes(image: Image.Image, annotations):
    draw = ImageDraw.Draw(image)
    line_w = max(1, int(min(image.width, image.height) * 0.005))

    font_size = int(min(image.width, image.height) * 0.03)
    font = None
    for font_name in ["arial.ttf", "DejaVuSans.ttf", "LiberationSans.ttf"]:
        try:
            font = ImageFont.truetype(font_name, font_size)
            break
        except IOError:
            continue
    if font is None:
        font = ImageFont.load_default()

    for ann in annotations:
        bbox = ann.get("bbox") or ann.get("box") or ann.get("bbox_xywh")
        if not bbox or len(bbox) < 4:
            continue
        x, y, w, h = bbox[:4]
        draw.rectangle([x, y, x + w, y + h], outline="red", width=line_w)

        label = str(int(ann.get("category_id", ann.get("class", 0))))
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        tx, ty = x, max(0, y - th - 2)
        draw.rectangle([tx, ty, tx + tw, ty + th], fill="red")
        draw.text((tx, ty), label, fill="white", font=font)
    return image

# =========================
# Flujo de procesamiento de imagen (infer/gt)
# =========================
def process_image(file_storage, gt_file=None, gt_json=None, infer_model=True):
    img = Image.open(file_storage).convert("RGB")
    image_data_orig = _pil_to_b64_jpeg(img)

    # Buscar anotaciones por filename (si entregas COCO JSON)
    annotations, gt_data = [], None
    if gt_json is not None:
        image_id = None
        for im in gt_json.get("images", []):
            if im.get("file_name") == file_storage.filename:
                image_id = im.get("id")
                break
        if image_id is not None:
            annotations = [a for a in gt_json.get("annotations", []) if a.get("image_id") == image_id]
    elif gt_file and gt_file.filename.endswith(".json"):
        gt_json_local = json.load(gt_file)
        image_id = None
        for im in gt_json_local.get("images", []):
            if im.get("file_name") == file_storage.filename:
                image_id = im.get("id")
                break
        if image_id is not None:
            annotations = [a for a in gt_json_local.get("annotations", []) if a.get("image_id") == image_id]

    if annotations:
        img_gt = draw_boxes(img.copy(), annotations)
        gt_data = _pil_to_b64_jpeg(img_gt)

    inferred_data, predictions = None, []
    if infer_model:
        image_array = np.array(img)
        inferred_array, preds = predictor.infer(image_array, details=True)
        predictions = preds or []
        inferred_data = _pil_to_b64_jpeg(Image.fromarray(inferred_array))

    return {
        "original_image": image_data_orig,
        "ground_truth_image": gt_data,
        "inferred_image": inferred_data,
        "predictions": predictions,
    }

# =========================
# Explainable AI (Grad-CAM sobre Detectron2)
# =========================
class _GradCAMDetectron:
    """
    Grad-CAM para ResNet-FPN en Detectron2.
    target_layer por defecto: 'backbone.bottom_up.res5.2.conv3'
    Cambia si tu backbone difiere.
    """
    def __init__(self, model, target_layer="backbone.bottom_up.res5.2.conv3"):
        self.model = model.eval()
        self.fmaps = None
        self.grads = None
        # localizar capa
        module = self.model
        for part in target_layer.split("."):
            module = getattr(module, part)
        self.target_module = module
        # hooks
        self.fwd_hook = self.target_module.register_forward_hook(self._fwd)
        self.bwd_hook = self.target_module.register_full_backward_hook(self._bwd)

    def _fwd(self, m, i, o): self.fmaps = o.detach()
    def _bwd(self, m, gi, go): self.grads = go[0].detach()

    def _resize(self, cam, W, H):
        cam = cam[None, None, ...]
        cam = F.interpolate(torch.tensor(cam), size=(H, W), mode="bilinear", align_corners=False)
        cam = cam[0, 0].cpu().numpy()
        cam = (cam - cam.min()) / (cam.max() + 1e-8)
        return cam

    def generate(self, image_tensor, bbox_xyxy, score_tensor):
        # backprop desde la 'score' seleccionada
        self.model.zero_grad(set_to_none=True)
        score_tensor.backward(retain_graph=True)

        weights = self.grads.mean(dim=(2, 3), keepdim=True)  # (C,1,1)
        cam = (weights * self.fmaps).sum(dim=1)              # (N,H,W) con N=1
        cam = F.relu(cam)[0].cpu().numpy()

        # resize al tamaño de la imagen
        _, H, W = image_tensor.shape
        cam = self._resize(cam, W, H)

        # prioriza dentro de la bbox
        x1, y1, x2, y2 = map(int, bbox_xyxy)
        mask = np.zeros_like(cam)
        mask[max(0, y1):min(H, y2), max(0, x1):min(W, x2)] = 1.0
        cam *= (0.35 + 0.65 * mask)
        return cam

def _heatmap_overlay(rgb_uint8, cam, alpha=0.45) -> str:
    H, W, _ = rgb_uint8.shape
    cm = (np.stack([
        cam,                                  # R ~ activación
        0.5 * (1.0 - np.abs(cam - 0.5) * 2),  # G intermedio
        1.0 - cam                              # B inverso
    ], axis=-1) * 255).astype(np.uint8)
    base = Image.fromarray(rgb_uint8).convert("RGBA")
    hm = Image.fromarray(cm).resize((W, H), Image.BILINEAR).convert("RGBA")
    out = Image.blend(base, hm, alpha)
    buf = io.BytesIO(); out.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def _describe_region(rgb_uint8, bbox):
    x1, y1, x2, y2 = map(int, bbox)
    H, W, _ = rgb_uint8.shape
    x1, x2 = np.clip([x1, x2], 0, W - 1)
    y1, y2 = np.clip([y1, y2], 0, H - 1)
    crop = rgb_uint8[y1:y2, x1:x2]
    if crop.size == 0:
        return {"bullets": ["Región muy pequeña para describir."],
                "summary": "Zona marcada para inspección con acercamiento."}
    g = np.mean(crop, axis=2).astype(np.float32) / 255.0
    h, w = g.shape
    aspect = w / (h + 1e-6)
    gy, gx = np.gradient(g)
    edge = float(np.mean(np.hypot(gx, gy)))
    tex = float(np.var(g))
    den = float(np.mean(g))

    shape = "aprox. redondeada" if 0.85 <= aspect <= 1.15 else ("alargada horizontalmente" if aspect > 1.15 else "alargada verticalmente")
    edges = "bordes difusos" if edge < 0.05 else ("bordes parcialmente definidos" if edge < 0.12 else "bordes bien definidos")
    texture = "textura homogénea" if tex < 0.01 else ("textura moderada" if tex < 0.03 else "textura heterogénea")
    density = "apariencia más bien oscura" if den < 0.35 else ("apariencia intermedia" if den < 0.65 else "apariencia más bien clara")

    bullets = [f"Zona con forma {shape}.", f"{edges}.", f"{texture}.", f"{density} respecto al tejido cercano."]
    return {"bullets": bullets, "summary": "Área resaltada para apoyo visual (no diagnóstico)."}

def _explain_detections(model, image_pil: Image.Image, device="cuda", target_layer="backbone.bottom_up.res5.2.conv3", topk=3, score_min=0.3):
    """
    Devuelve lista de explicaciones: overlay PNG b64 + texto humano por detección top-k.
    """
    rgb = np.array(image_pil.convert("RGB"))
    cammer = _GradCAMDetectron(model, target_layer=target_layer)

    with torch.enable_grad():
        img_t = to_tensor(image_pil).to(device).unsqueeze(0)  # (1,3,H,W)
        img_t.requires_grad_(True)

        # Forward "crudo" a la red Detectron2
        model.eval()
        outputs = model([{"image": img_t[0]}])[0]["instances"]

        boxes = outputs.pred_boxes.tensor
        scores = outputs.scores
        if boxes.numel() == 0:
            return []

        # Selección por score
        scores_np = scores.detach().cpu().numpy()
        order = np.argsort(-scores_np)
        sel = [i for i in order if scores_np[i] >= score_min][:topk]

        explanations = []
        for i in sel:
            bbox = boxes[i].tolist()              # [x1,y1,x2,y2]
            score_tensor = scores[i]              # escalar para backward
            cam = cammer.generate(img_t[0], bbox, score_tensor)
            overlay_b64 = _heatmap_overlay(rgb, cam, alpha=0.45)
            text = _describe_region(rgb, bbox)
            explanations.append({
                "bbox": list(map(float, bbox)),
                "score": float(scores_np[i]),
                "overlay_png_b64": overlay_b64,
                "text": text
            })
        return explanations

@app.route("/explain", methods=["POST"])
def explain():
    """
    Body JSON:
      { "image_b64": "data:image/png;base64,...", "topk": 3, "score_min": 0.30 }
    Resp:
      { "explanations": [ {bbox, score, overlay_png_b64, text{bullets,summary}}, ... ] }
    """
    try:
        data = request.get_json(force=True)
        if not data or "image_b64" not in data:
            return jsonify({"error": "Falta image_b64"}), 400

        # resolver modelo para XAI (una vez)
        model = _resolve_model_for_xai()
        if model is None:
            return jsonify({"error": "Modelo Detectron2 no disponible para XAI. Asegura detectron.cfg.pkl y model.pth, o expón predictor.model/get_model()."}), 500

        img = _data_uri_to_pil(data["image_b64"])
        topk = int(data.get("topk", 3))
        score_min = float(data.get("score_min", 0.30))

        exps = _explain_detections(
            model, img, device=device,
            target_layer="backbone.bottom_up.res5.2.conv3",
            topk=topk, score_min=score_min
        )
        return jsonify({"explanations": exps}), 200
    except Exception as e:
        app.logger.exception("Explain error")
        return jsonify({"error": str(e)}), 400

# =========================
# Endpoints API existentes
# =========================
@app.route("/api/v1/health", methods=["GET"])
def health():
    return jsonify({"status": "success", "message": "API is running"}), 200

@app.route("/api/v1/predict", methods=["POST"])
def api_predict():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400

    files = request.files.getlist("file")
    if not files:
        return jsonify({"status": "error", "message": "No selected file"}), 400

    for f in files:
        if not allowed_file(f.filename):
            return jsonify({"status": "error", "message": "Invalid file format"}), 400

    # Un archivo
    if len(files) == 1:
        file = files[0]
        gt_file = request.files.get("gt_file")
        try:
            result = process_image(file, gt_file=gt_file, infer_model=True)
            response = {
                "status": "success",
                "message": "Inference successful",
                "data": {
                    "original_image": result["original_image"],
                    "ground_truth_image": result["ground_truth_image"],
                    "inferred_image": result["inferred_image"],
                    "predictions": result["predictions"],
                },
            }
            # Guardar a historial
            try:
                hist = _load_history()
                scores = []
                for p in (result["predictions"] or []):
                    score = p.get("score", p.get("confidence", p.get("prob", 0)))
                    scores.append(float(score))
                hist.append({
                    "ts": int(time.time()),
                    "filename": file.filename,
                    "num_detections": len(scores),
                    "scores": scores,
                })
                _save_history(hist)
            except Exception as e:
                print("No se pudo guardar historial:", e)

            return jsonify(response), 200
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    # Varios archivos
    else:
        gt_file = request.files.get("gt_file")
        gt_json = None
        if gt_file:
            if not gt_file.filename.endswith(".json"):
                return jsonify({"status": "error", "message": "GT file must be a JSON"}), 400
            try:
                gt_json = json.load(gt_file)
            except Exception as e:
                return jsonify({"status": "error", "message": f"Error loading GT JSON: {str(e)}"}), 400

        results = []
        try:
            hist = _load_history()
            for file in files:
                try:
                    result = process_image(file, gt_json=gt_json, infer_model=True)
                    results.append({
                        "filename": file.filename,
                        "predictions": result["predictions"],
                    })
                    scores = []
                    for p in (result["predictions"] or []):
                        score = p.get("score", p.get("confidence", p.get("prob", 0)))
                        scores.append(float(score))
                    hist.append({
                        "ts": int(time.time()),
                        "filename": file.filename,
                        "num_detections": len(scores),
                        "scores": scores,
                    })
                except Exception as e:
                    return jsonify({"status": "error", "message": f"Error processing {file.filename}: {str(e)}"}), 500
            _save_history(hist)
        except Exception as e:
            print("No se pudo guardar historial (batch):", e)

        response = {
            "status": "success",
            "message": "Inference successful for multiple files",
            "data": results,
        }
        return jsonify(response), 200

@app.route("/api/v1/ground-truth", methods=["POST"])
def ground_truth():
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400

    file = request.files["file"]
    gt_file = request.files.get("gt_file")

    if file.filename == "":
        return jsonify({"status": "error", "message": "No selected file"}), 400

    if file and allowed_file(file.filename):
        try:
            result = process_image(file, gt_file, infer_model=False)
            response = {
                "status": "success",
                "message": "Ground truth processed successfully",
                "data": {
                    "original_image": result["original_image"],
                    "ground_truth_image": result["ground_truth_image"],
                },
            }
            return jsonify(response), 200
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "error", "message": "Invalid file format"}), 400

@app.route("/api/v1/history", methods=["GET"])
def history():
    return jsonify({"status": "success", "data": _load_history()}), 200

@app.route("/api/v1/metrics", methods=["GET"])
def metrics():
    hist = _load_history()
    scores, counts = [], []
    if hist:
        for case in hist[-30:]:
            scores.extend(case.get("scores", []))
            counts.append(case.get("num_detections", 0))
    return jsonify({"status": "success", "data": {"scores": scores, "counts": counts}}), 200

# =========================
# Front-end (index)
# =========================
@app.route("/", methods=["GET", "POST"])
def index():
    build_id = os.getenv("BUILD_ID", str(int(time.time())))
    if request.method == "POST":
        if "file" not in request.files:
            return render_template("index.html", message="No file part", BUILD_ID=build_id)

        file = request.files["file"]
        gt_file = request.files.get("gt_file")

        if file.filename == "":
            return render_template("index.html", message="No selected file", BUILD_ID=build_id)

        if file and allowed_file(file.filename):
            result = process_image(file, gt_file)
            return render_template(
                "index.html",
                message="File uploaded successfully",
                image_data_orig=result["original_image"],
                gt_data=result["ground_truth_image"],
                image_data=result["inferred_image"],
                predictions=result["predictions"],
                BUILD_ID=build_id,
            )
    return render_template("index.html", BUILD_ID=build_id)

# =========================
# Arranque
# =========================
if __name__ == "__main__":
    is_dev = os.getenv("FLASK_ENV", "development") == "development"
    if is_dev:
        app.run(host=host, port=port, debug=True, use_reloader=True)
    else:
        from waitress import serve
        serve(app.wsgi_app, host=host, port=port)
