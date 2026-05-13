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
- **TTS**: Kokoro-82M (default) + Edge TTS (fallback) + Google Translate (fallback)
- **Blog**: Auto-generated daily devotionals via LLM
- **Email**: Nodemailer (SMTP) — newsletter, contact, daily devotional
- **i18n**: pt-BR (default), en-US, es-ES

## Commands
- `npm start` — Start the server (initializes DB schema automatically)
- `npm run dev` — Start with watch mode
- `npm run ingest` — Ingest knowledge sources into TF-IDF index
- `npm run ngrok` — Start Cloudflare tunnel and configure Evolution API webhook (alias: `npm run tunnel`)

## Prerequisites
1. MySQL 8.4 running on localhost (root, no password, database `jesus_ai`)
2. Ollama Cloud API key must be set in `.env`
3. Run `npm run ingest` before first use to populate the search index
4. DB schema is auto-created on server startup
5. (Optional) Kokoro TTS: `pip install kokoro soundfile fastapi uvicorn` then `python tts-server/kokoro_server.py`
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
- `src/routes/chat.js` — Chat API (SSE streaming, sessions, profiles, feedback, donate, STT)
- `src/routes/auth.js` — Auth API (register, login, Google OAuth, profile)
- `src/routes/blog.js` — Blog API (posts, comments, replies, search)
- `src/routes/whatsapp.js` — WhatsApp webhook + group management endpoints
- `src/routes/email.js` — Email API (subscribe, confirm, unsubscribe, contact, daily devotional)
- `src/telegram/bot.js` — Telegram bot with commands, chat, and group support
- `src/whatsapp/bot.js` — WhatsApp bot (Evolution API v2, groups, audio handling)
- `src/tts/index.js` — TTS engine (Kokoro + Multivozes + Edge TTS + Google Translate, multi-language voices)
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
- `public/js/app.js` — Frontend logic (SSE, i18n, auth, chat, blog, search, newsletter, contact)
- `data/bible_verses.json` — Processed documents (generated by ingest)
- `data/bible_index.json` — TF-IDF index (generated by ingest)

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
| `TTS_VOICE` | `antonio` | TTS voice (Edge TTS voices or Kokoro voice names) |
| `KOKORO_URL` | `http://localhost:8000` | Kokoro TTS server URL |
| `KOKORO_VOICE` | — | Kokoro voice override (pf_dora, af_heart, etc.) |
| `KOKORO_LANG` | — | Kokoro language override (p, a, e) |
| `GROQ_API_KEY` | — | Groq API key for STT |
| `SMTP_HOST` | — | SMTP server host |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | From email address |
| `APP_URL` | `http://localhost:3000` | Public app URL for email links |

### Known Issues & TODO
- See `ROADMAP.md` for full planning
- `routes/chat.js` — `saveProfile` import fixed (was missing)
- Duplicate LLM call logic across chat, telegram, whatsapp, blog — needs centralization
- System prompt still lives in `src/system-prompt.js` AND `src/persona/config.js` — migrate fully to persona
- WhatsApp uses both webhook and polling — can duplicate messages
- No rate limiting, no CORS, no API versioning yet
- Google OAuth doesn't validate id_token server-side