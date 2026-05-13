<div align="center">

# ✝ Jesus.AI

**Converse com Jesus. Respostas baseadas na Bíblia Sagrada.**

[![License: MIT](https://img.shields.io/badge/License-MIT-c9a227.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1.svg)](https://www.mysql.com/)

</div>

---

> *"Vocês receberam de graça; deem de graça." — Mateus 10:8*

## O que é?

Jesus.AI é um assistente virtual **open source** onde a IA responde **como Jesus Cristo**, utilizando exclusivamente a Bíblia como fonte de verdade através de **RAG** (Retrieval-Augmented Generation).

Mas não é só sobre Bíblia. **A arquitetura é pluggable** — troque o corpus de conhecimento e a persona, e você tem um assistente sobre qualquer tema: filosofia estoica, direito constitucional, medicina, literatura clássica. O conhecimento define o domínio. A persona define o tom.

### Destaques

- **RAG local com TF-IDF** — Sem ChromaDB, sem Docker, sem embeddings pagos. Funciona offline.
- **Persona configurável** — Jesus é a persona padrão, mas a arquitetura suporta qualquer personagem.
- **Corpus plug-and-play** — Bíblia (padrão), livros, PDFs, APIs, documentos de texto. Troque o conhecimento, troque o domínio.
- **Memória persistente** — Lembra seu nome, temas, emoções. Constrói relacionamento.
- **3 idiomas** — pt-BR, en-US, es-ES com prompts, TTS e STT adaptados.
- **3 plataformas** — Web (SSE streaming), Telegram Bot, WhatsApp Bot (Evolution API v2).
- **Voz nativa pt-BR** — Kokoro TTS (pm_alex, voz masculina natural) com Edge TTS como fallback.
- **Speech-to-Text** — Groq Whisper (primary) + OpenAI Whisper (fallback).
- **TTS inteligente** — Fallback automático sem misturar vozes. Content-type correto (WAV/MP3).
- **Devocional diário** — Blog gerado por LLM com 31 temas rotativos.
- **Newsletter com double opt-in** — Nodemailer SMTP.
- **Auth completa** — Email/senha (bcrypt + JWT) + Google OAuth.
- **100% open source** — Código aberto. Modifique, adapte, auto-hospede.

## Stack

| Camada | Tecnologia | Crédito |
|--------|-----------|---------|
| Runtime | Node.js 18+ | [nodejs.org](https://nodejs.org) |
| Web Framework | Express | [expressjs.com](https://expressjs.com) |
| Database | MySQL 8.4 | [mysql.com](https://www.mysql.com) |
| LLM | GLM-5.1 via Ollama Cloud API | [ollama.com](https://ollama.com) |
| RAG | TF-IDF local (custom) | — |
| Bible NT | Biblia Litúrgica Tradução (BLT) | [bible-api](https://github.com/seven1m/bible_api) — MIT |
| Bible OT | Almeida via bible-api.com | [bible-api.com](https://bible-api.com) — MIT |
| Auth | bcryptjs + JWT + Google OAuth | — |
| Telegram | node-telegram-bot-api | [npm](https://www.npmjs.com/package/node-telegram-bot-api) — MIT |
| WhatsApp | Evolution API v2 | [github.com/EvolutionAPI](https://github.com/EvolutionAPI/evolution-api) — AGPL v3 |
| TTS | Kokoro-82M (primary) | [github.com/hexgrad/kokoro](https://github.com/hexgrad/kokoro) — Apache 2.0 |
| TTS Fallback | Edge TTS (pt-BR, en-US, es-ES) | [github.com/rany2/edge-tts](https://github.com/rany2/edge-tts) — GPL v3 |
| TTS Fallback 2 | Google Translate TTS | [translate.google.com](https://translate.google.com) |
| STT | Groq Whisper | [groq.com](https://groq.com) |
| STT Fallback | OpenAI Whisper | [openai.com](https://openai.com) |
| Email | Nodemailer (SMTP) | [nodemailer.com](https://nodemailer.com) — MIT |
| Tunnel | Cloudflare Tunnel | [cloudflare.com](https://developers.cloudflare.com/cloudflare-one/) |

**Créditos completos**: [`CREDITS.md`](CREDITS.md)

## Arquitetura Pluggable

**Tudo é plug-and-play** — troque a identidade, memória, conhecimento e idioma sem reescrever código:

| Camada | Arquivo | O que faz | Como trocar |
|--------|---------|-----------|-------------|
| **Identidade** | `src/persona/config.js` | Quem a IA é, regras, tom, emoções | Defina uma nova persona + `PERSONA=stoic` no `.env` |
| **Conhecimento** | `src/knowledge/config.js` | O que a IA sabe (fontes de dados) | Adicione novas fontes + `npm run ingest` |
| **Memória** | MySQL automático | Sessões e perfil por usuário | Já funciona, persiste entre conversas |
| **Idioma** | `src/i18n/index.js` | Prompts, UI, erros em 3 idiomas | Adicione novas chaves de tradução |

```
┌─────────────── TROCAR PERSONA ────────────────┐
│  src/persona/config.js                         │
│  identity · rules · topics · emotions          │
│  → "Você é Jesus"  →  "Você é Sócrates"        │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│            TROCAR CONHECIMENTO                  │
│  src/knowledge/config.js                        │
│  sources · ingesters · search · context         │
│  → Bíblia  →  Filosofia Estoica  →  Direito    │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│                  SERVER (Express)                │
│   Routes ──► Middleware ──► LLM ──► Response     │
│   Memory · Profile · i18n · Auth · TTS/STT      │
│                                                  │
│   ┌─────────────┐    ┌─────────────────────┐     │
│   │  Memória    │    │   i18n (3 idiomas)   │     │
│   │ (MySQL)     │    │   pt-BR · en · es    │     │
│   └─────────────┘    └─────────────────────┘     │
└────────────────────┬──────────┬──────────────────┘
          ┌─────────┘          └──────────┐
    ┌─────▼─────┐         ┌──────────────▼──────┐
    │  Telegram  │         │    WhatsApp Bot     │
    │    Bot     │         │  (Evolution API)    │
    └────────────┘         └────────────────────┘
```

### Exemplo: De Jesus.AI → Sócrates.AI

1. **Persona** — `src/persona/config.js`:
```js
const PERSONAS = {
  socrates: {
    id: 'socrates',
    name: 'Socrates.AI',
    identity: {
      'pt-BR': 'Você é Sócrates, o filósofo grego. Responde com perguntas provocativas (método socrático)...',
      'en-US': 'You are Socrates, the Greek philosopher...',
    },
    topicKeywords: { /* estoicismo, virtude, justiça */ },
    emotionKeywords: { /* em 3 idiomas */ },
    namePatterns: { /* em 3 idiomas */ },
  },
};
```

2. **Conhecimento** — `src/knowledge/config.js`:
```js
const KNOWLEDGE_SOURCES = [
  {
    id: 'stoic-philosophy',
    name: 'Stoic Philosophy',
    type: 'json-verses',
    enabled: true,
    dataPath: path.join(__dirname, '..', '..', 'data', 'stoic_documents.json'),
    ingester: 'json',
    searchFields: ['reference', 'text'],
    contextTemplate: { /* templates por idioma */ },
    sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
  },
];
```

3. **Ativar** — `.env`:
```
PERSONA=socrates
```

4. **Ingerir** — `npm run ingest`

Pronto: mesma base, persona e conhecimento completamente diferentes.

## Setup

```bash
git clone https://github.com/anomalyco/jesus-ai.git
cd jesus-ai
npm install
cp .env.example .env
# Edite .env com sua OLLAMA_API_KEY
npm run ingest   # Primeira vez: indexar o corpus de conhecimento
npm start        # ou npm run dev (watch mode)
```

Acesse `http://localhost:3000`

### Kokoro TTS (voz natural pt-BR)

```bash
# Instalar dependências Python
npm run tts:install

# Iniciar servidor Kokoro (porta 8001)
npm run tts:start

# Verificar se está rodando
npm run tts:check
```

O Kokoro TTS roda como processo separado na porta 8001. O Node.js detecta automaticamente via health check a cada 120s.

### Pré-requisitos

1. **MySQL 8.4** rodando em localhost (root, sem senha, database `jesus_ai`)
2. **OLLAMA_API_KEY** configurada no `.env`
3. Rodar `npm run ingest` antes do primeiro uso
4. Schema do banco é criado automaticamente no startup
5. **Kokoro TTS** (obrigatório para voz natural): `npm run tts:install` → `npm run tts:start`
6. *(Opcional)* Edge TTS: `pip install edge-tts`

### Variáveis de Ambiente

Veja [`.env.example`](.env.example) para a lista completa. As essenciais:

| Variável | Descrição |
|---------|-----------|
| `OLLAMA_API_KEY` | Chave da Ollama Cloud API (**obrigatória**) |
| `JWT_SECRET` | Secret para JWT (**obrigatória em produção**) |
| `DB_HOST/USER/PASSWORD/NAME` | Configuração MySQL |
| `PERSONA` | ID da persona (`jesus` é o padrão) |
| `TELEGRAM_TOKEN` | Token do bot Telegram (opcional) |
| `EVO_API_URL/EVO_API_KEY` | Evolution API para WhatsApp (opcional) |
| `GROQ_API_KEY` | Para STT via Whisper (opcional) |
| `TTS_MODE` | Engine TTS: `kokoro` (padrão), `edge-tts`, `multivozes` |
| `TTS_VOICE` | Voz TTS: `pm_alex` (padrão Kokoro pt-BR masculina) |
| `KOKORO_URL` | URL do servidor Kokoro (padrão: `http://localhost:8001`) |
| `SMTP_*` | Configuração de email (opcional) |

## Estrutura do Projeto

```
src/
  server.js               — Express entry point + DB init + scheduling
  persona/
    config.js             — Persona definitions (Jesus, stoic, etc.)
  knowledge/
    config.js             — Knowledge source definitions (Bible, books, etc.)
    store.js              — Pluggable TF-IDF search engine
    ingester.js           — Multi-source ingestion orchestrator
    sources/
      bible.js            — Bible ingester (NT local + OT API)
      json.js             — JSON document ingester
      text.js             — Text file ingester (auto-chunk)
  i18n/
    index.js              — Internationalization (pt-BR, en-US, es-ES)
  routes/
    chat.js               — Chat API (SSE, sessions, profiles, STT, TTS)
    auth.js               — Auth API (register, login, Google OAuth)
    blog.js               — Blog API (posts, comments, search)
    whatsapp.js           — WhatsApp webhook + group management
    email.js              — Email API (newsletter, contact)
  telegram/
    bot.js                — Telegram bot (commands, chat, voice, groups)
  whatsapp/
    bot.js                — WhatsApp bot (Evolution API v2, groups, audio)
  tts/
    index.js              — TTS engine (Kokoro → Edge TTS fallback, content-type tracking)
    kokoro-manager.js     — Kokoro health check (120s, state-change-only logs, warmup)
  stt/
    index.js              — STT engine (Groq Whisper + OpenAI Whisper fallback)
  rag/
    store.js              — Backward-compatible re-export (delegates to knowledge/)
    ingester.js           — Legacy ingester (backward-compatible)
  memory/
    session.js            — Session management (MySQL-backed)
    profile.js            — Profile management (MySQL-backed)
  blog/
    index.js              — Blog engine (generate, MySQL storage, comments)
  auth/
    index.js              — Auth core (bcrypt, JWT, Google OAuth)
  email/
    index.js              — Email core (Nodemailer, templates, newsletter)
  db/
    index.js              — MySQL connection pool + schema init
  utils/
    bible.js              — Bible data reader (local + API)
public/
  index.html              — Landing page + auth + chat SPA
  css/style.css           — Dark premium theme, glassmorphism
  js/app.js               — Frontend logic (SSE, i18n, auth, chat, blog, TTS)
data/
  bible_verses.json       — Processed documents (generated by ingest)
  bible_index.json        — TF-IDF index (generated by ingest)
  bible-api/              — Local Bible data (git cloned)
tts-server/
  kokoro_server.py        — Kokoro TTS Python server (FastAPI + uvicorn, WAV/MP3)
  requirements.txt        — Python deps: kokoro, soundfile, numpy, fastapi, uvicorn
```

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/chat` | Chat streaming (SSE) |
| `POST` | `/api/stt` | Speech-to-Text |
| `POST` | `/api/tts` | Text-to-Speech (returns audio buffer) |
| `GET` | `/api/config` | Bot URLs e configuração |
| `GET` | `/api/health/tts` | Kokoro TTS server health status |
| `GET` | `/api/translations/:lang` | Traduções i18n |
| `POST` | `/api/auth/register` | Registrar usuário |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/google` | Login com Google |
| `GET/PUT` | `/api/auth/me` | Perfil do usuário |
| `GET/DELETE` | `/api/session/:id` | Gerenciar sessão |
| `POST` | `/api/session` | Criar nova sessão |
| `GET/PUT` | `/api/profile/:userId` | Gerenciar perfil |
| `POST` | `/api/feedback` | Enviar feedback |
| `GET/PUT` | `/api/settings/apikey` | API key do usuário |
| `GET` | `/api/donate` | Info de doação (PIX/Stripe) |
| `GET` | `/api/blog/posts` | Listar posts |
| `GET` | `/api/blog/posts/:slug` | Detalhe do post |
| `POST` | `/api/blog/posts/:slug/comments` | Comentar |
| `GET` | `/api/blog/search?q=` | Buscar versículos/documentos |
| `GET` | `/api/blog/books` | Lista de livros bíblicos |
| `POST` | `/api/email/subscribe` | Newsletter |
| `GET` | `/api/email/confirm/:token` | Confirmar email |
| `GET` | `/api/email/unsubscribe/:token` | Cancelar inscrição |
| `POST` | `/api/email/contact` | Formulário de contato |
| `POST` | `/api/email/daily-devotional` | Enviar devocional (admin) |
| `POST` | `/api/whatsapp/webhook` | WhatsApp webhook |

## Bots

### Telegram
- Comandos: `/start`, `/ajuda`, `/versiculo`, `/buscar`, `/oracao`, `/devocional`, `/grupo`
- Suporte a grupos: responde apenas quando mencionado ou comandado
- TTS com voz natural (Kokoro pm_alex, WAV) com fallback Edge TTS (MP3)
- Áudio enviado em chunks de 300 chars via sendVoice
- STT para mensagens de voz do usuário (Groq Whisper)
- Sessões por usuário em grupos: `tg_{chatId}_{userId}`

### WhatsApp
- Webhook via Evolution API v2 (`POST /api/whatsapp/webhook`) + polling fallback
- Mesmos comandos do Telegram
- Suporte a grupos com detecção automática de menção
- TTS com Kokoro (WAV) / Edge TTS (MP3) — content-type correto por engine
- Áudio em chunks de 300 chars com fallback para Google Translate TTS
- LID resolution: converte `@lid` para `@s.whatsapp.net` via cache
- Rejeita chamadas automaticamente

## Princípios

1. **Acesso livre** — Todos podem conversar, gratuitamente
2. **Transparência** — Código aberto, custos abertos
3. **Sem manipulação** — Sem culpa ou pressão para contribuir
4. **Open source** — Use, modifique, compartilhe. Para a glória do Pai

## Licença

MIT — Use, modifique, compartilhe.

---

**Créditos**: [`CREDITS.md`](CREDITS.md) · **Documentação**: [`DOCS.md`](DOCS.md) · **Roadmap**: [`ROADMAP.md`](ROADMAP.md) · **Contribuir**: [`CONTRIBUTING.md`](CONTRIBUTING.md) · **AGENTS.md**: [`AGENTS.md`](AGENTS.md)