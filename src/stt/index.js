const { getSetting } = require('../settings');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execFileAsync = promisify(execFile);

const ALLOWED_EXTENSIONS = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'opus', 'wav', 'webm'];
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const MAX_AUDIO_DURATION = 300;

const ABBREV_FIXES = {
  'pt-BR': {
    'vcê': 'você', 'vc': 'você', 'vcs': 'vocês', 'tb': 'também', 'tbm': 'também',
    'pq': 'porque', 'q': 'que', 'qd': 'quando', 'qnt': 'quanto', 'qnto': 'quanto',
    'nrg': 'energia', 'nrds': 'energias', 'msg': 'mensagem', 'msgs': 'mensagens',
    'dtb': 'Deus te abençoe', 'pfv': 'por favor', 'blz': 'beleza', 'ok': 'ok',
    'obg': 'obrigado', 'obrigado': 'obrigado', 'obrigada': 'obrigada',
    'td': 'tudo', 'tmj': 'ta mais', 'flw': 'falou', 'bl': 'blz',
    'n': 'não', 's': 'sim', 'não': 'não', 'sim': 'sim',
  },
  'en-US': {
    'u': 'you', 'ur': 'your', 'r': 'are', 'n': 'and', 'tho': 'though',
    'thru': 'through', 'nite': 'night', 'asap': 'as soon as possible',
    'fyi': 'for your information', 'btw': 'by the way',
  },
  'es-ES': {
    'ud': 'usted', 'tb': 'también', 'pq': 'porque', 'q': 'que',
    'qd': 'cuándo', 'xq': 'porque', 'xfa': 'por favor',
  },
};

const WHISPER_CPP_PATH = process.env.WHISPER_CPP_PATH || '';
const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH || '';
const WHISPER_SERVER_URL = process.env.WHISPER_SERVER_URL || '';
const LOCAL_WHISPER_URL = process.env.LOCAL_WHISPER_URL || 'http://localhost:9000';

function sanitizeFilename(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase().split(';')[0].trim();
  if (ALLOWED_EXTENSIONS.includes(ext)) return filename;
  return 'audio.ogg';
}

function postProcessTranscript(text, lang = 'pt-BR') {
  if (!text) return '';
  let t = text.trim();

  t = t.charAt(0).toUpperCase() + t.slice(1);

  if (t.length > 0 && !/[.!?]$/.test(t)) {
    t += '.';
  }

  t = t.replace(/\s{2,}/g, ' ');

  t = t.replace(/\bi\b(?![''])/g, 'I');

  if (lang === 'pt-BR') {
    t = t.replace(/\b(eu|ele|ela|nós|vocês|eles|elas)\b/gi, (m) => m.toLowerCase());
    t = t.replace(/\s+[,:]$/g, '');
  }

  t = t.replace(/,\s*,/g, ',');
  t = t.replace(/\.{4,}/g, '...');
  t = t.replace(/\?\./g, '?');
  t = t.replace(/!\./g, '!');

  const abbrevs = ABBREV_FIXES[lang] || ABBREV_FIXES['pt-BR'];
  for (const [abbr, expansion] of Object.entries(abbrevs)) {
    const re = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    t = t.replace(re, expansion);
  }

  return t.trim();
}

function normalizeLang(language) {
  if (!language || language === 'pt' || language.startsWith('pt')) return 'pt-BR';
  if (language === 'en' || language.startsWith('en')) return 'en-US';
  if (language === 'es' || language.startsWith('es')) return 'es-ES';
  return language;
}

function whisperCppLang(language) {
  const map = { 'pt-BR': 'pt', 'pt': 'pt', 'en-US': 'en', 'en': 'en', 'es-ES': 'es', 'es': 'es' };
  return map[language] || language.substring(0, 2);
}

async function transcribeWithWhisperCpp(audioBuffer, filename, language) {
  if (!WHISPER_CPP_PATH || !WHISPER_MODEL_PATH) return null;

  const tmpDir = os.tmpdir();
  const tmpInput = path.join(tmpDir, `whisper_input_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${(filename.split('.').pop() || 'ogg')}`);
  const tmpOutput = path.join(tmpDir, `whisper_output_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  try {
    fs.writeFileSync(tmpInput, audioBuffer);

    const args = [
      '-m', WHISPER_MODEL_PATH,
      '-f', tmpInput,
      '-l', whisperCppLang(language),
      '--output-json',
      '--output-file', tmpOutput,
      '-nt',
      '--no-prints-progress',
    ];

    const { stdout, stderr } = await execFileAsync(WHISPER_CPP_PATH, args, { timeout: 60000 });

    const jsonOutput = tmpOutput + '.json';
    if (fs.existsSync(jsonOutput)) {
      const data = JSON.parse(fs.readFileSync(jsonOutput, 'utf8'));
      const text = data?.transcription?.join(' ')?.trim() || data?.text?.trim() || '';
      try { fs.unlinkSync(jsonOutput); } catch {}
      if (text) return text;
    }

    const txtOutput = tmpOutput + '.txt';
    if (fs.existsSync(txtOutput)) {
      const text = fs.readFileSync(txtOutput, 'utf8').trim();
      try { fs.unlinkSync(txtOutput); } catch {}
      if (text) return text;
    }

    const match = (stdout || '').match(/\[.*?\]\s+(.+)/);
    if (match && match[1]) return match[1].trim();

    return null;
  } catch (err) {
    console.error('[STT] whisper.cpp failed:', err.message);
    return null;
  } finally {
    try { fs.unlinkSync(tmpInput); } catch {}
    try { fs.unlinkSync(tmpOutput + '.json'); } catch {}
    try { fs.unlinkSync(tmpOutput + '.txt'); } catch {}
    try { fs.unlinkSync(tmpOutput + '.srt'); } catch {}
    try { fs.unlinkSync(tmpOutput + '.vtt'); } catch {}
  }
}

async function transcribeWithLocalWhisperServer(audioBuffer, filename, language) {
  const serverUrl = WHISPER_SERVER_URL || LOCAL_WHISPER_URL;
  if (!serverUrl) return null;

  const lang = whisperCppLang(language);

  try {
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), filename);
    formData.append('model', process.env.LOCAL_WHISPER_MODEL || 'whisper-1');
    formData.append('language', lang);
    formData.append('response_format', 'json');
    formData.append('temperature', '0');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${serverUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Local Whisper ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.text?.trim() || null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[STT] Local Whisper server timeout');
    } else {
      console.error('[STT] Local Whisper server failed:', err.message);
    }
    return null;
  }
}

async function transcribeWithGroq(audioBuffer, filename, language) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
  if (!GROQ_API_KEY) return null;

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model', 'whisper-large-v3');
  formData.append('language', language);
  formData.append('response_format', 'json');
  formData.append('temperature', '0');

  const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq Whisper ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.text?.trim() || null;
}

async function transcribeWithOpenAI(audioBuffer, filename, language) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!OPENAI_API_KEY) return null;

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model', 'whisper-1');
  formData.append('language', language);
  formData.append('response_format', 'json');
  formData.append('temperature', '0');

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Whisper ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.text?.trim() || null;
}

async function transcribeAudio(audioBuffer, filename = 'audio.ogg', language = 'pt') {
  if (!audioBuffer || audioBuffer.length === 0) return null;

  if (audioBuffer.length > MAX_AUDIO_SIZE) {
    console.warn(`[STT] Audio too large: ${audioBuffer.length} bytes (max ${MAX_AUDIO_SIZE})`);
    return null;
  }

  // Pre-process: normalize audio to WAV 16kHz mono for better Whisper accuracy
  let processedBuffer = audioBuffer;
  try {
    const { normalizeAudio, isFfmpegAvailable } = require('../media/ffmpeg');
    const ffmpegOk = await isFfmpegAvailable();
    if (ffmpegOk) {
      const ext = (filename.split('.').pop() || 'ogg').toLowerCase();
      const supportedExts = ['wav', 'mp3', 'ogg', 'opus', 'flac', 'm4a', 'webm', 'mp4', 'mpeg', 'mpga'];
      if (supportedExts.includes(ext)) {
        processedBuffer = await normalizeAudio(audioBuffer, ext, { sampleRate: 16000, channels: 1, format: 'wav' });
        filename = 'audio.wav';
      }
    }
  } catch (err) {
    console.warn('[STT] Audio normalization failed, using original:', err.message);
  }

  filename = sanitizeFilename(filename);
  const lang = normalizeLang(language);

  const sttSetting = await getSetting('stt_enabled', 'true');
  if (sttSetting === 'false') {
    console.log('[STT] STT disabled by setting');
    return null;
  }

  const integrations = require('../llm/integrationManager');
  try {
    const text = await integrations.callSTT(processedBuffer, filename, language);
    if (text) return postProcessTranscript(text, lang);
  } catch (err) {
    console.error('[STT] IntegrationManager STT failed:', err.message);
  }

  if (WHISPER_CPP_PATH && WHISPER_MODEL_PATH) {
    try {
      const text = await transcribeWithWhisperCpp(processedBuffer, filename, language);
      if (text) {
        console.log('[STT] whisper.cpp transcription successful');
        return postProcessTranscript(text, lang);
      }
    } catch (err) {
      console.error('[STT] whisper.cpp failed:', err.message);
    }
  }

  const localUrl = WHISPER_SERVER_URL || LOCAL_WHISPER_URL;
  if (localUrl) {
    try {
      const text = await transcribeWithLocalWhisperServer(processedBuffer, filename, language);
      if (text) {
        console.log('[STT] Local Whisper server transcription successful');
        return postProcessTranscript(text, lang);
      }
    } catch (err) {
      console.error('[STT] Local Whisper server failed:', err.message);
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const text = await transcribeWithGroq(processedBuffer, filename, language);
      if (text) return postProcessTranscript(text, lang);
    } catch (err) {
      console.error('[STT] Groq failed:', err.message);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const text = await transcribeWithOpenAI(processedBuffer, filename, language);
      if (text) return postProcessTranscript(text, lang);
    } catch (err) {
      console.error('[STT] OpenAI failed:', err.message);
    }
  }

  console.log('[STT] No transcription service available');
  return null;
}

async function transcribeForRAG(audioBuffer, filename = 'audio.ogg', language = 'pt') {
  if (!audioBuffer || audioBuffer.length === 0) return null;

  filename = sanitizeFilename(filename);

  const integrations = require('../llm/integrationManager');

  try {
    const text = await integrations.callSTT(audioBuffer, filename, language);
    if (text) return text.trim();
  } catch (err) {
    console.error('[STT-RAG] IntegrationManager STT failed:', err.message);
  }

  return await transcribeAudio(audioBuffer, filename, language);
}

async function getSTTStatus() {
  const providers = [];
  if (WHISPER_CPP_PATH && WHISPER_MODEL_PATH) {
    providers.push({ name: 'whisper.cpp', type: 'local', path: WHISPER_CPP_PATH, model: WHISPER_MODEL_PATH });
  }
  const localUrl = WHISPER_SERVER_URL || LOCAL_WHISPER_URL;
  if (localUrl) {
    try {
      const resp = await fetch(`${localUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        providers.push({ name: 'local-whisper-server', type: 'local', url: localUrl, status: 'online' });
      } else {
        providers.push({ name: 'local-whisper-server', type: 'local', url: localUrl, status: 'offline' });
      }
    } catch {
      providers.push({ name: 'local-whisper-server', type: 'local', url: localUrl, status: 'offline' });
    }
  }
  if (process.env.GROQ_API_KEY) providers.push({ name: 'groq', type: 'cloud', model: 'whisper-large-v3' });
  if (process.env.OPENAI_API_KEY) providers.push({ name: 'openai', type: 'cloud', model: 'whisper-1' });
  return { providers, total: providers.length, local: providers.filter(p => p.type === 'local').length };
}

module.exports = {
  transcribeAudio,
  transcribeWithWhisperCpp,
  transcribeWithLocalWhisperServer,
  transcribeWithGroq,
  transcribeWithOpenAI,
  postProcessTranscript,
  transcribeForRAG,
  getSTTStatus,
};