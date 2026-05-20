const { pool } = require('../db');

class UsageTracker {
  constructor() {
    this.cache = new Map();
  }

  async track(tenantId, model, usage, provider, requestType = 'chat') {
    const today = new Date().toISOString().split('T')[0];
    const key = `${tenantId}:${model}:${today}`;
    
    const existing = this.cache.get(key) || { prompt_tokens: 0, completion_tokens: 0, requests: 0, cost: 0 };
    existing.prompt_tokens += usage.prompt_tokens || 0;
    existing.completion_tokens += usage.completion_tokens || 0;
    existing.requests += 1;
    existing.cost += this.estimateCost(model, usage, provider);
    this.cache.set(key, existing);

    try {
      await pool.execute(
        `INSERT INTO ai_usage_logs (tenant_id, model, provider, request_type, prompt_tokens, completion_tokens, cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE prompt_tokens = prompt_tokens + VALUES(prompt_tokens),
         completion_tokens = completion_tokens + VALUES(completion_tokens),
         cost = cost + VALUES(cost), requests = requests + 1`,
        [tenantId || 'default', model, provider, requestType, usage.prompt_tokens || 0, usage.completion_tokens || 0, existing.cost]
      );
    } catch (err) {
      console.error('[UsageTracker] Failed to log:', err.message);
    }
  }

  async getDailyUsage(tenantId, model) {
    const today = new Date().toISOString().split('T')[0];
    const key = `${tenantId}:${model}:${today}`;
    return this.cache.get(key) || { prompt_tokens: 0, completion_tokens: 0, requests: 0, cost: 0 };
  }

  estimateCost(model, usage, provider) {
    const prices = {
      'gpt-4o': { prompt: 0.0025, completion: 0.01 },
      'gpt-4o-mini': { prompt: 0.00015, completion: 0.0006 },
      'llama-3.3-70b-versatile': { prompt: 0, completion: 0 },
      'glm-5.1': { prompt: 0, completion: 0 },
      'mixtral-8x7b': { prompt: 0, completion: 0 },
    };
    const p = prices[model] || { prompt: 0.0001, completion: 0.0003 };
    return (usage.prompt_tokens || 0) * p.prompt / 1000 + (usage.completion_tokens || 0) * p.completion / 1000;
  }
}

const tracker = new UsageTracker();

class AiGateway {
  constructor(integrationManager) {
    this.im = integrationManager;
    this.rateLimits = new Map();
  }

  async chat(messages, options = {}) {
    const { tenantId = 'default', model: preferredModel, temperature = 0.7, maxTokens = 4096, tools, stream = false, timeout = 30000 } = options;
    const serviceTypes = ['llm_groq', 'llm'];
    let lastErr = null;

    for (const st of serviceTypes) {
      const integrations = this.im.integrations[st] || [];
      if (!integrations.length) continue;

      const sorted = [...integrations].filter(i => i.active && i.healthy).sort((a, b) => a.priority - b.priority);

      for (const integ of sorted) {
        if (preferredModel && integ.model !== preferredModel) continue;

        if (!this.checkDailyLimit(tenantId, integ.model, st)) {
          console.log(`[AiGateway] Daily limit reached for ${integ.model}`);
          continue;
        }

        try {
          const result = await this.callModel(integ, messages, { temperature, maxTokens, tools, stream, timeout });
          await tracker.track(tenantId, integ.model, result.usage || {}, st, options.requestType || 'chat');
          this.updateLastUsed(integ, st);
          return { ...result, provider: st, model: integ.model };
        } catch (err) {
          this.recordFailure(integ, st, err.message);
          lastErr = err;
          console.warn(`[AiGateway] ${integ.label} failed: ${err.message}`);
        }
      }
    }

    throw lastErr || new Error('No AI model available');
  }

  async callModel(integ, messages, options) {
    const { temperature, maxTokens, tools, stream, timeout } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const isOllama = integ.baseUrl?.includes('ollama.com') || integ.baseUrl?.includes(':11434');
    const endpoint = isOllama ? '/chat' : '/chat/completions';

    const body = isOllama
      ? { model: options.model || integ.model, messages, stream, options: { temperature, num_predict: maxTokens } }
      : { model: options.model || integ.model, messages, temperature, max_tokens: maxTokens, stream };

    if (tools?.length) body.tools = tools;

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

    if (response.status === 429) throw new Error('Rate limited');
    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`API ${response.status}: ${err.substring(0, 200)}`);
    }

    if (stream) return response;

    const data = await response.json();
    const normalized = normalizeLLMResponse(data);
    const usage = this.extractUsage(data, normalized);
    return { message: normalized.message || normalized, tool_calls: normalized.tool_calls, done: normalized.done, usage };
  }

  extractUsage(data, normalized) {
    let prompt_tokens = 0, completion_tokens = 0;
    if (data.usage) {
      prompt_tokens = data.usage.prompt_tokens || 0;
      completion_tokens = data.usage.completion_tokens || 0;
    } else if (data.message?.usage) {
      prompt_tokens = data.message.usage.prompt_tokens || 0;
      completion_tokens = data.message.usage.completion_tokens || 0;
    }
    return { prompt_tokens, completion_tokens };
  }

  checkDailyLimit(tenantId, model, serviceType) {
    const key = `${tenantId}:${model}`;
    const limit = this.rateLimits.get(key);
    if (!limit) return true;
    const used = tracker.getDailyUsage(tenantId, model);
    return used.cost < limit;
  }

  setDailyLimit(tenantId, model, limit) {
    this.rateLimits.set(`${tenantId}:${model}`, limit);
  }

  updateLastUsed(integ, serviceType) {
    integ.lastUsed = Date.now();
    integ.consecutiveFailures = 0;
    integ.lastError = null;
  }

  recordFailure(integ, serviceType, error) {
    integ.consecutiveFailures++;
    integ.lastError = error;
    integ.lastHealthCheck = Date.now();
    if (integ.consecutiveFailures >= 3) {
      integ.healthy = false;
      console.warn(`[AiGateway] Marking ${integ.label} as unhealthy`);
    }
  }
}

function normalizeLLMResponse(data) {
  if (data.message) return data;
  if (data.choices?.length) return data.choices[0].message;
  return data;
}

module.exports = { AiGateway, UsageTracker, tracker };