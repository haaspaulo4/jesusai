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
    const docLengths = {};
    const referenceField = this.config.referenceField || 'reference';
    const searchFields = this.config.searchFields || ['reference', 'text'];

    const referenceGroups = {};
    for (let i = 0; i < docs.length; i++) {
      const ref = (docs[i][referenceField] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const chapterMatch = ref.match(/^(.+?)\s+\d/);
      const groupKey = chapterMatch ? chapterMatch[1].trim() : ref;
      if (!referenceGroups[groupKey]) referenceGroups[groupKey] = [];
      referenceGroups[groupKey].push(i);
    }

    for (let i = 0; i < docs.length; i++) {
      const combinedText = searchFields.map(f => docs[i][f] || '').join(' ');
      const tokens = this.tokenize(combinedText);
      const tokenSet = new Set(tokens);
      docLengths[i] = tokens.length;
      for (const t of tokenSet) {
        docFreq[t] = (docFreq[t] || 0) + 1;
        if (!tokenDocs[t]) tokenDocs[t] = [];
        tokenDocs[t].push(i);
      }
    }

    const N = docs.length;
    const avgDl = Object.values(docLengths).reduce((a, b) => a + b, 0) / N;
    const idf = {};
    for (const [t, df] of Object.entries(docFreq)) {
      idf[t] = Math.log((N + 1) / (df + 1)) + 1;
    }

    const indexData = { idf, tokenDocs, docLengths, avgDl, referenceGroups };
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

    const k1 = 1.5;
    const b = 0.75;
    const avgDl = idx.avgDl || 50;
    const docLengths = idx.docLengths || {};

    const referenceField = this.config.referenceField || 'reference';
    const referenceGroups = idx.referenceGroups || {};
    const stopWords = new Set(['a','o','e','de','do','da','em','um','uma','que','se','nao','com','para','por','os','as','dos','das','ao','ou','mas','como','mais','pelo','nos','num','dela','dele','este','esse','ele','ela','meu','sua','nosso','tudo','qual','quando','onde','quem','entre','sobre','ate','ainda','foi','sao','tem','pode','the','is','are','was','were','be','have','has','do','does','did','will','can','this','that','with','from','about']);
    const queryTokenCounts = {};
    for (const t of queryTokens) {
      queryTokenCounts[t] = (queryTokenCounts[t] || 0) + 1;
    }

    const lowerQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matchedGroups = [];
    for (const groupKey of Object.keys(referenceGroups)) {
      if (lowerQuery.includes(groupKey)) {
        matchedGroups.push(groupKey);
      }
    }

    const scores = {};
    for (const token of Object.keys(queryTokenCounts)) {
      const idfScore = idx.idf[token] || 1;
      const docIds = idx.tokenDocs[token] || [];
      for (const docId of docIds) {
        if (!scores[docId]) scores[docId] = 0;
        const dl = docLengths[docId] || avgDl;
        const tfNorm = (k1 + 1) / (k1 * (1 - b + b * (dl / avgDl)) + 1);
        scores[docId] += idfScore * tfNorm;
      }
    }

    if (matchedGroups.length > 0) {
      const boostPerGroup = Math.max(queryTokens.length * 2, 8);
      for (const groupKey of matchedGroups) {
        const docIds = referenceGroups[groupKey];
        if (!docIds) continue;
        for (const docId of docIds) {
          scores[docId] = (scores[docId] || 0) + boostPerGroup;
          const docText = (docs[docId].text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          let textMatchBonus = 0;
          for (const qt of queryTokens) {
            if (docText.includes(qt)) textMatchBonus += 3;
          }
          if (docText.length > 100) textMatchBonus += 2;
          if (docText.length > 200) textMatchBonus += 2;
          scores[docId] += textMatchBonus;
        }
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

async function searchVerses(query, topK) {
  const { vectorStore, VECTOR_ENABLED } = require('../embeddings/vectorStore');
  const k = topK || 8;

  const store = getStore();
  if (!store) return [];

  const tfidfResults = store.search(query, k);

  if (VECTOR_ENABLED) {
    try {
      const { results: vectorResults } = await vectorStore.search(query, null, k);
      if (vectorResults && vectorResults.length > 0) {
        const enrichedVectors = await enrichVectorResults(vectorResults, null);
        return vectorStore.hybridSearch(tfidfResults, enrichedVectors, k);
      }
    } catch {}
  }

  return tfidfResults;
}

async function searchMultiSource(query, sourceIds, topK) {
  const { getKnowledgeConfig } = require('./config');
  const { vectorStore, VECTOR_ENABLED } = require('../embeddings/vectorStore');

  const k = topK || 8;

  const allResults = [];
  const kPerSource = Math.ceil(k / (sourceIds || [1]).length);

  const searchSources = sourceIds && sourceIds.length > 0 ? sourceIds : null;

  if (searchSources) {
    for (const sourceId of searchSources) {
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
  } else {
    const store = getStore();
    if (store) {
      const results = store.search(query, k);
      allResults.push(...results);
    }
  }

  allResults.sort((a, b) => (a.distance || 1) - (b.distance || 1));
  const tfidfResults = allResults.slice(0, k);

  if (VECTOR_ENABLED) {
    try {
      const { results: vectorResults } = await vectorStore.search(query, searchSources, k);
      if (vectorResults && vectorResults.length > 0) {
        const enrichedVectors = await enrichVectorResults(vectorResults, searchSources);
        return vectorStore.hybridSearch(tfidfResults, enrichedVectors, k);
      }
    } catch (err) {
      console.warn('[KnowledgeStore] Vector search failed, using TF-IDF only:', err.message);
    }
  }

  return tfidfResults;
}

async function enrichVectorResults(vectorResults, sourceIds) {
  const { getKnowledgeConfig } = require('./config');
  const enriched = [];

  for (const vr of vectorResults) {
    const sourceConfig = getKnowledgeConfig(vr.sourceId);
    if (!sourceConfig) {
      enriched.push(vr);
      continue;
    }

    let store = stores.get(vr.sourceId);
    if (!store) {
      store = new KnowledgeStore(sourceConfig);
      stores.set(vr.sourceId, store);
    }

    const docs = store.loadVerses();
    const doc = docs.find(d => (d.reference || d.id) === vr.reference);

    enriched.push({
      ...vr,
      text: doc?.text || '',
      reference: vr.reference,
    });
  }

  return enriched;
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

async function getAllSourceStats() {
  const { getAllEnabledSources } = require('./config');
  const { vectorStore } = require('../embeddings/vectorStore');

  const sources = getAllEnabledSources();
  const stats = [];

  for (const source of sources) {
    const dataPath = source.dataPath || path.join(KNOWLEDGE_DIR, `${source.id}_documents.json`);
    const indexPath = source.indexPath || path.join(KNOWLEDGE_DIR, `${source.id}_index.json`);
    let docCount = 0;
    let indexExists = false;
    let dataExists = false;
    let embeddingCount = 0;

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

    try {
      embeddingCount = await vectorStore.getSourceEmbeddingStats
        ? await vectorStore.getSourceEmbeddingStats(source.id)
        : 0;
    } catch {
      embeddingCount = 0;
    }

    stats.push({
      id: source.id,
      name: source.name,
      ingester: source.ingester,
      enabled: source.enabled,
      documentCount: docCount,
      dataExists,
      indexExists,
      embeddingCount,
    });
  }

  return stats;
}

function getSourceContent(sourceId) {
  const { getAllEnabledSources } = require('./config');
  const sources = getAllEnabledSources();
  const source = sources.find(s => s.id === sourceId);
  if (!source) return null;

  const dataPath = source.dataPath || path.join(KNOWLEDGE_DIR, `${source.id}_documents.json`);
  if (!fs.existsSync(dataPath)) return null;

  try {
    const docs = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    return {
      id: source.id,
      name: source.name,
      documentCount: docs.length,
      documents: docs.map(d => ({
        reference: d.reference,
        text: d.text,
        source: d.source,
        type: d.type,
      })),
    };
  } catch {
    return null;
  }
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
  enrichVectorResults,
  getSourceContent,
};