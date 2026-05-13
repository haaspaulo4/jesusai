<div align="center">

# ✝ Jesus.AI — Whitelabel AI Platform

**Plataforma whitelabel de assistentes virtuais com RAG multimodal, multi-persona com Meta-RAG, onboarding automático, e gestão completa.**

[![License: MIT](https://img.shields.io/badge/License-MIT-c9a227.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1.svg)](https://www.mysql.com/)

</div>

---

> *"Vocês receberam de graça; deem de graça." — Mateus 10:8*

## O que é?

Jesus.AI é uma **plataforma whitelabel** de assistentes virtuais. Serve qualquer nicho — religioso, saúde, educação, negócios, coaching. A persona padrão é Jesus, mas você pode criar qualquer IA com `/persona create <descrição>`.

Tudo é gerenciável via admin API, chat commands, ou painel web. Personas definem identidade, skills, conhecimento, onboarding, follow-ups, e marca whitelabel.

### Destaques

- **Multi-Persona com Meta-RAG** — Crie personas via LLM a partir de uma descrição. Troque com `/persona <id>`. Cada persona tem conhecimento, voz e regras próprias. Histórico de mensagens é limpo ao trocar de persona.
- **RAG Multimodal** — Bíblia, PDF, DOCX, imagens (OCR), áudio (STT), JSON, texto, APIs. Fontes plug-and-play. Cada persona pode ter suas próprias fontes de conhecimento com contextTemplate personalizado.
- **Onboarding Automático** — Novo usuário? A IA pergunta nome, interesse, sentimento, email. State machine configurável em 3 idiomas.
- **Follow-ups Automáticos** — A IA envia perguntas de acompanhamento a cada N mensagens. Tipos: espiritual, devocional, oração, custom.
- **Surveys & Ratings** — Pesquisas com triggers, avaliações 1-5 estrelas com categorias.
- **Role-Based Access** — guest (5/dia), user (30/dia), premium (100/dia), admin (999/dia), banned (403).
- **Multi-Bot** — Múltiplas instâncias Telegram + WhatsApp, cada uma com persona própria.
- **Whitelabel** — Marca, cores, logo, saudações — tudo configurável via settings.
- **3 idiomas** — pt-BR (default), en-US, es-ES. Prompts, UI, TTS, onboarding.
- **3 plataformas** — Web, Telegram Bot, WhatsApp Bot (Evolution API v2).
- **Voz natural pt-BR** — Kokoro TTS com vozes por persona (pm_alex, pf_dora, etc.) + Edge TTS fallback com mapeamento automático.
- **Speech-to-Text** — Groq Whisper + OpenAI Whisper fallback + web mic.
- **Blog automático** — Devocionais gerados por LLM diariamente.
- **Auth completa** — Email/senha, Google OAuth, JWT com role.
- **Admin Panel** — Painel web completo com 10 seções: Dashboard, Usuários, Personas, Conhecimento, Surveys, Ratings, Follow-ups, Bots, Integrações, Settings.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 18+ + Express |
| Database | MySQL 8.4 (mysql2/promise) |
| LLM | GLM-5.1 via Ollama Cloud API (OpenAI-compatible, multi-key fallback) |
| RAG | TF-IDF pluggable + multimodal ingestion |
| Auth | JWT + bcrypt + Google OAuth + role-based + rate limiting |
| Telegram | Multi-instance via bot manager |
| WhatsApp | Multi-instance via Evolution API v2 |
| TTS | Kokoro-82M (primary, persona voice) + Edge TTS + Google Translate (fallback) |
| STT | Groq Whisper + OpenAI Whisper (fallback) |
| i18n | pt-BR, en-US, es-ES |

## Arquitetura

```
User message → Rate limit check + Ban check
             → Onboarding check (new user? → ask questions)
             → Persona resolution (session → user → default)
             → Chat command? → handleChatCommand
             → Extract context + Search knowledge (persona-aware RAG) + Build memory + Build profile
             → buildSystemPrompt(persona, lang, ..., knowledgeSources)
             → LLM call via IntegrationManager (with tools if enabled)
             → Tool calls loop (bible_lookup, user_stats, etc.)
             → CJK check → Save message → Auto follow-up scheduling
             → Return response + sources + persona info + ttsVoice
```

### Persona-Aware System Prompt

- `buildSystemPrompt()` suporta dois formatos de identity:
  - **String**: DB personas usam `identity: { "pt-BR": "Você é um coach...", "en-US": "..." }` — texto direto
  - **Object**: Default Jesus persona usa `identity: { "pt-BR": { core: "...", rules: "..." } }` — objeto com core + rules
- Context template: usa o `contextTemplate` da fonte de conhecimento da persona (ex: "CONHECIMENTO DE VENDAS"), não "VERSÍCULOS BÍBLICOS"
- Persona switch limpa o histórico de mensagens da sessão (evita contaminação)

### Onboarding (Whitelabel)
```
New user → shouldOnboard(uid) → returns next step question
User answers → processOnboardingAnswer(uid, message) → save to profile + DB
               → next step? → return question
               → done? → welcome message from persona
Steps configurable via /api/admin/onboarding: name, interest, feeling, email, custom
```

### Multi-Persona + Meta-RAG
```
/persona create <description> → LLM generates FULL persona config
/persona <id> → switch per-session, per-user, or per-bot-instance
Meta-RAG: LLM creates personas from any description — biblical figure, health coach, business consultant, etc.
Each persona: own knowledge sources, skills, onboarding questions, follow-up style, brand whitelabel
/voice → list/switch TTS voice for current persona
```

### RAG Knowledge (Multimodal)
```
Sources: Bible verses, PDF, DOCX, images (OCR), audio (STT), text, JSON, API endpoints
Ingestion: npm run ingest → reads all sources → TF-IDF index
Per-persona: personas.knowledge_sources selects which sources to search
  - searchMultiSource(query, sourceIds, topK) splits topK evenly across sources
  - Each source has its own contextTemplate per language
Upload: POST /api/admin/knowledge/upload (PDF, DOCX, image, audio, text, JSON)
```

### TTS Voice System
```
TTS Modes: kokoro (default), multivozes, edge-tts
Kokoro voices: pm_alex (pt-BR male), pf_dora (pt-BR female), am_adam (en-US male), af_bella (en-US female), etc.
Each persona has ttsVoice and ttsLang fields — passed through to WhatsApp, Telegram, Web
/voice command → list available voices, switch persona voice
Edge TTS fallback: Kokoro voice mapped to Edge TTS voice automatically
Message chunk size configurable via MESSAGE_CHUNK_SIZE env var or message_chunk_size setting (default 200 chars)
```

## Setup

```bash
git clone https://github.com/anomalyco/jesus-ai.git
cd jesus-ai
npm install
cp .env.example .env
# Configure OLLAMA_API_KEY in .env
npm run ingest   # First time: index knowledge corpus
npm start        # or npm run dev
```

Acesse `http://localhost:3000` · Admin: `http://localhost:3000/admin` (login: test@example.com / admin123)

### Kokoro TTS (voz natural pt-BR)
```bash
npm run tts:install   # Install Python dependencies
npm run tts:start     # Start Kokoro server on port 8001
npm run tts:check     # Check if Kokoro is running
```

### Pré-requisitos
1. **MySQL 8.4** em localhost (root, sem senha, database `jesus_ai`)
2. **OLLAMA_API_KEY** no `.env`
3. `npm run ingest` antes do primeiro uso
4. Schema criado automaticamente no startup
5. **Kokoro TTS**: `npm run tts:install` → `npm run tts:start`

### Variáveis de Ambiente

Veja [`.env.example`](.env.example) para a lista completa:

| Variável | Descrição |
|---------|-----------|
| `OLLAMA_API_KEY` | Chave da Ollama Cloud API (**obrigatória**) |
| `JWT_SECRET` | Secret para JWT (**obrigatória em produção**) |
| `DB_HOST/USER/PASSWORD/NAME` | MySQL config |
| `PERSONA` | Persona padrão (`jesus`) |
| `TELEGRAM_TOKEN` | Token do bot Telegram |
| `EVO_API_URL/KEY` | Evolution API para WhatsApp |
| `GROQ_API_KEY` | Para STT via Whisper |
| `TTS_MODE/VOICE` | Engine e voz TTS |
| `MESSAGE_CHUNK_SIZE` | Max chars por mensagem/áudio (default: 200) |

## Comandos

| Comando | Descrição |
|---------|-----------|
| `npm start` | Start the server |
| `npm run dev` | Start with watch mode |
| `npm run ingest` | Index knowledge sources |
| `npm run ngrok` | Cloudflare tunnel para WhatsApp webhook |
| `npm run tts:start` | Start Kokoro TTS server |
| `npm run tts:install` | Install Kokoro Python deps |

## Chat Commands

| Command | Access | Description |
|---|---|---|
| `/admin` | admin | Admin dashboard |
| `/stats` | user | Suas estatísticas |
| `/myprofile` | user | Seu perfil |
| `/persona` | anyone | Listar personas |
| `/persona <id>` | anyone | Trocar persona |
| `/persona create <desc>` | admin | Criar persona via Meta-RAG |
| `/persona edit <id> <campo> <valor>` | admin | Editar persona |
| `/persona delete <id>` | admin | Deletar persona |
| `/voice` | anyone | Listar/trocar voz TTS |
| `/survey` | admin | Gerenciar pesquisas |
| `/ratings` | admin | Estatísticas de avaliação |
| `/followups` | admin | Status de follow-ups |
| `/keys` | admin | Chaves de integração |
| `/settings /set` | admin | Configurações |
| `/users /promote /ban` | admin | Gestão de usuários |
| `/health` | anyone | Saúde das integrações |
| `/tools` | anyone | Ferramentas disponíveis |

## API Endpoints

### Público
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/chat` | Chat (rate-limited, persona-aware, returns ttsVoice) |
| POST | `/api/chat/stt` | Speech-to-text |
| POST | `/api/chat/tts` | Text-to-speech (accepts voice param, 200 char limit) |
| POST | `/api/chat/rating` | Submit rating |
| GET | `/api/chat/personas` | List personas |
| POST | `/api/chat/persona/switch` | Switch persona |
| POST | `/api/chat/persona/create` | Meta-RAG create |
| GET | `/api/chat/persona/current` | Current persona (returns ttsVoice, ttsLang) |
| GET | `/api/chat/surveys/active` | Check active survey |
| POST | `/api/chat/surveys/:id/respond` | Survey response |
| GET | `/api/chat/followups/pending` | Check pending follow-up |
| POST | `/api/chat/followups/:id/respond` | Respond follow-up |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login (returns role) |
| POST | `/api/auth/google` | Google OAuth |
| GET | `/api/auth/me` | Current user (with role) |

### Admin
| Método | Rota | Descrição |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/admin/users/*` | User management |
| GET/POST | `/api/admin/personas` | List/create personas |
| POST | `/api/admin/personas/generate` | Meta-RAG generate |
| GET/PUT/DELETE | `/api/admin/personas/:id` | Get/update/delete persona |
| GET/POST | `/api/admin/surveys` | Survey CRUD |
| GET | `/api/admin/ratings` | Rating stats |
| GET/POST | `/api/admin/followups` | Follow-up management |
| GET/POST | `/api/admin/bots` | Bot instance CRUD |
| POST | `/api/admin/bots/:id/start` | Start bot |
| GET/POST | `/api/admin/integrations` | Integration management |
| GET/PUT | `/api/admin/settings` | Settings management |
| GET/POST | `/api/admin/knowledge/*` | Knowledge management |
| POST | `/api/admin/knowledge/upload` | Upload file (PDF, DOCX, image, audio, text) |
| POST | `/api/admin/knowledge/reindex` | Reindex knowledge |

## Estrutura do Projeto

```
src/
  server.js              — Express entry point + DB init + scheduling
  chat/engine.js          — Central chat engine (rate limit, onboarding, persona-aware RAG, /voice command)
  auth/
    index.js              — Auth core (register, login, Google, JWT, role-based, createUser)
    rateLimit.js          — Rate limiting per role + ban enforcement
  onboarding/index.js     — Whitelabel onboarding state machine (3 langs, ensureUser)
  survey/index.js         — Surveys, ratings, follow-ups engine
  persona/
    config.js             — Default persona definitions, buildSystemPrompt (string/object identity)
    manager.js             — Multi-persona system (DB, cache, invalidation)
    meta-rag.js            — Meta-RAG persona generation, switchPersona with history clear
  bot/manager.js           — Multi-instance bot manager (Telegram + WhatsApp)
  telegram/
    handler.js             — Telegram handler factory (persona per instance)
    bot.js                 — Telegram bot with commands, chat, voice, groups
  whatsapp/
    handler.js             — WhatsApp handler factory (persona per instance)
    bot.js                 — WhatsApp bot (Evolution API v2, persona voice, chunk size)
  llm/
    index.js               — Central LLM service
    integrationManager.js  — Multi-key fallback for ALL integrations
    tools.js               — AI tool definitions for function calling
  knowledge/
    config.js               — Knowledge source definitions (multimodal, dynamic registry)
    store.js                — Multi-source TF-IDF search (searchMultiSource, getAllSourceStats)
    ingester.js             — Multi-source ingestion (PDF, DOCX, image, audio, JSON, text, API)
    sources/
      pdf.js               — PDF ingestion via pdf-parse v1.1.1
      docx.js               — DOCX ingestion via mammoth
      image.js              — OCR via tesseract.js
      audio.js              — STT via Groq Whisper + OpenAI Whisper fallback
      api.js                — API endpoint ingestion
  memory/
    session.js              — Session management (MySQL-backed)
    profile.js              — Profile management (MySQL-backed)
  settings/index.js         — Runtime settings (DB-backed, cached) + whitelabel
  admin/index.js             — Admin logic (stats, users, personas, surveys, ratings, follow-ups, bots)
  routes/
    chat.js                  — Chat API (JSON, personas, TTS with voice, ratings, surveys, onboarding)
    admin.js                 — Admin API (full CRUD for all entities + knowledge upload)
    auth.js                  — Auth API (register, login, Google, profile with role)
    blog.js                  — Blog API
    whatsapp.js              — WhatsApp webhook
    email.js                 — Email API
  tts/
    index.js                 — TTS engine (Kokoro + Edge TTS fallback, voice mapping, chunk truncation)
    kokoro-manager.js        — Kokoro server health check + warmup
  stt/                        — STT engine (Groq + OpenAI fallback)
  i18n/index.js               — Internationalization (pt-BR, en-US, es-ES)
  db/index.js                 — MySQL pool + schema + auto-migration
public/
  index.html                  — Landing page + auth + chat SPA
  admin.html                  — Admin panel SPA (10 sections)
  css/style.css               — Dark premium theme, glassmorphism
  css/admin.css               — Admin panel dark glassmorphism theme
  js/app.js                   — Frontend logic (chat, auth, i18n, persona, TTS voice)
  js/admin.js                 — Admin panel logic (dashboard, users, personas, knowledge, settings)
```

## Licença

MIT — Use, modifique, compartilhe.

---

**Documentação completa**: [`AGENTS.md`](AGENTS.md) · **Créditos**: [`CREDITS.md`](CREDITS.md)