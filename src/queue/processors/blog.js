const { QUEUE_NAMES, createWorker } = require('../queue');
const { generateDailyPost } = require('../../blog');

async function processBlogJob(job) {
  const { type } = job.data;

  if (type === 'daily_post') {
    const result = await generateDailyPost();
    return { success: true, post: result?.slug || null };
  }

  return { error: `Unknown blog job type: ${type}` };
}

async function processEmailJob(job) {
  const { to, subject, body } = job.data;
  const emailModule = require('../../email');

  try {
    await emailModule.sendEmail(to, subject, body);
    return { success: true, to };
  } catch (err) {
    console.error('[EmailProcessor] Failed:', err.message);
    throw err;
  }
}

function startBlogWorkers() {
  const { createWorker, isAvailable } = require('../queue');
  if (!isAvailable()) {
    console.log('[BlogProcessor] Skipped — Redis unavailable');
    return;
  }
  createWorker(QUEUE_NAMES.BLOG, processBlogJob, { concurrency: 1 });
  createWorker(QUEUE_NAMES.EMAIL, processEmailJob, { concurrency: 5 });
  console.log('[BlogProcessor] Workers started');
}

module.exports = {
  processBlogJob,
  processEmailJob,
  startBlogWorkers,
};