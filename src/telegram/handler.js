const logger = require('../logger').child({ module: 'telegram' });
const { searchVerses } = require('../rag/store');
const { getActivePersona, buildSystemPrompt } = require('../persona/config');
const personaManager = require('../persona/manager');
const metaRag = require('../persona/meta-rag');
const {
  getSession,
  addMessage,
  getHistoryForLLM,
  buildMemoryContext,
  extractContextFromMessage,
  updateSessionContext,
  generateSummary,
  saveSession,
} = require('../memory/session');
const {
  getProfile,
  updateProfileFromMessage,
  buildProfileContext,
  generateProfileSummary,
} = require('../memory/profile');
const { isUserAdmin } = require('../chat/engine');
const integrations = require('../llm/integrationManager');
const { getSetting } = require('../settings');
const { t, DEFAULT_LANG, SUPPORTED_LANGS, getSTTLang, getTTSLang } = require('../i18n');
const { handleChatCommand } = require('../chat/engine');
const { transcribeAudio } = require('../stt');
const {
  cleanTextForTTS,
  splitTextForTTS,
  generateAudioBuffer,
  generateTTSAudioUrl,
  getAudioContentType,
  MAX_TTS_LENGTH,
} = require('../tts');

const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { convertToOggOpus } = require('../media/ffmpeg');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';
const TELEGRAM_AUDIO = process.env.TELEGRAM_AUDIO !== 'false';

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

function makeTelegramHandler(options = {}) {
  const instancePersonaId = options.personaId || null;
  const botName = options.botName || 'MetaPersona.AI';
  const instanceId = options.instanceId || 'default';

  async function getPersona(chatId, userId) {
    if (instancePersonaId) {
      const p = await personaManager.getPersona(instancePersonaId);
      if (p) return p;
    }
    const sessionPersona = await personaManager.getSessionPersona(`tg_${chatId}`);
    if (sessionPersona) return sessionPersona;
    if (userId) {
      const userPersona = await personaManager.getUserPersona(userId);
      if (userPersona) return userPersona;
    }
    return getActivePersona();
  }

  return async function handleMessage(bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text || msg.caption || '';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    let voiceText = null;
    const hasVoice = !!(msg.voice || msg.audio);
    if (hasVoice) {
      try {
        const voiceObj = msg.voice || msg.audio;
        const fileId = voiceObj.file_id;
        const fileSize = voiceObj.file_size || 0;

        if (fileSize > 20 * 1024 * 1024) {
          await bot.sendMessage(chatId, t('audioTooLarge', DEFAULT_LANG));
          return;
        }

        const fileLink = await bot.getFileLink(fileId);
        const fileResponse = await fetch(fileLink);
        if (!fileResponse.ok) {
          await bot.sendMessage(chatId, t('audioDownloadFail', DEFAULT_LANG));
          return;
        }
        const audioBuffer = Buffer.from(await fileResponse.arrayBuffer());

        const duration = (voiceObj.duration || 30);
        const ext = voiceObj.mime_type?.split('/')[1] || (msg.voice ? 'ogg' : 'mp3');
        const filename = `audio.${ext}`;
        const sttLang = getSTTLang(DEFAULT_LANG);

        voiceText = await transcribeAudio(audioBuffer, filename, sttLang);

        if (!voiceText) {
          if (!isGroup) {
            await bot.sendMessage(chatId, t('audioFallback', DEFAULT_LANG));
          }
          return;
        }

        if (!isGroup) {
          await bot.sendMessage(chatId, `🎤 _${t('transcribed', DEFAULT_LANG, { text: voiceText })}_`, { parse_mode: 'Markdown' });
        }
      } catch (err) {
        logger.error(`TG:${botName} voice processing error`, { error: err.message });
        if (!isGroup) {
          await bot.sendMessage(chatId, t('audioProcessFail', DEFAULT_LANG));
        }
        return;
      }
    }

    const finalText = voiceText || text;
    if (!finalText) return;

    const sid = isGroup ? `tg_${chatId}_${msg.from.id}` : `tg_${chatId}`;
    const uid = `tg_${msg.from.id}`;
    const userName = msg.from?.first_name || msg.from?.username || null;

    await updateProfileFromMessage(uid, finalText);
    const userContext = extractContextFromMessage(finalText);
    if (userName && !userContext.name) userContext.name = userName;
    await updateSessionContext(sid, userContext);

    const { processMessage } = require('../chat/engine');

    try {
      bot.sendChatAction(chatId, 'typing').catch(() => {});

      const result = await processMessage({
        message: finalText,
        sessionId: sid,
        userId: uid,
        language: 'pt-BR',
        isGroup,
        source: 'telegram',
        personaId: instancePersonaId || undefined,
      });

      logger.info(`processMessage result: response=${(result.response || '').substring(0, 80)}, ttsVoice=${result.ttsVoice}, ttsLang=${result.ttsLang}, TELEGRAM_AUDIO=${TELEGRAM_AUDIO}`);

      let reply = result.response;

      if (isGroup && userName) {
        reply = `${userName}, ` + reply.charAt(0).toLowerCase() + reply.slice(1);
      }

      const MAX_LEN = 800;
      if (reply.length <= MAX_LEN) {
        try {
          await bot.sendMessage(chatId, escapeMarkdown(reply), { parse_mode: 'Markdown' });
        } catch {
          await bot.sendMessage(chatId, reply);
        }
      } else {
        const paragraphs = reply.split(/\n\n+/);
        let chunk = '';
        for (const para of paragraphs) {
          if ((chunk + '\n\n' + para).length > MAX_LEN) {
            if (chunk) {
              try {
                await bot.sendMessage(chatId, escapeMarkdown(chunk), { parse_mode: 'Markdown' });
              } catch {
                await bot.sendMessage(chatId, chunk);
              }
              await new Promise(r => setTimeout(r, 500));
            }
            chunk = para;
          } else {
            chunk = chunk ? chunk + '\n\n' + para : para;
          }
        }
        if (chunk) {
          try {
            await bot.sendMessage(chatId, escapeMarkdown(chunk), { parse_mode: 'Markdown' });
          } catch {
            await bot.sendMessage(chatId, chunk);
          }
        }
      }

      if (result.sources && result.sources.length > 0) {
        const sourcesText = result.sources.map(s => `📖 ${s.reference}`).join('\n');
        try {
          await bot.sendMessage(chatId, sourcesText);
        } catch {}
      }

      if (result.interactiveOptions) {
        const { interactiveOptions } = result;
        if (interactiveOptions.type === 'buttons' && interactiveOptions.items?.length) {
          const inlineKeyboard = interactiveOptions.items.map(row => {
            if (Array.isArray(row)) return row.map(b => ({ text: b.text || b.label, callback_data: b.id || b.data || 'action' }));
            return [{ text: row.text || row.label || 'OK', callback_data: row.id || row.data || 'action' }];
          });
          try {
            await bot.sendMessage(chatId, interactiveOptions.prompt || 'Escolha uma opção:', { reply_markup: { inline_keyboard: inlineKeyboard } });
          } catch {}
        } else if (interactiveOptions.type === 'poll' && interactiveOptions.pollOptions?.length) {
          try {
            await bot.sendPoll(chatId, reply.substring(0, 300), interactiveOptions.pollOptions, {
              is_anonymous: interactiveOptions.anonymous !== false,
              type: interactiveOptions.quiz ? 'quiz' : 'regular',
            });
          } catch {}
        }
      }

      if (result.personaId && result.personaName) {
        try {
          await bot.sendMessage(chatId, `🎭 Persona: ${result.personaName}`, { disable_notification: true });
        } catch {}
      }

      if (TELEGRAM_AUDIO && reply && !isGroup) {
        try {
          const kokoroVoice = result.ttsVoice || null;
          const ttsLang = getTTSLang(result.language || DEFAULT_LANG);
          logger.info(`TG:${botName} TTS starting, lang=${ttsLang}, voice=${kokoroVoice}, replyLen=${reply.length}`);
          const cleanReply = cleanTextForTTS(reply);
          logger.info(`TG:${botName} TTS cleanReply len=${cleanReply.length}, preview=${cleanReply.substring(0, 60)}`);
          const audioChunks = splitTextForTTS(cleanReply, parseInt(process.env.MESSAGE_CHUNK_SIZE) || 1500);
          const audioChunksFiltered = (audioChunks || []).filter(c => c.length > 0 && c.length <= MAX_TTS_LENGTH);
          logger.info(`TG:${botName} TTS chunks=${audioChunksFiltered.length}`);

          if (audioChunksFiltered.length > 0) {
            let sentAny = false;
            for (let i = 0; i < audioChunksFiltered.length; i++) {
              const chunk = audioChunksFiltered[i];
              try {
                logger.info(`TG:${botName} TTS generating audio chunk ${i + 1}/${audioChunksFiltered.length} (len=${chunk.length})`);
                const audioBuffer = await generateAudioBuffer(chunk, { lang: ttsLang, kokoroVoice });
                if (!audioBuffer || audioBuffer.length === 0) {
                  logger.warn(`TG:${botName} TTS engine returned empty/null buffer for chunk ${i + 1}`);
                  continue;
                }
                logger.info(`TG:${botName} TTS audio buffer OK, size=${audioBuffer.length}, contentType=${audioBuffer.contentType}`);

                try {
                  const inputFormat = audioBuffer.contentType && audioBuffer.contentType.includes('mp3') ? 'mp3' : 'wav';
                  const oggBuffer = await convertToOggOpus(audioBuffer, inputFormat);
                  logger.info(`TG:${botName} OGG conversion OK, size=${oggBuffer.length}`);
                  await bot.sendVoice(chatId, oggBuffer, { caption: '' }, { filename: 'voice.ogg', contentType: 'audio/ogg' });
                  sentAny = true;
                  logger.info(`TG:${botName} sendVoice succeeded (size=${oggBuffer.length})`);
                } catch (convErr) {
                  logger.warn(`TG:${botName} OGG conversion failed, trying sendAudio`, { error: convErr.message });
                  const fallbackExt = audioBuffer.contentType?.includes('mp3') ? 'mp3' : 'wav';
                  const fallbackCt = audioBuffer.contentType || 'audio/wav';
                  try {
                    await bot.sendAudio(chatId, audioBuffer, { caption: '' }, { filename: `voice.${fallbackExt}`, contentType: fallbackCt });
                    sentAny = true;
                    logger.info(`TG:${botName} sendAudio succeeded (fallback)`);
                  } catch (sendErr) {
                    logger.error(`TG:${botName} sendAudio fallback also failed`, { error: sendErr.message });
                  }
                }

                await new Promise(r => setTimeout(r, 500));
              } catch (chunkErr) {
                logger.error(`TG:${botName} TTS chunk ${i + 1} error`, { error: chunkErr.message, stack: chunkErr.stack });
              }
            }

            if (!sentAny) {
              logger.warn(`TG:${botName} no audio sent after ${audioChunksFiltered.length} chunks`);
              try {
                await bot.sendMessage(chatId, t('audioNotAvailable', DEFAULT_LANG));
              } catch {}
            }
          } else {
            logger.warn(`TG:${botName} no audio chunks after filtering (cleanReply was empty?)`);
          }
        } catch (ttsErr) {
          logger.error(`TG:${botName} TTS error`, { error: ttsErr.message, stack: ttsErr.stack });
        }
      } else if (!TELEGRAM_AUDIO) {
        logger.info(`TG:${botName} TTS skipped: TELEGRAM_AUDIO=${TELEGRAM_AUDIO}`);
      }
    } catch (err) {
      logger.error(`TG:${botName} handler error`, { error: err.message });
      try {
        await bot.sendMessage(chatId, 'Desculpe, ocorreu um erro ao processar sua mensagem.').catch(() => {});
      } catch {}
    }
  };
}

async function sendTelegramPhoto(chatId, photoSource, caption = '') {
  const bot = _activeBots.get('telegram');
  if (!bot) throw new Error('No active Telegram bot');
  if (Buffer.isBuffer(photoSource)) {
    return await bot.sendPhoto(chatId, photoSource, { caption });
  }
  return await bot.sendPhoto(chatId, photoSource, { caption });
}

async function sendTelegramDocument(chatId, documentSource, fileName = 'document.pdf', caption = '') {
  const bot = _activeBots.get('telegram');
  if (!bot) throw new Error('No active Telegram bot');
  if (Buffer.isBuffer(documentSource)) {
    return await bot.sendDocument(chatId, documentSource, { caption }, { filename: fileName });
  }
  return await bot.sendDocument(chatId, documentSource, { caption }, { filename: fileName });
}

async function sendTelegramVoice(chatId, audioBuffer, contentType = 'audio/ogg') {
  const bot = _activeBots.get('telegram');
  if (!bot) throw new Error('No active Telegram bot');
  const ext = contentType.includes('mp3') ? 'mp3' : 'ogg';
  return await bot.sendVoice(chatId, audioBuffer, { caption: '' }, { filename: `voice.${ext}`, contentType });
}

async function sendTelegramInlineKeyboard(chatId, text, inlineKeyboard) {
  const bot = _activeBots.get('telegram');
  if (!bot) throw new Error('No active Telegram bot');
  try {
    return await bot.sendMessage(chatId, escapeMarkdown(text), {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  } catch {
    return await bot.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  }
}

async function sendTelegramReplyKeyboard(chatId, text, keyboard, options = {}) {
  const bot = _activeBots.get('telegram');
  if (!bot) throw new Error('No active Telegram bot');
  const reply_markup = {
    keyboard: keyboard,
    resize_keyboard: options.resize !== false,
    one_time_keyboard: options.oneTime !== false,
  };
  try {
    return await bot.sendMessage(chatId, escapeMarkdown(text), { parse_mode: 'Markdown', reply_markup });
  } catch {
    return await bot.sendMessage(chatId, text, { reply_markup });
  }
}

async function removeTelegramKeyboard(chatId, text) {
  const bot = _activeBots.get('telegram');
  if (!bot) throw new Error('No active Telegram bot');
  const reply_markup = { remove_keyboard: true };
  try {
    return await bot.sendMessage(chatId, escapeMarkdown(text), { parse_mode: 'Markdown', reply_markup });
  } catch {
    return await bot.sendMessage(chatId, text, { reply_markup });
  }
}

async function sendTelegramPoll(chatId, question, options, pollOptions = {}) {
  const bot = _activeBots.get('telegram');
  if (!bot) throw new Error('No active Telegram bot');
  return await bot.sendPoll(chatId, question, options, {
    is_anonymous: pollOptions.anonymous !== false,
    type: pollOptions.quiz ? 'quiz' : 'regular',
    correct_option_id: pollOptions.correctOption,
    explanation: pollOptions.explanation,
  });
}

const _activeBots = new Map();

module.exports = { makeTelegramHandler, sendTelegramPhoto, sendTelegramDocument, sendTelegramVoice, sendTelegramInlineKeyboard, sendTelegramReplyKeyboard, removeTelegramKeyboard, sendTelegramPoll, _activeBots };