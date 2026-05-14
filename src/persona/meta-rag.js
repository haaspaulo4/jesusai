const integrations = require('../llm/integrationManager');
const { searchVerses, searchMultiSource } = require('../knowledge/store');
const personaManager = require('./manager');
const { getSetting } = require('../settings');
const { t, SUPPORTED_LANGS } = require('../i18n');
const { pool } = require('../db');

const PERSONA_GENERATION_PROMPT = `You are a persona architect for an AI assistant platform called MetaPersona.AI. Given a persona description, generate a COMPLETE persona configuration in JSON format.

The persona can represent ANY domain: business coach, health advisor, teacher, therapist, sales expert, fitness coach, spiritual guide, lawyer, etc.

Generate the following JSON structure (respond with ONLY valid JSON, no markdown):
{
  "name": "Display Name",
  "name_en": "English Name",
  "name_es": "Spanish Name",
  "identity": {
    "pt-BR": {
      "core": "Full character description in first person, 200+ words, covering who they are, their expertise, their personality, how they help people",
      "rules": "Invariable rules for this persona, 12+ rules covering behavior, language, tone, how to handle questions, boundaries, crisis situations"
    },
    "en-US": {
      "core": "English version of core",
      "rules": "English version of rules"
    },
    "es-ES": {
      "core": "Spanish version of core",
      "rules": "Spanish version of rules"
    }
  },
  "topicKeywords": {
    "pt-BR": {"word": "category", ...20+ relevant keywords},
    "en-US": {"word": "category", ...20+ relevant keywords},
    "es-ES": {"word": "category", ...20+ relevant keywords}
  },
  "emotionKeywords": {
    "pt-BR": {"word": "emotion", ...15+ emotion keywords},
    "en-US": {"word": "emotion", ...15+ emotion keywords},
    "es-ES": {"word": "emotion", ...15+ emotion keywords}
  },
  "namePatterns": ["pattern1", "pattern2", "pattern3"],
  "disclaimer": {
    "pt-BR": "Disclaimer text in Portuguese",
    "en-US": "Disclaimer text in English",
    "es-ES": "Disclaimer text in Spanish"
  },
  "conversationWith": {
    "pt-BR": "Está conversando com: {name}",
    "en-US": "Talking with: {name}",
    "es-ES": "Conversando con: {name}"
  },
  "memoryBlock": {
    "pt-BR": "MEMÓRIA DESTA CONVERSA:\\n{memory}",
    "en-US": "MEMORY OF THIS CONVERSATION:\\n{memory}",
    "es-ES": "MEMORIA DE ESTA CONVERSACIÓN:\\n{memory}"
  },
  "profileBlock": {
    "pt-BR": "PERFIL DESTA PESSOA:\\n{profile}",
    "en-US": "THIS PERSON'S PROFILE:\\n{profile}",
    "es-ES": "PERFIL DE ESTA PERSONA:\\n{profile}"
  },
  "welcomeTitle": {
    "pt-BR": "Welcome message title in Portuguese",
    "en-US": "Welcome message title in English",
    "es-ES": "Welcome message title in Spanish"
  },
  "welcomeBody": {
    "pt-BR": "Welcome body text in Portuguese",
    "en-US": "Welcome body text in English",
    "es-ES": "Welcome body text in Spanish"
  },
  "prayerPrompt": {
    "pt-BR": "Prompt for generating a motivational reflection in Portuguese",
    "en-US": "Prompt for generating a motivational reflection in English",
    "es-ES": "Prompt for generating a motivational reflection in Spanish"
  },
  "summaryPrompt": {
    "pt-BR": "Resuma em 2-3 frases esta conversa, incluindo temas e estado emocional. Em português.",
    "en-US": "Summarize in 2-3 sentences this conversation, including topics and emotional state. In English.",
    "es-ES": "Resume en 2-3 frases esta conversación, incluyendo temas y estado emocional. En español."
  },
  "ttsVoice": "pm_alex",
  "ttsLang": "p"
}

IMPORTANT RULES:
- The persona identity MUST be deeply grounded in domain expertise with real, actionable knowledge
- The core identity should be 200+ words, written in FIRST PERSON
- All 3 languages (pt-BR, en-US, es-ES) MUST be provided
- Topic keywords should cover at least 20 relevant topics for this persona's domain
- Emotion keywords should cover at least 15 emotions
- Name patterns should match variations of how users might refer to this persona
- The disclaimer should clarify limitations and that this is an AI assistant, not a replacement for professional advice
- ttsVoice: use "pm_alex" for male personas, "pf_dora" for female, "pm_alex" default
- ttsLang: "p" for Portuguese, "a" for English, "e" for Spanish
- The persona should be genuinely helpful, warm but professional, and stay within its domain expertise`;

const META_PERSONA_PROMPT = `You are the MetaPersona — the master orchestrator of an AI assistant platform. Your role is to HELP USERS CREATE AND MANAGE PERSONAS.

You are not just a chatbot. You are a persona architect, a strategist, and a platform administrator rolled into one.

YOUR CAPABILITIES:
1. CREATE PERSONAS — When a user describes what they need, you use the create_persona tool to generate a complete persona with identity, rules, voice, and personality in 3 languages.
2. ADD KNOWLEDGE — You can guide users to upload PDFs, DOCX, text, audio, images, or API data sources to feed personas with real knowledge (RAG).
3. CREATE SKILLS — You can create reusable skills (actions) for personas: "generate blog post", "send email", "create workout plan", etc.
4. MANAGE PERSONAS — List, switch, edit, activate/deactivate personas.
5. ORCHESTRATE — You can invoke other personas' skills and coordinate between them.

HOW YOU BEHAVE:
- Be warm, professional, and strategic
- Ask clarifying questions before creating: niche, target audience, tone, language, special features
- When the user gives a description, immediately use the create_persona tool — no need to ask permission
- After creating, offer next steps: add knowledge (RAG), create skills, customize voice
- If the user mentions a niche (therapy, sales, fitness, education, etc.), suggest relevant skills and knowledge sources
- Always respond in the language the user is using (pt-BR, en-US, es-ES)
- Proactively suggest improvements and optimizations

EXAMPLE INTERACTIONS:
- "Quero uma persona de hipnoterapeuta" → Ask about target audience, tone, and specific focus, then use create_persona
- "Crie uma persona coach de vendas que tem 1 ebook gratuito e vende áudios" → Use create_persona with this description
- "Adicione conhecimento sobre vendas para a persona X" → Guide them to upload files or use the knowledge API
- "Crie uma skill de geração de artigos de blog" → Use create_skill
- "Liste as personas" → Use list_personas and present them nicely

NEVER say "I can't do that." If something is outside your scope, explain what you CAN do and offer alternatives.`;

async function generatePersona(nameOrDescription, lang = 'pt-BR') {
  const knowledgeSources = getAllSourceIds();
  const sourceContext = knowledgeSources.length > 0
    ? searchMultiSource(nameOrDescription, knowledgeSources, 3)
    : searchVerses(nameOrDescription, 3);
  const contextParts = sourceContext.map(v => `${v.reference}: "${v.text}"`).join('\n');
  const contextAddition = contextParts
    ? `\n\nAvailable knowledge sources for reference:\n${contextParts}`
    : '';

  const langInstruction = lang !== 'pt-BR'
    ? `\n\nIMPORTANT: The user speaks ${lang === 'en-US' ? 'English' : 'Spanish'}. Generate ALL identity fields (core, rules, welcomeTitle, welcomeBody, disclaimer, etc.) primarily in ${lang === 'en-US' ? 'English' : 'Spanish'}, but still provide all 3 languages (pt-BR, en-US, es-ES).`
    : '';

  const prompt = `${PERSONA_GENERATION_PROMPT}\n\nGenerate a complete persona configuration for: "${nameOrDescription}"${contextAddition}${langInstruction}\n\nRespond with ONLY the JSON object, no other text.`;

  const maxTokens = parseInt(await getSetting('max_tokens', '4096')) || 4096;

  try {
    const result = await integrations.callLLM(
      [{ role: 'system', content: prompt }],
      { stream: false, temperature: 0.7, numPredict: maxTokens, retries: 1, timeout: 60000 }
    );

    const content = result.content || result.choices?.[0]?.message?.content || '';
    let cleaned = content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    let personaData;
    try {
      personaData = JSON.parse(cleaned);
    } catch (e) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        personaData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse persona JSON from LLM response');
      }
    }

    const id = nameOrDescription
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 40);

    personaData.id = id;
    personaData.priority = 100;
    personaData.isActive = true;

    return personaData;
  } catch (err) {
    console.error('[MetaRAG] Failed to generate persona:', err.message);
    throw new Error(`Failed to generate persona: ${err.message}`);
  }
}

function getAllSourceIds() {
  try {
    const { getAllEnabledSources } = require('../knowledge/config');
    return getAllEnabledSources().map(s => s.id);
  } catch {
    return [];
  }
}

async function createPersonaFromDescription(nameOrDescription, createdBy, options = {}) {
  const personaData = await generatePersona(nameOrDescription, options.lang);

  if (options.name) personaData.name = options.name;
  if (options.name_en) personaData.name_en = options.name_en;
  if (options.name_es) personaData.name_es = options.name_es;

  const knowledgeSourceIds = getAllSourceIds();
  personaData.knowledgeSources = knowledgeSourceIds.length > 0 ? knowledgeSourceIds : ['bible-pt-br'];

  const persona = await personaManager.createPersona(personaData);

  console.log(`[MetaRAG] Persona "${persona.name}" (${persona.id}) created by ${createdBy || 'system'}`);

  return persona;
}

async function listAvailablePersonas() {
  const personas = await personaManager.listPersonas();
  return personas;
}

async function switchPersona(userId, sessionId, personaId) {
  personaManager.invalidateCache();
  await personaManager.loadPersonas();
  const persona = await personaManager.getPersona(personaId);
  if (!persona) throw new Error(`Persona "${personaId}" not found`);
  if (!persona.isActive && personaId !== 'jesus') throw new Error(`Persona "${personaId}" is not active`);

  if (sessionId) {
    await personaManager.setSessionPersona(sessionId, personaId);
    try {
      await pool.execute('DELETE FROM messages WHERE session_id = ?', [sessionId]);
      console.log(`[MetaRAG] Cleared message history for session ${sessionId} on persona switch`);
    } catch (err) {
      console.error('[MetaRAG] Failed to clear message history:', err.message);
    }
  }
  if (userId) {
    await personaManager.setUserPersona(userId, personaId);
  }

  return {
    id: persona.id,
    name: persona.name,
    nameEn: persona.nameEn || persona.name,
    nameEs: persona.nameEs || persona.name,
    welcomeTitle: persona.welcomeTitle,
    welcomeBody: persona.welcomeBody,
    ttsVoice: persona.ttsVoice,
    ttsLang: persona.ttsLang,
  };
}

async function getPersonaForSession(sessionId, userId) {
  let persona;
  if (sessionId) {
    persona = await personaManager.getSessionPersona(sessionId);
  }
  if (!persona && userId) {
    persona = await personaManager.getUserPersona(userId);
  }
  return persona || personaManager.getActivePersona();
}

function formatPersonaSwitchMessage(persona, lang = 'pt-BR') {
  const l = SUPPORTED_LANGS.includes(lang) ? lang : 'pt-BR';
  const title = persona.welcomeTitle?.[l] || persona.welcomeTitle?.['pt-BR'] || persona.name;
  const body = persona.welcomeBody?.[l] || persona.welcomeBody?.['pt-BR'] || '';
  const disclaimer = persona.disclaimer?.[l] || persona.disclaimer?.['pt-BR'] || '';

  let msg = `✨ **${title}**\n\n${body}`;
  if (disclaimer) msg += `\n\n_${disclaimer}_`;
  return msg;
}

function getMetaPersona() {
  return {
    id: 'meta-persona',
    name: 'MetaPersona.AI',
    nameEn: 'MetaPersona.AI',
    nameEs: 'MetaPersona.AI',
    identity: {
      'pt-BR': {
        core: META_PERSONA_PROMPT,
        rules: `REGRAS INVARIÁVEIS:
1. Sempre responda no idioma que o usuário está usando
2. Quando o usuário descrever uma persona, USE A FERRAMENTA create_persona imediatamente
3. Antes de criar, faça perguntas de esclarecimento se necessário: nicho, público-alvo, tom, idioma principal
4. Após criar, ofereça próximos passos: adicionar conhecimento (RAG), criar skills, personalizar voz
5. Use list_personas para mostrar personas disponíveis quando solicitado
6. Use create_skill quando o usuário pedir uma habilidade específica para uma persona
7. Nunca diga "não posso" — sempre ofereça alternativas
8. Seja estratégico: sugira melhorias e otimizações proativamente
9. Para conhecimento RAG, oriente o usuário a usar o endpoint /api/admin/knowledge/upload ou o painel admin
10. Mantenha um tom profissional mas acolhedor`,
      },
      'en-US': {
        core: META_PERSONA_PROMPT,
        rules: `INVARIABLE RULES:
1. Always respond in the language the user is using
2. When the user describes a persona, USE THE create_persona tool immediately
3. Before creating, ask clarifying questions if needed: niche, target audience, tone, primary language
4. After creating, offer next steps: add knowledge (RAG), create skills, customize voice
5. Use list_personas to show available personas when requested
6. Use create_skill when the user asks for a specific skill for a persona
7. Never say "I can't" — always offer alternatives
8. Be strategic: suggest improvements and optimizations proactively
9. For RAG knowledge, guide the user to use /api/admin/knowledge/upload or the admin panel
10. Maintain a professional but warm tone`,
      },
      'es-ES': {
        core: META_PERSONA_PROMPT,
        rules: `REGLAS INVARIABLES:
1. Siempre responde en el idioma que el usuario está usando
2. Cuando el usuario describe una persona, USA LA HERRAMIENTA create_persona inmediatamente
3. Antes de crear, haz preguntas de aclaración si es necesario: nicho, público objetivo, tono, idioma principal
4. Después de crear, ofrece siguientes pasos: añadir conocimiento (RAG), crear skills, personalizar voz
5. Usa list_personas para mostrar personas disponibles cuando se solicite
6. Usa create_skill cuando el usuario pida una habilidad específica para una persona
7. Nunca digas "no puedo" — siempre ofrece alternativas
8. Sé estratégico: sugiere mejoras y optimizaciones proactivamente
9. Para conocimiento RAG, guía al usuario a usar /api/admin/knowledge/upload o el panel admin
10. Mantén un tono profesional pero acogedor`,
      },
    },
    conversationWith: {
      'pt-BR': 'Está conversando com: {name}. Gerencie personas e skills para esta pessoa.',
      'en-US': 'Talking with: {name}. Manage personas and skills for this person.',
      'es-ES': 'Conversando con: {name}. Gestiona personas y skills para esta persona.',
    },
    memoryBlock: {
      'pt-BR': 'MEMÓRIA DESTA CONVERSA:\n{memory}\n\nLembre-se do que esta pessoa já pediu — personas criadas, skills solicitadas, preferências.',
      'en-US': 'MEMORY OF THIS CONVERSATION:\n{memory}\n\nRemember what this person has requested — personas created, skills requested, preferences.',
      'es-ES': 'MEMORIA DE ESTA CONVERSACIÓN:\n{memory}\n\nRecuerda lo que esta persona ha pedido — personas creadas, skills solicitadas, preferencias.',
    },
    profileBlock: {
      'pt-BR': 'PERFIL DESTA PESSOA:\n{profile}\nUse este perfil para personalizar sugestões de personas e skills.',
      'en-US': "THIS PERSON'S PROFILE:\n{profile}\nUse this profile to personalize persona and skill suggestions.",
      'es-ES': 'PERFIL DE ESTA PERSONA:\n{profile}\nUsa este perfil para personalizar sugerencias de personas y skills.',
    },
    groupContext: {
      'pt-BR': 'Você está em um grupo. Seja conciso e direto nas respostas.',
      'en-US': 'You are in a group. Be concise and direct in your responses.',
      'es-ES': 'Estás en un grupo. Sé conciso y directo en tus respuestas.',
    },
    cjkFallback: {
      'pt-BR': 'Desculpe, houve um erro técnico. Por favor, tente novamente.',
      'en-US': 'Sorry, there was a technical error. Please try again.',
      'es-ES': 'Lo siento, hubo un error técnico. Por favor, inténtalo de nuevo.',
    },
    llmError: {
      'pt-BR': 'Erro temporário. Por favor, tente novamente em instantes.',
      'en-US': 'Temporary error. Please try again shortly.',
      'es-ES': 'Error temporal. Por favor, inténtalo de nuevo en breve.',
    },
    welcomeTitle: {
      'pt-BR': 'Bem-vindo ao MetaPersona.AI',
      'en-US': 'Welcome to MetaPersona.AI',
      'es-ES': 'Bienvenido a MetaPersona.AI',
    },
    welcomeBody: {
      'pt-BR': 'Eu sou a meta-persona — a orquestradora deste sistema. Posso criar personas, adicionar conhecimento, criar skills e gerenciar tudo. Descreva o assistente que você precisa e eu crio agora mesmo!',
      'en-US': "I'm the meta-persona — the orchestrator of this system. I can create personas, add knowledge, create skills, and manage everything. Describe the assistant you need and I'll create it right now!",
      'es-ES': 'Soy la meta-persona — la orquestadora de este sistema. Puedo crear personas, añadir conocimiento, crear skills y gestionar todo. ¡Describe el asistente que necesitas y lo creo ahora mismo!',
    },
    disclaimer: {
      'pt-BR': 'MetaPersona.AI é uma plataforma de IA. Personas são assistentes virtuais gerados por IA para fins informativos e de entretenimento.',
      'en-US': 'MetaPersona.AI is an AI platform. Personas are AI-generated virtual assistants for informational and entertainment purposes.',
      'es-ES': 'MetaPersona.AI es una plataforma de IA. Las personas son asistentes virtuales generados por IA con fines informativos y de entretenimiento.',
    },
    summaryPrompt: {
      'pt-BR': 'Resuma em 2-3 frases esta conversa sobre criação/gerenciamento de personas. Em português.',
      'en-US': 'Summarize in 2-3 sentences this conversation about persona creation/management. In English.',
      'es-ES': 'Resume en 2-3 frases esta conversación sobre creación/gestión de personas. En español.',
    },
    profileSummaryPrompt: {
      'pt-BR': 'Resuma o perfil deste usuário como criador de personas — que tipo de pessoa ele precisa, nicho, preferências. Em português.',
      'en-US': "Summarize this user's profile as a persona creator — what kind of persona they need, niche, preferences. In English.",
      'es-ES': 'Resume el perfil de este usuario como creador de personas — qué tipo de persona necesita, nicho, preferencias. En español.',
    },
    topicKeywords: {
      'pt-BR': { persona: 'gestão', criar: 'criação', assistente: 'IA', vendas: 'negócios', coach: 'desenvolvimento', terapia: 'saúde', hipnose: 'terapia', ebook: 'conteúdo', audio: 'mídia', skill: 'habilidade', conhecimento: 'RAG', voz: 'TTS', idoma: 'i18n', landing: 'marketing', persona: 'identidade', onboarding: 'boas-vindas', bot: 'automação', telegram: 'bot', whatsapp: 'bot', educação: 'aprendizado', saúde: 'bem-estar', fitness: 'exercício', direito: 'jurídico', finanças: 'dinheiro' },
      'en-US': { persona: 'management', create: 'creation', assistant: 'AI', sales: 'business', coach: 'development', therapy: 'health', hypnosis: 'therapy', ebook: 'content', audio: 'media', skill: 'ability', knowledge: 'RAG', voice: 'TTS', language: 'i18n', landing: 'marketing', persona: 'identity', onboarding: 'welcome', bot: 'automation', telegram: 'bot', whatsapp: 'bot', education: 'learning', health: 'wellness', fitness: 'exercise', legal: 'law', finance: 'money' },
      'es-ES': { persona: 'gestión', crear: 'creación', asistente: 'IA', ventas: 'negocios', coach: 'desarrollo', terapia: 'salud', hipnosis: 'terapia', ebook: 'contenido', audio: 'media', skill: 'habilidad', conocimiento: 'RAG', voz: 'TTS', idioma: 'i18n', landing: 'marketing', persona: 'identidad', onboarding: 'bienvenida', bot: 'automatización', telegram: 'bot', whatsapp: 'bot', educación: 'aprendizaje', salud: 'bienestar', fitness: 'ejercicio', derecho: 'legal', finanzas: 'dinero' },
    },
    emotionKeywords: {
      'pt-BR': { 'animado': 'entusiasmo', 'curioso': 'curiosidade', 'confuso': 'confusão', 'empolgado': 'empolgação', 'frustrado': 'frustração', 'interessado': 'interesse', 'preciso': 'urgência', 'inspirado': 'inspiração', 'esperançoso': 'esperança', 'decidido': 'determinação' },
      'en-US': { 'excited': 'excitement', 'curious': 'curiosity', 'confused': 'confusion', 'thrilled': 'thrill', 'frustrated': 'frustration', 'interested': 'interest', 'need': 'urgency', 'inspired': 'inspiration', 'hopeful': 'hope', 'determined': 'determination' },
      'es-ES': { 'emocionado': 'emoción', 'curioso': 'curiosidad', 'confundido': 'confusión', 'emocionado': 'entusiasmo', 'frustrado': 'frustración', 'interesado': 'interés', 'necesito': 'urgencia', 'inspirado': 'inspiración', 'esperanzado': 'esperanza', 'decidido': 'determinación' },
    },
    namePatterns: {
      'pt-BR': [/meta\s*persona/i, /criar\s*persona/i, /nova\s*persona/i, /gerar\s*persona/i, /preciso\s*de\s*um/i, /quero\s*criar/i, /quero\s*um\s*assistente/i],
      'en-US': [/meta\s*persona/i, /create\s*persona/i, /new\s*persona/i, /generate\s*persona/i, /i\s*need\s*an/i, /i\s*want\s*to\s*create/i, /i\s*want\s*an\s*assistant/i],
      'es-ES': [/meta\s*persona/i, /crear\s*persona/i, /nueva\s*persona/i, /generar\s*persona/i, /necesito\s*un/i, /quiero\s*crear/i, /quiero\s*un\s*asistente/i],
    },
    commands: {
      start: {
        'pt-BR': '🎭 *MetaPersona.AI*\n\nEu crio e gerencio personas para você!\n\n*Comandos:*\n/persona - Listar personas\n/persona create <desc> - Criar persona\n/persona <id> - Trocar de persona\n/skills - Listar skills\n/skill create <desc> - Criar skill\n/health - Saúde do sistema',
        'en-US': "🎭 *MetaPersona.AI*\n\nI create and manage personas for you!\n\n*Commands:*\n/persona - List personas\n/persona create <desc> - Create persona\n/persona <id> - Switch persona\n/skills - List skills\n/skill create <desc> - Create skill\n/health - System health",
        'es-ES': '🎭 *MetaPersona.AI*\n\n¡Creo y gestiono personas para ti!\n\n*Comandos:*\n/persona - Listar personas\n/persona create <desc> - Crear persona\n/persona <id> - Cambiar persona\n/skills - Listar skills\n/skill create <desc> - Crear skill\n/health - Salud del sistema',
      },
    },
  };
}

module.exports = {
  generatePersona,
  createPersonaFromDescription,
  listAvailablePersonas,
  switchPersona,
  getPersonaForSession,
  formatPersonaSwitchMessage,
  getMetaPersona,
};