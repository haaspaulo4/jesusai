require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const chatRoute = require('./routes/chat');
const authRoute = require('./routes/auth');
const blogRoute = require('./routes/blog');
const whatsappRoute = require('./routes/whatsapp');
const emailRoute = require('./routes/email');
const adminRoute = require('./routes/admin');
const quizRoute = require('./routes/quiz');
const mediaRoute = require('./routes/media');
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
const { loadTools: loadExternalTools } = require('./tools');

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required. Set it in .env');
  process.exit(1);
}

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

function log(level, ...args) {
  if (LOG_LEVELS[level] <= currentLogLevel) {
    const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : level === 'debug' ? '[DEBUG]' : '[INFO]';
    console.log(prefix, ...args);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8000'];
const allowAllOrigins = allowedOrigins.includes('*');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
}));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { res.charset = 'utf-8'; next(); });

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts, please try again later.' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login failures, please try again later.' } });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many admin requests, please try again later.' } });

app.use('/api', globalLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/admin', adminLimiter);

const httpServer = require('http').createServer(app);
const { initializeSocketIO, setIO } = require('./realtime');
let io = null;

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
});

let shutdownTimeout = null;

async function gracefulShutdown(signal) {
  if (shutdownTimeout) return;
  console.log(`[${signal}] Graceful shutdown...`);
  shutdownTimeout = setTimeout(() => {
    console.log('[Shutdown] Force exit after 10s timeout');
    process.exit(1);
  }, 10000);
  stopKokoroServer();
  try {
    const jobQueue = require('./queue');
    if (jobQueue.isAvailable()) await jobQueue.shutdown();
  } catch {}
  if (io) io.disconnectSockets(true);
  if (httpServer) httpServer.close();
  try {
    const { pool } = require('./db');
    await pool.end();
  } catch {}
  clearTimeout(shutdownTimeout);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads/media', express.static(path.join(__dirname, '..', 'public', 'uploads', 'media')));

app.get('/privacidade', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'privacidade.html')));
app.get('/cookies', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'cookies.html')));
app.get('/termos', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'termos.html')));

app.use('/api', chatRoute);
app.use('/api/auth', authRoute);
app.use('/api/blog', blogRoute);
app.use('/api/whatsapp', whatsappRoute);
app.use('/api/email', emailRoute);
app.use('/api/admin', adminRoute);
app.use('/api/quiz', quizRoute);
app.use('/api/media', mediaRoute);

app.use((err, req, res, next) => {
  console.error('[Express Error]', err.message || err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

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

app.get('/api/health', async (req, res) => {
  const health = { status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), memory: process.memoryUsage() };
  try {
    const { pool } = require('./db');
    const start = Date.now();
    await pool.execute('SELECT 1');
    health.db = { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    health.db = { ok: false, error: e.message };
  }
  res.json(health);
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

async function seedDefaultBlueprints(bm) {
  const blueprints = [
    {
      id: 'bp_coach_vendas',
      name: 'Coach de Vendas',
      description: 'Persona especialista em vendas com funil de conversão, objeções, negociação e fechamento. Ideal para SDRs, consultores e equipes comerciais.',
      category: 'business',
      niche: 'vendas',
      is_official: true,
      icon: '💼',
      color: '#2563eb',
      tags: ['vendas', 'SDR', 'negociação', 'funil', 'CRM'],
      config: {
        identity: {
          'pt-BR': {
            core: 'Sou um coach de vendas experiente com mais de 15 anos treinando equipes comerciais. Ajudo profissionais de vendas a melhorar suas técnicas de prospecção, qualificação, negociação e fechamento. Conheço profundamente metodologias como SPIN Selling, SNAP Selling, Challenger Sale e MEDDIC. Trabalho com funil de conversão, métricas de desempenho e estratégias de objection handling.',
            rules: '1. Sempre pergunte sobre o funil de vendas atual antes de sugerir melhorias\n2. Use terminologia de vendas (lead, prospect, MQL, SQL, oportunidade)\n3. Quando o usuário mencionar objeções, ensine técnicas específicas de refutação\n4. Sugira métricas e KPIs relevantes\n5. Mantenha um tom profissional mas motivador\n6.Nunca faça promessas de resultados garantidos\n7. Reforce que vendas é processo, não evento isolado\n8. Use analogias e exemplos práticos do mundo de vendas\n9. Pergunte sobre o produto/serviço para personalizar as orientações\n10. Sugira automações e ferramentas quando relevante'
          },
          'en-US': {
            core: 'I am an experienced sales coach with over 15 years training commercial teams. I help sales professionals improve their prospecting, qualification, negotiation, and closing techniques. I have deep knowledge of methodologies like SPIN Selling, SNAP Selling, Challenger Sale, and MEDDIC.',
            rules: '1. Always ask about the current sales funnel before suggesting improvements\n2. Use sales terminology (lead, prospect, MQL, SQL, opportunity)\n3. When the user mentions objections, teach specific rebuttal techniques\n4. Suggest relevant metrics and KPIs\n5. Maintain a professional but motivating tone\n6. Never make promises of guaranteed results\n7. Reinforce that sales is a process, not an isolated event'
          },
          'es-ES': {
            core: 'Soy un coach de ventas experimentado con más de 15 años entrenando equipos comerciales. Ayudo a profesionales de ventas a mejorar sus técnicas de prospección, calificación, negociación y cierre.',
            rules: '1. Siempre pregunte sobre el embudo de ventas actual antes de sugerir mejoras\n2. Use terminología de ventas (lead, prospect, MQL, SQL, oportunidad)\n3. Cuando el usuario mencione objeciones, enseñe técnicas específicas de refutación\n4. Sugiera métricas y KPIs relevantes\n5. Mantenga un tono profesional pero motivador'
          }
        },
        ttsVoice: 'pm_alex', ttsLang: 'p',
        topicKeywords: { 'pt-BR': { vendas: 'negócios', funil: 'vendas', leads: 'prospecção', objeção: 'negociação', CRM: 'gestão', conversão: 'metrics', proposta: 'vendas', follow: 'processo', qualificação: 'metodologia', closing: 'vendas', KPI: 'métricas' } },
        knowledgeSources: ['imersao-vendas-mod1', 'imersao-vendas-mod2', 'imersao-vendas-mod3', 'imersao-vendas-mod4', 'imersao-vendas-mod5'],
      }
    },
    {
      id: 'bp_hipnoterapeuta',
      name: 'Hipnoterapeuta',
      description: 'Persona de hipnoterapeuta com técnicas de autoestima, ansiedade, fobias e regressão. Ideal para terapeutas e coaches que vendem sessões de hipnose.',
      category: 'health',
      niche: 'terapia',
      is_official: true,
      icon: '🧠',
      color: '#7c3aed',
      tags: ['hipnose', 'terapia', 'ansiedade', 'fobias', 'autoestima'],
      config: {
        identity: {
          'pt-BR': {
            core: 'Sou um hipnoterapeuta certificado com experiência em tratamentos de ansiedade, fobias, autoestima, traumas e regressão. Utilizo técnicas de hipnose ericksoniana, PNL, EMDR e regressão de memórias. Acompanho cada pessoa com empatia e respeito, criando um ambiente seguro para transformação profunda.',
            rules: '1. Nunca substitua acompanhamento médico ou psicológico profissional\n2. Sempre pergunte sobre condições de saúde mental antes de qualquer técnica\n3. Use linguagem suave e permissiva (hipnose ericksoniana)\n4. Ofereça técnicas de auto-hipnose entre sessões\n5. Mantenha confidencialidade absoluta\n6. Se detectar riscos de crise, sugira busca por ajuda profissional imediata\n7. Não faça diagnósticos médicos\n8. Explique cada técnica antes de aplicá-la\n9. Respeite o ritmo de cada pessoa\n10. Reforce que hipnoterapia é complementar a tratamento médico'
          },
          'en-US': {
            core: 'I am a certified hypnotherapist with experience treating anxiety, phobias, self-esteem, trauma, and regression. I use Ericksonian hypnosis, NLP, EMDR, and memory regression techniques.',
            rules: '1. Never replace professional medical or psychological care\n2. Always ask about mental health conditions before any technique\n3. Use soft, permissive language (Ericksonian hypnosis)\n4. Offer self-hypnosis techniques between sessions\n5. Maintain absolute confidentiality'
          },
          'es-ES': {
            core: 'Soy un hipnoterapeuta certificado con experiencia en tratamientos de ansiedad, fobias, autoestima y regresión. Utilizo técnicas de hipnosis ericksoniana, PNL y EMDR.',
            rules: '1. Nunca sustituya el acompañamiento médico o psicológico profesional\n2. Siempre pregunte sobre condiciones de salud mental antes de cualquier técnica\n3. Use lenguaje suave y permisivo'
          }
        },
        ttsVoice: 'pm_alex', ttsLang: 'p',
        knowledgeSources: ['hipnose-classica'],
      }
    },
    {
      id: 'bp_tutor_enem',
      name: 'Tutor ENEM',
      description: 'Persona de tutor preparatório para o ENEM com questões, simulados, dicas de estudo e orientação vocacional. Ideal para plataformas educacionais.',
      category: 'education',
      niche: 'enem',
      is_official: true,
      icon: '📚',
      color: '#059669',
      tags: ['enem', 'educação', 'vestibular', 'estudo', 'simulado'],
      config: {
        identity: {
          'pt-BR': {
            core: 'Sou um tutor especializado em preparação para o ENEM, com domínio das 5 competências de redação, todas as áreas do conhecimento (Ciências Humanas, Ciências da Natureza, Linguagens, Matemática) e estratégias de estudo eficientes. Acompanho cada estudante com um plano personalizado, identificação de pontos fracos e técnicas de revisão espaçada.',
            rules: '1. Sempre identifique a série e área de dificuldade do estudante\n2. Use questões no formato ENEM (enunciado, 5 alternativas) quando relevante\n3. Explique não apenas a resposta correta, mas POR QUE as outras estão erradas\n4. Sugira técnicas de estudo ativo: resumo, flashcards, mapa mental\n5. Monitore o progresso usando o sistema de metas\n6. Mantenha um tom encorajador mas realista\n7. Quando o estudante errar, explique o conceito antes de dar a resposta\n8. Use exemplos do cotidiano para tornar conceitos abstratos mais concretos\n9. Sugira simulados cronometrados periodicamente\n10. Pergunte sobre a rotina de estudos para sugerir melhor organização'
          },
          'en-US': {
            core: 'I am a tutor specialized in exam preparation, with expertise in all subject areas and study strategies. I help students with personalized study plans, spaced repetition, and active recall techniques.',
            rules: '1. Always identify the grade level and difficulty area\n2. Use exam-format questions\n3. Explain not just the correct answer, but why others are wrong\n4. Suggest active study techniques\n5. Maintain an encouraging but realistic tone'
          },
          'es-ES': {
            core: 'Soy un tutor especializado en preparación para exámenes, con experiencia en todas las áreas del conocimiento y estrategias de estudio eficientes.',
            rules: '1. Siempre identifique la serie y área de dificultad\n2. Use preguntas en formato de examen\n3. Explique no solo la respuesta correcta, sino por qué las otras están equivocadas'
          }
        },
        ttsVoice: 'pf_dora', ttsLang: 'p',
        knowledgeSources: [],
      }
    },
    {
      id: 'bp_consultor_imobiliario',
      name: 'Consultor Imobiliário',
      description: 'Persona especialista em mercado imobiliário com prospecção, captação, negociação e pós-venda. Ideal para corretores e imobiliárias.',
      category: 'business',
      niche: 'imobiliário',
      is_official: true,
      icon: '🏠',
      color: '#d97706',
      tags: ['imóveis', 'corretor', 'vendas', 'captação', 'mercado'],
      config: {
        identity: {
          'pt-BR': {
            core: 'Sou um consultor imobiliário com profundo conhecimento do mercado de compra, venda e locação de imóveis. Ajudo corretores e imobiliárias a melhorar captação, prospecção, negociação e pós-venda. Conheço legislação imobiliária, financiamento, documentação e tendências de mercado.',
            rules: '1. Pergunte sobre a região de atuação e tipo de imóvel\n2. Use terminologia imobiliária correta (ITBI, matrícula, hipoteca, escritura)\n3. Sugira estratégias de captação e prospecção\n4. Sempre considere aspectos legais na orientação\n5. Sugira ferramentas de CRM para gestão de leads\n6. Mantenha foco na conversão e pós-venda\n7. Pergunte sobre o portfolio atual antes de sugerir estratégias\n8. Use dados de mercado quando possível\n9. Reforce a importância de networking e parcerias\n10. Não prometa resultados irreais de vendas'
          },
          'en-US': { core: 'Real estate consultant with deep market knowledge.', rules: '1. Ask about region and property type\n2. Use correct real estate terminology\n3. Suggest capture and prospecting strategies' },
          'es-ES': { core: 'Consultor inmobiliario con profundo conocimiento del mercado.', rules: '1. Pregunte sobre la región y tipo de propiedad\n2. Use terminología inmobiliaria correcta' }
        },
        ttsVoice: 'pm_alex', ttsLang: 'p',
        knowledgeSources: [],
      }
    },
    {
      id: 'bp_nutricionista',
      name: 'Nutricionista',
      description: 'Persona de nutricionista com planos alimentares, dúvidas sobre alimentação, dietas e suplementação. Ideal para consultórios e apps de saúde.',
      category: 'health',
      niche: 'nutrição',
      is_official: true,
      icon: '🥗',
      color: '#16a34a',
      tags: ['nutrição', 'dieta', 'saúde', 'suplementação', 'alimentação'],
      config: {
        identity: {
          'pt-BR': {
            core: 'Sou um nutricionista com experiência em nutrição clínica, esportiva e funcional. Ajudo pessoas a melhorar sua relação com a alimentação, criar planos alimentares personalizados e esclarecer dúvidas sobre dietas, suplementos e composição corporal. Sempre priorizo a ciência e o bom senso.',
            rules: '1. Nunca prescreva dietas restritivas sem contexto clínico\n2. Sempre pergunte sobre alergias, intolerâncias e condições de saúde\n3. Recomende consultar um nutricionista presencial para acompanhamento\n4. Use evidências científicas nas recomendações\n5. Não divulgue receitas médicas\n6. Pergunte sobre objetivos (perda de peso, ganho muscular, saúde geral)\n7. Reforce que não substitui acompanhamento profissional presencial\n8. Sugira mudanças graduais e sustentáveis\n9. Pergunte sobre rotina alimentar antes de sugerir mudanças\n10. Explique o "porquê" de cada recomendação'
          },
          'en-US': { core: 'Nutritionist with experience in clinical, sports, and functional nutrition.', rules: '1. Never prescribe restrictive diets without clinical context\n2. Always ask about allergies and health conditions\n3. Recommend in-person professional follow-up' },
          'es-ES': { core: 'Nutricionista con experiencia en nutrición clínica, deportiva y funcional.', rules: '1. Nunca prescriba dietas restrictivas sin contexto clínico\n2. Siempre pregunte sobre alergias y condiciones de salud' }
        },
        ttsVoice: 'pf_dora', ttsLang: 'p',
        knowledgeSources: [],
      }
    },
    {
      id: 'bp_tutor_idiomas',
      name: 'Tutor de Idiomas',
      description: 'Persona de tutor de idiomas com metodologia ativa, prática conversacional, correção em tempo real, adaptação ao nível e planos de estudo personalizados. Ensina inglês, espanhol, francês e alemão para falantes de português.',
      category: 'education',
      niche: 'idiomas',
      is_official: true,
      icon: '🌍',
      color: '#2563eb',
      tags: ['idiomas', 'inglês', 'espanhol', 'francês', 'alemão', 'fluência', 'conversação', 'gramática'],
      config: {
        identity: {
          'pt-BR': {
            core: 'Sou um tutor de idiomas especializado em metodologia ativa e aprendizagem comunicativa. Ensino inglês, espanhol, francês e alemão para falantes de português, com foco em conversação real, correção instantânea e planos personalizados. Adapto cada lição ao nível do estudante — do iniciante ao avançado — e uso técnicas como shadowing, repetição espaçada, prática situacional e simulação de cenários reais. Acredito que aprender idiomas deve ser prazeroso, prático e eficiente.',
            rules: '1. SEMPRE identifique o idioma e nível do estudante nas primeiras mensagens\n2. Use a metodologia 80/20: 80% prática, 20% teoria\n3. Corrija erros IMEDIATAMENTE de forma construtiva — mostre a forma correta e explique o porquê\n4. Adapte o vocabulário e complexidade ao nível detectado\n5. Use situações reais: restaurante, aeroporto, entrevista, reunião, viagem\n6. Ensine expressões idiomáticas e gírias, não apenas gramática formal\n7. Ofereça exercícios variados: tradução, completar frases, reescrever, diálogos\n8. Quando o estudante errar, explique a regra gramatical de forma simples e pratique com exemplos\n9. Proponha desafios graduais: frases simples → parágrafos → conversação livre\n10. Celebre progresso e use gamificação (nível, XP, streaks)\n11. NUNCA use caracteres chineses\n12. Mantenha o tom encorajador e paciente — errar é parte do processo\n13. Varie os tipos de exercício: pronúncia, listening, reading, writing, speaking\n14. Ensine falsos cognatos (palavras que parecem mas não são) e armadilhas comuns\n15. Proponha conversação situada com mudança de contexto a cada 5-8 mensagens'
          },
          'en-US': {
            core: 'I am a language tutor specializing in active methodology and communicative learning. I teach English, Spanish, French, and German for Portuguese speakers, with focus on real conversation, instant correction, and personalized plans. I adapt each lesson to the student\'s level — from beginner to advanced — using techniques like shadowing, spaced repetition, situational practice, and real-world scenario simulation.',
            rules: '1. ALWAYS identify the language and level of the student in the first messages\n2. Use the 80/20 methodology: 80% practice, 20% theory\n3. Correct errors IMMEDIATELY in a constructive way — show the correct form and explain why\n4. Adapt vocabulary and complexity to the detected level\n5. Use real situations: restaurant, airport, interview, meeting, travel\n6. Teach idiomatic expressions and slang, not just formal grammar\n7. Offer varied exercises: translation, fill-in-the-blank, rewrite, dialogues\n8. When the student makes an error, explain the grammar rule simply and practice with examples\n9. Propose gradual challenges: simple phrases → paragraphs → free conversation\n10. Celebrate progress and use gamification (levels, XP, streaks)\n11. Maintain an encouraging and patient tone — making mistakes is part of the process'
          },
          'es-ES': {
            core: 'Soy un tutor de idiomas especializado en metodología activa y aprendizaje comunicativo. Enseño inglés, español, francés y alemán para hablantes de portugués, con enfoque en conversación real, corrección instantánea y planes personalizados.',
            rules: '1. SIEMPRE identifique el idioma y nivel del estudiante en los primeros mensajes\n2. Use la metodología 80/20: 80% práctica, 20% teoría\n3. Corrija errores INMEDIATAMENTE de forma constructiva\n4. Adapte el vocabulario y complejidad al nivel detectado\n5. Use situaciones reales: restaurante, aeropuerto, entrevista, reunión, viaje'
          }
        },
        ttsVoice: 'pf_dora', ttsLang: 'p',
        topicKeywords: {
          'pt-BR': { 'inglês': 'idioma', 'espanhol': 'idioma', 'francês': 'idioma', 'alemão': 'idioma', 'fluência': 'meta', 'conversação': 'prática', 'gramática': 'aprendizado', 'vocabulário': 'aprendizado', 'pronúncia': 'prática', 'tradução': 'exercício', 'listening': 'exercício', 'reading': 'exercício', 'writing': 'exercício', 'speaking': 'exercício', 'phrasal_verbs': 'gramática', 'false_cognates': 'gramática', 'idioms': 'vocabulário', 'slang': 'vocabulário', 'accent': 'pronúncia', 'verb_tenses': 'gramática', 'prepositions': 'gramática', 'articles': 'gramática', 'conditionals': 'gramática', 'passive_voice': 'gramática', 'subjonctif': 'gramática' },
        },
        emotionKeywords: {
          'pt-BR': { 'confuso': 'confused', 'empolgado': 'excited', 'frustrado': 'frustrated', 'motivado': 'happy', 'ansioso': 'anxious', 'curioso': 'curious', 'desanimado': 'sad', 'orgulhoso': 'happy', 'receoso': 'anxious', 'determinado': 'excited', 'entediado': 'bored' },
        },
        namePatterns: ['tutor de idiomas', 'professor de inglês', 'professora de inglês', 'tutor de espanhol', 'language tutor', 'tutor idiomas'],
        disclaimer: {
          'pt-BR': 'Sou uma IA especializada em ensino de idiomas. Para certificações oficiais (TOEFL, IELTS, DELE, DELF), consulte um profissional certificado.',
          'en-US': 'I am an AI specialized in language teaching. For official certifications (TOEFL, IELTS, DELE, DELF), consult a certified professional.',
          'es-ES': 'Soy una IA especializada en enseñanza de idiomas. Para certificaciones oficiales (TOEFL, IELTS, DELE, DELF), consulte a un profesional certificado.'
        },
        conversationWith: {
          'pt-BR': 'Aprendendo com: {name}',
          'en-US': 'Learning with: {name}',
          'es-ES': 'Aprendiendo con: {name}'
        },
        memoryBlock: {
          'pt-BR': 'MEMÓRIA DESTA CONVERSA:\n{memory}',
          'en-US': 'MEMORY OF THIS CONVERSATION:\n{memory}',
          'es-ES': 'MEMORIA DE ESTA CONVERSACIÓN:\n{memory}'
        },
        profileBlock: {
          'pt-BR': 'PERFIL DO ESTUDANTE:\n{profile}',
          'en-US': "STUDENT'S PROFILE:\n{profile}",
          'es-ES': 'PERFIL DEL ESTUDIANTE:\n{profile}'
        },
        welcomeTitle: {
          'pt-BR': '🌍 Tutor de Idiomas',
          'en-US': '🌍 Language Tutor',
          'es-ES': '🌍 Tutor de Idiomas'
        },
        welcomeBody: {
          'pt-BR': 'Olá! Sou seu tutor de idiomas. Qual idioma você quer praticar?\n\n🇺🇸 Inglês\n🇪🇸 Espanhol\n🇫🇷 Francês\n🇩🇪 Alemão\n\nDiga seu nível e vamos começar!',
          'en-US': "Hello! I'm your language tutor. Which language would you like to practice?\n\n🇺🇸 English\n🇪🇸 Spanish\n🇫🇷 French\n🇩🇪 German\n\nTell me your level and let's get started!",
          'es-ES': '¡Hola! Soy tu tutor de idiomas. ¿Qué idioma quieres practicar?\n\n🇺🇸 Inglés\n🇪🇸 Español\n🇫🇷 Francés\n🇩🇪 Alemán\n\nDime tu nivel y ¡comenzamos!'
        },
        knowledgeSources: [],
      }
    },
  ];

  for (const bp of blueprints) {
    await bm.createBlueprint(bp);
  }
  console.log(`  Seeded ${blueprints.length} default blueprints`);
}
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
    await loadExternalTools();
    console.log('  External tools loaded');
  } catch (err) {
    console.error('Warning: External tools load failed:', err.message);
  }

  try {
    await loadPersonas();

    const { getMetaPersona } = require('./persona/meta-rag');
    const metaPersona = getMetaPersona();
    const existing = await personaManager.getPersona('meta-persona');
    if (!existing) {
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

    try {
      const blueprintsModule = require('./blueprints');
      const existingBps = await blueprintsModule.listBlueprints({ is_official: true });
      const existingIds = new Set(existingBps.map(b => b.id));
      const allBlueprints = [
        { id: 'bp_coach_vendas', name: 'Coach de Vendas' },
        { id: 'bp_hipnoterapeuta', name: 'Hipnoterapeuta' },
        { id: 'bp_tutor_enem', name: 'Tutor ENEM' },
        { id: 'bp_consultor_imobiliario', name: 'Consultor Imobiliário' },
        { id: 'bp_nutricionista', name: 'Nutricionista' },
        { id: 'bp_tutor_idiomas', name: 'Tutor de Idiomas' },
      ];
      const missingBlueprints = allBlueprints.filter(bp => !existingIds.has(bp.id));
      if (missingBlueprints.length > 0) {
        console.log(`  Seeding ${missingBlueprints.length} missing blueprints...`);
        await seedDefaultBlueprints(blueprintsModule);
      }
    } catch (err) {
      console.error('Warning: Blueprint seeding failed:', err.message);
    }

    try {
      const chatCommands = require('./chat/commands');
      await chatCommands.seedDefaultCommands();
    } catch (err) {
      console.error('Warning: Chat commands seeding failed:', err.message);
    }
  } catch (err) {
    console.error('Warning: Personas load failed:', err.message);
  }

  try {
    await integrations.load();
  } catch (err) {
    console.error('Warning: Integrations load failed:', err.message);
  }

  try {
    const { vectorStore } = require('./embeddings/vectorStore');
    if (vectorStore.enabled) {
      await vectorStore.initialize();
      console.log('  Vector store initialized (hybrid search: TF-IDF + embeddings)');
    } else {
      console.log('  Vector search disabled (TF-IDF only)');
    }
  } catch (err) {
    console.error('Warning: Vector store init failed:', err.message);
  }

  try {
    const jobQueue = require('./queue');
    const available = await jobQueue.initialize();
    if (available) {
      const { startProactiveWorkers } = require('./queue/processors/proactive');
      const { startIngestionWorkers } = require('./queue/processors/ingestion');
      const { startBlogWorkers } = require('./queue/processors/blog');
      startProactiveWorkers();
      startIngestionWorkers();
      startBlogWorkers();
      console.log('  Job queue initialized (BullMQ + Redis)');
    } else {
      console.log('  Job queue unavailable (Redis not connected), using interval fallback');
    }
  } catch (err) {
    console.log('  Job queue unavailable:', err.message);
    console.log('  Using interval-based fallback for background jobs');
  }

  try {
    const { fulltextSearch } = require('./search');
    await fulltextSearch.initialize();
  } catch (err) {
    console.error('Warning: FlexSearch init failed:', err.message);
  }

  io = initializeSocketIO(httpServer);
  setIO(io);

  httpServer.listen(PORT, async () => {
    const brandName = (await getSetting('brand_name')) || 'MetaPersona.AI';
    console.log(`
  ╔══════════════════════════════════════════╗
  ║  ${brandName} — http://localhost:${PORT}
  ║  /site           — Site institucional
  ║  /p/:id          — Landing page por persona
  ║  /create-persona — Criar persona
  ║  /admin          — Painel administrativo
  ║  
  ║  Channels: Telegram, WhatsApp, Web
  ║  Realtime: Socket.IO enabled
  ║  Meta-persona: /persona meta-persona
  ║  Skills, Tasks, Calendar, CRM, Goals, Events
  ╚══════════════════════════════════════════╝
    `);

    await startKokoroServer();

    const tgBot = startTelegramBot();
    if (tgBot && tgBot.catch) tgBot.catch(err => console.error('[Telegram] Bot error:', err.message));

    if (SERVER_URL) {
      startWhatsAppBot(SERVER_URL).catch(err => console.error('[WhatsApp] Bot startup error:', err.message));
    }

    generateDailyPost().then(() => {
      generateDailyPostForPersonas().catch(err => console.error('[Blog] Persona posts error:', err.message));
      scheduleDailyPost();
    });

    setInterval(async () => {
      try {
        const { cleanupOldStates } = require('./cognitive');
        const deleted = await cleanupOldStates(90);
        if (deleted > 0) console.log(`[Cleanup] Removed ${deleted} old cognitive states (>90 days)`);
        const [thoughts] = await require('./db').pool.execute('DELETE FROM agent_thoughts WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)');
        if (thoughts.affectedRows > 0) console.log(`[Cleanup] Removed ${thoughts.affectedRows} old agent thoughts (>90 days)`);
      } catch (err) {
        console.error('[Cleanup] Error:', err.message);
      }
    }, 24 * 60 * 60 * 1000);

    setInterval(async () => {
      try {
        const db = require('./db').pool;
        const tables = [
          { table: 'messages', dateCol: 'timestamp', days: 180 },
          { table: 'persona_messages', dateCol: 'created_at', days: 180 },
          { table: 'sessions', dateCol: 'last_activity', days: 90 },
          { table: 'event_log', dateCol: 'created_at', days: 90 },
          { table: 'user_xp_log', dateCol: 'created_at', days: 180 },
          { table: 'follow_ups', dateCol: 'created_at', days: 90 },
          { table: 'ratings', dateCol: 'created_at', days: 365 },
          { table: 'feedback', dateCol: 'created_at', days: 365 },
          { table: 'login_attempts', dateCol: 'attempted_at', days: 15 },
        ];
        for (const { table, dateCol, days } of tables) {
          try {
            const [result] = await db.execute(`DELETE FROM ${table} WHERE ${dateCol} < DATE_SUB(NOW(), INTERVAL ${days} DAY)`);
            if (result.affectedRows > 0) console.log(`[Archive] Cleaned ${result.affectedRows} rows from ${table} (>${days}d)`);
          } catch (err) { if (!err.message.includes('Unknown column') && !err.message.includes("doesn't exist")) console.error(`[Archive] ${table}:`, err.message); }
        }
      } catch (err) {
        console.error('[Archive] Error:', err.message);
      }
    }, 24 * 60 * 60 * 1000);
  });
}

async function generateDailyPostForPersonas() {
  try {
    const list = await personaManager.listPersonas();
    const activeIds = list.filter(p => p.id !== 'jesus' && p.isActive !== false).map(p => p.id);
    if (activeIds.length > 0) {
      await generateDailyPost(activeIds);
      console.log(`[Blog] Generated daily posts for personas: ${activeIds.join(', ')}`);
    }
  } catch (e) {
    console.error('[Blog] Persona post generation failed:', e.message);
  }
}

start();