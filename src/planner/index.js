const { getSetting } = require('../settings');

const PLANNING_SYSTEM_PROMPT = `You are a planning agent. Given a user message and available tools, decide:
1. What the user wants to accomplish (intent analysis)
2. Which tools, if any, should be called (in order)
3. What information is needed before executing
4. Whether this is a simple response (no tools needed) or requires multi-step execution

Respond with ONLY a JSON plan:
{
  "intent": "brief description of what user wants",
  "needsTools": true/false,
  "toolPlan": [
    { "tool": "tool_name", "reason": "why this tool", "priority": 1-5 }
  ],
  "responseStrategy": "direct_answer|single_tool|multi_tool|conversation",
  "estimatedRounds": 1-3,
  "riskLevel": "none|low|medium|high",
  "notes": "any concerns or special considerations"
}

Be concise. If the user just wants a conversation, set needsTools=false and responseStrategy="direct_answer".
If tools are needed, order them by priority (1=highest).
Risk considerations: data modification, user data exposure, external API calls, irreversible actions.`;

function parsePlan(planText) {
  try {
    let cleaned = planText.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(cleaned);
  } catch {
    return { intent: 'unknown', needsTools: true, toolPlan: [], responseStrategy: 'direct_answer', estimatedRounds: 1, riskLevel: 'none', notes: 'Failed to parse plan' };
  }
}

async function planExecution(message, personaId, uid, availableTools, integrations) {
  const planningEnabled = await getSetting('planner_enabled', 'true') === 'true';
  if (!planningEnabled) {
    return null;
  }

  const toolNames = (availableTools || []).map(t => t.function?.name || t.name).filter(Boolean);
  if (toolNames.length === 0) return null;

  const toolDescriptions = (availableTools || []).slice(0, 15).map(t =>
    `- ${t.function?.name || t.name}: ${t.function?.description?.split('.')[0] || ''}`
  ).join('\n');

  const planningPrompt = `${PLANNING_SYSTEM_PROMPT}

Available tools:
${toolDescriptions}

User message: "${message.substring(0, 500)}"
Persona: ${personaId || 'default'}
User ID: ${uid || 'unknown'}

Plan:`;

  try {
    const maxTokens = parseInt(await getSetting('max_tokens', '4096')) || 4096;
    const result = await integrations.callLLM(
      [{ role: 'system', content: planningPrompt }],
      { stream: false, temperature: 0.1, numPredict: Math.min(maxTokens, 512), retries: 1, timeout: 10000 }
    );

    const content = result.content || result.choices?.[0]?.message?.content || '';
    return parsePlan(content);
  } catch (err) {
    console.error('[Planner] Error:', err.message);
    return null;
  }
}

function shouldUsePlanner(message, isAdmin, isMetaPersona) {
  const lowerMsg = message.toLowerCase();
  const multiToolIndicators = [
    'and', 'then', 'also', 'after', 'before', 'while', 'during',
    'create', 'add', 'update', 'delete', 'manage', 'list', 'show',
    'schedule', 'organize', 'set up', 'plan', 'track', 'goal',
  ];

  const toolIndicators = ['/', 'task', 'calendar', 'contact', 'goal', 'stage',
    'orgmem', 'automation', 'blueprint', 'persona', 'skill', 'dashboard',
    'xp', 'progress', 'contact', 'lead', 'crm'];

  const hasToolIndicator = toolIndicators.some(t => lowerMsg.includes(t));
  const hasMultiStep = multiToolIndicators.filter(ind =>
    lowerMsg.includes(ind) && lowerMsg.split(/\s+/).length > 4
  ).length >= 2;

  if (isMetaPersona || isAdmin) return true;
  return hasToolIndicator || hasMultiStep;
}

function optimizeToolOrder(toolPlan, availableTools) {
  if (!toolPlan || !toolPlan.length) return availableTools;

  const planToolNames = toolPlan.map(p => p.tool);
  const sorted = [...(availableTools || [])].sort((a, b) => {
    const aName = a.function?.name || a.name;
    const bName = b.function?.name || b.name;
    const aIdx = planToolNames.indexOf(aName);
    const bIdx = planToolNames.indexOf(bName);
    if (aIdx !== -1 && bIdx === -1) return -1;
    if (aIdx === -1 && bIdx !== -1) return 1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return 0;
  });

  return sorted;
}

module.exports = { planExecution, shouldUsePlanner, optimizeToolOrder, parsePlan };