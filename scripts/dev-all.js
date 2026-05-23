const { spawn, execSync } = require('child_process');
const path = require('path');
const net = require('net');

// Colors for console logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  dim: '\x1b[2m'
};

// Check if a TCP port is open
function checkPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(1500);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

// Find the best working Python command
let detectedPythonCmd = 'python';

function resolvePythonCommand() {
  // 1. Try Windows Python Launcher with 3.12 (highly recommended for compatibility)
  console.log(`      ${colors.dim}- Testando inicialização do Python com 'py -3.12'...${colors.reset}`);
  try {
    execSync('py -3.12 -c "import kokoro"', { stdio: 'ignore', timeout: 6000 });
    detectedPythonCmd = 'py -3.12';
    return true;
  } catch (e) {
    console.log(`      ${colors.dim}- 'py -3.12' indisponível, falhou ou sem 'kokoro'.${colors.reset}`);
  }

  // 2. Try default 'python' command
  console.log(`      ${colors.dim}- Testando inicialização do Python com 'python'...${colors.reset}`);
  try {
    execSync('python -c "import kokoro"', { stdio: 'ignore', timeout: 6000 });
    detectedPythonCmd = 'python';
    return true;
  } catch (e) {
    console.log(`      ${colors.dim}- 'python' indisponível, falhou ou sem 'kokoro'.${colors.reset}`);
  }

  // No command found with kokoro installed
  return false;
}

async function main() {
  console.log(`${colors.bright}${colors.green}=== Diagnóstico de Inicialização MetaPersona.AI ===${colors.reset}\n`);

  let ready = true;

  // 1. Check MySQL Port 3306
  const mysqlPort = parseInt(process.env.DB_PORT || '3306');
  const mysqlHost = process.env.DB_HOST || 'localhost';
  console.log(`${colors.bright}[1/2] Verificando conexão MySQL na porta ${mysqlPort}...${colors.reset}`);
  const isMysqlOpen = await checkPort(mysqlPort, mysqlHost);
  
  if (isMysqlOpen) {
    console.log(`      ${colors.green}✓ MySQL está rodando! Conexão estabelecida.${colors.reset}\n`);
  } else {
    console.log(`      ${colors.red}✗ ERRO: Não foi possível conectar ao MySQL na porta ${mysqlPort}!${colors.reset}`);
    console.log(`      ${colors.yellow}👉 AVISO: Certifique-se de que o Laragon está aberto e que você clicou em "Start All"!${colors.reset}\n`);
    ready = false;
  }

  // 2. Check Python environment
  console.log(`${colors.bright}[2/2] Verificando dependências de IA (Kokoro TTS)...${colors.reset}`);
  const hasWorkingPython = resolvePythonCommand();
  
  if (hasWorkingPython) {
    console.log(`      ${colors.green}✓ Ambiente Python compatível encontrado: '${detectedPythonCmd}'!${colors.reset}\n`);
  } else {
    console.log(`      ${colors.yellow}⚠️ AVISO: A biblioteca 'kokoro' não foi encontrada no seu ambiente Python.${colors.reset}`);
    console.log(`      ${colors.yellow}👉 O servidor iniciará em modo de FALLBACK (utilizando Edge TTS / tradução online).${colors.reset}`);
    console.log(`      ${colors.yellow}👉 Para habilitar TTS e STT locais de alto desempenho, configure seu Python 3.12 rodando:${colors.reset}`);
    console.log(`      ${colors.cyan}      py -3.12 -m pip install kokoro --no-deps && py -3.12 -m pip install scipy torch transformers "misaki[en]>=0.7.16" loguru onnxruntime${colors.reset}\n`);
  }

  if (!ready) {
    console.log(`${colors.bright}${colors.red}======================================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.red} Falha na inicialização: Corrija os erros críticos acima.            ${colors.reset}`);
    console.log(`${colors.bright}${colors.red}======================================================================${colors.reset}`);
    process.exit(1);
  }

  const services = [
    {
      name: 'Backend',
      command: 'node --watch-path=src src/server.js',
      color: colors.cyan
    },
    ...(hasWorkingPython ? [
      {
        name: 'Kokoro TTS',
        command: `${detectedPythonCmd} -u tts-server/kokoro_server.py --port 8001`,
        color: colors.magenta
      },
      {
        name: 'Whisper STT',
        command: `${detectedPythonCmd} -u whisper_server.py`,
        color: colors.yellow
      }
    ] : []),
    {
      name: 'Pet Server',
      command: 'npm start --prefix pet',
      color: colors.green
    }
  ];

  const children = [];
  let isExiting = false;

  console.log(`${colors.bright}${colors.green}=== Iniciando todos os serviços concurrently... ===${colors.reset}\n`);

  function startService(service) {
    if (isExiting) return;
    
    const child = spawn(service.command, {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: path.resolve(__dirname, '..')
    });

    const serviceEntry = { child, name: service.name, service };
    children.push(serviceEntry);

    const log = (data, isError = false) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (!line.trim()) return;
        const prefix = `${service.color}[${service.name}]${colors.reset}`;
        const contentColor = isError ? colors.red : '';
        console.log(`${prefix} ${contentColor}${line}${colors.reset}`);
      });
    };

    child.stdout.on('data', data => log(data, false));
    child.stderr.on('data', data => log(data, true));

    child.on('close', code => {
      console.log(`${service.color}[${service.name}]${colors.reset} Processo encerrado com código ${code}`);
      
      // Remove from children array
      const index = children.indexOf(serviceEntry);
      if (index > -1) children.splice(index, 1);

      // Auto-restart if not exiting
      if (!isExiting) {
        console.log(`${service.color}[${service.name}]${colors.reset} ${colors.yellow}Reiniciando em 2 segundos...${colors.reset}`);
        setTimeout(() => {
          if (!isExiting) startService(service);
        }, 2000);
      }
    });
    
    child.on('error', err => {
      console.error(`${colors.red}[${service.name}] ERRO: ${err.message}${colors.reset}`);
    });
  }

  services.forEach(service => startService(service));

  // Handle graceful shutdown on Ctrl+C (SIGINT)
  const cleanup = () => {
    if (isExiting) return;
    isExiting = true;
    console.log(`\n${colors.bright}${colors.yellow}Parando todos os serviços graciosamente...${colors.reset}`);
    children.forEach(({ child, name }) => {
      try {
        if (child.pid) {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', child.pid, '/f', '/t'], { stdio: 'ignore' });
          } else {
            child.kill('SIGINT');
          }
        }
      } catch (e) {
        // Ignore termination errors
      }
    });
    setTimeout(() => process.exit(0), 1000);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
}

main().catch(console.error);
