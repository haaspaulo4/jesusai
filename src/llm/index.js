const { pool } = require('../db');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const CHAT_MODEL = process.env.CHAT_MODEL || 'glm-5.1';

async function getUserApiKey(userId) {
  if (!userId) return null;
  try {
    const [rows] = await pool.execute('SELECT ollama_api_key FROM users WHERE id = ?', [userId]);
    return rows.length > 0 ? rows[0].ollama_api_key : null;
  } catch {
    return null;
  }
}

function getConfig(userId, userKey) {
  const apiKey = userKey || OLLAMA_API_KEY;
  return { baseUrl: OLLAMA_BASE_URL, apiKey, model: CHAT_MODEL };
}

function extractContent(data) {
  if (!data || !data.message) return '';
  const content = data.message.content || '';
  const thinking = data.message.thinking || '';
  if (content.trim()) return content.trim();
  if (thinking.trim()) return thinking.trim();
  return (content + thinking).trim();
}

async function chat(messages, options = {}) {
  const {
    userId = null,
    stream = false,
    temperature = 0.7,
    numPredict = 4096,
    retries = 2,
    timeout = 30000,
    tools = null,
  } = options;

  let apiKey = OLLAMA_API_KEY;
  if (userId) {
    const key = await getUserApiKey(userId);
    if (key) apiKey = key;
  }

  const body = {
    model: CHAT_MODEL,
    messages,
    stream,
    options: { temperature, num_predict: numPredict },
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${OLLAMA_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`API error ${response.status}: ${errText}`);

        if (response.status === 429) {
          throw lastError;
        }

        if (response.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }

      if (stream) {
        return response;
      }

      const data = await response.json();

      if (data.tool_calls && data.tool_calls.length > 0) {
        return { message: data.message, tool_calls: data.tool_calls, done: data.done };
      }

      return data;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        lastError = new Error('Tempo esgotado. O servidor demorou muito para responder.');
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError;
}

async function* parseStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const data = JSON.parse(trimmed);
        if (data.done) return;
        if (data.message) {
          const content = data.message.content || data.message.thinking || '';
          if (content) yield content;
        }
        if (data.tool_calls && data.tool_calls.length > 0) {
          yield { type: 'tool_calls', tool_calls: data.tool_calls };
        }
      } catch {
        continue;
      }
    }
  }
}

module.exports = {
  chat,
  parseStream,
  getConfig,
  getUserApiKey,
  extractContent,
  OLLAMA_BASE_URL,
  OLLAMA_API_KEY,
  CHAT_MODEL,
};