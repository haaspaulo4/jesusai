const API = '/api/admin';
let token = localStorage.getItem('mp_token') || localStorage.getItem('jesus_ai_token');
let currentPage = 'dashboard';
let socket = null;

const pages = ['dashboard','users','personas','knowledge','vectors','creatives','search','surveys','ratings','followups','events','thoughts','workspace','billing','bots','integrations','commands','queue','settings'];

document.addEventListener('DOMContentLoaded', () => {
  if (!token) { showAdminLogin(); return; }
  checkAdmin();
  document.querySelectorAll('.nav-link').forEach(l => {
    l.addEventListener('click', e => { e.preventDefault(); switchPage(l.dataset.page); });
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('refreshUsers')?.addEventListener('click', loadUsers);
  document.getElementById('refreshPersonas')?.addEventListener('click', loadPersonas);
  document.getElementById('refreshKnowledge')?.addEventListener('click', loadKnowledge);
  document.getElementById('refreshRatings')?.addEventListener('click', loadRatings);
  document.getElementById('refreshFollowups')?.addEventListener('click', loadFollowups);
  document.getElementById('refreshBots')?.addEventListener('click', loadBots);
  document.getElementById('refreshIntegrations')?.addEventListener('click', loadIntegrations);
  document.getElementById('refreshSettings')?.addEventListener('click', loadSettings);
  document.getElementById('reindexBtn')?.addEventListener('click', reindexKnowledge);
  document.getElementById('createPersonaBtn')?.addEventListener('click', () => toggleEl('createPersonaForm'));
  document.getElementById('cancelPersonaBtn')?.addEventListener('click', () => toggleEl('createPersonaForm', false));
  document.getElementById('generatePersonaBtn')?.addEventListener('click', createPersona);
  document.getElementById('createSurveyBtn')?.addEventListener('click', () => toggleEl('createSurveyForm'));
  document.getElementById('cancelSurveyBtn')?.addEventListener('click', () => toggleEl('createSurveyForm', false));
  document.getElementById('submitSurveyBtn')?.addEventListener('click', createSurvey);
  document.getElementById('addBotBtn')?.addEventListener('click', () => toggleEl('addBotForm'));
  document.getElementById('cancelBotBtn')?.addEventListener('click', () => toggleEl('addBotForm', false));
  document.getElementById('submitBotBtn')?.addEventListener('click', createBot);
  document.getElementById('startAllBots')?.addEventListener('click', startAllBots);
  document.getElementById('addKeyBtn')?.addEventListener('click', () => toggleEl('addKeyForm'));
  document.getElementById('cancelKeyBtn')?.addEventListener('click', () => toggleEl('addKeyForm', false));
  document.getElementById('submitKeyBtn')?.addEventListener('click', addIntegration);
  document.getElementById('saveWhitelabelBtn')?.addEventListener('click', saveWhitelabel);
  document.getElementById('uploadForm')?.addEventListener('submit', uploadFile);
  document.getElementById('userRoleFilter')?.addEventListener('change', loadUsers);
  document.getElementById('userSearch')?.addEventListener('input', debounce(loadUsers, 300));
  document.getElementById('followupStatus')?.addEventListener('change', loadFollowups);
  document.getElementById('ratingCategory')?.addEventListener('change', loadRatings);
  // Commands
  document.getElementById('refreshCommands')?.addEventListener('click', loadCommands);
  document.getElementById('addCommandBtn')?.addEventListener('click', () => toggleEl('createCommandForm'));
  document.getElementById('cancelCommandBtn')?.addEventListener('click', () => toggleEl('createCommandForm', false));
  document.getElementById('submitCommandBtn')?.addEventListener('click', createCommand);
  loadDashboard();
});

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401 || res.status === 403) { toast('Acesso negado. Voce precisa ser admin.', 'error'); window.location.href = '/'; return null; }
  if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `HTTP ${res.status}`); }
  return res.json();
}

async function checkAdmin() {
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { showAdminLogin(); return; }
    const me = await res.json();
    if (me.role !== 'admin' && me.role !== 'premium') { showAdminLogin(); return; }
    const brandName = document.getElementById('brandName');
    if (brandName && me.name) brandName.textContent = me.name;
    initAdmin();
  } catch { showAdminLogin(); }
}

function showAdminLogin() {
  const app = document.getElementById('adminApp');
  if (app) app.style.display = 'none';
  let overlay = document.getElementById('adminLoginOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'adminLoginOverlay';
    overlay.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(5,5,16,0.95);display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:2.5rem;width:400px;max-width:95vw;backdrop-filter:blur(20px)">
        <h2 style="color:var(--primary);margin-bottom:1.5rem;text-align:center">Admin Login</h2>
        <div id="adminLoginError" style="display:none;color:var(--danger);margin-bottom:1rem;font-size:0.9rem"></div>
        <div style="margin-bottom:1rem">
          <label style="display:block;font-size:0.85rem;color:var(--text-dim);margin-bottom:0.3rem">Email</label>
          <input type="email" id="adminLoginEmail" class="input" style="width:100%" placeholder="admin@example.com" autocomplete="email">
        </div>
        <div style="margin-bottom:1.5rem">
          <label style="display:block;font-size:0.85rem;color:var(--text-dim);margin-bottom:0.3rem">Senha</label>
          <input type="password" id="adminLoginPassword" class="input" style="width:100%" placeholder="Sua senha" autocomplete="current-password">
        </div>
        <button id="adminLoginBtn" class="btn btn-primary" style="width:100%;padding:0.8rem">Entrar</button>
        <p style="text-align:center;margin-top:1rem;color:var(--text-dim);font-size:0.8rem">Acesso restrito a administradores</p>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('adminLoginBtn').addEventListener('click', doAdminLogin);
    document.getElementById('adminLoginPassword').addEventListener('keypress', e => { if (e.key === 'Enter') doAdminLogin(); });
  }
  overlay.style.display = 'flex';
}

async function doAdminLogin() {
  const email = document.getElementById('adminLoginEmail').value.trim();
  const password = document.getElementById('adminLoginPassword').value;
  const errEl = document.getElementById('adminLoginError');
  if (!email || !password) { errEl.textContent = 'Preencha email e senha'; errEl.style.display = 'block'; return; }
  try {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Erro no login'; errEl.style.display = 'block'; return; }
    token = data.token;
    localStorage.setItem('mp_token', token);
    localStorage.setItem('jesus_ai_token', token);
    errEl.style.display = 'none';
    const overlay = document.getElementById('adminLoginOverlay');
    if (overlay) overlay.style.display = 'none';
    const app = document.getElementById('adminApp');
    if (app) app.style.display = 'flex';
    checkAdmin();
  } catch (e) { const errEl = document.getElementById('adminLoginError'); errEl.textContent = e.message; errEl.style.display = 'block'; }
}

function initAdmin() {
  document.querySelectorAll('.nav-link').forEach(l => {
    l.addEventListener('click', e => { e.preventDefault(); switchPage(l.dataset.page); });
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('refreshUsers')?.addEventListener('click', loadUsers);
  document.getElementById('refreshPersonas')?.addEventListener('click', loadPersonas);
  document.getElementById('refreshKnowledge')?.addEventListener('click', loadKnowledge);
  document.getElementById('refreshRatings')?.addEventListener('click', loadRatings);
  document.getElementById('refreshFollowups')?.addEventListener('click', loadFollowups);
  document.getElementById('refreshBots')?.addEventListener('click', loadBots);
  document.getElementById('refreshIntegrations')?.addEventListener('click', loadIntegrations);
  document.getElementById('refreshSettings')?.addEventListener('click', loadSettings);
  document.getElementById('reindexBtn')?.addEventListener('click', reindexKnowledge);
  document.getElementById('createPersonaBtn')?.addEventListener('click', () => toggleEl('createPersonaForm'));
  document.getElementById('cancelPersonaBtn')?.addEventListener('click', () => toggleEl('createPersonaForm', false));
  document.getElementById('generatePersonaBtn')?.addEventListener('click', createPersona);
  document.getElementById('createSurveyBtn')?.addEventListener('click', () => toggleEl('createSurveyForm'));
  document.getElementById('cancelSurveyBtn')?.addEventListener('click', () => toggleEl('createSurveyForm', false));
  document.getElementById('submitSurveyBtn')?.addEventListener('click', createSurvey);
  document.getElementById('addBotBtn')?.addEventListener('click', () => toggleEl('addBotForm'));
  document.getElementById('cancelBotBtn')?.addEventListener('click', () => toggleEl('addBotForm', false));
  document.getElementById('submitBotBtn')?.addEventListener('click', createBot);
  document.getElementById('startAllBots')?.addEventListener('click', startAllBots);
  document.getElementById('addKeyBtn')?.addEventListener('click', () => toggleEl('addKeyForm'));
  document.getElementById('cancelKeyBtn')?.addEventListener('click', () => toggleEl('addKeyForm', false));
  document.getElementById('submitKeyBtn')?.addEventListener('click', addIntegration);
  document.getElementById('saveWhitelabelBtn')?.addEventListener('click', saveWhitelabel);
  document.getElementById('uploadForm')?.addEventListener('submit', uploadFile);
  document.getElementById('userRoleFilter')?.addEventListener('change', loadUsers);
  document.getElementById('userSearch')?.addEventListener('input', debounce(loadUsers, 300));
  document.getElementById('followupStatus')?.addEventListener('change', loadFollowups);
  document.getElementById('ratingCategory')?.addEventListener('change', loadRatings);
  document.getElementById('refreshCommands')?.addEventListener('click', loadCommands);
  document.getElementById('addCommandBtn')?.addEventListener('click', () => toggleEl('createCommandForm'));
  document.getElementById('cancelCommandBtn')?.addEventListener('click', () => toggleEl('createCommandForm', false));
  document.getElementById('submitCommandBtn')?.addEventListener('click', createCommand);
  document.getElementById('vectorReindexAllBtn')?.addEventListener('click', () => reindexVectors());
  document.getElementById('vectorReindexBibleBtn')?.addEventListener('click', () => reindexVectors('bible-pt-br'));
  document.getElementById('vectorReindexSourceBtn')?.addEventListener('click', () => reindexVectors(document.getElementById('vectorSourceInput').value));
  document.getElementById('generateCreativeBtn')?.addEventListener('click', generateCreative);
  document.getElementById('globalSearchBtn')?.addEventListener('click', doGlobalSearch);
  document.getElementById('globalSearchInput')?.addEventListener('keypress', e => { if (e.key === 'Enter') doGlobalSearch(); });
  document.getElementById('refreshEvents')?.addEventListener('click', loadEvents);
  document.getElementById('refreshThoughts')?.addEventListener('click', loadThoughts);
  document.getElementById('addRuleBtn')?.addEventListener('click', () => toast('Regras de negocio em breve!', 'info'));
  document.getElementById('savePlatformStyleBtn')?.addEventListener('click', savePlatformStyle);
  loadDashboard();
  setTimeout(initRealtime, 1000);
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');
  const loaders = {
    dashboard: loadDashboard, users: loadUsers, personas: loadPersonas, knowledge: loadKnowledge, surveys: loadSurveys, ratings: loadRatings, followups: loadFollowups, bots: loadBots, integrations: loadIntegrations, commands: loadCommands, settings: loadSettings,
    vectors: loadVectors, creatives: loadCreatives, search: loadGlobalSearch, events: loadEvents, thoughts: loadThoughts, workspace: loadWorkspace, billing: loadBillingPlans, queue: loadQueue,
  };
  loaders[page]?.();
}

function logout() { localStorage.removeItem('mp_token'); localStorage.removeItem('jesus_ai_token'); window.location.href = '/'; }
function toggleEl(id, show) { const el = document.getElementById(id); if (el) el.style.display = show === false ? 'none' : (el.style.display === 'none' ? 'block' : 'none'); }
function toast(msg, type = '') { const el = document.getElementById('toast'); el.textContent = msg; el.className = `toast ${type}`; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 3000); }
function loading(show = true) { document.getElementById('loading').style.display = show ? 'flex' : 'none'; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function loadDashboard() {
  try {
    const stats = await api('/stats');
    const g = document.getElementById('statsGrid');
    g.innerHTML = [
      ['Usuarios', stats.users], ['Mensagens', stats.messages], ['Sessoes', stats.sessions],
      ['Mensagens 24h', stats.messagesLast24h], ['Perfis', stats.profiles], ['Feedback', stats.feedback],
      ['Posts', stats.posts], ['Newsletter', stats.newsletter], ['Contatos', stats.contacts],
    ].map(([l, v]) => `<div class="stat-card"><div class="stat-value">${v ?? 0}</div><div class="stat-label">${l}</div></div>`).join('');
    const int = stats.integrations || {};
    const html = Object.entries(int).map(([type, info]) => `<div><strong>${info.label || type}</strong>: ${info.healthy}/${info.total} OK</div>`).join('');
    document.getElementById('integrationStatus').innerHTML = `<h3>Integracoes</h3>${html}`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadUsers() {
  try {
    const search = document.getElementById('userSearch')?.value || '';
    const role = document.getElementById('userRoleFilter')?.value || '';
    const data = await api(`/users?limit=50&search=${encodeURIComponent(search)}&role=${role}`);
    document.getElementById('usersTable').innerHTML = `<table><thead><tr><th>ID</th><th>Nome</th><th>Email</th><th>Role</th><th>Criado</th><th>Acoes</th></tr></thead><tbody>${
      data.users.map(u => `<tr><td>${u.id}</td><td>${u.name || '-'}</td><td>${u.email || '-'}</td><td><span class="badge-${u.role === 'admin' ? 'active' : u.role === 'banned' ? 'inactive' : 'active'}">${u.role}</span></td><td>${new Date(u.created_at).toLocaleDateString()}</td><td>${u.role !== 'admin' ? `<button class="btn btn-sm" onclick="setRole('${u.id}','premium')">Premium</button> <button class="btn btn-sm btn-danger" onclick="setRole('${u.id}','banned')">Banir</button>` : ''}</td></tr>`).join('')
    }</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function setRole(uid, role) { try { await api(`/users/${uid}/role`, { method: 'PUT', body: JSON.stringify({ role }) }); toast(`Role atualizado: ${role}`, 'success'); loadUsers(); } catch (e) { toast(e.message, 'error'); } }

async function loadPersonas() {
  try {
    const personas = await api('/personas');
    document.getElementById('personasList').innerHTML = personas.map(p => `<div class="persona-card"><h4>${p.name} (${p.id})</h4><div class="meta">TTS: ${p.ttsVoice} | Modelo: ${p.model || 'default'} | Ativa: ${p.isActive ? 'Sim' : 'Nao'}</div><div class="actions"><button class="btn btn-sm" onclick="togglePersona('${p.id}', ${!p.isActive})">${p.isActive ? 'Desativar' : 'Ativar'}</button>${p.id !== 'jesus' ? `<button class="btn btn-sm btn-danger" onclick="deletePersona('${p.id}')">Deletar</button>` : ''}</div></div>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function createPersona() {
  const desc = document.getElementById('personaDescription').value.trim();
  if (!desc) return toast('Descreva a persona', 'error');
  loading(true);
  try { const p = await api('/personas/generate', { method: 'POST', body: JSON.stringify({ description: desc }) }); toast(`Persona "${p.name}" criada!`, 'success'); toggleEl('createPersonaForm', false); loadPersonas(); } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function togglePersona(id, active) { try { await api(`/personas/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' }); toast('Persona atualizada', 'success'); loadPersonas(); } catch (e) { toast(e.message, 'error'); } }
async function deletePersona(id) { if (!confirm(`Deletar persona "${id}"?`)) return; try { await api(`/personas/${id}`, { method: 'DELETE' }); toast('Persona deletada', 'success'); loadPersonas(); } catch (e) { toast(e.message, 'error'); } }

async function loadKnowledge() {
  try {
    const data = await api('/knowledge');
    const sources = data.sources || [];
    document.getElementById('knowledgeSources').innerHTML = sources.map(s => `<div class="source-card"><h4>${s.name || s.id}</h4><div class="meta">Tipo: ${s.ingester || s.type} | Docs: ${s.documentCount} | Index: ${s.indexExists ? 'Sim' : 'Nao'}</div><div class="actions">${s.id !== 'bible-pt-br' ? `<button class="btn btn-sm btn-danger" onclick="deleteSource('${s.id}')">Remover</button>` : ''}</div></div>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function reindexKnowledge() { loading(true); try { const r = await api('/knowledge/reindex', { method: 'POST' }); toast(r.message || 'Reindexado!', 'success'); loadKnowledge(); } catch (e) { toast(e.message, 'error'); } finally { loading(false); } }

async function uploadFile(e) {
  e.preventDefault();
  const file = document.getElementById('uploadFile').files[0];
  if (!file) return toast('Selecione um arquivo', 'error');
  const sourceId = document.getElementById('uploadSourceId').value.trim();
  if (!sourceId) return toast('Informe o ID da fonte', 'error');
  const form = new FormData();
  form.append('file', file);
  form.append('sourceId', sourceId);
  form.append('sourceName', document.getElementById('uploadSourceName').value.trim() || sourceId);
  form.append('ingester', document.getElementById('uploadType').value);
  const prog = document.getElementById('uploadProgress');
  prog.style.display = 'block';
  loading(true);
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/knowledge/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) prog.querySelector('.progress-fill').style.width = (e.loaded / e.total * 100) + '%'; };
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText);
      if (xhr.status === 200) { toast(`Ingerido: ${data.documents} documentos de ${data.name}`, 'success'); } else { toast(data.error || 'Erro no upload', 'error'); }
      loadKnowledge(); loading(false); prog.style.display = 'none';
    };
    xhr.onerror = () => { toast('Erro no upload', 'error'); loading(false); prog.style.display = 'none'; };
    xhr.send(form);
  } catch (e) { toast(e.message, 'error'); loading(false); prog.style.display = 'none'; }
}

async function deleteSource(id) { if (!confirm(`Remover fonte "${id}"?`)) return; try { await api(`/knowledge/sources/${id}`, { method: 'DELETE' }); toast('Fonte removida', 'success'); loadKnowledge(); } catch (e) { toast(e.message, 'error'); } }

async function loadSurveys() {
  try {
    const data = await api('/surveys');
    const surveys = data.surveys || data || [];
    document.getElementById('surveysList').innerHTML = (Array.isArray(surveys) ? surveys : []).map(s => `<div class="survey-card"><h4>${s.title}</h4><div class="meta">${s.description || ''} | Tipo: ${s.triggerType} | Ativa: ${s.isActive ? 'Sim' : 'Nao'}</div></div>`).join('') || '<p>Nenhuma pesquisa.</p>';
  } catch (e) { toast(e.message, 'error'); }
}

async function createSurvey() {
  const title = document.getElementById('surveyTitle').value.trim();
  if (!title) return toast('Informe o titulo', 'error');
  try { await api('/surveys', { method: 'POST', body: JSON.stringify({ title, description: document.getElementById('surveyDesc').value, triggerType: document.getElementById('surveyTrigger').value, questions: [{ id: 'q1', type: 'rating', text: 'Como voce avalia?', required: true }] }) }); toast('Pesquisa criada!', 'success'); toggleEl('createSurveyForm', false); loadSurveys(); } catch (e) { toast(e.message, 'error'); }
}

async function loadRatings() {
  try {
    const category = document.getElementById('ratingCategory')?.value || '';
    const data = await api(`/ratings?${category ? 'category=' + category : ''}`);
    const ratings = data.ratings || data || [];
    const rows = Array.isArray(ratings) ? ratings : [];
    document.getElementById('ratingsList').innerHTML = `<table><thead><tr><th>Usuario</th><th>Rating</th><th>Categoria</th><th>Feedback</th><th>Data</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.user_id || '-'}</td><td class="rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td><td>${r.category || '-'}</td><td>${(r.feedback || '').substring(0, 60)}</td><td>${new Date(r.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadFollowups() {
  try {
    const status = document.getElementById('followupStatus')?.value || '';
    const data = await api(`/followups?${status ? 'status=' + status : ''}&limit=30`);
    const list = data.followUps || data || [];
    const items = Array.isArray(list) ? list : [];
    document.getElementById('followupsList').innerHTML = `<table><thead><tr><th>Usuario</th><th>Tipo</th><th>Pergunta</th><th>Status</th><th>Data</th></tr></thead><tbody>${items.map(f => `<tr><td>${f.user_id}</td><td>${f.type}</td><td>${(f.question || '').substring(0, 60)}</td><td><span class="badge-${f.status === 'completed' ? 'active' : f.status === 'sent' ? 'running' : 'inactive'}">${f.status}</span></td><td>${new Date(f.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadBots() {
  try {
    const bots = await api('/bots');
    document.getElementById('botsList').innerHTML = bots.map(b => `<div class="bot-card"><h4>${b.name} (${b.platform})</h4><div class="meta">Persona: ${b.personaId || 'default'} | ${b.running ? '<span class="badge-running">Rodando</span>' : '<span class="badge-stopped">Parado</span>'}</div><div class="actions">${b.running ? `<button class="btn btn-sm btn-danger" onclick="stopBot(${b.id})">Parar</button>` : `<button class="btn btn-sm" onclick="startBot(${b.id})">Iniciar</button>`}</div></div>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function createBot() {
  try {
    await api('/bots', { method: 'POST', body: JSON.stringify({ platform: document.getElementById('botPlatform').value, name: document.getElementById('botName').value, token: document.getElementById('botToken').value, personaId: document.getElementById('botPersonaId').value || undefined }) });
    toast('Bot criado!', 'success'); toggleEl('addBotForm', false); loadBots();
  } catch (e) { toast(e.message, 'error'); }
}

async function startBot(id) { try { await api(`/bots/${id}/start`, { method: 'POST' }); toast('Bot iniciado', 'success'); loadBots(); } catch (e) { toast(e.message, 'error'); } }
async function stopBot(id) { try { await api(`/bots/${id}/stop`, { method: 'POST' }); toast('Bot parado', 'success'); loadBots(); } catch (e) { toast(e.message, 'error'); } }
async function startAllBots() { try { await api('/bots/start-all', { method: 'POST' }); toast('Todos os bots iniciados', 'success'); loadBots(); } catch (e) { toast(e.message, 'error'); } }

async function loadIntegrations() {
  try {
    loading();
    const data = await api('/integrations');
    const list = document.getElementById('integrationsList');
    const items = Array.isArray(data) ? data : Object.values(data).flatMap(g => Array.isArray(g.integrations) ? g.integrations : g);
    list.innerHTML = items.map(i => `<div class="card">
      <h4>${i.label || i.service_type}</h4>
      <p class="status ${i.is_active ? 'active' : 'inactive'}">${i.is_active ? 'Ativo' : 'Inativo'}</p>
      <p>${i.model || ''}</p>
    </div>`).join('');
    loading(false);
  } catch (e) { toast(e.message, 'error'); loading(false); }
}

async function loadCommands() {
  try {
    loading();
    const data = await api('/commands');
    const list = document.getElementById('commandsList');
    const items = Array.isArray(data) ? data : [];
    list.innerHTML = items.map(c => `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4>${c.command}</h4>
        <span class="badge">${c.category}</span>
      </div>
      <p>${c.description || ''}</p>
      <p class="text-muted">Tipo: ${c.response_type} | Acao: ${c.action_type}</p>
      <p class="text-muted">Usos: ${c.usage_count}</p>
      <div style="margin-top:1rem;">
        <button class="btn" onclick="deleteCommand(${c.id})">Excluir</button>
      </div>
    </div>`).join('');
    if (items.length === 0) list.innerHTML = '<p>Nenhum comando criado.</p>';
    loading(false);
  } catch (e) { toast(e.message, 'error'); loading(false); }
}

async function createCommand() {
  const data = {
    command: document.getElementById('cmdCommand').value,
    description: document.getElementById('cmdDescription').value,
    response_template: document.getElementById('cmdResponseTemplate').value,
    response_type: document.getElementById('cmdResponseType').value,
    action_type: document.getElementById('cmdActionType').value,
    required_role: document.getElementById('cmdRequiredRole').value,
    required_persona_id: document.getElementById('cmdPersonaId').value || null,
    aliases: document.getElementById('cmdAliases').value.split(',').map(a => a.trim()).filter(a => a),
    category: document.getElementById('cmdCategory').value,
  };
  try {
    await api('/commands', { method: 'POST', body: JSON.stringify(data) });
    toast('Comando criado!', 'success');
    toggleEl('createCommandForm', false);
    loadCommands();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCommand(id) {
  if (!confirm('Excluir comando?')) return;
  try {
    await api(`/commands/${id}`, { method: 'DELETE' });
    toast('Comando excluido!', 'success');
    loadCommands();
  } catch (e) { toast(e.message, 'error'); }
}

async function addIntegration() {
  try {
    await api('/integrations', { method: 'POST', body: JSON.stringify({ service_type: document.getElementById('keyService').value, api_key: document.getElementById('keyValue').value, base_url: document.getElementById('keyBaseUrl').value || undefined, model: document.getElementById('keyModel').value || undefined, label: document.getElementById('keyLabel').value || undefined }) });
    toast('Integracao adicionada!', 'success'); toggleEl('addKeyForm', false); loadIntegrations();
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleIntegration(id) { try { const i = await api(`/integrations/${id}`); await api(`/integrations/${id}/toggle`, { method: 'PUT', body: JSON.stringify({ active: !i.is_active }) }); toast('Integracao atualizada', 'success'); loadIntegrations(); } catch (e) { toast(e.message, 'error'); } }
async function removeIntegration(id) { if (!confirm('Remover esta integracao?')) return; try { await api(`/integrations/${id}`, { method: 'DELETE' }); toast('Removida', 'success'); loadIntegrations(); } catch (e) { toast(e.message, 'error'); } }

async function loadSettings() {
  try {
    const settings = await api('/settings');
    const known = ['onboarding_enabled','onboarding_greeting','survey_enabled','followup_enabled','followup_interval_messages','ratings_enabled','rate_limit_guest','rate_limit_user','rate_limit_premium','rate_limit_admin','tools_enabled','history_limit','search_verses_count','max_tokens','temperature','llm_timeout'];
    const grid = document.getElementById('settingsGrid');
    grid.innerHTML = known.map(k => `<div class="setting-item"><label>${k}</label><input type="text" class="input" id="setting-${k}" value="${settings[k] || ''}" data-key="${k}"></div>`).join('');
    const wl = ['brand_name','brand_tagline','brand_logo_url','brand_primary_color','brand_secondary_color'];
    wl.forEach(k => { const el = document.getElementById(`setting-${k}`); const inp = document.getElementById(`setting-${k.replace('brand_','setting-brand_')}`); });
    if (settings.brand_name) document.getElementById('setting-brand_name').value = settings.brand_name;
    if (settings.brand_tagline) document.getElementById('setting-brand_tagline').value = settings.brand_tagline;
    if (settings.brand_logo_url) document.getElementById('setting-brand_logo_url').value = settings.brand_logo_url;
    if (settings.brand_primary_color) document.getElementById('setting-brand_primary_color').value = settings.brand_primary_color;
    document.querySelectorAll('.setting-item .input').forEach(inp => {
      inp.addEventListener('change', async () => {
        try { await api('/settings', { method: 'PUT', body: JSON.stringify({ key: inp.dataset.key, value: inp.value }) }); toast('Salvo!', 'success'); } catch (e) { toast(e.message, 'error'); }
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function saveWhitelabel() {
  const fields = { brand_name: document.getElementById('setting-brand_name').value, brand_tagline: document.getElementById('setting-brand_tagline').value, brand_logo_url: document.getElementById('setting-brand_logo_url').value, brand_primary_color: document.getElementById('setting-brand_primary_color').value };
  try { for (const [k, v] of Object.entries(fields)) { if (v) await api('/settings', { method: 'PUT', body: JSON.stringify({ key: k, value: v }) }); } toast('Whitelabel salvo!', 'success'); } catch (e) { toast(e.message, 'error'); }
}

async function savePlatformStyle() {
  const fields = { platform_avatar_style: document.getElementById('setting-platform_avatar_style').value, platform_emoji_style: document.getElementById('setting-platform_emoji_style').value, platform_font_family: document.getElementById('setting-platform_font_family').value, platform_animation_style: document.getElementById('setting-platform_animation_style').value };
  try { for (const [k, v] of Object.entries(fields)) { if (v) await api('/settings', { method: 'PUT', body: JSON.stringify({ key: k, value: v }) }); } toast('Estilo salvo!', 'success'); } catch (e) { toast(e.message, 'error'); }
}

async function loadVectors() {
  try {
    const data = await api('/vector-stats');
    const badge = document.getElementById('vectorStatusBadge');
    badge.textContent = data.enabled ? 'Ativo' : 'Desativado';
    badge.style.background = data.enabled ? '#10b981' : '#ef4444';
    const grid = document.getElementById('vectorStats');
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.totalEmbeddings || 0}</div><div class="stat-label">Embeddings</div></div>
      <div class="stat-card"><div class="stat-value">${data.model || 'n/a'}</div><div class="stat-label">Modelo</div></div>
      <div class="stat-card"><div class="stat-value">${data.dimensions || 0}d</div><div class="stat-label">Dimensoes</div></div>
      <div class="stat-card"><div class="stat-value">${data.vectorWeight || 0.7}/${data.tfidfWeight || 0.3}</div><div class="stat-label">Peso Vector/TF-IDF</div></div>
    `;
    const listHtml = (data.sources || []).map(s => `<div class="stat-mini">${s.sourceId}: ${s.count} embeddings</div>`).join('');
    document.getElementById('vectorResult').innerHTML = listHtml;
  } catch(e) { toast(e.message, 'error'); }
}

async function reindexVectors(sourceId) {
  document.getElementById('vectorResult').innerHTML = 'Reindexando... Isto pode levar alguns minutos.';
  try {
    const body = sourceId ? { sourceId } : {};
    const result = await api('/vector-reindex', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('vectorResult').innerHTML = `<span style="color:#10b981">Reindexacao concluida!</span>`;
    loadVectors();
  } catch(e) { document.getElementById('vectorResult').innerHTML = `<span style="color:#ef4444">${e.message}</span>`; }
}

async function loadCreatives() {
  try {
    const templates = await api('/creatives/templates');
    const list = await api('/creatives?limit=20');
    document.getElementById('creativesList').innerHTML = list.map(c => `
      <div class="card" style="margin-bottom:0.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>${c.template_id || c.type}</strong> <span style="color:var(--muted)">${c.id.substring(0,20)}...</span></div>
          <div><span style="color:var(--muted)">${new Date(c.created_at).toLocaleString()}</span></div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--muted)">Nenhum criativo ainda. Gere o primeiro acima!</p>';
  } catch(e) { toast(e.message, 'error'); }
}

async function generateCreative() {
  try {
    const result = await api('/creatives/generate', { method: 'POST', body: JSON.stringify({
      template_id: document.getElementById('creativeTemplate').value,
      size: document.getElementById('creativeSize').value,
      text: document.getElementById('creativeText').value,
      author: document.getElementById('creativeAuthor').value,
      primary_color: document.getElementById('creativePrimaryColor').value,
      secondary_color: document.getElementById('creativeSecondaryColor').value,
      accent_color: document.getElementById('creativeAccentColor').value,
    }) });
    toast('Criativo gerado!', 'success');
    if (result.id) {
      document.getElementById('creativePreview').style.display = 'block';
      document.getElementById('creativePreviewFrame').src = `/api/admin/creatives/${result.id}/html`;
    }
    loadCreatives();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadGlobalSearch() {
  try {
    const stats = await api('/search/stats');
    document.getElementById('searchIndexStats').innerHTML = `
      <h3>Indices de Busca</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.5rem;margin-top:0.5rem">
        ${Object.entries(stats.indexes || {}).map(([k,v]) => `<div class="stat-mini"><strong>${k}</strong>: ${v.documentCount || 0} docs</div>`).join('')}
      </div>
    `;
  } catch(e) {}
}

async function doGlobalSearch() {
  const q = document.getElementById('globalSearchInput').value.trim();
  if (!q) return;
  try {
    const results = await api(`/search?q=${encodeURIComponent(q)}&limit=10`);
    const html = Object.entries(results.results || {}).map(([coll, items]) => {
      if (!items || items.length === 0) return '';
      return `<div style="margin-bottom:1rem"><h4>${coll}</h4>${items.slice(0,5).map(i => `<div style="padding:0.3rem 0;border-bottom:1px solid var(--border)">${i.id?.doc_id || i.id || JSON.stringify(i).substring(0,100)}</div>`).join('')}</div>`;
    }).join('');
    document.getElementById('globalSearchResults').innerHTML = html || '<p style="color:var(--muted)">Nenhum resultado encontrado.</p>';
  } catch(e) { toast(e.message, 'error'); }
}

async function loadEvents() {
  try {
    const type = document.getElementById('eventFilter')?.value || '';
    const data = await api(`/events/log?limit=50${type ? '&event_type='+type : ''}`);
    document.getElementById('eventsTable').innerHTML = `<table class="data-table"><thead><tr><th>Tipo</th><th>Usuario</th><th>Persona</th><th>Data</th><th>Quando</th></tr></thead><tbody>${(data.events || data || []).map(e => `<tr><td>${e.event_type}</td><td>${e.user_id || '-'}</td><td>${e.persona_id || '-'}</td><td>${JSON.stringify(e.data || {}).substring(0,80)}</td><td>${new Date(e.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}

async function loadThoughts() {
  try {
    const stats = await api('/thoughts/stats');
    const statCards = [
      { label: 'Total Pensamentos', value: stats.total_thoughts || 0 },
      { label: 'Tempo Medio (ms)', value: Math.round(stats.avg_response_time || 0) },
      { label: 'Tokens Medio', value: Math.round(stats.avg_tokens || 0) },
      { label: 'Ferramenta Top', value: stats.top_tools?.[0]?.tool || 'N/A' },
    ];
    document.getElementById('thoughtsStats').innerHTML = statCards.map(c => `<div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`).join('');
    const data = await api('/thoughts?limit=30');
    document.getElementById('thoughtsTable').innerHTML = `<table class="data-table"><thead><tr><th>Usuario</th><th>Emocao</th><th>Intent</th><th>Ferramentas</th><th>Tempo</th><th>Quando</th></tr></thead><tbody>${(data.thoughts || data || []).map(t => `<tr><td>${t.user_id || '-'}</td><td>${t.reasoning?.emotion || '-'}</td><td>${t.reasoning?.intent || '-'}</td><td>${(t.tools_used || []).join(', ') || '-'}</td><td>${t.response_time_ms || '-'}ms</td><td>${new Date(t.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}

async function loadWorkspace() {
  try {
    const members = await api('/workspace/members');
    document.getElementById('workspaceMembers').innerHTML = `<table class="data-table"><thead><tr><th>Usuario</th><th>Email</th><th>Role</th><th>Desde</th></tr></thead><tbody>${(members || []).map(m => `<tr><td>${m.name || m.user_id}</td><td>${m.email || '-'}</td><td><span class="badge">${m.role}</span></td><td>${new Date(m.joined_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}

async function loadBillingPlans() {
  const plans = [
    { id: 'free', name: 'Free', price: 'R$0', personas: 3, contacts: '1.000', msgs: '500/dia', color: '#6b7280' },
    { id: 'starter', name: 'Starter', price: 'R$97/mes', personas: 10, contacts: '5.000', msgs: '3.000/dia', color: '#3b82f6' },
    { id: 'pro', name: 'Pro', price: 'R$297/mes', personas: 50, contacts: '25.000', msgs: '15.000/dia', color: '#8b5cf6' },
    { id: 'enterprise', name: 'Enterprise', price: 'R$997/mes', personas: 'Ilimitado', contacts: 'Ilimitado', msgs: 'Ilimitado', color: '#f59e0b' },
  ];
  document.getElementById('billingPlans').innerHTML = plans.map(p => `
    <div class="card" style="text-align:center;border-top:3px solid ${p.color}">
      <h3 style="color:${p.color}">${p.name}</h3>
      <div style="font-size:1.5rem;font-weight:700;margin:0.5rem 0">${p.price}</div>
      <div style="color:var(--muted);font-size:0.85rem">${p.personas} personas &middot; ${p.contacts} contatos &middot; ${p.msgs}</div>
    </div>
  `).join('');
  try {
    const report = await api('/billing/usage');
    document.getElementById('usageReport').innerHTML = `<h3>Uso Atual</h3><pre style="background:var(--bg-card);padding:1rem;border-radius:8px;overflow:auto">${JSON.stringify(report, null, 2)}</pre>`;
  } catch(e) { document.getElementById('usageReport').innerHTML = '<p style="color:var(--muted)">Dados de uso nao disponiveis ainda.</p>'; }
}

async function loadQueue() {
  try {
    const data = await api('/queue-stats');
    const badge = document.getElementById('queueStatusBadge');
    badge.textContent = data.available ? 'Redis Conectado' : 'Redis Indisponivel';
    badge.style.background = data.available ? '#10b981' : '#f59e0b';
    const stats = data.stats || {};
    const allQueues = ['proactive','followup','ingestion','embedding','notification','automation','blog','email'];
    document.getElementById('queueStats').innerHTML = allQueues.map(q => {
      const s = stats[q] || { waiting: 0, active: 0, completed: 0, failed: 0 };
      return `<div class="stat-card"><div class="stat-label">${q}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:0.8rem;color:var(--muted)"><div>Wait: ${s.waiting}</div><div>Active: ${s.active}</div><div>Done: ${s.completed}</div><div>Failed: ${s.failed}</div></div></div>`;
    }).join('');
  } catch(e) {
    document.getElementById('queueStatusBadge').textContent = 'Erro';
    document.getElementById('queueStatusBadge').style.background = '#ef4444';
    document.getElementById('queueStats').innerHTML = '<p style="color:var(--muted)">Redis nao conectado. Usando processamento por intervalo.</p>';
  }
}


function initRealtime() {
  try {
    socket = io({ auth: { userId: 'admin' } });
    socket.on('connect', () => console.log('[RT] Connected'));
    socket.on('xp_update', data => { /* could update dashboard */ });
    socket.on('cognitive_state', data => { /* could show live emotion */ });
    socket.on('new_message', data => { /* could show live messages */ });
  } catch(e) { console.log('[RT] Socket.IO not available'); }
}