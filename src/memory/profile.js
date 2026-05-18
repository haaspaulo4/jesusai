const { pool } = require('../db');

async function createProfile(userId) {
  const profile = {
    id: userId,
    createdAt: new Date().toISOString(),
    name: null,
    story: '',
    topics: [],
    emotions: [],
    spiritualJourney: '',
    prayerRequests: [],
    lastUpdate: new Date().toISOString(),
  };

  await pool.execute(
    'INSERT INTO profiles (id, name, story, topics, emotions, spiritual_journey, prayer_requests) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, null, '', JSON.stringify([]), JSON.stringify([]), '', JSON.stringify([])]
  );

  return profile;
}

async function getProfile(userId) {
  const [rows] = await pool.execute('SELECT * FROM profiles WHERE id = ?', [userId]);
  if (rows.length === 0) {
    return createProfile(userId);
  }
  return rowToProfile(rows[0]);
}

function rowToProfile(row) {
  let topics = [], emotions = [], prayerRequests = [];
  try {
    topics = typeof row.topics === 'string' ? JSON.parse(row.topics) : (row.topics || []);
  } catch {}
  try {
    emotions = typeof row.emotions === 'string' ? JSON.parse(row.emotions) : (row.emotions || []);
  } catch {}
  try {
    prayerRequests = typeof row.prayer_requests === 'string' ? JSON.parse(row.prayer_requests) : (row.prayer_requests || []);
  } catch {}
  return {
    id: row.id,
    name: row.name,
    story: row.story || '',
    topics,
    emotions,
    spiritualJourney: row.spiritual_journey || '',
    prayerRequests,
    lastUpdate: row.last_update instanceof Date ? row.last_update.toISOString() : String(row.last_update || ''),
  };
}

async function saveProfile(profile) {
  const topics = typeof profile.topics === 'string' ? profile.topics : JSON.stringify(profile.topics || []);
  const emotions = typeof profile.emotions === 'string' ? profile.emotions : JSON.stringify(profile.emotions || []);
  const prayerRequests = typeof profile.prayerRequests === 'string' ? profile.prayerRequests : JSON.stringify(profile.prayerRequests || []);

  await pool.execute(
    'INSERT INTO profiles (id, name, story, topics, emotions, spiritual_journey, prayer_requests) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), story=VALUES(story), topics=VALUES(topics), emotions=VALUES(emotions), spiritual_journey=VALUES(spiritual_journey), prayer_requests=VALUES(prayer_requests)',
    [profile.id, profile.name || null, profile.story || '', topics, emotions, profile.spiritualJourney || '', prayerRequests]
  );

  return profile;
}

async function updateProfileFromMessage(userId, message) {
  const profile = await getProfile(userId);

  const namePatterns = [
    /meu nome[,\s]+(?:é|e)\s+(.+?)(?:\.|,|!|\?|$)/i,
    /me chamo\s+(.+?)(?:\.|,|!|\?|$)/i,
    /eu sou o\s+(.+?)(?:\.|,|!|\?|$)/i,
    /eu sou a\s+(.+?)(?:\.|,|!|\?|$)/i,
    /sou o\s+(.+?)(?:\.|,|!|\?|$)/i,
    /sou a\s+(.+?)(?:\.|,|!|\?|$)/i,
    /me chame de\s+(.+?)(?:\.|,|!|\?|$)/i,
    /pode me chamar de\s+(.+?)(?:\.|,|!|\?|$)/i,
  ];

  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      let name = match[1].trim().replace(/\s+/g, ' ');
      if (name.length > 40) name = name.split(' ').slice(0, 4).join(' ');
      profile.name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      break;
    }
  }

  const topicKeywords = {
    amor: 'amor', perdão: 'perdão', fé: 'fé', esperança: 'esperança',
    sofrimento: 'sofrimento', família: 'família', trabalho: 'trabalho',
    pecado: 'pecado', salvação: 'salvação', oração: 'oração',
    cura: 'cura', solidão: 'solidão', ansiedade: 'ansiedade',
    morte: 'morte', dinheiro: 'dinheiro', casamento: 'casamento',
    propósito: 'propósito', obediência: 'obediência', discípulo: 'discípulo',
    reino: 'reino', graça: 'graça', verdade: 'verdade', justiça: 'justiça',
    paz: 'paz', medo: 'medo', dúvida: 'dúvida', tristeza: 'tristeza',
    alegria: 'alegria', gratidão: 'gratidão', tentação: 'tentação',
    saúde: 'saúde', doença: 'doença', emprego: 'emprego', estudo: 'estudo',
    filhos: 'filhos', mãe: 'família', pai: 'família', casal: 'casamento',
    divórcio: 'casamento', depressão: 'depressão', vício: 'vício',
    abandono: 'abandono', injustiça: 'injustiça', perdão: 'perdão',
    igreja: 'igreja', biblia: 'bíblia', biblia: 'bíblia',
  };

  const emotionKeywords = {
    'triste': 'tristeza', 'chorando': 'tristeza', 'sofredor': 'sofrimento',
    'ansioso': 'ansiedade', 'com medo': 'medo', 'perdido': 'perdido',
    'desesperado': 'desespero', 'solitário': 'solidão', 'sozinho': 'solidão',
    'grato': 'gratidão', 'alegre': 'alegria', 'feliz': 'alegria',
    'confuso': 'confusão', 'com dúvida': 'dúvida', 'em crise': 'crise',
    'doente': 'doença', 'enfermo': 'doença', 'procurando': 'busca',
    'angustiado': 'angústia', 'abatido': 'abatimento', 'cansado': 'cansaço',
  };

  const lowerMsg = message.toLowerCase();

  if (!profile.topics) profile.topics = [];
  for (const [keyword, topic] of Object.entries(topicKeywords)) {
    if (lowerMsg.includes(keyword) && !profile.topics.includes(topic)) {
      profile.topics.push(topic);
    }
  }
  if (profile.topics.length > 20) {
    profile.topics = profile.topics.slice(-20);
  }

  if (!profile.emotions) profile.emotions = [];
  for (const [keyword, emotion] of Object.entries(emotionKeywords)) {
    if (lowerMsg.includes(keyword) && !profile.emotions.includes(emotion)) {
      profile.emotions.push(emotion);
    }
  }
  if (profile.emotions.length > 15) {
    profile.emotions = profile.emotions.slice(-15);
  }

  await saveProfile(profile);
  return profile;
}

async function buildProfileContext(userId) {
  const profile = await getProfile(userId);
  const parts = [];

  if (profile.name) {
    parts.push(`O nome desta pessoa é ${profile.name}.`);
  }
  if (profile.topics && profile.topics.length > 0) {
    parts.push(`Temas que esta pessoa costuma abordar: ${profile.topics.join(', ')}.`);
  }
  if (profile.emotions && profile.emotions.length > 0) {
    parts.push(`Estados emocionais que esta pessoa já expressou: ${profile.emotions.join(', ')}.`);
  }
  if (profile.spiritualJourney) {
    parts.push(`Percurso espiritual: ${profile.spiritualJourney}`);
  }
  if (profile.story) {
    parts.push(`O que sei sobre esta pessoa: ${profile.story}`);
  }

  return parts.join(' ');
}

async function generateProfileSummary(userId) {
  const profile = await getProfile(userId);
  if (!profile.topics || profile.topics.length === 0) return profile;

  const integrations = require('../llm/integrationManager');

  try {
    const result = await integrations.callLLM([
      { role: 'system', content: 'Você é um assistente que resume perfis de usuários. Com base nas informações fornecidas, crie um breve resumo (2-3 frases) sobre quem é essa pessoa, sua jornada espiritual e o que ela busca. Em português.' },
      { role: 'user', content: `Nome: ${profile.name || 'Não informado'}\nTemas: ${profile.topics.join(', ')}\nEmoções: ${profile.emotions.join(', ')}\nJornada espiritual anterior: ${profile.spiritualJourney || 'Não informada'}\nHistórico: ${profile.story || 'Nenhum'}` },
    ], { temperature: 0.3, numPredict: 512, stream: false });

    const summary = result?.message?.content || result?.content || result?.choices?.[0]?.message?.content;
    if (summary) {
      profile.story = summary.trim();
      await saveProfile(profile);
    }
  } catch {}

  return profile;
}

module.exports = {
  getProfile,
  saveProfile,
  updateProfileFromMessage,
  buildProfileContext,
  generateProfileSummary,
};