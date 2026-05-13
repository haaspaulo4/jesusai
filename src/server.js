require('dotenv').config();
const express = require('express');
const path = require('path');
const chatRoute = require('./routes/chat');
const authRoute = require('./routes/auth');
const blogRoute = require('./routes/blog');
const whatsappRoute = require('./routes/whatsapp');
const emailRoute = require('./routes/email');
const { startTelegramBot } = require('./telegram/bot');
const { startWhatsAppBot } = require('./whatsapp/bot');
const { generateDailyPost, scheduleDailyPost } = require('./blog');
const { scheduleDailyDevotional } = require('./email');
const { initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', chatRoute);
app.use('/api/auth', authRoute);
app.use('/api/blog', blogRoute);
app.use('/api/whatsapp', whatsappRoute);
app.use('/api/email', emailRoute);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start() {
  try {
    await initDatabase();
    console.log('  Database connected');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  }

  app.listen(PORT, async () => {
    console.log(`
  ╔══════════════════════════════════════╗
  ║          Jesus.AI is running         ║
  ║    http://localhost:${PORT}              ║
  ╚══════════════════════════════════════╝
    `);

    startTelegramBot();

    await startWhatsAppBot(SERVER_URL);

    generateDailyPost().then(() => {
      scheduleDailyPost();
    });
  });
}

start();