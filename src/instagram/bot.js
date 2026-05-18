const { pool } = require('../db');
const { getSetting } = require('../settings');
const { makeInstagramHandler } = require('./handler');
const { IgApiClient, DirectInboxFeed, DirectPendingInboxFeed, DirectThreadFeed } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');

let igClient = null;
let igHandler = null;
let igPollingInterval = null;
let processedMessageIds = new Set();
let lastPollTime = 0;

const SESSION_FILE = path.join(__dirname, '..', '..', 'data', 'instagram_session.json');

async function createInstagramClient(config = {}) {
  const username = config.username || process.env.IG_USERNAME;
  const password = config.password || process.env.IG_PASSWORD;

  if (!username || !password) {
    throw new Error('Instagram credentials required');
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(username);

  const proxyUrl = config.proxyUrl || process.env.IG_PROXY_URL;
  if (proxyUrl) {
    ig.state.proxyUrl = proxyUrl;
    console.log(`[Instagram] Using proxy: ${proxyUrl}`);
  }

  console.log(`[Instagram] Logging in as ${username}...`);

  await ig.simulate.preLoginFlow();

  try {
    const loggedInUser = await ig.account.login(username, password);

    const session = ig.state.serialize();
    const dir = path.dirname(SESSION_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session));
    console.log('[Instagram] Session saved');

    try {
      await ig.simulate.postLoginFlow();
    } catch (err) {
      console.warn('[Instagram] Post-login warning:', err.message);
    }

    console.log(`[Instagram] Logged in as ${loggedInUser.username} (pk: ${loggedInUser.pk})`);
    return ig;
  } catch (loginErr) {
    console.error('[Instagram] Login error:', loginErr.message);
    if (loginErr.message.includes('checkpoint') || loginErr.message.includes('2fa')) {
      console.error('[Instagram] 2FA/Checkpoint required! Disable 2FA or login manually first.');
    }
    throw loginErr;
  }
}

async function startInstagramBot(config = {}) {
  try {
    igClient = await createInstagramClient(config);
    igHandler = makeInstagramHandler({
      personaId: config.personaId || null,
      botName: config.botName || 'MetaPersona.AI',
      instanceId: config.instanceId || 'default',
    });

    console.log('[Instagram] Starting DM poll...');
    startDMPolling(config.pollInterval || 60000);

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

  const now = Date.now();
  if (now - lastPollTime < 20000) return;
  lastPollTime = now;

  try {
    const myUserId = igClient.state.cookieUserId;
    if (!myUserId) {
      console.warn('[Instagram] No user ID');
      return;
    }

    let threads = [];
    let feedType = 'inbox';

    try {
      const inbox = new DirectInboxFeed(igClient);
      threads = await inbox.items();
    } catch (inboxErr) {
      if (inboxErr.message.includes('467')) {
        // Try pending inbox instead
        try {
          feedType = 'pending';
          const pending = new DirectPendingInboxFeed(igClient);
          threads = await pending.items();
        } catch (pendingErr) {
          if (pendingErr.message.includes('467')) {
            console.warn('[Instagram] Blocked on all feeds');
            return;
          }
          throw pendingErr;
        }
      } else {
        throw inboxErr;
      }
    }

    if (!threads?.length) return;
    console.log(`[Instagram] Polled ${threads.length} threads (${feedType})`);

    for (const thread of threads) {
      const threadId = thread.thread_id;
      const messages = thread.items || [];
      if (!messages?.length) continue;

      for (const msg of messages) {
        const msgId = String(msg.item_id);
        if (processedMessageIds.has(msgId)) continue;
        if (msg.item_type !== 'text') continue;
        if (String(msg.user_id) === String(myUserId)) continue;

        console.log(`[Instagram] NEW from ${msg.user_id}: "${msg.text.substring(0, 30)}"`);

        try {
          await igHandler(igClient, {
            thread_id: threadId,
            user_id: msg.user_id,
            text: msg.text,
            user: msg.user || { username: String(msg.user_id) },
            item_id: msg.item_id,
          });
        } catch (err) {
          console.error(`[Instagram] Handler error:`, err.message);
        }

        processedMessageIds.add(msgId);
      }
    }
  } catch (err) {
    const errMsg = err.message || '';
    if (errMsg.includes('467') || errMsg.includes('checkpoint')) {
      console.warn('[Instagram] Blocked (467)');
    } else if (errMsg.includes('401')) {
      console.error('[Instagram] Session expired');
      stopInstagramBot();
    } else if (!errMsg.includes('not found')) {
      console.error('[Instagram] Poll error:', errMsg);
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
        pollInterval: config.pollInterval || 60000,
      });
      console.log(`[Instagram] Bot "${bot.name}" started`);
    } catch (err) {
      console.error(`[Instagram] Failed to start bot "${bot.name}":`, err.message);
    }
  }
}

module.exports = {
  startInstagramBot,
  stopInstagramBot,
  startInstagramFromDB,
  getInstagramClient,
  isInstagramRunning,
};