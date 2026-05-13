const { searchVerses } = require('../knowledge/store');
const { pool } = require('../db');
const { getAllPosts, generatePost } = require('../blog');
const { sendEmail } = require('../email');
const { getActivePersona } = require('../persona/config');
const { getSetting } = require('../settings');

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
      description: 'Retorna estatísticas do usuário: número de sessões, mensagens, tópicos, tempo de uso. Use quando a pessoa pede info sobre si mesma.',
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
      description: 'Busca ou gera o devocional do dia. Use quando a pessoa pede um devocional ou reflexão diária.',
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
      description: 'Registra um pedido de oração. Use quando alguém pede oração ou compartilha uma necessidade.',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'ID do usuário',
          },
          request: {
            type: 'string',
            description: 'O pedido de oração',
          },
        },
        required: ['user_id', 'request'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_sessions',
      description: 'Lista as sessões de conversa do usuário. Use quando a pessoa quer ver histórico.',
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
      name: 'update_settings',
      description: 'Atualiza configurações do bot. Apenas admins podem usar. Use quando admin pede para mudar config.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Chave da configuração (ex: persona_name, tts_mode, max_tokens, etc)',
          },
          value: {
            type: 'string',
            description: 'Novo valor',
          },
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
          action: {
            type: 'string',
            enum: ['list', 'ban', 'promote', 'demote', 'info'],
            description: 'Ação: list, ban, promote (to admin/premium), demote, info',
          },
          user_id: {
            type: 'string',
            description: 'ID do usuário alvo',
          },
          role: {
            type: 'string',
            enum: ['user', 'premium', 'admin'],
            description: 'Novo role (para promote/demote)',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email_to_user',
      description: 'Envia email para um usuário. Apenas admins. Use quando admin pede para contactar usuário.',
      parameters: {
        type: 'object',
        properties: {
          to_email: {
            type: 'string',
            description: 'Email do destinatário',
          },
          subject: {
            type: 'string',
            description: 'Assunto do email',
          },
          body: {
            type: 'string',
            description: 'Corpo do email',
          },
        },
        required: ['to_email', 'subject', 'body'],
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
      const results = searchVerses(args.query, limit);
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
          'SELECT COUNT(*) as total FROM sessions WHERE user_id = ? OR user_id IS NULL',
          [userId]
        );
        const [msgRows] = await pool.execute(
          `SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ?`,
          [userId]
        );
        const profile = await pool.execute('SELECT * FROM profiles WHERE id = ?', [userId]);
        const p = profile[0].length > 0 ? profile[0][0] : null;
        const [feedbackRows] = await pool.execute(
          'SELECT COUNT(*) as total FROM feedback WHERE user_id = ?',
          [userId]
        );
        return {
          sessions: sessionRows[0].total,
          messages: msgRows[0].total,
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
        return { success: true, message: 'Pedido de oração registrado.' };
      } catch {
        try {
          const profile = await pool.execute('SELECT prayer_requests FROM profiles WHERE id = ?', [userId]);
          let requests = [];
          if (profile[0].length > 0 && profile[0][0].prayer_requests) {
            requests = typeof profile[0][0].prayer_requests === 'string'
              ? JSON.parse(profile[0][0].prayer_requests)
              : profile[0][0].prayer_requests;
          }
          requests.push(args.request);
          await pool.execute(
            'INSERT INTO profiles (id, name, story, topics, emotions, spiritual_journey, prayer_requests) VALUES (?, NULL, "", "[]", "[]", "", ?) ON DUPLICATE KEY UPDATE prayer_requests=VALUES(prayer_requests)',
            [userId, JSON.stringify(requests)]
          );
          return { success: true, message: 'Pedido de oração registrado.' };
        } catch (err2) {
          return { error: err2.message };
        }
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