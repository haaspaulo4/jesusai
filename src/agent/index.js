const { pool } = require('../db');
const crypto = require('crypto');

function genId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

async function createTask(data) {
  const id = data.id || genId('task');
  const persona_id = data.persona_id || null;
  const owner_id = data.owner_id || 'system';
  const title = data.title || 'Untitled task';
  const description = data.description || '';
  const status = data.status || 'pending';
  const priority = data.priority || 'medium';
  const due_date = data.due_date || null;
  const assigned_to = data.assigned_to || null;
  const auto_execute = data.auto_execute ? 1 : 0;
  const skill_id = data.skill_id || null;

  await pool.execute(
    `INSERT INTO persona_tasks (id, persona_id, owner_id, title, description, status, priority, due_date, assigned_to, auto_execute, skill_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), status=VALUES(status),
     priority=VALUES(priority), due_date=VALUES(due_date), assigned_to=VALUES(assigned_to), result=COALESCE(VALUES(result), result),
     auto_execute=VALUES(auto_execute), skill_id=VALUES(skill_id)`,
    [id, persona_id, owner_id, title, description, status, priority, due_date, assigned_to, auto_execute, skill_id]
  );
  return getTask(id);
}

async function updateTask(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['persona_id', 'title', 'description', 'status', 'priority', 'due_date', 'assigned_to', 'result', 'auto_execute', 'skill_id'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) return getTask(id);
  values.push(id);
  await pool.execute(`UPDATE persona_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
  return getTask(id);
}

async function deleteTask(id) {
  await pool.execute('DELETE FROM persona_tasks WHERE id = ?', [id]);
  return { deleted: true };
}

async function getTask(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_tasks WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatRow(rows[0]);
}

async function listTasks(filters = {}) {
  let sql = 'SELECT * FROM persona_tasks WHERE 1=1';
  const values = [];
  if (filters.owner_id) { sql += ' AND owner_id = ?'; values.push(filters.owner_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  if (filters.status) { sql += ' AND status = ?'; values.push(filters.status); }
  if (filters.priority) { sql += ' AND priority = ?'; values.push(filters.priority); }
  sql += ' ORDER BY CASE priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 WHEN "low" THEN 4 END, due_date ASC, created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatRow);
}

async function getOverdueTasks(ownerId) {
  const [rows] = await pool.execute(
    'SELECT * FROM persona_tasks WHERE owner_id = ? AND status != ? AND due_date IS NOT NULL AND due_date < NOW() ORDER BY due_date ASC',
    [ownerId, 'completed']
  );
  return rows.map(formatRow);
}

async function createCalendarEvent(data) {
  const id = data.id || genId('evt');
  const persona_id = data.persona_id || null;
  const owner_id = data.owner_id || 'system';
  const title = data.title || 'Untitled event';
  const description = data.description || '';
  const event_type = data.event_type || 'meeting';
  const start_time = data.start_time || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const end_time = data.end_time || null;
  const location = data.location || null;
  const attendees = typeof data.attendees === 'object' ? JSON.stringify(data.attendees) : data.attendees || null;
  const reminders = typeof data.reminders === 'object' ? JSON.stringify(data.reminders) : data.reminders || null;
  const status = data.status || 'confirmed';

  await pool.execute(
    `INSERT INTO persona_calendar (id, persona_id, owner_id, title, description, event_type, start_time, end_time, location, attendees, reminders, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), event_type=VALUES(event_type),
     start_time=VALUES(start_time), end_time=VALUES(end_time), location=VALUES(location),
     attendees=VALUES(attendees), reminders=VALUES(reminders), status=VALUES(status)`,
    [id, persona_id, owner_id, title, description, event_type, start_time, end_time, location, attendees, reminders, status]
  );
  return getCalendarEvent(id);
}

async function updateCalendarEvent(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['persona_id', 'title', 'description', 'event_type', 'start_time', 'end_time', 'location', 'attendees', 'reminders', 'status'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === 'attendees' || key === 'reminders' ? (typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key]) : data[key]);
    }
  }
  if (fields.length === 0) return getCalendarEvent(id);
  values.push(id);
  await pool.execute(`UPDATE persona_calendar SET ${fields.join(', ')} WHERE id = ?`, values);
  return getCalendarEvent(id);
}

async function deleteCalendarEvent(id) {
  await pool.execute('DELETE FROM persona_calendar WHERE id = ?', [id]);
  return { deleted: true };
}

async function getCalendarEvent(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_calendar WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatRow(rows[0]);
}

async function listCalendarEvents(filters = {}) {
  let sql = 'SELECT * FROM persona_calendar WHERE 1=1';
  const values = [];
  if (filters.owner_id) { sql += ' AND owner_id = ?'; values.push(filters.owner_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  if (filters.event_type) { sql += ' AND event_type = ?'; values.push(filters.event_type); }
  if (filters.start_after) { sql += ' AND start_time >= ?'; values.push(filters.start_after); }
  if (filters.start_before) { sql += ' AND start_time <= ?'; values.push(filters.start_before); }
  sql += ' ORDER BY start_time ASC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatRow);
}

async function getUpcomingEvents(ownerId, days = 7) {
  const [rows] = await pool.execute(
    'SELECT * FROM persona_calendar WHERE owner_id = ? AND start_time >= NOW() AND start_time <= DATE_ADD(NOW(), INTERVAL ? DAY) ORDER BY start_time ASC',
    [ownerId, days]
  );
  return rows.map(formatRow);
}

async function createContact(data) {
  const id = data.id || genId('cont');
  const persona_id = data.persona_id || null;
  const owner_id = data.owner_id || 'system';
  const name = data.name || 'Unknown';
  const email = data.email || null;
  const phone = data.phone || null;
  const company = data.company || null;
  const role = data.role || null;
  const tags = typeof data.tags === 'object' ? JSON.stringify(data.tags) : data.tags || null;
  const notes = data.notes || null;
  const stage = data.stage || 'lead';
  const custom_fields = typeof data.custom_fields === 'object' ? JSON.stringify(data.custom_fields) : data.custom_fields || null;

  await pool.execute(
    `INSERT INTO persona_contacts (id, persona_id, owner_id, name, email, phone, company, role, tags, notes, stage, custom_fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email), phone=VALUES(phone),
     company=VALUES(company), role=VALUES(role), tags=VALUES(tags), notes=VALUES(notes),
     stage=VALUES(stage), custom_fields=VALUES(custom_fields)`,
    [id, persona_id, owner_id, name, email, phone, company, role, tags, notes, stage, custom_fields]
  );
  return getContact(id);
}

async function updateContact(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['persona_id', 'name', 'email', 'phone', 'company', 'role', 'tags', 'notes', 'stage', 'custom_fields', 'last_contact_at'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === 'tags' || key === 'custom_fields') val = typeof val === 'object' ? JSON.stringify(val) : val;
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length === 0) return getContact(id);
  values.push(id);
  await pool.execute(`UPDATE persona_contacts SET ${fields.join(', ')} WHERE id = ?`, values);
  return getContact(id);
}

async function deleteContact(id) {
  await pool.execute('DELETE FROM persona_contacts WHERE id = ?', [id]);
  return { deleted: true };
}

async function getContact(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_contacts WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatRow(rows[0]);
}

async function listContacts(filters = {}) {
  let sql = 'SELECT * FROM persona_contacts WHERE 1=1';
  const values = [];
  if (filters.owner_id) { sql += ' AND owner_id = ?'; values.push(filters.owner_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  if (filters.stage) { sql += ' AND stage = ?'; values.push(filters.stage); }
  if (filters.search) { sql += ' AND (name LIKE ? OR email LIKE ? OR company LIKE ?)'; const s = `%${filters.search}%`; values.push(s, s, s); }
  sql += ' ORDER BY last_contact_at DESC, created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatRow);
}

async function createAutomation(data) {
  const id = data.id || genId('auto');
  const persona_id = data.persona_id || null;
  const owner_id = data.owner_id || 'system';
  const name = data.name || 'Untitled automation';
  const description = data.description || '';
  const trigger_type = data.trigger_type || 'manual';
  const trigger_config = typeof data.trigger_config === 'object' ? JSON.stringify(data.trigger_config) : data.trigger_config || '{}';
  const action_type = data.action_type || 'message';
  const action_config = typeof data.action_config === 'object' ? JSON.stringify(data.action_config) : data.action_config || '{}';
  const is_active = data.is_active !== false ? 1 : 0;

  await pool.execute(
    `INSERT INTO persona_automations (id, persona_id, owner_id, name, description, trigger_type, trigger_config, action_type, action_config, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
     trigger_type=VALUES(trigger_type), trigger_config=VALUES(trigger_config),
     action_type=VALUES(action_type), action_config=VALUES(action_config), is_active=VALUES(is_active)`,
    [id, persona_id, owner_id, name, description, trigger_type, trigger_config, action_type, action_config, is_active]
  );
  return getAutomation(id);
}

async function updateAutomation(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['name', 'description', 'trigger_type', 'trigger_config', 'action_type', 'action_config', 'is_active'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === 'trigger_config' || key === 'action_config') val = typeof val === 'object' ? JSON.stringify(val) : val;
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length === 0) return getAutomation(id);
  values.push(id);
  await pool.execute(`UPDATE persona_automations SET ${fields.join(', ')} WHERE id = ?`, values);
  return getAutomation(id);
}

async function deleteAutomation(id) {
  await pool.execute('DELETE FROM persona_automations WHERE id = ?', [id]);
  return { deleted: true };
}

async function getAutomation(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_automations WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatRow(rows[0]);
}

async function listAutomations(filters = {}) {
  let sql = 'SELECT * FROM persona_automations WHERE 1=1';
  const values = [];
  if (filters.owner_id) { sql += ' AND owner_id = ?'; values.push(filters.owner_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  if (filters.trigger_type) { sql += ' AND trigger_type = ?'; values.push(filters.trigger_type); }
  if (filters.is_active !== undefined) { sql += ' AND is_active = ?'; values.push(filters.is_active ? 1 : 0); }
  sql += ' ORDER BY created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatRow);
}

async function checkAndRunAutomations(sessionId, userId, message) {
  const automations = await listAutomations({ owner_id: userId, is_active: true });
  const triggered = [];
  for (const auto of automations) {
    const config = typeof auto.trigger_config === 'string' ? JSON.parse(auto.trigger_config) : (auto.trigger_config || {});
    let shouldTrigger = false;

    if (auto.trigger_type === 'keyword' && config.keywords) {
      const keywords = Array.isArray(config.keywords) ? config.keywords : [config.keywords];
      shouldTrigger = keywords.some(kw => message.toLowerCase().includes(kw.toLowerCase()));
    } else if (auto.trigger_type === 'interval_messages' && config.every_n) {
      const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM messages WHERE session_id = ?', [sessionId]);
      const msgCount = countResult[0].total;
      if (msgCount > 0 && msgCount % config.every_n === 0) shouldTrigger = true;
    } else if (auto.trigger_type === 'schedule' && config.cron) {
      try {
        const cronParts = config.cron.split(' ');
        if (cronParts.length >= 5) {
          const now = new Date();
          const cronMin = cronParts[0] === '*' ? -1 : parseInt(cronParts[0]);
          const cronHour = cronParts[1] === '*' ? -1 : parseInt(cronParts[1]);
          if ((cronMin === -1 || now.getMinutes() === cronMin) && (cronHour === -1 || now.getHours() === cronHour)) {
            const lastRun = auto.last_run_at ? new Date(auto.last_run_at) : null;
            if (!lastRun || (now.getTime() - lastRun.getTime()) > 58000) shouldTrigger = true;
          }
        }
      } catch {}
    } else if (auto.trigger_type === 'manual') {
      continue;
    }

    if (shouldTrigger) {
      await pool.execute('UPDATE persona_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = ?', [auto.id]);

      const actionConfig = typeof auto.action_config === 'string' ? JSON.parse(auto.action_config) : (auto.action_config || {});
      const result = await executeAutomationAction(auto.action_type, actionConfig, sessionId, userId);

      triggered.push({
        id: auto.id,
        name: auto.name,
        action_type: auto.action_type,
        action_config: actionConfig,
        result,
      });
    }
  }
  return triggered;
}

async function executeAutomationAction(actionType, actionConfig, sessionId, userId) {
  switch (actionType) {
    case 'message':
      return { sent: true, message: actionConfig.message || '' };
    case 'create_task': {
      const tasks = require('./index');
      const task = await tasks.createTask({
        persona_id: actionConfig.persona_id || null,
        owner_id: userId,
        title: actionConfig.title || 'Automated task',
        description: actionConfig.description || '',
        priority: actionConfig.priority || 'medium',
        status: 'pending',
      });
      return { created: true, task_id: task.id };
    }
    case 'send_email': {
      try {
        const { sendEmail } = require('../email');
        await sendEmail({ to: actionConfig.email_to, subject: actionConfig.subject || 'Notification', text: actionConfig.body || '' });
        return { sent: true, to: actionConfig.email_to };
      } catch (err) {
        return { sent: false, error: err.message };
      }
    }
    case 'webhook': {
      try {
        const response = await fetch(actionConfig.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actionConfig.payload || {}), signal: AbortSignal.timeout(10000) });
        return { status: response.status };
      } catch (err) {
        return { error: err.message };
      }
    }
    case 'switch_persona':
      return { switch_to: actionConfig.persona_id };
    case 'invoke_skill':
      return { skill_invoked: actionConfig.skill_id };
    default:
      return { error: `Unknown action type: ${actionType}` };
  }
}

async function saveHistory(personaId, sessionId, userId, role, content, toolCalls, toolResults) {
  const id = null;
  await pool.execute(
    'INSERT INTO persona_messages (persona_id, session_id, user_id, role, content, tool_calls, tool_results) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [personaId, sessionId, userId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, toolResults ? JSON.stringify(toolResults) : null]
  );
}

async function getHistory(personaId, userId, limit = 50) {
  let sql = 'SELECT * FROM persona_messages WHERE user_id = ?';
  const values = [userId];
  if (personaId) { sql += ' AND persona_id = ?'; values.push(personaId); }
  sql += ' ORDER BY created_at DESC';
  sql += ` LIMIT ${Number(limit)}`;
  const [rows] = await pool.execute(sql, values);
  return rows.reverse().map(formatRow);
}

async function getDashboardStats(userId) {
  const [tasks] = await pool.execute('SELECT status, COUNT(*) as count FROM persona_tasks WHERE owner_id = ? GROUP BY status', [userId]);
  const [events] = await pool.execute('SELECT COUNT(*) as count FROM persona_calendar WHERE owner_id = ? AND start_time >= NOW() AND start_time <= DATE_ADD(NOW(), INTERVAL 7 DAY)', [userId]);
  const [contacts] = await pool.execute('SELECT stage, COUNT(*) as count FROM persona_contacts WHERE owner_id = ? GROUP BY stage', [userId]);
  const [automations] = await pool.execute('SELECT COUNT(*) as count FROM persona_automations WHERE owner_id = ? AND is_active = 1', [userId]);
  const [personas] = await pool.execute('SELECT COUNT(*) as count FROM personas WHERE is_active = 1');
  const [skills] = await pool.execute('SELECT COUNT(*) as count FROM persona_skills WHERE is_active = 1');
  const [goals] = await pool.execute('SELECT status, COUNT(*) as count FROM persona_goals WHERE owner_id = ? GROUP BY status', [userId]);
  const [orgMemory] = await pool.execute('SELECT category, COUNT(*) as count FROM persona_org_memory WHERE owner_id = ? AND is_active = 1 GROUP BY category', [userId]);

  return {
    tasks: { byStatus: Object.fromEntries(tasks.map(t => [t.status, t.count])), total: tasks.reduce((s, t) => s + t.count, 0) },
    upcomingEvents: events[0].count,
    contacts: { byStage: Object.fromEntries(contacts.map(c => [c.stage, c.count])), total: contacts.reduce((s, c) => s + c.count, 0) },
    activeAutomations: automations[0].count,
    activePersonas: personas[0].count,
    activeSkills: skills[0].count,
    goals: { byStatus: Object.fromEntries(goals.map(g => [g.status, g.count])), total: goals.reduce((s, g) => s + g.count, 0) },
    orgMemory: { byCategory: Object.fromEntries(orgMemory.map(m => [m.category, m.count])), total: orgMemory.reduce((s, m) => s + m.count, 0) },
  };
}

function formatRow(row) {
  const result = {};
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === 'string') {
      try {
        if (key === 'tags' || key === 'custom_fields' || key === 'trigger_config' || key === 'action_config' || key === 'attendees' || key === 'reminders' || key === 'tool_calls' || key === 'tool_results' || key === 'metadata') {
          result[key] = JSON.parse(val);
        } else {
          result[key] = val;
        }
      } catch {
        result[key] = val;
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

module.exports = {
  createTask, updateTask, deleteTask, getTask, listTasks, getOverdueTasks,
  createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getCalendarEvent, listCalendarEvents, getUpcomingEvents,
  createContact, updateContact, deleteContact, getContact, listContacts,
  createAutomation, updateAutomation, deleteAutomation, getAutomation, listAutomations, checkAndRunAutomations,
  saveHistory, getHistory, getDashboardStats,
};