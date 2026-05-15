const personaManager = require('../persona/manager');
const { getActivePersona, buildSystemPrompt } = require('../persona/config');
const { handleChatCommand } = require('../chat/engine');

function makeWhatsAppHandler(options = {}) {
  const instancePersonaId = options.personaId || null;
  const botName = options.botName || 'MetaPersona.AI';
  const instanceId = options.instanceId || 'default';

  return async function handleIncomingMessage({ remoteJid, text, pushName, senderId, isGroup, instanceName }) {
    const sid = isGroup ? `wa_grp_${remoteJid}` : `wa_lid_${senderId}`;
    const uid = senderId || 'unknown';

    const cmdResult = await handleChatCommand(text, uid, 'whatsapp', sid, instancePersonaId);
    if (cmdResult) return { type: 'command', response: cmdResult };

    const { processMessage } = require('../chat/engine');

    try {
      const result = await processMessage({
        message: text,
        sessionId: sid,
        userId: uid,
        language: 'pt-BR',
        isGroup,
        source: 'whatsapp',
        userName: pushName || undefined,
      });

      return {
        type: 'message',
        response: result.response,
        sources: result.sources,
        personaId: result.personaId,
        personaName: result.personaName,
      };
    } catch (err) {
      console.error(`[WA:${botName}] Message error:`, err.message);
      return {
        type: 'error',
        response: 'Perdoe-me, houve uma dificuldade técnica. Tente novamente em breve.',
      };
    }
  };
}

module.exports = { makeWhatsAppHandler };