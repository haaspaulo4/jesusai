const { getSetting } = require('../settings');

const STOP_WORDS_PT = new Set([
  'a', 'o', 'e', 'é', 'de', 'do', 'da', 'em', 'um', 'uma', 'que', 'não', 'se', 'na',
  'por', 'com', 'os', 'as', 'no', 'ao', 'da', 'das', 'dos', 'das', 'para', 'mas',
  'ou', 'mais', 'como', 'foi', 'ser', 'ter', 'seu', 'sua', 'são', 'está', 'vai',
  'pode', 'tem', 'só', 'já', 'ainda', 'muito', 'bem', 'então', 'também', 'isso',
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'a', 'an', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'into', 'about', 'like', 'through', 'over', 'before', 'after',
  'between', 'under', 'above', 'this', 'that', 'these', 'those', 'it', 'its',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'also', 'now', 'here', 'there', 'el', 'la', 'los', 'las',
  'en', 'un', 'una', 'y', 'o', 'pero', 'si', 'no', 'su', 'es', 'son', 'ser',
  'estar', 'tener', 'hacer', 'poder', 'decir', 'ir', 'ver', 'dar', 'saber',
]);

function compressWhitespace(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^ +| +$/gm, '')
    .trim();
}

function removeRedundancy(text) {
  let result = text;
  result = result.replace(/(\b\w+\b)(\s+\1){2,}/gi, '$1');
  result = result.replace(/\b(para|para que|a fim de|com o objetivo de)\b.*?(?=[.;,\n])/gi, '');
  result = result.replace(/\b(in other words|ou seja|em outras palavras|isto é|ou seja)\b[.,;:]*\s*/gi, '');
  result = result.replace(/\b(note that|note-se que|observação|atenção|importante)\b[.:]?\s*/gi, '');
  return result;
}

function compressMarkdown(text) {
  let result = text;
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  result = result.replace(/\*{2}(.+?)\*{2}/g, '$1');
  result = result.replace(/\*(.+?)\*/g, '$1');
  result = result.replace(/_{2}(.+?)_{2}/g, '$1');
  result = result.replace(/_(.+?)_/g, '$1');
  result = result.replace(/`{3}[\s\S]*?`{3}/g, (m) => m.replace(/`{3}\w*\n?/g, '').replace(/`{3}/g, ''));
  result = result.replace(/`([^`]+)`/g, '$1');
  return result;
}

function extractKeySentences(text, maxSentences = 10) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length <= maxSentences) return text;

  const scored = sentences.map(s => {
    let score = 0;
    const lower = s.toLowerCase();
    if (lower.includes('importante') || lower.includes('important') || lower.includes('crucial') || lower.includes('essencial')) score += 3;
    if (lower.includes('regra') || lower.includes('rule') || lower.includes('nunca') || lower.includes('never') || lower.includes('sempre') || lower.includes('always')) score += 3;
    if (lower.includes('você é') || lower.includes('you are') || lower.includes('você deve') || lower.includes('you must')) score += 2;
    if (lower.includes('responda') || lower.includes('respond') || lower.includes('não') || lower.includes('not')) score += 1;
    score += Math.min(s.trim().split(/\s+/).length, 20) / 20;
    return { sentence: s.trim(), score };
  });

  scored.sort((a, b) => b.score - a.score);
  const kept = scored.slice(0, maxSentences).map(s => s.sentence);
  const indices = kept.map(k => sentences.findIndex(s => s.trim() === k)).filter(i => i >= 0);
  indices.sort((a, b) => a - b);
  return indices.map(i => sentences[i].trim()).join('. ') + '.';
}

function compressByStrategy(text, strategy = 'balanced') {
  switch (strategy) {
    case 'aggressive':
      return compressWhitespace(removeRedundancy(compressMarkdown(extractKeySentences(text, 5))));
    case 'balanced':
      return compressWhitespace(removeRedundancy(compressMarkdown(text)));
    case 'light':
      return compressWhitespace(text);
    case 'preserve_rules':
      const rules = text.split('\n').filter(l => {
        const lower = l.toLowerCase();
        return lower.match(/\b(rule|regra|never|nunca|always|sempre|must|deve|important|importante|critical|crítico)\b/i);
      });
      const rest = text.split('\n').filter(l => {
        const lower = l.toLowerCase();
        return !lower.match(/\b(rule|regra|never|nunca|always|sempre|must|deve|important|importante|critical|crítico)\b/i);
      });
      const compressedRest = compressWhitespace(removeRedundancy(compressMarkdown(rest.join('\n'))));
      return rules.join('\n') + '\n\n' + compressedRest;
    default:
      return compressWhitespace(removeRedundancy(compressMarkdown(text)));
  }
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

async function compressForLLM(text, options = {}) {
  const enabled = await getSetting('token_compression_enabled', 'true') === 'true';
  if (!enabled) return text;

  const maxTokens = parseInt(await getSetting('token_compression_max', '6000')) || 6000;
  const strategy = await getSetting('token_compression_strategy', 'balanced') || 'balanced';
  const threshold = parseInt(await getSetting('token_compression_threshold', '8000')) || 8000;

  const currentTokens = estimateTokens(text);
  if (currentTokens < threshold) return text;

  const compressed = compressByStrategy(text, options.strategy || strategy);
  const newTokens = estimateTokens(compressed);

  if (newTokens > maxTokens) {
    const keySentences = extractKeySentences(compressed, Math.floor(maxTokens / 20));
    return keySentences;
  }

  return compressed;
}

function compressContext(contexts, maxChars = 4000) {
  if (!contexts || !Array.isArray(contexts)) return contexts;

  const total = contexts.reduce((sum, c) => sum + (c.text?.length || c.content?.length || c.length || 0), 0);
  if (total <= maxChars) return contexts;

  const ratio = maxChars / total;
  return contexts.map(c => {
    const text = c.text || c.content || c;
    const maxLen = Math.floor(text.length * ratio);
    return {
      ...c,
      text: text.length > maxLen ? text.substring(0, maxLen) + '...' : text,
    };
  });
}

function compressSystemPrompt(prompt, targetRatio = 0.6) {
  const lines = prompt.split('\n');
  const essential = [];
  const rules = [];
  const examples = [];
  const other = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.match(/\b(you are|você é|your role|seu papel|purpose|objetivo|critical|crítico|important|importante|never|nunca|always|sempre|must|deve|rule \d|regra \d)\b/i)) {
      essential.push(line);
    } else if (lower.match(/\b(rule|regra|don't|não |avoid|evite|invariable)\b/i)) {
      rules.push(line);
    } else if (lower.match(/\b(example|exemplo|for instance|por exemplo|sample)\b/i)) {
      examples.push(line);
    } else {
      other.push(line);
    }
  }

  const targetLines = Math.floor(lines.length * targetRatio);
  const result = [...essential];
  const remaining = targetLines - result.length;

  if (remaining > 0) {
    result.push(...rules.slice(0, Math.ceil(remaining * 0.6)));
    result.push(...other.slice(0, Math.floor(remaining * 0.4)));
  }

  return compressWhitespace(result.join('\n'));
}

module.exports = {
  compressForLLM,
  compressContext,
  compressSystemPrompt,
  compressByStrategy,
  compressWhitespace,
  removeRedundancy,
  compressMarkdown,
  extractKeySentences,
  estimateTokens,
};