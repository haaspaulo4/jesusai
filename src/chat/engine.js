const integrations = require('../llm/integrationManager');
const { getToolDefinitions, executeTool, formatToolResultToMessage } = require('../llm/tools');
const { executeTool: execExtTool, getToolDefinitions: getExtToolDefs, loadTools: loadExtTools } = require('../tools');
const { extractContent } = require('../llm');
const { buildSystemPrompt } = require('../persona/config');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');
const { searchVerses, searchMultiSource } = require('../knowledge/store');
const {
  getSession, addMessage, getHistoryForLLM, buildMemoryContext,
  extractContextFromMessage, updateSessionContext, generateSummary, saveSession,
} = require('../memory/session');
const {
  getProfile, updateProfileFromMessage, buildProfileContext, generateProfileSummary, saveProfile,
} = require('../memory/profile');
const { getSetting } = require('../settings');
const { t, SUPPORTED_LANGS, DEFAULT_LANG } = require('../i18n');
const { SUPPORTED_TTS_LANGS } = require('../tts');
const { checkRateLimit, getUserRole } = require('../auth/rateLimit');
const surveyEngine = require('../survey');
const onboarding = require('../onboarding');
const overrideModule = require('../override');
const goalsModule = require('../goals');
const stagesModule = require('../stages');
const orgMemoryModule = require('../orgmemory');
const gamificationModule = require('../gamification');
const progressModule = require('../progress');
const cognitiveModule = require('../cognitive');
const thoughtsModule = require('../thoughts');
const realtime = require('../realtime');

const MAX_TOOL_ROUNDS = 5;

function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

async function getPersonaForContext(sessionId, userId) {
  let persona;
  if (sessionId) {
    try {
      persona = await personaManager.getSessionPersona(sessionId);
    } catch (err) { console.error('[ChatEngine] getSessionPersona error:', err.message); }
  }
  if (!persona && userId) {
    try {
      persona = await personaManager.getUserPersona(userId);
    } catch (err) { console.error('[ChatEngine] getUserPersona error:', err.message); }
  }
  return persona || personaManager.getActivePersona();
}

async function checkOnboarding(uid, lang, personaId) {
  let pid = personaId;
  if (!pid) {
    const persona = await getPersonaForContext(null, uid);
    pid = persona ? persona.id : null;
  }
  return onboarding.shouldOnboard(uid, pid);
}

async function processOnboardingAnswer(uid, message, lang, personaId) {
  try {
    let pid = personaId;
    let persona = null;
    if (!pid) {
      persona = await getPersonaForContext(null, uid);
      pid = persona ? persona.id : null;
    } else {
      persona = await personaManager.getPersona(pid).catch(() => null);
    }
    const status = await onboarding.getUserOnboardingStatus(uid, pid);
    if (!status || !status.nextStep) {
      return null;
    }

    const step = status.nextStep;
    const parsedAnswer = onboarding.parseOnboardingAnswer(step, message);
    const result = await onboarding.saveOnboardingAnswer(uid, step.step_key, parsedAnswer, pid);

    if (result.done) {
      const personaName = persona ? (persona.name || persona.id) : 'MetaPersona.AI';
      const welcomeDone = {
        'pt-BR': `Onboarding completo! Bem-vindo ao ${personaName}. Como posso ajudar?`,
        'en-US': `Onboarding complete! Welcome to ${personaName}. How can I help?`,
        'es-ES': `¡Onboarding completo! Bienvenido a ${personaName}. ¿Cómo puedo ayudar?`,
      };
      return { done: true, message: welcomeDone[lang] || welcomeDone['pt-BR'], totalSteps: result.totalSteps, completedSteps: result.completedSteps };
    }

    const nextQuestion = onboarding.formatOnboardingQuestion(result.nextStep, lang);
    return { done: false, message: nextQuestion, totalSteps: result.totalSteps, completedSteps: result.completedSteps };
  } catch (err) {
    console.error('[Onboarding] processOnboardingAnswer error:', err.message);
    return null;
  }
}

async function processMessage({ message, sessionId, userId, language, isGroup, source, userName, personaId }) {
  const lang = SUPPORTED_LANGS.includes(language) ? language : DEFAULT_LANG;
  const uid = userId || 'user_default';
   const sid = sessionId || generateSessionId();

   if (uid && uid !== 'user_default' && !isGroup) {
     try {
       await onboarding.ensureUser(uid, userName || uid.replace(/^(wa_|tg_|user_)/, ''), source || 'web');
     } catch (err) { console.error('[ChatEngine] ensureUser error:', err.message); }
   }

   if (uid && uid !== 'user_default') {
     const role = await getUserRole(uid);
     if (role === 'banned') {
       return { response: 'Conta suspensa. Entre em contato com o suporte.', sessionId: sid, sources: [], language: lang, banned: true };
    }
    const rateResult = await checkRateLimit(uid, role);
    if (!rateResult.allowed) {
      return { response: `Limite de mensagens atingido (${rateResult.limit}/dia). Tente novamente em ${rateResult.resetIn} minutos.`, sessionId: sid, sources: [], language: lang, rateLimited: true };
    }
  }

  if (uid && uid !== 'user_default' && !isGroup) {
    const onboardMsg = await checkOnboarding(uid, lang, personaId);
    if (onboardMsg) {
      const answerResult = await processOnboardingAnswer(uid, message, lang, personaId);
      if (answerResult) {
        return {
          response: answerResult.message,
          sessionId: sid,
          sources: [],
          language: lang,
          onboarding: !answerResult.done,
          onboardingDone: answerResult.done,
          onboardingTotalSteps: answerResult.totalSteps,
          onboardingCompletedSteps: answerResult.completedSteps,
        };
      }
      return {
        response: onboardMsg,
        sessionId: sid,
        sources: [],
        language: lang,
        onboarding: true,
      };
    }
  }

  await updateProfileFromMessage(uid, message);
  const userContext = extractContextFromMessage(message);
  await updateSessionContext(sid, userContext);

  const override = await overrideModule.getOverride(sid);
  if (override && override.is_active) {
    if (override.override_type === 'full') {
      if (override.human_message) {
        await addMessage(sid, 'assistant', override.human_message);
        return { response: override.human_message, sessionId: sid, sources: [], language: lang, humanOverride: true };
      }
      return { response: 'Um atendente humano está cuidando desta conversa. Aguarde um momento.', sessionId: sid, sources: [], language: lang, humanOverride: true };
    }
  }

  const persona = await getPersonaForContext(sid, uid);
  const numVerses = parseInt(await getSetting('search_verses_count', '8')) || 8;
  const personaSources = persona && persona.knowledgeSources && persona.knowledgeSources.length > 0
    ? persona.knowledgeSources
    : null;

  let cognitiveContext = '';
  let cognitiveState = null;
  try {
    cognitiveState = await cognitiveModule.analyzeCognitiveState(uid, persona.id, message, sid);
    cognitiveContext = cognitiveModule.formatCognitiveContext(cognitiveState);
    if (cognitiveState) {
      realtime.emitToUser(uid, 'cognitive_state', {
        personaId: persona.id,
        emotion: cognitiveState.emotion,
        intent: cognitiveState.intent,
        churnRisk: cognitiveState.churn_risk,
        engagement: cognitiveState.engagement_score,
      });
    }
   } catch (err) { console.error('[ChatEngine] cognitive state error:', err.message); }

   let contextStr = '';
   let orgContext = '';
   let goalContext = '';
   let stageContext = '';
   let progressContext = '';
   let contextAwareInfo = null;
   let relevantVerses = [];

   const useContextAware = await getSetting('context_aware_search', 'true') === 'true';

   if (useContextAware && cognitiveState) {
     try {
       const { searchContextAware } = require('../knowledge/contextSearch');
       const ctxResult = await searchContextAware(message, {
         userId: uid,
         personaId: persona.id,
         personaSources,
         topK: numVerses,
         cognitiveState,
         sessionId: sid,
       });
       contextStr = ctxResult.results.map(v => `${v.reference}: "${v.text}"`).join('\n');
       orgContext = orgMemoryModule.getOrgMemoryContext(ctxResult.orgMemory);
       goalContext = ctxResult.goalContext;
       stageContext = ctxResult.stageContext;
       progressContext = ctxResult.progressContext;
       contextAwareInfo = ctxResult.contextApplied;
     } catch (err) {
       console.error('[ChatEngine] context-aware search error:', err.message);
       relevantVerses = personaSources
         ? await searchMultiSource(message, personaSources, numVerses)
         : await searchVerses(message, numVerses);
       contextStr = relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n');
     }
  } else {
    relevantVerses = personaSources
      ? await searchMultiSource(message, personaSources, numVerses)
      : await searchVerses(message, numVerses);
    contextStr = relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n');
  }

  const [memoryStr, profileStr] = await Promise.all([
    buildMemoryContext(sid),
    buildProfileContext(uid),
  ]);

  let xpContext = '';
  let xpData = null;
  const contextPromises = [];
  if (!goalContext) contextPromises.push(goalsModule.listGoals({ owner_id: uid, status: 'active', limit: 10 }).then(g => { goalContext = goalsModule.formatGoalContext(g); }).catch(err => { console.error('[ChatEngine] goals context error:', err.message); }));
  if (!orgContext) contextPromises.push(orgMemoryModule.searchOrgMemory(message, uid, persona.id, 5).then(om => { orgContext = orgMemoryModule.getOrgMemoryContext(om); }).catch(err => { console.error('[ChatEngine] org memory context error:', err.message); }));
  if (!stageContext) contextPromises.push(stagesModule.getUserStageContext(uid, persona.id).then(sc => { stageContext = sc; }).catch(err => { console.error('[ChatEngine] stage context error:', err.message); }));
  contextPromises.push(gamificationModule.getXp(uid, persona.id).then(xp => { xpData = xp; xpContext = gamificationModule.formatXpContext(xp); return gamificationModule.updateStreak(uid, persona.id); }).then(() => { if (xpData) realtime.emitXpUpdate(uid, xpData); }).catch(err => { console.error('[ChatEngine] xp context error:', err.message); }));
  if (!progressContext) contextPromises.push(progressModule.getProgressState(uid, persona.id).then(p => { progressContext = progressModule.formatProgressContext(p); }).catch(err => { console.error('[ChatEngine] progress context error:', err.message); }));
  await Promise.allSettled(contextPromises);

  const session = await getSession(sid);
  const displayName = userName || session.userName || session.userContext?.name;

  const useContextCompiler = await getSetting('context_compiler_enabled', 'true') === 'true';
  let extraContext = [goalContext, orgContext, stageContext, xpContext, progressContext, cognitiveContext].filter(Boolean).join('\n\n');
  let contextMeta = null;

  if (useContextCompiler) {
    try {
      const { compileContext, buildContextLayers } = require('../context');
      const layers = buildContextLayers({
        goals: goalContext,
        orgMemory: orgContext,
        stage: stageContext,
        xp: xpContext,
        progress: progressContext,
        cognitive: cognitiveContext,
      });
      const result = await compileContext(layers, { cognitiveState });
      extraContext = result.prompt;
       contextMeta = { utilization: result.utilization, dropped: result.droppedLayers, tokens: result.totalTokens };
     } catch (err) { console.error('[ChatEngine] context compiler error:', err.message); }
   }

  let businessStr = '';
  try {
    const businessModule = require('../business');
    const businessConfig = await businessModule.getBusinessConfig(persona.id);
    if (businessConfig && businessConfig.name) {
       businessStr = businessModule.formatBusinessContext(businessConfig);
     }
   } catch (err) { console.error('[ChatEngine] business context error:', err.message); }

   let systemPrompt = buildSystemPrompt(persona, lang, contextStr, memoryStr, profileStr, displayName, isGroup, personaSources, businessStr);
  if (extraContext) {
    systemPrompt += '\n\n' + extraContext;
  }

  console.log(`[ChatEngine] persona=${persona.id}, sources=${personaSources ? personaSources.join(',') : 'bible'}, contextLen=${contextStr.length}, promptStart=${systemPrompt.substring(0, 120)}, contextUtil=${contextMeta ? contextMeta.utilization + '%' : 'raw'}`);

  const toolsEnabled = await getSetting('tools_enabled', 'true') === 'true';
  const historyLimit = parseInt(await getSetting('history_limit', '10')) || 10;
  const history = await getHistoryForLLM(sid, historyLimit);

  console.log(`[ChatEngine] historyLen=${history.length}, firstMsg=${history.length > 0 ? history[0].role + ':' + history[0].content?.substring(0, 50) : 'none'}`);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  await addMessage(sid, 'user', message);

  if (uid && userId) {
    session.userId = uid;
    await saveSession(session);
  }

  let fullResponse = '';
  let toolRounds = 0;
  let sources = relevantVerses.slice(0, 4).map(v => ({
    reference: v.reference,
    text: v.text.substring(0, 120) + (v.text.length > 120 ? '...' : ''),
  }));

  const maxTokens = parseInt(await getSetting('max_tokens', '4096')) || 4096;
  const temperature = parseFloat(await getSetting('temperature', '0.7')) || 0.7;

  const isMetaPersona = persona.id === 'meta-persona';
  const isAdmin = await isUserAdmin(uid);
  let executionPlan = null;

  if (isMetaPersona || isAdmin) {
    try {
      const { planExecution, shouldUsePlanner } = require('../planner');
      if (shouldUsePlanner(message, isAdmin, isMetaPersona)) {
        executionPlan = await planExecution(message, persona.id, uid, null, integrations);
        if (executionPlan) {
          console.log(`[ChatEngine] Plan: intent=${executionPlan.intent}, needsTools=${executionPlan.needsTools}, strategy=${executionPlan.responseStrategy}, risk=${executionPlan.riskLevel}`);
        }
      }
    } catch (err) {
      console.error('[ChatEngine] Planner error:', err.message);
    }
  }

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const llmTools = getToolDefinitions();
    const extTools = getExtToolDefs ? getExtToolDefs() : [];
    const allTools = [...llmTools, ...extTools];
    const metaPersonaOnlyTools = ['create_persona', 'list_personas', 'create_skill', 'invoke_skill', 'list_skills', 'add_knowledge_source', 'manage_tasks', 'manage_calendar', 'manage_contacts', 'manage_automations', 'manage_goals', 'manage_conversation_stages', 'manage_org_memory', 'manage_xp', 'manage_progress', 'get_cognitive_state', 'human_override', 'get_suggestions', 'get_dashboard', 'get_history', 'update_settings', 'manage_users', 'send_email_to_user', 'manage_blueprints', 'use_external_tool', 'list_external_tools'];

    let tools;
    if (isMetaPersona) {
      tools = allTools;
    } else if (isAdmin) {
      tools = allTools;
    } else {
      tools = toolsEnabled ? allTools.filter(t => !metaPersonaOnlyTools.includes(t.function.name)) : null;
    }

    const result = await integrations.callLLM(messages, {
      userId: uid,
      stream: false,
      temperature,
      numPredict: maxTokens,
      retries: 2,
      timeout: parseInt(await getSetting('llm_timeout', '30000')) || 30000,
      tools: tools,
    });

    const toolCalls = result.tool_calls;
    const content = extractContent(result) || '';

    if (!toolCalls || toolCalls.length === 0) {
      fullResponse = content;
      break;
    }

    messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });

    for (const tc of toolCalls) {
      const fnName = tc.function?.name || tc.name;
      const fnArgs = tc.function?.arguments ? (typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments) : {};
      let toolResult;
      const isExternalTool = fnName === 'use_external_tool' || fnName === 'list_external_tools';
      if (isExternalTool) {
        toolResult = await execExtTool(fnName, fnArgs, { userId: uid, lang });
      } else {
        toolResult = await executeTool(fnName, fnArgs, { userId: uid, lang, isAdmin: isAdmin || isMetaPersona });
      }

      messages.push({
        role: 'tool',
        name: fnName,
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
      });

      if (fnName === 'bible_lookup' && toolResult.verses) {
        sources = toolResult.verses.slice(0, 4).map(v => ({
          reference: v.reference,
          text: v.text.substring(0, 120) + (v.text.length > 120 ? '...' : ''),
        }));
      }
    }

    toolRounds++;
  }

  if (toolRounds >= MAX_TOOL_ROUNDS) {
    fullResponse = messages.filter(m => m.role === 'assistant').pop()?.content || fullResponse;
  }

  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(fullResponse);
  if (hasCJK) {
    fullResponse = t('cjkFallback', lang);
  }

  await addMessage(sid, 'assistant', fullResponse);

  realtime.emitNewMessage(sid, { role: 'assistant', content: fullResponse, personaId: persona.id });

  const updatedSession = await getSession(sid);
  const summaryEvery = parseInt(await getSetting('summary_every', '10')) || 10;
  if (updatedSession.messages.length % summaryEvery === 0) {
    generateSummary(sid).catch(() => {});
  }

  updateProfileFromMessage(uid, fullResponse);

  const profileEvery = parseInt(await getSetting('profile_summary_every', '15')) || 15;
  if (updatedSession.messages.length % profileEvery === 0) {
    generateProfileSummary(uid).catch(() => {});
  }

  const smartFollowUp = require('../onboarding/followup');
  surveyEngine.autoCreateFollowUp(uid, sid).catch(() => {});

  smartFollowUp.shouldCreateFollowUp(uid, persona.id, sid).catch(() => {});

  if (xpData && xpData.streak > 1 && xpData.last_activity) {
    const lastActivity = new Date(xpData.last_activity);
    const daysSince = Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60 * 24));
    if (daysSince >= 2) {
      smartFollowUp.checkStreakFollowUp(uid, persona.id).catch(() => {});
    }
  }

  return {
    response: fullResponse,
    sessionId: sid,
    sources,
    language: lang,
    toolCallsUsed: toolRounds > 0 ? toolRounds : 0,
    personaId: persona.id,
    personaName: persona.name,
    ttsVoice: persona.ttsVoice,
    ttsLang: persona.ttsLang,
  };
}

async function getContextualWelcome(userId, personaId, lang) {
  const smartFollowUp = require('../onboarding/followup');
  return smartFollowUp.getContextualWelcome(userId, personaId, lang);
}

async function getQuickActions(personaId, userId) {
  const smartFollowUp = require('../onboarding/followup');
  const { getProfile } = require('../memory/profile');
  const profile = userId ? await getProfile(userId).catch(() => null) : null;
  return smartFollowUp.getQuickActions(personaId, profile);
}

async function processMessageStream({ message, sessionId, userId, language, isGroup, source, userName, personaId }, onChunk) {
  const lang = SUPPORTED_LANGS.includes(language) ? language : DEFAULT_LANG;
  const uid = userId || 'user_default';
  const sid = sessionId || generateSessionId();

  if (uid && uid !== 'user_default' && !isGroup) {
    try {
      await onboarding.ensureUser(uid, userName || uid.replace(/^(wa_|tg_|user_)/, ''), source || 'web');
    } catch {}
  }

  if (uid && uid !== 'user_default') {
    const role = await getUserRole(uid);
    if (role === 'banned') {
      if (onChunk) onChunk('Conta suspensa. Entre em contato com o suporte.');
      return { response: 'banned', sessionId: sid, sources: [], language: lang, banned: true };
    }
    const rateResult = await checkRateLimit(uid, role);
    if (!rateResult.allowed) {
      const msg = `Limite de mensagens atingido (${rateResult.limit}/dia). Tente novamente em ${rateResult.resetIn} minutos.`;
      if (onChunk) onChunk(msg);
      return { response: msg, sessionId: sid, sources: [], language: lang, rateLimited: true };
    }
  }

  if (uid && uid !== 'user_default' && !isGroup) {
    const onboardMsg = await checkOnboarding(uid, lang, personaId);
    if (onboardMsg) {
      const answerResult = await processOnboardingAnswer(uid, message, lang, personaId);
      if (answerResult) {
        return { response: answerResult.message, sessionId: sid, sources: [], language: lang, onboarding: !answerResult.done, onboardingDone: answerResult.done };
      }
      return { response: onboardMsg, sessionId: sid, sources: [], language: lang, onboarding: true };
    }
  }

  await updateProfileFromMessage(uid, message);
  const userContext = extractContextFromMessage(message);
  await updateSessionContext(sid, userContext);

  const override = await overrideModule.getOverride(sid);
  if (override && override.is_active) {
    if (override.override_type === 'full') {
      if (override.human_message) {
        await addMessage(sid, 'assistant', override.human_message);
        return { response: override.human_message, sessionId: sid, sources: [], language: lang, humanOverride: true };
      }
      return { response: 'Um atendente humano está cuidando desta conversa. Aguarde um momento.', sessionId: sid, sources: [], language: lang, humanOverride: true };
    }
  }

  const persona = await getPersonaForContext(sid, uid);
  const numVerses = parseInt(await getSetting('search_verses_count', '8')) || 8;
  const personaSources = persona && persona.knowledgeSources && persona.knowledgeSources.length > 0
    ? persona.knowledgeSources
    : null;

  let cognitiveContextStream = '';
  let cognitiveState = null;
  try {
    cognitiveState = await cognitiveModule.analyzeCognitiveState(uid, persona.id, message, sid);
    cognitiveContextStream = cognitiveModule.formatCognitiveContext(cognitiveState);
    if (cognitiveState) {
      realtime.emitToUser(uid, 'cognitive_state', {
        personaId: persona.id,
        emotion: cognitiveState.emotion,
        intent: cognitiveState.intent,
        churnRisk: cognitiveState.churn_risk,
        engagement: cognitiveState.engagement_score,
      });
    }
  } catch {}

  let contextStr = '';
  let orgContextStream = '';
  let goalContextStream = '';
  let stageContextStream = '';
  let progressContextStreamStream = '';

  const useContextAware = await getSetting('context_aware_search', 'true') === 'true';
  if (useContextAware && cognitiveState) {
    try {
      const { searchContextAware } = require('../knowledge/contextSearch');
      const ctxResult = await searchContextAware(message, { userId: uid, personaId: persona.id, personaSources, topK: numVerses, cognitiveState, sessionId: sid });
      contextStr = ctxResult.results.map(v => `${v.reference}: "${v.text}"`).join('\n');
      orgContextStream = orgMemoryModule.getOrgMemoryContext(ctxResult.orgMemory);
      goalContextStream = ctxResult.goalContext;
      stageContextStream = ctxResult.stageContext;
      progressContextStreamStream = ctxResult.progressContext;
    } catch {
      const relevantVerses = personaSources ? await searchMultiSource(message, personaSources, numVerses) : await searchVerses(message, numVerses);
      contextStr = relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n');
    }
  } else {
    const relevantVerses = personaSources ? await searchMultiSource(message, personaSources, numVerses) : await searchVerses(message, numVerses);
    contextStr = relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n');
  }

  const memoryStr = await buildMemoryContext(sid);
  const profileStr = await buildProfileContext(uid);

  if (!goalContextStream) {
    try {
      const goals = await goalsModule.listGoals({ owner_id: uid, status: 'active', limit: 10 });
      goalContextStream = goalsModule.formatGoalContext(goals);
    } catch {}
  }
  if (!orgContextStream) {
    try {
      const orgMemories = await orgMemoryModule.searchOrgMemory(message, uid, persona.id, 5);
      orgContextStream = orgMemoryModule.getOrgMemoryContext(orgMemories);
    } catch {}
  }
  if (!stageContextStream) {
    try {
      stageContextStream = await stagesModule.getUserStageContext(uid, persona.id);
    } catch {}
  }
  let xpContextStream = '';
  let xpData = null;
  try {
    xpData = await gamificationModule.getXp(uid, persona.id);
    xpContextStream = gamificationModule.formatXpContext(xpData);
    await gamificationModule.updateStreak(uid, persona.id);
    realtime.emitXpUpdate(uid, xpData);
  } catch {}
  if (!progressContextStreamStream) {
    try {
      const progressData = await progressModule.getProgressState(uid, persona.id);
      progressContextStreamStream = progressModule.formatProgressContext(progressData);
    } catch {}
  }

  const session = await getSession(sid);
  const displayName = userName || session.userName || session.userContext?.name;

  let businessStrStream = '';
  try {
    const businessModule = require('../business');
    const businessConfig = await businessModule.getBusinessConfig(persona.id);
    if (businessConfig && businessConfig.name) {
      businessStrStream = businessModule.formatBusinessContext(businessConfig);
    }
  } catch {}

  const extraContextStream = [goalContextStream, orgContextStream, stageContextStream, xpContextStream, progressContextStreamStream, cognitiveContextStream].filter(Boolean).join('\n\n');
  let systemPrompt = buildSystemPrompt(persona, lang, contextStr, memoryStr, profileStr, displayName, isGroup, personaSources, businessStrStream);
  if (extraContextStream) {
    systemPrompt += '\n\n' + extraContextStream;
  }

  const historyLimit = parseInt(await getSetting('history_limit', '10')) || 10;
  const history = await getHistoryForLLM(sid, historyLimit);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  await addMessage(sid, 'user', message);

  if (uid && userId) {
    session.userId = uid;
    await saveSession(session);
  }

  const maxTokens = parseInt(await getSetting('max_tokens', '4096')) || 4096;
  const temperature = parseFloat(await getSetting('temperature', '0.7')) || 0.7;

  const toolsEnabled = await getSetting('tools_enabled', 'true') === 'true';
  const isMetaPersona = persona.id === 'meta-persona';
  const isAdmin = await isUserAdmin(uid);

  const llmTools = getToolDefinitions();
  const extTools = getExtToolDefs ? getExtToolDefs() : [];
  const allTools = [...llmTools, ...extTools];
  const metaPersonaOnlyTools = ['create_persona', 'list_personas', 'create_skill', 'invoke_skill', 'list_skills', 'add_knowledge_source', 'manage_tasks', 'manage_calendar', 'manage_contacts', 'manage_automations', 'manage_goals', 'manage_conversation_stages', 'manage_org_memory', 'manage_xp', 'manage_progress', 'get_cognitive_state', 'human_override', 'get_suggestions', 'get_dashboard', 'get_history', 'update_settings', 'manage_users', 'send_email_to_user', 'manage_blueprints', 'use_external_tool', 'list_external_tools'];
  const streamTools = (isMetaPersona || isAdmin) ? allTools : (toolsEnabled ? allTools.filter(t => !metaPersonaOnlyTools.includes(t.function.name)) : null);

  try {
    const response = await integrations.callLLM(messages, {
      userId: uid,
      stream: true,
      temperature,
      numPredict: maxTokens,
      retries: 2,
      timeout: parseInt(await getSetting('llm_timeout', '30000')) || 30000,
      tools: streamTools,
    });

    const { parseStream } = require('../llm');
    let fullResponse = '';

    for await (const chunk of parseStream(response)) {
      if (typeof chunk === 'string') {
        fullResponse += chunk;
        if (onChunk) onChunk(chunk);
      }
    }

    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(fullResponse);
    if (hasCJK) {
      fullResponse = t('cjkFallback', lang);
      if (onChunk) onChunk('\n' + fullResponse);
    }

    await addMessage(sid, 'assistant', fullResponse);

    realtime.emitNewMessage(sid, { role: 'assistant', content: fullResponse, personaId: persona.id });

    const updatedSession = await getSession(sid);
    const summaryEvery = parseInt(await getSetting('summary_every', '10')) || 10;
    if (updatedSession.messages.length % summaryEvery === 0) {
      generateSummary(sid).catch(() => {});
    }

    updateProfileFromMessage(uid, fullResponse);

    const profileEvery = parseInt(await getSetting('profile_summary_every', '15')) || 15;
    if (updatedSession.messages.length % profileEvery === 0) {
      generateProfileSummary(uid).catch(() => {});
    }

    surveyEngine.autoCreateFollowUp(uid, sid).catch(() => {});

    const smartFollowUp = require('../onboarding/followup');
    smartFollowUp.shouldCreateFollowUp(uid, persona.id, sid).catch(() => {});

    thoughtsModule.logThought({
      session_id: sid,
      user_id: uid,
      persona_id: persona.id,
      message_input: message.substring(0, 500),
      message_output: fullResponse.substring(0, 500),
      tools_used: null,
      context_injected: {
        hasGoals: goalContextStream.length > 0,
        hasOrgMemory: orgContextStream.length > 0,
        hasStage: stageContextStream.length > 0,
        hasXp: xpContextStream.length > 0,
        hasProgress: progressContextStreamStream.length > 0,
        hasCognitive: cognitiveContextStream.length > 0,
      },
      reasoning: cognitiveState ? `${cognitiveState.emotion}/${cognitiveState.intent}` : null,
      decision: cognitiveState?.suggested_action || null,
    }).catch(() => {});

    const sources = (contextStr ? [] : []).slice(0, 4);

    return { response: fullResponse, sessionId: sid, sources, language: lang, personaId: persona.id, personaName: persona.name, ttsVoice: persona.ttsVoice, ttsLang: persona.ttsLang };

  } catch (err) {
    console.error('[ChatEngine] Stream error:', err.message);
    throw err;
  }
}

async function isUserAdmin(userId) {
  try {
    const [rows] = await require('../db').pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows.length > 0 && rows[0].role === 'admin';
  } catch {
    return false;
  }
}

async function getUserRoleStr(userId) {
  return getUserRole(userId);
}

async function handleChatCommand(text, userId, source, sessionId) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');
  const isAdmin = await isUserAdmin(userId);
  const uid = userId || 'unknown';

  const persona = await getPersonaForContext(sessionId, uid);

  // Check custom commands first
  try {
    const chatCommands = require('./commands');
    const customCmd = await chatCommands.processCommand(text, uid, isAdmin ? 'admin' : 'user', persona?.id);
    if (customCmd) {
      if (customCmd.error) return customCmd.error;
      if (customCmd.response_type === 'image' || customCmd.response_type === 'video' || customCmd.response_type === 'audio') {
        return { type: 'media', content: customCmd.response, media_type: customCmd.response_type };
      }
      return customCmd.response;
    }
  } catch (err) {
    console.log('[ChatCommands] Custom cmd error:', err.message);
  }

  const cmdConfig = persona.commands;

  switch (cmd) {
    case '/stats': {
      const [sessionRows] = await require('../db').pool.execute('SELECT COUNT(*) as total FROM sessions WHERE user_id = ?', [uid]);
      const [msgRows] = await require('../db').pool.execute(
        `SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ?`,
        [uid]
      );
      return `📊 Suas estatísticas:\n• Sessões: ${sessionRows[0].total}\n• Mensagens: ${msgRows[0].total}`;
    }

    case '/myprofile': {
      const profile = await getProfile(uid);
      const lines = ['📋 Seu perfil:'];
      if (profile.name) lines.push(`• Nome: ${profile.name}`);
      if (profile.topics?.length) lines.push(`• Temas: ${profile.topics.join(', ')}`);
      if (profile.emotions?.length) lines.push(`• Emoções: ${profile.emotions.join(', ')}`);
      if (profile.spiritualJourney) lines.push(`• Jornada: ${profile.spiritualJourney}`);
      return lines.join('\n') || 'Perfil vazio ainda. Converse mais comigo!';
    }

    case '/persona':
    case '/personagem': {
      if (!args) {
        const personas = await metaRag.listAvailablePersonas();
        const lines = personas.map(p => `• ${p.name} (${p.id}) ${p.isActive ? '✅' : '❌'}`);
        return `🎭 Personas disponíveis:\n${lines.join('\n')}\n\nUse: /persona <id> para trocar\nUse: /persona create <descrição> para criar (admin)`;
      }

      if (args === 'reset' || args === 'default') {
        await personaManager.setUserPersona(uid, 'jesus');
        if (sessionId) await personaManager.setSessionPersona(sessionId, 'jesus');
        const jesus = await personaManager.getPersona('jesus');
        return metaRag.formatPersonaSwitchMessage(jesus, 'pt-BR');
      }

      if (args.startsWith('create ')) {
        if (!isAdmin) return '⛔ Apenas administradores podem criar personas.';
        const description = args.slice(7).trim();
        if (!description) return 'Uso: /persona create <nome ou descrição>';
        try {
          const newPersona = await metaRag.createPersonaFromDescription(description, uid);
          return `✨ Persona "${newPersona.name}" (${newPersona.id}) criada com sucesso!\n\nUse /persona ${newPersona.id} para ativar.`;
        } catch (err) {
          return `❌ Erro ao criar persona: ${err.message}`;
        }
      }

      if (args.startsWith('edit ')) {
        if (!isAdmin) return '⛔ Apenas administradores podem editar personas.';
        const editParts = args.slice(5).trim().split(' ');
        const personaId = editParts[0];
        const field = editParts[1];
        const value = editParts.slice(2).join(' ');
        if (!personaId || !field) return 'Uso: /persona edit <id> <campo> <valor>\nCampos: name, ttsVoice, ttsLang, model, priority';
        try {
          const updates = {};
          if (field === 'name') updates.name = value;
          else if (field === 'nameEn') updates.name_en = value;
          else if (field === 'nameEs') updates.name_es = value;
          else if (field === 'ttsVoice' || field === 'tts_voice') updates.tts_voice = value;
          else if (field === 'ttsLang' || field === 'tts_lang') updates.tts_lang = value;
          else if (field === 'model') updates.model = value;
          else if (field === 'priority') updates.priority = parseInt(value) || 100;
          else if (field === 'active' || field === 'isActive') updates.isActive = value === 'true' || value === '1';
          else return `Campo inválido: ${field}\nCampos: name, nameEn, nameEs, ttsVoice, ttsLang, model, priority, active`;
          await personaManager.createPersona({ id: personaId, ...updates });
          return `✅ Persona "${personaId}" atualizada: ${field} = ${value}`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      if (args.startsWith('delete ')) {
        if (!isAdmin) return '⛔ Apenas administradores podem deletar personas.';
        const personaId = args.slice(7).trim();
        if (personaId === 'jesus') return '⛔ Não é possível deletar a persona padrão.';
        try {
          await personaManager.deletePersona(personaId);
          return `🗑️ Persona "${personaId}" deletada.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      const targetPersona = args.trim().toLowerCase();
      try {
        const result = await metaRag.switchPersona(uid, sessionId, targetPersona);
        const freshPersona = await personaManager.getPersona(targetPersona);
        return metaRag.formatPersonaSwitchMessage(freshPersona, 'pt-BR');
      } catch (err) {
        return `❌ Persona "${args}" não encontrada. Use /persona para listar.`;
      }
    }

    case '/settings': {
      if (!isAdmin) return '⛔ Apenas administradores podem usar este comando.';
      const settings = await require('../settings').getAllSettings();
      const lines = Object.entries(settings).map(([k, v]) => `• ${k}: ${v}`);
      return `⚙️ Configurações:\n${lines.join('\n')}`;
    }

    case '/set': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      if (!args || !args.includes('=')) return 'Uso: /set chave=valor';
      const [key, ...rest] = args.split('=');
      const value = rest.join('=').trim();
      await require('../settings').setSetting(key.trim(), value);
      return `✅ Configuração "${key.trim()}" atualizada para "${value}".`;
    }

    case '/keys': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const status = integrations.getStatusDetailed();
      const lines = [];
      for (const [type, info] of Object.entries(status)) {
        const healthy = info.healthy || 0;
        const total = info.total || 0;
        lines.push(`\n${info.label}: ${healthy}/${total} OK`);
        for (const integ of (info.integrations || [])) {
          lines.push(`  [${integ.healthy ? '✓' : '✗'}] ${integ.label} ${integ.healthy ? '' : integ.lastError?.substring(0, 50) || ''}`);
        }
      }
      return `🔑 Integrações:${lines.join('\n')}`;
    }

    case '/addkey': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const keyParts = args.split(' ');
      if (keyParts.length < 2) return 'Uso: /addkey <tipo> <chave> [base_url] [modelo] [label]\nTipos: llm, tts_kokoro, tts_multivozes, stt_groq, stt_openai, telegram, whatsapp, email';
      const sType = keyParts[0];
      const apiKey = keyParts[1];
      const baseUrl = keyParts[2] || '';
      const model = keyParts[3] || '';
      const label = keyParts[4] || '';
      try {
        const result = await integrations.addIntegration(sType, apiKey, { baseUrl, model, label });
        return `✅ Integração adicionada: ${result.label} (${result.id})`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/removekey': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      if (!args) return 'Uso: /removekey <id>';
      try {
        await integrations.removeIntegration(parseInt(args));
        return `✅ Integração ${args} removida.`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/togglekey': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const toggleParts = args.split(' ');
      if (toggleParts.length < 2) return 'Uso: /togglekey <id> <on|off>';
      try {
        await integrations.toggleIntegration(parseInt(toggleParts[0]), toggleParts[1] === 'on');
        return `✅ Integração ${toggleParts[0]} ${toggleParts[1] === 'on' ? 'ativada' : 'desativada'}.`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/health': {
      const status = integrations.getStatusDetailed();
      const lines = [];
      for (const [type, info] of Object.entries(status)) {
        if (!info.total) continue;
        lines.push(`${info.label}: ${info.healthy}/${info.total} OK`);
      }
      return `🏥 Saúde das integrações:\n${lines.join('\n') || 'Nenhuma integração configurada'}`;
    }

    case '/admin': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const [userCount] = await require('../db').pool.execute('SELECT COUNT(*) as total FROM users');
      const [msgCount] = await require('../db').pool.execute('SELECT COUNT(*) as total FROM messages');
      const [sessionCount] = await require('../db').pool.execute('SELECT COUNT(*) as total FROM sessions');
      const integStatus = integrations.getStatusDetailed();
      const okCount = Object.values(integStatus).reduce((acc, v) => acc + (v.healthy || 0), 0);
      const totalKeys = Object.values(integStatus).reduce((acc, v) => acc + (v.total || 0), 0);
      const personas = await personaManager.listPersonas();
      return `👑 Painel Admin:\n• Usuários: ${userCount[0].total}\n• Mensagens: ${msgCount[0].total}\n• Sessões: ${sessionCount[0].total}\n• Personas: ${personas.length}\n• Integrações: ${okCount}/${totalKeys} OK\n\nComandos:\n/persona - Gerenciar personas\n/keys, /addkey - Integrações\n/settings, /set - Config\n/users, /promote, /ban - Usuários\n/survey - Pesquisas\n/ratings - Avaliações\n/health - Saúde`;
    }

    case '/voice': {
      const { KOKORO_VOICES: kv } = require('../tts');
      const voiceList = Object.entries(kv).map(([lang, cfg]) => `  ${lang}: ${cfg.voice}`).join('\n');
      if (!args) {
        return `🔊 Voz atual: ${persona.ttsVoice || 'pm_alex'}\n\nVozes Kokoro disponíveis:\n${voiceList}\n\nUse: /voice <nome_da_voz>\nExemplo: /voice pm_alex, /voice pf_dora`;
      }
      const newVoice = args.trim();
      try {
        await personaManager.createPersona({ id: persona.id, tts_voice: newVoice });
        personaManager.invalidateCache();
        return `✅ Voz da persona "${persona.name}" alterada para: ${newVoice}`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/users': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const [rows] = await require('../db').pool.execute('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 20');
      const lines = rows.map(r => `• ${r.name || r.email} (${r.role || 'user'}) - ${r.id}`);
      return `👥 Últimos usuários:\n${lines.join('\n')}`;
    }

    case '/promote': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      if (!args) return 'Uso: /promote <user_id> [role]';
      const promoteParts = args.split(' ');
      const targetId = promoteParts[0];
      const role = promoteParts[1] || 'premium';
      if (!['user', 'premium', 'admin'].includes(role)) return 'Roles: user, premium, admin';
      await require('../db').pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);
      return `✅ Usuário ${targetId} promovido para ${role}.`;
    }

    case '/ban': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      if (!args) return 'Uso: /ban <user_id>';
      await require('../db').pool.execute('UPDATE users SET role = ? WHERE id = ?', ['banned', args.trim()]);
      return `🚫 Usuário ${args.trim()} banido.`;
    }

    case '/survey': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      if (!args) {
        const surveys = await surveyEngine.listSurveys({ activeOnly: false });
        if (surveys.surveys.length === 0) return '📋 Nenhuma pesquisa criada. Use /survey create <título>';
        const lines = surveys.surveys.map(s => `• ${s.id}: "${s.title}" ${s.isActive ? '✅' : '❌'} (${s.triggerType})`);
        return `📋 Pesquisas:\n${lines.join('\n')}\n\nComandos:\n/survey create <título>\n/survey <id> - Ver detalhes\n/survey <id> toggle\n/survey <id> responses`;
      }

      const surveyArgs = args.split(' ');
      if (surveyArgs[0] === 'create') {
        const title = surveyArgs.slice(1).join(' ');
        if (!title) return 'Uso: /survey create <título>';
        try {
          const survey = await surveyEngine.createSurvey({
            title,
            questions: [
              { id: 'q1', type: 'rating', text: 'Como você avalia sua experiência?', required: true },
              { id: 'q2', type: 'text', text: 'O que podemos melhorar?', required: false },
              { id: 'q3', type: 'choice', text: 'Recomendaria para alguém?', choices: ['Sim', 'Talvez', 'Não'], required: true },
            ],
            triggerType: 'manual',
          });
          return `📋 Pesquisa criada: "${survey.title}" (${survey.id})\nAtive com: /survey ${survey.id} toggle`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      if (surveyArgs[1] === 'toggle') {
        try {
          const s = await surveyEngine.getSurvey(surveyArgs[0]);
          if (!s) return 'Pesquisa não encontrada.';
          await surveyEngine.updateSurvey(surveyArgs[0], { isActive: !s.isActive });
          return `✅ Pesquisa "${s.title}" ${s.isActive ? 'desativada' : 'ativada'}.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      if (surveyArgs[1] === 'responses') {
        try {
          const result = await surveyEngine.getSurveyResponses(surveyArgs[0], { limit: 10 });
          return `📋 Respostas (${result.total}):\n${result.responses.map(r => `• ${r.user_id}: ${JSON.stringify(r.answers).substring(0, 80)}...`).join('\n')}`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      try {
        const s = await surveyEngine.getSurvey(surveyArgs[0]);
        if (!s) return 'Pesquisa não encontrada.';
        return `📋 "${s.title}" (${s.id})\nTipo: ${s.triggerType}\nAtiva: ${s.isActive ? '✅' : '❌'}\nPerguntas: ${s.questions.length}\nCriada: ${s.createdAt}`;
      } catch {
        return 'Pesquisa não encontrada.';
      }
    }

    case '/ratings':
    case '/avaliacoes': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      try {
        const result = await surveyEngine.getRatings({ limit: 10 });
        const dist = Object.entries(result.distribution).map(([k, v]) => `${'⭐'.repeat(parseInt(k))} ${k}: ${v}`).join(', ');
        return `📊 Avaliações (média: ${result.average}/5, total: ${result.totalRatings})\n\nDistribuição: ${dist || 'Nenhuma ainda'}\n\nÚltimas:\n${result.ratings.slice(0, 5).map(r => `• ${r.rating}⭐ ${r.category} - ${r.feedback?.substring(0, 40) || ''} (${r.source})`).join('\n')}`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/followups': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const result = await surveyEngine.getFollowUps({ limit: 10 });
      const lines = result.followUps.map(f => `• [${f.status}] ${f.type}: "${f.question?.substring(0, 50)}..." → ${f.user_id} ${f.response ? '✅' : '⏳'}`);
      return `📬 Follow-ups (${result.total}):\n${lines.join('\n') || 'Nenhum follow-up'}`;
    }

    case '/tools': {
      const toolDefs = getToolDefinitions();
      const lines = toolDefs.map(t => `• ${t.function.name}: ${t.function.description.split('.')[0]}`);
      return `🔧 Ferramentas disponíveis:\n${lines.join('\n')}`;
    }

    case '/skills': {
      const skills = await require('../skills').listSkills(args ? { persona_id: args.trim() } : {});
      if (skills.length === 0) return '📋 Nenhuma skill encontrada.';
      const lines = skills.map(s => `• ${s.name} (${s.type}) ${s.is_active ? '✅' : '❌'} ${s.persona_id ? '[' + s.persona_id + ']' : '[global]'} - ${s.description?.substring(0, 60) || ''}`);
      return `🎭 Skills (${skills.length}):\n${lines.join('\n')}\n\nUse: /skill <id> para ver detalhes`;
    }

    case '/tasks': {
      const taskFilters = {};
      if (args) {
        const parts = args.trim().split(/\s+/);
        if (parts[0] === 'overdue') { const tasks = await agent.getOverdueTasks(uid); return `⚠️ Tarefas atrasadas (${tasks.length}):\n${tasks.map(t => `• [${t.priority}] ${t.title} - ${t.status} ${t.due_date ? '(Prazo: ' + t.due_date + ')' : ''}`).join('\n')}`; }
        if (['pending', 'in_progress', 'completed', 'cancelled'].includes(parts[0])) taskFilters.status = parts[0];
      }
      taskFilters.owner_id = uid;
      taskFilters.limit = 20;
      const tasks = await agent.listTasks(taskFilters);
      if (tasks.length === 0) return '📋 Nenhuma tarefa encontrada.';
      return `📋 Tarefas (${tasks.length}):\n${tasks.map(t => `• [${t.priority}] ${t.title} - ${t.status} ${t.due_date ? '(Prazo: ' + t.due_date + ')' : ''}`).join('\n')}`;
    }

    case '/calendar': {
      if (!args || args === 'upcoming' || args === 'semana') {
        const events = await agent.getUpcomingEvents(uid, 7);
        if (events.length === 0) return '📅 Nenhum evento nos próximos 7 dias.';
        return `📅 Próximos eventos (${events.length}):\n${events.map(e => `• ${e.start_time}: ${e.title} (${e.event_type}) ${e.location ? '@ ' + e.location : ''}`).join('\n')}`;
      }
      return '📅 Use: /calendar [upcoming|semana]\nOu peça para criar um evento no chat.';
    }

    case '/contacts': {
      const contactFilters = {};
      if (args) {
        const parts = args.trim().split(/\s+/);
        if (['lead', 'prospect', 'customer', 'churned', 'vip'].includes(parts[0])) contactFilters.stage = parts[0];
        else contactFilters.search = args.trim();
      }
      contactFilters.owner_id = uid;
      contactFilters.limit = 20;
      const contacts = await agent.listContacts(contactFilters);
      if (contacts.length === 0) return '👥 Nenhum contato encontrado.';
      return `👥 Contatos (${contacts.length}):\n${contacts.map(c => `• ${c.name} [${c.stage}] ${c.email || ''} ${c.company ? '@ ' + c.company : ''} ${c.tags ? '(' + (Array.isArray(c.tags) ? c.tags.join(',') : c.tags) + ')' : ''}`).join('\n')}`;
    }

    case '/automations': {
      const automations = await agent.listAutomations({ owner_id: uid, limit: 20 });
      if (automations.length === 0) return '🤖 Nenhuma automação configurada.';
      return `🤖 Automações (${automations.length}):\n${automations.map(a => `• ${a.name} [${a.trigger_type} → ${a.action_type}] ${a.is_active ? '✅' : '❌'}`).join('\n')}`;
    }

    case '/dashboard': {
      const stats = await agent.getDashboardStats(uid);
      const goals2 = await goalsModule.listGoals({ owner_id: uid, status: 'active', limit: 5 });
      return `📊 Dashboard:\n• Tarefas: ${stats.tasks.total} (${Object.entries(stats.tasks.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')})\n• Eventos (7d): ${stats.upcomingEvents}\n• Contatos: ${stats.contacts.total} (${Object.entries(stats.contacts.byStage).map(([k, v]) => `${k}: ${v}`).join(', ')})\n• Automações ativas: ${stats.activeAutomations}\n• Personas: ${stats.activePersonas}\n• Skills: ${stats.activeSkills}${stats.goals ? '\n• Metas: ' + stats.goals.total + ' (' + Object.entries(stats.goals.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ') + ')' : ''}${stats.orgMemory && stats.orgMemory.total > 0 ? '\n• Memória Org: ' + stats.orgMemory.total + ' itens' : ''}${goals2.length > 0 ? '\n• Metas ativas: ' + goals2.map(g => g.title).join(', ') : ''}`;
    }

    case '/goals':
    case '/metas': {
      if (!args || args === 'list' || args === 'lista') {
        const goals = await goalsModule.listGoals({ owner_id: uid, limit: 20 });
        if (goals.length === 0) return '🎯 Nenhuma meta encontrada. Use: /goals create <título>';
        const lines = goals.map(g => {
          const statusIcon = g.status === 'completed' ? '✅' : g.status === 'paused' ? '⏸️' : g.status === 'abandoned' ? '❌' : '🎯';
          const progressStr = g.progress > 0 ? ` (${g.progress}%)` : '';
          return `${statusIcon} [${g.goal_type}] ${g.title} - ${g.status}${progressStr}`;
        });
        return `🎯 Metas (${goals.length}):\n${lines.join('\n')}\n\nComandos:\n/goals create <título>\n/goals <id> edit <campo> <valor>\n/goals <id> progress <0-100>\n/goals progress - Progresso geral`;
      }

      if (args === 'progress' || args === 'progresso') {
        const progress = await goalsModule.getGoalProgress(uid);
        const statusLines = Object.entries(progress.byStatus).map(([s, d]) => `${s}: ${d.count} (média ${d.avgProgress}%)`);
        return `📊 Progresso das metas:\n• Total: ${progress.total}\n${statusLines.join('\n')}`;
      }

      if (args.startsWith('create ') || args.startsWith('criar ')) {
        const title = args.replace(/^(create|criar)\s+/i, '').trim();
        if (!title) return 'Uso: /goals create <título>';
        try {
          const goal = await goalsModule.createGoal({ owner_id: uid, title });
          return `🎯 Meta "${title}" criada! (ID: ${goal.id})\n\nUse /goals para listar, ou edite com /goals ${goal.id} edit <campo> <valor>`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      const goalParts = args.trim().split(/\s+/);
      const goalId = goalParts[0];
      if (goalParts[1] === 'edit') {
        const field = goalParts[2];
        const value = goalParts.slice(3).join(' ');
        if (!field) return 'Campos: title, description, goal_type, priority, status, target_metric, target_value, due_date';
        try {
          const updates = {};
          if (field === 'progress') updates.progress = parseInt(value) || 0;
          else if (field === 'status') updates.status = value;
          else if (field === 'priority') updates.priority = value;
          else if (field === 'goal_type') updates.goal_type = value;
          else if (field === 'title') updates.title = value;
          else if (field === 'description') updates.description = value;
          else if (field === 'target_metric') updates.target_metric = value;
          else if (field === 'target_value') updates.target_value = value;
          else if (field === 'due_date') updates.due_date = value;
          else return `Campo inválido: ${field}`;
          const goal = await goalsModule.updateGoal(goalId, updates);
          if (!goal) return `❌ Meta "${goalId}" não encontrada.`;
          return `✅ Meta "${goal.title}" atualizada: ${field} = ${value}`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      if (goalParts[1] === 'progress') {
        try {
          const goal = await goalsModule.updateGoal(goalId, { progress: parseInt(goalParts[2]) || 0 });
          if (!goal) return `❌ Meta "${goalId}" não encontrada.`;
          return `✅ Progresso de "${goal.title}" atualizado para ${goalParts[2]}%`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      if (goalParts[1] === 'delete') {
        try {
          await goalsModule.deleteGoal(goalId);
          return `🗑️ Meta "${goalId}" deletada.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      try {
        const goal = await goalsModule.getGoal(goalId);
        if (!goal) return `❌ Meta "${goalId}" não encontrada.`;
        return `🎯 ${goal.title}\n• Tipo: ${goal.goal_type}\n• Status: ${goal.status}\n• Prioridade: ${goal.priority}\n• Progresso: ${goal.progress}%${goal.target_metric ? '\n• Métrica: ' + goal.target_metric + ' = ' + (goal.current_value || '?') + '/' + (goal.target_value || '?') : ''}${goal.due_date ? '\n• Prazo: ' + goal.due_date : ''}${goal.description ? '\n• Descrição: ' + goal.description : ''}`;
      } catch {
        return `❌ Meta "${goalId}" não encontrada.`;
      }
    }

    case '/stages':
    case '/estagios': {
      if (!args || args === 'list') {
        const stages = await stagesModule.listConversationStages({});
        const userStage = await stagesModule.getUserStage(uid, persona.id);
        const stageList = stages.map(s => `${s.is_active ? '✅' : '❌'} ${s.stage_order}: ${s.name} - ${s.description || ''}`).join('\n');
        const currentStage = userStage ? `\n\n📍 Seu estágio atual: ${userStage.current_stage}` : '\n\n📍 Seu estágio: Nenhum definido';
        return `🔄 Estágios de conversa:\n${stageList || 'Nenhum estágio configurado.'}${currentStage}\n\nComandos:\n/stages init - Criar estágios padrão\n/stages <id> - Ver detalhes\n/stages advance - Avançar estágio`;
      }

      if (args === 'init') {
        const stages = await stagesModule.ensureDefaultStages(persona.id);
        return `✅ ${stages.length} estágios padrão criados!\n${stages.map(s => `• ${s.stage_order}: ${s.name}`).join('\n')}`;
      }

      if (args === 'advance') {
        const result = await stagesModule.advanceUserStage(uid, persona.id, sid);
        if (!result) return '⚠️ Não há próximo estágio disponível.';
        const stage = await stagesModule.getConversationStage(result.current_stage);
        return `✅ Estágio avançado para: ${stage ? stage.name : result.current_stage}`;
      }

      if (args.startsWith('set ')) {
        const stageId = args.slice(4).trim();
        const result = await stagesModule.setUserStage(uid, persona.id, stageId, sid);
        return `✅ Estágio definido para: ${stageId}`;
      }

      const stageDetail = await stagesModule.getConversationStage(args.trim());
      if (stageDetail) {
        return `🔄 ${stageDetail.name} (Ordem: ${stageDetail.stage_order})\n• Descrição: ${stageDetail.description || 'N/A'}\n• Ativo: ${stageDetail.is_active ? '✅' : '❌'}\n• Triggers: ${stageDetail.triggers ? JSON.stringify(stageDetail.triggers) : 'N/A'}\n• Responses: ${stageDetail.responses ? JSON.stringify(stageDetail.responses) : 'N/A'}`;
      }
      return '🔄 Use: /stages [list|init|advance|set <id>]';
    }

    case '/orgmem':
    case '/memoria': {
      if (!args || args === 'list') {
        const memories = await orgMemoryModule.listOrgMemory({ owner_id: uid, limit: 20 });
        if (memories.length === 0) return '🧠 Nenhuma memória organizacional. Use: /orgmem create <título>|<categoria>|<conteúdo>';
        const grouped = {};
        for (const m of memories) {
          if (!grouped[m.category]) grouped[m.category] = [];
          grouped[m.category].push(m);
        }
        const lines = Object.entries(grouped).map(([cat, items]) => {
          return `${cat.toUpperCase()}:\n${items.map(m => `  • ${m.title} [${m.priority}]`).join('\n')}`;
        }).join('\n\n');
        return `🧠 Memória Organizacional:\n${lines}`;
      }

      if (args.startsWith('create ') || args.startsWith('criar ')) {
        const parts = args.replace(/^(create|criar)\s+/i, '').trim().split('|');
        const title = parts[0]?.trim() || 'Nova memória';
        const category = parts[1]?.trim() || 'custom';
        const content = parts[2]?.trim() || '';
        try {
          const mem = await orgMemoryModule.createOrgMemory({ owner_id: uid, title, category, content });
          return `🧠 Memória "${title}" criada! (${category}) ID: ${mem.id}`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      if (args.startsWith('search ') || args.startsWith('buscar ')) {
        const query = args.replace(/^(search|buscar)\s+/i, '').trim();
        const results = await orgMemoryModule.searchOrgMemory(query, uid, persona.id, 5);
        if (results.length === 0) return `🧠 Nenhum resultado para "${query}".`;
        return `🧠 Resultados para "${query}":\n${results.map(r => `• [${r.category}] ${r.title}: ${r.content.substring(0, 100)}...`).join('\n')}`;
      }

      if (args.startsWith('delete ')) {
        const memId = args.slice(7).trim();
        await orgMemoryModule.deleteOrgMemory(memId);
        return `🗑️ Memória "${memId}" deletada.`;
      }

      return '🧠 Comandos:\n/orgmem list - Listar\n/orgmem create <título>|<categoria>|<conteúdo>\n/orgmem search <query>\n/orgmem delete <id>';
    }

    case '/xp':
    case '/level':
    case '/gamificacao': {
      const subcmd = args ? args.split(' ')[0].toLowerCase() : '';
      if (subcmd === 'add') {
        const amount = parseInt(args.split(' ')[1]) || 10;
        const result = await gamificationModule.addXp(uid, persona.id, amount, 'manual');
        const badges = await gamificationModule.checkAndAwardBadges(uid, persona.id);
        let msg = `✅ +${amount} XP! Total: ${result.xp} (Nível ${result.level})`;
        if (result.leveledUp) msg += `\n🎉 Level up! Agora nível ${result.level}!`;
        if (badges.length > 0) msg += `\n🏆 Nova conquista: ${badges.map(b => b.name).join(', ')}`;
        return msg;
      }
      if (subcmd === 'leaderboard' || subcmd === 'ranking') {
        const lb = await gamificationModule.getLeaderboard(persona.id, 10);
        const lines = lb.map((entry, i) => `${i + 1}. ${entry.user_id} — ${entry.xp} XP (Nível ${entry.level}, ${entry.streak || 0} streak)`);
        return `🏆 Ranking:\n${lines.join('\n') || 'Nenhum jogador ainda'}`;
      }
      if (subcmd === 'badges' || subcmd === 'conquistas') {
        const xpData = await gamificationModule.getXp(uid, persona.id);
        const badgeList = (xpData.badges || []).map(b => `🏆 ${b.name} (${b.earnedAt ? new Date(b.earnedAt).toLocaleDateString() : ''})`);
        return badgeList.length > 0 ? `🏆 Suas Conquistas:\n${badgeList.join('\n')}` : '🏆 Nenhuma conquista ainda. Continue interagindo!';
      }
      const xpData = await gamificationModule.getXp(uid, persona.id);
      const nextLevel = gamificationModule.getXpForNextLevel(xpData.xp);
      const badges = (xpData.badges || []).map(b => b.name).join(', ') || 'Nenhuma';
      return `🎮 Seu Progresso:\n• Nível: ${xpData.level}\n• XP: ${xpData.xp}${nextLevel.remaining > 0 ? ` (${nextLevel.remaining} para o próximo)` : ''}\n• Streak: ${xpData.streak || 0} dias (melhor: ${xpData.best_streak || 0})\n• Conquistas: ${badges}`;
    }

    case '/progress': {
      const progressData = await progressModule.getProgressState(uid, persona.id);
      const state = progressData.state || {};
      if (args && args.includes('=')) {
        const [key, ...valParts] = args.split('=');
        const value = valParts.join('=').trim();
        const keyClean = key.trim();
        const numVal = Number(value);
        if (!isNaN(numVal)) {
          await progressModule.updateProgressState(uid, persona.id, { [keyClean]: numVal });
        } else {
          await progressModule.updateProgressState(uid, persona.id, { [keyClean]: value });
        }
        return `✅ Progresso atualizado: ${keyClean} = ${value}`;
      }
      if (args && args.startsWith('increment ')) {
        const field = args.slice(10).trim();
        await progressModule.incrementProgressField(uid, persona.id, field, 1);
        return `✅ ${field} +1`;
      }
      const entries = Object.entries(state);
      if (entries.length === 0) return '📊 Nenhum progresso registrado ainda. Converse mais comigo!';
      const lines = entries.map(([key, val]) => {
        if (Array.isArray(val)) return `• ${key}: ${val.join(', ')}`;
        if (typeof val === 'object') return `• ${key}: ${JSON.stringify(val)}`;
        return `• ${key}: ${val}`;
      });
      return `📊 Seu Progresso:\n${lines.join('\n')}`;
    }

    case '/blueprints':
    case('/blueprint'): {
      const blueprintsModule = require('../blueprints');
      if (!args || args === 'list' || args === 'lista') {
        const blueprints = await blueprintsModule.listBlueprints({ is_active: true });
        if (blueprints.length === 0) return '🏗️ Nenhum blueprint disponível. Peça à meta-persona para criar um!';
        const lines = blueprints.map(b => `• ${b.name} (${b.id}) [${b.category}/${b.niche}] ${b.is_official ? '⭐' : ''}`);
        return `🏗️ Blueprints (${blueprints.length}):\n${lines.join('\n')}\n\nComandos:\n/blueprints <id> - Ver detalhes\n/blueprints clone <id> [nome] - Clonar como nova persona\n/blueprints categories - Listar categorias`;
      }

      if (args === 'categories' || args === 'categorias') {
        const categories = await blueprintsModule.getBlueprintCategories();
        return `📂 Categorias de blueprint:\n${categories.map(c => `• ${c}`).join('\n') || 'Nenhuma categoria'}`;
      }

      if (args === 'niches' || args === 'nichos') {
        const niches = await blueprintsModule.getBlueprintNiches();
        return `🎯 Nichos de blueprint:\n${niches.map(n => `• ${n}`).join('\n') || 'Nenhum nicho'}`;
      }

      if (args === 'stats') {
        const stats = await blueprintsModule.getBlueprintStats();
        return `📊 Blueprint Stats:\n• Total: ${stats.total}\n• Oficiais: ${stats.official}\n• Ativos: ${stats.active}\n• Categorias: ${stats.byCategory.map(c => `${c.category} (${c.count})`).join(', ')}\n• Top nichos: ${stats.topNiches.map(n => `${n.niche} (${n.count})`).join(', ')}`;
      }

      const bpParts = args.trim().split(/\s+/);

      if (bpParts[0] === 'clone') {
        const bpId = bpParts[1];
        const overrideName = bpParts.slice(2).join(' ') || undefined;
        if (!bpId) return 'Uso: /blueprints clone <id> [nome personalizado]';
        try {
          const overrides = overrideName ? { name: overrideName } : {};
          const persona = await blueprintsModule.cloneBlueprint(bpId, overrides);
          return `🏗️ Blueprint clonado como persona "${persona.name}" (${persona.id})!\n\nUse /persona ${persona.id} para ativar.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      try {
        const bp = await blueprintsModule.getBlueprint(bpParts[0]);
        if (!bp) return `❌ Blueprint "${bpParts[0]}" não encontrado.`;
        const previewStr = bp.preview ? (bp.preview.identity_preview || '') : '';
        return `🏗️ ${bp.name} (${bp.id})\n• Descrição: ${bp.description || 'N/A'}\n• Categoria: ${bp.category}\n• Nicho: ${bp.niche}\n• Oficial: ${bp.is_official ? '⭐' : '❌'}\n• Tags: ${(bp.tags || []).join(', ') || 'N/A'}${previewStr ? '\n• Preview: ' + previewStr : ''}\n\nUse: /blueprints clone ${bp.id} para criar uma persona deste template`;
      } catch {
        return `❌ Blueprint "${bpParts[0]}" não encontrado.`;
      }
    }

    default:
      return null;
  }
}

module.exports = {
  processMessage,
  processMessageStream,
  handleChatCommand,
  isUserAdmin,
  getUserRole: getUserRoleStr,
  getPersonaForContext,
  getContextualWelcome,
  getQuickActions,
  generateSessionId,
};