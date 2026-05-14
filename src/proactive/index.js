const { pool } = require('../db');
const gamification = require('../gamification');

class ProactiveEngine {
  constructor() {
    this.intervals = [];
    this.running = false;
  }

  start(intervalMinutes = 60) {
    if (this.running) return;
    this.running = true;
    this.tick();
    this.intervals.push(setInterval(() => this.tick(), intervalMinutes * 60 * 1000));
    console.log(`[ProactiveEngine] Started with ${intervalMinutes}min interval`);
  }

  stop() {
    this.running = false;
    for (const iv of this.intervals) clearInterval(iv);
    this.intervals = [];
    console.log('[ProactiveEngine] Stopped');
  }

  async tick() {
    try {
      await this.checkAutomations();
      await this.checkStreakReminders();
      await this.checkGoalDeadlines();
    } catch (err) {
      console.error('[ProactiveEngine] Tick error:', err.message);
    }
  }

  async checkAutomations() {
    const [autos] = await pool.execute(
      "SELECT * FROM persona_automations WHERE trigger_type = 'schedule' AND is_active = 1"
    );
    const now = new Date();
    const triggered = [];

    for (const auto of autos) {
      const config = typeof auto.trigger_config === 'string' ? JSON.parse(auto.trigger_config) : (auto.trigger_config || {});
      if (!config.cron) continue;

      const lastRun = auto.last_run_at ? new Date(auto.last_run_at) : null;
      const everyMinutes = config.every_minutes || config.interval_minutes || 1440;
      if (lastRun && (now - lastRun) < everyMinutes * 60 * 1000) continue;

      await pool.execute(
        'UPDATE persona_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = ?',
        [auto.id]
      );
      triggered.push({
        id: auto.id,
        name: auto.name,
        owner_id: auto.owner_id,
        persona_id: auto.persona_id,
        action_type: auto.action_type,
        action_config: typeof auto.action_config === 'string' ? JSON.parse(auto.action_config) : auto.action_config,
      });
    }

    return triggered;
  }

  async checkStreakReminders() {
    const [users] = await pool.execute(
      "SELECT user_id, persona_id, streak, last_activity FROM user_xp WHERE streak > 0"
    );
    const reminders = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);

    for (const user of users) {
      if (!user.last_activity) continue;
      const lastDate = new Date(user.last_activity).toISOString().slice(0, 10);

      if (lastDate === yesterday && user.streak > 0) {
        reminders.push({
          user_id: user.user_id,
          persona_id: user.persona_id,
          streak: user.streak,
          type: 'streak_at_risk',
          message: `Sua sequencia de ${user.streak} dias esta prestes a acabar! Venha conversar hoje.`,
        });
      }
    }

    return reminders;
  }

  async checkGoalDeadlines() {
    const [goals] = await pool.execute(
      "SELECT * FROM persona_goals WHERE status = 'active' AND due_date IS NOT NULL AND due_date <= DATE_ADD(NOW(), INTERVAL 3 DAY)"
    );
    return goals.map(g => ({
      id: g.id,
      owner_id: g.owner_id,
      persona_id: g.persona_id,
      title: g.title,
      due_date: g.due_date,
      type: 'goal_deadline',
    }));
  }

  async createFollowUp(userId, personaId, type, message) {
    await pool.execute(
      'INSERT INTO follow_ups (user_id, session_id, type, question, status, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, null, type, message, 'pending', new Date()]
    );
  }

  async processScheduledActions() {
    const triggered = await this.checkAutomations();
    const streakReminders = await this.checkStreakReminders();
    const goalDeadlines = await this.checkGoalDeadlines();

    const actions = [...triggered.map(t => ({ ...t, source: 'automation' })),
                     ...streakReminders.map(r => ({ ...r, source: 'streak' })),
                     ...goalDeadlines.map(g => ({ ...g, source: 'goal_deadline' }))];

    return actions;
  }
}

const engine = new ProactiveEngine();

module.exports = engine;