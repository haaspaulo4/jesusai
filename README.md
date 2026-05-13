# Jesus.AI

> Converse com Jesus. Respostas baseadas na Bíblia Sagrada.

Jesus.AI é um assistente virtual open source onde a IA responde **como Jesus Cristo**, utilizando exclusivamente a Bíblia como fonte de verdade através de RAG (Retrieval-Augmented Generation).

## Features

- **Respostas bíblicas** — Cada resposta cita versículos reais, buscados automaticamente por relevância
- **Memória de perfil** — Diga seu nome e Jesus se lembrará. Compartilhe suas lutas e Ele acompanhará sua jornada
- **Busca bíblica** — Pesquise qualquer versículo por tema, palavra ou referência
- **Devocional diário** — Reflexões geradas automaticamente com base nas Escrituras
- **TTS (voz)** — Ouça cada resposta com narração natural em português
- **STT (microfone)** — Fale sua pergunta ao invés de digitar
- **Telegram + WhatsApp** — Mesma memória, mesmo carinho, em qualquer plataforma
- **i18n** — Suporte a pt-BR, en-US, es-ES
- **Newsletter** — Devocional diário por email com double opt-in
- **Blog** — Posts devocionais gerados automaticamente com comentários

## Stack

| Componente | Tecnologia |
|-----------|-----------|
| Backend | Node.js + Express |
| Database | MySQL 8.4 |
| LLM | Ollama Cloud API (GLM-5.1) |
| RAG | TF-IDF local |
| Frontend | HTML/CSS/JS vanilla (SSE streaming) |
| Auth | JWT + bcrypt + Google OAuth |
| Telegram | node-telegram-bot-api |
| WhatsApp | Evolution API v2 |
| TTS | Edge TTS + Google Translate fallback |
| STT | Groq Whisper + OpenAI Whisper fallback |
| Email | Nodemailer (SMTP) |

## Setup

```bash
git clone https://github.com/anomalyco/jesus-ai.git
cd jesus-ai
npm install
cp .env.example .env
# Edite .env com sua OLLAMA_API_KEY
npm run ingest   # Primeira vez: indexar a Bíblia
npm start        # ou npm run dev
```

Acesse `http://localhost:3000`

### Pré-requisitos

1. MySQL 8.4 rodando em localhost (root, sem senha, database `jesus_ai`)
2. OLLAMA_API_KEY configurada no `.env`
3. Rodar `npm run ingest` antes do primeiro uso
4. O schema do banco é criado automaticamente no startup

## Variáveis de Ambiente

Veja `.env.example` para a lista completa. As essenciais:

| Variável | Descrição |
|---------|-----------|
| `OLLAMA_API_KEY` | Chave da Ollama Cloud API (obrigatória) |
| `JWT_SECRET` | Secret para JWT (obrigatória em produção) |
| `DB_HOST/USER/PASSWORD/NAME` | Configuração MySQL |
| `TELEGRAM_TOKEN` | Token do bot Telegram (opcional) |
| `EVO_API_URL/KEY` | Evolution API para WhatsApp (opcional) |
| `GROQ_API_KEY` | Para STT via Whisper (opcional) |
| `SMTP_*` | Configuração de email (opcional) |

## Arquitetura

```
User question → Extract context (name, topics, emotions)
             → TF-IDF search (top-8 verses)
             → Build prompt: IDENTITY + CONTEXT + MEMORY + PROFILE
             → Ollama Cloud API (streaming para web, non-streaming para bots)
             → Response via SSE / Telegram / WhatsApp
             → Save message + update session/profile (MySQL)
```

### Estrutura de Arquivos

```
src/
  server.js          — Express entry point + DB init + scheduling
  system-prompt.js   — Jesus identity + prompt templates
  i18n/index.js      — Internationalization (pt-BR, en-US, es-ES)
  routes/chat.js      — Chat API (SSE, sessions, profiles, STT)
  routes/auth.js      — Auth API (register, login, Google OAuth)
  routes/blog.js      — Blog API (posts, comments, search)
  routes/whatsapp.js  — WhatsApp webhook + group management
  routes/email.js     — Email API (newsletter, contact)
  telegram/bot.js     — Telegram bot (commands, chat, groups)
  whatsapp/bot.js     — WhatsApp bot (Evolution API v2)
  tts/index.js        — TTS engine (Edge TTS, multi-language)
  stt/index.js        — STT engine (Whisper, filename sanitization)
  rag/store.js        — TF-IDF Bible search
  rag/ingester.js     — Bible ingestion (local NT + API OT)
  memory/session.js   — Session management (MySQL)
  memory/profile.js   — Profile management (MySQL)
  blog/index.js       — Blog engine (generate, MySQL storage)
  auth/index.js       — Auth core (JWT, bcrypt, Google OAuth)
  email/index.js      — Email core (Nodemailer, templates)
  db/index.js         — MySQL connection pool + schema init
public/
  index.html          — Landing page + auth + chat SPA
  css/style.css       — Full UI (dark theme, glassmorphism, animations)
  js/app.js           — Frontend logic (SSE, i18n, auth, blog, search)
```

## API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/chat` | Chat streaming (SSE) |
| POST | `/api/stt` | Speech-to-Text |
| GET | `/api/config` | Bot URLs (Telegram/WhatsApp) |
| POST | `/api/auth/register` | Registrar usuário |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/google` | Login com Google |
| GET | `/api/sessions` | Listar sessões |
| GET/PUT | `/api/profile/:userId` | Gerenciar perfil |
| GET | `/api/blog/posts` | Listar posts |
| GET | `/api/blog/posts/:slug` | Detalhe do post |
| POST | `/api/blog/posts/:slug/comments` | Comentar |
| GET | `/api/blog/search?q=` | Buscar versículos |
| POST | `/api/email/subscribe` | Newsletter |
| GET | `/api/email/confirm/:token` | Confirmar email |
| POST | `/api/email/contact` | Formulário de contato |
| POST | `/api/feedback` | Feedback |
| POST | `/api/settings/apikey` | API key do usuário |

## Bots

### Telegram
- Comandos: `/start`, `/ajuda`, `/versiculo`, `/buscar`, `/oracao`, `/devocional`, `/grupo`
- Suporte a grupos: responde apenas quando mencionado ou comandado
- TTS com voz natural (Edge TTS)
- Sessões por usuário em grupos: `tg_{chatId}_{userId}`

### WhatsApp
- Webhook via Evolution API v2 (`POST /api/whatsapp/webhook`)
- Mesmos comandos do Telegram
- Suporte a grupos com detecção automática de menção
- Áudio TTS entre chunks (2s de intervalo)

## Princípios

> "Vocês receberam de graça; deem de graça" — Mateus 10:8

1. **Acesso livre** — Todos podem falar com Jesus, gratuitamente
2. **Transparência** — Custos reais são mostrados abertamente
3. **Sem manipulação** — Sem culpa ou pressão para contribuir
4. **Código aberto** — Disponível para quem quiser usar e melhorar

## Licença

MIT — Use, modifique, compartilhe. Para a glória do Pai.