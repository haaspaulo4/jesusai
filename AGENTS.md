# AGENTS.md

## Project: MetaPersona.AI — Cognitive Operating System for AI Agents

Plataforma de agentes cognitivos persistentes com RAG multimodal, multi-persona com Meta-RAG, onboarding automático, cognição em tempo real, gamificação, event bus, blueprints e gestão operacional completa. Serve qualquer nicho — religioso, saúde, educação, negócios, coaching, vendas, fitness, jurídico.

**Arquitetura:** Tudo é gerenciável via admin API, chat commands, ou painel web. A **meta-persona** é admin god — orquestra personas, cria skills, gerencia tarefas, agenda, CRM, automações, metas, estágios de conversa, conhecimento RAG, e eventos do ciclo de vida.

## Tech Stack
- **Backend**: Node.js 18+ / Express
- **Desktop Widget**: Electron.js + Three.js r128 (Neural Link Brain)
- **Database**: MySQL 8.4 (mysql2/promise)
- **LLM**: Ollama Cloud API (native `/chat`) — model glm-5.1, multi-key fallback, tool calling
- **RAG**: Hybrid TF-IDF + Vector Embeddings (Ollama embeddings, MySQL vector)
- **Fulltext**: FlexSearch (in-memory)
- **Auth**: JWT + bcrypt + Google OAuth + role-based (guest/user/premium/admin/banned) + rate limiting
- **Bots**: Multi-instance Telegram + WhatsApp (Evolution API v2) + Instagram
- **TTS**: Kokoro-82M (30+ langs) + Edge TTS + Google Translate (fallback)
- **STT**: Whisper Local (faster-whisper + whisper.cpp) + Groq + OpenAI Whisper
- **i18n**: pt-BR, en-US, es-ES
- **Jobs**: BullMQ (Redis-backed)
- **Whitelabel**: brand_name, brand_tagline, brand_logo_url, brand_primary/secondary_color

## Commands
- `npm start` — Start server (auto-creates DB schema)
- `npm run dev` — Start with watch mode
- `npm run ingest` — Ingest knowledge sources into TF-IDF index
- `npm run ngrok` — Start Cloudflare tunnel + configure Evolution API webhook

## Prerequisites
1. MySQL 8.4 on localhost (root, no password, db `metapersona_ai`)
2. Ollama Cloud API key in `.env`
3. Run `npm run ingest` before first use
4. (Recommended) Kokoro TTS: `npm run tts:start`
5. (Optional) Serper, GNews, YouTube API keys in `.env`

## Architecture

### Core Flow
```
User message → Rate limit + Ban check → Onboarding check
→ Persona resolution (session → user → default)
→ Chat command? → handleChatCommand
→ Extract context + Search knowledge (persona-aware) + Build memory + Build profile
→ Build goal context + Search org memory + Get conversation stage
→ buildSystemPrompt(persona, lang, context, memory, profile, name, isGroup, knowledgeSources) + extra context
→ LLM call via IntegrationManager (with tools if enabled)
→ normalizeLLMResponse → tool_calls loop (up to 5 rounds)
→ Strip inline tool calls → Empty content retry → CJK check
→ Save message → Auto follow-up scheduling → Return response + sources + persona info + ttsVoice
```

### LLM Integration
- `IntegrationManager.callLLM()` → `callWithFallback()` for multi-key failover
- Auto-detect: Ollama (`/chat` endpoint) vs OpenAI-compatible (`/chat/completions`)
- `normalizeLLMResponse()` handles Ollama, OpenAI, and inline tool call formats
- Tool calls: Ollama `{id, function: {name, arguments: {object}}}` / OpenAI `{id, type: "function", function: {name, arguments: "json_string"}}`

### Persona-Aware System Prompt
- String identity: DB personas store `identity` as `{"pt-BR": "...", "en-US": "...", "es-ES": "..."}` (flat strings)
- Object identity: Default persona has `{"pt-BR": {core: "...", rules: "..."}}` (nested object)
- `switchPersona()` clears session message history to prevent persona contamination

### Onboarding System
- `shouldOnboard(uid)` → returns next step question
- Steps: name, interest, feeling, email, custom (configurable per persona)
- Commerce personas use `PERSONA_STEP_CONFIGS` (e.g., loja-hlb: name + phone only)

### Multi-Persona + Meta-RAG
- `/persona create <description>` → LLM generates full persona config (identity, rules, commands, topics, TTS voice, etc.)
- Meta-persona (id: "meta-persona"): admin god with ALL tools, orchestrates everything
- Each persona: own knowledge sources, skills, onboarding, follow-up style, brand whitelabel

### Skills System
- 5 types: action, generator, communication, analysis, workflow
- Created via LLM (`create_skill`) or admin API
- Skills with `persona_id=null` are global (available to all personas)

### Agentic System
| Module | Key Functions |
|--------|--------------|
| Tasks | CRUD via `manage_tasks`, filter by status/priority/persona |
| Calendar | CRUD via `manage_calendar`, event types (meeting/reminder/task/followup/call/other) |
| Contacts/CRM | CRUD via `manage_contacts`, stages (lead→prospect→customer→churned→vip) |
| Automations | Triggers: keyword/interval/schedule/on_contact_create/event/manual; Actions: message/create_task/send_email/webhook/switch_persona/invoke_skill |
| Goals | Hierarchical (strategic→tactical→operational), progress 0-100, `formatGoalContext()` injected into system prompt |
| Conversation Stages | Funnel: greeting→discovery→engagement→conversion→retention, `getUserStageContext()` injected |
| Org Memory | 10 categories, keyword search, `getOrgMemoryContext()` injected |
| History | Cross-session context via `persona_messages`, queryable via `get_history` |
| Dashboard | Aggregated stats via `get_dashboard` or `/dashboard` command |

### RAG Knowledge (Hybrid)
- **TF-IDF**: Exact keyword match, references, fast
- **Vector**: Ollama embeddings (nomic-embed-text, 768d) in MySQL `embeddings` table
- **Hybrid scoring**: `VECTOR_WEIGHT (0.7) × vector + TFIDF_WEIGHT (0.3) × tfidf`
- Fallback: TF-IDF only if embeddings unavailable
- Ingestion: PDF, DOCX, images/OCR, audio/STT, JSON, text, APIs
- Per-persona: `personas.knowledge_sources` selects which sources to search

### Gamification (XP + Levels + Badges)
- `addXp(uid, personaId, amount, reason)` → auto-level-up, streak tracking
- `calculateLevel(xp)`: thresholds 0, 50, 150, 300, 500, 800, 1200, ...
- Auto-badges: first_message, streak_3/7/30, level_5/10, xp_100/500/1000/5000
- Streak bonus: +5 XP per day maintained
- `formatXpContext()` injected into system prompt

### Progress State
- Per-user, per-persona state (user_progress table)
- `getProgressState(uid, personaId)`, `updateProgressState(uid, personaId, updates)`
- Use cases: education (weak_topics, mastery), sales (funnel_stage, objections), religion (prayer_requests, spiritual_stage)

### Cognitive Pipeline
- `analyzeCognitiveState()` runs on every message
- Emotions: happy, frustrated, confused, excited, sad, angry, anxious, curious, neutral
- Intents: purchase, support, information, complaint, chitchat, scheduling, feedback, cancellation
- Scoring: churn_risk (0-1), conversion_probability (0-1), engagement_score (0-1), suggested_action
- `formatCognitiveContext()` injected into system prompt

### Human Override
- Three modes per session: full (AI pauses), approval (AI generates, human approves), observation (AI responds, human watches)
- `setOverride()`, `clearOverride()`, `isOverridden()`

### Agent Thought Log
- Every response logged: message_input/output (truncated 500 chars), tools_used, context_injected, reasoning, decision, response_time_ms, tokens_used

### Self-Optimization Suggestions
- `generateSuggestions(personaId, days)`: emotion distribution, churn risk, engagement, tool usage, goal analysis
- Available via `/suggestions` command or `get_suggestions` LLM tool

### Proactive Intelligence
- BullMQ-based: checkAutomations, checkStreakReminders, checkGoalDeadlines, createFollowUp
- Falls back to interval if Redis unavailable

### Event Bus
- Types: on_goal_completed, on_goal_created, on_stage_advance, on_badge_earned, on_level_up, on_churn_risk_high, on_cognitive_change, on_message_sent, on_user_created, on_automation_triggered, on_override_activated, on_xp_milestone

### Conversation Simulation
- `POST /api/admin/simulate { message, persona_id, user_id, language }` — test persona behavior before deploy

### Survey + Rating + Follow-up
- Surveys: CRUD with triggers (after_messages, after_session, manual)
- Ratings: 1-5 stars with categories (general, spiritual, response_quality, empathy)
- Follow-ups: Auto-created every N messages, types: spiritual_check, daily_devotional, prayer_request, custom

### Rate Limiting
| Role | msgs/day |
|------|----------|
| guest | 5 |
| user | 30 |
| premium | 100 |
| admin | 999 |

### Auth + Account Linking
- JWT includes: {id, email, role}
- Bot users auto-created with `wa_*`/`tg_*` IDs
- Account linking: web user generates 6-digit code → bot user sends `/vincular CODE`
- Linked users share: profile, XP, goals, org memory, stages, contacts

### TTS Voice System
- Modes: kokoro (default), multivozes, edge-tts
- Kokoro voices: pm_alex (pt-BR male), pf_dora (pt-BR female), am_adam (en-US), af_bella (en-US), etc.
- Each persona has `ttsVoice` and `ttsLang` fields
- Edge TTS fallback: pm_alex → pt-BR-AntonioNeural, pf_dora → pt-BR-FranciscaNeural
- Message chunk size: configurable via `MESSAGE_CHUNK_SIZE` or `message_chunk_size` setting (default 200 chars)
- ffmpeg-powered audio processing: WAV concatenation, format conversion (OGG/MP3/FLAC)

### FFmpeg Media Module (`src/media/ffmpeg.js`)
- `convertAudio()`: Convert between WAV, MP3, OGG/Opus, FLAC, M4A formats
- `convertToOggOpus()`: WAV → OGG/Opus (for Telegram voice messages)
- `convertToMp3()`: WAV/any → MP3
- `convertToWav()`: Any → WAV 16kHz mono (for Whisper STT, best accuracy)
- `concatAudio()`: Concatenate multiple audio files with ffmpeg (replaces manual WAV splicing in TTS)
- `trimAudio()`: Extract a segment by start time + duration
- `extractAudio()`: Extract audio track from video (MP4, AVI, MKV, etc.)
- `normalizeAudio()`: Resample to target sample rate, channels, format (ideal for STT preprocessing)
- `getAudioInfo()`: Probe audio metadata (duration, codec, channels, sample rate, bitrate)
- All functions use temp files with proper cleanup
- ffmpeg 8.1.1 installed with libopus, libmp3lame, x264, x265, libvpx

### Hybrid Vector Search
- `saveEmbedding()`, `searchEmbeddings()`, `cosineSimilarity()`, `indexSource()`
- `VECTOR_AUTO_INDEX=true` → embeddings generated on every ingestion
- `npm run migrate-vectors` → indexes all sources into embeddings table

### Fulltext Search (FlexSearch)
- Per-entity indexes: personas, knowledge_sources, contacts, goals, org_memory, tasks, skills
- Built on startup from MySQL data
- `search(collection, query, limit)` → fast fulltext search

### Creative Engine
- Templates: quote_post, announcement_post, carousel_slide, minimal_blog
- Post sizes: instagram_post, instagram_story, instagram_carousel, facebook_post, twitter_post, linkedin_post, youtube_thumbnail, blog_banner, ebook_cover
- `compileTemplate()` via Handlebars → HTML, `generateWithLLM()` for content generation

### Job Queue (BullMQ)
- Queues: proactive, followup, ingestion, embedding, notification, automation, blog, email
- Fallback to interval-based if Redis unavailable

### Realtime Events (Socket.IO)
- Rooms: user:{userId}, session:{sessionId}
- Events: new_message, agent_thinking, agent_step, xp_update, badge_earned, stage_advance, goal_update, creative_progress, override_status, cognitive_state

### Synapse Engine (`.synapse/`)
7-layer memory hierarchy: L0 (Constitution) → L1 (Global) → L2 (Agent) → L3 (Workflow) → L4 (Task) → L5 (Squad) → L6 (Keyword) → L7 (Star Command)

### Claude Multi-Agent Governance (`.claude/`)
Rules, skills, sub-agents (Architect, QA, UX), git hooks (pre-commit, enforce-git-push-authority)

### Conclave Multi-Agent Debate
Temporary team of specialists (sub-agents) debate before executing critical tasks. Generates synthesized Chain of Thought summary.

### Blueprint System
- CRUD + clone + seed (5 official: Coach de Vendas, Hipnoterapeuta, Tutor ENEM, Consultor Imobiliário, Nutricionista)
- `cloneBlueprint()` creates new persona from blueprint config
- `savePersonaAsBlueprint()` extracts persona config into reusable template

### B2B Prospecting
- Pipeline: discover → enrich → score → analyze → diagnose
- Discovery: Serper API (Google), 5 query variations, dedup by domain/CNPJ
- Enrichment: CNPJ via BrasilAPI, site scraping (emails, phones, socials), phone-to-CNPJ fallback
- Scoring: 0-100 (has_website, has_instagram, has_google_maps, capital_social, reviews, etc.)
- Market Analysis + Lead Diagnosis: LLM-generated insights
- Chat: `/prospect <nicho> [cidade]`, `/prospect cnpj <CNPJ>`, `/prospect stats`

### External Tools (35+)
Free: weather, cep_lookup, geocoding, cat_facts, dog_facts, jokes, advice, horoscope, exchange_rates, wikipedia, number_fact, word_definition, qr_code, url_metadata, ibge_search
API key: b2b_search (Serper), google_places (Serper), news_search (GNews), youtube_search (YouTube Data), site_scraper

### WhatsApp Smart Intent Detection
- `_detectIntent(text)` → location, poll, contact, list, image, video, audio, buttons
- Brazilian city mapping, auto-read receipts, typing indicators, humanized pacing

### Chat Commands Seed
Default: `/ajuda`, `/ping`, `/bonjour`, `/hola`, `/hi`, `/piada` (joke), `/fato` (fact), `/clima` (weather)

## Admin Chat Commands

| Command | Access | Description |
|---------|--------|-------------|
| `/admin` | admin | Admin dashboard |
| `/stop` | anyone | Interrupt response |
| `/silence <N>` | anyone | Silence persona for N messages |
| `/persona` | anyone | List/switch personas |
| `/persona create <desc>` | admin | Meta-RAG create |
| `/voice` | anyone | List/switch TTS voice |
| `/tasks` | user | Manage tasks |
| `/calendar` | user | Upcoming events |
| `/contacts` | user | Manage contacts |
| `/automations` | user | Manage automations |
| `/dashboard` | user | Dashboard overview |
| `/goals` | user | Manage goals |
| `/stages` | user | Conversation stages |
| `/orgmem` | user | Org memory |
| `/xp` | user | Gamification stats |
| `/progress` | user | Progress state |
| `/cognitive` | user | Cognitive state |
| `/override` | admin | Human override (full/approval/observation) |
| `/thoughts` | admin | Agent thought logs |
| `/suggestions` | admin | Self-optimization suggestions |
| `/creative` | admin | Generate visual content |
| `/blog` | admin | Blog posts |
| `/email` | admin | Send email |
| `/search` | anyone | Knowledge search |
| `/prospect` | anyone | B2B prospecting |
| `/quiz` | anyone | Interactive quizzes |
| `/context` | anyone | Recent conversation context |
| `/reflect` | anyone | Persona self-reflection |
| `/events` | anyone | Event log |
| `/media` | admin | Media listing |
| `/workspace` | admin | Workspace management |
| `/billing` | admin | Plans and usage |
| `/lang` | anyone | Switch language |
| `/plan` | anyone | AI planning agent |
| `/history` | anyone | Session history |
| `/export` | admin | Export DB data |
| `/stats2` | anyone | Global statistics |
| `/config` | admin | Quick settings |
| `/keys` | admin | Integration management |
| `/blueprints` | anyone | List/clone blueprints |
| `/health` | anyone | Integration health |
| `/settings` | admin | Settings management |
| `/users` | admin | User management |
| `/fidelidade` | user | Loyalty program |
| `/relatorios` | user | Financial reports |
| `/broadcast` | admin | Mass campaigns |
| `/vincular` | bot | Link bot account |
| `/desvincular` | bot | Unlink bot account |

## API Endpoints

### Admin API (auth + admin role required)
| Resource | Methods |
|----------|---------|
| Users | GET/PUT/DELETE `/api/admin/users`, role management |
| Personas | GET/POST `/api/admin/personas`, generate, toggle, CRUD |
| Skills | GET/POST/PUT/DELETE `/api/admin/skills`, invoke |
| Tasks | GET/POST/PUT/DELETE `/api/admin/tasks` |
| Calendar | GET/POST/PUT/DELETE `/api/admin/calendar` |
| Contacts | GET/POST/PUT/DELETE `/api/admin/contacts` |
| Automations | GET/POST/PUT/DELETE `/api/admin/automations` |
| Dashboard | GET `/api/admin/dashboard` |
| Goals | GET/POST/PUT/DELETE `/api/admin/goals`, hierarchy, progress |
| Stages | GET/POST/PUT/DELETE, init-defaults, user stage, advance |
| Org Memory | GET/POST/PUT/DELETE `/api/admin/org-memory`, search |
| Surveys | GET/POST/PUT/DELETE `/api/admin/surveys`, responses |
| Ratings | GET `/api/admin/ratings` |
| Follow-ups | GET/POST `/api/admin/followups`, send |
| Bots | GET/POST/PUT/DELETE `/api/admin/bots`, start/stop/start-all |
| Integrations | GET/POST/PUT/DELETE `/api/admin/integrations`, toggle, test |
| Knowledge | GET `/api/admin/knowledge`, reindex, upload |
| Settings | GET/PUT `/api/admin/settings` |
| MCP | GET/POST/DELETE `/api/admin/mcp`, connect |
| Blueprints | CRUD + clone + apply + from-persona + stats + categories + niches |
| Events | GET log + stats |
| Search | GET `/api/admin/search`, stats |
| Loyalty | Programs, balance, history, earn, redeem, rewards, stats, expire |
| Broadcasts | CRUD + send + logs + stats |
| Reports | Dashboard, revenue, top-products, sales-trend, conversion, customers |
| Recovery | Inactive, churn-risk, at-risk, seed-automations |
| Delivery | Drivers, assign, status, track |
| ERP | Products, orders, stock, finance, suppliers, site CMS, coupons |
| Wizard | GET/POST steps, apply, reset |
| Thoughts | GET thoughts + stats |
| Override | Activate, deactivate, status, list |
| Vector | Stats, reindex |
| Creative | CRUD + generate + templates |

### Public API
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Chat (JSON, rate-limited, persona-aware) |
| `/api/chat/stt` | POST | Speech-to-text |
| `/api/chat/tts` | POST | Text-to-speech |
| `/api/chat/rating` | POST | Submit rating |
| `/api/chat/personas` | GET | List personas |
| `/api/chat/persona/switch` | POST | Switch persona |
| `/api/chat/persona/create` | POST | Meta-RAG create |
| `/api/chat/persona/current` | GET | Current persona + ttsVoice |
| `/api/chat/surveys/active` | GET | Active survey |
| `/api/chat/blueprints` | GET | List active blueprints |
| `/api/auth/register` | POST | Register |
| `/api/auth/login` | POST | Login |
| `/api/auth/google` | POST | Google OAuth |
| `/api/auth/link-code` | POST | Generate link code (auth) |
| `/api/auth/link` | POST | Link bot account |
| `/api/auth/unlink` | POST | Unlink bot account (auth) |
| `/api/auth/me` | GET | Current user |
| `/api/store/*` | Various | Public storefront (products, categories, orders, brand, coupons, loyalty) |

## Database Schema (41 tables)
users, sessions, messages, profiles, posts, comments, feedback, settings, api_keys, personas, persona_skills, persona_tasks, persona_calendar, persona_contacts, persona_automations, persona_messages, persona_goals, persona_conversation_stages, persona_user_stages, persona_org_memory, rate_limits, surveys, survey_responses, ratings, follow_ups, bot_instances, onboarding_steps, user_onboarding, mcp_servers, user_xp, user_xp_log, user_progress, cognitive_states, human_overrides, agent_thoughts, persona_blueprints, event_log, b2b_searches, chat_commands + ERP tables (products, product_variants, product_categories, orders, order_items, deliveries, notifications, financial_transactions, payment_links, suppliers, site_sections, coupon_codes, commerce_carts) + loyalty tables (loyalty_programs, loyalty_transactions, loyalty_rewards) + broadcast tables (broadcasts, broadcast_logs) + delivery tables (delivery_drivers, delivery_assignments)

## Key File Structure
- `src/chat/engine.js` — Central chat engine (rate limit, onboarding, persona RAG, tools, agentic loop)
- `src/auth/index.js` — Auth (register, login, Google OAuth, JWT, role-based)
- `src/auth/rateLimit.js` — Rate limiting per role + ban enforcement
- `src/onboarding/index.js` — Onboarding state machine (whitelabel, 3 langs)
- `src/persona/manager.js` — Multi-persona DB persistence, cache invalidation
- `src/persona/meta-rag.js` — Meta-RAG persona generation, switchPersona
- `src/persona/config.js` — Default persona definitions, buildSystemPrompt
- `src/skills/index.js` — Skills CRUD + invocation
- `src/agent/index.js` — Tasks, calendar, contacts, automations, history, dashboard
- `src/goals/index.js` — Goal hierarchy, progress, context injection
- `src/stages/index.js` — Conversation stages, user tracking, context injection
- `src/orgmemory/index.js` — Org memory CRUD + search + context injection
- `src/gamification/index.js` — XP, levels, streaks, badges, leaderboard
- `src/progress/index.js` — Per-user progress state
- `src/cognitive/index.js` — Cognitive state analysis (emotion, intent, churn, engagement)
- `src/override/index.js` — Human override (full/approval/observation)
- `src/thoughts/index.js` — Agent thought logging
- `src/optimization/index.js` — Self-optimization suggestions
- `src/proactive/index.js` — Proactive intelligence (cron-based)
- `src/events/index.js` — Event bus (12 event types)
- `src/blueprints/index.js` — Blueprint CRUD + clone + seed
- `src/loyalty/index.js` — Loyalty programs (points, cashback, stamp_card, tier)
- `src/broadcast/index.js` — Mass campaigns via WhatsApp/Telegram
- `src/b2b/index.js` — B2B prospecting pipeline
- `src/bot/manager.js` — Multi-instance Telegram + WhatsApp
- `src/llm/tools.js` — 34+ base LLM tool definitions
- `src/llm/erp-tools.js` — 30+ ERP + commerce tools
- `src/llm/integrationManager.js` — Multi-key fallback, auto-detect Ollama/Groq
- `src/llm/index.js` — LLM chat, parseStream, normalizeLLMResponse
- `src/knowledge/` — config, store (TF-IDF), ingester (multimodal)
- `src/embeddings/` — Vector search (Ollama embeddings, cosine similarity)
- `src/tts/index.js` — Kokoro + Edge TTS fallback
- `src/stt/` — Whisper local + Groq + OpenAI Whisper (ffmpeg normalization to WAV 16kHz mono)
- `src/media/ffmpeg.js` — FFmpeg utilities: convertAudio, concatAudio, trimAudio, extractAudio, normalizeAudio, getAudioInfo
- `src/routes/admin.js` — Admin API
- `src/routes/chat.js` — Chat API
- `src/routes/auth.js` — Auth API
- `src/routes/erp.js` — ERP admin API
- `src/routes/storefront.js` — Public store API
- `src/server.js` — Express server, startup
- `src/db/index.js` — MySQL pool + schema init + migration (41+ tables)
- `pet/pet.html` — Companion Pet (Electron + Three.js Neural Link Brain)

## Whitelabel Settings
| Setting | Default | Description |
|---------|---------|-------------|
| brand_name | (empty) | Brand name |
| brand_tagline | (empty) | Tagline |
| brand_logo_url | (empty) | Logo URL |
| brand_primary_color | (empty) | Primary hex color |
| brand_secondary_color | (empty) | Secondary hex color |
| onboarding_enabled | true | Enable/disable onboarding |
| message_chunk_size | 200 | Max chars per message chunk |
| rate_limit_* | 5/30/100/999 | Per-role daily limits |
| loyalty_enabled | false | Enable loyalty system |
| store_delivery_fee | 0 | Default delivery fee |
| store_free_delivery_above | 90 | Free delivery threshold |
| store_delivery_zones | JSON | Delivery zone config |

## Frontend Architecture
- **Vue 3** (CDN, Composition API, no build step) + **Tailwind CSS** + **Socket.IO Client**
- `public/index.html` — SPA (landing, auth, chat, content, search)
- `public/admin.html` — Admin dashboard (all management sections)
- `public/store.html` — Whitelabel e-commerce storefront
- `pet/pet.html` — Companion Pet (Electron + Three.js)

Views: Landing, Auth, Chat, Content, Search, Onboarding, Donate

Chat flow: POST `/api/chat` → server generates sessionId → persona switch clears messages → Socket.IO realtime events

### Companion Pet (3D Neural Link Brain)
**File:** `pet/pet.html` — standalone Electron/HTML companion widget

**3D Scene Architecture:**
- Brain: Two hemispheres with wrinkle-displaced SphereGeometry + cerebellum + brain stem, MeshPhysicalMaterial (clearcoat, transparency, metallic sheen)
- Cortical wireframe overlay: slightly scaled-up mesh with wireframe (ethereal outer shell)
- Inner glow spheres: BackSide-rendered spheres inside each hemisphere for subsurface light
- 2-layer atmosphere: outer glowSphere (radius 3.2) + inner glowSphere2 (radius 2.4) with additive-opacity
- Neural Link Crown: 16 electrode nodes at EEG positions, 28 curved signal traces (QuadraticBezierCurve3 → TubeGeometry), main + glow traces
- Processor chip: BoxGeometry with MeshPhysicalMaterial at stem base, 6 blinking LED edge dots
- Energy tendrils: 6 CatmullRomCurve3 tubes connecting hemispheres across the fissure
- Synaptic particles: 80 additive-blending points with per-particle drift
- Cinematic 3-point lighting: key (upper-right), fill (left), rim (back-left, purple)
- Camera float: gentle Y-axis sinusoidal drift

**State System (7 states):** idle (purple), listening (cyan), thinking (gold), speaking (pink), excited (red), frustrated (red-orange), curious (green)
Each state defines: color, emissiveIntensity, speed, scale, amplitude, particleSpeed. Smooth LERP transitions (factor 0.06).

**Chat Integration:** Socket.IO realtime events, chat panel with persona avatar, typing animation, STT/Whisper, TTS/Kokoro auto-play, persona switcher, drag-drop floating window.

**Key Variables:** `brainMat`, `nlGroup`, `nlNodes`, `nlTraces`, `curSpeed`, `curAmp`, `curEmissive`, `curGlow`, `scanMat`, `STATES_3D`

**Constraints:** Three.js r128 CDN (no ES modules, no import maps), all JS inline in pet.html, Persona IDs preserve hyphens

## LLM Tools — Web, Filesystem, Automation, Communication

### Web Tools
| Tool | Description |
|------|-------------|
| `web_search` | Search the web with smart provider routing (Serper → SerpAPI → SearXNG → Perplexica). Auto-selects best available provider. |
| `web_fetch` | Fetch and extract text content from a URL. Strips HTML, extracts article/main content, returns title + cleaned text. |

### Filesystem Tools
| Tool | Description |
|------|-------------|
| `read_file` | Read file content from the workspace. Delegates to workspace-manager. |
| `write_file` | Create or overwrite a file in the workspace. |
| `list_dir` | List directory contents in the workspace. |
| `edit_file` | Apply targeted edit to an existing file (find old_string → replace with new_string). |
| `append_file` | Append content to the end of an existing file. |

### Automation & Execution
| Tool | Description |
|------|-------------|
| `exec` | Run shell commands in the workspace sandbox (admin/meta-persona only). Configurable cwd and timeout. |
| `cron` | Schedule, list, and delete cron jobs (uses persona_automations table). Actions: create, list, delete. |

### Communication Tools
| Tool | Description |
|------|-------------|
| `message` | Send a proactive follow-up message to the user via Socket.IO (real-time). |
| `send_file` | Send a file attachment to the active chat via Socket.IO (reads from workspace, sends as base64 with mime detection). |

### Skills & Agent Tools
| Tool | Description |
|------|-------------|
| `find_skills` | Search external tool registry for installable skills by query and category. |
| `install_skill` | Install a skill from registry (admin only, returns manual setup instructions). |
| `spawn` | Launch a background subagent as a task in persona_tasks table (admin only). Supports explore/general types. |

### Audio/Media LLM Tools
| Tool | Description |
|------|-------------|
| `convert_audio` | Convert audio between formats (WAV, MP3, OGG, FLAC, M4A). Uses ffmpeg. |
| `merge_audio` | Concatenate multiple audio files into one (WAV/MP3/OGG). |
| `trim_audio` | Extract a time segment from audio by start time and duration. |
| `extract_audio` | Extract audio track from video files (MP4, AVI, MKV, etc). |

### Provider Routing (web_search)
The `web_search` tool automatically tries providers in priority order:
1. **Serper** (Google Search API) — `SERPER_KEY` env var
2. **SerpAPI** (Google Search) — `SERPAPI_KEY` env var
3. **SearXNG** (self-hosted metasearch) — `SEARXNG_URL` env var
4. **Perplexica** (self-hosted Perplexity) — `PERPLEXICA_URL` env var

If no provider is configured, returns an error message listing the required env vars.

## ERP System

Complete ERP module: products (variants, categories, stock, SEO), orders (lifecycle with status transitions), finance (transactions, payment links), suppliers (search, rating, payment terms), site CMS (i18n sections, reorder), coupons.

**Backend:** `src/erp/` — products, orders, finance, suppliers, site, commerce, reports, recovery, delivery
**Routes:** `src/routes/erp.js` (admin), `src/routes/storefront.js` (public)
**LLM Tools:** `src/llm/erp-tools.js` — 30+ tools (products, orders, stock, finance, suppliers, site, commerce)

### Commerce System (WhatsApp Store)
Flow: customer message → LLM detects product interest → catalog_search → commerce_add_to_cart → commerce_set_address → commerce_set_payment → commerce_apply_coupon → commerce_finalize_order

**Cart State Machine:** browsing → building_order → confirming_address → confirming_payment → confirming_order → completed

**10 Commerce LLM Tools:** commerce_add_to_cart, commerce_remove_from_cart, commerce_cart_summary, commerce_clear_cart, commerce_set_address, commerce_set_payment, commerce_apply_coupon, commerce_finalize_order, commerce_get_order, commerce_calculate_delivery

**Delivery Zones:** Centro (free), Bairro (R$5), Rural (R$7), Premium (R$10), free above R$90 (configurable)

**Payment Methods:** cash, pix, credit_card, debit_card, bank_transfer, boleto (configurable via settings)

**Commerce System Prompt:** natural conversation only, no slash commands, proactive selling, upsell/cross-sell, LLM auto-uses commerce tools

**Store Persona Config:** `WHATSAPP_PERSONA_ID` env var sets default WhatsApp persona. `loja-hlb` pattern: commerce-only identity, no religious content.

### Storefront (Whitelabel E-commerce SPA)
Public API `/api/store/*` (no auth): brand, sections, products, categories, orders, coupons, loyalty
Features: dynamic brand colors, product catalog, cart (localStorage), checkout → WhatsApp deep link, coupon discounts, 3-language i18n

### Admin Panel — ERP Sections
Produtos, Pedidos, Estoque, Financeiro, Fornecedores, Site CMS, Cupons, Entrega

### Loyalty System
Programs: points, cashback, stamp_card, tier (per persona or global)
Key functions: earnPoints, redeemPoints, getLoyaltyBalance, formatLoyaltyContext
Tables: loyalty_programs, loyalty_transactions, loyalty_rewards
Commands: `/fidelidade`, `/pontos`, `/cashback`, `/loyalty`
Integration: finalizeOrder auto-calls earnPoints when loyalty enabled

### Broadcast System
Segments: all, new (7d), inactive_7d/15d/30d, vip, tag
Tables: broadcasts, broadcast_logs
Command: `/broadcast list/send <id>`

### Reports Module
getRevenueReport, getOrdersByStatus, getTopProducts, getSalesTrend, getCustomerMetrics, getConversionFunnel, getFullDashboard
Command: `/relatorios` (vendas, produtos, tendencia, funil)
LLM Tools: reports_dashboard, reports_top_products, reports_sales_trend, reports_conversion_funnel

### Customer Recovery
getInactiveCustomers, getChurnRiskCustomers, getAtRiskCustomers, seedRecoveryAutomations (7d, 15d, 30d)

### Delivery Driver Module
createDriver, listDrivers, assignDriver, updateAssignment, getOrderAssignment
Tables: delivery_drivers, delivery_assignments

### Setup Wizard
5 steps: brand → persona → products → whatsapp → finish

## Critical Constraints

- `pdf-parse` must be v1.1.1 — v2.x has breaking API changes
- MySQL `LIMIT ? OFFSET ?` with `pool.execute()` (prepared statements) fails — must interpolate as `${Number(limit)}`
- Persona IDs preserve original format including hyphens — do NOT sanitize with regex
- `buildSystemPrompt()` must handle both string and object identity formats
- `switchPersona()` clears message history to prevent persona contamination
- Message saving: `processMessage` saves assistant messages — do NOT double-save in bot handlers
- TTS voice: persona.ttsVoice passed through to Kokoro/Edge TTS
- Meta-persona (id: "meta-persona") has ALL tools enabled
- Agent module CRUD uses VARCHAR primary keys `prefix_timestamp_random`
- `createPersona()` must preserve existing fields from cache
- `loadPersonas()` must NOT fallback to Jesus persona fields for custom personas
- **Product INSERT** must have exactly 38 columns matching 38 placeholders
- **Order INSERT** must have exactly 27 columns matching 27 placeholders
- Payment method mapping: `dinheiro` → `cash`, `cartao` → `credit_card` (ENUM values)
- `commerce_carts` table uses `session_id` as cart key (not user_id)
- Storefront routes are PUBLIC (no auth) — `/api/store/*`
- Admin ERP routes require auth + admin role — `/api/erp/*`
- `admin.js` uses `loading()` not `showLoading()`
- Settings allowlist in admin routes includes store_* keys
- `seedDefaultCommands` must be exported from `src/chat/commands.js`
- `WHATSAPP_PERSONA_ID` env var sets default persona for WhatsApp messages
- Commerce persona onboarding uses `PERSONA_STEP_CONFIGS` keyed by persona_id
- Store persona identity must NOT be NULL — requires commerce-only identity in DB
- `catalog_search` filters by `context.personaId`
- `session_id` is optional in commerce tools — falls back to `context.sessionId`
- Payment methods configurable via settings: `store_payment_methods`, `store_pix_key`, `store_pix_name`, `store_bank_info`
- PIX key injected into commerce prompt — LLM tells customers real PIX key, NEVER makes up payment info
- Three.js r128 CDN (no ES modules, no import maps) — all JS inline in pet.html
- Chat engine at `src/chat/engine.js` — Pet connects via Socket.IO + REST