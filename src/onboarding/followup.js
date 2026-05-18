const { pool } = require('../db');
const { getSetting } = require('../settings');
const personaManager = require('../persona/manager');
const { getProfile } = require('../memory/profile');
const gamificationModule = require('../gamification');

const PERSONA_FOLLOWUP_TEMPLATES = {
  'jesus': {
    spiritual_check: [
      'Como você está se sentindo espiritualmente hoje?',
      'Posso orar por você de alguma forma específica?',
      'Há algo que gostaria de explorar mais profundamente?',
      'O que mais tem pesado no seu coração?',
      'Gostaria de um versículo para hoje?',
    ],
    re_engage: [
      'Senti sua falta! Como estão as coisas?',
      'Voltei a pensar em você. Tudo bem?',
      'Há quanto tempo não conversamos! Como você está?',
    ],
    milestone: [
      'Que alegria te ver de novo! Vamos continuar nossa conversa?',
      'Parabés pela sua jornada! cada passo conta.',
    ],
  },
  'bp_coach_vendas': {
    spiritual_check: [
      'Como estão as vendas essa semana? Algum destaque?',
      'Qual o maior obstáculo que você está enfrentando agora?',
      'Quer dica de prospecção hoje?',
      'Vamos revisar seu funil? Onde estão os bloqueios?',
    ],
    re_engage: [
      'Tempo sem nos falar! Como estão os números?',
      'Sua meta mensal está no caminho? Vamos consultar?',
      'Algum negócio fechou recentemente? Parabéns!',
    ],
    milestone: [
      'Nível conquistado! Vendedor de outro nível.',
      'Consistência é tudo. Continue firme!',
    ],
  },
  'bp_nutricionista': {
    spiritual_check: [
      'Como está sua alimentação essa semana?',
      'Conseguiu manter a rotina de refeições?',
      'Alguma dificuldade com a dieta que posso ajudar?',
      'Quer uma dica de lanche saudável para hoje?',
    ],
    re_engage: [
      'Tempo sem te ver! Como está a jornada de saúde?',
      'Sua meta de bem-estar está no caminho certo?',
      'Começou alguma atividade física nova?',
    ],
    milestone: [
      'Que massa! Mais um nível conquistado na sua jornada!',
    ],
  },
};

const DEFAULT_FOLLOWUP_TEMPLATES = {
  spiritual_check: [
    'Como você está se sentindo hoje?',
    'Posso ajudar com algo específico?',
    'Há algo que gostaria de explorar mais?',
    'O que está em sua mente hoje?',
  ],
  re_engage: [
    'Tempo sem nos falar! Como você está?',
    'Senti sua falta! Tudo bem?',
    'Voltei a pensar em você. Como as coisas estão?',
  ],
  milestone: [
    'Parabéns pela sua consistência!',
  ],
};

function getPersonaTemplates(personaId) {
  if (personaId && PERSONA_FOLLOWUP_TEMPLATES[personaId]) {
    return PERSONA_FOLLOWUP_TEMPLATES[personaId];
  }
  return DEFAULT_FOLLOWUP_TEMPLATES;
}

function buildSmartQuestion(templates, type, profile, personaId) {
  const questions = templates[type] || templates.spiritual_check || DEFAULT_FOLLOWUP_TEMPLATES.spiritual_check;

  if (profile && profile.name) {
    const nameQs = questions.filter(q => !q.includes('{name}'));
    const selected = nameQs[Math.floor(Math.random() * nameQs.length)];
    return selected;
  }

  return questions[Math.floor(Math.random() * questions.length)];
}

async function shouldCreateFollowUp(userId, personaId, sessionId) {
  const followUpEnabled = await getSetting('followup_enabled', 'true');
  if (followUpEnabled !== 'true') return null;

  const [recent] = await pool.execute(
    "SELECT id FROM follow_ups WHERE user_id = ? AND status IN ('pending', 'sent') AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1",
    [userId]
  );
  if (recent.length > 0) return null;

  const followUpInterval = parseInt(await getSetting('followup_interval_messages', '10')) || 10;
  const [msgRows] = await pool.execute(
    'SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ? AND m.role = ? AND m.timestamp > DATE_SUB(NOW(), INTERVAL 7 DAY)',
    [userId, 'user']
  );

  if (msgRows[0].total % followUpInterval !== 0 && msgRows[0].total > 0) return null;

  return await createSmartFollowUp(userId, personaId, sessionId, 'interval');
}

async function createSmartFollowUp(userId, personaId, sessionId, triggerType) {
  const profile = await getProfile(userId).catch(() => null);
  const templates = getPersonaTemplates(personaId);
  const xpData = await gamificationModule.getXp(userId, personaId || 'jesus').catch(() => null);

  let type = 'spiritual_check';
  let question;

  const isReturning = xpData && xpData.streak > 1;
  const isMilestone = xpData && (xpData.level >= 3 || xpData.xp >= 200);

  if (triggerType === 'streak_risk') {
    type = 're_engage';
  } else if (triggerType === 'milestone' && isMilestone) {
    type = 'milestone';
  } else if (isReturning) {
    type = 're_engage';
  }

  question = buildSmartQuestion(templates, type, profile, personaId);

  if (profile && profile.name && question) {
    question = question.replace('{name}', profile.name);
  }

  await pool.execute(
    'INSERT INTO follow_ups (user_id, session_id, type, question, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, sessionId || null, type, question, null, 'pending']
  );

  return question;
}

async function checkStreakFollowUp(userId, personaId) {
  try {
    const xpData = await gamificationModule.getXp(userId, personaId || 'jesus');
    if (!xpData) return null;

    const lastActivity = xpData.last_activity;
    if (!lastActivity) return null;

    const lastDate = new Date(lastActivity);
    const now = new Date();
    const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays >= 2 && xpData.streak > 0) {
      return await createSmartFollowUp(userId, personaId, null, 'streak_risk');
    }
  } catch {}

  return null;
}

async function getContextualWelcome(userId, personaId, lang) {
  const l = lang.startsWith('en') ? 'en' : (lang.startsWith('es') ? 'es' : 'pt');
  const profile = await getProfile(userId).catch(() => null);
  const persona = personaId ? await personaManager.getPersona(personaId).catch(() => null) : null;
  const xpData = await gamificationModule.getXp(userId, personaId || 'jesus').catch(() => null);

  const personaName = persona ? persona.name : 'MetaPersona.AI';

  const templates = {
    pt: {
      firstTime: 'Olá! Sou o **{name}**. Estou aqui para te ajudar. Como posso te atender hoje?',
      returning: 'Olá de novo{greeting}! Que bom te ver de volta{streak}. No que posso ajudar hoje?',
      milestone: 'Incrível{greeting}! Você atingiu o **nível {level}**{streak}. Continue assim! No que posso ajudar?',
      streakRisk: 'Sentimos sua falta{greeting}! Sua sequência de **{streak} dias** ainda está salva. Vamos continuar?',
    },
    en: {
      firstTime: 'Hi! I\'m **{name}**. I\'m here to help. How can I assist you today?',
      returning: 'Welcome back{greeting}! Great to see you again{streak}. How can I help today?',
      milestone: 'Amazing{greeting}! You\'ve reached **level {level}**{streak}. Keep it up! How can I help?',
      streakRisk: 'We missed you{greeting}! Your **{streak}-day streak** is still alive. Shall we continue?',
    },
    es: {
      firstTime: '¡Hola! Soy **{name}**. Estoy aquí para ayudarte. ¿Cómo puedo atenderte hoy?',
      returning: '¡Hola de nuevo{greeting}! Qué bueno verte{streak}. ¿En qué puedo ayudarte?',
      milestone: '¡Increíble{greeting}! Alcanzaste el **nivel {level}**{streak}. ¡Sigue así! ¿En qué puedo ayudarte?',
      streakRisk: '¡Te extrañamos{greeting}! Tu racha de **{streak} días** sigue viva. ¿Continuamos?',
    },
  };

  const t = templates[l] || templates.pt;

  const greeting = profile?.name ? `, ${profile.name}` : '';
  const streakMsg = xpData?.streak > 1 ? ` (${xpData.streak} dias)` : '';

  if (!xpData || !xpData.last_activity || xpData.xp < 10) {
    return t.firstTime.replace('{name}', personaName);
  }

  const lastDate = new Date(xpData.last_activity);
  const daysSince = Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));

  if (daysSince >= 2 && xpData.streak > 0) {
    return t.streakRisk
      .replace('{greeting}', greeting)
      .replace('{streak}', xpData.streak)
      .replace('{name}', personaName);
  }

  if (xpData.level >= 3) {
    return t.milestone
      .replace('{greeting}', greeting)
      .replace('{level}', xpData.level)
      .replace('{streak}', streakMsg)
      .replace('{name}', personaName);
  }

  return t.returning
    .replace('{greeting}', greeting)
    .replace('{streak}', streakMsg)
    .replace('{name}', personaName);
}

function getQuickActions(personaId, profile) {
  const base = [
    { id: 'ask_question', icon: '💬', 'pt-BR': 'Fazer uma pergunta', 'en-US': 'Ask a question', 'es-ES': 'Hacer una pregunta' },
    { id: 'share_feeling', icon: '💚', 'pt-BR': 'Como estou me sentindo', 'en-US': 'How I\'m feeling', 'es-ES': 'Cómo me siento' },
  ];

  const personaActions = {
    'jesus': [
      { id: 'daily_verse', icon: '📖', 'pt-BR': 'Versículo do dia', 'en-US': 'Verse of the day', 'es-ES': 'Versículo del día' },
      { id: 'prayer', icon: '🙏', 'pt-BR': 'Pedir uma oração', 'en-US': 'Request a prayer', 'es-ES': 'Pedir una oración' },
      { id: 'devotional', icon: '🕊', 'pt-BR': 'Devocional', 'en-US': 'Devotional', 'es-ES': 'Devocional' },
    ],
    'bp_coach_vendas': [
      { id: 'funnel_review', icon: '📊', 'pt-BR': 'Revisar funil', 'en-US': 'Review funnel', 'es-ES': 'Revisar funnel' },
      { id: 'objection_help', icon: '🎯', 'pt-BR': 'Técnicas de negociação', 'en-US': 'Negotiation tips', 'es-ES': 'Técnicas de negociación' },
      { id: 'prospecting', icon: '🔍', 'pt-BR': 'Dicas de prospecção', 'en-US': 'Prospecting tips', 'es-ES': 'Tips de prospección' },
    ],
    'bp_nutricionista': [
      { id: 'meal_plan', icon: '🥗', 'pt-BR': 'Plano alimentar', 'en-US': 'Meal plan', 'es-ES': 'Plan alimentario' },
      { id: 'recipe', icon: '🍽', 'pt-BR': 'Receita saudável', 'en-US': 'Healthy recipe', 'es-ES': 'Receta saludable' },
      { id: 'check_weight', icon: '⚖️', 'pt-BR': 'Acompanhar progresso', 'en-US': 'Track progress', 'es-ES': 'Seguir progreso' },
    ],
  };

  const actions = personaActions[personaId] || [
    { id: 'explore', icon: '🔍', 'pt-BR': 'Explorar conteúdo', 'en-US': 'Explore content', 'es-ES': 'Explorar contenido' },
    { id: 'get_help', icon: '💡', 'pt-BR': 'Pedir ajuda', 'en-US': 'Get help', 'es-ES': 'Pedir ayuda' },
  ];

  if (profile && profile.topics && profile.topics.length > 0) {
    const topicMap = {
      'vendas': { id: 'sales_tips', icon: '📈', 'pt-BR': 'Dicas de vendas', 'en-US': 'Sales tips', 'es-ES': 'Tips de ventas' },
      'saúde': { id: 'health_tips', icon: '💪', 'pt-BR': 'Dicas de saúde', 'en-US': 'Health tips', 'es-ES': 'Tips de salud' },
      'negócios': { id: 'business_tips', icon: '💼', 'pt-BR': 'Dicas de negócios', 'en-US': 'Business tips', 'es-ES': 'Tips de negocios' },
      'liderança': { id: 'leadership', icon: '👑', 'pt-BR': 'Liderança', 'en-US': 'Leadership', 'es-ES': 'Liderazgo' },
      'educação': { id: 'education', icon: '📚', 'pt-BR': 'Aprender mais', 'en-US': 'Learn more', 'es-ES': 'Aprender más' },
      'fé': { id: 'faith', icon: '✝️', 'pt-BR': 'Versículo', 'en-US': 'Verse', 'es-ES': 'Versículo' },
      'paz': { id: 'peace', icon: '🕊', 'pt-BR': 'Meditação', 'en-US': 'Meditation', 'es-ES': 'Meditación' },
      'família': { id: 'family', icon: '👨‍👩‍👧‍👦', 'pt-BR': 'Conselhos familiares', 'en-US': 'Family advice', 'es-ES': 'Consejos familiares' },
    };

    for (const topic of profile.topics.slice(0, 2)) {
      const action = topicMap[topic];
      if (action && !actions.find(a => a.id === action.id)) {
        actions.push(action);
      }
    }
  }

  return [...base, ...actions].slice(0, 6);
}

module.exports = {
  shouldCreateFollowUp,
  createSmartFollowUp,
  checkStreakFollowUp,
  getContextualWelcome,
  getQuickActions,
  getPersonaFollowUpTemplates: getPersonaTemplates,
  PERSONA_FOLLOWUP_TEMPLATES,
  DEFAULT_FOLLOWUP_TEMPLATES,
};