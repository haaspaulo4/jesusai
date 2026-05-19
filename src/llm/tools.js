const { searchVerses } = require('../knowledge/store');
const { pool } = require('../db');
const { getAllPosts, generatePost } = require('../blog');
const { sendEmail } = require('../email');
const { getActivePersona } = require('../persona/config');
const { getSetting } = require('../settings');
const personaManager = require('../persona/manager');
const skillsModule = require('../skills');
const agent = require('../agent');
const goalsModule = require('../goals');
const stagesModule = require('../stages');
const orgMemoryModule = require('../orgmemory');
const gamificationModule = require('../gamification');
const progressModule = require('../progress');
const cognitiveModule = require('../cognitive');
const overrideModule = require('../override');
const thoughtsModule = require('../thoughts');
const optimizationModule = require('../optimization');
const blueprintsModule = require('../blueprints');
const creativeEngine = require('../creative');

async function resolvePersonaId(personaIdOrName) {
  if (!personaIdOrName) return null;
  if (personaIdOrName === 'default' || personaIdOrName === 'jesus') return 'jesus';
  try {
    const persona = await personaManager.getPersona(personaIdOrName);
    if (persona) return persona.id;
    const personas = await personaManager.listPersonas();
    const found = personas.find(p => p.name.toLowerCase() === personaIdOrName.toLowerCase() || p.id.toLowerCase() === personaIdOrName.toLowerCase());
    return found ? found.id : null;
  } catch { return null; }
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'bible_lookup',
      description: 'Busca versículos bíblicos por tema, palavra ou referência. Use quando a pessoa pergunta sobre a Bíblia ou um tema espiritual.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Tema, palavra ou referência bíblica para buscar (ex: "amor", "João 3:16", "perdão")',
          },
          limit: {
            type: 'integer',
            description: 'Número máximo de versículos (padrão: 5)',
            default: 5,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'user_stats',
      description: 'Retorna estatísticas do usuário: número de sessões, mensagens, tópicos, tempo de uso.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'ID do usuário',
          },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_devotional',
      description: 'Busca ou gera o devocional do dia.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_prayer_request',
      description: 'Registra um pedido de oração.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'ID do usuário' },
          request: { type: 'string', description: 'O pedido de oração' },
        },
        required: ['user_id', 'request'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_sessions',
      description: 'Lista as sessões de conversa do usuário.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'ID do usuário' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_settings',
      description: 'Atualiza configurações do bot. Apenas admins.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Chave da configuração' },
          value: { type: 'string', description: 'Novo valor' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_users',
      description: 'Gerencia usuários: listar, banir, promover, rebaixar. Apenas admins.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'ban', 'promote', 'demote', 'info'], description: 'Ação' },
          user_id: { type: 'string', description: 'ID do usuário alvo' },
          role: { type: 'string', enum: ['user', 'premium', 'admin'], description: 'Novo role' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email_to_user',
      description: 'Envia email para um usuário. Apenas admins.',
      parameters: {
        type: 'object',
        properties: {
          to_email: { type: 'string', description: 'Email do destinatário' },
          subject: { type: 'string', description: 'Assunto do email' },
          body: { type: 'string', description: 'Corpo do email' },
        },
        required: ['to_email', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_persona',
      description: 'Cria uma nova persona com IA. Descreva o tipo de assistente virtual desejado e a IA gera identidade, regras, voz e personalidade automaticamente em 3 idiomas. Use esta ferramenta quando o usuário pedir para criar uma persona ou descrever um assistente que precisa.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Descrição detalhada da persona (ex: "hipnoterapeuta especialista em autoestima, tem 1 ebook gratuito e vende áudios de auto-hipnose")' },
          name: { type: 'string', description: 'Nome opcional da persona. Se não fornecido, a IA escolhe.' },
          lang: { type: 'string', enum: ['pt-BR', 'en-US', 'es-ES'], description: 'Idioma principal da persona. Padrão: pt-BR' },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_personas',
      description: 'Lista todas as personas disponíveis no sistema. Use quando o usuário quiser ver, escolher ou gerenciar personas.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_skill',
      description: 'Cria uma skill (habilidade/action) para uma persona. Skills são ações reutilizáveis que a persona pode executar, como "gerar artigo de blog", "criar plano de exercício", "enviar email", etc. Use quando o usuário pedir para criar uma habilidade/capacidade para uma persona.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da skill (ex: "gerar_artigo_blog", "plano_exercicio", "enviar_email")' },
          description: { type: 'string', description: 'Descrição do que a skill faz' },
          persona_id: { type: 'string', description: 'ID da persona dona da skill. Use null para skill global (disponível para todas).' },
          type: { type: 'string', enum: ['action', 'generator', 'communication', 'analysis', 'workflow'], description: 'Tipo da skill. action=ação simples, generator=gera conteúdo, communication=comunicação, analysis=análise, workflow=fluxo complexo' },
          prompt: { type: 'string', description: 'Prompt de sistema completo que define como a skill funciona. Use {input} para o input do usuário e {context} para contexto adicional.' },
          output_format: { type: 'string', enum: ['text', 'json', 'markdown', 'html'], description: 'Formato de saída da skill. Padrão: text' },
        },
        required: ['name', 'description', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'invoke_skill',
      description: 'Invoca/executa uma skill de uma persona. Use quando o usuário pedir para executar uma ação específica que foi registrada como skill.',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string', description: 'ID da skill a executar' },
          input: { type: 'string', description: 'Input do usuário para a skill' },
        },
        required: ['skill_id', 'input'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'Lista skills disponíveis. Pode filtrar por persona.',
      parameters: {
        type: 'object',
        properties: {
          persona_id: { type: 'string', description: 'Filtrar por persona (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_knowledge_source',
      description: 'Registra uma nova fonte de conhecimento para uma persona. As fontes podem ser textos, URLs, ou descrições de conteúdo.',
      parameters: {
        type: 'object',
        properties: {
          source_id: { type: 'string', description: 'ID único da fonte (ex: "vendas-ebook", "hipnose-audio")' },
          name: { type: 'string', description: 'Nome da fonte (ex: "Ebook de Vendas", "Áudios de Auto-hipnose")' },
          description: { type: 'string', description: 'Descrição do conteúdo da fonte' },
          persona_id: { type: 'string', description: 'ID da persona para associar esta fonte' },
        },
        required: ['source_id', 'name', 'persona_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_tasks',
      description: 'Gerencia tarefas: criar, listar, atualizar, deletar. Use para CRUD de tarefas do usuário ou da persona.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'overdue'], description: 'Ação: create, list, update, delete, overdue' },
          task_id: { type: 'string', description: 'ID da tarefa (para update/delete)' },
          title: { type: 'string', description: 'Título da tarefa (para create)' },
          description: { type: 'string', description: 'Descrição da tarefa' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: 'Status da tarefa' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Prioridade' },
          due_date: { type: 'string', description: 'Data limite (ISO format, ex: 2025-06-15T10:00:00)' },
          persona_id: { type: 'string', description: 'Persona associada à tarefa' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_calendar',
      description: 'Gerencia eventos de calendário/agenda: criar, listar, atualizar, deletar. Use para agendar reuniões, lembretes, compromissos.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'upcoming'], description: 'Ação: create, list, update, delete, upcoming' },
          event_id: { type: 'string', description: 'ID do evento (para update/delete)' },
          title: { type: 'string', description: 'Título do evento' },
          description: { type: 'string', description: 'Descrição do evento' },
          event_type: { type: 'string', enum: ['meeting', 'reminder', 'task', 'followup', 'call', 'other'], description: 'Tipo do evento' },
          start_time: { type: 'string', description: 'Data/hora início (ISO format)' },
          end_time: { type: 'string', description: 'Data/hora fim (ISO format)' },
          location: { type: 'string', description: 'Local do evento' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Lista de emails dos participantes' },
          persona_id: { type: 'string', description: 'Persona associada' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_contacts',
      description: 'Gerencia contatos/CRM: criar, listar, atualizar, deletar. Use para gerenciar leads, clientes, contatos da persona.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'search'], description: 'Ação: create, list, update, delete, search' },
          contact_id: { type: 'string', description: 'ID do contato (para update/delete)' },
          name: { type: 'string', description: 'Nome do contato' },
          email: { type: 'string', description: 'Email do contato' },
          phone: { type: 'string', description: 'Telefone do contato' },
          company: { type: 'string', description: 'Empresa do contato' },
          role: { type: 'string', description: 'Cargo do contato' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags/categorias do contato' },
          notes: { type: 'string', description: 'Notas sobre o contato' },
          stage: { type: 'string', enum: ['lead', 'prospect', 'customer', 'churned', 'vip'], description: 'Estágio no funil' },
          persona_id: { type: 'string', description: 'Persona associada' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_automations',
      description: 'Gerencia automações: criar, listar, atualizar, deletar. Automações executam ações baseadas em gatilhos (keywords, intervalo de mensagens, agendamento).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'toggle'], description: 'Ação: create, list, update, delete, toggle' },
          automation_id: { type: 'string', description: 'ID da automação (para update/delete/toggle)' },
          name: { type: 'string', description: 'Nome da automação' },
          description: { type: 'string', description: 'Descrição da automação' },
          trigger_type: { type: 'string', enum: ['keyword', 'interval_messages', 'schedule', 'on_contact_create', 'manual'], description: 'Tipo de gatilho' },
          trigger_config: { type: 'object', description: 'Configuração do gatilho: {keywords: [...], every_n: 10, cron: "0 9 * * *"}' },
          action_type: { type: 'string', enum: ['message', 'create_task', 'send_email', 'webhook', 'switch_persona', 'invoke_skill'], description: 'Tipo de ação' },
          action_config: { type: 'object', description: 'Configuração da ação: {message: "...", task_title: "...", email_to: "..."}' },
          is_active: { type: 'boolean', description: 'Se a automação está ativa' },
          persona_id: { type: 'string', description: 'Persona associada' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard',
      description: 'Retorna uma visão geral do dashboard: tarefas, eventos, contatos, automações, personas, skills. Use quando o usuário pedir um resumo geral.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_history',
      description: 'Busca histórico de conversas da persona. Use quando o usuário pedir para ver conversas anteriores ou contexto.',
      parameters: {
        type: 'object',
        properties: {
          persona_id: { type: 'string', description: 'Filtrar por persona (opcional)' },
          limit: { type: 'integer', description: 'Número de mensagens (padrão: 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_goals',
      description: 'Gerencia metas/objetivos: criar, listar, atualizar, deletar, progresso. Use para definir e acompanhar objetivos estratégicos, táticos e operacionais da persona ou do usuário.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'progress', 'hierarchy'], description: 'Ação: create, list, update, delete, progress, hierarchy' },
          goal_id: { type: 'string', description: 'ID da meta (para update/delete)' },
          title: { type: 'string', description: 'Título da meta' },
          description: { type: 'string', description: 'Descrição detalhada da meta' },
          goal_type: { type: 'string', enum: ['strategic', 'tactical', 'operational', 'learning', 'relationship', 'financial', 'growth'], description: 'Tipo da meta' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Prioridade' },
          status: { type: 'string', enum: ['active', 'paused', 'completed', 'abandoned'], description: 'Status da meta' },
          progress: { type: 'integer', description: 'Progresso (0-100)' },
          target_metric: { type: 'string', description: 'Métrica alvo (ex: "vendas_mensais")' },
          target_value: { type: 'string', description: 'Valor alvo (ex: "10000")' },
          current_value: { type: 'string', description: 'Valor atual da métrica' },
          parent_goal_id: { type: 'string', description: 'ID da meta pai (para sub-metas)' },
          due_date: { type: 'string', description: 'Data limite (ISO format)' },
          persona_id: { type: 'string', description: 'Persona associada à meta' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_conversation_stages',
      description: 'Gerencia estágios de conversa: criar, listar, atualizar, deletar, avançar estágio do usuário. Use para definir o funil/estágios de conversa de uma persona e acompanhar em qual estágio cada usuário está.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'get_user_stage', 'set_user_stage', 'advance_user_stage', 'init_defaults'], description: 'Ação' },
          stage_id: { type: 'string', description: 'ID do estágio (para update/delete)' },
          name: { type: 'string', description: 'Nome do estágio' },
          description: { type: 'string', description: 'Descrição do estágio' },
          stage_order: { type: 'integer', description: 'Ordem do estágio (0, 1, 2...)' },
          triggers: { type: 'object', description: 'Gatilhos para avançar (JSON)' },
          responses: { type: 'object', description: 'Respostas sugeridas para o estágio (JSON)' },
          persona_id: { type: 'string', description: 'Persona associada' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_org_memory',
      description: 'Gerencia memória organizacional: produtos, serviços, preços, equipe, políticas, FAQ, processos. Use para armazenar e buscar conhecimento operacional da empresa/negócio.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'update', 'delete', 'search'], description: 'Ação: create, list, update, delete, search' },
          memory_id: { type: 'string', description: 'ID da memória (para update/delete)' },
          category: { type: 'string', enum: ['products', 'services', 'pricing', 'team', 'policies', 'faq', 'processes', 'brand', 'market', 'custom'], description: 'Categoria da memória' },
          title: { type: 'string', description: 'Título' },
          content: { type: 'string', description: 'Conteúdo/descrição detalhada' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags para busca' },
          priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Prioridade' },
          search_query: { type: 'string', description: 'Query de busca (para action=search)' },
          persona_id: { type: 'string', description: 'Persona associada' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_xp',
      description: 'Gerencia gamificação: XP, níveis, streaks, badges. Use para adicionar XP, verificar progresso, listar leaderboard, conceder conquistas.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'get', 'leaderboard', 'check_badges', 'add_badge', 'streak'], description: 'Ação: add (XP), get (status), leaderboard, check_badges, add_badge, streak (update)' },
          amount: { type: 'integer', description: 'Quantidade de XP (para action=add)' },
          reason: { type: 'string', description: 'Motivo do XP (para action=add)' },
          badge_id: { type: 'string', description: 'ID do badge (para action=add_badge)' },
          badge_name: { type: 'string', description: 'Nome do badge (para action=add_badge)' },
          limit: { type: 'integer', description: 'Limite do leaderboard (padrão: 10)' },
          persona_id: { type: 'string', description: 'Persona associada' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_progress',
      description: 'Gerencia estado de progresso do usuário: mastery, weak_topics, engagement, study_streak, learning_style. Use para rastrear e atualizar o progresso personalizado de cada usuário com cada persona.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'update', 'increment', 'push', 'remove'], description: 'Ação: get (ler estado), set (substituir), update (merge), increment (somar campo), push (adicionar a array), remove (remover de array)' },
          state: { type: 'object', description: 'Objeto de estado completo (para action=set/update)' },
          field: { type: 'string', description: 'Nome do campo (para action=increment/push/remove)' },
          value: { type: 'string', description: 'Valor (para action=increment/push/remove)' },
          amount: { type: 'integer', description: 'Quantidade (para action=increment)' },
          persona_id: { type: 'string', description: 'Persona associada' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cognitive_state',
      description: 'Retorna o estado cognitivo do usuário: emoção, intenção, risco de churn, probabilidade de conversão, engajamento. Use para entender o contexto emocional e comportamental do usuário.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'ID do usuário' },
          persona_id: { type: 'string', description: 'ID da persona' },
          history: { type: 'boolean', description: 'Retornar histórico ao invés do último estado' },
          stats: { type: 'boolean', description: 'Retornar estatísticas agregadas' },
          days: { type: 'integer', description: 'Período em dias para estatísticas (padrão: 7)' },
        },
        required: ['user_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'human_override',
      description: 'Gerencia intervenção humana: ativar/desativar override, onde um humano assume a conversa ou aprova respostas. Use quando quiser passar o controle para um atendente humano.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['activate', 'deactivate', 'status', 'list'], description: 'Ação: activate, deactivate, status, list' },
          session_id: { type: 'string', description: 'ID da sessão' },
          override_type: { type: 'string', enum: ['full', 'approval', 'observation'], description: 'Tipo: full (humano assume), approval (humano aprova), observation (humano observa)' },
          human_message: { type: 'string', description: 'Mensagem do humano para enviar' },
          persona_id: { type: 'string', description: 'ID da persona' },
        },
        required: ['action', 'session_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_suggestions',
      description: 'Retorna sugestões de auto-otimização para a persona: ajustes de tom, retenção, engajamento, automações. Use quando quiser melhorar a persona com base em dados reais.',
      parameters: {
        type: 'object',
        properties: {
          persona_id: { type: 'string', description: 'ID da persona' },
          days: { type: 'integer', description: 'Período em dias para análise (padrão: 7)' },
        },
        required: ['persona_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_blueprints',
      description: 'Gerencia blueprints de persona: listar, obter, clonar para nova persona, aplicar a persona existente, criar blueprint a partir de persona, buscar por categoria/nicho. Blueprints são templates clonáveis de persona.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'get', 'clone', 'apply', 'create_from_persona', 'categories', 'niches', 'stats'], description: 'Ação: list=lista blueprints, get=detalhes, clone=clona como nova persona, apply=aplica a persona existente, create_from_persona=salva persona como blueprint, categories=lista categorias, niches=lista nichos, stats=estatísticas' },
          blueprint_id: { type: 'string', description: 'ID do blueprint (para get, clone, apply)' },
          persona_id: { type: 'string', description: 'ID da persona (para apply, create_from_persona)' },
          category: { type: 'string', description: 'Filtrar por categoria (ex: business, health, education, religious, legal, fitness)' },
          niche: { type: 'string', description: 'Filtrar por nicho (ex: vendas, terapia, direito, fitness)' },
          search: { type: 'string', description: 'Buscar blueprints por nome ou descrição' },
          overrides: { type: 'object', description: 'Sobreposições ao clonar (name, name_en, name_es, etc)' },
          blueprint_data: { type: 'object', description: 'Dados do blueprint ao criar (name, description, category, niche, tags)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_visual',
      description: 'Cria conteúdo visual (post, banner, thumbnail, carousel slide, blog cover) usando templates prontos. Retorna HTML que pode ser renderizado como imagem.',
      parameters: {
        type: 'object',
        properties: {
          template_id: { type: 'string', enum: ['quote_post', 'announcement_post', 'carousel_slide', 'minimal_blog'], description: 'Template: quote_post=post com citação, announcement_post=post de anúncio, carousel_slide=slide de carrossel, minimal_blog=capa de blog' },
          text: { type: 'string', description: 'Texto principal do conteúdo visual' },
          title: { type: 'string', description: 'Título (para announcement_post, carousel_slide, minimal_blog)' },
          subtitle: { type: 'string', description: 'Subtítulo opcional' },
          author: { type: 'string', description: 'Autor da citação (para quote_post)' },
          tag: { type: 'string', description: 'Tag/categoria (ex: "Novidade", "Inspiração")' },
          cta_text: { type: 'string', description: 'Texto do botão CTA (para announcement_post)' },
          primary_color: { type: 'string', description: 'Cor principal (hex, ex: #1a1a2e)' },
          secondary_color: { type: 'string', description: 'Cor secundária (hex, ex: #16213e)' },
          accent_color: { type: 'string', description: 'Cor de destaque (hex, ex: #e94560)' },
          text_color: { type: 'string', description: 'Cor do texto (hex, ex: #ffffff)' },
          size: { type: 'string', description: 'Tamanho: instagram_post, instagram_story, instagram_carousel, facebook_post, twitter_post, linkedin_post, youtube_thumbnail, blog_banner, ebook_cover' },
          bullet_points: { type: 'array', items: { type: 'string' }, description: 'Lista de pontos para carousel_slide' },
          slide_number: { type: 'integer', description: 'Número do slide (para carousel)' },
          total_slides: { type: 'integer', description: 'Total de slides (para carousel)' },
        },
        required: ['template_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_visual_templates',
      description: 'Lista templates visuais disponíveis e tamanhos de imagem para criação de conteúdo.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_business_config',
      description: 'Gerencia configuração de negócio da persona: horários, serviços, produtos, FAQ, preços, equipe, endereço, redes sociais, políticas, agendamento. Use para configurar informações operacionais do negócio.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'update', 'reset'], description: 'Ação: get=buscar config completa, update=atualizar campos específicos (merge), reset=restaurar padrões' },
          persona_id: { type: 'string', description: 'ID da persona' },
          updates: { type: 'object', description: 'Campos para atualizar (para action=update). Qualquer campo do business_config: name, tagline, description, logo_url, phone, email, whatsapp, address, city, state, country, business_hours, services, products, faq, pricing, social, payment_methods, policies, branding, scheduling, highlights, team.' },
        },
        required: ['action', 'persona_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_quizzes',
      description: 'Gerencia quizzes: criar, listar, buscar, gerar via LLM, ver estatísticas e respostas. Use para criar quizzes interativos para engajamento do usuário.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'get', 'create', 'generate', 'stats', 'progress'], description: 'Ação: list=quizzes ativos, get=detalhes, create=criar quiz, generate=gerar via LLM, stats=estatísticas, progress=progresso do usuário' },
          quiz_id: { type: 'string', description: 'ID do quiz (para get, stats)' },
          persona_id: { type: 'string', description: 'ID da persona para filtrar' },
          topic: { type: 'string', description: 'Tópico do quiz (para generate)' },
          question_count: { type: 'integer', description: 'Número de questões (para generate/create, padrão: 5)' },
          title: { type: 'string', description: 'Título do quiz (para create)' },
          description: { type: 'string', description: 'Descrição do quiz (para create)' },
          quiz_type: { type: 'string', enum: ['multiple_choice', 'true_false', 'open_ended', 'ordered', 'fill_blank', 'survey'], description: 'Tipo do quiz (para create)' },
          questions: { type: 'array', description: 'Array de questões (para create). Cada questão: {id, text, type, options, correctAnswer, explanation, points}' },
          xp_reward: { type: 'integer', description: 'Recompensa XP ao completar (padrão: 10)' },
          user_id: { type: 'string', description: 'ID do usuário (para progress)' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_media',
      description: 'Gerencia biblioteca de mídia: listar, buscar, ver galeria, estatísticas, criar via URL. Use para acessar e compartilhar imagens, vídeos, áudio e documentos.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'get', 'gallery', 'stats', 'folders', 'create'], description: 'Ação: list=listar mídia, get=detalhes, gallery=galeria por tipo, stats=estatísticas, folders=pastas, create=criar registro' },
          media_id: { type: 'string', description: 'ID da mídia (para get)' },
          persona_id: { type: 'string', description: 'ID da persona para filtrar' },
          type: { type: 'string', enum: ['image', 'video', 'audio', 'document', 'presentation', 'spreadsheet', 'archive', 'other'], description: 'Tipo de mídia para filtrar' },
          folder: { type: 'string', description: 'Pasta para filtrar' },
          search: { type: 'string', description: 'Busca por título ou descrição' },
          url: { type: 'string', description: 'URL da mídia (para create)' },
          title: { type: 'string', description: 'Título (para create)' },
          description: { type: 'string', description: 'Descrição (para create)' },
        },
        required: ['action'],
      },
    },
  },
];

async function executeTool(name, args, context = {}) {
  const persona = getActivePersona();
  const lang = context.lang || 'pt-BR';

  switch (name) {
    case 'bible_lookup': {
      const limit = args.limit || 5;
      const results = await searchVerses(args.query, limit);
      if (results.length === 0) {
        return { result: 'Nenhum versículo encontrado.', verses: [] };
      }
      return {
        result: results.map(v => `${v.reference}: "${v.text}"`).join('\n'),
        verses: results.map(v => ({ reference: v.reference, text: v.text })),
      };
    }

    case 'user_stats': {
      const userId = args.user_id || context.userId || 'user_default';
      try {
        const [sessionRows] = await pool.execute(
          'SELECT COUNT(*) as total FROM sessions WHERE user_id = ?',
          [userId]
        );
        const [msgRows] = await pool.execute(
          `SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ?`,
          [userId]
        );
        const xpData = await gamificationModule.getXp(userId, context.personaId || 'jesus');
        const profile = await pool.execute('SELECT * FROM profiles WHERE id = ?', [userId]);
        const p = profile[0].length > 0 ? profile[0][0] : null;
        const [feedbackRows] = await pool.execute(
          'SELECT COUNT(*) as total FROM feedback WHERE user_id = ?',
          [userId]
        );
        return {
          sessions: sessionRows[0].total,
          messages: msgRows[0].total,
          xp: xpData.xp,
          level: xpData.level,
          streak: xpData.streak,
          topics: p ? (typeof p.topics === 'string' ? JSON.parse(p.topics) : p.topics || []) : [],
          emotions: p ? (typeof p.emotions === 'string' ? JSON.parse(p.emotions) : p.emotions || []) : [],
          feedback_count: feedbackRows[0].total,
        };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'get_daily_devotional': {
      try {
        const today = new Date();
        const slug = `palavra-${today.toISOString().split('T')[0]}`;
        const [posts] = await pool.execute('SELECT * FROM posts WHERE slug = ?', [slug]);
        if (posts.length > 0) {
          return { title: posts[0].title, verse: posts[0].verse, content: posts[0].content };
        }
        const post = await generatePost(today);
        return { title: post.title, verse: post.verse, content: post.content };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'send_prayer_request': {
      const userId = args.user_id || context.userId || 'user_default';
      try {
        await pool.execute(
          'UPDATE profiles SET prayer_requests = JSON_ARRAY_APPEND(COALESCE(prayer_requests, JSON_ARRAY()), "$", ?) WHERE id = ?',
          [args.request, userId]
        );
        const [checkRows] = await pool.execute('SELECT id FROM profiles WHERE id = ?', [userId]);
        if (checkRows.length === 0) {
          await pool.execute(
            'INSERT INTO profiles (id, prayer_requests) VALUES (?, JSON_ARRAY(?))',
            [userId, args.request]
          );
        }
        return { success: true, message: 'Pedido de oração registrado.' };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'list_sessions': {
      const userId = args.user_id || context.userId || 'user_default';
      try {
        const [rows] = await pool.execute(
          `SELECT s.id, s.user_name, s.summary, s.last_activity, 
           (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as msg_count
           FROM sessions s WHERE s.user_id = ? ORDER BY s.last_activity DESC LIMIT 10`,
          [userId]
        );
        return { sessions: rows.map(r => ({
          id: r.id,
          name: r.user_name,
          summary: r.summary ? r.summary.substring(0, 100) : '',
          lastActivity: r.last_activity,
          messageCount: r.msg_count,
        }))};
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'update_settings': {
      if (!context.isAdmin) {
        return { error: 'Apenas administradores podem alterar configurações.' };
      }
      try {
        const { setSetting } = require('../settings');
        await setSetting(args.key, args.value);
        return { success: true, message: `Configuração "${args.key}" atualizada para "${args.value}".` };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'manage_users': {
      if (!context.isAdmin) {
        return { error: 'Apenas administradores podem gerenciar usuários.' };
      }

      if (args.action === 'list') {
        const [rows] = await pool.execute('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 50');
        return { users: rows };
      }

      if (args.action === 'info' && args.user_id) {
        const [rows] = await pool.execute('SELECT id, email, name, role, created_at FROM users WHERE id = ?', [args.user_id]);
        if (rows.length === 0) return { error: 'Usuário não encontrado.' };
        return { user: rows[0] };
      }

      if ((args.action === 'promote' || args.action === 'demote') && args.user_id && args.role) {
        const validRoles = ['user', 'premium', 'admin'];
        if (!validRoles.includes(args.role)) return { error: `Role inválido: ${args.role}` };
        await pool.execute('UPDATE users SET role = ? WHERE id = ?', [args.role, args.user_id]);
        return { success: true, message: `Usuário ${args.user_id} agora é ${args.role}.` };
      }

      if (args.action === 'ban' && args.user_id) {
        await pool.execute('UPDATE users SET role = ? WHERE id = ?', ['banned', args.user_id]);
        return { success: true, message: `Usuário ${args.user_id} banido.` };
      }

      return { error: 'Ação não reconhecida.' };
    }

    case 'send_email_to_user': {
      if (!context.isAdmin) {
        return { error: 'Apenas administradores podem enviar emails.' };
      }
      try {
        await sendEmail({ to: args.to_email, subject: args.subject, html: args.body });
        return { success: true, message: `Email enviado para ${args.to_email}.` };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'create_persona': {
      try {
        const metaRag = require('../persona/meta-rag');
        const description = args.description;
        if (!description) return { error: 'description é obrigatório' };
        const options = {};
        if (args.name) options.name = args.name;
        if (args.lang) options.lang = args.lang;
        const persona = await metaRag.createPersonaFromDescription(description, context.userId, options);
        personaManager.invalidateCache();
        await personaManager.loadPersonas();
        return {
          success: true,
          message: `Persona "${persona.name}" criada com sucesso!`,
          persona: {
            id: persona.id,
            name: persona.name,
            nameEn: persona.nameEn,
            nameEs: persona.nameEs,
            knowledgeSources: persona.knowledgeSources,
          },
          next_steps: 'Para adicionar conhecimento (PDFs, DOCX, texto, áudio), use /api/admin/knowledge/upload ou peça no chat. Para criar skills, use create_skill.',
        };
      } catch (err) {
        return { error: `Erro ao criar persona: ${err.message}` };
      }
    }

    case 'list_personas': {
      try {
        const metaRag = require('../persona/meta-rag');
        personaManager.invalidateCache();
        await personaManager.loadPersonas();
        const personas = await metaRag.listAvailablePersonas();
        return {
          personas: personas.map(p => ({
            id: p.id,
            name: p.name,
            nameEn: p.nameEn,
            nameEs: p.nameEs,
            isActive: p.isActive,
            knowledgeSources: p.knowledgeSources || [],
          })),
          total: personas.length,
        };
      } catch (err) {
        return { error: `Erro ao listar personas: ${err.message}` };
      }
    }

    case 'create_skill': {
      try {
        const skillData = {
          name: args.name,
          description: args.description || '',
          persona_id: args.persona_id || null,
          type: args.type || 'action',
          prompt: args.prompt,
          output_format: args.output_format || 'text',
          parameters: args.parameters || null,
        };
        const skill = await skillsModule.createSkill(skillData);
        return {
          success: true,
          message: `Skill "${skill.name}" criada com sucesso!`,
          skill: { id: skill.id, name: skill.name, type: skill.type, persona_id: skill.persona_id },
        };
      } catch (err) {
        return { error: `Erro ao criar skill: ${err.message}` };
      }
    }

    case 'invoke_skill': {
      try {
        const result = await skillsModule.invokeSkill(args.skill_id, args.input, context);
        return result;
      } catch (err) {
        return { error: `Erro ao invocar skill: ${err.message}` };
      }
    }

    case 'list_skills': {
      try {
        const filters = {};
        if (args.persona_id) filters.persona_id = args.persona_id;
        const skills = await skillsModule.listSkills(filters);
        return {
          skills: skills.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            description: s.description,
            persona_id: s.persona_id,
            is_active: s.is_active,
          })),
          total: skills.length,
        };
      } catch (err) {
        return { error: `Erro ao listar skills: ${err.message}` };
      }
    }

    case 'add_knowledge_source': {
      try {
        const { saveUploadedSource } = require('../knowledge/config');
        const sourceConfig = {
          id: args.source_id,
          name: args.name,
          type: 'text',
          enabled: true,
          dataPath: require('path').join(require('path').resolve(__dirname, '..', 'data'), `${args.source_id}_documents.json`),
          indexPath: require('path').join(require('path').resolve(__dirname, '..', 'data'), `${args.source_id}_index.json`),
          searchFields: ['reference', 'text'],
          defaultTopK: 8,
          contextTemplate: {
            'pt-BR': `CONHECIMENTO DE ${args.name.toUpperCase()}:\n{context}`,
            'en-US': `${args.name.toUpperCase()} KNOWLEDGE:\n{context}`,
            'es-ES': `CONOCIMIENTO DE ${args.name.toUpperCase()}:\n{context}`,
          },
        };
        await saveUploadedSource(sourceConfig);
        const persona = await personaManager.getPersona(args.persona_id);
        if (persona) {
          const currentSources = persona.knowledgeSources || [];
          if (!currentSources.includes(args.source_id)) {
            currentSources.push(args.source_id);
          }
          await personaManager.createPersona({
            id: args.persona_id,
            knowledge_sources: currentSources,
          });
          personaManager.invalidateCache();
          await personaManager.loadPersonas();
        }
        return {
          success: true,
          message: `Fonte de conhecimento "${args.name}" registrada e associada à persona "${args.persona_id}".`,
          source_id: args.source_id,
          note: 'Para alimentar esta fonte com conteúdo, use POST /api/admin/knowledge/upload ou adicione texto via comando /addknowledge no chat.',
        };
      } catch (err) {
        return { error: `Erro ao adicionar fonte de conhecimento: ${err.message}` };
      }
    }

    case 'manage_tasks': {
      const uid = args.owner_id || context.userId || 'user_default';
      try {
        if (args.action === 'create') {
          const task = await agent.createTask({
            persona_id: args.persona_id || null,
            owner_id: uid,
            title: args.title || 'Nova tarefa',
            description: args.description || '',
            status: args.status || 'pending',
            priority: args.priority || 'medium',
            due_date: args.due_date || null,
            auto_execute: false,
          });
          return { success: true, message: `Tarefa "${task.title}" criada!`, task };
        }
        if (args.action === 'list') {
          const tasks = await agent.listTasks({ owner_id: uid, persona_id: args.persona_id, status: args.status, limit: 20 });
          return { tasks, total: tasks.length };
        }
        if (args.action === 'update' && args.task_id) {
          const data = {};
          if (args.title) data.title = args.title;
          if (args.description) data.description = args.description;
          if (args.status) data.status = args.status;
          if (args.priority) data.priority = args.priority;
          if (args.due_date) data.due_date = args.due_date;
          const task = await agent.updateTask(args.task_id, data);
          return { success: true, message: `Tarefa "${args.task_id}" atualizada!`, task };
        }
        if (args.action === 'delete' && args.task_id) {
          await agent.deleteTask(args.task_id);
          return { success: true, message: `Tarefa "${args.task_id}" deletada.` };
        }
        if (args.action === 'overdue') {
          const tasks = await agent.getOverdueTasks(uid);
          return { tasks, total: tasks.length };
        }
        return { error: 'Ação inválida. Use: create, list, update, delete, overdue' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_calendar': {
      const uid = args.owner_id || context.userId || 'user_default';
      try {
        if (args.action === 'create') {
          const event = await agent.createCalendarEvent({
            persona_id: args.persona_id || null,
            owner_id: uid,
            title: args.title || 'Novo evento',
            description: args.description || '',
            event_type: args.event_type || 'meeting',
            start_time: args.start_time || new Date().toISOString().slice(0, 19).replace('T', ' '),
            end_time: args.end_time || null,
            location: args.location || null,
            attendees: args.attendees || null,
          });
          return { success: true, message: `Evento "${event.title}" agendado!`, event };
        }
        if (args.action === 'list') {
          const events = await agent.listCalendarEvents({ owner_id: uid, persona_id: args.persona_id, limit: 20, start_after: new Date().toISOString().slice(0, 19).replace('T', ' ') });
          return { events, total: events.length };
        }
        if (args.action === 'update' && args.event_id) {
          const data = {};
          if (args.title) data.title = args.title;
          if (args.description) data.description = args.description;
          if (args.event_type) data.event_type = args.event_type;
          if (args.start_time) data.start_time = args.start_time;
          if (args.end_time) data.end_time = args.end_time;
          if (args.location) data.location = args.location;
          if (args.status) data.status = args.status;
          const event = await agent.updateCalendarEvent(args.event_id, data);
          return { success: true, message: `Evento "${args.event_id}" atualizado!`, event };
        }
        if (args.action === 'delete' && args.event_id) {
          await agent.deleteCalendarEvent(args.event_id);
          return { success: true, message: `Evento "${args.event_id}" deletado.` };
        }
        if (args.action === 'upcoming') {
          const events = await agent.getUpcomingEvents(uid, 7);
          return { events, total: events.length };
        }
        return { error: 'Ação inválida. Use: create, list, update, delete, upcoming' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_contacts': {
      const uid = args.owner_id || context.userId || 'user_default';
      try {
        if (args.action === 'create') {
          const contact = await agent.createContact({
            persona_id: args.persona_id || null,
            owner_id: uid,
            name: args.name || 'Novo contato',
            email: args.email || null,
            phone: args.phone || null,
            company: args.company || null,
            role: args.role || null,
            tags: args.tags || null,
            notes: args.notes || null,
            stage: args.stage || 'lead',
          });
          return { success: true, message: `Contato "${contact.name}" criado!`, contact };
        }
        if (args.action === 'list') {
          const contacts = await agent.listContacts({ owner_id: uid, persona_id: args.persona_id, stage: args.stage, limit: 50 });
          return { contacts, total: contacts.length };
        }
        if (args.action === 'update' && args.contact_id) {
          const data = {};
          if (args.name) data.name = args.name;
          if (args.email) data.email = args.email;
          if (args.phone) data.phone = args.phone;
          if (args.company) data.company = args.company;
          if (args.role) data.role = args.role;
          if (args.tags) data.tags = args.tags;
          if (args.notes) data.notes = args.notes;
          if (args.stage) data.stage = args.stage;
          data.last_contact_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
          const contact = await agent.updateContact(args.contact_id, data);
          return { success: true, message: `Contato "${args.contact_id}" atualizado!`, contact };
        }
        if (args.action === 'delete' && args.contact_id) {
          await agent.deleteContact(args.contact_id);
          return { success: true, message: `Contato "${args.contact_id}" deletado.` };
        }
        if (args.action === 'search') {
          const contacts = await agent.listContacts({ owner_id: uid, search: args.name || args.email || '', limit: 20 });
          return { contacts, total: contacts.length };
        }
        return { error: 'Ação inválida. Use: create, list, update, delete, search' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_automations': {
      const uid = args.owner_id || context.userId || 'user_default';
      try {
        if (args.action === 'create') {
          const auto = await agent.createAutomation({
            persona_id: args.persona_id || null,
            owner_id: uid,
            name: args.name || 'Nova automação',
            description: args.description || '',
            trigger_type: args.trigger_type || 'manual',
            trigger_config: args.trigger_config || {},
            action_type: args.action_type || 'message',
            action_config: args.action_config || {},
            is_active: args.is_active !== false,
          });
          return { success: true, message: `Automação "${auto.name}" criada!`, automation: auto };
        }
        if (args.action === 'list') {
          const automations = await agent.listAutomations({ owner_id: uid, persona_id: args.persona_id, limit: 20 });
          return { automations, total: automations.length };
        }
        if (args.action === 'update' && args.automation_id) {
          const data = {};
          if (args.name) data.name = args.name;
          if (args.description) data.description = args.description;
          if (args.trigger_type) data.trigger_type = args.trigger_type;
          if (args.trigger_config) data.trigger_config = args.trigger_config;
          if (args.action_type) data.action_type = args.action_type;
          if (args.action_config) data.action_config = args.action_config;
          if (args.is_active !== undefined) data.is_active = args.is_active;
          const auto = await agent.updateAutomation(args.automation_id, data);
          return { success: true, message: `Automação "${args.automation_id}" atualizada!`, automation: auto };
        }
        if (args.action === 'delete' && args.automation_id) {
          await agent.deleteAutomation(args.automation_id);
          return { success: true, message: `Automação "${args.automation_id}" deletada.` };
        }
        if (args.action === 'toggle' && args.automation_id) {
          const auto = await agent.getAutomation(args.automation_id);
          if (!auto) return { error: 'Automação não encontrada.' };
          const updated = await agent.updateAutomation(args.automation_id, { is_active: !auto.is_active });
          return { success: true, message: `Automação "${auto.name}" ${!auto.is_active ? 'ativada' : 'desativada'}!`, automation: updated };
        }
        return { error: 'Ação inválida. Use: create, list, update, delete, toggle' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'get_dashboard': {
      const uid = context.userId || 'user_default';
      try {
        const stats = await agent.getDashboardStats(uid);
        return stats;
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'get_history': {
      const uid = context.userId || 'user_default';
      try {
        const history = await agent.getHistory(args.persona_id || null, uid, args.limit || 50);
        return { messages: history, total: history.length };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_goals': {
      const uid = args.owner_id || context.userId || 'user_default';
      const resolvedPid = args.persona_id ? await resolvePersonaId(args.persona_id) : null;
      try {
        if (args.action === 'create') {
          const goal = await goalsModule.createGoal({
            persona_id: resolvedPid || null,
            owner_id: uid,
            title: args.title || 'Nova meta',
            description: args.description || '',
            goal_type: args.goal_type || 'strategic',
            priority: args.priority || 'medium',
            status: args.status || 'active',
            progress: args.progress || 0,
            target_metric: args.target_metric || null,
            target_value: args.target_value || null,
            current_value: args.current_value || null,
            parent_goal_id: args.parent_goal_id || null,
            due_date: args.due_date || null,
          });
          return { success: true, message: `Meta "${goal.title}" criada!`, goal };
        }
        if (args.action === 'list') {
          const goals = await goalsModule.listGoals({ owner_id: uid, persona_id: args.persona_id, status: args.status, goal_type: args.goal_type, limit: 50 });
          return { goals, total: goals.length };
        }
        if (args.action === 'update' && args.goal_id) {
          const data = {};
          if (args.title) data.title = args.title;
          if (args.description) data.description = args.description;
          if (args.goal_type) data.goal_type = args.goal_type;
          if (args.priority) data.priority = args.priority;
          if (args.status) data.status = args.status;
          if (args.progress !== undefined) data.progress = args.progress;
          if (args.target_metric) data.target_metric = args.target_metric;
          if (args.target_value) data.target_value = args.target_value;
          if (args.current_value) data.current_value = args.current_value;
          if (args.parent_goal_id) data.parent_goal_id = args.parent_goal_id;
          if (args.due_date) data.due_date = args.due_date;
          const goal = await goalsModule.updateGoal(args.goal_id, data);
          return { success: true, message: `Meta "${args.goal_id}" atualizada!`, goal };
        }
        if (args.action === 'delete' && args.goal_id) {
          await goalsModule.deleteGoal(args.goal_id);
          return { success: true, message: `Meta "${args.goal_id}" deletada.` };
        }
        if (args.action === 'progress') {
          const progress = await goalsModule.getGoalProgress(uid);
          return progress;
        }
        if (args.action === 'hierarchy') {
          const hierarchy = await goalsModule.getGoalHierarchy(uid, args.persona_id || null);
          return { hierarchy, total: hierarchy.length };
        }
        return { error: 'Ação inválida. Use: create, list, update, delete, progress, hierarchy' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_conversation_stages': {
      try {
        if (args.action === 'create') {
          const stage = await stagesModule.createConversationStage({
            persona_id: args.persona_id || null,
            name: args.name || 'New Stage',
            description: args.description || '',
            stage_order: args.stage_order ?? 0,
            triggers: args.triggers || null,
            responses: args.responses || null,
            is_active: true,
          });
          return { success: true, message: `Estágio "${stage.name}" criado!`, stage };
        }
        if (args.action === 'list') {
          const stages = await stagesModule.listConversationStages({ persona_id: args.persona_id || null });
          return { stages, total: stages.length };
        }
        if (args.action === 'update' && args.stage_id) {
          const data = {};
          if (args.name) data.name = args.name;
          if (args.description) data.description = args.description;
          if (args.stage_order !== undefined) data.stage_order = args.stage_order;
          if (args.triggers) data.triggers = args.triggers;
          if (args.responses) data.responses = args.responses;
          const stage = await stagesModule.updateConversationStage(args.stage_id, data);
          return { success: true, message: `Estágio "${args.stage_id}" atualizado!`, stage };
        }
        if (args.action === 'delete' && args.stage_id) {
          await stagesModule.deleteConversationStage(args.stage_id);
          return { success: true, message: `Estágio "${args.stage_id}" deletado.` };
        }
        if (args.action === 'get_user_stage') {
          const uid = context.userId || 'user_default';
          const userStage = await stagesModule.getUserStage(uid, args.persona_id || 'default');
          return userStage || { current_stage: null, stage_data: null };
        }
        if (args.action === 'set_user_stage') {
          const uid = context.userId || 'user_default';
          const userStage = await stagesModule.setUserStage(uid, args.persona_id || 'default', args.stage_id || 'greeting', null, null);
          return { success: true, message: `Estágio do usuário atualizado!`, userStage };
        }
        if (args.action === 'advance_user_stage') {
          const uid = context.userId || 'user_default';
          const userStage = await stagesModule.advanceUserStage(uid, args.persona_id || 'default', null);
          return { success: true, message: 'Estágio avançado!', userStage };
        }
        if (args.action === 'init_defaults') {
          const stages = await stagesModule.ensureDefaultStages(args.persona_id || null);
          return { success: true, message: 'Estágios padrão criados!', stages, total: stages.length };
        }
        return { error: 'Ação inválida. Use: create, list, update, delete, get_user_stage, set_user_stage, advance_user_stage, init_defaults' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_org_memory': {
      const uid = args.owner_id || context.userId || 'user_default';
      try {
        if (args.action === 'create') {
          const mem = await orgMemoryModule.createOrgMemory({
            persona_id: args.persona_id || null,
            owner_id: uid,
            category: args.category || 'custom',
            title: args.title || 'Nova memória',
            content: args.content || '',
            tags: args.tags || null,
            priority: args.priority || 'medium',
          });
          return { success: true, message: `Memória organizacional "${mem.title}" criada!`, memory: mem };
        }
        if (args.action === 'list') {
          const memories = await orgMemoryModule.listOrgMemory({ owner_id: uid, persona_id: args.persona_id || undefined, category: args.category, limit: 50 });
          return { memories, total: memories.length };
        }
        if (args.action === 'update' && args.memory_id) {
          const data = {};
          if (args.category) data.category = args.category;
          if (args.title) data.title = args.title;
          if (args.content) data.content = args.content;
          if (args.tags) data.tags = args.tags;
          if (args.priority) data.priority = args.priority;
          const mem = await orgMemoryModule.updateOrgMemory(args.memory_id, data);
          return { success: true, message: `Memória "${args.memory_id}" atualizada!`, memory: mem };
        }
        if (args.action === 'delete' && args.memory_id) {
          await orgMemoryModule.deleteOrgMemory(args.memory_id);
          return { success: true, message: `Memória "${args.memory_id}" deletada.` };
        }
        if (args.action === 'search') {
          const results = await orgMemoryModule.searchOrgMemory(args.search_query || '', uid, args.persona_id || null, 10);
          return { results, total: results.length };
        }
        return { error: 'Ação inválida. Use: create, list, update, delete, search' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_xp': {
      const uid = context.userId || 'user_default';
      const resolvedPid = await resolvePersonaId(args.persona_id) || 'default';
      const pid = resolvedPid;
      try {
        if (args.action === 'add') {
          const result = await gamificationModule.addXp(uid, pid, args.amount || 10, args.reason || 'interaction');
          const badges = await gamificationModule.checkAndAwardBadges(uid, pid);
          return {
            success: true,
            xp: result.xp,
            level: result.level,
            leveledUp: result.leveledUp,
            streak: result.streak,
            newBadges: badges,
            message: result.leveledUp
              ? `🎉 Level up! Agora você é nível ${result.level}!`
              : `+${args.amount || 10} XP (${result.xp} total, nível ${result.level})${badges.length > 0 ? ' | Nova conquista: ' + badges.map(b => b.name).join(', ') : ''}`,
          };
        }
        if (args.action === 'get') {
          const xpData = await gamificationModule.getXp(uid, pid);
          const nextLevel = gamificationModule.getXpForNextLevel(xpData.xp);
          return { ...xpData, nextLevel, nextLevelXp: nextLevel.needed };
        }
        if (args.action === 'leaderboard') {
          const leaderboard = await gamificationModule.getLeaderboard(pid || null, args.limit || 10);
          return { leaderboard, total: leaderboard.length };
        }
        if (args.action === 'check_badges') {
          const badges = await gamificationModule.checkAndAwardBadges(uid, pid);
          return { newBadges: badges, total: badges.length };
        }
        if (args.action === 'add_badge') {
          const result = await gamificationModule.addBadge(uid, pid, args.badge_id, args.badge_name || args.badge_id);
          return { success: true, badge: { id: args.badge_id, name: args.badge_name || args.badge_id }, currentBadges: result.badges };
        }
        if (args.action === 'streak') {
          const result = await gamificationModule.updateStreak(uid, pid);
          const streakXp = result.streakBroken ? 0 : 5;
          if (!result.streakBroken && streakXp > 0) {
            await gamificationModule.addXp(uid, pid, streakXp, 'streak_bonus');
          }
          return { success: true, streak: result.streak, bestStreak: result.bestStreak, streakBroken: result.streakBroken };
        }
        return { error: 'Ação inválida. Use: add, get, leaderboard, check_badges, add_badge, streak' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_progress': {
      const uid = context.userId || 'user_default';
      const resolvedPid = await resolvePersonaId(args.persona_id) || 'default';
      const pid = resolvedPid;
      try {
        if (args.action === 'get') {
          const progress = await progressModule.getProgressState(uid, pid);
          return progress;
        }
        if (args.action === 'set') {
          if (!args.state) return { error: 'state é obrigatório para action=set' };
          const progress = await progressModule.setProgressState(uid, pid, args.state);
          return { success: true, progress };
        }
        if (args.action === 'update') {
          if (!args.state) return { error: 'state é obrigatório para action=update' };
          const progress = await progressModule.updateProgressState(uid, pid, args.state);
          return { success: true, progress };
        }
        if (args.action === 'increment') {
          if (!args.field) return { error: 'field é obrigatório para action=increment' };
          const progress = await progressModule.incrementProgressField(uid, pid, args.field, args.amount || 1);
          return { success: true, progress };
        }
        if (args.action === 'push') {
          if (!args.field || !args.value) return { error: 'field e value são obrigatórios para action=push' };
          const progress = await progressModule.pushProgressArray(uid, pid, args.field, args.value);
          return { success: true, progress };
        }
        if (args.action === 'remove') {
          if (!args.field || !args.value) return { error: 'field e value são obrigatórios para action=remove' };
          const progress = await progressModule.removeProgressArray(uid, pid, args.field, args.value);
          return { success: true, progress };
        }
        return { error: 'Ação inválida. Use: get, set, update, increment, push, remove' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'get_cognitive_state': {
      const uid = args.user_id || context.userId || 'user_default';
      const pid = args.persona_id || 'default';
      try {
        if (args.stats) {
          const stats = await cognitiveModule.getCognitiveStats(pid, args.days || 7);
          return stats;
        }
        if (args.history) {
          const history = await cognitiveModule.getCognitiveHistory(uid, pid, 20);
          return { history, total: history.length };
        }
        const state = await cognitiveModule.getLatestCognitiveState(uid, pid);
        return state || { emotion: 'neutral', intent: 'general', churn_risk: 0, conversion_probability: 0, engagement_score: 0.5 };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'human_override': {
      const sid = args.session_id;
      if (!sid) return { error: 'session_id é obrigatório' };
      try {
        if (args.action === 'activate') {
          if (!context.isAdmin && !context.isMetaPersona) return { error: 'Apenas admins podem ativar override.' };
          const data = { is_active: true, override_type: args.override_type || 'full', human_message: args.human_message, user_id: context.userId, persona_id: args.persona_id };
          const override = await overrideModule.setOverride(sid, data);
          return { success: true, message: `Override ativado para sessão ${sid} (tipo: ${data.override_type})`, override };
        }
        if (args.action === 'deactivate') {
          await overrideModule.clearOverride(sid);
          return { success: true, message: `Override desativado para sessão ${sid}` };
        }
        if (args.action === 'status') {
          const override = await overrideModule.getOverride(sid);
          return override || { active: false };
        }
        if (args.action === 'list') {
          const overrides = await overrideModule.listOverrides({ is_active: true, limit: 20 });
          return { overrides, total: overrides.length };
        }
        return { error: 'Ação inválida. Use: activate, deactivate, status, list' };
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'get_suggestions': {
      const personaId = args.persona_id;
      if (!personaId) return { error: 'persona_id é obrigatório' };
      try {
        const suggestions = await optimizationModule.generateSuggestions(personaId, args.days || 7);
        return suggestions;
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'manage_blueprints': {
      const action = args.action;
      try {
        switch (action) {
          case 'list': {
            const filters = {};
            if (args.category) filters.category = args.category;
            if (args.niche) filters.niche = args.niche;
            if (args.search) filters.search = args.search;
            const blueprints = await blueprintsModule.listBlueprints(filters);
            return { blueprints, total: blueprints.length };
          }
          case 'get': {
            if (!args.blueprint_id) return { error: 'blueprint_id obrigatório' };
            const bp = await blueprintsModule.getBlueprint(args.blueprint_id);
            if (!bp) return { error: 'Blueprint não encontrado' };
            return bp;
          }
          case 'clone': {
            if (!args.blueprint_id) return { error: 'blueprint_id obrigatório' };
            const persona = await blueprintsModule.cloneBlueprint(args.blueprint_id, args.overrides || {});
            return { success: true, message: `Blueprint clonado como persona "${persona.name}" (${persona.id})`, persona };
          }
          case 'apply': {
            if (!args.blueprint_id || !args.persona_id) return { error: 'blueprint_id e persona_id obrigatórios' };
            const updated = await blueprintsModule.cloneBlueprintToExisting(args.blueprint_id, args.persona_id);
            return { success: true, message: `Blueprint aplicado à persona ${args.persona_id}`, persona: updated };
          }
          case 'create_from_persona': {
            if (!args.persona_id) return { error: 'persona_id obrigatório' };
            const newBp = await blueprintsModule.savePersonaAsBlueprint(args.persona_id, args.blueprint_data || {});
            return { success: true, message: `Blueprint criado: "${newBp.name}" (${newBp.id})`, blueprint: newBp };
          }
          case 'categories': {
            const categories = await blueprintsModule.getBlueprintCategories();
            return { categories };
          }
          case 'niches': {
            const niches = await blueprintsModule.getBlueprintNiches(args.category || null);
            return { niches };
          }
          case 'stats': {
            const stats = await blueprintsModule.getBlueprintStats();
            return stats;
          }
          default:
            return { error: `Ação desconhecida: ${action}` };
        }
      } catch (err) {
        return { error: `Erro: ${err.message}` };
      }
    }

    case 'create_visual': {
      try {
        const data = {
          text: args.text || '',
          title: args.title || '',
          subtitle: args.subtitle || '',
          author: args.author || '',
          tag: args.tag || '',
          ctaText: args.cta_text || '',
          primaryColor: args.primary_color || '#1a1a2e',
          secondaryColor: args.secondary_color || '#16213e',
          accentColor: args.accent_color || '#e94560',
          textColor: args.text_color || '#ffffff',
          size: args.size,
          bulletPoints: args.bullet_points || null,
          slideNumber: args.slide_number || 1,
          totalSlides: args.total_slides || 5,
        };

        const html = creativeEngine.compileTemplate(args.template_id, data);
        const personaId = context.personaId || 'default';
        const ownerId = context.userId || 'system';

        const saved = await creativeEngine.saveCreative(personaId, ownerId, args.template_id, args.template_id, data, html);

        return {
          success: true,
          id: saved.id,
          template: args.template_id,
          html_preview: html.substring(0, 500) + '...',
          message: `Visual "${args.template_id}" criado com sucesso. Use a API para renderizar como imagem.`,
        };
      } catch (err) {
        return { error: `Erro ao criar visual: ${err.message}` };
      }
    }

    case 'list_visual_templates': {
      const templates = creativeEngine.getAvailableTemplates();
      const sizes = creativeEngine.getAvailableSizes();
      return { templates, sizes };
    }

    case 'manage_business_config': {
      const businessModule = require('../business');
      const action = args.action;
      const pid = args.persona_id;

      if (action === 'get') {
        const config = await businessModule.getBusinessConfig(pid);
        if (!config) return { error: 'Persona not found' };
        return { persona_id: pid, business_config: config };
      }

      if (action === 'update') {
        if (!args.updates || typeof args.updates !== 'object') {
          return { error: 'updates object is required for action=update' };
        }
        const updated = await businessModule.updateBusinessConfig(pid, args.updates);
        return { persona_id: pid, business_config: updated, updated: true };
      }

      if (action === 'reset') {
        const defaults = await businessModule.resetBusinessConfig(pid);
        return { persona_id: pid, business_config: defaults, reset: true };
      }

      return { error: `Unknown action: ${action}` };
    }

    case 'manage_quizzes': {
      const quizModule = require('../quiz');
      const qAction = args.action;

      if (qAction === 'list') {
        const quizzes = await quizModule.listQuizzes({ persona_id: args.persona_id, status: 'active', limit: 20 });
        return { quizzes: quizzes.quizzes, total: quizzes.total };
      }

      if (qAction === 'get') {
        if (!args.quiz_id) return { error: 'quiz_id required' };
        const quiz = await quizModule.getQuiz(args.quiz_id);
        if (!quiz) return { error: 'Quiz not found' };
        const stats = await quizModule.getQuizStats(args.quiz_id);
        return { quiz, stats };
      }

      if (qAction === 'create') {
        if (!args.title) return { error: 'title required' };
        const quiz = await quizModule.createQuiz({
          persona_id: args.persona_id,
          title: args.title,
          description: args.description,
          quiz_type: args.quiz_type || 'multiple_choice',
          questions: args.questions || [],
          xp_reward: args.xp_reward || 10,
          settings: { passingScore: 60, showResults: true, showExplanation: true, shuffleQuestions: true },
          created_by: context.userId,
        });
        return { quiz, created: true };
      }

      if (qAction === 'generate') {
        if (!args.persona_id || !args.topic) return { error: 'persona_id and topic required' };
        const quiz = await quizModule.generateQuizFromPersona(args.persona_id, args.topic, args.question_count || 5);
        return { quiz, generated: true };
      }

      if (qAction === 'stats') {
        if (!args.quiz_id) return { error: 'quiz_id required' };
        const stats = await quizModule.getQuizStats(args.quiz_id);
        return stats;
      }

      if (qAction === 'progress') {
        if (!args.user_id) return { error: 'user_id required' };
        const progress = await quizModule.getUserQuizProgress(args.user_id, args.persona_id);
        return { progress, total: progress.length };
      }

      return { error: `Unknown quiz action: ${qAction}` };
    }

    case 'manage_media': {
      const mediaModule = require('../media');
      const mAction = args.action;

      if (mAction === 'list') {
        const result = await mediaModule.listMedia({
          persona_id: args.persona_id,
          type: args.type,
          folder: args.folder,
          search: args.search,
          limit: 20,
        });
        return { media: result.media, total: result.total };
      }

      if (mAction === 'get') {
        if (!args.media_id) return { error: 'media_id required' };
        const media = await mediaModule.getMedia(args.media_id);
        if (!media) return { error: 'Media not found' };
        return media;
      }

      if (mAction === 'gallery') {
        const result = await mediaModule.listMedia({
          persona_id: args.persona_id,
          type: args.type,
          status: 'ready',
          limit: 50,
        });
        const gallery = result.media.map(m => ({
          id: m.id, title: m.title, type: m.type, url: m.url,
          thumbnail: m.type === 'image' ? m.url : null,
          caption: m.caption, tags: m.tags,
        }));
        return { gallery, total: gallery.length };
      }

      if (mAction === 'stats') {
        const stats = await mediaModule.getMediaStats(args.persona_id);
        return stats;
      }

      if (mAction === 'folders') {
        const folders = await mediaModule.getMediaFolders(args.persona_id);
        return { folders };
      }

      if (mAction === 'create') {
        if (!args.url) return { error: 'url required for create' };
        const media = await mediaModule.createMedia({
          persona_id: args.persona_id,
          owner_id: context.userId,
          title: args.title || 'Untitled',
          description: args.description,
          url: args.url,
          type: args.type || 'other',
          source: 'url',
        });
        return { media, created: true };
      }

      return { error: `Unknown media action: ${mAction}` };
    }

    default:
      return { error: `Tool desconhecida: ${name}` };
  }
}

function getToolDefinitions() {
  return TOOL_DEFINITIONS;
}

function formatToolResultToMessage(toolCall, result) {
  return {
    role: 'tool',
    content: typeof result === 'string' ? result : JSON.stringify(result),
    name: toolCall.function?.name || toolCall.name,
  };
}

module.exports = {
  TOOL_DEFINITIONS,
  getToolDefinitions,
  executeTool,
  formatToolResultToMessage,
};