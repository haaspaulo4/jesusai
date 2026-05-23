/**
 * src/intent/command-intent.js
 *
 * Natural Language Command Intent Detector
 *
 * Goal: Allow users to speak naturally to the Meta-Persona without needing '/'
 * while keeping the entire existing slash command system 100% intact.
 *
 * Usage:
 *   const { detectCommandIntent } = require('./intent/command-intent');
 *   const intent = await detectCommandIntent("me mostra minhas tarefas de hoje");
 *   if (intent.command) {
 *     // execute the same logic as if the user typed intent.command
 *   }
 */

const integrationManager = require('../llm/integrationManager');

// This list should ideally come from the command registry, but for now we maintain it here
// so we don't break existing slash commands.
const AVAILABLE_COMMANDS = [
  { cmd: '/tasks', aliases: ['tarefas', 'minhas tarefas', 'o que eu tenho pra fazer', 'lista de tarefas'], description: 'Lista ou gerencia tarefas do usuário' },
  { cmd: '/calendar', aliases: ['agenda', 'calendário', 'eventos', 'agendar', 'minha agenda'], description: 'Agenda, eventos e calendário' },
  { cmd: '/contacts', aliases: ['contatos', 'crm', 'clientes', 'meus contatos'], description: 'CRM e lista de contatos' },
  { cmd: '/automations', aliases: ['automações', 'automacao', 'minhas automações'], description: 'Gerencia automações' },
  { cmd: '/goals', aliases: ['metas', 'objetivos', 'minhas metas'], description: 'Gerencia metas e objetivos' },
  { cmd: '/dashboard', aliases: ['painel', 'visão geral', 'resumo', 'dashboard'], description: 'Dashboard geral do sistema' },
  { cmd: '/skills', aliases: ['habilidades', 'skills', 'o que eu posso fazer'], description: 'Lista skills disponíveis' },
  { cmd: '/tools', aliases: ['ferramentas', 'tools'], description: 'Lista ferramentas disponíveis' },
  { cmd: '/orgmem', aliases: ['memória organizacional', 'conhecimento da empresa', 'org mem'], description: 'Memória organizacional' },
  { cmd: '/stages', aliases: ['estágios', 'funil', 'estagios de conversa'], description: 'Estágios de conversa' },
  { cmd: '/xp', aliases: ['pontos', 'level', 'gamificação', 'minha xp'], description: 'Gamificação, XP, level e streak' },
  { cmd: '/persona', aliases: ['trocar persona', 'mudar personagem', 'qual persona'], description: 'Troca ou lista personas' },
  { cmd: '/plan', aliases: ['planejar', 'planner', 'me ajuda a planejar'], description: 'Planejamento estratégico' },
  { cmd: '/reflect', aliases: ['refletir', 'pensar sobre', 'análise'], description: 'Reflexão da persona' },
  { cmd: '/prospect', aliases: ['prospecção', 'leads', 'negócios', 'b2b'], description: 'Prospecção B2B' },
  { cmd: '/search', aliases: ['buscar', 'pesquisar conhecimento', 'procure'], description: 'Busca no conhecimento RAG' },
  { cmd: '/blog', aliases: ['devocional', 'artigo', 'post'], description: 'Gera ou lista posts do blog' },
  { cmd: '/email', aliases: ['enviar email', 'manda um email'], description: 'Envia email' },
  { cmd: '/override', aliases: ['controle humano', 'pausar ia', 'humano assume'], description: 'Human override' },
  { cmd: '/cognitive', aliases: ['estado cognitivo', 'emoção', 'intenção'], description: 'Estado cognitivo do usuário' },
];

const INTENT_SYSTEM_PROMPT = `Você é um classificador de intenção de comandos para uma IA administrativa chamada Meta-Persona.

Sua única função é analisar a mensagem do usuário e decidir se ela corresponde a um dos comandos disponíveis abaixo.

Comandos disponíveis:
${AVAILABLE_COMMANDS.map(c => `- ${c.cmd}: ${c.description} (sinônimos: ${c.aliases.join(', ')})`).join('\n')}

Responda **APENAS** com um JSON válido no seguinte formato:
{
  "command": "/tasks" | null,
  "args": "argumentos extraídos da mensagem (ou string vazia)",
  "confidence": 0.0 a 1.0,
  "reason": "breve explicação"
}

Regras:
- Se a mensagem for claramente uma intenção de usar um comando (mesmo sem a barra), retorne o command correspondente com alta confiança.
- Se for conversa normal, retorne command: null e confidence baixa.
- Extraia argumentos de forma inteligente (ex: "minhas tarefas urgentes" → args: "urgentes").
- Nunca invente comandos que não existem na lista.
- Seja conservador: só retorne command se tiver pelo menos 70% de certeza.

Mensagem do usuário:`;

async function detectCommandIntent(message) {
  if (!message || typeof message !== 'string') return { command: null, confidence: 0 };

  const lower = message.toLowerCase().trim();

  // Fast path: if user used the slash, respect it immediately
  if (lower.startsWith('/')) {
    const parts = message.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    return {
      command: cmd,
      args,
      confidence: 1.0,
      reason: 'Explicit slash command'
    };
  }

  // Use a fast, cheap LLM call for intent classification
  try {
    const result = await integrationManager.callLLM(
      [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      {
        temperature: 0.1,
        numPredict: 256,
        timeout: 8000,
        retries: 1
      }
    );

    const content = result.message?.content || result.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Validate that the command actually exists
      const validCommands = AVAILABLE_COMMANDS.map(c => c.cmd);
      if (parsed.command && !validCommands.includes(parsed.command)) {
        parsed.command = null;
        parsed.confidence = 0;
      }

      return {
        command: parsed.command || null,
        args: parsed.args || '',
        confidence: parsed.confidence || 0,
        reason: parsed.reason || ''
      };
    }
  } catch (err) {
    console.warn('[IntentDetector] LLM classification failed, falling back to keywords:', err.message);
  }

  // Fallback: simple keyword matching (still better than nothing)
  for (const cmdDef of AVAILABLE_COMMANDS) {
    for (const alias of cmdDef.aliases) {
      if (lower.includes(alias)) {
        return {
          command: cmdDef.cmd,
          args: '',
          confidence: 0.65,
          reason: 'Keyword fallback'
        };
      }
    }
  }

  return { command: null, confidence: 0, reason: 'No intent detected' };
}

module.exports = {
  detectCommandIntent,
  AVAILABLE_COMMANDS
};
