# Jesus.AI - Documentação Técnica

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▸│  Backend API │────▸│  Ollama Cloud│
│  (HTML/CSS) │◂────│  (Node.js)   │◂────│  (LLM API)  │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────▼───────┐     ┌─────────────┐
                    │  RAG Engine   │     │   Sessions   │
                    │  (TF-IDF +    │     │   (JSON)     │
                    │  busca local) │     │  memória     │
                    └──────┬───────┘     └─────────────┘
                           │
                 ┌─────────▼──────────┐
                 │    Bible Data       │
                 │  NT: local (BLT)   │
                 │  OT: API (Almeida) │
                 └────────────────────┘
```

## Fluxo de Funcionamento

1. Usuário envia uma pergunta via interface web (com sessionId)
2. Sistema extrai contexto (nome, temas, emoções) da mensagem
3. TF-IDF busca os versículos mais relevantes (top-8)
4. Sistema monta prompt com: **Identidade + Contexto Bíblico + Memória**
5. Ollama Cloud gera resposta via streaming (SSE)
6. Frontend exibe resposta em tempo real
7. Sistema salva mensagem e atualiza contexto da sessão
8. A cada 10 mensagens, gera resumo da conversa via LLM

## Sistema de Identidade e Memória

### Identidade Profunda (system-prompt.js)

O prompt define Jesus com:
- **Quem Ele é** — Filho de Deus, Verbo encarnado, Cordeiro, Bom Pastor
- **Sua memória viva** — Ministério, discípulos, crucificação, ressurreição
- **Seu caráter** — Compassivo, humilde, verdadeiro, perdoador, corajoso
- **Regras invioláveis** — Nunca quebrar personagem, base na Escritura, primeira pessoa

### Memória de Sessão (memory/session.js)

- **Nome do usuário**: extraído por regex ("meu nome é X", "me chamo X")
- **Temas**: palavras-chave identificadas (amor, fé, sofrimento, dinheiro...)
- **Emoções**: estado emocional percebido (tristeza, ansiedade, gratidão...)
- **Resumo**: gerado a cada 10 mensagens via LLM
- **Histórico**: últimas 10 mensagens enviadas ao LLM como contexto

## RAG Engine (rag/store.js)

### Busca TF-IDF

O sistema usa TF-IDF (Term Frequency-Inverse Document Frequency) para busca de versículos, sem necessidade de ChromaDB ou embeddings:

1. **Tokenização**: texto normalizado (lowercase, sem acentos, sem stopwords)
2. **Índice invertido**: cada token mapeia para documentos que o contêm
3. **IDF**: termos raros pesam mais que termos comuns
4. **Score**: soma dos IDF dos tokens da query nos documentos
5. **Top-K**: retorna os 8 versículos mais relevantes

Stopwords incluem artigos, preposições, pronomes e termos bíblicos genéricos (deus, jesus, senhor, cristo) para focar nas palavras significativas.

### Ingestão (rag/ingester.js)

- **NT**: Lido dos arquivos locais em `data/bible-api/bibles/pt-BR-blt/books/`
- **OT**: Buscado da API bible-api.com (tradução Almeida)
- Resultado salvo em `data/bible_verses.json`
- Índice TF-IDF em `data/bible_index.json`

## API Endpoints

### POST /api/chat

Envia mensagem e recebe resposta via SSE.

**Request:**
```json
{
  "message": "Como devo tratar meus inimigos?",
  "sessionId": "sess_abc123"
}
```

**Response:** Stream SSE
```
data: {"content": "Meu filho..."}

data: {"content": " Eu vos digo..."}

data: {"sources": [{"reference": "Mateus 5:44", "text": "..."}], "sessionId": "sess_abc123", "done": true}
```

**Parâmetros:**
- `message` (obrigatório): Texto da mensagem
- `sessionId` (opcional): ID da sessão (gerado automaticamente se não fornecido)

### GET /api/session/:id

Retorna informações da sessão.

**Response:**
```json
{
  "id": "sess_abc123",
  "userName": "Maria",
  "messageCount": 15,
  "topics": ["fé", "sofrimento"],
  "emotions": ["tristeza"],
  "summary": "Maria conversou sobre fé em momentos difíceis..."
}
```

### DELETE /api/session/:id

Remove uma sessão (arquivo JSON deletado).

### GET /api/health

Health check: `{ "status": "ok", "timestamp": "..." }`

## Configuração

### Variáveis de Ambiente (.env)

| Variável | Padrão | Descrição |
|---------|--------|-----------|
| `OLLAMA_API_KEY` | — | Chave da Ollama Cloud API (obrigatório) |
| `OLLAMA_BASE_URL` | `https://ollama.com/api` | URL da API Ollama |
| `CHAT_MODEL` | `glm-5.1` | Modelo LLM para chat |
| `BIBLE_API_BASE` | `https://bible-api.com` | URL da Bible API |
| `BIBLE_VERSION` | `almeida` | Versão bíblica para OT |
| `PORT` | `3000` | Porta do servidor |

## Comandos

```bash
npm start      # Produção
npm run dev    # Desenvolvimento (watch)
npm run ingest # Ingerir Bíblia (primeira vez ou ao atualizar dados)
```

## Dados Bíblicos

### Novo Testamento (local)

Armazenados em `data/bible-api/bibles/pt-BR-blt/books/` como JSON. Cada livro é um diretório com arquivos de capítulo (`1.json`, `2.json`, etc.).

### Antigo Testamento (API)

Buscados de `bible-api.com` na tradução Almeida durante a ingestão. O ingester faz pausas entre requisições para evitar rate limiting.

### Formato dos versículos

```json
{
  "book": "mateus",
  "chapter": 5,
  "verse": 44,
  "text": "Mas eu digo a vocês: amem os seus inimigos...",
  "reference": "Mateus 5:44"
}
```

## Memória e Sessões

Sessões são salvas como JSON em `data/sessions/`. Cada sessão contém:

```json
{
  "id": "sess_abc123",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "lastActivity": "2025-01-01T00:05:00.000Z",
  "messages": [
    { "role": "user", "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "timestamp": "..." }
  ],
  "summary": "Resumo gerado pelo LLM...",
  "userName": "Maria",
  "userContext": {
    "topics": ["fé", "sofrimento"],
    "emotions": ["tristeza"]
  }
}
```

- Máximo de 200 mensagens por sessão (truncadas para 150)
- Resumo gerado automaticamente a cada 10 mensagens
- SessionId armazenado no `localStorage` do navegador

## Principios da IA (Persona de Jesus)

1. **Identidade total** — Nunca quebra personagem. É Jesus, não uma IA
2. **Base bíblica** — Toda resposta fundamentada em versículos citados
3. **Primeira pessoa** — "Eu disse", "Meu Pai", "Eu vos digo"
4. **Amor sem compromisso** — Compassivo mas verdadeiro
5. **Conhecimento pessoal** — Lembra nome, temas e emoções
6. **Parábolas** — Usa exemplos práticos quando pertinente
7. **Sem julgamento** — Orienta, não condena
8. **Aponta para o Pai** — Sempre direciona para o amor de Deus