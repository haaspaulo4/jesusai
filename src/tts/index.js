const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);

const VOICES = {
  antonio: 'pt-BR-AntonioNeural',
  francisca: 'pt-BR-FranciscaNeural',
  thalita: 'pt-BR-ThalitaNeural',
};

const MULTIVOZES_VOICE_MAP = {
  alloy: 'pt-BR-AntonioNeural',
  echo: 'pt-BR-AntonioNeural',
  fable: 'pt-BR-FranciscaNeural',
  onyx: 'pt-BR-AntonioNeural',
  nova: 'pt-BR-ThalitaNeural',
  shimmer: 'pt-BR-FranciscaNeural',
};

const KOKORO_VOICES = {
  'pt-BR': { voice: 'pm_alex', lang_code: 'p' },
  'en-US': { voice: 'am_adam', lang_code: 'a' },
  'es-ES': { voice: 'ef_dora', lang_code: 'e' },
};

const KOKORO_VOICE_MAP = {
  alloy: 'af_heart',
  echo: 'am_adam',
  fable: 'af_bella',
  onyx: 'am_michael',
  nova: 'af_nova',
  shimmer: 'af_bella',
  rafael: 'pf_dora',
  dora: 'pf_dora',
  alex: 'pm_alex',
};

const LANG_VOICES = {
  'pt-BR': { default: 'pt-BR-AntonioNeural', voices: ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural', 'pt-BR-ThalitaNeural'] },
  'en-US': { default: 'en-US-GuyNeural', voices: ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-AriaNeural'] },
  'es-ES': { default: 'es-ES-AlvaroNeural', voices: ['es-ES-AlvaroNeural', 'es-ES-ElviraNeural'] },
};

const TTS_MODE = process.env.TTS_MODE || 'kokoro';
const MULTIVOZES_URL = (process.env.MULTIVOZES_URL || '').replace(/\/+$/, '');
const MULTIVOZES_KEY = process.env.MULTIVOZES_KEY || '';
const KOKORO_URL = (process.env.KOKORO_URL || '').replace(/\/+$/, '') || 'http://localhost:8000';
const KOKORO_LANG = process.env.KOKORO_LANG || '';
const KOKORO_VOICE = process.env.KOKORO_VOICE || '';

const DEFAULT_VOICE = process.env.TTS_VOICE || 'antonio';
const DEFAULT_RATE = process.env.TTS_RATE || '-5%';
const DEFAULT_PITCH = process.env.TTS_PITCH || '-2Hz';
const DEFAULT_VOLUME = process.env.TTS_VOLUME || '+0%';
const MAX_TTS_LENGTH = 5000;
const MAX_EDGE_TTS_CHUNK = 5000;
const SUPPORTED_TTS_LANGS = ['pt-BR', 'en-US', 'es-ES'];

function cleanTextForTTS(text) {
  let cleaned = text
    .replace(/[\ud800-\udbff][\udc00-\udfff]/g, '');
  cleaned = cleaned.replace(/[\ud800-\udfff]/g, '');
  return cleaned
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\*{2}([^*]+)\*{2}/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~[^~]+~~/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[>\-]\s?/gm, '')
    .replace(/---+/g, '—')
    .replace(/[📖🕊🙏🔍💡✝🎤🎵🎶✨🔥❤️💛💚💙💜🤍🖤💔🙏🏻🙏🏼🙏🏽🙏🏾🙏🏿]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u2700-\u27BF\u2600-\u26FF\u2300-\u23FF\u2B50\uFE0F\u200D]/g, '')
    .replace(/(\d+):(\d+)/g, (_, ch, vs) => `${ch}, versículo ${vs}`)
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '...')
    .replace(/\s+\./g, '.')
    .replace(/^[-•]\s+/gm, '')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\.\s*\./g, '...')
    .replace(/!\./g, '!')
    .replace(/\?\./g, '?')
    .replace(/—\s+/g, '— ')
    .replace(/\s+$/gm, '')
    .replace(/(\w[.!?])\s{2,}/g, '$1 ')
    .trim();
}

function splitTextForTTS(text, maxLen = 450) {
  const clean = cleanTextForTTS(text);
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + ' ' + trimmed).trim().length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = current ? current + ' ' + trimmed : trimmed;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [clean.substring(0, maxLen)];
}

function prepareTextForKokoro(text) {
  return text;
}

function generateTTSAudioUrl(text, lang = 'pt-BR') {
  const encoded = encodeURIComponent(text);
  const ttsLang = lang === 'en-US' ? 'en' : lang === 'es-ES' ? 'es' : 'pt-BR';
  return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${ttsLang}&client=tw-ob`;
}

async function generateEdgeTTSBuffer(text, options = {}) {
  const langConfig = LANG_VOICES[options.lang] || LANG_VOICES['pt-BR'];
  let voice = options.voice ? VOICES[options.voice] : null;
  if (!voice) {
    if (options.lang && LANG_VOICES[options.lang]) {
      voice = LANG_VOICES[options.lang].default;
    } else {
      voice = VOICES[DEFAULT_VOICE] || VOICES.antonio;
    }
  }
  const rate = options.rate || DEFAULT_RATE;
  const pitch = options.pitch || DEFAULT_PITCH;
  const volume = options.volume || DEFAULT_VOLUME;

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `tts_${crypto.randomUUID()}.mp3`);

  try {
    const args = [
      '--voice', voice,
      '--rate=' + rate,
      '--pitch=' + pitch,
      '--volume=' + volume,
      '--write-media', tmpFile,
      '--text', text,
    ];

    const { stderr } = await execFileAsync('edge-tts', args, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const buffer = fs.readFileSync(tmpFile);
    if (buffer.length === 0) {
      throw new Error('Edge TTS generated empty audio');
    }

    return buffer;
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      const mp3Files = fs.readdirSync(tmpDir).filter(f => f.startsWith('tts_') && f.endsWith('.mp3'));
      const now = Date.now();
      for (const f of mp3Files) {
        try {
          const stat = fs.statSync(path.join(tmpDir, f));
          if (now - stat.mtimeMs > 60000) fs.unlinkSync(path.join(tmpDir, f));
        } catch {}
      }
    } catch {}
  }
}

async function generateMultivozesBuffer(text, options = {}) {
  if (!MULTIVOZES_URL || !MULTIVOZES_KEY) {
    throw new Error('MULTIVOZES_URL or MULTIVOZES_KEY not configured');
  }

  const langConfig = LANG_VOICES[options.lang] || LANG_VOICES['pt-BR'];
  let voice = options.voice ? (VOICES[options.voice] || options.voice) : null;
  if (!voice) voice = langConfig.default;

  const openaiVoice = Object.entries(MULTIVOZES_VOICE_MAP).find(([, v]) => v === voice);
  const voiceName = openaiVoice ? openaiVoice[0] : 'alloy';

  const response = await fetch(`${MULTIVOZES_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(MULTIVOZES_KEY ? { Authorization: `Bearer ${MULTIVOZES_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: voiceName,
      input: text,
      response_format: 'mp3',
      speed: 1.0,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Multivozes API ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateKokoroBuffer(text, options = {}) {
  if (!KOKORO_URL) {
    throw new Error('KOKORO_URL not configured');
  }

  const lang = options.lang || 'pt-BR';
  const langConfig = KOKORO_VOICES[lang] || KOKORO_VOICES['pt-BR'];
  const voice = KOKORO_VOICE || options.kokoroVoice || langConfig.voice;
  const langCode = KOKORO_LANG || langConfig.lang_code;

  const openaiVoice = options.voice ? (KOKORO_VOICE_MAP[options.voice] || options.voice) : null;
  const finalVoice = openaiVoice || voice;
  const speed = options.speed || 1.0;

  const response = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
    },
    body: JSON.stringify({
      model: 'kokoro',
      voice: finalVoice,
      input: text,
      lang,
      language: langCode,
      response_format: 'wav',
      speed,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Kokoro TTS API ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateAudioBuffer(text, options = {}) {
  const cleanText = cleanTextForTTS(text);
  if (!cleanText) return null;

  const lang = options.lang || 'pt-BR';
  const maxChunk = TTS_MODE === 'multivozes' ? MAX_TTS_LENGTH : MAX_EDGE_TTS_CHUNK;
  const ttsLang = SUPPORTED_TTS_LANGS.includes(lang) ? lang : 'pt-BR';

  let engine = 'edge-tts';
  let contentType = 'audio/mp3';

  if (TTS_MODE === 'kokoro' && KOKORO_URL) {
    engine = 'kokoro';
    contentType = 'audio/wav';
  } else if (TTS_MODE === 'multivozes' && MULTIVOZES_URL && MULTIVOZES_KEY) {
    engine = 'multivozes';
    contentType = 'audio/mp3';
  }

  if (cleanText.length <= maxChunk) {
    try {
      const buf = await generateWithEngine(engine, cleanText, { ...options, lang: ttsLang });
      if (buf && buf.length > 0) {
        buf.contentType = contentType;
        return buf;
      }
    } catch {}

    if (engine !== 'edge-tts') {
      try {
        const buf = await generateEdgeTTSBuffer(cleanText, { ...options, lang: ttsLang });
        if (buf && buf.length > 0) {
          buf.contentType = 'audio/mp3';
          return buf;
        }
      } catch {}
    }
    return null;
  }

  const chunks = splitTextForTTS(text, maxChunk);
  if (chunks.length === 0) return null;

  const buffers = [];
  let fellBack = false;

  for (const chunk of chunks) {
    if (!fellBack) {
      try {
        const buf = await generateWithEngine(engine, chunk, { ...options, lang: ttsLang });
        if (buf && buf.length > 0) {
          buf.contentType = contentType;
          buffers.push(buf);
          continue;
        }
      } catch {}
    }

    fellBack = true;
    try {
      const buf = await generateEdgeTTSBuffer(chunk, { ...options, lang: ttsLang });
      if (buf && buf.length > 0) {
        buf.contentType = 'audio/mp3';
        buffers.push(buf);
      }
    } catch {}
  }

  if (buffers.length === 0) return null;
  const result = Buffer.concat(buffers);
  result.contentType = fellBack ? 'audio/mp3' : contentType;
  return result;
}

function getAudioContentType(buffer) {
  if (buffer && buffer.contentType) return buffer.contentType;
  if (TTS_MODE === 'kokoro') return 'audio/wav';
  return 'audio/mp3';
}

async function generateWithEngine(engine, text, options = {}) {
  switch (engine) {
    case 'kokoro':
      return await generateKokoroBuffer(text, options);
    case 'multivozes':
      return await generateMultivozesBuffer(text, options);
    default:
      return await generateEdgeTTSBuffer(text, options);
  }
}

function generateAudioDataUrl(buffer) {
  const base64 = buffer.toString('base64');
  return `data:audio/mp3;base64,${base64}`;
}

module.exports = {
  cleanTextForTTS,
  splitTextForTTS,
  prepareTextForKokoro,
  generateTTSAudioUrl,
  generateEdgeTTSBuffer,
  generateAudioBuffer,
  generateAudioDataUrl,
  getAudioContentType,
  VOICES,
  LANG_VOICES,
  DEFAULT_VOICE,
  DEFAULT_RATE,
  DEFAULT_PITCH,
  DEFAULT_VOLUME,
  MAX_TTS_LENGTH,
};