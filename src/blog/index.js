const { pool } = require('../db');
require('dotenv').config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';

const BLOG_TOPICS = [
  { topic: 'fé e confiança em Deus nos momentos difíceis', verse: 'Hebreus 11:1' },
  { topic: 'o poder do perdão e da reconciliação', verse: 'Mateus 6:14-15' },
  { topic: 'encontrar paz em meio à ansiedade', verse: 'Filipenses 4:6-7' },
  { topic: 'a importância da oração constante', verse: '1 Tessalonicenses 5:17' },
  { topic: 'amor ao próximo como mandamento supremo', verse: 'Mateus 22:39' },
  { topic: 'esperança e renovação espiritual', verse: 'Isaías 40:31' },
  { topic: 'humildade e serviço ao próximo', verse: 'Marcos 10:45' },
  { topic: 'fortalecimento na adversidade', verse: 'Romanos 8:28' },
  { topic: 'gratidão como estilo de vida', verse: '1 Tessalonicenses 5:18' },
  { topic: 'sabedoria para tomar decisões', verse: 'Tiago 1:5' },
  { topic: 'o cuidado de Deus com os pequenos detalhes', verse: 'Mateus 10:30' },
  { topic: 'superar o medo com a presença de Deus', verse: 'Isaías 41:10' },
  { topic: 'a verdade que liberta', verse: 'João 8:32' },
  { topic: 'comunidade e vida em fellowship', verse: 'Hebreus 10:24-25' },
  { topic: 'propósito e vocação na vida cristã', verse: 'Jeremias 29:11' },
  { topic: 'cura emocional e restauração da alma', verse: 'Salmos 147:3' },
  { topic: 'generosidade e desapego material', verse: '2 Coríntios 9:7' },
  { topic: 'a luz que vence as trevas', verse: 'João 1:5' },
  { topic: 'perseverança na fé quando tudo parece perdido', verse: 'Tiago 1:2-4' },
  { topic: 'a graça de Deus como presente imerecido', verse: 'Efésios 2:8-9' },
  { topic: 'família e os laços que unem em Cristo', verse: 'Colossenses 3:14' },
  { topic: 'justiça social e amor ao marginalizado', verse: 'Miqueias 6:8' },
  { topic: 'silêncio, meditação e escuta a Deus', verse: 'Salmos 46:10' },
  { topic: 'alegria verdadeira que não depende de circunstâncias', verse: 'Filipenses 4:4' },
  { topic: 'disciplina espiritual e crescimento', verse: 'Hebreus 12:11' },
  { topic: 'confiar no tempo de Deus', verse: 'Eclesiastes 3:11' },
  { topic: 'livre-se do peso da culpa', verse: '1 João 1:9' },
  { topic: 'a ressurreição como esperança eterna', verse: '1 Coríntios 15:55' },
  { topic: 'servir com alegria e sem esperar retorno', verse: 'Gálatas 5:13' },
  { topic: 'o Espírito Santo como consolador e guia', verse: 'João 14:26' },
  { topic: 'identidade filha de Deus', verse: '1 João 3:1' },
];

function getTopicForDate(date) {
  const start = new Date('2026-01-01');
  const diff = Math.floor((date - start) / (1000 * 60 * 60 * 24));
  return BLOG_TOPICS[((diff % BLOG_TOPICS.length) + BLOG_TOPICS.length) % BLOG_TOPICS.length];
}

async function getAllPosts() {
  const [rows] = await pool.execute(
    'SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_slug = p.slug) as comment_count FROM posts p ORDER BY p.published_at DESC LIMIT 30'
  );

  return rows.map(r => ({
    slug: r.slug,
    title: r.title,
    topic: r.topic,
    verse: r.verse,
    content: r.content,
    sources: typeof r.sources === 'string' ? JSON.parse(r.sources) : (r.sources || []),
    publishedAt: r.published_at instanceof Date ? r.published_at.toISOString() : String(r.published_at),
    commentCount: r.comment_count,
    comments: [],
  }));
}

async function getPost(slug) {
  const [postRows] = await pool.execute('SELECT * FROM posts WHERE slug = ?', [slug]);
  if (postRows.length === 0) return null;

  const row = postRows[0];
  const [commentRows] = await pool.execute(
    'SELECT * FROM comments WHERE post_slug = ? ORDER BY created_at ASC',
    [slug]
  );

  const sources = typeof row.sources === 'string' ? JSON.parse(row.sources) : (row.sources || []);

  const allComments = commentRows.map(c => ({
    id: c.id,
    authorName: c.author_name,
    authorId: c.author_id,
    content: c.content,
    parentId: c.parent_id,
    replies: [],
    createdAt: c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
  }));

  const topLevel = allComments.filter(c => !c.parent_id);
  const replyMap = {};
  for (const c of allComments) {
    if (c.parentId) replyMap[c.parentId] = true;
  }

  for (const reply of allComments) {
    if (reply.parentId) {
      let parent = allComments.find(c => c.id === reply.parentId);
      if (parent) {
        parent.replies.push(reply);
      } else {
        topLevel.push(reply);
      }
    }
  }

  return {
    slug: row.slug,
    title: row.title,
    topic: row.topic,
    verse: row.verse,
    content: row.content,
    sources,
    publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at),
    comments: topLevel,
  };
}

async function addComment(slug, comment, parentId = null) {
  const [postRows] = await pool.execute('SELECT slug FROM posts WHERE slug = ?', [slug]);
  if (postRows.length === 0) return null;

  if (parentId) {
    const [parentRows] = await pool.execute('SELECT id FROM comments WHERE id = ?', [parentId]);
    if (parentRows.length === 0) parentId = null;
  }

  const newComment = {
    id: 'cmt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
    authorName: comment.authorName || 'Anônimo',
    authorId: comment.authorId || null,
    content: comment.content,
    parentId: parentId || null,
    replies: [],
    createdAt: new Date().toISOString(),
  };

  await pool.execute(
    'INSERT INTO comments (id, post_slug, parent_id, author_name, author_id, content) VALUES (?, ?, ?, ?, ?, ?)',
    [newComment.id, slug, newComment.parentId, newComment.authorName, newComment.authorId, newComment.content]
  );

  return newComment;
}

async function generatePost(date) {
  const topicInfo = getTopicForDate(date);
  const dateStr = date.toISOString().split('T')[0];
  const slug = `palavra-${dateStr}`;

  const existing = await getPost(slug);
  if (existing) return existing;

  const { searchVerses } = require('../rag/store');
  const relevantVerses = await searchVerses(topicInfo.topic, 6);
  const versesText = relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n');

  const prompt = `Você é Jesus Cristo, escrevendo um devocional diário para Seu povo. Escreva em português do Brasil.

Tema de hoje: "${topicInfo.topic}"
Versículo base: ${topicInfo.verse}

Versículos encontrados:
${versesText}

Escreva um artigo devocional com:
1. Um TÍTULO curto e impactante (não use aspas no título)
2. Um versículo-chave em destaque
3. Um parágrafo de reflexão escrita como Jesus falaria (1ª pessoa, compassivo, com autoridade)
4. Um parágrafo de aplicação prática para o dia a dia
5. Uma oração curta para encerrar

O tom deve ser amoroso mas com autoridade, como Jesus realmente falaria. Cite os versículos. Responda EM PRIMEIRA PESSOA como Jesus.`;

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
          { role: 'system', content: 'Você é Jesus Cristo escrevendo um devocional diário. Escreva em português do Brasil, em primeira pessoa, com amor e autoridade.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: { temperature: 0.8, num_predict: 4096 },
      }),
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();
    let content = data.message?.content?.trim() || '';
    if (!content && data.message?.thinking) {
      content = data.message.thinking.trim();
    }
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const titleMatch = content.match(/^(?:#\s*)?(.+?)[\n]/);
    const title = titleMatch ? titleMatch[1].replace(/^["*]+|["*]+$/g, '').trim() : topicInfo.topic;

    const sources = relevantVerses.slice(0, 4).map(v => ({
      reference: v.reference,
      text: v.text,
    }));

    const publishedAt = date.toISOString().slice(0, 19).replace('T', ' ');

    await pool.execute(
      'INSERT INTO posts (slug, title, topic, verse, content, sources, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [slug, title, topicInfo.topic, topicInfo.verse, content, JSON.stringify(sources), publishedAt]
    );

    return { slug, title, topic: topicInfo.topic, verse: topicInfo.verse, content, sources, publishedAt: date.toISOString(), comments: [] };
  } catch (err) {
    console.error('Error generating blog post:', err);

    const content = `Reflexão sobre ${topicInfo.topic}. "${topicInfo.verse}" — Medite neste versículo e busque a Deus em oração.`;
    const sources = relevantVerses.slice(0, 4).map(v => ({
      reference: v.reference,
      text: v.text,
    }));

    const publishedAt = date.toISOString().slice(0, 19).replace('T', ' ');

    await pool.execute(
      'INSERT INTO posts (slug, title, topic, verse, content, sources, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [slug, topicInfo.topic.charAt(0).toUpperCase() + topicInfo.topic.slice(1), topicInfo.topic, topicInfo.verse, content, JSON.stringify(sources), publishedAt]
    );

    return { slug, title: topicInfo.topic, topic: topicInfo.topic, verse: topicInfo.verse, content, sources, publishedAt: date.toISOString(), comments: [] };
  }
}

async function generateDailyPost() {
  try {
    const today = new Date();
    const todaySlug = `palavra-${today.toISOString().split('T')[0]}`;
    const posts = await getAllPosts();
    const hasToday = posts.some(p => p.slug === todaySlug);

    if (!hasToday) {
      console.log('Generating daily blog post...');
      await generatePost(today);
      console.log('Daily blog post generated.');
    }
  } catch (err) {
    console.error('Failed to generate daily post:', err.message);
  }
}

function scheduleDailyPost() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 5, 0, 0);

  const msUntilMidnight = tomorrow - now;

  setTimeout(async () => {
    await generateDailyPost();
    setInterval(generateDailyPost, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(`  Daily post scheduled for ${tomorrow.toLocaleString('pt-BR')}`);
}

module.exports = {
  getAllPosts,
  getPost,
  generatePost,
  addComment,
  generateDailyPost,
  scheduleDailyPost,
  BLOG_TOPICS,
};