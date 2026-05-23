# AGENTS.md (Optimized Version)

## Project: MetaPersona.AI - Cognitive Operating System for AI Agents

Platform for persistent cognitive agents with multimodal RAG, multi-persona with Meta-RAG, automatic onboarding, real-time cognition, gamification, event bus, blueprints, and full operational management. Serves any niche - religious, health, education, business, coaching, sales, fitness, legal.

## Tech Stack
- **Backend**: Node.js 18+ + Express
- **Database**: MySQL 8.4 (mysql2/promise)
- **LLM**: Ollama Cloud API (native `/chat` endpoint) - Kpalabz Ultra, multi-key fallback, tool calling via native Ollama format
- **RAG**: Hybrid TF-IDF + Vector Embeddings (Ollama embeddings, MySQL vector storage)
- **Persona**: Multi-persona with Meta-RAG, configurable/creatable skills, whitelabel
- **Agent**: Agentic tasks, calendar, CRM/contacts, automations, goals, conversation stages, org memory, history, dashboard
- **Auth**: JWT + bcrypt + Google OAuth + role-based access (guest/user/premium/admin/banned) + rate limiting per role

## Architecture

### Core Flow
```
User message → Rate limit check + Ban check
             → Onboarding check (new user? → ask questions)
             → Persona resolution (session → user → default)
             → Chat command? → handleChatCommand
             → Extract context + Search knowledge (persona-aware) + Build memory + Build profile
             → Build goal context + Search org memory + Get conversation stage
             → buildSystemPrompt(persona, lang, context, memory, profile, name, isGroup, knowledgeSources)
             → LLM call via IntegrationManager (with tools if enabled)
             → Tool calls loop (up to 5 rounds): execute tools, push results as role:tool, retry LLM
             → CJK check → Save message → Auto follow-up scheduling
             → Return response + sources + persona info + ttsVoice
```

### LLM Integration Architecture
IntegrationManager.callLLM() uses callWithFallback() for multi-key failover, auto-detects Ollama vs Kpalabz-compatible by URL pattern, handles both response formats transparently.

### Multi-Persona + Meta-RAG
/persona create <description> → LLM generates FULL persona config
/persona <id> → switch per-session, per-user, or per-bot-instance
Meta-RAG: creates personas from any description - biblical figure, health coach, business consultant, teacher, etc.

### Agentic System
Tasks, Calendar, CRM/Contacts, Automations, Goals, Stages, Org Memory, History, Dashboard - all via LLM tools

### RAG Knowledge (Hybrid TF-IDF + Vector Embeddings)
Knowledge Sources: Bible verses (JSON), PDF documents, DOCX documents, Images (OCR), Audio (STT), Plain text/Markdown, JSON data, API endpoints
Hybrid Search: TF-IDF (fast exact match) + Vector (Ollama embeddings, 768d) stored in MySQL

### Database Schema (Key Tables)
- **users** - id, email, password, name, google_id, avatar, role (guest/user/premium/admin/banned), persona_id
- **personas** - persona_id, name, identity (JSON), knowledge_sources (JSON), is_active
- **persona_tasks** - id, persona_id, owner_id, title, description, status, priority, due_date
- **persona_calendar** - id, persona_id, owner_id, title, description, event_type, start_time, end_time
- **persona_contacts** - id, persona_id, owner_id, name, email, phone, company, role, stage
- **persona_automations** - id, persona_id, owner_id, name, trigger_type, action_type
- **persona_goals** - id, persona_id, owner_id, title, description, goal_type, status, progress
- **event_log** - id, event_type, user_id, persona_id, data (JSON), results (JSON)

## Admin API Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/personas` | List all personas |
| POST | `/api/admin/personas` | Create persona |
| POST | `/api/admin/personas/generate` | Generate persona via Meta-RAG LLM |
| PUT | `/api/admin/personas/:id` | Update persona |
| DELETE | `/api/admin/personas/:id` | Delete persona |
| GET | `/api/admin/tasks` | List tasks |
| POST | `/api/admin/tasks` | Create task |
| PUT | `/api/admin/tasks/:id` | Update task |
| DELETE | `/api/admin/tasks/:id` | Delete task |
| GET | `/api/admin/calendar` | List events |
| POST | `/api/admin/calendar` | Create event |
| PUT | `/api/admin/calendar/:id` | Update event |
| DELETE | `/api/admin/calendar/:id` | Delete event |

## Public API Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Chat (JSON response, rate-limited, persona-aware, returns ttsVoice) |
| POST | `/api/chat/stt` | Speech-to-text |
| POST | `/api/chat/tts` | Text-to-speech |
| POST | `/api/chat/rating` | Submit rating |
| GET | `/api/chat/personas` | List personas |
| POST | `/api/chat/persona/switch` | Switch persona |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/google` | Google OAuth |

## Key File Structure
- `src/chat/engine.js` - Central chat engine (rate limit, onboarding, persona-aware RAG, tools, agentic loop)
- `src/auth/index.js` - Auth core (register, login, Google OAuth, JWT, role-based, createUser)
- `src/persona/manager.js` - Multi-persona with DB persistence
- `src/persona/meta-rag.js` - Meta-RAG persona generation
- `src/agent/index.js` - Agentic system (tasks, calendar, contacts, automations, history, dashboard)
- `src/llm/tools.js` - LLM tool definitions (34+ tools)
- `src/llm/integrationManager.js` - Multi-key fallback for ALL integrations
- `src/knowledge/store.js` - Multi-source TF-IDF search
- `src/routes/admin.js` - Admin API (users, personas, skills, tasks, calendar, contacts, automations, goals)
- `src/routes/chat.js` - Chat API (JSON response, personas, TTS with voice, ratings, surveys, onboarding)

## User Roles & Access Levels
| Role | Chat | Admin API | Custom Persona | Onboarding |
|---|---|---|---|---|
| guest | 5 msg/day | No | No | Yes |
| user | 30 msg/day | No | Via session | Yes |
| premium | 100/day | No | Yes | Yes |
| admin | 999/day | Full | Yes | Skip |

## Critical Constraints
- `pdf-parse` must be v1.1.1 - v2.x has breaking API changes
- MySQL `LIMIT ? OFFSET ?` with `pool.execute()` fails - must interpolate as `${Number(limit)}`
- Persona IDs preserve original format including hyphens
- `switchPersona()` clears message history to prevent persona contamination
- Meta-persona (id: "meta-persona") has ALL tools enabled