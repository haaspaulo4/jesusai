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

function extractImageInfo(data) {
  const msg = data?.message || data?.data?.message || {};
  const img = msg.imageMessage;
  if (img) {
    return { type: 'image', mediaKey: img.mediaKey, mimetype: img.mimetype, caption: img.caption || '', url: img.url };
  }
  return null;
}

function extractVideoInfo(data) {
  const msg = data?.message || data?.data?.message || {};
  const vid = msg.videoMessage;
  if (vid) {
    return { type: 'video', mediaKey: vid.mediaKey, mimetype: vid.mimetype, caption: vid.caption || '', url: vid.url };
  }
  return null;
}

function extractDocumentInfo(data) {
  const msg = data?.message || data?.data?.message || {};
  const doc = msg.documentMessage;
  if (doc) {
    return { type: 'document', mediaKey: doc.mediaKey, mimetype: doc.mimetype, fileName: doc.fileName, caption: doc.caption || '' };
  }
  return null;
}

function extractLocationInfo(data) {
  const msg = data?.message || data?.data?.message || {};
  const loc = msg.locationMessage;
  if (loc) {
    return { type: 'location', latitude: loc.degreesLatitude, longitude: loc.degreesLongitude, name: loc.name || '', address: loc.address || '' };
  }
  return null;
}

function extractPollUpdate(data) {
  const msg = data?.message || data?.data?.message || {};
  const poll = msg.pollCreationMessage;
  if (poll) {
    return { type: 'poll', name: poll.name, options: poll.options?.map(o => o.optionName) || [] };
  }
  return null;
}

function extractContactInfo(data) {
  const msg = data?.message || data?.data?.message || {};
  const contact = msg.contactMessage;
  if (contact) {
    return { type: 'contact', displayName: contact.displayName || '', waId: contact.waId || '' };
  }
  return null;
}

function extractStubType(data) {
  const msg = data?.message || data?.data?.message || {};
  return msg.stubType || null;
}

function getMessageId(data) {
  const key = data?.key || data?.message?.key || data?.data?.key;
  return key?.id || null;
}

function getRemoteJid(data) {
  const key = data?.key || data?.message?.key || data?.data?.key;
  return key?.remoteJid || null;
}

function isFromMe(data) {
  const key = data?.key || data?.message?.key || data?.data?.key;
  return key?.fromMe || false;
}

function getPushName(data) {
  return data?.pushName || data?.data?.pushName || null;
}

function getMessageTimestamp(data) {
  const key = data?.key || data?.message?.key || data?.data?.key;
  return key?.messageTimestamp || null;
}

function isGroupMessage(remoteJid) {
  return remoteJid?.includes('@g.us') || false;
}

function isLid(remoteJid) {
  return remoteJid?.includes('@lid') || false;
}

function getMessageType(data) {
  const msg = data?.message || data?.data?.message || {};
  if (msg.conversation || msg.extendedTextMessage) return 'text';
  if (msg.imageMessage) return 'image';
  if (msg.videoMessage) return 'video';
  if (msg.audioMessage) return 'audio';
  if (msg.pttMessage) return 'voice';
  if (msg.documentMessage) return 'document';
  if (msg.locationMessage) return 'location';
  if (msg.buttonsResponseMessage) return 'button';
  if (msg.listResponseMessage) return 'list';
  if (msg.pollCreationMessage) return 'poll';
  if (msg.contactMessage) return 'contact';
  if (msg.stubType) return 'stub';
  return 'unknown';
}

function buildMessageKey(remoteJid, messageId) {
  return { remoteJid, id: messageId, fromMe: false };
}

module.exports = {
  extractText,
  extractInteractiveResponse,
  extractAudioInfo,
  extractImageInfo,
  extractVideoInfo,
  extractDocumentInfo,
  extractLocationInfo,
  extractPollUpdate,
  extractContactInfo,
  extractStubType,
  getMessageId,
  getRemoteJid,
  isFromMe,
  getPushName,
  getMessageTimestamp,
  isGroupMessage,
  isLid,
  getMessageType,
  buildMessageKey,
};