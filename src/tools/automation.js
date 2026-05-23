const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const integrations = require('../llm/integrationManager');

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts', 'automation');
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

// Determinar o interpretador Python ativo no host de forma cross-platform
function getPythonCommand() {
  if (process.platform !== 'win32') {
    // Linux VPS usa tradicionalmente python3
    try {
      execSync('python3 --version', { stdio: 'ignore' });
      return 'python3';
    } catch (e) {
      return 'python';
    }
  }

  // Windows Local
  try {
    execSync('python --version', { stdio: 'ignore' });
    return 'python';
  } catch (e) {
    try {
      execSync('py --version', { stdio: 'ignore' });
      return 'py';
    } catch (err) {
      return 'python';
    }
  }
}

const PYTHON_CMD = getPythonCommand();

/**
 * Ponte para o Excel Live API (excel-live.py)
 */
async function executeExcelLive(action, filePath, operations = [], sheet = null) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(SCRIPTS_DIR, 'excel-live.py');
    const absolutePath = path.resolve(filePath);

    const args = [
      pythonScript,
      absolutePath,
      JSON.stringify(operations),
      action,
      sheet || ''
    ];

    execFile(PYTHON_CMD, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`Erro no Excel Live Driver: ${err.message}. Stderr: ${stderr}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (parseErr) {
        reject(new Error(`Falha ao ler saída do script Excel: ${stdout}`));
      }
    });
  });
}

/**
 * Ponte para a Macro Engine (macro-engine.py)
 */
async function executeResilientMacro(steps = []) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(SCRIPTS_DIR, 'macro-engine.py');
    const args = [pythonScript, JSON.stringify(steps)];

    execFile(PYTHON_CMD, args, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`Erro na Macro Engine: ${err.message}. Stderr: ${stderr}`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (parseErr) {
        reject(new Error(`Falha ao ler saída da Macro Engine: ${stdout}`));
      }
    });
  });
}

/**
 * Analisa logs locais recentes para identificar a causa raiz de um erro e sugere auto-healing.
 * 
 * @param {Object} params Parâmetros de diagnóstico
 * @param {string} params.logPath Caminho do arquivo de log
 * @param {number} [params.recentLinesCount=50] Quantidade de linhas recentes a analisar
 * @returns {Promise<Object>} Diagnóstico e plano de auto-healing
 */
async function diagnoseRootCause(params) {
  const logPath = params.logPath || 'server_err.log';
  const recentLinesCount = parseInt(params.recentLinesCount, 10) || 50;

  console.log(`[Auto-Healing] 🔍 Iniciando Root Cause Analysis para o log: "${logPath}" (últimas ${recentLinesCount} linhas)`);

  const ALLOWED_LOG_DIRS = [
    path.resolve(process.cwd(), 'logs'),
    path.resolve(process.cwd()),
  ];
  const ALLOWED_LOG_FILES = ['server.log', 'server_err.log', 'err.log', 'error.log', 'npm-debug.log', 'nohup.out'];

  function isPathAllowed(resolvedPath) {
    const normalized = path.normalize(resolvedPath);
    if (normalized.includes('..')) return false;
    return ALLOWED_LOG_DIRS.some(dir => normalized.startsWith(dir));
  }

  const resolvedPath = path.resolve(process.cwd(), logPath);
  if (!isPathAllowed(resolvedPath)) {
    return {
      success: false,
      error: `Caminho de log não Permitido: ${logPath}. Apenas arquivos dentro do diretório do projeto são Permitidos.`,
    };
  }

  if (!fs.existsSync(resolvedPath)) {
    const alternativePaths = [
      path.join(process.cwd(), 'logs', logPath),
      path.join(process.cwd(), 'server.log'),
      path.join(process.cwd(), 'server_err.log'),
      path.join(process.cwd(), 'err.log'),
    ];
    
    let foundPath = null;
    for (const altPath of alternativePaths) {
      const normAlt = path.normalize(altPath);
      if (isPathAllowed(normAlt) && fs.existsSync(normAlt)) {
        foundPath = normAlt;
        break;
      }
    }

    if (!foundPath) {
      return {
        success: false,
        error: `Arquivo de log não encontrado em ${resolvedPath} nem em caminhos alternativos comuns.`,
        searchedPaths: [resolvedPath, ...alternativePaths]
      };
    }
    
    return diagnoseRootCause({ logPath: foundPath, recentLinesCount });
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const recentLines = lines.slice(-recentLinesCount).join('\n');

    const messages = [
      {
        role: 'system',
        content: 'Você é o JARVIS, um Engenheiro de Confiabilidade de Sistemas (SRE) extremamente inteligente e especialista em Auto-Healing (autocorreção). Sua missão é realizar um Diagnóstico de Causa Raiz (Root Cause Analysis - RCA) cirúrgico a partir de trechos de log de erro locais. Identifique o problema de forma estruturada (Erros de sintaxe, arquivo faltante, portas ocupadas, conexões recusadas, banco de dados, permissão, etc.), indique a causa raiz clara, e entregue um plano tático de Auto-Healing detalhado contendo código de correção ou o comando exato que resolve o problema. Seja direto, técnico e use um tom profissional com uma leve dose de sarcasmo refinado clássico do Jarvis.'
      },
      {
        role: 'user',
        content: `Caminho do arquivo analisado: ${resolvedPath}\n\nLinhas de log recentes para análise:\n\`\`\`log\n${recentLines}\n\`\`\`\n\nPor favor, forneça:\n1. 🚨 DIAGNÓSTICO DO ERRO\n2. 🧬 CAUSA RAIZ (RCA)\n3. ⚡ PLANO DE AUTO-HEALING (com comandos ou correções exatas)`
      }
    ];

    console.log(`[Auto-Healing] 🤖 Solicitando parecer de inteligência sobre falha para o log...`);
    const response = await integrations.callLLM(messages, { temperature: 0.3 });
    const diagnosis = response.message?.content || response.content || '';

    return {
      success: true,
      logPath: resolvedPath,
      linesAnalyzed: recentLinesCount,
      diagnosis: diagnosis
    };
  } catch (err) {
    console.error(`[Auto-Healing] ❌ Erro ao realizar diagnóstico de logs:`, err.message);
    return {
      success: false,
      error: `Falha interna no diagnóstico: ${err.message}`
    };
  }
}

module.exports = {
  PYTHON_CMD,
  executeExcelLive,
  executeResilientMacro,
  diagnoseRootCause
};