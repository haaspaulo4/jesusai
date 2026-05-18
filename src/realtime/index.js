require('dotenv').config();
const { Server } = require('socket.io');
const { verifyToken } = require('../auth');

const connectedUsers = new Map();
const sessionRooms = new Map();

function initializeSocketIO(httpServer) {
  const allowedOrigins = [
    process.env.SERVER_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.CORS_ORIGIN !== '*' && process.env.CORS_ORIGIN,
  ].filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
      methods: ['GET', 'POST'],
    },
    connectTimeout: 10000,
    pingTimeout: 20000,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Invalid token'));
    }
    socket.userId = decoded.id;
    socket.userRole = decoded.role || 'user';
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[SocketIO] Client connected: ${socket.id} (user: ${socket.userId})`);

    connectedUsers.set(socket.userId, socket.id);
    socket.join(`user:${socket.userId}`);

    socket.on('auth', (data) => {
      if (data.sessionId && typeof data.sessionId === 'string' && data.sessionId.length < 100) {
        socket.join(`session:${data.sessionId}`);
        sessionRooms.set(socket.id, data.sessionId);
        console.log(`[SocketIO] Socket ${socket.id} joined session ${data.sessionId}`);
      }
    });

    socket.on('join_session', (sessionId) => {
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) return;
      socket.join(`session:${sessionId}`);
      sessionRooms.set(socket.id, sessionId);
    });

    socket.on('leave_session', (sessionId) => {
      socket.leave(`session:${sessionId}`);
      sessionRooms.delete(socket.id);
    });

    socket.on('typing', (data) => {
      if (!data || !data.sessionId) return;
      socket.to(`session:${data.sessionId}`).emit('typing', {
        userId: socket.userId,
        isTyping: !!data.isTyping,
      });
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
      }
      sessionRooms.delete(socket.id);
      console.log(`[SocketIO] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[SocketIO] Server initialized with auth middleware');
  return io;
}

function emitToUser(userId, event, data) {
  const io = getIO();
  if (io) io.to(`user:${userId}`).emit(event, data);
}

function emitToSession(sessionId, event, data) {
  const io = getIO();
  if (io) io.to(`session:${sessionId}`).emit(event, data);
}

function emitAgentThinking(sessionId, data) {
  emitToSession(sessionId, 'agent_thinking', data);
}

function emitAgentStep(sessionId, step, details) {
  emitToSession(sessionId, 'agent_step', { step, details, timestamp: Date.now() });
}

function emitNewMessage(sessionId, message) {
  emitToSession(sessionId, 'new_message', message);
}

function emitXpUpdate(userId, xpData) {
  emitToUser(userId, 'xp_update', xpData);
}

function emitBadgeEarned(userId, badge) {
  emitToUser(userId, 'badge_earned', badge);
}

function emitStageAdvance(userId, personaId, stageData) {
  emitToUser(userId, 'stage_update', { personaId, ...stageData });
}

function emitGoalUpdate(userId, goal) {
  emitToUser(userId, 'goal_update', goal);
}

function emitCreativeProgress(sessionId, progress) {
  emitToSession(sessionId, 'creative_progress', progress);
}

function emitOverrideStatus(sessionId, status) {
  emitToSession(sessionId, 'override_status', status);
}

function getConnectedUserCount() {
  return connectedUsers.size;
}

let _io = null;

function getIO() {
  return _io;
}

function setIO(io) {
  _io = io;
}

module.exports = {
  initializeSocketIO,
  emitToUser,
  emitToSession,
  emitAgentThinking,
  emitAgentStep,
  emitNewMessage,
  emitXpUpdate,
  emitBadgeEarned,
  emitStageAdvance,
  emitGoalUpdate,
  emitCreativeProgress,
  emitOverrideStatus,
  getConnectedUserCount,
  getIO,
  setIO,
};