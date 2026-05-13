const integrations = require('../llm/integrationManager');
const { getToolDefinitions, executeTool, formatToolResultToMessage } = require('../llm/tools');
const { extractContent } = require('../llm');
const { buildSystemPrompt } = require('../persona/config');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');
const { searchVerses } = require('../knowledge/store');
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

const MAX_TOOL_ROUNDS = 5;

async function getPersonaForContext(sessionId, userId) {
  let persona;
  if (sessionId) {
    try {
      persona = await personaManager.getSessionPersona(sessionId);
    } catch {}
  }
  if (!persona && userId) {
    try {
      persona = await personaManager.getUserPersona(userId);
    } catch {}
  }
  return persona || personaManager.getActivePersona();
}

async function checkOnboarding(uid, lang) {
  try {
    const nextStep = await onboarding.shouldOnboard(uid);
    if (!nextStep) return null;
    return onboarding.formatOnboardingQuestion(nextStep, lang);
  } catch {
    return null;
    }
  }

  if (uid && uid !== 'user_default' && !isGroup) {
    const onboardMsg = await checkOnboarding(uid, lang);
    if (onboardMsg) {
      const answerResult = await processOnboardingAnswer(uid, message, lang);
      if (answerResult) {
        return {
          response: answerResult.message,
          sessionId: sid,
          sources: [],
          language: lang,
          onboarding: !answerResult.done,
          onboardingDone: answerResult.done,
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

  const numVerses = parseInt(await getSetting('search_verses_count', '8')) || 8;
  const relevantVerses = searchVerses(message, numVerses);
  const contextStr = relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n');

  const memoryStr = await buildMemoryContext(sid);
  const profileStr = await buildProfileContext(uid);

  const persona = await getPersonaForContext(sid, uid);
  const session = await getSession(sid);
  const userName = session.userName || session.userContext?.name;

  let systemPrompt = buildSystemPrompt(persona, lang, contextStr, memoryStr, profileStr, userName, isGroup);

  const toolsEnabled = await getSetting('tools_enabled', 'true') === 'true';
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

  let fullResponse = '';
  let toolRounds = 0;
  let sources = relevantVerses.slice(0, 4).map(v => ({
    reference: v.reference,
    text: v.text.substring(0, 120) + (v.text.length > 120 ? '...' : ''),
  }));

  const maxTokens = parseInt(await getSetting('max_tokens', '4096')) || 4096;
  const temperature = parseFloat(await getSetting('temperature', '0.7')) || 0.7;

  while (toolRounds < MAX_TOOL_ROUNDS) {
    const tools = toolsEnabled ? getToolDefinitions() : null;
    const isAdmin = await isUserAdmin(uid);

    const result = await integrations.callLLM(messages, {
      userId: uid,
      stream: false,
      temperature,
      numPredict: maxTokens,
      retries: 2,
      timeout: parseInt(await getSetting('llm_timeout', '30000')) || 30000,
      tools: isAdmin ? tools : (toolsEnabled ? tools : null),
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
      const toolResult = await executeTool(fnName, fnArgs, { userId: uid, lang, isAdmin });

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

  const result = {
    response: fullResponse,
    sessionId: sid,
    sources,
    language: lang,
    toolCallsUsed: toolRounds > 0 ? toolRounds : 0,
    personaId: persona.id,
    personaName: persona.name,
  };

  return result;
}

async function processMessageStream({ message, sessionId, userId, language, isGroup, source }, onChunk) {
  const lang = SUPPORTED_LANGS.includes(language) ? language : DEFAULT_LANG;
  const uid = userId || 'user_default';
  const sid = sessionId || 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);

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

  await updateProfileFromMessage(uid, message);
  const userContext = extractContextFromMessage(message);
  await updateSessionContext(sid, userContext);

  const numVerses = parseInt(await getSetting('search_verses_count', '8')) || 8;
  const relevantVerses = searchVerses(message, numVerses);

  const contextStr = relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n');
  const memoryStr = await buildMemoryContext(sid);
  const profileStr = await buildProfileContext(uid);

  const persona = await getPersonaForContext(sid, uid);
  const session = await getSession(sid);
  const userName = session.userName || session.userContext?.name;

  let systemPrompt = buildSystemPrompt(persona, lang, contextStr, memoryStr, profileStr, userName, isGroup);

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

  try {
    const response = await integrations.callLLM(messages, {
      userId: uid,
      stream: true,
      temperature,
      numPredict: maxTokens,
      retries: 2,
      timeout: parseInt(await getSetting('llm_timeout', '30000')) || 30000,
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

    const sources = relevantVerses.slice(0, 4).map(v => ({
      reference: v.reference,
      text: v.text.substring(0, 120) + (v.text.length > 120 ? '...' : ''),
    }));

    return { response: fullResponse, sessionId: sid, sources, language: lang, personaId: persona.id, personaName: persona.name };

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

      const targetPersona = args.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      try {
        const result = await metaRag.switchPersona(uid, sessionId, targetPersona);
        return metaRag.formatPersonaSwitchMessage(await personaManager.getPersona(targetPersona), 'pt-BR');
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
};