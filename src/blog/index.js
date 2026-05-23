const { pool } = require('../db');
const { getSetting } = require('../settings');
const personaManager = require('../persona/manager');
const businessModule = require('../business');
const integrations = require('../llm/integrationManager');

require('dotenv').config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';

const BLOG_TOPICS = [
  { topic: 'como manter o foco e a motivação no dia a dia', category: 'produtividade' },
  { topic: 'a importância de cuidar da saúde mental', category: 'bem-estar' },
  { topic: 'dicas para melhorar seus relacionamentos', category: 'relacionamentos' },
  { topic: 'como desenvolver inteligência emocional', category: 'desenvolvimento' },
  { topic: 'aprendendo a lidar com Mudanças e incertezas', category: 'resiliência' },
  { topic: 'hábitos simples que transformam sua rotina', category: 'produtividade' },
  { topic: 'como construir confiança e autenticidade', category: 'liderança' },
  { topic: 'encontrando propósito e Significado na vida', category: 'desenvolvimento' },
  { topic: 'a prática da gratidão e seus benefícios', category: 'bem-estar' },
  { topic: 'tomando decisões com mais clareza e confiança', category: 'estratégia' },
];

const PERSONA_BLOG_CONFIGS = {
  'bp_coach_vendas': {
    topics: [
      { topic: 'prospecção ativa: como encontrar clientes ideais', category: 'vendas' },
      { topic: 'técnicas de fechamento que realmente funcionam', category: 'negociação' },
      { topic: 'construindo relacionamento de longo prazo com clientes', category: 'CRM' },
      { topic: 'como superar objeções com empatia', category: 'negociação' },
      { topic: 'mindset de vendedor: resilência e foco', category: 'mindset' },
      { topic: 'funil de vendas: cada etapa explicada', category: 'estratégia' },
      { topic: 'social selling: vendas no digital', category: 'marketing' },
      { topic: 'qualificação de leads: SPIN selling na prática', category: 'metodologia' },
      { topic: 'motivação de equipe comercial', category: 'liderança' },
      { topic: 'KPIs que todo gestor de vendas precisa acompanhar', category: 'gestão' },
    ],
    prompt: {
      'pt-BR': 'Você é um Coach de Vendas especialista, escrevendo um artigo prático e acionável para vendedores e empreendedores. Escreva em português do Brasil.',
      'en-US': 'You are a Sales Coach expert, writing a practical and actionable article for salespeople and entrepreneurs. Write in English.',
      'es-ES': 'Eres un Coach de Ventas experto, escribiendo un artículo práctico y accionable para vendedores y emprendedores. Escribe en español.',
    },
    promptContext: 'vendas, negociação, prospecção, CRM, liderança comercial',
  },
  'bp_nutricionista': {
    topics: [
      { topic: 'alimentação equilibrada: por onde começar?', category: 'nutrição' },
      { topic: 'suplementos: quando são realmente necessários?', category: 'suplementação' },
      { topic: 'dieta mediterrânea: benefícios comprovados', category: 'dietas' },
      { topic: 'alimentação pré e pós-treino', category: 'esporte' },
      { topic: 'emoções e alimentação: como a comida emociona', category: 'psicologia' },
      { topic: 'rotina alimentar para quem trabalha muito', category: 'praticidade' },
      { topic: 'mitos da nutrição que você ainda acredita', category: 'mitos' },
      { topic: 'alimentação infantil: o que toda mãe precisa saber', category: 'infantil' },
      { topic: 'intestino: o segundo cérebro', category: 'saúde' },
      { topic: 'planejamento de refeições: meal prep semanal', category: 'organização' },
    ],
    prompt: {
      'pt-BR': 'Você é um Nutricionista especialista, escrevendo um artigo informativo e baseado em evidências sobre nutrição. Escreva em português do Brasil.',
      'en-US': 'You are a Nutritionist expert, writing an informative and evidence-based article about nutrition. Write in English.',
      'es-ES': 'Eres un Nutricionista experto, escribiendo un artículo informativo y basado en evidencias sobre nutrición. Escribe en español.',
    },
    promptContext: 'nutrição, saúde, alimentação, dieta, bem-estar',
  },
};

function getTopicForDate(date, personaId) {
  const start = new Date('2026-01-01');
  const diff = Math.floor((date - start) / (1000 * 60 * 60 * 24));

  const lookupId = personaId === 'coach-vendas' ? 'bp_coach_vendas'
    : personaId === 'nutricionista' ? 'bp_nutricionista'
    : personaId;
  const personaConfig = PERSONA_BLOG_CONFIGS[lookupId];
  if (personaConfig && personaConfig.topics && personaConfig.topics.length > 0) {
    const topics = personaConfig.topics;
    return topics[((diff % topics.length) + topics.length) % topics.length];
  }

  return BLOG_TOPICS[((diff % BLOG_TOPICS.length) + BLOG_TOPICS.length) % BLOG_TOPICS.length];
}

async function getAllPosts(personaId) {
  let query, params;
  if (personaId) {
    query = 'SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_slug = p.slug) as comment_count FROM posts p WHERE p.persona_id = ? ORDER BY p.published_at DESC LIMIT 30';
    params = [personaId];
  } else {
    query = 'SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_slug = p.slug) as comment_count FROM posts p ORDER BY p.published_at DESC LIMIT 30';
    params = [];
  }

  const [rows] = await pool.execute(query, params);

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
    personaId: r.persona_id,
    postType: r.post_type,
    media: typeof r.media === 'string' ? JSON.parse(r.media || '[]') : (r.media || []),
    language: r.language,
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
  const media = typeof row.media === 'string' ? JSON.parse(row.media || '[]') : (row.media || []);

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
    personaId: row.persona_id,
    postType: row.post_type,
    media,
    language: row.language,
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

async function generatePost(date, personaId, language) {
  const lang = language || 'pt-BR';
  const topicInfo = getTopicForDate(date, personaId);
  const dateStr = date.toISOString().split('T')[0];

  const prefix = personaId ? `${personaId}-` : 'palavra-';
  const slug = `${prefix}${dateStr}`;

  const existing = await getPost(slug);
  if (existing) return existing;

  const lookupId = personaId === 'coach-vendas' ? 'bp_coach_vendas'
    : personaId === 'nutricionista' ? 'bp_nutricionista'
    : personaId;
  const personaConfig = PERSONA_BLOG_CONFIGS[lookupId];
  const isPersonaBlog = !!personaConfig;

  let searchFn;
  let searchSources;
  try {
    if (personaId) {
      const persona = await personaManager.getPersona(personaId);
      if (persona && persona.knowledgeSources && persona.knowledgeSources.length > 0) {
        searchSources = persona.knowledgeSources;
        const { searchMultiSource } = require('../knowledge/store');
        searchFn = (q, k) => searchMultiSource(q, searchSources, k);
      }
    }
  } catch {}

  if (!searchFn) {
    const { searchVerses } = require('../rag/store');
    searchFn = searchVerses;
  }

  let relevantContent = [];
  try {
    relevantContent = await searchFn(topicInfo.topic || topicInfo.verse, 6);
  } catch {}

  const contentText = relevantContent.map(v => `${v.reference}: "${v.text}"`).join('\n');

  const l = lang.startsWith('en') ? '_en' : (lang.startsWith('es') ? '_es' : '');
  const blogPrompt = personaConfig?.prompt?.[lang] || personaConfig?.prompt?.['pt-BR']
    || `Você é um especialista, escrevendo um artigo prático e acionável. Escreva em ${lang === 'en-US' ? 'English' : lang === 'es-ES' ? 'español' : 'português do Brasil'}.`;

  const topicStr = topicInfo.topic || topicInfo.verse || '';
  const verseStr = topicInfo.verse || topicInfo.category || '';

  let prompt;
  if (isPersonaBlog) {
    prompt = `${blogPrompt}

Tema de hoje: "${topicStr}"
${verseStr ? `Categoria: ${verseStr}` : ''}

${contentText ? `Conteúdo encontrado:\n${contentText}` : ''}

Escreva um artigo prático e acionável com:
1. Um TÍTULO curto e impactante (não use aspas no título)
2. Uma introdução que conecte o tema com a dor/desejo do leitor
3. 3-5 dicas ou pontos práticos com exemplos
4. Um parágrafo de reflexão final
5. Uma call-to-action clara

Tom: profissional mas acessível, direto e acionável. Use linguagem do dia a dia.`;
  } else {
    const isBiblicalSource = searchSources && searchSources.some(s => s && (s.includes('bible') || s.includes('biblia')));
    if (isBiblicalSource) {
      prompt = `${blogPrompt}

Tema de hoje: "${topicStr}"
Versículo base: ${verseStr}

${contentText ? `Versículos encontrados:\n${contentText}` : ''}

Escreva um artigo devocional com:
1. Um TÍTULO curto e impactante (não use aspas no título)
2. Um versículo-chave em destaque
3. Um parágrafo de reflexão escrita em primeira pessoa, compassiva e com autoridade
4. Um parágrafo de aplicação prática para o dia a dia
5. Uma oração curta para encerrar

O tom deve ser amoroso mas com autoridade. Cite os versículos. Responda EM PRIMEIRA PESSOA.`;
    } else {
      prompt = `${blogPrompt}

Tema de hoje: "${topicStr}"
${verseStr ? `Categoria: ${verseStr}` : ''}

${contentText ? `Conteúdo encontrado:\n${contentText}` : ''}

Escreva um artigo informativo e inspirador com:
1. Um TÍTULO curto e impactante (não use aspas no título)
2. Uma introdução que conecte o tema com a vida do leitor
3. 3-5 dicas ou insights práticos com exemplos
4. Um parágrafo de reflexão final
5. Uma call-to-action clara

Tom: profissional mas acessível, direto e inspirador. Use linguagem do dia a dia.`;
    }
  }

  try {
    const messages = [
      { role: 'system', content: blogPrompt },
      { role: 'user', content: prompt },
    ];

    console.log(`[Blog] 🤖 Solicitando geração de post para o LLM...`);
    const llmRes = await integrations.callLLM(messages, { 
      temperature: 0.8,
      model: CHAT_MODEL
    });

    let content = llmRes.message?.content?.trim() || llmRes.content?.trim() || '';
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const titleMatch = content.match(/^(?:#\s*)?(.+?)[\n]/);
    const title = titleMatch ? titleMatch[1].replace(/^["*]+|["*]+$/g, '').trim() : topicStr;

    const sources = relevantContent.slice(0, 4).map(v => ({
      reference: v.reference,
      text: v.text,
    }));

    const publishedAt = date.toISOString().slice(0, 19).replace('T', ' ');
    const postType = isPersonaBlog ? 'article' : 'devotional';

    await pool.execute(
      'INSERT INTO posts (slug, title, topic, verse, content, sources, published_at, persona_id, post_type, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [slug, title, topicStr, verseStr, content, JSON.stringify(sources), publishedAt, personaId || null, postType, lang]
    );

    return { slug, title, topic: topicStr, verse: verseStr, content, sources, publishedAt: date.toISOString(), comments: [], personaId: personaId || null, postType, media: [], language: lang };
  } catch (err) {
    console.error('Error generating blog post:', err);

    const content = isPersonaBlog
      ? `Reflexão sobre ${topicStr}. Dicas práticas e estratégias para aplicar no seu dia a dia.`
      : `Reflexão sobre ${topicStr}. "${verseStr}" — Medite neste ensinamento e busque sabedoria na oração.`;
    const sources = relevantContent.slice(0, 4).map(v => ({
      reference: v.reference,
      text: v.text,
    }));

    const publishedAt = date.toISOString().slice(0, 19).replace('T', ' ');

    await pool.execute(
      'INSERT INTO posts (slug, title, topic, verse, content, sources, published_at, persona_id, post_type, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [slug, topicStr.charAt(0).toUpperCase() + topicStr.slice(1), topicStr, verseStr, content, JSON.stringify(sources), publishedAt, personaId || null, isPersonaBlog ? 'article' : 'devotional', lang]
    );

    return { slug, title: topicStr, topic: topicStr, verse: verseStr, content, sources, publishedAt: date.toISOString(), comments: [], personaId: personaId || null, postType: isPersonaBlog ? 'article' : 'devotional', media: [], language: lang };
  }
}

async function generateDailyPost(personaIds) {
  try {
    const today = new Date();
    const ids = personaIds || [null];

    for (const personaId of ids) {
      const prefix = personaId ? `${personaId}-` : 'palavra-';
      const todaySlug = `${prefix}${today.toISOString().split('T')[0]}`;
      const posts = await getAllPosts(personaId);
      const hasToday = posts.some(p => p.slug === todaySlug);

      if (!hasToday) {
        console.log(`Generating daily blog post for ${personaId || 'default'}...`);
        await generatePost(today, personaId);
        console.log(`Daily blog post generated for ${personaId || 'default'}.`);
      }
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
    setInterval(() => generateDailyPost(), 24 * 60 * 60 * 1000);
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
  PERSONA_BLOG_CONFIGS,
};