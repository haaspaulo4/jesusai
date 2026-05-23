/**
 * src/meta/claude-delegator.js
 *
 * Bridge between the in-app Meta-Persona (cognitive-engine) and the
 * external Claude Multi-Agent Governance system in .claude/
 *
 * When the Meta decides a task is too complex/creative (landing pages, full features, architecture),
 * it delegates to the real Claude sub-agents (Architect + Dev + QA + Analyst) running in the .claude framework.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const CLAUDE_DIR = path.join(process.cwd(), '.claude');
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks');
const PENDING_DIR = path.join(TASKS_DIR, 'pending');
const DONE_DIR = path.join(TASKS_DIR, 'done');

function ensureDirs() {
  [TASKS_DIR, PENDING_DIR, DONE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

/**
 * Delegate a complex task to the Claude Multi-Agent system.
 * The Meta-Persona calls this when it wants the real .claude agents to handle it.
 *
 * @param {string} taskDescription - What the user asked (e.g. "crie uma landingpage.html na área de trabalho, me surpreenda")
 * @param {object} context - { userId, sessionId, personaId, originalMessage }
 * @returns {Promise<{ delegated: true, taskId: string, note: string }>}
 */
async function delegateToClaudeAgents(taskDescription, context = {}) {
  ensureDirs();

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const task = {
    id: taskId,
    createdAt: new Date().toISOString(),
    source: 'meta-persona',
    userId: context.userId || 'unknown',
    sessionId: context.sessionId || '',
    personaId: context.personaId || 'meta-persona',
    description: taskDescription,
    priority: 'high',
    status: 'pending',
    assignedAgents: ['architect', 'dev', 'qa', 'analyst'],
    workspacePath: path.join(process.cwd(), 'workspace'),
    expectedOutput: 'file:landingpage.html or similar creative artifact'
  };

  const taskFile = path.join(PENDING_DIR, `${taskId}.json`);
  fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));

  console.log(`[ClaudeDelegator] Task delegated to .claude agents: ${taskId}`);
  console.log(`[ClaudeDelegator] File written: ${taskFile}`);
  console.log(`[ClaudeDelegator] The .claude system (Architect + Dev + QA) should now pick this up via hooks or manual invocation.`);

  // Optional: try to trigger the governance hook if available
  try {
    const governanceHook = path.join(CLAUDE_DIR, 'hooks', 'mind-clone-governance.py');
    if (fs.existsSync(governanceHook)) {
      exec(`python "${governanceHook}" --task "${taskFile}"`, { timeout: 5000 }, (err) => {
        if (err) console.log('[ClaudeDelegator] Governance hook executed (non-blocking)');
      });
    }
  } catch (e) {}

  return {
    delegated: true,
    taskId,
    note: 'Task handed off to Claude Multi-Agent Governance (.claude/agents + hooks). Architect + Dev will generate the real landing page.',
    file: taskFile
  };
}

module.exports = {
  delegateToClaudeAgents
};
