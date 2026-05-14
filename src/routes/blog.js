const express = require('express');
const { getAllPosts, getPost, generatePost, addComment } = require('../blog');
const { searchVerses } = require('../rag/store');
const { searchMultiSource, getSourceContent } = require('../knowledge/store');
const personaManager = require('../persona/manager');
const businessModule = require('../business');

const router = express.Router();

router.get('/posts', async (req, res) => {
  try {
    const { personaId, lang } = req.query;
    const today = new Date();
    const prefix = personaId ? `${personaId}-` : 'palavra-';
    const todaySlug = `${prefix}${today.toISOString().split('T')[0]}`;
    const posts = await getAllPosts(personaId || null);

    const hasToday = posts.some(p => p.slug === todaySlug);
    if (!hasToday) {
      const newPost = await generatePost(today, personaId || null, lang || 'pt-BR');
      posts.unshift(newPost);
    }

    let businessInfo = null;
    if (personaId) {
      try {
        const config = await businessModule.getBusinessConfig(personaId);
        if (config && config.name) businessInfo = { name: config.name, tagline: config.tagline, logoUrl: config.logo_url };
      } catch {}
    }

    const limited = posts.slice(0, 30).map(p => ({
      slug: p.slug,
      title: p.title,
      topic: p.topic,
      verse: p.verse,
      publishedAt: p.publishedAt,
      commentCount: p.commentCount || 0,
      excerpt: (p.content || '').substring(0, 180) + '...',
      personaId: p.personaId || null,
      postType: p.postType || 'devotional',
      media: p.media || [],
      language: p.language || 'pt-BR',
    }));

    res.json({ posts: limited, businessInfo });
  } catch (err) {
    console.error('Error listing posts:', err);
    res.json({ posts: [], businessInfo: null });
  }
});

router.get('/posts/:slug', async (req, res) => {
  try {
    const post = await getPost(req.params.slug);
    if (!post) {
      return res.status(404).json({ error: 'Post não encontrado' });
    }
    res.json(post);
  } catch (err) {
    res.status(404).json({ error: 'Post não encontrado' });
  }
});

router.post('/posts/:slug/comments', async (req, res) => {
  const { content, authorName, authorId, parentId } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comentário não pode ser vazio' });
  }
  if (content.length > 1000) {
    return res.status(400).json({ error: 'Comentário muito longo (máximo 1000 caracteres)' });
  }

  const comment = await addComment(req.params.slug, {
    content: content.trim(),
    authorName: authorName || 'Anônimo',
    authorId: authorId || null,
  }, parentId || null);

  if (!comment) {
    return res.status(404).json({ error: 'Post não encontrado' });
  }

  res.json(comment);
});

router.get('/search', async (req, res) => {
  const { q, limit, personaId, sourceId } = req.query;
  const query = q || '';
  const topK = Math.min(parseInt(limit) || 20, 50);

  if (!query.trim() && !sourceId) {
    return res.json([]);
  }

  let personaSources = null;
  let personaName = null;
  if (personaId) {
    try {
      const persona = await personaManager.getPersona(personaId);
      if (persona && persona.knowledgeSources && persona.knowledgeSources.length > 0) {
        personaSources = persona.knowledgeSources;
        personaName = persona.name;
      }
    } catch {}
  }

  let results;
  if (sourceId) {
    const sources = personaSources && personaSources.includes(sourceId) ? [sourceId] : [sourceId];
    results = await searchMultiSource(query || sourceId.replace(/[-_]/g, ' '), sources, topK);
  } else if (personaSources && personaSources.length > 0) {
    results = await searchMultiSource(query, personaSources, topK);
  } else {
    results = await searchVerses(query, topK);
  }

  res.json({ results, personaName, personaId: personaId || null });
});

router.get('/source-content/:sourceId', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const content = getSourceContent(sourceId);
    if (!content) return res.status(404).json({ error: 'Source not found' });
    res.json(content);
  } catch (err) {
    console.error('[Blog] Source content error:', err);
    res.status(500).json({ error: 'Failed to get source content' });
  }
});

const BIBLE_BOOKS_INDEX = {
  'Velho Testamento': [
    { name: 'Gênesis', abbr: 'gn' }, { name: 'Êxodo', abbr: 'ex' }, { name: 'Levítico', abbr: 'lv' },
    { name: 'Números', abbr: 'nm' }, { name: 'Deuteronomio', abbr: 'dt' }, { name: 'Josué', abbr: 'js' },
    { name: 'Juízes', abbr: 'jz' }, { name: 'Rute', abbr: 'rt' }, { name: '1 Samuel', abbr: '1sm' },
    { name: '2 Samuel', abbr: '2sm' }, { name: '1 Reis', abbr: '1rs' }, { name: '2 Reis', abbr: '2rs' },
    { name: '1 Crônicas', abbr: '1cr' }, { name: '2 Crônicas', abbr: '2cr' }, { name: 'Esdras', abbr: 'ed' },
    { name: 'Neemias', abbr: 'ne' }, { name: 'Ester', abbr: 'et' }, { name: 'Jó', abbr: 'jo' },
    { name: 'Salmos', abbr: 'sl' }, { name: 'Provérbios', abbr: 'pv' }, { name: 'Eclesiastes', abbr: 'ec' },
    { name: 'Cantares', abbr: 'ct' }, { name: 'Isaías', abbr: 'is' }, { name: 'Jeremias', abbr: 'jr' },
    { name: 'Lamentações', abbr: 'lm' }, { name: 'Ezequiel', abbr: 'ez' }, { name: 'Daniel', abbr: 'dn' },
    { name: 'Oseias', abbr: 'os' }, { name: 'Joel', abbr: 'jl' }, { name: 'Amos', abbr: 'am' },
    { name: 'Obadias', abbr: 'ob' }, { name: 'Jonas', abbr: 'jn' }, { name: 'Miqueias', abbr: 'mq' },
    { name: 'Naum', abbr: 'na' }, { name: 'Habacuque', abbr: 'hc' }, { name: 'Sofonias', abbr: 'sf' },
    { name: 'Ageu', abbr: 'ag' }, { name: 'Zacarias', abbr: 'zc' }, { name: 'Malaquias', abbr: 'ml' },
  ],
  'Novo Testamento': [
    { name: 'Mateus', abbr: 'mt' }, { name: 'Marcos', abbr: 'mc' }, { name: 'Lucas', abbr: 'lc' },
    { name: 'João', abbr: 'jo' }, { name: 'Atos', abbr: 'at' }, { name: 'Romanos', abbr: 'rm' },
    { name: '1 Coríntios', abbr: '1co' }, { name: '2 Coríntios', abbr: '2co' }, { name: 'Gálatas', abbr: 'gl' },
    { name: 'Efésios', abbr: 'ef' }, { name: 'Filipenses', abbr: 'fp' }, { name: 'Colossenses', abbr: 'cl' },
    { name: '1 Tessalonicenses', abbr: '1ts' }, { name: '2 Tessalonicenses', abbr: '2ts' },
    { name: '1 Timóteo', abbr: '1tm' }, { name: '2 Timóteo', abbr: '2tm' }, { name: 'Tito', abbr: 'tt' },
    { name: 'Filemom', abbr: 'fm' }, { name: 'Hebreus', abbr: 'hb' }, { name: 'Tiago', abbr: 'tg' },
    { name: '1 Pedro', abbr: '1pe' }, { name: '2 Pedro', abbr: '2pe' },
    { name: '1 João', abbr: '1jo' }, { name: '2 João', abbr: '2jo' }, { name: '3 João', abbr: '3jo' },
    { name: 'Judas', abbr: 'jd' }, { name: 'Apocalipse', abbr: 'ap' },
  ],
};

router.get('/books', (req, res) => {
  const { personaId } = req.query;
  if (personaId) {
    personaManager.getPersona(personaId).then(persona => {
      if (persona && persona.knowledgeSources && persona.knowledgeSources.length > 0) {
        res.json({ bible: BIBLE_BOOKS_INDEX, knowledgeSources: persona.knowledgeSources });
      } else {
        res.json({ bible: BIBLE_BOOKS_INDEX });
      }
    }).catch(() => {
      res.json({ bible: BIBLE_BOOKS_INDEX });
    });
  } else {
    res.json(BIBLE_BOOKS_INDEX);
  }
});

router.get('/business', async (req, res) => {
  try {
    const { personaId } = req.query;
    if (!personaId) return res.json({ business: null, isOpen: null });

    const config = await businessModule.getBusinessConfig(personaId);
    if (!config || !config.name) return res.json({ business: null, isOpen: null });

    const isOpen = businessModule.isOpenNow(config);
    res.json({ business: config, isOpen });
  } catch (err) {
    res.json({ business: null, isOpen: null });
  }
});

module.exports = router;