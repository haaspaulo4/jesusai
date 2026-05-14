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
} = require('../memory/profile');
const { authMiddleware, getUser } = require('../auth');
const { pool } = require('../db');
const multer = require('multer');
const { transcribeAudio } = require('../stt');
const { t, getTranslations, getTTSLang, getSTTLang, SUPPORTED_LANGS, DEFAULT_LANG } = require('../i18n');
const { generateAudioBuffer, getAudioContentType } = require('../tts');
const surveyEngine = require('../survey');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');
const chatEngine = require('../chat/engine');

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();
const PIX_KEY = process.env.PIX_KEY || '';
const PIX_TYPE = process.env.PIX_TYPE || 'email';
const STRIPE_URL = process.env.STRIPE_URL || '';

router.post('/stt', upload.single('audio'), async (req, res) => {
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

router.post('/chat', async (req, res) => {
  const { message, sessionId, userId, language } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const lang = SUPPORTED_LANGS.includes(language) ? language : DEFAULT_LANG;
  const uid = userId || 'user_default';
  const sid = sessionId || 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

  try {
    const result = await chatEngine.processMessage({
      message,
      sessionId: sid,
      userId: uid,
      language: lang,
      isGroup: false,
      source: 'web',
    });

    if (result.banned) {
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.', banned: true });
    }
    if (result.rateLimited) {
      return res.status(429).json({ error: result.response, rateLimited: true, limit: result.rateLimit?.limit, resetIn: result.rateLimit?.resetIn });
    }

    res.json({
      response: result.response,
      sessionId: result.sessionId,
      sources: result.sources,
      language: result.language,
      personaId: result.personaId,
      personaName: result.personaName,
      ttsVoice: result.ttsVoice,
      ttsLang: result.ttsLang,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});
router.get('/sessions', async (req, res) => {
  try {
    const userId = req.query.userId || null;
    const sessions = await listSessions(userId);
    res.json(sessions);
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.json([]);
  }
});

router.get('/session/:id', async (req, res) => {
  try {
    const session = await getSession(req.params.id);
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

router.delete('/session/:id', async (req, res) => {
  try {
    await deleteSession(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true });
  }
});

router.post('/session', async (req, res) => {
  const { userId } = req.body || {};
  const sid = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  const session = await getSession(sid);
  if (userId) {
    session.userId = userId;
    await saveSession(session);
  }
  res.json({ id: session.id, createdAt: session.createdAt });
});

router.get('/profile/:userId', async (req, res) => {
  try {
    const profile = await getProfile(req.params.userId);
    res.json(profile);
  } catch (err) {
    res.json({});
  }
});

router.put('/profile/:userId', async (req, res) => {
  try {
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
  const persona = getActivePersona();
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

router.post('/feedback', async (req, res) => {
  const { type, message, userId, sessionId } = req.body;

  if (!type || !message) {
    return res.status(400).json({ error: 'Tipo e mensagem são obrigatórios' });
  }

  const feedback = {
    id: 'fb_' + Date.now().toString(36),
    type,
    message: message.substring(0, 2000),
    userId: userId || 'anonymous',
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

router.get('/config', (req, res) => {
  const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
  const telegramGroupUrl = process.env.TELEGRAM_GROUP_URL || '';
  const whatsappGroupUrl = process.env.WHATSAPP_GROUP_URL || '';
  res.json({
    telegramUrl: telegramBotUsername ? `https://t.me/${telegramBotUsername}` : null,
    telegramGroupUrl: telegramGroupUrl || null,
    whatsappUrl: whatsappNumber ? `https://wa.me/${whatsappNumber}` : null,
    whatsappGroupUrl: whatsappGroupUrl || null,
  });
});

router.post('/tts', async (req, res) => {
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

router.post('/persona/switch', async (req, res) => {
  try {
    const { personaId, sessionId, userId } = req.body;
    if (!personaId) return res.status(400).json({ error: 'personaId is required' });

    const result = await metaRag.switchPersona(userId || 'user_default', sessionId, personaId);
    const persona = await personaManager.getPersona(personaId);
    res.json({
      ...result,
      welcomeTitle: persona.welcomeTitle,
      welcomeBody: persona.welcomeBody,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/persona/create', async (req, res) => {
  try {
    const { description, name, lang } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    const userId = req.userId || 'anonymous';
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

router.get('/persona/current', async (req, res) => {
  try {
    const { sessionId, userId } = req.query;
    const persona = await require('../chat/engine').getPersonaForContext(sessionId, userId);
    res.json({
      id: persona.id,
      name: persona.name,
      nameEn: persona.nameEn || persona.name,
      nameEs: persona.nameEs || persona.name,
      ttsVoice: persona.ttsVoice,
      ttsLang: persona.ttsLang,
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
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get persona' });
  }
});

// ========== RATINGS ==========

router.post('/rating', async (req, res) => {
  try {
    const { userId, sessionId, messageId, rating, feedback, category, source } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    await surveyEngine.createRating({
      userId: userId || 'anonymous',
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

router.get('/surveys/active', async (req, res) => {
  try {
    const { userId } = req.query;
    const survey = userId ? await surveyEngine.shouldTriggerSurvey(userId, req.query.sessionId) : null;
    res.json(survey || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check surveys' });
  }
});

router.post('/surveys/:id/respond', async (req, res) => {
  try {
    const { userId, sessionId, answers } = req.body;
    if (!answers) return res.status(400).json({ error: 'answers is required' });

    await surveyEngine.submitSurveyResponse({
      surveyId: req.params.id,
      userId: userId || 'anonymous',
      sessionId,
      answers,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit survey response' });
  }
});

// ========== FOLLOW-UPS ==========

router.get('/followups/pending', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.json([]);

    const followUp = await surveyEngine.shouldTriggerFollowUp(userId, req.query.sessionId);
    res.json(followUp || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check follow-ups' });
  }
});

router.post('/followups/:id/respond', async (req, res) => {
  try {
    const { response } = req.body;
    if (!response) return res.status(400).json({ error: 'response is required' });

    await surveyEngine.respondFollowUp(parseInt(req.params.id), response);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to respond to follow-up' });
  }
});

module.exports = router;