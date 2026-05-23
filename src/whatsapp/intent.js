const INTENT_PATTERNS = [
  { intent: 'order', priority: 10, patterns: [
    /\b(?:quero|queremos|queria|gostaria|de|pedir?|fazer um pedido|pedido|montar|armar)\b.*\b(?:pedido|carrinho|pizza|hamburguer|lanche|comida|refeicao|janta|almoco|breakfast)\b/i,
    /\b(?:montar|armar|montando|armando)\b.*\b(?:pedido|carrinho)\b/i,
    /\b(?:cardapio|cat[aá]logo|menu|opções de)\b/i,
    /\b(?:pre[cç]o|custo|valor|tem quanto|tá quanto|quanto tá|quanto é)\b.*\b(?:do|a)?\b.*\b(?:pizza|hamburguer|sandu[ií]che|lanche|bebida|refrigerante|suco)\b/i,
    /\b(?:delivery|entrega|delivery|drive|retirada|balc[cç]ão|buscar|vou buscar|eu busco| buscar)\b/i,
    /\b(?:chocolate|pizza|hamburguer|sandu[ií]che|bebida|refrigerante|suco|refrigerante|coca|coca-cola|fanta|sprite|guaran[á]|tuba[ií]ne|suco de)\b/i,
    /\b(?:tem\s+(?:n[ao]|um|uma|algum|alguma)|n[aã]o tem|tem\?)\b/i,
    /\b(?:montar meu pedido|meu pedido|pedido|pedir|comprar)\b/i,
  ]},
  { intent: 'location', priority: 5, patterns: [
    /\b(?:onde fica|como chegar|endere[cç]o da|localiza[cç][ãa]o)\b.*\b(?:loja|estabelecimento|restaurante|pizzaria|burger)\b/i,
    /\b(?:me mostra|no mapa|google maps|waze|localiza[cç][ãa]o)\b/i,
  ]},
  { intent: 'contact', priority: 4, patterns: [
    /\b(?:telefone|ligar|contato|whatsapp|zap|n[uú]mero|celular)\b/i,
  ]},
  { intent: 'poll', priority: 3, patterns: [
    /\b(?:enquete|vota[cç][ãa]o|op[cç][ãa]o)\b/i,
  ]},
  { intent: 'image', priority: 2, patterns: [
    /\b(?:envia|foto|imagem|mostra|picture|image|foto do|fboto)\b/i,
  ]},
  { intent: 'video', priority: 2, patterns: [
    /\b(?:vídeo|video|clipe|reel| reels)\b/i,
  ]},
  { intent: 'audio', priority: 2, patterns: [
    /\b(?:audio|música|podcast|voice|note|nota de voz)\b/i,
  ]},
  { intent: 'buttons', priority: 2, patterns: [
    /\b(?:botao|button|op[cç][ãa]o|menu)\b/i,
  ]},
  { intent: 'list', priority: 2, patterns: [
    /\b(?:lista|lista de|listar|list)\b/i,
  ]},
];

const BRAZILIAN_CITIES = {
  'são paulo': { lat: -23.5505, lon: -46.6333 },
  'rio de janeiro': { lat: -22.9068, lon: -43.1729 },
  'belo horizonte': { lat: -19.9167, lon: -43.9345 },
  'salvador': { lat: -12.9714, lon: -38.5014 },
  'curitiba': { lat: -25.4284, lon: -49.2733 },
  'fortaleza': { lat: -3.7172, lon: -38.5433 },
  'brasília': { lat: -15.7942, lon: -47.8835 },
  'recife': { lat: -8.0476, lon: -34.8770 },
  'porto alegre': { lat: -30.0346, lon: -51.2177 },
  'manaus': { lat: -3.1190, lon: -60.0217 },
  'belém': { lat: -1.4558, lon: -48.5039 },
  'goiânia': { lat: -16.6799, lon: -49.2550 },
  'são bernardo do campo': { lat: -23.6880, lon: -46.5655 },
  'santo andré': { lat: -23.6523, lon: -46.5085 },
  'são caetano do sul': { lat: -23.6213, lon: -46.5425 },
  'guarulhos': { lat: -23.4541, lon: -46.5337 },
  'campinas': { lat: -22.9073, lon: -47.0628 },
  'ribeirão preto': { lat: -21.1775, lon: -47.8103 },
  'sorocaba': { lat: -23.5017, lon: -47.4580 },
  'são José dos campos': { lat: -23.1791, lon: -45.8842 },
  'maceió': { lat: -9.6658, lon: -35.7353 },
  'alagoas': { lat: -9.5713, lon: -36.7820 },
  'natal': { lat: -5.7945, lon: -35.2110 },
  'João pessoa': { lat: -7.1195, lon: -34.8450 },
  'aracaju': { lat: -10.9472, lon: -37.0731 },
  'teresina': { lat: -5.0892, lon: -42.8019 },
  'cuiabá': { lat: -15.6014, lon: -56.0979 },
  'campo grande': { lat: -20.4697, lon: -54.6201 },
  'florianópolis': { lat: -27.5954, lon: -48.5480 },
  'vitória': { lat: -20.3155, lon: -40.3128 },
  'rio branco': { lat: -9.9750, lon: -67.8243 },
  'porto velho': { lat: -8.7619, lon: -63.9039 },
  'boqueirão': { lat: -7.4856, lon: -36.0329 },
  'patos': { lat: -7.0230, lon: -37.2770 },
  'campina grande': { lat: -7.2302, lon: -35.8811 },
};

function detectIntent(text) {
  if (!text || typeof text !== 'string') return null;
  
  const normalizedText = text.trim().toLowerCase();
  
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        return { intent, confidence: 0.8 };
      }
    }
  }
  
  return null;
}

function extractLocation(text) {
  if (!text || typeof text !== 'string') return null;
  
  const normalizedText = text.toLowerCase();
  
  for (const [city, coords] of Object.entries(BRAZILIAN_CITIES)) {
    const patterns = [
      new RegExp(`\\b${city}\\b`, 'i'),
    ];
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        return { city, ...coords };
      }
    }
  }
  
  return null;
}

function getLocationByCity(cityName) {
  return BRAZILIAN_CITIES[cityName.toLowerCase()] || null;
}

function getAllCities() {
  return Object.keys(BRAZILIAN_CITIES);
}

function matchIntent(text, intentName) {
  if (!text || typeof text !== 'string') return false;
  
  const entry = INTENT_PATTERNS.find(i => i.intent === intentName);
  if (!entry) return false;
  
  const normalizedText = text.trim().toLowerCase();
  for (const pattern of entry.patterns) {
    if (pattern.test(normalizedText)) return true;
  }
  return false;
}

module.exports = {
  detectIntent,
  extractLocation,
  getLocationByCity,
  getAllCities,
  matchIntent,
  INTENT_PATTERNS,
};