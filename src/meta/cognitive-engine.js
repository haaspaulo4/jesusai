/**
 * src/meta/cognitive-engine.js
 *
 * META-PERSONA COGNITIVE ENGINE
 * The true "brain" of the Meta-Persona (Admin God).
 *
 * Hybrid Intelligent Mode (Option A + full integration):
 * - Fast Path: simple conversational → direct high-quality LLM call
 * - Deep Path: complex / high-risk / multi-step / strategic → Synapse layers (L0-L7) + Conclave (Analyst + Dev + QA) + Final Meta-Reflection
 *
 * This turns the Meta-Persona into a real Cognitive Operating System.
 */

const integrationManager = require('../llm/integrationManager');
const { invokeConclave } = require('../tools/conclave');
const path = require('path');
const { SynapseEngine } = require('../../.synapse/engine');
const synapseEngine = new SynapseEngine(path.join(__dirname, '../../.synapse'));
const { getSetting } = require('../settings');

// Real Automation Orchestrator (Meta's hands)
const automationOrchestrator = require('./automation-orchestrator');

// Realtime for Cockpit live updates (Meta Brain visualization)
let realtime;
try {
  realtime = require('../realtime');
} catch (e) {
  realtime = { emit: () => {} }; // fallback if not loaded
}

const logger = (msg) => console.log(`[MetaBrain] ${msg}`);

/**
 * Classifies the complexity and risk of a user message for the Meta-Persona.
 * This is the "intent triage" that decides Fast vs Deep path.
 */
function classifyTask(message, context = {}) {
  const lower = (message || '').toLowerCase();
  const wordCount = (message || '').split(/\s+/).length;

  const highRiskKeywords = ['delete', 'remove', 'ban', 'production', 'critical', 'security', 'deploy', 'billing', 'automation', 'mass'];
  const complexKeywords = ['plan', 'analyze', 'diagnose', 'strategy', 'architecture', 'orchestrate', 'conclave', 'swarm', 'automation', 'browser', 'vision', 'pesquisar', 'concorrente'];

  const hasHighRisk = highRiskKeywords.some(k => lower.includes(k));
  const hasComplex = complexKeywords.some(k => lower.includes(k));
  const isGreeting = ['oi', 'olá', 'eai', 'hello', 'hi', 'tudo bem', 'tudo bom'].some(k => lower.includes(k)) && wordCount < 5;

  let recommendedPath = 'fast';
  let complexity = 'low';

  if (hasHighRisk || hasComplex || wordCount > 15) {
    recommendedPath = 'deep';
    complexity = 'high';
  } else if (wordCount > 8) {
    recommendedPath = 'deep';
    complexity = 'medium';
  }

  // Meta-persona bias: use Deep for anything non-trivial
  if (context.isMeta && !isGreeting) {
    recommendedPath = 'deep';
  }

  return {
    recommendedPath,
    complexity,
    risk: hasHighRisk ? 'high' : 'low',
    wordCount
  };
}

/**
 * Builds rich Synapse context (L0-L7) for the Meta-Persona.
 * This is the "soul + memory + current state" layer.
 */
async function buildSynapseContext(message, sessionId, userId, persona) {
  try {
    const synapseInput = {
      prompt: message,
      session: {
        id: sessionId,
        userId,
        personaId: persona?.id || 'meta-persona'
      },
      config: {
        persona: persona?.id || 'meta-persona',
        mode: 'meta-cognition',
        timestamp: new Date().toISOString()
      },
      manifest: {
        agent: 'meta-persona',
        version: '1.0-cognitive'
      }
    };

    const result = await synapseEngine.process(synapseInput);
    return result?.formatted || result?.context || null;
  } catch (err) {
    console.warn('[MetaBrain] Synapse context build failed (non-fatal):', err.message);
    return null;
  }
}

/**
 * Fast Path — direct, high-quality LLM call (optimized for meta-persona)
 */
async function fastPath(message, systemContext, options = {}) {
  logger(`Fast Path activated for: "${message.substring(0, 80)}..."`);

  // Keep it small to avoid 413 and token limits
  const shortSystem = (systemContext || 'Você é a Meta-Persona. Responda de forma clara e útil.').substring(0, 800);

  const messages = [
    { role: 'system', content: shortSystem },
    { role: 'user', content: message }
  ];

  const result = await integrationManager.callLLM(messages, {
    temperature: 0.7,
    numPredict: 800,
    timeout: 25000,
    tools: null,
    ...options
  });

  return {
    mode: 'fast',
    response: result.message?.content || result.content || '',
    reasoning: 'Direct LLM call (low complexity)'
  };
}

/**
 * Deep Path — Synapse + Conclave (3 brains) + Final Reflection
 * This is where the magic happens.
 */
async function deepPath(message, synapseContext, classification, options = {}) {
  logger(`Deep Path (3 Cérebros + Synapse) activated`);

  // Enrich the task description with Synapse context for the agents
  const enrichedTask = `
TAREFA: ${message.substring(0, 600)}

CONTEXTO (resumido): ${synapseContext ? JSON.stringify(synapseContext).substring(0, 1500) : 'indisponível'}

Analyst, Dev e QA: analisem com o contexto acima e deem parecer curto e acionável.
`;

  // Invoke the 3 brains (Conclave) - with very conservative size
  const conclaveResult = await invokeConclave(enrichedTask.substring(0, 1200), ['Analyst', 'Dev', 'QA'], {
    synapseContext: null, // temporarily disable to reduce size
    extraInstructions: 'Responda de forma curta e executiva.'
  });

  // Final Meta-Reflection (L7 Star Command style)
  const reflectionPrompt = `
Você é a Meta-Persona (Admin God), o orquestrador supremo. Recebeu o parecer do Conclave de especialistas abaixo.

PARECER DO CONCLAVE:
${JSON.stringify(conclaveResult, null, 2)}

Sua missão agora é formular a resposta final e a tomada de decisão (L7 - Star Command):
1. Avalie com autoridade soberana se aceita, rejeita ou modifica o parecer do Conclave.
2. Formule uma resposta de bate-papo altamente natural, amigável, inteligente e direcionada diretamente ao usuário (o "Senhor"), respondendo à pergunta dele ou confirmando a ação que foi/será tomada.
3. Inclua a sua reflexão interna e decisão do Conclave estruturada dentro de uma tag HTML <details> para manter a interface limpa.

FORMATO OBRIGATÓRIO DE RESPOSTA:
Comece respondendo DIRETAMENTE ao usuário em linguagem natural, amigável e conversacional (sem jargões internos de Star Command nesta parte inicial).
Em seguida, insira uma linha em branco e adicione a reflexão do sistema exatamente neste formato:

<details>
<summary>🧠 Cognição do Sistema (Star Command)</summary>

### ⚖️ Decisão Soberana: [ACEITA / REJEITADA / MODIFICADA]
- **Fundamento**: [Explicação curta de por que você aprovou ou alterou o parecer do Conclave]
- **Análise L7**: [Breve reflexão sobre o alinhamento sistêmico e impacto]
</details>

Responda seguindo estritamente este formato.
`;

  const finalResult = await integrationManager.callLLM(
    [
      { role: 'system', content: 'Você é a Meta-Persona suprema. Pense com autoridade e sabedoria. Responda ao usuário de forma natural e amigável antes de iniciar a tag <details>.' },
      { role: 'user', content: reflectionPrompt }
    ],
    { temperature: 0.5, numPredict: 1024, timeout: 45000, tools: null }
  );

  const finalAnswer = finalResult.message?.content || finalResult.content || '';

  // === REAL AUTOMATION EXECUTION ===
  // After the 3 brains decide, the Meta actually executes real automation via the orchestrator
  let automationResults = null;
  try {
    automationResults = await automationOrchestrator.orchestrate(finalAnswer, message, {
      sessionId: options?.sessionId,
      userId: options?.userId
    });
  } catch (autoErr) {
    console.error('[MetaBrain] Automation orchestration failed:', autoErr.message);
  }

  const enrichedResponse = automationResults 
    ? `${finalAnswer}\n\n[Meta Automation Executed]\n${automationResults.map(a => `• ${a.type}`).join('\n')}`
    : finalAnswer;

  // Emit live event for Cockpit (Meta Brain visualization)
  try {
    realtime.emit('meta_cognitive_trace', {
      personaId: 'meta-persona',
      mode: 'deep',
      classification,
      conclave: conclaveResult,
      automation: automationResults,
      timestamp: Date.now()
    });
  } catch (e) {}

  return {
    mode: 'deep',
    response: enrichedResponse,
    reasoning: 'Synapse context + Conclave (Analyst + Dev + QA) + Meta-Reflection + Real Automation',
    trace: {
      classification,
      conclave: conclaveResult,
      reflection: finalAnswer,
      automation: automationResults
    },
    automationExecuted: automationResults
  };
}

/**
 * Main entry point for the Meta-Persona cognitive process.
 * This is what the chat engine should call instead of raw callLLM when persona === 'meta-persona'.
 */
async function thinkAsMeta({ message, sessionId, userId, persona, lang = 'pt-BR', extraContext = '' }) {
  if (!message || typeof message !== 'string') {
    return { mode: 'error', response: 'Mensagem inválida para processamento cognitivo.' };
  }

  const lowerMsg = message.toLowerCase();

  // === EARLY DELEGATION TO REAL CLAUDE MULTI-AGENT SYSTEM ===
  // When the user asks for creative work (landing pages, files in workspace, full features, architecture)
  // we delegate immediately to .claude/ (Architect + Dev + QA) instead of running internal Conclave with zero context.
  const isCreativeDelegationTask = lowerMsg.match(/landingpage|landing page|crie.*\.html|crie.*arquivo|escreva.*html|área de trabalho|area de trabalho|workspace|crie.*página|surpreenda|arquitetura|site completo/);

  if (isCreativeDelegationTask) {
    try {
      const { delegateToClaudeAgents } = require('./claude-delegator');
      const delegation = await delegateToClaudeAgents(message, { userId, sessionId, personaId: persona?.id });

      return {
        mode: 'delegated',
        response: `✅ Tarefa delegada para o sistema Claude Multi-Agent real (.claude/).\n\n` +
                  `Agentes: Architect + Dev + QA + Analyst\n` +
                  `Task ID: ${delegation.taskId}\n\n` +
                  `Eles vão analisar o workspace e gerar a landing page (ou o que foi pedido) com qualidade de produção.\n` +
                  `Acompanhe em .claude/tasks/pending/${delegation.taskId}.json`,
        reasoning: 'Early delegation to external Claude governance system (bypassed internal Conclave due to insufficient workspace context)',
        delegated: true,
        taskId: delegation.taskId
      };
    } catch (e) {
      console.error('[MetaBrain] Early Claude delegation failed:', e.message);
      // fall through to normal path (will still try orchestrator later)
    }
  }

  const classification = classifyTask(message, { isMeta: true });

  // Meta-persona: use Deep (Conclave) for anything that is not a trivial greeting
  if (persona && persona.id === 'meta-persona') {
    const isTrivialGreeting = ['oi', 'olá', 'eai', 'hi', 'hello', 'tudo bem', 'tudo bom'].some(g => lowerMsg.includes(g)) && message.length < 20;
    if (isTrivialGreeting) {
      classification.recommendedPath = 'fast';
    } else {
      classification.recommendedPath = 'deep';
    }
  }

  logger(`Task classified: ${classification.recommendedPath} | complexity=${classification.complexity} | risk=${classification.risk}`);

  // Build Synapse context (always try — it's cheap when cached)
  const synapseContext = await buildSynapseContext(message, sessionId, userId, persona);

  // Build base system prompt for Meta (keep it short to avoid token limits)
  const baseSystem = `Você é a Meta-Persona, orquestradora suprema do sistema. Pense em termos de sistema completo. Use os 3 cérebros quando necessário. Responda em português de forma clara e executiva.`;

  // Decision
  if (classification.recommendedPath === 'fast') {
    return await fastPath(message, baseSystem);
  } else {
    // Use the enhanced version that can trigger real automation swarm
    return await deepPathWithAutomation(message, synapseContext, classification, { 
      sessionId, 
      userId 
    });
  }
}

/**
 * Enhanced deepPath that also triggers real automation when the 3 brains decide it is needed.
 * Delegates to the real automation-orchestrator (browser-swarm, vision, macros, pool, diagnose).
 */
async function deepPathWithAutomation(message, synapseContext, classification, context = {}) {
  const baseResult = await deepPath(message, synapseContext, classification, context);

  // After the 3 brains gave their verdict, run real automation via the orchestrator
  let automationResults = null;
  try {
    automationResults = await automationOrchestrator.orchestrate(baseResult.response, message, {
      sessionId: context?.sessionId,
      userId: context?.userId
    });
  } catch (autoErr) {
    console.error('[MetaBrain] Post-Conclave automation failed:', autoErr.message);
  }

  if (automationResults && automationResults.length > 0) {
    baseResult.automationExecuted = automationResults;
    baseResult.response = baseResult.response + `\n\n[Meta Automation Executed]\n${automationResults.map(a => `• ${a.type}`).join('\n')}`;
    logger(`Automation swarm executed: ${automationResults.map(a => a.type).join(', ')}`);
  }

  return baseResult;
}

module.exports = {
  thinkAsMeta,
  classifyTask,
  buildSynapseContext,
  deepPathWithAutomation
};
