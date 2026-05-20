const { pool } = require('../db');

const debounceCache = new Map();

class AutomationEngine {
  constructor() {
    this.pendingJobs = new Map();
  }

  getDebounceKey(personaId, userId, keywordId) {
    return `${personaId}:${userId}:${keywordId}`;
  }

  isDebounced(personaId, userId, keywordId, windowMinutes = 30) {
    const key = this.getDebounceKey(personaId, userId, keywordId);
    const last = debounceCache.get(key);
    if (!last) return false;
    const elapsed = (Date.now() - last) / 1000 / 60;
    if (elapsed < windowMinutes) return true;
    debounceCache.delete(key);
    return false;
  }

  setDebounce(personaId, userId, keywordId) {
    const key = this.getDebounceKey(personaId, userId, keywordId);
    debounceCache.set(key, Date.now());
  }

  clearDebounce(personaId, userId, keywordId) {
    const key = this.getDebounceKey(personaId, userId, keywordId);
    debounceCache.delete(key);
  }

  async checkKeywordTriggers(personaId, userId, messageText, sessionId) {
    const [triggers] = await pool.execute(
      `SELECT * FROM persona_automations 
       WHERE persona_id = ? AND is_active = 1 AND trigger_type = 'keyword'`,
      [personaId]
    );

    const matched = [];
    const msgLower = messageText.toLowerCase();

    for (const trigger of triggers) {
      const config = trigger.trigger_config || {};
      const keywords = config.keywords || [];
      const windowMinutes = config.debounce_minutes || 30;

      for (const kw of keywords) {
        if (this.isDebounced(personaId, userId, trigger.id, windowMinutes)) continue;

        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundary = /^[a-zA-Z0-9À-ÿ]/u.test(kw) ? `\\b${escaped}` : escaped;
        const pattern = new RegExp(`${wordBoundary}\\b`, 'iu');

        if (pattern.test(msgLower)) {
          this.setDebounce(personaId, userId, trigger.id);
          matched.push(trigger);
          break;
        }
      }
    }

    return matched;
  }

  async checkIntervalTriggers(personaId, userId, messageCount) {
    const [triggers] = await pool.execute(
      `SELECT * FROM persona_automations 
       WHERE persona_id = ? AND is_active = 1 AND trigger_type = 'interval_messages'`,
      [personaId]
    );

    const matched = [];
    for (const trigger of triggers) {
      const config = trigger.trigger_config || {};
      const everyN = config.every_n || 10;
      if (messageCount > 0 && messageCount % everyN === 0) {
        matched.push(trigger);
      }
    }

    return matched;
  }

  async checkScheduledTriggers(personaId) {
    const now = new Date().toISOString();
    const [triggers] = await pool.execute(
      `SELECT * FROM persona_automations 
       WHERE persona_id = ? AND is_active = 1 AND trigger_type = 'schedule' 
       AND next_run_at IS NOT NULL AND next_run_at <= ?`,
      [personaId, now]
    );
    return triggers;
  }

  async checkEventTriggers(personaId, eventType) {
    const [triggers] = await pool.execute(
      `SELECT * FROM persona_automations 
       WHERE persona_id = ? AND is_active = 1 AND trigger_type = 'event' 
       AND trigger_config->'$.event' = ?`,
      [personaId, eventType]
    );
    return triggers;
  }

  async executeTriggerAction(trigger, context) {
    const { userId, personaId, sessionId, message, userMessage } = context;
    const actionConfig = trigger.action_config || {};
    const actionType = trigger.action_type;

    let result = { success: false, actionType };

    switch (actionType) {
      case 'message': {
        result.message = actionConfig.message || '';
        result.success = true;
        break;
      }
      case 'create_task': {
        const { title, priority, dueDate } = actionConfig;
        await pool.execute(
          `INSERT INTO persona_tasks (persona_id, owner_id, title, priority, due_date, status, created_at) 
           VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
          [personaId, userId, title || 'Automated task', priority || 'medium', dueDate || null]
        );
        result.success = true;
        break;
      }
      case 'send_email': {
        result.success = true;
        break;
      }
      case 'webhook': {
        try {
          const webhookResp = await fetch(actionConfig.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger, context, timestamp: Date.now() }),
          });
          result.success = webhookResp.ok;
        } catch (err) {
          result.success = false;
          result.error = err.message;
        }
        break;
      }
      case 'switch_persona': {
        result.newPersonaId = actionConfig.persona_id;
        result.success = true;
        break;
      }
      case 'invoke_skill': {
        result.skillId = actionConfig.skill_id;
        result.success = true;
        break;
      }
      default:
        result.error = `Unknown action type: ${actionType}`;
    }

    await pool.execute(
      `UPDATE persona_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = ?`,
      [trigger.id]
    );

    await pool.execute(
      `INSERT INTO automation_logs (automation_id, user_id, session_id, trigger_type, action_type, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [trigger.id, userId, sessionId, trigger.trigger_type, actionType, JSON.stringify(result)]
    );

    return result;
  }

  async getAutomations(personaId, type = null) {
    let query = 'SELECT * FROM persona_automations WHERE persona_id = ? AND is_active = 1';
    const params = [personaId];
    if (type) { query += ' AND trigger_type = ?'; params.push(type); }
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  async createAutomation(data) {
    const { personaId, ownerId, name, description, triggerType, triggerConfig, actionType, actionConfig } = data;
    const [result] = await pool.execute(
      `INSERT INTO persona_automations (persona_id, owner_id, name, description, trigger_type, trigger_config, action_type, action_config, is_active, run_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
      [personaId, ownerId, name, description || '', triggerType, JSON.stringify(triggerConfig || {}), actionType, JSON.stringify(actionConfig || {})]
    );
    return { id: result.insertId, ...data };
  }

  async toggleAutomation(automationId) {
    await pool.execute(
      `UPDATE persona_automations SET is_active = NOT is_active, updated_at = NOW() WHERE id = ?`,
      [automationId]
    );
    const [rows] = await pool.execute('SELECT * FROM persona_automations WHERE id = ?', [automationId]);
    return rows[0];
  }

  async deleteAutomation(automationId) {
    await pool.execute('DELETE FROM persona_automations WHERE id = ?', [automationId]);
    return { success: true };
  }

  async getAutomationStats(personaId) {
    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM persona_automations WHERE persona_id = ? AND is_active = 1`,
      [personaId]
    );
    const [byTrigger] = await pool.execute(
      `SELECT trigger_type, COUNT(*) as count FROM persona_automations WHERE persona_id = ? AND is_active = 1 GROUP BY trigger_type`,
      [personaId]
    );
    const [recentLogs] = await pool.execute(
      `SELECT al.*, pa.name as automation_name FROM automation_logs al
       JOIN persona_automations pa ON pa.id = al.automation_id
       WHERE pa.persona_id = ? AND al.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY al.created_at DESC LIMIT 50`,
      [personaId]
    );
    return { total: total[0]?.total || 0, byTrigger, recentLogs };
  }

  async seedDefaultAutomations(personaId, ownerId) {
    const defaults = [
      {
        name: 'Saudação inicial',
        description: 'Envia mensagem de boas-vindas para novos usuários',
        triggerType: 'keyword',
        triggerConfig: { keywords: ['oi', 'olá', 'hey', 'start', 'começar'], debounce_minutes: 60 },
        actionType: 'message',
        actionConfig: { message: 'Olá! Seja bem-vindo(a)! Como posso ajudar você hoje?' },
      },
      {
        name: 'Recuperar carrinho',
        description: 'Manda lembrete para usuário com itens no carrinho',
        triggerType: 'interval_messages',
        triggerConfig: { every_n: 10 },
        actionType: 'message',
        actionConfig: { message: 'Olá! Vi que você deixou alguns itens no carrinho. Quer continuar sua compra?' },
      },
      {
        name: 'Feedback após compra',
        description: 'Pedir feedback após pedido finalizado',
        triggerType: 'event',
        triggerConfig: { event: 'on_order_completed' },
        actionType: 'message',
        actionConfig: { message: 'Obrigado pela compra! Como foi sua experiência? Podemos melhorar algo?' },
      },
    ];

    for (const d of defaults) {
      await this.createAutomation({ personaId, ownerId, ...d });
    }

    return { created: defaults.length };
  }
}

const automation = new AutomationEngine();

module.exports = automation;