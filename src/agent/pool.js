"// c:\laragon\www\jesus.ai\src\agent\pool.js
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let claudeCliAvailable = false;
let claudeCliChecking = true;
let claudeCliError = '';
let CLAUDE_CMD = 'claude';

// Varredura cruzada de plataforma para encontrar a CLI do Claude, priorizando OpenClaude
function findClaudeCli() {
  if (process.env.CLAUDE_CMD_OVERRIDE) {
    console.log(`[WarmPool] Forçando Claude CLI via override: ${process.env.CLAUDE_CMD_OVERRIDE}`);
    return process.env.CLAUDE_CMD_OVERRIDE;
  }

  const isWin = process.platform === 'win32';

  // 1. Procurar openclaude no PATH
  try {
    const checkCmd = isWin ? 'where openclaude' : 'which openclaude';
    execSync(checkCmd, { stdio: 'pipe', timeout: 2000, shell: isWin });
    console.log('[WarmPool] Priorizando OpenClaude detectado no PATH.');
    return 'openclaude';
  } catch (e) {}

  // 2. Procurar claude oficial no PATH
  try {
    const checkCmd = isWin ? 'where claude' : 'which claude';
    execSync(checkCmd, { stdio: 'pipe', timeout: 2000, shell: isWin });
    console.log('[WarmPool] CLI oficial do Claude Code detectada no PATH.');
    return 'claude';
  } catch (e) {}

  return null;
}

async function verifyAndInitialize() {
  const cli = findClaudeCli();
  if (!cli) {
    claudeCliError = 'Claude CLI não encontrada no PATH. Instale com npm i -g @anthropic-ai/claude-code ou openclaude';
    console.error(`[WarmPool] ❌ ${claudeCliError}`);
    claudeCliAvailable = false;
    claudeCliChecking = false;
    return;
  }

  CLAUDE_CMD = cli;

  // Carregamento acelerado se for OpenClaude (ignora validação demorada)
  if (CLAUDE_CMD.includes('openclaude')) {
    console.log('[WarmPool] ✅ OpenClaude assumido ativo e autenticado de forma acelerada.');
    claudeCliAvailable = true;
    claudeCliChecking = false;
    initializePools();
    return;
  }

  // Slow validation para a CLI do Claude oficial
  try {
 
<truncated 4696 bytes>