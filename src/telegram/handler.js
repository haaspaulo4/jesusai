const { searchVerses } = require('../rag/store');
const { getActivePersona, buildSystemPrompt } = require('../persona/config');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');
const {
  getSession,
  addMessage,
  getHistoryForLLM,
  buildMemoryContext,
  extractContextFromMessage,
  updateSessionContext,
  generateSummary,
  saveSession,
} = require('../memory/session');
const {
  getProfile,
  updateProfileFromMessage,
  buildProfileContext,
  generateProfileSummary,
} = require('../memory/profile');
const { isUserAdmin } = require('../chat/engine');
const integrations = require('../llm/integrationManager');
const { getSetting } = require('../settings');
const { t, DEFAULT_LANG, SUPPORTED_LANGS } = require('../i18n');
const { handleChatCommand } = require('../chat/engine');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';

function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\|/g, '\\|')
    .replace(/---/g, '—')
    .replace(/--/g, '–');
}

function makeTelegramHandler(options = {}) {
  const instancePersonaId = options.personaId || null;
  const botName = options.botName || 'Jesus.AI';
  const instanceId = options.instanceId || 'default';

  async function getPersona(chatId, userId) {
    if (instancePersonaId) {
      const p = await personaManager.getPersona(instancePersonaId);
      if (p) return p;
    }
    const sessionPersona = await personaManager.getSessionPersona(`tg_${chatId}`);
    if (sessionPersona) return sessionPersona;
    if (userId) {
      const userPersona = await personaManager.getUserPersona(userId);
      if (userPersona) return userPersona;
    }
    return getActivePersona();
  }

  return async function handleMessage(bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    if (!text) return;

    const sid = isGroup ? `tg_${chatId}_${msg.from.id}` : `tg_${chatId}`;
    const uid = `tg_${msg.from.id}`;
    const userName = msg.from?.first_name || msg.from?.username || null;

    await updateProfileFromMessage(uid, text);
    const userContext = extractContextFromMessage(text);
    if (userName && !userContext.name) userContext.name = userName;
    await updateSessionContext(sid, userContext);

    const { processMessage } = require('../chat/engine');

    try {
      const result = await processMessage({
        message: text,
        sessionId: sid,
        userId: uid,
        language: 'pt-BR',
        isGroup,
        source: 'telegram',
      });

      let reply = result.response;

      if (isGroup && userName) {
        reply = `${userName}, ` + reply.charAt(0).toLowerCase() + reply.slice(1);
      }

      const MAX_LEN = 800;
      if (reply.length <= MAX_LEN) {
        try {
          await bot.sendMessage(chatId, escapeMarkdown(reply), { parse_mode: 'Markdown' });
        } catch {
          await bot.sendMessage(chatId, reply);
        }
      } else {
        const paragraphs = reply.split(/\n\n+/);
        let chunk = '';
        for (const para of paragraphs) {
          if ((chunk + '\n\n' + para).length > MAX_LEN) {
            if (chunk) {
              try {
                await bot.sendMessage(chatId, escapeMarkdown(chunk), { parse_mode: 'Markdown' });
              } catch {
                await bot.sendMessage(chatId, chunk);
              }
              await new Promise(r => setTimeout(r, 500));
            }
            chunk = para;
          } else {
            chunk = chunk ? chunk + '\n\n' + para : para;
          }
        }
        if (chunk) {
          try {
            await bot.sendMessage(chatId, escapeMarkdown(chunk), { parse_mode: 'Markdown' });
          } catch {
            await bot.sendMessage(chatId, chunk);
          }
        }
      }

      await addMessage(sid, 'assistant', result.response);

      if (result.sources && result.sources.length > 0) {
        const sourcesText = result.sources.map(s => `📖 ${s.reference}`).join('\n');
        try {
          await bot.sendMessage(chatId, sourcesText);
        } catch {}
      }

      if (result.personaId && result.personaName) {
        try {
          await bot.sendMessage(chatId, `🎭 Persona: ${result.personaName}`, { disable_notification: true });
        } catch {}
      }
    } catch (err) {
      console.error(`[TG:${botName}] Message error:`, err.message);
      try {
        await bot.sendMessage(chatId, 'Perdoe-me, houve uma dificuldade técnica. Tente novamente em breve.');
      } catch {}
    }
  };
}

module.exports = { makeTelegramHandler };