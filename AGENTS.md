# AGENTS.md

## Project: Jesus.AI — Whitelabel AI Platform

Plataforma whitelabel de assistentes virtuais com RAG multimodal, multi-persona com Meta-RAG, onboarding automático, e gestão completa. Serve qualquer nicho — religioso, saúde, educação, negócios, etc.

**Arquitetura:** Tudo é gerenciável via admin API, chat commands, ou painel web. Personas definem identidade, skills, conhecimento, onboarding, follow-ups, e marca whitelabel.

## Tech Stack
- **Backend**: Node.js 18+ + Express
- **Database**: MySQL 8.4 (via mysql2/promise)
- **LLM**: Ollama Cloud API (OpenAI-compatible) — model glm-5.1, **multi-key fallback automático**
- **RAG**: Pluggable TF-IDF + multimodal ingestion (PDF, DOCX, images/OCR, audio/STT, JSON, text, APIs)
- **Persona**: **Multi-persona com Meta-RAG** — criar via LLM, trocar com `/persona`, skills configuráveis, whitelabel
- **Onboarding**: State machine automático — novo usuário → pergunta nome, interesse, sentimento, email
- **Follow-ups**: Automático por intervalo de mensagens ou agendado
- **Auth**: JWT + bcrypt + Google OAuth + **role-based access (guest/user/premium/admin/banned)** + **rate limiting per role**
- **Bots**: Multi-instance Telegram + WhatsApp via bot manager, cada um com persona própria
- **STT**: Groq Whisper (primary) + OpenAI Whisper (fallback) + web mic input
- **TTS**: Kokoro-82M (default) + Edge TTS (fallback) + Google Translate (fallback)
- **Surveys**: CRUD completo com triggers (after_messages, after_session, manual)
- **Ratings**: 1-5 stars com categorias e feedback
- **Blog**: Auto-generated daily devotionals via LLM
- **Email**: Nodemailer (SMTP) — newsletter, contact, daily devotional
- **i18n**: pt-BR (default), en-US, es-ES
- **Whitelabel**: brand_name, brand_tagline, brand_logo_url, brand_primary_color, brand_secondary_color — tudo via settings

## Commands
- `npm start` — Start the server (initializes DB schema automatically)
- `npm run dev` — Start with watch mode
- `npm run ingest` — Ingest knowledge sources into TF-IDF index
- `npm run ngrok` — Start Cloudflare tunnel and configure Evolution API webhook

## Prerequisites
1. MySQL 8.4 running on localhost (root, no password, database `jesus_ai`)
2. Ollama Cloud API key in `.env`
3. Run `npm run ingest` before first use
4. DB schema auto-created and migrated on startup
5. (Recommended) Kokoro TTS: `npm run tts:install` then `npm run tts:start`

## Architecture

### Core Flow
```
User message → Rate limit check + Ban check
             → Onboarding check (new user? → ask questions)
             → Persona resolution (session → user → default)
             → Chat command? → handleChatCommand
             → Extract context + Search knowledge + Build memory + Build profile
             → buildSystemPrompt(persona, lang, ...)
             → LLM call via IntegrationManager (with tools if enabled)
             → Tool calls loop (bible_lookup, user_stats, etc.)
             → CJK check → Save message → Auto follow-up scheduling
             → Return response + sources + persona info
```

### Onboarding System (Whitelabel)
```
New user → shouldOnboard(uid) → returns next step question
User answers → processOnboardingAnswer(uid, message) → save to profile + DB
              → next step? → return question
              → done? → welcome message from persona
Steps are configurable via /api/admin/onboarding or DB:
  - name, interest, feeling, email, custom steps
  - each step: question (3 langs), field_type (text/choice/email/phone/number), required
  - auto-creates user if needed (for bot users)
```

### Multi-Persona + Meta-RAG
```
/persona create <description> → LLM generates FULL persona config (identity, rules, commands, topics, TTS voice, etc.)
/persona <id> → switch per-session, per-user, or per-bot-instance
Meta-RAG: uses LLM to create personas from any description — biblical figure, health coach, business consultant, teacher, etc.
Each persona can have: own knowledge sources, skills, onboarding questions, follow-up style, brand whitelabel
```

### RAG Knowledge (Multimodal + APIs)
```
Knowledge Sources (configurable per persona):
  - Bible verses (JSON, built-in)
  - PDF documents → text extraction via pdf-parse
  - DOCX documents → text extraction via mammoth
  - Images → OCR via Tesseract
  - Audio → STT transcription via Groq/OpenAI Whisper
  - Plain text / Markdown
  - JSON data (structured)
  - API endpoints → fetch + cache → index

Ingestion: npm run ingest → reads all configured sources → TF-IDF index
Per-persona: personas.knowledge_sources selects which sources to search
Admin: /api/admin/knowledge/reindex, /api/admin/knowledge (stats)
Upload: POST /api/admin/knowledge/upload (PDF, DOCX, image, audio, text, JSON)
```

### Survey + Rating + Follow-up System
```
Surveys: CRUD via /api/admin/surveys, triggers: after_messages, after_session, manual
  - Questions: rating, text, choice — configurable per survey
  - Responses stored in survey_responses table

Ratings: POST /api/chat/rating (web/telegram/whatsapp)
  - Categories: general, spiritual, response_quality, empathy
  - Stats via /api/admin/ratings or /ratings command

Follow-ups: Auto-created every N messages (configurable)
  - Types: spiritual_check, daily_devotional, prayer_request, custom
  - Status: pending → sent → completed
  - Admin: /api/admin/followups, /followups command
```

### Multi-Bot System
```
Bot instances stored in bot_instances table
Each instance has: platform (telegram/whatsapp), name, token, persona_id, config
API: /api/admin/bots — CRUD + start/stop
Manager: src/bot/manager.js — start, stop, list active bots
Handlers: src/telegram/handler.js, src/whatsapp/handler.js — factory pattern per instance
Each bot instance can use a different persona
```

### Rate Limiting & Access Control
```
Rate limits per role (configurable via settings):
  guest: 5 msgs/day, user: 30, premium: 100, admin: 999
Banned users get 403 immediately
Middleware: src/auth/rateLimit.js — checkRateLimit, rateLimitMiddleware
Applied in chat engine for all channels (web, telegram, whatsapp)
```

### Auth + JWT
```
JWT includes: { id, email, role }
Role middleware: authMiddleware → sets req.userId + req.userRole
roleMiddleware('admin') → 403 if not admin
Login/register/Google returns role in response
Onboarding: auto-creates user for bot users (ensureUser)
```

## Admin Chat Commands
| Command | Access | Description |
|---|---|---|
| `/admin` | admin | Admin dashboard |
| `/stats` | user | Your stats |
| `/myprofile` | user | Your profile |
| `/persona` | anyone | List personas |
| `/persona <id>` | anyone | Switch persona |
| `/persona create <desc>` | admin | Meta-RAG create persona |
| `/persona edit <id> <field> <value>` | admin | Edit persona |
| `/persona delete <id>` | admin | Delete persona |
| `/survey` | admin | Manage surveys |
| `/ratings` | admin | Rating stats |
| `/followups` | admin | Follow-up status |
| `/keys, /addkey, /removekey, /togglekey` | admin | Integration management |
| `/health` | anyone | Integration health |
| `/settings, /set` | admin | Settings management |
| `/users, /promote, /ban` | admin | User management |

## Admin API Endpoints
| Method | Path | Description |
|---|---|---|
| **Users** |||
| GET | `/api/admin/users` | List users (paginated, filterable) |
| GET | `/api/admin/users/:id` | Get user details |
| PUT | `/api/admin/users/:id/role` | Set user role |
| DELETE | `/api/admin/users/:id` | Delete user |
| **Personas (Meta-RAG)** |||
| GET | `/api/admin/personas` | List all personas |
| POST | `/api/admin/personas` | Create persona |
| POST | `/api/admin/personas/generate` | Generate persona via Meta-RAG LLM |
| PUT | `/api/admin/personas/:id` | Update persona |
| DELETE | `/api/admin/personas/:id` | Delete persona |
| POST | `/api/admin/personas/:id/toggle` | Enable/disable |
| POST | `/api/admin/personas/:id/activate` | Activate |
| POST | `/api/admin/personas/:id/deactivate` | Deactivate |
| **Surveys** |||
| GET | `/api/admin/surveys` | List surveys |
| POST | `/api/admin/surveys` | Create survey |
| GET | `/api/admin/surveys/:id` | Get survey |
| PUT | `/api/admin/surveys/:id` | Update survey |
| DELETE | `/api/admin/surveys/:id` | Delete survey |
| GET | `/api/admin/surveys/:id/responses` | Get responses |
| **Ratings** |||
| GET | `/api/admin/ratings` | List ratings with stats |
| **Follow-ups** |||
| GET | `/api/admin/followups` | List follow-ups |
| POST | `/api/admin/followups` | Create follow-up |
| POST | `/api/admin/followups/:id/send` | Mark as sent |
| **Bot Instances** |||
| GET | `/api/admin/bots` | List bot instances |
| GET | `/api/admin/bots/active` | List running bots |
| POST | `/api/admin/bots` | Add bot instance |
| PUT | `/api/admin/bots/:id` | Update bot |
| DELETE | `/api/admin/bots/:id` | Delete bot |
| POST | `/api/admin/bots/:id/start` | Start bot |
| POST | `/api/admin/bots/:id/stop` | Stop bot |
| POST | `/api/admin/bots/start-all` | Start all bots |
| **Integrations** |||
| GET/POST | `/api/admin/integrations` | List/add integrations |
| PUT/DELETE | `/api/admin/integrations/:id` | Update/remove |
| POST | `/api/admin/integrations/:id/toggle` | Enable/disable |
| POST | `/api/admin/integrations/:id/test` | Test health |
| **Knowledge (RAG)** |||
| GET | `/api/admin/knowledge` | Knowledge stats |
| POST | `/api/admin/knowledge/reindex` | Reindex |
| POST | `/api/admin/knowledge/upload` | Upload file (PDF, DOCX, image, audio, text) |
| **Settings** |||
| GET | `/api/admin/settings` | Get all settings |
| PUT | `/api/admin/settings` | Set a setting |
| **MCP** |||
| GET/POST | `/api/admin/mcp` | List/add MCP servers |
| DELETE | `/api/admin/mcp/:id` | Remove |
| POST | `/api/admin/mcp/:id/connect` | Connect |

## Public API Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Chat (JSON response, rate-limited, persona-aware) |
| POST | `/api/chat/stt` | Speech-to-text |
| POST | `/api/chat/tts` | Text-to-speech |
| POST | `/api/chat/rating` | Submit rating |
| GET | `/api/chat/personas` | List personas |
| POST | `/api/chat/persona/switch` | Switch persona |
| POST | `/api/chat/persona/create` | Meta-RAG create |
| GET | `/api/chat/persona/current` | Current persona |
| GET | `/api/chat/surveys/active` | Check active survey |
| POST | `/api/chat/surveys/:id/respond` | Submit survey response |
| GET | `/api/chat/followups/pending` | Check pending follow-up |
| POST | `/api/chat/followups/:id/respond` | Respond to follow-up |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/google` | Google OAuth |
| GET | `/api/auth/me` | Current user (with role) |

## Database Schema
- **users** — id, email, password, name, google_id, avatar, ollama_api_key, telegram_chat_id, role (guest/user/premium/admin/banned), persona_id
- **sessions** — id, user_id, user_name, user_context (JSON), summary, persona_id, timestamps
- **messages** — id, session_id, role, content, timestamp
- **profiles** — id, name, story, topics (JSON), emotions (JSON), spiritual_journey, prayer_requests (JSON)
- **posts** — slug (PK), title, topic, verse, content, sources (JSON), published_at
- **comments** — id, post_slug, parent_id, author_name, author_id, content, created_at
- **feedback** — id, type, message, user_id, session_id, created_at, status
- **settings** — setting_key (PK), setting_value (TEXT)
- **api_keys** — id, service_type, api_key, base_url, model, label, priority, is_active, extra_config (JSON)
- **personas** — persona_id (PK), name, identity (JSON), commands (JSON), knowledge_sources (JSON), tts_voice, tts_lang, model, priority, is_active
- **rate_limits** — id, user_id, service_type, request_count, window_start
- **surveys** — id, title, description, questions (JSON), is_active, trigger_type, trigger_config (JSON)
- **survey_responses** — id, survey_id, user_id, session_id, answers (JSON), completed_at
- **ratings** — id, user_id, session_id, message_id, rating, feedback, category, source, created_at
- **follow_ups** — id, user_id, session_id, type, question, response, status, scheduled_at, sent_at, responded_at, created_at
- **bot_instances** — id, platform, name, token, webhook_url, instance_name, persona_id, is_active, config (JSON)
- **onboarding_steps** — id, step_key, step_order, question, question_en, question_es, field, field_type, choices (JSON), required, is_active
- **user_onboarding** — id, user_id, step_key, answer, answered_at
- **mcp_servers** — id, name, command, args (JSON), env_vars (JSON), is_active, created_at

## Key File Structure
- `src/chat/engine.js` — Central chat engine (rate limit, onboarding, persona, tools, follow-ups)
- `src/auth/index.js` — Auth core (register, login, Google OAuth, JWT, role-based, createUser)
- `src/auth/rateLimit.js` — Rate limiting per role + ban enforcement
- `src/onboarding/index.js` — Onboarding state machine (whitelabel, 3 langs)
- `src/survey/index.js` — Surveys, ratings, follow-ups engine
- `src/persona/manager.js` — Multi-persona with DB persistence
- `src/persona/meta-rag.js` — Meta-RAG persona generation via LLM
- `src/persona/config.js` — Default persona definitions
- `src/bot/manager.js` — Multi-instance bot manager (Telegram + WhatsApp)
- `src/telegram/handler.js` — Telegram handler factory (persona per instance)
- `src/whatsapp/handler.js` — WhatsApp handler factory (persona per instance)
- `src/llm/integrationManager.js` — Multi-key fallback for ALL integrations
- `src/llm/tools.js` — AI tool definitions for function calling
- `src/settings/index.js` — Runtime settings (DB-backed, cached) with whitelabel configs
- `src/knowledge/config.js` — Knowledge source definitions (multimodal)
- `src/knowledge/store.js` — Pluggable TF-IDF search engine
- `src/knowledge/ingester.js` — Multi-source ingestion (PDF, DOCX, image, audio, JSON, text, API)
- `src/routes/admin.js` — Admin API (users, personas, surveys, ratings, follow-ups, bots, integrations, knowledge)
- `src/routes/chat.js` — Chat API (JSON response, personas, ratings, surveys, onboarding)
- `src/routes/auth.js` — Auth API (register, login, Google, profile with role)
- `src/db/index.js` — MySQL pool + schema init + auto-migration

## User Roles & Access Levels
| Role | Chat | Commands | Admin API | Custom Persona | Onboarding |
|---|---|---|---|---|---|
| guest | 5 msg/day | /stats, /myprofile | No | No | Yes |
| user | 30 msg/day | + /tools, /persona | No | Via session | Yes |
| premium | 100/day | + /health | No | Yes | Yes |
| admin | 999/day | All | Full | Yes | Skip |

## Whitelabel Settings (via /set or Admin API)
| Setting | Default | Description |
|---|---|---|
| `brand_name` | (empty) | Brand name (overrides persona name in UI) |
| `brand_tagline` | (empty) | Tagline shown on landing page |
| `brand_logo_url` | (empty) | Logo URL |
| `brand_primary_color` | (empty) | Primary hex color |
| `brand_secondary_color` | (empty) | Secondary hex color |
| `onboarding_enabled` | true | Enable/disable onboarding |
| `onboarding_greeting` | (empty) | Custom greeting (pt-BR) |
| `onboarding_greeting_en` | (empty) | Custom greeting (en-US) |
| `onboarding_greeting_es` | (empty) | Custom greeting (es-ES) |
| `survey_enabled` | true | Enable surveys |
| `followup_enabled` | true | Enable follow-ups |
| `followup_interval_messages` | 10 | Messages between follow-ups |
| `ratings_enabled` | true | Enable ratings |
| `rate_limit_guest` | 5 | Guest daily message limit |
| `rate_limit_user` | 30 | User daily message limit |
| `rate_limit_premium` | 100 | Premium daily message limit |
| `rate_limit_admin` | 999 | Admin daily message limit |