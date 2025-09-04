import json
import os
import time
import numpy as np
from pathlib import Path
from flask import Flask, render_template, request, jsonify, url_for
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
import io
import base64
from infer import Predictor

# ====== Paths based on your structure ======
# repo-root/
# └─ webapp/
#    ├─ web.py  (this file)
#    ├─ templates/
#    │   └─ index.html
#    │   └─ static/
#    │       ├─ css/style.css
#    │       └─ js/script.js

BASE_DIR = Path(__file__).parent.resolve()
TEMPLATES_DIR = BASE_DIR / 'templates'
# ⚠️ You placed static inside templates/, so point Flask there:
STATIC_DIR = TEMPLATES_DIR / 'static'

# Host and port
host = '0.0.0.0'
port = 33517

# Create Flask app pointing to templates/ and templates/static/
app = Flask(
    __name__,
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
    static_url_path='/static',   # URL like /static/css/style.css
)

# Dev settings: auto-reload templates and disable static caching
app.config.update(
    TEMPLATES_AUTO_RELOAD=True,
    SEND_FILE_MAX_AGE_DEFAULT=0,
)
app.jinja_env.auto_reload = True

# No-cache headers (dev convenience)
@app.after_request
def add_header(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp

# Enable CORS
CORS(app, resources={r"/*": {"origins": "*"}})

# Allowed file extensions
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'nrrd'}

predictor = Predictor()

# History JSON lives next to web.py
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


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def draw_boxes(image, annotations):
    draw = ImageDraw.Draw(image)
    line_width = max(1, int(min(image.width, image.height) * 0.005))

    font_size = int(min(image.width, image.height) * 0.03)
    font = None

    try_fonts = ["arial.ttf", "DejaVuSans.ttf", "LiberationSans.ttf"]
    for font_name in try_fonts:
        try:
            font = ImageFont.truetype(font_name, font_size)
            break
        except IOError:
            continue

    if font is None:
        font = ImageFont.load_default()
        print("Warning: Using default bitmap font.")

    for ann in annotations:
        bbox = ann.get('bbox') or ann.get('box') or ann.get('bbox_xywh')
        if not bbox or len(bbox) < 4:
            continue
        x, y, width, height = bbox[0], bbox[1], bbox[2], bbox[3]
        draw.rectangle([x, y, x + width, y + height], outline="red", width=line_width)

        label = str(int(ann.get('category_id', ann.get('class', 0))))
        text_bbox = draw.textbbox((0, 0), label, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]

        text_x = x
        text_y = y - text_height - 2
        if text_y < 0:
            text_y = y

        draw.rectangle([text_x, text_y, text_x + text_width, text_y + text_height], fill="red")
        draw.text((text_x, text_y), label, fill="white", font=font)

    return image


def process_image(file, gt_file=None, gt_json=None, infer_model=True):
    global predictor

    img = Image.open(file).convert('RGB')

    output = io.BytesIO()
    img.save(output, format='JPEG')
    image_data_orig = base64.b64encode(output.getvalue()).decode('utf-8')

    annotations = []
    gt_data = None
    if gt_json is not None:
        image_id = None
        for image in gt_json.get('images', []):
            if image.get('file_name') == file.filename:
                image_id = image.get('id')
                break
        if image_id is not None:
            annotations = [ann for ann in gt_json.get('annotations', []) if ann.get('image_id') == image_id]
    elif gt_file and gt_file.filename.endswith('.json'):
        gt_json_local = json.load(gt_file)
        image_id = None
        for image in gt_json_local.get('images', []):
            if image.get('file_name') == file.filename:
                image_id = image.get('id')
                break
        if image_id is not None:
            annotations = [ann for ann in gt_json_local.get('annotations', []) if ann.get('image_id') == image_id]

    if annotations:
        img_gt = draw_boxes(img.copy(), annotations)
        gt_output = io.BytesIO()
        img_gt.save(gt_output, format='JPEG')
        gt_data = base64.b64encode(gt_output.getvalue()).decode('utf-8')

    inferred_data = None
    predictions = []
    if infer_model:
        image_array = np.array(img)
        inferred_array, preds = predictor.infer(image_array, details=True)
        predictions = preds or []
        img_inferred = Image.fromarray(inferred_array)
        inferred_output = io.BytesIO()
        img_inferred.save(inferred_output, format='JPEG')
        inferred_data = base64.b64encode(inferred_output.getvalue()).decode('utf-8')

    return {
        "original_image": image_data_orig,
        "ground_truth_image": gt_data,
        "inferred_image": inferred_data,
        "predictions": predictions
    }


@app.route('/api/v1/health', methods=['GET'])
def health():
    return jsonify({"status": "success", "message": "API is running"}), 200


@app.route('/api/v1/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400

    files = request.files.getlist('file')
    if len(files) == 0:
        return jsonify({"status": "error", "message": "No selected file"}), 400

    for file in files:
        if not allowed_file(file.filename):
            return jsonify({"status": "error", "message": "Invalid file format"}), 400

    # Single file
    if len(files) == 1:
        file = files[0]
        gt_file = request.files.get('gt_file')
        try:
            result = process_image(file, gt_file=gt_file, infer_model=True)
            response = {
                "status": "success",
                "message": "Inference successful",
                "data": {
                    "original_image": result['original_image'],
                    "ground_truth_image": result['ground_truth_image'],
                    "inferred_image": result['inferred_image'],
                    "predictions": result['predictions']
                }
            }
            # Save to history
            try:
                hist = _load_history()
                scores = []
                for p in (result['predictions'] or []):
                    score = p.get("score")
                    if score is None:
                        score = p.get("confidence") or p.get("prob") or 0
                    scores.append(float(score))
                hist.append({
                    "ts": int(time.time()),
                    "filename": file.filename,
                    "num_detections": len(scores),
                    "scores": scores
                })
                _save_history(hist)
            except Exception as e:
                print("No se pudo guardar historial:", e)

            return jsonify(response), 200
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    # Multiple files
    else:
        gt_file = request.files.get('gt_file')
        gt_json = None
        if gt_file:
            if not gt_file.filename.endswith('.json'):
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
                        "predictions": result['predictions']
                    })
                    scores = []
                    for p in (result['predictions'] or []):
                        score = p.get("score")
                        if score is None:
                            score = p.get("confidence") or p.get("prob") or 0
                        scores.append(float(score))
                    hist.append({
                        "ts": int(time.time()),
                        "filename": file.filename,
                        "num_detections": len(scores),
                        "scores": scores
                    })
                except Exception as e:
                    return jsonify({"status": "error", "message": f"Error processing {file.filename}: {str(e)}"}), 500
            _save_history(hist)
        except Exception as e:
            print("No se pudo guardar historial (batch):", e)

        response = {
            "status": "success",
            "message": "Inference successful for multiple files",
            "data": results
        }
        return jsonify(response), 200


@app.route('/api/v1/ground-truth', methods=['POST'])
def ground_truth():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400

    file = request.files['file']
    gt_file = request.files.get('gt_file')

    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400

    if file and allowed_file(file.filename):
        try:
            result = process_image(file, gt_file, infer_model=False)
            response = {
                "status": "success",
                "message": "Ground truth processed successfully",
                "data": {
                    "original_image": result['original_image'],
                    "ground_truth_image": result['ground_truth_image']
                }
            }
            return jsonify(response), 200
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "error", "message": "Invalid file format"}), 400


@app.route('/api/v1/history', methods=['GET'])
def history():
    return jsonify({"status": "success", "data": _load_history()}), 200


@app.route('/api/v1/metrics', methods=['GET'])
def metrics():
    hist = _load_history()
    scores = []
    counts = []
    if hist:
        for case in hist[-30:]:
            scores.extend(case.get("scores", []))
            counts.append(case.get("num_detections", 0))
    return jsonify({"status": "success", "data": {"scores": scores, "counts": counts}}), 200


@app.route('/', methods=['GET', 'POST'])
def index():
    build_id = os.getenv('BUILD_ID', str(int(time.time())))

    if request.method == 'POST':
        if 'file' not in request.files:
            return render_template('index.html', message='No file part', BUILD_ID=build_id)

        file = request.files['file']
        gt_file = request.files.get('gt_file')

        if file.filename == '':
            return render_template('index.html', message='No selected file', BUILD_ID=build_id)

        if file and allowed_file(file.filename):
            result = process_image(file, gt_file)
            return render_template(
                'index.html',
                message='File uploaded successfully',
                image_data_orig=result['original_image'],
                gt_data=result['ground_truth_image'],
                image_data=result['inferred_image'],
                predictions=result['predictions'],
                BUILD_ID=build_id
            )

    return render_template('index.html', BUILD_ID=build_id)


if __name__ == '__main__':
    is_dev = os.getenv('FLASK_ENV', 'development') == 'development'
    if is_dev:
        app.run(host=host, port=port, debug=True, use_reloader=True)
    else:
        from waitress import serve
        serve(app.wsgi_app, host=host, port=port)
