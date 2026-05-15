const { processMessage, handleChatCommand, isUserAdmin } = require('../chat/engine');
const personaManager = require('../persona/manager');
const { getActivePersona } = require('../persona/config');
const { updateProfileFromMessage } = require('../memory/profile');
const { getSetting } = require('../settings');
const { ensureUser } = require('../onboarding');

function makeInstagramHandler(options = {}) {
  const instancePersonaId = options.personaId || null;
  const botName = options.botName || 'MetaPersona.AI';
  const instanceId = options.instanceId || 'default';

  async function getPersona(threadId, userId) {
    if (instancePersonaId) {
      const p = await personaManager.getPersona(instancePersonaId);
      if (p) return p;
    }
    const sessionPersona = await personaManager.getSessionPersona(`ig_${threadId}`);
    if (sessionPersona) return sessionPersona;
    if (userId) {
      const userPersona = await personaManager.getUserPersona(userId);
      if (userPersona) return userPersona;
    }
    return getActivePersona();
  }

  async function handleDM(igClient, message) {
    const threadId = message.thread_id || message.item_id;
    const userId = message.user_id ? `ig_${message.user_id}` : 'ig_unknown';
    const text = message.text || '';
    const senderPk = String(message.user_id);

    if (!text) return;

    const sid = `ig_dm_${threadId}`;
    const userName = message.user?.username || senderPk;

    try {
      await ensureUser(userId, userName, 'instagram');
    } catch {}

    await updateProfileFromMessage(userId, text);

    const isAdmin = await isUserAdmin(userId);

    if (text.startsWith('/')) {
      try {
        const cmdResult = await handleChatCommand(text, userId, 'instagram', sid, instancePersonaId);
        if (cmdResult) {
          await sendInstagramMessage(igClient, threadId, cmdResult);
          return;
        }
      } catch {}
    }

    const persona = await getPersona(threadId, userId);
    const chunkSize = parseInt(await getSetting('message_chunk_size', '200')) || 200;

    try {
      const result = await processMessage({
        message: text,
        sessionId: sid,
        userId,
        language: 'pt-BR',
        isGroup: false,
        source: 'instagram',
        userName,
      });

      const responseText = result.response || '';
      const chunks = chunkMessage(responseText, chunkSize);

      for (const chunk of chunks) {
        await sendInstagramMessage(igClient, threadId, chunk);
      }
    } catch (err) {
      console.error(`[IG:${botName}] Process message error:`, err.message);
      await sendInstagramMessage(igClient, threadId, 'Desculpe, ocorreu um erro. Tente novamente.');
    }
  }

  return handleDM;
}

function chunkMessage(text, maxLen) {
  if (!text) return [];
  const chunks = [];
  let current = '';
  const lines = text.split('\n');

  for (const line of lines) {
    if ((current + '\n' + line).length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.substring(0, maxLen)];
}

async function sendInstagramMessage(igClient, threadId, text) {
  try {
    const { IgApiClient } = require('instagram-private-api');
    if (igClient && typeof igClient.entity?.directThread === 'function') {
      const thread = igClient.entity.directThread(threadId);
      await thread.broadcastText(text);
    }
  } catch (err) {
    console.error('[IG] Send message error:', err.message);
  }
}

module.exports = { makeInstagramHandler, sendInstagramMessage };