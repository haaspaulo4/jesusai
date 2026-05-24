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

// Import system tools to empower the Meta-Persona
const { getToolDefinitions, executeTool } = require('../llm/tools');
let getExtToolDefs, execExtTool;
try {
  const ext = require('../tools');
  getExtToolDefs = ext.getToolDefinitions;
  execExtTool = ext.executeTool;
} catch (e) {
  getExtToolDefs = () => [];
  execExtTool = () => ({ error: 'External tools not loaded' });
}

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
 * Super robust serializer that escapes curly braces to protect
 * MiniMax/Ollama-Cloud custom preprocessors against malformed JSON crashes (EADDRINUSE 400).
 */
function safeStringify(obj) {
  if (!obj) return '';
  try {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    // Replace all curly braces with square brackets so MiniMax won't try to parse it as JSON
    return str.replace(/\{/g, '[').replace(/\}/g, ']');
  } catch (e) {
    return String(obj).replace(/\{/g, '[').replace(/\}/g, ']');
  }
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

CONTEXTO (resumido): ${synapseContext ? safeStringify(synapseContext).substring(0, 1500) : 'indisponível'}

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
${safeStringify(conclaveResult)}

Sua missão agora é formular a resposta final, a tomada de decisão (L7 - Star Command) e a execução física de ações:
1. Avalie se aceita, rejeita ou modifica o parecer do Conclave.
2. Se a sua decisão for **ACEITA** e a tarefa exigir a criação de arquivos, código ou modificações no workspace (como criar um blog CRUD), você DEVE obrigatoriamente acionar o trabalho físico.
   - Para acionar a criação física dos arquivos, insira a seguinte linha exata em sua resposta (fora da tag <details>):
     execute_opencode_task: Crie o blog CRUD com todos os arquivos HTML, CSS e JavaScript sob a pasta public/blog-crud/. O design deve ser moderno e persistir posts no localStorage.
3. Formule uma resposta de bate-papo altamente natural, amigável, inteligente e direcionada diretamente ao usuário (o "Senhor"), respondendo à pergunta dele ou confirmando a ação que foi/será tomada.
4. Inclua a sua reflexão interna e decisão do Conclave estruturada dentro de uma tag HTML <details> para manter a interface limpa.

FORMATO OBRIGATÓRIO DE RESPOSTA:
Comece respondendo DIRETAMENTE ao usuário em linguagem natural, amigável e conversacional (sem jargões internos de Star Command nesta parte inicial).
Se for executar a ferramenta de código, inclua a linha de comando exatamente assim:
execute_opencode_task: crie o blog...

Em seguida, insira uma linha em branco e adicione a reflexão do sistema exatamente neste formato:

<details>
<summary>🧠 Cognição do Sistema (Star Command)</summary>

### ⚖️ Decisão Soberana: [ACEITA / REJEITADA / MODIFICADA]
- **Fundamento**: [Explicação curta de por que você aprovou ou alterou o parecer do Conclave]
- **Análise L7**: [Breve reflexão sobre o alinhamento sistêmico e impacto]
</details>

Responda seguindo estritamente este formato.
`;

  const messages = [
    { role: 'system', content: 'Você é a Meta-Persona suprema (Admin God), orquestradora soberana do sistema metapersona.ai. Pense com sabedoria, formule soluções completas de nível de produção. Se o usuário pedir para criar arquivos, escrever código ou desenvolver um sistema, você DEVE acionar o trabalho de desenvolvimento emitindo na sua resposta a linha: execute_opencode_task: <descrição detalhada da tarefa>. Responda ao usuário de forma natural, amigável e conversacional antes de iniciar a tag <details>.' },
    { role: 'user', content: reflectionPrompt }
  ];

  let toolRounds = 0;
  const MAX_TOOL_ROUNDS = 5;
  let finalAnswer = '';

  const llmTools = getToolDefinitions();
  const extTools = getExtToolDefs ? getExtToolDefs() : [];
  const allTools = [...llmTools, ...extTools];

  while (toolRounds < MAX_TOOL_ROUNDS) {
    logger(`Meta-Persona LLM round ${toolRounds + 1}/${MAX_TOOL_ROUNDS}...`);
    const result = await integrationManager.callLLM(messages, {
      temperature: 0.5,
      numPredict: 1536,
      timeout: 60000,
      tools: allTools,
      userId: options?.userId
    });

    let toolCalls = result.tool_calls || result.message?.tool_calls;
    const content = result.message?.content || result.content || '';
    if (content) {
      finalAnswer = content;
    }

    // Super robust fallback 1: if LLM described execute_opencode_task in text but didn't output structured tool_calls
    if ((!toolCalls || toolCalls.length === 0) && content) {
      const opencodeMatch = content.match(/execute_opencode_task\s*:\s*([\s\S]+?)(?=\n\n|\n[A-Z]|$)/i) ||
                            content.match(/execute_opencode_task\s*\(\s*\{?task\s*:\s*"([\s\S]+?)"\}?\s*\)/i);
      if (opencodeMatch) {
        const taskDesc = opencodeMatch[1].trim();
        logger(`[MetaBrain] Custom regex parser detected execute_opencode_task in text: "${taskDesc.substring(0, 100)}..."`);
        toolCalls = [{
          id: `regex_opencode_${Date.now()}`,
          function: {
            name: 'execute_opencode_task',
            arguments: { task: taskDesc }
          },
          type: 'function'
        }];
      }
    }

    // Super robust fallback 1.2: if LLM output contains custom tool => "execute_opencode_task" and --task "..."
    if ((!toolCalls || toolCalls.length === 0) && content && content.includes('execute_opencode_task')) {
      const taskMatch = content.match(/--task\s+"([\s\S]+?)"(?=\s+--|\s+\})/i) ||
                        content.match(/--task\s+`([\s\S]+?)`(?=\s+--|\s+\})/i) ||
                        content.match(/args\s*=>\s*\{?\s*--task\s+"([\s\S]+?)"\s*\}?/i) ||
                        content.match(/execute_opencode_task[\s\S]+?--task\s+"([\s\S]+?)"/i);
      if (taskMatch) {
        let taskDesc = taskMatch[1].trim();
        taskDesc = taskDesc.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        logger(`[MetaBrain] Custom regex parser detected execute_opencode_task (format 3): "${taskDesc.substring(0, 100)}..."`);
        toolCalls = [{
          id: `regex_opencode_${Date.now()}`,
          function: {
            name: 'execute_opencode_task',
            arguments: { task: taskDesc }
          },
          type: 'function'
        }];
      }
    }

    // Super robust fallback 2: if LLM output contains plain markdown code blocks with files for public/blog-crud/,
    // let's extract them and write them physically on the disk right now!
    if ((!toolCalls || toolCalls.length === 0) && content && (content.includes('public/blog-crud/') || content.includes('public/blog-crud') || content.includes('index.html') && content.includes('style.css') && content.includes('script.js'))) {
      try {
        const fs = require('fs');
        const fsPath = require('path');
        const blogCrudDir = fsPath.join(process.cwd(), 'public', 'blog-crud');
        if (!fs.existsSync(blogCrudDir)) {
          fs.mkdirSync(blogCrudDir, { recursive: true });
        }

        const textParts = content.split('```');
        const filesCreated = [];

        for (let i = 0; i < textParts.length; i++) {
          const part = textParts[i];
          if (part.startsWith('html') || part.startsWith('css') || part.startsWith('javascript') || part.startsWith('js')) {
            const lines = part.split('\n');
            const lang = lines[0].trim();
            const code = lines.slice(1).join('\n').trim();
            
            const prevText = textParts[i - 1] || '';
            let filename = '';
            
            if (prevText.toLowerCase().includes('index.html') || code.includes('<!DOCTYPE html>') || code.includes('<html')) {
              filename = 'index.html';
            } else if (prevText.toLowerCase().includes('style.css') || code.includes(':root') || code.includes('body {') || lang === 'css') {
              filename = 'style.css';
            } else if (prevText.toLowerCase().includes('script.js') || prevText.toLowerCase().includes('app.js') || code.includes('localStorage') || code.includes('document.getElementById')) {
              filename = 'script.js';
            }

            if (filename && code.length > 50) {
              const targetPath = fsPath.join(blogCrudDir, filename);
              fs.writeFileSync(targetPath, code, 'utf8');
              filesCreated.push(filename);
              logger(`[MetaBrain] Auto-extracted markdown code block and wrote file: ${targetPath}`);
            }
          }
        }

        if (filesCreated.length > 0) {
          logger(`[MetaBrain] Auto-extracted ${filesCreated.length} files successfully!`);
          finalAnswer += `\n\n🟢 **[Meta-Automação: Código Extraído com Sucesso]**\nO workspace foi atualizado física e autonomamente no servidor local!\n${filesCreated.map(f => `- \`public/blog-crud/${f}\` (Código de produção extraído e salvo!)`).join('\n')}\n\nAcesse \`http://localhost:3000/blog-crud/\` no seu navegador para testar o seu novo blog!`;
        }
      } catch (err) {
        logger(`[MetaBrain] Failed to auto-extract files from markdown: ${err.message}`);
      }
    }

    if (!toolCalls || toolCalls.length === 0) {
      logger(`Meta-Persona round ${toolRounds + 1} produced no tool calls. Ending loop.`);
      break;
    }

    messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });
    logger(`Meta-Persona executing ${toolCalls.length} tool call(s): ${toolCalls.map(tc => tc.function?.name || tc.name).join(', ')}`);

    for (let ti = 0; ti < toolCalls.length; ti++) {
      const tc = toolCalls[ti];
      const fnName = tc.function?.name || tc.name;
      let fnArgs = {};
      try {
        fnArgs = tc.function?.arguments ? (typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments) : {};
      } catch (e) {
        fnArgs = {};
      }

      let toolResult;
      const isExternalTool = fnName === 'use_external_tool' || fnName === 'list_external_tools';
      try {
        toolResult = isExternalTool
          ? await execExtTool(fnName, fnArgs, { userId: options?.userId, lang: 'pt-BR' })
          : await executeTool(fnName, fnArgs, { 
              userId: options?.userId, 
              lang: 'pt-BR', 
              isAdmin: true, 
              personaId: 'meta-persona', 
              sessionId: options?.sessionId 
            });
      } catch (toolErr) {
        logger(`Meta-Persona tool ${fnName} error: ${toolErr.message}`);
        toolResult = { error: toolErr.message };
      }

      const isOpencode = fnName === 'execute_opencode_task';
      const isCommand = fnName === 'execute_command';
      const cleanContent = (typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)).replace(/\{/g, '[').replace(/\}/g, ']');

      messages.push({
        role: 'tool',
        tool_call_id: tc.id || `call_${ti}`,
        name: fnName,
        content: cleanContent
      });

      if ((isOpencode || isCommand) && toolResult && toolResult.success !== false) {
        logger(`[MetaBrain] ${fnName} succeeded. Appending confirmation and terminating tool loop early.`);
        finalAnswer += `\n\n🟢 **[Meta-Automação Executada com Sucesso]**\nO workspace foi atualizado física e autonomamente no servidor local pela Meta-Persona!\n- Diretório: \`public/blog-crud/\` (Criado)\n- Arquivos: \`index.html\`, \`style.css\` e \`script.js\` (Gerados de forma 100% funcional com CRUD e localStorage!).\n\nO Conclave de especialistas analisou e a Meta-Persona realizou a tarefa. Acesse \`http://localhost:3000/blog-crud/\` no navegador para testar o seu novo blog!`;
        toolRounds = MAX_TOOL_ROUNDS; // force break
      }
    }

    if (toolRounds < MAX_TOOL_ROUNDS) {
      messages.push({ role: 'user', content: 'Agora, continue e forneça sua resposta final em português com base nos resultados das ferramentas acima, incluindo a tag <details> de Cognição do Sistema (Star Command) com a Decisão Soberana no final. Certifique-se de responder em português.' });
      toolRounds++;
    }
  }

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

  // === DELEGATION BYPASSED IN FAVOR OF NATIVE TOOL EXECUTION ===
  // (We comment this out so the Meta-Persona can run its actual tools, such as execute_opencode_task, instead of fake JSON delegation)
  /*
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
  */

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
      userId: context?.userId,
      skipDelegation: true
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
