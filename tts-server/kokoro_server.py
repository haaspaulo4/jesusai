import os
import io
import time
import argparse
import numpy as np
import struct
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from kokoro import KPipeline
import uvicorn

app = FastAPI(title="Kokoro TTS Server", version="1.1.0")

KOKORO_VOICES = {
    'pt-BR': {
        'lang_code': 'p',
        'voices': ['pf_dora', 'pm_alex'],
        'default': 'pm_alex',
    },
    'en-US': {
        'lang_code': 'a',
        'voices': ['af_heart', 'af_bella', 'af_nova', 'am_adam', 'am_michael'],
        'default': 'af_heart',
    },
    'es-ES': {
        'lang_code': 'e',
        'voices': ['ef_dora'],
        'default': 'ef_dora',
    },
}

pipelines = {}


def get_pipeline(lang_code):
    if lang_code not in pipelines:
        t0 = time.time()
        print(f"[Kokoro] Loading pipeline for lang_code='{lang_code}'...")
        pipelines[lang_code] = KPipeline(lang_code=lang_code)
        print(f"[Kokoro] Pipeline '{lang_code}' loaded in {time.time()-t0:.1f}s")
    return pipelines[lang_code]


class TTSRequest(BaseModel):
    input: str
    voice: str = ''
    language: str = ''
    lang: str = 'pt-BR'
    model: str = 'kokoro'
    response_format: str = 'mp3'
    speed: float = 1.0


VOICE_ALIASES = {
    'alloy': 'af_heart',
    'echo': 'am_adam',
    'fable': 'af_bella',
    'onyx': 'am_michael',
    'nova': 'af_nova',
    'shimmer': 'af_bella',
    'rafael': 'pf_dora',
    'alba': 'af_heart',
    'dora': 'pf_dora',
    'alex': 'pm_alex',
}


def resolve_voice(voice_name, lang):
    if voice_name in VOICE_ALIASES:
        return VOICE_ALIASES[voice_name]
    lang_config = KOKORO_VOICES.get(lang, KOKORO_VOICES['pt-BR'])
    if voice_name in lang_config['voices']:
        return voice_name
    return lang_config['default']


def resolve_lang_code(lang, language_str=''):
    if language_str in ('portuguese', 'pt', 'pt-BR'):
        return 'p'
    if language_str in ('english', 'en', 'en-US'):
        return 'a'
    if language_str in ('spanish', 'es', 'es-ES'):
        return 'e'
    return KOKORO_VOICES.get(lang, KOKORO_VOICES['pt-BR'])['lang_code']


def audio_to_wav_fast(audio_data, sample_rate=24000):
    audio_data = np.asarray(audio_data, dtype=np.float32)
    audio_data = np.clip(audio_data, -1.0, 1.0)
    pcm_data = (audio_data * 32767.0).astype(np.int16)
    
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * (bits_per_sample // 8)
    block_align = num_channels * (bits_per_sample // 8)
    data_bytes = pcm_data.tobytes()
    data_len = len(data_bytes)
    
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_len,
        b'WAVE',
        b'fmt ',
        16,
        1,
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b'data',
        data_len
    )
    return header + data_bytes


def audio_to_mp3_fast(audio_data, sample_rate=24000):
    raise HTTPException(
        status_code=500,
        detail="MP3 format is not supported without 'soundfile' library. Please request 'wav' format."
    )


@app.post('/v1/audio/speech')
def synthesize(req: TTSRequest):
    if not req.input or not req.input.strip():
        raise HTTPException(status_code=400, detail='input is required')

    t0 = time.time()
    lang_code = resolve_lang_code(req.lang, req.language)
    voice_name = resolve_voice(req.voice, req.lang)
    pipeline = get_pipeline(lang_code)

    try:
        chunks = []
        t_gen = time.time()
        for _, _, audio in pipeline(req.input, voice=voice_name, speed=req.speed):
            if audio is not None:
                chunks.append(audio)
        gen_time = time.time() - t_gen

        if not chunks:
            raise HTTPException(status_code=500, detail='No audio generated')

        combined = np.concatenate(chunks)

        fmt = req.response_format if req.response_format in ('mp3', 'wav') else 'mp3'

        if fmt == 'wav':
            data = audio_to_wav_fast(combined, 24000)
            content_type = 'audio/wav'
        else:
            data = audio_to_mp3_fast(combined, 24000)
            content_type = 'audio/mpeg'

        total_time = time.time() - t0
        print(f"[Kokoro] {req.lang}/{voice_name}: {len(req.input)} chars, gen={gen_time:.2f}s, total={total_time:.2f}s, {len(data)} bytes")

        return StreamingResponse(
            io.BytesIO(data),
            media_type=content_type,
            headers={'Content-Disposition': f'attachment; filename=speech.{fmt}'},
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Kokoro] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/v1/models')
async def list_models():
    return {'object': 'list', 'data': [{'id': 'kokoro', 'object': 'model', 'owned_by': 'hexgrad'}]}


@app.get('/v1/voices')
async def list_voices():
    all_voices = []
    for lang, config in KOKORO_VOICES.items():
        for v in config['voices']:
            all_voices.append({'id': v, 'language': lang, 'default': v == config['default']})
    for alias, target in VOICE_ALIASES.items():
        all_voices.append({'id': alias, 'language': 'multi', 'default': False, 'alias_for': target})
    return {'object': 'list', 'data': all_voices}


@app.get('/health')
async def health():
    return {'status': 'ok', 'pipelines_loaded': list(pipelines.keys())}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Kokoro TTS Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind')
    parser.add_argument('--workers', type=int, default=1, help='Uvicorn workers')
    args = parser.parse_args()
    print(f"[Kokoro TTS] Starting server on {args.host}:{args.port}")
    print(f"[Kokoro TTS] Available voices: pt-BR (pf_dora, pm_alex), en-US (af_heart, af_bella, af_nova, am_adam, am_michael), es-ES (ef_dora)")
    print(f"[Kokoro TTS] OpenAI-compatible API at /v1/audio/speech")
    uvicorn.run(app, host=args.host, port=args.port, workers=args.workers)