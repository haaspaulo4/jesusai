# 🧠 AI Context & Integration Manual: MetaPersona.AI (jesus.ai) 🤝 JARVIS (v7.2.0)

> **Este documento serve como a fonte da verdade de contexto técnico e arquitetura para qualquer IA ou Agente Inteligente que venha a atuar, estender ou dar manutenção a este repositório.**

---

## 🎯 1. Visão Geral do Ecossistema Híbrido

O projeto constitui a simbiose de duas plataformas de inteligência artificial complementares:

1. **MetaPersona.AI (jesus.ai) [O Cérebro Cognitivo]:** Um Sistema Operacional Cognitivo whitelabel, multi-persona e multi-canal (WhatsApp, Telegram, Web). Ele gerencia cognição em tempo real (análise de sentimentos e intenções), persistência em MySQL 8.4, RAG híbrido (TF-IDF + Vector Embeddings via Ollama), gamificação (XP, níveis, streaks, conquistas), automações dinâmicas e gerenciamento de negócios (CRM, CRM Funnel, ERP, metas).
2. **JARVIS Port [O Braço Executivo Local & Cloud]:** Um conjunto de microsserviços e ferramentas portadas que conferem superpoderes de automação local. Ele lida com execução de comandos locais em tempo real (Warm Pools do Claude/OpenClaude), automação avançada de planilhas Excel (Excel Live), visão computacional por OCR ativo, monitoramento de notas locais (Obsidian RAG Sync), automação furtiva de navegadores (Stealth CDP Swarm) e equalização de telemetria visual 3D (Cockpit HUD).

---

## 🗺️ 2. Arquitetura Cross-Platform (Windows Local vs. Linux VPS)

O sistema foi arquitetado para ser **100% agnóstico de sistema operacional**, adaptando-se em tempo real entre um desktop físico Windows (para desenvolvimento local avançado com mouse/teclado/telas reais) e um servidor virtual **Linux VPS Headless** (para deploy SaaS em produção).

```
                              ┌─────────────────────────┐
                              │    NÚCLEO DO SYSTEMA    │
                              │       (jesus.ai)        │
                              └────────────┬────────────┘
                                           │
                        Detecta OS em Tempo de Execução (Runtime)
                                           │
                  ┌────────────────────────┴────────────────────────┐
                  ▼                                                 ▼
        [WINDOWS LOCAL SPACE]                             [LINUX VPS HEADLESS]
  ┌─────────────────────────────────┐               ┌─────────────────────────────────┐
  │ * Excel via ctypes + WM_CLOSE   │               │ * Leitura/Escrita direta xlsx   │
  │ * Captura física PIL (Desktop)  │               │ * Fallback Browser CDP/Xvfb     │
  │ * Cliques de baixo nível GDI    │               │ * Bypasses Chrome Headless      │
  │ * Installer Batch (.bat) local  │               │ * Installer Bash (.sh) + systemd│
  └─────────────────────────────────┘               └─────────────────────────────────┘
```

### Regras de Ouro Cross-Platform para IAs:
1. **Excel Live:**
   * No **Windows**, o script Python localiza a janela do Excel usando as APIs `ctypes` e `EnumWindows`, fecha de forma amigável com `WM_CLOSE`, limpa os arquivos fantasmas lock (`~$`), grava as atualizações via `openpyxl` e reabre a planilha nativamente.
   * No **Linux VPS**, o script **ignora** checagem de janelas ou processos GUI. Ele lê e grava silenciosamente no arquivo `.xlsx` em memória via `openpyxl` e encerra, já que não há processo visual travando o arquivo.
2. **Vision e OCR:**
   * No **Windows**, usa `PIL.ImageGrab.grab(all_screens=True)` + `pytesseract` para extrair um grid de texto delimitado por caixas $(x, y)$ (Bounding Boxes).
   * No **Linux VPS Headless**, o driver Node.js faz o **fallback automático** para capturar a tela por dentro da aba ativa do navegador usando o protocolo WebSocket CDP (`Page.captureScreenshot`), prevenindo exceptions por falta de vídeo ou X11.
3. **Browser Swarm:**
   * No **Windows**, localiza e inicializa os executáveis do Chrome, Edge ou Brave nos caminhos tradicionais do sistema.
   * No **Linux**, inicializa `/usr/bin/google-chrome` ou `/usr/bin/chromium-browser` injetando flags VPS headless obrigatórias (`--headless=new`, `--no-sandbox`, `--disable-gpu`, `--disable-dev-shm-usage`).

---

## 📂 3. Estrutura Física de Pastas e Módulos do jesus.ai

Ao dar manutenção, utilize sempre os locais apropriados indicados a seguir:

```
c:\laragon\www\jesus.ai\
├── INSTALL-JARVIS-JESUSAi.bat       # Setup automatizado de telemetria Windows
├── install-jarvis-jesusai.sh       # Setup automatizado de telemetria Linux VPS
├── scripts/
│   └── automation/
│       ├── excel-live.py           # Script Python para ler/gravar planilhas (Cross-Platform)
│       ├── screenshot.py           # Script Python para visão e OCR (Cross-Platform)
│       ├── browser-control.py      # Script Python com CDP driver WebSocket
│       └── macro-engine.py         # Script Python para clicks resilientes e checagem de pixels HSL
├── public/
│   └── cockpit/
│       ├── index.html              # Frontend premium WebGL Three.js HUD
│       ├── style.css               # Estilizações sci-fi e responsividade neon
│       └── script.js               # Conexões Socket.IO e lógicas de waveforms 3D
└── src/
    ├── server.js                   # Boot principal Express & Socket.IO (Chama verificações de Warm Pools)
    ├── agent/
    │   └── pool.js                 # WarmPools CLI Engine (Claude/OpenClaude auto-recovery)
    ├── knowledge/
    │   └── obsidian.js             # Daemon de indexação AST YAML Frontmatter do Obsidian RAG
    ├── realtime/
    │   └── events.js               # Event Bus Socket.IO (Transmite agent_thinking, cognitive_state, etc)
    └── tools/
        ├── automation.js           # Ponte Node.js para scripts Python locais e macros
        ├── vision.js               # Ponte Node.js para capturas OCR e text grid
        ├── browser.js              # Ponte Node.js para Stealth Browser Swarm
        └── registry.js             # Registro centralizador de ferramentas agenticas LLM
```

---

## 🛠️ 4. Padrões de Código e Convenções Arquiteturais

Qualquer IA que modifique a base de código do **jesus.ai** deve seguir estes preceitos rigorosamente:

1. **CommonJS:** A base do jesus.ai roda em CommonJS (`require()`, `module.exports`), ao contrário do JARVIS original que usava ES Modules. **Nunca introduza `import` ou `export` nos arquivos principais do jesus.ai**, use `require()` e exporte como objetos CJS padrão.
2. **Robustez dos Warm Pools (Bypasses do OpenClaude):**
   * Configurar e respeitar a variável de ambiente `.env` `CLAUDE_CMD_OVERRIDE=openclaude`.
   * Se for detectado o uso do OpenClaude, o pool ignora pré-validações demoradas de assinatura para acelerar a inicialização.
   * Sessões com mais de 90 segundos são limpas para evitar vazamento de memória e PIDs órfãos no Windows/Linux VPS.
3. **Não-Bloqueio de Event Loop:** Todas as execuções de comandos externos Python e pools de CLI devem ser assíncronas e controladas por Promises (utilize `child_process.execFile` ou `spawn` com buffers de leitura limpos).
4. **Resiliência a Falhas (Graceful Degradation):**
   * Se o Tesseract OCR falhar ou não estiver no PATH, o sistema deve silenciar o erro no Vision e retornar a imagem sem o grid OCR.
   * Se os Warm Pools do Claude CLI falharem repetidamente (mais de 3 falhas), as ferramentas de terminal devem ser desabilitadas e o fluxo deve seguir de forma elegante via LLM padrão.
   * Áudio Kokoro local deve ter fallback transparente para OpenAI API ou Google Translate.

---

## ⚙️ 5. Variáveis de Ambiente e Configuração (.env)

As variáveis adicionadas no `.env` do jesus.ai para portar as automações do JARVIS são:

```bash
# Override da CLI Claude para Warm Pools (claude ou openclaude)
CLAUDE_CMD_OVERRIDE=openclaude

# Ativação do monitoramento automático do Obsidian
OBSIDIAN_VAULT_PATH=C:/Users/Paulo/Documents/Felipe
OBSIDIAN_HOT_RELOAD=true

# Endereço de depuração remota do Google Chrome
CHROME_CDP_PORT=9222

# Caminho para os binários locais do Tesseract OCR (Windows)
TESSERACT_PATH=C:/Program Files/Tesseract-OCR/tesseract.exe

# Tamanho limite das mensagens para TTS
MESSAGE_CHUNK_SIZE=200
```

---

## 🤖 6. Prompt Diretivo de Inicialização Rápida para IAs

> *Ao ler este repositório, localize primeiro `src/server.js` para entender a inicialização de serviços. Antes de alterar o chat engine (`src/chat/engine.js`), confira o sistema cognitivo (`src/cognitive/`) e como os estados de emoções, intenções e CRM se conectam aos triggers Socket.IO que acionam os efeitos visuais 3D do HUD em `/cockpit`.*

---

*Fim do Manual de Contexto Híbrido.*
