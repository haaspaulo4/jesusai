const { pool } = require('../db');
const onboarding = require('../onboarding');
const goalsModule = require('../goals');
const stagesModule = require('../stages');
const orgMemoryModule = require('../orgmemory');
const gamificationModule = require('../gamification');
const progressModule = require('../progress');
const cognitiveModule = require('../cognitive');
const thoughtsModule = require('../thoughts');
const overrideModule = require('../override');
const agentModule = require('../agent');
const smartFollowUp = require('../onboarding/followup');
const { getSetting } = require('../settings');
const { t } = require('../i18n');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');

const BOT_ID_COL_MAP = { whatsapp: 'whatsapp_id', telegram: 'telegram_id' };
const ALLOWED_BOT_COLS = new Set(Object.values(BOT_ID_COL_MAP));

function getBotCol(uid) {
  const col = BOT_ID_COL_MAP[uid.startsWith('wa_') ? 'whatsapp' : 'telegram'];
  if (!col || !ALLOWED_BOT_COLS.has(col)) throw new Error('Invalid bot column');
  return col;
}

async function isUserAdmin(userId) {
  try {
    const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows[0]?.role === 'admin';
  } catch { return false; }
}

async function getPersonaForContext(personaIdParam, sessionId, userId) {
  const { getPersona } = require('../persona/manager');
  if (personaIdParam) return getPersona(personaIdParam);
  const [sessions] = await pool.execute('SELECT persona_id FROM sessions WHERE id = ?', [sessionId]);
  if (sessions[0]?.persona_id) return getPersona(sessions[0].persona_id);
  const [users] = await pool.execute('SELECT persona_id FROM users WHERE id = ?', [userId]);
  if (users[0]?.persona_id) return getPersona(users[0].persona_id);
  return getPersona('jesus');
}

async function switchPersona(sessionId, userId, newPersonaId) {
  const { setSessionPersona } = require('../persona/manager');
  await setSessionPersona(sessionId, newPersonaId);
  await pool.execute('DELETE FROM messages WHERE session_id = ?', [sessionId]);
}

async function setSilence(sessionId, count) {
  if (count <= 0) {
    await pool.execute('UPDATE sessions SET silence_count = 0 WHERE id = ?', [sessionId]);
    return;
  }
  await pool.execute('UPDATE sessions SET silence_count = ? WHERE id = ?', [count, sessionId]);
}

async function handleChatCommand(text, userId, source, sessionId, personaIdParam, lang) {
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
        const { findLinkedUser } = require('../auth');
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
    case '/register': {
      if (!uid.startsWith('wa_') && !uid.startsWith('tg_')) {
        return 'Use o site para criar sua conta.';
      }
      const cmdParts = text.trim().split(/\s+/);
      if (cmdParts.length < 3) {
        return 'Formato: /cadastrar email senha [nome]\nExemplo: /cadastrar joao@email.com123 minhaSenha Joao';
      }
      const email = cmdParts[1];
      const password = cmdParts[2];
      const name = cmdParts.slice(3).join(' ') || null;
      try {
        const { register, linkAccount } = require('../auth');
        const user = await register({ email, password, name });
        await linkAccount(null, uid, uid.startsWith('wa_') ? 'whatsapp' : 'telegram', user.id);
        return `✅ Conta criada e vinculada!\n\nBem-vindo, ${user.name || email}! Sua conta está pronta para uso.`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/entrar':
    case '/login': {
      if (!uid.startsWith('wa_') && !uid.startsWith('tg_')) {
        return 'Use o site para fazer login.';
      }
      const cmdParts = text.trim().split(/\s+/);
      if (cmdParts.length < 3) {
        return 'Formato: /entrar email senha\nExemplo: /entrar joao@email.com minhaSenha';
      }
      const email = cmdParts[1];
      const password = cmdParts[2];
      try {
        const { login, linkAccount } = require('../auth');
        const user = await login({ email, password });
        await linkAccount(null, uid, uid.startsWith('wa_') ? 'whatsapp' : 'telegram', user.id);
        return `✅ Login realizado!\n\nBem-vindo de volta, ${user.name || email}!`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/stats':
    case '/estatisticas': {
      try {
        const [rows] = await pool.execute(
          'SELECT COUNT(*) as total FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)',
          [uid]
        );
        const xp = await gamificationModule.getXp(uid, persona?.id);
        return `📊 Suas estatísticas:\n\n• Mensagens: ${rows[0].total}\n• Nível: ${xp.level}\n• XP: ${xp.xp}/${xp.xp + (xp.nextLevelXP - xp.currentLevelXP)}`;
      } catch {
        return '📊 Estatísticas indisponíveis.';
      }
    }

    case '/myprofile':
    case '/perfil': {
      try {
        const { getProfile } = require('../memory/profile');
        const profile = await getProfile(uid);
        if (!profile) return 'Perfil não encontrado. Complete seu onboarding primeiro.';
        const lines = [`👤 Perfil: ${profile.name || 'Sem nome'}`];
        if (profile.story) lines.push(`📖 ${profile.story.substring(0, 100)}...`);
        if (profile.topics) lines.push(`Tópicos: ${JSON.parse(profile.topics).join(', ')}`);
        return lines.join('\n');
      } catch {
        return 'Erro ao carregar perfil.';
      }
    }

    case '/persona': {
      if (!args || args === 'list') {
        const personas = await personaManager.getActivePersonas();
        const current = persona?.id || '';
        const list = personas.map(p => `${p.id === current ? '✅' : '○'} ${p.name} — ${p.description || ''}`).join('\n');
        return `🎭 Personas disponíveis:\n\n${list}\n\nUse /persona <id> para trocar.`;
      }
      if (args.startsWith('create ')) {
        if (!isAdmin) return 'Apenas admins podem criar personas.';
        const desc = args.replace('create ', '');
        try {
          const newPersona = await metaRag.createPersona(desc);
          return `✅ Persona criada: ${newPersona.name}\n\nUse /persona ${newPersona.id} para ativar.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }
      if (args.startsWith('edit ')) {
        if (!isAdmin) return 'Apenas admins podem editar personas.';
        const [pid, field, ...valParts] = args.replace('edit ', '').split(' ');
        const value = valParts.join(' ');
        try {
          await personaManager.updatePersona(pid, { [field]: value });
          return `✅ Persona atualizada.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }
      if (args.startsWith('delete ')) {
        if (!isAdmin) return 'Apenas admins podem deletar personas.';
        const pid = args.replace('delete ', '');
        try {
          await personaManager.deletePersona(pid);
          return `🗑️ Persona deletada.`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }
      const targetPersona = args.split(' ')[0];
      try {
        const newPersona = await personaManager.getPersona(targetPersona);
        if (!newPersona) return `Persona "${targetPersona}" não encontrada.`;
        await switchPersona(sessionId, uid, targetPersona);
        return `✅ Trocou para ${newPersona.name}.`;
      } catch (err) {
        return `❌ Erro: ${err.message}`;
      }
    }

    case '/voice': {
      if (!args) {
        return `🎤 Vozes disponíveis:\n\npt-BR: pm_alex (masculino), pf_dora (feminino)\nen-US: am_adam (masculino), af_bella (feminino)\n\nUse /voice <nome> para trocar.\n\nVoz atual: ${persona?.ttsVoice || 'pm_alex'}`;
      }
      const voiceMap = { alex: 'pm_alex', dora: 'pf_dora', adam: 'am_adam', bella: 'af_bella' };
      const voice = voiceMap[args.toLowerCase()] || args;
      return `🎤 Voz alterada para ${voice}.\n\nNota: Para usar permanentemente, peça a um admin para configurar.`;
    }

    case '/skills': {
      const { getSkillsForPersona } = require('../skills');
      const skills = await getSkillsForPersona(persona?.id);
      if (!skills.length) return 'Nenhuma skill disponível.';
      const list = skills.map(s => `• ${s.name}: ${s.description}`).join('\n');
      return `🛠️ Skills:\n\n${list}`;
    }

    case '/tasks': {
      const tasks = await agentModule.getTasks({ owner_id: uid, status: 'pending' });
      if (!tasks.length) return '✅ Nenhuma tarefa pendente.';
      const lines = tasks.slice(0, 5).map(t => `• ${t.title} (${t.priority})`).join('\n');
      return `📋 Tarefas:\n\n${lines}\n\nComandos:\n/tasks overdue — Tarefas atrasadas\n/tasks create <título>`;
    }

    case '/calendar': {
      const events = await agentModule.getCalendarEvents(uid, 7);
      if (!events.length) return '📅 Nenhum evento nos próximos 7 dias.';
      const lines = events.map(e => `• ${e.start_time}: ${e.title}`).join('\n');
      return `📅 Eventos:\n\n${lines}`;
    }

    case '/contacts': {
      const contacts = await agentModule.getContacts(uid);
      if (!contacts.length) return '📒 Nenhum contato.';
      const lines = contacts.slice(0, 5).map(c => `• ${c.name} (${c.stage})`).join('\n');
      return `📒 Contatos:\n\n${lines}`;
    }

    case '/automations': {
      const { listAutomations } = require('../agent');
      const auto = await listAutomations(persona?.id, uid);
      if (!auto.length) return '⚙️ Nenhuma automação ativa.';
      const lines = auto.map(a => `• ${a.name}: ${a.trigger_type}`).join('\n');
      return `⚙️ Automações:\n\n${lines}`;
    }

    case '/dashboard': {
      const stats = await agentModule.getDashboardStats(persona?.id, uid);
      return `📊 Dashboard:\n\n• Tarefas: ${stats.tasks?.total || 0}\n• Eventos: ${stats.events?.upcoming || 0}\n• Contatos: ${stats.contacts?.total || 0}\n• XP: ${stats.xp?.xp || 0}`;
    }

    case '/goals': {
      if (!args || args === 'list') {
        const goals = await goalsModule.listGoals({ owner_id: uid });
        if (!goals.length) return '🎯 Nenhuma meta. Use /goals create <título>.';
        const lines = goals.slice(0, 5).map(g => {
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
        const userStage = await stagesModule.getUserStage(uid, persona?.id);
        const stageList = stages.map(s => `${s.is_active ? '✅' : '❌'} ${s.stage_order}: ${s.name} - ${s.description || ''}`).join('\n');
        const currentStage = userStage ? `\n\n📍 Seu estágio atual: ${userStage.current_stage}` : '\n\n📍 Seu estágio: Nenhum definido';
        return `🔄 Estágios de conversa:\n${stageList || 'Nenhum estágio configurado.'}${currentStage}\n\nComandos:\n/stages init - Criar estágios padrão\n/stages <id> - Ver detalhes\n/stages advance - Avançar estágio`;
      }

      if (args === 'init') {
        const stages = await stagesModule.ensureDefaultStages(persona?.id);
        return `✅ ${stages.length} estágios padrão criados!\n${stages.map(s => `• ${s.stage_order}: ${s.name}`).join('\n')}`;
      }

      if (args === 'advance') {
        try {
          const result = await stagesModule.advanceUserStage(uid, persona?.id, sessionId);
          return `✅ Avançou para: ${result.new_stage}`;
        } catch (err) {
          return `❌ ${err.message}`;
        }
      }

      const stageId = args;
      try {
        const stage = await stagesModule.getConversationStage(stageId);
        if (!stage) return `Estágio "${stageId}" não encontrado.`;
        return `🔄 ${stage.name}\n\n${stage.description || 'Sem descrição'}\n\nOrdem: ${stage.stage_order}`;
      } catch {
        return `Estágio "${stageId}" não encontrado.`;
      }
    }

    case '/orgmem':
    case '/memoria': {
      if (!args || args === 'list') {
        const entries = await orgMemoryModule.listOrgMemories({ persona_id: persona?.id });
        if (!entries.length) return '🏢 Nenhuma memória organizacional. Use /orgmem create <categoria> <conteúdo>.';
        const lines = entries.slice(0, 5).map(e => `• [${e.category}] ${e.title}`).join('\n');
        return `🏢 Memória organizacional:\n\n${lines}\n\nUse /orgmem search <query> para buscar.`;
      }

      if (args.startsWith('search ')) {
        const query = args.replace('search ', '');
        const results = await orgMemoryModule.searchOrgMemory(query, persona?.id);
        if (!results.length) return `Nenhum resultado para "${query}".`;
        const lines = results.slice(0, 3).map(r => `• ${r.title}: ${r.content.substring(0, 100)}...`).join('\n');
        return `🔍 Resultados:\n\n${lines}`;
      }

      if (args.startsWith('create ')) {
        const parts2 = args.replace('create ', '').split(' ');
        const category = parts2[0];
        const content = parts2.slice(1).join(' ');
        if (!category || !content) return 'Uso: /orgmem create <categoria> <conteúdo>';
        try {
          const entry = await orgMemoryModule.createOrgMemory({ persona_id: persona?.id, owner_id: uid, category, title: content.substring(0, 50), content });
          return `✅ Memória criada: [${category}] ${entry.title}`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }

      return 'Use:\n• /orgmem list\n• /orgmem search <query>\n• /orgmem create <categoria> <conteúdo>';
    }

    case '/xp':
    case '/pontos': {
      try {
        const xp = await gamificationModule.getXp(uid, persona?.id);
        const nextXP = xp.nextLevelXP - xp.currentLevelXP;
        const progress = Math.round((xp.xp / xp.nextLevelXP) * 100);
        let badges = '';
        if (xp.badges && xp.badges.length > 0) {
          badges = `\n\n🏅 Conquistas:\n${xp.badges.map(b => `• ${b.name}`).join('\n')}`;
        }
        return `⭐ XP: ${xp.xp}\n📊 Nível: ${xp.level}\n🔥 Streak: ${xp.streak} dias\n📈 Próximo nível: ${nextXP} XP (${progress}%)\n🏆 Leaderboard: #${xp.rank || '?'}${badges}`;
      } catch {
        return 'Erro ao carregar XP.';
      }
    }

    case '/progress': {
      try {
        const state = await progressModule.getProgressState(uid, persona?.id);
        if (!state) return 'Nenhum progresso registrado.';
        const lines = Object.entries(state).filter(([k]) => k !== 'weak_topics').map(([k, v]) => `• ${k}: ${v}`).join('\n');
        return `📈 Progresso:\n\n${lines}`;
      } catch {
        return 'Erro ao carregar progresso.';
      }
    }

    case '/cognitive':
    case '/cognitivo': {
      try {
        const state = await cognitiveModule.getLatestCognitiveState(uid, persona?.id);
        if (!state) return 'Nenhum dado cognitivo disponível. Continue conversando para eu analisar.';
        return `🧠 Estado cognitivo:\n\n• Emoção: ${state.emotion} (${Math.round(state.emotion_confidence * 100)}%)\n• Intenção: ${state.intent} (${Math.round(state.intent_confidence * 100)}%)\n• Risco de evasão: ${Math.round(state.churn_risk * 100)}%\n• Engajamento: ${Math.round(state.engagement_score * 100)}%`;
      } catch {
        return 'Erro ao carregar estado cognitivo.';
      }
    }

    case '/override': {
      if (!isAdmin) return 'Apenas admins podem usar override.';
      if (!args || args === 'status') {
        const override = await overrideModule.getOverride(sessionId);
        if (!override || !override.is_active) return 'Nenhum override ativo neste sessão.';
        return `🔒 Override: ${override.override_type}\n\n${override.human_message ? 'Mensagem: ' + override.human_message : 'Aguardando mensagem do humano.'}`;
      }
      if (args === 'off' || args === 'desativar') {
        await overrideModule.clearOverride(sessionId);
        return '✅ Override desativado.';
      }
      const [type, ...msgParts] = args.split(' ');
      const humanMsg = msgParts.join(' ');
      await overrideModule.setOverride(sessionId, uid, persona?.id, type, humanMsg);
      return `🔒 Override ativado: ${type}`;
    }

    case '/thoughts':
    case '/pensamentos': {
      if (!isAdmin) return 'Apenas admins podem ver pensamentos.';
      try {
        const thoughts = await thoughtsModule.getThoughts({ user_id: uid, limit: 5 });
        if (!thoughts.length) return 'Nenhum pensamento registrado.';
        const lines = thoughts.map(t => `💭 [${t.created_at}] ${t.reasoning?.substring(0, 100) || '-sem razão'}...`).join('\n\n');
        return `🧠 Pensamentos recentes:\n\n${lines}`;
      } catch {
        return 'Erro ao carregar pensamentos.';
      }
    }

    case '/suggestions':
    case '/sugestoes': {
      if (!isAdmin) return 'Apenas admins podem ver sugestões.';
      try {
        const suggestions = await require('../optimization').generateSuggestions(persona?.id, 7);
        if (!suggestions.length) return 'Nenhuma sugestão no momento.';
        const lines = suggestions.map(s => `💡 [${s.type}] ${s.title}: ${s.description}`).join('\n\n');
        return `🔧 Sugestões de otimização:\n\n${lines}`;
      } catch {
        return 'Erro ao carregar sugestões.';
      }
    }

    case '/survey':
    case '/enquete': {
      if (!isAdmin) return 'Apenas admins podem gerenciar surveys.';
      return 'Gerencie surveys via painel admin ou /api/admin/surveys.';
    }

    case '/ratings':
    case '/avaliacoes': {
      if (!isAdmin) return 'Apenas admins podem ver avaliações.';
      return 'Verifique avaliações via painel admin ou /api/admin/ratings.';
    }

    case '/followups':
    case '/follow-up': {
      if (!isAdmin) return 'Apenas admins podem gerenciar follow-ups.';
      return 'Gerencie follow-ups via painel admin ou /api/admin/followups.';
    }

    case '/events':
    case '/eventos': {
      const [, subcmd] = args.split(' ');
      if (subcmd === 'stats') {
        const stats = await require('../events').getEventStats(7);
        return `📊 Eventos (7 dias):\n\n• Total: ${stats.total}\n• Por tipo: ${Object.entries(stats.byType || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}`;
      }
      const events = await require('../events').getEventLog({ limit: 5 });
      if (!events.length) return 'Nenhum evento registrado.';
      const lines = events.map(e => `• [${e.event_type}] ${e.created_at}`).join('\n');
      return `📋 Eventos recentes:\n\n${lines}`;
    }

    case '/creative': {
      if (!isAdmin) return 'Apenas admins podem gerar conteúdo visual.';
      return 'Use /api/admin/creatives para gerar conteúdo visual.';
    }

    case '/blog': {
      if (!isAdmin) return 'Apenas admins podem gerenciar blog.';
      const posts = await require('../blog').getAllPosts(persona?.id, 5);
      if (!posts.length) return 'Nenhum post ainda. Use /api/admin/blog para gerar.';
      const lines = posts.map(p => `📝 ${p.title} — ${p.published_at}`).join('\n');
      return `📰 Posts:\n\n${lines}`;
    }

    case '/email': {
      if (!isAdmin) return 'Apenas admins podem enviar emails.';
      return 'Use o painel admin para gerenciar emails.';
    }

    case '/search':
    case '/buscar': {
      const query = args;
      if (!query) return 'Use /search <termo>';
      try {
        const results = await require('../knowledge/store').searchMultiSource(query, null, 5);
        if (!results.length) return `Nenhum resultado para "${query}".`;
        return `🔍 Resultados:\n\n${results.map(r => `• ${r.text?.substring(0, 150)}...`).join('\n\n')}`;
      } catch {
        return 'Erro na busca.';
      }
    }

    case '/quiz': {
      const { listQuizzes } = require('../quiz');
      if (!args || args === 'list') {
        const quizzes = await listQuizzes(persona?.id);
        if (!quizzes.length) return 'Nenhum quiz disponível.';
        const lines = quizzes.map(q => `• ${q.title} (${q.question_count} perguntas)`).join('\n');
        return `📚 Quizzes:\n\n${lines}`;
      }
      return 'Para fazer um quiz, responda quando eu enviar uma pergunta.';
    }

    case '/context':
    case '/contexto': {
      try {
        const history = await require('../memory/session').getHistoryForLLM(sessionId, 5);
        if (!history.length) return 'Nenhum contexto disponível.';
        const lines = history.map(m => `${m.role}: ${m.content?.substring(0, 100)}...`).join('\n');
        return `💬 Contexto recente:\n\n${lines}`;
      } catch {
        return 'Erro ao carregar contexto.';
      }
    }

    case '/reflect':
    case '/refletir': {
      try {
        const history = await require('../memory/session').getHistoryForLLM(sessionId, 10);
        const reflection = await metaRag.reflectPersona(persona, history);
        return `🤔 Reflexão da persona:\n\n${reflection}`;
      } catch {
        return 'Erro ao gerar reflexão.';
      }
    }

    case '/media': {
      if (!isAdmin) return 'Apenas admins podem gerenciar mídia.';
      return 'Use o painel admin para gerenciar mídia.';
    }

    case '/workspace':
    case '/ws': {
      if (!isAdmin) return 'Apenas admins podem gerenciar workspaces.';
      return 'Use /api/admin/workspaces para gerenciar.';
    }

    case '/billing':
    case '/faturamento': {
      if (!isAdmin) return 'Apenas admins podem ver faturamento.';
      return 'Use /api/admin/reports para relatórios.';
    }

    case '/lang':
    case '/idioma': {
      const supportedLangs = ['pt-BR', 'en-US', 'es-ES'];
      if (!args) return `🌐 Idiomas: ${supportedLangs.join(', ')}. Use /lang <código>.`;
      if (!supportedLangs.includes(args)) return `Idioma não suportado. Use: ${supportedLangs.join(', ')}.`;
      return `🌐 Idioma alterado para ${args}.`;
    }

    case '/plan':
    case '/planejar':
    case '/planner': {
      try {
        const history = await require('../memory/session').getHistoryForLLM(sessionId, 5);
        const plan = await metaRag.planAction(persona, history, uid);
        return `📋 Plano de ação:\n\n${plan}`;
      } catch {
        return 'Erro ao gerar plano.';
      }
    }

    case '/history':
    case '/historico': {
      try {
        const history = await require('../memory/session').getHistoryForLLM(sessionId, 20);
        if (!history.length) return 'Nenhum histórico.';
        const lines = history.map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.content?.substring(0, 80)}...`).join('\n');
        return `💬 Histórico:\n\n${lines}`;
      } catch {
        return 'Erro ao carregar histórico.';
      }
    }

    case '/export': {
      if (!isAdmin) return 'Apenas admins podem exportar dados.';
      return 'Use /api/admin/export para exportar dados.';
    }

    case '/stats2':
    case '/estatisticas2': {
      if (!isAdmin) return 'Apenas admins podem ver estatísticas globais.';
      const stats = await require('../events').getEventStats(7);
      const [msgCount] = await pool.execute('SELECT COUNT(*) as cnt FROM persona_messages WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)');
      return `📊 Estatísticas (7 dias):\n\n• Mensagens: ${msgCount[0].cnt}\n• Eventos: ${stats.total}\n\nUse /stats para suas estatísticas pessoais.`;
    }

    case '/config':
    case '/configuracao': {
      if (!isAdmin) return 'Apenas admins podem ver configurações.';
      const configs = ['commerce_enabled', 'rate_limit_user', 'rate_limit_premium'];
      const lines = await Promise.all(configs.map(async (key) => {
        const val = await getSetting(key);
        return `• ${key}: ${val}`;
      }));
      return `⚙️ Configurações:\n\n${lines.join('\n')}`;
    }

    case '/keys':
    case '/addkey':
    case '/removekey':
    case '/togglekey': {
      if (!isAdmin) return 'Apenas admins podem gerenciar chaves API.';
      return 'Gerencie chaves via painel admin ou /api/admin/integrations.';
    }

    case '/blueprints': {
      const { listBlueprints, cloneBlueprint } = require('../blueprints');
      if (!args || args === 'list') {
        const blueprints = await listBlueprints({ is_active: 1 });
        if (!blueprints.length) return 'Nenhum blueprint disponível.';
        const lines = blueprints.slice(0, 5).map(b => `📋 ${b.name} — ${b.category}`).join('\n');
        return `📁 Blueprints:\n\n${lines}\n\nUse /blueprints <id> para ver detalhes ou /blueprints clone <id> para criar persona.`;
      }
      if (args.startsWith('clone ')) {
        const bpId = args.replace('clone ', '').trim();
        try {
          const newPersona = await cloneBlueprint(bpId);
          return `✅ Blueprint clonado como persona: ${newPersona.name}`;
        } catch (err) {
          return `❌ Erro: ${err.message}`;
        }
      }
      if (args === 'categories') {
        const categories = await require('../blueprints').getBlueprintCategories();
        return `📁 Categorias:\n\n${categories.map(c => `• ${c}`).join('\n')}`;
      }
      return 'Use:\n• /blueprints list\n• /blueprints clone <id>\n• /blueprints categories';
    }

    case '/health': {
      try {
        const health = await require('../llm/integrationManager').getHealth();
        const lines = Object.entries(health).filter(([k]) => k.includes('llm') || k.includes('tts')).map(([k, v]) => {
          const icon = v.healthy ? '✅' : '❌';
          return `${icon} ${k}: ${v.latencyMs ? `${v.latencyMs}ms` : v.error || 'OK'}`;
        });
        return `🏥 Health:\n\n${lines.join('\n')}`;
      } catch {
        return 'Erro ao verificar health.';
      }
    }

    case '/settings':
    case '/set': {
      if (!isAdmin) return 'Apenas admins podem gerenciar settings.';
      if (!args) {
        const all = await require('../settings').getAllSettings();
        return `⚙️ Settings (${Object.keys(all).length} chaves):\n\n${Object.keys(all).slice(0, 10).map(k => `• ${k}`).join('\n')}\n\nUse /set <key> <value> para alterar.`;
      }
      const [key, ...valParts] = args.split(' ');
      const value = valParts.join(' ');
      if (!value) {
        const current = await getSetting(key);
        return `⚙️ ${key}: ${current}`;
      }
      await require('../settings').setSetting(key, value);
      return `✅ ${key} = ${value}`;
    }

    case '/users':
    case '/promote':
    case '/ban': {
      if (!isAdmin) return 'Apenas admins podem gerenciar usuários.';
      return 'Gerencie usuários via painel admin ou /api/admin/users.';
    }

    case '/silence':
    case '/mute': {
      const count = args === 'off' ? -1 : args === 'infinite' ? 999999 : parseInt(args) || 1;
      if (count === -1) {
        await setSilence(sessionId, 0);
        return '🔊 Persona reativada.';
      }
      await setSilence(sessionId, count);
      return `🤫 Persona silenciada por ${count} mensagem${count > 1 ? 's' : ''}. Use /silence off para reativar.`;
    }

    case '/ajuda':
    case '/help': {
      const isPT = !lang || lang === 'pt-BR';
      if (isPT) {
        return `📚 Comandos disponíveis:

🛠️ Geral:
/help — Mostrar esta ajuda
/stats — Suas estatísticas
/myprofile — Seu perfil
/persona — Listar/trocar personas
/voice — Ver/trocar voz

📋 Gestão:
/tasks — Suas tarefas
/calendar — Eventos agendados
/contacts — Seus contatos
/automations — Suas automações
/dashboard — Visão geral
/goals — Metas e progresso
/stages — Estágios de conversa
/orgmem — Memória organizacional

⭐ Gamificação:
/xp — Seu XP e nível
/progress — Seu progresso
/cognitive — Estado cognitivo

🔧 Admin:
/broadcast — Campanhas
/health — Saúde do sistema
/settings — Configurações

💬 Chat:
/search <termo> — Buscar conhecimento
/quiz — Fazer um quiz
/context — Ver contexto recente
/reflect — Reflexão da persona

Comandos de commerce (se ativo):
• Ver produtos, adicionar ao carrinho, fazer pedido via conversa natural`;
      }
      return `📚 Available commands:

/help — This help
/stats — Your stats
/myprofile — Your profile
/persona — List/switch personas
/tasks — Your tasks
/calendar — Your events
/goals — Goals and progress
/xp — Your XP and level`;
    }

    case '/ping': {
      return '🏓 Pong! O bot está funcionando.';
    }

    case '/bonjour': {
      return 'Bonjour! Comment puis-je vous aider?';
    }

    case '/hola': {
      return '¡Hola! ¿En qué puedo ayudarte?';
    }

    case '/hi': {
      return 'Hi! How can I help you?';
    }

    case '/piada': {
      try {
        const res = await fetch('https://v2.jokeapi.dev/joke/Any?lang=pt&safe-mode');
        const data = await res.json();
        if (data.type === 'single') return `😄 ${data.joke}`;
        return `😄 ${data.setup}\n\n${data.delivery}`;
      } catch {
        return '😄 Não consegui uma piada agora. Tente novamente!';
      }
    }

    case '/fato': {
      try {
        const res = await fetch('https://catfact.ninja/fact');
        const data = await res.json();
        return `🐱 Fato: ${data.fact}`;
      } catch {
        return '🐱 Não consegui um fato agora.';
      }
    }

    case '/clima': {
      const city = args || 'São Paulo';
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`);
        const geo = await geoRes.json();
        if (!geo.length) return `Não encontrei a cidade "${city}".`;
        const { lat, lon } = geo[0];
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`);
        const weather = await weatherRes.json();
        const temp = weather.current.temperature_2m;
        const code = weather.current.weather_code;
        const desc = getWeatherDesc(code);
        return `🌤️ Clima em ${geo[0].display_name.split(',')[0]}:\n\n• Temperatura: ${temp}°C\n• Condição: ${desc}\n• Vento: ${weather.current.wind_speed_10m} km/h`;
      } catch {
        return 'Erro ao consultar clima.';
      }
    }

    case '/broadcast': {
      if (!isAdmin) return 'Apenas admins podem gerenciar broadcasts.';
      const { listBroadcasts } = require('../broadcast');
      if (!args || args === 'list') {
        const list = await listBroadcasts(persona?.id, 10);
        if (list.length === 0) return '📭 Nenhuma campanha criada.';
        const lines = list.map(b => `📌 ${b.title} — ${b.segment} — ${b.status}`);
        return `📬 Campanhas:\n\n${lines.join('\n')}`;
      }
      if (args.startsWith('send ')) {
        const bcId = args.split(' ')[1];
        if (!bcId) return 'Uso: /broadcast send <id>';
        const result = await require('../broadcast').sendBroadcast(bcId);
        if (result.error) return `❌ ${result.error}`;
        return `✅ Campanha enviada para ${result.target_count} contatos!`;
      }
      return '📬 Comandos:\n• /broadcast list — Listar campanhas\n• /broadcast send <id> — Enviar campanha\n• Use a API admin para criar campanhas';
    }

    default:
      return null;
  }
}

function getWeatherDesc(code) {
  const codes = { 0: 'Céu limpo', 1: 'Poucas nuvens', 2: 'Nuvens dispersas', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina', 51: 'Garoa leve', 53: 'Garoa', 55: 'Garoa intensa', 61: 'Chuva leve', 63: 'Chuva', 65: 'Chuva forte', 71: 'Neve leve', 73: 'Neve', 75: 'Neve forte', 80: 'Pancadas', 81: 'Aguaceiros', 82: 'Aguaceiros fortes', 95: 'Tempestade', 96: 'Tempestade com granizo', 99: 'Tempestade forte' };
  return codes[code] || 'Desconhecido';
}

module.exports = { handleChatCommand };