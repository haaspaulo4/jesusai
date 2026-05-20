const { searchVerses } = require('../knowledge/store');
const { getActivePersona } = require('../persona/config');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');
const {
  getSession,
  addMessage,
  getHistoryForLLM,
  buildMemoryContext,
  updateSessionContext,
  generateSummary,
  extractContextFromMessage,
} = require('../memory/session');
const {
  getProfile,
  updateProfileFromMessage,
  buildProfileContext,
  generateProfileSummary,
} = require('../memory/profile');
const {
  cleanTextForTTS,
  splitTextForTTS,
  generateAudioBuffer,
  generateTTSAudioUrl,
  getAudioContentType,
  MAX_TTS_LENGTH,
} = require('../tts');
const { transcribeAudio } = require('../stt');
const { getAllPosts, generatePost } = require('../blog');
const { t, getTTSLang, getSTTLang, SUPPORTED_LANGS, DEFAULT_LANG } = require('../i18n');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';
const EVO_API_URL = (process.env.EVO_API_URL || '').replace(/\/+$/, '');
const EVO_API_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'metapersona-ai';
const WHATSAPP_AUDIO = process.env.WHATSAPP_AUDIO !== 'false';
const WHATSAPP_BOT_JID = process.env.WHATSAPP_BOT_JID || '';
const WHATSAPP_PERSONA_ID = process.env.WHATSAPP_PERSONA_ID || '';
const WHATSAPP_BOT_PHONE = process.env.WHATSAPP_BOT_PHONE || '';

const sessionAudioDisabled = new Set();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function getCommands() {
  const persona = getActivePersona();
  const cmd = persona.commands;
  if (!cmd) return {};
  return {
    '/start': cmd.start['pt-BR'] || cmd.start['en-US'] || '',
    '/ajuda': cmd.help['pt-BR'] || cmd.help['en-US'] || '',
    '/help': cmd.help['pt-BR'] || cmd.help['en-US'] || '',
  };
}

const COMMANDS = getCommands();

function evoHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: EVO_API_KEY,
  };
}

async function evoRequest(method, path, body = null) {
  const opts = {
    method,
    headers: evoHeaders(),
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${EVO_API_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Evolution API ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

function normalizePhone(remoteJid) {
  if (!remoteJid) return null;
  if (remoteJid.includes('@lid')) return null;
  let digits = remoteJid.replace(/@.*/, '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    digits = digits.slice(0, 4) + digits.slice(5);
  }
  return digits || null;
}

function phoneVariants(phone) {
  if (!phone) return [];
  const variants = new Set();
  variants.add(phone);
  if (phone.startsWith('55')) {
    const withoutCc = phone.slice(2);
    variants.add(withoutCc);
    if (withoutCc.length === 11 && withoutCc[2] === '9') {
      variants.add(withoutCc.slice(0, 2) + withoutCc.slice(3));
    }
    if (withoutCc.length === 10) {
      variants.add(withoutCc.slice(0, 2) + '9' + withoutCc.slice(2));
    }
  } else {
    variants.add('55' + phone);
    if (phone.length === 11 && phone[2] === '9') {
      variants.add(phone.slice(0, 2) + phone.slice(3));
    }
    if (phone.length === 10) {
      variants.add(phone.slice(0, 2) + '9' + phone.slice(2));
    }
  }
  return [...variants];
}

function extractText(data) {
  const msg = data?.message || data?.data?.message || {};
  return msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption
    || msg.documentMessage?.caption
    || msg.buttonsResponseMessage?.selectedDisplayText
    || msg.buttonsResponseMessage?.selectedButtonId
    || msg.listResponseMessage?.title
    || msg.listResponseMessage?.description
    || '';
}

function extractInteractiveResponse(data) {
  const msg = data?.message || data?.data?.message || {};
  if (msg.buttonsResponseMessage) {
    return { type: 'button', id: msg.buttonsResponseMessage.selectedButtonId, text: msg.buttonsResponseMessage.selectedDisplayText };
  }
  if (msg.listResponseMessage) {
    return { type: 'list', id: msg.listResponseMessage.selectedRowId, title: msg.listResponseMessage.title, description: msg.listResponseMessage.description };
  }
  return null;
}

function extractAudioInfo(data) {
  const msg = data?.message || data?.data?.message || {};
  const audioMsg = msg.audioMessage;
  if (audioMsg) {
    return { type: 'audio', mediaKey: audioMsg.mediaKey, mimetype: audioMsg.mimetype, seconds: audioMsg.seconds };
  }
  const voiceMsg = msg.pttMessage;
  if (voiceMsg) {
    return { type: 'voice', mediaKey: voiceMsg.mediaKey, mimetype: voiceMsg.mimetype, seconds: voiceMsg.seconds };
  }
  return null;
}

async function downloadWhatsAppMedia(remoteJid, messageId) {
  try {
    const result = await evoRequest('POST', `/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`, {
      message: { key: { id: messageId, remoteJid, fromMe: false } },
    });
    if (result && result.base64) {
      return Buffer.from(result.base64, 'base64');
    }
    if (result && result.media) {
      return Buffer.from(result.media, 'base64');
    }
    if (result && result.buffer) {
      return Buffer.from(result.buffer, 'base64');
    }
    return null;
  } catch (err) {
    console.error('[WhatsApp] Failed to download media:', err.message);
    return null;
  }
}

async function sendWhatsAppText(remoteJid, text) {
  if (!text || !text.trim()) return null;
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isGroupJid = resolvedJid.includes('@g.us');
  const isLid = resolvedJid.includes('@lid');

  // For @lid JIDs: try phone number first, then fall back to raw JID
  if (isLid) {
    const phone = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid);
    if (phone) {
      try {
        return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, { number: phone, text });
      } catch (err) {
        console.error('[WhatsApp] sendText with phone failed:', err.message);
        const alt = alternateBrazilianNumber(phone);
        if (alt && alt !== phone) {
          try { return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, { number: alt, text }); } catch {}
        }
      }
    }
    // Fallback: send with raw @lid JID
    try {
      return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, { number: resolvedJid, text });
    } catch (err) {
      console.error('[WhatsApp] sendText to @lid failed:', err.message);
      return null;
    }
  }

  if (isGroupJid) {
    try {
      return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, { number: resolvedJid, text });
    } catch (err) {
      console.error('[WhatsApp] sendText to group failed:', err.message);
      return null;
    }
  }

  const number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  try {
    return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, { number, text });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      const alternate = alternateBrazilianNumber(number);
      if (alternate && alternate !== number) {
        try { return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, { number: alternate, text }); } catch {}
      }
    }
    console.error('[WhatsApp] sendText failed:', err.message);
    return null;
  }
}

async function sendWhatsAppAudio(remoteJid, audioSource) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isLid = resolvedJid.includes('@lid');
  const isGroupJid = resolvedJid.includes('@g.us');
  let number;

  if (isLid) {
    number = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid) || resolvedJid;
  } else if (isGroupJid) {
    number = resolvedJid;
  } else {
    number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  }

  const sendWithNumber = async (num) => {
    if (Buffer.isBuffer(audioSource)) {
      const contentType = getAudioContentType(audioSource);
      const isWav = contentType.includes('wav');
      const mimetype = isWav ? 'audio/wav' : 'audio/mp3';
      const base64 = audioSource.toString('base64');
      try {
        return await evoRequest('POST', `/message/sendWhatsAppAudio/${EVO_INSTANCE}`, {
          number: num,
          audio: base64,
        });
      } catch (err) {
        if (err.message && (err.message.includes('400') || err.message.includes('Bad Request'))) {
          return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, {
            number: num,
            mediatype: 'audio',
            media: base64,
            mimetype,
          });
        }
        throw err;
      }
    } else {
      try {
        return await evoRequest('POST', `/message/sendWhatsAppAudio/${EVO_INSTANCE}`, {
          number: num,
          audio: audioSource,
        });
      } catch (err) {
        if (err.message && (err.message.includes('400') || err.message.includes('Bad Request'))) {
          return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, {
            number: num,
            mediatype: 'audio',
            media: audioSource,
          });
        }
        throw err;
      }
    }
  };

  try {
    return await sendWithNumber(number);
  } catch (err) {
    if (err.message && err.message.includes('not found') && !isLid && !isGroupJid) {
      const alternate = alternateBrazilianNumber(number);
      if (alternate) {
        try {
          return await sendWithNumber(alternate);
        } catch {}
      }
    }
    console.error('[WhatsApp] Audio send failed:', err.message);
    return null;
  }
}

const splitTextForTTSFunc = (() => {
  try { const { splitTextForTTS: stt } = require('../tts'); return stt; } catch { return (text, max = 450) => [text]; }
})();

function stripWhatsAppFormat(text) {
  if (!text) return '';
  return text
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~([^~]+)~/g, '$1')
    .replace(/```([^`]+)```/g, '$1')
    .replace(/▪/g, '')
    .replace(/•/g, '')
    .replace(/─────────/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .trim();
}

async function sendReplyWithAudio(remoteJid, reply, lang = 'pt-BR', kokoroVoice = null, preFormatted = false) {
  const ttsLang = getTTSLang(lang);
  const chunkSize = parseInt(process.env.MESSAGE_CHUNK_SIZE) || 1500;

  const textChunks = splitMessage(reply, chunkSize, preFormatted);
  if (!textChunks || textChunks.length === 0) return;

  if (!WHATSAPP_AUDIO) {
    for (const chunk of textChunks) {
      await sendWhatsAppText(remoteJid, chunk);
      await new Promise(r => setTimeout(r, 300));
    }
    return;
  }

  const cleanReply = stripWhatsAppFormat(reply);
  const audioChunks = splitTextForTTSFunc(cleanReply, chunkSize);
  if (!audioChunks || audioChunks.length === 0) {
    for (const chunk of textChunks) {
      await sendWhatsAppText(remoteJid, chunk);
      await new Promise(r => setTimeout(r, 300));
    }
    return;
  }

  console.log(`[WhatsApp] Sending ${textChunks.length} text + ${audioChunks.length} audio chunks, lang=${ttsLang}, voice=${kokoroVoice || 'default'}`);

  const totalChunks = Math.max(textChunks.length, audioChunks.length);
  for (let i = 0; i < totalChunks; i++) {
    if (i < textChunks.length) {
      await sendWhatsAppText(remoteJid, textChunks[i]);
      await new Promise(r => setTimeout(r, 300));
    }

    if (i < audioChunks.length && audioChunks[i].length <= MAX_TTS_LENGTH) {
      const chunk = audioChunks[i];
      try {
        const audioBuffer = await generateAudioBuffer(chunk, { lang: ttsLang, kokoroVoice });
        if (audioBuffer && audioBuffer.length > 0) {
          try {
            await sendWhatsAppAudio(remoteJid, audioBuffer);
            continue;
          } catch {}
        }
      } catch (err) {
        console.error('[WhatsApp] Voice chunk failed:', err.message);
      }
      try { await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(chunk, ttsLang)); } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log('[WhatsApp] Reply done');
}

function alternateBrazilianNumber(number) {
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 12) {
    return digits.slice(0, 4) + '9' + digits.slice(4);
  }
  if (digits.startsWith('55') && digits.length === 13) {
    return digits.slice(0, 4) + digits.slice(5);
  }
  return null;
}

async function markAsRead(remoteJid, messageId) {
  if (!messageId) return;
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  try {
    await evoRequest('POST', `/chat/markMessageAsRead/${EVO_INSTANCE}`, {
      readMessages: [{
        remoteJid: resolvedJid,
        fromMe: false,
        id: messageId,
      }],
    });
  } catch (err) {
    console.error('[WhatsApp] markAsRead failed:', err.message);
  }
}

async function sendWhatsAppImage(remoteJid, imageSource, caption = '') {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isGroupJid = resolvedJid.includes('@g.us');
  const isLid = resolvedJid.includes('@lid');
  let number;
  if (isLid) {
    number = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid) || resolvedJid;
  } else if (isGroupJid) {
    number = resolvedJid;
  } else {
    number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  }
  const payload = { number, caption, mediatype: 'image' };
  if (Buffer.isBuffer(imageSource)) {
    payload.media = imageSource.toString('base64');
    payload.mimetype = 'image/jpeg';
  } else {
    payload.media = imageSource;
  }
  try {
    return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, payload);
  } catch {
    if (!isGroupJid && !isLid) {
      const alt = alternateBrazilianNumber(number);
      if (alt) {
        payload.number = alt;
        return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, payload);
      }
    }
    throw new Error('Failed to send image');
  }
}

async function sendWhatsAppVideo(remoteJid, videoSource, caption = '') {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isGroupJid = resolvedJid.includes('@g.us');
  const isLid = resolvedJid.includes('@lid');
  let number;
  if (isLid) {
    number = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid) || resolvedJid;
  } else if (isGroupJid) {
    number = resolvedJid;
  } else {
    number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  }
  const payload = { number, caption, mediatype: 'video' };
  if (Buffer.isBuffer(videoSource)) {
    payload.media = videoSource.toString('base64');
    payload.mimetype = 'video/mp4';
  } else {
    payload.media = videoSource;
  }
  try {
    return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, payload);
  } catch {
    if (!isGroupJid && !isLid) {
      const alt = alternateBrazilianNumber(number);
      if (alt) {
        payload.number = alt;
        return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, payload);
      }
    }
    throw new Error('Failed to send video');
  }
}

async function sendWhatsAppDocument(remoteJid, documentSource, fileName = 'document.pdf', caption = '') {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isGroupJid = resolvedJid.includes('@g.us');
  const isLid = resolvedJid.includes('@lid');
  let number;
  if (isLid) {
    number = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid) || resolvedJid;
  } else if (isGroupJid) {
    number = resolvedJid;
  } else {
    number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  }
  const payload = { number, fileName, caption, mediatype: 'document' };
  if (Buffer.isBuffer(documentSource)) {
    payload.media = documentSource.toString('base64');
    payload.mimetype = 'application/pdf';
  } else {
    payload.media = documentSource;
  }
  try {
    return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, payload);
  } catch {
    if (!isGroupJid && !isLid) {
      const alt = alternateBrazilianNumber(number);
      if (alt) {
        payload.number = alt;
        return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, payload);
      }
    }
    throw new Error('Failed to send document');
  }
}

async function sendWhatsAppButtons(remoteJid, text, buttons) {
  if (!buttons || buttons.length === 0) return null;
  const buttonRows = buttons.slice(0, 3).map((b, i) => ({
    type: 'reply',
    displayText: (b.text || b.label || String(i + 1)).substring(0, 80),
    id: b.id || `btn_${i}`,
  }));
  const title = text.substring(0, 60) || 'Opções';
  const description = text.length > 60 ? text.substring(60, 160) : '';
  const footer = 'Escolha uma opção';
  const payload = { title, description, footer, buttons: buttonRows };

  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const fallbackText = text + '\n\n' + buttons.map((b, i) => `${i + 1}. ${b.text || b.label}`).join('\n');

  // @lid JIDs — resolve to phone number via API, then send interactive or fallback to text
  if (resolvedJid.includes('@lid')) {
    const phone = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid);
    if (phone) {
      try {
        const result = await evoRequest('POST', `/message/sendButtons/${EVO_INSTANCE}`, { number: phone, ...payload });
        console.log(`[WhatsApp] sendButtons: @lid resolved to phone ${phone}`);
        return result;
      } catch (err) {
        console.error(`[WhatsApp] sendButtons with phone ${phone} failed: ${err.message}`);
        const alt = alternateBrazilianNumber(phone);
        if (alt && alt !== phone) {
          try { return await evoRequest('POST', `/message/sendButtons/${EVO_INSTANCE}`, { number: alt, ...payload }); } catch {}
        }
      }
    }
    console.warn(`[WhatsApp] sendButtons: @lid without phone, falling back to text for ${remoteJid}`);
    return await sendWhatsAppText(remoteJid, fallbackText);
  }

  // @s.whatsapp.net JIDs — extract phone and send
  if (resolvedJid.includes('@s.whatsapp.net')) {
    const number = resolvedJid.replace('@s.whatsapp.net', '');
    try {
      const result = await evoRequest('POST', `/message/sendButtons/${EVO_INSTANCE}`, { number, ...payload });
      return result;
    } catch (err) {
      console.error(`[WhatsApp] sendButtons failed for ${number}: ${err.message}`);
      const alt = alternateBrazilianNumber(number);
      if (alt && alt !== number) {
        try { return await evoRequest('POST', `/message/sendButtons/${EVO_INSTANCE}`, { number: alt, ...payload }); } catch {}
      }
    }
    return await sendWhatsAppText(remoteJid, fallbackText);
  }

  // Phone number or @g.us
  const phone = resolveToPhone(remoteJid);
  if (phone) {
    try { return await evoRequest('POST', `/message/sendButtons/${EVO_INSTANCE}`, { number: phone, ...payload }); } catch (err) {
      console.error(`[WhatsApp] sendButtons failed: ${err.message}`);
    }
  }

  return await sendWhatsAppText(remoteJid, fallbackText);
}

async function sendWhatsAppList(remoteJid, text, title, sections) {
  const formattedSections = sections.slice(0, 10).map((section, si) => ({
    title: section.title || `Opção ${si + 1}`,
    rows: (section.rows || section.items || []).slice(0, 10).map((row, ri) => ({
      title: (row.title || row.text || `${ri + 1}`).substring(0, 24),
      description: (row.description || '').substring(0, 72),
      rowId: row.id || row.data || `item_${si}_${ri}`,
    })),
  }));
  const listTitle = (title || 'Menu').substring(0, 60);
  const description = text.substring(0, 160) || '';
  const buttonText = 'Selecionar';
  const footerText = 'Escolha uma opção abaixo';
  const payload = { title: listTitle, description, buttonText, footerText, sections: formattedSections };

  const resolvedJid = resolveJid(remoteJid) || remoteJid;

  // List has a known Evolution API bug — always try with phone, fallback to text on error
  if (resolvedJid.includes('@lid')) {
    const phone = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid);
    if (phone) {
      try { return await evoRequest('POST', `/message/sendList/${EVO_INSTANCE}`, { number: phone, ...payload }); } catch (err) {
        console.error(`[WhatsApp] sendList with phone ${phone} failed: ${err.message}`);
      }
    }
    return await sendWhatsAppText(remoteJid, text);
  }

  if (resolvedJid.includes('@s.whatsapp.net')) {
    const number = resolvedJid.replace('@s.whatsapp.net', '');
    try { return await evoRequest('POST', `/message/sendList/${EVO_INSTANCE}`, { number, ...payload }); } catch (err) {
      console.error(`[WhatsApp] sendList failed: ${err.message}`);
    }
    return await sendWhatsAppText(remoteJid, text);
  }

  const phone = resolveToPhone(remoteJid);
  if (phone) {
    try { return await evoRequest('POST', `/message/sendList/${EVO_INSTANCE}`, { number: phone, ...payload }); } catch (err) {
      console.error(`[WhatsApp] sendList failed: ${err.message}`);
    }
  }
  return await sendWhatsAppText(remoteJid, text);
}

async function sendWhatsAppPoll(remoteJid, question, options) {
  if (!options || options.length === 0) return null;
  const pollValues = options.slice(0, 12).map(o => typeof o === 'string' ? o : o.text || o.label || String(o));
  const payload = { name: question.substring(0, 256), selectableCount: 1, values: pollValues };

  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const fallbackText = `📊 *${question}*\n\n` + pollValues.map((o, i) => `${i + 1}. ${o}`).join('\n');

  // @lid JIDs — resolve to phone number via API, then send interactive or fallback to text
  if (resolvedJid.includes('@lid')) {
    const phone = resolveToPhone(remoteJid) || await resolveLidToPhone(remoteJid);
    if (phone) {
      try { return await evoRequest('POST', `/message/sendPoll/${EVO_INSTANCE}`, { number: phone, ...payload }); } catch (err) {
        console.error(`[WhatsApp] sendPoll with phone ${phone} failed: ${err.message}`);
        const alt = alternateBrazilianNumber(phone);
        if (alt && alt !== phone) {
          try { return await evoRequest('POST', `/message/sendPoll/${EVO_INSTANCE}`, { number: alt, ...payload }); } catch {}
        }
      }
    }
    console.warn(`[WhatsApp] sendPoll: @lid without phone, falling back to text`);
    return await sendWhatsAppText(remoteJid, fallbackText);
  }

  // @s.whatsapp.net JIDs work for interactive messages
  if (resolvedJid.includes('@s.whatsapp.net')) {
    const number = resolvedJid.replace('@s.whatsapp.net', '');
    try {
      return await evoRequest('POST', `/message/sendPoll/${EVO_INSTANCE}`, { number, ...payload });
    } catch (err) {
      console.error(`[WhatsApp] sendPoll failed: ${err.message}`);
      const alt = alternateBrazilianNumber(number);
      if (alt && alt !== number) {
        try { return await evoRequest('POST', `/message/sendPoll/${EVO_INSTANCE}`, { number: alt, ...payload }); } catch {}
      }
    }
    return await sendWhatsAppText(remoteJid, fallbackText);
  }

  // @g.us groups or bare phone numbers
  const phone = resolveToPhone(remoteJid);
  if (phone) {
    try { return await evoRequest('POST', `/message/sendPoll/${EVO_INSTANCE}`, { number: phone, ...payload }); } catch (err) {
      console.error(`[WhatsApp] sendPoll with phone ${phone} failed: ${err.message}`);
    }
  }

  return await sendWhatsAppText(remoteJid, fallbackText);
}

async function sendWhatsAppReaction(remoteJid, messageId, emoji) {
  if (!messageId) return null;
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  // Reactions use remoteJid directly (not phone number) — they reference the message's original JID
  try {
    return await evoRequest('POST', `/message/sendReaction/${EVO_INSTANCE}`, {
      key: {
        remoteJid: resolvedJid,
        fromMe: false,
        id: messageId,
      },
      reaction: emoji || '👍',
    });
  } catch (err) {
    console.error('[WhatsApp] sendReaction failed:', err.message);
    return null;
  }
}

async function sendPresence(remoteJid, presence = 'composing') {
  try {
    let number;
    if (remoteJid.includes('@lid')) {
      number = resolveToPhone(remoteJid) || remoteJid;
    } else if (remoteJid.includes('@g.us')) {
      number = remoteJid;
    } else {
      number = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    }
    await evoRequest('POST', `/chat/sendPresence/${EVO_INSTANCE}`, {
      number,
      presence,
      delay: 3000,
    });
  } catch (err) {
    console.error('[WhatsApp] sendPresence error:', err.message);
  }
}

async function sendWhatsAppLocation(remoteJid, name, address, latitude, longitude) {
  let number = resolveToPhone(remoteJid);
  if (!number && (remoteJid.includes('@lid') || remoteJid.includes('@'))) {
    number = await resolveLidToPhone(remoteJid);
  }
  if (!number) number = remoteJid.replace(/@.*/, '').replace(/\D/g, '');
  try {
    return await evoRequest('POST', `/message/sendLocation/${EVO_INSTANCE}`, {
      number,
      name: name.substring(0, 256),
      address: address.substring(0, 256),
      latitude: Number(latitude),
      longitude: Number(longitude),
    });
  } catch (err) {
    console.error('[WhatsApp] sendLocation failed:', err.message);
    return await sendWhatsAppText(remoteJid, `📍 ${name}\n${address}\nhttps://maps.google.com/?q=${latitude},${longitude}`);
  }
}

async function sendWhatsAppContact(remoteJid, contacts) {
  let number = resolveToPhone(remoteJid);
  if (!number && (remoteJid.includes('@lid') || remoteJid.includes('@'))) {
    number = await resolveLidToPhone(remoteJid);
  }
  if (!number) number = remoteJid.replace(/@.*/, '').replace(/\D/g, '');
  const contactList = Array.isArray(contacts) ? contacts : [contacts];
  const formatted = contactList.map(c => ({
    fullName: c.name || c.fullName || '',
    wuid: c.wuid || c.phone || '',
    phoneNumber: c.phone || c.phoneNumber || '',
    organization: c.organization || '',
    email: c.email || '',
    url: c.url || '',
  }));
  try {
    return await evoRequest('POST', `/message/sendContact/${EVO_INSTANCE}`, {
      number,
      contact: formatted,
    });
  } catch (err) {
    console.error('[WhatsApp] sendContact failed:', err.message);
    const text = contactList.map(c => `👤 ${c.fullName || c.name}${c.phone ? ` - ${c.phone}` : ''}${c.email ? ` (${c.email})` : ''}`).join('\n');
    return await sendWhatsAppText(remoteJid, text);
  }
}

async function sendWhatsAppStatus(type, content, caption = '', options = {}) {
  try {
    return await evoRequest('POST', `/message/sendStatus/${EVO_INSTANCE}`, {
      type,
      content,
      caption,
      backgroundColor: options.backgroundColor || '#25D366',
      font: options.font || 1,
      allContacts: options.allContacts !== false,
      statusJidList: options.statusJidList || [],
    });
  } catch (err) {
    console.error('[WhatsApp] sendStatus failed:', err.message);
    return null;
  }
}

async function updateWhatsAppMessage(remoteJid, messageId, newText) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  try {
    return await evoRequest('POST', `/chat/updateMessage/${EVO_INSTANCE}`, {
      number: resolvedJid.includes('@s.whatsapp.net') ? resolvedJid.replace('@s.whatsapp.net', '') : resolvedJid.replace(/@.*/, '').replace(/\D/g, ''),
      text: newText,
      key: {
        remoteJid: resolvedJid,
        fromMe: true,
        id: messageId,
      },
    });
  } catch (err) {
    console.error('[WhatsApp] updateMessage failed:', err.message);
    return null;
  }
}

async function deleteWhatsAppMessage(remoteJid, messageId, fromMe = true) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  try {
    return await evoRequest('DELETE', `/chat/deleteMessageForEveryone/${EVO_INSTANCE}`, {
      id: messageId,
      remoteJid: resolvedJid,
      fromMe,
      participant: '',
    });
  } catch (err) {
    console.error('[WhatsApp] deleteMessage failed:', err.message);
    return null;
  }
}

async function archiveWhatsAppChat(remoteJid, messageId, archive = true) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  try {
    return await evoRequest('POST', `/chat/archiveChat/${EVO_INSTANCE}`, {
      lastMessage: { key: { remoteJid: resolvedJid, fromMe: false, id: messageId || '' } },
      archive,
      chat: resolvedJid,
    });
  } catch (err) {
    console.error('[WhatsApp] archiveChat failed:', err.message);
    return null;
  }
}

async function markChatUnread(remoteJid, messageId) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  try {
    return await evoRequest('POST', `/chat/markChatUnread/${EVO_INSTANCE}`, {
      lastMessage: { key: { remoteJid: resolvedJid, fromMe: false, id: messageId || '' } },
      chat: resolvedJid,
    });
  } catch (err) {
    console.error('[WhatsApp] markChatUnread failed:', err.message);
    return null;
  }
}

async function fetchProfilePicture(remoteJid) {
  const number = resolveToPhone(remoteJid) || remoteJid.replace(/@.*/, '').replace(/\D/g, '');
  try {
    const result = await evoRequest('POST', `/chat/fetchProfilePictureUrl/${EVO_INSTANCE}`, { number });
    return result?.profilePictureUrl || result?.url || null;
  } catch (err) {
    console.error('[WhatsApp] fetchProfilePicture failed:', err.message);
    return null;
  }
}

async function blockContact(remoteJid, block = true) {
  const number = resolveToPhone(remoteJid) || remoteJid.replace(/@.*/, '').replace(/\D/g, '');
  try {
    return await evoRequest('POST', `/message/updateBlockStatus/${EVO_INSTANCE}`, {
      number,
      status: block ? 'block' : 'unblock',
    });
  } catch (err) {
    console.error('[WhatsApp] blockContact failed:', err.message);
    return null;
  }
}

async function checkWhatsAppNumbers(numbers) {
  try {
    return await evoRequest('POST', `/chat/whatsappNumbers/${EVO_INSTANCE}`, { numbers });
  } catch (err) {
    console.error('[WhatsApp] checkNumbers failed:', err.message);
    return null;
  }
}

async function callLLM(messages) {
  const response = await fetch(`${OLLAMA_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      stream: false,
      options: { temperature: 0.7, num_predict: 2048 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  return response.json();
}

function formatWhatsAppText(text) {
  if (!text) return '';
  let f = text;

  // Code blocks → inline monospace
  f = f.replace(/```[\s\S]*?```/g, m => {
    const code = m.replace(/```(\w*)\n?/, '').replace(/```/g, '').trim();
    const lines = code.split('\n');
    if (lines.length <= 3 && code.length <= 200) return '```' + code + '```';
    return '```' + lines.slice(0, 2).join('\n') + (lines.length > 2 ? '\n...' : '') + '```';
  });

  // Headers → bold with spacing
  f = f.replace(/^#{1,6}\s+(.+)$/gm, (match, title) => {
    const level = match.trim().split(' ')[0].length;
    if (level <= 2) return '\n*' + title.trim() + '*\n';
    return '\n*' + title.trim() + '*';
  });

  // Horizontal rules
  f = f.replace(/^---+$/gm, '─────────');

  // Bold/italic/strikethrough conversions
  f = f.replace(/\*\*(.+?)\*\*/g, '*$1*');
  f = f.replace(/__(.+?)__/g, '_$1_');
  f = f.replace(/~~(.+?)~~/g, '~$1~');
  f = f.replace(/`([^`]+)`/g, '```$1```');

  // Clean up bullet lists — normalize to •
  f = f.replace(/^\s*[-*•]\s+/gm, '• ');

  // Numbered lists — clean spacing
  f = f.replace(/^\s*(\d+)\.\s+/gm, (m, n) => n + '. ');

  // Break long paragraphs into shorter ones (sentences after colons/semicolons)
  f = f.replace(/([.;:!?])\s+(?=[A-ZÀ-Ú])/g, '$1\n');

  // Ensure blank line before list items for readability
  f = f.replace(/([^\n])\n(•|\d+\.)/g, '$1\n\n$2');

  // Ensure blank line after a bold header line
  f = f.replace(/^(\*[^\n]+\*)\n(?![\n•\d])/gm, '$1\n\n');

  // Collapse excessive blank lines
  f = f.replace(/\n{3,}/g, '\n\n');

  // Add line break before emoji-heavy lines for visual separation
  f = f.replace(/([^\n])\n([\u{1F300}-\u{1F9FF}])/gu, '$1\n\n$2');

  // Trim trailing spaces per line
  f = f.split('\n').map(l => l.trimEnd()).join('\n');

  return f.trim();
}

function smartParagraphBreak(text) {
  const MAX_PARAGRAPH = 280;
  const MIN_BREAK_AFTER = 80;

  const lines = text.split('\n');
  const result = [];

  for (const line of lines) {
    // Preserve list items and short lines as-is
    if (line.length <= MAX_PARAGRAPH || /^[•\-\*\d]+\.\s|^[•\-\*]\s/.test(line) || line.startsWith('*') || line.startsWith('```')) {
      result.push(line);
      continue;
    }

    // Break long paragraphs at sentence boundaries
    const sentences = line.match(/[^.!?]*[.!?]+\s*/g) || [line];
    let para = '';
    for (const sentence of sentences) {
      if (para.length > MIN_BREAK_AFTER && (para + sentence).length > MAX_PARAGRAPH) {
        result.push(para.trim());
        para = sentence;
      } else {
        para += sentence;
      }
    }
    if (para.trim()) result.push(para.trim());
  }

  return result.join('\n');
}

function splitMessage(text, maxLen = 800, skipFormat = false) {
  if (!text || !text.trim()) return [];
  const formatted = skipFormat ? text : formatWhatsAppText(text);
  const paragraphed = smartParagraphBreak(formatted);

  if (paragraphed.length <= maxLen) return [paragraphed];

  const chunks = [];
  let current = '';

  const lines = paragraphed.split('\n');

  for (const line of lines) {
    const wouldOverflow = current.length > 0 && (current + '\n' + line).length > maxLen;
    const isStructural = /^(•|\d+\.|\*|```|─|[\u{1F300}-\u{1F9FF}])/u.test(line);

    if (wouldOverflow && current.length > 0) {
      chunks.push(current.trim());
      current = line;
    } else if (isStructural && current.length > maxLen * 0.6) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  // Final pass: split any chunk that still exceeds maxLen at sentence boundaries
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      finalChunks.push(chunk);
      continue;
    }

    let remaining = chunk;
    while (remaining.length > maxLen) {
      const breakPoint = Math.max(maxLen * 0.8, remaining.lastIndexOf('\n', maxLen));
      const sentenceBreak = remaining.lastIndexOf('. ', Math.min(maxLen, breakPoint));
      const effectiveBreak = sentenceBreak > maxLen * 0.4 ? sentenceBreak + 2 : breakPoint;

      if (effectiveBreak <= 0 || effectiveBreak >= remaining.length) {
        finalChunks.push(remaining.substring(0, maxLen));
        remaining = remaining.substring(maxLen);
      } else {
        finalChunks.push(remaining.substring(0, effectiveBreak).trim());
        remaining = remaining.substring(effectiveBreak);
      }
    }
    if (remaining.trim()) finalChunks.push(remaining.trim());
  }

  return finalChunks.length > 0 ? finalChunks : [paragraphed.substring(0, maxLen)];
}

async function handleCommand(remoteJid, text, pushName) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  try {
    if (COMMANDS[cmd]) {
        await messenger.queueText(remoteJid, COMMANDS[cmd]);
      return;
    }

    switch (cmd) {
    case '/versiculo': {
      const topics = ['amor', 'fé', 'esperança', 'perdão', 'paz', 'força', 'sabedoria', 'graça', 'confiança', 'consolo'];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const verses = await searchVerses(topic, 10);
      const verse = verses[Math.floor(Math.random() * verses.length)];
      const verseText = `${verse.reference}. ${verse.text}`;
      await sendWhatsAppText(remoteJid, `📖 *${verse.reference}*\n\n${verse.text}`);
    if (WHATSAPP_AUDIO && !noAudio) {
        try {
          const audioBuffer = await generateAudioBuffer(verseText, { lang: getTTSLang(DEFAULT_LANG) });
          if (audioBuffer && audioBuffer.length > 0) {
            await sendWhatsAppAudio(remoteJid, audioBuffer);
          } else {
            await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(verseText, getTTSLang(DEFAULT_LANG)));
          }
        } catch {
          await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(verseText, getTTSLang(DEFAULT_LANG)));
        }
      }
      break;
    }

    case '/buscar': {
      if (!args) {
        await messenger.queueText(remoteJid, '🔍 Use: /buscar <tema ou palavra>\n\nExemplo: /buscar amor\nExemplo: /buscar Mateus 5');
        return;
      }
      const results = await searchVerses(args, 5);
      if (results.length === 0) {
        await messenger.queueText(remoteJid, '🔍 Nenhum versículo encontrado. Tente outro tema.');
        return;
      }
      const lines = results.map(v => `📖 *${v.reference}*\n\n${v.text}`).join('\n\n');
      await messenger.queueText(remoteJid, `🔍 Versículos sobre: ${args}\n\n${lines}`);
      break;
    }

    case '/oracao':
    case '/prayer': {
      try {
        const persona = getActivePersona();
        const prayerPrompt = persona.prayerPrompt?.[DEFAULT_LANG] || persona.prayerPrompt?.['pt-BR'] || '';
        const data = await callLLM([
          { role: 'system', content: prayerPrompt },
          { role: 'user', content: pushName ? `Ore por ${pushName}.` : 'Ore por mim.' },
        ]);
        const fallback = persona.commands?.prayerFallback?.[DEFAULT_LANG] || persona.commands?.prayerFallback?.['pt-BR'] || '';
        const prayer = (data.message?.content || '').trim() || fallback;
        await messenger.queueAudio(remoteJid, prayer, DEFAULT_LANG, null);
      } catch {
        const persona = getActivePersona();
        const fallback = persona.commands?.prayerFallback?.[DEFAULT_LANG] || persona.commands?.prayerFallback?.['pt-BR'] || '';
        await messenger.queueText(remoteJid, `🙏 ${fallback}`);
      }
      break;
    }

    case '/devocional':
    case '/devotional': {
      try {
        const today = new Date();
        const post = await generatePost(today);
        const header = `🕊 *${post.title}*\n_${post.verse}_\n📅 ${today.toLocaleDateString(DEFAULT_LANG)}\n\n`;
        const content = header + post.content.substring(0, 2000);
        await messenger.queueText(remoteJid, content);
      } catch {
        const persona = getActivePersona();
        await messenger.queueText(remoteJid, persona.commands?.devotionalFallback?.[DEFAULT_LANG] || persona.commands?.devotionalFallback?.['pt-BR'] || '');
      }
      break;
    }

    case '/grupo':
    case '/group': {
      const persona = getActivePersona();
      const cmd = persona.commands;
      const groupName = args.trim() || (cmd?.groupDefault?.[DEFAULT_LANG] || cmd?.groupDefault?.['pt-BR'] || 'Study Group');
      try {
        const number = remoteJid.replace(/@.*/, '').replace(/\D/g, '');
        const result = await createGroup(groupName, [number]);
        if (result && result.jid) {
          await messenger.queueText(remoteJid, `🕊 Grupo criado: *${groupName}*\n\nCompartilhe o convite e juntos estudiaremos a Palavra!\n\n💡 No grupo, respondo apenas quando me mencionarem ou usarem comandos (/versiculo, /buscar, etc).`);
          const description = '🤖 MetaPersona.AI — Assistente Virtual\n\nConverse com nosso assistente inteligente.\nComandos: /versiculo, /buscar <tema>, /oracao, /ajuda';
          await setGroupDescription(result.jid, description).catch(() => {});
        } else {
          await messenger.queueText(remoteJid, '🕊 Não consegui criar o grupo. Tente novamente mais tarde.');
        }
      } catch (err) {
        console.error('[WhatsApp] Group creation error:', err.message);
        await messenger.queueText(remoteJid, '🕊 Erro ao criar grupo. Verifique se o bot tem permissão.');
      }
      break;
    }

    case '/testmsg':
    case '/test': {
      const subcmd = args.trim().toLowerCase();
      const testHandlers = {
        text: async () => messenger.queueText(remoteJid, '📝 *Texto simples* — mensagem plain text\n\nLinha 2\nLinha 3'),
        buttons: async () => sendWhatsAppButtons(remoteJid, '📱 *Botões* — escolha:', [
          { id: 'b1', text: 'Opção 1' },
          { id: 'b2', text: 'Opção 2' },
          { id: 'b3', text: 'Opção 3' },
        ]),
        list: async () => sendWhatsAppList(remoteJid, '📋 *Lista* — selecione:', 'Menu', [
          { title: 'Geral', rows: [{ id: 'r1', title: 'Item 1', description: 'Desc 1' }, { id: 'r2', title: 'Item 2' }] },
          { title: 'Avançado', rows: [{ id: 'r3', title: 'Item 3' }] },
        ]),
        poll: async () => sendWhatsAppPoll(remoteJid, '📊 *Enquete* — vote:', ['Sim', 'Não', 'Talvez']),
        location: async () => sendWhatsAppLocation(remoteJid, 'MetaPersona.AI', 'Av. Paulista, SP', -23.5629, -46.6544),
        contact: async () => sendWhatsAppContact(remoteJid, [{ name: 'Paulo Teste', phone: '5544998463463' }]),
        reaction: async () => sendWhatsAppReaction(remoteJid, 'test_id', '👍'),
        image: async () => sendWhatsAppImage(remoteJid, 'https://via.placeholder.com/300x200.png', '🖼️ Imagem de teste'),
        video: async () => sendWhatsAppVideo(remoteJid, 'https://www.w3schools.com/html/mov_bbb.mp4', '🎬 Vídeo de teste'),
        audio: async () => sendWhatsAppAudio(remoteJid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
        all: async () => {
          await messenger.queueText(remoteJid, '🧪 *TESTE COMPLETO* — Todos os formatos');
          await new Promise(r => setTimeout(r, 500));
          await messenger.queueText(remoteJid, '📝 Texto simples');
          await sendWhatsAppButtons(remoteJid, 'Botões', [{ id: 'b1', text: 'OK' }]).catch(() => {});
          await new Promise(r => setTimeout(r, 800));
          await sendWhatsAppList(remoteJid, 'Lista', 'Menu', [{ title: 'A', rows: [{ id: 'r1', title: 'Item' }] }]).catch(() => {});
          await new Promise(r => setTimeout(r, 800));
          await sendWhatsAppPoll(remoteJid, 'Enquete', ['S', 'N']).catch(() => {});
          await new Promise(r => setTimeout(r, 800));
          await sendWhatsAppLocation(remoteJid, 'Local', 'SP', -23, -46).catch(() => {});
          await new Promise(r => setTimeout(r, 800));
          await sendWhatsAppContact(remoteJid, [{ name: 'Teste', phone: '550011112222' }]).catch(() => {});
          await messenger.queueText(remoteJid, '✅ Todos os formatos testados!');
        },
        help: async () => {
          const helpText = `🧪 */testmsg* — Testar tipos de mensagens\n\n` +
            `*Subcomandos:*\n` +
            `• /testmsg text — Texto simples\n` +
            `• /testmsg buttons — Botões interativos\n` +
            `• /testmsg list — Lista interativa\n` +
            `• /testmsg poll — Enquete/votação\n` +
            `• /testmsg location — Localização\n` +
            `• /testmsg contact — Contato\n` +
            `• /testmsg reaction — Reação\n` +
            `• /testmsg image — Imagem\n` +
            `• /testmsg video — Vídeo\n` +
            `• /testmsg audio — Áudio\n` +
            `• /testmsg all — Todos os formatos`;
          await messenger.queueText(remoteJid, helpText);
        },
      };

      const handler = testHandlers[subcmd] || testHandlers.help;
      try {
        await handler();
      } catch (err) {
        console.error('[WhatsApp] testmsg error:', err.message);
        await messenger.queueText(remoteJid, `❌ Erro: ${err.message}`);
      }
      break;
    }

    default:
      await messenger.queueText(remoteJid, 'Comando não reconhecido. Digite /ajuda para ver os comandos disponíveis.');
    }
  } catch (err) {
    console.error('[WhatsApp] handleCommand error:', err.message);
    try {
      await messenger.queueError(remoteJid, 'llmError', DEFAULT_LANG);
    } catch {}
  }
}

async function handleWhatsAppMessage(data) {
  try {
    if (!data) return;

    const msg = data.data || data;
    const key = msg.key || data.key || {};

    if (key.fromMe) return;

    const rawJid = key.remoteJid || data.key?.remoteJid;
    if (!rawJid) return;

    const remoteJid = resolveJid(rawJid) || rawJid;
    const isGroup = remoteJid.includes('@g.us');

    const messageContent = msg.message || data.message || {};
    let text = extractText(data);

    const interactiveResponse = extractInteractiveResponse(data);
    if (interactiveResponse) {
      text = interactiveResponse.text || interactiveResponse.id || text;
      if (interactiveResponse.type === 'button' && !text.startsWith('/')) {
        const buttonId = interactiveResponse.id || '';
        const cmdMap = { yes: '/yes', no: '/no', ok: '/ok', confirmar: '/confirmar', cancelar: '/cancelar' };
        if (cmdMap[buttonId.toLowerCase()]) text = cmdMap[buttonId.toLowerCase()];
      }
    }

    if (isGroup) {
      const mentionedJidList = messageContent.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const quotedMsg = messageContent.extendedTextMessage?.contextInfo?.quotedMessage;
      const isQuoted = !!quotedMsg;
      const isCommand = text.trim().startsWith('/');

      if (!botWhatsAppJid && mentionedJidList.length === 1) {
        const mentioned = mentionedJidList[0];
        if (mentioned && mentioned.includes('@s.whatsapp.net')) {
          botWhatsAppJid = mentioned;
          botWhatsAppPhone = mentioned.replace(/@.*/, '').replace(/\D/g, '');
          console.log(`[WhatsApp] Bot JID (auto-detect from mention list): ${botWhatsAppJid}`);
        }
      }

      if (!botWhatsAppJid) {
        const textMentions = text.match(/@(\d{8,})/g) || [];
        const textMentionPhones = textMentions.map(m => m.substring(1));
        if (textMentionPhones.length === 1) {
          botWhatsAppPhone = textMentionPhones[0];
          botWhatsAppJid = botWhatsAppPhone + '@s.whatsapp.net';
          console.log(`[WhatsApp] Bot JID (auto-detect from text): ${botWhatsAppJid}`);
        }
      }

      const myJid = botWhatsAppJid || (await fetchBotJid()) || '';
      const myPhone = botWhatsAppPhone || (myJid ? myJid.replace(/@.*/, '').replace(/\D/g, '') : '');

      const isMentioned = mentionedJidList.some(j => {
        if (!j) return false;
        if (botWhatsAppJid && j === botWhatsAppJid) return true;
        if (myJid && (j === myJid || j.includes(myJid.replace(/@.*/, '')))) return true;
        return j.includes('@lid');
      });
      const isTextMention = myPhone && text.includes(`@${myPhone}`);

      console.log(`[WhatsApp] Group check: isMentioned=${isMentioned} isTextMention=${isTextMention} isQuoted=${isQuoted} isCommand=${isCommand} myPhone=${myPhone || 'none'} text="${text.substring(0, 40)}"`);

      if (!isMentioned && !isTextMention && !isQuoted && !isCommand) return;

      text = text.replace(/@\d+/g, '').trim();
      if (!text && !extractAudioInfo(data)) return;
    }

    const senderJid = isGroup ? (key.participant || msg.key?.participant || data.key?.participant) : null;

    let senderId;
    if (isGroup) {
      if (senderJid) {
        const phone = normalizePhone(senderJid);
        if (phone) {
          senderId = phone;
        } else if (senderJid.includes('@lid')) {
          senderId = `lid_${senderJid.replace(/@.*/, '')}`;
        } else {
          senderId = senderJid.replace(/@.*/, '') || 'unknown';
        }
      } else {
        senderId = 'unknown';
      }
    } else {
      const phone = normalizePhone(remoteJid);
      if (phone) {
        senderId = phone;
      } else if (remoteJid.includes('@lid')) {
        senderId = `lid_${remoteJid.replace(/@.*/, '')}`;
      } else {
        senderId = remoteJid.replace(/@.*/, '').replace(/\D/g, '') || 'unknown';
      }
    }

    const pushName = msg.pushName || data.pushName || null;

    const audioInfo = extractAudioInfo(data);
    if (audioInfo && (!text || !text.trim())) {
      const audioMsgId = key.id || data.key?.id;
      try {
        const audioBuffer = await downloadWhatsAppMedia(rawJid, audioMsgId);
        if (audioBuffer) {
          if (audioMsgId) await messenger.markAsRead(remoteJid, audioMsgId);
          await messenger.startTyping(remoteJid);
          const mimetype = (audioInfo.mimetype || 'audio/ogg').split(';')[0].trim();
          const ext = mimetype.split('/')[1] || 'ogg';
          const transcribed = await transcribeAudio(audioBuffer, `audio.${ext}`, getSTTLang(DEFAULT_LANG));
          if (transcribed) {
            text = transcribed;
            if (!isGroup) {
              await messenger.queueTranscriptionNotice(remoteJid, transcribed, DEFAULT_LANG);
            }
          } else {
            if (isGroup) return;
            await messenger.queueError(remoteJid, 'audioFallback', DEFAULT_LANG);
            return;
          }
        } else {
          if (isGroup) return;
          await messenger.queueError(remoteJid, 'audioDownloadFail', DEFAULT_LANG);
          return;
        }
      } catch (err) {
        console.error('[WhatsApp] Audio processing error:', err.message);
        if (isGroup) return;
        await messenger.queueError(remoteJid, 'audioProcessFail', DEFAULT_LANG);
        return;
      }
    }

    if (!text || !text.trim()) return;

    const messageId = key.id || data.key?.id;
    return handleWhatsAppMessageWithId(remoteJid, senderId, text, pushName, isGroup, messageId);
  } catch (err) {
    console.error('[WhatsApp] Message handler error:', err.message, err.stack?.substring(0, 500));
  }
}

async function handleWhatsAppMessageWithId(remoteJid, senderId, text, pushName, isGroup, messageId) {
  console.log(`[WhatsApp] Processing: sid=wa_${senderId}, text="${text.substring(0, 60)}", isGroup=${isGroup}, pushName=${pushName || 'null'}`);
  const sid = isGroup ? `wa_grp_${senderId}` : `wa_${senderId}`;
  const uid = `wa_${senderId}`;

  if (messageId) {
    await messenger.markAsRead(remoteJid, messageId);
  }

  const audioTogglePatterns = [
    { disable: /^(para\s*(de\s*)?(mandar|enviar|falar|mand|tocar|toc|)?\s*(áudio|audio|voz|som|som|áudios|audios)|desativ\s*(a|o)?\s*(áudio|audio|voz|som)|não\s*(quero|quero|gosto|prefiro|preciso)\s*(de\s*)?(áudio|audio|voz|som)|sem\s*(áudio|audio|voz|som)|cadê?\s*(sua|a)?\s*voz|sem\s*voz|não\s*manda\s*(mais\s*)?(áudio|audio|som)|sem\s*áudio|desliga\s*(o\s*)?(áudio|audio|som)|desativa\s*(o\s*)?(áudio|audio|voz)|tira\s*(o\s*)?(áudio|audio|voz)|chato\s*(esse|o\s*)?(áudio|audio|voz)|nojento\s*(esse|o\s*)?(áudio|audio|voz))/i,
      enable: /^(manda\s*(áudio|audio|voz|som)|ativa\s*(o\s*)?(áudio|audio|voz|som)|liga\s*(o\s*)?(áudio|audio|voz|som)|quero\s*(ouvir|áudio|audio|voz|som)|fala\s*com\s*(voz|áudio|audio)|ouv\w*\s*(sua|a)\s*voz|com\s*voz|com\s*áudio|com\s*audio|ativar?\s*(áudio|audio|voz))/i },
  ];

  let audioDisabledForSession = sessionAudioDisabled.has(sid);

  for (const pattern of audioTogglePatterns) {
    if (pattern.disable.test(text.trim())) {
      sessionAudioDisabled.add(sid);
      audioDisabledForSession = true;
      await messenger.queueText(remoteJid, '🔇 Áudio desativado! A partir de agora vou responder só por texto. Para reativar, é só pedir!');
      return;
    }
    if (pattern.enable.test(text.trim())) {
      sessionAudioDisabled.delete(sid);
      audioDisabledForSession = false;
      await messenger.queueText(remoteJid, '🔊 Áudio ativado! Vou voltar a mandar áudio. Para desativar, é só pedir!');
      return;
    }
  }

  if (text.trim().startsWith('/')) {
    try {
      const { handleChatCommand } = require('../chat/engine');
      const cmdResult = await handleChatCommand(text.trim(), uid, 'whatsapp', sid, null);
      console.log(`[WhatsApp] Command "${text.trim().substring(0, 30)}" result type: ${typeof cmdResult}, has interactive: ${!!cmdResult?.interactiveOptions}`);
      if (cmdResult) {
        const textReply = typeof cmdResult === 'string' ? cmdResult : (cmdResult.response || cmdResult.text || '');
        const interactiveOptions = typeof cmdResult === 'object' ? cmdResult.interactiveOptions : null;
        await messenger.queueCommandReply(remoteJid, textReply, interactiveOptions);
        return;
      }
    } catch (err) {
      console.error('[WhatsApp] Command handler error:', err.message, err.stack?.substring(0, 300));
    }
  }

  try {
    const { processMessage } = require('../chat/engine');

    const result = await processMessage({
      message: text,
      sessionId: sid,
      userId: uid,
      language: 'pt-BR',
      isGroup,
      source: 'whatsapp',
      userName: pushName || undefined,
      personaId: WHATSAPP_PERSONA_ID || undefined,
    });

    console.log(`[WhatsApp] processMessage result: response=${result.response?.substring(0, 100)}, ttsVoice=${result.ttsVoice}, sources=${result.sources?.length}`);

    await messenger.queueReply(remoteJid, result.response, {
      lang: DEFAULT_LANG,
      voice: result.ttsVoice || null,
      isGroup,
      pushName,
      interactiveOptions: result.interactiveOptions || null,
      sources: result.sources || null,
      silenced: result.silenced || false,
      messageId,
      originalMessage: text,
      noAudio: audioDisabledForSession,
    });
  } catch (err) {
    console.error('[WhatsApp] handleWhatsAppMessageWithId error:', err.message, err.stack?.substring(0, 500));
    await messenger.queueError(remoteJid, 'llmError', DEFAULT_LANG);
  }
}

async function sendInteractiveMessage(remoteJid, text, interactiveOptions) {
  const { type, items, sections, pollOptions, prompt, title, anonymous, quiz } = interactiveOptions;

  if (type === 'buttons' && items?.length) {
    const btnItems = items.slice(0, 3).map(i => ({
      text: (i.text || i.label || '').substring(0, 20),
      id: i.id || `btn_${items.indexOf(i)}`,
    }));
    try {
      const sent = await sendWhatsAppButtons(remoteJid, text, btnItems);
      if (sent) return;
    } catch (btnErr) {
      console.error('[WhatsApp] sendButtons error:', btnErr.message);
    }
    const fallbackLines = btnItems.map((b, i) => `${i + 1}️⃣ ${b.text}`).join('\n');
    await sendWhatsAppText(remoteJid, text + '\n\n' + fallbackLines);
    return;
  }

  if (type === 'list' && sections?.length) {
    try {
      const sent = await sendWhatsAppList(remoteJid, text, title || 'Opções', sections);
      if (sent) return;
    } catch (listErr) {
      console.error('[WhatsApp] sendList error:', listErr.message);
    }
    const allItems = sections.flatMap(s => (s.rows || s.items || []).map(r => `• ${r.title || r.text || r.id}`));
    await sendWhatsAppText(remoteJid, text + '\n\n' + allItems.slice(0, 10).join('\n'));
    return;
  }

  if (type === 'poll' && pollOptions?.length) {
    try {
      const sent = await sendWhatsAppPoll(remoteJid, text, pollOptions);
      if (sent) return;
    } catch (pollErr) {
      console.error('[WhatsApp] sendPoll error:', pollErr.message);
    }
    const pollText = '📊 ' + text + '\n\n' + pollOptions.map((o, i) => `${i + 1}. ${o}`).join('\n');
    await sendWhatsAppText(remoteJid, pollText);
    return;
  }

  await sendWhatsAppText(remoteJid, text);
}

async function createInstance() {
  if (!EVO_API_URL || !EVO_API_KEY) return;

  try {
    const instances = await evoRequest('GET', '/instance/fetchInstances');
    const instanceList = Array.isArray(instances) ? instances : [];
    const exists = instanceList.some(i =>
      i.instance?.instanceName === EVO_INSTANCE || i.name === EVO_INSTANCE
    );

    if (exists) {
      console.log('  WhatsApp instance already exists');
      return;
    }

    await evoRequest('POST', '/instance/create', {
      instanceName: EVO_INSTANCE,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: false,
      rejectCall: true,
      msgCall: 'Desculpe, não atendo chamadas. Envie uma mensagem!',
      alwaysOnline: true,
      readMessages: true,
    });
    console.log('  WhatsApp instance created');
  } catch (err) {
    console.error('  Failed to create WhatsApp instance:', err.message);
  }
}

async function connectInstance() {
  if (!EVO_API_URL || !EVO_API_KEY) return false;

  try {
    const res = await evoRequest('GET', `/instance/connectionState/${EVO_INSTANCE}`);
    const state = res?.state || res?.instance?.state || 'unknown';
    if (state === 'open') {
      console.log('  WhatsApp connected ✅');
      return true;
    }
    console.log(`  WhatsApp state: ${state}`);
    return false;
  } catch {
    return false;
  }
}

async function setupWebhook(webhookUrl) {
  if (!EVO_API_URL || !EVO_API_KEY) return;

  try {
    await evoRequest('POST', `/webhook/set/${EVO_INSTANCE}`, {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events: [
        'MESSAGES_UPSERT',
        'CONNECTION_UPDATE',
      ],
    });
    console.log('  WhatsApp webhook configured:', webhookUrl);
  } catch (err) {
    console.error('  Failed to set webhook:', err.message);
  }
}

const lidToJid = new Map();
const LID_CACHE_TTL = 30 * 60 * 1000;
let lidCacheTime = 0;
let botWhatsAppJid = null;
let botWhatsAppPhone = '';

async function fetchBotJid() {
  if (botWhatsAppJid) return botWhatsAppJid;

  if (WHATSAPP_BOT_JID) {
    botWhatsAppJid = WHATSAPP_BOT_JID.includes('@') ? WHATSAPP_BOT_JID : WHATSAPP_BOT_JID + '@s.whatsapp.net';
    botWhatsAppPhone = botWhatsAppJid.replace(/@.*/, '').replace(/\D/g, '');
    console.log(`[WhatsApp] Bot JID (env): ${botWhatsAppJid}`);
    await autoPopulateStoreWhatsApp(botWhatsAppPhone);
    return botWhatsAppJid;
  }
  if (WHATSAPP_BOT_PHONE) {
    botWhatsAppPhone = WHATSAPP_BOT_PHONE.replace(/\D/g, '');
    botWhatsAppJid = botWhatsAppPhone + '@s.whatsapp.net';
    console.log(`[WhatsApp] Bot JID (env phone): ${botWhatsAppJid}`);
    await autoPopulateStoreWhatsApp(botWhatsAppPhone);
    return botWhatsAppJid;
  }

  if (!EVO_API_URL || !EVO_API_KEY) return null;

  const attempts = [
    () => evoRequest('POST', `/chat/fetchProfilePictureFromGroup/${EVO_INSTANCE}`, { number: '' }).then(() => null),
    async () => {
      const data = await evoRequest('GET', `/instance/fetchConnections/${EVO_INSTANCE}`);
      const jid = data?.jid || data?.id || data?.wuid || data?.instance?.jid || data?.instance?.wuid;
      return jid || null;
    },
    async () => {
      const data = await evoRequest('GET', `/instance/connectionState/${EVO_INSTANCE}`);
      return data?.instance?.jid || data?.instance?.wuid || data?.jid || data?.wuid || null;
    },
    async () => {
      const data = await evoRequest('POST', `/chat/fetchContacts/${EVO_INSTANCE}`, { where: { self: true } });
      const me = Array.isArray(data) ? data.find(c => c.self === true) : null;
      return me?.id || me?.jid || me?.remoteJid || null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const jid = await attempt();
      if (jid && jid.includes('@')) {
        botWhatsAppJid = jid;
        botWhatsAppPhone = botWhatsAppJid.replace(/@.*/, '').replace(/\D/g, '');
        console.log(`[WhatsApp] Bot JID (auto): ${botWhatsAppJid}, phone: ${botWhatsAppPhone}`);
        await autoPopulateStoreWhatsApp(botWhatsAppPhone);
        return botWhatsAppJid;
      }
    } catch {}
  }

  console.warn('[WhatsApp] Could not auto-detect bot JID. Group mention detection may not work. Set WHATSAPP_BOT_JID or WHATSAPP_BOT_PHONE env var.');
  return null;
}

/**
 * Auto-populate store_whatsapp setting if empty.
 * This ensures the commerce system prompt always has the store's real number.
 */
async function autoPopulateStoreWhatsApp(phone) {
  if (!phone) return;
  try {
    const { getSetting, setSetting } = require('../settings');
    const current = await getSetting('store_whatsapp');
    if (!current) {
      await setSetting('store_whatsapp', phone);
      console.log(`[WhatsApp] Auto-populated store_whatsapp setting: ${phone}`);
    }
  } catch (err) {
    // Non-critical — don't crash if settings module isn't ready
    console.warn('[WhatsApp] Could not auto-populate store_whatsapp:', err.message);
  }
}

async function refreshLidCache() {
  if (!EVO_API_URL || !EVO_API_KEY) return;
  const now = Date.now();
  if (lidToJid.size > 0 && now - lidCacheTime < LID_CACHE_TTL) return;

  try {
    const contacts = await evoRequest('POST', `/chat/findContacts/${EVO_INSTANCE}`, {});
    if (Array.isArray(contacts)) {
      lidToJid.clear();
      let lidMapped = 0;
      for (const c of contacts) {
        const pushName = c.pushName || c.name || '';
        const phoneJid = c.id || c.jid || '';
        const lidJid = c.lid || '';
        if (phoneJid && phoneJid.includes('@s.whatsapp.net')) {
          if (lidJid) {
            lidToJid.set(lidJid, { jid: phoneJid, pushName });
            lidMapped++;
          }
          lidToJid.set(phoneJid, { jid: phoneJid, pushName });
        } else if (c.remoteJid) {
          if (c.remoteJid.includes('@s.whatsapp.net')) {
            if (lidJid) {
              lidToJid.set(lidJid, { jid: c.remoteJid, pushName });
              lidMapped++;
            }
            lidToJid.set(c.remoteJid, { jid: c.remoteJid, pushName });
          } else {
            lidToJid.set(c.remoteJid, { jid: c.remoteJid, pushName });
          }
        }
      }
      lidCacheTime = now;
      console.log(`  [WhatsApp] LID cache refreshed: ${lidToJid.size} contacts, ${lidMapped} LID mappings`);
    }
  } catch (err) {
    console.error('[WhatsApp] Failed to refresh LID cache:', err.message);
  }
}

function resolveJid(remoteJid) {
  if (!remoteJid) return null;
  if (remoteJid.includes('@s.whatsapp.net')) return remoteJid;
  if (remoteJid.includes('@g.us')) return remoteJid;
  if (remoteJid.includes('@lid')) {
    const cached = lidToJid.get(remoteJid);
    if (cached && cached.jid && cached.jid.includes('@s.whatsapp.net')) return cached.jid;
  }
  return remoteJid;
}

function resolveToPhone(remoteJid) {
  if (!remoteJid) return null;
  const resolved = resolveJid(remoteJid);
  if (resolved.includes('@s.whatsapp.net')) {
    return resolved.replace('@s.whatsapp.net', '');
  }
  if (resolved.includes('@g.us')) {
    return null;
  }
  if (resolved.includes('@lid')) {
    const cached = lidToJid.get(remoteJid);
    if (cached && cached.jid && cached.jid.includes('@s.whatsapp.net')) {
      return cached.jid.replace('@s.whatsapp.net', '');
    }
    return null;
  }
  const digits = resolved.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

const lidResolveCache = new Map();
const LID_RESOLVE_TTL = 5 * 60 * 1000;

async function resolveLidToPhone(remoteJid) {
  if (!remoteJid || !remoteJid.includes('@lid')) return null;
  const cached = lidResolveCache.get(remoteJid);
  if (cached && Date.now() - cached.time < LID_RESOLVE_TTL) return cached.phone;

  const digits = remoteJid.replace(/@.*/, '').replace(/\D/g, '');
  if (digits.length < 10) return null;

  const phones = [digits];
  const alt = alternateBrazilianNumber(digits);
  if (alt) phones.push(alt);

  try {
    const result = await evoRequest('POST', `/chat/whatsappNumbers/${EVO_INSTANCE}`, { numbers: phones });
    if (Array.isArray(result)) {
      for (const entry of result) {
        if (entry.exists && entry.jid && entry.jid.includes('@s.whatsapp.net')) {
          const phone = entry.jid.replace('@s.whatsapp.net', '');
          lidResolveCache.set(remoteJid, { phone, time: Date.now() });
          lidToJid.set(remoteJid, { jid: entry.jid, pushName: entry.name || '' });
          console.log(`[WhatsApp] Resolved LID ${remoteJid.substring(0, 20)} => ${phone}`);
          return phone;
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp] resolveLidToPhone failed:', err.message);
  }
  return null;
}

function resolvePushName(remoteJid, fallbackName) {
  if (remoteJid && remoteJid.includes('@lid')) {
    const cached = lidToJid.get(remoteJid);
    if (cached && cached.pushName) return cached.pushName;
  }
  return fallbackName || null;
}

const processedMessages = new Set();
const MAX_PROCESSED = 5000;
const POLL_INTERVAL = 3000;

function pruneProcessed() {
  if (processedMessages.size > MAX_PROCESSED) {
    const entries = [...processedMessages];
    for (let i = 0; i < entries.length - MAX_PROCESSED / 2; i++) {
      processedMessages.delete(entries[i]);
    }
  }
}

async function pollNewMessages() {
  try {
    const data = await evoRequest('POST', `/chat/findMessages/${EVO_INSTANCE}`, {});

    let messages = [];
    if (Array.isArray(data)) {
      messages = data;
    } else if (data?.messages?.records) {
      messages = data.messages.records;
    } else if (data?.records) {
      messages = data.records;
    }

    let processed = 0;
    for (const msg of messages) {
      const msgId = msg?.key?.id;
      if (!msgId) continue;

      if (processedMessages.has(msgId)) continue;

      const fromMe = msg?.key?.fromMe;
      processedMessages.add(msgId);

      if (fromMe) continue;

      const remoteJid = msg?.key?.remoteJid;
      if (!remoteJid) continue;

      const hasAudio = !!(msg?.message?.audioMessage || msg?.message?.pttMessage);
      const text = msg?.message?.conversation
        || msg?.message?.extendedTextMessage?.text
        || msg?.message?.imageMessage?.caption
        || '';
      if (!text.trim() && !hasAudio) continue;

      console.log(`[WhatsApp Poll] New from ${remoteJid}${remoteJid.includes('@g.us') ? ' (group)' : ''}: "${text.substring(0, 60) || '[audio]'}"`);

      processed++;
      handleWhatsAppMessage({ event: 'MESSAGES_UPSERT', data: msg }).catch(err => {
        console.error('[WhatsApp Poll] Handler error:', err.message);
      });

      if (processed >= 3) break;
    }

    pruneProcessed();
  } catch (err) {
    if (err.message && !err.message.includes('429')) {
      console.error('[WhatsApp Poll] Error:', err.message);
    }
  }
}

async function seedProcessedMessages() {
  try {
    const data = await evoRequest('POST', `/chat/findMessages/${EVO_INSTANCE}`, {});
    let messages = [];
    if (Array.isArray(data)) {
      messages = data;
    } else if (data?.messages?.records) {
      messages = data.messages.records;
    } else if (data?.records) {
      messages = data.records;
    }
    let count = 0;
    for (const msg of messages) {
      const msgId = msg?.key?.id;
      if (msgId) {
        processedMessages.add(msgId);
        count++;
      }
    }
    if (count > 0) {
      console.log(`  Seeded ${count} existing message IDs (to avoid replaying history)`);
    }
  } catch (err) {
    console.error('  Failed to seed processed messages:', err.message);
  }
}

let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  console.log('  WhatsApp polling started (every 3s)');
  pollTimer = setInterval(pollNewMessages, POLL_INTERVAL);
  pollNewMessages();
}

async function startWhatsAppBot(serverUrl) {
  if (!EVO_API_URL || !EVO_API_KEY) {
    console.log('  EVO_API_URL or EVO_API_KEY not set. WhatsApp bot disabled.');
    return null;
  }

  console.log('  Setting up WhatsApp bot via Evolution API...');

  await createInstance();

  const connected = await connectInstance();

  if (serverUrl && !serverUrl.includes('localhost') && !serverUrl.includes('127.0.0.1')) {
    const webhookUrl = `${serverUrl.replace(/\/+$/, '')}/api/whatsapp/webhook`;
    await setupWebhook(webhookUrl);
  } else {
    console.log('  ⚠ SERVER_URL is localhost. Webhook not configured.');
    console.log(`  Run "npm run tunnel" or POST /api/whatsapp/setup-webhook with public URL.`);
  }

  await seedProcessedMessages();
  await refreshLidCache();
  await fetchBotJid();
  startPolling();

  if (!connected) {
    console.log('  WhatsApp NOT connected yet. Scan the QR code via Evolution API manager.');
    console.log(`  Manager: ${EVO_API_URL.replace(/\/rest.*/, '')}/manager`);
  }

  return { connected };
}

async function createGroup(name, participants = []) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    const numbers = participants.map(p => {
      let d = p.replace(/\D/g, '');
      if (!d.startsWith('+') && !d.startsWith('55') && d.length < 14) {
        d = '55' + d;
      }
      return d + '@s.whatsapp.net';
    });

    const result = await evoRequest('POST', `/group/create/${EVO_INSTANCE}`, {
      subject: name,
      description: `${name} - Grupo de estudo criado pelo bot`,
      participants: numbers,
    });

    console.log(`[WhatsApp] Group created: ${name} -> ${result?.jid || 'unknown'}`);
    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to create group:', err.message);
    return null;
  }
}

async function addGroupParticipant(groupJid, number) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    let d = number.replace(/\D/g, '');
    if (!d.startsWith('55') && d.length < 14) {
      d = '55' + d;
    }
    const participant = d + '@s.whatsapp.net';

    const result = await evoRequest('POST', `/group/updateParticipant/${EVO_INSTANCE}/${groupJid}`, {
      action: 'add',
      participants: [participant],
    });

    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to add participant:', err.message);
    return null;
  }
}

async function removeGroupParticipant(groupJid, number) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    let d = number.replace(/\D/g, '');
    if (!d.startsWith('55') && d.length < 14) {
      d = '55' + d;
    }
    const participant = d + '@s.whatsapp.net';

    const result = await evoRequest('POST', `/group/updateParticipant/${EVO_INSTANCE}/${groupJid}`, {
      action: 'remove',
      participants: [participant],
    });

    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to remove participant:', err.message);
    return null;
  }
}

async function setGroupDescription(groupJid, description) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    const result = await evoRequest('POST', `/group/updateDescription/${EVO_INSTANCE}/${groupJid}`, {
      description,
    });
    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to set group description:', err.message);
    return null;
  }
}

async function leaveGroup(groupJid) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    const result = await evoRequest('POST', `/group/leave/${EVO_INSTANCE}/${groupJid}`);
    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to leave group:', err.message);
    return null;
  }
}

function verifyWebhookSecret(req) {
  if (!WEBHOOK_SECRET) return true;
  const provided = req.headers['x-webhook-secret'] || req.query.secret || '';
  return provided === WEBHOOK_SECRET;
}

class WhatsAppMessenger {
  constructor() {
    this.queues = new Map();
    this.processing = new Map();
    this.dedup = new Map();
    this.lastTyping = new Map();
    this.lastRead = new Map();
    this.sentMessages = new Map();
    this.REACTION_TRIGGERS = {
      pray: ['🙏', 'ovelha'],
      thanks: ['❤️', 'obrigado'],
      amen: ['✝️', '🛐'],
      birthday: ['🎂', '🎉'],
      laugh: ['😂', 'kk'],
      wave: ['👋', 'oi', 'olá'],
      sad: ['😢', 'triste', 'chorando'],
      love: ['💜', '💗', 'amooo'],
      agree: ['👍', 'concordo', 'sim', 'exato'],
      question: ['❓', 'como', 'porque', 'por que', 'o que', 'qual'],
    };
    this.INTENT_PATTERNS = {
      location: /localiza(cção|ar)?|endereço|mapa|coordenadas|gps|onde fica|como chegar|latitude|longitude|rua|av\.|avenida|manda a locali|me passa a locali|localização de|mapinha|quer|quer.*locali|locali.*quer/i,
      poll: /vot(a|ar)|enquete|opinião|pesquisa|qual.*prefer(e|ir)|escolha|vota/gi,
      contact: /contato|telefone|email|wpp|whatsapp|ligar|falar com|me passa.*contato|seu contato/i,
      list: /(escolha|selecione|opções|menu|lista|alternative)/i,
      image: /imagem|foto|fotograf(iar|ia)|ilustração/i,
      video: /vídeo|video|filme|clipe/i,
      audio: /áudio|audio|musica|música|podcast|voz/i,
      buttons: /(clique|clicar|botão|opção|confirmar|cancelar|simentão)/i,
    };
  }

  _detectIntent(text) {
    const lower = (text || '').toLowerCase();
    for (const [intent, pattern] of Object.entries(this.INTENT_PATTERNS)) {
      if (pattern.test(lower)) {
        console.log(`[WhatsApp] Intent match: ${intent} via pattern`);
        return intent;
      }
    }
    console.log(`[WhatsApp] No intent detected for: "${text.substring(0, 30)}"`);
    return null;
  }

  _extractLocation(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    
    const cityMap = {
      'assis chateaubriand': 'assis',
      'são paulo': 'são paulo', 'sao paulo': 'são paulo', 'sp': 'são paulo',
      'rio de janeiro': 'rio de janeiro', 'rio': 'rio de janeiro',
      'curitiba': 'curitiba',
      'brasília': 'brasília', 'brasilia': 'brasília',
      'belém': 'belém', 'belem': 'belém',
      'salvador': 'salvador',
      'recife': 'recife',
      'porto alegre': 'porto alegre',
      'fortaleza': 'fortaleza',
      'manaus': 'manaus',
      'belo horizonte': 'belo horizonte', 'bh': 'belo horizonte',
    };
    
    for (const [key, value] of Object.entries(cityMap)) {
      if (lower.includes(key)) return value;
    }
    
    const afterPreposition = /(?:de|da|do) ([a-záàâãéèêíìîóòôõúùûç\s]+?)(?:\.|,|$)/i;
    const match = lower.match(afterPreposition);
    if (match && match[1] && match[1].length > 2 && match[1].length < 50) {
      return match[1].trim();
    }
    
    return null;
  }

  _getQueue(jid) {
    if (!this.queues.has(jid)) this.queues.set(jid, []);
    return this.queues.get(jid);
  }

  _isProcessing(jid) {
    return this.processing.get(jid) || false;
  }

  _dedupKey(jid, type, content) {
    const brief = typeof content === 'string' ? content.substring(0, 80) : JSON.stringify(content).substring(0, 80);
    return `${jid}::${type}::${brief}`;
  }

  _isDuplicate(jid, type, content, windowMs = 5000) {
    const key = this._dedupKey(jid, type, content);
    const last = this.dedup.get(key);
    if (last && Date.now() - last < windowMs) return true;
    this.dedup.set(key, Date.now());
    if (this.dedup.size > 5000) {
      const cutoff = Date.now() - windowMs;
      for (const [k, v] of this.dedup) { if (v < cutoff) this.dedup.delete(k); }
    }
    return false;
  }

  _pacingDelay(textLen) {
    const base = 300;
    const perChar = Math.min(textLen * 8, 2000);
    const jitter = Math.floor(Math.random() * 400);
    return base + perChar + jitter;
  }

  _chunkPacing(chunkIndex, totalChunks) {
    if (chunkIndex === 0) return 400 + Math.random() * 300;
    if (totalChunks <= 3) return 800 + Math.random() * 500;
    return 1000 + Math.random() * 600;
  }

  async _sendWithTyping(jid, sendFn, textPreview = '', chunkIndex = 0, totalChunks = 1) {
    try {
      if (textPreview && chunkIndex === 0) {
        await this.startTyping(jid);
        const thinkTime = Math.min(textPreview.length * 12, 3000) + Math.random() * 1500;
        await new Promise(r => setTimeout(r, thinkTime));
      } else if (chunkIndex > 0) {
        await this.startTyping(jid);
        const between = this._chunkPacing(chunkIndex, totalChunks);
        await new Promise(r => setTimeout(r, between));
      }

      const result = await sendFn();
      await this.stopTyping(jid);
      return result;
    } catch (err) {
      await this.stopTyping(jid).catch(() => {});
      throw err;
    }
  }

  async startTyping(jid) {
    const now = Date.now();
    const last = this.lastTyping.get(jid) || 0;
    if (now - last < 2500) return;
    this.lastTyping.set(jid, now);
    try { await sendPresence(jid, 'composing'); } catch {}
  }

  async stopTyping(jid) {
    try { await sendPresence(jid, 'paused'); } catch {}
    this.lastTyping.delete(jid);
  }

  async markAsRead(jid, messageId) {
    const now = Date.now();
    const last = this.lastRead.get(jid) || 0;
    if (now - last < 2000) return;
    this.lastRead.set(jid, now);
    try { await markAsRead(jid, messageId); } catch {}
  }

  async autoReact(jid, text, messageId) {
    if (!messageId) return;
    const lower = (text || '').toLowerCase().trim();
    for (const [category, triggers] of Object.entries(this.REACTION_TRIGGERS)) {
      if (triggers.some(t => lower.includes(t))) {
        const reactions = {
          pray: '🙏', thanks: '❤️', amen: '✝️', birthday: '🎂',
          laugh: '😂', wave: '👋', sad: '😢', love: '💜', agree: '👍', question: '🤔',
        };
        try {
          await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
          await sendWhatsAppReaction(jid, messageId, reactions[category]);
          return;
        } catch {}
      }
    }
  }

  async queueText(jid, text, opts = {}) {
    if (this._isDuplicate(jid, 'text', text)) return null;
    const alreadyFormatted = opts.alreadyFormatted || false;
    const chunks = splitMessage(text, 800, alreadyFormatted);
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const result = await this._sendWithTyping(
        jid,
        () => sendWhatsAppText(jid, chunks[i]),
        chunks[i],
        i,
        chunks.length,
      );
      results.push(result);
    }
    return results;
  }

  async queueInteractive(jid, text, interactiveOptions, messageId) {
    if (this._isDuplicate(jid, 'interactive', text.substring(0, 80))) return null;
    await this.startTyping(jid);
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    await this.stopTyping(jid);
    return sendInteractiveMessage(jid, formatWhatsAppText(text), interactiveOptions);
  }

  async queueAudio(jid, text, lang, voice, opts = {}) {
    const formatted = formatWhatsAppText(text);
    const stripped = stripWhatsAppFormat(formatted);
    if (this._isDuplicate(jid, 'audio', stripped.substring(0, 80))) {
      return this.queueText(jid, formatted);
    }
    return sendReplyWithAudio(jid, formatted, lang, voice, true);
  }

  async queueReply(jid, reply, opts = {}) {
    const { lang = DEFAULT_LANG, voice = null, source = 'whatsapp', isGroup = false, pushName = null, interactiveOptions = null, sources = null, silenced = false, messageId = null, originalMessage, noAudio = false } = opts;

    console.log('[WhatsApp] queueReply opts keys:', Object.keys(opts), 'originalMessage type:', typeof originalMessage);

    if (messageId) {
      await this.markAsRead(jid, messageId);
      await this.autoReact(jid, reply?.substring(0, 60) || '', messageId);
    }

    let formatted = formatWhatsAppText(reply || '');

    if (!formatted || !formatted.trim()) {
      formatted = t('llmError', lang) || 'Desculpe, não consegui gerar uma resposta. Tente novamente.';
    }

    if (isGroup && pushName) {
      formatted = `${pushName}, ` + formatted.charAt(0).toLowerCase() + formatted.slice(1);
    }

    if (silenced) {
      return this.queueText(jid, formatted, { alreadyFormatted: true });
    }

    const isLid = jid.includes('@lid');
    console.log(`[WhatsApp] queueReply called, originalMessage: "${originalMessage?.substring(0, 40)}"`);

    const intent = this._detectIntent(originalMessage);
    console.log(`[WhatsApp] Detected intent: ${intent}`);
    
    const intentResults = await this._handleSmartIntent(jid, intent, formatted, originalMessage);
    if (intentResults) return;

    if (WHATSAPP_AUDIO) {
      await this.queueAudio(jid, formatted, lang, voice);
    } else {
      await this.queueText(jid, formatted, { alreadyFormatted: true });
    }

    if (interactiveOptions) {
      const promptText = interactiveOptions.prompt ? formatWhatsAppText(interactiveOptions.prompt) : null;
      await this.queueInteractive(jid, promptText || formatted, interactiveOptions, messageId);
    }

    if (sources && sources.length > 0) {
      const sourcesText = '📖 *Referências:*\n' + sources.map((s, i) => `${i + 1}. ${s.reference}`).join('\n');
      await new Promise(r => setTimeout(r, 300));
      await sendWhatsAppText(jid, sourcesText).catch(() => {});
    }
  }

  async _handleSmartIntent(jid, intent, formatted, originalMessage) {
    if (!intent) return null;

    console.log(`[WhatsApp] Intent detected: ${intent}, text: "${originalMessage.substring(0, 50)}"`);

    try {
      if (intent === 'location') {
        const location = this._extractLocation(originalMessage);
        console.log(`[WhatsApp] Extracted location: "${location}"`);
        const locations = {
          'assis': { name: 'Assis Chateaubriand', address: 'Paraná, Brasil', lat: -23.4316, lon: -50.4119 },
          'são paulo': { name: 'São Paulo', address: 'São Paulo, SP, Brasil', lat: -23.5505, lon: -46.6333 },
          'rio de janeiro': { name: 'Rio de Janeiro', address: 'Rio de Janeiro, RJ, Brasil', lat: -22.9068, lon: -43.1729 },
          'curitiba': { name: 'Curitiba', address: 'Curitiba, PR, Brasil', lat: -25.4284, lon: -49.2733 },
          'brasília': { name: 'Brasília', address: 'Brasília, DF, Brasil', lat: -15.826, lon: -47.9218 },
          'belém': { name: 'Belém', address: 'Belém, PA, Brasil', lat: -1.4558, lon: -48.5039 },
          'salvador': { name: 'Salvador', address: 'Salvador, BA, Brasil', lat: -12.9714, lon: -38.5014 },
          'recife': { name: 'Recife', address: 'Recife, PE, Brasil', lat: -8.0476, lon: -34.8777 },
          'porto alegre': { name: 'Porto Alegre', address: 'Porto Alegre, RS, Brasil', lat: -30.0346, lon: -51.2177 },
          'fortaleza': { name: 'Fortaleza', address: 'Fortaleza, CE, Brasil', lat: -3.7172, lon: -38.5433 },
          'manaus': { name: 'Manaus', address: 'Manaus, AM, Brasil', lat: -3.1190, lon: -60.0217 },
          'belo horizonte': { name: 'Belo Horizonte', address: 'Belo Horizonte, MG, Brasil', lat: -19.9167, lon: -43.9345 },
        };
        const loc = locations[location];
        if (loc) {
          await this.startTyping(jid);
          await sendWhatsAppLocation(jid, loc.name, loc.address, loc.lat, loc.lon);
          console.log(`[WhatsApp] Auto-sent location: ${loc.name}`);
          return true;
        }
        console.log(`[WhatsApp] Location not found in DB, extracted: "${location}"`);
      }

      if (intent === 'poll' && (formatted.includes('?') || formatted.includes('qual'))) {
        const options = ['Sim', 'Não', 'Talvez', 'Não sei'];
        await this.startTyping(jid);
        await sendWhatsAppPoll(jid, formatted.split('\n')[0].substring(0, 100), options);
        console.log('[WhatsApp] Auto-sent poll');
        return true;
      }

      if (intent === 'contact') {
        const phoneMatch = formatted.match(/\d{10,}/);
        if (phoneMatch) {
          const contact = { name: 'Contato', phone: phoneMatch[0] };
          await this.startTyping(jid);
          await sendWhatsAppContact(jid, [contact]);
          console.log('[WhatsApp] Auto-sent contact');
          return true;
        }
      }
    } catch (err) {
      console.error('[WhatsApp] Smart intent error:', err.message);
    }
    return null;
  }

  async queueCommandReply(jid, text, interactiveOptions = null) {
    const formatted = formatWhatsAppText(text || '');
    if (!formatted) return;
    if (interactiveOptions) {
      await this.queueInteractive(jid, formatted, interactiveOptions);
    } else {
      await this.queueText(jid, formatted, { alreadyFormatted: true });
    }
  }

  async queueTranscriptionNotice(jid, text, lang) {
    await sendWhatsAppText(jid, `🎤 _${t('transcribed', lang, { text })}_`);
  }

  async queueError(jid, errorKey, lang) {
    const msg = t(errorKey, lang) || 'Ocorreu um erro. Tente novamente.';
    await sendWhatsAppText(jid, msg).catch(() => {});
  }
}

const messenger = new WhatsAppMessenger();

module.exports = { handleWhatsAppMessage, startWhatsAppBot, sendWhatsAppText, sendWhatsAppAudio, sendWhatsAppImage, sendWhatsAppVideo, sendWhatsAppDocument, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppPoll, sendWhatsAppReaction, sendWhatsAppLocation, sendWhatsAppContact, sendWhatsAppStatus, updateWhatsAppMessage, deleteWhatsAppMessage, archiveWhatsAppChat, markChatUnread, fetchProfilePicture, blockContact, checkWhatsAppNumbers, generateTTSAudioUrl, generateAudioBuffer, splitTextForTTS, sendReplyWithAudio, setupWebhook, verifyWebhookSecret, cleanTextForTTS, extractAudioInfo, downloadWhatsAppMedia, createGroup, addGroupParticipant, removeGroupParticipant, setGroupDescription, leaveGroup, formatWhatsAppText, splitMessage, sendInteractiveMessage, stripWhatsAppFormat, messenger };