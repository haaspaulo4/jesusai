@echo off
echo ============================================
echo   Whisper Local STT Setup
echo ============================================
echo.

REM Check Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found. Install Python 3.10+: https://python.org
    pause
    exit /b 1
)

echo [1/4] Installing faster-whisper...
pip install faster-whisper --quiet

echo [2/4] Creating whisper server script...
(
echo """Local Whisper STT server - OpenAI-compatible API"""
echo import os
echo import io
echo import time
echo import uuid
echo import tempfile
echo from fastapi import FastAPI, UploadFile, File, Form
echo from fastapi.responses import JSONResponse
echo from faster_whisper import WhisperModel
echo 
echo app = FastAPI^(title="Whisper Local STT"^)
echo model_size = os.environ.get^("WHISPER_MODEL", "base"^)
echo device = os.environ.get^("WHISPER_DEVICE", "cpu"^)
echo compute_type = os.environ.get^("WHISPER_COMPUTE", "int8"^)
echo print^(f"[Whisper] Loading model: {model_size} on {device}/{compute_type}"^)
echo model = WhisperModel^(model_size, device=device, compute_type=compute_type^)
echo print^(f"[Whisper] Model loaded!"^)
echo print^(f"[Whisper] Server: http://localhost:9000"^)
echo print^(f"[Whisper] Supported: /v1/audio/transcriptions"^)
echo 
echo WHISPER_LANG_MAP = {
echo     "pt": "pt", "pt-BR": "pt", "en": "en", "en-US": "en",
echo     "es": "es", "es-ES": "es", "fr": "fr", "de": "de",
echo     "it": "it", "ja": "ja", "ko": "ko", "zh": "zh",
echo     "ru": "ru", "nl": "nl", "pl": "pl", "tr": "tr",
echo }
echo 
echo @app.post("/v1/audio/transcriptions"^)
echo async def transcribe^(file: UploadFile = File^(...^), model: str = Form^("whisper-1"^), language: str = Form^("pt"^), response_format: str = Form^("json"^), temperature: float = Form^(0.0^)^):
echo     content = await file.read^(^)
echo     ext = file.filename.split^("."^)[-1] if file.filename and "." in file.filename else "ogg"
echo     with tempfile.NamedTemporaryFile^(suffix=f".{ext}", delete=False^) as tmp:
echo         tmp.write^(content^)
echo         tmp_path = tmp.name
echo     try:
echo         lang = WHISPER_LANG_MAP.get^(language, language[:2]^)
echo         segments, info = model.transcribe^(tmp_path, language=lang, temperature=temperature^)
echo         text = " ".join^[seg.text for seg in segments]^).strip^(^)
echo         return JSONResponse^({"text": text}^)
echo     finally:
echo         os.unlink^(tmp_path^)
echo 
echo @app.get("/v1/models"^)
echo async def models^(^):
echo     return {"data": [{"id": "whisper-1", "object": "model"}]}
echo 
echo @app.get("/health"^)
echo async def health^(^):
echo     return {"status": "ok", "model": model_size, "device": device}
echo 
echo if __name__ == "__main__"^:
echo     import uvicorn
echo     port = int^(os.environ.get^("WHISPER_PORT", "9000"^)^)
echo     uvicorn.run^(app, host="0.0.0.0", port=port^)
) > whisper_server.py

echo [3/4] Installing FastAPI + uvicorn...
pip install fastapi uvicorn python-multipart --quiet

echo [4/4] Creating start script...
(
echo @echo off
echo echo Starting Whisper Local STT on port 9000...
echo echo Model: %%WHISPER_MODEL%% ^(default: base^)
echo echo Device: %%WHISPER_DEVICE%% ^(default: cpu^)
echo set WHISPER_MODEL=%%WHISPER_MODEL:-base-%%
echo python whisper_server.py
) > start_whisper.bat

echo.
echo ============================================
echo   Setup complete!
echo ============================================
echo.
echo To start the Whisper server:
echo   set WHISPER_MODEL=base
echo   set WHISPER_DEVICE=cpu
echo   start_whisper.bat
echo.
echo Models available (first run downloads automatically):
echo   base     -  148 MB, fast, good for pt-BR
echo   small    -  500 MB, better accuracy
echo   medium   - 1.5 GB, great accuracy
echo   large-v3 - 3.0 GB, best accuracy (needs GPU)
echo.
echo Then add to .env:
echo   WHISPER_SERVER_URL=http://localhost:9000
echo   LOCAL_WHISPER_URL=http://localhost:9000
echo.
pause