/**
 * MetaPersona.AI - Cockpit Dashboard Script
 */

// --- State ---
const state = {
  sessionId: 'cockpit_admin_session',
  currentPersonaId: 'meta-persona',
  language: 'pt-BR',
  isListening: false
};

// --- DOM Elements ---
const DOM = {
  tabs: document.querySelectorAll('.nav-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  terminalOutput: document.getElementById('terminal-output'),
  cpuUsage: document.getElementById('cpu-usage'),
  ramValue: document.getElementById('ram-value'),
  sysUptime: document.getElementById('sys-uptime'),
  apiStatus: document.getElementById('bar-api-status'),
  clock: document.getElementById('clock'),
  personasList: document.getElementById('personas-list'),
  headerPersonaName: document.getElementById('header-persona-name'),
  obsidianNotes: document.getElementById('obsidian-notes'),
  obsidianStatus: document.getElementById('obsidian-status'),
  
  // Modals
  btnIngest: document.getElementById('btn-ingest'),
  ingestModal: document.getElementById('ingest-modal'),
  ingestClose: document.getElementById('ingest-close'),
  ingestCancel: document.getElementById('ingest-cancel'),
  ingestSubmit: document.getElementById('ingest-submit'),
  ingestTabs: document.querySelectorAll('#ingest-modal .tab'),
  ingestPanels: document.querySelectorAll('#ingest-modal .tab-panel'),
  
  btnBrain: document.getElementById('btn-brain'),
  brainModal: document.getElementById('brain-modal'),
  brainClose: document.getElementById('brain-close')
};

// --- Initialization ---
function init() {
  setupEventListeners();
  startPolling();
  loadPersonas();
  loadObsidianStats();
  appendTerminal('[system] Sistema MetaPersona inicializado e pronto.', 'system-line');
}

// --- Event Listeners ---
function setupEventListeners() {
  // Tab Navigation
  DOM.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.tabs.forEach(t => t.classList.remove('active'));
      DOM.tabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Chat Input
  if (DOM.chatInput && DOM.sendBtn) {
    DOM.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
    DOM.sendBtn.addEventListener('click', handleSend);
  }

  // Modals
  if (DOM.btnIngest) DOM.btnIngest.addEventListener('click', () => DOM.ingestModal.classList.add('show'));
  if (DOM.ingestClose) DOM.ingestClose.addEventListener('click', () => DOM.ingestModal.classList.remove('show'));
  if (DOM.ingestCancel) DOM.ingestCancel.addEventListener('click', () => DOM.ingestModal.classList.remove('show'));
  
  if (DOM.btnBrain) DOM.btnBrain.addEventListener('click', () => DOM.brainModal.classList.add('show'));
  if (DOM.brainClose) DOM.brainClose.addEventListener('click', () => DOM.brainModal.classList.remove('show'));

  // Ingest Tabs
  DOM.ingestTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.ingestTabs.forEach(t => t.classList.remove('active'));
      DOM.ingestPanels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });

  // Ingest Submit
  if (DOM.ingestSubmit) {
    DOM.ingestSubmit.addEventListener('click', handleIngest);
  }
}

// --- Chat & Terminal Logic ---
async function handleSend() {
  const text = DOM.chatInput.value.trim();
  if (!text) return;

  DOM.chatInput.value = '';
  appendTerminal(text, 'user-line');
  
  // Set thinking state
  const emotion = document.getElementById('cog-emotion');
  if (emotion) emotion.innerText = 'Pensando...';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        sessionId: state.sessionId,
        language: state.language,
        source: 'cockpit',
        personaId: state.currentPersonaId
      })
    });
    
    if (!res.ok) throw new Error('Falha na resposta da API');
    
    const data = await res.json();
    
    // Convert markdown to HTML if marked is available
    let output = data.response || '';
    if (typeof marked !== 'undefined') {
      output = marked.parse(output);
    }
    
    appendTerminal(output, 'jarvis-line', true);
    
    // Update Persona Info if changed
    if (data.personaId) state.currentPersonaId = data.personaId;
    if (data.personaName) {
      if (DOM.headerPersonaName) DOM.headerPersonaName.innerText = data.personaName;
      updateActivePersonaUI(data.personaId);
    }

    if (emotion) emotion.innerText = 'Neutral';

    // Play TTS if configured
    const voiceEnabled = document.getElementById('config-voice')?.checked;
    if (voiceEnabled && data.response) {
      playTTS(data.response, data.ttsVoice || 'pm_alex', data.ttsLang || 'pt-BR');
    }

  } catch (err) {
    appendTerminal(`[Erro] ${err.message}`, 'error-line');
    if (emotion) emotion.innerText = 'Erro';
  }
}

function appendTerminal(htmlContent, lineClass, isHtml = false) {
  if (!DOM.terminalOutput) return;

  const line = document.createElement('div');
  line.className = `terminal-line ${lineClass}`;

  const ts = document.createElement('span');
  ts.className = 'ts';
  const now = new Date();
  ts.innerText = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}]`;

  const msg = document.createElement('span');
  msg.className = 'msg';
  
  if (isHtml) {
    msg.innerHTML = htmlContent;
  } else {
    msg.innerText = htmlContent;
  }

  line.appendChild(ts);
  line.appendChild(msg);
  DOM.terminalOutput.appendChild(line);
  
  // Auto-scroll
  DOM.terminalOutput.scrollTop = DOM.terminalOutput.scrollHeight;
  
  // Apply syntax highlighting
  if (typeof hljs !== 'undefined') {
    line.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
  }
}

// --- Data Fetching ---
async function loadPersonas() {
  try {
    const res = await fetch('/api/admin/personas'); // Adjust endpoint if needed
    if (!res.ok) {
       // Fallback mock if API doesn't exist for cockpit
       renderPersonas([{ id: 'meta-persona', name: 'Meta-Persona' }, { id: 'jesus', name: 'Jesus Cristo' }]);
       return;
    }
    const data = await res.json();
    renderPersonas(data);
  } catch (err) {
    DOM.personasList.innerHTML = `<div class="error-text">Erro ao carregar personas.</div>`;
  }
}

function renderPersonas(personas) {
  if (!DOM.personasList) return;
  DOM.personasList.innerHTML = '';
  
  personas.forEach(p => {
    const el = document.createElement('div');
    el.className = `persona-item ${p.id === state.currentPersonaId ? 'active' : ''}`;
    el.dataset.id = p.id;
    el.innerHTML = `
      <div class="dot"></div>
      <div class="persona-item-name">${p.name}</div>
    `;
    
    el.addEventListener('click', () => {
       state.currentPersonaId = p.id;
       DOM.headerPersonaName.innerText = p.name;
       updateActivePersonaUI(p.id);
       appendTerminal(`[system] Persona alterada para: ${p.name}`, 'system-line');
    });
    
    DOM.personasList.appendChild(el);
  });
}

function updateActivePersonaUI(id) {
  document.querySelectorAll('.persona-item').forEach(el => {
    if (el.dataset.id === id) el.classList.add('active');
    else el.classList.remove('active');
  });
}

async function loadObsidianStats() {
  if (!DOM.obsidianNotes) return;
  try {
    const res = await fetch('/api/obsidian/stats');
    if (res.ok) {
      const data = await res.json();
      DOM.obsidianNotes.innerText = data.total_files || data.notes_count || '--';
      DOM.obsidianStatus.innerText = 'Online';
      DOM.obsidianStatus.style.color = 'var(--success)';
    } else {
      DOM.obsidianStatus.innerText = 'Offline';
    }
  } catch(e) {
    DOM.obsidianStatus.innerText = 'Offline';
  }
}

async function handleIngest() {
  const statusEl = document.getElementById('ingest-status');
  statusEl.innerText = 'Enviando...';
  
  try {
    const text = document.getElementById('ingest-text-input').value;
    if (!text) throw new Error("Texto vazio");
    
    const res = await fetch('/api/obsidian/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    });
    
    if (res.ok) {
      statusEl.innerText = 'Ingestão concluída com sucesso!';
      statusEl.style.color = 'var(--success)';
      document.getElementById('ingest-text-input').value = '';
      loadObsidianStats();
      setTimeout(() => DOM.ingestModal.classList.remove('show'), 2000);
    } else {
      throw new Error("Falha no servidor");
    }
  } catch(e) {
    statusEl.innerText = `Erro: ${e.message}`;
    statusEl.style.color = 'var(--danger)';
  }
}

// --- Polling (Health & Stats) ---
function startPolling() {
  setInterval(updateClock, 1000);
  setInterval(updateSystemStats, 5000);
  setInterval(updateHealth, 10000);
  
  updateClock();
  updateSystemStats();
  updateHealth();
}

function updateClock() {
  if (!DOM.clock) return;
  const now = new Date();
  DOM.clock.innerText = now.toLocaleTimeString('pt-BR', { hour12: false });
}

async function updateSystemStats() {
  try {
    const res = await fetch('/api/system-stats', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (DOM.cpuUsage) DOM.cpuUsage.innerText = `${Math.round(data.cpu || 0)}%`;
      if (DOM.ramValue) DOM.ramValue.innerText = `${Math.round(data.ram_percent || 0)}%`;
      if (DOM.sysUptime && data.uptime) {
         const h = Math.floor(data.uptime / 3600);
         const m = Math.floor((data.uptime % 3600) / 60);
         DOM.sysUptime.innerText = `${h}h ${m}m`;
      }
    }
  } catch(e) {
    // ignore polling errors to not flood console
  }
}

async function updateHealth() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    if (DOM.apiStatus) {
       DOM.apiStatus.innerText = res.ok ? 'ONLINE' : 'ERROR';
       DOM.apiStatus.style.color = res.ok ? 'var(--success)' : 'var(--danger)';
       document.querySelector('.api-dot').style.backgroundColor = res.ok ? 'var(--success)' : 'var(--danger)';
    }
  } catch(e) {
    if (DOM.apiStatus) {
       DOM.apiStatus.innerText = 'OFFLINE';
       DOM.apiStatus.style.color = 'var(--danger)';
       document.querySelector('.api-dot').style.backgroundColor = 'var(--danger)';
    }
  }
}

// --- TTS Placeholder ---
async function playTTS(text, voice, lang) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, language: lang })
    });
    
    if (res.ok) {
      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.play();
    }
  } catch (err) {
    console.error("TTS Error:", err);
  }
}

// --- Start ---
document.addEventListener('DOMContentLoaded', init);
