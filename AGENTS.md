# AGENTS.md

## Project: MetaPersona.AI — Cognitive Operating System for AI Agents

Plataforma de agentes cognitivos persistentes com RAG multimodal, multi-persona com Meta-RAG, onboarding automático, cognição em tempo real, gamificação, event bus, blueprints e gestão operacional completa. Serve qualquer nicho — religioso, saúde, educação, negócios, coaching, vendas, fitness, jurídico.

**Arquitetura:** Tudo é gerenciável via admin API, chat commands, ou painel web. A **meta-persona** é admin god — orquestra personas, cria skills, gerencia tarefas, agenda, CRM, automações, metas, estágios de conversa, conhecimento RAG, e eventos do ciclo de vida.

## Tech Stack
- **Backend**: Node.js 18+ + Express
- **Database**: MySQL 8.4 (via mysql2/promise)
- **LLM**: Ollama Cloud API (OpenAI-compatible) — model glm-5.1, **multi-key fallback automático**
- **RAG**: Pluggable TF-IDF + multimodal ingestion (PDF, DOCX, images/OCR, audio/STT, JSON, text, APIs)
- **Persona**: **Multi-persona com Meta-RAG** — criar via LLM, trocar com `/persona`, **skills configuráveis e criáveis**, whitelabel
- **Meta-Persona**: **Admin god** — orquestra personas, cria skills, gerencia tarefas, agenda, CRM, automações, RAG
- **Agent**: **Agentic** — tasks, calendar, CRM/contacts, automations, goals, conversation stages, org memory, history, dashboard — tudo via tools LLM
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
1. MySQL 8.4 running on localhost (root, no password, database `metapersona_ai`)
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
             → Extract context + Search knowledge (persona-aware) + Build memory + Build profile
             → Build goal context + Search org memory + Get conversation stage
             → buildSystemPrompt(persona, lang, context, memory, profile, name, isGroup, knowledgeSources) + extra context (goals, org memory, stage)
             → LLM call via IntegrationManager (with tools if enabled)
             → Tool calls loop (bible_lookup, user_stats, manage_goals, manage_org_memory, etc.)
             → CJK check → Save message → Auto follow-up scheduling
             → Return response + sources + persona info + ttsVoice
```

### Persona-Aware System Prompt
- `buildSystemPrompt()` handles both string and object identity formats
- String identity: DB personas store `identity` as `{ "pt-BR": "...", "en-US": "...", "es-ES": "..." }` (flat strings)
- Object identity: Default persona (jesus) has `{ "pt-BR": { core: "...", rules: "..." } }` (nested object) — string identity (DB personas) is flat per-language
- Context template: Uses the persona's knowledge source contextTemplate (e.g., "CONHECIMENTO DE VENDAS" for sales, not "VERSÍCULOS BÍBLICOS")
- Falls back to primary source context template if no persona sources match

### Persona Switching & Message History
- `switchPersona()` clears the session's message history (DELETE FROM messages WHERE session_id = ?)
- This prevents old persona messages from contaminating the new persona's context
- Cache invalidated and reloaded on every persona switch

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

Meta-Persona (id: "meta-persona"):
  - Admin god that orchestrates personas, skills, knowledge, tasks, calendar, CRM, automations, goals, stages, org memory
  - Has ALL LLM tools enabled (create_persona, manage_tasks, manage_calendar, manage_contacts, manage_automations, etc.)
  - Registered in DB on startup with priority 0
  - Accessible via /persona meta-persona
  - Tools: create_persona, list_personas, create_skill, invoke_skill, list_skills, add_knowledge_source,
    manage_tasks, manage_calendar, manage_contacts, manage_automations, manage_goals, manage_conversation_stages,
    manage_org_memory, get_dashboard, get_history
```

### Skills System
```
Skills: Reusable actions that personas can execute (stored in persona_skills table)
  - Types: action, generator, communication, analysis, workflow
  - Each skill has: id, persona_id (null = global), name, description, type, prompt, parameters, output_format
  - Skills are invoked via invoke_skill tool or /skills command
  - Created via LLM (create_skill tool) or admin API (POST /api/admin/skills)
  - Skill prompt uses {input} placeholder for user input and {context} for context
  - Cross-persona: skills with persona_id=null are available to all personas
```

### Agentic System (Tasks, Calendar, CRM, Automations, Goals, Stages, Org Memory)
```
Tasks (persona_tasks table):
  - CRUD via manage_tasks tool or /tasks command
  - Fields: title, description, status (pending/in_progress/completed/cancelled), priority (urgent/high/medium/low), due_date
  - Get overdue tasks, filter by status/priority/persona

Calendar (persona_calendar table):
  - CRUD via manage_calendar tool or /calendar command
  - Event types: meeting, reminder, task, followup, call, other
  - Attendees, reminders, location, start/end time
  - Get upcoming events for next N days

Contacts/CRM (persona_contacts table):
  - CRUD via manage_contacts tool or /contacts command
  - Fields: name, email, phone, company, role, tags, notes, stage (lead/prospect/customer/churned/vip)
  - Custom fields via JSON, search by name/email/company
  - Stage tracking for sales funnel

Automations (persona_automations table):
  - CRUD via manage_automations tool or /automations command
  - Triggers: keyword, interval_messages, schedule, on_contact_create, manual
  - Actions: message, create_task, send_email, webhook, switch_persona, invoke_skill
  - trigger_config: {keywords: [...], every_n: 10, cron: "0 9 * * *"}
  - action_config: {message: "...", task_title: "...", email_to: "..."}
  - Auto-check triggers on each message via checkAndRunAutomations()

Goals (persona_goals table):
  - CRUD via manage_goals tool or /goals command
  - Goal types: strategic, tactical, operational, learning, relationship, financial, growth
  - Fields: title, description, goal_type, priority, status (active/paused/completed/abandoned), progress (0-100)
  - target_metric, target_value, current_value for measurable goals
  - parent_goal_id for hierarchical goals (goal → sub-goals tree)
  - getGoalHierarchy() returns tree structure
  - getGoalProgress() returns aggregate stats by status
  - formatGoalContext() injects active goals into system prompt

Conversation Stages (persona_conversation_stages + persona_user_stages tables):
  - Define funnel stages per persona: greeting → discovery → engagement → conversion → retention
  - Default stages auto-created via ensureDefaultStages()
  - Each stage: name, description, stage_order, triggers (JSON), responses (JSON)
  - User stage tracking: getUserStage() / setUserStage() / advanceUserStage()
  - getUserStageContext() injects current stage into system prompt
  - Init defaults: /stages init or manage_conversation_stages init_defaults

Organizational Memory (persona_org_memory table):
  - Stores business knowledge: products, services, pricing, team, policies, FAQ, processes, brand, market
  - CRUD via manage_org_memory tool or /orgmem command
  - searchOrgMemory() for semantic keyword search across categories
  - getOrgMemoryContext() injects relevant org knowledge into system prompt
  - Categories: products, services, pricing, team, policies, faq, processes, brand, market, custom
  - Tags for flexible categorization, priority levels, expiry support

History (persona_messages table):
  - Stores all messages with persona_id, session_id, user_id, role, content, tool_calls, tool_results
  - Queryable via get_history tool
  - Enables cross-session context for meta-persona

Dashboard (get_dashboard tool or /dashboard command):
  - Tasks by status, upcoming events, contacts by stage, active automations, personas, skills, goals by status, org memory by category
```

### RAG Knowledge (Multimodal + APIs)
```
Knowledge Sources (configurable per persona):
  - Bible verses (JSON, built-in)
  - PDF documents → text extraction via pdf-parse v1.1.1
  - DOCX documents → text extraction via mammoth
  - Images → OCR via Tesseract
  - Audio → STT transcription via Groq/OpenAI Whisper
  - Plain text / Markdown
  - JSON data (structured)
  - API endpoints → fetch + cache → index

Ingestion: npm run ingest → reads all configured sources → TF-IDF index
Per-persona: personas.knowledge_sources selects which sources to search
  - searchMultiSource(query, sourceIds, topK) splits topK evenly across sources
  - Each source has its own contextTemplate per language
Admin: /api/admin/knowledge/reindex, /api/admin/knowledge (stats)
Upload: POST /api/admin/knowledge/upload (PDF, DOCX, image, audio, text, JSON)
```

### TTS Voice System
```
TTS Modes: kokoro (default), multivozes, edge-tts
Kokoro voices: pm_alex (pt-BR male), pf_dora (pt-BR female), am_adam (en-US male), af_bella (en-US female), etc.
Each persona has ttsVoice and ttsLang fields
/voice command → list available voices, switch persona voice
Edge TTS fallback: Kokoro voice mapped to Edge TTS voice (pm_alex → pt-BR-AntonioNeural, pf_dora → pt-BR-FranciscaNeural)
Message chunk size configurable via MESSAGE_CHUNK_SIZE env var or message_chunk_size setting (default 200 chars)
Audio/TTS truncated to 200 chars per generation by default
```

### Gamification System
```
XP + Levels:
  - addXp(uid, personaId, amount, reason) — adds XP, auto-levels up
  - getXp(uid, personaId) — returns { xp, level, streak, best_streak, badges }
  - calculateLevel(xp) — thresholds: 0, 50, 150, 300, 500, 800, 1200, ...
  - getXpForNextLevel(xp) — returns { needed, remaining }
  - formatXpContext(xpData) — injects into system prompt: "GAMIFICATION: Level 5, 450 XP, Streak: 3 days"

Streaks:
  - updateStreak(uid, personaId) — auto-detects consecutive days, handles broken streaks
  - Streak resets if >1 day gap, increments if yesterday, stays same if today
  - Streak bonus: +5 XP per day streak maintained

Badges:
  - checkAndAwardBadges(uid, personaId) — auto-awards based on conditions
  - Built-in badges: first_message, streak_3, streak_7, streak_30, level_5, level_10, xp_100, xp_500, xp_1000, xp_5000
  - Admin can add custom badges via API or manage_xp tool
  - Stored in user_xp.badges as JSON array [{id, name, earnedAt}]

Leaderboard:
  - getLeaderboard(personaId, limit) — top users by XP
  - Per-persona or global ranking

Context Injection:
  - formatXpContext() injected into system prompt every message
  - Shows: Level, XP, XP to next, Streak, Badges
  - AI uses this to adapt tone (congratulate level ups, encourage streaks)
```

### Progress State System
```
Per-user Persona-specific State (user_progress table):
  - getProgressState(uid, personaId) — returns { state: { weak_topics: [...], mastery_level: 7, engagement: 0.85 } }
  - updateProgressState(uid, personaId, updates) — merge updates into state
  - incrementProgressField(uid, personaId, field, amount) — +1 counter
  - pushProgressArray(uid, personaId, field, value) — add to array (no duplicates)
  - removeProgressArray(uid, personaId, field, value) — remove from array
  - formatProgressContext(progress) — injects into system prompt: "PROGRESS STATE: ..."

Use cases:
  - Education: weak_topics, mastery_level, learning_style, study_streak
  - Health: symptoms, medications, adherence_score, recovery_stage
  - Sales: funnel_stage, budget, objections, interest_level
  - Religion: prayer_requests_count, spiritual_stage, verse_bookmarks
```

### Cognitive Pipeline
```
Every message is analyzed by analyzeCognitiveState():

Emotion Analysis (keyword-based):
  - happy: "obrigado", "legal", "adorei", "ótimo", "great", "love", "thanks"
  - frustrated: "não funciona", "erro", "problema", "doesn't work", "bad"
  - confused: "não entendo", "como", "explica", "how", "what", "help"
  - excited: "quero", "vamos", "incrível", "wow", "can't wait"
  - sad: "triste", "sozinho", "desanimado", "sad", "lonely"
  - angry: "raiva", "ódio", "reclamar", "angry", "furious"
  - anxious: "preocupado", "medo", "nervoso", "worried", "anxious"
  - curious: "como funciona", "interessante", "tell me more"
  - neutral: (default)

Intent Analysis (keyword-based):
  - purchase: "comprar", "preço", "plano", "buy", "subscribe"
  - support: "ajuda", "problema", "erro", "help", "bug"
  - information: "como", "o que", "explique", "how", "what"
  - complaint: "reclamar", "insatisfeito", "complaint"
  - chitchat: "oi", "olá", "hey", "hello"
  - scheduling: "agendar", "horário", "schedule", "appointment"
  - feedback: "feedback", "avaliação", "suggest"
  - cancellation: "cancelar", "desistir", "cancel", "stop"

Scoring:
  - churn_risk: 0-1 (blended with previous state, 60/40 weight)
  - conversion_probability: 0-1 (based on intent + emotion)
  - engagement_score: 0-1 (based on emotion + history)
  - suggested_action: retain_user, convert_lead, escalate_support, prevent_churn, schedule_appointment, re_engage

Context Injection:
  - formatCognitiveContext(state) — injects: "COGNITIVE STATE: emotion=excited (87%), intent=purchase (72%)\nCONVERSION PROBABILITY: 73% — high intent detected"
  - High churn_risk → "CHURN RISK: 70% — consider retention strategy"
  - Low engagement → "ENGAGEMENT: low (25%) — consider re-engagement"

Stats:
  - getCognitiveStats(personaId, days) — aggregated emotion distribution, intent distribution, avg churn/conversion/engagement
```

### Human Override System
```
Three override modes per session:
  - full: AI pauses completely, human handles conversation
  - approval: AI generates response, human approves before sending
  - observation: AI responds normally, human watches logs

Management:
  - setOverride(sessionId, { is_active, override_type, human_message })
  - clearOverride(sessionId) — deactivate override
  - isOverridden(sessionId) — check if override is active
  - listOverrides({ is_active: true }) — list active overrides

Chat Engine Check:
  - processMessage checks override before LLM call
  - If full override + human_message → sends human message directly
  - If full override + no human_message → returns "human handling" message

API Endpoints:
  - POST /api/admin/override/activate
  - POST /api/admin/override/deactivate
  - GET /api/admin/override/status/:sessionId
  - GET /api/admin/override/list
```

### Agent Thought Log
```
Every message response is logged via logThought():
  - session_id, user_id, persona_id
  - message_input (truncated 500 chars)
  - message_output (truncated 500 chars)
  - tools_used: array of tool names invoked
  - context_injected: { hasGoals, hasOrgMemory, hasStage, hasXp, hasProgress, hasCognitive }
  - reasoning: emotion/intent from cognitive state
  - decision: suggested_action from cognitive state
  - response_time_ms, tokens_used

Stats:
  - getThoughtStats(personaId, days) — avg response time, avg tokens, thought count, tool usage
  - getThoughts(filters) — query by session, user, persona

Admin API:
  - GET /api/admin/thoughts — list thoughts
  - GET /api/admin/thoughts/stats — aggregated statistics
```

### Self-Optimization Suggestions
```
generateSuggestions(personaId, days) analyzes:

  1. Emotion Distribution: if frustrated/angry > 30% → suggest tone adjustment
  2. Churn Risk: avg > 50% → suggest retention strategy
  3. Engagement: avg < 40% → suggest gamification/re-engagement
  4. Tool Usage: most-used tool → suggest dedicated skill
  5. Goals: active >> completed ratio → simplify objectives
  6. Automations: 0 active with 20+ messages → suggest automatic follow-ups
  7. Human Overrides: 3+ active → suggest personality/rules adjustment

Returns: { persona_id, period_days, total_messages, suggestions: [...] }
Each suggestion: { type, priority, title, description, data }

Admin API:
  - GET /api/admin/suggestions?persona_id=X&days=7
  - Also available via get_suggestions LLM tool
```

### Proactive Intelligence (cron-based)
```
ProactiveEngine runs on configurable interval (default: 60 min):
  - checkAutomations() — triggers schedule-type automations
  - checkStreakReminders() — warns users about streak at risk
  - checkGoalDeadlines() — flags goals due within 3 days
  - createFollowUp() — creates follow-up entries for proactive messages

Future: connect to WhatsApp/Telegram/Email for proactive outreach
```

### Conversation Simulation
```
POST /api/admin/simulate
Body: { message, persona_id, user_id, language }

Runs processMessage() with simulated user, returns full response including:
  - cognitive state (emotion, intent, churn risk)
  - tool calls used
  - sources found
  - persona info
  - TTS voice

Use case: test persona behavior before deploy, evaluate tone, debug context injection
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
| `/voice` | anyone | List/switch TTS voice |
| `/survey` | admin | Manage surveys |
| `/ratings` | admin | Rating stats |
| `/followups` | admin | Follow-up status |
| `/skills` | anyone | List skills |
| `/tasks` | user | List your tasks (/tasks overdue\|pending\|in_progress) |
| `/calendar` | user | Upcoming events (/calendar upcoming) |
| `/contacts` | user | List contacts (/contacts search <name>) |
| `/automations` | user | List automations |
| `/dashboard` | user | Dashboard overview |
| `/goals` | user | List/manage goals (/goals create <title>, /goals <id>, /goals progress) |
| `/stages` | user | View/advance conversation stages (/stages init, /stages advance) |
| `/orgmem` | user | Manage org memory (/orgmem create, /orgmem search <query>) |
| `/xp` | user | Gamification — XP, level, streak, badges, leaderboard |
| `/progress` | user | View/update progress state (key-value per user+persona) |
| `/keys, /addkey, /removekey, /togglekey` | admin | Integration management |
| `/blueprints` | anyone | List/clone/view blueprints (/blueprints list, /blueprints clone <id>, /blueprints categories) |
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
| **Skills** |||
| GET | `/api/admin/skills` | List skills (filter by persona_id) |
| POST | `/api/admin/skills` | Create skill |
| PUT | `/api/admin/skills/:id` | Update skill |
| DELETE | `/api/admin/skills/:id` | Delete skill |
| POST | `/api/admin/skills/:id/invoke` | Invoke a skill |
| **Tasks** |||
| GET | `/api/admin/tasks` | List tasks |
| POST | `/api/admin/tasks` | Create task |
| PUT | `/api/admin/tasks/:id` | Update task |
| DELETE | `/api/admin/tasks/:id` | Delete task |
| **Calendar** |||
| GET | `/api/admin/calendar` | List events |
| POST | `/api/admin/calendar` | Create event |
| PUT | `/api/admin/calendar/:id` | Update event |
| DELETE | `/api/admin/calendar/:id` | Delete event |
| **Contacts (CRM)** |||
| GET | `/api/admin/contacts` | List contacts |
| POST | `/api/admin/contacts` | Create contact |
| PUT | `/api/admin/contacts/:id` | Update contact |
| DELETE | `/api/admin/contacts/:id` | Delete contact |
| **Automations** |||
| GET | `/api/admin/automations` | List automations |
| POST | `/api/admin/automations` | Create automation |
| PUT | `/api/admin/automations/:id` | Update automation |
| DELETE | `/api/admin/automations/:id` | Delete automation |
| **Dashboard** |||
| GET | `/api/admin/dashboard` | Dashboard stats (tasks, events, contacts, automations, personas, skills, goals, org memory) |
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
| **Goals** |||
| GET | `/api/admin/goals` | List goals |
| POST | `/api/admin/goals` | Create goal |
| GET | `/api/admin/goals/:id` | Get goal |
| PUT | `/api/admin/goals/:id` | Update goal |
| DELETE | `/api/admin/goals/:id` | Delete goal |
| GET | `/api/admin/goals/progress` | Goal progress stats |
| GET | `/api/admin/goals/hierarchy` | Goal hierarchy tree |
| **Conversation Stages** |||
| GET | `/api/admin/stages` | List stages |
| POST | `/api/admin/stages` | Create stage |
| PUT | `/api/admin/stages/:id` | Update stage |
| DELETE | `/api/admin/stages/:id` | Delete stage |
| POST | `/api/admin/stages/init-defaults` | Create default stages |
| GET | `/api/admin/stages/user/:userId` | Get user stage |
| POST | `/api/admin/stages/user/:userId/advance` | Advance user stage |
| **Org Memory** |||
| GET | `/api/admin/org-memory` | List org memories |
| POST | `/api/admin/org-memory` | Create org memory |
| GET | `/api/admin/org-memory/search` | Search org memories |
| GET | `/api/admin/org-memory/:id` | Get org memory |
| PUT | `/api/admin/org-memory/:id` | Update org memory |
| DELETE | `/api/admin/org-memory/:id` | Delete org memory |
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
| **Blueprints** |||
| GET | `/api/admin/blueprints` | List blueprints (filter: category, niche, search) |
| POST | `/api/admin/blueprints` | Create blueprint |
| GET | `/api/admin/blueprints/:id` | Get blueprint |
| PUT | `/api/admin/blueprints/:id` | Update blueprint |
| DELETE | `/api/admin/blueprints/:id` | Delete blueprint |
| POST | `/api/admin/blueprints/:id/clone` | Clone blueprint as new persona |
| POST | `/api/admin/blueprints/:id/apply/:personaId` | Apply blueprint to existing persona |
| POST | `/api/admin/blueprints/from-persona/:personaId` | Save persona as blueprint |
| GET | `/api/admin/blueprints/stats` | Blueprint statistics |
| GET | `/api/admin/blueprints/categories` | List categories |
| GET | `/api/admin/blueprints/niches` | List niches |
| **Events** |||
| GET | `/api/admin/events/log` | Event log (filter: event_type, user_id, persona_id) |
| GET | `/api/admin/events/stats` | Event statistics |

## Public API Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/api/chat` | Chat (JSON response, rate-limited, persona-aware, returns ttsVoice) |
| POST | `/api/chat/stt` | Speech-to-text |
| POST | `/api/chat/tts` | Text-to-speech (accepts voice param, truncates to 200 chars) |
| POST | `/api/chat/rating` | Submit rating |
| GET | `/api/chat/personas` | List personas |
| POST | `/api/chat/persona/switch` | Switch persona |
| POST | `/api/chat/persona/create` | Meta-RAG create |
| GET | `/api/chat/persona/current` | Current persona (returns ttsVoice, ttsLang) |
| GET | `/api/chat/surveys/active` | Check active survey |
| POST | `/api/chat/surveys/:id/respond` | Submit survey response |
| GET | `/api/chat/followups/pending` | Check pending follow-up |
| POST | `/api/chat/followups/:id/respond` | Respond to follow-up |
| GET | `/api/chat/blueprints` | List active blueprints (public, no auth) |
| GET | `/api/chat/blueprints/categories` | List categories (public) |
| GET | `/api/chat/blueprints/niches` | List niches (public) |
| GET | `/api/chat/blueprints/:id` | Get blueprint (public) |
| POST | `/api/chat/blueprints/:id/clone` | Clone as new persona (public) |
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
- **personas** — persona_id (PK), name, name_en, name_es, identity (JSON), commands (JSON), knowledge_sources (JSON), tts_voice, tts_lang, model, priority, is_active, topic_keywords (JSON), emotion_keywords (JSON), name_patterns (JSON), disclaimer (JSON), conversation_with (JSON), memory_block (JSON), profile_block (JSON), group_context (JSON), cjk_fallback (JSON), llm_error (JSON), welcome_title (JSON), welcome_body (JSON), prayer_prompt (JSON), blog_prompt (JSON), blog_topics (JSON), donate_verse (JSON), summary_prompt (JSON), profile_summary_prompt (JSON)
- **persona_skills** — id (PK), persona_id (FK nullable), name, description, type (action/generator/communication/analysis/workflow), prompt, parameters (JSON), output_format, is_active, created_at, updated_at
- **persona_tasks** — id (PK), persona_id, owner_id, title, description, status (pending/in_progress/completed/cancelled), priority (urgent/high/medium/low), due_date, assigned_to, result, auto_execute, skill_id, created_at, updated_at
- **persona_calendar** — id (PK), persona_id, owner_id, title, description, event_type (meeting/reminder/task/followup/call/other), start_time, end_time, location, attendees (JSON), reminders (JSON), status, created_at, updated_at
- **persona_contacts** — id (PK), persona_id, owner_id, name, email, phone, company, role, tags (JSON), notes, stage (lead/prospect/customer/churned/vip), custom_fields (JSON), last_contact_at, created_at, updated_at
- **persona_automations** — id (PK), persona_id, owner_id, name, description, trigger_type (keyword/interval_messages/schedule/on_contact_create/manual), trigger_config (JSON), action_type (message/create_task/send_email/webhook/switch_persona/invoke_skill), action_config (JSON), is_active, last_run_at, run_count, created_at, updated_at
- **persona_messages** — id (PK), persona_id, session_id, user_id, role (user/assistant/system/tool), content, tool_calls (JSON), tool_results (JSON), metadata (JSON), created_at
- **persona_goals** — id (PK), persona_id, owner_id, title, description, goal_type (strategic/tactical/operational/learning/relationship/financial/growth), priority (urgent/high/medium/low), status (active/paused/completed/abandoned), progress (0-100), target_metric, target_value, current_value, parent_goal_id, due_date, completed_at, created_at, updated_at
- **persona_conversation_stages** — id (PK), persona_id, name, description, stage_order, triggers (JSON), responses (JSON), is_active, created_at
- **persona_user_stages** — id (PK), user_id, persona_id, session_id, current_stage, stage_data (JSON), stage_history (JSON), updated_at
- **persona_org_memory** — id (PK), persona_id, owner_id, category (products/services/pricing/team/policies/faq/processes/brand/market/custom), title, content, tags (JSON), priority (urgent/high/medium/low), is_active, expires_at, created_at, updated_at
- **rate_limits** — id, user_id, service_type, request_count, window_start
- **surveys** — id, title, description, questions (JSON), is_active, trigger_type, trigger_config (JSON)
- **survey_responses** — id, survey_id, user_id, session_id, answers (JSON), completed_at
- **ratings** — id, user_id, session_id, message_id, rating, feedback, category, source, created_at
- **follow_ups** — id, user_id, session_id, type, question, response, status, scheduled_at, sent_at, responded_at, created_at
- **bot_instances** — id, platform, name, token, webhook_url, instance_name, persona_id, is_active, config (JSON)
- **onboarding_steps** — id, step_key, step_order, question, question_en, question_es, field, field_type, choices (JSON), required, is_active
- **user_onboarding** — id, user_id, step_key, answer, answered_at
- **mcp_servers** — id, name, command, args (JSON), env_vars (JSON), is_active, created_at
- **user_xp** — user_id, persona_id, xp, level, streak, best_streak, last_activity, badges (JSON) (composite PK user_id+persona_id)
- **user_xp_log** — id, user_id, persona_id, amount, reason, created_at
- **user_progress** — user_id, persona_id, state (JSON), created_at, updated_at (composite PK user_id+persona_id)
- **cognitive_states** — id, user_id, persona_id, session_id, message_id, emotion, emotion_confidence, intent, intent_confidence, topics (JSON), churn_risk, conversion_probability, engagement_score, suggested_action, context_snapshot (JSON), created_at
- **human_overrides** — id, session_id (unique), user_id, persona_id, is_active, override_type (full/approval/observation), human_message, metadata (JSON), created_at, updated_at
- **agent_thoughts** — id, session_id, user_id, persona_id, message_input, message_output, tools_used (JSON), context_injected (JSON), reasoning, decision, response_time_ms, tokens_used, created_at
- **persona_blueprints** — id (PK), name, description, category, niche, config (JSON), preview (JSON), is_official, is_active, tags (JSON), icon, color, created_at, updated_at
- **event_log** — id (PK), event_type, user_id, persona_id, session_id, data (JSON), results (JSON), created_at

## Key File Structure
- `src/chat/engine.js` — Central chat engine (rate limit, onboarding, persona-aware RAG, tools, agentic loop for meta-persona)
- `src/auth/index.js` — Auth core (register, login, Google OAuth, JWT, role-based, createUser)
- `src/auth/rateLimit.js` — Rate limiting per role + ban enforcement
- `src/onboarding/index.js` — Onboarding state machine (whitelabel, 3 langs, ensureUser)
- `src/survey/index.js` — Surveys, ratings, follow-ups engine
- `src/persona/manager.js` — Multi-persona with DB persistence, cache invalidation
- `src/persona/meta-rag.js` — Meta-RAG persona generation (any niche, not just biblical), switchPersona, getMetaPersona
- `src/persona/config.js` — Default persona definitions, buildSystemPrompt (handles string/object identity)
- `src/skills/index.js` — Skills CRUD + invocation (create, list, invoke, getForPersona)
- `src/agent/index.js` — Agentic system (tasks, calendar, contacts, automations, history, dashboard, checkAndRunAutomations)
- `src/goals/index.js` — Goal stack CRUD + hierarchy + progress + context injection (createGoal, listGoals, getGoalHierarchy, getGoalProgress, formatGoalContext)
- `src/stages/index.js` — Conversation stages CRUD + user stage tracking + context injection (createConversationStage, getUserStage, advanceUserStage, getUserStageContext, ensureDefaultStages)
- `src/orgmemory/index.js` — Organizational memory CRUD + search + context injection (createOrgMemory, searchOrgMemory, getOrgMemoryContext)
- `src/gamification/index.js` — XP, levels, streaks, badges, leaderboard, auto-award (getXp, addXp, updateStreak, addBadge, checkAndAwardBadges, formatXpContext)
- `src/progress/index.js` — Per-user progress state (getProgressState, updateProgressState, incrementProgressField, pushProgressArray, formatProgressContext)
- `src/cognitive/index.js` — Cognitive state analysis (analyzeCognitiveState, formatCognitiveContext, getCognitiveStats) — emotion, intent, churn risk, engagement
- `src/override/index.js` — Human override (setOverride, getOverride, clearOverride, isOverridden) — full/approval/observation
- `src/thoughts/index.js` — Agent thought logging (logThought, getThoughts, getThoughtStats) — tools used, context, reasoning, response time
- `src/optimization/index.js` — Self-optimization suggestions (generateSuggestions) — tone, retention, engagement, automation
- `src/proactive/index.js` — Proactive intelligence engine (cron-based: streak reminders, goal deadlines, scheduled automations)
- `src/events/index.js` — Event bus (emit, on, off, logEvent, getEventLog, getEventStats, processAutomations) — 12 event types
- `src/blueprints/index.js` — Blueprint CRUD + clone + seed (createBlueprint, cloneBlueprint, savePersonaAsBlueprint, getBlueprintStats)
- `src/llm/tools.js` — LLM tool definitions (29 tools: create_persona, manage_tasks, manage_calendar, manage_contacts, manage_automations, manage_goals, manage_conversation_stages, manage_org_memory, manage_xp, manage_progress, get_cognitive_state, human_override, get_suggestions, get_dashboard, get_history, manage_blueprints, etc.)
- `src/llm/integrationManager.js` — Multi-key fallback for ALL integrations
- `src/bot/manager.js` — Multi-instance bot manager (Telegram + WhatsApp)
- `src/telegram/handler.js` — Telegram handler factory (persona per instance)
- `src/whatsapp/bot.js` — WhatsApp handler (persona-aware, voice pass-through, chunk size)
- `src/settings/index.js` — Runtime settings (DB-backed, cached) with whitelabel configs
- `src/knowledge/config.js` — Knowledge source definitions (multimodal, dynamic registry)
- `src/knowledge/store.js` — Multi-source TF-IDF search (searchMultiSource, getAllSourceStats)
- `src/knowledge/ingester.js` — Multi-source ingestion (PDF, DOCX, image, audio, JSON, text, API, upload)
- `src/tts/index.js` — TTS engine (Kokoro + Edge TTS fallback, voice mapping, chunk truncation)
- `src/routes/admin.js` — Admin API (users, personas, skills, tasks, calendar, contacts, automations, goals, stages, org memory, dashboard, surveys, ratings, follow-ups, bots, integrations, knowledge, blueprints, events)
- `src/routes/chat.js` — Chat API (JSON response, personas, TTS with voice, ratings, surveys, onboarding, persona/create public)
- `src/routes/auth.js` — Auth API (register, login, Google, profile with role)
- `src/server/templates.js` — `escapeHtml`, `buildPersonaPage`, `buildSitePage`, `buildCreatePersonaPage` (string concatenation)
- `src/server.js` — Express server, routes, startup (registers meta-persona in DB)
- `src/db/index.js` — MySQL pool + schema init + auto-migration (41 tables)

## User Roles & Access Levels
| Role | Chat | Commands | Admin API | Custom Persona | Onboarding |
|---|---|---|---|---|---|
| guest | 5 msg/day | /stats, /myprofile | No | No | Yes |
| user | 30 msg/day | + /tools, /persona, /voice | No | Via session | Yes |
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
| `message_chunk_size` | 200 | Max chars per text/audio message chunk |
| `audio_chunk_size` | 200 | Max chars per TTS audio generation |

## Critical Constraints
- `pdf-parse` must be v1.1.1 — v2.x has breaking API changes (`pdfParse is not a function`)
- MySQL `LIMIT ? OFFSET ?` with `pool.execute()` (prepared statements) fails — must interpolate as `${Number(limit)}`
- Persona IDs preserve original format including hyphens — do NOT sanitize with regex
- `buildSystemPrompt()` must handle both string and object identity formats
- `switchPersona()` clears message history to prevent persona contamination
- Message saving: `processMessage` saves assistant messages — do NOT double-save in bot handlers
- TTS voice: persona.ttsVoice is passed through to Kokoro/Edge TTS — KOKORO_EDGE_VOICE_MAP handles fallback
- Meta-persona (id: "meta-persona") has ALL tools enabled — admin god that orchestrates everything
- Agent module CRUD operations use VARCHAR primary keys generated as `prefix_timestamp_random`
- `createPersona()` must preserve existing fields from cache
- `loadPersonas()` must NOT fallback to Jesus persona fields for custom personas
- Skills provide specialized instructions and workflows for specific tasks.
- Goal context is injected into system prompt via `formatGoalContext()` — active goals only
- Org memory is injected via `getOrgMemoryContext()` — searched by user message keywords
- Conversation stage is injected via `getUserStageContext()` — shows current funnel stage
- Dashboard stats now include goals by status and org memory by category
- `ensureDefaultStages()` creates default funnel stages (greeting → discovery → engagement → conversion → retention)
- Event bus `emit()` fires after key actions (goal completed, badge earned, level up, churn risk high, stage advance, cognitive change, XP milestone)
- Event automations use `trigger_type = 'event'` with `trigger_config.event` matching the event type
- Blueprint `cloneBlueprint()` creates a new persona from blueprint config — overrides merge on top
- Blueprint `savePersonaAsBlueprint()` extracts full persona config into a reusable template
- 5 official blueprints seeded on first startup: Coach de Vendas, Hipnoterapeuta, Tutor ENEM, Consultor Imobiliário, Nutricionista

### Blueprint System
```
personas → savePersonaAsBlueprint() → persona_blueprints table (config JSON)
personas ← cloneBlueprint(blueprintId, overrides) → new persona with merged config
personas ← cloneBlueprintToExisting(blueprintId, personaId) → merge template into existing persona

Official blueprints (seeded on startup):
  - bp_coach_vendas: Sales coach with funnel, objection handling, CRM (business/vendas)
  - bp_hipnoterapeuta: Hypnotherapy with safety rules, Ericksonian techniques (health/terapia)
  - bp_tutor_enem: Exam prep with study techniques, progress tracking (education/enem)
  - bp_consultor_imobiliario: Real estate with market knowledge, legal compliance (business/imobiliário)
  - bp_nutricionista: Nutrition with clinical safety, evidence-based recommendations (health/nutrição)

Admin API:
  GET    /api/admin/blueprints           — List blueprints (filter: category, niche, search)
  POST   /api/admin/blueprints           — Create blueprint
  GET    /api/admin/blueprints/:id       — Get blueprint
  PUT    /api/admin/blueprints/:id       — Update blueprint
  DELETE /api/admin/blueprints/:id       — Delete blueprint
  POST   /api/admin/blueprints/:id/clone — Clone blueprint as new persona
  POST   /api/admin/blueprints/:id/apply/:personaId — Apply blueprint to existing persona
  POST   /api/admin/blueprints/from-persona/:personaId — Save persona as blueprint
  GET    /api/admin/blueprints/stats     — Blueprint statistics
  GET    /api/admin/blueprints/categories — List categories
  GET    /api/admin/blueprints/niches    — List niches

Public API:
  GET    /api/chat/blueprints            — List active blueprints (public, no auth)
  GET    /api/chat/blueprints/categories — List categories (public)
  GET    /api/chat/blueprints/niches     — List niches (public)
  GET    /api/chat/blueprints/:id        — Get blueprint (public)
  POST   /api/chat/blueprints/:id/clone  — Clone as new persona (public)

Chat Command:
  /blueprints list              — List active blueprints
  /blueprints <id>              — View blueprint details
  /blueprints clone <id> [name] — Clone blueprint as new persona
  /blueprints categories         — List categories
  /blueprints stats              — Blueprint statistics

LLM Tool:
  manage_blueprints — list, get, clone, apply, create_from_persona, categories, niches, stats
```

### Event Bus
```
Trigger lifecycle events → handlers + automations + logging
Event types: on_goal_completed, on_goal_created, on_stage_advance, on_badge_earned,
             on_level_up, on_churn_risk_high, on_cognitive_change, on_message_sent,
             on_user_created, on_automation_triggered, on_override_activated, on_xp_milestone

Emit points:
  - goals/index.js: updateGoal() when status='completed' → emit('on_goal_completed')
  - gamification/index.js: addXp() when leveledUp → emit('on_level_up'), XP milestone → emit('on_xp_milestone')
  - gamification/index.js: checkAndAwardBadges() when new badge → emit('on_badge_earned')
  - stages/index.js: advanceUserStage() → emit('on_stage_advance')
  - cognitive/index.js: analyzeCognitiveState() when churnRisk > 0.6 → emit('on_churn_risk_high')
  - cognitive/index.js: analyzeCognitiveState() when emotion changes → emit('on_cognitive_change')

Automation integration:
  - persona_automations with trigger_type='event' and trigger_config.event matching event type
  - Actions: message, create_task, send_email, webhook, switch_persona, invoke_skill

Admin API:
  GET /api/admin/events/log    — Event log (filter: event_type, user_id, persona_id)
  GET /api/admin/events/stats   — Event statistics
```