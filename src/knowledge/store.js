const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'data');

class KnowledgeStore {
  constructor(sourceConfig) {
    this.config = sourceConfig;
    this._verses = null;
    this._index = null;
  }

  get versesPath() {
    return this.config.dataPath || path.join(KNOWLEDGE_DIR, 'bible_verses.json');
  }

  get indexPath() {
    return this.config.indexPath || path.join(KNOWLEDGE_DIR, 'bible_index.json');
  }

  loadVerses() {
    if (this._verses) return this._verses;
    if (!fs.existsSync(this.versesPath)) {
      console.warn(`Knowledge file not found: ${this.versesPath}. Run npm run ingest first.`);
      return [];
    }
    this._verses = JSON.parse(fs.readFileSync(this.versesPath, 'utf-8'));
    console.log(`Loaded ${this._verses.length} documents from ${this.config.id}`);
    return this._verses;
  }

  loadIndex() {
    if (this._index) return this._index;
    if (!fs.existsSync(this.indexPath)) {
      this.buildIndex();
      return this._index;
    }
    this._index = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
    return this._index;
  }

  clearCache() {
    this._verses = null;
    this._index = null;
  }

  tokenize(text) {
    const lang = this.config.language || 'pt-BR';
    const STOP_WORDS = {
      'pt-BR': new Set([
        'a', 'o', 'e', 'é', 'de', 'do', 'da', 'em', 'no', 'na', 'um', 'uma',
        'que', 'se', 'não', 'com', 'para', 'por', 'os', 'as', 'dos', 'das',
        'ao', 'aos', 'à', 'às', 'ou', 'mas', 'como', 'mais', 'pelo', 'pela',
        'nos', 'nas', 'num', 'numa', 'dela', 'dele', 'disto', 'disso',
        'daí', 'está', 'era', 'ser', 'ter', 'este', 'esse', 'isto', 'isso',
        'ele', 'ela', 'eles', 'elas', 'meu', 'minha', 'teu', 'tua', 'seu',
        'sua', 'nosso', 'nossa', 'vosso', 'vossa', 'muito', 'pouco', 'tudo',
        'nada', 'todo', 'qual', 'quando', 'onde', 'quem', 'entre', 'sobre',
        'após', 'até', 'também', 'ainda', 'já', 'foi', 'são', 'há', 'tem', 'pode',
      ]),
      'en-US': new Set([
        'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
        'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in',
        'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
        'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off',
        'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
        'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most',
        'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
        'so', 'than', 'too', 'very', 'just', 'about', 'up', 'it', 'its',
        'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you',
        'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
        'what', 'which', 'who', 'whom',
      ]),
      'es-ES': new Set([
        'a', 'el', 'e', 'es', 'de', 'del', 'da', 'en', 'no', 'na', 'un', 'una',
        'que', 'se', 'no', 'con', 'para', 'por', 'los', 'las', 'dos', 'das',
        'al', 'los', 'a', 'las', 'o', 'pero', 'como', 'más', 'por', 'por',
        'nos', 'nas', 'num', 'numa', 'dela', 'dele', 'disto', 'disso',
        'está', 'era', 'ser', 'ter', 'este', 'esse', 'isto', 'isso',
        'él', 'ella', 'ellos', 'ellas', 'mi', 'mis', 'tu', 'tus', 'su',
        'sus', 'nuestro', 'nuestra', 'vuestro', 'vuestra', 'muy', 'poco',
      ]),
    };
    const stops = STOP_WORDS[lang] || STOP_WORDS['pt-BR'];
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stops.has(w));
  }

  buildIndex() {
    const docs = this.loadVerses();
    const docFreq = {};
    const tokenDocs = {};
    const searchFields = this.config.searchFields || ['reference', 'text'];

    for (let i = 0; i < docs.length; i++) {
      const combinedText = searchFields.map(f => docs[i][f] || '').join(' ');
      const tokens = new Set(this.tokenize(combinedText));
      for (const t of tokens) {
        docFreq[t] = (docFreq[t] || 0) + 1;
        if (!tokenDocs[t]) tokenDocs[t] = [];
        tokenDocs[t].push(i);
      }
    }

    const N = docs.length;
    const idf = {};
    for (const [t, df] of Object.entries(docFreq)) {
      idf[t] = Math.log((N + 1) / (df + 1)) + 1;
    }

    const indexData = { idf, tokenDocs };
    fs.writeFileSync(this.indexPath, JSON.stringify(indexData), 'utf-8');
    this._index = indexData;
    console.log(`Search index built for ${this.config.id} (${docs.length} documents)`);
    return indexData;
  }

  search(query, topK) {
    const configTopK = this.config.defaultTopK || 8;
    const k = topK || configTopK;
    const docs = this.loadVerses();
    if (docs.length === 0) return [];

    const idx = this.loadIndex();
    const queryTokens = this.tokenize(query);
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

    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => ({
        ...docs[Number(id)],
        distance: 1 / (1 + score),
      }));
  }

  getDocumentCount() {
    const docs = this.loadVerses();
    return docs.length;
  }

  formatContext(verses, lang) {
    const sourceFormatter = this.config.sourceFormat;
    if (sourceFormatter) return sourceFormatter(verses);
    return verses.map(v => `${v.reference}: "${v.text}"`).join('\n');
  }
}

const stores = new Map();

function getStore(sourceId) {
  const { getKnowledgeConfig, getAllEnabledSources } = require('./config');
  if (sourceId) {
    if (!stores.has(sourceId)) {
      const config = getKnowledgeConfig(sourceId);
      if (!config) return null;
      stores.set(sourceId, new KnowledgeStore(config));
    }
    return stores.get(sourceId);
  }

  const sources = getAllEnabledSources();
  if (sources.length === 0) return null;
  const primaryId = sources[0].id;
  if (!stores.has(primaryId)) {
    stores.set(primaryId, new KnowledgeStore(sources[0]));
  }
  return stores.get(primaryId);
}

function searchVerses(query, topK) {
  const store = getStore();
  if (!store) return [];
  return store.search(query, topK);
}

function searchMultiSource(query, sourceIds, topK) {
  const { getKnowledgeConfig } = require('./config');
  if (!sourceIds || sourceIds.length === 0) {
    return searchVerses(query, topK);
  }

  const allResults = [];
  const kPerSource = Math.ceil((topK || 8) / sourceIds.length);

  for (const sourceId of sourceIds) {
    const config = getKnowledgeConfig(sourceId);
    if (!config) continue;

    let store = stores.get(sourceId);
    if (!store) {
      store = new KnowledgeStore(config);
      stores.set(sourceId, store);
    }

    const results = store.search(query, kPerSource);
    allResults.push(...results.map(r => ({ ...r, sourceId })));
  }

  allResults.sort((a, b) => (a.distance || 1) - (b.distance || 1));
  return allResults.slice(0, topK || 8);
}

function getVerseCount() {
  const store = getStore();
  if (!store) return 0;
  return store.getDocumentCount();
}

function loadVerses() {
  const store = getStore();
  if (!store) return [];
  return store.loadVerses();
}

function buildIndex() {
  const store = getStore();
  if (!store) return null;
  return store.buildIndex();
}

function clearStoreCache(sourceId) {
  if (sourceId) {
    stores.delete(sourceId);
  } else {
    stores.clear();
  }
}

function getAllSourceStats() {
  const { getAllEnabledSources } = require('./config');
  const sources = getAllEnabledSources();
  return sources.map(source => {
    const dataPath = source.dataPath || path.join(KNOWLEDGE_DIR, `${source.id}_documents.json`);
    const indexPath = source.indexPath || path.join(KNOWLEDGE_DIR, `${source.id}_index.json`);
    let docCount = 0;
    let indexExists = false;
    let dataExists = false;

    try {
      if (fs.existsSync(dataPath)) {
        dataExists = true;
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        docCount = data.length;
      }
    } catch {}

    try {
      indexExists = fs.existsSync(indexPath);
    } catch {}

    return {
      id: source.id,
      name: source.name,
      ingester: source.ingester,
      enabled: source.enabled,
      documentCount: docCount,
      dataExists,
      indexExists,
    };
  });
}

module.exports = {
  KnowledgeStore,
  getStore,
  searchVerses,
  searchMultiSource,
  getVerseCount,
  loadVerses,
  buildIndex,
  clearStoreCache,
  getAllSourceStats,
};