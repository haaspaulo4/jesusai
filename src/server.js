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

app.get('/p/:personaId', async (req, res) => {
  try {
    const personaManager = require('./persona/manager');
    await personaManager.loadPersonas();
    const persona = await personaManager.getPersona(req.params.personaId);
    if (!persona || !persona.isActive) {
      return res.status(404).send('Persona not found');
    }
    const { getSetting } = require('./settings');
    const brandName = await getSetting('brand_name') || persona.name;
    const brandTagline = await getSetting('brand_tagline') || '';
    const brandPrimaryColor = await getSetting('brand_primary_color') || '#c9a227';
    const brandSecondaryColor = await getSetting('brand_secondary_color') || '#1a1a2e';

    const lang = req.query.lang || 'pt-BR';
    const identityRaw = persona.identity[lang] || persona.identity['pt-BR'] || persona.identity || '';
    const identityStr = typeof identityRaw === 'string' ? identityRaw : (identityRaw.core || '');
    const shortDesc = identityStr.split('.')[0] || persona.name;

    const welcomeTitle = persona.welcomeTitle?.[lang] || persona.welcomeTitle?.['pt-BR'] || persona.name;
    const welcomeBody = persona.welcomeBody?.[lang] || persona.welcomeBody?.['pt-BR'] || '';
    const personaName = lang === 'en-US' ? (persona.nameEn || persona.name) : (lang === 'es-ES' ? (persona.nameEs || persona.name) : persona.name);

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${personaName} - ${shortDesc}</title>
  <meta name="description" content="${shortDesc}">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
  <style>
    :root {
      --gold: ${brandPrimaryColor};
      --dark-bg: ${brandSecondaryColor};
    }
    .landing-cross-bg { display: none; }
    .hero-badge .badge-dot { background: ${brandPrimaryColor}; }
    .cross-icon { display: none; }
    .persona-icon { font-size: 1.5rem; margin-right: 0.25rem; }
    .hero-verse { font-style: italic; opacity: 0.7; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="landing" id="landingPage">
    <div class="landing-bg">
      <div class="bg-gradient"></div>
      <div class="bg-grid"></div>
      <div class="bg-orbs">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
      </div>
    </div>

    <nav class="landing-nav">
      <div class="landing-logo">
        <span class="persona-icon">🤖</span>
        <span class="logo-text">${brandName || personaName}</span>
      </div>
      <div class="landing-nav-links">
        <a href="#features" class="nav-link">Como funciona</a>
        <button class="nav-cta-btn" id="navLoginBtn" onclick="startChat()">Conversar</button>
      </div>
    </nav>

    <section class="landing-hero" id="hero">
      <div class="hero-content animate-in">
        <div class="hero-badge">
          <span class="badge-dot"></span>
          ${shortDesc}
        </div>
        <h1 class="hero-title">${typeof welcomeTitle === 'string' ? welcomeTitle : personaName}</h1>
        <p class="hero-subtitle">${typeof welcomeBody === 'string' ? welcomeBody : identityStr.substring(0, 200)}</p>
        <div class="hero-actions">
          <button class="hero-btn primary" onclick="startChat()">
            <span>Começar a conversar</span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>
    </section>

    <section class="landing-features" id="features">
      <h2 class="section-title">Como funciona</h2>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">💬</div>
          <h3>Conversa natural</h3>
          <p>Respostas baseadas no conteúdo e conhecimento especializado.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🎯</div>
          <h3>Personalizado</h3>
          <p>Adapta ao seu interesse e remember suas conversas.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔊</div>
          <h3>Áudio e texto</h3>
          <p>Ouça as respostas em voz natural ou leia no chat.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🌍</div>
          <h3>3 idiomas</h3>
          <p>Português, inglês e espanhol — responde no seu idioma.</p>
        </div>
      </div>
    </section>

    <footer class="landing-footer">
      <p>${brandName || personaName} &copy; ${new Date().getFullYear()}</p>
    </footer>
  </div>

  <script>
    const PERSONA_ID = '${persona.id}';
    function startChat() {
      window.location.href = '/?persona=' + PERSONA_ID;
    }
  </script>
</body>
</html>`;
    res.send(html);
  } catch (err) {
    console.error('[Persona Landing] Error:', err.message);
    res.status(500).send('Error loading persona');
  }
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