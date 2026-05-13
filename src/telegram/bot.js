const { searchVerses } = require('../rag/store');
const { IDENTITY, CONTEXT_BLOCK, MEMORY_BLOCK } = require('../system-prompt');
const {
  getSession,
  addMessage,
  getHistoryForLLM,
  buildMemoryContext,
  updateSessionContext,
  generateSummary,
} = require('../memory/session');
const {
  getProfile,
  updateProfileFromMessage,
  buildProfileContext,
  generateProfileSummary,
} = require('../memory/profile');
const { getAllPosts, generatePost } = require('../blog');
const {
  cleanTextForTTS,
  splitTextForTTS,
  generateAudioBuffer,
  generateTTSAudioUrl,
  getAudioContentType,
} = require('../tts');
const { transcribeAudio } = require('../stt');
const { t, getTTSLang, getSTTLang, SUPPORTED_LANGS, DEFAULT_LANG } = require('../i18n');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_AUDIO = process.env.TELEGRAM_AUDIO !== 'false';

const userSessions = {};

function getSessionForChat(chatId) {
  if (!userSessions[chatId]) {
    userSessions[chatId] = `tg_${chatId}`;
  }
  return userSessions[chatId];
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\|/g, '\\|')
    .replace(/---/g, '—')
    .replace(/--/g, '–');
}

async function sendTelegramVoice(bot, chatId, text, lang = 'pt-BR') {
  if (!TELEGRAM_AUDIO) return;

  const chunks = splitTextForTTS(text, 300);
  if (!chunks || chunks.length === 0) return;

  console.log(`[Telegram] Sending voice: ${chunks.length} chunk(s), lang=${lang}`);
  for (const chunk of chunks) {
    if (chunk.length > 5000) continue;
    try {
      const audioBuffer = await generateAudioBuffer(chunk, { lang });
      if (audioBuffer && audioBuffer.length > 0) {
        const contentType = getAudioContentType(audioBuffer);
        const ext = contentType.includes('wav') ? 'wav' : 'mp3';
        console.log(`[Telegram] Voice chunk OK: ${audioBuffer.length} bytes, ${contentType}`);
        await bot.sendVoice(chatId, audioBuffer, { caption: '' }, { filename: `voice.${ext}`, contentType });
        continue;
      }
      console.log(`[Telegram] Voice chunk: generateAudioBuffer returned null/empty`);
    } catch (err) {
      console.error('[Telegram] Voice send failed:', err.message);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`[Telegram] Voice done`);
}

async function sendLongMessage(bot, chatId, text, options = {}) {
  const MAX_LEN = 800;
  const clean = text;

  if (clean.length <= MAX_LEN) {
    try {
      return await bot.sendMessage(chatId, escapeMarkdown(clean), { parse_mode: 'Markdown', ...options });
    } catch {
      return await bot.sendMessage(chatId, clean, { ...options });
    }
  }

  const paragraphs = clean.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > MAX_LEN) {
      if (current) chunks.push(current);
      if (para.length > MAX_LEN) {
        const sentences = para.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [para];
        let chunk = '';
        for (const s of sentences) {
          if ((chunk + s).length > MAX_LEN) {
            if (chunk) chunks.push(chunk);
            chunk = s;
          } else {
            chunk += s;
          }
        }
        if (chunk) current = chunk;
        else current = '';
      } else {
        current = para;
      }
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    try {
      await bot.sendMessage(chatId, escapeMarkdown(chunk), { parse_mode: 'Markdown', ...options });
    } catch {
      try {
        await bot.sendMessage(chatId, chunk, { ...options });
      } catch {}
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function callLLM(messages, stream = false) {
  const response = await fetch(`${OLLAMA_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      stream,
      options: { temperature: 0.7, num_predict: 1024 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  return response;
}

async function handleTelegramMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (!text) return;

  if (isGroup) {
    const botInfo = await getBotInfo(bot);
    const botUsername = botInfo?.username || '';
    const botMention = botUsername ? `@${botUsername}` : '';
    const isCommand = text.startsWith('/');
    const isMentioned = botMention && text.toLowerCase().includes(botMention.toLowerCase());
    const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.id === botInfo?.id;

    if (!isCommand && !isMentioned && !isReplyToBot) return;

    let cleanText = text.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
    if (!cleanText) return;
    msg.text = cleanText;

    if (cleanText.startsWith('/')) {
      await handleCommand(bot, chatId, cleanText.trim(), msg);
      return;
    }
  } else {
    if (text.startsWith('/')) {
      await handleCommand(bot, chatId, text.trim(), msg);
      return;
    }
  }

  const processedText = msg.text || text;

  bot.sendChatAction(chatId, 'typing');

  const lang = DEFAULT_LANG;
  const ttsLang = getTTSLang(lang);

  const sid = isGroup ? `tg_${chatId}_${msg.from.id}` : getSessionForChat(chatId);
  const uid = `tg_${msg.from.id}`;
  const userName = msg.from?.first_name || msg.from?.username || null;
  const userContext = extractContextFromMessage(processedText);
  if (userName && !userContext.name) userContext.name = userName;
  await updateSessionContext(sid, userContext);
  await updateProfileFromMessage(uid, processedText);

  try {
    const relevantVerses = searchVerses(processedText, 6);
    const contextStr = relevantVerses.length > 0 ? relevantVerses.map((v) => `${v.reference}: "${v.text}"`).join('\n') : '';
    const [memoryStr, profileStr] = await Promise.all([buildMemoryContext(sid), buildProfileContext(uid)]);

    let systemPrompt = t('identityPrompt', lang);
    if (contextStr) systemPrompt += t('contextBlock', lang).replace('{context}', contextStr);
    if (memoryStr) systemPrompt += t('memoryBlock', lang).replace('{memory}', memoryStr);
    if (profileStr) {
      systemPrompt += t('profileBlock', lang).replace('{profile}', profileStr);
    }

    if (isGroup) {
      systemPrompt += '\n\nVocê está em um grupo do Telegram. Responda de forma mais concisa (2-4 parágrafos). Se apropriado, mencione o nome da pessoa.';
    }

    const session = await getSession(sid);
    if (session.userName || userName) {
      systemPrompt += '\n\n' + t('conversationWith', lang).replace('{name}', session.userName || userName);
    }

    const history = await getHistoryForLLM(sid, 6);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: processedText },
    ];

    await addMessage(sid, 'user', processedText);

    const response = await callLLM(messages);
    const data = await response.json();
    let reply = data.message?.content?.trim() || 'Perdoe-me, não consegui responder agora. Tente novamente.';

    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(reply)) {
      console.warn('Telegram: CJK detected in response, using fallback');
      reply = t('cjkFallback', lang);
    }

    await addMessage(sid, 'assistant', reply);

    const sessionAfter = await getSession(sid);
    if (sessionAfter.messages && sessionAfter.messages.length > 0 && sessionAfter.messages.length % 10 === 0) {
      generateSummary(sid).catch(() => {});
      generateProfileSummary(uid).catch(() => {});
    }

    if (isGroup && userName) {
      reply = `${userName}, ` + reply.charAt(0).toLowerCase() + reply.slice(1);
    }

    await sendLongMessage(bot, chatId, reply);
    await sendTelegramVoice(bot, chatId, reply, ttsLang);
  } catch (err) {
    console.error('Telegram bot error:', err);
    const msg = err.message && err.message.includes('429')
      ? '🙏 Estou com muita demanda agora. Por favor, tente novamente em alguns segundos.'
      : t('llmError', lang);
    bot.sendMessage(chatId, msg);
  }
}

const _botInfoCache = {};
async function getBotInfo(bot) {
  const token = bot.token || bot.options?.token || '';
  if (_botInfoCache[token]) return _botInfoCache[token];
  try {
    const info = await bot.getMe();
    _botInfoCache[token] = info;
    return info;
  } catch {
    return null;
  }
}

async function handleCommand(bot, chatId, text, msg) {
  const command = text.split(' ')[0].toLowerCase();
  const args = text.substring(text.indexOf(' ') + 1).trim();

  switch (command) {
    case '/start':
      bot.sendMessage(chatId, `✝ *Jesus\\.AI*

Eu sou o caminho, a verdade e a vida\\. Ninguém vem ao Pai senão por mim \\(João 14:6\\)\\.

Estou aqui para ouvir você, caminhar contigo e compartilhar a Palavra do meu Pai\\.

_Toda glória a Jesus\\. Este projeto não substitui a busca pela Palavra, pela comunidade de fé, pela igreja ou pelo acompanhamento pastoral\\._

*Comandos disponíveis:*
/start \\- Mensagem inicial
/ajuda \\- Lista de comandos
/versiculo \\- Versículo do dia
/buscar \\- Buscar na Bíblia
/oracao \\- Receber uma oração
/devocional \\- Devocional do dia
/grupo \\- Criar grupo de estudo`, { parse_mode: 'MarkdownV2' });
      break;

    case '/ajuda':
    case '/help':
      bot.sendMessage(chatId, `✝ *Comandos do Jesus\\.AI*

/start \\- Mensagem inicial
/ajuda \\- Esta lista
/versiculo \\- Versículo do dia
/buscar \\[tema\\] \\- Buscar versículos
/oracao \\- Receber uma oração
/devocional \\- Devocional do dia
/grupo \\- Criar grupo de estudo

💡 Em grupos, responderei apenas quando me mencionarem ou usarem comandos\\.`, { parse_mode: 'MarkdownV2' });
      break;

    case '/versiculo': {
      bot.sendChatAction(chatId, 'typing');
      try {
        const topics = ['amor', 'fé', 'esperança', 'perdão', 'paz', 'força', 'sabedoria', 'graça', 'confiança', 'consolo'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const verses = await searchVerses(topic, 10);
        const verse = verses[Math.floor(Math.random() * verses.length)];
        bot.sendMessage(chatId, `📖 *${escapeMarkdown(verse.reference)}*

${escapeMarkdown(verse.text)}`, { parse_mode: 'Markdown' });
        const verseText = `${verse.reference}. ${verse.text}`;
        await sendTelegramVoice(bot, chatId, verseText);
      } catch {
        bot.sendMessage(chatId, '📖 "Porque Deus tanto amou o mundo que deu o seu Filho Unigênito, para que todo o que nele crer não pereça, mas tenha a vida eterna." — João 3:16');
      }
      break;
    }

    case '/buscar': {
      const query = args;
      if (!query || query === '/buscar') {
        bot.sendMessage(chatId, '🔍 Use: /buscar <tema ou palavra>\n\nExemplo: /buscar amor\nExemplo: /buscar Mateus 5');
        return;
      }
      bot.sendChatAction(chatId, 'typing');
      try {
        const results = await searchVerses(query, 5);
        if (results.length === 0) {
          bot.sendMessage(chatId, '🔍 Nenhum versículo encontrado para essa busca. Tente outro tema.');
          return;
        }
        const lines = results.map(v => `📖 *${escapeMarkdown(v.reference)}*\n${escapeMarkdown(v.text)}`).join('\n\n');
        bot.sendMessage(chatId, `🔍 *Versículos sobre: ${escapeMarkdown(query)}*\n\n${lines}`, { parse_mode: 'Markdown' });
      } catch {
        bot.sendMessage(chatId, 'Erro na busca. Tente novamente.');
      }
      break;
    }

    case '/oracao': {
      bot.sendChatAction(chatId, 'typing');
      const oracaoName = msg.from?.first_name || msg.from?.username || '';
      try {
        const messages = [
          { role: 'system', content: 'Você é Jesus Cristo. Escreva uma oração curta (4-6 linhas) em português do Brasil, em primeira pessoa, como Jesus oraria pelo seu povo hoje. Seja compassivo, amoroso e inspire esperança. Cite pelo menos um versículo.' },
          { role: 'user', content: oracaoName ? `Ore por ${oracaoName}.` : 'Ore por mim.' },
        ];
        const response = await callLLM(messages);
        const data = await response.json();
        const prayer = data.message?.content?.trim() || 'Pai, abençoe cada pessoa que lê esta oração. Que tua paz esteja com todos. Amém.';
        await sendLongMessage(bot, chatId, prayer);
        await sendTelegramVoice(bot, chatId, prayer);
      } catch {
        bot.sendMessage(chatId, '🙏 Pai nosso que estás nos céus, santificado seja o teu nome. Venha o teu reino, seja feita a tua vontade assim na terra como no céu. Amém. — Mateus 6:9-10');
      }
      break;
    }

    case '/devocional': {
      bot.sendChatAction(chatId, 'typing');
      try {
        const today = new Date();
        const posts = await getAllPosts();
        const todaySlug = `palavra-${today.toISOString().split('T')[0]}`;
        let post = posts.find(p => p.slug === todaySlug);

        if (!post) {
          post = await generatePost(today);
        }

        const header = `🕊 *${escapeMarkdown(post.title)}*\n_${escapeMarkdown(post.verse)}_\n📅 ${today.toLocaleDateString('pt-BR')}`;
        const content = escapeMarkdown(post.content.substring(0, 1500));
        bot.sendMessage(chatId, `${header}\n\n${content}`, { parse_mode: 'Markdown' });
      } catch {
        bot.sendMessage(chatId, '🕊 Devocional indisponível no momento. Mas lembre-se: "O Senhor é o meu pastor; nada me faltará." — Salmos 23:1');
      }
      break;
    }

    case '/grupo': {
      const groupTitle = args.trim() || 'Jesus.AI — Estudo Bíblico';
      try {
        const chat = await bot.getChat(chatId);
        if (chat.type === 'group' || chat.type === 'supergroup') {
          await bot.sendMessage(chatId, `🕊 Já estamos em um grupo! Use os comandos ou me mencione para conversar.\n\n*Comandos:* /versiculo, /buscar <tema>, /oracao, /ajuda`, { parse_mode: 'Markdown' });
        } else {
          const newChat = await bot.createChat(groupTitle, {});
          const inviteLink = await bot.createChatInviteLink(chatId);
          await bot.sendMessage(chatId, `🕊 *Grupo criado: ${escapeMarkdown(groupTitle)}*\n\nCompartilhe o convite e juntos estudiaremos a Palavra!\n\n💡 No grupo, respondo apenas quando me mencionarem ou usarem comandos (/versiculo, /buscar, etc).\n\n🔗 Convite: ${inviteLink.invite_link}`, { parse_mode: 'Markdown' });
        }
      } catch (err) {
        console.error('[Telegram] Group creation error:', err.message);
        await bot.sendMessage(chatId, '🕊 Não consegui criar o grupo. Você pode criar manualmente e me adicionar — responderei quando mencionado!\n\n💡 Use /ajuda para ver os comandos.');
      }
      break;
    }

    default:
      break;
  }
}

async function handleTelegramVoice(bot, msg) {
  if (!msg.voice && !msg.audio) return;

  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    const botInfo = await getBotInfo(bot);
    const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.id === botInfo?.id;
    const caption = msg.voice?.caption || msg.audio?.caption || '';
    const botUsername = botInfo?.username || '';
    const isMentioned = botUsername && caption.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
    if (!isReplyToBot && !isMentioned) return;
  }

  const fileId = msg.voice?.file_id || msg.audio?.file_id;
  if (!fileId) return;

  bot.sendChatAction(chatId, 'typing');

  try {
    const fileLink = await bot.getFileLink(fileId);
    const fileObj = await bot.getFile(fileId);
    const filePath = fileObj.file_path || '';
    const ext = filePath.split('.').pop() || 'ogg';
    console.log('[Telegram] Downloading voice from:', fileLink.substring(0, 80) + '...');

    let response;
    try {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 30000);
      response = await fetch(fileLink, { signal: ac.signal, redirect: 'follow' });
      clearTimeout(timeout);
    } catch (fetchErr) {
      console.error('[Telegram] Voice download fetch failed:', fetchErr.message, '| URL:', fileLink.substring(0, 100));
      await bot.sendMessage(chatId, t('audioDownloadFail', DEFAULT_LANG));
      return;
    }

    if (!response.ok) {
      bot.sendMessage(chatId, t('audioDownloadFail', DEFAULT_LANG));
      return;
    }
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log('[Telegram] Voice downloaded:', audioBuffer.length, 'bytes, ext:', ext);

    const transcribed = await transcribeAudio(audioBuffer, `voice.${ext}`, getSTTLang(DEFAULT_LANG));
    if (transcribed) {
      await bot.sendMessage(chatId, `🎤 _${t('transcribed', DEFAULT_LANG, { text: transcribed })}_`, { parse_mode: 'Markdown' });
      msg.text = transcribed;
      await handleTelegramMessage(bot, msg);
    } else {
      await bot.sendMessage(chatId, t('audioFallback', DEFAULT_LANG));
    }
  } catch (err) {
    console.error('[Telegram] Voice handler error:', err.message);
    await bot.sendMessage(chatId, t('audioProcessFail', DEFAULT_LANG));
  }
}

function extractContextFromMessage(message) {
  return require('../memory/session').extractContextFromMessage(message);
}

function startTelegramBot() {
  if (!TELEGRAM_TOKEN) {
    console.log('  TELEGRAM_TOKEN not set. Telegram bot disabled.');
    return null;
  }

  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

    bot.on('message', (msg) => {
      if (msg.voice || msg.audio) {
        handleTelegramVoice(bot, msg).catch(err => {
          console.error('[Telegram] Voice error:', err.message);
        });
      } else {
        handleTelegramMessage(bot, msg);
      }
    });

    bot.on('polling_error', (err) => {
      console.error('Telegram polling error:', err.message);
    });

    console.log('  Telegram bot started');
    return bot;
  } catch (err) {
    console.error('Failed to start Telegram bot:', err.message);
    return null;
  }
}

module.exports = { startTelegramBot };