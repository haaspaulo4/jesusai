const integrations = require('../llm/integrationManager');
const { searchVerses } = require('../knowledge/store');
const personaManager = require('./manager');
const { getSetting } = require('../settings');
const { t, SUPPORTED_LANGS } = require('../i18n');

const PERSONA_GENERATION_PROMPT = `You are a persona architect for an AI assistant. Given a persona name/description, generate a COMPLETE persona configuration in JSON format.

The persona will be used for a biblical/spiritual AI assistant that conversations with people. It should be grounded in scripture but can represent any biblical figure, spiritual guide, or thematic persona.

Generate the following JSON structure (respond with ONLY valid JSON, no markdown):
{
  "name": "Display Name",
  "name_en": "English Name",
  "name_es": "Spanish Name",
  "identity": {
    "pt-BR": {
      "core": "Full character description in first person, 200+ words, covering who they are, their story, their character traits with scripture references",
      "rules": "Invariable rules for this persona, 12+ rules covering behavior, language, tone, how to handle difficult questions, crisis situations"
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
  "prayerPrompt": {
    "pt-BR": "Prompt for generating a prayer in this persona's voice",
    "en-US": "English prayer prompt",
    "es-ES": "Spanish prayer prompt"
  },
  "summaryPrompt": {
    "pt-BR": "Prompt for summarizing conversation in this persona's voice",
    "en-US": "English summary prompt",
    "es-ES": "Spanish summary prompt"
  },
  "ttsVoice": "pm_alex",
  "ttsLang": "p"
}

IMPORTANT RULES FOR GENERATION:
- The persona MUST be deeply grounded in Scripture with specific Bible references
- The core identity should be 200+ words, written in FIRST PERSON
- All 3 languages (pt-BR, en-US, es-ES) must be provided
- Topic keywords should cover at least 20 relevant topics for this persona
- Emotion keywords should cover at least 15 emotions
- Name patterns should match variations of how users might refer to this persona
- The disclaimer should clarify this is a biblical/theological study tool
- ttsVoice: use "pm_alex" for male personas, "pf_dora" for female, "pm_alex" default
- ttsLang: "p" for Portuguese, "a" for English, "e" for Spanish`;

async function generatePersona(nameOrDescription, lang = 'pt-BR') {
  const verses = searchVerses(nameOrDescription, 5);
  const verseContext = verses.length > 0
    ? verses.map(v => `${v.reference}: "${v.text}"`).join('\n')
    : '';

  const contextAddition = verseContext
    ? `\n\nRelevant Bible verses to consider:\n${verseContext}`
    : '';

  const prompt = `${PERSONA_GENERATION_PROMPT}\n\nGenerate a complete persona configuration for: "${nameOrDescription}"${contextAddition}\n\nRespond with ONLY the JSON object, no other text.`;

  const maxTokens = parseInt(await getSetting('max_tokens', '4096')) || 4096;

  try {
    const result = await integrations.callLLM(
      [{ role: 'system', content: prompt }],
      {
        stream: false,
        temperature: 0.7,
        numPredict: maxTokens,
        retries: 1,
        timeout: 60000,
      }
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

async function createPersonaFromDescription(nameOrDescription, createdBy) {
  const personaData = await generatePersona(nameOrDescription);

  personaData.knowledgeSources = ['bible-pt-br'];

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
      const { pool } = require('../db');
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

module.exports = {
  generatePersona,
  createPersonaFromDescription,
  listAvailablePersonas,
  switchPersona,
  getPersonaForSession,
  formatPersonaSwitchMessage,
};