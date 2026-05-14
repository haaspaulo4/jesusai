require('dotenv').config();
const { pool } = require('../db');
const { Engine } = require('json-rules-engine');

const WORKSPACE_ROLES = ['owner', 'admin', 'manager', 'operator', 'viewer', 'billing', 'support'];
const PERSONA_ROLES = ['persona_admin', 'trainer', 'moderator', 'reviewer', 'observer'];
const PERSONA_STATES = ['draft', 'training', 'testing', 'active', 'paused', 'archived'];
const APPROVAL_MODES = ['manual', 'semi_auto', 'full_auto'];

class WorkspaceManager {
  constructor() {
    this._cache = new Map();
  }

  async createWorkspace(data) {
    const id = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await pool.execute(
      `INSERT INTO workspaces (id, name, slug, owner_id, plan, settings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [id, data.name, data.slug || id, data.ownerId, data.plan || 'free', JSON.stringify(data.settings || {})]
    );
    this._cache.delete(id);
    return this.getWorkspace(id);
  }

  async getWorkspace(id) {
    if (this._cache.has(id)) {
      const cached = this._cache.get(id);
      if (Date.now() - cached._ts < 30000) return cached;
    }

    const [rows] = await pool.execute('SELECT * FROM workspaces WHERE id = ?', [id]);
    if (rows.length === 0) return null;

    const ws = { ...rows[0], _ts: Date.now() };
    ws.settings = typeof ws.settings === 'string' ? JSON.parse(ws.settings) : ws.settings || {};
    this._cache.set(id, ws);
    return ws;
  }

  async updateWorkspace(id, data) {
    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue;
      sets.push(`${key} = ?`);
      params.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
    params.push(id);
    await pool.execute(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = ?`, params);
    this._cache.delete(id);
    return this.getWorkspace(id);
  }

  async addMember(workspaceId, userId, role = 'operator') {
    const id = `wm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await pool.execute(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE role = ?, joined_at = NOW()`,
      [id, workspaceId, userId, role, role]
    );
    return { workspaceId, userId, role };
  }

  async removeMember(workspaceId, userId) {
    await pool.execute(
      'DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId]
    );
  }

  async getMembers(workspaceId) {
    const [rows] = await pool.execute(
      `SELECT wm.*, u.name, u.email FROM workspace_members wm
       JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = ?`,
      [workspaceId]
    );
    return rows;
  }

  async getUserWorkspaces(userId) {
    const [rows] = await pool.execute(
      `SELECT wm.*, w.name, w.slug, w.plan FROM workspace_members wm
       JOIN workspaces w ON wm.workspace_id = w.id WHERE wm.user_id = ?`,
      [userId]
    );
    return rows;
  }

  async getUserRoleInWorkspace(userId, workspaceId) {
    const [rows] = await pool.execute(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId]
    );
    return rows.length > 0 ? rows[0].role : null;
  }

  async checkPermission(userId, workspaceId, permission) {
    const role = await this.getUserRoleInWorkspace(userId, workspaceId);
    if (!role) return false;
    if (role === 'owner') return true;

    const permMap = {
      admin: ['all'],
      manager: ['read', 'write', 'create', 'delete', 'invite', 'manage_personas', 'manage_automations', 'manage_contacts', 'view_analytics'],
      operator: ['read', 'write', 'create', 'manage_contacts', 'view_analytics'],
      viewer: ['read', 'view_analytics'],
      billing: ['read', 'manage_billing', 'view_analytics'],
      support: ['read', 'write', 'manage_contacts'],
    };

    const allowed = permMap[role] || [];
    return allowed.includes('all') || allowed.includes(permission);
  }

  async getWorkspaceUsage(workspaceId) {
    const [personaCount] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM personas WHERE workspace_id = ?',
      [workspaceId]
    );
    const [contactCount] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM persona_contacts WHERE workspace_id = ?',
      [workspaceId]
    );
    const [msgCount] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM messages m
       JOIN sessions s ON m.session_id = s.id WHERE s.workspace_id = ?`,
      [workspaceId]
    );

    return {
      personas: personaCount[0].cnt,
      contacts: contactCount[0].cnt,
      messages: msgCount[0].cnt,
    };
  }

  async checkLimits(workspaceId, resource) {
    const ws = await this.getWorkspace(workspaceId);
    if (!ws) return { allowed: false, reason: 'Workspace not found' };

    const limits = {
      free: { personas: 3, contacts: 1000, messages_per_day: 500, automations: 5, media_per_month: 50 },
      starter: { personas: 10, contacts: 5000, messages_per_day: 2000, automations: 20, media_per_month: 200 },
      pro: { personas: 50, contacts: 25000, messages_per_day: 10000, automations: 100, media_per_month: 1000 },
      enterprise: { personas: Infinity, contacts: Infinity, messages_per_day: Infinity, automations: Infinity, media_per_month: Infinity },
    };

    const planLimits = limits[ws.plan] || limits.free;
    const usage = await this.getWorkspaceUsage(workspaceId);

    if (resource === 'personas') {
      return { allowed: usage.personas < planLimits.personas, current: usage.personas, limit: planLimits.personas };
    }
    if (resource === 'contacts') {
      return { allowed: usage.contacts < planLimits.contacts, current: usage.contacts, limit: planLimits.contacts };
    }

    return { allowed: true };
  }

  invalidateCache(workspaceId) {
    this._cache.delete(workspaceId);
  }
}

class BusinessRuleEngine {
  constructor() {
    this._rules = new Map();
    this._engine = new Engine();
  }

  async loadRules(workspaceId) {
    if (this._rules.has(workspaceId)) return;

    const [rows] = await pool.execute(
      'SELECT * FROM business_rules WHERE workspace_id = ? AND is_active = 1 ORDER BY priority ASC',
      [workspaceId]
    );

    for (const row of rows) {
      const rule = typeof row.rule_config === 'string' ? JSON.parse(row.rule_config) : row.rule_config;
      this._engine.addRule(this._convertRule(rule));
    }

    this._rules.set(workspaceId, rows);
  }

  _convertRule(ruleConfig) {
    return {
      conditions: {
        all: (ruleConfig.conditions || []).map(c => ({
          fact: c.fact,
          operator: c.operator || 'equal',
          value: c.value,
        })),
      },
      event: {
        type: ruleConfig.action || 'default',
        params: ruleConfig.params || {},
      },
      priority: ruleConfig.priority || 50,
    };
  }

  async evaluate(workspaceId, facts) {
    await this.loadRules(workspaceId);

    const results = [];
    for (const [ruleId, rules] of this._rules.entries()) {
      try {
        const engine = new Engine();
        for (const rule of rules) {
          const config = typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config;
          engine.addRule(this._convertRule(config));
        }
        const { events } = await engine.run(facts);
        results.push(...events.map(e => ({ rule: ruleId, action: e.type, params: e.params })));
      } catch {}
    }

    return results;
  }

  async addRule(workspaceId, ruleData) {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await pool.execute(
      `INSERT INTO business_rules (id, workspace_id, name, description, rule_type, rule_config, priority, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [id, workspaceId, ruleData.name, ruleData.description || '', ruleData.rule_type || 'custom',
       JSON.stringify(ruleData.config), ruleData.priority || 50]
    );
    this._rules.delete(workspaceId);
    return { id, workspaceId, name: ruleData.name };
  }

  async removeRule(workspaceId, ruleId) {
    await pool.execute('DELETE FROM business_rules WHERE id = ? AND workspace_id = ?', [ruleId, workspaceId]);
    this._rules.delete(workspaceId);
  }

  async listRules(workspaceId) {
    const [rows] = await pool.execute(
      'SELECT * FROM business_rules WHERE workspace_id = ? ORDER BY priority ASC',
      [workspaceId]
    );
    return rows;
  }

  getDefaultRules() {
    return [
      {
        name: 'Guest message limit',
        description: 'Limit guest messages per day',
        rule_type: 'rate_limit',
        priority: 10,
        config: {
          conditions: [{ fact: 'userRole', operator: 'equal', value: 'guest' }],
          action: 'limit_messages',
          params: { maxPerDay: 5 },
        },
      },
      {
        name: 'Purchase intent → sales persona',
        description: 'Switch to sales persona on purchase intent',
        rule_type: 'persona_switch',
        priority: 20,
        config: {
          conditions: [{ fact: 'intent', operator: 'equal', value: 'purchase' }],
          action: 'switch_persona',
          params: { personaId: 'sales' },
        },
      },
      {
        name: 'High churn risk → human override',
        description: 'Activate human override when churn risk is high',
        rule_type: 'override',
        priority: 30,
        config: {
          conditions: [{ fact: 'churnRisk', operator: 'greaterThan', value: 0.7 }],
          action: 'human_override',
          params: { overrideType: 'approval' },
        },
      },
      {
        name: 'Frustrated user → patience mode',
        description: 'Adjust persona tone for frustrated users',
        rule_type: 'tone_adjust',
        priority: 40,
        config: {
          conditions: [{ fact: 'emotion', operator: 'equal', value: 'frustrated' }],
          action: 'adjust_tone',
          params: { tone: 'patient', extraEmpathy: true },
        },
      },
    ];
  }

  async seedDefaultRules(workspaceId) {
    const defaults = this.getDefaultRules();
    for (const rule of defaults) {
      await this.addRule(workspaceId, rule);
    }
    return defaults;
  }
}

const workspaceManager = new WorkspaceManager();
const ruleEngine = new BusinessRuleEngine();

module.exports = {
  workspaceManager,
  BusinessRuleEngine,
  ruleEngine,
  WORKSPACE_ROLES,
  PERSONA_ROLES,
  PERSONA_STATES,
  APPROVAL_MODES,
};