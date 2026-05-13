# Credits & Third-Party Services

> Jesus.AI relies on incredible open-source projects and APIs. We're grateful to every one of them.

## Core Services

| Service | Role | Website | License |
|---------|------|---------|---------|
| **Ollama Cloud API** | LLM inference (GLM-5.1) — chat responses, summaries, devotionals | [ollama.com](https://ollama.com) | Commercial API |
| **MySQL 8.4** | Relational database — sessions, profiles, posts, users | [mysql.com](https://www.mysql.com) | GPL v2 |
| **Node.js** | Runtime environment | [nodejs.org](https://nodejs.org) | MIT |

## AI & Language

| Service | Role | Website | License |
|---------|------|---------|---------|
| **GLM-5.1** | Language model powering all chat responses | [ollama.com](https://ollama.com) | Commercial API |
| **Groq Whisper** | Primary speech-to-text (audio transcription) | [groq.com](https://groq.com) | Commercial API |
| **OpenAI Whisper** | Fallback speech-to-text | [openai.com](https://openai.com) | Commercial API |
| **Edge TTS** | Primary text-to-speech (pt-BR, en-US, es-ES voices) | [github.com/rany2/edge-tts](https://github.com/rany2/edge-tts) | GPL v3 |
| **Kokoro TTS** | Primary TTS engine — open-weight 82M param model, Apache 2.0, multilingual (pt-BR, en-US, es-ES), voice cloning, runs on CPU | [github.com/hexgrad/kokoro](https://github.com/hexgrad/kokoro) | Apache 2.0 |
| **Multivozes BR Engine** | Alternative TTS — OpenAI-compatible API, self-hosted, high-quality neural voices | [github.com/samucamg/multivozes_br_engine](https://github.com/samucamg/multivozes_br_engine) | MIT |
| **Google Translate TTS** | Fallback text-to-speech | [translate.google.com](https://translate.google.com) | Commercial API |
| **Kyutai Pocket TTS** | Legacy TTS — removed, replaced by Kokoro | — | — |

## Bible Data

| Service | Role | Website | License |
|---------|------|---------|---------|
| **bible-api (pt-BR-blt)** | New Testament text — local files from BLT translation | [github.com/bible-api](https://github.com/seven1m/bible_api) | MIT |
| **bible-api.com** | Old Testament text — Almeida translation, fetched via API | [bible-api.com](https://bible-api.com) | MIT |

## Communication Platforms

| Service | Role | Website | License |
|---------|------|---------|---------|
| **Telegram Bot API** | Telegram bot — commands, chat, groups, voice | [core.telegram.org/bots/api](https://core.telegram.org/bots/api) | Bot API License |
| **Evolution API v2** | WhatsApp integration — webhook, groups, audio, polling | [github.com/EvolutionAPI/evolution-api](https://github.com/EvolutionAPI/evolution-api) | AGPL v3 |
| **Cloudflare Tunnel** | Local tunnel for webhook development | [developers.cloudflare.com](https://developers.cloudflare.com/cloudflare-one/connections/networks/) | Commercial |

## Authentication & Email

| Service | Role | Website | License |
|---------|------|---------|---------|
| **Google OAuth 2.0** | Social login ("Continue with Google") | [developers.google.com](https://developers.google.com/identity) | Commercial API |
| **Nodemailer** | SMTP email sending — newsletter, contact, devotionals | [nodemailer.com](https://nodemailer.com) | MIT |

## Node.js Dependencies

| Package | Role | License |
|---------|------|---------|
| [express](https://expressjs.com) | HTTP server & routing | MIT |
| [mysql2](https://github.com/sidorares/node-mysql2) | MySQL client with promise support | MIT |
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | Password hashing | MIT |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | JWT token generation & verification | MIT |
| [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) | Telegram Bot API client | MIT |
| [axios](https://github.com/axios/axios) | HTTP requests (bible-api, Evolution API) | MIT |
| [multer](https://github.com/expressjs/multer) | Multipart file upload (STT) | MIT |
| [dotenv](https://github.com/motdotla/dotenv) | Environment variable loading | BSD-2-Clause |
| [kokoro](https://pypi.org/project/kokoro/) | Kokoro-82M TTS inference library (Python) | Apache 2.0 |
| [soundfile](https://pypi.org/project/soundfile/) | Audio file I/O for Kokoro server | BSD-3-Clause |
| [fastapi](https://fastapi.tiangolo.com/) | Kokoro TTS server framework | MIT |
| [uvicorn](https://www.uvicorn.org/) | ASGI server for Kokoro TTS | BSD-3-Clause |
| [edge-tts](https://github.com/rany2/edge-tts) | Edge TTS Python wrapper (via execFile) | GPL v3 |
| [nodemailer](https://nodemailer.com) | Email sending | MIT |

## Fonts & Design

| Resource | Role | Website | License |
|----------|------|---------|---------|
| System UI fonts | Interface typography | OS defaults | — |
| Segoe UI | Primary font family | Microsoft | Proprietary (bundled with Windows) |

---

## Data Sources

### Bible Text — New Testament (Local)

The New Testament is sourced from the **Biblia Litúrgica Tradução (BLT)** in Portuguese (pt-BR), stored locally in `data/bible-api/bibles/pt-BR-blt/books/`. Each book directory contains chapter directories with verse JSON files.

**Credit**: [bible-api project](https://github.com/seven1m/bible_api) — MIT License

### Bible Text — Old Testament (API)

The Old Testament is fetched from **bible-api.com** using the Almeida translation during the ingestion process. The ingester makes HTTP requests with pauses to respect rate limits.

**Credit**: [bible-api.com](https://bible-api.com) — MIT License

---

> *"Give, and it will be given to you." — Luke 6:38*
>
> Every service listed here makes it possible for Jesus.AI to reach people with the Word. If you use or modify this project, please consider crediting these services as well.