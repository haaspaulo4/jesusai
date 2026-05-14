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
const personaManager = require('./persona/manager');
const { loadPersonas } = personaManager;
const { startKokoroServer, stopKokoroServer } = require('./tts/kokoro-manager');
const { escapeHtml, buildPersonaPage, buildSitePage, buildCreatePersonaPage } = require('./server/templates');
const integrations = require('./llm/integrationManager');
const { loadSettings, getSetting } = require('./settings');


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
    await personaManager.loadPersonas();
    const persona = await personaManager.getPersona(req.params.personaId);
    if (!persona || !persona.isActive) {
      return res.status(404).send('Persona not found');
    }
    const brandName = await getSetting('brand_name') || persona.name;
    const brandPrimaryColor = await getSetting('brand_primary_color') || '#c9a227';
    const brandSecondaryColor = await getSetting('brand_secondary_color') || '#1a1a2e';
    const brandLogoUrl = await getSetting('brand_logo_url') || '';
    const allPersonas = [...personaManager.cache.values()].filter(p => p.isActive && p.id !== persona.id);
    const lang = req.query.lang || 'pt-BR';
    const identityRaw = persona.identity[lang] || persona.identity['pt-BR'] || persona.identity || '';
    const identityStr = typeof identityRaw === 'string' ? identityRaw : (identityRaw.core || '');
    const identityRules = typeof identityRaw === 'string' ? '' : (identityRaw.rules || '');
    const shortDesc = identityStr.split('.')[0] || persona.name;
    const fullDesc = identityStr.substring(0, 300) || shortDesc;
    const welcomeTitle = persona.welcomeTitle?.[lang] || persona.welcomeTitle?.['pt-BR'] || persona.name;
    const welcomeBody = persona.welcomeBody?.[lang] || persona.welcomeBody?.['pt-BR'] || fullDesc;
    const personaName = lang === 'en-US' ? (persona.nameEn || persona.name) : (lang === 'es-ES' ? (persona.nameEs || persona.name) : persona.name);
    const disclaimer = persona.disclaimer?.[lang] || persona.disclaimer?.['pt-BR'] || '';
    const kSources = persona.knowledgeSources || [];

    const otherPersonasHtml = allPersonas.slice(0, 4).map(p => {
      const pName = lang === 'en-US' ? (p.nameEn || p.name) : (lang === 'es-ES' ? (p.nameEs || p.name) : p.name);
      const pIdentity = p.identity?.[lang] || p.identity?.['pt-BR'] || p.identity || '';
      const pStr = typeof pIdentity === 'string' ? pIdentity : (pIdentity?.core || '');
      const pDesc = pStr.split('.')[0] || pName;
      return '<a href="/p/' + p.id + '" class="persona-card-mini"><span class="pcm-icon">🤖</span><div><strong>' + escapeHtml(pName) + '</strong><small>' + escapeHtml(pDesc) + '</small></div><span class="pcm-arrow">→</span></a>';
    }).join('\n          ');

    const identityRulesHtml = identityRules
      ? identityRules.split('\n').filter(r => r.trim()).slice(0, 6).map(r => '<div class="pl-rule-item">' + escapeHtml(r.replace(/^[-•*]\s*/, '').trim()) + '</div>').join('\n')
      : '';

    res.send(buildPersonaPage({
      personaName, welcomeTitle, welcomeBody, shortDesc,
      hasKnowledge: kSources.length > 0,
      brandName, brandPrimaryColor, brandSecondaryColor, brandLogoUrl,
      otherPersonasHtml, disclaimer, identityRulesHtml,
      personaId: persona.id
    }));
  } catch (err) {
    console.error('[Persona Landing] Error:', err.message);
    res.status(500).send('Error loading persona');
  }
});

app.get('/site', async (req, res) => {
  try {
    const brandName = await getSetting('brand_name') || 'MetaPersona.AI';
    const brandTagline = await getSetting('brand_tagline') || '';
    const brandPrimaryColor = await getSetting('brand_primary_color') || '#c9a227';
    const brandSecondaryColor = await getSetting('brand_secondary_color') || '#1a1a2e';
    const brandLogoUrl = await getSetting('brand_logo_url') || '';
    await personaManager.loadPersonas();
    const allPersonas = [...personaManager.cache.values()].filter(p => p.isActive);
    const lang = req.query.lang || 'pt-BR';
    res.send(buildSitePage({
      brandName, brandTagline, brandPrimaryColor, brandSecondaryColor, brandLogoUrl,
      personas: allPersonas.map(p => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn,
        nameEs: p.nameEs,
        identity: p.identity,
        knowledgeSources: p.knowledgeSources
      })),
      lang
    }));
  } catch (err) {
    console.error('[Site] Error:', err.message);
    res.status(500).send('Error loading site');
  }
});
app.get('/create-persona', async (req, res) => {
  try {
    const brandName = await getSetting('brand_name') || 'MetaPersona.AI';
    const brandTagline = await getSetting('brand_tagline') || '';
    const brandPrimaryColor = await getSetting('brand_primary_color') || '#c9a227';
    const brandSecondaryColor = await getSetting('brand_secondary_color') || '#1a1a2e';
    const brandLogoUrl = await getSetting('brand_logo_url') || '';
    res.send(buildCreatePersonaPage({ brandName, brandTagline, brandPrimaryColor, brandSecondaryColor, brandLogoUrl }));
  } catch (err) {
    console.error('[CreatePersona] Error:', err.message);
    res.status(500).send('Error loading create persona page');
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

    const { getMetaPersona } = require('./persona/meta-rag');
    const metaPersona = getMetaPersona();
    if (!personaManager.cache.has('meta-persona')) {
      await personaManager.createPersona({
        id: 'meta-persona',
        name: metaPersona.name,
        name_en: metaPersona.nameEn,
        name_es: metaPersona.nameEs,
        identity: metaPersona.identity,
        commands: metaPersona.commands,
        topicKeywords: metaPersona.topicKeywords,
        emotionKeywords: metaPersona.emotionKeywords,
        namePatterns: metaPersona.namePatterns,
        disclaimer: metaPersona.disclaimer,
        conversationWith: metaPersona.conversationWith,
        memoryBlock: metaPersona.memoryBlock,
        profileBlock: metaPersona.profileBlock,
        groupContext: metaPersona.groupContext,
        cjkFallback: metaPersona.cjkFallback,
        llmError: metaPersona.llmError,
        welcomeTitle: metaPersona.welcomeTitle,
        welcomeBody: metaPersona.welcomeBody,
        prayerPrompt: metaPersona.prayerPrompt,
        summaryPrompt: metaPersona.summaryPrompt,
        profileSummaryPrompt: metaPersona.profileSummaryPrompt,
        tts_voice: 'pm_alex',
        tts_lang: 'p',
        priority: 0,
      });
      console.log('  Meta-persona registered');
    }
  } catch (err) {
    console.error('Warning: Personas load failed:', err.message);
  }

  try {
    await integrations.load();
  } catch (err) {
    console.error('Warning: Integrations load failed:', err.message);
  }

  app.listen(PORT, async () => {
    const brandName = (await getSetting('brand_name')) || 'MetaPersona.AI';
    console.log(`
  ╔══════════════════════════════════════════╗
  ║  ${brandName} — http://localhost:${PORT}
  ║  /site           — Site institucional
  ║  /p/:id          — Landing page por persona
  ║  /create-persona — Criar persona
  ║  /admin          — Painel administrativo
  ║  
  ║  Meta-persona: /persona meta-persona
  ║  Skills, Tasks, Calendar, CRM, Automations
  ╚══════════════════════════════════════════╝
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