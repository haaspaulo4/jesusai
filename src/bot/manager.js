const { pool } = require('../db');
const { getSetting } = require('../settings');

let activeBots = new Map();

async function listBots(platform) {
  let query = 'SELECT * FROM bot_instances ORDER BY platform, name';
  const params = [];
  if (platform) {
    query = 'SELECT * FROM bot_instances WHERE platform = ? ORDER BY name';
    params.push(platform);
  }
  const [rows] = await pool.execute(query, params);
  return rows.map(row => ({
    ...row,
    config: typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {}),
    isActive: !!row.is_active,
  }));
}

async function getBot(id) {
  const [rows] = await pool.execute('SELECT * FROM bot_instances WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ...row,
    config: typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {}),
    isActive: !!row.is_active,
  };
}

async function addBot({ platform, name, token, webhookUrl, instanceName, personaId, config }) {
  const [result] = await pool.execute(
    'INSERT INTO bot_instances (platform, name, token, webhook_url, instance_name, persona_id, config) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [platform, name, token || null, webhookUrl || null, instanceName || null, personaId || null, JSON.stringify(config || {})]
  );
  return getBot(result.insertId);
}

async function updateBot(id, updates) {
  const fields = [];
  const values = [];
  const allowedFields = ['name', 'token', 'webhook_url', 'instance_name', 'persona_id', 'is_active', 'config'];

  for (const [key, value] of Object.entries(updates)) {
    const colName = key === 'webhookUrl' ? 'webhook_url' : key === 'instanceName' ? 'instance_name' : key === 'personaId' ? 'persona_id' : key === 'isActive' ? 'is_active' : key;
    if (allowedFields.includes(colName)) {
      fields.push(`${colName} = ?`);
      values.push(colName === 'config' ? JSON.stringify(value) : (colName === 'is_active' ? (value ? 1 : 0) : value));
    }
  }

  if (fields.length === 0) return getBot(id);
  values.push(id);
  await pool.execute(`UPDATE bot_instances SET ${fields.join(', ')} WHERE id = ?`, values);
  return getBot(id);
}

async function deleteBot(id) {
  await stopBot(id);
  await pool.execute('DELETE FROM bot_instances WHERE id = ?', [id]);
}

async function startBot(id) {
  const bot = await getBot(id);
  if (!bot) throw new Error('Bot not found');
  if (activeBots.has(id)) await stopBot(id);

  if (bot.platform === 'telegram') {
    if (!bot.token) throw new Error('Telegram bot requires a token');
    const TelegramBot = require('node-telegram-bot-api');
    const { makeTelegramHandler } = require('../telegram/handler');

    const tgBot = new TelegramBot(bot.token, { polling: true });
    const handler = makeTelegramHandler({
      personaId: bot.personaId || null,
      botName: bot.name,
      instanceId: id,
    });

    tgBot.on('message', async (msg) => {
      if (msg.text && msg.text.trim() === '/start') {
        const chatId = msg.chat.id;
        const firstName = msg.from?.first_name || 'amigo';
        const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
        if (!isGroup) {
          try {
            await tgBot.sendMessage(chatId, `👋 Olá, ${firstName}! Eu sou o ${bot.name || 'MetaPersona.AI'}. Como posso te ajudar hoje?`, {
              reply_markup: {
                keyboard: [
                  ['💬 Conversar', '📊 /stats'],
                  ['🎭 /persona', '🎯 /goals'],
                  ['✅ /tasks', '📅 /calendar'],
                  ['📖 Ajuda', '⚙️ /myprofile'],
                ],
                resize_keyboard: true,
                one_time_keyboard: false,
              },
            });
          } catch {}
        }
      }
      handler(tgBot, msg).catch(err => console.error(`[TG:${bot.name}] Error:`, err.message));
    });
    tgBot.on('callback_query', async (query) => {
      const chatId = query.message?.chat?.id;
      const userId = query.from?.id;
      if (!chatId || !userId) {
        try { await tgBot.answerCallbackQuery(query.id); } catch {}
        return;
      }
      const data = query.data || '';
      try {
        const { handleChatCommand } = require('../chat/engine');
        const uid = `tg_${userId}`;
        const sid = `tg_${chatId}`;
        let response = null;
        if (data.startsWith('persona:')) {
          const personaId = data.substring(7);
          const cmdResult = await handleChatCommand(`/persona ${personaId}`, uid, 'telegram', sid, bot.personaId);
          response = cmdResult || `✅ Persona alterada!`;
        } else if (data.startsWith('action:')) {
          const action = data.substring(7);
          const cmdResult = await handleChatCommand(`/${action}`, uid, 'telegram', sid, bot.personaId);
          if (cmdResult) response = cmdResult;
        } else {
          const cmdResult = await handleChatCommand(data, uid, 'telegram', sid, bot.personaId);
          if (cmdResult) response = cmdResult;
        }
        if (response) {
          const MAX_LEN = 800;
          const reply = response.length > MAX_LEN ? response.substring(0, MAX_LEN) + '...' : response;
          try {
            await tgBot.editMessageText(reply, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
          } catch {
            await tgBot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
          }
        }
        await tgBot.answerCallbackQuery(query.id);
      } catch (err) {
        console.error(`[TG:${bot.name}] Callback query error:`, err.message);
        try { await tgBot.answerCallbackQuery(query.id); } catch {}
      }
    });
    tgBot.on('polling_error', (err) => {
      console.error(`[TG:${bot.name}] Polling error:`, err.message);
    });

    activeBots.set(id, { platform: 'telegram', bot: tgBot, name: bot.name });

    try {
      const { _activeBots } = require('../telegram/handler');
      _activeBots.set('telegram', tgBot);
      console.log(`[BotManager] Telegram bot registered in handler _activeBots`);
    } catch (e) {
      console.error('[BotManager] Could not register bot in _activeBots:', e.message);
    }

    console.log(`[BotManager] Telegram bot "${bot.name}" (id:${id}) started`);
    return { id, platform: 'telegram', name: bot.name, status: 'running' };
  }

  if (bot.platform === 'whatsapp') {
    const { makeWhatsAppHandler } = require('../whatsapp/handler');
    const handler = makeWhatsAppHandler({
      personaId: bot.personaId || null,
      botName: bot.name,
      instanceId: id,
      instanceName: bot.instanceName,
    });

    activeBots.set(id, { platform: 'whatsapp', handler, name: bot.name, instanceName: bot.instanceName });
    console.log(`[BotManager] WhatsApp bot "${bot.name}" (id:${id}) registered`);
    return { id, platform: 'whatsapp', name: bot.name, status: 'registered' };
  }

  throw new Error(`Unknown platform: ${bot.platform}`);
}

async function stopBot(id) {
  const active = activeBots.get(id);
  if (!active) return;

  if (active.platform === 'telegram' && active.bot) {
    try {
      await active.bot.stopPolling();
    } catch {}
  }

  activeBots.delete(id);
  console.log(`[BotManager] Bot "${active.name}" (id:${id}) stopped`);
}

async function startAllBots() {
  const bots = await listBots();
  const results = [];

  for (const bot of bots) {
    if (!bot.isActive) continue;
    try {
      const result = await startBot(bot.id);
      results.push(result);
    } catch (err) {
      console.error(`[BotManager] Failed to start bot "${bot.name}":`, err.message);
      results.push({ id: bot.id, name: bot.name, status: 'error', error: err.message });
    }
  }

  return results;
}

async function stopAllBots() {
  const ids = [...activeBots.keys()];
  for (const id of ids) {
    await stopBot(id);
  }
}

function getActiveBots() {
  const result = [];
  for (const [id, bot] of activeBots) {
    result.push({
      id,
      platform: bot.platform,
      name: bot.name,
      status: 'running',
      instanceName: bot.instanceName || null,
    });
  }
  return result;
}

function getWhatsAppHandler(instanceName) {
  for (const [, bot] of activeBots) {
    if (bot.platform === 'whatsapp' && bot.instanceName === instanceName && bot.handler) {
      return bot.handler;
    }
  }
  return null;
}

module.exports = {
  listBots,
  getBot,
  addBot,
  updateBot,
  deleteBot,
  startBot,
  stopBot,
  startAllBots,
  stopAllBots,
  getActiveBots,
  getWhatsAppHandler,
};