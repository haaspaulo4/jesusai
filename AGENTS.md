# AGENTS.md

## Project: Jesus.AI

Assistente virtual inspirado nos ensinamentos de Jesus Cristo, baseado na Bíblia Sagrada com RAG (Retrieval-Augmented Generation).

**Disclaimer:** Toda glória a Jesus. Este projeto não substitui a busca pela Palavra, pela comunidade de fé, pela igreja ou pelo acompanhamento pastoral.

## Tech Stack
- **Backend**: Node.js 18+ + Express
- **Database**: MySQL 8.4 (via mysql2/promise)
- **LLM**: Ollama Cloud API (OpenAI-compatible) — model glm-5.1
- **RAG**: Pluggable TF-IDF (knowledge/sources/bible, json, text)
- **Persona**: Pluggable persona config (persona/config.js)
- **Bible Data**: NT: Local files from bible-api repo (pt-BR-blt) | OT: bible-api.com (Almeida)
- **Frontend**: HTML/CSS/JS vanilla com SSE streaming + microfone/STT
- **Auth**: JWT + bcrypt + Google OAuth (passport-style)
- **Telegram Bot**: node-telegram-bot-api com polling + suporte a grupos
- **WhatsApp Bot**: Evolution API v2 via webhook + suporte a grupos
- **STT**: Groq Whisper (primary) + OpenAI Whisper (fallback) + web mic input
- **TTS**: Kokoro-82M (default, user-managed) + Edge TTS (fallback) + Google Translate (fallback)
- **TTS Engine**: Direct Kokoro try → Edge TTS fallback per chunk, sequential with fallback lock (no voice mixing)
- **TTS Web**: `/api/tts` endpoint serves Kokoro WAV to browser (falls back to speechSynthesis)
- **TTS Health**: `src/tts/kokoro-manager.js` — health check every 60s, logs only state changes, warmup on startup/reconnect
- **Blog**: Auto-generated daily devotionals via LLM
- **Email**: Nodemailer (SMTP) — newsletter, contact, daily devotional
- **i18n**: pt-BR (default), en-US, es-ES

## Commands
- `npm start` — Start the server (initializes DB schema automatically)
- `npm run dev` — Start with watch mode
- `npm run ingest` — Ingest knowledge sources into TF-IDF index
- `npm run ngrok` — Start Cloudflare tunnel and configure Evolution API webhook (alias: `npm run tunnel`)
- `npm run tts:start` — Start Kokoro TTS server manually on port 8001
- `npm run tts:install` — Install Kokoro Python dependencies
- `npm run tts:check` — Check Kokoro TTS server health on port 8001

## Prerequisites
1. MySQL 8.4 running on localhost (root, no password, database `jesus_ai`)
2. Ollama Cloud API key must be set in `.env`
3. Run `npm run ingest` before first use to populate the search index
4. DB schema is auto-created on server startup
5. (Required) Kokoro TTS: `npm run tts:install` then `npm run tts:start` — server starts on port 8001
6. (Optional) Edge TTS: `pip install edge-tts`

## Architecture

### Data Flow
```
User question → Extract context (name, topics, emotions — from persona config)
             → Knowledge search (TF-IDF, top-K from enabled sources)
             → Build prompt: PERSONA_IDENTITY + CONTEXT + MEMORY + PROFILE
             → Ollama Cloud API call (streaming for web, non-streaming for Telegram/WhatsApp)
             → Response streams via SSE (web) or chunks (Telegram/WhatsApp)
             → Save message + update session/profile (MySQL)
             → Generate summary every 10 messages
```

### TTS Flow
```
Text → cleanTextForTTS (strip markdown, emojis, surrogates, control chars)
     → if fits in maxChunk (5000): try Kokoro direct → fall back to Edge TTS
     → if longer: splitTextForTTS (at sentence boundaries)
       → for each chunk: try engine (Kokoro if TTS_MODE=kokoro)
       → if engine fails on any chunk: fellBack=true, use Edge TTS for remaining
       → concat all buffers, set contentType (audio/wav or audio/mp3)
     → Telegram: sendVoice per audio chunk (300 chars each)
     → WhatsApp: sendReplyWithAudio — text first, then audio per chunk (300 chars)
     → Web: POST /api/tts returns full audio buffer
```

### Pluggable Architecture
- **Knowledge sources**: `src/knowledge/config.js` defines corpus (Bible, books, docs). Swappable via config.
- **Persona**: `src/persona/config.js` defines identity, rules, keywords, templates. Swappable via `PERSONA` env var.
- **Ingesters**: `src/knowledge/sources/` — bible.js, json.js, text.js. Add new sources by creating new files.
- **Store**: `src/knowledge/store.js` — generic TF-IDF engine. Works with any corpus defined in config.

### Database Schema
- **users** — id, email, password, name, google_id, avatar, ollama_api_key, telegram_chat_id
- **sessions** — id, user_id, user_name, user_context (JSON), summary, timestamps
- **messages** — id, session_id, role, content, timestamp (FK to sessions)
- **profiles** — id, name, story, topics (JSON), emotions (JSON), spiritual_journey, prayer_requests (JSON)
- **posts** — slug (PK), title, topic, verse, content, sources (JSON), published_at
- **comments** — id, post_slug, parent_id, author_name, author_id, content, created_at (FK to posts)
- **feedback** — id, type, message, user_id, session_id, created_at, status
- **newsletter_subscribers** — id, email, name, confirmed, confirm_token, unsub_token, created_at
- **contact_messages** — id, name, email, subject, message, user_id, status, created_at

### Key File Structure
- `src/knowledge/config.js` — Knowledge source definitions (Bible, books, etc.)
- `src/knowledge/store.js` — Pluggable TF-IDF search engine
- `src/knowledge/ingester.js` — Multi-source ingestion orchestrator
- `src/knowledge/sources/bible.js` — Bible ingester (NT local + OT API)
- `src/knowledge/sources/json.js` — JSON document ingester
- `src/knowledge/sources/text.js` — Text file ingester (auto-chunk)
- `src/persona/config.js` — Persona definitions (identity, rules, keywords, templates)
- `src/server.js` — Express server entry point + DB init + daily blog + email scheduling
- `src/i18n/index.js` — UI translations (pt-BR, en-US, es-ES)
- `src/routes/chat.js` — Chat API (SSE streaming, sessions, profiles, feedback, donate, STT, TTS)
- `src/routes/auth.js` — Auth API (register, login, Google OAuth, profile)
- `src/routes/blog.js` — Blog API (posts, comments, replies, search)
- `src/routes/whatsapp.js` — WhatsApp webhook + group management endpoints
- `src/routes/email.js` — Email API (subscribe, confirm, unsubscribe, contact, daily devotional)
- `src/telegram/bot.js` — Telegram bot with commands, chat, voice handling, group support
- `src/whatsapp/bot.js` — WhatsApp bot (Evolution API v2, groups, audio handling)
- `src/tts/index.js` — TTS engine (Kokoro direct-try → Edge TTS fallback, content-type tracking, sequential chunk generation with fallback lock)
- `src/tts/kokoro-manager.js` — Kokoro health check only (no auto-start), 60s interval, logs state changes only, warmup pipeline
- `src/stt/index.js` — STT engine (Groq Whisper + OpenAI Whisper fallback, filename sanitization)
- `src/rag/store.js` — Backward-compatible re-export (delegates to knowledge/store.js)
- `src/memory/session.js` — Session management (MySQL-backed)
- `src/memory/profile.js` — Profile management (MySQL-backed)
- `src/blog/index.js` — Blog engine (generate, MySQL storage, comments with replies)
- `src/auth/index.js` — Auth core (register, login, Google OAuth, JWT, MySQL users)
- `src/email/index.js` — Email core (send, templates, newsletter, contact, devotional)
- `src/db/index.js` — MySQL connection pool + schema initialization
- `src/utils/bible.js` — Bible data reader (local NT + API OT)
- `public/index.html` — Landing page + auth modal + chat SPA
- `public/css/style.css` — Full UI styles (dark premium theme, glassmorphism, animations)
- `public/js/app.js` — Frontend logic (SSE, i18n, auth, chat, blog, search, newsletter, contact, TTS)
- `data/bible_verses.json` — Processed documents (generated by ingest)
- `data/bible_index.json` — TF-IDF index (generated by ingest)
- `tts-server/kokoro_server.py` — Kokoro TTS Python server (FastAPI + uvicorn), WAV/MP3, pm_alex default for pt-BR
- `tts-server/requirements.txt` — Python deps: kokoro, soundfile, numpy, fastapi, uvicorn

### Environment Variables
See `.env.example` for the full list. Key variables:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_API_KEY` | — | Ollama Cloud API key (required) |
| `OLLAMA_BASE_URL` | `https://ollama.com/api` | LLM API base URL |
| `CHAT_MODEL` | `glm-5.1` | Model for chat |
| `PERSONA` | `jesus` | Persona ID (jesus, stoic, etc.) |
| `JWT_SECRET` | — | Secret for JWT tokens (required in production) |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | `` | MySQL password |
| `DB_NAME` | `jesus_ai` | MySQL database name |
| `PORT` | `3000` | Server port |
| `TELEGRAM_TOKEN` | — | Telegram bot token (optional) |
| `EVO_API_URL` | — | Evolution API base URL |
| `EVO_API_KEY` | — | Evolution API apikey |
| `EVO_INSTANCE` | `jesus-ai` | Evolution API instance name |
| `WHATSAPP_AUDIO` | `true` | Send TTS audio on WhatsApp |
| `TELEGRAM_AUDIO` | `true` | Send TTS voice on Telegram |
| `TTS_MODE` | `kokoro` | TTS engine: kokoro, multivozes, edge-tts |
| `TTS_VOICE` | `pm_alex` | TTS voice (Kokoro voice names or Edge TTS voices) |
| `KOKORO_URL` | `http://localhost:8001` | Kokoro TTS server URL |
| `KOKORO_VOICE` | — | Kokoro voice override (pf_dora, pm_alex, etc.) |
| `KOKORO_LANG` | — | Kokoro language override (p, a, e) |
| `GROQ_API_KEY` | — | Groq API key for STT |
| `SMTP_HOST` | — | SMTP server host |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | From email address |
| `APP_URL` | `http://localhost:3000` | Public app URL for email links |

### TTS Engine Details
- **Kokoro TTS**: Primary engine. User must start manually with `npm run tts:start` (port 8001). Server does NOT auto-start it.
- **Health check**: `kokoro-manager.js` checks `/health` every 60s with 10s timeout. Only logs when state changes (online↔offline).
- **Warmup**: On startup/reconnect, sends a "Paz" synthesis request to pre-load the pt-BR pipeline.
- **Fallback strategy**: Each `generateAudioBuffer` call tries Kokoro first. If Kokoro fails on a chunk, that chunk falls back to Edge TTS. Once fallback starts, all remaining chunks use Edge TTS (no voice mixing).
- **Content-type**: Kokoro generates WAV (`audio/wav`), Edge TTS generates MP3 (`audio/mp3`). Buffer objects track their content-type via `.contentType` property.
- **Telegram**: Sends audio in 300-char chunks via `sendVoice`, with correct content-type (wav/mp3).
- **WhatsApp**: Sends text first, then audio in 300-char chunks. Correct mimetype per engine.
- **Web**: `POST /api/tts` returns full audio buffer with correct `Content-Type` header.
- **Chunk splitting**: `splitTextForTTS(text, 300)` for Telegram/WhatsApp (fast per-chunk generation), `splitTextForTTS(text, 5000)` for web (full audio).

### Known Issues & TODO
- See `ROADMAP.md` for full planning
- `routes/chat.js` — `saveProfile` import fixed (was missing)
- Frontend TTS: `speakText()` calls `/api/tts` first, falls back to browser speechSynthesis
- Duplicate LLM call logic across chat, telegram, whatsapp, blog — needs centralization
- System prompt still lives in `src/system-prompt.js` AND `src/persona/config.js` — migrate fully to persona
- WhatsApp uses both webhook and polling — can duplicate messages
- No rate limiting, no CORS, no API versioning yet
- Google OAuth doesn't validate id_token server-side
- Telegram voice handler: `fetch failed` on rare networks — added 30s timeout and debug logging
- `node-telegram-bot-api` deprecation warning about content-type — functional, cosmetic only