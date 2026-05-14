const { pool } = require('../db');

const GOAL_TYPES = ['strategic', 'tactical', 'operational', 'learning', 'relationship', 'financial', 'growth'];
const GOAL_STATUSES = ['active', 'paused', 'completed', 'abandoned'];
const GOAL_PRIORITIES = ['urgent', 'high', 'medium', 'low'];

async function createGoal(data) {
  const id = data.id || 'goal_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const persona_id = data.persona_id || null;
  const owner_id = data.owner_id || 'system';
  const title = data.title || 'Untitled goal';
  const description = data.description || '';
  const goal_type = data.goal_type || 'strategic';
  const priority = data.priority || 'medium';
  const status = data.status || 'active';
  const progress = data.progress || 0;
  const target_metric = data.target_metric || null;
  const target_value = data.target_value || null;
  const current_value = data.current_value || null;
  const parent_goal_id = data.parent_goal_id || null;
  const due_date = data.due_date || null;

  await pool.execute(
    `INSERT INTO persona_goals (id, persona_id, owner_id, title, description, goal_type, priority, status, progress, target_metric, target_value, current_value, parent_goal_id, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), goal_type=VALUES(goal_type),
     priority=VALUES(priority), status=VALUES(status), progress=VALUES(progress), target_metric=VALUES(target_metric),
     target_value=VALUES(target_value), current_value=VALUES(current_value), parent_goal_id=VALUES(parent_goal_id),
     due_date=VALUES(due_date)`,
    [id, persona_id, owner_id, title, description, goal_type, priority, status, progress, target_metric, target_value, current_value, parent_goal_id, due_date]
  );
  return getGoal(id);
}

async function updateGoal(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['persona_id', 'title', 'description', 'goal_type', 'priority', 'status', 'progress', 'target_metric', 'target_value', 'current_value', 'parent_goal_id', 'due_date'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (data.status === 'completed') {
    fields.push('completed_at = NOW()');
  }
  if (fields.length === 0) return getGoal(id);
  values.push(id);
  await pool.execute(`UPDATE persona_goals SET ${fields.join(', ')} WHERE id = ?`, values);
  const updatedGoal = await getGoal(id);

  if (data.status === 'completed' && updatedGoal) {
    try {
      const events = require('../events');
      await events.emit('on_goal_completed', {
        goalId: id,
        userId: updatedGoal.owner_id,
        personaId: updatedGoal.persona_id,
        title: updatedGoal.title,
        goal_type: updatedGoal.goal_type,
      });
    } catch {}
  }
  return updatedGoal;
}

async function deleteGoal(id) {
  await pool.execute('DELETE FROM persona_goals WHERE id = ?', [id]);
  await pool.execute('UPDATE persona_goals SET parent_goal_id = NULL WHERE parent_goal_id = ?', [id]);
  return { deleted: true };
}

async function getGoal(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_goals WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatGoal(rows[0]);
}

async function listGoals(filters = {}) {
  let sql = 'SELECT * FROM persona_goals WHERE 1=1';
  const values = [];
  if (filters.owner_id) { sql += ' AND owner_id = ?'; values.push(filters.owner_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  if (filters.status) { sql += ' AND status = ?'; values.push(filters.status); }
  if (filters.goal_type) { sql += ' AND goal_type = ?'; values.push(filters.goal_type); }
  if (filters.priority) { sql += ' AND priority = ?'; values.push(filters.priority); }
  if (filters.parent_goal_id) { sql += ' AND parent_goal_id = ?'; values.push(filters.parent_goal_id); }
  sql += ' ORDER BY CASE priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 WHEN "low" THEN 4 END, due_date ASC, created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatGoal);
}

async function getGoalHierarchy(ownerId, personaId) {
  const goals = await listGoals({ owner_id: ownerId, persona_id: personaId || undefined, status: 'active' });
  const roots = goals.filter(g => !g.parent_goal_id);
  const children = {};
  for (const goal of goals) {
    if (goal.parent_goal_id) {
      if (!children[goal.parent_goal_id]) children[goal.parent_goal_id] = [];
      children[goal.parent_goal_id].push(goal);
    }
  }
  function buildTree(goal) {
    return {
      ...goal,
      children: (children[goal.id] || []).map(buildTree),
    };
  }
  return roots.map(buildTree);
}

async function getGoalProgress(ownerId) {
  const [rows] = await pool.execute(
    'SELECT status, COUNT(*) as count, AVG(progress) as avg_progress FROM persona_goals WHERE owner_id = ? GROUP BY status',
    [ownerId]
  );
  return {
    byStatus: Object.fromEntries(rows.map(r => [r.status, { count: r.count, avgProgress: Math.round(r.avg_progress || 0) }])),
    total: rows.reduce((s, r) => s + r.count, 0),
  };
}

function formatGoal(row) {
  let target_metric = row.target_metric;
  let target_value = row.target_value;
  let current_value = row.current_value;
  return {
    id: row.id,
    persona_id: row.persona_id,
    owner_id: row.owner_id,
    title: row.title,
    description: row.description,
    goal_type: row.goal_type,
    priority: row.priority,
    status: row.status,
    progress: row.progress,
    target_metric,
    target_value,
    current_value,
    parent_goal_id: row.parent_goal_id,
    due_date: row.due_date,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatGoalContext(goals) {
  if (!goals || goals.length === 0) return '';
  const active = goals.filter(g => g.status === 'active');
  if (active.length === 0) return '';
  const lines = active.map(g => {
    let line = `- [${g.priority}] ${g.title}`;
    if (g.progress > 0) line += ` (${g.progress}%)`;
    if (g.target_metric) line += ` | Metric: ${g.target_metric}`;
    if (g.due_date) line += ` | Due: ${g.due_date}`;
    if (g.description) line += `\n  ${g.description.substring(0, 100)}`;
    return line;
  });
  return 'GOALS:\n' + lines.join('\n');
}

module.exports = {
  createGoal, updateGoal, deleteGoal, getGoal, listGoals,
  getGoalHierarchy, getGoalProgress, formatGoalContext,
  GOAL_TYPES, GOAL_STATUSES, GOAL_PRIORITIES,
};