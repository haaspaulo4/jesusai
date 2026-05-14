# MetaPersona.AI — Roadmap

> Planejamento de evolução do projeto, organizado por prioridade e impacto.

## Fase 1 — Crítico (1-2 semanas)

### Segurança
- [ ] **Rate limiting** — Adicionar `express-rate-limit` global (100 req/min) + endpoints específicos (auth: 5/min, chat: 20/min, feedback: 3/min, newsletter: 3/min)
- [ ] **CORS** — Configurar `cors` com whitelist de domínios via env var
- [ ] **Google OAuth server-side validation** — Usar `google-auth-library` ao invés de confiar no `idToken` do cliente
- [ ] **SQL injection fix** — Substituir SQL dinâmico em `session.js:95` por prepared statement com subquery
- [ ] **Session IDs seguros** — Usar `crypto.randomUUID()` ao invés de timestamp+random

### Bug Fixes
- [ ] **Import faltante** — `routes/chat.js:345` referencia `saveProfile` que não é importado
- [ ] **Centralizar LLM calls** — Extrair `src/llm/index.js` com `callLLM(messages, options)` para eliminar duplicação (chat, telegram, whatsapp, blog, session, profile)

### i18n e Persona
- [ ] **Detecção de idioma** — Implementar detecção simples (script detection, palavras comuns) nos 3 bots
- [ ] **Migrar system-prompt.js** — Remover arquivo, usar exclusivamente `persona/config.js`
- [ ] **Keyword multilíngue** — Adicionar padrões de nome em en-US e es-ES nas funções de extração

### Busca
- [ ] **Parser de referência bíblica** — Suportar "João 3:16" na busca (resolver referência → versículo exato)

---

## Fase 2 — Importante (2-4 semanas)

### IA e Prompt Engineering
- [ ] **Anti-CJK preventivo** — Reforçar prompt ("NUNCA use caracteres chineses, japoneses ou coreanos") ao invés de filtrar pós-resposta
- [ ] **Contagem de tokens** — Implementar estimativa (`text.length / 4`) e truncar histórico dinamicamente
- [ ] **Moderação de conteúdo** — Camada anti-prompt-injection antes do LLM
- [ ] **Summário multilíngue** — Passar idioma nos prompts de `generateSummary` e `generateProfileSummary`

### Banco de Dados
- [ ] **Índices** — Adicionar `messages(session_id, timestamp)`, `feedback(created_at)`, `contact_messages(created_at)`
- [ ] **Migrations** — Sistema de versionamento de schema (tabela `schema_migrations`)
- [ ] **Soft delete** — Adicionar `deleted_at` em sessions ao invés de DELETE hard

### Backend
- [ ] **Error handler global** — Middleware Express para erros não tratados
- [ ] **Validação de input** — Adicionar `zod` ou `joi` nos endpoints críticos
- [ ] **Paginação** — `GET /api/sessions` e `GET /api/blog/posts` com `limit/offset`
- [ ] **Logging estruturado** — Substituir `console.log/error` por `pino` ou `winston`
- [ ] **Graceful shutdown** — Fechar pool MySQL, parar bots, esperar conexões ativas
- [ ] **Logging middleware** — Request/response logging com timing

### Integrações
- [ ] **WhatsApp deduplicação** — Priorizar webhook, polling como fallback com deduplicação por `message.id`
- [ ] **i18n nos bots** — Comandos e mensagens do Telegram/WhatsApp em 3 idiomas
- [ ] **Telegram retry** — Backoff exponencial em caso de erro de polling

### RAG
- [ ] **Stemming** — Mapeamento de sinônimos bíblicos (`graça` → `favor`, `salvação` → `redenção`)
- [ ] **Stopwords multilíngue** — Já implementado no `KnowledgeStore`, migrar do `rag/store.js` legado
- [ ] **Cache LRU** — Resultados de busca frequentes em memória

---

## Fase 3 — Melhorias (4-8 semanas)

### Arquitetura
- [ ] **API versioning** — `/api/v1/` prefix
- [ ] **Health check DB** — `/api/health` verifica conexão MySQL
- [ ] **Admin dashboard** — Painel para gerenciar posts, feedback, subscribers
- [ ] **Observabilidade** — Metrics endpoint (Prometheus format)

### Frontend
- [ ] **PWA** — manifest.json, service worker, ícones, offline fallback
- [ ] **SEO** — robots.txt, sitemap.xml, meta tags OG/Twitter
- [ ] **CSP headers** — Content Security Policy
- [ ] **Code splitting** — Separar app.js em módulos com lazy loading

### Novas Fontes de Conhecimento
- [ ] **Catecismo da Igreja Católica** — Ingestor de documento estruturado
- [ ] ** Comentários Bíblicos** — Matthews Henry, Spurgeon, etc.
- [ ] **Web scraper** — Ingestor para sites confessionais
- [ ] **PDF ingester** — Usando pdf-parse para documentos PDF

### Novas Personas
- [ ] **Stoic.AI** — Persona estoica baseada em Marco Aurélio, Sêneca, Epicteto
- [ ] **Filósofo.AI** — Persona filosófica geral
- [ ] **Conselheiro.AI** — Persona de aconselhamento pastoral/tradução
- [ ] **Template de persona** — CLI para criar nova persona com `npm run create-persona`

### DevOps
- [ ] **Docker** — Dockerfile + docker-compose.yml (Node + MySQL)
- [ ] **CI/CD** — GitHub Actions para testes e deploy automático
- [ ] **Backup automático** — Cron job para dump MySQL
- [ ] **Monitoring** — Uptime checks, alertas de erro, dashboard

### Testes
- [ ] **Testes unitários** — Jest para funções core (RAG, session, profile, auth)
- [ ] **Testes de integração** — Supertest para API endpoints
- [ ] **Testes E2E** — Playwright ou Cypress para fluxo completo de chat
- [ ] **Load testing** — Artillery ou k6 para validar performance sob carga

---

## Fase 4 — Escala (futuro)

- [ ] **Embeddings semânticos** — Upgrade de TF-IDF para embeddings via API (OpenAI, Cohere, local)
- [ ] **Redis cache** — Cache de prompts, resultados de busca, sessões frequentes
- [ ] **WebSocket** — Alternativa ao SSE para melhor performance em mobile
- [ ] **Rate limiting por usuário** — Redis-backed rate limiting com tokens
- [ ] **Multi-tenancy** — Suporte a múltiplos idiomas de persona no mesmo servidor
- [ ] **Analytics** — Dashboard de uso, métricas de engagement, feedback analysis
- [ ] **Mobile app** — React Native ou Flutter com mesmas APIs
- [ ] **Discord Bot** — Integração com Discord
- [ ] **Mastodon/Fediverse Bot** — Integração com redes descentralizadas
- [x] **Kokoro TTS** — TTS local em CPU com pt-BR nativo (pf_dora, pm_alex), en-US, es-ES. Apache 2.0, 82M params. Integrado como `TTS_MODE=kokoro`: [github.com/hexgrad/kokoro](https://github.com/hexgrad/kokoro)
- [x] **Kokoro TTS web** — Endpoint `/api/tts` serve áudio Kokoro ao browser com fallback para speechSynthesis
- [x] **Kokoro health check** — `kokoro-manager.js` faz health check a cada 120s (10s timeout), só loga mudança de estado, warmup pipeline
- [x] **TTS fallback lock** — Se Kokoro falha num chunk, todos os chunks restantes usam Edge TTS (sem misturar vozes)
- [x] **Content-type tracking** — Buffer objects rastreiam contentType (audio/wav para Kokoro, audio/mp3 para Edge TTS)
- [x] **Telegram voice** — Envia áudio em chunks de 300 chars com content-type correto (wav/mp3)
- [x] **WhatsApp audio** — Envia texto primeiro, depois áudio em chunks de 300 chars com mimetype correto
- [x] **White-label foundation** — Persona config agora tem `commands` (start, help, verse, search, prayer, devotional, group) com strings em 3 idiomas. Telegram bot usa `getActivePersona().commands`. Server banner usa persona name.

---

## Créditos

Ver [`CREDITS.md`](CREDITS.md) para lista completa de APIs, bibliotecas e serviços utilizados.