const { getSetting } = require('../settings');

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

  t = t.replace(/\bi\b(?!['’])/g, 'I');

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

async function transcribeAudio(audioBuffer, filename = 'audio.ogg', language = 'pt') {
  if (!audioBuffer || audioBuffer.length === 0) return null;

  if (audioBuffer.length > MAX_AUDIO_SIZE) {
    console.warn(`[STT] Audio too large: ${audioBuffer.length} bytes (max ${MAX_AUDIO_SIZE})`);
    return null;
  }

  filename = sanitizeFilename(filename);

  const integrations = require('../llm/integrationManager');
  const sttSetting = await getSetting('stt_enabled', 'true');
  if (sttSetting === 'false') {
    console.log('[STT] STT disabled by setting');
    return null;
  }

  try {
    const text = await integrations.callSTT(audioBuffer, filename, language);
    if (text) {
      const lang = language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'pt-BR';
      return postProcessTranscript(text, lang);
    }
  } catch (err) {
    console.error('[STT] IntegrationManager STT failed:', err.message);
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

  if (GROQ_API_KEY) {
    try {
      const text = await transcribeWithGroq(audioBuffer, filename, language);
      if (text) {
        const lang = language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'pt-BR';
        return postProcessTranscript(text, lang);
      }
    } catch (err) {
      console.error('[STT] Groq failed:', err.message);
    }
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  if (OPENAI_API_KEY) {
    try {
      const text = await transcribeWithOpenAI(audioBuffer, filename, language);
      if (text) {
        const lang = language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'pt-BR';
        return postProcessTranscript(text, lang);
      }
    } catch (err) {
      console.error('[STT] OpenAI failed:', err.message);
    }
  }

  console.log('[STT] No transcription service available');
  return null;
}

async function transcribeWithGroq(audioBuffer, filename = 'audio.ogg', language = 'pt') {
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

async function transcribeWithOpenAI(audioBuffer, filename = 'audio.ogg', language = 'pt') {
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

module.exports = {
  transcribeAudio,
  transcribeWithGroq,
  transcribeWithOpenAI,
  postProcessTranscript,
  transcribeForRAG,
};