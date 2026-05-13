const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

async function transcribeWithGroq(audioBuffer, filename = 'audio.ogg', language = 'pt') {
  if (!GROQ_API_KEY) return null;

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model', 'whisper-large-v3');
  formData.append('language', language);
  formData.append('response_format', 'json');

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
  if (!OPENAI_API_KEY) return null;

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model', 'whisper-1');
  formData.append('language', language);
  formData.append('response_format', 'json');

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

const ALLOWED_EXTENSIONS = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'opus', 'wav', 'webm'];

function sanitizeFilename(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase().split(';')[0].trim();
  if (ALLOWED_EXTENSIONS.includes(ext)) return filename;
  return 'audio.ogg';
}

async function transcribeAudio(audioBuffer, filename = 'audio.ogg', language = 'pt') {
  if (!audioBuffer || audioBuffer.length === 0) return null;

  filename = sanitizeFilename(filename);

  if (GROQ_API_KEY) {
    try {
      const text = await transcribeWithGroq(audioBuffer, filename, language);
      if (text) return text;
    } catch (err) {
      console.error('[STT] Groq failed:', err.message);
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const text = await transcribeWithOpenAI(audioBuffer, filename, language);
      if (text) return text;
    } catch (err) {
      console.error('[STT] OpenAI failed:', err.message);
    }
  }

  console.log('[STT] No transcription service available. Set GROQ_API_KEY or OPENAI_API_KEY.');
  return null;
}

module.exports = { transcribeAudio, transcribeWithGroq, transcribeWithOpenAI };