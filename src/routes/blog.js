const express = require('express');
const { getAllPosts, getPost, generatePost, addComment } = require('../blog');
const { authMiddleware } = require('../auth');
const { searchVerses } = require('../rag/store');

const router = express.Router();

router.get('/posts', async (req, res) => {
  try {
    const today = new Date();
    const todaySlug = `palavra-${today.toISOString().split('T')[0]}`;
    const posts = await getAllPosts();

    const hasToday = posts.some(p => p.slug === todaySlug);
    if (!hasToday) {
      const newPost = await generatePost(today);
      posts.unshift(newPost);
    }

    const limited = posts.slice(0, 30).map(p => ({
      slug: p.slug,
      title: p.title,
      topic: p.topic,
      verse: p.verse,
      publishedAt: p.publishedAt,
      commentCount: p.commentCount || countAllComments(p.comments || []),
      excerpt: (p.content || '').substring(0, 180) + '...',
    }));

    res.json(limited);
  } catch (err) {
    console.error('Error listing posts:', err);
    res.json([]);
  }
});

function countAllComments(comments) {
  let count = 0;
  for (const c of comments) {
    count++;
    if (c.replies && c.replies.length > 0) {
      count += countAllComments(c.replies);
    }
  }
  return count;
}

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

const BIBLE_BOOKS_INDEX = {
  'Velho Testamento': [
    { name: 'Gênesis', abbr: 'gn' }, { name: 'Êxodo', abbr: 'ex' }, { name: 'Levítico', abbr: 'lv' },
    { name: 'Números', abbr: 'nm' }, { name: 'Deuteronomio', abbr: 'dt' }, { name: 'Josué', abbr: 'js' },
    { name: 'Juízes', abbr: 'jz' }, { name: 'Rute', abbr: 'rt' }, { name: '1 Samuel', abbr: '1sm' },
    { name: '2 Samuel', abbr: '2sm' }, { name: '1 Reis', abbr: '1rs' }, { name: '2 Reis', abbr: '2rs' },
    { name: '1 Crônicas', abbr: '1cr' }, { name: '2 Crônicas', abbr: '2cr' }, { name: 'Esdras', abbr: 'ed' },
    { name: 'Neemias', abbr: 'ne' }, { name: 'Ester', abbr: 'et' }, { name: 'Jó', abbr: 'jo' },
    { name: 'Salmos', abbr: 'sl' }, { name: 'Provérbios', abbr: 'pv' }, { name: 'Eclesiastes', abbr: 'ec' },
    { name: 'Cantares', abbr: 'ct' }, { name: 'Isaias', abbr: 'is' }, { name: 'Jeremias', abbr: 'jr' },
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

router.get('/search', (req, res) => {
  const { q, limit } = req.query;
  const query = q || '';
  const topK = Math.min(parseInt(limit) || 20, 50);

  if (!query.trim()) {
    return res.json([]);
  }

  const results = searchVerses(query, topK);
  res.json(results);
});

router.get('/books', (req, res) => {
  res.json(BIBLE_BOOKS_INDEX);
});

module.exports = router;