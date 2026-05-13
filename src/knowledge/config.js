const path = require('path');

const KNOWLEDGE_SOURCES = [
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
];

function getKnowledgeConfig(sourceId) {
  if (sourceId) {
    return KNOWLEDGE_SOURCES.find(s => s.id === sourceId && s.enabled) || null;
  }
  return KNOWLEDGE_SOURCES.filter(s => s.enabled);
}

function getPrimarySource() {
  return KNOWLEDGE_SOURCES.find(s => s.enabled) || null;
}

function getAllEnabledSources() {
  return KNOWLEDGE_SOURCES.filter(s => s.enabled);
}

module.exports = {
  KNOWLEDGE_SOURCES,
  getKnowledgeConfig,
  getPrimarySource,
  getAllEnabledSources,
};