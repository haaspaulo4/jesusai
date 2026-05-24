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
| **AI Stores** — Autonomous e-commerce with catalog, cart, delivery, loyalty, broadcasts | **AI Consultants** — B2B prospecting, financial reports, customer recovery, delivery tracking |

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
                        │   Synapse Engine     │
                        │   Diagnostics &      │
                        │   Context Tracking   │
                        └──────────┬──────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
     ┌──────▼──────┐       ┌───────▼───────┐      ┌───────▼───────┐
     │  Cognitive   │       │ Memory Layer  │      │  Goal Stack   │
     │  Layer       │       │               │      │               │
     │  Emotion     │       │ Session       │      │  Strategic    │
     │  Intent      │       │ Profile       │      │  Tactical    │
     │  Churn Risk  │       │ Org Memory    │      │  Operational │
     │  Engagement  │       │ Progress      │      │  Loyalty     │
     └──────┬──────┘       └───────┬───────┘      └───────┬───────┘
            │                      │                      │
            └──────────────────────┼──────────────────────┘
                                   │
                        ┌──────────▼──────────┐
                        │  Context Compiler   │
                        │  9 layers injected  │
                        │  into system prompt │
                        └──────────┬──────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
     ┌──────▼──────┐       ┌───────▼───────┐      ┌───────▼───────┐
     │  RAG Layer   │       │ Skill Runtime │      │  Event Bus    │
     │  Multi-source│       │ Action        │      │  Reactive     │
     │  Per-persona │       │ Generator     │      │  Triggers     │
     │  TF-IDF      │       │ Communication │      │  Automations  │
     │  + Embeddings│       │ Workflow      │      │  Webhooks     │
     └──────────────┘       └───────────────┘      └───────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
     ┌──────▼──────┐       ┌───────▼───────┐      ┌───────▼───────┐
     │  Blueprint  │       │ Human Override│      │  Proactive    │
     │  System     │       │ Full          │      │  Engine       │
     │  Cloneable  │       │ Approval      │      │  Streak Rem.  │
     │  Templates  │       │ Observation   │      │ Goal Deadlines│
     └──────────────┘       └───────────────┘      └───────────────┘
```

### What makes this different from a chatbot wrapper?

| Layer | Chatbot Wrapper | MetaPersona.AI |
|-------|----------------|----------------|
| **Memory** | Last N messages | Session + Profile + Org Memory + Progress State |
| **Goals** | None | Hierarchical goal stack injected into every response |
| **Cognition** | None | Emotion, intent, churn risk, engagement — real-time |
| **Identity** | System prompt | Full persona config in 3 languages with genome |
| **Autonomy** | None | Tasks, calendar, CRM, automations, skills, commerce |
| **Evolution** | None | Self-optimization, progress tracking, stage advancement |
| **Observability** | None | Agent thought log, cognitive states, suggestions |
| **Control** | None | Human override (full/approval/observation) |
| **Scalability** | None | Blueprint system — clone personas from templates |
| **Events** | None | Event bus — reactive triggers on goals, badges, churn |
| **Loyalty** | None | Points, cashback, stamp cards, rewards, per-persona |
| **Commerce** | None | Full cart, delivery zones, coupons, loyalty integration |
| **Diagnostics** | None | **Synapse Engine** tracking 7 context layers & quality |

---

## Core Concepts

### Synapse Engine
The new diagnostic and execution backbone of MetaPersona. It introduces a 7-layer structure (L0-L7) that handles everything from global constitution rules to keyword overrides. The Synapse Engine provides real-time observability of token usage, execution timing, and cognitive coherence across the system.

### Jarvis Cockpit & Companion Classic (Pet)
Dual frontend architecture:
1. **Jarvis Cockpit**: A full-fledged web UI dashboard for orchestrating agents, configuring the environment, and managing the AI's operations directly from your browser.
2. **Companion Classic (Pet)**: An Electron-based desktop widget with a **3D Neural Link Brain** (Three.js) that acts as a floating, context-aware companion. The brain features MeshPhysicalMaterial with clearcoat, cinematic 3-point lighting, holographic atmosphere layers, energy tendrils, and a Neural Link crown with electrode nodes, signal traces, and a processor chip with blinking LEDs — all responding to persona state (idle, thinking, speaking, etc.) via smooth color/animation transitions. 

### Conclave System
A multi-agent discussion architecture. The AI can instantiate a `conclave` where specialized sub-agents debate complex problems, critique solutions, and synthesize a master plan before taking action. It's essentially "Chain of Thought" powered by multiple distinct personas.

### Cognitive Intelligence Pipeline
Every message is analyzed for emotion, intent, churn risk, conversion probability, and engagement. The AI **adapts its behavior in real time** — not just responding, but perceiving the human's state and adjusting tone, approach, and urgency.

### Goal Stack
Hierarchical goals (strategic → tactical → operational) with progress tracking, target metrics, and parent-child relationships. Active goals are injected into every system prompt — the AI always knows what it's working toward.

### Conversation Stages
Configurable funnel stages per persona (greeting → discovery → engagement → conversion → retention). Users advance through stages based on behavior or manually. The AI knows where each user is in the journey.

### Organizational Memory
Business knowledge in 10 categories (products, services, pricing, team, policies, FAQ, processes, brand, market, custom). Searched by keywords and injected into context. This is not RAG of documents — it's the company's **operational brain**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ / Express |
| Desktop Widget | Electron.js + Three.js (Neural Link Brain) |
| Database | MySQL 8.4 (mysql2/promise) |
| LLM | Ollama Cloud API (native `/chat`, multi-key fallback, tool calling) |
| RAG | Hybrid TF-IDF + Vector Embeddings (Ollama, MySQL vector storage) |
| Fulltext | FlexSearch — in-memory fulltext across entities |
| Auth | JWT + bcrypt + Google OAuth + role-based + rate limiting |
| Bots | Multi-instance Telegram + **WhatsApp (Evolution API v2)** + Instagram |
| TTS | Kokoro-82M (30+ languages) + Edge TTS + Google Translate (fallback) |
| STT | Whisper Local (faster-whisper/whisper.cpp) + Groq Whisper + OpenAI Whisper |
| i18n | pt-BR, en-US, es-ES (30+ TTS languages) |
| Jobs | BullMQ (Redis-backed) — proactive, ingestion, embedding, automation |

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

Access `http://localhost:3000` | Admin: `http://localhost:3000/admin` | Cockpit: `http://localhost:3000/cockpit/`

### Voice Setup

```bash
# Kokoro TTS (natural voice)
npm run tts:install   # Install Python dependencies
npm run tts:start     # Start Kokoro server on port 8001

# Whisper STT (local speech-to-text)
npm run whisper:setup  # Install faster-whisper + FastAPI
npm run whisper:start  # Start Whisper server on port 9000 (downloads model on first run)
```

---

## Modules

| Module | File | Description |
|--------|------|-------------|
| Chat Engine | `src/chat/engine.js` | Rate limit, onboarding, persona-aware RAG, tools, cognitive, override, commerce, loyalty context |
| **Synapse Engine**| `.synapse/` | L0-L7 layer architecture, context tracking, diagnostics, hook enforcement |
| **Claude Gov.** | `.claude/` | Rules, sub-agents (Architect, QA, UX), and git hooks for structural integrity |
| Persona Manager | `src/persona/manager.js` | Multi-persona DB, cache, invalidation |
| Meta-RAG | `src/persona/meta-rag.js` | LLM persona generation, switchPersona |
| Agent | `src/agent/index.js` | Tasks, calendar, contacts, automations, history, dashboard |
| Skills | `src/skills/index.js` | Skills CRUD + invocation (5 types) |
| Goals | `src/goals/index.js` | Goal stack CRUD + hierarchy + progress + context injection |
| Stages | `src/stages/index.js` | Conversation stages + user tracking + context injection |
| Org Memory | `src/orgmemory/index.js` | Organizational memory CRUD + search + context injection |
| LLM Tools | `src/llm/tools.js` + `src/llm/erp-tools.js` | 80+ tool definitions (Base + ERP + Commerce + Automation + Conclave) |
| Integration Mgr | `src/llm/integrationManager.js` | Multi-key fallback, Ollama/Groq auto-detect, normalizeLLMResponse |
| WhatsApp | `src/whatsapp/` | **Evolution API v2** complete integration with parser and sender |
| TTS | `src/tts/` | Kokoro (30+ languages, 35+ voices) + Edge TTS + Google Translate |
| STT | `src/stt/` | Whisper Local (faster-whisper + whisper.cpp) + Groq + OpenAI |

---

## LLM Tools (80+)

### Base & Automation Tools

| Tool | Description |
|------|-------------|
| `create_persona` | Create persona via Meta-RAG |
| `invoke_skill` | Invoke a specific skill |
| `manage_tasks` | CRUD tasks |
| `manage_calendar` | CRUD calendar events |
| `manage_contacts` | CRUD contacts/CRM |
| `get_dashboard` | Dashboard stats |
| `automation_macro` | Run RPA macros and automated scripts |
| `conclave_debate` | Spawn a multi-agent debate to synthesize a strategy |
| `vision_analyze` | Analyze images and visual context |

*(and over 70 more tools for ERP, B2B prospecting, Commerce, Loyalty, Delivery and Education)*

---

## WhatsApp Commerce (Evolution API v2)

Complete commerce system for selling products via WhatsApp, powered by the new Evolution API v2 backend for robust multi-device management and webhook integration.

```
Customer: "Quero um sorvete de pistache e uma Coca 2L"
    ↓ LLM detects product interest
    ↓ catalog_search → finds Sorvete Lamello (R$25) + Coca-Cola 2L (R$15)
    ↓ commerce_add_to_cart → adds both items (session_id auto-injected)

Customer: "Vai ser no dinheiro, troco pra 100"
    ↓ commerce_set_payment → cash, change_for: 100
    ↓ Total R$65 + R$7 delivery = R$72, troco: R$28

Customer: "Sim, confirmar"
    ↓ commerce_finalize_order → creates order ORD-260519-0001
    ↓ Deducts stock, earns loyalty points, sends formatted receipt
```

### Key Features
- **Persona-aware product search**: `catalog_search` filters by `persona_id`
- **Evolution API Integration**: Native integration for media, audio, and location sharing
- **Loyalty integration**: auto-earn points/cashback on order finalization

---

## Chat Commands (80+)

| Command | Description |
|---------|-------------|
| `/persona` | List/switch personas |
| `/voice` | List/switch TTS voice (30+ languages) |
| `/xp` | XP, level, streak, badges, leaderboard |
| `/fidelidade` | Loyalty program balance, history, redemption |
| `/relatorios` | Financial reports (vendas, produtos, tendencia, funil) |
| `/broadcast` | Create and send mass campaigns |
| `/dashboard` | Dashboard overview |
| `/conclave` | Initiate a multi-agent debate |
| `/search` | Knowledge search |
| `/audio` / `/texto` | Toggle audio responses |

---

## License

MIT — Use, modify, share.

---

**Full Documentation**: [`AGENTS.md`](AGENTS.md) | **Project Spec**: [`PROJETO-LOJA-AUTONOMA.md`](PROJETO-LOJA-AUTONOMA.md) | **Credits**: [`CREDITS.md`](CREDITS.md)