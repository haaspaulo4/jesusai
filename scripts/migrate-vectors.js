require('dotenv').config();
const path = require('path');
const fs = require('fs');

process.chdir(path.join(__dirname, '..'));

const { pool } = require('../src/db');
const { vectorStore } = require('../src/embeddings/vectorStore');
const { getAllEnabledSources, getKnowledgeConfig } = require('../src/knowledge/config');
const { KnowledgeStore } = require('../src/knowledge/store');
const { clearCache } = require('../src/knowledge/config');

const args = process.argv.slice(2);
const sourceId = args[0] || null;
const forceReindex = args.includes('--force') || args.includes('-f');

async function migrate() {
  console.log('='.repeat(60));
  console.log('  MetaPersona.AI — Vector Embedding Migration');
  console.log('  Model:', process.env.EMBEDDING_MODEL || 'nomic-embed-text');
  console.log('  Auto-index:', process.env.VECTOR_AUTO_INDEX !== 'false' ? 'enabled' : 'disabled');
  console.log('='.repeat(60));
  console.log();

  try {
    await vectorStore.initialize();
  } catch (err) {
    console.error('Failed to initialize vector store. Make sure DB is running and migrations are applied.');
    console.error(err.message);
    process.exit(1);
  }

  let sources;
  if (sourceId) {
    const config = getKnowledgeConfig(sourceId);
    if (!config) {
      console.error(`Source not found: ${sourceId}`);
      process.exit(1);
    }
    sources = [config];
  } else {
    sources = getAllEnabledSources();
  }

  console.log(`\nFound ${sources.length} source(s) to index.\n`);

  let totalIndexed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const source of sources) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Source: ${source.name} (${source.id})`);
    console.log(`${'─'.repeat(50)}`);

    if (!forceReindex) {
      const existingCount = await vectorStore.getSourceEmbeddingStats
        ? await vectorStore.getSourceEmbeddingStats(source.id) : 0;

      if (existingCount > 0) {
        console.log(`  Already has ${existingCount} embeddings. Use --force to reindex.`);
        totalSkipped++;
        continue;
      }
    } else {
      console.log('  Force reindex: deleting existing embeddings...');
      await vectorStore.deleteSourceEmbeddings
        ? await vectorStore.deleteSourceEmbeddings(source.id)
        : null;
    }

    const result = await vectorStore.indexSource(source.id);
    if (result) {
      totalIndexed += result.indexed;
      totalSkipped += result.skipped;
      totalFailed += result.failed;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Migration Complete!');
  console.log('='.repeat(60));
  console.log(`  Total indexed: ${totalIndexed}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Failed: ${totalFailed}`);
  console.log();

  const stats = await vectorStore.getStats();
  console.log('  Vector DB Stats:');
  for (const src of stats.sources || []) {
    console.log(`    ${src.sourceId}: ${src.count} embeddings`);
  }
  console.log(`  Total: ${stats.totalEmbeddings} embeddings`);
  console.log();

  await pool.end();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});