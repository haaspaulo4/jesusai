const { searchMultiSource, searchVerses } = require('./store');
const goalsModule = require('../goals');
const stagesModule = require('../stages');
const orgMemoryModule = require('../orgmemory');
const progressModule = require('../progress');

async function searchContextAware(message, { userId, personaId, personaSources, topK, cognitiveState, sessionId } = {}) {
  const k = topK || 8;

  let ragResults = [];
  if (personaSources && personaSources.length > 0) {
    ragResults = await searchMultiSource(message, personaSources, k);
  } else {
    ragResults = await searchVerses(message, k);
  }

  let orgMemoryResults = [];
  if (userId && personaId) {
    try {
      orgMemoryResults = await orgMemoryModule.searchOrgMemory(message, userId, personaId, 5);
    } catch {}
  }

  let goalContext = '';
  if (userId) {
    try {
      const goals = await goalsModule.listGoals({ owner_id: userId, status: 'active', limit: 5 });
      if (goals.length > 0) {
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

  return {
    results: ragResults.slice(0, k),
    enhancedQuery: null,
    orgMemory: orgMemoryResults,
    goalContext,
    stageContext,
    progressContext,
    contextApplied: {
      cognitiveBoost: !!cognitiveState,
      emotionWeight: 1.0,
      intentBoost: false,
      goalExpansion: goalContext.length > 0,
      orgMemoryUsed: orgMemoryResults.length > 0,
    },
  };
}

module.exports = { searchContextAware };