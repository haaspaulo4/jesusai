const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

function startTelegramBot() {
  if (!TELEGRAM_TOKEN) {
    console.log('  TELEGRAM_TOKEN not set. Telegram bot disabled.');
    return null;
  }

  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    const { makeTelegramHandler, _activeBots } = require('./handler');
    const handler = makeTelegramHandler();

    _activeBots.set('telegram', bot);

    bot.on('message', (msg) => {
      handler(bot, msg).catch(err => {
        console.error('[Telegram] Handler error:', err.message);
      });
    });

    bot.on('polling_error', (err) => {
      console.error('Telegram polling error:', err.message);
    });

    console.log('  Telegram bot started (using processMessage handler)');
    return bot;
  } catch (err) {
    console.error('Failed to start Telegram bot:', err.message);
    return null;
  }
}

module.exports = { startTelegramBot };