# Contribuindo para Jesus.AI

Obrigado por querer contribuir! Este projeto existe para que mais pessoas tenham acesso às palavras de Jesus, e toda contribuição é bem-vinda.

## Princípios

- **Acesso livre** — Toda contribuição deve manter o projeto acessível gratuitamente
- **Transparência** — Mudanças devem ser claras edocumentáveis
- **Respeito** — O projeto trata de fé. Seja respeitoso com todas as perspectivas

## Como contribuir

### Reportando bugs

1. Verifique se o bug já não foi reportado nas Issues
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
   npm run ingest  # se necessário
   npm start
   ```
5. Commit com mensagem clara
6. Abra um Pull Request

### Adicionando traduções da Bíblia

O sistema suporta múltiplas fontes bíblicas. Para adicionar uma nova tradução:

1. Crie um leitor em `src/utils/bible.js` seguindo o padrão existente
2. Adicione o mapeamento no ingester (`src/rag/ingester.js`)
3. Teste com `npm run ingest`
4. Documente a tradução no DOCS.md

### Melhorando o prompt de identidade

O prompt está em `src/system-prompt.js`. Ao modificar:

- Mantenha a consistência com a pessoa de Jesus
- Nunca permita que a IA se apresente como assistente
- Todas as respostas devem ser baseadas em versículos bíblicos
- Teste com perguntas difíceis para verificar o comportamento

## Setup de desenvolvimento

```bash
# Clone
git clone https://github.com/seu-usuario/jesus-ai.git
cd jesus-ai

# Instale
npm install

# Configure
cp .env.example .env
# Adicione sua OLLAMA_API_KEY

# Ingerir dados bíblicos
npm run ingest

# Rodar em modo dev (watch)
npm run dev
```

## Estrutura do código

- `src/server.js` — Entry point Express
- `src/routes/chat.js` — API de chat com streaming SSE
- `src/system-prompt.js` — Identidade e templates de prompt
- `src/rag/store.js` — Busca TF-IDF de versículos
- `src/rag/ingester.js` — Ingestão de dados bíblicos
- `src/memory/session.js` — Gerenciamento de sessões e memória
- `src/utils/bible.js` — Leitura de dados bíblicos
- `public/` — Frontend vanilla

## Estilo de código

- JavaScript (CommonJS, Node.js)
- Indentação: 2 espaços
- Sem ponto e vírgula no final (seguinte o padrão existente)
- Funções descritivas, variáveis claras
- Comentários só quando necessário para lógica complexa

## Testando manualmente

1. Inicie o servidor: `npm start`
2. Acesse `http://localhost:3000`
3. Teste cenários:
   - Primeira mensagem (sem contexto)
   - Perguntas sobre temas específicos (amor, fé, sofrimento)
   - Respostas com versículos citados
   - Streaming contínuo (respostas longas)
   - Novas sessões (botão "Nova conversa")
   - Referência a versículos do AT e NT

## Perguntas?

Abra uma Issue. Respondemos com prazer.

---

**"Cuide do que você está fazendo e do que está ensinando. Continue fazendo isso, pois, assim você salvará tanto a você mesmo, bem como a todos os que o escutam"** — 1 Timóteo 4:16