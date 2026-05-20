#!/usr/bin/env python3
"""Local Whisper STT server - OpenAI-compatible API on port 9000

Usage:
  python whisper_server.py                    # base model, CPU
  WHISPER_MODEL=small python whisper_server.py # small model
  WHISPER_MODEL=medium WHISPER_DEVICE=cuda python whisper_server.py  # GPU

Environment variables:
  WHISPER_MODEL   - Model size: tiny, base, small, medium, large-v3 (default: base)
  WHISPER_DEVICE  - Device: cpu or cuda (default: cpu)
  WHISPER_COMPUTE - Compute type: int8, float16, float32 (default: int8 for cpu, float16 for cuda)
  WHISPER_PORT    - Server port (default: 9000)
"""

import os
import sys
import tempfile
import time

try:
    from fastapi import FastAPI, UploadFile, File, Form
    from fastapi.responses import JSONResponse
    import uvicorn
except ImportError:
    print("[Whisper] Installing dependencies...")
    os.system(f"{sys.executable} -m pip install fastapi uvicorn python-multipart --quiet")
    from fastapi import FastAPI, UploadFile, File, Form
    from fastapi.responses import JSONResponse
    import uvicorn

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("[Whisper] Installing faster-whisper...")
    os.system(f"{sys.executable} -m pip install faster-whisper --quiet")
    from faster_whisper import WhisperModel

app = FastAPI(title="Whisper Local STT")

model_size = os.environ.get("WHISPER_MODEL", "base")
device = os.environ.get("WHISPER_DEVICE", "cpu")
compute_type = os.environ.get("WHISPER_COMPUTE", "int8" if device == "cpu" else "float16")
port = int(os.environ.get("WHISPER_PORT", "9000"))

print(f"[Whisper] Loading model: {model_size} on {device}/{compute_type}")
print(f"[Whisper] First run will download the model (~148MB for base)")
model = WhisperModel(model_size, device=device, compute_type=compute_type)
print(f"[Whisper] Model loaded!")
print(f"[Whisper] Server: http://localhost:{port}")
print(f"[Whisper] Supported: /v1/audio/transcriptions, /v1/models, /health")

WHISPER_LANG_MAP = {
    "pt": "pt", "pt-BR": "pt", "en": "en", "en-US": "en",
    "es": "es", "es-ES": "es", "fr": "fr", "de": "de",
    "it": "it", "ja": "ja", "ko": "ko", "zh": "zh",
    "ru": "ru", "nl": "nl", "pl": "pl", "tr": "tr",
    "ar": "ar", "hi": "hi", "sv": "sv", "da": "da",
    "fi": "fi", "no": "no", "uk": "uk", "vi": "vi",
}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("whisper-1"),
    language: str = Form("pt"),
    response_format: str = Form("json"),
    temperature: float = Form(0.0),
):
    content = await file.read()
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "ogg"
    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        lang = WHISPER_LANG_MAP.get(language, language[:2] if len(language) >= 2 else "pt")
        start = time.time()
        segments, info = model.transcribe(tmp_path, language=lang, temperature=temperature)
        text = " ".join([seg.text for seg in segments]).strip()
        elapsed = time.time() - start
        print(f"[Whisper] Transcribed {len(content)} bytes ({info.duration:.1f}s audio) in {elapsed:.1f}s -> {len(text)} chars, lang={info.language}")
        return JSONResponse({"text": text})
    except Exception as e:
        print(f"[Whisper] Error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.get("/v1/models")
async def models():
    return {"data": [{"id": "whisper-1", "object": "model", "owned_by": "local"}]}


@app.get("/health")
async def health():
    return {"status": "ok", "model": model_size, "device": device, "compute_type": compute_type}


if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"  Whisper Local STT Server")
    print(f"  Model: {model_size} | Device: {device}")
    print(f"  Port: {port}")
    print(f"  API: http://localhost:{port}/v1/audio/transcriptions")
    print(f"{'='*50}\n")
    uvicorn.run(app, host="0.0.0.0", port=port)