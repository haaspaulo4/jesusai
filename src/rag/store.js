const fs = require('fs');
const path = require('path');

const VERSES_PATH = path.join(__dirname, '..', '..', 'data', 'bible_verses.json');
const INDEX_PATH = path.join(__dirname, '..', '..', 'data', 'bible_index.json');

let verses = null;
let index = null;

const STOP_WORDS = new Set([
  'a', 'o', 'e', 'é', 'de', 'do', 'da', 'em', 'no', 'na', 'um', 'uma',
  'que', 'se', 'não', 'com', 'para', 'por', 'os', 'as', 'dos', 'das',
  'ao', 'aos', 'à', 'às', 'ou', 'mas', 'como', 'mais', 'ao', 'pelo',
  'pela', 'nos', 'nas', 'num', 'numa', 'dela', 'dele', 'disto', 'disso',
  'daí', 'está', 'era', 'ser', 'ter', 'este', 'esse', 'isto', 'isso',
  'ele', 'ela', 'eles', 'elas', 'meu', 'minha', 'teu', 'tua', 'seu',
  'sua', 'nosso', 'nossa', 'vosso', 'vossa', 'muito', 'pouco', 'tudo',
  'nada', 'todo', 'qual', 'quando', 'onde', 'quem', 'entre', 'sobre',
  'após', 'até', 'também', 'ainda', 'já', 'foi', 'são', 'há', 'tem',
  'pode',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function loadVerses() {
  if (verses) return verses;
  if (!fs.existsSync(VERSES_PATH)) {
    console.warn('Bible verses file not found. Run npm run ingest first.');
    return [];
  }
  verses = JSON.parse(fs.readFileSync(VERSES_PATH, 'utf-8'));
  console.log(`Loaded ${verses.length} verses`);
  return verses;
}

function loadIndex() {
  if (index) return index;
  if (!fs.existsSync(INDEX_PATH)) {
    buildIndex();
    return index;
  }
  index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  return index;
}

function buildIndex() {
  const v = loadVerses();
  const docFreq = {};
  const tokenDocs = {};

  for (let i = 0; i < v.length; i++) {
    const tokens = new Set(tokenize(v[i].text + ' ' + v[i].reference));
    for (const t of tokens) {
      docFreq[t] = (docFreq[t] || 0) + 1;
      if (!tokenDocs[t]) tokenDocs[t] = [];
      tokenDocs[t].push(i);
    }
  }

  const N = v.length;
  const idf = {};
  for (const [t, df] of Object.entries(docFreq)) {
    idf[t] = Math.log((N + 1) / (df + 1)) + 1;
  }

  const indexData = { idf, tokenDocs };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(indexData), 'utf-8');
  index = indexData;
  console.log('Search index built');
  return index;
}

function searchVerses(query, topK = 8) {
  const v = loadVerses();
  if (v.length === 0) return [];

  const idx = loadIndex();
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) return [];

  const scores = {};

  for (const token of queryTokens) {
    const idfScore = idx.idf[token] || 1;
    const docIds = idx.tokenDocs[token] || [];

    for (const docId of docIds) {
      if (!scores[docId]) scores[docId] = 0;
      scores[docId] += idfScore;
    }
  }

  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK);

  return sorted.map(([id, score]) => ({
    ...v[Number(id)],
    distance: 1 / (1 + score),
  }));
}

function getVerseCount() {
  const v = loadVerses();
  return v.length;
}

module.exports = {
  searchVerses,
  getVerseCount,
  loadVerses,
  buildIndex,
};