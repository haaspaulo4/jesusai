const { pool } = require('../db');
const { getSetting } = require('../settings');

async function createBroadcast(data) {
  const id = `bc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await pool.execute(
    'INSERT INTO broadcasts (id, persona_id, title, message, segment, segment_config, status, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, data.persona_id, data.title, data.message, data.segment || 'all', JSON.stringify(data.segment_config || {}), data.status || 'draft', data.scheduled_at || null]
  );
  return { id, ...data, status: data.status || 'draft' };
}

async function getBroadcast(id) {
  const [rows] = await pool.execute('SELECT * FROM broadcasts WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

async function listBroadcasts(personaId, limit = 20) {
  const [rows] = await pool.execute(
    'SELECT * FROM broadcasts WHERE persona_id = ? ORDER BY created_at DESC LIMIT ' + parseInt(limit),
    [personaId]
  );
  return rows;
}

async function updateBroadcast(id, updates) {
  const allowed = ['title', 'message', 'segment', 'segment_config', 'status', 'scheduled_at'];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(key === 'segment_config' ? JSON.stringify(value) : value);
    }
  }
  if (fields.length === 0) return { error: 'No valid fields' };
  values.push(id);
  await pool.execute(`UPDATE broadcasts SET ${fields.join(', ')} WHERE id = ?`, values);
  return { id, updated: true };
}

async function deleteBroadcast(id) {
  await pool.execute('DELETE FROM broadcast_logs WHERE broadcast_id = ?', [id]);
  await pool.execute('DELETE FROM broadcasts WHERE id = ?', [id]);
  return { id, deleted: true };
}

async function getBroadcastTargets(personaId, segment, segmentConfig) {
  let query = 'SELECT DISTINCT uc.user_id, uc.phone FROM user_contacts uc JOIN persona_contacts pc ON uc.id = pc.owner_id WHERE pc.persona_id = ?';
  const params = [personaId];
  switch (segment) {
    case 'all': break;
    case 'new': query += ' AND uc.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'; break;
    case 'inactive_7d': query += ' AND uc.id NOT IN (SELECT DISTINCT user_id FROM persona_messages WHERE persona_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))'; params.push(personaId); break;
    case 'inactive_15d': query += ' AND uc.id NOT IN (SELECT DISTINCT user_id FROM persona_messages WHERE persona_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 15 DAY))'; params.push(personaId); break;
    case 'inactive_30d': query += ' AND uc.id NOT IN (SELECT DISTINCT user_id FROM persona_messages WHERE persona_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))'; params.push(personaId); break;
    case 'vip':
      query += ' AND uc.id IN (SELECT user_id FROM user_xp WHERE persona_id = ? AND xp >= 500)'; params.push(personaId); break;
    default: break;
  }
  if (segmentConfig && segmentConfig.tags) {
    query += ' AND JSON_OVERLAPS(pc.tags, ?)';
    params.push(JSON.stringify(segmentConfig.tags));
  }
  const [rows] = await pool.execute(query, params);
  const userRows = await pool.execute('SELECT id, name FROM users WHERE id IN (?)', [rows.map(r => r.user_id).filter(Boolean)]);
  const userMap = {};
  for (const u of userRows[0]) userMap[u.id] = u.name;
  return rows.map(r => ({ user_id: r.user_id, name: userMap[r.user_id] || r.user_id, phone: r.phone }));
}

async function sendBroadcast(id) {
  const broadcast = await getBroadcast(id);
  if (!broadcast) return { error: 'Broadcast não encontrado' };
  if (broadcast.status === 'sending' || broadcast.status === 'sent') return { error: 'Broadcast já enviado ou em envio' };
  
  await pool.execute('UPDATE broadcasts SET status = ? WHERE id = ?', ['sending', id]);
  
  const targets = await getBroadcastTargets(broadcast.persona_id, broadcast.segment, broadcast.segment_config ? JSON.parse(broadcast.segment_config) : {});
  
  if (targets.length === 0) {
    await pool.execute('UPDATE broadcasts SET status = ?, sent_count = 0, failed_count = 0 WHERE id = ?', ['sent', id]);
    return { id, status: 'sent', target_count: 0, sent: 0, failed: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;

  // Send messages with rate limiting (1 per second to avoid bans)
  for (const target of targets) {
    const logId = `bl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      // Try WhatsApp via Evolution API
      if (target.phone) {
        const baseUrl = process.env.EVOLUTION_API_URL || process.env.EVO_API_URL;
        const apiKey = process.env.EVOLUTION_API_KEY || process.env.EVO_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE || process.env.EVO_INSTANCE || 'default';

        if (baseUrl && apiKey) {
          const phone = target.phone.replace(/\D/g, '');
          const axios = require('axios');
          await axios.post(`${baseUrl}/message/sendText/${instance}`, {
            number: phone,
            text: broadcast.message,
          }, {
            headers: { apikey: apiKey },
            timeout: 10000,
          });
          sentCount++;
          await pool.execute(
            'INSERT INTO broadcast_logs (id, broadcast_id, user_id, phone, status, sent_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [logId, id, target.user_id, target.phone, 'sent']
          );
        } else {
          // No Evolution API configured — log as failed
          failedCount++;
          await pool.execute(
            'INSERT INTO broadcast_logs (id, broadcast_id, user_id, phone, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [logId, id, target.user_id, target.phone, 'failed', 'Evolution API not configured']
          );
        }
      } else {
        failedCount++;
        await pool.execute(
          'INSERT INTO broadcast_logs (id, broadcast_id, user_id, phone, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [logId, id, target.user_id, target.phone || null, 'failed', 'No phone number']
        );
      }

      // Rate limit: 1 message per second
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      failedCount++;
      await pool.execute(
        'INSERT INTO broadcast_logs (id, broadcast_id, user_id, phone, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
        [logId, id, target.user_id, target.phone || null, 'failed', (err.message || 'Unknown error').substring(0, 255)]
      );
    }
  }

  await pool.execute(
    'UPDATE broadcasts SET status = ?, sent_count = ?, failed_count = ? WHERE id = ?',
    ['sent', sentCount, failedCount, id]
  );

  return { id, status: 'sent', target_count: targets.length, sent: sentCount, failed: failedCount };
}

async function getBroadcastStats(personaId) {
  const [counts] = await pool.execute('SELECT status, COUNT(*) as count FROM broadcasts WHERE persona_id = ? GROUP BY status', [personaId]);
  const stats = {};
  for (const c of counts) stats[c.status] = c.count;
  return stats;
}

async function getBroadcastLogs(broadcastId, limit = 50) {
  const [rows] = await pool.execute('SELECT * FROM broadcast_logs WHERE broadcast_id = ? ORDER BY sent_at DESC LIMIT ' + parseInt(limit), [broadcastId]);
  return rows;
}

module.exports = {
  createBroadcast, getBroadcast, listBroadcasts, updateBroadcast,
  deleteBroadcast, getBroadcastTargets, sendBroadcast,
  getBroadcastStats, getBroadcastLogs,
};