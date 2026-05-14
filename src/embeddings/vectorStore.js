require('dotenv').config();
const { pool } = require('../db');
const embeddings = require('../embeddings');
const { getKnowledgeConfig, getAllEnabledSources } = require('../knowledge/config');

const VECTOR_ENABLED = process.env.VECTOR_SEARCH_ENABLED !== 'false';
const VECTOR_WEIGHT = parseFloat(process.env.VECTOR_WEIGHT) || 0.7;
const TFIDF_WEIGHT = parseFloat(process.env.TFIDF_WEIGHT) || 0.3;
const VECTOR_MIN_SCORE = parseFloat(process.env.VECTOR_MIN_SCORE) || 0.3;
const VECTOR_AUTO_INDEX = process.env.VECTOR_AUTO_INDEX !== 'false';

class VectorStore {
  constructor() {
    this._initialized = false;
    this._indexingInProgress = false;
  }

  get enabled() {
    return VECTOR_ENABLED;
  }

  async initialize() {
    if (this._initialized) return;
    try {
      const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM embeddings');
      console.log(`[VectorStore] Initialized. ${rows[0].cnt} embeddings in DB.`);
      this._initialized = true;
    } catch (err) {
      console.error('[VectorStore] Failed to initialize:', err.message);
    }
  }

  async indexSource(sourceId) {
    if (this._indexingInProgress) {
      console.log(`[VectorStore] Indexing already in progress. Skipping ${sourceId}.`);
      return;
    }

    if (!embeddings.isEmbeddingsAvailable()) {
      console.warn('[VectorStore] Embeddings unavailable. Skipping vector indexing.');
      return;
    }

    this._indexingInProgress = true;
    try {
      const sourceConfig = getKnowledgeConfig(sourceId);
      if (!sourceConfig) {
        console.warn(`[VectorStore] Source config not found: ${sourceId}`);
        return;
      }

      const { KnowledgeStore } = require('../knowledge/store');
      const store = new KnowledgeStore(sourceConfig);
      const docs = store.loadVerses();
      if (!docs || docs.length === 0) {
        console.warn(`[VectorStore] No documents found for ${sourceId}`);
        return;
      }

      console.log(`[VectorStore] Indexing ${docs.length} docs for ${sourceId}...`);

      let indexed = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const docId = String(doc.reference || doc.id || `doc_${i}`);
        const text = doc.text || doc.content || '';

        if (!text || text.trim().length < 10) {
          skipped++;
          continue;
        }

        const embedding = await embeddings.getEmbedding(text.substring(0, 1000));
        if (!embedding) {
          failed++;
          if (failed === 1) {
            console.warn(`[VectorStore] Embedding failed for ${sourceId}. Subsequent failures suppressed.`);
          }
          if (!embeddings.isEmbeddingsAvailable()) {
            console.warn('[VectorStore] Embeddings disabled due to auth error. Aborting index.');
            break;
          }
          continue;
        }

        await embeddings.saveEmbedding(sourceId, docId, text, embedding);
        indexed++;

        if (indexed % 50 === 0) {
          console.log(`[VectorStore] Progress: ${indexed}/${docs.length} indexed`);
          await new Promise(r => setTimeout(r, 100));
        }
      }

      console.log(`[VectorStore] Done ${sourceId}: ${indexed} indexed, ${skipped} skipped, ${failed} failed`);
      return { indexed, skipped, failed };
    } catch (err) {
      console.error(`[VectorStore] Failed to index ${sourceId}:`, err.message);
      return null;
    } finally {
      this._indexingInProgress = false;
    }
  }

  async indexAllSources() {
    const sources = getAllEnabledSources();
    const results = {};

    for (const source of sources) {
      console.log(`[VectorStore] Indexing source: ${source.id} (${source.name})`);
      results[source.id] = await this.indexSource(source.id);
    }

    return results;
  }

  async search(query, sourceIds = null, topK = 8) {
    if (!VECTOR_ENABLED) {
      return { results: [], method: 'disabled' };
    }

    await this.initialize();

    const queryEmbedding = await embeddings.getEmbedding(query);
    if (!queryEmbedding) {
      console.warn('[VectorStore] Failed to get query embedding, falling back to TF-IDF only');
      return { results: [], method: 'embedding_failed' };
    }

    const embeddingResults = await embeddings.searchEmbeddings(queryEmbedding, sourceIds, topK * 2);

    const results = embeddingResults
      .filter(r => r.score >= VECTOR_MIN_SCORE)
      .slice(0, topK)
      .map(r => ({
        reference: r.doc_id,
        sourceId: r.source_id,
        score: r.score,
        method: 'vector',
      }));

    return { results, method: 'vector' };
  }

  hybridSearch(tfidfResults, vectorResults, topK = 8) {
    if (!VECTOR_ENABLED || !vectorResults || vectorResults.length === 0) {
      return tfidfResults;
    }

    const combined = new Map();

    for (const r of tfidfResults) {
      const key = `${r.sourceId || 'default'}:${r.reference}`;
      const score = r.distance ? (1 / (1 + r.distance)) : 0.5;
      combined.set(key, {
        ...r,
        tfidfScore: score,
        vectorScore: 0,
        hybridScore: score * TFIDF_WEIGHT,
      });
    }

    for (const r of vectorResults) {
      const key = `${r.sourceId || 'default'}:${r.reference || r.doc_id}`;
      if (combined.has(key)) {
        const existing = combined.get(key);
        existing.vectorScore = r.score;
        existing.hybridScore = existing.tfidfScore * TFIDF_WEIGHT + r.score * VECTOR_WEIGHT;
      } else {
        combined.set(key, {
          reference: r.reference || r.doc_id,
          sourceId: r.sourceId,
          text: r.text,
          tfidfScore: 0,
          vectorScore: r.score,
          hybridScore: r.score * VECTOR_WEIGHT,
          method: 'vector',
        });
      }
    }

    return Array.from(combined.values())
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, topK);
  }

  async getStats() {
    try {
      const [rows] = await pool.execute('SELECT source_id, COUNT(*) as count FROM embeddings GROUP BY source_id');
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      return {
        enabled: VECTOR_ENABLED,
        totalEmbeddings: total,
        sources: rows.map(r => ({ sourceId: r.source_id, count: r.count })),
        model: embeddings.EMBEDDING_MODEL,
        dimensions: embeddings.EMBEDDING_DIMENSIONS,
        vectorWeight: VECTOR_WEIGHT,
        tfidfWeight: TFIDF_WEIGHT,
      };
    } catch (err) {
      return { enabled: VECTOR_ENABLED, error: err.message };
    }
  }
}

const vectorStore = new VectorStore();

module.exports = {
  vectorStore,
  VectorStore,
  VECTOR_ENABLED,
  VECTOR_WEIGHT,
  TFIDF_WEIGHT,
};