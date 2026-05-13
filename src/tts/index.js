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

const LANG_VOICES = {
  'pt-BR': { default: 'pt-BR-AntonioNeural', voices: ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural', 'pt-BR-ThalitaNeural'] },
  'en-US': { default: 'en-US-GuyNeural', voices: ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-AriaNeural'] },
  'es-ES': { default: 'es-ES-AlvaroNeural', voices: ['es-ES-AlvaroNeural', 'es-ES-ElviraNeural'] },
};

const DEFAULT_VOICE = process.env.TTS_VOICE || 'antonio';
const DEFAULT_RATE = process.env.TTS_RATE || '-5%';
const DEFAULT_PITCH = process.env.TTS_PITCH || '-2Hz';
const DEFAULT_VOLUME = process.env.TTS_VOLUME || '+0%';
const MAX_TTS_LENGTH = 5000;
const MAX_EDGE_TTS_CHUNK = 5000;

function cleanTextForTTS(text) {
  return text
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
    .replace(/(\d+):(\d+)/g, (_, ch, vs) => `${ch}, versículo ${vs}`)
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '...')
    .replace(/\s+\./g, '.')
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

async function generateAudioBuffer(text, options = {}) {
  const cleanText = cleanTextForTTS(text);
  if (!cleanText) return null;

  if (cleanText.length > MAX_EDGE_TTS_CHUNK) {
    console.log('[TTS] Text too long for single Edge TTS call, chunking...');
    const chunks = splitTextForTTS(text, MAX_EDGE_TTS_CHUNK);
    if (chunks.length === 0) return null;

    if (chunks.length === 1) {
      return generateEdgeTTSBuffer(chunks[0], options);
    }

    const buffers = [];
    for (const chunk of chunks) {
      try {
        const buf = await generateEdgeTTSBuffer(chunk, options);
        if (buf && buf.length > 0) {
          buffers.push(buf);
        }
      } catch (err) {
        console.error('[TTS] Edge TTS chunk failed:', err.message);
      }
    }

    if (buffers.length > 0) {
      return Buffer.concat(buffers);
    }
    return null;
  }

  try {
    const buffer = await generateEdgeTTSBuffer(cleanText, options);
    if (buffer && buffer.length > 0) {
      return buffer;
    }
  } catch (err) {
    console.error('[TTS] Edge TTS failed:', err.message);
  }

  return null;
}

function generateAudioDataUrl(buffer) {
  const base64 = buffer.toString('base64');
  return `data:audio/mp3;base64,${base64}`;
}

module.exports = {
  cleanTextForTTS,
  splitTextForTTS,
  generateTTSAudioUrl,
  generateEdgeTTSBuffer,
  generateAudioBuffer,
  generateAudioDataUrl,
  VOICES,
  LANG_VOICES,
  DEFAULT_VOICE,
  DEFAULT_RATE,
  DEFAULT_PITCH,
  DEFAULT_VOLUME,
  MAX_TTS_LENGTH,
};