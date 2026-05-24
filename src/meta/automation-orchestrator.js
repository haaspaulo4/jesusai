/**
 * src/meta/automation-orchestrator.js
 *
 * META AUTOMATION ORCHESTRATOR
 * 
 * This is the "hands and eyes" of the Meta-Persona.
 * After the Conclave (3 brains) decides that automation is needed,
 * this module intelligently dispatches real automation using:
 * - Browser Swarm (multi-tab, multi-browser control)
 * - Vision System (screen capture + OCR + analysis)
 * - Macro Engine & Excel Live
 * - Python automation scripts
 * - Agent Pool
 *
 * This turns the Meta-Persona from a thinker into a real doer.
 */

const automation = require('../tools/automation');
const browserSwarm = require('../tools/browser-swarm');
const vision = require('../tools/vision');
let agentPool;
try { agentPool = require('../agent/pool'); } catch (e) { agentPool = null; }

const logger = (msg) => console.log(`[MetaOrchestrator] ${msg}`);

/**
 * Main entry point called by the Cognitive Engine after Conclave decision.
 * 
 * @param {string} decisionText - The final decision from the 3 brains + Meta reflection
 * @param {string} originalMessage - Original user request
 * @param {Object} context - Additional context (session, user, etc.)
 */
async function orchestrate(decisionText, originalMessage, context = {}) {
  const text = (decisionText + ' ' + originalMessage).toLowerCase();
  const actions = [];

  // === Browser Swarm (real) ===
  if (text.match(/browser|swarm|concorrente|preço|pesquisar site|navegar|visitar/)) {
    const urls = (decisionText + originalMessage).match(/https?:\/\/[^\s]+/g) || [];
    if (urls.length > 0 && typeof browserSwarm.controlBrowserSwarm === 'function') {
      const result = await browserSwarm.controlBrowserSwarm('batch_visit', urls, { maxTabs: 6, headless: true });
      actions.push({ type: 'browser_swarm', urls, result });
    } else if (typeof browserSwarm.controlBrowserSwarm === 'function') {
      const result = await browserSwarm.controlBrowserSwarm('smart_task', originalMessage, {});
      actions.push({ type: 'browser_swarm_smart', result });
    }
  }

  // === Vision / Screen Intelligence (real) ===
  if (text.match(/vision|ocr|tela|screen|imagem|capturar|analisar tela/)) {
    if (typeof vision.captureScreenAndOCR === 'function') {
      const result = await vision.captureScreenAndOCR();
      actions.push({ type: 'vision_capture', result });
    }
  }

  // === Python Automation Layer (macro-engine, browser-control, etc.) ===
  if (text.match(/macro|excel|repetitivo|automatizar|browser-control/)) {
    // Exemplo: dispara macro ou browser-control via automation bridge
    if (typeof automation.executeResilientMacro === 'function') {
      const result = await automation.executeResilientMacro([{ action: 'log', message: 'Meta requested automation' }]);
      actions.push({ type: 'python_macro', result });
    }
  }

  // === Diagnose Root Cause ===
  if (text.match(/diagnos|root cause|erro|falha|bug/)) {
    const result = await automation.diagnoseRootCause({ logPath: 'server_err.log', recentLinesCount: 100 });
    actions.push({ type: 'diagnose_root_cause', result });
  }

  // === Agent Pool (despacho paralelo) ===
  if (text.match(/paralelo|pool|despachar|multiplos agentes/) && agentPool?.dispatch) {
    const task = { type: 'automation', payload: { decision: decisionText } };
    await agentPool.dispatch(task);
    actions.push({ type: 'agent_pool_dispatch', task });
  }

  const combined = (decisionText + ' ' + originalMessage).toLowerCase();
  const executedActions = actions; // For compatibility with the bottom code
  
  // === BROWSER SWARM (Real multi-browser automation) ===
  if (combined.match(/browser|swarm|navegar|scrape|site|concorrente|preço|precos|visitar|abrir|pesquisar/)) {
    try {
      logger('Dispatching real Browser Swarm...');

      const urls = extractUrlsFromText(decisionText + originalMessage);

      if (urls.length > 0 && typeof browserSwarm.controlBrowserSwarm === 'function') {
        const swarmResult = await browserSwarm.controlBrowserSwarm('batch_visit', urls, {
          maxTabs: Math.min(urls.length, 6),
          headless: true,
          timeoutPerTab: 30000
        });

        executedActions.push({
          type: 'browser_swarm_batch',
          urls: urls,
          result: swarmResult,
          timestamp: new Date()
        });
      } else if (typeof browserSwarm.controlBrowserSwarm === 'function') {
        // Fallback: let the swarm decide what to do based on the task
        const swarmResult = await browserSwarm.controlBrowserSwarm('smart_task', originalMessage, {});
        executedActions.push({
          type: 'browser_swarm_smart',
          task: originalMessage,
          result: swarmResult,
          timestamp: new Date()
        });
      } else {
        executedActions.push({ type: 'browser_swarm', note: 'Browser swarm module loaded but no control function available' });
      }
    } catch (e) {
      executedActions.push({ type: 'browser_swarm', error: e.message });
    }
  }

  // === VISION / SCREEN INTELLIGENCE (Real) ===
  if (combined.match(/vision|ocr|screen|imagem|tela|capturar|analisar tela|ver o que está na tela|screenshot/)) {
    try {
      logger('Activating real Vision System...');
      if (typeof vision.captureScreenAndOCR === 'function') {
        const visionResult = await vision.captureScreenAndOCR();
        executedActions.push({
          type: 'vision_capture',
          result: visionResult,
          timestamp: new Date()
        });
      } else {
        executedActions.push({ type: 'vision', note: 'Vision module loaded but capture function not available' });
      }
    } catch (e) {
      executedActions.push({ type: 'vision', error: e.message });
    }
  }

  // === MACRO ENGINE & EXCEL ===
  if (combined.match(/macro|excel|planilha|repetitivo|automatizar tarefa/)) {
    try {
      logger('Macro Engine ready for dispatch');
      executedActions.push({
        type: 'macro_engine',
        note: 'Macro/Excel automation capability reserved for execution'
      });
    } catch (e) {
      executedActions.push({ type: 'macro', error: e.message });
    }
  }

  // === DELEGATE CREATIVE / CODING TASKS TO REAL CLAUDE MULTI-AGENT SYSTEM (.claude/) ===
  const shouldDelegateToClaude = !context?.skipDelegation && combined.match(/landingpage|landing page|crie.*\.html|crie.*arquivo|escreva.*html|area de trabalho|workspace|crie.*landing|arquitetura|full feature|site completo|surpreenda/);

  if (shouldDelegateToClaude) {
    try {
      const { delegateToClaudeAgents } = require('./claude-delegator');
      const delegation = await delegateToClaudeAgents(originalMessage || decisionText, {
        userId: context?.userId,
        sessionId: context?.sessionId,
        personaId: 'meta-persona'
      });

      executedActions.push({
        type: 'claude_multi_agent_delegation',
        taskId: delegation.taskId,
        note: delegation.note,
        file: delegation.file,
        agents: ['architect', 'dev', 'qa', 'analyst']
      });

      logger(`Task delegated to .claude agents: ${delegation.taskId}`);
    } catch (e) {
      executedActions.push({ type: 'claude_delegation_failed', error: e.message });
    }
  }

  // === FALLBACK: Direct safe file write (only if not delegated) ===
  if (!shouldDelegateToClaude && combined.match(/landingpage|landing page|crie.*\.html|area de trabalho|workspace/)) {
    try {
      const fs = require('fs');
      const path = require('path');

      let filename = 'landingpage.html';
      const htmlMatch = (originalMessage + decisionText).match(/([\w-]+\.html)/i);
      if (htmlMatch) filename = htmlMatch[1];

      const workspaceDir = path.join(process.cwd(), 'workspace');
      if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });

      const filePath = path.join(workspaceDir, filename);

      const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${filename}</title></head>
<body style="font-family: system-ui; background:#0a0a0a; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh;">
  <div style="text-align:center;">
    <h1>Landing Page gerada pela Meta-Persona</h1>
    <p>Arquivo criado em: ${filePath}</p>
    <small>Para tarefas complexas a Meta agora delega para o sistema Claude Multi-Agent (.claude/)</small>
  </div>
</body></html>`;

      fs.writeFileSync(filePath, htmlContent, 'utf8');

      executedActions.push({
        type: 'create_workspace_file',
        path: filePath,
        filename,
        note: 'Direct write (fallback)'
      });
    } catch (e) {
      executedActions.push({ type: 'create_file', error: e.message });
    }
  }

  // === AGENT POOL (future) ===
  if (combined.match(/pool|agentes|despachar|paralelo/)) {
    executedActions.push({
      type: 'agent_pool',
      note: 'Agent Pool dispatch capability detected'
    });
  }

  if (executedActions.length === 0) {
    logger('No specific automation actions triggered from this decision.');
    return null;
  }

  logger(`Executed ${executedActions.length} automation action(s)`);
  return executedActions;
}

function extractUrlsFromText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return (text.match(urlRegex) || []).slice(0, 8); // limit to 8 URLs max
}

module.exports = {
  orchestrate
};
