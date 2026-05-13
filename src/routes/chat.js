require('dotenv').config();
const express = require('express');
const { searchVerses } = require('../rag/store');
const { IDENTITY, CONTEXT_BLOCK, MEMORY_BLOCK } = require('../system-prompt');
const {
  getSession,
  addMessage,
  getHistoryForLLM,
  buildMemoryContext,
  extractContextFromMessage,
  updateSessionContext,
  generateSummary,
  saveSession,
  listSessions,
  deleteSession,
} = require('../memory/session');
const {
  getProfile,
  saveProfile,
  updateProfileFromMessage,
  buildProfileContext,
  generateProfileSummary,
} = require('../memory/profile');
const { authMiddleware, getUser } = require('../auth');
const { pool } = require('../db');
const multer = require('multer');
const { transcribeAudio } = require('../stt');
const { t, getTranslations, getTTSLang, getSTTLang, SUPPORTED_LANGS, DEFAULT_LANG } = require('../i18n');

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

const DEFAULT_OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const DEFAULT_OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';
const PIX_KEY = process.env.PIX_KEY || '';
const PIX_TYPE = process.env.PIX_TYPE || 'email';
const STRIPE_URL = process.env.STRIPE_URL || '';

async function getUserApiKey(userId) {
  const user = await getUser(userId);
  return user?.ollamaApiKey || null;
}

function getApiConfig(userId) {
  const userKey = null;
  if (userKey) {
    return { baseUrl: DEFAULT_OLLAMA_BASE_URL, apiKey: userKey };
  }
  return { baseUrl: DEFAULT_OLLAMA_BASE_URL, apiKey: DEFAULT_OLLAMA_API_KEY };
}

async function ollamaChatStream(messages, userId) {
  let apiKey = DEFAULT_OLLAMA_API_KEY;
  if (userId) {
    const key = await getUserApiKey(userId);
    if (key) apiKey = key;
  }

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${DEFAULT_OLLAMA_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          stream: true,
          options: { temperature: 0.7, num_predict: 4096 },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`API error ${response.status}: ${errText}`);
        if (response.status >= 500 && attempt < maxRetries) {
          console.warn(`Attempt ${attempt + 1} failed, retrying...`, lastError.message);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }

      return response;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        lastError = new Error('Tempo esgotado. O servidor demorou muito para responder.');
      }
      if (attempt < maxRetries) {
        console.warn(`Attempt ${attempt + 1} failed, retrying...`, err.message);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError;
}

async function* parseOllamaStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const data = JSON.parse(trimmed);
        if (data.done) return;
        if (data.message && data.message.content) {
          yield data.message.content;
        }
      } catch {
        continue;
      }
    }
  }
}

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
    await updateProfileFromMessage(uid, message);

    const userContext = extractContextFromMessage(message);
    await updateSessionContext(sid, userContext);

    const relevantVerses = searchVerses(message, 8);

    const contextStr = relevantVerses
      .map(v => `${v.reference}: "${v.text}"`)
      .join('\n');

    const memoryStr = await buildMemoryContext(sid);
    const profileStr = await buildProfileContext(uid);

    let systemPrompt = t('identityPrompt', lang);

    if (contextStr) {
      systemPrompt += t('contextBlock', lang).replace('{context}', contextStr);
    }

    if (memoryStr) {
      systemPrompt += t('memoryBlock', lang).replace('{memory}', memoryStr);
    }

    if (profileStr) {
      systemPrompt += t('profileBlock', lang).replace('{profile}', profileStr);
    }

    const session = await getSession(sid);
    const userName = session.userName || session.userContext?.name;

    if (userName) {
      systemPrompt += '\n\n' + t('conversationWith', lang).replace('{name}', userName);
    }

    const history = await getHistoryForLLM(sid, 10);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    await addMessage(sid, 'user', message);

    if (uid && userId) {
      session.userId = uid;
      await saveSession(session);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', sid);

    const ollamaResponse = await ollamaChatStream(messages, uid);

    let fullResponse = '';
    for await (const chunk of parseOllamaStream(ollamaResponse)) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(fullResponse);
    if (hasCJK) {
      console.warn('Response contains CJK characters, discarding');
      fullResponse = t('cjkFallback', lang);
      res.write(`data: ${JSON.stringify({ content: '\n' + fullResponse })}\n\n`);
    }

    await addMessage(sid, 'assistant', fullResponse);

    const updatedSession = await getSession(sid);
    if (updatedSession.messages.length % 10 === 0) {
      generateSummary(sid).catch(() => {});
    }

    updateProfileFromMessage(uid, fullResponse);

    if (updatedSession.messages.length % 15 === 0) {
      generateProfileSummary(uid).catch(() => {});
    }

    const sources = relevantVerses.slice(0, 4).map(v => ({
      reference: v.reference,
      text: v.text.substring(0, 120) + (v.text.length > 120 ? '...' : ''),
    }));

    res.write(`data: ${JSON.stringify({ sources, sessionId: sid, language: lang, done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate response' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
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
  res.json({
    pix: {
      key: PIX_KEY,
      type: PIX_TYPE,
      name: 'Jesus.AI - Contribuição Voluntária',
    },
    stripe: STRIPE_URL || null,
    message: '"Cada um dê conforme decidiu em seu coração, não com tristeza ou por obrigação, pois Deus ama quem dá com alegria." — 2 Coríntios 9:7',
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

module.exports = router;