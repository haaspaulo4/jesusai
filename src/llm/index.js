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
  if (!data) return '';

  let message = data.message || data.choices?.[0]?.message || null;
  if (!message) {
    if (data.choices?.[0]?.text) return data.choices[0].text.trim();
    return '';
  }

  const content = (message.content || '').trim();
  if (content) return content;

  return '';
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
      const normalized = normalizeLLMResponse(data);

      if (normalized.tool_calls && normalized.tool_calls.length > 0) {
        return { message: normalized.message, tool_calls: normalized.tool_calls, done: normalized.done };
      }

      return normalized;
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
      if (trimmed === 'data: [DONE]') return;
      const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;

        try {
        const data = JSON.parse(dataStr);
        if (data.done) return;

        if (data.message) {
          const content = data.message.content || '';
          if (content) yield content;
          const thinking = data.message.thinking || data.message.reasoning_content || '';
          if (thinking && !content) yield thinking;
        }

        if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
          yield { type: 'tool_calls', tool_calls: data.message.tool_calls };
        }

        if (data.tool_calls && data.tool_calls.length > 0) {
          yield { type: 'tool_calls', tool_calls: data.tool_calls };
        }

        if (data.choices?.[0]?.delta) {
          const delta = data.choices[0].delta;
          const content = delta.content || '';
          if (content) yield content;
          const thinking = delta.reasoning_content || delta.thinking || '';
          if (thinking && !content) yield thinking;
          if (delta.tool_calls && delta.tool_calls.length > 0) {
            yield { type: 'tool_calls', tool_calls: delta.tool_calls };
          }
        }

        if (data.choices?.[0]?.message) {
          const msg = data.choices[0].message;
          const content = msg.content || '';
          if (content) yield content;
          const thinking = msg.reasoning_content || msg.thinking || '';
          if (thinking && !content) yield thinking;
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            yield { type: 'tool_calls', tool_calls: msg.tool_calls };
          }
        }

        if (data.choices?.[0]?.delta) {
          const delta = data.choices[0].delta;
          const content = delta.content || '';
          if (content) yield content;
          const thinking = delta.reasoning_content || delta.thinking || '';
          if (thinking && !content) yield thinking;
        }

        if (data.tool_calls && data.tool_calls.length > 0) {
          yield { type: 'tool_calls', tool_calls: data.tool_calls };
        }

        if (data.choices?.[0]?.delta?.tool_calls) {
          const tc = data.choices[0].delta.tool_calls;
          if (tc.length > 0) {
            yield { type: 'tool_calls', tool_calls: tc };
          }
        }

        if (data.choices?.[0]?.delta) {
          const delta = data.choices[0].delta;
          const content = delta.content || '';
          if (content) yield content;
          const thinking = delta.reasoning_content || delta.thinking || '';
          if (thinking && !content) yield thinking;
        }

        if (data.choices?.[0]?.message) {
          const msg = data.choices[0].message;
          const content = msg.content || '';
          if (content) yield content;
          const thinking = msg.reasoning_content || msg.thinking || '';
          if (thinking && !content) yield thinking;
        }
      } catch {
        continue;
      }
    }
  }
}

function parseDSML(content) {
  if (typeof content !== 'string') return null;
  const toolCalls = [];
  
  // DSML block match - looking for tag structures containing invoke
  const dsmlMatches = content.match(/<.*?DSML.*?tool_calls>([\s\S]*?)<\/.*?DSML.*?tool_calls>/gi) ||
                      [content]; // fallback to whole string search if block tags aren't perfectly present
                      
  for (const block of dsmlMatches) {
    const invokeRegex = /<.*?DSML.*?invoke\s+name="([^"]+)">([\s\S]*?)<\/.*?DSML.*?invoke>/gi;
    let invokeMatch;
    while ((invokeMatch = invokeRegex.exec(block)) !== null) {
      const funcName = invokeMatch[1];
      const invokeBody = invokeMatch[2];
      const args = {};

      const paramRegex = /<.*?DSML.*?parameter\s+name="([^"]+)"(?:\s+type="[^"]+")?(?:\s+string="[^"]+")?>([\s\S]*?)<\/.*?DSML.*?parameter>/gi;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(invokeBody)) !== null) {
        const paramName = paramMatch[1];
        const paramVal = paramMatch[2].trim();
        args[paramName] = paramVal;
      }

      toolCalls.push({
        id: `dsml_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        function: {
          name: funcName,
          arguments: typeof args === 'string' ? args : JSON.stringify(args)
        },
        type: 'function'
      });
    }
  }

  return toolCalls.length > 0 ? toolCalls : null;
}

function parseCustomToolCall(content) {
  if (typeof content !== 'string') return null;
  const matches = content.match(/\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/i) ||
                  content.match(/\{tool\s*=>[\s\S]*?\}/i);
  if (!matches) return null;
  
  const block = matches[0];
  const toolNameMatch = block.match(/tool\s*=>\s*"([^"]+)"/i) || block.match(/name\s*:\s*"([^"]+)"/i);
  if (!toolNameMatch) return null;
  
  const toolName = toolNameMatch[1];
  const args = {};
  
  // Extract --parameters
  const paramsRegex = /--(\w+)\s+(?:"([\s\S]*?)"|'([\s\S]*?)'|`([\s\S]*?)`|(\S+))/gi;
  let paramMatch;
  while ((paramMatch = paramsRegex.exec(block)) !== null) {
    const paramName = paramMatch[1];
    const paramValue = paramMatch[2] || paramMatch[3] || paramMatch[4] || paramMatch[5];
    args[paramName] = paramValue;
  }
  
  // Fallback for --task if it contains complex nested quotes
  if (toolName === 'execute_opencode_task' && !args.task) {
    const taskMatch = block.match(/--task\s+"([\s\S]*?)"\s*--/i) || 
                      block.match(/--task\s+"([\s\S]*?)"\s*\}/i) ||
                      block.match(/--task\s+([\s\S]*?)(?=\s+--|\s+\})/i);
    if (taskMatch) {
      args.task = taskMatch[1].trim();
    }
  }

  return [{
    id: `custom_${Date.now()}`,
    function: {
      name: toolName,
      arguments: JSON.stringify(args)
    },
    type: 'function'
  }];
}

function normalizeLLMResponse(data) {
  if (!data) return data;

  if (data.message && typeof data.message === 'object') {
    let toolCalls = data.message.tool_calls || data.tool_calls || null;
    if (!toolCalls && data.message.content && typeof data.message.content === 'string') {
      const dsmlToolCalls = parseDSML(data.message.content);
      if (dsmlToolCalls) {
        try {
          toolCalls = dsmlToolCalls;
          data.message.content = data.message.content
            .replace(/<.*?DSML.*?tool_calls>([\s\S]*?)<\/.*?DSML.*?tool_calls>/gi, '')
            .replace(/<.*?DSML.*?invoke[\s\S]*?<\/.*?DSML.*?invoke>/gi, '')
            .trim();
        } catch {}
      } else {
        const customToolCalls = parseCustomToolCall(data.message.content);
        if (customToolCalls) {
          try {
            toolCalls = customToolCalls;
            data.message.content = data.message.content
              .replace(/\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/gi, '')
              .replace(/\{tool\s*=>[\s\S]*?\}/gi, '')
              .trim();
          } catch {}
        } else {
          const inlineMatch = data.message.content.match(/\{"name"\s*:\s*"(\w+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\}/);
          if (inlineMatch) {
            try {
              toolCalls = [{ id: 'inline_0', function: { name: inlineMatch[1], arguments: inlineMatch[2] }, type: 'function' }];
              data.message.content = '';
            } catch {}
          }
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
      const dsmlToolCalls = parseDSML(msg.content);
      if (dsmlToolCalls) {
        try {
          toolCalls = dsmlToolCalls;
          msg.content = msg.content
            .replace(/<.*?DSML.*?tool_calls>([\s\S]*?)<\/.*?DSML.*?tool_calls>/gi, '')
            .replace(/<.*?DSML.*?invoke[\s\S]*?<\/.*?DSML.*?invoke>/gi, '')
            .trim();
        } catch {}
      } else {
        const customToolCalls = parseCustomToolCall(msg.content);
        if (customToolCalls) {
          try {
            toolCalls = customToolCalls;
            msg.content = msg.content
              .replace(/\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/gi, '')
              .replace(/\{tool\s*=>[\s\S]*?\}/gi, '')
              .trim();
          } catch {}
        } else {
          const inlineMatch = msg.content.match(/\{"name"\s*:\s*"(\w+)"[\s\S]*?"arguments"\s*:\s*(\{[\s\S]*?\})\}/);
          if (inlineMatch) {
            try {
              toolCalls = [{ id: 'inline_0', function: { name: inlineMatch[1], arguments: inlineMatch[2] }, type: 'function' }];
              msg.content = '';
            } catch {}
          }
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
    return {
      message: { role: 'assistant', content: data.content || '', thinking: '' },
      tool_calls: null,
      done: true,
    };
  }

  return data;
}

module.exports = {
  chat,
  parseStream,
  getConfig,
  getUserApiKey,
  extractContent,
  normalizeLLMResponse,
  OLLAMA_BASE_URL,
  OLLAMA_API_KEY,
  CHAT_MODEL,
};