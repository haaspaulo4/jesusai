const { pool } = require('../db');
const { getSetting } = require('../settings');
const { getProfile, saveProfile } = require('../memory/profile');
const { createUser } = require('../auth');
const gamificationModule = require('../gamification');

const STEP_TYPES = {
  text: { input: 'text', placeholder: '' },
  email: { input: 'email', placeholder: 'seu@email.com' },
  phone: { input: 'phone', placeholder: '+55 11 99999-9999' },
  number: { input: 'number', placeholder: '0' },
  choice: { input: 'choice', chips: true },
  multichoice: { input: 'multichoice', chips: true, max: 3 },
  confirm: { input: 'confirm', yesNo: true },
  message: { input: 'none', infoOnly: true },
};

const GLOBAL_ONBOARDING_STEPS = [
  {
    step_key: 'name',
    step_order: 0,
    question: 'Como posso te chamar?',
    question_en: 'What should I call you?',
    question_es: '¿Cómo puedo llamarte?',
    field: 'name',
    field_type: 'text',
    required: true,
    persona_id: null,
    icon: '🙂',
    placeholder: { 'pt-BR': 'Seu nome...', 'en-US': 'Your name...', 'es-ES': 'Tu nombre...' },
  },
  {
    step_key: 'interest',
    step_order: 1,
    question: 'O que mais te interessa?',
    question_en: 'What interests you most?',
    question_es: '¿Qué te interesa más?',
    field: 'topics',
    field_type: 'multichoice',
    choices: ['autoconhecimento', 'relacionamentos', 'carreira', 'saúde', 'finanças', 'aprendizado', 'motivação', 'criatividade', 'equilíbrio', 'liderança', 'bem-estar', 'outro'],
    choices_en: ['self-improvement', 'relationships', 'career', 'health', 'finances', 'learning', 'motivation', 'creativity', 'balance', 'leadership', 'wellness', 'other'],
    choices_es: ['autoconocimiento', 'relaciones', 'carrera', 'salud', 'finanzas', 'aprendizaje', 'motivación', 'creatividad', 'equilibrio', 'liderazgo', 'bienestar', 'otro'],
    required: true,
    persona_id: null,
    icon: '🎯',
    max_choices: 3,
  },
  {
    step_key: 'feeling',
    step_order: 2,
    question: 'Como você está se sentindo hoje?',
    question_en: 'How are you feeling today?',
    question_es: '¿Cómo te sientes hoy?',
    field: 'emotions',
    field_type: 'choice',
    choices: ['😊 Feliz', '🙏 Grato', '💭 Reflexivo', '😰 Ansioso', '😢 Triste', '🔥 Motivado', '❓ Com dúvidas'],
    choices_en: ['😊 Happy', '🙏 Grateful', '💭 Thoughtful', '😰 Anxious', '😢 Sad', '🔥 Motivated', '❓ Unsure'],
    choices_es: ['😊 Feliz', '🙏 Agradecido', '💭 Reflexivo', '😰 Ansioso', '😢 Triste', '🔥 Motivado', '❓ Inseguro'],
    required: false,
    persona_id: null,
    icon: '💚',
    skip_label: { 'pt-BR': 'Prefiro não dizer', 'en-US': 'Prefer not to say', 'es-ES': 'Prefiero no decir' },
  },
  {
    step_key: 'email',
    step_order: 3,
    question: 'Quer receber conteúdos exclusivos? Deixe seu email (opcional):',
    question_en: 'Want exclusive content? Leave your email (optional):',
    question_es: '¿Quieres contenido exclusivo? Deja tu email (opcional):',
    field: 'email',
    field_type: 'email',
    required: false,
    persona_id: null,
    icon: '✉️',
    skip_label: { 'pt-BR': 'Agora não', 'en-US': 'Not now', 'es-ES': 'Ahora no' },
  },
];

const PERSONA_STEP_CONFIGS = {
  'bp_coach_vendas': {
    steps: [
      {
        step_key: 'welcome',
        step_order: 0,
        question: 'Vamos configurar sua experiência de vendas! Rápido e prático.',
        question_en: 'Let\'s set up your sales experience! Quick and easy.',
        question_es: '¡Vamos configurar tu experiencia de ventas! Rápido y práctico.',
        field: null, field_type: 'message', required: false, icon: '🚀',
      },
      {
        step_key: 'name',
        step_order: 1,
        question: 'Qual seu nome?',
        question_en: 'What\'s your name?',
        question_es: '¿Cuál es tu nombre?',
        field: 'name', field_type: 'text', required: true, icon: '🙂',
        placeholder: { 'pt-BR': 'Seu nome...', 'en-US': 'Your name...', 'es-ES': 'Tu nombre...' },
      },
      {
        step_key: 'role',
        step_order: 2,
        question: 'Qual seu cargo?',
        question_en: 'What\'s your role?',
        question_es: '¿Cuál es tu cargo?',
        field: 'role', field_type: 'choice', required: true, icon: '💼',
        choices: ['Vendedor(a)', 'SDR', 'Executivo(a) de Contas', 'Gerente de Vendas', 'Diretor(a) Comercial', 'CEO / Fundador(a)', 'Consultor(a)', 'Outro'],
        choices_en: ['Sales Rep', 'SDR', 'Account Executive', 'Sales Manager', 'VP Sales', 'CEO / Founder', 'Consultant', 'Other'],
        choices_es: ['Vendedor', 'SDR', 'Ejecutivo de Cuentas', 'Gerente de Ventas', 'Director Comercial', 'CEO / Fundador', 'Consultor', 'Otro'],
      },
      {
        step_key: 'challenge',
        step_order: 3,
        question: 'Qual seu maior desafio hoje?',
        question_en: 'What\'s your biggest challenge today?',
        question_es: '¿Cuál es tu mayor desafío hoy?',
        field: 'topics', field_type: 'multichoice', required: true, icon: '🎯', max_choices: 2,
        choices: ['Prospecção', 'Negociação', 'Fechamento', 'Recorrência', 'Liderança de equipe', 'Funil/Métricas', 'Posicionamento', 'Outro'],
        choices_en: ['Prospecting', 'Negotiation', 'Closing', 'Retention', 'Team Leadership', 'Pipeline/Metrics', 'Positioning', 'Other'],
        choices_es: ['Prospección', 'Negociación', 'Cierre', 'Retención', 'Liderazgo de equipo', 'Pipeline/Métricas', 'Posicionamiento', 'Otro'],
      },
      {
        step_key: 'team_size',
        step_order: 4,
        question: 'Quantas pessoas na sua equipe?',
        question_en: 'How many people on your team?',
        question_es: '¿Cuántas personas en tu equipo?',
        field: 'team_size', field_type: 'choice', required: false, icon: '👥',
        choices: ['Sou solo', '2-5 pessoas', '6-15 pessoas', '16-50 pessoas', '50+ pessoas'],
        choices_en: ['Solo', '2-5 people', '6-15 people', '16-50 people', '50+ people'],
        choices_es: ['Solo', '2-5 personas', '6-15 personas', '16-50 personas', '50+ personas'],
        skip_label: { 'pt-BR': 'Sem equipe', 'en-US': 'No team', 'es-ES': 'Sin equipo' },
      },
      {
        step_key: 'revenue_goal',
        step_order: 5,
        question: 'Qual sua meta de faturamento mensal?',
        question_en: 'What\'s your monthly revenue target?',
        question_es: '¿Cuál es tu meta de facturación mensual?',
        field: 'revenue_goal', field_type: 'choice', required: false, icon: '💰',
        choices: ['Até R$10k', 'R$10k-50k', 'R$50k-200k', 'R$200k-500k', 'R$500k+'],
        choices_en: ['Up to $10k', '$10k-50k', '$50k-200k', '$200k-500k', '$500k+'],
        choices_es: ['Hasta $10k', '$10k-50k', '$50k-200k', '$200k-500k', '$500k+'],
        skip_label: { 'pt-BR': 'Prefiro não dizer', 'en-US': 'Prefer not to say', 'es-ES': 'Prefiero no decir' },
      },
      {
        step_key: 'email',
        step_order: 6,
        question: 'Receba dicas exclusivas de vendas no seu email:',
        question_en: 'Get exclusive sales tips in your email:',
        question_es: 'Recibe tips exclusivas de ventas en tu email:',
        field: 'email', field_type: 'email', required: false, icon: '✉️',
        skip_label: { 'pt-BR': 'Agora não', 'en-US': 'Not now', 'es-ES': 'Ahora no' },
      },
    ],
  },
  'bp_nutricionista': {
    steps: [
      {
        step_key: 'welcome', step_order: 0,
        question: 'Vamos personalizar sua jornada de saúde! Respondinha rápida.',
        question_en: 'Let\'s personalize your health journey! Quick questions.',
        question_es: '¡Vamos personalizar tu viaje de salud! Preguntas rápidas.',
        field: null, field_type: 'message', required: false, icon: '🥗',
      },
      {
        step_key: 'name', step_order: 1,
        question: 'Qual seu nome?', question_en: 'What\'s your name?', question_es: '¿Tu nombre?',
        field: 'name', field_type: 'text', required: true, icon: '🙂',
        placeholder: { 'pt-BR': 'Seu nome...', 'en-US': 'Your name...', 'es-ES': 'Tu nombre...' },
      },
      {
        step_key: 'health_goal', step_order: 2,
        question: 'Qual seu principal objetivo?',
        question_en: 'What\'s your main goal?',
        question_es: '¿Tu principal objetivo?',
        field: 'topics', field_type: 'choice', required: true, icon: '🎯',
        choices: ['Perda de peso', 'Ganho muscular', 'Qualidade de vida', 'Dieta especial', 'Rendimento esportivo', 'Reeducação alimentar', 'Outro'],
        choices_en: ['Weight loss', 'Muscle gain', 'Quality of life', 'Special diet', 'Athletic performance', 'Food re-education', 'Other'],
        choices_es: ['Pérdida de peso', 'Ganancia muscular', 'Calidad de vida', 'Dieta especial', 'Rendimiento deportivo', 'Reeducación alimentaria', 'Otro'],
      },
      {
        step_key: 'dietary_restrictions', step_order: 3,
        question: 'Tem alguma restrição alimentar?',
        question_en: 'Any dietary restrictions?',
        question_es: '¿Tienes restricciones alimentarias?',
        field: 'dietary_restrictions', field_type: 'multichoice', required: false, icon: '🥬', max_choices: 3,
        choices: ['Vegetariano', 'Vegano', 'Sem glúten', 'Sem lactose', 'Diabetes', 'Alergias', 'Nenhuma'],
        choices_en: ['Vegetarian', 'Vegan', 'Gluten-free', 'Lactose-free', 'Diabetes', 'Allergies', 'None'],
        choices_es: ['Vegetariano', 'Vegano', 'Sin gluten', 'Sin lactosa', 'Diabetes', 'Alergias', 'Ninguna'],
        skip_label: { 'pt-BR': 'Nenhuma', 'en-US': 'None', 'es-ES': 'Ninguna' },
      },
      {
        step_key: 'email', step_order: 4,
        question: 'Receba planos alimentares no seu email (opcional):',
        question_en: 'Get meal plans in your email (optional):',
        question_es: 'Recibe planes alimentarios en tu email (opcional):',
        field: 'email', field_type: 'email', required: false, icon: '✉️',
        skip_label: { 'pt-BR': 'Agora não', 'en-US': 'Not now', 'es-ES': 'Ahora no' },
      },
    ],
  },
};

const FIELD_MAPPING = {
  name: { db: 'users.name', profile: 'name' },
  email: { db: 'users.email', profile: 'email' },
  phone: { db: null, profile: 'phone' },
  topics: { db: null, profile: 'topics', isArray: true },
  emotions: { db: null, profile: 'emotions', isArray: true },
  role: { db: null, profile: 'role' },
  team_size: { db: null, profile: 'teamSize' },
  revenue_goal: { db: null, profile: 'revenueGoal' },
  health_goal: { db: null, profile: 'healthGoal' },
  dietary_restrictions: { db: null, profile: 'dietaryRestrictions', isArray: true },
  spiritual_journey: { db: null, profile: 'spiritualJourney' },
};

async function getOnboardingSteps(personaId) {
  let steps;
  if (personaId) {
    const [personaRows] = await pool.execute(
      'SELECT * FROM onboarding_steps WHERE (persona_id = ? OR persona_id IS NULL) AND is_active = 1 ORDER BY step_order ASC',
      [personaId]
    );
    const personaSpecific = personaRows.filter(r => r.persona_id === personaId);
    const globalSteps = personaRows.filter(r => r.persona_id === null);
    steps = personaSpecific.length > 0 ? personaSpecific : globalSteps;
  }

  if (!steps || steps.length === 0) {
    const [allRows] = await pool.execute(
      'SELECT * FROM onboarding_steps WHERE is_active = 1 ORDER BY step_order ASC'
    );
    steps = allRows.length > 0 ? allRows : null;
  }

  if (steps && steps.length > 0) {
    return steps.map(row => ({
      ...row,
      choices: typeof row.choices === 'string' ? JSON.parse(row.choices || '[]') : (row.choices || []),
      choices_en: row.choices_en ? (typeof row.choices_en === 'string' ? JSON.parse(row.choices_en || '[]') : row.choices_en) : null,
      choices_es: row.choices_es ? (typeof row.choices_es === 'string' ? JSON.parse(row.choices_es || '[]') : row.choices_es) : null,
      placeholder: row.placeholder ? (typeof row.placeholder === 'string' ? JSON.parse(row.placeholder || '{}') : row.placeholder) : null,
      skip_label: row.skip_label ? (typeof row.skip_label === 'string' ? JSON.parse(row.skip_label || '{}') : row.skip_label) : null,
      icon: row.icon || null,
      max_choices: row.max_choices || null,
      condition_field: row.condition_field || null,
      condition_value: row.condition_value || null,
      isActive: !!row.is_active,
    }));
  }

  const lookupId = personaId === 'coach-vendas' ? 'bp_coach_vendas'
    : personaId === 'nutricionista' ? 'bp_nutricionista'
    : personaId;
  const config = (lookupId && PERSONA_STEP_CONFIGS[lookupId]) ? PERSONA_STEP_CONFIGS[lookupId] : null;
  const defaults = config ? config.steps : GLOBAL_ONBOARDING_STEPS;
  return defaults.map(s => ({
    ...s,
    choices: s.choices || [],
    choices_en: s.choices_en || null,
    choices_es: s.choices_es || null,
    placeholder: s.placeholder || null,
    skip_label: s.skip_label || null,
    icon: s.icon || null,
    max_choices: s.max_choices || null,
    condition_field: s.condition_field || null,
    condition_value: s.condition_value || null,
    isActive: true,
  }));
}

async function getUserOnboardingStatus(userId, personaId) {
  const pid = personaId || 'global';
  const [rows] = await pool.execute(
    'SELECT step_key, answer, persona_id FROM user_onboarding WHERE user_id = ? AND (persona_id = ? OR persona_id = ?)',
    [userId, pid, 'global']
  );
  const completed = {};
  for (const row of rows) {
    completed[row.step_key] = row.answer;
  }

  const allSteps = await getOnboardingSteps(personaId);

  const requiredSteps = allSteps.filter(s => {
    if (s.condition_field && s.condition_value) {
      if (s.condition_value.startsWith('!')) {
        const field = s.condition_field;
        const negateValue = s.condition_value.substring(1);
        if (completed[field] === negateValue) return false;
      } else {
        if (completed[s.condition_field] !== s.condition_value) return false;
      }
    }
    return true;
  });

  const nextRequired = requiredSteps.find(s => s.required && !completed[s.step_key] && s.field_type !== 'message');
  const nextAny = requiredSteps.find(s => !completed[s.step_key] && s.field_type !== 'message');

  return {
    completed,
    nextStep: nextRequired || nextAny || null,
    progress: allSteps.length > 0 ? Object.keys(completed).filter(k => completed[k]).length / allSteps.filter(s => s.required).length : 1,
    done: !nextRequired,
    totalSteps: allSteps.filter(s => s.required && s.field_type !== 'message').length,
    totalAllSteps: allSteps.length,
    completedSteps: Object.keys(completed).filter(k => completed[k]).length,
    steps: allSteps.map(s => ({
      ...s,
      answered: !!completed[s.step_key],
      answer: completed[s.step_key] || null,
    })),
  };
}

async function saveOnboardingAnswer(userId, stepKey, answer, personaId) {
  const pid = personaId || 'global';

  if (Array.isArray(answer)) {
    answer = answer.join(', ');
  }

  await pool.execute(
    'INSERT INTO user_onboarding (user_id, step_key, answer, persona_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE answer = VALUES(answer), answered_at = NOW()',
    [userId, stepKey, answer, pid]
  );

  const allSteps = await getOnboardingSteps(personaId);
  const step = allSteps.find(s => s.step_key === stepKey);
  if (!step) return { ok: true, nextStep: null };

  const profile = await getProfile(userId);
  const mapping = FIELD_MAPPING[step.field];

  if (mapping) {
    if (mapping.profile) {
      if (mapping.isArray) {
        const values = typeof answer === 'string' ? answer.split(',').map(v => v.trim()) : [answer];
        profile[mapping.profile] = [...new Set([...(profile[mapping.profile] || []), ...values])];
      } else {
        profile[mapping.profile] = answer;
      }
    }
  }

  if (step.field === 'email' && answer) {
    await pool.execute('UPDATE users SET email = COALESCE(?, email) WHERE id = ? AND (email IS NULL OR email = ?)', [answer, userId, '']);
  }
  if (step.field === 'name' && answer) {
    await pool.execute('UPDATE users SET name = ? WHERE id = ?', [answer, userId]);
  }

  await saveProfile(profile);

  const status = await getUserOnboardingStatus(userId, personaId);

  if (status.done) {
    try {
      await gamificationModule.addXp(userId, personaId || 'jesus', 50, 'onboarding_complete');
      await gamificationModule.addBadge(userId, personaId || 'jesus', 'onboarding_complete', {
        'pt-BR': 'Perfil Completo',
        'en-US': 'Profile Complete',
        'es-ES': 'Perfil Completo',
      }[pid.startsWith('bp_') ? 'pt-BR' : 'pt-BR']);
    } catch (e) { console.error('[Onboarding] XP/badge award failed:', e.message); }

    try {
      await autoFeedFromOnboarding(userId, personaId);
    } catch (e) { console.error('[Onboarding] Auto-feed failed:', e.message); }
  }

  return {
    ok: true,
    nextStep: status.nextStep,
    progress: status.progress,
    done: status.done,
    totalSteps: status.totalSteps,
    completedSteps: status.completedSteps,
  };
}

async function autoFeedFromOnboarding(userId, personaId) {
  const profile = await getProfile(userId);

  try {
    const agentModule = require('../agent');
    const persona = personaId ? await require('../persona/manager').getPersona(personaId) : null;

    if (profile.name) {
      try {
        const existing = await agentModule.listContacts({ owner_id: userId, persona_id: personaId, search: profile.name, limit: 1 });
        if (!existing.contacts || existing.contacts.length === 0) {
          await agentModule.createContact({
            owner_id: userId,
            persona_id: personaId,
            name: profile.name,
            email: profile.email || undefined,
            stage: 'lead',
            tags: ['onboarding', ...(profile.topics || []).slice(0, 3)],
            notes: `Auto-created from onboarding. Interests: ${(profile.topics || []).join(', ')}. Initial sentiment: ${(profile.emotions || []).join(', ')}.`,
          });
        }
      } catch (e) { console.error('[Onboarding] CRM contact creation failed:', e.message); }
    }

    if (profile.topics && profile.topics.length > 0) {
      try {
        const goalsModule = require('../goals');
        await goalsModule.createGoal({
          owner_id: userId,
          persona_id: personaId,
          title: `Explorar: ${(profile.topics || []).slice(0, 3).join(', ')}`,
          description: `Onboarding goal — explore interests based on initial profile: ${(profile.topics || []).join(', ')}`,
          goal_type: 'learning',
          priority: 'medium',
          status: 'active',
        });
      } catch (e) { console.error('[Onboarding] Goal creation failed:', e.message); }
    }

    try {
      const orgMemoryModule = require('../orgmemory');
      const interests = profile.topics || [];
      const sentiment = profile.emotions || [];
      if (interests.length > 0 || sentiment.length > 0) {
        await orgMemoryModule.createOrgMemory({
          owner_id: userId,
          persona_id: personaId,
          category: 'faq',
          title: `Perfil: ${profile.name || userId}`,
          content: `Interests: ${interests.join(', ')}. Initial sentiment: ${sentiment.join(', ')}. Role: ${profile.role || 'N/A'}. Team size: ${profile.teamSize || 'N/A'}. Goal: ${profile.revenueGoal || profile.healthGoal || 'N/A'}.`,
          tags: ['onboarding', 'profile'],
          priority: 'medium',
        });
      }
    } catch (e) { console.error('[Onboarding] Org memory creation failed:', e.message); }

    try {
      const progressModule = require('../progress');
      await progressModule.updateProgressState(userId, personaId, {
        onboarding_completed: true,
        interests: profile.topics || [],
        initial_sentiment: profile.emotions || [],
        ...(profile.role ? { role: profile.role } : {}),
        ...(profile.teamSize ? { team_size: profile.teamSize } : {}),
        ...(profile.revenueGoal ? { revenue_goal: profile.revenueGoal } : {}),
        ...(profile.healthGoal ? { health_goal: profile.healthGoal } : {}),
      });
    } catch (e) { console.error('[Onboarding] Progress state update failed:', e.message); }

    try {
      const stagesModule = require('../stages');
      await stagesModule.advanceUserStage(userId, personaId);
    } catch (e) { console.error('[Onboarding] Stage advance failed:', e.message); }
  } catch (e) {
    console.error('[Onboarding] autoFeedFromOnboarding error:', e.message);
  }
}

async function shouldOnboard(userId, personaId) {
  const enabled = await getSetting('onboarding_enabled', 'true');
  if (enabled !== 'true') return null;

  const status = await getUserOnboardingStatus(userId, personaId);
  if (status.done) return null;

  const infoSteps = status.steps.filter(s => !s.answered && s.field_type === 'message');
  for (const infoStep of infoSteps) {
    await saveOnboardingAnswer(userId, infoStep.step_key, 'acknowledged', personaId || null);
  }

  const nextStep = status.steps.find(s => !s.answered && s.field_type !== 'message' && s.required);
  if (!nextStep) {
    const nextOptional = status.steps.find(s => !s.answered && s.field_type !== 'message');
    return nextOptional || null;
  }
  return nextStep;
}

async function formatOnboardingQuestion(step, lang, brandName) {
  if (!step) return null;
  const l = lang.startsWith('en') ? 'en' : (lang.startsWith('es') ? 'es' : 'pt');
  let question = step[`question${l === 'pt' ? '' : l === 'en' ? '_en' : '_es'}`] || step.question;
  if (!question) question = step.question;

  const brand = brandName || await getSetting('brand_name', '') || '';
  const personalization = brand
    ? (l === 'en' ? ` at ${brand}` : l === 'es' ? ` en ${brand}` : ` no ${brand}`)
    : '';
  question = question.replace('{brand}', brand).replace('{personalization}', personalization);

  const choicesKey = `choices${l === 'pt' ? '' : l === 'en' ? '_en' : '_es'}`;
  const choices = step[choicesKey] || step.choices;

  let msg = question;

  if (step.step_key === 'name' && step.step_order === 0) {
    const greeting = l === 'en'
      ? await getSetting('onboarding_greeting_en', '')
      : l === 'es'
        ? await getSetting('onboarding_greeting_es', '')
        : await getSetting('onboarding_greeting', '');
    if (greeting) {
      msg = greeting + '\n\n' + question;
    }
  }

  if (step.field_type === 'message') {
    return msg;
  }

  if (choices && choices.length > 0) {
    const maxChips = step.max_choices || (step.field_type === 'multichoice' ? 3 : 1);
    msg += '\n\n' + choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
    if (step.field_type === 'multichoice') {
      msg += `\n\n_${l === 'en' ? `Choose up to ${maxChips} (numbers or text, comma-separated)` : l === 'es' ? `Elige hasta ${maxChips} (números o texto, separados por coma)` : `Escolha até ${maxChips} (números ou texto, separados por vírgula)`}_`;
    } else {
      msg += '\n\n_' + (l === 'en' ? 'Reply with the number or text' : l === 'es' ? 'Responde con el número o texto' : 'Responda com o número ou texto') + '_';
    }
  }

  const placeholder = step.placeholder;
  if (placeholder && placeholder[l === 'pt' ? 'pt-BR' : l === 'en' ? 'en-US' : 'es-ES']) {
    msg += '\n\n_' + placeholder[l === 'pt' ? 'pt-BR' : l === 'en' ? 'en-US' : 'es-ES'] + '_';
  }

  const skipLabel = step.skip_label;
  if (skipLabel && !step.required) {
    const skipText = skipLabel[l === 'pt' ? 'pt-BR' : l === 'en' ? 'en-US' : 'es-ES'];
    if (skipText) {
      msg += `\n\n_${skipText}_`;
    }
  }

  return msg;
}

function formatOnboardingStepUI(step, lang) {
  if (!step) return null;
  const l = lang.startsWith('en') ? 'en' : (lang.startsWith('es') ? 'es' : 'pt');
  const choicesKey = `choices${l === 'pt' ? '' : l === 'en' ? '_en' : '_es'}`;
  const choices = step[choicesKey] || step.choices;
  const placeholderKey = l === 'pt' ? 'pt-BR' : l === 'en' ? 'en-US' : 'es-ES';

  return {
    stepKey: step.step_key,
    fieldType: step.field_type,
    question: step[`question${l === 'pt' ? '' : l === 'en' ? '_en' : '_es'}`] || step.question,
    choices: choices || [],
    multipleChoice: step.field_type === 'multichoice',
    maxChoices: step.max_choices || (step.field_type === 'multichoice' ? 3 : 1),
    required: step.required,
    icon: step.icon || '📝',
    placeholder: step.placeholder ? (step.placeholder[placeholderKey] || step.placeholder) : '',
    skipLabel: step.skip_label ? (step.skip_label[placeholderKey] || step.skip_label) : (l === 'en' ? 'Skip' : l === 'es' ? 'Omitir' : 'Pular'),
    field: step.field,
  };
}

function parseOnboardingAnswer(step, rawAnswer) {
  if (!step) return rawAnswer;
  if (!rawAnswer || !rawAnswer.trim()) return '';

  if (step.field_type === 'multichoice') {
    const parts = rawAnswer.split(/[,,;]/).map(s => s.trim()).filter(Boolean);
    const choices = step.choices || [];
    const maxChips = step.max_choices || 3;

    return parts.slice(0, maxChips).map(part => {
      const num = parseInt(part);
      if (!isNaN(num) && num >= 1 && num <= choices.length) return choices[num - 1];
      const matched = choices.find(c =>
        c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^[A-Za-z\s]/g, '').trim() ===
        part.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^[A-Za-z\s]/g, '').trim()
      );
      return matched || part;
    }).join(', ');
  }

  if (step.choices && step.choices.length > 0) {
    const num = parseInt(rawAnswer.trim());
    if (!isNaN(num) && num >= 1 && num <= step.choices.length) {
      return step.choices[num - 1];
    }
    const matched = step.choices.find(c =>
      c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^[A-Za-z\s]/g, '').trim() ===
      rawAnswer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^[A-Za-z\s]/g, '').trim()
    );
    if (matched) return matched;
    return rawAnswer.trim();
  }

  return rawAnswer.trim();
}

async function ensureUser(userId, userName, source) {
  const [rows] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
  if (rows.length > 0) return userId;

  const name = userName || userId.replace(/^(wa_|tg_|user_)/, '');
  const email = `${userId.substring(0, 50)}@${source || 'web'}.local`;
  const role = 'user';
  await pool.execute(
    'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
    [userId, email.substring(0, 255), name, role]
  );
  return userId;
}

async function createOnboardingStep(data) {
  const { step_key, step_order, question, question_en, question_es, field, field_type, choices, choices_en, choices_es, required, persona_id, condition_field, condition_value, icon, placeholder, skip_label, max_choices } = data;
  await pool.execute(
    `INSERT INTO onboarding_steps (step_key, step_order, question, question_en, question_es, field, field_type, choices, choices_en, choices_es, required, persona_id, condition_field, condition_value, icon, placeholder, skip_label, max_choices)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE step_order=VALUES(step_order), question=VALUES(question), question_en=VALUES(question_en), question_es=VALUES(question_es), field=VALUES(field), field_type=VALUES(field_type), choices=VALUES(choices), choices_en=VALUES(choices_en), choices_es=VALUES(choices_es), required=VALUES(required), persona_id=VALUES(persona_id), condition_field=VALUES(condition_field), condition_value=VALUES(condition_value), icon=VALUES(icon), placeholder=VALUES(placeholder), skip_label=VALUES(skip_label), max_choices=VALUES(max_choices)`,
    [step_key, step_order || 0, question, question_en || null, question_es || null, field, field_type || 'text',
     JSON.stringify(choices || []), JSON.stringify(choices_en || []), JSON.stringify(choices_es || []),
     required !== false ? 1 : 0, persona_id || null, condition_field || null, condition_value || null,
     icon || null, JSON.stringify(placeholder || {}), JSON.stringify(skip_label || {}), max_choices || null]
  );
  return { step_key, ok: true };
}

async function deleteOnboardingStep(stepKey) {
  await pool.execute('DELETE FROM onboarding_steps WHERE step_key = ?', [stepKey]);
  return { ok: true };
}

async function resetOnboardingSteps(personaId) {
  if (personaId && PERSONA_STEP_CONFIGS[personaId]) {
    await pool.execute('DELETE FROM onboarding_steps WHERE persona_id = ?', [personaId]);
    for (const step of PERSONA_STEP_CONFIGS[personaId].steps) {
      await createOnboardingStep({ ...step, persona_id: personaId });
    }
    return { ok: true, count: PERSONA_STEP_CONFIGS[personaId].steps.length };
  }

  await pool.execute('DELETE FROM onboarding_steps WHERE persona_id IS NULL');
  for (const step of GLOBAL_ONBOARDING_STEPS) {
    await createOnboardingStep(step);
  }
  return { ok: true, count: GLOBAL_ONBOARDING_STEPS.length };
}

async function resetUserOnboarding(userId, personaId) {
  const pid = personaId || 'global';
  await pool.execute('DELETE FROM user_onboarding WHERE user_id = ? AND (persona_id = ? OR persona_id IS NULL)', [userId, pid]);
  return { ok: true };
}

function getProfileCompleteness(profile) {
  if (!profile) return 0;
  const fields = ['name', 'email', 'topics', 'emotions', 'role', 'phone'];
  const filled = fields.filter(f => profile[f] && (Array.isArray(profile[f]) ? profile[f].length > 0 : true));
  return Math.round((filled.length / fields.length) * 100);
}

module.exports = {
  getOnboardingSteps,
  getUserOnboardingStatus,
  saveOnboardingAnswer,
  shouldOnboard,
  formatOnboardingQuestion,
  formatOnboardingStepUI,
  parseOnboardingAnswer,
  ensureUser,
  createOnboardingStep,
  deleteOnboardingStep,
  resetOnboardingSteps,
  resetUserOnboarding,
  getProfileCompleteness,
  PERSONA_STEP_CONFIGS,
  GLOBAL_ONBOARDING_STEPS,
};