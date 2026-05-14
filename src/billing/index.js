require('dotenv').config();
const { pool } = require('../db');

const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    currency: 'BRL',
    period: 'monthly',
    limits: {
      personas: 3,
      contacts: 1000,
      messages_per_day: 500,
      automations: 5,
      media_per_month: 50,
      knowledge_sources: 3,
      knowledge_storage_mb: 100,
      skills: 10,
      team_members: 1,
    },
    features: ['basic_chat', 'single_channel', 'knowledge_upload', 'basic_analytics'],
  },
  starter: {
    name: 'Starter',
    price: 97,
    currency: 'BRL',
    period: 'monthly',
    limits: {
      personas: 10,
      contacts: 5000,
      messages_per_day: 3000,
      automations: 20,
      media_per_month: 200,
      knowledge_sources: 10,
      knowledge_storage_mb: 500,
      skills: 50,
      team_members: 3,
    },
    features: ['basic_chat', 'multi_channel', 'knowledge_upload', 'basic_analytics', 'crm', 'calendar', 'creative_engine', 'automations'],
  },
  pro: {
    name: 'Pro',
    price: 297,
    currency: 'BRL',
    period: 'monthly',
    limits: {
      personas: 50,
      contacts: 25000,
      messages_per_day: 15000,
      automations: 100,
      media_per_month: 1000,
      knowledge_sources: 50,
      knowledge_storage_mb: 5000,
      skills: 200,
      team_members: 10,
    },
    features: ['basic_chat', 'multi_channel', 'knowledge_upload', 'advanced_analytics', 'crm', 'calendar', 'creative_engine',
               'automations', 'api_access', 'webhooks', 'blueprints', 'custom_branding', 'priority_support'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 997,
    currency: 'BRL',
    period: 'monthly',
    limits: {
      personas: Infinity,
      contacts: Infinity,
      messages_per_day: Infinity,
      automations: Infinity,
      media_per_month: Infinity,
      knowledge_sources: Infinity,
      knowledge_storage_mb: Infinity,
      skills: Infinity,
      team_members: Infinity,
    },
    features: ['basic_chat', 'multi_channel', 'knowledge_upload', 'advanced_analytics', 'crm', 'calendar', 'creative_engine',
               'automations', 'api_access', 'webhooks', 'blueprints', 'custom_branding', 'priority_support',
               'sla', 'custom_integrations', 'dedicated_support'],
  },
};

class BillingManager {
  constructor() {
    this.plans = PLANS;
  }

  getPlan(planId) {
    return this.plans[planId] || this.plans.free;
  }

  getAllPlans() {
    return Object.entries(this.plans).map(([id, plan]) => ({
      id,
      ...plan,
      limits: Object.fromEntries(
        Object.entries(plan.limits).map(([k, v]) => [k, v === Infinity ? 'unlimited' : v])
      ),
    }));
  }

  async getSubscription(workspaceId) {
    const [rows] = await pool.execute(
      'SELECT * FROM subscriptions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1',
      [workspaceId]
    );

    if (rows.length === 0) {
      return { plan: 'free', status: 'active', limits: this.plans.free.limits };
    }

    return rows[0];
  }

  async createSubscription(workspaceId, planId, data = {}) {
    const plan = this.getPlan(planId);
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await pool.execute(
      `INSERT INTO subscriptions (id, workspace_id, plan, status, current_period_start, current_period_end, created_at)
       VALUES (?, ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
      [id, workspaceId, planId]
    );

    await pool.execute(
      'UPDATE workspaces SET plan = ? WHERE id = ?',
      [planId, workspaceId]
    );

    return { id, workspaceId, plan: planId, status: 'active', limits: plan.limits };
  }

  async cancelSubscription(workspaceId) {
    await pool.execute(
      `UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE workspace_id = ? AND status = 'active'`,
      [workspaceId]
    );

    await pool.execute(
      'UPDATE workspaces SET plan = ? WHERE id = ?',
      ['free', workspaceId]
    );

    return { workspaceId, status: 'cancelled' };
  }

  async checkLimit(workspaceId, resource) {
    const sub = await this.getSubscription(workspaceId);
    const plan = this.getPlan(sub.plan || 'free');
    const limit = plan.limits[resource];
    const usage = await this._getResourceUsage(workspaceId, resource);

    if (limit === Infinity) return { allowed: true, current: usage, limit: 'unlimited' };
    return { allowed: usage < limit, current: usage, limit };
  }

  async trackUsage(workspaceId, resource, amount = 1) {
    const id = `usage_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await pool.execute(
        `INSERT INTO usage_tracking (id, workspace_id, resource, amount, period_start, period_end, created_at)
         VALUES (?, ?, ?, ?, DATE_FORMAT(NOW(), '%Y-%m-01'), DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-01'), NOW())`,
        [id, workspaceId, resource, amount]
      );
    } catch {}
  }

  async _getResourceUsage(workspaceId, resource) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    switch (resource) {
      case 'personas': {
        const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM personas WHERE workspace_id = ? AND is_active = 1', [workspaceId]);
        return rows[0].cnt;
      }
      case 'contacts': {
        const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM persona_contacts WHERE workspace_id = ?', [workspaceId]);
        return rows[0].cnt;
      }
      case 'messages_per_day': {
        const [rows] = await pool.execute(
          `SELECT COUNT(*) as cnt FROM channel_messages WHERE workspace_id = ? AND direction = 'inbound' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
          [workspaceId]
        );
        return rows[0].cnt;
      }
      case 'automations': {
        const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM persona_automations WHERE workspace_id = ? AND is_active = 1', [workspaceId]);
        return rows[0].cnt;
      }
      default:
        return 0;
    }
  }

  async getUsageReport(workspaceId) {
    const sub = await this.getSubscription(workspaceId);
    const plan = this.getPlan(sub.plan || 'free');

    const report = {};
    for (const resource of Object.keys(plan.limits)) {
      report[resource] = await this.checkLimit(workspaceId, resource);
    }

    return { plan: sub.plan || 'free', usage: report };
  }
}

const billingManager = new BillingManager();

module.exports = {
  billingManager,
  BillingManager,
  PLANS,
};