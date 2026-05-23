// c:\laragon\www\jesus.ai\src\agent\pool.js
const { delegateToClaudeAgents } = require('../meta/claude-delegator');

class AgentPool {
  async dispatch(task) {
    console.log(`[AgentPool] Dispatching task:`, task);

    // If the task is creative / architecture / landing page / full feature → delegate to real .claude multi-agents
    const text = (task?.payload?.decision || task?.description || '').toLowerCase();

    if (text.match(/landing|landingpage|html|arquitetura|site|feature completa|surpreenda|crie.*página/)) {
      try {
        const result = await delegateToClaudeAgents(task.payload?.decision || task.description || 'Complex creative task', {
          userId: task.userId,
          sessionId: task.sessionId
        });
        return { success: true, delegated: true, to: '.claude multi-agent system', ...result };
      } catch (e) {
        console.error('[AgentPool] Claude delegation failed:', e.message);
      }
    }

    // Default stub behavior for simple tasks
    console.log(`[AgentPool] Simple task handled internally`);
    return { success: true, delegated: false };
  }
}

module.exports = new AgentPool();