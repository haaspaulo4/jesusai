require('dotenv').config();
const { pool } = require('../db');

const SERVICE_TYPES = {
  llm: { label: 'LLM / Chat', envKey: 'OLLAMA_API_KEY', envUrl: 'OLLAMA_BASE_URL', testModel: true, healthModel: 'ok', healthMaxTokens: 1 },
  llm_groq: { label: 'LLM Groq', envKey: 'GROQ_API_KEY', envUrl: 'GROQ_BASE_URL', testModel: true, healthModel: 'llama-3.3-70b-versatile', healthMaxTokens: 1 },
  llm_claude: { label: 'LLM Claude (Aibee)', envKey: 'CLAUDE_API_KEY', envUrl: 'CLAUDE_BASE_URL', testModel: true, healthModel: 'claude-sonnet-4-20250514', healthMaxTokens: 1 },
  tts_kokoro: { label: 'TTS Kokoro', envKey: '', envUrl: 'KOKORO_URL', testModel: false, healthEndpoint: '/health' },
  tts_edge: { label: 'TTS Edge', envKey: '', envUrl: '', testModel: false, healthCmd: 'edge-tts' },
  tts_multivozes: { label: 'TTS Multivozes', envKey: 'MULTIVOZES_KEY', envUrl: 'MULTIVOZES_URL', testModel: false },
  stt_groq: { label: 'STT Groq', envKey: 'GROQ_API_KEY', envUrl: 'GROQ_BASE_URL', testModel: false, healthEndpoint: '/models' },
  stt_openai: { label: 'STT OpenAI', envKey: 'OPENAI_API_KEY', envUrl: '', testModel: false },
  email: { label: 'Email SMTP', envKey: '', envUrl: '', testModel: false },
  telegram: { label: 'Telegram Bot', envKey: 'TELEGRAM_TOKEN', envUrl: '', testModel: false, healthEndpoint: 'https://api.telegram.org/bot{key}/getMe' },
  whatsapp: { label: 'WhatsApp Evolution', envKey: 'EVO_API_KEY', envUrl: 'EVO_API_URL', testModel: false },
};

class IntegrationManager {
  constructor() {
    this.integrations = {};
    this.loaded = false;
    this.healthInterval = null;
    this.lastNotification = 0;
    this.onServiceDown = null;

    for (const type of Object.keys(SERVICE_TYPES)) {
      this.integrations[type] = [];
    }
  }

  async load() {
    if (this.loaded) return;

    try {
      const [rows] = await pool.execute(
        'SELECT id, service_type, api_key, base_url, model, label, priority, is_active, extra_config FROM api_keys ORDER BY priority ASC, id ASC'
      );

      for (const type of Object.keys(SERVICE_TYPES)) {
        this.integrations[type] = [];
      }

      for (const row of rows) {
        const type = row.service_type;
        if (!this.integrations[type]) this.integrations[type] = [];

        this.integrations[type].push({
          id: row.id,
          type,
          key: row.api_key || '',
          baseUrl: row.base_url || '',
          model: row.model || '',
          label: row.label || `${SERVICE_TYPES[type]?.label || type} #${row.id}`,
          priority: row.priority || 100,
          active: !!row.is_active,
          healthy: true,
          lastUsed: null,
          lastError: null,
          consecutiveFailures: 0,
          lastHealthCheck: null,
          rateLimitRemaining: null,
          extraConfig: row.extra_config ? (typeof row.extra_config === 'string' ? JSON.parse(row.extra_config) : row.extra_config) : {},
        });
      }

      this._loadFromEnv();
      this.loaded = true;

      const summary = {};
      for (const [type, list] of Object.entries(this.integrations)) {
        summary[type] = { total: list.length, healthy: list.filter(k => k.healthy).length };
      }
      console.log('[Integrations] Loaded:', JSON.stringify(summary));
      this._startHealthChecks();

    } catch (err) {
      console.error('[Integrations] Load failed:', err.message);
      this._loadFromEnv();
      this.loaded = true;
    }
  }

  _loadFromEnv() {
    for (const [type, config] of Object.entries(SERVICE_TYPES)) {
      if (this.integrations[type]?.length > 0) continue;

      if (type === 'llm') {
        const envUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
        const envModel = process.env.OLLAMA_MODEL || 'glm-5.1';

        // Load multiple keys from .env (OLLAMA_API_KEY_1, _2, etc.) - exclude unnumbered OLLAMA_API_KEY
        const envKeys = Object.entries(process.env)
          .filter(([k]) => /^OLLAMA_API_KEY_\d+$/.test(k))
          .sort(([a], [b]) => {
            const pa = parseInt(process.env[`OLLAMA_PRIORITY_${a.split('_').pop()}`] || a.split('_').pop());
            const pb = parseInt(process.env[`OLLAMA_PRIORITY_${b.split('_').pop()}`] || b.split('_').pop());
            return pa - pb;
          });

        if (envKeys.length > 0) {
          for (const [key, value] of envKeys) {
            const keyNum = key.split('_').pop();
            this.integrations[type].push({
              id: `env_key_${keyNum}`,
              type, key: value,
              baseUrl: process.env[`OLLAMA_BASE_URL_${keyNum}`] || envUrl,
              model: process.env[`OLLAMA_MODEL_${keyNum}`] || envModel,
              label: `Key ${keyNum} (env)`, priority: parseInt(process.env[`OLLAMA_PRIORITY_${keyNum}`] || keyNum), active: true,
              healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
              lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
            });
          }
          console.log(`[Integrations] Loaded ${envKeys.length} Ollama keys from .env`);
        } else if (process.env.OLLAMA_API_KEY) {
          // Fallback: single key
          this.integrations[type].push({
            id: 'env_llm',
            type, key: process.env.OLLAMA_API_KEY, baseUrl: envUrl, model: envModel,
            label: 'LLM Default (env)', priority: 0, active: true,
            healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
            lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
          });
        }
      }

      if (type === 'llm_groq' && process.env.GROQ_API_KEY) {
        const url = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
        const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        this.integrations[type].push({
          id: 'env_llm_groq',
          type, key: process.env.GROQ_API_KEY, baseUrl: url, model,
          label: 'LLM Groq (env)', priority: 0, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
        });
      }

      if (type === 'llm_claude' && process.env.CLAUDE_API_KEY) {
        const url = process.env.CLAUDE_BASE_URL || 'https://api.aibee.cloud/v1';
        const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
        this.integrations[type].push({
          id: 'env_llm_claude',
          type, key: process.env.CLAUDE_API_KEY, baseUrl: url, model,
          label: 'Claude (Aibee)', priority: 0, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
        });
      }

      if (type === 'tts_kokoro') {
        const url = (process.env.KOKORO_URL || 'http://localhost:8001').replace(/\/+$/, '');
        this.integrations[type].push({
          id: 'env_kokoro', type, key: '', baseUrl: url, model: 'kokoro',
          label: 'Kokoro Default (env)', priority: 0, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
        });
      }

      if (type === 'tts_multivozes' && process.env.MULTIVOZES_URL) {
        this.integrations[type].push({
          id: 'env_multivozes', type, key: process.env.MULTIVOZES_KEY || '',
          baseUrl: process.env.MULTIVOZES_URL.replace(/\/+$/, ''),
          model: 'tts-1', label: 'Multivozes (env)', priority: 10, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
        });
      }

      if (type === 'stt_groq' && process.env.GROQ_API_KEY) {
        const url = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
        this.integrations[type].push({
          id: 'env_groq', type, key: process.env.GROQ_API_KEY,
          baseUrl: url, model: 'whisper-large-v3', label: 'Groq STT (env)',
          priority: 0, active: true, healthy: true, lastUsed: null, lastError: null,
          consecutiveFailures: 0, lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
        });
      }

      if (type === 'stt_openai' && process.env.OPENAI_API_KEY) {
        this.integrations[type].push({
          id: 'env_openai_stt', type, key: process.env.OPENAI_API_KEY,
          baseUrl: 'https://api.openai.com/v1', model: 'whisper-1',
          label: 'OpenAI STT (env)', priority: 10, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
        });
      }

      if (type === 'telegram' && process.env.TELEGRAM_TOKEN) {
        this.integrations[type].push({
          id: 'env_telegram', type, key: process.env.TELEGRAM_TOKEN,
          baseUrl: 'https://api.telegram.org', model: '',
          label: 'Telegram Bot (env)', priority: 0, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null, extraConfig: {},
        });
      }

      if (type === 'whatsapp' && process.env.EVO_API_URL) {
        this.integrations[type].push({
          id: 'env_whatsapp', type, key: process.env.EVO_API_KEY || '',
          baseUrl: process.env.EVO_API_URL.replace(/\/+$/, ''),
          model: '', label: 'Evolution API (env)', priority: 0, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null, extraConfig: { instance: process.env.EVO_INSTANCE || 'jesus-ai' },
        });
      }

      if (type === 'email' && process.env.SMTP_HOST) {
        this.integrations[type].push({
          id: 'env_smtp', type, key: process.env.SMTP_PASS || '',
          baseUrl: process.env.SMTP_HOST, model: '',
          label: `SMTP ${process.env.SMTP_HOST} (env)`, priority: 0, active: true,
          healthy: true, lastUsed: null, lastError: null, consecutiveFailures: 0,
          lastHealthCheck: null, rateLimitRemaining: null,
          extraConfig: { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT || '587', user: process.env.SMTP_USER, from: process.env.SMTP_FROM },
        });
      }
    }
  }

  async getNext(serviceType, userId) {
    if (!this.loaded) await this.load();

    if (serviceType === 'llm' && userId) {
      try {
        const [rows] = await pool.execute('SELECT ollama_api_key FROM users WHERE id = ?', [userId]);
        if (rows.length > 0 && rows[0].ollama_api_key) {
          const defaultLlm = this.integrations.llm?.[0];
          return {
            id: `user_${userId}`, type: 'llm', key: rows[0].ollama_api_key,
            baseUrl: defaultLlm?.baseUrl || process.env.OLLAMA_BASE_URL || 'https://ollama.com/api',
            model: defaultLlm?.model || process.env.OLLAMA_MODEL || 'glm-5.1',
            label: `User ${userId} key`, priority: -1, active: true, healthy: true,
            lastUsed: null, lastError: null, consecutiveFailures: 0, lastHealthCheck: null, extraConfig: {},
          };
        }
      } catch {}
    }

    const list = this.integrations[serviceType] || [];
    const candidates = list.filter(k => k.active);
    if (candidates.length === 0) {
      return list[0] || null;
    }

    candidates.sort((a, b) => a.priority - b.priority);

    const now = Date.now();
    const roundRobin = candidates.filter(k => !k.lastUsed || now - k.lastUsed > 500);
    if (roundRobin.length > 0) {
      roundRobin[0].lastUsed = now;
      return roundRobin[0];
    }

    candidates[0].lastUsed = now;
    return candidates[0];
  }

  async callWithFallback(serviceType, callFn, options = {}) {
    if (!this.loaded) await this.load();

    const maxRetries = options.retries ?? 3;
    const tried = new Set();
    let lastErr = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const integ = await this.getNext(serviceType, options.userId);
      if (!integ) {
        this._notifyServiceDown(serviceType);
        throw new Error(`Nenhuma integração disponível para "${SERVICE_TYPES[serviceType]?.label || serviceType}". Adicione em /api/admin/integrations`);
      }

      if (tried.has(integ.id) && tried.size >= this.integrations[serviceType].filter(k => k.active).length) {
        break;
      }
      tried.add(integ.id);

      try {
        const result = await callFn(integ);
        integ.consecutiveFailures = 0;
        integ.healthy = true;
        integ.lastUsed = Date.now();
        return result;
      } catch (err) {
        integ.consecutiveFailures++;
        integ.lastError = err.message;

        if (err.message?.includes('429') || err.message?.includes('rate limit') || err.message?.includes('403') || err.message?.includes('subscription')) {
          integ.healthy = false;
          setTimeout(() => { integ.healthy = true; integ.consecutiveFailures = 0; }, 30000);
          console.warn(`[Integrations] ${integ.label} rate/subscription error, trying next...`);
          lastErr = err;
          continue;
        }

        if (integ.consecutiveFailures >= 3) {
          integ.healthy = false;
          console.warn(`[Integrations] ${integ.label} marked unhealthy after ${integ.consecutiveFailures} failures`);
          setTimeout(() => { integ.healthy = true; integ.consecutiveFailures = 0; }, 300000);
        }

        lastErr = err;
        console.warn(`[Integrations] ${integ.label} failed: ${err.message}, trying next...`);
        continue;
      }
    }

    const allDown = this.integrations[serviceType]?.every(k => !k.healthy);
    if (allDown) this._notifyServiceDown(serviceType);

    throw lastErr || new Error(`Todas as integrações para "${SERVICE_TYPES[serviceType]?.label || serviceType}" falharam`);
  }

  async callLLM(messages, options = {}) {
    if (!this.loaded) await this.load();
    const useGroq = process.env.GROQ_AS_PRIMARY === 'true';
    const serviceTypes = useGroq ? ['llm_groq', 'llm_claude', 'llm'] : ['llm', 'llm_claude', 'llm_groq'];
    let lastErr = null;

    for (const st of serviceTypes) {
      if (!this.integrations[st]?.length) continue;
      try {
        return await this._callLLMWithService(messages, options, st);
      } catch (err) {
        lastErr = err;
        console.warn(`[IntegrationManager] ${st} failed: ${err ? err.message : err}`);
      }
    }
    throw lastErr || new Error('No LLM integrations are available or active');
  }

  async _callLLMWithService(messages, options, serviceType) {
    return this.callWithFallback(serviceType, async (integ) => {
      const timeout = options.timeout ?? 30000;
      const stream = options.stream ?? false;
      const temperature = options.temperature ?? 0.7;
      const numPredict = options.numPredict ?? 4096;
      const tools = options.tools ?? null;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const isOllama = integ.baseUrl?.includes('ollama.com') || integ.baseUrl?.includes(':11434');
      const isClaude = integ.baseUrl?.includes('aibee.cloud') || serviceType === 'llm_claude';
      const isAnthropic = isClaude || (integ.baseUrl?.includes('anthropic') || integ.baseUrl?.includes('anthropic.com'));

      // Nuclear safety: deep clone + normalize everything (prevents 400 malformed JSON on Ollama and 413 on Groq)
      let safeMessages = Array.isArray(messages) ? JSON.parse(JSON.stringify(messages)) : [];

      // Ultra hard cap for meta / cognitive calls
      if (safeMessages.length > 5) safeMessages = safeMessages.slice(-5);

      // UNIVERSAL aggressive normalizer — force strings for content, arguments, tool results on EVERY provider
      function normalizeMessagesForLLM(arr) {
        return arr.map(msg => {
          if (!msg || typeof msg !== 'object') return msg;

          const m = { ...msg };

          // Always stringify content if object (especially for role: tool or previous tool results)
          if (m.content && typeof m.content === 'object') {
            try { m.content = JSON.stringify(m.content); } catch { m.content = String(m.content); }
          }

          // tool_calls arguments must be string for Ollama / most providers
          if (Array.isArray(m.tool_calls)) {
            m.tool_calls = m.tool_calls.map(tc => {
              if (tc && tc.function) {
                if (tc.function.arguments && typeof tc.function.arguments === 'object') {
                  try { tc.function.arguments = JSON.stringify(tc.function.arguments); } catch { tc.function.arguments = '{}'; }
                }
              }
              return tc;
            });
          }

          // For role 'tool', content must be string (Ollama chokes on objects)
          if (m.role === 'tool' && typeof m.content !== 'string') {
            try { m.content = JSON.stringify(m.content || {}); } catch { m.content = '{}'; }
          }

          // Recurse into any other objects that might sneak in
          for (const k of Object.keys(m)) {
            if (k !== 'content' && k !== 'tool_calls' && m[k] && typeof m[k] === 'object' && !Array.isArray(m[k])) {
              try { m[k] = JSON.stringify(m[k]); } catch { m[k] = String(m[k]); }
            }
          }

          return m;
        });
      }

      safeMessages = normalizeMessagesForLLM(safeMessages);

      // Final nuclear size guard — slice harder for stability
      let jsonSize = JSON.stringify(safeMessages).length;
      if (jsonSize > 22000) {
        safeMessages = safeMessages.slice(-3);
      }

      let body, endpoint, headers;
      if (isOllama) {
        endpoint = '/chat';
        body = { model: options.model || integ.model, messages: safeMessages, stream, options: { temperature, num_predict: numPredict } };
        headers = { 'Content-Type': 'application/json', ...(integ.key ? { Authorization: `Bearer ${integ.key}` } : {}) };
      } else if (isAnthropic) {
        endpoint = '/messages';
        body = { model: options.model || integ.model, max_tokens: numPredict, messages: safeMessages };
        if (temperature !== undefined && temperature !== null) body.temperature = temperature;
        if (tools?.length > 0) body.tools = tools;
        headers = { 'Content-Type': 'application/json', 'x-api-key': integ.key, 'anthropic-version': '2023-06-01' };
      } else {
        endpoint = '/chat/completions';
        body = { model: options.model || integ.model, messages: safeMessages, temperature, max_tokens: numPredict, stream };
        if (tools?.length > 0) body.tools = tools;
        headers = { 'Content-Type': 'application/json', ...(integ.key ? { Authorization: `Bearer ${integ.key}` } : {}) };
      }

      const response = await fetch(`${integ.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429) {
        const err = await response.text().catch(() => '');
        throw new Error(`429 rate limit: ${err.substring(0, 200)}`);
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`API error ${response.status}: ${errText.substring(0, 300)}`);
      }

      if (stream) return response;

      const data = await response.json();
      const normalized = normalizeLLMResponse(data);
      if (normalized.tool_calls?.length > 0) {
        return { message: normalized.message, tool_calls: normalized.tool_calls, done: normalized.done };
      }
      return normalized;

    }, options);
  }

  async callSTT(audioBuffer, filename, language, options = {}) {
    const FormData = require('form-data');
    const serviceType = options.serviceType || 'stt_groq';

    return this.callWithFallback(serviceType, async (integ) => {
      const formData = new FormData();
      formData.append('file', audioBuffer, filename);
      formData.append('model', integ.model || 'whisper-large-v3');
      if (language) formData.append('language', language);
      formData.append('response_format', 'json');

      const baseURL = integ.baseUrl || 'https://api.groq.com/openai/v1';
      const response = await fetch(`${baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          ...(integ.key ? { Authorization: `Bearer ${integ.key}` } : {}),
          ...formData.getHeaders(),
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`STT error ${response.status}: ${errText.substring(0, 200)}`);
      }

      const data = await response.json();
      return data.text || '';
    }, { ...options, retries: 1 });
  }

  async callTTS(text, options = {}) {
    const serviceType = options.serviceType || 'tts_kokoro';

    return this.callWithFallback(serviceType, async (integ) => {
      const { generateKokoroBuffer, generateMultivozesBuffer, generateEdgeTTSBuffer } = require('../tts');

      if (serviceType === 'tts_kokoro') {
        return await generateKokoroBuffer(text, { ...options, kokoroUrl: integ.baseUrl || undefined, kokoroVoice: integ.extraConfig?.voice });
      }
      if (serviceType === 'tts_multivozes') {
        return await generateMultivozesBuffer(text, { ...options, url: integ.baseUrl, key: integ.key });
      }
      return await generateEdgeTTSBuffer(text, options);
    }, { ...options, retries: 1 });
  }

  _notifyServiceDown(serviceType) {
    const now = Date.now();
    if (now - this.lastNotification < 300000) return;
    this.lastNotification = now;

    const label = SERVICE_TYPES[serviceType]?.label || serviceType;
    console.error(`[Integrations] ⚠️  TODAS AS INTEGRAÇÕES DE "${label}" FALHARAM!`);
    console.error(`[Integrations] Adicione novas chaves em /api/admin/integrations`);

    if (this.onServiceDown && typeof this.onServiceDown === 'function') {
      this.onServiceDown(serviceType, this.integrations[serviceType]);
    }
  }

  _startHealthChecks() {
    if (this.healthInterval) clearInterval(this.healthInterval);
    this.healthInterval = setInterval(() => this._checkHealth(), 120000);
    setTimeout(() => this._checkHealth(), 15000);
  }

  async _checkHealth() {
    let anyChanged = false;

    for (const [type, list] of Object.entries(this.integrations)) {
      for (const integ of list) {
        if (!integ.active) continue;

        const wasHealthy = integ.healthy;

        try {
          const healthy = await this._checkIntegrationHealth(integ);
          integ.healthy = healthy;
          integ.lastHealthCheck = new Date().toISOString();
          if (!healthy) {
            integ.consecutiveFailures++;
          } else {
            integ.consecutiveFailures = 0;
          }
        } catch (err) {
          integ.healthy = false;
          integ.lastError = err.message;
          integ.lastHealthCheck = new Date().toISOString();
          integ.consecutiveFailures++;
        }

        if (wasHealthy !== integ.healthy) anyChanged = true;
      }
    }

    if (anyChanged) {
      const lines = [];
      for (const [type, list] of Object.entries(this.integrations)) {
        for (const integ of list) {
          if (!integ.active) continue;
          lines.push(`  [${integ.healthy ? '✓' : '✗'}] ${SERVICE_TYPES[type]?.label || type}: ${integ.label} ${integ.healthy ? 'OK' : (integ.lastError?.substring(0, 60) || 'unhealthy')}`);
        }
      }
      console.log(`[Integrations] Health check:\n${lines.join('\n')}`);
    }
  }

  async _checkIntegrationHealth(integ) {
    const config = SERVICE_TYPES[integ.type];
    if (!config) return true;

    try {
      if (integ.type === 'llm' || integ.type === 'llm_groq') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

      const isOllama = integ.baseUrl?.includes('ollama.com') || integ.baseUrl?.includes(':11434');
        const endpoint = isOllama ? '/chat' : '/chat/completions';
        let body;
        if (isOllama) {
          body = { model: integ.model || 'glm-5.1', messages: [{ role: 'user', content: 'ok' }], stream: false, options: { temperature: 0.1, num_predict: 1 } };
        } else {
          body = { model: integ.model || 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'ok' }], temperature: 0.1, max_tokens: 1, stream: false };
        }

        const response = await fetch(`${integ.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(integ.key ? { Authorization: `Bearer ${integ.key}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        return response.ok;
      }

      if (integ.type === 'tts_kokoro') {
        const url = integ.baseUrl || 'http://localhost:8001';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${url}/health`, { signal: controller.signal });
        clearTimeout(timer);
        return response.ok;
      }

      if (integ.type === 'telegram') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`https://api.telegram.org/bot${integ.key}/getMe`, { signal: controller.signal });
        clearTimeout(timer);
        const data = await response.json();
        return data.ok === true;
      }

      if (integ.type === 'whatsapp') {
        if (!integ.baseUrl || !integ.key) return false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${integ.baseUrl}/instance/fetchInstances`, {
          headers: { apikey: integ.key },
          signal: controller.signal,
        });
        clearTimeout(timer);
        return response.ok;
      }

      if (integ.type === 'stt_groq' || integ.type === 'stt_openai') {
        if (!integ.key) return false;
        const baseURL = integ.baseUrl || (integ.type === 'stt_groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${baseURL}/models`, {
          headers: { Authorization: `Bearer ${integ.key}` },
          signal: controller.signal,
        });
        clearTimeout(timer);
        return response.ok;
      }

      if (integ.type === 'email') {
        return !!integ.extraConfig?.host;
      }

      return true;
    } catch {
      return false;
    }
  }

  getStatus(serviceType) {
    if (serviceType) {
      const list = this.integrations[serviceType] || [];
      return {
        type: serviceType,
        label: SERVICE_TYPES[serviceType]?.label || serviceType,
        total: list.length,
        healthy: list.filter(k => k.healthy).length,
        integrations: list.map(k => ({
          id: k.id, label: k.label, healthy: k.healthy, active: k.active,
          model: k.model, baseUrl: k.baseUrl ? k.baseUrl.replace(/\/\/[^@]+@/, '//***@') : '',
          lastUsed: k.lastUsed, lastError: k.lastError, consecutiveFailures: k.consecutiveFailures,
          lastHealthCheck: k.lastHealthCheck,
        })),
      };
    }

    const result = {};
    for (const [type, list] of Object.entries(this.integrations)) {
      result[type] = {
        label: SERVICE_TYPES[type]?.label || type,
        total: list.length,
        healthy: list.filter(k => k.healthy && k.active).length,
      };
    }
    return result;
  }

  getStatusDetailed() {
    const result = {};
    for (const type of Object.keys(SERVICE_TYPES)) {
      result[type] = this.getStatus(type);
    }
    return result;
  }

  async addIntegration(serviceType, apiKey, opts = {}) {
    if (!SERVICE_TYPES[serviceType]) throw new Error(`Unknown service type: ${serviceType}`);

    const {
      baseUrl = '', model = '', label = null, priority = 100, extraConfig = {},
    } = opts;

    const [result] = await pool.execute(
      'INSERT INTO api_keys (service_type, api_key, base_url, model, label, priority, is_active, extra_config) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      [serviceType, apiKey || '', baseUrl, model, label || `${SERVICE_TYPES[serviceType].label} #${Date.now()}`, priority, JSON.stringify(extraConfig)]
    );

    const integ = {
      id: result.insertId, type: serviceType, key: apiKey || '', baseUrl, model,
      label: label || `${SERVICE_TYPES[serviceType].label} #${result.insertId}`,
      priority, active: true, healthy: true, lastUsed: null, lastError: null,
      consecutiveFailures: 0, lastHealthCheck: null, rateLimitRemaining: null, extraConfig,
    };

    this.integrations[serviceType].push(integ);
    console.log(`[Integrations] Added ${SERVICE_TYPES[serviceType].label}: "${integ.label}"`);
    return { id: result.insertId, label: integ.label, type: serviceType };
  }

  async removeIntegration(keyId) {
    const found = this._findById(keyId);
    if (!found) throw new Error('Integration not found');

    await pool.execute('DELETE FROM api_keys WHERE id = ?', [keyId]);
    this.integrations[found.type] = this.integrations[found.type].filter(k => k.id !== keyId);
    console.log(`[Integrations] Removed ${found.label}`);
  }

  async toggleIntegration(keyId, isActive) {
    const found = this._findById(keyId);
    if (!found) throw new Error('Integration not found');

    await pool.execute('UPDATE api_keys SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, keyId]);
    found.active = !!isActive;
    console.log(`[Integrations] ${found.label} ${isActive ? 'enabled' : 'disabled'}`);
  }

  async updateIntegration(keyId, updates) {
    const found = this._findById(keyId);
    if (!found) throw new Error('Integration not found');

    const fields = [];
    const values = [];
    const allowed = ['service_type', 'api_key', 'base_url', 'model', 'label', 'priority', 'extra_config'];

    for (const [col, val] of Object.entries(updates)) {
      if (allowed.includes(col)) {
        fields.push(`${col} = ?`);
        values.push(col === 'extra_config' ? JSON.stringify(val) : val);
      }
    }
    if (fields.length === 0) return found;

    values.push(keyId);
    await pool.execute(`UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?`, values);

    if (updates.api_key !== undefined) found.key = updates.api_key;
    if (updates.base_url !== undefined) found.baseUrl = updates.base_url;
    if (updates.model !== undefined) found.model = updates.model;
    if (updates.label !== undefined) found.label = updates.label;
    if (updates.priority !== undefined) found.priority = updates.priority;
    if (updates.extra_config !== undefined) found.extraConfig = updates.extra_config;

    return found;
  }

  _findById(keyId) {
    for (const list of Object.values(this.integrations)) {
      const found = list.find(k => k.id === keyId);
      if (found) return found;
    }
    return null;
  }

  getIntegrationForEnv(serviceType) {
    return this.integrations[serviceType]?.filter(k => k.active && k.healthy) || [];
  }

  destroy() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }
}

function normalizeLLMResponse(data) {
  if (!data) return data;

  if (data.message && typeof data.message === 'object') {
    let toolCalls = data.message.tool_calls || data.tool_calls || null;
    if (!toolCalls && data.message.content && typeof data.message.content === 'string') {
      const inlineMatch = data.message.content.match(/\{"name"\s*:\s*"(\w+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\}/);
      if (inlineMatch) {
        try {
          toolCalls = [{ id: 'inline_0', function: { name: inlineMatch[1], arguments: inlineMatch[2] }, type: 'function' }];
          data.message.content = data.message.content.replace(inlineMatch[0], '').trim();
        } catch {}
      } else {
        const xmlMatch = data.message.content.match(/<minimax:tool_call>[\s\S]*?<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>[\s\S]*?<\/minimax:tool_call>/i) ||
                         data.message.content.match(/<tool_call>[\s\S]*?<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>[\s\S]*?<\/tool_call>/i);
        if (xmlMatch) {
          try {
            const funcName = xmlMatch[1];
            let funcArgsStr = xmlMatch[2].trim();
            if (!funcArgsStr || !funcArgsStr.startsWith('{')) {
              funcArgsStr = '{}';
            }
            toolCalls = [{ id: 'inline_0', function: { name: funcName, arguments: funcArgsStr }, type: 'function' }];
            data.message.content = data.message.content.replace(xmlMatch[0], '').trim();
          } catch {}
        }
      }
    }
    if (toolCalls?.length > 0) {
      return { message: { role: data.message.role || 'assistant', content: data.message.content || '', thinking: data.message.thinking || data.message.reasoning_content || '' }, tool_calls: toolCalls, done: data.done ?? true };
    }
    return data;
  }

  if (data.choices?.[0]?.message) {
    const msg = data.choices[0].message;
    let toolCalls = msg.tool_calls || data.tool_calls || null;
    if (!toolCalls && msg.content && typeof msg.content === 'string') {
      const inlineMatch = msg.content.match(/\{"name"\s*:\s*"(\w+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\}/);
      if (inlineMatch) {
        try {
          toolCalls = [{ id: 'inline_0', function: { name: inlineMatch[1], arguments: inlineMatch[2] }, type: 'function' }];
          msg.content = msg.content.replace(inlineMatch[0], '').trim();
        } catch {}
      } else {
        const xmlMatch = msg.content.match(/<minimax:tool_call>[\s\S]*?<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>[\s\S]*?<\/minimax:tool_call>/i) ||
                         msg.content.match(/<tool_call>[\s\S]*?<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>[\s\S]*?<\/tool_call>/i);
        if (xmlMatch) {
          try {
            const funcName = xmlMatch[1];
            let funcArgsStr = xmlMatch[2].trim();
            // If arguments is empty or not JSON, default to empty object
            if (!funcArgsStr || !funcArgsStr.startsWith('{')) {
              funcArgsStr = '{}';
            }
            toolCalls = [{ id: 'inline_0', function: { name: funcName, arguments: funcArgsStr }, type: 'function' }];
            msg.content = msg.content.replace(xmlMatch[0], '').trim();
          } catch {}
        }
      }
    }
    return {
      message: {
        role: msg.role || 'assistant',
        content: msg.content || '',
        thinking: msg.thinking || msg.reasoning_content || msg.thought || '',
      },
      tool_calls: toolCalls,
      done: data.done ?? true,
    };
  }

  if (data.content !== undefined && !data.message) {
    if (Array.isArray(data.content)) {
      const textBlocks = data.content.filter(b => b.type === 'text');
      const toolBlocks = data.content.filter(b => b.type === 'tool_use');
      let toolCalls = null;
      if (toolBlocks.length > 0) {
        toolCalls = toolBlocks.map((b, i) => ({ id: b.id || `tool_${i}`, function: { name: b.name, arguments: b.input ? JSON.stringify(b.input) : '{}' }, type: 'function' }));
      }
      return {
        message: { role: 'assistant', content: textBlocks.map(b => b.text).join(''), thinking: '' },
        tool_calls: toolCalls,
        done: data.stop_reason === 'end_turn' || data.stop_reason === 'tool_use',
      };
    }
    return {
      message: { role: 'assistant', content: data.content || '', thinking: '' },
      tool_calls: null,
      done: data.stop_reason === 'end_turn',
    };
  }

  return data;
}

const integrations = new IntegrationManager();

module.exports = integrations;