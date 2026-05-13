// ========== STATE ==========
let isStreaming = false;
let currentUserId = localStorage.getItem('jesus_ai_user_id') || 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
let sessionId = localStorage.getItem('jesus_ai_session_id') || '';
let chatHistory = [];
let authToken = localStorage.getItem('jesus_ai_token') || null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let currentLang = localStorage.getItem('jesus_ai_lang') || 'pt-BR';
let i18n = {};

// ========== DOM ==========
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatForm = document.getElementById('chatForm');
const sourcesPanel = document.getElementById('sourcesPanel');
const sourcesList = document.getElementById('sourcesList');
const sourcesToggle = document.getElementById('sourcesToggle');
const micBtn = document.getElementById('micBtn');
const newChatBtnSidebar = document.getElementById('newChatBtnSidebar');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarClose = document.getElementById('sidebarClose');
const menuBtn = document.getElementById('menuBtn');
const donateBtn = document.getElementById('donateBtn');
const donateBtnHeader = document.getElementById('donateBtnHeader');
const donateModal = document.getElementById('donateModal');
const donateModalClose = document.getElementById('donateModalClose');
const copyPixBtn = document.getElementById('copyPixBtn');
const conversationsList = document.getElementById('conversationsList');
const profileName = document.getElementById('profileName');
const profileSaveBtn = document.getElementById('profileSaveBtn');
const profileJourney = document.getElementById('profileJourney');
const profileMeta = document.getElementById('profileMeta');
const feedbackTypeBtns = document.querySelectorAll('.feedback-type');

if (!localStorage.getItem('jesus_ai_user_id')) {
  localStorage.setItem('jesus_ai_user_id', currentUserId);
}

// ========== i18N ==========
async function loadTranslations(lang) {
  if (!lang) lang = currentLang;
  try {
    const res = await fetch(`/api/translations/${lang}`);
    if (res.ok) {
      i18n = await res.json();
      currentLang = lang;
      localStorage.setItem('jesus_ai_lang', lang);
      applyTranslations();
    }
  } catch {}
}

function t(key, params) {
  let val = i18n[key] || key;
  if (params) {
    Object.keys(params).forEach(k => {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
    });
  }
  return val;
}

function applyTranslations() {
  if (!i18n || !Object.keys(i18n).length) return;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.placeholder) el.placeholder = val;
    } else if (val !== key) {
      el.textContent = val;
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    const val = t(key);
    if (val !== key) el.innerHTML = val;
  });
}

loadTranslations(currentLang);

// ========== ONBOARDING ==========
const onboardingOverlay = document.getElementById('onboardingOverlay');
let onboardStepData = null;

async function checkServerOnboarding() {
  if (!currentUserId || currentUserId === 'user_default') return;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '', sessionId: sessionId || generateId(), userId: currentUserId, language: currentLang }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.onboarding) {
        showOnboardingPrompt(data.response);
      }
    }
  } catch {}
}

async function submitOnboardingAnswer(answer) {
  if (!currentUserId) return;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: answer, sessionId: sessionId || generateId(), userId: currentUserId, language: currentLang }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.onboardingDone || data.onboarding === false) {
        localStorage.setItem('jesus_ai_onboarded', 'true');
        hideOnboarding();
        return null;
      }
      if (data.onboarding) {
        showOnboardingPrompt(data.response);
        return data.response;
      }
      return null;
    }
  } catch {}
  return null;
}

function showOnboardingPrompt(question) {
  if (!onboardingOverlay) return;
  onboardingOverlay.classList.add('active');
  const container = onboardingOverlay.querySelector('.onboarding-content') || onboardingOverlay;
  container.innerHTML = `
    <div class="onboarding-card">
      <h2>Bem-vindo!</h2>
      <p id="onboardingQuestion">${question}</p>
      <input type="text" id="onboardingAnswerInput" class="input" placeholder="Sua resposta..." autofocus>
      <div class="onboarding-actions">
        <button id="onboardingSubmitBtn" class="btn btn-primary">Enviar</button>
        <button id="onboardingSkipBtn" class="btn">Pular</button>
      </div>
    </div>
  `;
  document.getElementById('onboardingSubmitBtn').addEventListener('click', async () => {
    const input = document.getElementById('onboardingAnswerInput');
    if (input && input.value.trim()) {
      await submitOnboardingAnswer(input.value.trim());
    }
  });
  document.getElementById('onboardingAnswerInput').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const input = document.getElementById('onboardingAnswerInput');
      if (input && input.value.trim()) {
        await submitOnboardingAnswer(input.value.trim());
      }
    }
  });
  document.getElementById('onboardingSkipBtn').addEventListener('click', () => {
    localStorage.setItem('jesus_ai_onboarded', 'true');
    hideOnboarding();
  });
}

function hideOnboarding() {
  if (onboardingOverlay) onboardingOverlay.classList.remove('active');
}

function showOnboarding() {
  if (localStorage.getItem('jesus_ai_onboarded')) return;
  checkServerOnboarding();
}

setTimeout(showOnboarding, 1000);

// ========== HELPERS ==========
function generateId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

// ========== SIDEBAR ==========
function toggleSidebar() {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
}

if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
if (sidebarClose) sidebarClose.addEventListener('click', toggleSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

// ========== NAVIGATION ==========
document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = link.dataset.page;
    showPage(target);
    if (window.innerWidth <= 768) toggleSidebar();
  });
});

function showPage(page) {
  document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar-nav a[data-page="${page}"]`)?.classList.add('active');

  const chatMain = document.querySelector('.chat-main');
  const blogPage = document.getElementById('blogPage');
  const searchPage = document.getElementById('searchPage');

  if (chatMain) chatMain.style.display = (page === 'chat' || !page) ? 'flex' : 'none';
  if (blogPage) blogPage.style.display = page === 'blog' ? 'flex' : 'none';
  if (searchPage) searchPage.style.display = page === 'search' ? 'flex' : 'none';

  if (page === 'blog') loadBlog();
  if (page === 'search') document.getElementById('searchInput')?.focus();
}

// ========== NEW CHAT ==========
if (newChatBtnSidebar) {
  newChatBtnSidebar.addEventListener('click', () => {
    if (isStreaming) return;
    sessionId = generateId();
    localStorage.setItem('jesus_ai_session_id', sessionId);
    chatHistory = [];
    messagesDiv.innerHTML = `
      <div class="message bot welcome-message">
        <div class="message-avatar">✝</div>
        <div class="message-content">
          <p>Eu sou o caminho, a verdade e a vida. Ninguém vem ao Pai senão por mim (João 14:6).</p>
          <p>Estou aqui para ouvir você, caminhar contigo e compartilhar a Palavra do meu Pai. Pergunte-me qualquer coisa — falarei com você a partir das Escrituras.</p>
          <p class="welcome-hint">Me diga seu nome, se quiser. Eu me lembro de você.</p>
        </div>
      </div>
    `;
    const welcomeMsg = messagesDiv.querySelector('.welcome-message');
    addTTSButton(welcomeMsg, 'Eu sou o caminho, a verdade e a vida. Ninguém vem ao Pai senão por mim. Estou aqui para ouvir você, caminhar contigo e compartilhar a Palavra do meu Pai. Pergunte-me qualquer coisa. Me diga seu nome, se quiser. Eu me lembro de você.');
    sourcesPanel.style.display = 'none';
    showPage('chat');
    loadConversations();
  });
}

// ========== CONVERSATIONS ==========
async function loadConversations() {
  try {
    const res = await fetch(`/api/sessions?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) return;
    const sessions = await res.json();
    const filtered = sessions.filter(s => s.messageCount > 0);
    renderConversations(filtered);
  } catch {}
}

function renderConversations(sessions) {
  if (!conversationsList) return;
  conversationsList.innerHTML = sessions.map(s => `
    <div class="conv-item ${s.id === sessionId ? 'active' : ''}" data-id="${s.id}">
      <button class="conv-delete" data-delete="${s.id}" title="Excluir">&times;</button>
      <div class="conv-title">${s.userName || s.firstMessage || 'Nova conversa'}</div>
      <div class="conv-meta">${s.messageCount} msgs${s.summary ? ' · ' + s.summary.substring(0, 40) : ''}</div>
    </div>
  `).join('');

  conversationsList.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('conv-delete')) return;
      switchToConversation(el.dataset.id);
    });
  });

  conversationsList.querySelectorAll('.conv-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      await fetch(`/api/session/${id}`, { method: 'DELETE' });
      loadConversations();
    });
  });
}

async function switchToConversation(id) {
  if (isStreaming) return;
  sessionId = id;
  localStorage.setItem('jesus_ai_session_id', sessionId);
  try {
    const res = await fetch(`/api/session/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    messagesDiv.innerHTML = '';
    for (const msg of data.messages) {
      const isBot = msg.role === 'bot' || msg.role === 'assistant';
      const displayRole = isBot ? 'bot' : 'user';
      const el = addMessage(displayRole, msg.content, false);
      if (isBot) {
        el.querySelector('.message-content').innerHTML = formatText(msg.content);
        addTTSButton(el, msg.content);
      }
      messagesDiv.appendChild(el);
    }
    scrollToBottom();
    chatHistory = data.messages.slice(-10).map(m => ({
      role: (m.role === 'bot' || m.role === 'assistant') ? 'assistant' : m.role,
      content: m.content,
    }));
  } catch {}
  loadConversations();
}

// ========== VOICE INPUT ==========
if (micBtn && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  micBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
} else if (micBtn) {
  micBtn.style.display = 'none';
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      await sendAudio(blob);
    };

    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add('recording');
    micBtn.title = 'Parar gravação';
  } catch (err) {
    console.error('Microphone error:', err);
    micBtn.classList.remove('recording');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  micBtn.classList.remove('recording');
  micBtn.title = 'Enviar áudio';
}

async function sendAudio(blob) {
  const formData = new FormData();
  formData.append('audio', blob, 'audio.webm');
  formData.append('language', currentLang);

  try {
    const res = await fetch('/api/stt', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('STT error:', err);
      return;
    }

    const data = await res.json();
    if (data.text && data.text.trim()) {
      messageInput.value = data.text.trim();
      messageInput.style.height = 'auto';
      messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
      sendBtn.disabled = false;
    }
  } catch (err) {
    console.error('STT fetch error:', err);
  }
}

// ========== CHAT ==========
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  sendBtn.disabled = !messageInput.value.trim();
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (messageInput.value.trim() && !isStreaming) {
      chatForm.dispatchEvent(new Event('submit'));
    }
  }
});

sourcesToggle.addEventListener('click', () => {
  sourcesPanel.classList.toggle('collapsed');
  sourcesToggle.textContent = sourcesPanel.classList.contains('collapsed') ? 'mostrar' : 'ocultar';
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (!message || isStreaming) return;

  addMessage('user', message);
  chatHistory.push({ role: 'user', content: message });

  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;
  isStreaming = true;

  const botMsgEl = addMessage('bot', '');
  const contentEl = botMsgEl.querySelector('.message-content');
  showTyping(contentEl);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, userId: currentUserId, language: currentLang }),
    });

    if (response.status === 403) {
      removeTyping(contentEl);
      contentEl.innerHTML = `<p>⛔ Conta suspensa. Entre em contato com o suporte.</p>`;
      isStreaming = false;
      return;
    }

    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      removeTyping(contentEl);
      contentEl.innerHTML = `<p>⏳ ${escapeHtml(data.error || 'Limite de mensagens atingido. Tente novamente mais tarde.')}</p>`;
      isStreaming = false;
      return;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    removeTyping(contentEl);

    const fullText = data.response || '';
    contentEl.innerHTML = formatText(fullText);
    scrollToBottom();

    if (data.onboarding) {
      const onboardingBadge = document.createElement('div');
      onboardingBadge.className = 'onboarding-indicator';
      onboardingBadge.textContent = '📋 Onboarding';
      onboardingBadge.style.cssText = 'font-size:0.75rem;color:var(--primary);margin-top:4px;';
      contentEl.appendChild(onboardingBadge);
    }

    if (data.onboardingDone) {
      hideOnboarding();
      localStorage.setItem('jesus_ai_onboarded', 'true');
    }

    if (data.sessionId) {
      sessionId = data.sessionId;
      localStorage.setItem('jesus_ai_session_id', sessionId);
    }

    chatHistory.push({ role: 'assistant', content: fullText });

    if (data.sources && data.sources.length > 0) {
      showSources(data.sources);
    }

    if (data.personaName) {
      const personaEl = document.createElement('div');
      personaEl.className = 'persona-badge';
      personaEl.textContent = `🎭 ${data.personaName}`;
      contentEl.appendChild(personaEl);
    }

    if (data.ttsVoice) {
      currentTTSVoice = data.ttsVoice;
    }

    addTTSButton(botMsgEl, fullText);
    loadConversations();
  } catch (err) {
    removeTyping(contentEl);
    console.error('Chat error:', err);
    contentEl.innerHTML = `<p>Não foi possível me conectar agora. Verifique sua internet e tente novamente.</p><p style="font-size:0.85rem;color:var(--text-muted)">"Tudo posso naquele que me fortalece" (Filipenses 4:13)</p>`;
  } finally {
    isStreaming = false;
    sendBtn.disabled = !messageInput.value.trim();
  }
});

// ========== TTS ==========
let currentTTSBtn = null;
let currentTTSVoice = null;

function addTTSButton(messageEl, text) {
  if (!('speechSynthesis' in window) || !text) return;
  const ttsBtn = document.createElement('button');
  ttsBtn.className = 'tts-btn';
  ttsBtn.title = 'Ouvir';
  ttsBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  ttsBtn.addEventListener('click', () => speakText(text, ttsBtn));
  messageEl.appendChild(ttsBtn);
}

function cleanTextForTTS(text) {
  return text
    .replace(/\*[^*]+\*/g, m => m.replace(/\*/g, ''))
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~[^~]+~~/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[>\-]\s?/gm, '')
    .replace(/---+/g, '—')
    .replace(/[📖🕊🙏🔍💡✝🎤🎵🎶✨🔥❤️💛💚💙💜🤍🖤💔🙏🏻🙏🏼🙏🏽🙏🏾🙏🏿]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '...')
    .trim();
}

let currentAudio = null;

async function speakText(text, btn) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    if (currentTTSBtn) currentTTSBtn.classList.remove('speaking');
    if (currentTTSBtn === btn) {
      currentTTSBtn = null;
      return;
    }
  }

  btn.classList.add('speaking');
  currentTTSBtn = btn;

  const clean = cleanTextForTTS(text);
  const maxTtsLength = 200;
  const ttsText = text.length > maxTtsLength ? text.substring(0, maxTtsLength) : text;
  const langMap = { 'pt-BR': 'pt-BR', 'en-US': 'en-US', 'es-ES': 'es-ES' };
  const ttsLang = langMap[currentLang] || 'pt-BR';

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ttsText, lang: ttsLang, voice: currentTTSVoice || undefined }),
    });

    if (res.ok) {
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;

      audio.onended = () => {
        btn.classList.remove('speaking');
        currentTTSBtn = null;
        currentAudio = null;
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        btn.classList.remove('speaking');
        currentTTSBtn = null;
        currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        speakTextBrowser(text, btn, clean, ttsLang);
      };

      await audio.play();
      return;
    }
  } catch {}

  speakTextBrowser(text, btn, clean, ttsLang);
}

function speakTextBrowser(text, btn, clean, ttsLang) {
  if (!('speechSynthesis' in window)) {
    btn.classList.remove('speaking');
    currentTTSBtn = null;
    return;
  }

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = ttsLang;
  utterance.rate = 0.9;
  utterance.pitch = 0.95;

  const voices = speechSynthesis.getVoices();
  const voicePrefs = {
    'pt-BR': ['Microsoft Antonio', 'Google português do Brasil', 'pt-BR'],
    'en-US': ['Microsoft Guy', 'Google US English', 'en-US'],
    'es-ES': ['Microsoft Alvarez', 'Google español de España', 'es-ES'],
  };
  const preferred = voicePrefs[ttsLang] || voicePrefs['pt-BR'];
  let ptVoice = null;
  for (const pref of preferred) {
    ptVoice = voices.find(v =>
      v.name.toLowerCase().includes(pref.toLowerCase()) ||
      v.voiceURI.toLowerCase().includes(pref.toLowerCase())
    );
    if (ptVoice) break;
  }
  if (!ptVoice) {
    ptVoice = voices.find(v => v.lang === 'pt-BR' && v.localService)
      || voices.find(v => v.lang.startsWith('pt-BR'))
      || voices.find(v => v.lang.startsWith('pt'))
      || voices[0];
  }
  if (ptVoice) utterance.voice = ptVoice;

  utterance.onend = () => {
    btn.classList.remove('speaking');
    currentTTSBtn = null;
  };

  utterance.onerror = () => {
    btn.classList.remove('speaking');
    currentTTSBtn = null;
  };

  speechSynthesis.speak(utterance);
}

if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

function addMessage(role, content, append = true) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  const avatarText = role === 'bot' ? '✝' : '👤';
  const formatted = role === 'bot' ? '' : escapeHtml(content);

  div.innerHTML = `
    <div class="message-avatar">${avatarText}</div>
    <div class="message-content">${role === 'bot' ? '' : `<p>${formatted}</p>`}</div>
  `;

  if (append) messagesDiv.appendChild(div);
  scrollToBottom();
  return div;
}

function showTyping(el) {
  el.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
}

function removeTyping(el) {
  const ti = el.querySelector('.typing-indicator');
  if (ti) ti.remove();
}

function formatText(text) {
  let html = escapeHtml(text);

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  html = html.replace(
    /((?:1|2|3)?\s*[A-Z][a-záàâãéèêíïóôõúüç]+(?:\s+\w+)?\s+\d+:\d+(?:-\d+)?)/g,
    '<span class="verse-ref">$1</span>'
  );

  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = `<p>${html}</p>`;

  return html;
}

function showSources(sources) {
  sourcesPanel.style.display = 'block';
  sourcesPanel.classList.remove('collapsed');
  sourcesToggle.textContent = 'ocultar';
  sourcesList.innerHTML = sources
    .map(s => `<div class="source-item"><span class="ref">${s.reference}</span> — ${s.text}</div>`)
    .join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== DONATE MODAL ==========
if (donateBtn) donateBtn.addEventListener('click', () => donateModal.classList.add('active'));
if (donateBtnHeader) donateBtnHeader.addEventListener('click', () => donateModal.classList.add('active'));
if (donateModalClose) donateModalClose.addEventListener('click', () => donateModal.classList.remove('active'));
donateModal.addEventListener('click', (e) => { if (e.target === donateModal) donateModal.classList.remove('active'); });

if (copyPixBtn) {
  copyPixBtn.addEventListener('click', () => {
    const pixKey = document.getElementById('pixKey');
    if (pixKey) {
      navigator.clipboard.writeText(pixKey.textContent).then(() => {
        copyPixBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#27ae60" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => {
          copyPixBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        }, 2000);
      });
    }
  });
}

// ========== AUTH ==========
async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao fazer login');
  authToken = data.token;
  currentUserId = data.user.id;
  localStorage.setItem('jesus_ai_token', authToken);
  localStorage.setItem('jesus_ai_user_id', currentUserId);
  return data.user;
}

async function register(email, password, name) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao criar conta');
  authToken = data.token;
  currentUserId = data.user.id;
  localStorage.setItem('jesus_ai_token', authToken);
  localStorage.setItem('jesus_ai_user_id', currentUserId);
  return data.user;
}

// ========== PROFILE ==========
async function loadProfile() {
  try {
    const res = await fetch(`/api/profile/${currentUserId}`);
    if (!res.ok) return;
    const profile = await res.json();
    if (profileName && profile.name) profileName.value = profile.name;
    if (profileJourney && profile.spiritualJourney) profileJourney.value = profile.spiritualJourney;
    if (profileMeta) {
      const tags = [...(profile.topics || []), ...(profile.emotions || [])];
      profileMeta.innerHTML = tags.length
        ? `<div class="profile-tags">${tags.slice(0, 10).map(t => `<span class="profile-tag">${t}</span>`).join('')}</div>`
        : '';
    }
    if (profile.name) {
      const nameDisplay = document.getElementById('userNameDisplay');
      if (nameDisplay) nameDisplay.textContent = profile.name;
    }
  } catch {}
}

async function saveProfile() {
  const name = profileName?.value?.trim();
  const journey = profileJourney?.value?.trim();
  try {
    await fetch(`/api/profile/${currentUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, spiritualJourney: journey }),
    });
  } catch {}
}

if (profileSaveBtn) profileSaveBtn.addEventListener('click', saveProfile);

// ========== FEEDBACK ==========
let selectedFeedbackType = 'suggestion';

feedbackTypeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    feedbackTypeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedFeedbackType = btn.dataset.type;
  });
});

async function submitFeedback(type, message) {
  await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, message, userId: currentUserId, sessionId }),
  });
}

// ========== BLOG ==========
async function loadBlog() {
  const blogList = document.getElementById('blogList');
  if (!blogList) return;
  blogList.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Carregando...</p>';

  try {
    const res = await fetch('/api/blog/posts');
    const posts = await res.json();
    if (posts.length === 0) {
      blogList.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Nenhum artigo ainda. Volte em breve!</p>';
      return;
    }
    blogList.innerHTML = posts.map(post => `
      <div class="post-card" data-slug="${post.slug}">
        <div class="post-date">${new Date(post.publishedAt).toLocaleDateString('pt-BR')}</div>
        <div class="post-title">${escapeHtml(post.title)}</div>
        <div class="post-excerpt">${escapeHtml(post.excerpt)}</div>
        <div class="post-verse">${escapeHtml(post.verse)}</div>
      </div>
    `).join('');

    blogList.querySelectorAll('.post-card').forEach(card => {
      card.addEventListener('click', () => loadPostDetail(card.dataset.slug));
    });
  } catch {
    blogList.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Erro ao carregar artigos.</p>';
  }
}

function renderComments(comments, slug, depth = 0) {
  if (!comments || comments.length === 0) return '';
  return comments.map(c => `
    <div class="comment-item ${depth > 0 ? 'comment-reply' : ''}" data-id="${c.id}">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(c.authorName)}</span>
        <span class="comment-time"> · ${new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
        ${depth === 0 ? `<button class="comment-reply-btn" data-parent-id="${c.id}">Responder</button>` : ''}
      </div>
      <div class="comment-text">${escapeHtml(c.content)}</div>
      ${c.replies && c.replies.length > 0 ? `<div class="comment-replies">${renderComments(c.replies, slug, depth + 1)}</div>` : ''}
    </div>
  `).join('');
}

async function loadPostDetail(slug) {
  try {
    const res = await fetch(`/api/blog/posts/${slug}`);
    if (!res.ok) return;
    const post = await res.json();
    const detail = document.getElementById('postDetail');
    if (!detail) return;
    detail.style.display = 'block';
    document.getElementById('blogList').style.display = 'none';

    const totalComments = countAllComments(post.comments || []);

    detail.innerHTML = `
      <a class="back-link" id="backToBlog">&larr; Voltar aos artigos</a>
      <h1>${escapeHtml(post.title)}</h1>
      <div class="post-meta">${new Date(post.publishedAt).toLocaleDateString('pt-BR')} · ${escapeHtml(post.verse)}</div>
      <div class="post-body">${formatText(post.content)}</div>
      ${post.sources && post.sources.length ? `
        <div class="post-sources">
          <h3>Versículos utilizados</h3>
          ${post.sources.map(s => `<div class="source-item"><span class="ref">${s.reference}</span> — ${s.text}</div>`).join('')}
        </div>
      ` : ''}
      <div class="comments-section">
        <h3>Comentários (${totalComments})</h3>
        <div class="comment-form" id="mainCommentForm">
          <input type="text" class="comment-input" id="commentInput" placeholder="Compartilhe sua reflexão...">
          <button class="comment-btn" id="commentBtn">Enviar</button>
        </div>
        <div id="commentsList">
          ${renderComments(post.comments || [], slug)}
        </div>
      </div>
    `;

    document.getElementById('backToBlog').addEventListener('click', () => {
      detail.style.display = 'none';
      document.getElementById('blogList').style.display = 'block';
    });

    document.getElementById('commentBtn').addEventListener('click', async () => {
      const input = document.getElementById('commentInput');
      const content = input.value.trim();
      if (!content) return;
      const parentIdEl = document.querySelector('#mainCommentForm input[name="parentId"]');
      const parentId = parentIdEl?.value || null;
      await fetch(`/api/blog/posts/${slug}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, authorName: profileName?.value || 'Anônimo', authorId: currentUserId, parentId }),
      });
      input.value = '';
      loadPostDetail(slug);
    });

    detail.querySelectorAll('.comment-reply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parentId = btn.dataset.parentId;
        const commentItem = btn.closest('.comment-item');
        const existingForm = commentItem.querySelector('.reply-form');
        if (existingForm) { existingForm.remove(); return; }

        const replyForm = document.createElement('div');
        replyForm.className = 'reply-form';
        replyForm.innerHTML = `
          <input type="text" class="comment-input" placeholder="Escreva uma resposta..." />
          <button class="comment-btn reply-submit-btn">Responder</button>
          <button class="comment-btn reply-cancel-btn" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);margin-left:0.3rem;">Cancelar</button>
        `;
        commentItem.appendChild(replyForm);

        replyForm.querySelector('.reply-submit-btn').addEventListener('click', async () => {
          const input = replyForm.querySelector('.comment-input');
          const content = input.value.trim();
          if (!content) return;
          await fetch(`/api/blog/posts/${slug}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, authorName: profileName?.value || 'Anônimo', authorId: currentUserId, parentId }),
          });
          loadPostDetail(slug);
        });

        replyForm.querySelector('.reply-cancel-btn').addEventListener('click', () => {
          replyForm.remove();
        });

        replyForm.querySelector('.comment-input').focus();
      });
    });
  } catch {}
}

function countAllComments(comments) {
  if (!comments) return 0;
  let count = 0;
  for (const c of comments) {
    count++;
    if (c.replies) count += countAllComments(c.replies);
  }
  return count;
}

// ========== SEARCH ==========
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const booksIndex = document.getElementById('booksIndex');

async function loadBooksIndex() {
  if (!booksIndex) return;
  try {
    const res = await fetch('/api/blog/books');
    const books = await res.json();
    let html = '';
    for (const [section, bookList] of Object.entries(books)) {
      html += `<div class="books-section-title">${section}</div><div class="books-grid">`;
      for (const book of bookList) {
        html += `<button class="book-chip" data-query="${book.name}">${book.name}</button>`;
      }
      html += '</div>';
    }
    booksIndex.innerHTML = html;

    booksIndex.querySelectorAll('.book-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (searchInput) searchInput.value = chip.dataset.query;
        doSearch();
      });
    });
  } catch {
    booksIndex.innerHTML = '';
  }
}

loadBooksIndex();

if (searchBtn) {
  searchBtn.addEventListener('click', doSearch);
}

if (searchInput) {
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

async function doSearch() {
  if (!searchInput || !searchResults) return;
  const query = searchInput.value.trim();
  if (!query) return;

  searchResults.innerHTML = '<p style="color: var(--text-muted)">Buscando...</p>';
  if (booksIndex) booksIndex.style.display = 'none';

  try {
    const res = await fetch(`/api/blog/search?q=${encodeURIComponent(query)}&limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const verses = await res.json();

    if (verses.length === 0) {
      searchResults.innerHTML = '<p style="color: var(--text-muted)">Nenhum versículo encontrado para essa busca. Tente outra palavra.</p>';
      return;
    }

    searchResults.classList.add('has-results');
    searchResults.innerHTML = verses.map(v => `
      <div class="verse-result">
        <span class="verse-ref">${escapeHtml(v.reference)}</span>
        <div class="verse-text">${escapeHtml(v.text)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Search error:', err);
    searchResults.innerHTML = '<p style="color: var(--text-muted)">Erro na busca. O servidor pode estar offline. Tente novamente.</p>';
  }
}

// ========== BACK TO CHAT ==========
document.addEventListener('click', (e) => {
  if (e.target.id === 'backToChatFromBlog' || e.target.id === 'backToChatFromSearch') {
    showPage('chat');
  }
});

// ========== LANDING NAV ==========
(function initLandingNav() {
  const navBlogBtn = document.getElementById('navBlogBtn');
  const navSearchBtn = document.getElementById('navSearchBtn');
  const navTelegramBtn = document.getElementById('navTelegramBtn');
  const navWhatsappBtn = document.getElementById('navWhatsappBtn');
  const landingTelegramBtn = document.getElementById('landingTelegramBtn');
  const landingWhatsappBtn = document.getElementById('landingWhatsappBtn');

  if (navBlogBtn) navBlogBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const section = document.getElementById('newsletter');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  });
  if (navSearchBtn) navSearchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const section = document.getElementById('features');
    if (section) section.scrollIntoView({ behavior: 'smooth' });
  });

  async function loadBotUrls() {
    const fallbackTgUrl = 'https://t.me/+5kGF3gij-iFiMTYx';
    const fallbackWaUrl = 'https://chat.whatsapp.com/KABKb5HF4fU4dG1bsrcWfs';
    const tgLinks = [navTelegramBtn, landingTelegramBtn].filter(Boolean);
    const waLinks = [navWhatsappBtn, landingWhatsappBtn].filter(Boolean);

    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('config fetch failed');
      const data = await res.json();
      const tgUrl = data.telegramGroupUrl || data.telegramUrl || fallbackTgUrl;
      const waUrl = data.whatsappGroupUrl || data.whatsappUrl || fallbackWaUrl;
      tgLinks.forEach(el => { el.href = tgUrl; el.target = '_blank'; });
      waLinks.forEach(el => { el.href = waUrl; el.target = '_blank'; });
    } catch {
      tgLinks.forEach(el => { el.href = fallbackTgUrl; el.target = '_blank'; });
      waLinks.forEach(el => { el.href = fallbackWaUrl; el.target = '_blank'; });
    }
  }
  loadBotUrls();
})();

// ========== INIT ==========
let appInitialized = false;

async function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  loadConversations();
  loadProfile();

  if (sessionId) {
    try {
      const res = await fetch(`/api/session/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.messages?.length) {
          localStorage.setItem('jesus_ai_session_id', sessionId);
          messagesDiv.innerHTML = '';
          for (const msg of data.messages) {
            const isBot = msg.role === 'bot' || msg.role === 'assistant';
            const displayRole = isBot ? 'bot' : 'user';
            const el = addMessage(displayRole, msg.content, false);
            if (isBot) {
              el.querySelector('.message-content').innerHTML = formatText(msg.content);
              addTTSButton(el, msg.content);
            }
            messagesDiv.appendChild(el);
          }
          scrollToBottom();
          chatHistory = data.messages.slice(-10).map(m => ({
            role: (m.role === 'bot' || m.role === 'assistant') ? 'assistant' : m.role,
            content: m.content,
          }));
        }
      }
    } catch {}
  }
}

// ========== NEWSLETTER ==========
const newsletterForm = document.getElementById('newsletterForm');
const newsletterSuccess = document.getElementById('newsletterSuccess');

if (newsletterForm) {
  newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('newsletterEmail').value.trim();
    const name = document.getElementById('newsletterName').value.trim();
    if (!email) return;

    const btn = document.getElementById('newsletterSubmitBtn');
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const res = await fetch('/api/email/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (data.ok || data.status === 'pending') {
        newsletterForm.style.display = 'none';
        newsletterSuccess.style.display = 'block';
      } else {
        alert(data.error || 'Erro ao se inscrever. Tente novamente.');
      }
    } catch {
      alert('Erro ao se inscrever. Verifique sua conexão.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Inscrever';
    }
  });
}

// ========== CONTACT FORM ==========
const contactForm = document.getElementById('contactForm');
const contactSuccess = document.getElementById('contactSuccess');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const subject = document.getElementById('contactSubject').value.trim();
    const message = document.getElementById('contactMessage').value.trim();
    if (!email || !message) return;

    const btn = document.getElementById('contactSubmitBtn');
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const res = await fetch('/api/email/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json();
      if (data.ok) {
        contactForm.style.display = 'none';
        contactSuccess.style.display = 'block';
      } else {
        alert(data.error || 'Erro ao enviar mensagem. Tente novamente.');
      }
    } catch {
      alert('Erro ao enviar mensagem. Verifique sua conexão.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar mensagem';
    }
  });
}