import os
import io
import argparse
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from kokoro import KPipeline
import uvicorn

app = FastAPI(title="Kokoro TTS Server", version="1.0.0")

KOKORO_VOICES = {
    'pt-BR': {
        'lang_code': 'p',
        'voices': ['pf_dora', 'pm_alex'],
        'default': 'pf_dora',
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
        print(f"[Kokoro] Loading pipeline for lang_code='{lang_code}'...")
        pipelines[lang_code] = KPipeline(lang_code=lang_code)
        print(f"[Kokoro] Pipeline loaded for lang_code='{lang_code}'")
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


def audio_to_mp3(audio_data, sample_rate=24000):
    buf = io.BytesIO()
    sf.write(buf, audio_data, sample_rate, format='MP3')
    buf.seek(0)
    return buf.read()


def audio_to_wav(audio_data, sample_rate=24000):
    buf = io.BytesIO()
    sf.write(buf, audio_data, sample_rate, format='WAV')
    buf.seek(0)
    return buf.read()


@app.post('/v1/audio/speech')
async def synthesize(req: TTSRequest):
    if not req.input or not req.input.strip():
        raise HTTPException(status_code=400, detail='input is required')

    lang_code = resolve_lang_code(req.lang, req.language)
    voice_name = resolve_voice(req.voice, req.lang)
    pipeline = get_pipeline(lang_code)

    try:
        chunks = []
        for _, _, audio in pipeline(req.input, voice=voice_name, speed=req.speed):
            if audio is not None:
                chunks.append(audio)

        if not chunks:
            raise HTTPException(status_code=500, detail='No audio generated')

        combined = np.concatenate(chunks)

        if req.response_format == 'wav':
            data = audio_to_wav(combined, 24000)
            content_type = 'audio/wav'
        else:
            data = audio_to_mp3(combined, 24000)
            content_type = 'audio/mpeg'

        return StreamingResponse(
            io.BytesIO(data),
            media_type=content_type,
            headers={'Content-Disposition': f'attachment; filename=speech.{req.response_format}'},
        )
    except HTTPException:
        raise
    except Exception as e:
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
    args = parser.parse_args()
    print(f"[Kokoro TTS] Starting server on {args.host}:{args.port}")
    print(f"[Kokoro TTS] Available voices: pt-BR (pf_dora, pm_alex), en-US (af_heart, af_bella, af_nova, am_adam, am_michael), es-ES (ef_dora)")
    print(f"[Kokoro TTS] OpenAI-compatible API at /v1/audio/speech")
    uvicorn.run(app, host=args.host, port=args.port)