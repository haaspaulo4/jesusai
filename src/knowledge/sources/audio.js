const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function audioIngester(sourceConfig) {
  const filePath = sourceConfig.filePath;

  if (!filePath) {
    throw new Error('Audio source requires a "filePath" in config');
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Audio file not found: ${resolved}`);
  }

  const fileExt = path.extname(resolved).toLowerCase();
  const mimeTypeMap = {
    '.mp3': 'audio/mpeg',
    '.mp4': 'audio/mp4',
    '.mpeg': 'audio/mpeg',
    '.mpga': 'audio/mpeg',
    '.m4a': 'audio/m4a',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
  };
  const mimeType = sourceConfig.mimeType || mimeTypeMap[fileExt] || 'audio/mpeg';

  console.log(`Transcribing audio via STT: ${resolved}...`);

  let text = null;

  if (process.env.GROQ_API_KEY) {
    text = await transcribeWithGroq(resolved, mimeType);
  }

  if (!text && process.env.OPENAI_API_KEY) {
    text = await transcribeWithOpenAI(resolved, mimeType);
  }

  if (!text) {
    throw new Error('No STT API key configured (GROQ_API_KEY or OPENAI_API_KEY required for audio ingestion)');
  }

  if (text.trim().length === 0) {
    console.warn(`No text transcribed from audio: ${resolved}`);
    return [];
  }

  const chunkSize = sourceConfig.chunkSize || 1500;
  const chunkOverlap = sourceConfig.chunkOverlap || 300;

  const chunks = chunkText(text, chunkSize, chunkOverlap);
  const documents = chunks.map((chunk, i) => ({
    id: `${path.basename(resolved, fileExt)}_chunk_${i}`,
    reference: `${path.basename(resolved)} (transcricao)${chunks.length > 1 ? ` parte ${i + 1}/${chunks.length}` : ''}`,
    text: chunk,
    source: path.basename(resolved),
    type: 'audio',
    chunk: i,
    totalChunks: chunks.length,
  }));

  console.log(`Transcribed ${documents.length} chunks from audio`);
  return documents;
}

const FormData = require('form-data');

async function transcribeWithGroq(filePath, mimeType) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: mimeType,
    });
    form.append('model', 'whisper-large-v3');
    form.append('language', 'pt');
    form.append('response_format', 'text');

    const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return response.data;
  } catch (err) {
    console.warn(`Groq STT failed: ${err.message}`);
    return null;
  }
}

async function transcribeWithOpenAI(filePath, mimeType) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: mimeType,
    });
    form.append('model', 'whisper-1');
    form.append('language', 'pt');
    form.append('response_format', 'text');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return response.data;
  } catch (err) {
    console.warn(`OpenAI STT failed: ${err.message}`);
    return null;
  }
}

function chunkText(text, size, overlap) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length <= size) return [cleaned];

  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = start + size;
    if (end < cleaned.length) {
      const lastBreak = cleaned.lastIndexOf('\n', end);
      if (lastBreak > start + size * 0.5) end = lastBreak;
      const lastPeriod = cleaned.lastIndexOf('. ', end);
      if (lastPeriod > start + size * 0.5) end = lastPeriod + 1;
    }
    const chunk = cleaned.substring(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - overlap;
    if (start >= cleaned.length) break;
  }
  return chunks;
}

module.exports = audioIngester;