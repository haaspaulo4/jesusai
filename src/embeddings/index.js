require('dotenv').config();
const { pool } = require('../db');
const integrations = require('../llm/integrationManager');

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS) || 768;
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE) || 32;

let embeddingCache = new Map();
const CACHE_MAX_SIZE = parseInt(process.env.EMBEDDING_CACHE_SIZE) || 5000;

let embeddingsDisabled = false;
let authErrorLogged = false;

function getCacheKey(text) {
  return `${EMBEDDING_MODEL}:${text.substring(0, 200)}`;
}

function updateCache(key, vector) {
  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    const firstKey = embeddingCache.keys().next().value;
    embeddingCache.delete(firstKey);
  }
  embeddingCache.set(key, vector);
}

async function getEmbedding(text) {
  if (!text || text.trim().length === 0) return null;
  if (embeddingsDisabled) return null;

  const cacheKey = getCacheKey(text);
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }

  try {
    const llmIntegs = integrations.getIntegrationForEnv('llm');
    const llmInteg = llmIntegs && llmIntegs.length > 0 ? llmIntegs[0] : null;
    const baseUrl = llmInteg?.baseUrl || process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
    const apiKey = llmInteg?.key || '';
    const model = llmInteg?.model || EMBEDDING_MODEL;
    const url = (baseUrl || process.env.OLLAMA_BASE_URL || 'https://ollama.com/api').replace(/\/chat$/, '').replace(/\/$/, '');
    const embedUrl = `${url}/embed`;

    const response = await fetch(embedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: model || EMBEDDING_MODEL,
        input: text,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && !authErrorLogged) {
        authErrorLogged = true;
        embeddingsDisabled = true;
        console.error(`[Embeddings] Auth error (${response.status}) — embedding API not available. Disabling vector search, falling back to TF-IDF only.`);
      }
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    const vector = data.embeddings?.[0] || data.embedding || data.data?.[0]?.embedding;

    if (!vector || !Array.isArray(vector)) {
      throw new Error('No embedding vector in response');
    }

    updateCache(cacheKey, vector);
    return vector;
  } catch (err) {
    if (embeddingsDisabled && !authErrorLogged) {
      // already logged
    } else if (!embeddingsDisabled) {
      console.error(`[Embeddings] Failed for text "${text.substring(0, 50)}...": ${err.message}`);
    }
    return null;
  }
}

async function getEmbeddings(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(t => getEmbedding(t)));
    results.push(...batchResults);
  }
  return results;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function saveEmbedding(sourceId, docId, text, vector) {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM embeddings WHERE source_id = ? AND doc_id = ?',
      [sourceId, docId]
    );

    if (existing.length > 0) {
      await pool.execute(
        'UPDATE embeddings SET text = ?, vector = ?, model = ?, updated_at = NOW() WHERE source_id = ? AND doc_id = ?',
        [text.substring(0, 2000), JSON.stringify(vector), EMBEDDING_MODEL, sourceId, docId]
      );
    } else {
      await pool.execute(
        'INSERT INTO embeddings (source_id, doc_id, text, vector, model) VALUES (?, ?, ?, ?, ?)',
        [sourceId, docId, text.substring(0, 2000), JSON.stringify(vector), EMBEDDING_MODEL]
      );
    }
  } catch (err) {
    console.error(`[Embeddings] Failed to save embedding for ${sourceId}:${docId}:`, err.message);
  }
}

async function searchEmbeddings(queryVector, sourceIds, topK = 8) {
  try {
    let query, params;

    if (sourceIds && sourceIds.length > 0) {
      const placeholders = sourceIds.map(() => '?').join(',');
      query = `SELECT e.* FROM embeddings e WHERE e.source_id IN (${placeholders})`;
      params = [...sourceIds];
    } else {
      query = 'SELECT e.* FROM embeddings e';
      params = [];
    }

    const [rows] = await pool.execute(query, params);

    const scored = rows.map(row => {
      let vector;
      try {
        vector = typeof row.vector === 'string' ? JSON.parse(row.vector) : row.vector;
      } catch {
        return null;
      }
      const score = cosineSimilarity(queryVector, vector);
      return { ...row, vector: undefined, score };
    }).filter(Boolean);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  } catch (err) {
    console.error('[Embeddings] Search failed:', err.message);
    return [];
  }
}

async function getSourceEmbeddingStats(sourceId) {
  try {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as count FROM embeddings WHERE source_id = ?',
      [sourceId]
    );
    return rows[0].count;
  } catch {
    return 0;
  }
}

async function deleteSourceEmbeddings(sourceId) {
  try {
    await pool.execute('DELETE FROM embeddings WHERE source_id = ?', [sourceId]);
  } catch (err) {
    console.error(`[Embeddings] Failed to delete embeddings for ${sourceId}:`, err.message);
  }
}

function clearCache() {
  embeddingCache.clear();
}

module.exports = {
  getEmbedding,
  getEmbeddings,
  cosineSimilarity,
  saveEmbedding,
  searchEmbeddings,
  getSourceEmbeddingStats,
  deleteSourceEmbeddings,
  clearCache,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  isEmbeddingsAvailable: () => !embeddingsDisabled,
  resetEmbeddings: () => { embeddingsDisabled = false; authErrorLogged = false; },
};