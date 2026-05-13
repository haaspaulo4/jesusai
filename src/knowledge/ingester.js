const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const INGESTERS = {
  bible: require('./sources/bible'),
  json: require('./sources/json'),
  text: require('./sources/text'),
  pdf: require('./sources/pdf'),
  docx: require('./sources/docx'),
  image: require('./sources/image'),
  audio: require('./sources/audio'),
  api: require('./sources/api'),
};

async function runIngestion(sourceConfigs) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const { getAllEnabledSources } = require('./config');
  const sources = sourceConfigs || getAllEnabledSources();

  for (const source of sources) {
    if (!source.enabled) continue;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Ingesting: ${source.name} (${source.id})`);
    console.log(`${'='.repeat(60)}\n`);

    const ingester = INGESTERS[source.ingester];
    if (!ingester) {
      console.error(`Unknown ingester type: ${source.ingester}. Skipping ${source.id}.`);
      continue;
    }

    try {
      const documents = await ingester(source);

      if (!documents || documents.length === 0) {
        console.warn(`No documents ingested for ${source.id}. Skipping.`);
        continue;
      }

      const outputPath = source.dataPath || path.join(DATA_DIR, `${source.id}_documents.json`);
      const uniqueMap = new Map();

      const existing = fs.existsSync(outputPath)
        ? (() => { try { return JSON.parse(fs.readFileSync(outputPath, 'utf-8')); } catch { return []; } })()
        : [];

      for (const doc of existing) {
        const key = doc.reference || doc.id || `${doc.book}_${doc.chapter}_${doc.verse}`;
        if (doc.text && doc.text.trim().length > 0 && !uniqueMap.has(key)) {
          uniqueMap.set(key, doc);
        }
      }

      for (const doc of documents) {
        const key = doc.reference || doc.id || `${doc.book}_${doc.chapter}_${doc.verse}`;
        if (doc.text && doc.text.trim().length > 0 && !uniqueMap.has(key)) {
          uniqueMap.set(key, doc);
        }
      }

      const allDocs = Array.from(uniqueMap.values());
      fs.writeFileSync(outputPath, JSON.stringify(allDocs), 'utf-8');
      console.log(`\nSaved ${allDocs.length} documents to ${outputPath}`);

      const { KnowledgeStore } = require('./store');
      const store = new KnowledgeStore({ ...source, dataPath: outputPath });
      store.buildIndex();
      console.log(`Search index rebuilt for ${source.id}.\n`);

      console.log(`Done! ${allDocs.length} documents ready for search from ${source.name}.`);
    } catch (err) {
      console.error(`Failed to ingest ${source.id}:`, err.message);
    }
  }
}

async function ingestUploadedFile(filePath, sourceId, fileType) {
  const { getKnowledgeConfig } = require('./config');

  const ingesterMap = {
    'application/pdf': 'pdf',
    'pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'docx': 'docx',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/webp': 'image',
    'image/tiff': 'image',
    'image/bmp': 'image',
    'image': 'image',
    'audio/mpeg': 'audio',
    'audio/mp3': 'audio',
    'audio/wav': 'audio',
    'audio/ogg': 'audio',
    'audio/webm': 'audio',
    'audio/m4a': 'audio',
    'audio/flac': 'audio',
    'audio': 'audio',
    'application/json': 'json',
    'json': 'json',
    'text/plain': 'text',
    'text/markdown': 'text',
    'text': 'text',
  };

  const ingesterType = ingesterMap[fileType] || path.extname(filePath).replace('.', '') || 'text';
  const ingester = INGESTERS[ingesterType];

  if (!ingester) {
    throw new Error(`Unsupported file type: ${fileType} (resolved to: ${ingesterType})`);
  }

  const sourceConfig = {
    filePath,
    id: sourceId,
    name: sourceId,
    chunkSize: 1500,
    chunkOverlap: 300,
    searchFields: ['reference', 'text'],
    contextTemplate: {
      'pt-BR': 'CONTEXTO ENCONTRADO:\n{context}\n\nUse esta informação como base para sua resposta.',
      'en-US': 'CONTEXT FOUND:\n{context}\n\nUse this information as the basis for your response.',
      'es-ES': 'CONTEXTO ENCONTRADO:\n{context}\n\nUsa esta información como base para tu respuesta.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
  };

  const documents = await ingester(sourceConfig);
  return documents;
}

module.exports = { runIngestion, ingestUploadedFile, INGESTERS };