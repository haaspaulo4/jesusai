const path = require('path');
const fs = require('fs');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'data');
const UPLOADS_DIR = path.join(KNOWLEDGE_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DEFAULT_SOURCES = [
  {
    id: 'bible-pt-br',
    name: 'Bíblia Sagrada',
    nameEn: 'Holy Bible',
    nameEs: 'Santa Biblia',
    description: 'Bíblia completa — Novo Testamento (BLT) e Antigo Testamento (Almeida)',
    type: 'json-verses',
    enabled: true,

    dataPath: path.join(__dirname, '..', '..', 'data', 'bible_verses.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'bible_index.json'),

    verseFormat: 'reference',
    referencePattern: /^(.+?)\s+(\d+):(\d+)$/,
    searchFields: ['reference', 'text'],
    displayField: 'text',
    referenceField: 'reference',

    defaultTopK: 8,
    contextTemplate: {
      'pt-BR': 'VERSÍCULOS BÍBLICOS ENCONTRADOS (CONTEXTO PARA ESTA RESPOSTA):\n{context}\n\nUse estes versículos como base para sua resposta. Cite-os quando pertinente.',
      'en-US': 'BIBLE VERSES FOUND (CONTEXT FOR THIS RESPONSE):\n{context}\n\nUse these verses as the basis for your response. Cite them when relevant.',
      'es-ES': 'VERSÍCULOS BÍBLICOS ENCONTRADOS (CONTEXTO PARA ESTA RESPUESTA):\n{context}\n\nUsa estos versículos como base para tu respuesta. Cítalos cuando sea pertinente.',
    },

    sourceFormat: (verses) => verses.map(v => `${v.reference}: "${v.text}"`).join('\n'),

    ingester: 'bible',
  },
  {
    id: 'imersao-vendas-mod1',
    name: 'Imersão Prospecção - Módulo 1: Onboarding',
    type: 'pdf',
    enabled: true,
    filePath: path.join(__dirname, '..', '..', 'imersao-prospeccao-vendas', 'modulo-01-onboarding.pdf'),
    dataPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod1_documents.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod1_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 6,
    contextTemplate: {
      'pt-BR': 'CONHECIMENTO DE VENDAS ENCONTRADO:\n{context}\n\nUse esta informação para responder.',
      'en-US': 'SALES KNOWLEDGE FOUND:\n{context}\n\nUse this information to respond.',
      'es-ES': 'CONOCIMIENTO DE VENTAS ENCONTRADO:\n{context}\n\nUsa esta información para responder.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'pdf',
  },
  {
    id: 'imersao-vendas-mod2',
    name: 'Imersão Prospecção - Módulo 2: Abordagem',
    type: 'pdf',
    enabled: true,
    filePath: path.join(__dirname, '..', '..', 'imersao-prospeccao-vendas', 'modulo-02-abordagem.pdf'),
    dataPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod2_documents.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod2_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 6,
    contextTemplate: {
      'pt-BR': 'CONHECIMENTO DE VENDAS ENCONTRADO:\n{context}\n\nUse esta informação para responder.',
      'en-US': 'SALES KNOWLEDGE FOUND:\n{context}\n\nUse this information to respond.',
      'es-ES': 'CONOCIMIENTO DE VENTAS ENCONTRADO:\n{context}\n\nUsa esta información para responder.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'pdf',
  },
  {
    id: 'imersao-vendas-mod3',
    name: 'Imersão Prospecção - Módulo 3: Aquisição',
    type: 'pdf',
    enabled: true,
    filePath: path.join(__dirname, '..', '..', 'imersao-prospeccao-vendas', 'modulo-03-aquisicao.pdf'),
    dataPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod3_documents.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod3_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 6,
    contextTemplate: {
      'pt-BR': 'CONHECIMENTO DE VENDAS ENCONTRADO:\n{context}\n\nUse esta informação para responder.',
      'en-US': 'SALES KNOWLEDGE FOUND:\n{context}\n\nUse this information to respond.',
      'es-ES': 'CONOCIMIENTO DE VENTAS ENCONTRADO:\n{context}\n\nUsa esta información para responder.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'pdf',
  },
  {
    id: 'imersao-vendas-mod4',
    name: 'Imersão Prospecção - Módulo 4: Prospecção',
    type: 'pdf',
    enabled: true,
    filePath: path.join(__dirname, '..', '..', 'imersao-prospeccao-vendas', 'modulo-04-prospeccao.pdf'),
    dataPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod4_documents.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod4_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 6,
    contextTemplate: {
      'pt-BR': 'CONHECIMENTO DE VENDAS ENCONTRADO:\n{context}\n\nUse esta informação para responder.',
      'en-US': 'SALES KNOWLEDGE FOUND:\n{context}\n\nUse this information to respond.',
      'es-ES': 'CONOCIMIENTO DE VENTAS ENCONTRADO:\n{context}\n\nUsa esta información para responder.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'pdf',
  },
  {
    id: 'imersao-vendas-mod5',
    name: 'Imersão Prospecção - Módulo 5: Decolagem',
    type: 'pdf',
    enabled: true,
    filePath: path.join(__dirname, '..', '..', 'imersao-prospeccao-vendas', 'modulo-05-decolagem.pdf'),
    dataPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod5_documents.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'imersao-vendas-mod5_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 6,
    contextTemplate: {
      'pt-BR': 'CONHECIMENTO DE VENDAS ENCONTRADO:\n{context}\n\nUse esta informação para responder.',
      'en-US': 'SALES KNOWLEDGE FOUND:\n{context}\n\nUse this information to respond.',
      'es-ES': 'CONOCIMIENTO DE VENTAS ENCONTRADO:\n{context}\n\nUsa esta información para responder.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'pdf',
  },
];

function loadUploadedSources() {
  const registryPath = path.join(UPLOADS_DIR, 'sources_registry.json');
  if (!fs.existsSync(registryPath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    return raw.filter(s => s.enabled !== false);
  } catch {
    return [];
  }
}

function saveUploadedSource(sourceConfig) {
  const registryPath = path.join(UPLOADS_DIR, 'sources_registry.json');
  let sources = [];
  if (fs.existsSync(registryPath)) {
    try {
      sources = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch {}
  }

  const existingIdx = sources.findIndex(s => s.id === sourceConfig.id);
  if (existingIdx >= 0) {
    sources[existingIdx] = { ...sources[existingIdx], ...sourceConfig };
  } else {
    sources.push(sourceConfig);
  }

  fs.writeFileSync(registryPath, JSON.stringify(sources, null, 2), 'utf-8');
  invalidateCache();
  return sourceConfig;
}

function removeUploadedSource(sourceId) {
  const registryPath = path.join(UPLOADS_DIR, 'sources_registry.json');
  let sources = [];
  if (fs.existsSync(registryPath)) {
    try {
      sources = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    } catch {}
  }

  sources = sources.filter(s => s.id !== sourceId);
  fs.writeFileSync(registryPath, JSON.stringify(sources, null, 2), 'utf-8');
  invalidateCache();
}

const KNOWLEDGE_SOURCES = [...DEFAULT_SOURCES];

function getKnowledgeConfig(sourceId) {
  const all = getAllEnabledSources();
  if (sourceId) {
    return all.find(s => s.id === sourceId && s.enabled) || null;
  }
  return all;
}

function getPrimarySource() {
  const all = getAllEnabledSources();
  return all[0] || null;
}

let _cachedSources = null;
let _cacheTime = 0;
const CACHE_TTL = 30000;

function getAllEnabledSources() {
  const now = Date.now();
  if (_cachedSources && (now - _cacheTime) < CACHE_TTL) {
    return _cachedSources;
  }

  const all = [...KNOWLEDGE_SOURCES, ...loadUploadedSources()];
  _cachedSources = all.filter(s => s.enabled !== false);
  _cacheTime = now;
  return _cachedSources;
}

function getAllSources() {
  return [...KNOWLEDGE_SOURCES, ...loadUploadedSources()];
}

function invalidateCache() {
  _cachedSources = null;
  _cacheTime = 0;
  const { clearStoreCache } = require('./store');
  clearStoreCache();
}

module.exports = {
  KNOWLEDGE_SOURCES,
  KNOWLEDGE_DIR,
  UPLOADS_DIR,
  getKnowledgeConfig,
  getPrimarySource,
  getAllEnabledSources,
  getAllSources,
  saveUploadedSource,
  removeUploadedSource,
  invalidateCache,
};