# AGENTS.md

## Project: Jesus.AI

Assistente virtual inspirado nos ensinamentos de Jesus Cristo, baseado na Bíblia Sagrada com RAG (Retrieval-Augmented Generation).

**Disclaimer:** Toda glória a Jesus. Este projeto não substitui a busca pela Palavra, pela comunidade de fé, pela igreja ou pelo acompanhamento pastoral.

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: MySQL 8.4 (via mysql2/promise)
- **LLM**: Ollama Cloud API (OpenAI-compatible) — model glm-5.1
- **RAG**: TF-IDF local (bible_verses.json + bible_index.json)
- **Bible Data**: NT: Local files from bible-api repo (pt-BR-blt) | OT: bible-api.com (Almeida)
- **Frontend**: HTML/CSS/JS vanilla com SSE streaming + microfone/STT
- **Auth**: JWT + bcrypt + Google OAuth (passport-style)
- **Telegram Bot**: node-telegram-bot-api com polling + suporte a grupos
- **WhatsApp Bot**: Evolution API v2 via webhook + suporte a grupos
- **STT**: Groq Whisper (primary) + OpenAI Whisper (fallback) + web mic input
- **TTS**: Edge TTS (pt-BR voices) + Google Translate fallback
- **Blog**: Auto-generated daily devotionals via LLM
- **Email**: Nodemailer (SMTP) — newsletter, contact, daily devotional
- **i18n**: pt-BR (default), en-US, es-ES

## Commands
- `npm start` — Start the server (initializes DB schema automatically)
- `npm run dev` — Start with watch mode
- `npm run ingest` — Ingest Bible into TF-IDF index
- `npm run ngrok` — Start Cloudflare tunnel and configure Evolution API webhook (alias: `npm run tunnel`)

## Prerequisites
1. MySQL 8.4 running on localhost (root, no password, database `jesus_ai`)
2. Ollama Cloud API key must be set in `.env`
3. Run `npm run ingest` before first use to populate the search index
4. DB schema is auto-created on server startup

## Architecture

### Data Flow
```
User question → Extract context (name, topics, emotions)
             → TF-IDF search (top-8 verses)
             → Build prompt: IDENTITY + CONTEXT + MEMORY + PROFILE
             → Ollama Cloud API call (streaming for web, non-streaming for Telegram/WhatsApp)
             → Response streams via SSE (web) or chunks (Telegram/WhatsApp)
             → Save message + update session/profile (MySQL)
             → Generate summary every 10 messages
```

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

### Memory System
- Each user gets a sessionId (web: localStorage, Telegram: `tg_{chatId}`, WhatsApp: `wa_{phone}`)
- In groups: Telegram `tg_{chatId}_{userId}`, WhatsApp `wa_{senderPhone}`
- Sessions persisted in MySQL `sessions` + `messages` tables
- Profiles persisted in MySQL `profiles` table (cross-session, per userId)
- Context extraction: name (full name support), topics, emotions
- Summary generation every 10 messages via LLM

### Blog System
- Daily devotional auto-generated on startup & scheduled at midnight
- 31 rotating topics based on date
- Comments with nested replies (parent_id)
- Post generation uses LLM with Bible verse context

### Telegram Bot
- Commands: `/start`, `/ajuda`, `/versiculo`, `/buscar`, `/oracao`, `/devocional`, `/grupo`
- Group support: only responds when mentioned, quoted, or command used
- Session per user in groups: `tg_{chatId}_{userId}`
- MarkdownV2 escaping, long messages split into 800-char chunks
- TTS voice messages (Edge TTS, configurable voice)
- Voice messages: only transcribed in groups when bot is mentioned/replied to

### WhatsApp Bot
- Evolution API v2 via webhook (`POST /api/whatsapp/webhook`) + polling fallback
- Same RAG engine, memory system, i18n as web
- Session IDs: `wa_{phone}` for DMs, group uses sender's phone
- Group support: responds only when mentioned, quoted, or command used
- Auto-detects bot JID from env vars, API, or text mentions
- Long messages split into 800-char chunks with 1s+ delay
- Audio interval between TTS chunks: 2 seconds
- Rejects calls with custom message
- Group management API endpoints (create, add, remove, description, leave)

### Auth System
- Email/password registration and login (bcrypt + JWT)
- Google OAuth via `POST /api/auth/google`
- JWT tokens with 30-day expiry

### STT (Speech-to-Text)
- Web: microphone → `POST /api/stt` (multer + multipart)
- Telegram/WhatsApp: same Whisper pipeline
- Filename sanitization: validates extension, strips mimetype params

### Email System
- SMTP via Nodemailer
- Newsletter: subscribe, confirm (double opt-in), unsubscribe
- Daily devotional email (scheduled)
- Contact form: receives messages from landing page
- API: subscribe, confirm, unsubscribe, contact, daily-devotional

### i18n (Multilingual)
- Translation module: `src/i18n/index.js`
- Supported: pt-BR (default), en-US, es-ES
- System prompts adapted per language
- TTS voices mapped per language (pt-BR→Antonio, en-US→Guy, es-ES→Alvarez)
- STT language parameter from client to backend

### Landing Page
- Dark premium theme with glassmorphism, animated orbs, gradient effects
- Fixed nav with `backdrop-filter: blur(20px)` + scroll detection
- Hero section side-by-side layout (text + chat preview mockup)
- Feature cards with hover glow effects (`::before` shine line)
- Scroll-triggered fade-in animations via IntersectionObserver
- Newsletter + contact forms with glassmorphism card backgrounds
- Mobile hamburger menu, fully responsive
- Auth modal with `backdrop-filter: blur(16px)` + slide-up animation

## File Structure
- `src/db/index.js` — MySQL connection pool + schema initialization
- `src/server.js` — Express server entry point + DB init + daily blog + email scheduling
- `src/system-prompt.js` — Jesus identity + prompt templates (pt-BR only, i18n in separate module)
- `src/i18n/index.js` — Internationalization (translations, TTS/STT language maps)
- `src/routes/chat.js` — Chat API (SSE streaming, sessions, profiles, feedback, donate, STT)
- `src/routes/auth.js` — Auth API (register, login, Google OAuth, profile)
- `src/routes/blog.js` — Blog API (posts, comments, replies, search)
- `src/routes/whatsapp.js` — WhatsApp webhook + group management endpoints
- `src/routes/email.js` — Email API (subscribe, confirm, unsubscribe, contact, daily devotional)
- `src/telegram/bot.js` — Telegram bot with commands, chat, and group support
- `src/whatsapp/bot.js` — WhatsApp bot (Evolution API v2, groups, audio handling)
- `src/tts/index.js` — TTS engine (Edge TTS + Google Translate fallback, multi-language voices)
- `src/stt/index.js` — STT engine (Groq Whisper + OpenAI Whisper fallback, filename sanitization)
- `src/rag/store.js` — TF-IDF Bible search (tokenize, score, top-K)
- `src/rag/ingester.js` — Bible ingestion (local NT + API OT)
- `src/memory/session.js` — Session management (MySQL-backed)
- `src/memory/profile.js` — Profile management (MySQL-backed)
- `src/blog/index.js` — Blog engine (generate, MySQL storage, comments with replies)
- `src/auth/index.js` — Auth core (register, login, Google OAuth, JWT, MySQL users)
- `src/email/index.js` — Email core (send, templates, newsletter, contact, devotional)
- `public/index.html` — Landing page + auth modal + chat SPA
- `public/css/style.css` — Full UI styles (dark premium theme, glassmorphism, animations)
- `public/js/app.js` — Frontend logic (SSE, i18n, auth, chat, blog, search, newsletter, contact)
- `data/bible-api/` — Local Bible data (git cloned)
- `data/bible_verses.json` — Processed verses (generated by ingest)
- `data/bible_index.json` — TF-IDF index (generated by ingest)

## Environment Variables
See `.env.example` for the full list. Key variables:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_API_KEY` | — | Ollama Cloud API key (required) |
| `OLLAMA_BASE_URL` | `https://ollama.com/api` | LLM API base URL |
| `CHAT_MODEL` | `glm-5.1` | Model for chat |
| `JWT_SECRET` | — | Secret for JWT tokens (required in production) |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | `` | MySQL password |
| `DB_NAME` | `jesus_ai` | MySQL database name |
| `PORT` | `3000` | Server port |
| `TELEGRAM_TOKEN` | — | Telegram bot token (optional) |
| `TELEGRAM_BOT_USERNAME` | — | Bot username for landing links |
| `EVO_API_URL` | — | Evolution API base URL |
| `EVO_API_KEY` | — | Evolution API apikey |
| `EVO_INSTANCE` | `jesus-ai` | Evolution API instance name |
| `WHATSAPP_AUDIO` | `true` | Send TTS audio on WhatsApp |
| `TELEGRAM_AUDIO` | `true` | Send TTS voice on Telegram |
| `TTS_VOICE` | `antonio` | TTS voice: antonio, francisca, thalita |
| `GROQ_API_KEY` | — | Groq API key for STT |
| `SMTP_HOST` | — | SMTP server host |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | From email address |
| `APP_URL` | `http://localhost:3000` | Public app URL for email links |

## Key Design Decisions
1. **MySQL over JSON files** — Proper relational data, concurrent access, scalability
2. **TF-IDF over ChromaDB** — Simpler, no Docker dependency, works offline for Bible search
3. **Disclaimer in system prompt** — AI always directs people to real community
4. **Full name extraction** — Regex captures "Paulo Murilo Haas Girotto" not just "Paulo"
5. **Blog auto-generation** — Creates today's post on startup, schedules daily
6. **Comment replies** — Nested comment system with parentId support (MySQL-backed)
7. **Google OAuth** — Users can login with Google without passwords
8. **Cross-platform profiles** — Same profile for web, Telegram, and WhatsApp users
9. **Sessions filtered by userId** — Privacy: users only see their own conversations
10. **Group support** — Telegram and WhatsApp bots respond in groups only when mentioned/commanded
11. **STT via web** — Microphone button in chat input, audio sent to `/api/stt` for transcription
12. **i18n module** — Translations for pt-BR, en-US, es-ES; language-adaptive system prompts
13. **WhatsApp audio interval** — 2-second delay between TTS audio chunks to prevent API throttling
14. **Filename sanitization** — STT validates file extensions against whitelist, strips mimetype params
15. **Email system** — Double opt-in newsletter with unsubscribe, contact form, daily devotional
16. **Bot JID auto-detection** — WhatsApp group: prefer env vars, then API, then text-mention parsing
17. **Landing page premium UI** — Glassmorphism cards, animated orbs, scroll-triggered animations, responsive