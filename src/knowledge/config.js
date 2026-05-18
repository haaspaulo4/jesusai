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
      'pt-BR': 'VERSÍCULOS BÍBLICOS ENCONTRADOS (CONTEXTO PARA ESTA RESPOSTA):\n{context}\n\nIMPORTANTE: Os versículos acima JÁ ESTÃO DISPONÍVEIS no contexto. NÃO diga "deixe-me buscar", "vou procurar" ou "espere enquanto busco" — USE os versículos diretamente na sua resposta, citando livro, capítulo e versículo.',
      'en-US': 'BIBLE VERSES FOUND (CONTEXT FOR THIS RESPONSE):\n{context}\n\nIMPORTANT: The verses above are ALREADY AVAILABLE in context. Do NOT say "let me search" or "I will look up" — USE the verses directly in your response, citing book, chapter and verse.',
      'es-ES': 'VERSÍCULOS BÍBLICOS ENCONTRADOS (CONTEXTO PARA ESTA RESPUESTA):\n{context}\n\nIMPORTANTE: Los versículos arriba YA ESTÁN DISPONIBLES en el contexto. NO diga "déjame buscar" o "voy a buscar" — USE los versículos directamente en su respuesta, citando libro, capítulo y versículo.',
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
  {
    id: 'lang-falsos-cognatos-en',
    name: 'Falsos Cognatos Inglês-Português',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'falsos-cognatos-en.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'falsos-cognatos-en_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'FALSOS COGNATOS INGLÊS↔PORTUGUÊS ENCONTRADOS:\n{context}\n\nAVISO: Estes são falsos cognatos — palavras que parecem iguais mas têm significado diferente!',
      'en-US': 'ENGLISH↔PORTUGUESE FALSE COGNATES FOUND:\n{context}\n\nWARNING: These are false cognates — words that look similar but have different meanings!',
      'es-ES': 'FALSOS COGNADOS INGLÉS↔PORTUGUÉS ENCONTRADOS:\n{context}\n\nAVISO: Estos son falsos cognados — palabras que parecen iguales pero tienen significado diferente!',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-phrasal-verbs-en',
    name: 'Phrasal Verbs Inglês',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'phrasal-verbs-en.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'phrasal-verbs-en_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'PHRASAL VERBS INGLÊS ENCONTRADOS:\n{context}\n\nUse estes phrasal verbs para explicar e dar exemplos.',
      'en-US': 'ENGLISH PHRASAL VERBS FOUND:\n{context}\n\nUse these phrasal verbs to explain and give examples.',
      'es-ES': 'PHRASAL VERBS DE INGLÉS ENCONTRADOS:\n{context}\n\nUse estos phrasal verbs para explicar y dar ejemplos.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-expressoes-idiomaticas-en',
    name: 'Expressões Idiomáticas Inglês',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'expressoes-idiomaticas-en.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'expressoes-idiomaticas-en_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'EXPRESSÕES IDIOMÁTICAS INGLÊS ENCONTRADAS:\n{context}\n\nUse estas expressões para explicar significado, origem e exemplos de uso.',
      'en-US': 'ENGLISH IDIOMATIC EXPRESSIONS FOUND:\n{context}\n\nUse these expressions to explain meaning, origin and usage examples.',
      'es-ES': 'EXPRESIONES IDIOMÁTICAS DE INGLÉS ENCONTRADAS:\n{context}\n\nUse estas expresiones para explicar significado, origen y ejemplos de uso.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-gramatica-en',
    name: 'Gramática Inglês',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'gramatica-en.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'gramatica-en_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'GRAMÁTICA INGLESA ENCONTRADA:\n{context}\n\nUse estas regras gramaticais para explicar, corrigir e dar exemplos.',
      'en-US': 'ENGLISH GRAMMAR FOUND:\n{context}\n\nUse these grammar rules to explain, correct and give examples.',
      'es-ES': 'GRAMÁTICA INGLESA ENCONTRADA:\n{context}\n\nUse estas reglas gramaticales para explicar, corregir y dar ejemplos.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-verbos-irregulares-en',
    name: 'Verbos Irregulares Inglês',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'verbos-irregulares-en.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'verbos-irregulares-en_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'VERBOS IRREGULARES INGLÊS ENCONTRADOS:\n{context}\n\nUse estes verbos para explicação, conjugação e exemplos.',
      'en-US': 'ENGLISH IRREGULAR VERBS FOUND:\n{context}\n\nUse these verbs for explanation, conjugation and examples.',
      'es-ES': 'VERBOS IRREGULARES DE INGLÉS ENCONTRADOS:\n{context}\n\nUse estos verbos para explicación, conjugación y ejemplos.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-vocabulario-en',
    name: 'Vocabulário Inglês por Nível',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'vocabulario-en.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'vocabulario-en_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'VOCABULÁRIO INGLÊS ENCONTRADO:\n{context}\n\nUse este vocabulário para explicação, exemplos e contexto de uso.',
      'en-US': 'ENGLISH VOCABULARY FOUND:\n{context}\n\nUse this vocabulary for explanation, examples and usage context.',
      'es-ES': 'VOCABULARIO DE INGLÉS ENCONTRADO:\n{context}\n\nUse este vocabulario para explicación, ejemplos y contexto de uso.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-giria-en',
    name: 'Gírias e Abreviações Inglês',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'giria-abreviacoes-en.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'giria-abreviacoes-en_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'GÍRIAS E ABREVIAÇÕES INGLÊS ENCONTRADAS:\n{context}\n\nUse estas gírias e abreviações para explicar significado, contexto e registros de uso.',
      'en-US': 'ENGLISH SLANG & ABBREVIATIONS FOUND:\n{context}\n\nUse these slang terms and abbreviations to explain meaning, context and register.',
      'es-ES': 'GIRIAS Y ABREVIACIONES DE INGLÉS ENCONTRADAS:\n{context}\n\nUse estas girias y abreviaciones para explicar significado, contexto y registros de uso.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-falsos-cognatos-es',
    name: 'Falsos Cognatos Espanhol-Português',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'falsos-cognatos-es.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'falsos-cognatos-es_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'FALSOS COGNATOS ESPANHOL↔PORTUGUÊS ENCONTRADOS:\n{context}\n\nAVISO: Estes são falsos cognatos — palavras que parecem iguais mas têm significado diferente!',
      'en-US': 'SPANISH↔PORTUGUESE FALSE COGNATES FOUND:\n{context}\n\nWARNING: These are false cognates!',
      'es-ES': 'FALSOS COGNADOS ESPAÑOL↔PORTUGUÉS ENCONTRADOS:\n{context}\n\nAVISO: Estos son falsos cognados!',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-gramatica-es',
    name: 'Gramática Espanhol',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'gramatica-es.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'gramatica-es_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'GRAMÁTICA ESPANHOLA ENCONTRADA:\n{context}\n\nUse estas regras gramaticais para explicar, corrigir e dar exemplos.',
      'en-US': 'SPANISH GRAMMAR FOUND:\n{context}\n\nUse these grammar rules to explain, correct and give examples.',
      'es-ES': 'GRAMÁTICA ESPAÑOLA ENCONTRADA:\n{context}\n\nUse estas reglas gramaticales para explicar, corregir y dar ejemplos.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-falsos-cognatos-fr',
    name: 'Falsos Cognatos Francês-Português',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'falsos-cognatos-fr.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'falsos-cognatos-fr_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'FALSOS COGNATOS FRANCÊS↔PORTUGUÊS ENCONTRADOS:\n{context}\n\nAVISO: Estes são falsos cognatos!',
      'en-US': 'FRENCH↔PORTUGUESE FALSE COGNATES FOUND:\n{context}\n\nWARNING: These are false cognates!',
      'es-ES': 'FALSOS COGNADOS FRANCÉS↔PORTUGUÉS ENCONTRADOS:\n{context}\n\nAVISO: Estos son falsos cognados!',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
  },
  {
    id: 'lang-gramatica-fr',
    name: 'Gramática Francês',
    type: 'json',
    enabled: true,
    personaFilter: ['tutor-idiomas'],
    dataPath: path.join(__dirname, '..', '..', 'data', 'languages', 'gramatica-fr.json'),
    indexPath: path.join(__dirname, '..', '..', 'data', 'languages', 'gramatica-fr_index.json'),
    searchFields: ['reference', 'text'],
    defaultTopK: 5,
    contextTemplate: {
      'pt-BR': 'GRAMÁTICA FRANCESA ENCONTRADA:\n{context}\n\nUse estas regras gramaticais para explicar, corrigir e dar exemplos.',
      'en-US': 'FRENCH GRAMMAR FOUND:\n{context}\n\nUse these grammar rules to explain, correct and give examples.',
      'es-ES': 'GRAMÁTICA FRANCESA ENCONTRADA:\n{context}\n\nUse estas reglas gramaticales para explicar, corregir y dar ejemplos.',
    },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
    ingester: 'json',
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