const TTS_MODE = process.env.TTS_MODE || 'kokoro';
const KOKORO_URL = (process.env.KOKORO_URL || '').replace(/\/+$/, '') || 'http://localhost:8000';

let healthCheckInterval = null;
let isHealthy = false;
let checking = false;

async function checkHealth() {
  if (checking) return isHealthy;
  checking = true;
  if (TTS_MODE !== 'kokoro') { checking = false; return true; }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${KOKORO_URL}/health`, {
      signal: controller.signal,
      headers: { 'Connection': 'keep-alive' },
    });
    clearTimeout(timeout);

    return res.ok;
  } catch {
    return false;
  } finally {
    checking = false;
  }
}

async function warmupPipeline() {
  try {
    const res = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      body: JSON.stringify({
        model: 'kokoro',
        voice: 'pm_alex',
        input: 'Paz',
        lang: 'pt-BR',
        language: 'p',
        response_format: 'wav',
        speed: 1.0,
      }),
    });
    if (res.ok) {
      await res.arrayBuffer();
      console.log('  [Kokoro] Pipeline warmed up');
    }
  } catch {}
}

async function startKokoroServer() {
  if (TTS_MODE !== 'kokoro') {
    console.log('  [Kokoro] TTS_MODE is not kokoro, skipping');
    return;
  }

  const running = await checkHealth();
  isHealthy = running;
  if (running) {
    console.log('  [Kokoro] Server already running at', KOKORO_URL);
    warmupPipeline();
  } else {
    console.log('  [Kokoro] Server not running at', KOKORO_URL);
    console.log('  [Kokoro] Start it manually: npm run tts:start');
  }

  scheduleHealthCheck();
}

function scheduleHealthCheck() {
  if (healthCheckInterval) clearInterval(healthCheckInterval);

  healthCheckInterval = setInterval(async () => {
    const wasHealthy = isHealthy;
    const healthy = await checkHealth();
    isHealthy = healthy;
    if (healthy && !wasHealthy) {
      console.log('  [Kokoro] Server is back online');
      warmupPipeline();
    } else if (!healthy && wasHealthy) {
      console.warn('  [Kokoro] Server went offline — TTS will fallback to Edge TTS');
    }
  }, 120000);
}

function stopKokoroServer() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  isHealthy = false;
}

function getKokoroStatus() {
  return {
    mode: TTS_MODE,
    url: KOKORO_URL,
    isHealthy,
  };
}

module.exports = {
  startKokoroServer,
  stopKokoroServer,
  checkHealth,
  getKokoroStatus,
  warmupPipeline,
};