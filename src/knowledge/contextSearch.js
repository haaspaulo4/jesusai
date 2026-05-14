const { searchMultiSource, searchVerses } = require('../knowledge/store');
const goalsModule = require('../goals');
const stagesModule = require('../stages');
const orgMemoryModule = require('../orgmemory');
const progressModule = require('../progress');

const INTENT_BOOST = {
  purchase: { sourceBoost: { sales: 1.5, pricing: 2.0, product: 1.8 }, topicBoost: ['preço', 'preço', 'plano', 'compra', 'contrato', 'buy', 'price', 'plan'] },
  support: { sourceBoost: { faq: 2.0, policies: 1.5, product: 1.3 }, topicBoost: ['ajuda', 'problema', 'erro', 'bug', 'suporte', 'help', 'issue'] },
  information: { sourceBoost: { product: 1.5, services: 1.5, faq: 1.3 }, topicBoost: ['como', 'o que', 'quando', 'explicar', 'how', 'what', 'explain'] },
  complaint: { sourceBoost: { policies: 1.8, faq: 1.5 }, topicBoost: ['reclamação', 'insatisfeito', 'problema', 'complaint', 'problem'] },
  scheduling: { sourceBoost: { team: 1.5, services: 1.3 }, topicBoost: ['agendar', 'horário', 'consulta', 'schedule', 'appointment'] },
  cancellation: { sourceBoost: { policies: 2.0, pricing: 1.5 }, topicBoost: ['cancelar', 'desistir', 'cancel', 'stop'] },
  feedback: { sourceBoost: { product: 1.3, services: 1.3 }, topicBoost: ['feedback', 'avaliação', 'sugestão', 'suggest', 'rate'] },
};

const EMOTION_BOOST = {
  frustrated: { weight: 1.4, topicBoost: ['paciência', 'solução', 'resolver', 'patience', 'solution', 'resolve'] },
  sad: { weight: 1.3, topicBoost: ['ânimo', 'esperança', 'apoio', 'encorajamento', 'hope', 'support', 'encouragement'] },
  angry: { weight: 1.3, topicBoost: ['compreensão', 'desculpa', 'resolver', 'understanding', 'resolve'] },
  anxious: { weight: 1.2, topicBoost: ['calma', 'tranquilidade', 'segurança', 'calm', 'security', 'peace'] },
  excited: { weight: 1.1, topicBoost: ['explorar', 'possibilidades', 'novidades', 'explore', 'possibilities'] },
  confused: { weight: 1.4, topicBoost: ['explicar', 'passo a passo', 'clareza', 'explain', 'step by step', 'clarity'] },
  curious: { weight: 1.1, topicBoost: ['interessante', 'detalhes', 'profundidade', 'interesting', 'details', 'depth'] },
  happy: { weight: 1.0, topicBoost: [] },
  neutral: { weight: 1.0, topicBoost: [] },
};

async function searchContextAware(message, { userId, personaId, personaSources, topK, cognitiveState, sessionId } = {}) {
  const k = topK || 8;
  const kForRag = Math.ceil(k * 0.6);
  const kForOrgMemory = Math.ceil(k * 0.25);
  const kForGoals = Math.ceil(k * 0.15);

  let enhancedQuery = message;

  if (cognitiveState) {
    const intentConfig = INTENT_BOOST[cognitiveState.intent];
    const emotionConfig = EMOTION_BOOST[cognitiveState.emotion];

    if (intentConfig && intentConfig.topicBoost.length > 0) {
      const extraTerms = intentConfig.topicBoost.slice(0, 3).join(' ');
      enhancedQuery = enhancedQuery + ' ' + extraTerms;
    }
    if (emotionConfig && emotionConfig.topicBoost.length > 0) {
      const extraTerms = emotionConfig.topicBoost.slice(0, 2).join(' ');
      enhancedQuery = enhancedQuery + ' ' + extraTerms;
    }
  }

  let ragResults = [];
  if (personaSources && personaSources.length > 0) {
    ragResults = await searchMultiSource(enhancedQuery, personaSources, kForRag);
  } else {
    ragResults = await searchVerses(enhancedQuery, kForRag);
  }

  if (cognitiveState) {
    const emotionConfig = EMOTION_BOOST[cognitiveState.emotion];
    const intentConfig = INTENT_BOOST[cognitiveState.intent];
    const emotionWeight = emotionConfig ? emotionConfig.weight : 1.0;

    ragResults = ragResults.map(r => {
      let score = 1 / (r.distance || 0.5);
      score *= emotionWeight;

      if (intentConfig) {
        const lowerText = (r.text || '').toLowerCase();
        const lowerRef = (r.reference || '').toLowerCase();
        for (const term of intentConfig.topicBoost) {
          if (lowerText.includes(term) || lowerRef.includes(term)) {
            score *= 1.3;
            break;
          }
        }
      }

      return { ...r, score };
    });
    ragResults.sort((a, b) => (b.score || 1) - (a.score || 1));
  }

  let orgMemoryResults = [];
  if (userId && personaId) {
    try {
      orgMemoryResults = await orgMemoryModule.searchOrgMemory(message, userId, personaId, kForOrgMemory);
    } catch {}
  }

  let goalContext = '';
  if (userId) {
    try {
      const goals = await goalsModule.listGoals({ owner_id: userId, status: 'active', limit: 5 });
      if (goals.length > 0) {
        const goalKeywords = goals.map(g => g.title).join(' ');
        if (personaSources && personaSources.length > 0) {
          const goalResults = await searchMultiSource(goalKeywords, personaSources, kForGoals);
          ragResults = [...ragResults, ...goalResults];
        }
        goalContext = goalsModule.formatGoalContext(goals);
      }
    } catch {}
  }

  let stageContext = '';
  if (userId && personaId) {
    try {
      stageContext = await stagesModule.getUserStageContext(userId, personaId);
    } catch {}
  }

  let progressContext = '';
  if (userId && personaId) {
    try {
      const progressData = await progressModule.getProgressState(userId, personaId);
      progressContext = progressModule.formatProgressContext(progressData);
    } catch {}
  }

  const finalResults = ragResults.slice(0, k);

  return {
    results: finalResults,
    enhancedQuery: enhancedQuery !== message ? enhancedQuery : null,
    orgMemory: orgMemoryResults,
    goalContext,
    stageContext,
    progressContext,
    contextApplied: {
      cognitiveBoost: !!cognitiveState,
      emotionWeight: cognitiveState ? (EMOTION_BOOST[cognitiveState.emotion]?.weight || 1.0) : null,
      intentBoost: cognitiveState ? !!INTENT_BOOST[cognitiveState.intent] : null,
      goalExpansion: goalContext.length > 0,
      orgMemoryUsed: orgMemoryResults.length > 0,
    },
  };
}

module.exports = { searchContextAware, INTENT_BOOST, EMOTION_BOOST };