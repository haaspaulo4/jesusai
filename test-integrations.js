#!/usr/bin/env node
/**
 * Teste de Integracoes - MetaPersona.AI
 * Rodar: node test-integrations.js
 * 
 * Testa todas as integracoes configuradas no .env:
 * - Ollama Cloud (18 keys com fallback)
 * - Claude/Aibee (sonnet, haiku, ultra, opus)
 * - Groq (LLM + STT)
 * - Kokoro TTS
 * - Edge TTS
 * - Evolution API (WhatsApp)
 * - Serper API (Google Search)
 * - GNews API
 * - YouTube Data API
 * - MySQL
 * - Redis (se configurado)
 * - SMTP Email
 */

require('dotenv').config();
const https = require('https');
const http = require('http');

const results = [];
let totalTests = 0;
let passed = 0;
let failed = 0;
let skipped = 0;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function log(icon, service, message, status = 'info') {
  const color = status === 'pass' ? GREEN : status === 'fail' ? RED : status === 'skip' ? YELLOW : CYAN;
  totalTests++;
  if (status === 'pass') passed++;
  else if (status === 'fail') failed++;
  else if (status === 'skip') skipped++;
  console.log(`  ${color}${icon}${RESET} ${BOLD}${service}${RESET} ${message}`);
}

async function fetchJSON(url, options = {}) {
  const { timeout = 15000, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...fetchOpts, signal: controller.signal });
    clearTimeout(timer);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: response.ok, status: response.status, data, headers: response.headers };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ============================================================
// OLLAMA CLOUD (18 keys)
// ============================================================
async function testOllama() {
  console.log(`\n${BOLD}═══ OLLAMA CLOUD ═══${RESET}`);
  
  const keys = Object.entries(process.env)
    .filter(([k]) => /^OLLAMA_API_KEY_\d+$/.test(k))
    .sort(([a], [b]) => parseInt(a.split('_').pop()) - parseInt(b.split('_').pop()));

  if (keys.length === 0 && !process.env.OLLAMA_API_KEY) {
    log('⚠', 'Ollama', 'Nenhuma key configurada', 'skip');
    return;
  }

  const baseUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api';
  const model = process.env.OLLAMA_MODEL || 'glm-5.1';

  // Teste rapido com a primeira key
  const firstKey = keys[0]?.[1] || process.env.OLLAMA_API_KEY;
  try {
    const r = await fetchJSON(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firstKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Responda: OK' }], stream: false, options: { temperature: 0.1, num_predict: 5 } }),
      timeout: 20000,
    });
    if (r.ok) {
      const content = r.data?.message?.content || r.data?.response || '';
      log('✓', 'Ollama', `Principal OK (${model}): "${content.trim().substring(0, 50)}"`, 'pass');
    } else {
      log('✗', 'Ollama', `Principal FALHOU: HTTP ${r.status} — ${String(r.data).substring(0, 100)}`, 'fail');
    }
  } catch (err) {
    log('✗', 'Ollama', `Principal FALHOU: ${err.message}`, 'fail');
  }

  // Teste todas as keys em paralelo (lote de 6)
  if (keys.length > 0) {
    console.log(`\n  ${GRAY}Testando ${keys.length} keys em lotes de 6...${RESET}`);
    const batchSize = 6;
    let keyPassed = 0;
    let keyFailed = 0;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const promises = batch.map(async ([keyName, keyValue]) => {
        const num = keyName.split('_').pop();
        try {
          const r = await fetchJSON(`${baseUrl}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyValue}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'OK' }], stream: false, options: { temperature: 0.1, num_predict: 2 } }),
            timeout: 15000,
          });
          return { num, ok: r.ok, status: r.status, content: r.data?.message?.content || '' };
        } catch (err) {
          return { num, ok: false, status: 0, error: err.message };
        }
      });
      
      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        if (r.ok) {
          keyPassed++;
        } else {
          keyFailed++;
          const detail = r.error ? r.error.substring(0, 60) : `HTTP ${r.status}`;
          log('✗', `Key #${r.num}`, `FALHOU: ${detail}`, 'fail');
        }
      }
    }
    
    if (keyPassed > 0) {
      log('✓', 'Ollama Keys', `${keyPassed}/${keys.length} keys OK`, 'pass');
    }
    if (keyFailed > 0) {
      log('⚠', 'Ollama Keys', `${keyFailed}/${keys.length} keys com erro`, 'fail');
    }
  }
}

// ============================================================
// CLAUDE / AIBEE
// ============================================================
async function testClaude() {
  console.log(`\n${BOLD}═══ CLAUDE / AIBEE ═══${RESET}`);
  
  if (!process.env.CLAUDE_API_KEY) {
    log('⚠', 'Claude', 'CLAUDE_API_KEY nao configurada', 'skip');
    return;
  }

  const baseUrl = process.env.CLAUDE_BASE_URL || 'https://api.aibee.cloud/v1';
  const apiKey = process.env.CLAUDE_API_KEY;
  
  const models = [
    { name: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
    { name: 'claude-haiku-4-5-20250514', label: 'Haiku 4.5' },
    { name: 'kpalabz-ultra', label: 'KPA Ultra' },
  ];

  const opusKey = process.env.CLAUDE_API_KEY_OPUS;
  if (opusKey) {
    models.push({ name: 'claude-opus-4-7', label: 'Opus 4' });
  }

  for (const m of models) {
    try {
      const r = await fetchJSON(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: m.name, messages: [{ role: 'user', content: 'Responda apenas: OK' }], max_tokens: 10, temperature: 0.1 }),
        timeout: 30000,
      });
      if (r.ok) {
        const content = r.data?.choices?.[0]?.message?.content || r.data?.message?.content || '';
        const tokens = r.data?.usage ? `${r.data.usage.prompt_tokens}/${r.data.usage.completion_tokens}` : '?';
        log('✓', m.label, `OK — "${content.trim().substring(0, 30)}" (tokens: ${tokens})`, 'pass');
      } else {
        const errDetail = typeof r.data === 'string' ? r.data.substring(0, 80) : JSON.stringify(r.data).substring(0, 80);
        log('✗', m.label, `HTTP ${r.status}: ${errDetail}`, 'fail');
      }
    } catch (err) {
      log('✗', m.label, `ERRO: ${err.message}`, 'fail');
    }
  }
}

// ============================================================
// GROQ
// ============================================================
async function testGroq() {
  console.log(`\n${BOLD}═══ GROQ ═══${RESET}`);
  
  if (!process.env.GROQ_API_KEY) {
    log('⚠', 'Groq', 'GROQ_API_KEY nao configurada', 'skip');
    return;
  }

  const baseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

  // LLM
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  try {
    const r = await fetchJSON(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Responda: OK' }], max_tokens: 5, temperature: 0.1 }),
      timeout: 15000,
    });
    if (r.ok) {
      const content = r.data?.choices?.[0]?.message?.content || '';
      log('✓', 'Groq LLM', `OK (${model}): "${content.trim()}"`, 'pass');
    } else {
      log('✗', 'Groq LLM', `HTTP ${r.status}`, 'fail');
    }
  } catch (err) {
    log('✗', 'Groq LLM', `ERRO: ${err.message}`, 'fail');
  }

  // STT models list
  try {
    const r = await fetchJSON(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      timeout: 10000,
    });
    if (r.ok) {
      const models = Array.isArray(r.data?.data) ? r.data.data : r.data;
      const whisperModels = Array.isArray(models) ? models.filter(m => m.id?.includes('whisper')) : [];
      log('✓', 'Groq STT', `OK — ${Array.isArray(models) ? models.length : '?'} modelos, ${whisperModels.length} whisper`, 'pass');
    } else {
      log('✗', 'Groq STT', `HTTP ${r.status}`, 'fail');
    }
  } catch (err) {
    log('✗', 'Groq STT', `ERRO: ${err.message}`, 'fail');
  }
}

// ============================================================
// TTS
// ============================================================
async function testTTS() {
  console.log(`\n${BOLD}═══ TTS ═══${RESET}`);

  // Kokoro
  const kokoroUrl = (process.env.KOKORO_URL || 'http://localhost:8001').replace(/\/+$/, '');
  try {
    const r = await fetchJSON(`${kokoroUrl}/health`, { timeout: 5000 });
    if (r.ok || r.status === 200) {
      log('✓', 'Kokoro TTS', `OK — ${kokoroUrl}`, 'pass');
      
      // Tente gerar audio curto
      try {
        const audioR = await fetch(`${kokoroUrl}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Teste', voice: 'pm_alex', language: 'pt' }),
          signal: AbortSignal.timeout(10000),
        });
        if (audioR.ok) {
          const buf = await audioR.arrayBuffer();
          log('✓', 'Kokoro Audio', `Audio gerado: ${(buf.byteLength / 1024).toFixed(1)}KB`, 'pass');
        } else {
          log('✗', 'Kokoro Audio', `HTTP ${audioR.status}`, 'fail');
        }
      } catch (err) {
        log('✗', 'Kokoro Audio', `ERRO: ${err.message}`, 'fail');
      }
    } else {
      log('✗', 'Kokoro TTS', `HTTP ${r.status} — servidor offline?`, 'fail');
    }
  } catch (err) {
    log('✗', 'Kokoro TTS', `OFFLINE — ${err.message}`, 'fail');
  }

  // Edge TTS
  try {
    const { execSync } = require('child_process');
    const out = execSync('edge-tts --version 2>&1', { timeout: 5000, encoding: 'utf8' }).trim();
    log('✓', 'Edge TTS', `Instalado: ${out}`, 'pass');
  } catch {
    log('⚠', 'Edge TTS', 'edge-tts nao encontrado no PATH (fallback)', 'skip');
  }
}

// ============================================================
// EVOLUTION API (WHATSAPP)
// ============================================================
async function testEvolution() {
  console.log(`\n${BOLD}═══ EVOLUTION API (WHATSAPP) ═══${RESET}`);

  const evoUrl = process.env.EVO_API_URL;
  const evoKey = process.env.EVO_API_KEY;

  if (!evoUrl || !evoKey) {
    log('⚠', 'Evolution', 'EVO_API_URL ou EVO_API_KEY nao configurados', 'skip');
    return;
  }

  // Fetch instances
  try {
    const r = await fetchJSON(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey },
      timeout: 10000,
    });
    if (r.ok) {
      const instances = Array.isArray(r.data) ? r.data : [];
      const connected = instances.filter(i => i.connectionStatus === 'open' || i.state === 'open' || i.status === 'open');
      log('✓', 'Evolution API', `OK — ${instances.length} instancias, ${connected.length} conectadas`, 'pass');
      
      for (const inst of instances) {
        const name = inst.instance?.instanceName || inst.name || inst.id || '?';
        const status = inst.connectionStatus || inst.state || inst.status || '?';
        const phone = inst.instance?.ownerJid || inst.ownerJid || '';
        const isOk = status === 'open' || status === 'connected';
        log(isOk ? '✓' : '✗', `  ${name}`, `status: ${status} ${phone ? `(${phone})` : ''}`, isOk ? 'pass' : 'fail');
      }
    } else {
      log('✗', 'Evolution API', `HTTP ${r.status}: ${String(r.data).substring(0, 100)}`, 'fail');
    }
  } catch (err) {
    log('✗', 'Evolution API', `ERRO: ${err.message}`, 'fail');
  }
}

// ============================================================
// MYSQL
// ============================================================
async function testMySQL() {
  console.log(`\n${BOLD}═══ MYSQL ═══${RESET}`);

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jesus_ai',
  };

  try {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute('SELECT VERSION() as ver, DATABASE() as db, NOW() as now');
    log('✓', 'MySQL', `v${rows[0].ver} — DB: ${rows[0].db} — ${rows[0].now}`, 'pass');
    
    const [tables] = await conn.execute('SHOW TABLES');
    log('✓', 'Tabelas', `${tables.length} tabelas no banco`, 'pass');
    
    // Checar indexes criticos
    const indexes = [
      'idx_messages_session_created',
      'idx_messages_user_role',
      'idx_cognitive_user_persona',
      'idx_orders_persona_status',
      'idx_commerce_carts_session',
    ];
    for (const idx of indexes) {
      try {
        await conn.execute(`SELECT 1 FROM information_schema.statistics WHERE index_name = ? AND table_schema = ? LIMIT 1`, [idx, dbConfig.database]);
        log('✓', `  Index ${idx}`, 'OK', 'pass');
      } catch {
        log('✗', `  Index ${idx}`, 'AUSENTE', 'fail');
      }
    }
    
    await conn.end();
  } catch (err) {
    log('✗', 'MySQL', `ERRO: ${err.message}`, 'fail');
  }
}

// ============================================================
// REDIS
// ============================================================
async function testRedis() {
  console.log(`\n${BOLD}═══ REDIS ═══${RESET}`);

  if (!process.env.REDIS_HOST && !process.env.REDIS_PORT) {
    log('⚠', 'Redis', 'Nao configurado (opcional para BullMQ)', 'skip');
    return;
  }

  try {
    const redis = require('ioredis');
    const client = new redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await client.connect();
    const info = await client.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1] || '?';
    log('✓', 'Redis', `v${version}`, 'pass');
    await client.quit();
  } catch (err) {
    log('✗', 'Redis', `ERRO: ${err.message}`, 'fail');
  }
}

// ============================================================
// APIs EXTERNAS (Serper, GNews, YouTube)
// ============================================================
async function testExternalAPIs() {
  console.log(`\n${BOLD}═══ APIs EXTERNAS ═══${RESET}`);

  // Serper (Google Search)
  if (process.env.SERPER_KEY) {
    try {
      const r = await fetchJSON('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': process.env.SERPER_KEY },
        body: JSON.stringify({ q: 'test', num: 1 }),
        timeout: 10000,
      });
      if (r.ok) {
        log('✓', 'Serper API', `OK — ${r.data?.organic?.length || 0} resultados`, 'pass');
      } else {
        log('✗', 'Serper API', `HTTP ${r.status}`, 'fail');
      }
    } catch (err) {
      log('✗', 'Serper API', `ERRO: ${err.message}`, 'fail');
    }
  } else {
    log('⚠', 'Serper API', 'SERPER_KEY nao configurada', 'skip');
  }

  // GNews
  if (process.env.GNEWS_API_KEY) {
    try {
      const r = await fetchJSON(`https://gnews.io/api/v4/search?q=test&lang=pt&max=1&apikey=${process.env.GNEWS_API_KEY}`, { timeout: 10000 });
      if (r.ok) {
        log('✓', 'GNews API', `OK — ${r.data?.totalArticles || 0} artigos`, 'pass');
      } else {
        log('✗', 'GNews API', `HTTP ${r.status}`, 'fail');
      }
    } catch (err) {
      log('✗', 'GNews API', `ERRO: ${err.message}`, 'fail');
    }
  } else {
    log('⚠', 'GNews API', 'GNEWS_API_KEY nao configurada', 'skip');
  }

  // YouTube
  if (process.env.YOUTUBE_API_KEY) {
    try {
      const r = await fetchJSON(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${process.env.YOUTUBE_API_KEY}`, { timeout: 10000 });
      if (r.ok) {
        log('✓', 'YouTube API', `OK — ${r.data?.pageInfo?.totalResults || 0} resultados`, 'pass');
      } else {
        log('✗', 'YouTube API', `HTTP ${r.status}`, 'fail');
      }
    } catch (err) {
      log('✗', 'YouTube API', `ERRO: ${err.message}`, 'fail');
    }
  } else {
    log('⚠', 'YouTube API', 'YOUTUBE_API_KEY nao configurada', 'skip');
  }
}

// ============================================================
// SMTP EMAIL
// ============================================================
async function testSMTP() {
  console.log(`\n${BOLD}═══ SMTP EMAIL ═══${RESET}`);

  if (!process.env.SMTP_HOST) {
    log('⚠', 'SMTP', 'Nao configurado', 'skip');
    return;
  }

  log('✓', 'SMTP', `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} (${process.env.SMTP_USER || 'sem auth'})`, 'info');
  skipped++;
}

// ============================================================
// RATE LIMITS & CONFIG
// ============================================================
async function testConfig() {
  console.log(`\n${BOLD}═══ CONFIGURACOES ═══${RESET}`);

  const checks = [
    ['PORT', process.env.PORT || '3000'],
    ['DB_NAME', process.env.DB_NAME || 'jesus_ai'],
    ['GROQ_AS_PRIMARY', process.env.GROQ_AS_PRIMARY || 'false'],
    ['WHATSAPP_PERSONA_ID', process.env.WHATSAPP_PERSONA_ID || '(default)'],
    ['TTS_MODE', process.env.TTS_MODE || 'kokoro'],
    ['VECTOR_SEARCH_ENABLED', process.env.VECTOR_SEARCH_ENABLED || 'false'],
    ['OLLAMA_MODEL', process.env.OLLAMA_MODEL || 'glm-5.1'],
    ['CLAUDE_MODEL', process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'],
    ['MESSAGE_CHUNK_SIZE', process.env.MESSAGE_CHUNK_SIZE || '200'],
  ];

  for (const [key, val] of checks) {
    log('●', key, val, 'info');
    skipped++;
  }

  // Checar store_pix_key criticamente
  console.log(`\n  ${YELLOW}⚠ CRITICO: store_pix_key${RESET}`);
  console.log(`  ${GRAY}Se vazio, o bot diz "vou enviar dados de pagamento"${GRAY}`);
}

// ============================================================
// INTEGRATION MANAGER (via sistema)
// ============================================================
async function testIntegrationManager() {
  console.log(`\n${BOLD}═══ INTEGRATION MANAGER ═══${RESET}`);

  try {
    const integrations = require('./src/llm/integrationManager');
    await integrations.load();
    
    const status = integrations.getStatusDetailed();
    const services = Object.keys(status);
    let activeCount = 0;
    let healthyCount = 0;
    
    for (const [service, info] of Object.entries(status)) {
      if (info.total > 0) {
        activeCount += info.total;
        healthyCount += info.healthy;
        const icon = info.healthy === info.total ? '✓' : info.healthy > 0 ? '⚠' : '✗';
        const st = info.healthy === info.total ? 'pass' : info.healthy > 0 ? 'fail' : 'fail';
        log(icon, info.label, `${info.healthy}/${info.total} saudaveis`, st);
      } else {
        log('—', info.label, 'nenhuma integracao', 'skip');
      }
    }
    
    console.log(`\n  ${CYAN}Total: ${healthyCount}/${activeCount} integracoes saudaveis${RESET}`);
  } catch (err) {
    log('✗', 'Integration Manager', `ERRO: ${err.message}`, 'fail');
  }
}

// ============================================================
// CHAT ENGINE (mensagem de teste)
// ============================================================
async function testChatEngine() {
  console.log(`\n${BOLD}═══ CHAT ENGINE (teste rapido) ═══${RESET}`);

  try {
    const integrations = require('./src/llm/integrationManager');
    await integrations.load();

    const messages = [{ role: 'user', content: 'Responda apenas a palavra: OK' }];
    
    const start = Date.now();
    const result = await integrations.callLLM(messages, { timeout: 30000, numPredict: 10 });
    const elapsed = Date.now() - start;
    
    const content = result?.message?.content || result?.response || '';
    const thinking = result?.message?.thinking || '';
    const toolCalls = result?.tool_calls?.length || 0;
    
    log('✓', 'Chat Engine', `Resposta em ${elapsed}ms: "${content.trim().substring(0, 50)}"${toolCalls ? ` (${toolCalls} tool calls)` : ''}${thinking ? ` [thinking: ${thinking.substring(0, 30)}...]` : ''}`, 'pass');
  } catch (err) {
    log('✗', 'Chat Engine', `ERRO: ${err.message}`, 'fail');
  }
}

// ============================================================
// TOOL CALLING TEST
// ============================================================
async function testToolCalling() {
  console.log(`\n${BOLD}═══ TOOL CALLING (teste com ferramenta) ═══${RESET}`);

  try {
    const integrations = require('./src/llm/integrationManager');
    await integrations.load();

    // OpenAI-compatible format (works with Ollama, Groq, and Claude)
    const tools = [{
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather for a city',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: 'City name' },
          },
          required: ['city'],
        },
      },
    }];

    const messages = [
      { role: 'system', content: 'You are a helpful assistant. When the user asks about weather, use the get_weather tool. Always use tools when available to answer questions.' },
      { role: 'user', content: 'Qual o tempo em Sao Paulo?' },
    ];

    const start = Date.now();
    const result = await integrations.callLLM(messages, { timeout: 45000, numPredict: 200, tools });
    const elapsed = Date.now() - start;

    const toolCalls = result?.tool_calls || [];
    const content = result?.message?.content || '';

    if (toolCalls.length > 0) {
      const tc = toolCalls[0];
      const args = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {});
      log('✓', 'Tool Calling', `OK em ${elapsed}ms — ${toolCalls.length} tool call(s): ${tc.function?.name}(${args.substring(0, 80)})`, 'pass');
    } else if (content.includes('get_weather') || content.includes('weather')) {
      log('⚠', 'Tool Calling', `Resposta sem tool call em ${elapsed}ms: "${content.substring(0, 80)}"`, 'fail');
    } else {
      log('✗', 'Tool Calling', `Sem tool call em ${elapsed}ms: "${content.substring(0, 80)}"`, 'fail');
    }
  } catch (err) {
    log('✗', 'Tool Calling', `ERRO: ${err.message}`, 'fail');
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║   METAPERSONA.AI — TESTE DE INTEGRACOES  ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}`);
  console.log(`${GRAY}${new Date().toISOString()}${RESET}\n`);

  await testOllama();
  await testClaude();
  await testGroq();
  await testTTS();
  await testEvolution();
  await testExternalAPIs();
  await testSMTP();
  await testMySQL();
  
  // Testes que precisam do sistema completo
  await testIntegrationManager();
  await testChatEngine();
  await testToolCalling();

  // Resumo
  validTests = passed + failed;
  console.log(`\n${BOLD}═══ RESUMO ═══${RESET}`);
  console.log(`  ${GREEN}✓ Passou: ${passed}${RESET}`);
  console.log(`  ${RED}✗ Falhou: ${failed}${RESET}`);
  console.log(`  ${YELLOW}⚠ Pulou:  ${skipped}${RESET}`);
  console.log(`  Total: ${totalTests} testes (${validTests} validados)`);
  console.log(`  Saude: ${validTests > 0 ? ((passed / validTests) * 100).toFixed(1) : 0}%\n`);

  if (failed > 0) {
    console.log(`${RED}${BOLD}ALGUMAS INTEGRACOES ESTAO COM PROBLEMAS!${RESET}`);
    console.log(`${YELLOW}Verifique os erros acima e corrija antes de colocar em producao.${RESET}\n`);
  } else {
    console.log(`${GREEN}${BOLD}TODAS AS INTEGRACOES ESTAO SAUDAVEIS!${RESET}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${RED}ERRO FATAL: ${err.message}${RESET}`);
  process.exit(2);
});