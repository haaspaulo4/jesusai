# AGENTS.md (Versão Otimizada)

## MetaPersona.AI - Sistema Operacional Cognitivo para Agentes de IA

Plataforma para agentes cognitivos persistentes com RAG multimodal, multi-persona com Meta-RAG, onboarding automático, cognição em tempo real, gamificação, blueprints e gestão operacional completa.

## Stack Tecnológica
- **Backend**: Node.js 18+ + Express
- **Database**: MySQL 8.4 (mysql2/promise)
- **LLM**: Kpalabz Ultra, multi-key fallback, tool calling
- **RAG**: Híbrido TF-IDF + Vector Embeddings (Ollama embeddings, MySQL)
- **Persona**: Multi-persona com Meta-RAG, skills configuráveis, whitelabel

## Arquitetura

### Fluxo Principal
```
Mensagem usuário → Verificação rate limit + ban
                → Verificação onboarding (novo usuário? → perguntas)
                → Resolução persona (sessão → usuário → default)
                → Comando chat? → handleChatCommand
                → Extrair contexto + Buscar conhecimento (persona-aware) + Construir memória + Perfil
                → Construir contexto objetivo + Buscar memória org + Obter estágio conversa
                → buildSystemPrompt(persona, lang, contexto, memória, perfil, nome, isGroup, fontes)
                → Chamada LLM via IntegrationManager (com tools se habilitado)
                → Loop chamadas tool (até 5 rounds): executar tools, push resultados como role:tool, retry LLM
                → Verificação CJK → Salvar mensagem → Agendamento follow-up automático
                → Retornar resposta + fontes + info persona + voz TTS
```

### Integração LLM
IntegrationManager.callLLM() usa callWithFallback() para failover multi-chave, auto-detecta Ollama vs Kpalabz, formata respostas transparentemente.

### Multi-Persona + Meta-RAG
/persona create <descrição> → LLM gera config persona completa
/persona <id> → switch por sessão/usuário/instância-bot
Meta-RAG: cria personas de qualquer descrição - figura bíblica, coach saúde, consultor negócios, etc.

### Sistema Agente
Tarefas, Calendário, CRM/Contatos, Automações, Objetivos, Estágios Conversa, Memória Org, Histórico, Dashboard - todos via tools LLM

### Conhecimento RAG (Híbrido TF-IDF + Vector Embeddings)
Fontes Conhecimento: Versículos bíblicos (JSON), documentos PDF, DOCX, Imagens (OCR), Áudio (STT), Texto/Markdown, JSON, APIs
Busca Híbrida: TF-IDF (busca exata rápida) + Vector (Ollama embeddings, 768d) armazenado no MySQL

## Schema Banco Dados (Tabelas Principais)
- **users** - id, email, senha, nome, google_id, avatar, role (convidado/usuário/premium/admin/banido), persona_id
- **personas** - persona_id, nome, identidade (JSON), fontes_conhecimento (JSON), ativa
- **persona_tasks** - id, persona_id, owner_id, título, descrição, status, prioridade, data_vencimento
- **persona_calendar** - id, persona_id, owner_id, título, descrição, tipo_evento, hora_início, hora_fim
- **persona_contacts** - id, persona_id, owner_id, nome, email, telefone, empresa, função, estágio
- **persona_automations** - id, persona_id, owner_id, nome, tipo_gatilho, tipo_ação
- **persona_goals** - id, persona_id, owner_id, título, descrição, tipo_objetivo, status, progresso
- **event_log** - id, tipo_evento, user_id, persona_id, dados (JSON), resultados (JSON)

## Endpoints API Admin
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/api/admin/users` | Listar usuários |
| GET | `/api/admin/personas` | Listar todas personas |
| POST | `/api/admin/personas` | Criar persona |
| POST | `/api/admin/personas/generate` | Gerar persona via Meta-RAG LLM |
| PUT | `/api/ admin/personas/:id` | Atualizar persona |
| DELETE | `/api/admin/personas/:id` | Deletar persona |
| GET | `/api/admin/tasks` | Listar tarefas |
| POST | `/api/admin/tasks` | Criar tarefa |
| PUT | `/api/admin/tasks/:id` | Atualizar tarefa |
| DELETE | `/api/admin/tasks/:id` | Deletar tarefa |
| GET | `/api/admin/calendar` | Listar eventos |
| POST | `/api/admin/calendar` | Criar evento |
| PUT | `/api/admin/calendar/:id` | Atualizar evento |
| DELETE | `/api/admin/calendar/:id` | Deletar evento |

## Endpoints API Públicos
| Método | Caminho | Descrição |
|---|---|---|
| POST | `/api/chat` | Chat (JSON, limitado, persona-aware, retorna voz TTS) |
| POST | `/api/chat/stt` | Speech-to-text |
| POST | `/api/chat/tts` | Text-to-speech |
| POST | `/api/chat/rating` | Submeter avaliação |
| GET | `/api/chat/personas` | Listar personas |
| POST | `/api/chat/persona/switch` | Trocar persona |
| POST | `/api/auth/register` | Registrar |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/google` | Google OAuth |

## Estrutura Arquivos Principais
- `src/chat/engine.js` - Motor chat central (rate limit, onboarding, RAG persona-aware, tools, loop agente)
- `src/auth/index.js` - Core autenticação (registro, login, Google OAuth, JWT, createUser)
- `src/persona/manager.js` - Multi-persona com persistência DB
- `src/persona/meta-rag.js` - Geração persona Meta-RAG
- `src/agent/index.js` - Sistema agente (tarefas, calendário, contatos, automações, histórico, dashboard)
- `src/llm/tools.js` - Definições tool LLM (34+ tools)
- `src/llm/integrationManager.js` - Fallback multi-chave para TODAS integrações
- `src/knowledge/store.js` - Busca TF-IDF multi-fonte
- `src/routes/admin.js` - API Admin (usuários, personas, skills, tarefas, calendário, contatos, automações, objetivos)
- `src/routes/chat.js` - API Chat (JSON, personas, voz TTS, avaliações, pesquisas, onboarding)

## Níveis Acesso Usuário
| Role | Chat | API Admin | Persona Personalizada | Onboarding |
|---|---|---|---|---|
| convidado | 5 msg/dia | Não | Não | Sim |
| usuário | 30 msg/dia | Não | Via sessão | Sim |
| premium | 100/dia | Não | Sim | Sim |
| admin | 999/dia | Completa | Sim | Pular |

## Restrições Críticas
- `pdf-parse` deve ser v1.1.1 - v2.x tem mudanças API (`pdfParse is not a function`)
- MySQL `LIMIT ? OFFSET ?` com `pool.execute()` falha - deve interpolar como `${Number(limit)}`
- IDs Persona preservam formato original incluindo hífens
- `switchPersona()` limpa histórico mensagens para prevenir contaminação persona
- Meta-persona (id: "meta-persona") tem TODAS tools habilitadas