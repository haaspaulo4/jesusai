require('dotenv').config();
const express = require('express');
const path = require('path');
const chatRoute = require('./routes/chat');
const authRoute = require('./routes/auth');
const blogRoute = require('./routes/blog');
const whatsappRoute = require('./routes/whatsapp');
const emailRoute = require('./routes/email');
const adminRoute = require('./routes/admin');
const { startTelegramBot } = require('./telegram/bot');
const { startWhatsAppBot } = require('./whatsapp/bot');
const { generateDailyPost, scheduleDailyPost } = require('./blog');
const { scheduleDailyDevotional } = require('./email');
const { initDatabase } = require('./db');
const { getActivePersona } = require('./persona/config');
const { loadPersonas } = require('./persona/manager');
const { startKokoroServer, stopKokoroServer } = require('./tts/kokoro-manager');
const integrations = require('./llm/integrationManager');
const { loadSettings } = require('./settings');


const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
});

process.on('SIGTERM', () => {
  console.log('[SIGTERM] Graceful shutdown...');
  stopKokoroServer();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SIGINT] Graceful shutdown...');
  stopKokoroServer();
  process.exit(0);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', chatRoute);
app.use('/api/auth', authRoute);
app.use('/api/blog', blogRoute);
app.use('/api/whatsapp', whatsappRoute);
app.use('/api/email', emailRoute);
app.use('/api/admin', adminRoute);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health/tts', async (req, res) => {
  const { checkHealth, getKokoroStatus } = require('./tts/kokoro-manager');
  const status = getKokoroStatus();
  if (status.mode === 'kokoro') {
    const healthy = await checkHealth();
    status.healthy = healthy;
  }
  res.json(status);
});

async function start() {
  try {
    await initDatabase();
    console.log('  Database connected');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  }

  try {
    await loadSettings();
    console.log('  Settings loaded');
  } catch (err) {
    console.error('Warning: Settings load failed:', err.message);
  }

  try {
    await loadPersonas();
  } catch (err) {
    console.error('Warning: Personas load failed:', err.message);
  }

  try {
    await integrations.load();
  } catch (err) {
    console.error('Warning: Integrations load failed:', err.message);
  }

  app.listen(PORT, async () => {
    const persona = getActivePersona();
    const nameLen = persona.name.length;
    const padding = Math.max(0, 28 - nameLen);
    const padLeft = Math.floor(padding / 2);
    const padRight = padding - padLeft;
    console.log(`
  ╔══════════════════════════════════════╗
  ║${' '.repeat(padLeft)}${persona.name} is running${' '.repeat(padRight)}║
  ║    http://localhost:${PORT}              ║
  ╚══════════════════════════════════════╝
    `);

    await startKokoroServer();

    startTelegramBot();

    await startWhatsAppBot(SERVER_URL);

    generateDailyPost().then(() => {
      scheduleDailyPost();
    });
  });
}

start();