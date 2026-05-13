# Jesus.AI — Documentação Técnica

## Arquitetura

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▸│  Backend API  │────▸│  Ollama Cloud │
│  (HTML/CSS)  │◂────│  (Express)    │◂────│  (LLM API)   │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                  ┌─────────┴──────────┐
                  │                    │
           ┌──────▼──────┐      ┌─────▼──────┐
           │ Knowledge   │      │   MySQL     │
           │ (TF-IDF +   │      │  Sessions   │
           │  busca)     │      │  Profiles   │
           └──────┬──────┘      │  Posts      │
                  │             │  Users      │
           ┌──────▼──────┐      │  Feedback   │
           │  Persona     │      └─────┬──────┘
           │  Config      │            │
           └─────────────┘      ┌─────▼──────┐
                                │  Email      │
                                │  (Nodemailer)│
                                └────────────┘
```

## Fluxo de Dados

```
1.  User question → Extract context (name, topics, emotions via persona config)
2.                → Knowledge search (TF-IDF, top-K from enabled sources)
3.                → Build prompt: PERSONA_IDENTITY + CONTEXT + MEMORY + PROFILE
4.                → Call LLM (streaming for web, non-streaming for bots)
5.                → Response via SSE (web) / chunks (Telegram/WhatsApp)
6.                → Save message + update session/profile (MySQL)
7.                → Generate summary every 10 messages
8.                → Generate profile summary every 15 messages
```

## Arquitetura Pluggable

### Knowledge Sources (`src/knowledge/config.js`)

O sistema suporta múltiplas fontes de conhecimento. Cada fonte define:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | Identificador único |
| `name` | string | Nome legível |
| `type` | string | Tipo de documento (`json-verses`, `json`, `text-chunks`) |
| `enabled` | boolean | Se está ativo |
| `dataPath` | string | Caminho para o arquivo JSON de documentos |
| `indexPath` | string | Caminho para o arquivo de índice TF-IDF |
| `searchFields` | string[] | Campos usados na busca TF-IDF |
| `contextTemplate` | object | Templates de contexto por idioma |
| `sourceFormat` | function | Como formatar documentos no prompt |
| `ingester` | string | Tipo de ingester (`bible`, `json`, `text`) |

**Ingesters disponíveis:**

| Ingestor | Arquivo | Descrição |
|----------|---------|-----------|
| `bible` | `sources/bible.js` | NT via arquivos locais (BLT) + OT via bible-api.com |
| `json` | `sources/json.js` | Carrega qualquer JSON com `reference` e `text` |
| `text` | `sources/text.js` | Lê .txt/.md de um diretório, chunking automático |

**Adicionando uma fonte JSON:**

```json
// data/stoic_documents.json
[
  {
    "reference": "Meditações 4.3",
    "text": "Busca refugiar-te no teu interior. A racionalidade do homem que se conhece...",
    "book": "Meditações",
    "chapter": 4,
    "verse": 3
  }
]
```

```js
// Em src/knowledge/config.js, adicionar ao KNOWLEDGE_SOURCES:
{
  id: 'stoic-philosophy',
  name: 'Stoic Philosophy',
  type: 'json-verses',
  enabled: true,
  dataPath: path.join(__dirname, '..', '..', 'data', 'stoic_documents.json'),
  searchFields: ['reference', 'text'],
  ingester: 'json',
  contextTemplate: {
    'pt-BR': 'TEXTOS ENCONTRADOS (CONTEXTO):\n{context}\n\nUse estes textos como base para sua resposta.',
    'en-US': 'TEXTS FOUND (CONTEXT):\n{context}\n\nUse these texts as the basis for your response.',
    'es-ES': 'TEXTOS ENCONTRADOS (CONTEXTO):\n{context}\n\nUsa estos textos como base para tu respuesta.',
  },
  sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
}
```

**Adicionando uma fonte de texto (diretório):**

```js
{
  id: 'legal-docs',
  name: 'Legal Documents',
  type: 'text-chunks',
  enabled: false,
  directoryPath: '/path/to/legal/docs',
  extensions: ['.txt', '.md'],
  chunkSize: 1000,
  chunkOverlap: 200,
  dataPath: path.join(__dirname, '..', '..', 'data', 'legal_documents.json'),
  ingester: 'text',
  contextTemplate: { /* ... */ },
  sourceFormat: (docs) => docs.map(d => `[${d.reference}]: "${d.text}"`).join('\n'),
}
```

### Persona Config (`src/persona/config.js`)

Cada persona define:

| Seção | Descrição |
|-------|-----------|
| `identity` | Prompt core + regras por idioma (pt-BR, en-US, es-ES) |
| `topicKeywords` | Mapeamento de palavras-chave → tópicos por idioma |
| `emotionKeywords` | Mapeamento de palavras → emoções por idioma |
| `namePatterns` | Regex para extrair nomes por idioma |
| `contextTemplate` | Como formatar contexto no prompt por idioma |
| `memoryBlock` | Template de memória por idioma |
| `profileBlock` | Template de perfil por idioma |
| `groupContext` | Comportamento em grupos por idioma |
| `disclaimer` | Disclaimer por idioma |
| `blogTopics` | Tópicos do blog devocional |
| `prayerPrompt` | Prompt para orações por idioma |

**Ativando uma persona via `.env`:**

```bash
PERSONA=jesus    # padrão
# PERSONA=stoic  # persona estoica (quando disponível)
```

**Usando a API de persona:**

```js
const { getActivePersona, buildSystemPrompt } = require('./persona/config');

const persona = getActivePersona();
const systemPrompt = buildSystemPrompt(persona, 'pt-BR', contextStr, memoryStr, profileStr, userName, isGroup);
```

## Sistema de RAG (Knowledge Store)

### Busca TF-IDF

O `KnowledgeStore` (em `src/knowledge/store.js`) implementa busca TF-IDF genérica:

1. **Tokenização**: texto normalizado (lowercase, sem acentos, sem stopwords por idioma)
2. **Índice invertido**: cada token mapeia para documentos que o contêm
3. **IDF**: termos raros pesam mais que termos comuns
4. **Score**: soma dos IDF dos tokens da query nos documentos
5. **Top-K**: retorna os K documentos mais relevantes

**Stopwords** são suportadas por idioma (pt-BR, en-US, es-ES).

### API do KnowledgeStore

```js
const store = getStore('bible-pt-br');  // ou getStore() para a fonte primária
const results = store.search('amor e perdão', 8);
const count = store.getDocumentCount();
const formatted = store.formatContext(results, 'pt-BR');
```

## Sistema de Memória

### Sessões (MySQL)

- Cada sessão tem `sessionId`, `userId`, `userName`, `userContext` (JSON), `summary`
- Mensagens limitadas a 200 por sessão (pruning automático para 150)
- Resumo gerado a cada 10 mensagens via LLM
- Contexto extraído: nome (regex por idioma), tópicos, emoções

### Perfis (MySQL)

- Perfil persiste entre sessões (cross-session)
- Campos: `name`, `story`, `topics[]`, `emotions[]`, `spiritualJourney`, `prayerRequests[]`
- Tópicos e emoções são acumulados de todas as mensagens
- Resumo do perfil gerado a cada 15 mensagens

## i18n (Internacionalização)

Suporte completo a 3 idiomas:

| Código | Idioma | TTS | STT |
|--------|--------|-----|-----|
| `pt-BR` | Português (Brasil) | Antonio, Francisca, Thalita | pt |
| `en-US` | Inglês (EUA) | Guy, Jenny, Aria | en |
| `es-ES` | Espanhol (Espanha) | Alvaro, Elvira | es |

Cada componente é traduzido: identity prompt, context template, memory template, UI strings, TTS voices, STT language codes, topic/emotion keywords, name patterns, blog prompts, disclaimer.

## TTS (Text-to-Speech)

### Modos de TTS

| Modo | Engine | Config | Fallback |
|------|--------|--------|----------|
| `kokoro` | Kokoro-82M (padrão) | `KOKORO_URL` | Multivozes → Edge TTS → Google Translate |
| `multivozes` | Multivozes BR Engine | `MULTIVOZES_URL` + `MULTIVOZES_KEY` | Edge TTS → Google Translate |
| `edge-tts` | Microsoft Edge TTS (CLI) | CLI local | Google Translate |

### Vozes por idioma

| Idioma | Edge TTS | Multivozes | Kokoro |
|--------|----------|------------|--------|
| pt-BR | Antonio (Neural) | alloy → Antonio | pf_dora, pm_alex |
| en-US | Guy (Neural) | alloy → Antonio | af_heart, af_bella, af_nova, am_adam, am_michael |
| es-ES | Alvaro (Neural) | alloy → Antonio | ef_dora |

Kokoro suporta aliases OpenAI: `alloy` → af_heart, `echo` → am_adam, `fable` → af_bella, `onyx` → am_michael, `nova` → af_nova, `shimmer` → af_bella.

### Pipeline TTS

1. Texto limpo (markdown removido, emojis removidos, referências bíblicas formatadas)
2. Chunking em segmentos de ~450 caracteres por pontuação
3. Engine selecionada gera MP3 para cada chunk
4. Fallback automático para próxima engine na cadeia se a atual falhar

### Configuração Kokoro TTS

```env
TTS_MODE=kokoro
KOKORO_URL=http://localhost:8000
KOKORO_LANG=           # vazio = auto por idioma
KOKORO_VOICE=          # vazio = auto por idioma
```

**Iniciar o servidor Kokoro:**

```bash
cd tts-server
pip install kokoro soundfile fastapi uvicorn
python kokoro_server.py --port 8000
```

O servidor expõe API OpenAI-compatible em `http://localhost:8000/v1/audio/speech`.

## STT (Speech-to-Text)

| Provider | Modelo | Prioridade |
|----------|--------|-----------|
| Groq | Whisper Large v3 | Primária |
| OpenAI | Whisper-1 | Fallback |

### Extensões suportadas

`flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`, `opus`, `wav`, `webm`

**Sanitização**: extensão validada contra whitelist, parâmetros de mimetype removidos.

## Email

| Funcionalidade | Descrição |
|---------------|-----------|
| Newsletter | Double opt-in com confirmação e cancelamento |
| Devocional diário | Enviado automaticamente à meia-noite |
| Contact form | Recebe mensagens e envia resposta automática |

Templates HTML com tema dark premium (glassmorphism, bordas douradas).

## Deploy

### Desenvolvimento

```bash
npm run dev    # Node.js com --watch
npm run tunnel # Cloudflare tunnel para WhatsApp webhook
```

### Produção

```bash
npm start     # Produção
```

**Recomendações para produção:**

1. Configure `JWT_SECRET` com string aleatória forte
2. Ative HTTPS (reverse proxy: nginx, Caddy, Cloudflare)
3. Configure CORS para domínios permitidos
4. Adicione rate limiting (express-rate-limit)
5. Configure `PERSONA` no `.env` se desejar persona diferente
6. Execute `npm run ingest` antes do primeiro uso

### Docker (futuro)

Planejado para roadmap — ver [`ROADMAP.md`](ROADMAP.md).

## Configuração do WhatsApp (Evolution API v2)

```bash
# Configurar webhook com tunnel público
npm run tunnel

# Ou manualmente:
curl -X POST http://localhost:3000/api/whatsapp/setup-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://seu-dominio.com"}'
```

**Auto-detecção do Bot JID**: O sistema tenta detectar o JID do bot automaticamente via:
1. Variáveis de ambiente (`WHATSAPP_BOT_JID`, `WHATSAPP_BOT_PHONE`)
2. API da Evolution API
3. Menções em mensagens de grupo

## Segurança

| Aspecto | Status | Notas |
|---------|--------|-------|
| JWT auth | ✅ | 30 dias de expiração |
| bcrypt password hashing | ✅ | 10 rounds |
| Google OAuth | ⚠️ | Valida token do lado do cliente — melhorar |
| Rate limiting | ❌ | Planejado para v1.1 |
| CORS | ❌ | Planejado para v1.1 |
| SQL injection | ✅ | Prepared statements (quase todos os locais) |
| XSS | ✅ | Conteúdo do LLM não é renderizado como HTML |

Ver [`ROADMAP.md`](ROADMAP.md) para plano de segurança detalhado.