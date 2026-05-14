const { pool } = require('../db');
const { PERSONAS: HARDCODED_PERSONAS, buildSystemPrompt } = require('../persona/config');

let cache = new Map();
let loaded = false;

const DEFAULT_PERSONAS = {
  ...HARDCODED_PERSONAS,
};

async function loadPersonas() {
  if (loaded) return;

  try {
    const [rows] = await pool.execute('SELECT * FROM personas WHERE is_active = 1 ORDER BY priority ASC');
    for (const row of rows) {
      let identity = row.identity;
      if (typeof identity === 'string') {
        try { identity = JSON.parse(identity); } catch {}
      }
      let commands = row.commands;
      if (typeof commands === 'string') {
        try { commands = JSON.parse(commands); } catch {}
      }
      let topicKeywords = row.topic_keywords;
      if (typeof topicKeywords === 'string') {
        try { topicKeywords = JSON.parse(topicKeywords); } catch {}
      }
      let emotionKeywords = row.emotion_keywords;
      if (typeof emotionKeywords === 'string') {
        try { emotionKeywords = JSON.parse(emotionKeywords); } catch {}
      }
      let namePatterns = row.name_patterns;
      if (typeof namePatterns === 'string') {
        try { namePatterns = JSON.parse(namePatterns); } catch {}
      }

      cache.set(row.persona_id, {
        id: row.persona_id,
        name: row.name,
        nameEn: row.name_en || row.name,
        nameEs: row.name_es || row.name,
        identity: identity || DEFAULT_PERSONAS.jesus?.identity,
        commands: commands || DEFAULT_PERSONAS.jesus?.commands,
        topicKeywords: topicKeywords || DEFAULT_PERSONAS.jesus?.topicKeywords,
        emotionKeywords: emotionKeywords || DEFAULT_PERSONAS.jesus?.emotionKeywords,
        namePatterns: namePatterns || DEFAULT_PERSONAS.jesus?.namePatterns,
        disclaimer: row.disclaimer ? (typeof row.disclaimer === 'string' ? JSON.parse(row.disclaimer) : row.disclaimer) : DEFAULT_PERSONAS.jesus?.disclaimer,
        conversationWith: row.conversation_with ? (typeof row.conversation_with === 'string' ? JSON.parse(row.conversation_with) : row.conversation_with) : DEFAULT_PERSONAS.jesus?.conversationWith,
        memoryBlock: row.memory_block ? (typeof row.memory_block === 'string' ? JSON.parse(row.memory_block) : row.memory_block) : DEFAULT_PERSONAS.jesus?.memoryBlock,
        profileBlock: row.profile_block ? (typeof row.profile_block === 'string' ? JSON.parse(row.profile_block) : row.profile_block) : DEFAULT_PERSONAS.jesus?.profileBlock,
        groupContext: row.group_context ? (typeof row.group_context === 'string' ? JSON.parse(row.group_context) : row.group_context) : DEFAULT_PERSONAS.jesus?.groupContext,
        cjkFallback: row.cjk_fallback ? (typeof row.cjk_fallback === 'string' ? JSON.parse(row.cjk_fallback) : row.cjk_fallback) : DEFAULT_PERSONAS.jesus?.cjkFallback,
        llmError: row.llm_error ? (typeof row.llm_error === 'string' ? JSON.parse(row.llm_error) : row.llm_error) : DEFAULT_PERSONAS.jesus?.llmError,
        welcomeTitle: row.welcome_title ? (typeof row.welcome_title === 'string' ? JSON.parse(row.welcome_title) : row.welcome_title) : null,
        welcomeBody: row.welcome_body ? (typeof row.welcome_body === 'string' ? JSON.parse(row.welcome_body) : row.welcome_body) : null,
        prayerPrompt: row.prayer_prompt ? (typeof row.prayer_prompt === 'string' ? JSON.parse(row.prayer_prompt) : row.prayer_prompt) : DEFAULT_PERSONAS.jesus?.prayerPrompt,
        blogPrompt: row.blog_prompt ? (typeof row.blog_prompt === 'string' ? JSON.parse(row.blog_prompt) : row.blog_prompt) : DEFAULT_PERSONAS.jesus?.blogPrompt,
        blogTopics: row.blog_topics ? (typeof row.blog_topics === 'string' ? JSON.parse(row.blog_topics) : row.blog_topics) : DEFAULT_PERSONAS.jesus?.blogTopics,
        donateVerse: row.donate_verse ? (typeof row.donate_verse === 'string' ? JSON.parse(row.donate_verse) : row.donate_verse) : DEFAULT_PERSONAS.jesus?.donateVerse,
        summaryPrompt: row.summary_prompt ? (typeof row.summary_prompt === 'string' ? JSON.parse(row.summary_prompt) : row.summary_prompt) : DEFAULT_PERSONAS.jesus?.summaryPrompt,
        profileSummaryPrompt: row.profile_summary_prompt ? (typeof row.profile_summary_prompt === 'string' ? JSON.parse(row.profile_summary_prompt) : row.profile_summary_prompt) : DEFAULT_PERSONAS.jesus?.profileSummaryPrompt,
        ttsVoice: row.tts_voice || 'pm_alex',
        ttsLang: row.tts_lang || 'p',
        model: row.model || null,
        knowledgeSources: row.knowledge_sources ? (typeof row.knowledge_sources === 'string' ? JSON.parse(row.knowledge_sources) : row.knowledge_sources) : null,
        isActive: true,
        priority: row.priority || 100,
        // Identity Visual System
        avatarUrl: row.avatar_url || null,
        avatarStyle: row.avatar_style || 'realistic',
        palette: row.palette ? (typeof row.palette === 'string' ? JSON.parse(row.palette) : row.palette) : null,
        fontFamily: row.font_family || 'Inter',
        emojiStyle: row.emoji_style || 'native',
        backgroundStyle: row.background_style ? (typeof row.background_style === 'string' ? JSON.parse(row.background_style) : row.background_style) : null,
        animationStyle: row.animation_style || 'subtle',
        accentColor: row.accent_color || '#D4A843',
        // Media Identity
        avatarVideoUrl: row.avatar_video_url || null,
        avatarAudioGreeting: row.avatar_audio_greeting || null,
        coverImageUrl: row.cover_image_url || null,
        mediaGallery: row.media_gallery ? (typeof row.media_gallery === 'string' ? JSON.parse(row.media_gallery) : row.media_gallery) : null,
        responseMediaEnabled: row.response_media_enabled !== 0,
        businessConfig: row.business_config ? (typeof row.business_config === 'string' ? JSON.parse(row.business_config) : row.business_config) : null,
      });
    }
  } catch (err) {
    console.error('[PersonaManager] Failed to load personas from DB:', err.message);
  }

  for (const [id, persona] of Object.entries(DEFAULT_PERSONAS)) {
    if (!cache.has(id)) {
      cache.set(id, { ...persona, id, isActive: true, priority: 0, ttsVoice: 'pm_alex', ttsLang: 'p' });
    }
  }

  loaded = true;
  console.log(`[PersonaManager] ${cache.size} persona(s) loaded: ${[...cache.keys()].join(', ')}`);
}

async function getPersona(personaId) {
  if (!loaded) await loadPersonas();
  return cache.get(personaId) || cache.get('jesus') || [...cache.values()][0];
}

function getActivePersona() {
  const envId = process.env.PERSONA || 'jesus';
  return cache.get(envId) || cache.get('jesus') || [...cache.values()][0];
}

async function listPersonas() {
  if (!loaded) await loadPersonas();
  return [...cache.values()].map(p => ({
    id: p.id,
    name: p.name,
    nameEn: p.nameEn,
    nameEs: p.nameEs,
    ttsVoice: p.ttsVoice,
    ttsLang: p.ttsLang,
    model: p.model,
    isActive: p.isActive !== false,
    priority: p.priority,
    // Visual Identity
    avatarUrl: p.avatarUrl || `https://api.dicebear.com/9.x/adventurer/svg?seed=${p.id}`,
    avatarStyle: p.avatarStyle || 'adventurer',
    palette: p.palette || { primary: '#D4A843', secondary: '#1a1a2e' },
    emojiStyle: p.emojiStyle || 'native',
    animationStyle: p.animationStyle || 'subtle',
    accentColor: p.accentColor || '#D4A843',
    fontFamily: p.fontFamily || 'Inter',
    backgroundStyle: p.backgroundStyle || { type: 'gradient', colors: ['#667eea', '#764ba2'] },
    // Media Identity
    avatarVideoUrl: p.avatarVideoUrl || null,
    avatarAudioGreeting: p.avatarAudioGreeting || null,
    coverImageUrl: p.coverImageUrl || null,
    mediaGallery: p.mediaGallery || [],
    responseMediaEnabled: p.responseMediaEnabled !== false,
    businessConfig: p.businessConfig || null,
  }));
}

async function createPersona(data) {
  const id = data.id || data.persona_id || 'persona_' + Date.now().toString(36);

  let knowledgeSources = data.knowledge_sources || data.knowledgeSources || null;
  if (!knowledgeSources && cache.has(id)) {
    knowledgeSources = cache.get(id).knowledgeSources || null;
  }

  const identity = data.identity || (cache.has(id) ? cache.get(id).identity : null) || DEFAULT_PERSONAS.jesus.identity;
  const commands = data.commands || (cache.has(id) ? cache.get(id).commands : null) || DEFAULT_PERSONAS.jesus.commands;
  const ttsVoice = data.tts_voice || data.ttsVoice || 'pm_alex';
  const ttsLang = data.tts_lang || data.ttsLang || 'p';
  const model = data.model || null;
  const name = data.name || id;
  const name_en = data.name_en || data.nameEn || name;
  const name_es = data.name_es || data.nameEs || name;
  const priority = data.priority || 100;

  const stringFields = (val) => val && typeof val === 'object' ? JSON.stringify(val) : (val || null);

  try {
    const existing = cache.get(id);
    const finalIdentity = identity || (existing ? existing.identity : null) || DEFAULT_PERSONAS.jesus.identity;
    const finalCommands = commands || (existing ? existing.commands : null) || DEFAULT_PERSONAS.jesus.commands;
    const finalKnowledgeSources = knowledgeSources || (existing ? existing.knowledgeSources : null);
    const finalDisclaimer = data.disclaimer || data.disclaimer || (existing ? existing.disclaimer : null) || DEFAULT_PERSONAS.jesus?.disclaimer;
    const finalConversationWith = data.conversationWith || data.conversation_with || (existing ? existing.conversationWith : null) || DEFAULT_PERSONAS.jesus?.conversationWith;
    const finalMemoryBlock = data.memoryBlock || data.memory_block || (existing ? existing.memoryBlock : null) || DEFAULT_PERSONAS.jesus?.memoryBlock;
    const finalProfileBlock = data.profileBlock || data.profile_block || (existing ? existing.profileBlock : null) || DEFAULT_PERSONAS.jesus?.profileBlock;
    const finalGroupContext = data.groupContext || data.group_context || (existing ? existing.groupContext : null) || DEFAULT_PERSONAS.jesus?.groupContext;
    const finalCjkFallback = data.cjkFallback || data.cjk_fallback || (existing ? existing.cjkFallback : null) || DEFAULT_PERSONAS.jesus?.cjkFallback;
    const finalLlmError = data.llmError || data.llm_error || (existing ? existing.llmError : null) || DEFAULT_PERSONAS.jesus?.llmError;
    const finalWelcomeTitle = data.welcomeTitle || data.welcome_title || (existing ? existing.welcomeTitle : null);
    const finalWelcomeBody = data.welcomeBody || data.welcome_body || (existing ? existing.welcomeBody : null);
    const finalPrayerPrompt = data.prayerPrompt || data.prayer_prompt || (existing ? existing.prayerPrompt : null) || DEFAULT_PERSONAS.jesus?.prayerPrompt;
    const finalBlogPrompt = data.blogPrompt || data.blog_prompt || (existing ? existing.blogPrompt : null) || DEFAULT_PERSONAS.jesus?.blogPrompt;
    const finalBlogTopics = data.blogTopics || data.blog_topics || (existing ? existing.blogTopics : null) || DEFAULT_PERSONAS.jesus?.blogTopics;
    const finalDonateVerse = data.donateVerse || data.donate_verse || (existing ? existing.donateVerse : null) || DEFAULT_PERSONAS.jesus?.donateVerse;
    const finalSummaryPrompt = data.summaryPrompt || data.summary_prompt || (existing ? existing.summaryPrompt : null) || DEFAULT_PERSONAS.jesus?.summaryPrompt;
    const finalProfileSummaryPrompt = data.profileSummaryPrompt || data.profile_summary_prompt || (existing ? existing.profileSummaryPrompt : null) || DEFAULT_PERSONAS.jesus?.profileSummaryPrompt;
  const finalNamePatterns = data.namePatterns || data.name_patterns || (existing ? existing.namePatterns : null) || DEFAULT_PERSONAS.jesus?.namePatterns;
  const finalTopicKeywords = data.topicKeywords || data.topic_keywords || (existing ? existing.topicKeywords : null) || DEFAULT_PERSONAS.jesus?.topicKeywords;
  const finalEmotionKeywords = data.emotionKeywords || data.emotion_keywords || (existing ? existing.emotionKeywords : null) || DEFAULT_PERSONAS.jesus?.emotionKeywords;
  const finalBusinessConfig = data.businessConfig || data.business_config || (existing ? existing.businessConfig : null);

    await pool.execute(
      `INSERT INTO personas (persona_id, name, name_en, name_es, identity, commands, tts_voice, tts_lang, model, priority, is_active, knowledge_sources,
        disclaimer, conversation_with, memory_block, profile_block, group_context, cjk_fallback, llm_error, welcome_title, welcome_body,
        prayer_prompt, blog_prompt, blog_topics, donate_verse, summary_prompt, profile_summary_prompt, name_patterns, topic_keywords, emotion_keywords, business_config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), name_en=VALUES(name_en), name_es=VALUES(name_es), identity=VALUES(identity),
       commands=VALUES(commands), tts_voice=VALUES(tts_voice), tts_lang=VALUES(tts_lang), model=VALUES(model), priority=VALUES(priority),
       knowledge_sources=VALUES(knowledge_sources), disclaimer=VALUES(disclaimer), conversation_with=VALUES(conversation_with),
       memory_block=VALUES(memory_block), profile_block=VALUES(profile_block), group_context=VALUES(group_context),
       cjk_fallback=VALUES(cjk_fallback), llm_error=VALUES(llm_error), welcome_title=VALUES(welcome_title), welcome_body=VALUES(welcome_body),
       prayer_prompt=VALUES(prayer_prompt), blog_prompt=VALUES(blog_prompt), blog_topics=VALUES(blog_topics), donate_verse=VALUES(donate_verse),
       summary_prompt=VALUES(summary_prompt), profile_summary_prompt=VALUES(profile_summary_prompt),
       name_patterns=VALUES(name_patterns), topic_keywords=VALUES(topic_keywords), emotion_keywords=VALUES(emotion_keywords),
       business_config=VALUES(business_config)`,
      [id, name, name_en, name_es, stringFields(finalIdentity), stringFields(finalCommands), ttsVoice, ttsLang, model, priority, stringFields(finalKnowledgeSources),
       stringFields(finalDisclaimer), stringFields(finalConversationWith),
       stringFields(finalMemoryBlock), stringFields(finalProfileBlock),
       stringFields(finalGroupContext), stringFields(finalCjkFallback),
       stringFields(finalLlmError), stringFields(finalWelcomeTitle),
       stringFields(finalWelcomeBody), stringFields(finalPrayerPrompt),
       stringFields(finalBlogPrompt), stringFields(finalBlogTopics), stringFields(finalDonateVerse), stringFields(finalSummaryPrompt),
       stringFields(finalProfileSummaryPrompt),
       stringFields(finalNamePatterns),
       stringFields(finalTopicKeywords),
       stringFields(finalEmotionKeywords),
       stringFields(finalBusinessConfig)]
    );
  } catch (err) {
    console.error('[PersonaManager] DB save failed, using in-memory only:', err.message);
  }

  const persona = {
    id, name, nameEn: name_en, nameEs: name_es,
    identity: identity || DEFAULT_PERSONAS.jesus.identity,
    commands: commands || DEFAULT_PERSONAS.jesus.commands,
    topicKeywords: data.topicKeywords || data.topic_keywords || DEFAULT_PERSONAS.jesus.topicKeywords,
    emotionKeywords: data.emotionKeywords || data.emotion_keywords || DEFAULT_PERSONAS.jesus.emotionKeywords,
    namePatterns: data.namePatterns || data.name_patterns || DEFAULT_PERSONAS.jesus.namePatterns,
    disclaimer: data.disclaimer || DEFAULT_PERSONAS.jesus.disclaimer,
    conversationWith: data.conversationWith || data.conversation_with || DEFAULT_PERSONAS.jesus.conversationWith,
    memoryBlock: data.memoryBlock || data.memory_block || DEFAULT_PERSONAS.jesus.memoryBlock,
    profileBlock: data.profileBlock || data.profile_block || DEFAULT_PERSONAS.jesus.profileBlock,
    groupContext: data.groupContext || data.group_context || DEFAULT_PERSONAS.jesus.groupContext,
    cjkFallback: data.cjkFallback || data.cjk_fallback || DEFAULT_PERSONAS.jesus.cjkFallback,
    llmError: data.llmError || data.llm_error || DEFAULT_PERSONAS.jesus.llmError,
    welcomeTitle: data.welcomeTitle || data.welcome_title || DEFAULT_PERSONAS.jesus.welcomeTitle,
    welcomeBody: data.welcomeBody || data.welcome_body || DEFAULT_PERSONAS.jesus.welcomeBody,
    prayerPrompt: data.prayerPrompt || data.prayer_prompt || DEFAULT_PERSONAS.jesus.prayerPrompt,
    blogPrompt: data.blogPrompt || data.blog_prompt || DEFAULT_PERSONAS.jesus.blogPrompt,
    blogTopics: data.blogTopics || data.blog_topics || DEFAULT_PERSONAS.jesus.blogTopics,
    donateVerse: data.donateVerse || data.donate_verse || DEFAULT_PERSONAS.jesus.donateVerse,
    summaryPrompt: data.summaryPrompt || data.summary_prompt || DEFAULT_PERSONAS.jesus.summaryPrompt,
    profileSummaryPrompt: data.profileSummaryPrompt || data.profile_summary_prompt || DEFAULT_PERSONAS.jesus.profileSummaryPrompt,
    ttsVoice, ttsLang, model, knowledgeSources: knowledgeSources,
    isActive: true, priority,
    businessConfig: finalBusinessConfig || null,
  };

  cache.set(id, persona);
  console.log(`[PersonaManager] Created/Updated persona: "${name}" (${id})`);
  return persona;
}

async function deletePersona(personaId) {
  if (personaId === 'jesus') throw new Error('Cannot delete the default persona');

  try {
    await pool.execute('DELETE FROM personas WHERE persona_id = ?', [personaId]);
  } catch (err) {
    console.error('[PersonaManager] Failed to delete persona from DB:', err.message);
  }

  cache.delete(personaId);
  console.log(`[PersonaManager] Deleted persona: ${personaId}`);
}

async function togglePersona(personaId, isActive) {
  if (personaId === 'jesus') throw new Error('Cannot disable the default persona');

  try {
    await pool.execute('UPDATE personas SET is_active = ? WHERE persona_id = ?', [isActive ? 1 : 0, personaId]);
  } catch (err) {
    console.error('[PersonaManager] Failed to toggle persona in DB:', err.message);
  }

  const persona = cache.get(personaId);
  if (persona) persona.isActive = !!isActive;
  console.log(`[PersonaManager] ${isActive ? 'Enabled' : 'Disabled'} persona: ${personaId}`);
}

async function setSessionPersona(sessionId, personaId) {
  try {
    await pool.execute('UPDATE sessions SET persona_id = ? WHERE id = ?', [personaId, sessionId]);
  } catch (err) {
    console.error('[PersonaManager] Failed to set session persona:', err.message);
  }
}

async function getSessionPersona(sessionId) {
  try {
    const [rows] = await pool.execute('SELECT persona_id FROM sessions WHERE id = ?', [sessionId]);
    if (rows.length > 0 && rows[0].persona_id) {
      return await getPersona(rows[0].persona_id);
    }
  } catch (err) {
    console.error('[PersonaManager] getSessionPersona error:', err.message);
  }
  return getActivePersona();
}

async function setUserPersona(userId, personaId) {
  try {
    await pool.execute('UPDATE users SET persona_id = ? WHERE id = ?', [personaId, userId]);
  } catch (err) {
    console.error('[PersonaManager] setUserPersona error:', err.message);
  }
}

async function getUserPersona(userId) {
  try {
    const [rows] = await pool.execute('SELECT persona_id FROM users WHERE id = ?', [userId]);
    if (rows.length > 0 && rows[0].persona_id) {
      return await getPersona(rows[0].persona_id);
    }
  } catch (err) {
    console.error('[PersonaManager] getUserPersona error:', err.message);
  }
  return getActivePersona();
}

function invalidateCache() {
  cache.clear();
  loaded = false;
}

module.exports = {
  loadPersonas,
  getPersona,
  getActivePersona,
  listPersonas,
  createPersona,
  deletePersona,
  togglePersona,
  setSessionPersona,
  getSessionPersona,
  setUserPersona,
  getUserPersona,
  invalidateCache,
  buildSystemPrompt,
};