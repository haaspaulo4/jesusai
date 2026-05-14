const { getSetting } = require('../settings');

const CONTEXT_LAYERS = [
  { key: 'cognitive', priority: 10, label: 'COGNITIVE STATE', maxTokens: 300, truncate: 'end' },
  { key: 'goals', priority: 8, label: 'ACTIVE GOALS', maxTokens: 400, truncate: 'end' },
  { key: 'stage', priority: 9, label: 'CONVERSATION STAGE', maxTokens: 200, truncate: 'end' },
  { key: 'org_memory', priority: 7, label: 'ORGANIZATIONAL MEMORY', maxTokens: 500, truncate: 'end' },
  { key: 'xp', priority: 5, label: 'GAMIFICATION', maxTokens: 150, truncate: 'end' },
  { key: 'progress', priority: 6, label: 'PROGRESS STATE', maxTokens: 300, truncate: 'end' },
  { key: 'knowledge', priority: 4, label: 'KNOWLEDGE', maxTokens: 2000, truncate: 'end' },
  { key: 'memory', priority: 3, label: 'CONVERSATION MEMORY', maxTokens: 800, truncate: 'end' },
  { key: 'profile', priority: 2, label: 'USER PROFILE', maxTokens: 400, truncate: 'end' },
];

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

function truncateToTokens(text, maxTokens) {
  if (!text) return '';
  const maxChars = Math.floor(maxTokens * 3.5);
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 3) + '...';
}

function compileContextSync(layers, options = {}) {
  const maxTotalTokens = options.maxTotalTokens || 4000;
  const prioritizedKeys = options.prioritize || [];

  const sorted = [...layers]
    .map(layer => {
      const content = typeof layer.content === 'string' ? layer.content : '';
      const config = CONTEXT_LAYERS.find(c => c.key === layer.key) || { priority: 1, maxTokens: 500, truncate: 'end' };
      const priorityBoost = prioritizedKeys.includes(layer.key) ? 5 : 0;
      return {
        ...layer,
        content,
        priority: (config.priority || 1) + priorityBoost,
        maxTokens: config.maxTokens,
        label: config.label || layer.key,
        truncate: config.truncate,
        estimatedTokens: estimateTokens(content),
      };
    })
    .sort((a, b) => b.priority - a.priority);

  let usedTokens = 0;
  const compiled = [];

  for (const layer of sorted) {
    if (!layer.content) continue;

    const remainingTokens = maxTotalTokens - usedTokens;
    if (remainingTokens <= 0) break;

    const layerBudget = Math.min(layer.maxTokens, remainingTokens);

    if (layer.estimatedTokens <= layerBudget) {
      compiled.push({ key: layer.key, label: layer.label, content: layer.content, tokens: layer.estimatedTokens, truncated: false });
      usedTokens += layer.estimatedTokens;
    } else {
      const truncated = truncateToTokens(layer.content, layerBudget);
      const truncatedTokens = estimateTokens(truncated);
      compiled.push({ key: layer.key, label: layer.label, content: truncated, tokens: truncatedTokens, truncated: true });
      usedTokens += truncatedTokens;
    }
  }

  const droppedLayers = sorted
    .filter(l => l.content && !compiled.find(c => c.key === l.key))
    .map(l => l.key);

  const fullPrompt = compiled
    .map(c => `${c.label}:\n${c.content}`)
    .join('\n\n');

  return {
    prompt: fullPrompt,
    compiled,
    droppedLayers,
    totalTokens: usedTokens,
    budget: maxTotalTokens,
    utilization: Math.round((usedTokens / maxTotalTokens) * 100),
  };
}

async function compileContext(layers, options = {}) {
  const maxTotalTokens = parseInt(await getSetting('context_max_tokens', '4000')) || 4000;
  const prioritizeStr = await getSetting('context_prioritize', '');

  let prioritize = [];
  if (prioritizeStr) {
    prioritize = prioritizeStr.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (options.cognitiveState) {
    const emotion = options.cognitiveState.emotion;
    const intent = options.cognitiveState.intent;
    const churnRisk = options.cognitiveState.churn_risk || 0;

    if (churnRisk > 0.5) {
      prioritize.push('cognitive', 'stage');
    }
    if (intent === 'purchase') {
      prioritize.push('org_memory', 'goals');
    }
    if (intent === 'support') {
      prioritize.push('knowledge', 'progress');
    }
    if (emotion === 'confused') {
      prioritize.push('knowledge', 'stage');
    }
    if (emotion === 'frustrated' || emotion === 'angry') {
      prioritize.push('cognitive', 'xp');
    }
  }

  return compileContextSync(layers, {
    maxTotalTokens: options.maxTotalTokens || maxTotalTokens,
    prioritize: [...new Set(prioritize)],
  });
}

function buildContextLayers({
  knowledge = '',
  memory = '',
  profile = '',
  goals = '',
  orgMemory = '',
  stage = '',
  xp = '',
  progress = '',
  cognitive = '',
} = {}) {
  const layers = [];

  if (knowledge) layers.push({ key: 'knowledge', content: knowledge });
  if (memory) layers.push({ key: 'memory', content: memory });
  if (profile) layers.push({ key: 'profile', content: profile });
  if (goals) layers.push({ key: 'goals', content: goals });
  if (orgMemory) layers.push({ key: 'org_memory', content: orgMemory });
  if (stage) layers.push({ key: 'stage', content: stage });
  if (xp) layers.push({ key: 'xp', content: xp });
  if (progress) layers.push({ key: 'progress', content: progress });
  if (cognitive) layers.push({ key: 'cognitive', content: cognitive });

  return layers;
}

module.exports = {
  compileContext,
  compileContextSync,
  buildContextLayers,
  CONTEXT_LAYERS,
  estimateTokens,
  truncateToTokens,
};