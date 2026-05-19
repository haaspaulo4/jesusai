/**
 * @deprecated This module is DEPRECATED and NOT IMPORTED anywhere.
 * Use IntegrationManager (src/llm/integrationManager.js) instead.
 * This file is kept for reference only and will be removed in a future version.
 */
require('dotenv').config();
const { pool } = require('../db');
const { getSetting } = require('../settings');

class KeyManager {
  constructor() {
    this.keys = [];
    this.loaded = false;
    this.currentIndex = 0;
    this.keyStats = new Map();
    this.testing = false;
    this.healthInterval = null;
    this.onAllFailed = null;
    this.lastNotification = 0;
  }

  async load() {
    try {
      const [rows] = await pool.execute(
        'SELECT id, api_key, service_type as provider, base_url, model, label, priority, is_active FROM api_keys WHERE is_active = 1 ORDER BY priority ASC, id ASC'
      );

      const envUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
      const envModel = process.env.OLLAMA_MODEL || 'glm-5.1';

      this.keys = [];

      // Auto-detect multiple keys from .env (OLLAMA_API_KEY_1, _2, _3, etc.)
      const envKeys = Object.entries(process.env)
        .filter(([k]) => k.startsWith('OLLAMA_API_KEY_') && !k.includes('BASE_URL'))
        .sort(([a], [b]) => {
          const aNum = parseInt(a.split('_').pop());
          const bNum = parseInt(b.split('_').pop());
          return aNum - bNum;
        });

      if (envKeys.length > 0) {
        for (const [key, value] of envKeys) {
          const keyNum = key.split('_').pop();
          this.keys.push({
            id: `env_key_${keyNum}`,
            key: value,
            provider: 'ollama',
            baseUrl: process.env[`OLLAMA_BASE_URL_${keyNum}`] || envUrl,
            model: process.env[`OLLAMA_MODEL_${keyNum}`] || process.env.OLLAMA_MODEL || process.env[`CHAT_MODEL_${keyNum}`] || envModel,
            label: `Key ${keyNum} (env)`,
            priority: parseInt(keyNum),
            active: true,
            healthy: true,
            lastUsed: null,
            lastError: null,
            consecutiveFailures: 0,
            lastHealthCheck: null,
            rateLimitRemaining: null,
            usageCount: 0,
            source: 'env',
          });
        }
        console.log(`[KeyManager] Loaded ${envKeys.length} keys from .env`);
      }

      // Fallback: single OLLAMA_API_KEY (backwards compatibility)
      if (envKeys.length === 0 && process.env.OLLAMA_API_KEY) {
        this.keys.push({
          id: 'env_default',
          key: process.env.OLLAMA_API_KEY,
          provider: 'ollama',
          baseUrl: envUrl,
          model: envModel,
          label: 'Default (env)',
          priority: 0,
          active: true,
          healthy: true,
          lastUsed: null,
          lastError: null,
          consecutiveFailures: 0,
          lastHealthCheck: null,
          rateLimitRemaining: null,
          usageCount: 0,
          source: 'env',
        });
      }

      // Load keys from DB
      for (const row of rows) {
        if (this.keys.some(k => k.key === row.api_key)) continue;
        this.keys.push({
          id: `db_${row.id}`,
          key: row.api_key,
          provider: row.provider || 'ollama',
          baseUrl: row.base_url || envUrl,
          model: row.model || envModel,
          label: row.label || `Key ${row.id}`,
          priority: row.priority || 100,
          active: true,
          healthy: true,
          lastUsed: null,
          lastError: null,
          consecutiveFailures: 0,
          lastHealthCheck: null,
          rateLimitRemaining: null,
          usageCount: 0,
          source: 'db',
        });
      }

      if (this.keys.length === 0) {
      this.keys.push({
          id: 'free_tier',
          key: '',
          provider: 'ollama',
          baseUrl: envUrl,
          model: envModel,
          label: 'Free tier (no key)',
          priority: 999,
          active: true,
          healthy: true,
          lastUsed: null,
          lastError: null,
          consecutiveFailures: 0,
          lastHealthCheck: null,
          rateLimitRemaining: null,
          usageCount: 0,
          source: 'free',
        });
      }

      this.currentIndex = 0;
      this.loaded = true;

      const healthyCount = this.keys.filter(k => k.healthy).length;
      console.log(`[KeyManager] ${this.keys.length} key(s) loaded, ${healthyCount} healthy`);

      if (healthyCount === 0) {
        this._notifyAllFailed();
      }

      this._startHealthChecks();

      return this.keys;
    } catch (err) {
      console.error('[KeyManager] Load failed:', err.message);
      this._addFallbackFromEnv();
      return this.keys;
    }
  }

  _addFallbackFromEnv() {
  const envUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
  const envModel = process.env.OLLAMA_MODEL || 'glm-5.1';

    // Check for multi-key pattern
    const envKeys = Object.entries(process.env)
      .filter(([k]) => k.startsWith('OLLAMA_API_KEY_') && !k.includes('BASE_URL'))
      .sort(([a], [b]) => {
        const aNum = parseInt(a.split('_').pop());
        const bNum = parseInt(b.split('_').pop());
        return aNum - bNum;
      });

    if (envKeys.length > 0) return; // Keys already loaded

    if (!this.keys.some(k => k.id === 'env_default')) {
      this.keys.push({
        id: 'env_default',
        key: process.env.OLLAMA_API_KEY || '',
        provider: 'ollama',
        baseUrl: envUrl,
        model: envModel,
        label: 'Default (env fallback)',
        priority: 0,
        active: true,
        healthy: true,
        lastUsed: null,
        lastError: null,
        consecutiveFailures: 0,
        lastHealthCheck: null,
        rateLimitRemaining: null,
        usageCount: 0,
        source: 'env',
      });
    }
  }

  getStats() {
    return this.keys.map(k => ({
      id: k.id,
      label: k.label,
      healthy: k.healthy,
      active: k.active,
      usageCount: k.usageCount || 0,
      lastUsed: k.lastUsed,
      lastError: k.lastError,
      consecutiveFailures: k.consecutiveFailures,
      source: k.source,
    }));
  }

  async testKey(keyId) {
    const key = this.keys.find(k => k.id === keyId);
    if (!key) return { success: false, error: 'Key not found' };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${key.baseUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key.key ? { Authorization: `Bearer ${key.key}` } : {}),
          },
          body: JSON.stringify({
            model: key.model,
            messages: [{ role: 'user', content: 'Hi' }],
            stream: false,
            options: { temperature: 0.1, num_predict: 1 },
          }),
          signal: controller.signal,
        });

      clearTimeout(timer);

      if (response.ok) {
        key.healthy = true;
        key.consecutiveFailures = 0;
        return { success: true, status: response.status };
      } else {
        const err = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${err.substring(0, 100)}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getNextKey(userId) {
    if (!this.loaded) await this.load();

    let userKey = null;
    if (userId) {
      try {
        const [rows] = await pool.execute('SELECT ollama_api_key FROM users WHERE id = ?', [userId]);
        if (rows.length > 0 && rows[0].ollama_api_key) {
          userKey = {
            id: `user_${userId}`,
            key: rows[0].ollama_api_key,
            provider: 'ollama',
            baseUrl: this.keys[0]?.baseUrl || process.env.OLLAMA_BASE_URL || 'https://ollama.com/api',
            model: this.keys[0]?.model || process.env.OLLAMA_MODEL || 'glm-5.1',
            label: `User ${userId} key`,
            priority: -1,
            active: true,
            healthy: true,
            lastUsed: null,
            lastError: null,
            consecutiveFailures: 0,
            lastHealthCheck: null,
          };
        }
      } catch {}
    }

    const candidates = this.keys.filter(k => k.active && k.healthy);
    if (candidates.length === 0) {
      for (const k of this.keys) {
        k.consecutiveFailures = 0;
        k.healthy = true;
      }
      const reset = this.keys.filter(k => k.active);
      if (reset.length === 0) {
        this._addFallbackFromEnv();
      }
      return this.keys.find(k => k.active) || null;
    }

    if (userKey) return userKey;

    candidates.sort((a, b) => a.priority - b.priority);

    const now = Date.now();
    
    // Load balancing: pick key with lowest usage count first
    candidates.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
    
    const roundRobin = candidates.filter(k => !k.lastUsed || now - k.lastUsed > 1000);
    if (roundRobin.length > 0) {
      const picked = roundRobin[0];
      picked.lastUsed = now;
      picked.usageCount = (picked.usageCount || 0) + 1;
      return picked;
    }
    
    // All recently used - pick least used
    const picked = candidates[0];
    picked.lastUsed = now;
    picked.usageCount = (picked.usageCount || 0) + 1;
    return picked;

    return candidates[0];
  }

  async callWithFallback(messages, options = {}) {
    if (!this.loaded) await this.load();

    const failover = options.failover !== false;
    const maxRetries = options.retries ?? parseInt(await getSetting('llm_max_retries', '3'));
    const timeout = options.timeout ?? parseInt(await getSetting('llm_timeout', '30000'));
    const stream = options.stream ?? false;
    const tools = options.tools ?? null;

    const tried = new Set();
    let lastErr = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const key = await this.getNextKey(options.userId);

      if (!key) {
        this._notifyAllFailed();
        throw new Error('Nenhuma API key disponível. Adicione chaves em /api/admin/keys ou configure OLLAMA_API_KEY no .env');
      }

      if (tried.has(key.id) && tried.size >= this.keys.filter(k => k.active).length) {
        break;
      }
      tried.add(key.id);

      try {
        const body = {
          model: options.model || key.model,
          messages,
          stream,
          options: {
            temperature: options.temperature ?? parseFloat(await getSetting('temperature', '0.7')),
            num_predict: options.numPredict ?? parseInt(await getSetting('max_tokens', '4096')),
          },
        };

        if (tools && tools.length > 0) {
          body.tools = tools;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${key.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key.key ? { Authorization: `Bearer ${key.key}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 429) {
          const err = await response.text().catch(() => '');
          key.consecutiveFailures++;
          key.lastError = `429 rate limit: ${err.substring(0, 200)}`;
          key.healthy = false;

          setTimeout(() => {
            key.healthy = true;
            key.consecutiveFailures = 0;
          }, 60000);

          if (!failover) {
            throw new Error('Rate limit atingido. Tente novamente em alguns segundos.');
          }

          console.warn(`[KeyManager] Key "${key.label}" rate limited (429), trying next...`);
          lastErr = new Error('Rate limit atingido. Tente novamente em alguns segundos.');
          continue;
        }

        // Handle 403 - subscription required (key needs paid plan)
        if (response.status === 403) {
          const errText = await response.text().catch(() => '');
          key.consecutiveFailures++;
          key.lastError = `403 Forbidden: ${errText.substring(0, 200)}`;
          key.healthy = false;
          
          // Mark as permanently dead - don't retry this key for a long time (24 hours)
          console.warn(`[KeyManager] Key "${key.label}" requires subscription (403) - marking as dead for 24h`);
          
          setTimeout(() => {
            key.healthy = true;
            key.consecutiveFailures = 0;
            console.log(`[KeyManager] Key "${key.label}" re-enabled after 24h cooldown`);
          }, 86400000); // 24 hours
          
          if (failover) {
            lastErr = new Error(`Key "${key.label}" requer assinatura paid. Tentando próxima...`);
            continue;
          }
          throw new Error(`403: Esta key requer assinatura do Ollama. Use uma key diferente.`);
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          key.consecutiveFailures++;
          key.lastError = `HTTP ${response.status}: ${errText.substring(0, 200)}`;

          if (key.consecutiveFailures >= 3) {
            key.healthy = false;
            console.warn(`[KeyManager] Key "${key.label}" marked unhealthy after ${key.consecutiveFailures} failures`);
            setTimeout(() => {
              key.healthy = true;
              key.consecutiveFailures = 0;
              console.log(`[KeyManager] Key "${key.label}" restored`);
            }, 300000);
          }

          if (response.status >= 500 && failover) {
            console.warn(`[KeyManager] Key "${key.label}" server error (${response.status}), trying next...`);
            lastErr = new Error(`API error ${response.status}: ${errText.substring(0, 200)}`);
            continue;
          }

          throw new Error(`API error ${response.status}: ${errText.substring(0, 500)}`);
        }

        if (response.status === 200 || response.status === 201) {
          key.consecutiveFailures = 0;
          key.healthy = true;
          key.lastUsed = Date.now();

          const remaining = response.headers.get('x-ratelimit-remaining');
          if (remaining) {
            key.rateLimitRemaining = parseInt(remaining);
            if (key.rateLimitRemaining < 10) {
              console.warn(`[KeyManager] Key "${key.label}" low rate limit: ${key.rateLimitRemaining} remaining`);
            }
          }
        }

        if (stream) return response;

        const data = await response.json();

        if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
          return { message: data.message, tool_calls: data.message.tool_calls, done: data.done ?? true };
        }

        if (data.tool_calls && data.tool_calls.length > 0) {
          return { message: data.message, tool_calls: data.tool_calls, done: data.done ?? true };
        }

        return data;

      } catch (err) {
        key.consecutiveFailures++;

        if (err.name === 'AbortError') {
          key.lastError = 'Timeout';
          if (failover) {
            console.warn(`[KeyManager] Key "${key.label}" timed out, trying next...`);
            lastErr = new Error('Tempo esgotado. O servidor demorou para responder.');
            continue;
          }
          throw new Error('Tempo esgotado. O servidor demorou para responder.');
        }

        key.lastError = err.message;

        if (failover && key.consecutiveFailures < 3) {
          console.warn(`[KeyManager] Key "${key.label}" failed: ${err.message}, trying next...`);
          lastErr = err;
          continue;
        }

        throw err;
      }
    }

    const allUnhealthy = this.keys.every(k => !k.healthy);
    if (allUnhealthy) this._notifyAllFailed();

    throw lastErr || new Error('Todas as API keys falharam. Adicione novas chaves em /api/admin/keys');
  }

  _notifyAllFailed() {
    const now = Date.now();
    if (now - this.lastNotification < 300000) return;
    this.lastNotification = now;

    console.error('[KeyManager] ⚠️  TODAS AS API KEYS FALHARAM!');
    console.error('[KeyManager] Adicione novas chaves via /api/admin/keys ou OLLAMA_API_KEY no .env');

    if (this.onAllFailed && typeof this.onAllFailed === 'function') {
      this.onAllFailed(this.keys);
    }
  }

  _startHealthChecks() {
    if (this.healthInterval) clearInterval(this.healthInterval);

    this.healthInterval = setInterval(async () => {
      await this._checkHealth();
    }, 120000);

    setTimeout(() => this._checkHealth(), 10000);
  }

  async _checkHealth() {
    if (this.testing) return;
    this.testing = true;

    let stateChanged = false;

    for (const key of this.keys) {
      if (!key.active) continue;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${key.baseUrl}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key.key ? { Authorization: `Bearer ${key.key}` } : {}),
          },
          body: JSON.stringify({
            model: key.model,
            messages: [{ role: 'user', content: 'ok' }],
            stream: false,
            options: { temperature: 0.1, num_predict: 1 },
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        const wasHealthy = key.healthy;

        if (response.ok) {
          key.healthy = true;
          key.consecutiveFailures = 0;
          key.lastHealthCheck = new Date().toISOString();
        } else if (response.status === 429) {
          key.healthy = false;
          key.lastError = `429 rate limited`;
          key.lastHealthCheck = new Date().toISOString();
        } else {
          key.healthy = false;
          const errText = await response.text().catch(() => '');
          key.lastError = `HTTP ${response.status}: ${errText.substring(0, 100)}`;
          key.lastHealthCheck = new Date().toISOString();
        }

        if (wasHealthy !== key.healthy) stateChanged = true;

      } catch (err) {
        const wasHealthy = key.healthy;
        key.healthy = false;
        key.lastError = err.message;
        key.lastHealthCheck = new Date().toISOString();
        if (wasHealthy) stateChanged = true;
      }
    }

    this.testing = false;

    if (stateChanged) {
      const status = this.keys.map(k => `[${k.healthy ? '✓' : '✗'}] ${k.label}: ${k.healthy ? 'OK' : k.lastError?.substring(0, 80) || 'unhealthy'}`).join('\n');
      console.log(`[KeyManager] Health check:\n${status}`);
    }

    const healthy = this.keys.filter(k => k.healthy).length;
    if (healthy === 0) this._notifyAllFailed();
  }

  getStatus() {
    return {
      total: this.keys.length,
      healthy: this.keys.filter(k => k.healthy).length,
      keys: this.keys.map(k => ({
        id: k.id,
        label: k.label,
        provider: k.provider,
        model: k.model,
        healthy: k.healthy,
        lastUsed: k.lastUsed,
        lastError: k.lastError,
        consecutiveFailures: k.consecutiveFailures,
        lastHealthCheck: k.lastHealthCheck,
        rateLimitRemaining: k.rateLimitRemaining,
      })),
    };
  }

  async addKey(apiKey, opts = {}) {
    const {
      provider = 'ollama',
      baseUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api',
      model = process.env.OLLAMA_MODEL || 'glm-5.1',
      label = null,
      priority = 100,
    } = opts;

    const [result] = await pool.execute(
      'INSERT INTO api_keys (api_key, provider, base_url, model, label, priority, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [apiKey, provider, baseUrl, model, label || `Key ${Date.now()}`, priority]
    );

    this.keys.push({
      id: result.insertId,
      key: apiKey,
      provider,
      baseUrl,
      model,
      label: label || `Key ${result.insertId}`,
      priority,
      active: true,
      healthy: true,
      lastUsed: null,
      lastError: null,
      consecutiveFailures: 0,
      lastHealthCheck: null,
      rateLimitRemaining: null,
    });

    console.log(`[KeyManager] Added key "${label || result.insertId}" (provider: ${provider})`);
    return { id: result.insertId, label: label || `Key ${result.insertId}` };
  }

  async removeKey(keyId) {
    await pool.execute('DELETE FROM api_keys WHERE id = ?', [keyId]);
    this.keys = this.keys.filter(k => k.id !== keyId);
    console.log(`[KeyManager] Removed key ${keyId}`);
  }

  async toggleKey(keyId, isActive) {
    await pool.execute('UPDATE api_keys SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, keyId]);
    const key = this.keys.find(k => k.id === keyId);
    if (key) key.active = !!isActive;
    console.log(`[KeyManager] Key ${keyId} ${isActive ? 'enabled' : 'disabled'}`);
  }

  async updateKey(keyId, updates) {
    const fields = [];
    const values = [];
    for (const [col, val] of Object.entries(updates)) {
      if (['provider', 'base_url', 'model', 'label', 'priority'].includes(col)) {
        fields.push(`${col} = ?`);
        values.push(val);
      }
    }
    if (fields.length === 0) return;

    values.push(keyId);
    await pool.execute(`UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?`, values);

    const key = this.keys.find(k => k.id === keyId);
    if (key) {
      if (updates.provider) key.provider = updates.provider;
      if (updates.base_url) key.baseUrl = updates.base_url;
      if (updates.model) key.model = updates.model;
      if (updates.label) key.label = updates.label;
      if (updates.priority !== undefined) key.priority = updates.priority;
    }
  }

  destroy() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }
}

const keyManager = new KeyManager();

module.exports = keyManager;