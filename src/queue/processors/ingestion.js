require('dotenv').config();
const { QUEUE_NAMES, createWorker, addJob, isAvailable } = require('../queue');

async function processIngestionJob(job) {
  const { sourceId, force } = job.data;
  const { runIngestion } = require('../../knowledge/ingester');
  const { getKnowledgeConfig, getAllEnabledSources } = require('../../knowledge/config');

  console.log(`[IngestionProcessor] Starting ingestion for: ${sourceId || 'all sources'}`);

  try {
    const sources = sourceId
      ? [getKnowledgeConfig(sourceId)].filter(Boolean)
      : getAllEnabledSources();

    await runIngestion(sources);

    if (isAvailable()) {
      const { vectorStore } = require('../../embeddings/vectorStore');
      if (vectorStore.enabled) {
        for (const source of sources) {
          await addJob(QUEUE_NAMES.EMBEDDING, {
            type: 'index_source',
            sourceId: source.id,
            force: force || false,
          });
        }
      }
    }

    return { success: true, sources: sources.map(s => s.id) };
  } catch (err) {
    console.error(`[IngestionProcessor] Failed:`, err.message);
    throw err;
  }
}

async function processEmbeddingJob(job) {
  const { type, sourceId, force } = job.data;
  const { vectorStore } = require('../../embeddings/vectorStore');

  console.log(`[EmbeddingProcessor] ${type}: ${sourceId || 'all'}`);

  try {
    if (type === 'index_source') {
      const result = await vectorStore.indexSource(sourceId);
      return { success: true, result };
    } else if (type === 'index_all') {
      const results = await vectorStore.indexAllSources();
      return { success: true, results };
    }
    return { error: `Unknown embedding type: ${type}` };
  } catch (err) {
    console.error(`[EmbeddingProcessor] Failed:`, err.message);
    throw err;
  }
}

function startIngestionWorkers() {
  const { createWorker, isAvailable } = require('../queue');
  if (!isAvailable()) {
    console.log('[IngestionProcessor] Skipped — Redis unavailable');
    return;
  }
  createWorker(QUEUE_NAMES.INGESTION, processIngestionJob, { concurrency: 1 });
  createWorker(QUEUE_NAMES.EMBEDDING, processEmbeddingJob, { concurrency: 1 });
  console.log('[IngestionProcessor] Workers started');
}

module.exports = {
  processIngestionJob,
  processEmbeddingJob,
  startIngestionWorkers,
};