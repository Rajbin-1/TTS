import os
import sys
import subprocess
import urllib.request
import json
import threading
import webbrowser
from flask import Flask, render_template, request, jsonify, send_file

app = Flask(__name__)

def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller"""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Dictionary of available Piper voices with names, onnx model filenames, and Hugging Face URLs
VOICES = {
    "en_US-lessac-medium": {
        "name": "US Female (Lessac)",
        "onnx": "en_US-lessac-medium.onnx",
        "json": "en_US-lessac-medium.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    },
    "en_US-ryan-medium": {
        "name": "US Male (Ryan)",
        "onnx": "en_US-ryan-medium.onnx",
        "json": "en_US-ryan-medium.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx.json"
    },
    "en_GB-alan-medium": {
        "name": "UK Male (Alan)",
        "onnx": "en_GB-alan-medium.onnx",
        "json": "en_GB-alan-medium.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json"
    }
}

VOICES_DIR = os.path.expanduser("~/.piper_voices")

def ensure_voice_downloaded(voice_key):
    if voice_key not in VOICES:
        raise ValueError(f"Unknown voice: {voice_key}")
    
    os.makedirs(VOICES_DIR, exist_ok=True)
    voice_info = VOICES[voice_key]
    
    onnx_path = os.path.join(VOICES_DIR, voice_info["onnx"])
    json_path = os.path.join(VOICES_DIR, voice_info["json"])
    
    if not os.path.exists(onnx_path):
        print(f"Downloading model {voice_info['onnx']}...")
        urllib.request.urlretrieve(voice_info["url_onnx"], onnx_path)
        
    if not os.path.exists(json_path):
        print(f"Downloading config {voice_info['json']}...")
        urllib.request.urlretrieve(voice_info["url_json"], json_path)
        
    return onnx_path

@app.route("/")
def index():
    return render_template("index.html", voices=VOICES)

@app.route("/synthesize", methods=["POST"])
def synthesize():
    data = request.json or {}
    text = data.get("text", "").strip()
    voice_key = data.get("voice", "en_US-lessac-medium")
    try:
        speed = float(data.get("speed", 1.0))
    except ValueError:
        speed = 1.0
        
    if not text:
        return jsonify({"error": "No text provided"}), 400
        
    try:
        model_path = ensure_voice_downloaded(voice_key)
    except Exception as e:
        return jsonify({"error": f"Failed to download voice model: {str(e)}"}), 500
        
    length_scale = 1.0 / speed if speed > 0 else 1.0
    
    piper_exe = get_resource_path(os.path.join("piper", "piper.exe" if os.name == "nt" else "piper"))
    if not os.path.exists(piper_exe):
        piper_exe = "piper"
        
    output_wav = os.path.join(os.path.abspath("."), "output.wav")
    
    cmd = [
        piper_exe,
        "--model", model_path,
        "--output_file", output_wav,
        "--length_scale", str(length_scale)
    ]
    
    try:
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8"
        )
        stdout, stderr = process.communicate(input=text)
        if process.returncode != 0:
            return jsonify({"error": f"Piper synthesis failed: {stderr}"}), 500
    except Exception as e:
        return jsonify({"error": f"Failed to execute Piper: {str(e)}"}), 500
        
    return jsonify({"success": True, "audio_url": "/get-audio"})

@app.route("/get-audio")
def get_audio():
    output_wav = os.path.join(os.path.abspath("."), "output.wav")
    if os.path.exists(output_wav):
        return send_file(output_wav, mimetype="audio/wav")
    return jsonify({"error": "Audio not found"}), 404

if __name__ == "__main__":
    def open_browser():
        webbrowser.open_new("http://127.0.0.1:5000/")
        
    threading.Timer(1.5, open_browser).start()
    app.run(host="127.0.0.1", port=5000, debug=False)
