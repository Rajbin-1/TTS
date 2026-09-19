import os
import sys
import time
import uuid
import json
import sqlite3
import threading
import subprocess
import urllib.request
import webbrowser
from flask import Flask, render_template, request, jsonify, send_file

# ---------------------------------------------------------------------------
# Path & Asset Resolution (PyInstaller Safe)
# ---------------------------------------------------------------------------
def get_resource_path(relative_path):
    """Get absolute path to resource, works for dev and for PyInstaller bundle."""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

# System user-writable directory for database, weights, and generated audio
APP_DIR = os.path.expanduser("~/.piper_tts_app")
VOICES_DIR = os.path.join(APP_DIR, "voices")
AUDIO_DIR = os.path.join(APP_DIR, "audio")
DB_PATH = os.path.join(APP_DIR, "app.db")

for directory in [APP_DIR, VOICES_DIR, AUDIO_DIR]:
    os.makedirs(directory, exist_ok=True)

app = Flask(
    __name__,
    template_folder=get_resource_path("templates"),
    static_folder=get_resource_path("static"),
    static_url_path="/static"
)

# ---------------------------------------------------------------------------
# Database Initialization (SQLite)
# ---------------------------------------------------------------------------
def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            text TEXT NOT NULL,
            voice TEXT NOT NULL,
            voice_name TEXT NOT NULL,
            speed REAL NOT NULL,
            pause_silence REAL DEFAULT 0.2,
            char_count INTEGER DEFAULT 0,
            word_count INTEGER DEFAULT 0,
            file_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS collection_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collection_id INTEGER NOT NULL,
            history_id INTEGER NOT NULL,
            chapter_title TEXT,
            order_index INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE CASCADE,
            FOREIGN KEY (history_id) REFERENCES history (id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ---------------------------------------------------------------------------
# Voice Model Definitions
# ---------------------------------------------------------------------------
VOICES = {
    "en_US-lessac-high": {
        "name": "US Female (Lessac - High Quality, 22.05 kHz)",
        "quality": "High (22.05 kHz)",
        "language": "English (US)",
        "gender": "Female",
        "onnx": "en_US-lessac-high.onnx",
        "json": "en_US-lessac-high.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx.json"
    },
    "en_US-amy-medium": {
        "name": "US Female (Amy - Medium Quality, 22.05 kHz)",
        "quality": "Medium (22.05 kHz)",
        "language": "English (US)",
        "gender": "Female",
        "onnx": "en_US-amy-medium.onnx",
        "json": "en_US-amy-medium.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
    },
    "en_US-danny-low": {
        "name": "US Male (Danny - Low Quality, 16 kHz)",
        "quality": "Low (16 kHz)",
        "language": "English (US)",
        "gender": "Male",
        "onnx": "en_US-danny-low.onnx",
        "json": "en_US-danny-low.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/danny/low/en_US-danny-low.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/danny/low/en_US-danny-low.onnx.json"
    },
    "en_US-ryan-high": {
        "name": "US Male (Ryan - High Quality, 22.05 kHz)",
        "quality": "High (22.05 kHz)",
        "language": "English (US)",
        "gender": "Male",
        "onnx": "en_US-ryan-high.onnx",
        "json": "en_US-ryan-high.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx.json"
    },
    "en_GB-alan-medium": {
        "name": "UK Male (Alan - Medium Quality, 22.05 kHz)",
        "quality": "Medium (22.05 kHz)",
        "language": "English (UK)",
        "gender": "Male",
        "onnx": "en_GB-alan-medium.onnx",
        "json": "en_GB-alan-medium.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json"
    },
    "en_GB-southern_english_female-low": {
        "name": "UK Female (Southern English - Low Quality, 16 kHz)",
        "quality": "Low (16 kHz)",
        "language": "English (UK)",
        "gender": "Female",
        "onnx": "en_GB-southern_english_female-low.onnx",
        "json": "en_GB-southern_english_female-low.onnx.json",
        "url_onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx",
        "url_json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/southern_english_female/low/en_GB-southern_english_female-low.onnx.json"
    }
}

# ---------------------------------------------------------------------------
# Piper Subprocess & Process Tracking
# ---------------------------------------------------------------------------
active_processes = set()
process_lock = threading.Lock()

def get_piper_executable():
    """Resolve piper binary path with fallback candidates."""
    candidates = [
        get_resource_path(os.path.join("piper", "piper.exe" if os.name == "nt" else "piper")),
        get_resource_path("piper.exe" if os.name == "nt" else "piper"),
        "piper.exe" if os.name == "nt" else "piper"
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return "piper"

# ---------------------------------------------------------------------------
# Voice Model Download Integrity & Self-Healing Protocol
# ---------------------------------------------------------------------------
def is_valid_onnx(file_path):
    """Verify ONNX model file exists, is non-zero, not an HTML error page, and >= 1MB."""
    if not os.path.exists(file_path):
        return False
    size = os.path.getsize(file_path)
    # Valid Piper models are at least 15MB; CDN 404/rate-limit error pages are < 100KB
    if size < 1_000_000:
        return False
    try:
        with open(file_path, "rb") as f:
            header = f.read(512)
            # Verify it is not an HTML error response from HuggingFace
            if b"<!DOCTYPE" in header or b"<html" in header or b"404: Not Found" in header:
                return False
            # Ensure valid readable non-empty binary header
            return len(header) >= 16
    except Exception:
        return False

def is_valid_onnx_json(file_path):
    """Verify JSON configuration exists, is non-zero, and is valid parseable JSON."""
    if not os.path.exists(file_path):
        return False
    if os.path.getsize(file_path) < 50:
        return False
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return isinstance(data, dict) and bool(data)
    except Exception:
        return False

def is_voice_healthy(voice_key):
    """Check if both .onnx and .onnx.json are present and valid."""
    if voice_key not in VOICES:
        return False
    info = VOICES[voice_key]
    onnx_path = os.path.join(VOICES_DIR, info["onnx"])
    json_path = os.path.join(VOICES_DIR, info["json"])
    return is_valid_onnx(onnx_path) and is_valid_onnx_json(json_path)

def download_file_safe(url, destination_path, file_desc=""):
    """
    Download file using a temporary .downloading extension.
    Renames to destination_path only upon verified completion.
    Provides streaming progress logging.
    """
    temp_path = destination_path + ".downloading"
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass

    print(f"[Model Downloader] Starting download for {file_desc}: {url}")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PiperTTS/1.0"}
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response, open(temp_path, "wb") as out_file:
            total_size = response.headers.get("content-length")
            total_size = int(total_size) if total_size else None
            downloaded = 0
            last_pct_logged = -10

            chunk_size = 128 * 1024  # 128 KB chunks
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)
                if total_size:
                    pct = int((downloaded / total_size) * 100)
                    if pct >= last_pct_logged + 10:
                        mb_done = downloaded / (1024 * 1024)
                        mb_total = total_size / (1024 * 1024)
                        print(f"[Model Downloader] {file_desc}: {pct}% ({mb_done:.1f}MB / {mb_total:.1f}MB)")
                        last_pct_logged = pct

        # Atomic replace to prevent half-downloaded execution
        if os.path.exists(destination_path):
            try:
                os.remove(destination_path)
            except Exception:
                pass
        os.replace(temp_path, destination_path)
        print(f"[Model Downloader] Finished and verified: {file_desc}")
    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise RuntimeError(f"Download failed for {file_desc} ({url}): {str(e)}")

def ensure_voice_downloaded(voice_key):
    """
    Check voice model integrity in ~/.piper_tts_app/voices.
    If missing, 0-byte, or corrupted, automatically re-downloads cleanly with .downloading temp extension.
    """
    if voice_key not in VOICES:
        raise ValueError(f"Unknown voice key: {voice_key}")

    voice_info = VOICES[voice_key]
    onnx_path = os.path.join(VOICES_DIR, voice_info["onnx"])
    json_path = os.path.join(VOICES_DIR, voice_info["json"])

    # 1. Check and re-download .onnx if missing, zero-byte, or corrupt
    if not is_valid_onnx(onnx_path):
        if os.path.exists(onnx_path):
            print(f"[Model Downloader] Detected corrupt or invalid model file ({os.path.getsize(onnx_path)} bytes). Removing for clean re-download: {onnx_path}")
            try:
                os.remove(onnx_path)
            except Exception:
                pass
        download_file_safe(voice_info["url_onnx"], onnx_path, f"{voice_info['name']} [.onnx]")
        if not is_valid_onnx(onnx_path):
            raise RuntimeError(f"Downloaded model failed integrity check: {onnx_path}")

    # 2. Check and re-download .onnx.json if missing, zero-byte, or invalid JSON
    if not is_valid_onnx_json(json_path):
        if os.path.exists(json_path):
            print(f"[Model Downloader] Detected corrupt or invalid config file. Removing for clean re-download: {json_path}")
            try:
                os.remove(json_path)
            except Exception:
                pass
        download_file_safe(voice_info["url_json"], json_path, f"{voice_info['name']} [.json]")
        if not is_valid_onnx_json(json_path):
            raise RuntimeError(f"Downloaded config failed JSON validation: {json_path}")

    return onnx_path

# ---------------------------------------------------------------------------
# Subprocess IO Isolation & Timeout Safeguards
# ---------------------------------------------------------------------------
def execute_piper_headless(cmd, input_text, timeout=15, cleanup_file=None):
    """
    Execute Piper CLI completely headless without black console windows on Windows.
    Enforces UTF-8 byte encoding and strict process timeout isolation.
    Safely kills child processes and cleans up partial audio files on timeout or error.
    """
    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 0x00000001)

    # Use raw byte streams for stdin/stdout/stderr for strict UTF-8 byte isolation
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
        creationflags=creationflags,
        startupinfo=startupinfo
    )

    with process_lock:
        active_processes.add(proc)

    try:
        input_bytes = input_text.encode("utf-8")
        stdout_bytes, stderr_bytes = proc.communicate(input=input_bytes, timeout=timeout)

        stdout_str = stdout_bytes.decode("utf-8", errors="replace")
        stderr_str = stderr_bytes.decode("utf-8", errors="replace")

        if proc.returncode != 0:
            if cleanup_file and os.path.exists(cleanup_file):
                try:
                    os.remove(cleanup_file)
                except Exception:
                    pass
            raise RuntimeError(f"Piper execution failed (exit code {proc.returncode}): {stderr_str.strip()}")

        return stdout_str, stderr_str

    except subprocess.TimeoutExpired:
        print(f"[Process Manager] Synthesis timed out after {timeout}s! Terminating piper process...")
        try:
            proc.kill()
        except Exception:
            pass
        # Drain buffers to prevent resource leaks
        try:
            proc.communicate(timeout=2)
        except Exception:
            pass
        # Wipe any invalid partial audio file
        if cleanup_file and os.path.exists(cleanup_file):
            try:
                os.remove(cleanup_file)
                print(f"[Process Manager] Cleaned up partial audio file: {cleanup_file}")
            except Exception:
                pass
        raise TimeoutError(f"Speech synthesis timed out after {timeout} seconds. The process was safely terminated.")

    except Exception as e:
        if cleanup_file and os.path.exists(cleanup_file) and os.path.getsize(cleanup_file) == 0:
            try:
                os.remove(cleanup_file)
            except Exception:
                pass
        raise e

    finally:
        with process_lock:
            active_processes.discard(proc)

# ---------------------------------------------------------------------------
# Heartbeat & Auto-Shutdown Watchdog
# ---------------------------------------------------------------------------
last_heartbeat_time = time.time()
server_initialized = False

def trigger_clean_shutdown():
    """Forcibly kill any lingering piper processes and terminate the server cleanly."""
    print("[Lifecycle] Performing clean shutdown...")
    with process_lock:
        for p in list(active_processes):
            try:
                p.kill()
            except Exception:
                pass
    def delayed_exit():
        time.sleep(0.6)
        os._exit(0)
    threading.Thread(target=delayed_exit, daemon=True).start()

def watchdog_loop():
    """Monitor browser activity. If tab is closed and heartbeats stop, auto-shutdown."""
    global last_heartbeat_time, server_initialized
    while True:
        time.sleep(5)
        if server_initialized:
            elapsed = time.time() - last_heartbeat_time
            if elapsed > 45:
                print(f"[Lifecycle] No heartbeat received for {int(elapsed)}s. Shutting down server.")
                trigger_clean_shutdown()
                break

watchdog_thread = threading.Thread(target=watchdog_loop, daemon=True)
watchdog_thread.start()

# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    global server_initialized, last_heartbeat_time
    server_initialized = True
    last_heartbeat_time = time.time()
    return render_template("index.html")

@app.route("/api/heartbeat", methods=["POST"])
def heartbeat():
    global last_heartbeat_time, server_initialized
    server_initialized = True
    last_heartbeat_time = time.time()
    return jsonify({"status": "alive", "timestamp": last_heartbeat_time})

@app.route("/api/shutdown", methods=["POST"])
def shutdown():
    trigger_clean_shutdown()
    return jsonify({"status": "shutting_down", "message": "Server process cleanly terminating"})

@app.route("/api/voices", methods=["GET"])
def get_voices():
    result = []
    for key, v in VOICES.items():
        is_cached = is_voice_healthy(key)
        result.append({
            "key": key,
            "name": v["name"],
            "quality": v["quality"],
            "language": v["language"],
            "gender": v["gender"],
            "is_cached": is_cached
        })
    return jsonify(result)

@app.route("/api/preview", methods=["POST"])
def preview_voice():
    data = request.json or {}
    voice_key = data.get("voice", "en_US-lessac-high")
    preview_phrase = "Hello! This is a high-fidelity preview of this neural speech voice."

    try:
        model_path = ensure_voice_downloaded(voice_key)
    except Exception as e:
        return jsonify({"error": f"Failed to acquire voice model: {str(e)}"}), 500

    piper_exe = get_piper_executable()
    preview_filename = f"preview_{voice_key}.wav"
    preview_filepath = os.path.join(AUDIO_DIR, preview_filename)

    cmd = [
        piper_exe,
        "--model", model_path,
        "--output_file", preview_filepath
    ]

    try:
        execute_piper_headless(cmd, preview_phrase, timeout=15, cleanup_file=preview_filepath)
    except TimeoutError as te:
        return jsonify({"error": str(te), "timeout": True}), 504
    except Exception as e:
        return jsonify({"error": f"Preview synthesis failed: {str(e)}"}), 500

    return jsonify({
        "success": True,
        "audio_url": f"/api/audio/{preview_filename}"
    })

@app.route("/api/synthesize", methods=["POST"])
def synthesize():
    data = request.json or {}
    text = (data.get("text") or "").strip()
    voice_key = data.get("voice", "en_US-lessac-high")
    title = (data.get("title") or "").strip() or "Untitled"
    
    try:
        speed = float(data.get("speed", 1.0))
        speed = max(0.5, min(2.0, speed))
    except (ValueError, TypeError):
        speed = 1.0

    try:
        pause_silence = float(data.get("pause_silence", 0.2))
        pause_silence = max(0.0, min(1.5, pause_silence))
    except (ValueError, TypeError):
        pause_silence = 0.2

    if not text:
        return jsonify({"error": "No text provided for synthesis"}), 400

    # Ensure model is ready
    try:
        model_path = ensure_voice_downloaded(voice_key)
    except Exception as e:
        return jsonify({"error": f"Could not prepare voice model: {str(e)}"}), 500

    # Piper length_scale calculation: 1.0 / speed
    length_scale = 1.0 / speed if speed > 0 else 1.0
    piper_exe = get_piper_executable()

    unique_id = uuid.uuid4().hex[:12]
    filename = f"tts_{unique_id}.wav"
    output_filepath = os.path.join(AUDIO_DIR, filename)

    cmd = [
        piper_exe,
        "--model", model_path,
        "--output_file", output_filepath,
        "--length_scale", str(length_scale),
        "--sentence_silence", str(pause_silence)
    ]

    try:
        execute_piper_headless(cmd, text, timeout=15, cleanup_file=output_filepath)
    except TimeoutError as te:
        return jsonify({"error": str(te), "timeout": True}), 504
    except Exception as e:
        return jsonify({"error": f"Speech generation error: {str(e)}"}), 500

    # Save to SQLite history
    char_count = len(text)
    word_count = len(text.split())
    voice_name = VOICES.get(voice_key, {}).get("name", voice_key)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO history (title, text, voice, voice_name, speed, pause_silence, char_count, word_count, file_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (title, text, voice_key, voice_name, speed, pause_silence, char_count, word_count, filename))
    history_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "id": history_id,
        "title": title,
        "file_name": filename,
        "audio_url": f"/api/audio/{filename}",
        "char_count": char_count,
        "word_count": word_count,
        "voice": voice_key,
        "voice_name": voice_name,
        "speed": speed,
        "pause_silence": pause_silence
    })

@app.route("/api/audio/<filename>", methods=["GET"])
def serve_audio(filename):
    # Prevent directory traversal attacks
    clean_filename = os.path.basename(filename)
    audio_path = os.path.join(AUDIO_DIR, clean_filename)
    if os.path.exists(audio_path):
        return send_file(audio_path, mimetype="audio/wav")
    return jsonify({"error": "Audio file not found"}), 404

@app.route("/api/history", methods=["GET"])
def get_history():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM history ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()

    history_list = []
    for r in rows:
        history_list.append({
            "id": r["id"],
            "title": r["title"],
            "text": r["text"],
            "voice": r["voice"],
            "voice_name": r["voice_name"],
            "speed": r["speed"],
            "pause_silence": r["pause_silence"],
            "char_count": r["char_count"],
            "word_count": r["word_count"],
            "file_name": r["file_name"],
            "audio_url": f"/api/audio/{r['file_name']}",
            "created_at": r["created_at"]
        })
    return jsonify(history_list)

@app.route("/api/history/delete/<int:history_id>", methods=["POST"])
def delete_history(history_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_name FROM history WHERE id = ?", (history_id,))
    row = cursor.fetchone()
    if row:
        file_path = os.path.join(AUDIO_DIR, row["file_name"])
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass
        cursor.execute("DELETE FROM history WHERE id = ?", (history_id,))
        cursor.execute("DELETE FROM collection_items WHERE history_id = ?", (history_id,))
        conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/collections", methods=["GET"])
def get_collections():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM collections ORDER BY id DESC")
    collections_rows = cursor.fetchall()

    result = []
    for col in collections_rows:
        col_id = col["id"]
        cursor.execute("""
            SELECT ci.id as item_id, ci.chapter_title, ci.order_index, h.id as history_id,
                   h.title, h.voice_name, h.speed, h.file_name, h.word_count
            FROM collection_items ci
            JOIN history h ON ci.history_id = h.id
            WHERE ci.collection_id = ?
            ORDER BY ci.order_index ASC, ci.id ASC
        """, (col_id,))
        items = []
        for it in cursor.fetchall():
            items.append({
                "item_id": it["item_id"],
                "history_id": it["history_id"],
                "chapter_title": it["chapter_title"] or it["title"],
                "voice_name": it["voice_name"],
                "speed": it["speed"],
                "word_count": it["word_count"],
                "file_name": it["file_name"],
                "audio_url": f"/api/audio/{it['file_name']}"
            })
        result.append({
            "id": col["id"],
            "name": col["name"],
            "description": col["description"] or "",
            "created_at": col["created_at"],
            "items": items
        })
    conn.close()
    return jsonify(result)

@app.route("/api/collections", methods=["POST"])
def create_collection():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    if not name:
        return jsonify({"error": "Collection name is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO collections (name, description) VALUES (?, ?)", (name, description))
    col_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({"success": True, "id": col_id, "name": name, "description": description, "items": []})

@app.route("/api/collections/<int:col_id>/delete", methods=["POST"])
def delete_collection(col_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM collections WHERE id = ?", (col_id,))
    cursor.execute("DELETE FROM collection_items WHERE collection_id = ?", (col_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/collections/<int:col_id>/add-item", methods=["POST"])
def add_collection_item(col_id):
    data = request.json or {}
    history_id = data.get("history_id")
    chapter_title = (data.get("chapter_title") or "").strip()

    if not history_id:
        return jsonify({"error": "history_id is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM collection_items WHERE collection_id = ?", (col_id,))
    cnt = cursor.fetchone()["cnt"]

    cursor.execute("""
        INSERT INTO collection_items (collection_id, history_id, chapter_title, order_index)
        VALUES (?, ?, ?, ?)
    """, (col_id, history_id, chapter_title, cnt + 1))
    item_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({"success": True, "item_id": item_id})

@app.route("/api/collections/item/<int:item_id>/delete", methods=["POST"])
def delete_collection_item(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM collection_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# ---------------------------------------------------------------------------
# First-Run Desktop Shortcut Integration
# ---------------------------------------------------------------------------
def ensure_desktop_shortcut():
    """
    Silently creates a desktop shortcut 'TTS Studio.lnk' on Windows pointing to the
    currently running executable on first launch.
    Bypasses immediately on non-Windows platforms or if the shortcut already exists.
    """
    if sys.platform != "win32":
        return

    try:
        # Determine actual executable path
        if getattr(sys, "frozen", False):
            # PyInstaller bundle: sys.executable is the true binary (e.g. C:\...\TTS_App.exe)
            target_exe = sys.executable
        else:
            # Running as script in development
            target_exe = os.path.abspath(sys.argv[0])

        working_dir = os.path.dirname(target_exe)

        # Detect Desktop path reliably across localized Windows environments
        desktop_dir = None
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
            )
            desktop_raw, _ = winreg.QueryValueEx(key, "Desktop")
            winreg.CloseKey(key)
            desktop_dir = os.path.expandvars(desktop_raw)
        except Exception:
            pass

        if not desktop_dir or not os.path.exists(desktop_dir):
            desktop_dir = os.path.expanduser("~/Desktop")

        if not os.path.exists(desktop_dir):
            return

        shortcut_path = os.path.join(desktop_dir, "TTS Studio.lnk")

        # Bypass immediately if shortcut already exists
        if os.path.exists(shortcut_path):
            return

        # Prepare Windows hidden subprocess execution
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0  # SW_HIDE

        creationflags = 0x08000000  # CREATE_NO_WINDOW

        # PowerShell WScript.Shell invocation for native .lnk generation without extra packages
        ps_script = f"""
        $WshShell = New-Object -ComObject WScript.Shell;
        $Shortcut = $WshShell.CreateShortcut('{shortcut_path.replace("'", "''")}');
        $Shortcut.TargetPath = '{target_exe.replace("'", "''")}';
        $Shortcut.WorkingDirectory = '{working_dir.replace("'", "''")}';
        $Shortcut.Description = 'Piper Neural TTS Studio';
        $Shortcut.Save();
        """

        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps_script],
            startupinfo=startupinfo,
            creationflags=creationflags,
            timeout=5,
            check=False
        )
        print(f"[Desktop Integration] Created desktop shortcut: {shortcut_path}")
    except Exception as e:
        # Non-blocking: never allow shortcut errors to interrupt app startup
        print(f"[Desktop Integration] Shortcut creation skipped: {e}")

# ---------------------------------------------------------------------------
# App Launcher
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Execute first-run desktop shortcut creation asynchronously
    threading.Thread(target=ensure_desktop_shortcut, daemon=True).start()

    def launch_browser():
        webbrowser.open_new("http://127.0.0.1:5000/")

    threading.Timer(1.2, launch_browser).start()
    app.run(host="127.0.0.1", port=5000, debug=False)
