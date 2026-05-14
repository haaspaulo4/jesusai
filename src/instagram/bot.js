const { pool } = require('../db');
const { getSetting } = require('../settings');
const { makeInstagramHandler } = require('./handler');

let igClient = null;
let igHandler = null;
let igPollingInterval = null;
let lastMessageTimestamp = null;

async function createInstagramClient(config = {}) {
  const { IgApiClient } = require('instagram-private-api');

  const username = config.username || process.env.IG_USERNAME;
  const password = config.password || process.env.IG_PASSWORD;

  if (!username || !password) {
    throw new Error('Instagram username and password are required (set IG_USERNAME and IG_PASSWORD env vars or pass in config)');
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(username);

  if (config.proxyUrl) {
    ig.state.proxyUrl = config.proxyUrl;
  }

  console.log(`[Instagram] Logging in as ${username}...`);

  await ig.simulate.preLoginFlow();
  const loggedInUser = await ig.account.login(username, password);
  process.nextTick(async () => {
    try {
      await ig.simulate.postLoginFlow();
    } catch (err) {
      console.error('[Instagram] Post-login flow error:', err.message);
    }
  });

  console.log(`[Instagram] Logged in as ${loggedInUser.username}`);
  return ig;
}

async function startInstagramBot(config = {}) {
  try {
    igClient = await createInstagramClient(config);
    igHandler = makeInstagramHandler({
      personaId: config.personaId || null,
      botName: config.botName || 'MetaPersona.AI',
      instanceId: config.instanceId || 'default',
    });

    lastMessageTimestamp = Date.now();

    console.log('[Instagram] Starting DM poll...');
    startDMPolling(config.pollInterval || 10000);

    return {
      platform: 'instagram',
      client: igClient,
      status: 'running',
      username: config.username || process.env.IG_USERNAME,
    };
  } catch (err) {
    console.error('[Instagram] Failed to start:', err.message);
    throw err;
  }
}

function startDMPolling(interval) {
  if (igPollingInterval) clearInterval(igPollingInterval);

  igPollingInterval = setInterval(async () => {
    try {
      await pollDirectMessages();
    } catch (err) {
      console.error('[Instagram] DM poll error:', err.message);
    }
  }, interval);

  console.log(`[Instagram] DM polling started (interval: ${interval}ms)`);
}

async function pollDirectMessages() {
  if (!igClient || !igHandler) return;

  try {
    const inbox = await igClient.feed.directInbox();
    const threads = await inbox.items();

    for (const thread of threads) {
      const threadId = thread.thread_id;
      const messages = thread.items || [];

      for (const msg of messages) {
        const msgTimestamp = msg.timestamp ? parseInt(msg.timestamp) : Date.now();

        if (msgTimestamp <= (lastMessageTimestamp || 0)) continue;

        if (msg.item_type !== 'text' && msg.item_type !== 'like') continue;

        const userId = msg.user_id;
        if (String(userId) === String(igClient.state.cookieUserId)) continue;

        if (msg.item_type === 'text') {
          try {
            await igHandler(igClient, {
              thread_id: threadId,
              user_id: userId,
              text: msg.text,
              user: msg.user || { username: String(userId) },
              item_id: msg.item_id,
            });
          } catch (err) {
            console.error(`[Instagram] Handler error for thread ${threadId}:`, err.message);
          }
        }

        lastMessageTimestamp = Math.max(lastMessageTimestamp || 0, msgTimestamp);
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('401')) {
      console.error('[Instagram] Session expired. Restart required.');
      stopInstagramBot();
    }
  }
}

async function stopInstagramBot() {
  if (igPollingInterval) {
    clearInterval(igPollingInterval);
    igPollingInterval = null;
  }

  igClient = null;
  igHandler = null;
  console.log('[Instagram] Bot stopped');
}

function getInstagramClient() {
  return igClient;
}

function isInstagramRunning() {
  return igClient !== null && igPollingInterval !== null;
}

async function startInstagramFromDB() {
  const [bots] = await pool.execute(
    "SELECT * FROM bot_instances WHERE platform = 'instagram' AND is_active = 1"
  );

  for (const bot of bots) {
    const config = typeof bot.config === 'string' ? JSON.parse(bot.config || '{}') : (bot.config || {});
    try {
      await startInstagramBot({
        username: config.username || process.env.IG_USERNAME,
        password: config.password || process.env.IG_PASSWORD,
        proxyUrl: config.proxyUrl || process.env.IG_PROXY_URL,
        personaId: bot.persona_id,
        botName: bot.name,
        instanceId: bot.id,
        pollInterval: config.pollInterval || 10000,
      });
      console.log(`[Instagram] Bot "${bot.name}" (id:${bot.id}) started`);
    } catch (err) {
      console.error(`[Instagram] Failed to start bot "${bot.name}":`, err.message);
    }
  }
}

module.exports = {
  startInstagramBot,
  stopInstagramBot,
  getInstagramClient,
  isInstagramRunning,
  startInstagramFromDB,
  sendInstagramMessage: require('./handler').sendInstagramMessage,
};