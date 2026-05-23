const EVO_API_URL = (process.env.EVO_API_URL || '').replace(/\/+$/, '');
const EVO_API_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'metapersona-ai';

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

async function sendText(number, text) {
  return evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, { number, text });
}

async function sendAudio(number, audioBase64, caption = '') {
  return evoRequest('POST', `/message/sendAudio/${EVO_INSTANCE}`, { number, audio: audioBase64, caption });
}

async function sendMedia(number, mediaUrl, mimetype, caption = '') {
  return evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, { number, mediaUrl, mimetype, caption });
}

async function sendReaction(messageKey, emoji) {
  return evoRequest('POST', `/message/sendReaction/${EVO_INSTANCE}`, { key: messageKey, reaction: emoji });
}

async function setTyping(number, typing) {
  return evoRequest('POST', `/message/sendTyping/${EVO_INSTANCE}`, { number, typing });
}

async function markRead(key) {
  return evoRequest('PUT', `/message/markRead/${EVO_INSTANCE}`, { key });
}

async function getConnectionState() {
  return evoRequest('GET', `/instance/connectionState/${EVO_INSTANCE}`);
}

async function getInstanceInfo() {
  return evoRequest('GET', `/instance/info/${EVO_INSTANCE}`);
}

function isConfigured() {
  return !!(EVO_API_URL && EVO_API_KEY);
}

module.exports = {
  evoHeaders,
  evoRequest,
  sendText,
  sendAudio,
  sendMedia,
  sendReaction,
  setTyping,
  markRead,
  getConnectionState,
  getInstanceInfo,
  isConfigured,
  EVO_API_URL,
  EVO_API_KEY,
  EVO_INSTANCE,
};