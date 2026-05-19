const integrations = require('../llm/integrationManager');
const { getToolDefinitions, executeTool, formatToolResultToMessage } = require('../llm/tools');
const { executeTool: execExtTool, getToolDefinitions: getExtToolDefs, loadTools: loadExtTools } = require('../tools');
const { extractContent } = require('../llm');
const { buildSystemPrompt } = require('../persona/config');
const { compressForLLM, compressContext } = require('../llm/tokenCompressor');
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
const { pool } = require('../db');
const agentModule = require('../agent');
const smartFollowUp = require('../onboarding/followup');

const MAX_TOOL_ROUNDS = 5;
const SILENCE_TTL = 24 * 60 * 60 * 1000;

const silenceCache = new Map();
const BOT_ID_COL_MAP = { whatsapp: 'whatsapp_id', telegram: 'telegram_id' };
const getBotCol = (uid) => BOT_ID_COL_MAP[uid.startsWith('wa_') ? 'whatsapp' : 'telegram'];

async function setSilence(sessionId, count = 0) {
  if (count <= 0) {
    silenceCache.delete(sessionId);
    try { await pool.execute('UPDATE sessions SET silence_count = 0, silence_infinite = 0 WHERE id = ?', [sessionId]); } catch (e) { console.error('[Silence] setSilence clear error:', e.message); }
    return { silenced: false, remaining: 0 };
  }
  const infinite = count >= 999999;
  silenceCache.set(sessionId, { count: infinite ? 999999 : count, ts: Date.now() });
  try { await pool.execute('UPDATE sessions SET silence_count = ?, silence_infinite = ? WHERE id = ?', [infinite ? 0 : count, infinite ? 1 : 0, sessionId]); } catch (e) { console.error('[Silence] setSilence error:', e.message); }
  return { silenced: true, remaining: count };
}

async function decSilence(sessionId) {
  let cached = silenceCache.get(sessionId);
  if (cached && (Date.now() - cached.ts) > SILENCE_TTL) { silenceCache.delete(sessionId); cached = undefined; }
  let remaining = cached?.count;
  if (remaining === undefined) {
    try {
      const [rows] = await pool.execute('SELECT silence_count, silence_infinite FROM sessions WHERE id = ?', [sessionId]);
      if (rows.length > 0) {
        if (rows[0].silence_infinite) { silenceCache.set(sessionId, 999999); return true; }
        remaining = rows[0].silence_count;
        if (remaining > 0) silenceCache.set(sessionId, remaining);
      }
    } catch {}
    if (remaining === undefined) return false;
  }
  if (!remaining || remaining <= 0) { silenceCache.delete(sessionId); return false; }
  if (remaining >= 999999) return true;
  if (remaining <= 1) {
    silenceCache.delete(sessionId);
    try { await pool.execute('UPDATE sessions SET silence_count = 0, silence_infinite = 0 WHERE id = ?', [sessionId]); } catch (e) { console.error('[Silence] decSilence clear error:', e.message); }
    return false;
  }
  silenceCache.set(sessionId, remaining - 1);
  try { await pool.execute('UPDATE sessions SET silence_count = ? WHERE id = ?', [remaining - 1, sessionId]); } catch (e) { console.error('[Silence] decSilence update error:', e.message); }
  return true;
}

async function getSilenceStatus(sessionId) {
  let remaining = silenceCache.get(sessionId);
  if (remaining === undefined) {
    try {
      const [rows] = await pool.execute('SELECT silence_count, silence_infinite FROM sessions WHERE id = ?', [sessionId]);
      if (rows.length > 0) {
        if (rows[0].silence_infinite) remaining = 999999;
        else remaining = rows[0].silence_count;
        if (remaining > 0) silenceCache.set(sessionId, remaining);
      }
    } catch (e) { console.error('[Silence] getSilenceStatus error:', e.message); }
  }
  return { silenced: !!remaining && remaining > 0, remaining: remaining || 0 };
}

async function getPersonaForContext(personaId, sessionId, userId) {
  if (personaId) {
    const p = await personaManager.getPersona(personaId);
    if (p) return p;
  }
  if (sessionId) {
    const sessionPersona = await personaManager.getSessionPersona(sessionId);
    if (sessionPersona) return sessionPersona;
  }
  if (userId) {
    const userPersona = await personaManager.getUserPersona(userId);
    if (userPersona) return userPersona;
  }
  return getActivePersona();
}

const crypto = require('crypto');
function generateSessionId() { return 'sid_' + crypto.randomBytes(8).toString('hex'); }

function stripInlineToolCalls(text) {
  if (!text) return text;
  let cleaned = text.replace(/```json[\s\S]*?```/g, '');
  for (let i = 0; i < 5; i++) {
    const before = cleaned;
    cleaned = cleaned.replace(/\{[^{}]*?"function"[^{}]*?\{[^{}]*?\}[^{}]*?\}/g, '');
    cleaned = cleaned.replace(/\{[^{}]*?"tool_calls"[^{}]*?\[[^\]]*?\][^{}]*?\}/g, '');
    if (cleaned === before) break;
  }
  cleaned = cleaned.replace(/["']?(get_dashboard|manage_tasks|create_persona|list_personas|manage_contacts|manage_calendar|manage_goals|manage_automations|manage_org_memory|manage_xp|manage_progress|get_cognitive_state|human_override|get_suggestions|get_history|update_settings|manage_users|send_email_to_user|manage_blueprints|use_external_tool|list_external_tools|add_knowledge_source|create_skill|invoke_skill|list_skills|manage_conversation_stages)["']?\s*[:=(]/gi, ' ');
  cleaned = cleaned.replace(/[\s]*\{[\s]*\}[\s]*/g, ' ');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  if (cleaned.length < 10 && text.length >= 10) return text;
  return cleaned;
}

async function processMessage({ message, sessionId, userId, language, isGroup, source, userName, personaId }) {
  const lang = SUPPORTED_LANGS.includes(language) ? language : DEFAULT_LANG;
  let uid = userId;
  if (!uid) {
    console.warn('[ChatEngine] WARNING: No userId provided — requires auth for web, bot users always have ID');
    uid = 'user_default';
  }
  const sid = sessionId || generateSessionId();

  if (uid && uid !== 'user_default' && !isGroup && (uid.startsWith('wa_') || uid.startsWith('tg_'))) {
    try {
      const { findLinkedUser } = require('../auth');
      const linkedUser = await findLinkedUser(uid, uid.startsWith('wa_') ? 'whatsapp' : 'telegram');
      if (linkedUser) {
        console.log(`[ChatEngine] Linked bot user ${uid} -> web user ${linkedUser.id}`);
        uid = linkedUser.id;
      }
    } catch (err) { console.error('[ChatEngine] Link lookup error:', err.message); }
  }

  if (message && message.trim().startsWith('/')) {
    try {
      const cmdResult = await handleChatCommand(message.trim(), uid, source || 'web', sid, personaId);
      if (cmdResult) {
        console.log(`[ChatEngine] Command handled: ${message.trim().split(/\s+/)[0]}`);
        if (typeof cmdResult === 'object' && cmdResult.interactiveOptions) {
          return { response: cmdResult.response || '', sessionId: sid, sources: [], language: lang, interactiveOptions: cmdResult.interactiveOptions };
        }
        const responseText = typeof cmdResult === 'string' ? cmdResult : (cmdResult.response || cmdResult.text || cmdResult.message || JSON.stringify(cmdResult));
        return { response: responseText, sessionId: sid, sources: [], language: lang };
      }
    } catch (err) {
      console.error('[ChatEngine] Command error:', err.message, err.stack);
    }
  }

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
    if (!isGroup && role !== 'admin' && role !== 'premium') {
      const nextStep = await onboarding.shouldOnboard(uid, personaId);
      if (nextStep) {
        if (message && message.trim()) {
          const parsedAnswer = onboarding.parseOnboardingAnswer(nextStep, message);
          const answerResult = await onboarding.saveOnboardingAnswer(uid, nextStep.step_key, parsedAnswer, personaId);
          if (answerResult) {
            if (answerResult.done) {
              // Onboarding complete — fall through to normal chat with user's message
            } else if (answerResult.nextStep) {
              const nextQuestion = await onboarding.formatOnboardingQuestion(answerResult.nextStep, lang);
              const step = answerResult.nextStep;
              const choices = step.choices || step.choices_en;
              const interactiveOptions = (choices && choices.length > 0 && step.field_type !== 'text' && step.field_type !== 'email')
                ? { type: step.field_type === 'multichoice' ? 'list' : 'buttons', items: choices.slice(0, step.field_type === 'multichoice' ? 10 : 3).map((c, i) => ({ id: `onboarding:${step.step_key}:${c}`, text: c, label: c })), sections: step.field_type === 'multichoice' ? [{ title: step.icon ? `${step.icon} ${step.question || ''}` : 'Opções', rows: choices.slice(0, 10).map((c, i) => ({ id: `onboarding:${step.step_key}:${c}`, title: c })) }] : undefined }
                : undefined;
              return {
                response: nextQuestion,
                sessionId: sid,
                sources: [],
                language: lang,
                onboarding: true,
                onboardingDone: false,
                onboardingStep: answerResult.nextStep.step_key,
                ...(interactiveOptions ? { interactiveOptions } : {}),
              };
            }
          }
        } else {
          const onboardMsg = await onboarding.formatOnboardingQuestion(nextStep, lang);
          const choices2 = nextStep.choices || nextStep.choices_en;
          const interactiveOptions2 = (choices2 && choices2.length > 0 && nextStep.field_type !== 'text' && nextStep.field_type !== 'email')
            ? { type: nextStep.field_type === 'multichoice' ? 'list' : 'buttons', items: choices2.slice(0, nextStep.field_type === 'multichoice' ? 10 : 3).map((c, i) => ({ id: `onboarding:${nextStep.step_key}:${c}`, text: c, label: c })), sections: nextStep.field_type === 'multichoice' ? [{ title: nextStep.icon ? `${nextStep.icon} ${nextStep.question || ''}` : 'Opções', rows: choices2.slice(0, 10).map((c, i) => ({ id: `onboarding:${nextStep.step_key}:${c}`, title: c })) }] : undefined }
            : undefined;
          return {
            response: onboardMsg,
            sessionId: sid,
            sources: [],
            language: lang,
            onboarding: true,
            onboardingStep: nextStep.step_key,
            ...(interactiveOptions2 ? { interactiveOptions: interactiveOptions2 } : {}),
          };
        }
      }
    }
  }

  await updateProfileFromMessage(uid, message);
  const userContext = extractContextFromMessage(message);
  await updateSessionContext(sid, userContext);

  const override = await overrideModule.getOverride(sid);
  const overrideType = override?.is_active ? override.override_type : null;
  if (overrideType === 'full') {
    if (override.human_message) {
      await addMessage(sid, 'assistant', override.human_message);
      return { response: override.human_message, sessionId: sid, sources: [], language: lang, humanOverride: true, overrideType: 'full' };
    }
    return { response: 'Um atendente humano está cuidando desta conversa. Aguarde um momento.', sessionId: sid, sources: [], language: lang, humanOverride: true, overrideType: 'full' };
  }

  const silence = await getSilenceStatus(sid);
  if (silence.silenced) {
    const stillSilenced = await decSilence(sid);
    if (stillSilenced) {
      const status = await getSilenceStatus(sid);
      const remain = status.remaining;
      return { response: `🔇 Modo silêncio ativo. Restam ${remain} mensagem(ões) em silêncio. Use /silence off para desativar.`, sessionId: sid, sources: [], language: lang, silenced: true };
    }
    return { response: '🔇 Modo silêncio encerrado. Estou de volta!', sessionId: sid, sources: [], language: lang, silenced: false };
  }

  const persona = await getPersonaForContext(personaId, sid, uid);
  const numVerses = persona?.id === 'jesus' ? 8 : 2;
  const personaSources = persona && persona.knowledgeSources && persona.knowledgeSources.length > 0
    ? persona.knowledgeSources
    : null;
  const noKnowledgeSearch = persona && persona.knowledgeSources !== null && persona.knowledgeSources.length === 0;

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

   if (noKnowledgeSearch) {
     relevantVerses = [];
     contextStr = '';
   } else if (useContextAware && cognitiveState) {
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

   let extraContext = [goalContext, orgContext, stageContext, xpContext, progressContext, cognitiveContext].filter(Boolean).join('\n\n');

  let businessStr = '';
  try {
    const businessModule = require('../business');
    const businessConfig = await businessModule.getBusinessConfig(persona.id);
    if (businessConfig && businessConfig.name) {
       businessStr = businessModule.formatBusinessContext(businessConfig);
     }
   } catch (err) { console.error('[ChatEngine] business context error:', err.message); }

    let systemPrompt = buildSystemPrompt(persona, lang, contextStr, memoryStr, profileStr, displayName, isGroup, persona.knowledgeSources, businessStr);
  if (extraContext) {
    systemPrompt += '\n\n' + extraContext;
  }

    console.log(`[ChatEngine] persona=${persona.id}, sources=${personaSources ? personaSources.join(',') : (noKnowledgeSearch ? 'none' : 'bible')}, contextLen=${contextStr.length}, promptStart=${systemPrompt.substring(0, 120)}`);

  const toolsEnabled = await getSetting('tools_enabled', 'true') === 'true';
  const historyLimit = parseInt(await getSetting('history_limit', '10')) || 10;
  const history = await getHistoryForLLM(sid, historyLimit);

  console.log(`[ChatEngine] historyLen=${history.length}, firstMsg=${history.length > 0 ? history[0].role + ':' + history[0].content?.substring(0, 50) : 'none'}`);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  if (relevantVerses && relevantVerses.length > 0) {
    const isBiblical = !noKnowledgeSearch && (personaSources === null || (persona.knowledgeSources && persona.knowledgeSources.some(s => s.includes('bible') || s.includes('biblia'))));
    const contextLabel = isBiblical ? 'CONTEXTO BÍBLICO FORNECIDO - NÃO BUSCAR, USAR DIRETAMENTE' : 'CONHECIMENTO FORNECIDO - USAR DIRETAMENTE';
    const versesText = relevantVerses.slice(0, 8).map(v => `${v.reference}: "${v.text}"`).join('\n');
    const instructText = isBiblical ? 'Responda DIRETAMENTE citando os versículos acima. NÃO diga que vai buscar.' : 'Responda usando as informações acima diretamente.';
    messages.push({ role: 'user', content: `[${contextLabel}]:\n${versesText}\n\n${instructText}\n\nPergunta do usuário: ${message}` });
  } else {
    messages.push({ role: 'user', content: message });
  }

  const sensitiveCmd = /^\s*\/(cadastrar|entrar|register|login|criarconta)\s/i.test(message);
  const safeMessage = sensitiveCmd ? message.replace(/(\S+@\S+)|(\b\S{6,}\b)/g, (m) => m.includes('@') ? m : '••••••') : message;

  await addMessage(sid, 'user', safeMessage);

  if (uid && userId) {
    session.userId = uid;
    await saveSession(session);
  }

  let fullResponse = '';
  let toolRounds = 0;
  let lastLLMResult = null;
  let sources = relevantVerses.slice(0, 4).map(v => ({
    reference: v.reference,
    text: v.text.substring(0, 120) + (v.text.length > 120 ? '...' : ''),
    ...(v.image_url ? { image_url: v.image_url } : {}),
    ...(v.url ? { url: v.url } : {}),
    ...(v.sourceId ? { sourceId: v.sourceId } : {}),
    ...(v.type ? { type: v.type } : {}),
  }));

  const maxTokens = 1024;
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
    const metaPersonaOnlyTools = ['create_persona', 'list_personas', 'create_skill', 'invoke_skill', 'list_skills', 'add_knowledge_source', 'manage_tasks', 'manage_calendar', 'manage_contacts', 'manage_automations', 'manage_goals', 'manage_conversation_stages', 'manage_org_memory', 'manage_xp', 'manage_progress', 'get_cognitive_state', 'human_override', 'get_suggestions', 'get_dashboard', 'get_history', 'update_settings', 'manage_users', 'send_email_to_user', 'manage_blueprints', 'use_external_tool', 'list_external_tools', 'manage_quizzes', 'b2b_prospect', 'cnpj_lookup', 'lead_scoring', 'site_scraper', 'google_places_search'];

    let tools;
  const hasContextVerses = relevantVerses && relevantVerses.length > 0;
    if (isMetaPersona) {
      tools = allTools;
    } else if (isAdmin) {
      tools = allTools;
    } else {
      tools = toolsEnabled ? allTools.filter(t => !metaPersonaOnlyTools.includes(t.function.name)) : null;
    }
    if ((hasContextVerses || noKnowledgeSearch) && tools) {
      tools = tools.filter(t => t.function?.name !== 'bible_lookup');
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
    lastLLMResult = result;

    if (!result) {
      console.error('[ChatEngine] LLM returned null result');
      toolRounds++;
      continue;
    }

    const toolCalls = result.tool_calls;
    let content = extractContent(result) || '';
    content = stripInlineToolCalls(content);
    const thinkingContent = result?.message?.thinking || result?.choices?.[0]?.message?.reasoning_content || result?.choices?.[0]?.message?.thinking || result?.message?.reasoning_content || '';
    console.log(`[ChatEngine] LLM raw: contentLen=${(result?.message?.content||'').length}, thinkingLen=${thinkingContent.length}, hasToolCalls=${!!(toolCalls && toolCalls.length)}, extractedLen=${content.length}`);
    if (!content) {
      console.log(`[ChatEngine] CONTENT EMPTY — content field: "${(result?.message?.content||'').substring(0, 200)}"`);
      console.log(`[ChatEngine] CONTENT EMPTY — thinking first 300: ${thinkingContent.substring(0, 300)}`);
    }

    if (!toolCalls || toolCalls.length === 0) {
      if (!content || content.trim().length < 5) {
        if (thinkingContent.trim().length > 20) {
          console.log(`[ChatEngine] Empty content with thinking (${thinkingContent.length} chars). Retrying with direct prompt — never serving thinking to user.`);
        }
      }
      if (!content || content.trim().length < 5) {
        const personaName = persona.name || persona.id;
        const isMeta = persona.id === 'meta-persona';
        const retryPrompt = lang === 'en-US'
          ? `You MUST provide your complete answer NOW in natural language. Do NOT output JSON, function calls, or tool syntax. Just talk to the user as ${personaName}. Answer their question directly in plain text.`
          : lang === 'es-ES'
          ? `Debes dar tu respuesta COMPLETA AHORA en lenguaje natural. NO generes JSON, llamadas de función ni sintaxis de tools. Habla con el usuario como ${personaName}. Responde directamente en texto simple.`
          : `Você DEVE dar sua resposta completa AGORA em linguagem natural. NÃO gere JSON, chamadas de função ou sintaxe de tools. Apenas converse com o usuário como ${personaName}. Responda diretamente em texto simples.`;
        console.log('[ChatEngine] Empty response, retrying with direct instruction...');
        messages.push({ role: 'user', content: retryPrompt });
        try {
          const retryResult = await integrations.callLLM(messages, {
            userId: uid,
            stream: false,
            temperature: Math.max(0.3, temperature - 0.3),
            numPredict: maxTokens,
            retries: 1,
            timeout: parseInt(await getSetting('llm_timeout', '30000')) || 30000,
            tools: null,
          });
          const retryContent = extractContent(retryResult) || '';
          const retryThinking = retryResult?.message?.thinking || retryResult?.choices?.[0]?.message?.reasoning_content || retryResult?.choices?.[0]?.message?.thinking || retryResult?.message?.reasoning_content || '';
          console.log(`[ChatEngine] Retry result: contentLen=${(retryResult?.message?.content||'').length}, thinkingLen=${retryThinking.length}, extractedLen=${retryContent.length}`);
          if (retryContent.trim().length >= 10) {
            content = retryContent;
          } else {
            console.log(`[ChatEngine] Retry also empty — using fallback. NOT serving thinking content.`);
          }
        } catch (retryErr) {
          console.error('[ChatEngine] Retry failed:', retryErr.message);
        }
      }
      fullResponse = content;
      break;
    }

    messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });
    console.log(`[ChatEngine] Executing ${toolCalls.length} tool call(s): ${toolCalls.map(tc => tc.function?.name || tc.name).join(', ')}`);

    for (let ti = 0; ti < toolCalls.length; ti++) {
      const tc = toolCalls[ti];
      const fnName = tc.function?.name || tc.name;
      let fnArgs = {};
      try {
        fnArgs = tc.function?.arguments ? (typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments) : {};
        if (!fnArgs || typeof fnArgs !== 'object') fnArgs = {};
      } catch (e) {
        console.warn(`[Engine] Invalid JSON in tool args for ${fnName}:`, e.message);
        fnArgs = {};
      }
      let toolResult;
      const isExternalTool = fnName === 'use_external_tool' || fnName === 'list_external_tools';
      if (isExternalTool) {
        toolResult = await execExtTool(fnName, fnArgs, { userId: uid, lang });
      } else {
        toolResult = await executeTool(fnName, fnArgs, { userId: uid, lang, isAdmin: isAdmin || isMetaPersona });
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id || `call_${ti}`,
        name: fnName,
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
      });

      if (fnName === 'bible_lookup' && toolResult.verses) {
        sources = toolResult.verses.slice(0, 4).map(v => ({
          reference: v.reference,
          text: v.text.substring(0, 120) + (v.text.length > 120 ? '...' : ''),
          ...(v.image_url ? { image_url: v.image_url } : {}),
          ...(v.url ? { url: v.url } : {}),
          ...(v.sourceId ? { sourceId: v.sourceId } : {}),
          ...(v.type ? { type: v.type } : {}),
        }));
      }
    }

    if (toolCalls && toolCalls.length > 0) {
      messages.push({ role: 'user', content: 'Now provide your complete answer to the user based on the tool results above. Write in natural language, do NOT include JSON or tool call syntax. Respond in the same language the user is using.' });
    }

    toolRounds++;
  }

  if (toolRounds >= MAX_TOOL_ROUNDS) {
    fullResponse = messages.filter(m => m.role === 'assistant').pop()?.content || fullResponse;
  }

  if (!fullResponse || fullResponse.trim().length < 5) {
    const lastThinking = lastLLMResult?.message?.thinking || lastLLMResult?.choices?.[0]?.message?.reasoning_content || lastLLMResult?.choices?.[0]?.message?.thinking || lastLLMResult?.message?.reasoning_content || '';
    if (lastThinking.trim().length > 20) {
      console.log(`[ChatEngine] Empty final response with thinking (${lastThinking.length} chars). NOT serving thinking content — using fallback instead.`);
    }
  }

  if (!fullResponse || fullResponse.trim().length < 5) {
    fullResponse = persona.cjkFallback ? (persona.cjkFallback[lang] || persona.cjkFallback['pt-BR'] || '') : '';
    if (!fullResponse) {
      const llmError = persona.llmError || (typeof persona.identity === 'object' ? persona.identity?.llmError : null);
      if (llmError) {
        fullResponse = typeof llmError === 'string' ? llmError : (llmError[lang] || llmError['pt-BR'] || Object.values(llmError)[0] || '');
      }
      if (!fullResponse) {
        const fallbacks = {
          'pt-BR': 'Não consegui formular uma resposta agora. Por favor, tente novamente.',
          'en-US': 'I could not formulate a response right now. Please try again.',
          'es-ES': 'No pude formular una respuesta ahora. Por favor, intente de nuevo.',
        };
        fullResponse = fallbacks[lang] || fallbacks['pt-BR'];
      }
    }
  }

  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(fullResponse);
  if (hasCJK) {
    const cjkChars = (fullResponse.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
    const totalChars = fullResponse.replace(/\s/g, '').length;
    const cjkRatio = cjkChars / (totalChars || 1);
    if (cjkRatio > 0.3) {
      console.log(`[ChatEngine] Response is ${Math.round(cjkRatio * 100)}% CJK (${cjkChars}/${totalChars} chars) — replacing with fallback`);
      fullResponse = t('cjkFallback', lang);
    } else {
      console.log(`[ChatEngine] Response has ${cjkChars} CJK chars in ${totalChars} total (${Math.round(cjkRatio * 100)}%) — keeping response, stripping CJK`);
      fullResponse = fullResponse.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, '');
    }
  }

  if (relevantVerses && relevantVerses.length > 0) {
    const searchPhrases = [
      /\bdeixe-me buscar\b/gi, /\bvou procurar\b/gi, /\bvou buscar\b/gi,
      /\bespere enquanto\b/gi, /\bperdoe-me pela demora\b/gi,
      /\blet me search\b/gi, /\blet me look\b/gi, /\bi will search\b/gi,
      /\bdéjame buscar\b/gi, /\bvoy a buscar\b/gi,
      /\bnão encontrei\b/gi, /\bno encuentro\b/gi,
    ];
    const original = fullResponse;
    for (const phrase of searchPhrases) {
      fullResponse = fullResponse.replace(phrase, '');
    }
    fullResponse = fullResponse.replace(/\s{2,}/g, ' ').trim();
    if (fullResponse.length < 20 && original.length >= 20) {
      fullResponse = original;
    }
  }

  await addMessage(sid, 'assistant', fullResponse);

  realtime.emitNewMessage(sid, { role: 'assistant', content: fullResponse, personaId: persona.id });

  const updatedSession = await getSession(sid);
  const summaryEvery = parseInt(await getSetting('summary_every', '10')) || 10;
  if (updatedSession.messages.length % summaryEvery === 0) {
    generateSummary(sid).catch(() => {});
  }

  const profileEvery = parseInt(await getSetting('profile_summary_every', '15')) || 15;
  if (updatedSession.messages.length % profileEvery === 0) {
    generateProfileSummary(uid).catch(() => {});
  }

  surveyEngine.autoCreateFollowUp(uid, sid).catch(() => {});

  smartFollowUp.shouldCreateFollowUp(uid, persona.id, sid).catch(() => {});

  try {
    const triggered = await agentModule.checkAndRunAutomations(sid, uid, message);
    if (triggered.length > 0) {
      const msgAutomation = triggered.find(t => t.action_type === 'message' && t.result?.sent);
      if (msgAutomation) {
        addMessage(sid, 'assistant', msgAutomation.result.message).catch(() => {});
        realtime.emitNewMessage(sid, { role: 'assistant', content: msgAutomation.result.message, personaId: persona.id });
      }
      const taskAutomation = triggered.find(t => t.action_type === 'create_task' && t.result?.created);
      if (taskAutomation) {
        console.log(`[Automation] Task created: ${taskAutomation.result.task_id}`);
      }
    }
  } catch (err) { console.error('[Automation] Error:', err.message); }

  try {
    const xpResult = await gamificationModule.awardMessageXp(uid, persona.id);
    const newBadges = await gamificationModule.checkAndAwardBadges(uid, persona.id);
    if (xpResult.xpGained > 0 || xpResult.leveledUp) {
      realtime.emitXpUpdate(uid, await gamificationModule.getXp(uid, persona.id));
    }
    if (newBadges.length > 0) {
      for (const badge of newBadges) {
        realtime.emitBadgeEarned(uid, badge);
      }
    }
  } catch (err) { console.error('[ChatEngine] message XP error:', err.message); }

  if (xpData && xpData.streak > 1 && xpData.last_activity) {
    const lastActivity = new Date(xpData.last_activity);
    const daysSince = Math.floor((Date.now() - lastActivity) / (1000 * 60 * 60 * 24));
    if (daysSince >= 2) {
      smartFollowUp.checkStreakFollowUp(uid, persona.id).catch(() => {});
    }
  }

  const result = {
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
  if (overrideType === 'approval') result.needsApproval = true;
  if (overrideType === 'observation') result.observed = true;
  return result;
}

async function getContextualWelcome(userId, personaId, lang) {
  return smartFollowUp.getContextualWelcome(userId, personaId, lang);
}

async function getQuickActions(personaId, userId) {
  const { getProfile } = require('../memory/profile');
  const profile = userId ? await getProfile(userId).catch(() => null) : null;
  return smartFollowUp.getQuickActions(personaId, profile);
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

async function handleChatCommand(text, userId, source, sessionId, personaIdParam) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');
  const isAdmin = await isUserAdmin(userId);
  const uid = userId || 'unknown';

  const persona = await getPersonaForContext(personaIdParam, sessionId, uid);

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
    case '/stop': {
      return '🛑 Geração interrompida. Use /silence <N> para silenciar por N mensagens ou /silence off para reativar.';
    }

    case '/vincular':
    case '/link': {
      if (!uid.startsWith('wa_') && !uid.startsWith('tg_')) {
        return '🔗 Este comando é para uso no WhatsApp ou Telegram.\n\nNo site, acesse Configurações → Vincular Conta para gerar um código.';
      }
      const linkCode = parts[1];
      if (!linkCode) {
        const { findLinkedUser } = require('../auth');
        const linked = await findLinkedUser(uid, uid.startsWith('wa_') ? 'whatsapp' : 'telegram');
        if (linked) {
          return `✅ Sua conta já está vinculada a ${linked.email} (${linked.name || 'sem nome'}).\n\nUse /desvincular para desvincular.`;
        }
        return '🔗 Para vincular sua conta:\n\n1. Acesse o site e faça login\n2. Clique em Configurações → Vincular Conta\n3. Copie o código de 6 dígitos\n4. Envie /vincular SEUCODIGO aqui\n\nExemplo: /vincular ABC123';
      }
      try {
        const { linkAccount } = require('../auth');
        const result = await linkAccount(linkCode.toUpperCase(), uid, uid.startsWith('wa_') ? 'whatsapp' : 'telegram');
        return `✅ Conta vinculada com sucesso! Agora suas conversas aqui estão conectadas à sua conta web.\n\nSeus dados, histórico e perfil foram unificados.`;
      } catch (err) {
        return `❌ Erro ao vincular: ${err.message}`;
      }
    }

    case '/desvincular':
    case '/unlink': {
      if (!uid.startsWith('wa_') && !uid.startsWith('tg_')) {
        return '🔗 Este comando é para uso no WhatsApp ou Telegram.';
      }
      try {
        const { findLinkedUser, pool } = require('../auth');
        const linked = await findLinkedUser(uid, uid.startsWith('wa_') ? 'whatsapp' : 'telegram');
        if (!linked) {
          return '❌ Sua conta não está vinculada a nenhuma conta web.';
        }
        const col = getBotCol(uid);
        await pool.execute(`UPDATE users SET ${col} = NULL WHERE id = ?`, [linked.id]);
        return '✅ Conta desvinculada. Suas conversas agora usam uma conta separada do bot.';
      } catch (err) {
        return `❌ Erro ao desvincular: ${err.message}`;
      }
    }

    case '/cadastrar':
    case '/register':
    case '/criarconta': {
      const emailReg = parts[1];
      const passwordReg = parts[2];
      const nameReg = parts.slice(3).join(' ') || userName || uid.replace(/^(wa_|tg_)/, '');
      if (!emailReg || !passwordReg) {
        return '📝 Para criar sua conta web e poder acessar pelo site:\n\n/cadastrar email senha [nome]\n\nExemplo:\n/cadastrar joao@email.com Minhasenha1! João\n\n• Senha: mínimo 8 caracteres, 1 maiúscula, 1 número, 1 especial\n• Já tem conta? Use /entrar';
      }
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(emailReg)) {
        return '❌ Email inválido. Use o formato: nome@dominio.com';
      }
      if (passwordReg.length < 8) {
        return '❌ A senha deve ter no mínimo 8 caracteres.';
      }
      if (!/[A-Z]/.test(passwordReg)) {
        return '❌ A senha deve conter pelo menos uma letra maiúscula.';
      }
      if (!/[0-9]/.test(passwordReg)) {
        return '❌ A senha deve conter pelo menos um número.';
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(passwordReg)) {
        return '❌ A senha deve conter pelo menos um caractere especial (!@#$% etc).';
      }
      try {
        const { register, pool: authPool } = require('../auth');
        const bcryptjs = require('bcryptjs');
        const existingBotUser = uid.startsWith('wa_') || uid.startsWith('tg_');
        let userId;
        try {
          const user = await register(emailReg, passwordReg, nameReg);
          userId = user.id;
        } catch (regErr) {
          if (regErr.message.includes('já cadastrado') || regErr.message.includes('already')) {
            return `❌ Este email já está cadastrado.\n\nSe é sua conta, use /entrar ${emailReg} suaSenha`;
          }
          throw regErr;
        }
        if (existingBotUser) {
          const col = getBotCol(uid);
          await authPool.execute(`UPDATE users SET ${col} = ? WHERE id = ?`, [uid, userId]);
          const [delRows] = await authPool.execute('SELECT id FROM users WHERE id = ?', [uid]);
          if (delRows.length > 0 && uid !== userId) {
            await authPool.execute('DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)', [uid]).catch(() => {});
            await authPool.execute('DELETE FROM sessions WHERE user_id = ?', [uid]).catch(() => {});
            await authPool.execute('DELETE FROM users WHERE id = ?', [uid]).catch(() => {});
          }
        }
        return `✅ Conta criada com sucesso!\n\n📧 ${emailReg}\n👤 ${nameReg}\n\n🔗 Sua conta deste dispositivo já está vinculada.\n\nAgora você pode acessar pelo site:\n${process.env.SERVER_URL || 'http://localhost:3000'}\n\nUse o mesmo email e senha para entrar no site.`;
      } catch (err) {
        return `❌ Erro ao criar conta: ${err.message}`;
      }
    }

    case '/entrar':
    case '/login': {
      const emailLogin = parts[1];
      const passwordLogin = parts[2];
      if (!emailLogin || !passwordLogin) {
        return '🔑 Para fazer login com sua conta web:\n\n/entrar email senha\n\nExemplo:\n/entrar joao@email.com minhasenha123\n\nNão tem conta ainda? Use /cadastrar';
      }
      try {
        const { login, generateToken: genToken, pool: authPool } = require('../auth');
        const user = await login(emailLogin, passwordLogin);
        const fullUser = await getUserWithRole(user.id);
        if ((uid.startsWith('wa_') || uid.startsWith('tg_'))) {
          const col = getBotCol(uid);
          await authPool.execute(`UPDATE users SET ${col} = ? WHERE id = ?`, [uid, fullUser.id]);
          const [delRows] = await authPool.execute('SELECT id FROM users WHERE id = ?', [uid]);
          if (delRows.length > 0 && uid !== fullUser.id) {
            await authPool.execute('DELETE FROM users WHERE id = ?', [uid]);
          }
          return `✅ Login realizado! Conta vinculada.\n\n📧 ${fullUser.email}\n👤 ${fullUser.name}\n\nSeus dados daqui estão sincronizados com o site.`;
        }
        return `✅ Login realizado!\n\n📧 ${fullUser.email}\n👤 ${fullUser.name}\n👑 ${fullUser.role}`;
      } catch (err) {
        return `❌ Erro no login: ${err.message}`;
      }
    }

    case '/silence':
    case '/silencio':
    case '/mutar':
    case '/mute': {
      const silenceArg = parts[1]?.toLowerCase();
      const silenceStatus = await getSilenceStatus(sid);
      if (!silenceArg || silenceArg === 'status') {
        if (silenceStatus.silenced) {
          return `🔇 Modo silêncio ATIVO. Restam ${silenceStatus.remaining} mensagem(ões). Use /silence off para desativar.`;
        }
        return '🔇 Modo silêncio DESATIVADO. Use:\n• /silence <N> — silenciar por N mensagens\n• /silence off — desativar silêncio\n• /silence infinite — silenciar indefinidamente';
      }
      if (silenceArg === 'off' || silenceArg === 'desativar' || silenceArg === 'stop') {
        await setSilence(sid, 0);
        return '🔊 Silêncio desativado! Estou de volta à conversa.';
      }
      if (silenceArg === 'infinite' || silenceArg === 'infinito' || silenceArg === 'sempre') {
        await setSilence(sid, 999999);
        return '🔇 Modo silêncio INFINITO ativado. A persona não vai responder até você usar /silence off.';
      }
      const count = parseInt(silenceArg);
      if (isNaN(count) || count < 1) {
        return '❌ Use: /silence <número> (ex: /silence 5), /silence infinite, ou /silence off';
      }
      await setSilence(sid, count);
      return `🔇 Modo silêncio ativado por ${count} mensagem(ões). A persona não vai responder. Use /silence off para desativar.`;
    }

    case '/stats': {
      const [sessionRows] = await require('../db').pool.execute('SELECT COUNT(*) as total FROM sessions WHERE user_id = ?', [uid]);
      const [msgRows] = await require('../db').pool.execute(
        `SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ?`,
        [uid]
      );
      return {
        response: `📊 Suas estatísticas:\n• Sessões: ${sessionRows[0].total}\n• Mensagens: ${msgRows[0].total}`,
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/myprofile', text: '📋 Perfil' },
            { id: 'action:/xp', text: '🎮 XP' },
            { id: 'action:/cognitive', text: '🧠 Cognitivo' },
          ],
        },
      };
    }

    case '/myprofile':
    case '/perfil': {
      const profile = await getProfile(uid);
      const lines = ['📋 Seu perfil:'];
      if (profile.name) lines.push(`• Nome: ${profile.name}`);
      if (profile.topics?.length) lines.push(`• Temas: ${profile.topics.join(', ')}`);
      if (profile.emotions?.length) lines.push(`• Emoções: ${profile.emotions.join(', ')}`);
      if (profile.spiritualJourney) lines.push(`• Jornada: ${profile.spiritualJourney}`);
      try {
        const { pool: authPool } = require('../auth');
        const [userRows] = await authPool.execute('SELECT email, role, whatsapp_id, telegram_id FROM users WHERE id = ?', [uid]);
        if (userRows.length > 0) {
          const u = userRows[0];
          lines.push('');
          lines.push(`📧 Email: ${u.email}`);
          lines.push(`👑 Cargo: ${u.role}`);
          if (u.whatsapp_id) lines.push('🔗 WhatsApp: vinculado');
          if (u.telegram_id) lines.push('🔗 Telegram: vinculado');
          if (!u.whatsapp_id && !u.telegram_id && !u.email.includes('.bot')) {
            lines.push('📱 Dispositivo não vinculado — use /vincular');
          }
        }
      } catch {}
      return lines.join('\n') || 'Perfil vazio ainda. Converse mais comigo!';
    }

    case '/personas':
    case '/listarpersonas': {
      const allPersonas = await metaRag.listAvailablePersonas();
      const cur = persona;
      const lines = allPersonas.map(p => {
        const tag = cur && p.id === cur.id ? ' ◀' : '';
        const meta = p.id === 'meta-persona' ? '🧙 ' : '';
        return `${p.isActive ? '✅' : '❌'} ${meta}${p.name} → /persona ${p.id}${tag}`;
      });
      return `🎭 Personas (${allPersonas.length}):\n${lines.join('\n')}\n\nUse /persona <id> para trocar.`;
    }

    case '/persona':
    case '/personagem': {
      if (!args) {
        const personas = await metaRag.listAvailablePersonas();
        const currentPersona = persona;
        const lines = personas.map(p => {
          const isCurrent = currentPersona && p.id === currentPersona.id ? ' ◀ atual' : '';
          const status = p.isActive ? '✅' : '❌';
          const voice = p.ttsVoice ? `🔊${p.ttsVoice}` : '';
          const lang = p.ttsLang === 'p' ? '🇧🇷' : p.ttsLang === 'a' ? '🇺🇸' : p.ttsLang === 'e' ? '🇪🇸' : '';
          const meta = p.id === 'meta-persona' ? ' 🧙' : '';
          return `${status} ${p.name}${meta} (${p.id}) ${voice}${lang}${isCurrent}`;
        });
        const metaLine = personas.some(p => p.id === 'meta-persona') ? '' : '\n💡 Dica: /meta para ativar a meta-persona';
        const textResponse = `🎭 Personas disponíveis (${personas.length}):\n${lines.join('\n')}${metaLine}\n\nComandos:\n/persona <id> - Trocar de persona\n/persona info <id> - Ver detalhes da persona\n/meta - Ativar meta-persona (admin)\n/persona reset - Voltar para padrão\n/persona create <desc> - Criar persona (admin)\n/persona edit <id> <campo> <valor> - Editar (admin)\n/persona delete <id> - Deletar (admin)`;

        const activePersonas = personas.filter(p => p.isActive);
        if (activePersonas.length > 0 && activePersonas.length <= 10) {
          return {
            response: textResponse,
            interactiveOptions: {
              type: 'list',
              title: 'Personas',
              sections: [{
                title: 'Trocar persona',
                rows: activePersonas.map(p => ({
                  id: `persona:${p.id}`,
                  title: p.name,
                  description: p.id === (currentPersona?.id) ? 'Persona atual' : `ID: ${p.id}`,
                })),
              }],
            },
          };
        }
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

      if (args.startsWith('info ')) {
        const infoId = args.slice(5).trim().toLowerCase();
        try {
          const p = await personaManager.getPersona(infoId);
          if (!p) return `❌ Persona "${infoId}" não encontrada.`;
          const ident = p.identity;
          let identPreview = '';
          if (typeof ident === 'object' && ident !== null) {
            const langs = Object.keys(ident);
            identPreview = langs.map(l => {
              const block = ident[l];
              if (typeof block === 'string') return `  ${l}: "${block.substring(0, 80)}..."`;
              if (block?.core) return `  ${l}: "${block.core.substring(0, 80)}..."`;
              return `  ${l}: (objeto)`;
            }).join('\n');
          } else if (typeof ident === 'string') {
            identPreview = `"${ident.substring(0, 100)}..."`;
          }
          const sources = p.knowledgeSources?.length ? p.knowledgeSources.join(', ') : 'nenhuma';
          return [
            `🎭 Detalhes da persona "${p.name}" (${p.id}):`,
            `• Nome: ${p.name} / ${p.nameEn || '-'} / ${p.nameEs || '-'}`,
            `• Ativa: ${p.isActive !== false ? '✅ Sim' : '❌ Não'}`,
            `• Prioridade: ${p.priority || 100}`,
            `• Voz TTS: ${p.ttsVoice || 'pm_alex'} (${p.ttsLang === 'p' ? 'pt-BR' : p.ttsLang === 'a' ? 'en-US' : p.ttsLang === 'e' ? 'es-ES' : p.ttsLang || 'pt-BR'})`,
            `• Modelo: ${p.model || 'padrão'}`,
            `• Fontes de conhecimento: ${sources}`,
            `• Identidade:`,
            identPreview || '  (não definida)',
            `• Comandos: ${p.commands ? Object.keys(p.commands).join(', ') : 'nenhum'}`,
          ].join('\n');
        } catch (err) { return `❌ Erro: ${err.message}`; }
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
        if (personaId === 'meta-persona') return '⛔ Não é possível deletar a meta-persona.';
        try {
          await personaManager.deletePersona(personaId);
          return `🗑️ Persona "${personaId}" deletada.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      const targetPersona = args.trim().toLowerCase();
      if (targetPersona === 'meta-persona' && !isAdmin) {
        return '⛔ Meta-persona é restrita a administradores. Use /persona para listar personas disponíveis.';
      }
      try {
        const result = await metaRag.switchPersona(uid, sessionId, targetPersona);
        const freshPersona = await personaManager.getPersona(targetPersona);
        return metaRag.formatPersonaSwitchMessage(freshPersona, 'pt-BR');
      } catch (err) {
        return `❌ Persona "${args}" não encontrada. Use /persona para listar.`;
      }
    }

    case '/meta': {
      if (!isAdmin) return '⛔ Apenas administradores podem usar a meta-persona.';
      try {
        const result = await metaRag.switchPersona(uid, sessionId, 'meta-persona');
        const mp = await personaManager.getPersona('meta-persona');
        const brandName = await getSetting('brand_name', '') || 'MetaPersona.AI';
        const welcomeBody = mp.welcomeBody
          ? (typeof mp.welcomeBody === 'object' ? (mp.welcomeBody['pt-BR'] || Object.values(mp.welcomeBody)[0]) : mp.welcomeBody)
          : null;
        if (welcomeBody) {
          return `🎭 ${brandName}\n\n${welcomeBody}`;
        }
        return `🎭 ${brandName}\n\nOrquestradora ativada. Posso criar personas, gerenciar conhecimento, skills e mais.`;
      } catch (err) {
        return `❌ Erro ao ativar meta-persona: ${err.message}`;
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
        const voiceNames = Object.entries(kv).slice(0, 6).map(([lang, cfg]) => ({ id: `voice:${cfg.voice}`, text: `${cfg.voice}`, label: lang }));
        return {
          response: `🔊 Voz atual: ${persona.ttsVoice || 'pm_alex'}\n\nVozes Kokoro disponíveis:\n${voiceList}\n\nUse: /voice <nome_da_voz>\nExemplo: /voice pm_alex, /voice pf_dora`,
          interactiveOptions: { type: 'buttons', items: voiceNames },
        };
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
        return {
          response: `📋 Pesquisas:\n${lines.join('\n')}\n\nComandos:\n/survey create <título>\n/survey <id> - Ver detalhes\n/survey <id> toggle\n/survey <id> responses`,
          interactiveOptions: {
            type: 'buttons',
            items: surveys.surveys.slice(0, 3).map(s => ({ id: `action:/survey ${s.id}`, text: `📋 ${s.title}`, label: s.title })),
          },
        };
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
        if (parts[0] === 'overdue') { const tasks = await agentModule.getOverdueTasks(uid); return `⚠️ Tarefas atrasadas (${tasks.length}):\n${tasks.map(t => `• [${t.priority}] ${t.title} - ${t.status} ${t.due_date ? '(Prazo: ' + t.due_date + ')' : ''}`).join('\n')}`; }
        if (['pending', 'in_progress', 'completed', 'cancelled'].includes(parts[0])) taskFilters.status = parts[0];
      }
      taskFilters.owner_id = uid;
      taskFilters.limit = 20;
      const tasks = await agentModule.listTasks(taskFilters);
      if (tasks.length === 0) return '📋 Nenhuma tarefa encontrada.';
      const taskText = `📋 Tarefas (${tasks.length}):\n${tasks.map(t => `• [${t.priority}] ${t.title} - ${t.status} ${t.due_date ? '(Prazo: ' + t.due_date + ')' : ''}`).join('\n')}`;
      return {
        response: taskText,
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/tasks pending', text: '⏳ Pendentes' },
            { id: 'action:/tasks in_progress', text: '🔄 Em progresso' },
            { id: 'action:/tasks overdue', text: '⚠️ Atrasadas' },
          ],
        },
      };
    }

    case '/calendar': {
      if (!args || args === 'upcoming' || args === 'semana') {
        const events = await agentModule.getUpcomingEvents(uid, 7);
        if (events.length === 0) return '📅 Nenhum evento nos próximos 7 dias.';
        const calText = `📅 Próximos eventos (${events.length}):\n${events.map(e => `• ${e.start_time}: ${e.title} (${e.event_type}) ${e.location ? '@ ' + e.location : ''}`).join('\n')}`;
        return {
          response: calText,
          interactiveOptions: {
            type: 'buttons',
            items: [
              { id: 'action:/tasks', text: '📋 Tarefas' },
              { id: 'action:/goals', text: '🎯 Metas' },
            ],
          },
        };
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
      const contacts = await agentModule.listContacts(contactFilters);
      if (contacts.length === 0) return '👥 Nenhum contato encontrado.';
      const contactText = `👥 Contatos (${contacts.length}):\n${contacts.map(c => `• ${c.name} [${c.stage}] ${c.email || ''} ${c.company ? '@ ' + c.company : ''} ${c.tags ? '(' + (Array.isArray(c.tags) ? c.tags.join(',') : c.tags) + ')' : ''}`).join('\n')}`;
      return {
        response: contactText,
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/contacts lead', text: '🔵 Leads' },
            { id: 'action:/contacts customer', text: '🟢 Clientes' },
            { id: 'action:/contacts vip', text: '⭐ VIPs' },
          ],
        },
      };
    }

    case '/automations': {
      const automations = await agentModule.listAutomations({ owner_id: uid, limit: 20 });
      if (automations.length === 0) return '🤖 Nenhuma automação configurada.';
      const autoText = `🤖 Automações (${automations.length}):\n${automations.map(a => `• ${a.name} [${a.trigger_type} → ${a.action_type}] ${a.is_active ? '✅' : '❌'}`).join('\n')}`;
      return {
        response: autoText,
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/dashboard', text: '📊 Dashboard' },
            { id: 'action:/goals', text: '🎯 Metas' },
          ],
        },
      };
    }

    case '/dashboard': {
      const stats = await agentModule.getDashboardStats(uid);
      const goals2 = await goalsModule.listGoals({ owner_id: uid, status: 'active', limit: 5 });
      const dashText = `📊 Dashboard:\n• Tarefas: ${stats.tasks.total} (${Object.entries(stats.tasks.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')})\n• Eventos (7d): ${stats.upcomingEvents}\n• Contatos: ${stats.contacts.total} (${Object.entries(stats.contacts.byStage).map(([k, v]) => `${k}: ${v}`).join(', ')})\n• Automações ativas: ${stats.activeAutomations}\n• Personas: ${stats.activePersonas}\n• Skill: ${stats.activeSkills}${stats.goals ? '\n• Metas: ' + stats.goals.total + ' (' + Object.entries(stats.goals.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ') + ')' : ''}${stats.orgMemory && stats.orgMemory.total > 0 ? '\n• Memória Org: ' + stats.orgMemory.total + ' itens' : ''}${goals2.length > 0 ? '\n• Metas ativas: ' + goals2.map(g => g.title).join(', ') : ''}`;
      return {
        response: dashText,
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/tasks', text: '📋 Tarefas' },
            { id: 'action:/goals', text: '🎯 Metas' },
            { id: 'action:/calendar', text: '📅 Eventos' },
          ],
        },
      };
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
        return {
          response: `🎯 Metas (${goals.length}):\n${lines.join('\n')}\n\nComandos:\n/goals create <título>\n/goals <id> edit <campo> <valor>\n/goals <id> progress <0-100>\n/goals progress - Progresso geral`,
          interactiveOptions: {
            type: 'buttons',
            items: [
              { id: 'action:/goals progress', text: '📊 Progresso' },
              { id: 'action:/goals create', text: '➕ Criar meta' },
            ],
          },
        };
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
        if (!isAdmin) return '❌ Apenas admins podem adicionar XP. Use /xp para ver seu XP.';
        const targetUserId = args.split(' ')[1];
        const amount = parseInt(args.split(' ')[2]) || 10;
        const xpUid = targetUserId || uid;
        const result = await gamificationModule.addXp(xpUid, persona.id, amount, 'admin_add');
        const badges = await gamificationModule.checkAndAwardBadges(xpUid, persona.id);
        let msg = `✅ +${amount} XP para ${xpUid === uid ? 'você' : xpUid}! Total: ${result.xp} (Nível ${result.level})`;
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
      return {
        response: `🎮 Seu Progresso:\n• Nível: ${xpData.level}\n• XP: ${xpData.xp}${nextLevel.remaining > 0 ? ` (${nextLevel.remaining} para o próximo)` : ''}\n• Streak: ${xpData.streak || 0} dias (melhor: ${xpData.best_streak || 0})\n• Conquistas: ${badges}`,
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/xp leaderboard', text: '🏆 Ranking' },
            { id: 'action:/xp badges', text: '🎖️ Conquistas' },
            { id: 'action:/stats', text: '📊 Stats' },
          ],
        },
      };
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

    case '/cognitive':
    case '/cognitivo': {
      const cognitiveModule = require('../cognitive');
      if (!args || args === 'me' || args === 'eu') {
        const state = await cognitiveModule.getCognitiveState(uid, persona.id);
        if (!state) return '🧠 Nenhum estado cognitivo registrado ainda.';
        const emotionPct = Math.round((state.emotion_confidence || 0) * 100);
        const intentPct = Math.round((state.intent_confidence || 0) * 100);
        const churnPct = Math.round((state.churn_risk || 0) * 100);
        const engagePct = Math.round((state.engagement_score || 0) * 100);
        return {
          response: `🧠 Estado Cognitivo:\n• Emoção: ${state.emotion || 'neutral'} (${emotionPct}%)\n• Intenção: ${state.intent || 'unknown'} (${intentPct}%)\n• Risco de churn: ${churnPct}%\n• Engajamento: ${engagePct}%\n• Ação sugerida: ${state.suggested_action || 'N/A'}`,
          interactiveOptions: {
            type: 'buttons',
            items: [
              { id: 'action:/progress', text: '📈 Progresso' },
              { id: 'action:/xp', text: '🎮 XP' },
            ],
          },
        };
      }
      if (args === 'stats' || args === 'estatisticas') {
        if (!isAdmin) return '⛔ Apenas administradores.';
        const stats = await cognitiveModule.getCognitiveStats(persona.id, 7);
        return `🧠 Estatísticas cognitivas (7d):\n• Total de análises: ${stats.totalMessages}\n• Emoções: ${Object.entries(stats.emotionDistribution || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}\n• Intenções: ${Object.entries(stats.intentDistribution || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}\n• Churn médio: ${stats.avgChurnRisk}\n• Conversão média: ${stats.avgConversionProbability}\n• Engajamento médio: ${stats.avgEngagement}`;
      }
      return {
        response: '🧠 Comandos:\n/cognitive me - Seu estado cognitivo\n/cognitive stats - Estatísticas (admin)',
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/cognitive me', text: '🧠 Meu estado' },
            { id: 'action:/cognitive stats', text: '📊 Estatísticas' },
          ],
        },
      };
    }

    case '/override': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const overrideModule = require('../override');
      if (!args || args === 'status') {
        const overrides = await overrideModule.listOverrides({ is_active: true });
        if (overrides.length === 0) return '🛡️ Nenhuma override ativa.';
        const lines = overrides.map(o => `• Sessão ${o.session_id}: ${o.override_type} ${o.human_message ? '- "' + o.human_message.substring(0, 40) + '..."' : ''} (${o.is_active ? '✅' : '❌'})`);
        return `🛡️ Overrides ativas:\n${lines.join('\n')}\n\nComandos:\n/override activate <sessionId> <tipo> [mensagem]\n/override deactivate <sessionId>\nTipos: full, approval, observation`;
      }
      if (args.startsWith('activate ')) {
        const parts = args.slice(9).trim().split(/\s+/);
        const sessionId = parts[0];
        const type = parts[1] || 'full';
        const message = parts.slice(2).join(' ') || '';
        if (!sessionId) return 'Uso: /override activate <sessionId> <tipo> [mensagem]';
        try {
          await overrideModule.setOverride(sessionId, { is_active: true, override_type: type, human_message: message });
          return `✅ Override ativada para sessão ${sessionId} (tipo: ${type})`;
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }
      if (args.startsWith('deactivate ')) {
        const sessionId = args.slice(11).trim();
        try {
          await overrideModule.clearOverride(sessionId);
          return `✅ Override desativada para sessão ${sessionId}`;
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }
      return '🛡️ Comandos:\n/override status - Listar overrides\n/override activate <sessionId> <tipo> [msg]\n/override deactivate <sessionId>';
    }

    case '/thoughts':
    case '/pensamentos': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const thoughtsModule = require('../thoughts');
      if (!args || args === 'recent' || args === 'recentes') {
        const thoughts = await thoughtsModule.getThoughts({ limit: 10 });
        if (thoughts.length === 0) return '💭 Nenhum pensamento registrado.';
        const lines = thoughts.map(t => `• [${new Date(t.created_at).toLocaleString()}] ${t.persona_id}: ${t.reasoning || 'N/A'} → ${t.decision || 'N/A'} (${t.tools_used?.join(',') || 'none'})`);
        return `💭 Últimos pensamentos:\n${lines.join('\n')}`;
      }
      if (args === 'stats' || args === 'estatisticas') {
        const stats = await thoughtsModule.getThoughtStats(persona.id, 7);
        return `💭 Estatísticas (7d):\n• Total: ${stats.totalThoughts}\n• Tempo médio de resposta: ${stats.avgResponseTime}ms\n• Tokens médios: ${stats.avgTokens}\n• Ferramentas mais usadas: ${Object.entries(stats.toolUsage || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`).join(', ')}`;
      }
      return '💭 Comandos:\n/thoughts recent - Últimos pensamentos\n/thoughts stats - Estatísticas';
    }

    case '/suggestions':
    case '/sugestoes': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const optModule = require('../optimization');
      const days = args && parseInt(args) > 0 ? parseInt(args) : 7;
      try {
        const result = await optModule.generateSuggestions(persona.id, days);
        if (!result.suggestions || result.suggestions.length === 0) return '💡 Nenhuma sugestão no momento. Continue usando a persona para gerar dados.';
        const lines = result.suggestions.map(s => `• [${s.priority}] ${s.title}: ${s.description}`);
        return `💡 Sugestões de otimização (${days}d, ${result.totalMessages} msgs):\n${lines.join('\n')}`;
      } catch (err) { return `❌ Erro: ${err.message}`; }
    }

    case '/help':
    case '/ajuda':
    case '/comandos': {
      const cmds = [
        '📊 /stats - Suas estatísticas',
        '📋 /myprofile - Seu perfil',
        '🎭 /persona - Listar/trocar/criar personas',
        '🧙 /meta - Ativar meta-persona (admin god)',
        '🔊 /voice - Listar/trocar vozes TTS',
        '',
        '─ Ações ─',
        '📋 /tasks - Listar/criar tarefas',
        '📅 /calendar - Próximos eventos',
        '👥 /contacts - Contatos CRM',
        '🤖 /automations - Automações',
        '🎯 /goals - Metas e objetivos',
        '🔄 /stages - Estágios de conversa',
        '🧠 /orgmem - Memória organizacional',
        '🏟️ /skills - Skills disponíveis',
        '',
        '─ Progresso ─',
        '🏆 /xp - Gamificação (XP, nível, streak, leaderboard)',
        '📈 /progress - Seu progresso pessoal',
        '🧠 /cognitive - Estado cognitivo (emoção, intenção)',
        '',
        '─ Templates ─',
        '🏗️ /blueprints - Templates de persona',
        '',
        '─ Utilitários ─',
        '🛑 /stop - Interromper resposta',
        '🔇 /silence <N> - Silenciar por N mensagens (/silence off = desativar)',
        '📋 /survey - Pesquisas',
        '⭐ /ratings - Avaliações',
        '📬 /followups - Follow-ups',
        '🎨 /creative - Gerar conteúdo visual',
        '📝 /blog - Posts do blog',
        '📧 /email - Enviar email',
        '🔍 /search - Busca no conhecimento',
        '🎬 /media - Mídia',
        '',
        '─ Admin ─',
        '👑 /admin - Painel admin',
        '🔑 /keys, /addkey - Integrações',
        '⚙️ /settings, /set - Configurações',
        '👥 /users, /promote, /ban - Usuários',
        '🛡️ /override - Controle humano',
        '💭 /thoughts - Pensamentos do agente',
        '💡 /suggestions - Sugestões de otimização',
        '📊 /dashboard - Dashboard geral',
        '',
        '─ Avançado ─',
        '🧩 /context - Contexto da conversa',
        '🪞 /reflect - Auto-reflexão da persona',
        '📊 /quiz - Quiz interativo',
        '🏢 /workspace - Workspaces (admin)',
        '💳 /billing - Planos e uso (admin)',
        '🌍 /lang - Trocar idioma',
        '📋 /plan - Planejador de execução',
        '📜 /history - Histórico da sessão',
        '📤 /export - Exportar dados (admin)',
        '📊 /stats2 - Estatísticas globais',
        '⚙️ /config - Configurações rápidas (admin)',
      ];
      const textResponse = cmds.join('\n');
      return {
        response: textResponse,
        interactiveOptions: {
          type: 'buttons',
          items: [
            { id: 'action:/stats', text: '📊 Stats' },
            { id: 'action:/persona', text: '🎭 Personas' },
            { id: 'action:/goals', text: '🎯 Metas' },
          ],
        },
      };
    }

    case '/creative': {
      const creativeModule = require('../creative');
      if (!args || args === 'list' || args === 'lista') {
        const templates = creativeModule.getAvailableTemplates();
        let templateList;
        if (Array.isArray(templates)) {
          templateList = templates;
        } else if (typeof templates === 'object') {
          templateList = Object.entries(templates).map(([id, t]) => ({ id, name: t.name || id, type: t.type || 'content' }));
        } else {
          templateList = [{ id: 'quote_post', name: 'Quote Post', type: 'content' }, { id: 'announcement_post', name: 'Announcement', type: 'content' }, { id: 'carousel_slide', name: 'Carousel Slide', type: 'content' }, { id: 'minimal_blog', name: 'Minimal Blog', type: 'content' }];
        }
        return `🎨 Templates de conteúdo:\n${templateList.map(t => `• ${t.id}: ${t.name} (${t.type})`).join('\n')}\n\nUse: /creative <template_id> <tema>\nEx: /creative quote_post "fé e esperança"`;
      }
      const creativeParts = args.trim().split(/\s+/);
      const templateId = creativeParts[0];
      const topic = creativeParts.slice(1).join(' ');
      if (!templateId || !topic) return 'Uso: /creative <template_id> <tema>\nTemplates: quote_post, announcement_post, carousel_slide, minimal_blog';
      try {
        const personaContext = persona.identity?.pt || persona.identity || '';
        const result = await creativeModule.generateWithLLM(personaContext, topic, templateId);
        if (result && result.html) {
          const saved = await creativeModule.saveCreative(persona.id, uid, 'image', templateId, { topic }, result.html);
          return `🎨 Conteúdo gerado com template "${templateId}"!\n📝 Tema: ${topic}\n💾 Salvo com ID: ${saved.id}\n\nAcesse em /api/admin/creatives/${saved.id}/html`;
        }
        return `🎨 Conteúdo gerado para "${topic}" com template "${templateId}".`;
      } catch (err) { return `❌ Erro: ${err.message}`; }
    }

    case '/blog': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const blogModule = require('../blog');
      if (!args || args === 'list' || args === 'lista') {
        const posts = await blogModule.getAllPosts({ limit: 5 });
        if (!posts || posts.length === 0) return '📝 Nenhum post encontrado.';
        return `📝 Últimos posts:\n${posts.map(p => `• ${p.title} (${p.topic || 'sem tema'}) - ${new Date(p.published_at || p.created_at).toLocaleDateString()}`).join('\n')}`;
      }
      if (args.startsWith('generate ') || args.startsWith('gerar ')) {
        const topic = args.replace(/^(generate|gerar)\s+/i, '').trim();
        try {
          const post = await blogModule.generatePost(persona.id, topic);
          return `📝 Post gerado: "${post.title}"\n• Tema: ${post.topic || 'N/A'}\n• Slug: ${post.slug}\n\nAcesse em /blog/${post.slug}`;
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }
      return '📝 Comandos:\n/blog list - Listar posts\n/blog generate <tema> - Gerar post';
    }

    case '/email': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const emailParts = args.trim().split('|');
      if (emailParts.length < 2) return 'Uso: /email <destinatário> | <assunto> | <mensagem>';
      const to = emailParts[0].trim();
      const subject = emailParts[1]?.trim() || 'Sem assunto';
      const body = emailParts[2]?.trim() || emailParts[1]?.trim() || '';
      try {
        const { sendEmail } = require('../email');
        await sendEmail({ to, subject, html: body });
        return `📧 Email enviado para ${to}: "${subject}"`;
      } catch (err) { return `❌ Erro ao enviar: ${err.message}`; }
    }

    case '/search':
    case '/buscar': {
      if (!args) return 'Uso: /search <termo>';
      const { searchMultiSource } = require('../knowledge/store');
      const sources = persona?.knowledge_sources || [];
      try {
        const results = await searchMultiSource(args, sources.length > 0 ? sources : undefined, 5);
        if (!results || results.length === 0) return `🔍 Nenhum resultado para "${args}".`;
        const lines = results.map(r => `• [${r.source}] ${r.text?.substring(0, 100)}... (score: ${r.score?.toFixed(2) || 'N/A'})`);
        return `🔍 Resultados para "${args}":\n${lines.join('\n')}`;
      } catch (err) { return `❌ Erro na busca: ${err.message}`; }
    }

    case '/quiz': {
      const quizModule = require('../quiz');
      if (!args || args === 'list') {
        const quizzes = await quizModule.listQuizzes({ status: 'active' });
        if (!quizzes || quizzes.length === 0) return '🎮 Nenhum quiz ativo no momento.';
        const textResponse = `🎮 Quizzes disponíveis:\n${quizzes.map(q => `• ${q.id}: ${q.title} (${q.questions?.length || 0} perguntas)`).join('\n')}`;
        if (quizzes.length <= 10) {
          return {
            response: textResponse,
            interactiveOptions: {
              type: 'buttons',
              items: quizzes.slice(0, 3).map(q => ({ id: `quiz:${q.id}`, text: `${q.title}`, label: q.title })),
            },
          };
        }
        return textResponse;
      }
      try {
        const quizId = parseInt(args);
        if (isNaN(quizId)) {
          const quiz = await quizModule.createQuiz({ title: args, questions: [{ question: 'Pergunta 1', options: ['A', 'B', 'C', 'D'], correct: 0 }], active: true });
          return `🎮 Quiz "${quiz.title}" criado! (ID: ${quiz.id})`;
        }
        const quiz = await quizModule.getQuiz(quizId);
        if (!quiz) return '❌ Quiz não encontrado.';
        const questions = quiz.questions || [];
        if (questions.length > 0 && questions[0].options && questions[0].options.length >= 2) {
          const firstQuestion = questions[0];
          const textResponse = `🎮 ${quiz.title}\n\n${firstQuestion.question}\n${firstQuestion.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}`;
          if (questions.length > 1) {
            const remaining = questions.length - 1;
            return {
              response: textResponse + `\n\n📝 ${remaining} pergunta(s) restante(s). Responda para continuar!`,
              interactiveOptions: {
                type: 'poll',
                pollOptions: firstQuestion.options,
                prompt: firstQuestion.question,
                quiz: true,
                correctOption: firstQuestion.correct,
                anonymous: false,
              },
            };
          }
          return {
            response: textResponse,
            interactiveOptions: {
              type: 'poll',
              pollOptions: firstQuestion.options,
              prompt: firstQuestion.question,
              quiz: true,
              correctOption: firstQuestion.correct,
              anonymous: false,
            },
          };
        }
        return `🎮 ${quiz.title}\n${questions.map((q, i) => `${i + 1}. ${q.question}\n   ${q.options?.map((o, oi) => `${String.fromCharCode(65 + oi)}) ${o}`).join('\n   ')}`).join('\n')}`;
      } catch (err) { return `❌ Erro: ${err.message}`; }
    }

    case '/context': {
      const contextModule = require('../context');
      const contextData = contextModule.buildContextLayers({ userId: uid, personaId: persona.id, sessionId: sessionId }, {}, 5);
      if (!contextData || contextData.length === 0) return '🧩 Nenhum contexto recente.';
      const lines = contextData.map(c => `• [${c.type || 'ctx'}] ${String(c.content || c).substring(0, 80)}`);
      return `🧩 Contexto recente:\n${lines.join('\n')}`;
    }

    case '/reflect':
    case '/refletir': {
      const reflectionModule = require('../reflection');
      try {
        const result = await reflectionModule.generateReflection(persona.id);
        if (!result) return '🪞 Não há dados suficientes para reflexão.';
        const lines = [];
        if (result.strengths) lines.push(`💪 Pontos fortes: ${Array.isArray(result.strengths) ? result.strengths.join(', ') : result.strengths}`);
        if (result.weaknesses) lines.push(`⚠️ Pontos a melhorar: ${Array.isArray(result.weaknesses) ? result.weaknesses.join(', ') : result.weaknesses}`);
        if (result.recommendations) lines.push(`💡 Recomendações: ${Array.isArray(result.recommendations) ? result.recommendations.join(', ') : result.recommendations}`);
        if (result.adjustments) lines.push(`🔧 Ajustes: ${Array.isArray(result.adjustments) ? result.adjustments.join(', ') : result.adjustments}`);
        return `🪞 Auto-reflexão (${persona.name}):\n${lines.join('\n') || JSON.stringify(result).substring(0, 300)}`;
      } catch (err) { return `❌ Erro: ${err.message}`; }
    }

    case '/events':
    case '/eventos': {
      const eventsModule = require('../events');
      if (!args || args === 'recent') {
        const events = await eventsModule.getEventLog({ limit: 10 });
        if (!events || events.length === 0) return '📅 Nenhum evento registrado.';
        const lines = events.map(e => `• [${e.event_type}] ${e.data ? JSON.stringify(e.data).substring(0, 60) : ''} (${new Date(e.created_at).toLocaleString()})`);
        return `📅 Últimos eventos:\n${lines.join('\n')}`;
      }
      if (args === 'stats') {
        const stats = await eventsModule.getEventStats({ persona_id: persona.id, days: 7 });
        if (!stats || stats.length === 0) return '📅 Sem estatísticas.';
        return `📅 Estatísticas (7d):\n${stats.map(s => `• ${s.event_type}: ${s.count}`).join('\n')}`;
      }
      return '📅 Comandos:\n/events recent - Últimos eventos\n/events stats - Estatísticas';
    }

    case '/media': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const mediaModule = require('../media');
      if (!args || args === 'list') {
        const media = await mediaModule.listMedia({ limit: 10 });
        if (!media || media.length === 0) return '🎬 Nenhuma mídia encontrada.';
        return `🎬 Mídias (${media.length}):\n${media.map(m => `• ${m.original_name || m.filename} (${m.type || m.mime_type})`).join('\n')}`;
      }
      return '🎬 Comandos:\n/media list - Listar mídias';
    }

    case '/workspace':
    case '/ws': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const { workspaceManager, ruleEngine } = require('../workspace');
      if (!args || args === 'info') {
        let workspaces = [];
        try {
          workspaces = await workspaceManager.getUserWorkspaces(uid) || [];
    } catch (e) { console.error('[Silence] decSilence read error:', e.message); }
        if (workspaces.length === 0) {
          const [wsRows] = await require('../db').pool.execute('SELECT id, name, slug, plan FROM workspaces ORDER BY created_at DESC LIMIT 10');
          workspaces = wsRows || [];
        }
        if (workspaces.length === 0) return '🏢 Nenhum workspace encontrado. Use /workspace create <nome> para criar.';
        return `🏢 Workspaces:\n${workspaces.map(w => `• ${w.name} (${w.slug || w.id}) - Plano: ${w.plan || 'free'}`).join('\n')}`;
      }
      if (args.startsWith('create ')) {
        const name = args.replace(/^create\s+/i, '').trim();
        try {
          const ws = await workspaceManager.createWorkspace({ name, ownerId: uid });
          return `🏢 Workspace "${name}" criado! ID: ${ws.id}`;
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }
      if (args.startsWith('usage ')) {
        const wsId = args.replace(/^usage\s+/i, '').trim();
        try {
          const usage = await workspaceManager.getWorkspaceUsage(wsId);
          return `📊 Uso do workspace ${wsId}:\n• Personas: ${usage.personas}\n• Contatos: ${usage.contacts}\n• Mensagens: ${usage.messages}`;
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }
      if (args.startsWith('rules ')) {
        const wsId = args.replace(/^rules\s+/i, '').trim();
        try {
          const rules = await ruleEngine.listRules(wsId);
          if (!rules || rules.length === 0) return `📋 Sem regras no workspace ${wsId}.`;
          return `📋 Regras (${rules.length}):\n${rules.map(r => `• ${r.name} (${r.rule_type}) - Prioridade: ${r.priority}`).join('\n')}`;
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }
      return '🏢 Comandos:\n/workspace info - Listar workspaces\n/workspace create <nome> - Criar\n/workspace usage <id> - Uso\n/workspace rules <id> - Regras de negócio';
    }

    case '/billing': {
      const { billingManager, PLANS } = require('../billing');
      if (!args || args === 'plans' || args === 'planos') {
        const plans = billingManager.getAllPlans();
        return `💳 Planos disponíveis:\n${plans.map(p => `• ${p.id.toUpperCase()}: ${p.name} - R$${p.price}/mês\n  Personas: ${p.limits.personas === 'unlimited' ? '∞' : p.limits.personas}, Msgs/dia: ${p.limits.messages_per_day === 'unlimited' ? '∞' : p.limits.messages_per_day}, Contatos: ${p.limits.contacts === 'unlimited' ? '∞' : p.limits.contacts}`).join('\n')}`;
      }
      if (args.startsWith('usage ')) {
        const wsId = args.replace(/^usage\s+/i, '').trim();
        try {
          const report = await billingManager.getUsageReport(wsId);
          const lines = Object.entries(report.usage).map(([resource, data]) => {
            const limit = data.limit === 'unlimited' ? '∞' : data.limit;
            return `• ${resource}: ${data.current}/${limit} ${data.allowed ? '✅' : '⛔'}`;
          });
          return `💳 Uso (${report.plan}):\n${lines.join('\n')}`;
        } catch (err) { return `❌ Erro: ${err.message}`; }
      }
      return '💳 Comandos:\n/billing plans - Ver planos\n/billing usage <workspace_id> - Ver uso';
    }

    case '/lang':
    case '/idioma': {
      const i18n = require('../i18n');
      const langMap = { 'pt': 'pt-BR', 'pt-br': 'pt-BR', 'br': 'pt-BR', 'en': 'en-US', 'en-us': 'en-US', 'us': 'en-US', 'es': 'es-ES', 'es-es': 'es-ES' };
      if (!args) return '🌍 Idiomas: pt-BR, en-US, es-ES\nUse: /lang <idioma>\nEx: /lang en-US';
      const lang = langMap[args.toLowerCase()] || args;
      const translations = i18n.translations?.[lang];
      if (!translations) return `❌ Idioma "${args}" não disponível. Use: pt-BR, en-US, es-ES`;
      try {
        await require('../db').pool.execute('UPDATE sessions SET user_context = JSON_SET(COALESCE(user_context, "{}"), "$.language", ?) WHERE id = ?', [lang, sessionId]);
        await require('../db').pool.execute('UPDATE profiles SET topics = JSON_SET(COALESCE(topics, "[]"), "$.language", ?) WHERE user_id = ?', [lang, uid]);
      } catch (err) { console.error('[ChatEngine] Lang save error:', err.message); }
      return `🌍 Idioma definido: ${lang}\n✅ ${translations.welcomeTitle || 'OK'}`;
    }

    case '/plan':
    case '/planejar':
    case '/planner': {
      const plannerModule = require('../planner');
      if (!args) return '📋 Use: /plan <mensagem> — O planejador irá analisar e criar um plano de execução.\nEx: /plan criar campanha de marketing para fitness';
      try {
        const plan = await plannerModule.planExecution(args, persona?.id, uid, [], {});
        if (!plan) return '📋 Planejador desabilitado. Ative com /set planner_enabled true';
        return `📋 Plano de execução:\n• Intenção: ${plan.intent}\n• Precisa de tools: ${plan.needsTools ? 'Sim' : 'Não'}\n• Estratégia: ${plan.responseStrategy}\n• Risco: ${plan.riskLevel}\n• Rounds estimados: ${plan.estimatedRounds}${plan.toolPlan?.length ? '\n\n🔧 Ferramentas:\n' + plan.toolPlan.map(t => `  ${t.priority}. ${t.tool}: ${t.reason}`).join('\n') : ''}${plan.notes ? '\n\n📝 ' + plan.notes : ''}`;
      } catch (err) { return `❌ Erro: ${err.message}`; }
    }

    case '/history':
    case '/historico': {
      if (!sessionId) return '📜 Envie esta mensagem em uma sessão ativa para ver o histórico.';
      const historyLimit = parseInt(args) || 10;
      const limit = Math.min(historyLimit, 50);
      const [msgs] = await require('../db').pool.execute(
        'SELECT role, content, created_at FROM persona_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
        [sessionId, limit]
      );
      if (!msgs || msgs.length === 0) return '📜 Nenhuma mensagem no histórico.';
      const lines = msgs.reverse().map(m => {
        const icon = m.role === 'user' ? '👤' : m.role === 'assistant' ? '🤖' : m.role === 'system' ? '⚙️' : '🔧';
        const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${icon} [${time}] ${m.content.substring(0, 80)}`;
      });
      return `📜 Histórico (${msgs.length} mensagens):\n${lines.join('\n')}`;
    }

    case '/export': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      if (!args) return '📤 Use: /export <tipo>\nTipos: personas, skills, goals, contacts, automations, orgmem, stages, blueprints';
      try {
        const type = args.toLowerCase().trim();
        let data;
        switch (type) {
          case 'personas': { const [rows] = await require('../db').pool.execute('SELECT * FROM personas'); data = rows; break; }
          case 'skills': { const [rows] = await require('../db').pool.execute('SELECT * FROM persona_skills'); data = rows; break; }
          case 'goals': { const [rows] = await require('../db').pool.execute('SELECT * FROM persona_goals'); data = rows; break; }
          case 'contacts': { const [rows] = await require('../db').pool.execute('SELECT * FROM persona_contacts'); data = rows; break; }
          case 'automations': { const [rows] = await require('../db').pool.execute('SELECT * FROM persona_automations'); data = rows; break; }
          case 'orgmem': { const [rows] = await require('../db').pool.execute('SELECT * FROM persona_org_memory'); data = rows; break; }
          case 'stages': { const [rows] = await require('../db').pool.execute('SELECT * FROM persona_conversation_stages'); data = rows; break; }
          case 'blueprints': { const [rows] = await require('../db').pool.execute('SELECT * FROM persona_blueprints'); data = rows; break; }
          default: return `❌ Tipo "${type}" desconhecido. Use: personas, skills, goals, contacts, automations, orgmem, stages, blueprints`;
        }
        const json = JSON.stringify(data, null, 2);
        if (json.length > 4000) return `📤 ${type}: ${data.length} registros (muito grande para exibir — use a API /api/admin/${type})`;
        return `📤 Exportação de ${type} (${data.length} registros):\n\`\`\`json\n${json}\n\`\`\``;
      } catch (err) { return `❌ Erro: ${err.message}`; }
    }

    case '/stats2':
    case '/estatisticas': {
      const db = require('../db').pool;
      const [msgCount] = await db.execute('SELECT COUNT(*) as cnt FROM persona_messages');
      const [userCount] = await db.execute('SELECT COUNT(*) as cnt FROM users');
      const [sessionCount] = await db.execute('SELECT COUNT(*) as cnt FROM sessions');
      const [personaCount] = await db.execute('SELECT COUNT(*) as cnt FROM personas WHERE is_active = 1');
      const [goalCount] = await db.execute('SELECT COUNT(*) as cnt FROM persona_goals WHERE status = ?', ['active']);
      const [taskCount] = await db.execute('SELECT COUNT(*) as cnt FROM persona_tasks WHERE status != ?', ['completed']);
      const [contactCount] = await db.execute('SELECT COUNT(*) as cnt FROM persona_contacts');
      const [automationCount] = await db.execute('SELECT COUNT(*) as cnt FROM persona_automations WHERE is_active = 1');

      const [cogEmotions] = await db.execute(
        'SELECT emotion, COUNT(*) as cnt FROM cognitive_states GROUP BY emotion ORDER BY cnt DESC LIMIT 5'
      );
      const [cogIntents] = await db.execute(
        'SELECT intent, COUNT(*) as cnt FROM cognitive_states GROUP BY intent ORDER BY cnt DESC LIMIT 5'
      );

      let result = `📊 Estatísticas Globais:\n\n`;
      result += `💬 Mensagens: ${msgCount[0].cnt}\n`;
      result += `👥 Usuários: ${userCount[0].cnt}\n`;
      result += `📝 Sessões: ${sessionCount[0].cnt}\n`;
      result += `🎭 Personas ativas: ${personaCount[0].cnt}\n`;
      result += `🎯 Metas ativas: ${goalCount[0].cnt}\n`;
      result += `📋 Tarefas pendentes: ${taskCount[0].cnt}\n`;
      result += `👥 Contatos: ${contactCount[0].cnt}\n`;
      result += `🤖 Automações ativas: ${automationCount[0].cnt}\n`;

      if (cogEmotions?.length) {
        result += `\n😊 Emoções (top 5):\n${cogEmotions.map(e => `  • ${e.emotion}: ${e.cnt}`).join('\n')}`;
      }
      if (cogIntents?.length) {
        result += `\n🎯 Intenções (top 5):\n${cogIntents.map(i => `  • ${i.intent}: ${i.cnt}`).join('\n')}`;
      }

      return result;
    }

    case '/config': {
      if (!isAdmin) return '⛔ Apenas administradores.';
      const { getSettings, getSetting } = require('../settings');
      if (!args) {
        const settings = await getSettings();
        const lines = Object.entries(settings).map(([k, v]) => `• ${k}: ${String(v).substring(0, 50)}`);
        return `⚙️ Configurações:\n${lines.join('\n')}`;
      }
      if (args.includes('=')) {
        const [key, ...valParts] = args.split('=');
        const value = valParts.join('=').trim();
        const { setSetting } = require('../settings');
        await setSetting(key.trim(), value);
        return `⚙️ Configuração salva: ${key.trim()} = ${value}`;
      }
      const val = await getSetting(args.trim());
      return `⚙️ ${args.trim()}: ${val || '(não definido)'}`;
    }

    default:
      return null;
  }
}

module.exports = {
  processMessage,
  handleChatCommand,
  isUserAdmin,
  getUserRole: getUserRoleStr,
  getPersonaForContext,
  getContextualWelcome,
  getQuickActions,
  generateSessionId,
  setSilence,
  getSilenceStatus,
};