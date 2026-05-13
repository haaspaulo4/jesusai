# Contribuindo para Jesus.AI

Obrigado por querer contribuir! Este projeto existe para que mais pessoas tenham acesso às palavras de Jesus, e toda contribuição é bem-vinda.

## Princípios

- **Acesso livre** — Toda contribuição deve manter o projeto acessível gratuitamente
- **Transparência** — Mudanças devem ser claras e documentáveis
- **Respeito** — O projeto trata de fé. Seja respeitoso com todas as perspectivas
- **Pluggable** — Novos conhecimentos e personas devem ser fáceis de adicionar

## Setup Rápido

```bash
git clone https://github.com/anomalyco/jesus-ai.git
cd jesus-ai
npm install
cp .env.example .env
# Adicione sua OLLAMA_API_KEY no .env
npm run ingest   # Indexar o corpus de conhecimento
npm run dev      # Desenvolvimento (watch mode)
```

### Pré-requisitos

1. Node.js 18+ e npm
2. MySQL 8.4 rodando em localhost (root, sem senha, database `jesus_ai`)
3. Chave `OLLAMA_API_KEY` no `.env`
4. *(Opcional)* `pip install edge-tts` para TTS

## Arquitetura

O sistema é **pluggable** — corpus de conhecimento e persona são configuráveis:

```
src/knowledge/config.js  → Define fontes de conhecimento (Bíblia, livros, docs)
src/knowledge/store.js    → Busca TF-IDF genérica
src/knowledge/ingester.js → Orquestra ingestão de múltiplas fontes
src/knowledge/sources/    → Ingestores (bible, json, text)

src/persona/config.js     → Define personas (Jesus, etc.) e templates por idioma
```

**Ver [`DOCS.md`](DOCS.md) para documentação técnica completa.**

## Como contribuir

### Reportando bugs

1. Verifique se o bug já não foi reportado nas [Issues](https://github.com/anomalyco/jesus-ai/issues)
2. Abra uma nova Issue com:
   - Descrição clara do problema
   - Passos para reproduzir
   - Comportamento esperado vs. observado
   - Screenshots se relevante

### Sugerindo funcionalidades

1. Abra uma Issue descrevendo a funcionalidade
2. Explique o problema que ela resolve
3. Se possível, proponha uma solução

### Enviando código

1. Faça fork do repositório
2. Crie uma branch: `git checkout -b feature/nome-da-feature`
3. Faça suas alterações
4. Teste localmente:
   ```bash
   npm install
   npm run ingest   # se necessário
   npm start
   ```
5. Commit com mensagem clara e em inglês
6. Abra um Pull Request

### Adicionando fontes de conhecimento

O sistema suporta múltiplos ingestores. Para adicionar uma nova fonte:

1. Prepare seus dados em formato JSON (campos `reference` e `text`) ou como diretório de texto
2. Adicione a configuração em `src/knowledge/config.js`:
   ```js
   {
     id: 'my-source',
     name: 'My Knowledge Source',
     type: 'json-verses',  // ou 'text-chunks'
     enabled: true,
     dataPath: path.join(__dirname, '..', '..', 'data', 'my_source.json'),
     searchFields: ['reference', 'text'],
     ingester: 'json',  // ou 'text'
     contextTemplate: { 'pt-BR': '...', 'en-US': '...', 'es-ES': '...' },
     sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
   }
   ```
3. Execute `npm run ingest`
4. Teste a busca em `/api/blog/search?q=teste`
5. Documente a fonte no [`DOCS.md`](DOCS.md)

**Ingestores disponíveis:**

| Tipo | Descrição |
|------|-----------|
| `bible` | Bíblia (NT local + OT via API) |
| `json` | Qualquer array JSON com `reference` e `text` |
| `text` | Diretório com .txt/.md, chunking automático |

### Adicionando uma persona

1. Crie a configuração em `src/persona/config.js` seguindo o formato de `PERSONAS.jesus`
2. Inclua identity, rules, topicKeywords, emotionKeywords, namePatterns em 3 idiomas
3. Adicione ao `.env`: `PERSONA=sua-persona`
4. Teste com mensagens em cada idioma
5. Documente no [`DOCS.md`](DOCS.md)

### Adicionando traduções

O i18n está em `src/i18n/index.js` e `src/persona/config.js`. Para adicionar um idioma:

1. Adicione o código do idioma em `SUPPORTED_LANGS` em `src/i18n/index.js`
2. Crie o objeto de traduções completo (use `pt-BR` como referência)
3. Adicione mapeamentos de voz TTS em `LANG_VOICES`
4. Adicione mapeamentos de idioma STT em `getSTTLang()`
5. Adicione a persona completa em `src/persona/config.js`
6. Teste com mensagens no novo idioma

### Melhorando a busca (RAG)

A busca TF-IDF está em `src/knowledge/store.js`. Possíveis melhorias:

- Adicionar stemming/lemmatização por idioma
- Adicionar sinônimos bíblicos (graça=favor, etc.)
- Implementar busca por referência ("João 3:16" → versículo exato)
- Adicionar cache LRU para resultados frequentes
- Considerar upgrade para embeddings no futuro

## Estilo de código

- JavaScript (CommonJS, Node.js)
- Indentação: 2 espaços
- Sem ponto e vírgula no final (seguir o padrão existente)
- Funções descritivas, variáveis claras
- Comentários só quando necessário para lógica complexa
- **Sem emojis** em arquivos de documentação

## Testando manualmente

1. Inicie o servidor: `npm start`
2. Acesse `http://localhost:3000`
3. Teste cenários:
   - Primeira mensagem (sem contexto)
   - Perguntas sobre temas específicos (amor, fé, sofrimento)
   - Respostas com versículos citados
   - Streaming contínuo (respostas longas)
   - Troca de idioma (pt-BR, en-US, es-ES)
   - Novas sessões (botão "Nova conversa")
   - Bot Telegram (se configurado)
   - Bot WhatsApp (se configurado)
   - TTS/STT (se Edge TTS e Groq configurados)

## Perguntas?

Abra uma [Issue](https://github.com/anomalyco/jesus-ai/issues). Respondemos com prazer.

---

*"Cuide do que você está fazendo e do que está ensinando. Continue fazendo isso, pois, assim você salvará tanto a você mesmo, bem como a todos os que o escutam"* — 1 Timóteo 4:16