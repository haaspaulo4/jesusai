
const canvas = document.getElementById('zeus');
const ctx = canvas.getContext('2d');
const W = 400, H = 400;
const CX = W / 2, CY = H / 2 - 10;

// Estados cognitivos do Pet com cores baseadas nas emoções
const STATES = {
  idle:      { cloudColor: [60, 40, 80],  eyeColor: '#fff', mouthOpen: 0.3, pulseSpeed: 0.015 },
  listening: { cloudColor: [40, 60, 90],  eyeColor: '#aff', mouthOpen: 0.5, pulseSpeed: 0.025 },
  thinking:  { cloudColor: [80, 50, 20],  eyeColor: '#ffa', mouthOpen: 0.1, pulseSpeed: 0.04 },
  speaking:  { cloudColor: [70, 30, 90],  eyeColor: '#fff', mouthOpen: 0.8, pulseSpeed: 0.035 },
  // Estados emocionais adicionais
  excited:   { cloudColor: [100, 30, 100], eyeColor: '#ffb', mouthOpen: 0.9, pulseSpeed: 0.05 },
  frustrated:{ cloudColor: [110, 20, 20],  eyeColor: '#f77', mouthOpen: 0.2, pulseSpeed: 0.045 },
  curious:   { cloudColor: [20, 90, 70],  eyeColor: '#dfd', mouthOpen: 0.4, pulseSpeed: 0.02 }
};
let currentState = 'idle';
let t = 0;

// Definição dos blocos de nuvens (Zeus Cloud Body)
const puffs = [
  { x: 0, y: -25, r: 65 },
  { x: -50, y: -10, r: 55 },
  { x: 50, y: -10, r: 55 },
  { x: -65, y: 25, r: 50 },
  { x: 65, y: 25, r: 50 },
  { x: -40, y: 45, r: 45 },
  { x: 40, y: 45, r: 45 },
  { x: 0, y: 50, r: 50 },
  { x: -25, y: -35, r: 45 },
  { x: 25, y: -35, r: 45 },
  { x: 0, y: 15, r: 60 }
];

let lightnings = [];
let lightningTimer = 0;

function createLightning() {
  const side = Math.random() > 0.5 ? 1 : -1;
  const startX = CX + side * (50 + Math.random() * 40);
  const startY = CY + 40 + Math.random() * 20;
  const segments = [];
  let x = startX, y = startY;
  const numSegs = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < numSegs; i++) {
    const nx = x + (Math.random() - 0.5) * 30;
    const ny = y + 15 + Math.random() * 20;
    segments.push({ x1: x, y1: y, x2: nx, y2: ny });
    x = nx; y = ny;
  }
  return { segments, life: 1.0, maxLife: 1.0, color: Math.random() > 0.3 ? '#c084fc' : '#00e4ff' };
}

function drawCloud(pulse) {
  const st = STATES[currentState] || STATES.idle;
  const [cr, cg, cb] = st.cloudColor;

  const glow = ctx.createRadialGradient(CX, CY + 10, 30, CX, CY + 10, 130);
  glow.addColorStop(0, `rgba(${cr+40}, ${cg+20}, ${cb+60}, ${0.2 * pulse})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.save();

  // Sombra sob a nuvem
  ctx.beginPath();
  ctx.ellipse(CX, CY + 85, 70, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * pulse})`;
  ctx.fill();

  // Puffs de nuvem com wobble orgânico
  for (const p of puffs) {
    const wobbleX = Math.sin(t * 0.02 + p.x * 0.1) * 3;
    const wobbleY = Math.cos(t * 0.025 + p.y * 0.1) * 2;
    const wobbleR = Math.sin(t * 0.03 + p.r) * 3;

    const px = CX + p.x + wobbleX;
    const py = CY + p.y + wobbleY;
    const pr = p.r + wobbleR;

    const grad = ctx.createRadialGradient(px - pr * 0.2, py - pr * 0.3, 0, px, py, pr);
    grad.addColorStop(0, `rgba(${cr+30}, ${cg+20}, ${cb+40}, ${0.95 * pulse})`);
    grad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${0.9 * pulse})`);
    grad.addColorStop(1, `rgba(${Math.floor(cr*0.5)}, ${Math.floor(cg*0.4)}, ${Math.floor(cb*0.6)}, ${0.7 * pulse})`);

    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Brilho interno
  const highlight = ctx.createRadialGradient(CX - 20, CY - 30, 0, CX, CY - 10, 80);
  highlight.addColorStop(0, `rgba(${cr+80}, ${cg+60}, ${cb+100}, ${0.15 * pulse})`);
  highlight.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = highlight;
  ctx.fillRect(CX - 100, CY - 80, 200, 100);

  ctx.restore();
}

function drawFace(pulse) {
  const st = STATES[currentState] || STATES.idle;
  const eyeY = CY + 5;
  const mouthY = CY + 35;

  const blink = Math.sin(t * 0.05) > 0.97;
  const eyeSquint = currentState === 'thinking' ? 0.5 : 1.0;

  // Olhos
  const eyeSpacing = 28;
  const eyeW = 14;
  const eyeH = blink ? 2 : 11 * eyeSquint;

  // Olho Esquerdo
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(CX - eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
  ctx.fillStyle = st.eyeColor;
  ctx.shadowColor = st.eyeColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();

  if (!blink) {
    ctx.beginPath();
    ctx.ellipse(CX - eyeSpacing + 2, eyeY + 1, 6, 5 * eyeSquint, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0a2e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CX - eyeSpacing - 1, eyeY - 2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Olho Direito
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(CX + eyeSpacing, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
  ctx.fillStyle = st.eyeColor;
  ctx.shadowColor = st.eyeColor;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();

  if (!blink) {
    ctx.beginPath();
    ctx.ellipse(CX + eyeSpacing + 2, eyeY + 1, 6, 5 * eyeSquint, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0a2e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CX + eyeSpacing - 1, eyeY - 2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Sobrancelhas de Zeus
  ctx.strokeStyle = `rgba(30, 10, 50, ${0.8 * pulse})`;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(CX - eyeSpacing - 16, eyeY - 16);
  ctx.quadraticCurveTo(CX - eyeSpacing, eyeY - 20, CX - eyeSpacing + 10, eyeY - 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(CX + eyeSpacing + 16, eyeY - 16);
  ctx.quadraticCurveTo(CX + eyeSpacing, eyeY - 20, CX + eyeSpacing - 10, eyeY - 14);
  ctx.stroke();

  // Boca
  const mouthW = 30 + st.mouthOpen * 10;
  const mouthH = 5 + st.mouthOpen * 18;
  const mouthWobble = Math.sin(t * 0.04) * 2;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(CX, mouthY + mouthWobble, mouthW, mouthH, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1a0a2e';
  ctx.fill();

  if (mouthH > 8) {
    ctx.fillStyle = '#fff';
    const teethCount = 6;
    const teethW = (mouthW * 1.6) / teethCount;
    for (let i = 0; i < teethCount; i++) {
      const tx = CX - mouthW * 0.8 + i * teethW + teethW * 0.15;
      const ty = mouthY + mouthWobble - mouthH * 0.7;
      ctx.fillRect(tx, ty, teethW * 0.7, mouthH * 0.4);
    }
  }
  ctx.restore();
}

function drawLightning() {
  lightningTimer++;
  const spawnRate = currentState === 'speaking' ? 8 : currentState === 'thinking' ? 12 : 25;
  if (lightningTimer % spawnRate === 0) {
    lightnings.push(createLightning());
  }

  for (let i = lightnings.length - 1; i >= 0; i--) {
    const l = lightnings[i];
    l.life -= 0.06;
    if (l.life <= 0) { lightnings.splice(i, 1); continue; }

    ctx.save();
    ctx.globalAlpha = l.life;
    ctx.strokeStyle = l.color;
    ctx.shadowColor = l.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2 + l.life * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (const s of l.segments) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = l.life * 0.5;
    ctx.beginPath();
    for (const s of l.segments) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();

    ctx.restore();
  }
}

// Centelhas elétricas
const sparks = [];
for (let i = 0; i < 12; i++) {
  sparks.push({
    angle: Math.random() * Math.PI * 2,
    dist: 70 + Math.random() * 30,
    speed: 0.01 + Math.random() * 0.02,
    size: 1 + Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
  });
}

function drawSparks(pulse) {
  for (const s of sparks) {
    s.angle += s.speed;
    const wobble = Math.sin(t * 0.04 + s.phase) * 8;
    const px = CX + Math.cos(s.angle) * (s.dist + wobble);
    const py = CY + 15 + Math.sin(s.angle) * (s.dist * 0.6 + wobble);
    const alpha = (0.3 + 0.6 * Math.sin(t * 0.05 + s.phase)) * pulse;

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, s.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(192, 132, 252, ${alpha})`;
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
  }
}

function draw() {
  t++;
  const st = STATES[currentState] || STATES.idle;
  const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * st.pulseSpeed * Math.PI * 2));

  ctx.clearRect(0, 0, W, H);

  drawLightning();
  drawSparks(pulse);
  drawCloud(pulse);
  drawFace(pulse);

  requestAnimationFrame(draw);
}

draw();

// === Estado de Persona Dinâmico ===
let currentPersonaId = 'jesus';
let currentPersonaName = 'Companion';
let currentVoice = 'pm_alex';
let currentLang = 'pt-BR';
let currentWelcomeTitle = 'Companion Classic';
let currentWelcomeBody = 'Às suas ordens. Em que posso ajudar?';
let currentAccentColor = '#c084fc';

// Helper para converter Hex para RGB para a variável --accent-rgb
function hexToRgb(hex) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function updateThemeColor(hexColor) {
  const rgb = hexToRgb(hexColor);
  if (rgb) {
    document.documentElement.style.setProperty('--accent-color', hexColor);
    document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }
}

// === Status polling inicial via Bridge Electron ===
const tooltip = document.getElementById('tooltip');

async function pollStatus() {
  try {
    const res = await fetch('http://localhost:3000/api/pet/status');
    if (res.ok) {
      const data = await res.json();
      currentPersonaId = data.personaId;
      currentPersonaName = data.name;
      currentVoice = data.ttsVoice;
      currentLang = data.ttsLang === 'p' ? 'pt-BR' : (data.ttsLang === 'e' ? 'en-US' : (data.ttsLang === 's' ? 'es-ES' : 'pt-BR'));
      currentWelcomeTitle = data.welcomeTitle;
      currentWelcomeBody = data.welcomeBody;
      currentAccentColor = data.accentColor || '#c084fc';

      // Atualiza textos na interface
      const headerTitle = document.querySelector('#chat-header h3');
      if (headerTitle) {
        headerTitle.textContent = `${currentPersonaName.toUpperCase()} CLASSIC CO-COMPANION`;
      }
      
      const welcomeMsg = document.getElementById('chat-welcome-msg');
      if (welcomeMsg && welcomeMsg.textContent === 'Às suas ordens. Em que posso ajudar?' && currentWelcomeBody) {
        welcomeMsg.textContent = currentWelcomeBody;
      }

      const micBtn = document.getElementById('mic-btn');
      if (micBtn) {
        micBtn.setAttribute('title', `Ativar ${currentPersonaName} (Voz + Cowork)`);
      }

      const chatToggle = document.getElementById('chat-toggle-btn');
      if (chatToggle) {
        chatToggle.setAttribute('title', `Abrir Chat Box com ${currentPersonaName}`);
      }

      if (currentState === 'idle') {
        tooltip.textContent = `${currentPersonaName} — Online`;
      }

      updateThemeColor(currentAccentColor);
    } else {
      if (window.jarvis) {
        const result = await window.jarvis.getStatus();
        if (result && result.online) {
          tooltip.textContent = `${currentPersonaName} — Sincronia Local`;
        } else {
          currentState = 'idle';
          tooltip.textContent = `${currentPersonaName} — Offline`;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching pet status:', err);
    currentState = 'idle';
    tooltip.textContent = `${currentPersonaName} — Offline`;
  }
}

pollStatus();
setInterval(pollStatus, 15000);

// === CONEXÃO SOCKET.IO COM O SERVER DO JESUS.AI ===
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('[Socket] Conectado ao servidor do JesusAI');
  tooltip.textContent = `${currentPersonaName} — Sincronia Realtime Ativa`;
  pollStatus();
});

socket.on('disconnect', () => {
  console.warn('[Socket] Desconectado');
  currentState = 'idle';
  tooltip.textContent = `${currentPersonaName} — Desconectado`;
});

// Ouvintes de eventos cognitivos ao vivo do Jesus.AI!
socket.on('agent_thinking', (data) => {
  currentState = 'thinking';
  tooltip.textContent = `${currentPersonaName} — Processando...`;
});

socket.on('agent_speaking', (data) => {
  currentState = 'speaking';
  tooltip.textContent = `${currentPersonaName} — Falando...`;
});

socket.on('new_message', (data) => {
  if (data.sender === 'bot') {
    currentState = 'speaking';
    setTimeout(() => { if (currentState === 'speaking') currentState = 'idle'; }, 3000);
  }
});

// Eventos de Gamificação (XP e Badges) ao vivo!
socket.on('xp_update', (data) => {
  tooltip.textContent = `XP +${data.amount}! ${data.reason || ''}`;
  currentState = 'excited';
  setTimeout(() => { currentState = 'idle'; }, 4000);
});

socket.on('badge_earned', (data) => {
  tooltip.textContent = `🏆 BADGE GANHA: ${data.name || 'Conquistador'}`;
  currentState = 'excited';
  lightnings.push(createLightning());
  setTimeout(() => { currentState = 'idle'; }, 5000);
});

// Reação baseada na Análise Emocional (Cognitive State)
socket.on('cognitive_state', (state) => {
  const emotion = state?.emotion || 'neutral';
  console.log(`[Cognitive State] Emoção detectada no pet: ${emotion}`);
  
  if (emotion === 'frustrated' || emotion === 'angry') {
    currentState = 'frustrated';
    tooltip.textContent = `${currentPersonaName} — Tensão detectada...`;
  } else if (emotion === 'happy' || emotion === 'excited') {
    currentState = 'excited';
    tooltip.textContent = `${currentPersonaName} — Sinergia positiva!`;
  } else if (emotion === 'curious') {
    currentState = 'curious';
    tooltip.textContent = `${currentPersonaName} — Investigando tema...`;
  }
  
  setTimeout(() => { if (currentState === 'frustrated' || currentState === 'excited' || currentState === 'curious') currentState = 'idle'; }, 5000);
});



// === BOTÃO DO MIC — STT & Audio Recording ===
const micBtn = document.getElementById('mic-btn');
let micActive = false;
let mediaRecorder = null;
let audioChunks = [];

micBtn.addEventListener('mousedown', (e) => e.stopPropagation());
micBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  
  if (!micActive) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        currentState = 'thinking';
        tooltip.textContent = `${currentPersonaName} — Processando voz...`;
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'pet_voice.webm');
        
        try {
          const res = await fetch('http://localhost:3000/api/pet/stt', {
            method: 'POST',
            body: formData
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.text && data.text.trim()) {
              chatInput.value = data.text;
              
              if (!chatOpen) {
                chatOpen = true;
                chatToggleBtn.classList.add('active');
                chatBox.classList.add('open');
                if (window.jarvis && typeof window.jarvis.toggleChat === 'function') {
                  window.jarvis.toggleChat(chatOpen);
                }
              }
              
              sendChatMessage();
            } else {
              currentState = 'idle';
              tooltip.textContent = `${currentPersonaName} — Não entendi o áudio.`;
              setTimeout(() => { tooltip.textContent = `${currentPersonaName} — Online`; }, 3000);
            }
          }
        } catch (err) {
          console.error('[Pet STT] Erro:', err);
          currentState = 'frustrated';
          tooltip.textContent = `${currentPersonaName} — Falha no STT.`;
          setTimeout(() => { currentState = 'idle'; }, 3000);
        }
      };
      
      mediaRecorder.start();
      micActive = true;
      micBtn.classList.add('active');
      micBtn.querySelector('svg').setAttribute('stroke', '#0f0');
      currentState = 'listening';
      tooltip.textContent = `${currentPersonaName} — Escutando...`;
      
    } catch (err) {
      console.error('[Pet Mic] Acesso negado:', err);
      tooltip.textContent = `Microfone bloqueado/indisponível`;
      setTimeout(() => { tooltip.textContent = `${currentPersonaName} — Online`; }, 3000);
    }
  } else {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    micActive = false;
    micBtn.classList.remove('active');
    micBtn.querySelector('svg').setAttribute('stroke', 'var(--accent-color)');
  }
});

// === CONTROLE DO CHAT HOLOGRÁFICO ===
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatMessages = document.getElementById('chat-messages');

let chatOpen = false;
let currentAudio = null;

chatBox.addEventListener('mousedown', (e) => e.stopPropagation());
chatToggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());

chatToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  chatOpen = !chatOpen;
  chatToggleBtn.classList.toggle('active', chatOpen);
  chatBox.classList.toggle('open', chatOpen);
  
  if (chatOpen) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
    setTimeout(() => chatInput.focus(), 150);
  }
  
  if (window.jarvis && typeof window.jarvis.toggleChat === 'function') {
    window.jarvis.toggleChat(chatOpen);
  }
});

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'msg user';
  userMsgDiv.textContent = text;
  chatMessages.appendChild(userMsgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  chatInput.value = '';

  currentState = 'thinking';
  tooltip.textContent = `${currentPersonaName} — Processando...`;

  try {
    const chatRes = await fetch('http://localhost:3000/api/pet/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        personaId: currentPersonaId,
        language: currentLang
      })
    });

    if (!chatRes.ok) {
      throw new Error(`HTTP ${chatRes.status}`);
    }

    const chatData = await chatRes.json();
    const responseText = chatData.response;

    const jarvisMsgDiv = document.createElement('div');
    jarvisMsgDiv.className = `msg jarvis`;
    jarvisMsgDiv.textContent = responseText;
    chatMessages.appendChild(jarvisMsgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (chatData.personaId) currentPersonaId = chatData.personaId;
    if (chatData.personaName) {
      currentPersonaName = chatData.personaName;
      const headerTitle = document.querySelector('#chat-header h3');
      if (headerTitle) {
        headerTitle.textContent = `${currentPersonaName.toUpperCase()} CLASSIC CO-COMPANION`;
      }
    }

    const voice = chatData.ttsVoice || currentVoice;
    const lang = chatData.ttsLang || chatData.language || currentLang;

    currentState = 'speaking';
    tooltip.textContent = `${currentPersonaName} — Falando...`;

    const ttsRes = await fetch('http://localhost:3000/api/pet/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: responseText,
        voice: voice,
        lang: lang
      })
    });

    if (ttsRes.ok) {
      const audioBlob = await ttsRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;

      audio.onplay = () => {
        currentState = 'speaking';
        tooltip.textContent = `${currentPersonaName} — Transmitindo áudio...`;
      };

      audio.onended = () => {
        currentState = 'idle';
        tooltip.textContent = `${currentPersonaName} — Pronto, Senhor.`;
        currentAudio = null;
      };

      audio.onerror = () => {
        currentState = 'idle';
        tooltip.textContent = `${currentPersonaName} — Sincronia Realtime`;
        currentAudio = null;
      };

      await audio.play();
    } else {
      console.warn('[Pet] Falha no TTS, degradando para resposta silenciosa');
      currentState = 'idle';
      tooltip.textContent = `${currentPersonaName} — Pronto, Senhor.`;
    }

  } catch (err) {
    console.error('[Pet] Erro de rede ou chat:', err);
    currentState = 'frustrated';
    tooltip.textContent = `${currentPersonaName} — Erro de comunicação`;

    const errDiv = document.createElement('div');
    errDiv.className = 'msg jarvis';
    errDiv.style.color = '#f87171';
    errDiv.style.border = '1px solid rgba(248, 113, 113, 0.4)';
    errDiv.textContent = `Desculpe, Senhor. Não consegui conectar com meus sistemas centrais.`;
    chatMessages.appendChild(errDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    setTimeout(() => {
      if (currentState === 'frustrated') {
        currentState = 'idle';
        tooltip.textContent = `${currentPersonaName} — Online`;
      }
    }, 5000);
  }
}

// === DRAG & DROP via Electron Bridge ===
let isDragging = false;
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
    if (window.jarvis) window.jarvis.startDrag(e.screenX, e.screenY);
  }
});
document.addEventListener('mousemove', (e) => {
  if (isDragging && window.jarvis) window.jarvis.onDrag(e.screenX, e.screenY);
});
document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    canvas.style.cursor = 'grab';
    if (window.jarvis) window.jarvis.stopDrag();
  }
});

// Double click -> abre cockpit
canvas.addEventListener('dblclick', () => {
  if (window.jarvis) window.jarvis.openCockpit();
});

// Right click -> abre menu
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (window.jarvis) window.jarvis.showMenu();
});
