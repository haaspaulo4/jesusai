require('dotenv').config();
const { pool } = require('../db');
const gamification = require('../gamification');
const { QUEUE_NAMES, createWorker, addJob, isAvailable } = require('../queue');

async function processProactiveJob(job) {
  const { type, data } = job.data;

  switch (type) {
    case 'check_automations': {
      const [autos] = await pool.execute(
        "SELECT * FROM persona_automations WHERE trigger_type = 'schedule' AND is_active = 1"
      );
      const now = new Date();
      const triggered = [];

      for (const auto of autos) {
        const config = typeof auto.trigger_config === 'string' ? JSON.parse(auto.trigger_config) : (auto.trigger_config || {});
        if (!config.cron && !config.every_minutes) continue;

        const lastRun = auto.last_run_at ? new Date(auto.last_run_at) : null;
        const everyMinutes = config.every_minutes || config.interval_minutes || 1440;
        if (lastRun && (now - lastRun) < everyMinutes * 60 * 1000) continue;

        await pool.execute(
          'UPDATE persona_automations SET last_run_at = NOW(), run_count = run_count + 1 WHERE id = ?',
          [auto.id]
        );

        if (isAvailable()) {
          await addJob(QUEUE_NAMES.AUTOMATION, {
            automationId: auto.id,
            actionType: auto.action_type,
            actionConfig: typeof auto.action_config === 'string' ? JSON.parse(auto.action_config) : auto.action_config,
            ownerId: auto.owner_id,
            personaId: auto.persona_id,
          });
        }

        triggered.push(auto.id);
      }
      return { triggered };
    }

    case 'check_streaks': {
      const [users] = await pool.execute(
        "SELECT user_id, persona_id, streak, last_activity FROM user_xp WHERE streak > 0"
      );
      const now = new Date();
      const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
      const reminders = [];

      for (const user of users) {
        if (!user.last_activity) continue;
        const lastDate = new Date(user.last_activity).toISOString().slice(0, 10);
        if (lastDate === yesterday && user.streak > 0) {
          reminders.push(user.user_id);

          await pool.execute(
            'INSERT INTO follow_ups (user_id, session_id, type, question, status, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)',
            [user.user_id, null, 'streak_reminder', `Sua sequencia de ${user.streak} dias esta prestes a acabar!`, new Date()]
          );
        }
      }
      return { reminders };
    }

    case 'check_goals': {
      const [goals] = await pool.execute(
        "SELECT * FROM persona_goals WHERE status = 'active' AND due_date IS NOT NULL AND due_date <= DATE_ADD(NOW(), INTERVAL 3 DAY)"
      );
      const deadlines = goals.map(g => ({
        id: g.id,
        title: g.title,
        dueDate: g.due_date,
      }));
      return { deadlines };
    }

    default:
      return { error: `Unknown proactive type: ${type}` };
  }
}

async function processAutomationJob(job) {
  const { automationId, actionType, actionConfig, ownerId, personaId } = job.data;

  switch (actionType) {
    case 'create_task': {
      const title = actionConfig.task_title || 'Automated task';
      await pool.execute(
        'INSERT INTO persona_tasks (persona_id, owner_id, title, description, status, priority) VALUES (?, ?, ?, ?, ?, ?)',
        [personaId, ownerId, title, actionConfig.message || '', 'pending', 'medium']
      );
      break;
    }
    case 'message': {
      await pool.execute(
        'INSERT INTO follow_ups (user_id, session_id, type, question, status, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)',
        [ownerId, null, 'automation', actionConfig.message || '', 'pending', new Date()]
      );
      break;
    }
    case 'send_email': {
      if (isAvailable()) {
        await addJob(QUEUE_NAMES.EMAIL, {
          to: actionConfig.email_to,
          subject: actionConfig.email_subject || 'Notification',
          body: actionConfig.message || '',
        });
      }
      break;
    }
    default:
      console.log(`[ProactiveProcessor] Unknown action type: ${actionType}`);
  }

  return { processed: true, automationId };
}

function startProactiveWorkers() {
  const { createWorker, isAvailable } = require('../queue');
  if (!isAvailable()) {
    console.log('[ProactiveProcessor] Skipped — Redis unavailable');
    return;
  }
  createWorker(QUEUE_NAMES.PROACTIVE, processProactiveJob, { concurrency: 2 });
  createWorker(QUEUE_NAMES.AUTOMATION, processAutomationJob, { concurrency: 3 });
  console.log('[ProactiveProcessor] Workers started');
}

module.exports = {
  processProactiveJob,
  processAutomationJob,
  startProactiveWorkers,
};