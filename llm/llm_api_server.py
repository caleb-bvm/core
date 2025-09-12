import os
import sys
import cloudpickle
from uuid import uuid4
from typing import List, Optional
from chardet import UniversalDetector
from flask import Flask, request, jsonify
import waitress
import json
from langchain.schema import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pathlib import Path
from flask_cors import CORS
from flask import Flask, request, jsonify, Response
from collections import OrderedDict
import hashlib, time, re

# --- CACHE simple en memoria (5 min, máx 256 entradas) ---
CACHE_TTL_SEC = 300
CACHE_MAX = 256
_CACHE = OrderedDict()

def _cache_key(model_name, prompt, preds_sig):
    base = f"{model_name}|{prompt}|{preds_sig}"
    return hashlib.sha256(base.encode()).hexdigest()

def _cache_get(k):
    now = time.time()
    v = _CACHE.get(k)
    if not v: return None
    if now - v["ts"] > CACHE_TTL_SEC:
        _CACHE.pop(k, None); return None
    # LRU touch
    _CACHE.move_to_end(k)
    return v["data"]

def _cache_put(k, data):
    _CACHE[k] = {"ts": time.time(), "data": data}
    _CACHE.move_to_end(k)
    while len(_CACHE) > CACHE_MAX:
        _CACHE.popitem(last=False)

# --- Firmar subset de predicciones para cache y conversación ---
def preds_signature(preds):
    if not preds: return "none"
    mini = []
    for d in preds:
        mini.append({
            "id": d.get("id") or "",
            "c": d.get("class"),
            "s": round(float(d.get("score", 0)), 2),
        })
    return hashlib.md5(json.dumps(mini, sort_keys=True).encode()).hexdigest()

# --- Extraer JSON de bloque ```...``` si viene en el texto ---
def extract_struct(text):
    if not isinstance(text, str): return None
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    if not m: return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None

# --- Sugerencias próximas (baratas) ---
DEFAULT_SUGGESTIONS = [
    "Justifica la categoría BI-RADS",
    "¿Qué estudios complementarios recomendarías?",
    "Resume en 5 viñetas para el reporte"
]


# Configuration
language = "Spanish"
host = "0.0.0.0"
port = 33518
config_json = "config.json"
config_json_default = "config.json.default"
demo_directory = "demo"
CONVERSATIONS_FOLDER = "conversations"
MAX_CONVERSATIONS = 40
CLEANUP_THRESHOLD = 20

script_dir = os.path.dirname(os.path.realpath(__file__))
config_json = os.path.join(script_dir, config_json)

# Default context
text_context_prepend = ("Role play: You are a radiologist." +
                        "You give expert opinion on mammography images for breast cancer screening." +
                        "We have a deep learning model that predicts suspicious mass and their low / high risk of breast cancer." +
                        "Low risk means BI-RADS <= 3, high risk is BI-RADS > 3." +
                        "You are given the model predictions where class = 0 is low, class = 1 is high risk." +
                        f"No matter the input language, you must ALWAYS speak in {language}.")
text_predictions = "Model predictions on the image is: {}"
text_description = "Description of the image: {}"

# Load configuration
if not os.path.exists(config_json):
    raise Exception(f"{config_json} not found!")

with open(config_json, "r") as config_file:
    config = json.load(config_file)

BASE_URL = config.get("base_url")
API_KEY = config.get("api_key")

app = Flask(__name__)

# Enable CORS and allow all hosts
CORS(app, resources={r"/*": {"origins": "*"}})


# Conversation storage
def init_storage():
    if not os.path.exists(CONVERSATIONS_FOLDER):
        os.makedirs(CONVERSATIONS_FOLDER)


def cleanup_old_conversations():
    """Remove oldest conversations when the number of files exceeds the threshold"""
    conversation_files = []
    for file in Path(CONVERSATIONS_FOLDER).glob("*.pkl"):
        conversation_files.append((file, file.stat().st_mtime))

    if len(conversation_files) >= MAX_CONVERSATIONS:
        # Sort by modification time (oldest first)
        conversation_files.sort(key=lambda x: x[1])

        # Remove the oldest files until we reach MAX_CONVERSATIONS - CLEANUP_THRESHOLD
        files_to_remove = len(conversation_files) - (MAX_CONVERSATIONS - CLEANUP_THRESHOLD)
        for file, _ in conversation_files[:files_to_remove]:
            try:
                file.unlink()
            except Exception as e:
                print(f"Error removing file {file}: {e}")


def save_conversation(conversation_id: str, context: List[dict]):
    file_path = os.path.join(CONVERSATIONS_FOLDER, f"{conversation_id}.pkl")
    with open(file_path, "wb") as file:
        cloudpickle.dump(context, file)

    # Check and cleanup after each save
    cleanup_old_conversations()


def get_conversation(conversation_id: str) -> Optional[List[dict]]:
    file_path = os.path.join(CONVERSATIONS_FOLDER, f"{conversation_id}.pkl")
    if os.path.exists(file_path):
        with open(file_path, "rb") as file:
            return cloudpickle.load(file)
    return None


def convert_to_message(obj: dict):
    role = obj.get("role")
    content = obj.get("content")
    if role == "system":
        return SystemMessage(content=content)
    elif role == "user":
        return HumanMessage(content=content)
    elif role == "assistant":
        return AIMessage(content=content)
    return None


def convert_to_dict(message):
    return {"role": message.role, "content": message.content}


# LangChain API
class LangChainAPI:
    def __init__(self, api_key: str, base_url: str):
        self.llm_chat = ChatOpenAI(model="gpt-3.5-turbo", base_url=base_url, api_key=api_key)

    def generate_response(self, prompt: str, context: List[dict]) -> str:
        messages = [convert_to_message(msg) for msg in context]
        messages.append(HumanMessage(content=prompt))
        response = self.llm_chat.invoke(messages)
        return response.content


langchain_api = LangChainAPI(api_key=API_KEY, base_url=BASE_URL)


@app.route('/generate-response', methods=['POST'])
def generate_response():
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        prompt = data.get('prompt')
        context = data.get('context')
        predictions = data.get('predictions')
        demo = data.get('demo')

        stream = request.args.get("stream") == "1"

        if not prompt:
            return jsonify({"error": "Prompt is required."}), 400

        # Prepare context
        if not context:
            context = text_context_prepend
        else:
            context = text_context_prepend + context

        if predictions:
            predictions_str = str(predictions)
            context += text_predictions.format(predictions_str)

        if demo:
            demo_text = demo_get_text(demo)
            if demo_text:
                context += text_description.format(demo_text)

        # Conversation context
        if conversation_id:
            loaded_context = get_conversation(conversation_id)
            if not loaded_context:
                return jsonify({"error": "Invalid conversation ID."}), 400
            context_list = loaded_context
        else:
            conversation_id = str(uuid4())
            context_list = [{"role": "system", "content": context}]

        # --- CACHE signature ---
        sig = preds_signature(predictions or [])
        model_name = "openai"
        ckey = _cache_key(model_name, prompt, sig)
        hit = _cache_get(ckey)
        if hit and not stream:
            return jsonify({**hit, "conversation_id": conversation_id, "cached": True}), 200

        # Call LLM
        answer_text = langchain_api.generate_response(prompt, context_list)
        context_list.append({"role": "user", "content": prompt})
        context_list.append({"role": "assistant", "content": answer_text})

        save_conversation(conversation_id, context_list)

        # Try to extract structured block
        struct = extract_struct(answer_text) or None

        # Suggestions
        suggested_prompts = list(DEFAULT_SUGGESTIONS)
        if predictions:
            ids = [d.get("id") for d in predictions if d.get("score", 0) >= 0.8]
            if len(ids) >= 2:
                suggested_prompts.insert(0, f"Compara {ids[0]} con {ids[1]}")

        # Evidence IDs
        evidence_ids = [d.get("id") for d in (predictions or []) if d.get("id")]

        payload = {
            "text": answer_text,
            "struct": struct,
            "suggested_prompts": suggested_prompts[:4],
            "evidence_ids": evidence_ids,
        }

        if not stream:
            _cache_put(ckey, payload)
            return jsonify({**payload, "conversation_id": conversation_id}), 200

        def gen():
            for part in answer_text.split(" "):
                yield part + " "
                time.sleep(0.01)

        return Response(gen(), mimetype="text/plain")

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def demo_get_text(demo_file):
    for demo_text_file in os.listdir(demo_directory):
        demo_prefix = Path(demo_text_file).stem
        if demo_prefix in demo_file:
            demo_text_file_path = os.path.join(demo_directory, demo_text_file)
            demo_text = read_demo_text_file(demo_text_file_path)
            return demo_text
    print("Demo requested but demo directory did not contain the required text file!", file=sys.stderr)


def read_demo_text_file(filepath):
    detector = UniversalDetector()

    with open(filepath, 'rb') as file:
        for line in file:
            detector.feed(line)
            if detector.done:
                break
        detector.close()

        encoding = detector.result['encoding']
        if encoding is None:
            raise ValueError("Unable to detect file encoding.")

        file.seek(0)
        return file.read().decode(encoding)


if __name__ == "__main__":
    init_storage()
    waitress.serve(app, host=host, port=port)
