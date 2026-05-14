<div align="center">

# MetaPersona.AI

## Cognitive Operating System for AI Agents

**Build AI agents that learn, operate, and evolve.**

Persistent. Cognizant. Goal-oriented. Whitelabel-ready.

[![License: MIT](https://img.shields.io/badge/License-MIT-c9a227.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1.svg)](https://www.mysql.com/)

</div>

---

## What can it build?

| | |
|---|---|
| **AI Tutors** — ENEM prep, language learning, study plans with progress tracking | **AI SDRs** — Lead qualification, objection handling, CRM integration, funnel stages |
| **AI Coaches** — Fitness, nutrition, hypnotherapy with gamification and streaks | **AI Receptionists** — Multi-channel (WhatsApp, Telegram, Web), scheduling, contacts |
| **AI Influencers** — Persistent personality, content generation, audience engagement | **AI Sales Agents** — Pipeline management, follow-up automation, conversion tracking |
| **AI Support Teams** — Cognitive routing, churn detection, human escalation | **AI Companions** — Memory, emotional awareness, evolving relationship |

Every agent gets: **memory + goals + cognition + skills + personality + voice**.

---

## The Meta-Persona

The meta-persona is the orchestrator. You describe what you need, she builds it.

```
User: "Create an AI tutor for ENEM prep"

    ↓ Meta-Persona creates everything ↓

✓ Persona with domain expertise
✓ Onboarding questions (grade, subjects, goals)
✓ Knowledge sources (study material)
✓ Conversation stages (assessment → study → practice → review)
✓ Goal hierarchy (pass ENEM → score 700+ → master weak areas)
✓ Gamification (XP per question, study streaks, level system)
✓ Progress state (weak topics, mastery level, learning style)
✓ Follow-up automations (daily study reminders)
✓ WhatsApp/Telegram bot with persona voice
```

No code. No config files. Just conversation.

---

## Runtime Architecture

```
                        ┌─────────────────────┐
                        │   Meta-Persona       │
                        │   (Orchestrator)     │
                        └──────────┬──────────┘
                                   │
                        ┌──────────▼──────────┐
                        │   Agent Runtime      │
                        │   Perceive → Think   │
                        │   → Decide → Act     │
                        └──────────┬──────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   ┌──────▼──────┐        ┌───────▼───────┐       ┌───────▼───────┐
   │  Cognitive   │        │  Memory Layer  │       │  Goal Stack   │
   │  Layer       │        │                │       │               │
   │  Emotion     │        │  Session       │       │  Strategic    │
   │  Intent      │        │  Profile        │       │  Tactical     │
   │  Churn Risk  │        │  Org Memory    │       │  Operational  │
   │  Engagement  │        │  Progress      │       │  Hierarchy    │
   └──────┬──────┘        └───────┬───────┘       └───────┬───────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                        ┌──────────▼──────────┐
                        │  Context Compiler   │
                        │  8 layers injected  │
                        │  into system prompt │
                        └──────────┬──────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   ┌──────▼──────┐        ┌───────▼───────┐       ┌───────▼───────┐
   │  RAG Layer   │        │  Skill Runtime │       │  Event Bus    │
   │  Multi-source│        │  Action         │       │  Reactive     │
   │  Per-persona  │        │  Generator      │       │  Triggers     │
   │  TF-IDF       │        │  Communication  │       │  Automations  │
   └──────────────┘        │  Workflow       │       │  Webhooks     │
                            └───────────────┘       └───────────────┘

          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   ┌──────▼──────┐        ┌───────▼───────┐       ┌───────▼───────┐
   │  Blueprint  │        │  Human Override │       │  Proactive    │
   │  System     │        │  Full           │       │  Engine       │
   │  Cloneable   │        │  Approval       │       │  Streak Rem.  │
   │  Templates   │        │  Observation    │       │  Goal Deadlines│
   └──────────────┘        └───────────────┘       └───────────────┘
```

### What makes this different from a chatbot wrapper?

| Layer | Chatbot Wrapper | MetaPersona.AI |
|-------|----------------|----------------|
| **Memory** | Last N messages | Session + Profile + Org Memory + Progress State |
| **Goals** | None | Hierarchical goal stack injected into every response |
| **Cognition** | None | Emotion, intent, churn risk, engagement — real-time |
| **Identity** | System prompt | Full persona config in 3 languages with genome |
| **Autonomy** | None | Tasks, calendar, CRM, automations, skills |
| **Evolution** | None | Self-optimization, progress tracking, stage advancement |
| **Observability** | None | Agent thought log, cognitive states, suggestions |
| **Control** | None | Human override (full/approval/observation) |
| **Scalability** | None | Blueprint system — clone personas from templates |
| **Events** | None | Event bus — reactive triggers on goals, badges, churn |

---

## Core Concepts

### Cognitive Intelligence Pipeline
Every message is analyzed for emotion, intent, churn risk, conversion probability, and engagement. The AI **adapts its behavior in real time** — not just responding, but perceiving the human's state and adjusting tone, approach, and urgency.

### Agent Runtime Loop
The core loop is: **Perceive → Think → Decide → Act → Reflect**.
Each message triggers context compilation (8 layers), tool execution (29 tools for meta-persona), and thought logging. The AI doesn't just respond — it reasons, acts, and remembers.

### Goal Stack
Hierarchical goals (strategic → tactical → operational) with progress tracking, target metrics, and parent-child relationships. Active goals are injected into every system prompt — the AI always knows what it's working toward.

### Conversation Stages
Configurable funnel stages per persona (greeting → discovery → engagement → conversion → retention). Users advance through stages based on behavior or manually. The AI knows where each user is in the journey.

### Organizational Memory
Business knowledge in 10 categories (products, services, pricing, team, policies, FAQ, processes, brand, market, custom). Searched by keywords and injected into context. This is not RAG of documents — it's the company's **operational brain**.

### Blueprint System
Cloneable persona templates. Create a blueprint from any persona, clone it as a new persona with overrides, or apply it to an existing persona. 5 official blueprints seeded: Coach de Vendas, Hipnoterapeuta, Tutor ENEM, Consultor Imobiliário, Nutricionista.

### Event Bus
Reactive triggers for key lifecycle events: goal completed, stage advanced, badge earned, level up, churn risk high, XP milestone, cognitive state change. Events can trigger automations, send webhooks, create tasks, or send messages — making the system **feel alive**.

### Gamification
XP (30 levels), daily streaks, badges (auto-awarded), leaderboard — all per persona. The AI adapts tone for level-ups and streaks because gamification data is injected into every system prompt.

### Progress State
Free-form JSON state per user+persona. Track mastery, weak topics, learning style, funnel position, or any domain-specific data. The AI uses this to personalize every interaction.

### Self-Optimization
The system analyzes its own patterns — emotion distribution, churn risk averages, engagement levels, tool usage — and generates actionable suggestions for persona improvement.

### Human Override
Three modes per session: **full** (human takes over entirely), **approval** (human approves before sending), **observation** (human watches logs). Essential for enterprise trust.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
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

---

## Quick Start

```bash
git clone https://github.com/anomalyco/metapersona-ai.git
cd metapersona-ai
npm install
cp .env.example .env
# Configure OLLAMA_API_KEY in .env
npm run ingest   # First time: index knowledge corpus
npm start        # or npm run dev
```

Access `http://localhost:3000` | Admin: `http://localhost:3000/admin`

### Kokoro TTS (natural voice)
```bash
npm run tts:install   # Install Python dependencies
npm run tts:start     # Start Kokoro server on port 8001
```

### Prerequisites
1. **MySQL 8.4** on localhost (root, no password, database `metapersona_ai`)
2. **OLLAMA_API_KEY** in `.env`
3. `npm run ingest` before first use
4. Schema auto-created on startup (41 tables)
5. **Kokoro TTS** (optional): `npm run tts:install` → `npm run tts:start`

---

## Modules

| Module | File | Description |
|--------|------|-------------|
| Chat Engine | `src/chat/engine.js` | Rate limit, onboarding, persona-aware RAG, tools, cognitive, override, event emission |
| Persona Manager | `src/persona/manager.js` | Multi-persona DB, cache, invalidation |
| Meta-RAG | `src/persona/meta-rag.js` | LLM persona generation, switchPersona |
| Agent | `src/agent/index.js` | Tasks, calendar, contacts, automations, history, dashboard |
| Skills | `src/skills/index.js` | Skills CRUD + invocation (action, generator, communication, analysis, workflow) |
| Goals | `src/goals/index.js` | Goal stack CRUD + hierarchy + progress + context injection |
| Stages | `src/stages/index.js` | Conversation stages + user tracking + context injection |
| Org Memory | `src/orgmemory/index.js` | Organizational memory CRUD + search + context injection |
| Gamification | `src/gamification/index.js` | XP, levels (30), streaks, badges, leaderboard |
| Progress | `src/progress/index.js` | Per-user progress state (JSON key-value per persona) |
| Cognitive | `src/cognitive/index.js` | Emotion/intent detection, churn risk, engagement, event emission |
| Override | `src/override/index.js` | Human override (full/approval/observation per session) |
| Thoughts | `src/thoughts/index.js` | Agent thought log (tools, context, reasoning, response time) |
| Optimization | `src/optimization/index.js` | Self-optimization suggestions based on patterns |
| Proactive | `src/proactive/index.js` | Cron-based proactive intelligence (streaks, goals, automations) |
| Events | `src/events/index.js` | Event bus (on_goal_completed, on_badge_earned, on_churn_risk_high, etc.) |
| Blueprints | `src/blueprints/index.js` | Cloneable persona templates, CRUD, clone, seed |
| LLM Tools | `src/llm/tools.js` | 29 tool definitions + execution logic |
| Integration Mgr | `src/llm/integrationManager.js` | Multi-key fallback for all integrations |
| Knowledge | `src/knowledge/` | TF-IDF RAG, multimodal ingestion, per-persona sources |
| Auth | `src/auth/` | JWT, bcrypt, Google OAuth, role-based, rate limiting |
| Onboarding | `src/onboarding/index.js` | State machine (3 langs, configurable steps) |
| Survey | `src/survey/index.js` | Surveys, ratings, follow-ups |
| TTS | `src/tts/` | Kokoro + Edge TTS + Google Translate fallback |
| STT | `src/stt/` | Groq Whisper + OpenAI Whisper fallback |
| i18n | `src/i18n/index.js` | pt-BR, en-US, es-ES |
| Settings | `src/settings/index.js` | DB-backed runtime settings + whitelabel |
| DB | `src/db/index.js` | MySQL pool + 41 tables + auto-migration |

---

## Event Bus

| Event | Triggered When |
|-------|---------------|
| `on_goal_completed` | A goal status changes to "completed" |
| `on_goal_created` | A new goal is created |
| `on_stage_advance` | A user advances to a new conversation stage |
| `on_badge_earned` | A gamification badge is auto-awarded |
| `on_level_up` | A user reaches a new XP level |
| `on_churn_risk_high` | Cognitive analysis detects churn risk > 60% |
| `on_cognitive_change` | User's emotional state changes between messages |
| `on_xp_milestone` | User crosses an XP milestone (100, 500, 1000, 5000, 10000) |
| `on_message_sent` | Every message (for automation triggers) |
| `on_user_created` | New user created (onboarding) |
| `on_automation_triggered` | An automation fires |
| `on_override_activated` | Human override is activated for a session |

Events can trigger automations (messages, tasks, webhooks, persona switches, skills, emails).

---

## LLM Tools (29)

| Tool | Description |
|------|-------------|
| `bible_lookup` | Search knowledge sources |
| `user_stats` | User statistics |
| `get_daily_devotional` | Daily devotional content |
| `send_prayer_request` | Register prayer request |
| `list_sessions` | List user sessions |
| `update_settings` | Update settings (admin) |
| `manage_users` | User management (admin) |
| `send_email_to_user` | Send email (admin) |
| `create_persona` | Create persona via LLM |
| `list_personas` | List personas |
| `create_skill` | Create skill |
| `invoke_skill` | Invoke a skill |
| `list_skills` | List skills |
| `add_knowledge_source` | Add knowledge source |
| `manage_tasks` | CRUD tasks |
| `manage_calendar` | CRUD calendar events |
| `manage_contacts` | CRUD contacts/CRM |
| `manage_automations` | CRUD automations |
| `manage_goals` | CRUD hierarchical goals |
| `manage_conversation_stages` | CRUD conversation stages |
| `manage_org_memory` | CRUD organizational memory |
| `manage_xp` | Gamification (XP, streaks, badges) |
| `manage_progress` | Custom progress state |
| `get_cognitive_state` | Emotion, intent, churn risk, engagement |
| `human_override` | Human intervention in conversation |
| `get_suggestions` | Self-optimization suggestions |
| `get_dashboard` | Dashboard stats |
| `get_history` | Conversation history |
| `manage_blueprints` | Manage persona blueprints (list, clone, apply, create) |

---

## Blueprint System

Personas can be saved as **cloneable templates** (blueprints). Each blueprint stores the full persona config (identity, rules, voice, keywords, commands) and can be:

- **Cloned** as a new persona with optional name overrides
- **Applied** to an existing persona (merge template into current config)
- **Created from** any existing persona

5 official blueprints are seeded on first startup:
1. **Coach de Vendas** — Sales coach with funnel, objection handling, CRM
2. **Hipnoterapeuta** — Hypnotherapy with safety rules, Ericksonian techniques
3. **Tutor ENEM** — Exam prep with study techniques, progress tracking
4. **Consultor Imobiliário** — Real estate with market knowledge, legal compliance
5. **Nutricionista** — Nutrition with clinical safety, evidence-based recommendations

---

## Database Schema (41 tables)

**Core**: `users`, `sessions`, `messages`, `profiles`, `settings`, `api_keys`

**Content**: `posts`, `comments`, `feedback`, `newsletter_subscribers`, `contact_messages`

**Persona**: `personas`, `persona_skills`, `persona_messages`, `mcp_servers`

**Agent**: `persona_tasks`, `persona_calendar`, `persona_contacts`, `persona_automations`

**Intelligence**: `persona_goals`, `persona_conversation_stages`, `persona_user_stages`, `persona_org_memory`

**Engagement**: `surveys`, `survey_responses`, `ratings`, `follow_ups`, `bot_instances`, `onboarding_steps`, `user_onboarding`

**Cognitive**: `cognitive_states`, `human_overrides`, `agent_thoughts`

**Gamification**: `user_xp`, `user_xp_log`, `user_progress`

**Blueprints**: `persona_blueprints`

**Events**: `event_log`

**Rate Limiting**: `rate_limits`

---

## Whitelabel

Every persona can have its own brand. Global settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `brand_name` | (empty) | Brand name (overrides persona name in UI) |
| `brand_tagline` | (empty) | Tagline on landing page |
| `brand_logo_url` | (empty) | Logo URL |
| `brand_primary_color` | (empty) | Primary hex color |
| `brand_secondary_color` | (empty) | Secondary hex color |
| `onboarding_enabled` | true | Enable/disable onboarding |
| `rate_limit_guest` | 5 | Guest daily message limit |
| `rate_limit_user` | 30 | User daily message limit |
| `rate_limit_premium` | 100 | Premium daily message limit |
| `rate_limit_admin` | 999 | Admin daily message limit |
| `message_chunk_size` | 200 | Max chars per text/audio chunk |

---

## License

MIT — Use, modify, share.

---

**Full Documentation**: [`AGENTS.md`](AGENTS.md) | **Credits**: [`CREDITS.md`](CREDITS.md)