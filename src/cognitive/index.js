const { pool } = require('../db');

async function saveCognitiveState(data) {
  const { user_id, persona_id, session_id, message_id, emotion, emotion_confidence, intent, intent_confidence, topics, churn_risk, conversion_probability, engagement_score, suggested_action, context_snapshot } = data;
  const id = 'cog_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  await pool.execute(
    `INSERT INTO cognitive_states (id, user_id, persona_id, session_id, message_id, emotion, emotion_confidence,
     intent, intent_confidence, topics, churn_risk, conversion_probability, engagement_score, suggested_action, context_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE emotion=VALUES(emotion), emotion_confidence=VALUES(emotion_confidence),
     intent=VALUES(intent), intent_confidence=VALUES(intent_confidence), topics=VALUES(topics),
     churn_risk=VALUES(churn_risk), conversion_probability=VALUES(conversion_probability),
     engagement_score=VALUES(engagement_score), suggested_action=VALUES(suggested_action), context_snapshot=VALUES(context_snapshot)`,
    [id, user_id, persona_id || null, session_id || null, message_id || null,
     emotion || 'neutral', emotion_confidence || 0.5,
     intent || 'general', intent_confidence || 0.5,
     JSON.stringify(topics || []), churn_risk || 0, conversion_probability || 0,
     engagement_score || 0.5, suggested_action || null,
     JSON.stringify(context_snapshot || {})]
  );
  return getCognitiveState(id);
}

async function getCognitiveState(id) {
  const [rows] = await pool.execute('SELECT * FROM cognitive_states WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatCognitiveState(rows[0]);
}

async function getLatestCognitiveState(userId, personaId) {
  const [rows] = await pool.execute(
    'SELECT * FROM cognitive_states WHERE user_id = ? AND persona_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId, personaId]
  );
  if (rows.length === 0) return null;
  return formatCognitiveState(rows[0]);
}

async function getCognitiveHistory(userId, personaId, limit = 20) {
  let sql = 'SELECT * FROM cognitive_states WHERE user_id = ?';
  const values = [userId];
  if (personaId) { sql += ' AND persona_id = ?'; values.push(personaId); }
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ` LIMIT ${Number(limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatCognitiveState);
}

async function getCognitiveStats(personaId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  let sql = `SELECT
    emotion, COUNT(*) as count, AVG(emotion_confidence) as avg_confidence,
    AVG(churn_risk) as avg_churn, AVG(conversion_probability) as avg_conversion,
    AVG(engagement_score) as avg_engagement
    FROM cognitive_states WHERE created_at >= ?`;
  const values = [since];
  if (personaId) { sql += ' AND persona_id = ?'; values.push(personaId); }
  sql += ' GROUP BY emotion ORDER BY count DESC';
  const [rows] = await pool.execute(sql, values);

  let intentSql = `SELECT
    intent, COUNT(*) as count, AVG(intent_confidence) as avg_confidence
    FROM cognitive_states WHERE created_at >= ?`;
  const intentValues = [since];
  if (personaId) { intentSql += ' AND persona_id = ?'; intentValues.push(personaId); }
  intentSql += ' GROUP BY intent ORDER BY count DESC LIMIT 10';
  const [intentRows] = await pool.execute(intentSql, intentValues);

  let overallSql = `SELECT
    COUNT(*) as total_states,
    AVG(churn_risk) as avg_churn_risk,
    AVG(conversion_probability) as avg_conversion_probability,
    AVG(engagement_score) as avg_engagement,
    COUNT(CASE WHEN suggested_action IS NOT NULL THEN 1 END) as actions_suggested
    FROM cognitive_states WHERE created_at >= ?`;
  const overallValues = [since];
  if (personaId) { overallSql += ' AND persona_id = ?'; overallValues.push(personaId); }
  const [overallRows] = await pool.execute(overallSql, overallValues);

  return {
    emotions: rows.map(r => ({ emotion: r.emotion, count: r.count, avgConfidence: Math.round((r.avg_confidence || 0) * 100) / 100, avgChurn: Math.round((r.avg_churn || 0) * 100) / 100, avgConversion: Math.round((r.avg_conversion || 0) * 100) / 100, avgEngagement: Math.round((r.avg_engagement || 0) * 100) / 100 })),
    intents: intentRows.map(r => ({ intent: r.intent, count: r.count, avgConfidence: Math.round((r.avg_confidence || 0) * 100) / 100 })),
    overall: overallRows[0] ? { totalStates: overallRows[0].total_states, avgChurnRisk: Math.round((overallRows[0].avg_churn_risk || 0) * 100) / 100, avgConversionProbability: Math.round((overallRows[0].avg_conversion_probability || 0) * 100) / 100, avgEngagement: Math.round((overallRows[0].avg_engagement || 0) * 100) / 100, actionsSuggested: overallRows[0].actions_suggested } : null,
    period_days: days,
  };
}

async function analyzeCognitiveState(userId, personaId, message, sessionId) {
  const integrations = require('../llm/integrationManager');
  const { getSetting } = require('../settings');

  const latest = await getLatestCognitiveState(userId, personaId);
  const history = await getCognitiveHistory(userId, personaId, 5);

  const emotionKeywords = {
    happy: ['obrigado', 'legal', 'adorei', 'ótimo', 'excelente', 'maravilhoso', 'amei', 'fantástico', 'great', 'awesome', 'love', 'thanks', 'happy', 'bom', 'certo', 'perfeito'],
    frustrated: ['não funciona', 'erro', 'problema', 'ruim', 'péssimo', 'não consigo', 'difícil', 'frustrado', 'chato', 'doesn\'t work', 'error', 'bad', 'terrible', 'hate'],
    confused: ['não entendo', 'como', 'o que', 'qual', 'duvida', 'explica', 'confuso', 'explain', 'how', 'what', 'confused', 'help'],
    excited: ['quero', 'vamos', 'incrível', 'demais', 'wow', 'vamos lá', 'quanto antes', 'can\'t wait', 'excited', 'amazing'],
    sad: ['triste', 'infeliz', 'sozinho', 'desanimado', 'cansado', 'desistir', 'sad', 'lonely', 'tired', 'give up'],
    angry: ['raiva', 'ódio', 'reclamar', 'horrível', 'pior', 'never again', 'angry', 'furious', 'worst'],
    anxious: ['preocupado', 'ansioso', 'medo', 'receio', 'nervoso', 'worried', 'anxious', 'fear', 'nervous'],
    curious: ['como funciona', 'interessante', 'conte mais', 'explique', 'quero saber', 'tell me more', 'how does', 'interesting'],
    neutral: [],
  };

  const intentKeywords = {
    purchase: ['comprar', 'preço', 'valor', 'plano', 'assinar', 'pagamento', 'buy', 'price', 'plan', 'subscribe', 'payment', 'contratar', 'quero contratar'],
    support: ['ajuda', 'problema', 'erro', 'bug', 'não funciona', 'help', 'problem', 'error', 'bug', 'issue', 'suporte'],
    information: ['como', 'o que', 'quando', 'onde', 'qual', 'explique', 'how', 'what', 'when', 'where', 'explain', 'informação'],
    complaint: ['reclamar', 'insatisfeito', 'ruim', 'horrível', 'complaint', 'terrible', 'worst', 'insatisfeito'],
    chitchat: ['oi', 'olá', 'tudo bem', 'hey', 'hello', 'hi', 'bom dia', 'boa tarde', 'boa noite'],
    scheduling: ['agendar', 'marcar', 'horário', 'consulta', 'schedule', 'book', 'appointment', 'meeting'],
    feedback: ['feedback', 'avaliação', 'sugestão', 'opnião', 'rating', 'review', 'suggest'],
    cancellation: ['cancelar', 'desistir', 'não quero mais', 'cancel', 'stop', 'leave', 'sair'],
  };

  let emotion = 'neutral';
  let emotionConfidence = 0.3;
  let intent = 'general';
  let intentConfidence = 0.3;
  let topics = [];
  const lowerMsg = (message || '').toLowerCase();

  for (const [emo, keywords] of Object.entries(emotionKeywords)) {
    const matches = keywords.filter(kw => lowerMsg.includes(kw));
    if (matches.length > 0) {
      emotion = emo;
      emotionConfidence = Math.min(0.9, 0.4 + matches.length * 0.15);
      break;
    }
  }

  for (const [inte, keywords] of Object.entries(intentKeywords)) {
    const matches = keywords.filter(kw => lowerMsg.includes(kw));
    if (matches.length > 0) {
      intent = inte;
      intentConfidence = Math.min(0.95, 0.5 + matches.length * 0.15);
      break;
    }
  }

  const words = lowerMsg.split(/\s+/).filter(w => w.length > 3);
  topics = [...new Set(words.slice(0, 5))];

  let churnRisk = 0.1;
  let conversionProbability = 0.1;
  let engagementScore = 0.5;

  if (emotion === 'sad' || emotion === 'angry' || emotion === 'frustrated') churnRisk = 0.7;
  else if (emotion === 'anxious') churnRisk = 0.4;
  else if (emotion === 'happy' || emotion === 'excited' || emotion === 'curious') churnRisk = 0.05;

  if (intent === 'purchase' || intent === 'scheduling') conversionProbability = 0.7;
  else if (intent === 'information') conversionProbability = 0.3;
  else if (intent === 'cancellation') conversionProbability = 0.02;

  if (emotion === 'excited' || emotion === 'curious') engagementScore = 0.9;
  else if (emotion === 'happy') engagementScore = 0.7;
  else if (emotion === 'confused') engagementScore = 0.5;
  else if (emotion === 'sad' || emotion === 'angry') engagementScore = 0.2;

  if (latest) {
    churnRisk = Math.round((churnRisk * 0.6 + (latest.churn_risk || 0) * 0.4) * 100) / 100;
    conversionProbability = Math.round((conversionProbability * 0.6 + (latest.conversion_probability || 0) * 0.4) * 100) / 100;
    engagementScore = Math.round((engagementScore * 0.6 + (latest.engagement_score || 0.5) * 0.4) * 100) / 100;
  }

  let suggestedAction = null;
  if (churnRisk > 0.6) suggestedAction = 'retain_user';
  else if (intent === 'purchase') suggestedAction = 'convert_lead';
  else if (intent === 'support' && emotion === 'frustrated') suggestedAction = 'escalate_support';
  else if (intent === 'cancellation') suggestedAction = 'prevent_churn';
  else if (intent === 'scheduling') suggestedAction = 'schedule_appointment';
  else if (engagementScore < 0.3) suggestedAction = 're_engage';

  const state = await saveCognitiveState({
    user_id: userId,
    persona_id: personaId,
    session_id: sessionId,
    emotion,
    emotion_confidence: emotionConfidence,
    intent,
    intent_confidence: intentConfidence,
    topics,
    churn_risk: churnRisk,
    conversion_probability: conversionProbability,
    engagement_score: engagementScore,
    suggested_action: suggestedAction,
    context_snapshot: {
      messageLength: (message || '').length,
      previousEmotion: latest?.emotion || null,
      historyLength: history.length,
    },
  });

  if (churnRisk > 0.6) {
    try {
      const events = require('../events');
      await events.emit('on_churn_risk_high', {
        userId, personaId, sessionId,
        churnRisk, emotion, intent, suggestedAction,
      });
    } catch {}
  }

  if (latest && latest.emotion !== emotion) {
    try {
      const events = require('../events');
      await events.emit('on_cognitive_change', {
        userId, personaId, sessionId,
        previousEmotion: latest.emotion, newEmotion: emotion,
        previousIntent: latest.intent, newIntent: intent,
        churnRisk, engagementScore,
      });
    } catch {}
  }

  return state;
}

function formatCognitiveContext(state) {
  if (!state) return '';
  const lines = [
    `COGNITIVE STATE: emotion=${state.emotion} (${Math.round((state.emotion_confidence || 0) * 100)}%), intent=${state.intent} (${Math.round((state.intent_confidence || 0) * 100)}%)`,
  ];
  if (state.churn_risk > 0.3) lines.push(`CHURN RISK: ${Math.round(state.churn_risk * 100)}% — consider retention strategy`);
  if (state.conversion_probability > 0.5) lines.push(`CONVERSION PROBABILITY: ${Math.round(state.conversion_probability * 100)}% — high intent detected`);
  if (state.engagement_score < 0.3) lines.push(`ENGAGEMENT: low (${Math.round(state.engagement_score * 100)}%) — consider re-engagement`);
  if (state.suggested_action) lines.push(`SUGGESTED ACTION: ${state.suggested_action}`);
  return lines.join('\n');
}

function formatCognitiveState(row) {
  let topics = row.topics;
  let context_snapshot = row.context_snapshot;
  if (typeof topics === 'string') { try { topics = JSON.parse(topics); } catch { topics = []; } }
  if (typeof context_snapshot === 'string') { try { context_snapshot = JSON.parse(context_snapshot); } catch { context_snapshot = {}; } }
  return {
    id: row.id,
    user_id: row.user_id,
    persona_id: row.persona_id,
    session_id: row.session_id,
    message_id: row.message_id,
    emotion: row.emotion,
    emotion_confidence: row.emotion_confidence,
    intent: row.intent,
    intent_confidence: row.intent_confidence,
    topics: topics || [],
    churn_risk: row.churn_risk,
    conversion_probability: row.conversion_probability,
    engagement_score: row.engagement_score,
    suggested_action: row.suggested_action,
    context_snapshot: context_snapshot || {},
    created_at: row.created_at,
  };
}

module.exports = {
  saveCognitiveState, getCognitiveState, getLatestCognitiveState,
  getCognitiveHistory, getCognitiveStats, analyzeCognitiveState,
  formatCognitiveContext,
};