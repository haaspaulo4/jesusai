const evo = require('./evolutionClient');
const parser = require('./parser');

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

function alternateBrazilianNumber(phone) {
  if (!phone || phone.length < 10) return null;
  const withoutCc = phone.startsWith('55') ? phone.slice(2) : phone;
  if (withoutCc.length === 11 && withoutCc[2] === '9') {
    return withoutCc.slice(0, 2) + withoutCc.slice(3);
  }
  if (withoutCc.length === 10) {
    return withoutCc.slice(0, 2) + '9' + withoutCc.slice(2);
  }
  return null;
}

function resolveJid(remoteJid) {
  if (!remoteJid) return null;
  if (remoteJid.includes('@lid')) return remoteJid;
  if (remoteJid.includes('@g.us')) return remoteJid;
  if (remoteJid.includes('@s.whatsapp.net') || remoteJid.includes('@c.us')) return remoteJid;
  return remoteJid + '@s.whatsapp.net';
}

function resolveToPhone(remoteJid) {
  return normalizePhone(remoteJid);
}

function stripWhatsAppFormat(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/```([^`]+)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#\s*/g, '')
    .replace(/\n\s*[-•]\s*/g, '\n')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/•/g, '-')
    .replace(/>>/g, '»')
    .replace(/<</g, '«');
}

function formatWhatsAppText(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/\*([^*]+)\*/g, '*$1*')
    .replace(/__([^_]+)__/g, '_$1_')
    .replace(/_([^_]+)_/g, '_$1_')
    .replace(/```([^`]+)```/g, '```$1```')
    .replace(/`([^`]+)`/g, '`$1`')
    .replace(/#\s*/g, '')
    .replace(/\n\s*[-•]\s*/g, '\n• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/•/g, '-')
    .replace(/>>/g, '»')
    .replace(/<</g, '«');
}

function splitMessage(text, maxLength = 4096) {
  if (!text || text.length <= maxLength) return [text];
  
  const parts = [];
  const lines = text.split('\n');
  let current = '';
  
  for (const line of lines) {
    if (current.length + line.length + 1 > maxLength) {
      if (current) parts.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  
  if (current) parts.push(current.trim());
  return parts;
}

function formatOrderReceipt(items, total, shipping, discount, orderNumber) {
  const lines = [
    `✅ Pedido *#${orderNumber}* confirmado!`,
    '',
    ...items.map(i => `• ${i.title} x${i.quantity} — R$ ${(i.unit_price * i.quantity).toFixed(2)}`),
    '',
  ];
  
  if (discount > 0) lines.push(`💿 Desconto: -R$ ${discount.toFixed(2)}`);
  if (shipping > 0) lines.push(`🚚 Frete: R$ ${shipping.toFixed(2)}`);
  lines.push(`💰 Total: *R$ ${total.toFixed(2)}*`);
  lines.push('');
  lines.push('Aguarde! Seu pedido está sendo preparado.');
  
  return lines.join('\n');
}

async function sendText(remoteJid, text) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isGroupJid = resolvedJid.includes('@g.us');
  const isLid = resolvedJid.includes('@lid');

  if (isLid) {
    const phone = normalizePhone(resolvedJid) || await resolveLidToPhone(resolvedJid);
    if (phone) {
      try {
        return await evo.sendText(phone, text);
      } catch (err) {
        console.error('[WhatsApp] sendText with phone failed:', err.message);
        const alt = alternateBrazilianNumber(phone);
        if (alt && alt !== phone) {
          try { return await evo.sendText(alt, text); } catch {}
        }
      }
    }
    try {
      return await evo.sendText(resolvedJid, text);
    } catch (err) {
      console.error('[WhatsApp] sendText to @lid failed:', err.message);
      return null;
    }
  }

  if (isGroupJid) {
    try {
      return await evo.sendText(resolvedJid, text);
    } catch (err) {
      console.error('[WhatsApp] sendText to group failed:', err.message);
      return null;
    }
  }

  const number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  try {
    return await evo.sendText(number, text);
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      const alternate = alternateBrazilianNumber(number);
      if (alternate && alternate !== number) {
        try { return await evo.sendText(alternate, text); } catch {}
      }
    }
    console.error('[WhatsApp] sendText failed:', err.message);
    return null;
  }
}

async function sendReaction(remoteJid, messageId, emoji) {
  const key = parser.buildMessageKey(resolveJid(remoteJid) || remoteJid, messageId);
  try {
    return await evo.sendReaction(key, emoji);
  } catch (err) {
    return null;
  }
}

async function sendTyping(remoteJid, typing = true) {
  const phone = normalizePhone(remoteJid);
  if (!phone) return null;
  try {
    return await evo.setTyping(phone, typing);
  } catch {
    return null;
  }
}

async function markMessageRead(remoteJid, messageId) {
  const key = parser.buildMessageKey(resolveJid(remoteJid) || remoteJid, messageId);
  try {
    return await evo.markRead(key);
  } catch {
    return null;
  }
}

// LID resolution placeholder - implement with your LID cache logic
const LID_CACHE = new Map();

async function resolveLidToPhone(lidJid) {
  return LID_CACHE.get(lidJid) || null;
}

function cacheLid(lidJid, phone) {
  LID_CACHE.set(lidJid, phone);
}

module.exports = {
  normalizePhone,
  phoneVariants,
  alternateBrazilianNumber,
  resolveJid,
  resolveToPhone,
  stripWhatsAppFormat,
  formatWhatsAppText,
  splitMessage,
  formatOrderReceipt,
  sendText,
  sendReaction,
  sendTyping,
  markMessageRead,
  resolveLidToPhone,
  cacheLid,
};