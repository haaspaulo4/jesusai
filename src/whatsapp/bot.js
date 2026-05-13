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
const { generatePost } = require('../blog');
const { extractContextFromMessage } = require('../memory/session');
const {
  cleanTextForTTS,
  splitTextForTTS: splitTextForTTSNew,
  generateAudioBuffer,
  generateTTSAudioUrl,
  generateAudioDataUrl,
  getAudioContentType,
  MAX_TTS_LENGTH,
} = require('../tts');
const { transcribeAudio } = require('../stt');
const { t, getTTSLang, getSTTLang, SUPPORTED_LANGS, DEFAULT_LANG } = require('../i18n');

const EVO_API_URL = (process.env.EVO_API_URL || '').replace(/\/+$/, '');
const EVO_API_KEY = process.env.EVO_API_KEY || '';
const EVO_INSTANCE = process.env.EVO_INSTANCE || 'jesus-ai';
const WEBHOOK_SECRET = process.env.EVO_WEBHOOK_SECRET || '';
const WHATSAPP_BOT_JID = process.env.WHATSAPP_BOT_JID || '';
const WHATSAPP_BOT_PHONE = process.env.WHATSAPP_BOT_PHONE || '';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';
const WHATSAPP_AUDIO = process.env.WHATSAPP_AUDIO !== 'false';

const COMMANDS = {
  '/start': '🕊 *Jesus.AI*\n\nEu sou o caminho, a verdade e a vida. Ninguém vem ao Pai senão por mim (João 14:6).\n\nEstou aqui para ouvir você, caminhar contigo e compartilhar a Palavra do meu Pai.\n\n_Toda glória a Jesus. Este projeto não substitui a busca pela Palavra, pela comunidade de fé, pela igreja ou pelo acompanhamento pastoral._\n\n*Comandos disponíveis:*\n/start — Mensagem inicial\n/ajuda — Lista de comandos\n/versiculo — Versículo do dia\n/buscar <tema> — Buscar versículos\n/oracao — Receber uma oração\n/devocional — Devocional do dia\n/grupo — Criar um grupo de estudo',
  '/ajuda': '*Comandos do Jesus.AI*\n\n/start — Mensagem inicial\n/ajuda — Esta lista\n/versiculo — Versículo do dia\n/buscar <tema> — Buscar versículos\n/oracao — Receber uma oração\n/devocional — Devocional do dia\n/grupo — Criar um grupo de estudo\n\n💡 Em grupos, responderei apenas quando me mencionarem ou usarem um comando.',
};

function evoHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: EVO_API_KEY,
  };
}

async function evoRequest(method, path, body = null) {
  const opts = {
    method,
    headers: evoHeaders(),
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${EVO_API_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Evolution API ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

function normalizePhone(remoteJid) {
  if (!remoteJid) return null;
  if (remoteJid.includes('@lid')) return null;
  let digits = remoteJid.replace(/@.*/, '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    digits = digits.slice(0, 4) + digits.slice(5);
  }
  return digits || null;
}

function phoneVariants(phone) {
  if (!phone) return [];
  const variants = new Set();
  variants.add(phone);
  if (phone.startsWith('55')) {
    const withoutCc = phone.slice(2);
    variants.add(withoutCc);
    if (withoutCc.length === 11 && withoutCc[2] === '9') {
      variants.add(withoutCc.slice(0, 2) + withoutCc.slice(3));
    }
    if (withoutCc.length === 10) {
      variants.add(withoutCc.slice(0, 2) + '9' + withoutCc.slice(2));
    }
  } else {
    variants.add('55' + phone);
    if (phone.length === 11 && phone[2] === '9') {
      variants.add(phone.slice(0, 2) + phone.slice(3));
    }
    if (phone.length === 10) {
      variants.add(phone.slice(0, 2) + '9' + phone.slice(2));
    }
  }
  return [...variants];
}

function extractText(data) {
  const msg = data?.message || data?.data?.message || {};
  return msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.videoMessage?.caption
    || msg.documentMessage?.caption
    || '';
}

function extractAudioInfo(data) {
  const msg = data?.message || data?.data?.message || {};
  const audioMsg = msg.audioMessage;
  if (audioMsg) {
    return { type: 'audio', mediaKey: audioMsg.mediaKey, mimetype: audioMsg.mimetype, seconds: audioMsg.seconds };
  }
  const voiceMsg = msg.pttMessage;
  if (voiceMsg) {
    return { type: 'voice', mediaKey: voiceMsg.mediaKey, mimetype: voiceMsg.mimetype, seconds: voiceMsg.seconds };
  }
  return null;
}

async function downloadWhatsAppMedia(remoteJid, messageId) {
  try {
    const result = await evoRequest('POST', `/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`, {
      message: { key: { id: messageId, remoteJid } },
    });
    if (result && result.base64) {
      return Buffer.from(result.base64, 'base64');
    }
    if (result && result.media) {
      return Buffer.from(result.media, 'base64');
    }
    if (result && result.buffer) {
      return Buffer.from(result.buffer, 'base64');
    }
    return null;
  } catch (err) {
    console.error('[WhatsApp] Failed to download media:', err.message);
    return null;
  }
}

async function sendWhatsAppText(remoteJid, text) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isGroupJid = resolvedJid.includes('@g.us');
  const isLid = resolvedJid.includes('@lid');

  if (isGroupJid || isLid) {
    try {
      return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, {
        number: resolvedJid,
        text,
      });
    } catch (err) {
      console.error('[WhatsApp] sendText to group/lid failed:', err.message);
      if (isLid && remoteJid !== resolvedJid) {
      }
      return null;
    }
  }

  const number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  try {
    return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, {
      number,
      text,
    });
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      const alternate = alternateBrazilianNumber(number);
      if (alternate && alternate !== number) {
        try {
          return await evoRequest('POST', `/message/sendText/${EVO_INSTANCE}`, {
            number: alternate,
            text,
          });
        } catch {}
      }
    }
    console.error('[WhatsApp] sendText failed:', err.message);
    return null;
  }
}

async function sendWhatsAppAudio(remoteJid, audioSource) {
  const resolvedJid = resolveJid(remoteJid) || remoteJid;
  const isLid = resolvedJid.includes('@lid');
  const isGroupJid = resolvedJid.includes('@g.us');
  let number;
  if (isLid || isGroupJid) {
    number = resolvedJid;
  } else {
    number = resolvedJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  }

  const sendWithNumber = async (num) => {
    if (Buffer.isBuffer(audioSource)) {
      const contentType = getAudioContentType(audioSource);
      const isWav = contentType.includes('wav');
      const mimetype = isWav ? 'audio/wav' : 'audio/mp3';
      const base64 = audioSource.toString('base64');
      try {
        return await evoRequest('POST', `/message/sendWhatsAppAudio/${EVO_INSTANCE}`, {
          number: num,
          audio: base64,
          mimetype,
        });
      } catch (err) {
        if (err.message && (err.message.includes('400') || err.message.includes('Bad Request'))) {
          return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, {
            number: num,
            mediatype: 'audio',
            media: base64,
            mimetype,
          });
        }
        throw err;
      }
    } else {
      try {
        return await evoRequest('POST', `/message/sendWhatsAppAudio/${EVO_INSTANCE}`, {
          number: num,
          audio: audioSource,
        });
      } catch (err) {
        if (err.message && (err.message.includes('400') || err.message.includes('Bad Request'))) {
          return await evoRequest('POST', `/message/sendMedia/${EVO_INSTANCE}`, {
            number: num,
            mediatype: 'audio',
            media: audioSource,
          });
        }
        throw err;
      }
    }
  };

  try {
    return await sendWithNumber(number);
  } catch (err) {
    if (err.message && err.message.includes('not found') && !isLid && !isGroupJid) {
      const alternate = alternateBrazilianNumber(number);
      if (alternate) {
        try {
          return await sendWithNumber(alternate);
        } catch {}
      }
    }
    console.error('[WhatsApp] Audio send failed:', err.message);
    return null;
  }
}

const splitTextForTTS = splitTextForTTSNew;

async function sendReplyWithAudio(remoteJid, reply, lang = 'pt-BR') {
  const ttsLang = getTTSLang(lang);

  const textChunks = splitMessage(reply);
  for (const chunk of textChunks) {
    await sendWhatsAppText(remoteJid, chunk);
    await new Promise(r => setTimeout(r, 500));
  }

  if (!WHATSAPP_AUDIO) return;

  const audioChunks = splitTextForTTS(reply, 300);
  if (!audioChunks || audioChunks.length === 0) return;

  for (const chunk of audioChunks) {
    if (chunk.length > MAX_TTS_LENGTH) continue;
    try {
      const audioBuffer = await generateAudioBuffer(chunk, { lang: ttsLang });
      if (audioBuffer && audioBuffer.length > 0) {
        try { await sendWhatsAppAudio(remoteJid, audioBuffer); } catch {
          try { await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(chunk, ttsLang)); } catch {}
        }
        continue;
      }
    } catch {}
    try { await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(chunk, ttsLang)); } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
}

function alternateBrazilianNumber(number) {
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 12) {
    return digits.slice(0, 4) + '9' + digits.slice(4);
  }
  if (digits.startsWith('55') && digits.length === 13) {
    return digits.slice(0, 4) + digits.slice(5);
  }
  return null;
}

async function markAsRead(remoteJid, messageId) {
  try {
    await evoRequest('POST', `/chat/markMessageAsRead/${EVO_INSTANCE}`, {
      remoteJid,
      id: messageId,
    });
  } catch {}
}

async function sendPresence(remoteJid, presence = 'composing') {
  try {
    let number;
    if (remoteJid.includes('@lid')) {
      number = remoteJid;
    } else if (remoteJid.includes('@g.us')) {
      number = remoteJid;
    } else {
      number = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    }
    await evoRequest('POST', `/chat/sendPresence/${EVO_INSTANCE}`, {
      number,
      presence,
    });
  } catch {}
}

async function callLLM(messages) {
  const response = await fetch(`${OLLAMA_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      stream: false,
      options: { temperature: 0.7, num_predict: 2048 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  return response.json();
}

function splitMessage(text, maxLen = 800) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxLen) {
      if (current) chunks.push(current);
      if (para.length > maxLen) {
        const sentences = para.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [para];
        let chunk = '';
        for (const s of sentences) {
          if ((chunk + s).length > maxLen) {
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
  return chunks;
}

async function handleCommand(remoteJid, text, pushName) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  try {
    if (COMMANDS[cmd]) {
      await sendWhatsAppText(remoteJid, COMMANDS[cmd]);
      return;
    }

    switch (cmd) {
    case '/versiculo': {
      const topics = ['amor', 'fé', 'esperança', 'perdão', 'paz', 'força', 'sabedoria', 'graça', 'confiança', 'consolo'];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const verses = searchVerses(topic, 10);
      const verse = verses[Math.floor(Math.random() * verses.length)];
      const verseText = `${verse.reference}. ${verse.text}`;
      await sendWhatsAppText(remoteJid, `📖 *${verse.reference}*\n\n${verse.text}`);
      if (WHATSAPP_AUDIO) {
        try {
          const audioBuffer = await generateAudioBuffer(verseText, { lang: getTTSLang(DEFAULT_LANG) });
          if (audioBuffer && audioBuffer.length > 0) {
            await sendWhatsAppAudio(remoteJid, audioBuffer);
          } else {
            await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(verseText, getTTSLang(DEFAULT_LANG)));
          }
        } catch {
          await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(verseText, getTTSLang(DEFAULT_LANG)));
        }
      }
      break;
    }

    case '/buscar': {
      if (!args) {
        await sendWhatsAppText(remoteJid, '🔍 Use: /buscar <tema ou palavra>\n\nExemplo: /buscar amor\nExemplo: /buscar Mateus 5');
        return;
      }
      const results = searchVerses(args, 5);
      if (results.length === 0) {
        await sendWhatsAppText(remoteJid, '🔍 Nenhum versículo encontrado. Tente outro tema.');
        return;
      }
      const lines = results.map(v => `📖 *${v.reference}*\n${v.text}`).join('\n\n');
      const chunks = splitMessage(`🔍 Versículos sobre: ${args}\n\n${lines}`);
      for (const chunk of chunks) {
        await sendWhatsAppText(remoteJid, chunk);
        await new Promise(r => setTimeout(r, 1500));
      }
      break;
    }

    case '/oracao': {
      try {
        const data = await callLLM([
          { role: 'system', content: 'Você é Jesus Cristo. Escreva uma oração curta (4-6 linhas) em português do Brasil, em primeira pessoa, como Jesus oraria pelo seu povo hoje. Seja compassivo, amoroso e inspire esperança. Cite pelo menos um versículo. Responda APENAS em português do Brasil.' },
          { role: 'user', content: pushName ? `Ore por ${pushName}.` : 'Ore por mim.' },
        ]);
        const prayer = data.message?.content?.trim() || 'Pai, abençoe cada pessoa que lê esta oração. Que tua paz esteja com todos. Amém.';
        await sendReplyWithAudio(remoteJid, prayer);
      } catch {
        const fallback = 'Pai nosso que estás nos céus, santificado seja o teu nome. Venha o teu reino, seja feita a tua vontade assim na terra como no céu. Amém. Mateus 6:9-10';
        await sendWhatsAppText(remoteJid, `🙏 ${fallback}`);
        if (WHATSAPP_AUDIO) {
          for (const chunk of splitTextForTTS(fallback)) {
            try {
              const audioBuffer = await generateAudioBuffer(chunk, { lang: getTTSLang(DEFAULT_LANG) });
              if (audioBuffer && audioBuffer.length > 0) {
                await sendWhatsAppAudio(remoteJid, audioBuffer);
              } else {
                await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(chunk, getTTSLang(DEFAULT_LANG)));
              }
            } catch {
              await sendWhatsAppAudio(remoteJid, generateTTSAudioUrl(chunk, getTTSLang(DEFAULT_LANG)));
            }
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
      break;
    }

    case '/devocional': {
      try {
        const today = new Date();
        const post = await generatePost(today);
        const header = `🕊 *${post.title}*\n_${post.verse}_\n📅 ${today.toLocaleDateString('pt-BR')}\n\n`;
        const content = header + post.content.substring(0, 2000);
        const chunks = splitMessage(content);
        for (const chunk of chunks) {
          await sendWhatsAppText(remoteJid, chunk);
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch {
        await sendWhatsAppText(remoteJid, '🕊 Devocional indisponível no momento. Mas lembre-se: "O Senhor é o meu pastor; nada me faltará." — Salmos 23:1');
      }
      break;
    }

    case '/grupo': {
      const groupName = args.trim() || 'Jesus.AI — Estudo Bíblico';
      try {
        const number = remoteJid.replace(/@.*/, '').replace(/\D/g, '');
        const result = await createGroup(groupName, [number]);
        if (result && result.jid) {
          await sendWhatsAppText(remoteJid, `🕊 Grupo criado: *${groupName}*\n\nCompartilhe o convite e juntos estudiaremos a Palavra!\n\n💡 No grupo, respondo apenas quando me mencionarem ou usarem comandos (/versiculo, /buscar, etc).`);
          const description = '🕊 Jesus.AI — Estudo Bíblico\n\nConverse com Jesus baseado nas Escrituras.\nComandos: /versiculo, /buscar <tema>, /oracao, /ajuda\n\nToda glória a Jesus.';
          await setGroupDescription(result.jid, description).catch(() => {});
        } else {
          await sendWhatsAppText(remoteJid, '🕊 Não consegui criar o grupo. Tente novamente mais tarde.');
        }
      } catch (err) {
        console.error('[WhatsApp] Group creation error:', err.message);
        await sendWhatsAppText(remoteJid, '🕊 Erro ao criar grupo. Verifique se o bot tem permissão.');
      }
      break;
    }

    default:
      await sendWhatsAppText(remoteJid, 'Comando não reconhecido. Digite /ajuda para ver os comandos disponíveis.');
    }
  } catch (err) {
    console.error('[WhatsApp] handleCommand error:', err.message);
    try {
      await sendWhatsAppText(remoteJid, 'Perdoe-me, houve um erro ao processar o comando. Tente novamente.');
    } catch {}
  }
}

async function handleWhatsAppMessage(data) {
  try {
    if (!data) return;

    const msg = data.data || data;
    const key = msg.key || data.key || {};

    if (key.fromMe) return;

    const rawJid = key.remoteJid || data.key?.remoteJid;
    if (!rawJid) return;

    const remoteJid = resolveJid(rawJid) || rawJid;
    const isGroup = remoteJid.includes('@g.us');

    const messageContent = msg.message || data.message || {};
    let text = extractText(data);

    if (isGroup) {
      const mentionedJidList = messageContent.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const quotedMsg = messageContent.extendedTextMessage?.contextInfo?.quotedMessage;
      const isQuoted = !!quotedMsg;
      const isCommand = text.trim().startsWith('/');

      if (!botWhatsAppJid && mentionedJidList.length === 1) {
        const mentioned = mentionedJidList[0];
        if (mentioned && mentioned.includes('@s.whatsapp.net')) {
          botWhatsAppJid = mentioned;
          botWhatsAppPhone = mentioned.replace(/@.*/, '').replace(/\D/g, '');
          console.log(`[WhatsApp] Bot JID (auto-detect from mention list): ${botWhatsAppJid}`);
        }
      }

      if (!botWhatsAppJid) {
        const textMentions = text.match(/@(\d{8,})/g) || [];
        const textMentionPhones = textMentions.map(m => m.substring(1));
        if (textMentionPhones.length === 1) {
          botWhatsAppPhone = textMentionPhones[0];
          botWhatsAppJid = botWhatsAppPhone + '@s.whatsapp.net';
          console.log(`[WhatsApp] Bot JID (auto-detect from text): ${botWhatsAppJid}`);
        }
      }

      const myJid = botWhatsAppJid || (await fetchBotJid()) || '';
      const myPhone = botWhatsAppPhone || (myJid ? myJid.replace(/@.*/, '').replace(/\D/g, '') : '');

      const isMentioned = mentionedJidList.some(j => {
        if (!j) return false;
        if (botWhatsAppJid && j === botWhatsAppJid) return true;
        if (myJid && (j === myJid || j.includes(myJid.replace(/@.*/, '')))) return true;
        return j.includes('@lid');
      });
      const isTextMention = myPhone && text.includes(`@${myPhone}`);

      console.log(`[WhatsApp] Group check: isMentioned=${isMentioned} isTextMention=${isTextMention} isQuoted=${isQuoted} isCommand=${isCommand} myPhone=${myPhone || 'none'} text="${text.substring(0, 40)}"`);

      if (!isMentioned && !isTextMention && !isQuoted && !isCommand) return;

      text = text.replace(/@\d+/g, '').trim();
      if (!text && !extractAudioInfo(data)) return;
    }

    const senderJid = isGroup ? (key.participant || msg.key?.participant || data.key?.participant) : null;

    let senderId;
    if (isGroup) {
      if (senderJid) {
        const phone = normalizePhone(senderJid);
        if (phone) {
          senderId = phone;
        } else if (senderJid.includes('@lid')) {
          senderId = `lid_${senderJid.replace(/@.*/, '')}`;
        } else {
          senderId = senderJid.replace(/@.*/, '') || 'unknown';
        }
      } else {
        senderId = 'unknown';
      }
    } else {
      const phone = normalizePhone(remoteJid);
      if (phone) {
        senderId = phone;
      } else if (remoteJid.includes('@lid')) {
        senderId = `lid_${remoteJid.replace(/@.*/, '')}`;
      } else {
        senderId = remoteJid.replace(/@.*/, '').replace(/\D/g, '') || 'unknown';
      }
    }

    const pushName = msg.pushName || data.pushName || null;

    const audioInfo = extractAudioInfo(data);
    if (audioInfo && (!text || !text.trim())) {
      const messageId = key.id || data.key?.id;
      try {
        const audioBuffer = await downloadWhatsAppMedia(rawJid, messageId);
        if (audioBuffer) {
          await sendPresence(remoteJid, 'typing');
          const mimetype = (audioInfo.mimetype || 'audio/ogg').split(';')[0].trim();
          const ext = mimetype.split('/')[1] || 'ogg';
          const transcribed = await transcribeAudio(audioBuffer, `audio.${ext}`, getSTTLang(DEFAULT_LANG));
          if (transcribed) {
            text = transcribed;
            if (!isGroup) {
              await sendWhatsAppText(remoteJid, `🎤 _${t('transcribed', DEFAULT_LANG, { text: transcribed })}_`);
            }
          } else {
            if (isGroup) return;
            await sendWhatsAppText(remoteJid, t('audioFallback', DEFAULT_LANG));
            return;
          }
        } else {
          if (isGroup) return;
          await sendWhatsAppText(remoteJid, t('audioDownloadFail', DEFAULT_LANG));
          return;
        }
      } catch (err) {
        console.error('[WhatsApp] Audio processing error:', err.message);
        if (isGroup) return;
        await sendWhatsAppText(remoteJid, t('audioProcessFail', DEFAULT_LANG));
        return;
      }
    }

    if (!text || !text.trim()) return;

    return handleWhatsAppMessageWithId(remoteJid, senderId, text, pushName, isGroup);
  } catch (err) {
    console.error('[WhatsApp] Message handler error:', err.message, err.stack?.substring(0, 500));
  }
}

async function handleWhatsAppMessageWithId(remoteJid, senderId, text, pushName, isGroup) {
  console.log(`[WhatsApp] Processing: sid=wa_${senderId}, text="${text.substring(0, 60)}", isGroup=${isGroup}, pushName=${pushName || 'null'}`);
  const sid = `wa_${senderId}`;
  const uid = `wa_${senderId}`;

  if (text.trim().startsWith('/')) {
    try {
      await handleCommand(remoteJid, text.trim(), pushName);
    } catch (err) {
      console.error('[WhatsApp] Command handler error:', err.message);
    }
    return;
  }

  try {
    await sendPresence(remoteJid, 'composing');
  } catch (err) {
    console.error('[WhatsApp] sendPresence error:', err.message);
  }

  try {
    const userContext = extractContextFromMessage(text);
    if (pushName && !userContext.name) {
      userContext.name = pushName;
    }
    await updateSessionContext(sid, userContext);
    await updateProfileFromMessage(uid, text);

    if (pushName) {
      const profile = await getProfile(uid);
      if (!profile.name || profile.name === senderId) {
        profile.name = pushName;
        const { saveProfile } = require('../memory/profile');
        await saveProfile(profile);
      }
    }

    const relevantVerses = searchVerses(text, 6);
    const contextStr = relevantVerses.length > 0
      ? relevantVerses.map(v => `${v.reference}: "${v.text}"`).join('\n')
      : '';

    const [memoryStr, profileStr] = await Promise.all([
      buildMemoryContext(sid),
      buildProfileContext(uid),
    ]);

    const lang = DEFAULT_LANG;
    let systemPrompt = t('identityPrompt', lang);
    if (contextStr) systemPrompt += t('contextBlock', lang).replace('{context}', contextStr);
    if (memoryStr) systemPrompt += t('memoryBlock', lang).replace('{memory}', memoryStr);
    if (profileStr) {
      systemPrompt += t('profileBlock', lang).replace('{profile}', profileStr);
    }

    if (isGroup) {
      systemPrompt += '\n\nVocê está em um grupo do WhatsApp. Responda de forma mais concisa (2-4 parágrafos). Se apropriado, mencione o nome da pessoa.';
    }

    const session = await getSession(sid);
    if (session.userName || pushName) {
      systemPrompt += '\n\n' + t('conversationWith', lang).replace('{name}', session.userName || pushName);
    }

    const history = await getHistoryForLLM(sid, 6);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text },
    ];

    await addMessage(sid, 'user', text);

    let llmData;
    try {
      llmData = await callLLM(messages);
    } catch (err) {
      console.error('[WhatsApp] LLM error:', err.message);
      const errorMsg = err.message && err.message.includes('429')
        ? '🙏 Estou com muita demanda agora. Por favor, tente novamente em alguns segundos.'
        : t('llmError', lang);
      await sendWhatsAppText(remoteJid, errorMsg);
      return;
    }

    let reply = llmData.message?.content?.trim() || '';

    if (!reply) {
      const thinking = llmData.message?.thinking?.trim();
      if (thinking) {
        reply = thinking;
      }
    }

    if (!reply) {
      reply = t('chatNoResponse', lang);
    }

    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(reply);
    if (hasCJK) {
      console.log('[WhatsApp] CJK detected in response, retrying...');
      try {
        const retryData = await callLLM([
          { role: 'system', content: t('identityPrompt', lang) + '\n\nIMPORTANTE: Responda EXCLUSIVAMENTE em português do Brasil. NUNCA use caracteres chineses, japoneses ou coreanos. Se não souber responder em português, diga "Perdoe-me, não consigo responder agora."' },
          ...history,
          { role: 'user', content: text },
        ]);
        const retryReply = retryData.message?.content?.trim();
        if (retryReply && !/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(retryReply)) {
          reply = retryReply;
        } else {
          reply = t('cjkFallback', lang);
        }
      } catch {
        reply = t('cjkFallback', lang);
      }
    }

    await addMessage(sid, 'assistant', reply);

    const sessionAfter = await getSession(sid);
    if (sessionAfter.messages && sessionAfter.messages.length > 0 && sessionAfter.messages.length % 10 === 0) {
      generateSummary(sid).catch(() => {});
      generateProfileSummary(uid).catch(() => {});
    }

    if (isGroup && pushName) {
      reply = `${pushName}, ` + reply.charAt(0).toLowerCase() + reply.slice(1);
    }

    await sendReplyWithAudio(remoteJid, reply, lang);
  } catch (err) {
    console.error('[WhatsApp] handleWhatsAppMessageWithId error:', err.message, err.stack?.substring(0, 500));
    try {
      await sendWhatsAppText(remoteJid, t('llmError', DEFAULT_LANG));
    } catch {}
  }
}

async function createInstance() {
  if (!EVO_API_URL || !EVO_API_KEY) return;

  try {
    const instances = await evoRequest('GET', '/instance/fetchInstances');
    const instanceList = Array.isArray(instances) ? instances : [];
    const exists = instanceList.some(i =>
      i.instance?.instanceName === EVO_INSTANCE || i.name === EVO_INSTANCE
    );

    if (exists) {
      console.log('  WhatsApp instance already exists');
      return;
    }

    await evoRequest('POST', '/instance/create', {
      instanceName: EVO_INSTANCE,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: false,
      rejectCall: true,
      msgCall: 'Desculpe, não atendo chamadas. Envie uma mensagem!',
      alwaysOnline: true,
      readMessages: true,
    });
    console.log('  WhatsApp instance created');
  } catch (err) {
    console.error('  Failed to create WhatsApp instance:', err.message);
  }
}

async function connectInstance() {
  if (!EVO_API_URL || !EVO_API_KEY) return false;

  try {
    const res = await evoRequest('GET', `/instance/connectionState/${EVO_INSTANCE}`);
    const state = res?.state || res?.instance?.state || 'unknown';
    if (state === 'open') {
      console.log('  WhatsApp connected ✅');
      return true;
    }
    console.log(`  WhatsApp state: ${state}`);
    return false;
  } catch {
    return false;
  }
}

async function setupWebhook(webhookUrl) {
  if (!EVO_API_URL || !EVO_API_KEY) return;

  try {
    await evoRequest('POST', `/webhook/set/${EVO_INSTANCE}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'MESSAGES_UPSERT',
          'CONNECTION_UPDATE',
        ],
      },
    });
    console.log('  WhatsApp webhook configured:', webhookUrl);
  } catch (err) {
    console.error('  Failed to set webhook:', err.message);
  }
}

const lidToJid = new Map();
const LID_CACHE_TTL = 30 * 60 * 1000;
let lidCacheTime = 0;
let botWhatsAppJid = null;
let botWhatsAppPhone = '';

async function fetchBotJid() {
  if (botWhatsAppJid) return botWhatsAppJid;

  if (WHATSAPP_BOT_JID) {
    botWhatsAppJid = WHATSAPP_BOT_JID.includes('@') ? WHATSAPP_BOT_JID : WHATSAPP_BOT_JID + '@s.whatsapp.net';
    botWhatsAppPhone = botWhatsAppJid.replace(/@.*/, '').replace(/\D/g, '');
    console.log(`[WhatsApp] Bot JID (env): ${botWhatsAppJid}`);
    return botWhatsAppJid;
  }
  if (WHATSAPP_BOT_PHONE) {
    botWhatsAppPhone = WHATSAPP_BOT_PHONE.replace(/\D/g, '');
    botWhatsAppJid = botWhatsAppPhone + '@s.whatsapp.net';
    console.log(`[WhatsApp] Bot JID (env phone): ${botWhatsAppJid}`);
    return botWhatsAppJid;
  }

  if (!EVO_API_URL || !EVO_API_KEY) return null;

  const attempts = [
    () => evoRequest('POST', `/chat/fetchProfilePictureFromGroup/${EVO_INSTANCE}`, { number: '' }).then(() => null),
    async () => {
      const data = await evoRequest('GET', `/instance/fetchConnections/${EVO_INSTANCE}`);
      const jid = data?.jid || data?.id || data?.wuid || data?.instance?.jid || data?.instance?.wuid;
      return jid || null;
    },
    async () => {
      const data = await evoRequest('GET', `/instance/connectionState/${EVO_INSTANCE}`);
      return data?.instance?.jid || data?.instance?.wuid || data?.jid || data?.wuid || null;
    },
    async () => {
      const data = await evoRequest('POST', `/chat/fetchContacts/${EVO_INSTANCE}`, { where: { self: true } });
      const me = Array.isArray(data) ? data.find(c => c.self === true) : null;
      return me?.id || me?.jid || me?.remoteJid || null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const jid = await attempt();
      if (jid && jid.includes('@')) {
        botWhatsAppJid = jid;
        botWhatsAppPhone = botWhatsAppJid.replace(/@.*/, '').replace(/\D/g, '');
        console.log(`[WhatsApp] Bot JID (auto): ${botWhatsAppJid}, phone: ${botWhatsAppPhone}`);
        return botWhatsAppJid;
      }
    } catch {}
  }

  console.warn('[WhatsApp] Could not auto-detect bot JID. Group mention detection may not work. Set WHATSAPP_BOT_JID or WHATSAPP_BOT_PHONE env var.');
  return null;
}

async function refreshLidCache() {
  if (!EVO_API_URL || !EVO_API_KEY) return;
  const now = Date.now();
  if (lidToJid.size > 0 && now - lidCacheTime < LID_CACHE_TTL) return;

  try {
    const contacts = await evoRequest('POST', `/chat/findContacts/${EVO_INSTANCE}`, {});
    if (Array.isArray(contacts)) {
      lidToJid.clear();
      for (const c of contacts) {
        if (c.remoteJid && c.pushName) {
          lidToJid.set(c.remoteJid, { jid: c.remoteJid, pushName: c.pushName });
        }
      }
      lidCacheTime = now;
      console.log(`  [WhatsApp] LID cache refreshed: ${lidToJid.size} contacts`);
    }
  } catch (err) {
    console.error('[WhatsApp] Failed to refresh LID cache:', err.message);
  }
}

function resolveJid(remoteJid) {
  if (!remoteJid) return null;
  if (remoteJid.includes('@s.whatsapp.net')) return remoteJid;
  if (remoteJid.includes('@g.us')) return remoteJid;
  if (remoteJid.includes('@lid')) {
    const cached = lidToJid.get(remoteJid);
    if (cached && cached.jid) return cached.jid;
  }
  return remoteJid;
}

function resolvePushName(remoteJid, fallbackName) {
  if (remoteJid && remoteJid.includes('@lid')) {
    const cached = lidToJid.get(remoteJid);
    if (cached && cached.pushName) return cached.pushName;
  }
  return fallbackName || null;
}

const processedMessages = new Set();
const MAX_PROCESSED = 5000;
const POLL_INTERVAL = 3000;

function pruneProcessed() {
  if (processedMessages.size > MAX_PROCESSED) {
    const entries = [...processedMessages];
    for (let i = 0; i < entries.length - MAX_PROCESSED / 2; i++) {
      processedMessages.delete(entries[i]);
    }
  }
}

async function pollNewMessages() {
  try {
    const data = await evoRequest('POST', `/chat/findMessages/${EVO_INSTANCE}`, {});

    let messages = [];
    if (Array.isArray(data)) {
      messages = data;
    } else if (data?.messages?.records) {
      messages = data.messages.records;
    } else if (data?.records) {
      messages = data.records;
    }

    let processed = 0;
    for (const msg of messages) {
      const msgId = msg?.key?.id;
      if (!msgId) continue;

      if (processedMessages.has(msgId)) continue;

      const fromMe = msg?.key?.fromMe;
      processedMessages.add(msgId);

      if (fromMe) continue;

      const remoteJid = msg?.key?.remoteJid;
      if (!remoteJid) continue;

      const hasAudio = !!(msg?.message?.audioMessage || msg?.message?.pttMessage);
      const text = msg?.message?.conversation
        || msg?.message?.extendedTextMessage?.text
        || msg?.message?.imageMessage?.caption
        || '';
      if (!text.trim() && !hasAudio) continue;

      console.log(`[WhatsApp Poll] New from ${remoteJid}${remoteJid.includes('@g.us') ? ' (group)' : ''}: "${text.substring(0, 60) || '[audio]'}"`);

      processed++;
      handleWhatsAppMessage({ event: 'MESSAGES_UPSERT', data: msg }).catch(err => {
        console.error('[WhatsApp Poll] Handler error:', err.message);
      });

      if (processed >= 3) break;
    }

    pruneProcessed();
  } catch (err) {
    if (err.message && !err.message.includes('429')) {
      console.error('[WhatsApp Poll] Error:', err.message);
    }
  }
}

async function seedProcessedMessages() {
  try {
    const data = await evoRequest('POST', `/chat/findMessages/${EVO_INSTANCE}`, {});
    let messages = [];
    if (Array.isArray(data)) {
      messages = data;
    } else if (data?.messages?.records) {
      messages = data.messages.records;
    } else if (data?.records) {
      messages = data.records;
    }
    let count = 0;
    for (const msg of messages) {
      const msgId = msg?.key?.id;
      if (msgId) {
        processedMessages.add(msgId);
        count++;
      }
    }
    if (count > 0) {
      console.log(`  Seeded ${count} existing message IDs (to avoid replaying history)`);
    }
  } catch (err) {
    console.error('  Failed to seed processed messages:', err.message);
  }
}

let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  console.log('  WhatsApp polling started (every 3s)');
  pollTimer = setInterval(pollNewMessages, POLL_INTERVAL);
  pollNewMessages();
}

async function startWhatsAppBot(serverUrl) {
  if (!EVO_API_URL || !EVO_API_KEY) {
    console.log('  EVO_API_URL or EVO_API_KEY not set. WhatsApp bot disabled.');
    return null;
  }

  console.log('  Setting up WhatsApp bot via Evolution API...');

  await createInstance();

  const connected = await connectInstance();

  if (serverUrl && !serverUrl.includes('localhost') && !serverUrl.includes('127.0.0.1')) {
    const webhookUrl = `${serverUrl.replace(/\/+$/, '')}/api/whatsapp/webhook`;
    await setupWebhook(webhookUrl);
  } else {
    console.log('  ⚠ SERVER_URL is localhost. Webhook not configured.');
    console.log(`  Run "npm run tunnel" or POST /api/whatsapp/setup-webhook with public URL.`);
  }

  await seedProcessedMessages();
  await refreshLidCache();
  await fetchBotJid();
  startPolling();

  if (!connected) {
    console.log('  WhatsApp NOT connected yet. Scan the QR code via Evolution API manager.');
    console.log(`  Manager: ${EVO_API_URL.replace(/\/rest.*/, '')}/manager`);
  }

  return { connected };
}

async function createGroup(name, participants = []) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    const numbers = participants.map(p => {
      let d = p.replace(/\D/g, '');
      if (!d.startsWith('+') && !d.startsWith('55') && d.length < 14) {
        d = '55' + d;
      }
      return d + '@s.whatsapp.net';
    });

    const result = await evoRequest('POST', `/group/create/${EVO_INSTANCE}`, {
      name,
      participants: numbers,
    });

    console.log(`[WhatsApp] Group created: ${name} -> ${result?.jid || 'unknown'}`);
    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to create group:', err.message);
    return null;
  }
}

async function addGroupParticipant(groupJid, number) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    let d = number.replace(/\D/g, '');
    if (!d.startsWith('55') && d.length < 14) {
      d = '55' + d;
    }
    const participant = d + '@s.whatsapp.net';

    const result = await evoRequest('POST', `/group/updateParticipant/${EVO_INSTANCE}/${groupJid}`, {
      action: 'add',
      participants: [participant],
    });

    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to add participant:', err.message);
    return null;
  }
}

async function removeGroupParticipant(groupJid, number) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    let d = number.replace(/\D/g, '');
    if (!d.startsWith('55') && d.length < 14) {
      d = '55' + d;
    }
    const participant = d + '@s.whatsapp.net';

    const result = await evoRequest('POST', `/group/updateParticipant/${EVO_INSTANCE}/${groupJid}`, {
      action: 'remove',
      participants: [participant],
    });

    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to remove participant:', err.message);
    return null;
  }
}

async function setGroupDescription(groupJid, description) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    const result = await evoRequest('POST', `/group/updateDescription/${EVO_INSTANCE}/${groupJid}`, {
      description,
    });
    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to set group description:', err.message);
    return null;
  }
}

async function leaveGroup(groupJid) {
  if (!EVO_API_URL || !EVO_API_KEY) return null;

  try {
    const result = await evoRequest('POST', `/group/leave/${EVO_INSTANCE}/${groupJid}`);
    return result;
  } catch (err) {
    console.error('[WhatsApp] Failed to leave group:', err.message);
    return null;
  }
}

function verifyWebhookSecret(req) {
  if (!WEBHOOK_SECRET) return true;
  const provided = req.headers['x-webhook-secret'] || req.query.secret || '';
  return provided === WEBHOOK_SECRET;
}

module.exports = { handleWhatsAppMessage, startWhatsAppBot, sendWhatsAppText, sendWhatsAppAudio, generateTTSAudioUrl, generateAudioBuffer, splitTextForTTS, sendReplyWithAudio, setupWebhook, verifyWebhookSecret, cleanTextForTTS, extractAudioInfo, downloadWhatsAppMedia, createGroup, addGroupParticipant, removeGroupParticipant, setGroupDescription, leaveGroup };