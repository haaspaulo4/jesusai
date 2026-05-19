require('dotenv').config();
const { pool } = require('../db');
const { sendWhatsAppImage, sendWhatsAppVideo, sendWhatsAppDocument, sendWhatsAppText } = require('../whatsapp/bot');
const { sendTelegramPhoto, sendTelegramDocument, sendTelegramVoice } = require('../telegram/handler');

const CHANNEL_TYPES = ['web', 'telegram', 'whatsapp', 'email'];

class ChannelManager {
  constructor() {
    this.handlers = new Map();
    this._initialized = false;
  }

  registerHandler(channelType, handler) {
    this.handlers.set(channelType, handler);
    console.log(`[ChannelManager] Registered handler for: ${channelType}`);
  }

  getHandler(channelType) {
    return this.handlers.get(channelType);
  }

  async sendMessage(channelType, payload) {
    const handler = this.handlers.get(channelType);
    if (!handler) {
      console.warn(`[ChannelManager] No handler for channel: ${channelType}`);
      return { error: `No handler for channel: ${channelType}` };
    }

    const { sessionId, userId, message, personaId, metadata } = payload;

    try {
      await this._logMessage({
        direction: 'outbound',
        channel: channelType,
        sessionId,
        userId,
        personaId,
        content: message,
        metadata,
      });

      const result = await handler.send(payload);

      await this._updateMessageStatus(message.id || 'msg_' + Date.now(), 'sent');
      return result;
    } catch (err) {
      await this._updateMessageStatus(message.id || 'msg_' + Date.now(), 'failed');
      console.error(`[ChannelManager] Send error (${channelType}):`, err.message);
      return { error: err.message };
    }
  }

  async receiveMessage(channelType, payload) {
    const { sessionId, userId, message, personaId, metadata, source } = payload;

    await this._logMessage({
      direction: 'inbound',
      channel: channelType,
      sessionId,
      userId,
      personaId,
      content: typeof message === 'string' ? message : message.text || message.content || '',
      metadata: { ...metadata, source },
    });

    return { processed: true, sessionId, userId };
  }

  async sendMedia(channelType, payload) {
    const { sessionId, userId, personaId, type, data, caption, fileName } = payload;

    if (channelType === 'whatsapp') {
      const recipient = sessionId || userId;
      if (!recipient) return { error: 'No recipient for WhatsApp media' };
      if (type === 'image') return await sendWhatsAppImage(recipient, data, caption || '');
      if (type === 'video') return await sendWhatsAppVideo(recipient, data, caption || '');
      if (type === 'document') return await sendWhatsAppDocument(recipient, data, fileName || 'document.pdf', caption || '');
      if (type === 'audio') {
        const { sendWhatsAppAudio } = require('../whatsapp/bot');
        return await sendWhatsAppAudio(recipient, data);
      }
    }

    if (channelType === 'telegram') {
      let chatId = null;
      if (sessionId && sessionId.startsWith('tg_')) {
        const parts = sessionId.split('_');
        chatId = parts.length >= 3 && parts[1].startsWith('-') ? parts.slice(1, -1).join('_') : parts[1];
      } else if (userId && userId.startsWith('tg_')) {
        chatId = userId.replace('tg_', '');
      }
      if (!chatId) return { error: 'No chatId for Telegram media' };
      if (type === 'image') return await sendTelegramPhoto(chatId, data, caption || '');
      if (type === 'document') return await sendTelegramDocument(chatId, data, fileName || 'document.pdf', caption || '');
      if (type === 'audio' || type === 'voice') return await sendTelegramVoice(chatId, data);
    }

    const handler = this.handlers.get(channelType);
    if (handler && handler.sendMedia) return handler.sendMedia(payload);

    return { error: `Media sending not supported for: ${channelType}` };
  }

  async sendText(channelType, sessionId, userId, message, personaId) {
    if (channelType === 'whatsapp') {
      const recipient = sessionId || userId;
      if (recipient) return await sendWhatsAppText(recipient, message);
    }

    const handler = this.handlers.get(channelType);
    if (handler && handler.send) {
      return handler.send({ sessionId, userId, message, personaId });
    }

    return { error: `Text sending not supported for: ${channelType}` };
  }

  async _logMessage(data) {
    try {
      const id = `chmsg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await pool.execute(
        `INSERT INTO channel_messages (id, direction, channel, session_id, user_id, persona_id, content, metadata, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'delivered', NOW())`,
        [id, data.direction, data.channel, data.sessionId, data.userId, data.personaId,
         typeof data.content === 'string' ? data.content.substring(0, 5000) : JSON.stringify(data.content),
         JSON.stringify(data.metadata || {})]
      );
    } catch (err) {
      console.error('[ChannelManager] Failed to log message:', err.message);
    }
  }

  async _updateMessageStatus(messageId, status) {
    try {
      await pool.execute(
        'UPDATE channel_messages SET status = ? WHERE id = ?',
        [status, messageId]
      );
    } catch {}
  }

  async getMessageHistory(sessionId, opts = {}) {
    const limit = parseInt(opts.limit) || 50;
    const offset = parseInt(opts.offset) || 0;
    const channel = opts.channel || null;

    let query = 'SELECT * FROM channel_messages WHERE session_id = ?';
    const params = [sessionId];

    if (channel) {
      query += ' AND channel = ?';
      params.push(channel);
    }

    query += ` ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  async getChannelStats(workspaceId, days = 7) {
    try {
      const [rows] = await pool.execute(
        `SELECT channel, direction, COUNT(*) as count
         FROM channel_messages
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY channel, direction`,
        [days]
      );
      return rows;
    } catch {
      return [];
    }
  }

  async getUnifiedInbox(workspaceId, opts = {}) {
    const limit = parseInt(opts.limit) || 20;
    const offset = parseInt(opts.offset) || 0;
    const channel = opts.channel || null;
    const unreadOnly = opts.unread_only || false;

    let query = 'SELECT * FROM channel_messages WHERE 1=1';
    const params = [];

    if (channel) {
      query += ' AND channel = ?';
      params.push(channel);
    }
    if (unreadOnly) {
      query += ' AND direction = "inbound" AND status = "delivered"';
    }

    query += ` ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const [rows] = await pool.execute(query, params);
    return rows;
  }
}

const channelManager = new ChannelManager();

module.exports = {
  channelManager,
  ChannelManager,
  CHANNEL_TYPES,
};