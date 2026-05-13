const { pool } = require('../db');

function createSession(sessionId) {
  const session = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    messages: [],
    summary: '',
    userName: null,
    userContext: {},
  };

  return pool.execute(
    'INSERT INTO sessions (id, user_name, user_context, summary) VALUES (?, ?, ?, ?)',
    [sessionId, null, JSON.stringify({}), '']
  ).then(() => session);
}

async function getSession(sessionId) {
  if (!sessionId) {
    const id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    return createSession(id).then(() => getSession(id));
  }

  const [rows] = await pool.execute('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (rows.length === 0) {
    await createSession(sessionId);
    const [newRows] = await pool.execute('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    return rowToSession(newRows[0]);
  }

  const [msgRows] = await pool.execute(
    'SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
    [sessionId]
  );

  const session = rowToSession(rows[0]);
  session.messages = msgRows.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));
  return session;
}

function rowToSession(row) {
  let userContext = {};
  try {
    userContext = typeof row.user_context === 'string' ? JSON.parse(row.user_context) : (row.user_context || {});
  } catch {}
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userContext,
    summary: row.summary || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
    lastActivity: row.last_activity instanceof Date ? row.last_activity.toISOString() : String(row.last_activity || ''),
    messages: [],
  };
}

async function saveSession(session) {
  const userContext = typeof session.userContext === 'string' ? session.userContext : JSON.stringify(session.userContext || {});
  await pool.execute(
    'UPDATE sessions SET user_name = ?, user_context = ?, summary = ?, user_id = ? WHERE id = ?',
    [session.userName || null, userContext, session.summary || '', session.userId || null, session.id]
  );
}

async function addMessage(sessionId, role, content) {
  let session;
  if (typeof sessionId === 'object' && sessionId.id) {
    session = sessionId;
    sessionId = session.id;
  } else {
    session = await getSession(sessionId);
  }

  await pool.execute(
    'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
    [sessionId, role, content]
  );

  const [countRows] = await pool.execute(
    'SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?',
    [sessionId]
  );
  const total = countRows[0].cnt;

  if (total > 200) {
    const offset = total - 150;
    await pool.execute(
      `DELETE m FROM messages m INNER JOIN (SELECT id FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ${Number(offset)}) del ON m.id = del.id`,
      [sessionId]
    );
  }

  await pool.execute('UPDATE sessions SET last_activity = NOW() WHERE id = ?', [sessionId]);
  return session;
}

async function getRecentMessages(sessionId, limit = 20) {
  const [rows] = await pool.execute(
    `SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ${Number(limit)}`,
    [sessionId]
  );
  return rows.reverse().map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));
}

async function getHistoryForLLM(sessionId, limit = 10) {
  const messages = await getRecentMessages(sessionId, limit);
  return messages.map(m => ({ role: m.role, content: m.content }));
}

async function buildMemoryContext(sessionId) {
  const session = await getSession(sessionId);
  const parts = [];

  if (session.userName) {
    parts.push(`O nome da pessoa é ${session.userName}.`);
  }

  const userContext = session.userContext || {};
  if (userContext.topics && userContext.topics.length > 0) {
    parts.push(`Temas que essa pessoa tem perguntado sobre: ${userContext.topics.join(', ')}.`);
  }
  if (userContext.emotions && userContext.emotions.length > 0) {
    parts.push(`Estado emocional percebido: ${userContext.emotions.join(', ')}.`);
  }
  if (session.summary) {
    parts.push(`Resumo da conversa até agora: ${session.summary}`);
  }

  return parts.join(' ');
}

function extractContextFromMessage(message) {
  const context = { topics: [], emotions: [], name: null };

  const topicKeywords = {
    amor: 'amor', perdão: 'perdão', fé: 'fé', esperança: 'esperança',
    sofrimento: 'sofrimento', família: 'família', trabalho: 'trabalho',
    pecado: 'pecado', salvação: 'salvação', oração: 'oração',
    cura: 'cura', solidão: 'solidão', ansiedade: 'ansiedade',
    morte: 'morte', dinheiro: 'dinheiro', casamento: 'casamento',
    propósito: 'propósito', obediência: 'obediência', templo: 'templo',
    discípulo: 'discípulo', reino: 'reino', graça: 'graça',
    verdade: 'verdade', justiça: 'justiça', paz: 'paz',
    medo: 'medo', dúvida: 'dúvida', tristeza: 'tristeza',
    alegria: 'alegria', gratidão: 'gratidão', tentação: 'tentação',
  };

  const emotionKeywords = {
    'triste': 'tristeza', 'chorando': 'tristeza', 'sofredor': 'sofrimento',
    'ansioso': 'ansiedade', 'com medo': 'medo', 'perdido': 'perdido',
    'desesperado': 'desespero', 'solitário': 'solidão', 'sozinho': 'solidão',
    'grato': 'gratidão', 'alegre': 'alegria', 'feliz': 'alegria',
    'confuso': 'confusão', 'com dúvida': 'dúvida', 'em crise': 'crise',
    'doente': 'doença', 'enfermo': 'doença', 'procurando': 'busca',
  };

  const lowerMsg = message.toLowerCase();

  for (const [keyword, topic] of Object.entries(topicKeywords)) {
    if (lowerMsg.includes(keyword)) context.topics.push(topic);
  }
  for (const [keyword, emotion] of Object.entries(emotionKeywords)) {
    if (lowerMsg.includes(keyword)) context.emotions.push(emotion);
  }

  const namePatterns = [
    /meu nome[,\s]+(?:é|e)\s+(.+?)(?:\.|,|!|\?|$)/i,
    /me chamo\s+(.+?)(?:\.|,|!|\?|$)/i,
    /eu sou o\s+(.+?)(?:\.|,|!|\?|$)/i,
    /eu sou a\s+(.+?)(?:\.|,|!|\?|$)/i,
    /sou o\s+(.+?)(?:\.|,|!|\?|$)/i,
    /sou a\s+(.+?)(?:\.|,|!|\?|$)/i,
    /me chame de\s+(.+?)(?:\.|,|!|\?|$)/i,
    /meu nome é\s+(\S+)/i,
    /me chamo\s+(\S+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      context.name = match[1].trim().replace(/\s+/g, ' ');
      if (context.name.length > 40) context.name = context.name.split(' ').slice(0, 4).join(' ');
      break;
    }
  }

  return context;
}

async function updateSessionContext(sessionId, newContext) {
  const session = await getSession(sessionId);

  if (newContext.name) {
    session.userName = newContext.name;
  }

  if (!session.userContext.topics) session.userContext.topics = [];
  if (!session.userContext.emotions) session.userContext.emotions = [];

  for (const topic of newContext.topics) {
    if (!session.userContext.topics.includes(topic)) {
      session.userContext.topics.push(topic);
    }
  }
  if (session.userContext.topics.length > 15) {
    session.userContext.topics = session.userContext.topics.slice(-15);
  }

  for (const emotion of newContext.emotions) {
    if (!session.userContext.emotions.includes(emotion)) {
      session.userContext.emotions.push(emotion);
    }
  }
  if (session.userContext.emotions.length > 10) {
    session.userContext.emotions = session.userContext.emotions.slice(-10);
  }

  await saveSession(session);
  return session;
}

async function generateSummary(sessionId) {
  const session = await getSession(sessionId);
  if (session.messages.length < 6) return session.summary;

  const recentMessages = session.messages.slice(-20);
  const conversationText = recentMessages
    .map(m => `${m.role === 'user' ? 'Pessoa' : 'Jesus'}: ${m.content}`)
    .join('\n');

  const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
  const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
  const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: 'Resuma em 2-3 frases esta conversa entre uma pessoa e Jesus, incluindo temas abordados, estado emocional da pessoa e o que Jesus destacou. Seja conciso e em português.' },
          { role: 'user', content: conversationText },
        ],
        stream: false,
        options: { temperature: 0.3 },
      }),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    session.summary = data.message?.content?.trim() || session.summary;
    await saveSession(session);
    return session.summary;
  } catch {
    return session.summary;
  }
}

async function listSessions(userId) {
  let query = 'SELECT s.id, s.user_name, s.summary, s.last_activity, s.user_id, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count, (SELECT m2.content FROM messages m2 WHERE m2.session_id = s.id ORDER BY m2.timestamp ASC LIMIT 1) as first_message FROM sessions s';
  const params = [];
  if (userId) {
    query += ' WHERE s.user_id = ? OR s.user_id IS NULL';
    params.push(userId);
  }
  query += ' ORDER BY s.last_activity DESC';

  const [rows] = await pool.execute(query, params);
  return rows.map(r => ({
    id: r.id,
    userName: r.user_name,
    messageCount: r.message_count,
    lastActivity: r.last_activity instanceof Date ? r.last_activity.toISOString() : String(r.last_activity),
    summary: r.summary || '',
    firstMessage: r.first_message ? r.first_message.substring(0, 60) : '',
    userId: r.user_id,
  }));
}

async function deleteSession(sessionId) {
  await pool.execute('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

module.exports = {
  createSession,
  getSession,
  saveSession,
  addMessage,
  getRecentMessages,
  getHistoryForLLM,
  buildMemoryContext,
  extractContextFromMessage,
  updateSessionContext,
  generateSummary,
  listSessions,
  deleteSession,
};