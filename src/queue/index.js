require('dotenv').config();
const net = require('net');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const QUEUE_NAMES = {
  PROACTIVE: 'proactive',
  FOLLOWUP: 'followup',
  INGESTION: 'ingestion',
  EMBEDDING: 'embedding',
  NOTIFICATION: 'notification',
  AUTOMATION: 'automation',
  BLOG: 'blog',
  EMAIL: 'email',
};

let _bullmq = null;
let _connection = null;
let _queues = {};
let _workers = {};
let _initialized = false;
let _redisAvailable = false;

function _checkRedis() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(REDIS_PORT, REDIS_HOST);
  });
}

async function _loadBullMQ() {
  if (_bullmq) return _bullmq;
  _redisAvailable = await _checkRedis();
  if (!_redisAvailable) return null;
  try {
    _bullmq = require('bullmq');
    _connection = {
      host: REDIS_HOST,
      port: REDIS_PORT,
      ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
    };
    return _bullmq;
  } catch (err) {
    console.error('[JobQueue] Failed to load bullmq:', err.message);
    return null;
  }
}

function getQueue(name) {
  if (!_initialized || !_bullmq) return null;
  if (!_queues[name]) {
    _queues[name] = new _bullmq.Queue(name, { connection: _connection });
  }
  return _queues[name];
}

function createWorker(name, processor, options = {}) {
  if (!_initialized || !_bullmq) return null;
  if (_workers[name]) {
    _workers[name].close().catch(() => {});
  }
  const worker = new _bullmq.Worker(name, processor, {
    connection: _connection,
    concurrency: options.concurrency || 1,
    ...options,
  });
  worker.on('completed', (job) => {
    console.log(`[JobQueue] ${name}:${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[JobQueue] ${name}:${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') return;
    console.error(`[JobQueue] ${name} worker error:`, err.message);
  });
  _workers[name] = worker;
  return worker;
}

async function addJob(queueName, data, options = {}) {
  const queue = getQueue(queueName);
  if (!queue) return null;
  try {
    const job = await queue.add(queueName, data, {
      attempts: options.attempts || 3,
      backoff: options.backoff || { type: 'exponential', delay: 1000 },
      delay: options.delay || 0,
      removeOnComplete: options.removeOnComplete !== false,
      removeOnFail: options.removeOnFail || false,
      ...options,
    });
    return job;
  } catch (err) {
    console.error(`[JobQueue] Failed to add job to ${queueName}:`, err.message);
    return null;
  }
}

async function addScheduledJob(queueName, data, cron, options = {}) {
  const queue = getQueue(queueName);
  if (!queue) return null;
  try {
    const repeatableJob = await queue.add(queueName, data, {
      repeat: { pattern: cron },
      ...options,
    });
    return repeatableJob;
  } catch (err) {
    console.error(`[JobQueue] Failed to add scheduled job to ${queueName}:`, err.message);
    return null;
  }
}

async function initialize() {
  if (_initialized) return true;

  const bullmq = await _loadBullMQ();
  if (!bullmq) {
    console.log('[JobQueue] Redis not available. Using interval-based fallback.');
    return false;
  }

  try {
    const testQueue = new bullmq.Queue('__test_connection__', { connection: _connection });
    await testQueue.add('ping', {}, { removeOnComplete: true });
    await testQueue.close();
    _initialized = true;
    console.log('[JobQueue] Initialized with Redis connection');
    return true;
  } catch (err) {
    console.log('[JobQueue] Redis connection failed. Using interval fallback.');
    _bullmq = null;
    _connection = null;
    _initialized = false;
    return false;
  }
}

async function getQueueStats() {
  if (!_initialized) {
    return Object.fromEntries(Object.keys(QUEUE_NAMES).map(k => [k, { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }]));
  }
  const stats = {};
  for (const [name, queue] of Object.entries(_queues)) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      stats[name] = { waiting, active, completed, failed, delayed };
    } catch (err) {
      stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }
  return stats;
}

async function shutdown() {
  if (!_initialized) return;
  console.log('[JobQueue] Shutting down...');
  for (const worker of Object.values(_workers)) {
    try { await worker.close(); } catch (e) {}
  }
  for (const queue of Object.values(_queues)) {
    try { await queue.close(); } catch (e) {}
  }
  _initialized = false;
  _queues = {};
  _workers = {};
  console.log('[JobQueue] Shutdown complete');
}

function isAvailable() {
  return _initialized;
}

module.exports = {
  QUEUE_NAMES,
  getQueue,
  createWorker,
  addJob,
  addScheduledJob,
  initialize,
  getQueueStats,
  shutdown,
  isAvailable,
};