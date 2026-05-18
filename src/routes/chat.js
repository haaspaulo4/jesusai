require('dotenv').config();
const express = require('express');
const {
  getSession,
  addMessage,
  getHistoryForLLM,
  buildMemoryContext,
  updateSessionContext,
  generateSummary,
  saveSession,
  listSessions,
  deleteSession,
} = require('../memory/session');
const {
  getProfile,
  updateProfileFromMessage,
  buildProfileContext,
  saveProfile,
} = require('../memory/profile');
const { authMiddleware, getUser, roleMiddleware } = require('../auth');
const { pool } = require('../db');
const chatEngine = require('../chat/engine');
const { generateSessionId } = chatEngine;
const multer = require('multer');

const optionalAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.substring(7);
    const decoded = require('../auth').verifyToken(token);
    if (decoded) {
      req.userId = decoded.id;
      req.userRole = decoded.role || 'user';
    }
  }
  next();
};
const { transcribeAudio } = require('../stt');
const { t, getTranslations, getTTSLang, getSTTLang, SUPPORTED_LANGS, DEFAULT_LANG } = require('../i18n');
const { generateAudioBuffer, getAudioContentType } = require('../tts');
const surveyEngine = require('../survey');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');
const settings = require('../settings');

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();
const PIX_KEY = process.env.PIX_KEY || '';
const PIX_TYPE = process.env.PIX_TYPE || 'email';
const STRIPE_URL = process.env.STRIPE_URL || '';

router.post('/stt', authMiddleware, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const mimetype = req.file.mimetype || 'audio/webm';
    const ext = mimetype.split('/')[1] || 'webm';
    const filename = `audio.${ext}`;
    const language = getSTTLang(req.body.language || 'pt-BR');

    const text = await transcribeAudio(req.file.buffer, filename, language);

    if (!text) {
      return res.status(422).json({ error: 'Could not transcribe audio' });
    }

    res.json({ text });
  } catch (err) {
    console.error('STT error:', err.message);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

router.post('/chat', authMiddleware, async (req, res) => {
  const { message, sessionId, language, personaId } = req.body;

  if (typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a string' });
  }

  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
  }

  const lang = SUPPORTED_LANGS.includes(language) ? language : DEFAULT_LANG;
  const uid = req.userId;

  const sid = sessionId || generateSessionId();

  try {
    const result = await chatEngine.processMessage({
      message: message || '',
      sessionId: sid,
      userId: uid,
      language: lang,
      isGroup: false,
      source: 'web',
      personaId: personaId || undefined,
    });

    if (result.banned) {
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.', banned: true });
    }
    if (result.rateLimited) {
      return res.status(429).json({ error: result.response, rateLimited: true, limit: result.rateLimit?.limit, resetIn: result.rateLimit?.resetIn });
    }

    const response = {
      response: result.response,
      sessionId: result.sessionId,
      sources: result.sources,
      language: result.language,
      personaId: result.personaId,
      personaName: result.personaName,
      ttsVoice: result.ttsVoice,
      ttsLang: result.ttsLang,
    };

    if (result.onboarding !== undefined) response.onboarding = result.onboarding;
    if (result.onboardingDone !== undefined) response.onboardingDone = result.onboardingDone;
    if (result.humanOverride !== undefined) response.humanOverride = result.humanOverride;

    res.json(response);
  } catch (err) {
    console.error('Chat error:', err.stack || err.message || err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const sessions = await listSessions(userId);
    res.json(sessions);
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.json([]);
  }
});

router.get('/session/:id', authMiddleware, async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (session.userId && session.userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({
      id: session.id,
      userId: session.userId,
      userName: session.userName,
      messageCount: session.messages.length,
      topics: session.userContext?.topics || [],
      emotions: session.userContext?.emotions || [],
      summary: session.summary,
      messages: session.messages.slice(-50),
    });
  } catch (err) {
    res.status(404).json({ error: 'Session not found' });
  }
});

router.delete('/session/:id', authMiddleware, async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (session.userId && session.userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    await deleteSession(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true });
  }
});

router.post('/session', authMiddleware, async (req, res) => {
  const sid = generateSessionId();
  const session = await getSession(sid);
  session.userId = req.userId;
  await saveSession(session);
  res.json({ id: session.id, createdAt: session.createdAt });
});

router.get('/profile/:userId', authMiddleware, async (req, res) => {
  try {
    if (req.params.userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const profile = await getProfile(req.params.userId);
    res.json(profile);
  } catch (err) {
    res.json({});
  }
});

router.put('/profile/:userId', authMiddleware, async (req, res) => {
  try {
    if (req.params.userId !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const profile = await getProfile(req.params.userId);
    const { name, spiritualJourney } = req.body;

    if (name) profile.name = name;
    if (spiritualJourney) profile.spiritualJourney = spiritualJourney;

    await saveProfile(profile);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/donate', (req, res) => {
  const persona = personaManager.getActivePersona();
  const lang = SUPPORTED_LANGS.includes(req.query.lang) ? req.query.lang : DEFAULT_LANG;
  const donateVerse = persona.donateVerse?.[lang] || persona.donateVerse?.['pt-BR'] || '';
  res.json({
    pix: {
      key: PIX_KEY,
      type: PIX_TYPE,
      name: `${persona.name} - Contribuição Voluntária`,
    },
    stripe: STRIPE_URL || null,
    message: donateVerse,
  });
});

router.post('/feedback', authMiddleware, async (req, res) => {
  const { type, message, sessionId } = req.body;

  if (!type || !message) {
    return res.status(400).json({ error: 'Tipo e mensagem são obrigatórios' });
  }

  const feedback = {
    id: 'fb_' + Date.now().toString(36),
    type,
    message: message.substring(0, 2000),
    userId: req.userId,
    sessionId: sessionId || '',
  };

  try {
    await pool.execute(
      'INSERT INTO feedback (id, type, message, user_id, session_id) VALUES (?, ?, ?, ?, ?)',
      [feedback.id, feedback.type, feedback.message, feedback.userId, feedback.sessionId]
    );
  } catch (err) {
    console.error('Error saving feedback:', err);
  }

  res.json({ ok: true, id: feedback.id });
});

router.put('/settings/apikey', authMiddleware, async (req, res) => {
  const { ollamaApiKey } = req.body;

  if (!ollamaApiKey && ollamaApiKey !== '') {
    return res.status(400).json({ error: 'API key é obrigatória (envie string vazio para remover)' });
  }

  const { updateUser } = require('../auth');
  const updated = await updateUser(req.userId, { ollamaApiKey: ollamaApiKey || null });

  res.json({
    ok: true,
    hasCustomKey: !!(updated?.ollamaApiKey),
    message: ollamaApiKey ? 'API key salva. Agora você usa sua própria chave para o chat.' : 'API key removida. Usando a chave padrão do servidor.',
  });
});

router.get('/settings/apikey', authMiddleware, async (req, res) => {
  const user = await getUser(req.userId);
  res.json({
    hasCustomKey: !!(user?.ollamaApiKey),
    keyPreview: user?.ollamaApiKey ? user.ollamaApiKey.substring(0, 8) + '...' : null,
  });
});

router.get('/translations/:lang', (req, res) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  res.json(getTranslations(lang));
});

router.get('/config', async (req, res) => {
  const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
  const telegramGroupUrl = process.env.TELEGRAM_GROUP_URL || '';
  const whatsappGroupUrl = process.env.WHATSAPP_GROUP_URL || '';
  const brandName = await settings.getSetting('brand_name', '');
  const brandTagline = await settings.getSetting('brand_tagline', '');
  const brandLogoUrl = await settings.getSetting('brand_logo_url', '');
  const brandPrimaryColor = await settings.getSetting('brand_primary_color', '');
  const brandSecondaryColor = await settings.getSetting('brand_secondary_color', '');
  const onboardingEnabled = await settings.getSetting('onboarding_enabled', 'true');
  res.json({
    telegramUrl: telegramBotUsername ? `https://t.me/${telegramBotUsername}` : null,
    telegramGroupUrl: telegramGroupUrl || null,
    whatsappUrl: whatsappNumber ? `https://wa.me/${whatsappNumber}` : null,
    whatsappGroupUrl: whatsappGroupUrl || null,
    brandName,
    brandTagline,
    brandLogoUrl,
    brandPrimaryColor,
    brandSecondaryColor,
    onboardingEnabled: onboardingEnabled === 'true',
  });
});

router.get('/onboarding/steps', async (req, res) => {
  try {
    const { personaId, lang } = req.query;
    const l = lang || 'pt-BR';
    const onboarding = require('../onboarding');
    const steps = await onboarding.getOnboardingSteps(personaId || null);
    const formattedSteps = steps.map(s => onboarding.formatOnboardingStepUI(s, l));

    let status = null;
    const userId = req.userId || req.query.userId;
    if (userId) {
      status = await onboarding.getUserOnboardingStatus(userId, personaId || null);
    }

    res.json({
      steps: formattedSteps,
      status: status ? {
        progress: status.progress,
        done: status.done,
        totalSteps: status.totalSteps,
        completedSteps: status.completedSteps,
        totalAllSteps: status.totalAllSteps,
      } : null,
    });
  } catch (err) {
    console.error('[Onboarding] Steps error:', err);
    res.status(500).json({ error: 'Failed to get onboarding steps' });
  }
});

router.post('/onboarding/answer', async (req, res) => {
  try {
    const { stepKey, answer, personaId } = req.body;
    const userId = req.userId || req.body.userId;
    if (!userId || !stepKey) return res.status(400).json({ error: 'userId and stepKey required' });

    const onboarding = require('../onboarding');
    const parsedAnswer = onboarding.parseOnboardingAnswer(
      { choices: [], field_type: 'text' },
      answer
    );
    const result = await onboarding.saveOnboardingAnswer(userId, stepKey, parsedAnswer, personaId || null);

    res.json({
      ok: result.ok,
      done: result.done,
      progress: result.progress,
      totalSteps: result.totalSteps,
      completedSteps: result.completedSteps,
      nextStep: result.nextStep ? onboarding.formatOnboardingStepUI(result.nextStep, req.body.lang || 'pt-BR') : null,
    });
  } catch (err) {
    console.error('[Onboarding] Answer error:', err);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

router.get('/welcome', async (req, res) => {
  try {
    const { userId, personaId, lang } = req.query;
    const chatEngine = require('../chat/engine');
    const welcome = await chatEngine.getContextualWelcome(userId || null, personaId || null, lang || 'pt-BR');
    res.json({ welcome });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get welcome' });
  }
});

router.get('/quick-actions', async (req, res) => {
  try {
    const { personaId, userId } = req.query;
    const chatEngine = require('../chat/engine');
    const actions = await chatEngine.getQuickActions(personaId || null, userId || null);
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get quick actions' });
  }
});

router.get('/whitelabel', async (req, res) => {
  try {
    const brandName = await settings.getSetting('brand_name', '');
    const brandTagline = await settings.getSetting('brand_tagline', '');
    const brandLogoUrl = await settings.getSetting('brand_logo_url', '');
    const brandPrimaryColor = await settings.getSetting('brand_primary_color', '');
    const brandSecondaryColor = await settings.getSetting('brand_secondary_color', '');
    const onboardingEnabled = await settings.getSetting('onboarding_enabled', 'true');
    const onboardingGreeting = await settings.getSetting('onboarding_greeting', '');
    const onboardingGreetingEn = await settings.getSetting('onboarding_greeting_en', '');
    const onboardingGreetingEs = await settings.getSetting('onboarding_greeting_es', '');
    res.json({
      brandName: brandName || 'MetaPersona.AI',
      brandTagline,
      brandLogoUrl,
      brandPrimaryColor,
      brandSecondaryColor,
      onboardingEnabled: onboardingEnabled === 'true',
      onboardingGreeting,
      onboardingGreetingEn,
      onboardingGreetingEs,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.post('/tts', authMiddleware, async (req, res) => {
  const { text, lang, voice } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required' });
  }

  const ttsLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;

  const maxTtsLength = 200;
  const truncated = text.length > maxTtsLength ? text.substring(0, maxTtsLength) : text;

  try {
    const buf = await generateAudioBuffer(truncated, { lang: ttsLang, kokoroVoice: voice });
    if (!buf || buf.length === 0) {
      return res.status(500).json({ error: 'TTS generation failed' });
    }

    const contentType = getAudioContentType(buf);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) {
    console.error('[TTS] Server-side TTS error:', err.message);
    res.status(500).json({ error: 'TTS generation failed' });
  }
});

// ========== PERSONAS ==========

router.get('/personas', async (req, res) => {
  try {
    const personas = await metaRag.listAvailablePersonas();
    res.json(personas);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list personas' });
  }
});

router.post('/persona/switch', authMiddleware, async (req, res) => {
  try {
    const { personaId, sessionId } = req.body;
    const userId = req.userId || 'user_default';
    if (!personaId) return res.status(400).json({ error: 'personaId is required' });

    if (personaId === 'meta-persona' && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Meta-persona is restricted to admin users' });
    }

    const result = await metaRag.switchPersona(userId || 'user_default', sessionId, personaId);
    const persona = await personaManager.getPersona(personaId);
    res.json({
      ...result,
      welcomeTitle: persona.welcomeTitle,
      welcomeBody: persona.welcomeBody,
      // Visual Identity
      avatarUrl: persona.avatarUrl || `https://api.dicebear.com/9.x/adventurer/svg?seed=${personaId}`,
      avatarStyle: persona.avatarStyle || 'adventurer',
      palette: persona.palette || { primary: '#D4A843', secondary: '#1a1a2e' },
      emojiStyle: persona.emojiStyle || 'native',
      animationStyle: persona.animationStyle || 'subtle',
      accentColor: persona.accentColor || '#D4A843',
      fontFamily: persona.fontFamily || 'Inter',
      backgroundStyle: persona.backgroundStyle || { type: 'gradient', colors: ['#667eea', '#764ba2'] },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/persona/create', authMiddleware, async (req, res) => {
  try {
    const { description, name, lang } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    if (description.length > 2000) return res.status(400).json({ error: 'Description too long (max 2000 characters)' });
    if (name && name.length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
    const userId = req.userId;
    const userRole = req.userRole;
    if (userRole !== 'admin' && userRole !== 'premium') {
      return res.status(403).json({ error: 'Persona creation requires premium or admin role' });
    }
    const options = {};
    if (name) options.name = name;
    if (lang) options.lang = lang;
    const persona = await metaRag.createPersonaFromDescription(description, userId, options);
    res.json({
      id: persona.id,
      name: persona.name,
      nameEn: persona.nameEn,
      nameEs: persona.nameEs,
      knowledgeSources: persona.knowledgeSources,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/persona/current', optionalAuth, async (req, res) => {
  try {
    const { sessionId, userId } = req.query;
    const uid = req.userId || userId;
    const persona = await require('../chat/engine').getPersonaForContext(sessionId, userId);
    res.json({
      id: persona.id,
      name: persona.name,
      nameEn: persona.nameEn || persona.name,
      nameEs: persona.nameEs || persona.name,
      welcomeTitle: persona.welcomeTitle,
      welcomeBody: persona.welcomeBody,
      ttsVoice: persona.ttsVoice,
      ttsLang: persona.ttsLang,
      avatarUrl: persona.avatarUrl || `https://api.dicebear.com/9.x/adventurer/svg?seed=${persona.id}`,
      accentColor: persona.accentColor || '#D4A843',
      palette: persona.palette || { primary: '#D4A843', secondary: '#1a1a2e' },
      fontFamily: persona.fontFamily || 'Inter',
      avatarStyle: persona.avatarStyle || 'adventurer',
      emojiStyle: persona.emojiStyle || 'native',
      animationStyle: persona.animationStyle || 'subtle',
      backgroundStyle: persona.backgroundStyle || { type: 'gradient', colors: ['#667eea', '#764ba2'] },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get current persona' });
  }
});

router.get('/persona/:id/public', async (req, res) => {
  try {
    const persona = await personaManager.getPersona(req.params.id);
    if (!persona || !persona.isActive) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    const identityRaw = persona.identity['pt-BR'] || persona.identity;
    const identityStr = typeof identityRaw === 'string' ? identityRaw : (identityRaw.core || '');
    res.json({
      id: persona.id,
      name: persona.name,
      nameEn: persona.nameEn || persona.name,
      nameEs: persona.nameEs || persona.name,
      description: identityStr.split('.')[0],
      welcomeTitle: persona.welcomeTitle,
      welcomeBody: persona.welcomeBody,
      disclaimer: persona.disclaimer,
      ttsVoice: persona.ttsVoice,
      ttsLang: persona.ttsLang,
      avatarUrl: persona.avatarUrl || `https://api.dicebear.com/9.x/adventurer/svg?seed=${persona.id}`,
      accentColor: persona.accentColor || '#D4A843',
      palette: persona.palette || { primary: '#D4A843', secondary: '#1a1a2e' },
      fontFamily: persona.fontFamily || 'Inter',
      avatarStyle: persona.avatarStyle || 'adventurer',
      emojiStyle: persona.emojiStyle || 'native',
      animationStyle: persona.animationStyle || 'subtle',
      backgroundStyle: persona.backgroundStyle || { type: 'gradient', colors: ['#667eea', '#764ba2'] },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get persona' });
  }
});

// ========== RATINGS ==========

router.post('/rating', authMiddleware, async (req, res) => {
  try {
    const { sessionId, messageId, rating, feedback, category, source } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    await surveyEngine.createRating({
      userId: req.userId,
      sessionId,
      messageId,
      rating,
      feedback,
      category: category || 'general',
      source: source || 'web',
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save rating' });
  }
});

// ========== SURVEYS ==========

router.get('/surveys/active', authMiddleware, async (req, res) => {
  try {
    const survey = await surveyEngine.shouldTriggerSurvey(req.userId, req.query.sessionId);
    res.json(survey || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check surveys' });
  }
});

router.post('/surveys/:id/respond', authMiddleware, async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    if (!answers) return res.status(400).json({ error: 'answers is required' });

    await surveyEngine.submitSurveyResponse({
      surveyId: req.params.id,
      userId: req.userId,
      sessionId,
      answers,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit survey response' });
  }
});

// ========== FOLLOW-UPS ==========

router.get('/followups/pending', authMiddleware, async (req, res) => {
  try {
    const followUp = await surveyEngine.shouldTriggerFollowUp(req.userId, req.query.sessionId);
    res.json(followUp || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check follow-ups' });
  }
});

router.post('/followups/:id/respond', authMiddleware, async (req, res) => {
  try {
    const { response } = req.body;
    if (!response) return res.status(400).json({ error: 'response is required' });

    await surveyEngine.respondFollowUp(parseInt(req.params.id), response);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to respond to follow-up' });
  }
});

// ========== BLUEPRINTS ==========

router.get('/blueprints/categories', async (req, res) => {
  try {
    const blueprintsModule = require('../blueprints');
    const categories = await blueprintsModule.getBlueprintCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/niches', async (req, res) => {
  try {
    const blueprintsModule = require('../blueprints');
    const niches = await blueprintsModule.getBlueprintNiches(req.query.category || null);
    res.json({ niches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints', async (req, res) => {
  try {
    const blueprintsModule = require('../blueprints');
    const filters = {};
    if (req.query.category) filters.category = req.query.category;
    if (req.query.niche) filters.niche = req.query.niche;
    if (req.query.search) filters.search = req.query.search;
    filters.is_active = true;
    if (req.query.limit) filters.limit = parseInt(req.query.limit);
    const blueprints = await blueprintsModule.listBlueprints(filters);
    res.json({ blueprints: blueprints.map(b => ({
      id: b.id, name: b.name, description: b.description,
      category: b.category, niche: b.niche, is_official: b.is_official,
      tags: b.tags, icon: b.icon, color: b.color, preview: b.preview,
    })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/:id', async (req, res) => {
  try {
    const blueprintsModule = require('../blueprints');
    const blueprint = await blueprintsModule.getBlueprint(req.params.id);
    if (!blueprint || !blueprint.is_active) return res.status(404).json({ error: 'Blueprint not found' });
    res.json({
      id: blueprint.id, name: blueprint.name, description: blueprint.description,
      category: blueprint.category, niche: blueprint.niche, is_official: blueprint.is_official,
      tags: blueprint.tags, icon: blueprint.icon, color: blueprint.color, preview: blueprint.preview,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/blueprints/:id/clone', authMiddleware, async (req, res) => {
  try {
    const blueprintsModule = require('../blueprints');
    const { overrides } = req.body;
    if (req.userRole !== 'admin' && req.userRole !== 'premium') {
      return res.status(403).json({ error: 'Blueprint cloning requires premium or admin role' });
    }
    const overridesWithUser = { ...overrides || {}, owner_id: req.userId };
    const persona = await blueprintsModule.cloneBlueprint(req.params.id, overridesWithUser);
    res.json({ success: true, persona: { id: persona.id, name: persona.name } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;