<div align="center">

# MetaPersona.AI — Whitelabel AI Platform

**Plataforma whitelabel de agentes virtuais inteligentes com RAG multimodal, multi-persona, cognição, gamificação e gestão operacional completa.**

[![License: MIT](https://img.shields.io/badge/License-MIT-c9a227.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1.svg)](https://www.mysql.com/)

</div>

---

## O que é?

MetaPersona.AI é uma **plataforma whitelabel de agentes virtuais cognitivos**. Serve qualquer nicho — educação, saúde, negócios, coaching, religioso, vendas, fitness, jurídico.

A meta-persona é **admin god** — orquestra personas, cria skills, gerencia tarefas, agenda, CRM, automações, metas, estágios de conversa, e conhecimento organizacional. Tudo via conversa.

### Destaques

- **Multi-Persona com Meta-RAG** — Crie personas via LLM a partir de uma descrição. Cada persona tem conhecimento, voz, skills, onboarding e marca próprios.
- **RAG Multimodal** — PDF, DOCX, imagens (OCR), áudio (STT), JSON, texto, APIs. Fontes plug-and-play por persona.
- **Agentic System** — Tarefas, calendário, CRM/contatos, automações, metas hierárquicas, estágios de conversa, memória organizacional.
- **Cognitive Intelligence** — Detecta emoção, intenção, risco de churn, probabilidade de conversão, engajamento. A IA adapta comportamento em tempo real.
- **Gamification** — XP, níveis, streaks, conquistas, ranking, progresso personalizado por persona.
- **Self-Optimization** — A IA analisa padrões e sugere melhorias (tom, retenção, engajamento, automações).
- **Human Override** — Humano assume a conversa com um clique. Tipos: full, approval, observation.
- **Agent Thought Log** — Registra decisões da IA (tools usados, contexto injetado, raciocínio).
- **Onboarding Automático** — State machine configurável em 3 idiomas (pt-BR, en-US, es-ES).
- **Follow-ups Automáticos** — A cada N mensagens ou agendado. Tipos: check-in, conteúdo, custom.
- **Role-Based Access** — guest, user, premium, admin, banned. Rate limiting per role.
- **Multi-Bot** — Múltiplas instâncias Telegram + WhatsApp, cada uma com persona própria.
- **Whitelabel** — Marca, cores, logo, saudações — tudo configurável via settings.
- **26 LLM Tools** — create_persona, manage_tasks, manage_goals, manage_org_memory, get_cognitive_state, human_override, etc.
- **30+ Chat Commands** — /persona, /goals, /xp, /progress, /stages, /orgmem, /dashboard, /contacts, /calendar, etc.
- **3 idiomas** — pt-BR (default), en-US, es-ES.
- **Voz natural** — Kokoro TTS com vozes por persona + Edge TTS fallback.
- **Blog automático** — Conteúdo gerado por LLM diariamente.
- **Admin API completa** — 80+ endpoints para gestão total.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 18+ / Express |
| Database | MySQL 8.4 (mysql2/promise) |
| LLM | Ollama Cloud API (OpenAI-compatible, multi-key fallback) |
| RAG | TF-IDF pluggable + multimodal ingestion |
| Auth | JWT + bcrypt + Google OAuth + role-based + rate limiting |
| Telegram | Multi-instance via bot manager |
| WhatsApp | Multi-instance via Evolution API v2 |
| TTS | Kokoro-82M + Edge TTS + Google Translate (fallback) |
| STT | Groq Whisper + OpenAI Whisper (fallback) |
| i18n | pt-BR, en-US, es-ES |

## Arquitetura

```
User message → Rate limit check + Ban check
             → Onboarding check (new user? → ask questions)
             → Human override check (active? → pause AI)
             → Persona resolution (session → user → default)
             → Chat command? → handleChatCommand
             → Extract context + Search knowledge (persona-aware RAG)
             → Build memory + Build profile
             → Analyze cognitive state (emotion, intent, churn risk, engagement)
             → Update streak + XP
             → Inject context into system prompt:
               - Knowledge context
               - Conversation memory
               - Profile context
               - Active goals
               - Org memory (searched by keywords)
               - Conversation stage
               - XP/Level/Streak
               - Progress state
               - Cognitive state (emotion, intent, churn risk)
             → LLM call via IntegrationManager (with tools if enabled)
             → Tool calls loop (26 tools for meta-persona)
             → Log agent thought (tools used, context, reasoning)
             → CJK check → Save message → Auto follow-up
             → Return response + sources + persona info + ttsVoice
```

## Módulos

| Módulo | Arquivo | Descrição |
|--------|---------|-----------|
| Chat Engine | `src/chat/engine.js` | Rate limit, onboarding, persona-aware RAG, tools, cognitive, override |
| Persona Manager | `src/persona/manager.js` | Multi-persona DB, cache, invalidation |
| Meta-RAG | `src/persona/meta-rag.js` | LLM persona generation, switchPersona |
| Config | `src/persona/config.js` | buildSystemPrompt (string/object identity) |
| Agent | `src/agent/index.js` | Tasks, calendar, contacts, automations, history, dashboard |
| Skills | `src/skills/index.js` | Skills CRUD + invocation |
| Goals | `src/goals/index.js` | Goal stack CRUD + hierarchy + progress + context injection |
| Stages | `src/stages/index.js` | Conversation stages + user tracking + context injection |
| Org Memory | `src/orgmemory/index.js` | Organizational memory CRUD + search + context injection |
| Gamification | `src/gamification/index.js` | XP, levels, streaks, badges, leaderboard |
| Progress | `src/progress/index.js` | Per-user progress state (JSON key-value per persona) |
| Cognitive | `src/cognitive/index.js` | Emotion/intent detection, churn risk, engagement, suggested actions |
| Override | `src/override/index.js` | Human override (full/approval/observation per session) |
| Thoughts | `src/thoughts/index.js` | Agent thought log (tools used, context, reasoning, response time) |
| Optimization | `src/optimization/index.js` | Self-optimization suggestions based on patterns |
| Proactive | `src/proactive/index.js` | Cron-based proactive intelligence (streaks, goals, automations) |
| LLM Tools | `src/llm/tools.js` | 26 tool definitions + execution logic |
| Integration Mgr | `src/llm/integrationManager.js` | Multi-key fallback for all integrations |
| Knowledge | `src/knowledge/` | TF-IDF RAG, multimodal ingestion, per-persona sources |
| Auth | `src/auth/` | JWT, bcrypt, Google OAuth, role-based, rate limiting |
| Onboarding | `src/onboarding/index.js` | State machine (3 langs, configurable steps) |
| Survey | `src/survey/index.js` | Surveys, ratings, follow-ups |
| TTS | `src/tts/` | Kokoro + Edge TTS + Google Translate fallback |
| STT | `src/stt/` | Groq Whisper + OpenAI Whisper fallback |
| i18n | `src/i18n/index.js` | pt-BR, en-US, es-ES |
| Settings | `src/settings/index.js` | DB-backed runtime settings + whitelabel |
| DB | `src/db/index.js` | MySQL pool + 39 tables + auto-migration |
| Server | `src/server.js` | Express + routes + startup + meta-persona registration |

## Setup

```bash
git clone https://github.com/anomalyco/metapersona-ai.git
cd metapersona-ai
npm install
cp .env.example .env
# Configure OLLAMA_API_KEY in .env
npm run ingest   # First time: index knowledge corpus
npm start        # or npm run dev
```

Acesse `http://localhost:3000` | Admin: `http://localhost:3000/admin`

### Kokoro TTS (voz natural)
```bash
npm run tts:install   # Install Python dependencies
npm run tts:start     # Start Kokoro server on port 8001
```

### Pré-requisitos
1. **MySQL 8.4** em localhost (root, sem senha, database `metapersona_ai`)
2. **OLLAMA_API_KEY** no `.env`
3. `npm run ingest` antes do primeiro uso
4. Schema criado automaticamente no startup (39 tabelas)
5. **Kokoro TTS** (opcional): `npm run tts:install` → `npm run tts:start`

## Chat Commands

| Command | Access | Description |
|---|---|---|
| `/admin` | admin | Admin dashboard |
| `/stats` | user | Suas estatísticas |
| `/myprofile` | user | Seu perfil |
| `/persona` | anyone | Listar personas |
| `/persona <id>` | anyone | Trocar persona |
| `/persona create <desc>` | admin | Criar persona via Meta-RAG |
| `/voice` | anyone | Listar/trocar voz TTS |
| `/skills` | anyone | Listar skills |
| `/tasks` | user | Listar tarefas |
| `/calendar` | user | Próximos eventos |
| `/contacts` | user | Listar contatos/CRM |
| `/automations` | user | Listar automações |
| `/dashboard` | user | Dashboard completo |
| `/goals` | user | Gerenciar metas |
| `/stages` | user | Ver/avançar estágios de conversa |
| `/orgmem` | user | Gerenciar memória organizacional |
| `/xp` | user | XP, nível, streak, conquistas, ranking |
| `/progress` | user | Estado de progresso personalizado |
| `/survey` | admin | Gerenciar pesquisas |
| `/ratings` | admin | Estatísticas de avaliação |
| `/followups` | admin | Status de follow-ups |
| `/keys, /addkey` | admin | Gestão de integrações |
| `/settings, /set` | admin | Configurações |
| `/users, /promote, /ban` | admin | Gestão de usuários |
| `/health` | anyone | Saúde das integrações |
| `/tools` | anyone | Ferramentas disponíveis |

## LLM Tools (26)

| Tool | Description |
|------|-------------|
| `bible_lookup` | Busca versículos bíblicos |
| `user_stats` | Estatísticas do usuário |
| `get_daily_devotional` | Devocional do dia |
| `send_prayer_request` | Registrar pedido de oração |
| `list_sessions` | Listar sessões |
| `update_settings` | Atualizar configurações (admin) |
| `manage_users` | Gerenciar usuários (admin) |
| `send_email_to_user` | Enviar email (admin) |
| `create_persona` | Criar persona via LLM |
| `list_personas` | Listar personas |
| `create_skill` | Criar skill |
| `invoke_skill` | Invocar skill |
| `list_skills` | Listar skills |
| `add_knowledge_source` | Adicionar fonte de conhecimento |
| `manage_tasks` | CRUD de tarefas |
| `manage_calendar` | CRUD de eventos |
| `manage_contacts` | CRUD de contatos/CRM |
| `manage_automations` | CRUD de automações |
| `manage_goals` | CRUD de metas hierárquicas |
| `manage_conversation_stages` | CRUD de estágios de conversa |
| `manage_org_memory` | CRUD de memória organizacional |
| `manage_xp` | Gamificação (XP, streaks, badges) |
| `manage_progress` | Estado de progresso personalizado |
| `get_cognitive_state` | Emoção, intenção, churn risk, engajamento |
| `human_override` | Intervenção humana na conversa |
| `get_suggestions` | Sugestões de auto-otimização |
| `get_dashboard` | Dashboard stats |
| `get_history` | Histórico de conversas |

## Database Schema (39 tabelas)

Core: `users`, `sessions`, `messages`, `profiles`, `settings`, `api_keys`

Content: `posts`, `comments`, `feedback`, `newsletter_subscribers`, `contact_messages`

Persona: `personas`, `persona_skills`, `persona_messages`, `mcp_servers`

Agent: `persona_tasks`, `persona_calendar`, `persona_contacts`, `persona_automations`

Intelligence: `persona_goals`, `persona_conversation_stages`, `persona_user_stages`, `persona_org_memory`

Engagement: `surveys`, `survey_responses`, `ratings`, `follow_ups`, `bot_instances`, `onboarding_steps`, `user_onboarding`

Cognitive: `cognitive_states`, `human_overrides`, `agent_thoughts`

Gamification: `user_xp`, `user_xp_log`, `user_progress`

Rate Limiting: `rate_limits`

## Admin API (80+ endpoints)

See [`AGENTS.md`](AGENTS.md) for the complete endpoint reference.

Key endpoint groups:
- **Users**: CRUD, role management, ban
- **Personas**: CRUD, generate (Meta-RAG), activate/deactivate
- **Skills**: CRUD, invoke
- **Tasks/Calendar/Contacts/Automations**: Full CRUD
- **Goals**: CRUD + hierarchy + progress stats
- **Conversation Stages**: CRUD + user tracking + advancement
- **Org Memory**: CRUD + keyword search
- **Gamification**: XP, levels, badges, leaderboard
- **Progress State**: Get/set/update per user+persona
- **Cognitive**: State, history, stats
- **Human Override**: Activate/deactivate/list
- **Agent Thoughts**: Log + stats
- **Self-Optimization**: Suggestions per persona
- **Simulation**: Test persona with simulated input
- **Knowledge**: Upload, reindex, stats
- **Surveys/Ratings/Follow-ups**: Full CRUD
- **Bots**: Multi-instance management
- **Integrations**: Multi-key management
- **Settings**: DB-backed runtime config

## Key Concepts

### Cognitive Intelligence Pipeline
Every message is analyzed for:
- **Emotion**: happy, frustrated, confused, excited, sad, angry, anxious, curious, neutral
- **Intent**: purchase, support, information, complaint, chitchat, scheduling, feedback, cancellation
- **Churn Risk**: 0-1 probability of user leaving
- **Conversion Probability**: 0-1 probability of conversion
- **Engagement Score**: 0-1 engagement level
- **Suggested Action**: retain_user, convert_lead, escalate_support, etc.

This context is injected into the system prompt, making the AI emotion-aware and intent-aware.

### Goal Stack
Hierarchical goals (strategic → tactical → operational) with progress tracking, target metrics, and parent-child relationships. Injected into system prompt so the AI knows active objectives.

### Conversation Stages
Configurable funnel stages per persona (greeting → discovery → engagement → conversion → retention). Users advance through stages automatically or manually.

### Organizational Memory
Business knowledge stored in categories (products, services, pricing, team, policies, FAQ, processes, brand, market). Searched by keywords and injected into context.

### Gamification
XP with level thresholds, daily streaks with best streak tracking, badges (auto-awarded), leaderboard. All per persona.

### Progress State
Free-form JSON state per user+persona. Track mastery, weak topics, learning style, engagement metrics, or any domain-specific data.

### Human Override
Three modes: **full** (human takes over), **approval** (human approves responses), **observation** (human watches). Per session.

### Self-Optimization
The system analyzes patterns and generates actionable suggestions: tone adjustments, retention strategies, engagement improvements, automation recommendations.

## Licença

MIT — Use, modifique, compartilhe.

---

**Documentação completa**: [`AGENTS.md`](AGENTS.md) | **Framework**: [`META_FRAMEWORK.md`](META_FRAMEWORK.md) | **Créditos**: [`CREDITS.md`](CREDITS.md)