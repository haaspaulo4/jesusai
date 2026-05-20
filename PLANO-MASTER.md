# PLANO MASTER — Correções, Testes & Melhorias

> MetaPersona.AI — Plano completo de hardening, qualidade e evolução
> Gerado em: 2026-05-20

---

## Resumo Executivo

| Métrica | Atual | Meta |
|---|---|---|
| Linhas de código | 44K | — |
| Tabelas MySQL | 82 | — |
| Endpoints API | 386 | — |
| Cobertura de testes | 0% | 70%+ |
| Vulnerabilidades críticas | 5 | 0 |
| Vulnerabilidades altas | 7 | 0 |
| Dead code | 3 arquivos | 0 |
| Linting | Nenhum | ESLint + Prettier |

---

## FASE 0 — CORREÇÕES CRÍTICAS (Segurança & Integridade)

### 0.1 Race Condition: Stock sem Transaction
**Arquivo:** `src/erp/orders.js:78-84`
**Problema:** Stock deduzido em loop sem transaction. Dois pedidos simultâneos = overselling.
**Fix:**
```js
const conn = await pool.getConnection();
await conn.beginTransaction();
try {
  for (const item of items) {
    await conn.execute('SELECT stock FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
    await adjustStock(item.product_id, item.variant_id, 'out', item.quantity, ...);
  }
  // INSERT order
  await conn.commit();
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
}
```
**Esforço:** 2h | **Impacto:** Crítico

### 0.2 Race Condition: Rate Limit Check-Then-Act
**Arquivo:** `src/auth/rateLimit.js:30-55`
**Problema:** INCREMENT antes do CHECK. Burst de requests passa pelo limite.
**Fix:** Usar atomic `INSERT ... ON DUPLICATE KEY UPDATE request_count = IF(request_count < ?, request_count + 1, request_count)` e checar affected rows.
**Esforço:** 1h | **Impacto:** Crítico

### 0.3 Loyalty Points sem Idempotência
**Arquivo:** `src/loyalty/index.js:42-68`
**Problema:** Sem check de `orderId` duplicado. Double-click = pontos duplicados.
**Fix:** `UNIQUE INDEX (order_id, type)` na tabela `loyalty_transactions` + `INSERT IGNORE` ou `ON DUPLICATE KEY`.
**Esforço:** 1h | **Impacto:** Crítico

### 0.4 Coupon Reuse via WhatsApp
**Arquivo:** `src/erp/commerce.js:335-376`
**Problema:** `applyCoupon()` nunca incrementa `used_count`. Cupom infinito via chat.
**Fix:** Adicionar `UPDATE coupon_codes SET used_count = used_count + 1 WHERE code = ? AND (max_uses = 0 OR used_count < max_uses)` e checar affected rows.
**Esforço:** 30min | **Impacto:** Crítico

### 0.5 Variável Undefined em `redeemPoints`
**Arquivo:** `src/loyalty/index.js:91`
**Problema:** `reason` não existe no escopo. Runtime error ao resgatar cashback.
**Fix:** Adicionar parâmetro `reason = 'Resgate'` ou usar string fixa.
**Esforço:** 10min | **Impacto:** Crítico

### 0.6 Cart Metadata Sobrescrita no applyCoupon
**Arquivo:** `src/erp/commerce.js:372-374`
**Problema:** `applyCoupon` substitui metadata inteira, apagando endereço/pagamento.
**Fix:** Merge com spread: `metadata: { ...existingMetadata, coupon_code, discount, ... }`
**Esforço:** 30min | **Impacto:** Alto

### 0.7 Broadcast Não Envia Mensagens
**Arquivo:** `src/broadcast/index.js:72-79`
**Problema:** `sendBroadcast` marca como "sent" sem enviar nada.
**Fix:** Implementar loop de envio via WhatsApp/Telegram com rate limiting (1msg/seg).
**Esforço:** 4h | **Impacto:** Alto

### 0.8 Order Number Race Condition
**Arquivo:** `src/erp/orders.js:8-14`
**Problema:** COUNT + 1 sem lock. Pedidos simultâneos = número duplicado.
**Fix:** Usar `AUTO_INCREMENT` separado ou `INSERT ... SELECT MAX(order_number) + 1 FOR UPDATE`.
**Esforço:** 1h | **Impacto:** Alto

### 0.9 Loyalty Expiration Destrói Audit Trail
**Arquivo:** `src/loyalty/index.js:133-139`
**Problema:** UPDATE muda `type` de "earn" para "expire" in-place.
**Fix:** INSERT nova transação tipo "expire" com amount negativo, manter original intacta.
**Esforço:** 1h | **Impacto:** Alto

### 0.10 Password Exposta no /cadastrar
**Arquivo:** `src/chat/engine.js:840-844`
**Problema:** Senha em plaintext no chat, potencialmente enviada ao LLM.
**Fix:** Interceptar ANTES do processamento, nunca incluir na mensagem enviada ao LLM. Já tem masking parcial (line 424) mas precisa ser completo.
**Esforço:** 1h | **Impacto:** Alto

---

## FASE 1 — INFRAESTRUTURA DE TESTES

### 1.1 Setup Jest
```bash
npm install --save-dev jest jest-extended supertest @jest/globals
```

**jest.config.js:**
```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/db/**'],
  coverageThreshold: { global: { branches: 50, functions: 60, lines: 60 } },
  setupFilesAfterFramework: ['jest-extended/all'],
  testTimeout: 10000,
};
```

**package.json scripts:**
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage",
"test:ci": "jest --ci --coverage --forceExit"
```

### 1.2 Estrutura de Testes
```
tests/
  unit/
    auth/
      auth.test.js          (20-25 testes)
      rateLimit.test.js     (12-15 testes)
    chat/
      engine.test.js        (30-40 testes)
      commands.test.js      (15 testes)
    commerce/
      cart.test.js          (18-22 testes)
      finalize.test.js      (18-22 testes)
      delivery.test.js      (8-10 testes)
    erp/
      orders.test.js        (18-22 testes)
      products.test.js      (12 testes)
    loyalty/
      loyalty.test.js       (15-18 testes)
    gamification/
      xp.test.js            (20-25 testes)
    llm/
      integration.test.js   (20-25 testes)
      tools.test.js         (20-25 testes)
    persona/
      manager.test.js       (15-18 testes)
      config.test.js        (12-15 testes)
    onboarding/
      onboarding.test.js    (15-18 testes)
    knowledge/
      store.test.js         (12-15 testes)
    cognitive/
      cognitive.test.js     (15-18 testes)
  integration/
    routes/
      chat.test.js          (20 testes)
      admin.test.js         (30 testes)
      storefront.test.js    (15 testes)
    flows/
      commerce-flow.test.js (10 testes)
      onboarding-flow.test.js (8 testes)
  fixtures/
    users.js
    personas.js
    products.js
    orders.js
    settings.js
  helpers/
    mockDb.js               (mock pool.execute)
    mockLLM.js              (mock callLLM responses)
    mockSettings.js         (mock getSetting)
    testApp.js              (supertest app instance)
```

### 1.3 Prioridade de Testes (por risco de negócio)

| # | Módulo | Testes | Prioridade |
|---|---|---|---|
| 1 | Commerce (cart + finalize) | 40-44 | P0 |
| 2 | Auth + Rate Limit | 32-40 | P0 |
| 3 | Orders (ERP) | 18-22 | P0 |
| 4 | Loyalty | 15-18 | P0 |
| 5 | Chat Engine | 30-40 | P1 |
| 6 | LLM Integration | 20-25 | P1 |
| 7 | Gamification | 20-25 | P1 |
| 8 | Onboarding | 15-18 | P1 |
| 9 | Persona Manager | 15-18 | P2 |
| 10 | Knowledge Store | 12-15 | P2 |
| 11 | Cognitive | 15-18 | P2 |
| 12 | LLM Tools | 20-25 | P2 |
| **Total** | | **~280-330** | |

**Esforço total:** 5-7 dias | **Meta:** 70% coverage nos módulos críticos

---

## FASE 2 — ARQUITETURA

### 2.1 Split admin.js (2880 linhas → 17 arquivos)

```
src/routes/admin/
  index.js              — compose all sub-routers (50 linhas)
  middleware.js         — shared middleware (80 linhas)
  users.js              — Users CRUD, roles (60 linhas)
  personas.js           — Personas CRUD, generate (120 linhas)
  integrations.js       — API keys, test, toggle (80 linhas)
  knowledge.js          — RAG, upload, reindex (150 linhas)
  surveys.js            — Surveys, ratings, follow-ups (80 linhas)
  bots.js               — Bot instances (100 linhas)
  skills.js             — Skills CRUD (50 linhas)
  agent.js              — Tasks, calendar, contacts, automations (200 linhas)
  goals.js              — Goals, hierarchy (80 linhas)
  stages.js             — Conversation stages (70 linhas)
  orgmemory.js          — Org memory (70 linhas)
  gamification.js       — XP, badges (60 linhas)
  cognitive.js          — Cognitive, override, thoughts (50 linhas)
  blueprints.js         — Blueprints CRUD (80 linhas)
  erp.js                — ERP admin routes (200 linhas)
  settings.js           — Settings, MCP (40 linhas)
```

**Esforço:** 2-3 dias | **Impacto:** Alto (manutenibilidade)

### 2.2 Migration System (substituir try/catch ALTERs)

```
src/db/
  index.js              — pool + initSchema (tabelas base)
  migrations/
    001_initial.js
    002_add_workspace.js
    003_add_onboarding_persona.js
    ...
  migrator.js           — schema_migrations table + runner
```

**Esforço:** 3-5 dias | **Impacto:** Crítico (previne corrupção silenciosa)

### 2.3 LLM Loop Timeout + Circuit Breaker

```js
// engine.js — tool loop
const TOTAL_TIMEOUT = 60000; // 60s total
const PER_TOOL_TIMEOUT = 10000; // 10s per tool
const controller = new AbortController();
const totalTimer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT);

// Circuit breaker
const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  threshold: 3,
  cooldown: 30000,
  isOpen() { return this.failures >= this.threshold && Date.now() - this.lastFailure < this.cooldown; }
};
```

**Esforço:** 2 dias | **Impacto:** Crítico (previne cascading failures)

---

## FASE 3 — PERFORMANCE & CACHE

### 3.1 Indexes Faltando

```sql
CREATE INDEX idx_messages_session_ts ON messages(session_id, timestamp);
CREATE INDEX idx_cognitive_session ON cognitive_states(session_id, created_at);
CREATE INDEX idx_embeddings_source_model ON embeddings(source_id, model);
CREATE INDEX idx_orders_persona_status ON orders(persona_id, status, created_at);
CREATE INDEX idx_carts_session ON commerce_carts(session_id, flow_step);
CREATE INDEX idx_loyalty_user_persona ON loyalty_transactions(user_id, persona_id, created_at);
CREATE INDEX idx_broadcasts_persona ON broadcasts(persona_id, status);
```

**Esforço:** 1 dia | **Impacto:** Alto (queries 10-100x mais rápidas)

### 3.2 Cache Strategy

| Cache | Implementação | TTL |
|---|---|---|
| Sessions quentes | LRU (lru-cache, max 1000) | 5 min |
| Settings | Refresh periódico | 60s |
| Persona cache | TTL-based | 5 min |
| Profile cache | LRU (max 500) | 5 min |
| Embedding cache | LRU (já existe, melhorar) | — |

```bash
npm install lru-cache
```

**Esforço:** 2-3 dias | **Impacto:** Alto (reduz DB load 50%+)

### 3.3 Batch Context Queries

Atual (engine.js): 7 queries sequenciais por mensagem
```
getSession → getProfile → searchKnowledge → getGoals → getOrgMemory → getStage → getXp
```

Proposta: Parallel com `Promise.all` (já parcialmente feito) + cache hit para sessions repetidas.

**Esforço:** 1 dia | **Impacto:** Alto (latência -40%)

---

## FASE 4 — OBSERVABILITY

### 4.1 Structured Logging (Pino)

```bash
npm install pino pino-pretty
```

```js
// src/logger.js
const pino = require('pino');
module.exports = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' 
    ? { target: 'pino-pretty' } 
    : undefined,
});
```

Substituir 589 `console.log` por `logger.info/warn/error` com contexto estruturado.

**Esforço:** 3-4 dias | **Impacto:** Médio (debuggability em produção)

### 4.2 Metrics (Prometheus)

```bash
npm install prom-client
```

```js
// src/monitoring/metrics.js
const { Registry, Counter, Histogram, Gauge } = require('prom-client');

const registry = new Registry();

const httpDuration = new Histogram({ name: 'http_request_duration_seconds', help: '...', labelNames: ['method', 'route', 'status'] });
const llmDuration = new Histogram({ name: 'llm_call_duration_seconds', help: '...', labelNames: ['provider', 'model'] });
const llmTokens = new Counter({ name: 'llm_tokens_total', help: '...', labelNames: ['type'] });
const activeConnections = new Gauge({ name: 'websocket_connections_active', help: '...' });
const messagesTotal = new Counter({ name: 'messages_total', help: '...', labelNames: ['channel', 'persona'] });
const ordersTotal = new Counter({ name: 'orders_total', help: '...', labelNames: ['status'] });
const errorRate = new Counter({ name: 'errors_total', help: '...', labelNames: ['type', 'route'] });
```

**Esforço:** 3 dias | **Impacto:** Crítico (visibilidade operacional)

### 4.3 Health Check Melhorado

```js
// GET /api/health
{
  status: 'ok',
  uptime: process.uptime(),
  memory: process.memoryUsage(),
  db: { ok: true, latency_ms: 2 },
  redis: { ok: true, latency_ms: 1 },
  llm: { ok: true, healthy_keys: 3, total_keys: 4 },
  tts: { ok: true },
  queues: { waiting: 0, active: 1, failed: 0 }
}
```

---

## FASE 5 — CLEANUP & QUALIDADE

### 5.1 Dead Code Removal

| Arquivo | Ação |
|---|---|
| `src/system-prompt.js` | Deletar (0 referências) |
| `src/services/evoClient.js` | Deletar ou integrar no whatsapp/bot.js |
| `src/llm/keyManager.js` | Remover 21 referências, deletar |

### 5.2 ESLint + Prettier

```bash
npm install --save-dev eslint prettier eslint-config-prettier
```

**.eslintrc.js:**
```js
module.exports = {
  env: { node: true, es2022: true },
  extends: ['eslint:recommended', 'prettier'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // até migrar pra pino
    'prefer-const': 'error',
    'no-var': 'error',
  },
};
```

**Esforço:** 1 dia setup + 2-3 dias fixing warnings | **Impacto:** Médio

### 5.3 Graceful Shutdown Completo

```js
// server.js shutdown
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Shutting down...');
  isShuttingDown = true; // health returns 503
  
  // 1. Stop accepting new connections
  httpServer.close();
  
  // 2. Stop bots
  await botManager.stopAll();
  
  // 3. Drain Socket.IO
  io.disconnectSockets(true);
  
  // 4. Wait for in-flight requests (5s)
  await new Promise(r => setTimeout(r, 5000));
  
  // 5. Close job queues
  await jobQueue.shutdown();
  
  // 6. Close DB pool
  await pool.end();
  
  // 7. Stop TTS
  stopKokoroServer();
  
  process.exit(0);
}
```

**Esforço:** 1 dia | **Impacto:** Alto (zero downtime deploys)

---

## FASE 6 — REGRAS DE NEGÓCIO (Melhorias)

### 6.1 Validação de Stock no Carrinho

Checar stock ao adicionar item (não só no finalize):
```js
async function addCartItem(sessionId, productId, variantId, quantity) {
  const stock = await getProductStock(productId, variantId);
  if (stock < quantity) {
    return { error: `Apenas ${stock} unidades disponíveis` };
  }
  // ... add to cart
}
```

### 6.2 Reserva de Stock (Soft Lock)

Ao adicionar ao carrinho, reservar stock por 30min:
```js
await adjustStock(productId, variantId, 'reserved', quantity, orderId);
// Se cart expirar → release reservation
// Se finalizar → convert reserved → out
```

### 6.3 Webhook de Status de Pedido

Notificar cliente via WhatsApp quando status muda:
```js
// orders.js updateOrderStatus
if (newStatus === 'shipped') {
  await sendWhatsApp(order.customer_phone, 
    `Seu pedido #${order.order_number} foi enviado! Rastreio: ${tracking}`);
}
```

### 6.4 Retry de Pagamento PIX

Se PIX não confirmado em 30min, enviar lembrete:
```js
// Job queue: check_pix_payments (every 5min)
// Se order.status === 'pending' && payment === 'pix' && created > 30min
// → enviar lembrete com chave PIX
```

### 6.5 Anti-Fraude Básico

```js
// Regras simples antes de finalizar pedido:
// 1. Mesmo telefone com 3+ pedidos pendentes → bloquear
// 2. Pedido > R$500 sem histórico → flag para review
// 3. Endereço diferente dos últimos 3 pedidos → confirmar
```

### 6.6 Dashboard de Conversão Real-time

```
Funil via Socket.IO:
  Mensagens recebidas → Carrinhos criados → Endereço preenchido → Pagamento → Pedido finalizado
  
  Métricas:
  - Taxa de conversão por etapa
  - Tempo médio entre etapas
  - Drop-off points
  - Revenue por persona/canal
```

---

## CRONOGRAMA SUGERIDO

| Semana | Fase | Entregas |
|---|---|---|
| 1 | Fase 0 | 10 fixes críticos (segurança) |
| 2 | Fase 1 | Jest setup + 100 testes (commerce, auth, orders) |
| 3 | Fase 1 | +130 testes (engine, LLM, gamification, onboarding) |
| 4 | Fase 2 | Split admin.js + migration system |
| 5 | Fase 2 | LLM circuit breaker + timeout |
| 6 | Fase 3 | DB indexes + cache (lru-cache) |
| 7 | Fase 4 | Pino logging + Prometheus metrics |
| 8 | Fase 5 | Dead code + ESLint + graceful shutdown |
| 9 | Fase 6 | Stock reservation + webhook status + anti-fraude |
| 10 | Fase 6 | Dashboard conversão + retry PIX |

---

## MÉTRICAS DE SUCESSO

| KPI | Antes | Depois |
|---|---|---|
| Test coverage | 0% | 70%+ |
| Vulnerabilidades críticas | 5 | 0 |
| Tempo de resposta p95 | ~3s | <1.5s |
| Uptime | ? | 99.5%+ |
| Overselling incidents | Possível | 0 |
| Coupon abuse | Possível | 0 |
| Deploy downtime | Manual | Zero-downtime |
| Mean time to debug | Horas | Minutos (logs estruturados) |

---

## DECISÕES PENDENTES

1. **Redis obrigatório ou opcional?** — Atualmente fallback pra interval. Se obrigatório, simplifica BullMQ + cache.
2. **TypeScript migration?** — Custo alto (44K linhas), benefício alto. Fazer gradual com JSDoc + `@ts-check`?
3. **Multi-tenancy?** — Cada instalação = 1 cliente. Se escalar, precisa tenant isolation.
4. **CDN para assets?** — Imagens de produtos, creatives, uploads. CloudFlare R2?
5. **Backup strategy?** — mysqldump diário? Replicação? Point-in-time recovery?

---

*Este plano é vivo. Atualizar conforme execução.*
