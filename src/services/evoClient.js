const EVO_API_URL = (process.env.EVO_API_URL || '').replace(/\/+$/, '');
const EVO_API_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'metapersona-ai';

const sessionCache = new Map();
const rateLimitWindows = new Map();

function evoHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: EVO_API_KEY,
  };
}

async function evoRequest(method, path, body = null, instance = EVO_INSTANCE) {
  const opts = { method, headers: evoHeaders() };
  if (body) opts.body = JSON.stringify(body);
  
  const url = `${EVO_API_URL}/message/${method}/${instance}`;
  const res = await fetch(url, opts);
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${text.substring(0, 300)}`);
  }
  
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

function checkRateLimit(key, maxPerMinute = 30) {
  const now = Date.now();
  const window = rateLimitWindows.get(key);
  if (!window || now - window.start > 60000) {
    rateLimitWindows.set(key, { start: now, count: 1 });
    return true;
  }
  if (window.count >= maxPerMinute) return false;
  window.count++;
  return true;
}

async function sendText(phone, text, options = {}) {
  if (!checkRateLimit(`text:${phone}`)) {
    console.warn(`[Evolution] Rate limited for ${phone}, queuing...`);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const payload = { number: phone, text };
  if (options.quoted) payload.quoted = options.quoted;
  if (options.typing !== undefined) payload.typing = options.typing;
  
  return evoRequest('sendText', '', payload);
}

async function sendButtons(phone, text, buttons, options = {}) {
  const payload = {
    number: phone,
    title: text,
    buttons: buttons.map((btn, i) => ({
      buttonText: btn.text || btn,
      id: btn.id || `btn_${i}`,
    })),
  };
  if (options.description) payload.description = options.description;
  
  return evoRequest('sendButtons', '', payload);
}

async function sendList(phone, title, description, sections, options = {}) {
  const payload = {
    number: phone,
    title,
    description,
    sections: sections.map((sec, i) => ({
      title: sec.title || sec.name,
      rows: sec.rows || sec.items.map((item, j) => ({
        title: item.title || item.name,
        description: item.description || item.price || '',
        id: item.id || `row_${i}_${j}`,
      })),
    })),
  };
  
  return evoRequest('sendList', '', payload);
}

async function sendTemplate(phone, templateName, variables = {}, options = {}) {
  const payload = {
    number: phone,
    templateName,
    variables: Object.entries(variables).map(([k, v]) => ({ key: k, value: String(v) })),
  };
  
  return evoRequest('sendTemplate', '', payload);
}

async function sendImage(phone, imageUrl, caption = '', options = {}) {
  const payload = {
    number: phone,
    image: imageUrl,
    caption: caption || '',
  };
  if (options.jpeg) payload.jpegThumbnail = options.jpeg;
  
  return evoRequest('sendImage', '', payload);
}

async function sendAudio(phone, audioUrl, options = {}) {
  const payload = { number: phone, audio: audioUrl };
  return evoRequest('sendAudio', '', payload);
}

async function sendVideo(phone, videoUrl, caption = '', options = {}) {
  const payload = {
    number: phone,
    video: videoUrl,
    caption: caption || '',
  };
  return evoRequest('sendVideo', '', payload);
}

async function sendDocument(phone, documentUrl, fileName, caption = '', options = {}) {
  const payload = {
    number: phone,
    document: documentUrl,
    fileName: fileName,
    caption: caption || '',
  };
  return evoRequest('sendDocument', '', payload);
}

async function sendLocation(phone, lat, lng, name = '', address = '', options = {}) {
  const payload = {
    number: phone,
    latitude: lat,
    longitude: lng,
    name: name || '',
    address: address || '',
  };
  return evoRequest('sendLocation', '', payload);
}

async function sendContact(phone, contact, options = {}) {
  const payload = {
    number: phone,
    contact: {
      name: contact.name || contact.fullName,
      phone: contact.phone,
    },
  };
  return evoRequest('sendContact', '', payload);
}

async function sendReaction(phone, emoji, messageId, options = {}) {
  const payload = {
    number: phone,
    reaction: emoji,
    key: { id: messageId },
  };
  return evoRequest('sendReaction', '', payload);
}

async function sendPoll(phone, question, options = {}) {
  const payload = {
    number: phone,
    poll: {
      name: question,
      options: (options.options || []).map((o, i) => ({ option: o, voter: 0 })),
      selectableOptionsCount: options.selectableCount || 1,
    },
  };
  return evoRequest('sendPoll', '', payload);
}

async function sendStatus(text, options = {}) {
  const payload = { status: text };
  return evoRequest('sendStatus', '', payload);
}

async function sendPresence(phone, type = 'available', options = {}) {
  const presenceMap = { available: 'available', busy: 'busy', typing: 'typing', paused: 'paused' };
  const payload = {
    number: phone,
    presence: presenceMap[type] || 'available',
  };
  return evoRequest('sendPresence', '', payload);
}

async function markAsRead(phone, messageId, options = {}) {
  const payload = {
    number: phone,
    key: { id: messageId },
  };
  return evoRequest('markAsRead', '', payload);
}

async function archiveChat(phone, options = {}) {
  const payload = { number: phone };
  return evoRequest('archiveChat', '', payload);
}

async function deleteMessage(phone, messageId, options = {}) {
  const payload = { number: phone, key: { id: messageId } };
  return evoRequest('deleteMessage', '', payload);
}

async function replyText(phone, text, messageId, options = {}) {
  const payload = {
    number: phone,
    text,
    quoted: { key: { id: messageId } },
  };
  if (options.typing !== undefined) payload.typing = options.typing;
  return evoRequest('sendText', '', payload);
}

async function getMessages(instanceName = EVO_INSTANCE, options = {}) {
  const { limit = 20, lastKey = '' } = options;
  const params = new URLSearchParams({ limit, ...(lastKey ? { lastKey } : {}) });
  const url = `${EVO_API_URL}/message/list/${instanceName}?${params}`;
  
  const res = await fetch(url, { method: 'GET', headers: evoHeaders() });
  if (!res.ok) throw new Error(`Evolution listMessages ${res.status}`);
  return res.json();
}

async function getInstanceStatus(instanceName = EVO_INSTANCE) {
  const url = `${EVO_API_URL}/instance/connectionState/${instanceName}`;
  const res = await fetch(url, { method: 'GET', headers: evoHeaders() });
  if (!res.ok) throw new Error(`Evolution status ${res.status}`);
  return res.json();
}

async function restartInstance(instanceName = EVO_INSTANCE) {
  const url = `${EVO_API_URL}/instance/restart/${instanceName}`;
  const res = await fetch(url, { method: 'POST', headers: evoHeaders() });
  if (!res.ok) throw new Error(`Evolution restart ${res.status}`);
  return res.json();
}

async function getInstanceQR(instanceName = EVO_INSTANCE) {
  const url = `${EVO_API_URL}/instance/connect/${instanceName}`;
  const res = await fetch(url, { method: 'GET', headers: evoHeaders() });
  if (!res.ok) throw new Error(`Evolution QR ${res.status}`);
  return res.json();
}

async function webhookRegister(instanceName = EVO_INSTANCE, webhookUrl, options = {}) {
  const payload = {
    webhook: {
      url: webhookUrl,
      method: 'POST',
      events: options.events || ['messages.ack', 'messages.update', 'send.message', 'receive.message'],
      base64: options.base64 || false,
    },
  };
  const url = `${EVO_API_URL}/webhook/set/${instanceName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: evoHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Evolution webhook ${res.status}`);
  return res.json();
}

function formatPhone(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && !cleaned.startsWith('55')) {
    return `55${cleaned}`;
  }
  return cleaned;
}

function phoneToJid(phone) {
  const formatted = formatPhone(phone);
  return formatted.length > 12 
    ? `${formatted}@s.whatsapp.net`
    : `${formatted}@lid`;
}

function jidToPhone(jid) {
  return jid.replace('@s.whatsapp.net', '').replace('@lid', '');
}

function isGroupJid(jid) {
  return jid?.includes('@g.us') || jid?.includes('@broadcast');
}

function extractPhoneFromJid(jid) {
  if (!jid) return null;
  const clean = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
  return clean.length >= 10 ? clean : null;
}

function resolvePhone(phoneOrJid) {
  const raw = phoneOrJid?.replace('@s.whatsapp.net', '').replace('@lid', '');
  const digits = raw?.replace(/\D/g, '') || '';
  if (digits.length >= 10) return digits;
  return raw;
}

module.exports = {
  sendText,
  sendButtons,
  sendList,
  sendTemplate,
  sendImage,
  sendAudio,
  sendVideo,
  sendDocument,
  sendLocation,
  sendContact,
  sendReaction,
  sendPoll,
  sendStatus,
  sendPresence,
  markAsRead,
  archiveChat,
  deleteMessage,
  replyText,
  getMessages,
  getInstanceStatus,
  restartInstance,
  getInstanceQR,
  webhookRegister,
  formatPhone,
  phoneToJid,
  jidToPhone,
  isGroupJid,
  extractPhoneFromJid,
  resolvePhone,
  checkRateLimit,
  evoRequest,
  EVO_INSTANCE,
};