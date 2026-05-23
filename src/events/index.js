const { pool } = require('../db');

const handlers = {};
const EVENT_TYPES = [
  'on_goal_completed',
  'on_goal_created',
  'on_stage_advance',
  'on_badge_earned',
  'on_level_up',
  'on_churn_risk_high',
  'on_cognitive_change',
  'on_message_sent',
  'on_user_created',
  'on_automation_triggered',
  'on_override_activated',
  'on_xp_milestone',
  'on_streak_update',
];

function on(eventType, handler) {
  if (!handlers[eventType]) handlers[eventType] = [];
  handlers[eventType].push(handler);
}

function off(eventType, handler) {
  if (!handlers[eventType]) return;
  handlers[eventType] = handlers[eventType].filter(h => h !== handler);
}

async function emit(eventType, data = {}) {
  if (!EVENT_TYPES.includes(eventType)) {
    console.warn(`[EventBus] Unknown event type: ${eventType}`);
    return;
  }

  const listenerCount = handlers[eventType]?.length || 0;
  console.log(`[EventBus] Emitting ${eventType} (${listenerCount} handlers)`, data.userId || '');

  const results = [];
  if (handlers[eventType]) {
    for (const handler of handlers[eventType]) {
      try {
        const result = await handler(data);
        results.push({ success: true, result });
      } catch (err) {
        console.error(`[EventBus] Handler error for ${eventType}:`, err.message);
        results.push({ success: false, error: err.message });
      }
    }
  }

  try {
    await logEvent(eventType, data, results);
  } catch (err) {
    console.error('[EventBus] Failed to log event:', err.message);
  }

  try {
    await processAutomations(eventType, data);
  } catch (err) {
    console.error('[EventBus] Automation processing error:', err.message);
  }

  return results;
}

async function logEvent(eventType, data, results) {
  const id = 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  await pool.execute(
    `INSERT INTO event_log (id, event_type, user_id, persona_id, session_id, data, results, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE data=VALUES(data)`,
    [
      id,
      eventType,
      data.userId || data.user_id || null,
      data.personaId || data.persona_id || null,
      data.sessionId || data.session_id || null,
      JSON.stringify(data),
      JSON.stringify(results.map(r => r.success ? 'ok' : r.error)),
    ]
  );
}

async function processAutomations(eventType, data) {
  const [automations] = await pool.execute(
    `SELECT * FROM persona_automations
     WHERE is_active = 1 AND trigger_type = 'event'
     AND JSON_EXTRACT(trigger_config, '$.event') = ?`,
    [eventType]
  );

  for (const auto of automations) {
    try {
      const triggerConfig = typeof auto.trigger_config === 'string' ? JSON.parse(auto.trigger_config) : auto.trigger_config;
      const actionConfig = typeof auto.action_config === 'string' ? JSON.parse(auto.action_config) : auto.action_config;

      const conditionsMet = checkConditions(triggerConfig, data);
      if (!conditionsMet) continue;

      await executeAutomation(auto, actionConfig, data);
    } catch (err) {
      console.error(`[EventBus] Automation ${auto.id} error:`, err.message);
    }
  }
}

function checkConditions(triggerConfig, data) {
  if (triggerConfig.conditions) {
    for (const [key, value] of Object.entries(triggerConfig.conditions)) {
      if (data[key] !== value) return false;
    }
  }
  if (triggerConfig.minChurnRisk && (data.churnRisk || 0) < triggerConfig.minChurnRisk) return false;
  if (triggerConfig.minLevel && (data.level || 0) < triggerConfig.minLevel) return false;
  return true;
}

async function executeAutomation(auto, actionConfig, data) {
  switch (auto.action_type) {
    case 'message': {
      const { pool: db } = require('../db');
      const sessionId = data.sessionId || data.session_id;
      if (sessionId) {
        const msgStore = require('../memory/session');
        await msgStore.addMessage(sessionId, 'assistant', actionConfig.message || '[automated message]');
      }
      break;
    }
    case 'create_task': {
      const agent = require('../agent');
      await agent.createTask({
        title: actionConfig.task_title || `Task from event: ${auto.name}`,
        description: actionConfig.task_description || '',
        persona_id: auto.persona_id,
        owner_id: data.userId || data.user_id || 'system',
        priority: actionConfig.priority || 'medium',
      });
      break;
    }
    case 'switch_persona': {
      if (actionConfig.persona_id && data.sessionId) {
        const personaManager = require('../persona/manager');
        await personaManager.setSessionPersona(data.sessionId, actionConfig.persona_id);
      }
      break;
    }
    case 'invoke_skill': {
      if (actionConfig.skill_id) {
        const skillsModule = require('../skills');
        try {
          await skillsModule.invokeSkill(actionConfig.skill_id, actionConfig.input || '', data);
        } catch (err) {
          console.error(`[EventBus] Skill invocation error:`, err.message);
        }
      }
      break;
    }
    case 'webhook': {
      if (actionConfig.url) {
        try {
          const fetch = require('node-fetch');
          await fetch(actionConfig.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: auto.trigger_type, automation: auto.id, data }),
            timeout: 5000,
          });
        } catch (err) {
          console.error(`[EventBus] Webhook error:`, err.message);
        }
      }
      break;
    }
    case 'send_email': {
      if (actionConfig.email_to) {
        try {
          const { sendMail } = require('../email');
          await sendMail(
            actionConfig.email_to,
            actionConfig.email_subject || `Event: ${auto.name}`,
            actionConfig.email_body || JSON.stringify(data)
          );
        } catch (err) {
          console.error(`[EventBus] Email error:`, err.message);
        }
      }
      break;
    }
    default:
      console.warn(`[EventBus] Unknown automation action: ${auto.action_type}`);
  }

  await pool.execute(
    'UPDATE persona_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = ?',
    [auto.id]
  );
}

async function getEventLog(filters = {}) {
  let sql = 'SELECT * FROM event_log WHERE 1=1';
  const values = [];
  if (filters.event_type) { sql += ' AND event_type = ?'; values.push(filters.event_type); }
  if (filters.user_id) { sql += ' AND user_id = ?'; values.push(filters.user_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  sql += ' ORDER BY created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  else { sql += ' LIMIT 100'; }
  const [rows] = await pool.execute(sql, values);
  return rows;
}

async function getEventStats(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const [rows] = await pool.execute(
    'SELECT event_type, COUNT(*) as count FROM event_log WHERE created_at >= ? GROUP BY event_type ORDER BY count DESC',
    [since]
  );
  const [totalRows] = await pool.execute(
    'SELECT COUNT(*) as total FROM event_log WHERE created_at >= ?',
    [since]
  );
  return { byType: rows, total: totalRows[0].total, period: `${days} days` };
}

module.exports = {
  EVENT_TYPES,
  on,
  off,
  emit,
  logEvent,
  getEventLog,
  getEventStats,
};