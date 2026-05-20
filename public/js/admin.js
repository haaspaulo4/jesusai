const API = '/api/admin';
let token = localStorage.getItem('mp_token') || localStorage.getItem('jesus_ai_token');
let currentPage = 'dashboard';
let socket = null;

function esc(str) { if (str == null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

const pages = ['dashboard','users','personas','knowledge','vectors','creatives','search','surveys','ratings','followups','events','thoughts','workspace','billing','bots','integrations','commands','queue','settings','products','orders','stock','finance','suppliers','sitecms','coupons','delivery'];

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

async function api(path, opts = {}, retry = true) {
  const base = path.startsWith('/erp') ? '/api' : path.startsWith('/admin') ? API : API;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  if (res.status === 401 && retry) {
    const refreshToken = localStorage.getItem('mp_refresh_token');
    if (refreshToken) {
      try {
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          token = refreshData.token;
          localStorage.setItem('mp_token', token);
          if (refreshData.refreshToken) localStorage.setItem('mp_refresh_token', refreshData.refreshToken);
          headers.Authorization = `Bearer ${token}`;
          return api(path, opts, false);
        }
      } catch {}
    }
    toast('Sessão expirada. Faça login novamente.', 'error');
    localStorage.removeItem('mp_token'); localStorage.removeItem('mp_refresh_token');
    showAdminLogin();
    return null;
  }
  if (res.status === 403) { toast('Acesso negado. Voce precisa ser admin.', 'error'); window.location.href = '/'; return null; }
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
    if (data.refreshToken) localStorage.setItem('mp_refresh_token', data.refreshToken);
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
    vectors: loadVectors, creatives: loadCreatives, search: loadGlobalSearch, events: loadEvents, thoughts: loadThoughts, overrides: loadOverrides, workspace: loadWorkspace, billing: loadBillingPlans, queue: loadQueue,
    products: loadProducts, orders: loadOrders, stock: loadStock, finance: loadFinance, suppliers: loadSuppliers, sitecms: loadSiteCMS, coupons: loadCoupons, delivery: loadDelivery,
  };
  loaders[page]?.();
}

function logout() { localStorage.removeItem('mp_token'); localStorage.removeItem('jesus_ai_token'); localStorage.removeItem('mp_refresh_token'); window.location.href = '/'; }
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
      data.users.map(u => {
        const uid = esc(u.id);
        let actions = '';
        if (u.role === 'admin') {
          actions = `<button class="btn btn-sm" onclick="setRole('${uid}','user')">Remover Admin</button>`;
        } else if (u.role === 'banned') {
          actions = `<button class="btn btn-sm" onclick="setRole('${uid}','user')">Desbanir</button> <button class="btn btn-sm" onclick="setRole('${uid}','premium')">Premium</button>`;
        } else if (u.role === 'premium') {
          actions = `<button class="btn btn-sm" onclick="setRole('${uid}','admin')">Admin</button> <button class="btn btn-sm" onclick="setRole('${uid}','user')">Remover Premium</button> <button class="btn btn-sm btn-danger" onclick="setRole('${uid}','banned')">Banir</button>`;
        } else {
          actions = `<button class="btn btn-sm" onclick="setRole('${uid}','premium')">Premium</button> <button class="btn btn-sm" onclick="setRole('${uid}','admin')">Admin</button> <button class="btn btn-sm btn-danger" onclick="setRole('${uid}','banned')">Banir</button>`;
        }
        return `<tr><td>${uid}</td><td>${esc(u.name) || '-'}</td><td>${esc(u.email) || '-'}</td><td><span class="badge-${u.role === 'admin' ? 'active' : u.role === 'banned' ? 'inactive' : 'active'}">${esc(u.role)}</span></td><td>${new Date(u.created_at).toLocaleDateString()}</td><td>${actions}</td></tr>`;
      }).join('')
    }</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function setRole(uid, role) { try { await api(`/users/${uid}/role`, { method: 'PUT', body: JSON.stringify({ role }) }); toast(`Role atualizado: ${role}`, 'success'); loadUsers(); } catch (e) { toast(e.message, 'error'); } }

async function loadPersonas() {
  try {
    const personas = await api('/personas');
    document.getElementById('personasList').innerHTML = personas.map(p => `<div class="persona-card"><h4>${esc(p.name)} (${esc(p.id)})</h4><div class="meta">TTS: ${esc(p.ttsVoice)} | Modelo: ${esc(p.model || 'default')} | Ativa: ${p.isActive ? 'Sim' : 'Nao'}</div><div class="actions"><button class="btn btn-sm" onclick="togglePersona('${esc(p.id)}', ${!p.isActive})">${p.isActive ? 'Desativar' : 'Ativar'}</button>${p.id !== 'jesus' ? `<button class="btn btn-sm btn-danger" onclick="deletePersona('${esc(p.id)}')">Deletar</button>` : ''}</div></div>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function createPersona() {
  const desc = document.getElementById('personaDescription').value.trim();
  if (!desc) return toast('Descreva a persona', 'error');
  loading(true);
  try { const p = await api('/personas/generate', { method: 'POST', body: JSON.stringify({ description: desc }) }); toast(`Persona "${p.name}" criada!`, 'success'); toggleEl('createPersonaForm', false); loadPersonas(); } catch (e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function togglePersona(id, active) { try { await api(`/personas/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' }); toast('Persona atualizada', 'success'); loadPersonas(); } catch (e) { toast(e.message, 'error'); } }
async function deletePersona(id) { if (!confirm('Deletar persona?')) return; try { await api(`/personas/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast('Persona deletada', 'success'); loadPersonas(); } catch (e) { toast(e.message, 'error'); } }

async function loadKnowledge() {
  try {
    const data = await api('/knowledge');
    const sources = data.sources || [];
    document.getElementById('knowledgeSources').innerHTML = sources.map(s => `<div class="source-card"><h4>${esc(s.name || s.id)}</h4><div class="meta">Tipo: ${esc(s.ingester || s.type)} | Docs: ${s.documentCount} | Index: ${s.indexExists ? 'Sim' : 'Nao'}</div><div class="actions">${s.id !== 'bible-pt-br' ? `<button class="btn btn-sm btn-danger" onclick="deleteSource('${esc(s.id)}')">Remover</button>` : ''}</div></div>`).join('');
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
    document.getElementById('surveysList').innerHTML = (Array.isArray(surveys) ? surveys : []).map(s => `<div class="survey-card"><h4>${esc(s.title)}</h4><div class="meta">${esc(s.description || '')} | Tipo: ${esc(s.triggerType)} | Ativa: ${s.isActive ? 'Sim' : 'Nao'}</div></div>`).join('') || '<p>Nenhuma pesquisa.</p>';
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
    document.getElementById('ratingsList').innerHTML = `<table><thead><tr><th>Usuario</th><th>Rating</th><th>Categoria</th><th>Feedback</th><th>Data</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.user_id) || '-'}</td><td class="rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td><td>${esc(r.category) || '-'}</td><td>${esc((r.feedback || '').substring(0, 60))}</td><td>${new Date(r.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadFollowups() {
  try {
    const status = document.getElementById('followupStatus')?.value || '';
    const data = await api(`/followups?${status ? 'status=' + status : ''}&limit=30`);
    const list = data.followUps || data || [];
    const items = Array.isArray(list) ? list : [];
    document.getElementById('followupsList').innerHTML = `<table><thead><tr><th>Usuario</th><th>Tipo</th><th>Pergunta</th><th>Status</th><th>Data</th></tr></thead><tbody>${items.map(f => `<tr><td>${esc(f.user_id)}</td><td>${esc(f.type)}</td><td>${esc((f.question || '').substring(0, 60))}</td><td><span class="badge-${f.status === 'completed' ? 'active' : f.status === 'sent' ? 'running' : 'inactive'}">${esc(f.status)}</span></td><td>${new Date(f.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadBots() {
  try {
    const bots = await api('/bots');
    document.getElementById('botsList').innerHTML = bots.map(b => `<div class="bot-card"><h4>${esc(b.name)} (${esc(b.platform)})</h4><div class="meta">Persona: ${esc(b.personaId || 'default')} | ${b.running ? '<span class="badge-running">Rodando</span>' : '<span class="badge-stopped">Parado</span>'}</div><div class="actions">${b.running ? `<button class="btn btn-sm btn-danger" onclick="stopBot(${b.id})">Parar</button>` : `<button class="btn btn-sm" onclick="startBot(${b.id})">Iniciar</button>`}</div></div>`).join('');
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
      <h4>${esc(i.label || i.service_type)}</h4>
      <p class="status ${i.is_active ? 'active' : 'inactive'}">${i.is_active ? 'Ativo' : 'Inativo'}</p>
      <p>${esc(i.model || '')}</p>
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
        <h4>${esc(c.command)}</h4>
        <span class="badge">${esc(c.category)}</span>
      </div>
      <p>${esc(c.description || '')}</p>
      <p class="text-muted">Tipo: ${esc(c.response_type)} | Acao: ${esc(c.action_type)}</p>
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
    const settings = await api('/admin/settings');
    const known = ['onboarding_enabled','onboarding_greeting','survey_enabled','followup_enabled','followup_interval_messages','ratings_enabled','rate_limit_guest','rate_limit_user','rate_limit_premium','rate_limit_admin','tools_enabled','history_limit','search_verses_count','max_tokens','temperature','llm_timeout'];
    const grid = document.getElementById('settingsGrid');
    grid.innerHTML = known.map(k => `<div class="setting-item"><label>${esc(k)}</label><input type="text" class="input" id="setting-${esc(k)}" value="${esc(settings[k] || '')}" data-key="${esc(k)}"></div>`).join('');
    const wl = ['brand_name','brand_tagline','brand_logo_url','brand_primary_color','brand_secondary_color'];
    wl.forEach(k => { const el = document.getElementById(`setting-${k}`); const inp = document.getElementById(`setting-${k.replace('brand_','setting-brand_')}`); });
    if (settings.brand_name) document.getElementById('setting-brand_name').value = settings.brand_name;
    if (settings.brand_tagline) document.getElementById('setting-brand_tagline').value = settings.brand_tagline;
    if (settings.brand_logo_url) document.getElementById('setting-brand_logo_url').value = settings.brand_logo_url;
    if (settings.brand_primary_color) document.getElementById('setting-brand_primary_color').value = settings.brand_primary_color;
    document.querySelectorAll('.setting-item .input').forEach(inp => {
      inp.addEventListener('change', async () => {
        try { await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ key: inp.dataset.key, value: inp.value }) }); toast('Salvo!', 'success'); } catch (e) { toast(e.message, 'error'); }
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function saveWhitelabel() {
  const fields = { brand_name: document.getElementById('setting-brand_name').value, brand_tagline: document.getElementById('setting-brand_tagline').value, brand_logo_url: document.getElementById('setting-brand_logo_url').value, brand_primary_color: document.getElementById('setting-brand_primary_color').value };
  try { for (const [k, v] of Object.entries(fields)) { if (v) await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ key: k, value: v }) }); } toast('Whitelabel salvo!', 'success'); } catch (e) { toast(e.message, 'error'); }
}

async function savePlatformStyle() {
  const fields = { platform_avatar_style: document.getElementById('setting-platform_avatar_style').value, platform_emoji_style: document.getElementById('setting-platform_emoji_style').value, platform_font_family: document.getElementById('setting-platform_font_family').value, platform_animation_style: document.getElementById('setting-platform_animation_style').value };
  try { for (const [k, v] of Object.entries(fields)) { if (v) await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ key: k, value: v }) }); } toast('Estilo salvo!', 'success'); } catch (e) { toast(e.message, 'error'); }
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
    const listHtml = (data.sources || []).map(s => `<div class="stat-mini">${esc(s.sourceId)}: ${s.count} embeddings</div>`).join('');
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
          <div><strong>${esc(c.template_id || c.type)}</strong> <span style="color:var(--muted)">${esc(c.id.substring(0,20))}...</span></div>
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
        ${Object.entries(stats.indexes || {}).map(([k,v]) => `<div class="stat-mini"><strong>${esc(k)}</strong>: ${v.documentCount || 0} docs</div>`).join('')}
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
      return `<div style="margin-bottom:1rem"><h4>${esc(coll)}</h4>${items.slice(0,5).map(i => `<div style="padding:0.3rem 0;border-bottom:1px solid var(--border)">${esc(i.id?.doc_id || i.id || JSON.stringify(i).substring(0,100))}</div>`).join('')}</div>`;
    }).join('');
    document.getElementById('globalSearchResults').innerHTML = html || '<p style="color:var(--muted)">Nenhum resultado encontrado.</p>';
  } catch(e) { toast(e.message, 'error'); }
}

async function loadEvents() {
  try {
    const type = document.getElementById('eventFilter')?.value || '';
    const data = await api(`/events/log?limit=50${type ? '&event_type='+type : ''}`);
    document.getElementById('eventsTable').innerHTML = `<table class="data-table"><thead><tr><th>Tipo</th><th>Usuario</th><th>Persona</th><th>Data</th><th>Quando</th></tr></thead><tbody>${(data.events || data || []).map(e => `<tr><td>${esc(e.event_type)}</td><td>${esc(e.user_id) || '-'}</td><td>${esc(e.persona_id) || '-'}</td><td>${esc(JSON.stringify(e.data || {}).substring(0,80))}</td><td>${new Date(e.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
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
    document.getElementById('thoughtsTable').innerHTML = `<table class="data-table"><thead><tr><th>Usuario</th><th>Emocao</th><th>Intent</th><th>Ferramentas</th><th>Tempo</th><th>Quando</th></tr></thead><tbody>${(data.thoughts || data || []).map(t => `<tr><td>${esc(t.user_id) || '-'}</td><td>${esc(t.reasoning?.emotion || '-')}</td><td>${esc(t.reasoning?.intent || '-')}</td><td>${esc((t.tools_used || []).join(', ')) || '-'}</td><td>${t.response_time_ms || '-'}ms</td><td>${new Date(t.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}

async function loadWorkspace() {
  try {
    const members = await api('/workspace/members');
    document.getElementById('workspaceMembers').innerHTML = `<table class="data-table"><thead><tr><th>Usuario</th><th>Email</th><th>Role</th><th>Desde</th></tr></thead><tbody>${(members || []).map(m => `<tr><td>${esc(m.name || m.user_id)}</td><td>${esc(m.email) || '-'}</td><td><span class="badge">${esc(m.role)}</span></td><td>${new Date(m.joined_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`;
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

async function changeAdminPassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  if (!currentPassword || !newPassword) { toast('Preencha ambos os campos', 'error'); return; }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error || 'Falha ao alterar senha', 'error');
      return;
    }
    const data = await res.json();
    if (data.token) { localStorage.setItem('mp_token', data.token); token = data.token; }
    if (data.refreshToken) localStorage.setItem('mp_refresh_token', data.refreshToken);
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    toast('Senha alterada com sucesso!', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function loadOverrides() {
  try {
    const data = await api('/override/list?is_active=1');
    const overrides = data.overrides || data || [];
    document.getElementById('overridesTable').innerHTML = overrides.length === 0
      ? '<p style="color:var(--muted)">Nenhum override ativo.</p>'
      : `<table class="data-table"><thead><tr><th>Session</th><th>Tipo</th><th>Mensagem</th><th>Desde</th><th>Acoes</th></tr></thead><tbody>${overrides.map(o => `<tr><td>${esc(o.session_id)}</td><td>${esc(o.override_type)}</td><td>${esc(o.human_message || '-')}</td><td>${new Date(o.created_at).toLocaleString()}</td><td><button class="btn btn-sm" onclick="deactivateOverride('${esc(o.session_id)}')">Desativar</button></td></tr>`).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
}

async function activateOverride() {
  const sessionId = document.getElementById('overrideSessionId').value.trim();
  const type = document.getElementById('overrideType').value;
  const message = document.getElementById('overrideMessage').value.trim();
  if (!sessionId) { toast('Session ID obrigatorio', 'error'); return; }
  try {
    await api('/override/activate', { method: 'POST', body: JSON.stringify({ sessionId, override_type: type, human_message: message || undefined }) });
    toast('Override ativado!', 'success');
    document.getElementById('overrideSessionId').value = '';
    document.getElementById('overrideMessage').value = '';
    loadOverrides();
  } catch(e) { toast(e.message, 'error'); }
}

async function deactivateOverride(sessionId) {
  try {
    await api('/override/deactivate', { method: 'POST', body: JSON.stringify({ sessionId }) });
    toast('Override desativado', 'success');
    loadOverrides();
  } catch(e) { toast(e.message, 'error'); }
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


// ==================== ERP: PRODUCTS ====================

const productStatusFilter = document.getElementById('productTypeFilter');
const productCategoryFilter = document.getElementById('productCategoryFilter');
const productSearchInput = document.getElementById('productSearch');

async function loadProducts() {
  loading();
  try {
    const params = new URLSearchParams();
    const search = productSearchInput?.value || '';
    const type = productStatusFilter?.value || '';
    const category = productCategoryFilter?.value || '';
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    if (category) params.set('category', category);
    params.set('is_active', 'true');
    const res = await api(`/erp/products?${params.toString()}`);
    const products = res.products || [];
    loadProductCategories();
    const stats = await api('/erp/products/stats').catch(() => ({}));
    document.getElementById('productStats').innerHTML = [
      { label: 'Total', value: stats.total || products.length, icon: '📦' },
      { label: 'Em Estoque', value: stats.by_type?.reduce((s, t) => s + (t.total_stock || 0), 0) || 0, icon: '🏪' },
      { label: 'Estoque Baixo', value: stats.low_stock || 0, icon: '⚠️' },
      { label: 'Sem Estoque', value: stats.out_of_stock || 0, icon: '🚫' },
    ].map(s => `<div class="stat-card"><div class="stat-value">${s.icon} ${s.value}</div><div class="stat-label">${s.label}</div></div>`).join('');
    document.getElementById('productTable').innerHTML = products.length === 0
      ? '<p style="color:var(--muted)">Nenhum produto encontrado.</p>'
      : `<table><thead><tr><th></th><th>Produto</th><th>Categoria</th><th>Tipo</th><th>Preco</th><th>Custo</th><th>Estoque</th><th>Acoes</th></tr></thead><tbody>${products.map(p => {
        const img = p.featured_image || (p.images && p.images[0]) ? `<img src="${esc(p.featured_image || p.images[0])}" class="product-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="product-img-placeholder" style="display:none">${p.type === 'service' ? '🛎️' : p.type === 'digital' ? '📱' : '📦'}</div>` : `<div class="product-img-placeholder">${p.type === 'service' ? '🛎️' : p.type === 'digital' ? '📱' : '📦'}</div>`;
        const stockClass = !p.track_stock ? '' : p.stock <= 0 ? 'color:var(--danger);font-weight:700' : p.stock <= p.low_stock_threshold ? 'color:var(--warning);font-weight:600' : '';
        return `<tr><td>${img}</td><td><strong>${esc(p.name)}</strong>${p.brand ? `<br><small style="color:var(--muted)">${esc(p.brand)}</small>` : ''}</td><td>${esc(p.category || '-')}</td><td>${p.type === 'service' ? '🛎️ Servico' : p.type === 'digital' ? '📱 Digital' : '📦 Fisico'}</td><td>R$ ${(p.price || 0).toFixed(2)}</td><td>${p.cost_price ? 'R$ ' + p.cost_price.toFixed(2) : '-'}</td><td style="${stockClass}">${p.track_stock ? p.stock : '∞'}</td><td><button class="btn btn-sm" onclick="editProduct('${p.id}')">Editar</button></td></tr>`;
      }).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function loadProductCategories() {
  try {
    const cats = await api('/erp/products/categories');
    const sel = document.getElementById('productCategoryFilter');
    if (sel) { sel.innerHTML = '<option value="">Todas categorias</option>' + (cats || []).map(c => `<option value="${esc(c.id)}">${c.icon || ''} ${esc(c.name)}</option>`).join(''); }
  } catch(e) {}
}

function editProduct(id) { window.open(`/admin.html?page=products&edit=${id}`, '_self'); }

// ==================== ERP: ORDERS ====================

async function loadOrders() {
  loading();
  try {
    const params = new URLSearchParams();
    const search = document.getElementById('orderSearch')?.value || '';
    const status = document.getElementById('orderStatusFilter')?.value || '';
    const payment = document.getElementById('orderPaymentFilter')?.value || '';
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (payment) params.set('payment_status', payment);
    const [ordersRes, stats] = await Promise.all([api(`/erp/orders?${params.toString()}`), api('/erp/orders/stats').catch(() => ({}))]);
    const orders = ordersRes.orders || [];
    const s = stats || {};
    document.getElementById('orderStats').innerHTML = [
      { label: 'Total Pedidos', value: s.total || orders.length, icon: '📋' },
      { label: 'Receita Total', value: 'R$ ' + (s.revenue || 0).toFixed(2), icon: '💰' },
      { label: 'Receita Paga', value: 'R$ ' + (s.paid_revenue || 0).toFixed(2), icon: '✅' },
      { label: 'Ticket Medio', value: 'R$ ' + (s.avg_ticket || 0).toFixed(2), icon: '📊' },
    ].map(st => `<div class="stat-card financial-card"><div class="stat-value">${st.icon} ${st.value}</div><div class="stat-label">${st.label}</div></div>`).join('');
    const statusLabel = { pending: 'Pendente', confirmed: 'Confirmado', paid: 'Pago', processing: 'Processando', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado', refunded: 'Reembolsado', expired: 'Expirado' };
    document.getElementById('orderTable').innerHTML = orders.length === 0
      ? '<p style="color:var(--muted)">Nenhum pedido encontrado.</p>'
      : `<table><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Status</th><th>Pagamento</th><th>Data</th><th>Acoes</th></tr></thead><tbody>${orders.map(o => {
        const items = (o.items || []).map(i => `${i.quantity}x ${esc(i.title)}`).join(', ');
        return `<tr class="order-row" onclick="viewOrder('${o.id}')"><td><strong>${esc(o.order_number)}</strong></td><td>${esc(o.customer_name || o.customer_phone || '-')}</td><td class="order-items">${items}</td><td><strong>R$ ${(o.total || 0).toFixed(2)}</strong></td><td><span class="status-badge status-${o.status}">${statusLabel[o.status] || o.status}</span></td><td><span class="status-badge status-${o.payment_status}">${o.payment_status}</span></td><td>${new Date(o.created_at).toLocaleDateString('pt-BR')}</td><td onclick="event.stopPropagation()"><button class="btn btn-sm" onclick="viewOrder('${o.id}')">Ver</button></td></tr>`;
      }).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function viewOrder(id) {
  loading();
  try {
    const o = await api(`/erp/orders/${id}`);
    if (!o) { toast('Pedido nao encontrado', 'error'); return; }
    const items = (o.items || []).map(i => `<tr><td>${esc(i.title)}</td><td>${i.quantity}</td><td>R$ ${(i.unit_price || 0).toFixed(2)}</td><td>R$ ${(i.total || 0).toFixed(2)}</td></tr>`).join('');
    const deliveries = (o.deliveries || []).map(d => `<div>Rastreio: <strong>${esc(d.tracking_code || '-')}</strong> (${d.carrier || '-'}) — ${d.status}</div>`).join('');
    const statusLabel = { pending: 'Pendente', confirmed: 'Confirmado', paid: 'Pago', processing: 'Processando', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado', refunded: 'Reembolsado', expired: 'Expirado' };
    const actions = {
      pending: ['confirmed', 'cancelled'], confirmed: ['paid', 'cancelled'], paid: ['processing', 'refunded'],
      processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [], refunded: [], expired: [],
    };
    const nextActions = actions[o.status] || [];
    let modal = `<div class="modal-overlay" onclick="this.remove()"><div class="modal" onclick="event.stopPropagation()">
      <h2>Pedido #${esc(o.order_number)}</h2>
      <div class="form-row"><div class="form-group"><label>Cliente</label><div>${esc(o.customer_name || '-')}</div></div><div class="form-group"><label>Telefone</label><div>${esc(o.customer_phone || '-')}</div></div></div>
      <div class="form-row"><div class="form-group"><label>Status</label><div><span class="status-badge status-${o.status}">${statusLabel[o.status] || o.status}</span></div></div><div class="form-group"><label>Pagamento</label><div><span class="status-badge status-${o.payment_status}">${o.payment_status}</span></div></div></div>
      <div class="form-row"><div class="form-group"><label>Subtotal</label><div>R$ ${(o.subtotal || 0).toFixed(2)}</div></div><div class="form-group"><label>Frete</label><div>R$ ${(o.shipping || 0).toFixed(2)}</div></div><div class="form-group"><label>Total</label><div style="font-weight:700;font-size:1.2rem;color:var(--primary)">R$ ${(o.total || 0).toFixed(2)}</div></div></div>
      <h3 style="margin-top:1rem">Itens</h3><table><thead><tr><th>Item</th><th>Qtd</th><th>Preco</th><th>Total</th></tr></thead><tbody>${items}</tbody></table>
      ${deliveries ? '<h3 style="margin-top:1rem">Entregas</h3>' + deliveries : ''}
      ${o.notes ? '<div style="margin-top:1rem"><label>Notas:</label><div>' + esc(o.notes) + '</div></div>' : ''}
      ${nextActions.length > 0 ? '<div class="modal-actions" style="margin-top:1rem">' + nextActions.map(s => `<button class="btn btn-primary" onclick="updateOrderStatus('${o.id}','${s}')">${statusLabel[s] || s}</button>`).join('') + `<button class="btn btn-danger" onclick="updateOrderStatus('${o.id}','cancelled')">Cancelar</button></div>` : ''}
      <div class="modal-actions"><button class="btn" onclick="this.closest('.modal-overlay').remove()">Fechar</button></div>
    </div></div>`;
    document.body.insertAdjacentHTML('beforeend', modal);
  } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function updateOrderStatus(orderId, status) {
  try {
    await api(`/erp/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Pedido atualizado para: ${status}`, 'success');
    document.querySelector('.modal-overlay')?.remove();
    loadOrders();
  } catch(e) { toast(e.message, 'error'); }
}

// ==================== ERP: STOCK ====================

async function loadStock() {
  loading();
  try {
    const search = document.getElementById('stockSearch')?.value || '';
    const [products, stats] = await Promise.all([
      api(`/erp/products?search=${search}&is_active=true&limit=200`).then(r => r.products || []),
      api('/erp/products/stats').catch(() => ({})),
    ]);
    const lowStock = await api('/erp/products/low-stock?threshold=5').catch(() => []);
    document.getElementById('stockStats').innerHTML = [
      { label: 'Produtos Ativos', value: stats.total || 0, icon: '📦' },
      { label: 'Unidades em Estoque', value: (stats.by_type || []).reduce((s, t) => s + (t.total_stock || 0), 0), icon: '🏪' },
      { label: 'Valor em Estoque', value: 'R$ ' + (stats.by_type || []).reduce((s, t) => s + (t.inventory_value || 0), 0).toFixed(2), icon: '💰' },
      { label: 'Estoque Baixo', value: lowStock.length, icon: '⚠️' },
    ].map(s => `<div class="stat-card"><div class="stat-value">${s.icon} ${s.value}</div><div class="stat-label">${s.label}</div></div>`).join('');
    document.getElementById('stockTable').innerHTML = products.length === 0
      ? '<p style="color:var(--muted)">Nenhum produto encontrado.</p>'
      : `<table><thead><tr><th>Produto</th><th>SKU</th><th>Preco</th><th>Custo</th><th>Estoque</th><th>Min.</th><th>Status</th></tr></thead><tbody>${products.map(p => {
        const stockClass = !p.track_stock ? '' : p.stock <= 0 ? 'color:var(--danger);font-weight:700' : p.stock <= p.low_stock_threshold ? 'color:var(--warning);font-weight:600' : '';
        const statusBadge = !p.track_stock ? '<span class="status-badge" style="background:#6b7280">N/A</span>' : p.stock <= 0 ? '<span class="status-badge status-cancelled">Sem estoque</span>' : p.stock <= p.low_stock_threshold ? '<span class="status-badge status-pending">Baixo</span>' : '<span class="status-badge status-delivered">OK</span>';
        return `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.sku || '-')}</td><td>R$ ${(p.price || 0).toFixed(2)}</td><td>${p.cost_price ? 'R$ ' + p.cost_price.toFixed(2) : '-'}</td><td style="${stockClass}"><strong>${p.track_stock ? p.stock : '∞'}</strong></td><td>${p.low_stock_threshold || '-'}</td><td>${statusBadge}</td></tr>`;
      }).join('')}</tbody></table>`;
    document.getElementById('lowStockAlerts').innerHTML = lowStock.length > 0
      ? '<h3 style="color:var(--danger)">Alertas de Estoque Baixo</h3>' + lowStock.map(p => `<div class="stock-alert"><span class="stock-name">${esc(p.name)}</span><span class="stock-count">${p.stock} / ${p.low_stock_threshold} min</span></div>`).join('')
      : '';
  } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

// ==================== ERP: FINANCE ====================

async function loadFinance() {
  loading();
  try {
    const [dash, transactions] = await Promise.all([
      api('/erp/finance/dashboard').catch(() => ({})),
      api('/erp/transactions?limit=50').then(r => r.transactions || []).catch(() => []),
    ]);
    const d = dash || {};
    document.getElementById('financeDashboard').innerHTML = [
      { label: 'Receita Total', value: 'R$ ' + (d.total_revenue || 0).toFixed(2), icon: '📈', cls: 'trend-up' },
      { label: 'Despesas', value: 'R$ ' + (d.total_expenses || 0).toFixed(2), icon: '📉', cls: 'trend-down' },
      { label: 'Lucro Liquido', value: 'R$ ' + (d.net_profit || 0).toFixed(2), icon: d.net_profit >= 0 ? '✅' : '❌', cls: d.net_profit >= 0 ? 'trend-up' : 'trend-down' },
      { label: 'A Receber', value: 'R$ ' + (d.pending_income || 0).toFixed(2), icon: '⏳', cls: '' },
    ].map(s => `<div class="stat-card financial-card"><div class="stat-value">${s.icon} ${s.value}</div><div class="stat-label ${s.cls}">${s.label}</div></div>`).join('');
    document.getElementById('transactionTable').innerHTML = transactions.length === 0
      ? '<p style="color:var(--muted)">Nenhuma transacao encontrada.</p>'
      : `<table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descricao</th><th>Valor</th><th>Metodo</th><th>Status</th></tr></thead><tbody>${transactions.map(t => {
        const amount = (t.amount || 0).toFixed(2);
        const color = t.type === 'income' ? 'color:var(--success)' : t.type === 'expense' ? 'color:var(--danger)' : '';
        return `<tr><td>${new Date(t.created_at).toLocaleDateString('pt-BR')}</td><td>${t.type === 'income' ? '📈 Receita' : t.type === 'expense' ? '📉 Despesa' : '↩️ Reembolso'}</td><td>${esc(t.category || '-')}</td><td>${esc(t.description || '-')}</td><td style="${color};font-weight:600">${t.type === 'income' ? '+' : '-'}R$ ${amount}</td><td>${t.payment_method || '-'}</td><td><span class="status-badge status-${t.status}">${t.status}</span></td></tr>`;
      }).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

// ==================== ERP: SUPPLIERS ====================

async function loadSuppliers() {
  loading();
  try {
    const search = document.getElementById('supplierSearch')?.value || '';
    const [suppliersRes, stats] = await Promise.all([
      api(`/erp/suppliers?search=${search}`).then(r => r.suppliers || []),
      api('/erp/suppliers/stats').catch(() => ({})),
    ]);
    document.getElementById('supplierStats').innerHTML = `<div class="stat-card"><div class="stat-value">🏭 ${stats.total || suppliersRes.length}</div><div class="stat-label">Fornecedores</div></div><div class="stat-card"><div class="stat-value">✅ ${stats.active || 0}</div><div class="stat-label">Ativos</div></div>`;
    document.getElementById('supplierTable').innerHTML = suppliersRes.length === 0
      ? '<p style="color:var(--muted)">Nenhum fornecedor encontrado. Clique em + Novo Fornecedor para cadastrar.</p>'
      : `<table><thead><tr><th>Nome</th><th>Contato</th><th>Categoria</th><th>Telefone</th><th>WhatsApp</th><th>Prazo Entrega</th><th>Condicoes</th><th>Acoes</th></tr></thead><tbody>${suppliersRes.map(s => {
        return `<tr><td><strong>${esc(s.name)}</strong>${s.trade_name ? `<br><small style="color:var(--muted)">${esc(s.trade_name)}</small>` : ''}</td><td>${esc(s.contact_name || '-')}</td><td>${esc(s.category || '-')}</td><td>${esc(s.phone || '-')}</td><td>${s.whatsapp ? `<a href="https://wa.me/${s.whatsapp.replace(/\D/g, '')}" target="_blank">${esc(s.whatsapp)}</a>` : '-'}</td><td>${s.delivery_time_days ? s.delivery_time_days + ' dias' : '-'}</td><td>${esc(s.payment_terms || '-')}</td><td><button class="btn btn-sm" onclick="editSupplier('${s.id}')">Editar</button></td></tr>`;
      }).join('')}</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function editSupplier(id) {
  const s = id ? await api(`/erp/suppliers/${id}`).catch(() => null) : null;
  const title = s ? 'Editar Fornecedor' : 'Novo Fornecedor';
  let modal = `<div class="modal-overlay" onclick="this.remove()"><div class="modal" onclick="event.stopPropagation()"><h2>${title}</h2>
    <div class="form-row"><div class="form-group"><label>Nome *</label><input type="text" id="supName" class="input" value="${s ? esc(s.name) : ''}" required></div><div class="form-group"><label>Nome Fantasia</label><input type="text" id="supTradeName" class="input" value="${s ? esc(s.trade_name || '') : ''}"></div></div>
    <div class="form-row"><div class="form-group"><label>CNPJ/CPF</label><input type="text" id="supDocument" class="input" value="${s ? esc(s.document || '') : ''}"></div><div class="form-group"><label>Categoria</label><input type="text" id="supCategory" class="input" value="${s ? esc(s.category || '') : ''}" placeholder="Ex: perfumaria, embalagens"></div></div>
    <div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="supEmail" class="input" value="${s ? esc(s.email || '') : ''}"></div><div class="form-group"><label>Telefone</label><input type="text" id="supPhone" class="input" value="${s ? esc(s.phone || '') : ''}"></div></div>
    <div class="form-row"><div class="form-group"><label>WhatsApp</label><input type="text" id="supWhatsapp" class="input" value="${s ? esc(s.whatsapp || '') : ''}"></div><div class="form-group"><label>Contato Principal</label><input type="text" id="supContactName" class="input" value="${s ? esc(s.contact_name || '') : ''}"></div></div>
    <div class="form-row"><div class="form-group"><label>Cidade</label><input type="text" id="supCity" class="input" value="${s ? esc(s.city || '') : ''}"></div><div class="form-group"><label>Estado</label><input type="text" id="supState" class="input" value="${s ? esc(s.state || '') : ''}"></div></div>
    <div class="form-row"><div class="form-group"><label>Condicoes de Pagamento</label><input type="text" id="supPaymentTerms" class="input" value="${s ? esc(s.payment_terms || '') : ''}" placeholder="Ex: 30/60/90 dias"></div><div class="form-group"><label>Prazo de Entrega (dias)</label><input type="number" id="supDeliveryDays" class="input" value="${s ? s.delivery_time_days || '' : ''}"></div></div>
    <div class="form-row"><div class="form-group" style="width:100%"><label>Notas</label><textarea id="supNotes" class="input" style="height:80px">${s ? esc(s.notes || '') : ''}</textarea></div></div>
    <div class="modal-actions"><button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancelar</button><button class="btn btn-primary" onclick="saveSupplier('${id || ''}')">${s ? 'Salvar' : 'Criar'}</button></div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', modal);
}

async function saveSupplier(id) {
  const data = { name: document.getElementById('supName').value, trade_name: document.getElementById('supTradeName').value, document: document.getElementById('supDocument').value, category: document.getElementById('supCategory').value, email: document.getElementById('supEmail').value, phone: document.getElementById('supPhone').value, whatsapp: document.getElementById('supWhatsapp').value, contact_name: document.getElementById('supContactName').value, city: document.getElementById('supCity').value, state: document.getElementById('supState').value, payment_terms: document.getElementById('supPaymentTerms').value, delivery_time_days: parseInt(document.getElementById('supDeliveryDays').value) || null, notes: document.getElementById('supNotes').value };
  try {
    if (id) { await api(`/erp/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await api('/erp/suppliers', { method: 'POST', body: JSON.stringify(data) }); }
    toast(id ? 'Fornecedor atualizado!' : 'Fornecedor criado!', 'success');
    document.querySelector('.modal-overlay')?.remove();
    loadSuppliers();
  } catch(e) { toast(e.message, 'error'); }
}

// ==================== ERP: SITE CMS ====================

async function loadSiteCMS() {
  loading();
  try {
    const sections = await api('/erp/site/sections/all?language=pt-BR').then(r => r.sections || []);
    document.getElementById('sectionList').innerHTML = sections.length === 0
      ? '<p style="color:var(--muted)">Nenhuma secao configurada. Clique em + Nova Secao para comecar.</p>'
      : sections.map(s => `<div class="section-card" onclick="editSection('${s.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><strong>${esc(s.section_key)}</strong><span class="section-type-badge">${s.type}</span></div>
          <div><span class="status-badge ${s.is_active ? 'status-active' : 'status-cancelled'}">${s.is_active ? 'Ativo' : 'Inativo'}</span> <small style="color:var(--muted)">Posicao: ${s.position}</small></div>
        </div>
        <div style="margin-top:0.5rem;color:var(--muted);font-size:0.85rem">${esc(typeof s.title === 'object' ? (s.title['pt-BR'] || s.title['en-US'] || '') : (s.title || ''))}</div>
      </div>`).join('');
  } catch(e) { toast(e.message, 'error'); } finally { loading(false); }
}

async function editSection(id) {
  const s = id ? await api(`/erp/site/sections/${id}`).catch(() => null) : null;
  const title = s ? 'Editar Secao' : 'Nova Secao';
  const types = ['hero', 'features', 'cta', 'testimonials', 'faq', 'banner', 'how_it_works', 'pricing', 'gallery', 'custom'];
  let modal = `<div class="modal-overlay" onclick="this.remove()"><div class="modal" onclick="event.stopPropagation()"><h2>${title}</h2>
    <div class="form-row"><div class="form-group"><label>Chave (key) *</label><input type="text" id="secKey" class="input" value="${s ? esc(s.section_key) : ''}" placeholder="Ex: landing_hero"></div><div class="form-group"><label>Tipo</label><select id="secType" class="input">${types.map(t => `<option value="${t}" ${s && s.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="form-group"><label>Titulo (pt-BR)</label><input type="text" id="secTitlePt" class="input" value="${s && s.title ? esc(s.title['pt-BR'] || '') : ''}"></div><div class="form-group"><label>Titulo (en-US)</label><input type="text" id="secTitleEn" class="input" value="${s && s.title ? esc(s.title['en-US'] || '') : ''}"></div></div>
    <div class="form-row"><div class="form-group"><label>Subtitulo (pt-BR)</label><input type="text" id="secSubtitlePt" class="input" value="${s && s.subtitle ? esc(s.subtitle['pt-BR'] || '') : ''}"></div></div>
    <div class="form-row"><div class="form-group" style="width:100%"><label>Itens (JSON)</label><textarea id="secItems" class="input" style="height:150px;font-size:0.8rem">${s && s.items ? JSON.stringify(s.items, null, 2) : '[]'}</textarea></div></div>
    <div class="form-row"><div class="form-group" style="width:100%"><label>Configuracoes (JSON)</label><textarea id="secSettings" class="input" style="height:80px;font-size:0.8rem">${s && s.settings ? JSON.stringify(s.settings, null, 2) : '{}'}</textarea></div></div>
    <div class="form-row"><div class="form-group"><label>Posicao</label><input type="number" id="secPosition" class="input" value="${s ? s.position : 0}"></div><div class="form-group"><label>Ativo</label><select id="secActive" class="input"><option value="1" ${!s || s.is_active ? 'selected' : ''}>Sim</option><option value="0" ${s && !s.is_active ? 'selected' : ''}>Nao</option></select></div></div>
    <div class="modal-actions">${s ? `<button class="btn btn-danger" onclick="deleteSection('${id}')">Excluir</button>` : ''}<button class="btn" onclick="this.closest('.modal-overlay').remove()">Cancelar</button><button class="btn btn-primary" onclick="saveSection('${id || ''}')">${s ? 'Salvar' : 'Criar'}</button></div>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', modal);
}

async function saveSection(id) {
  let items, settings;
  try { items = JSON.parse(document.getElementById('secItems').value); } catch(e) { items = []; }
  try { settings = JSON.parse(document.getElementById('secSettings').value); } catch(e) { settings = {}; }
  const data = {
    section_key: document.getElementById('secKey').value,
    type: document.getElementById('secType').value,
    title: { 'pt-BR': document.getElementById('secTitlePt').value, 'en-US': document.getElementById('secTitleEn').value },
    subtitle: { 'pt-BR': document.getElementById('secSubtitlePt').value },
    items, settings,
    position: parseInt(document.getElementById('secPosition').value) || 0,
    is_active: document.getElementById('secActive').value === '1',
  };
  try {
    if (id) { await api(`/erp/site/sections/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await api('/erp/site/sections', { method: 'POST', body: JSON.stringify(data) }); }
    toast(id ? 'Secao atualizada!' : 'Secao criada!', 'success');
    document.querySelector('.modal-overlay')?.remove();
    loadSiteCMS();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteSection(id) {
  if (!confirm('Excluir esta secao?')) return;
  try {
    await api(`/erp/site/sections/${id}`, { method: 'DELETE' });
    toast('Secao excluida!', 'success');
    document.querySelector('.modal-overlay')?.remove();
    loadSiteCMS();
  } catch(e) { toast(e.message, 'error'); }
}

function initRealtime() {
  try {
    socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 3000, auth: { token: token, userId: 'admin' } });
    socket.on('connect', () => console.log('[RT] Connected'));
    socket.on('disconnect', () => {});
    socket.on('connect_error', () => {});
    socket.on('xp_update', data => { /* could update dashboard */ });
    socket.on('cognitive_state', data => { /* could show live emotion */ });
    socket.on('new_message', data => { /* could show live messages */ });
  } catch(e) { console.log('[RT] Socket.IO not available'); }
}

// ========== COUPONS ==========

let editingCouponId = null;

async function loadCoupons() {
  loading();
  try {
    const coupons = await api('/erp/coupons');
    const el = document.getElementById('couponsTable');
    if (!coupons.length) { el.innerHTML = '<p style="color:var(--muted);padding:1rem">Nenhum cupom cadastrado.</p>'; loading(false); return; }
    el.innerHTML = `<table><thead><tr><th>Codigo</th><th>Tipo</th><th>Valor</th><th>Min.</th><th>Usos</th><th>Expira</th><th>Status</th><th>Acoes</th></tr></thead><tbody>${
      coupons.map(c => `<tr>
        <td><strong>${esc(c.code)}</strong></td>
        <td>${c.type === 'percentage' ? '%' : 'R$'}</td>
        <td>${c.type === 'percentage' ? `${c.value}%` : `R$ ${parseFloat(c.value).toFixed(2)}`}</td>
        <td>${c.min_value ? `R$ ${parseFloat(c.min_value).toFixed(2)}` : '-'}</td>
        <td>${c.used_count}${c.max_uses ? `/${c.max_uses}` : '/∞'}</td>
        <td>${c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Nunca'}</td>
        <td><span class="badge-${c.is_active ? 'active' : 'inactive'}">${c.is_active ? 'Ativo' : 'Inativo'}</span></td>
        <td><button class="btn btn-sm" onclick="editCoupon(${c.id})">Editar</button> <button class="btn btn-sm btn-danger" onclick="deleteCoupon(${c.id})">Excluir</button></td>
      </tr>`).join('')
    }</tbody></table>`;
  } catch(e) { toast(e.message, 'error'); }
  loading(false);
}

function showCouponModal(coupon) {
  editingCouponId = coupon?.id || null;
  document.getElementById('couponModalTitle').textContent = coupon ? 'Editar Cupom' : 'Novo Cupom';
  document.getElementById('couponCode').value = coupon?.code || '';
  document.getElementById('couponType').value = coupon?.type || 'percentage';
  document.getElementById('couponValue').value = coupon?.value || '';
  document.getElementById('couponMinValue').value = coupon?.min_value || 0;
  document.getElementById('couponMaxUses').value = coupon?.max_uses || '';
  document.getElementById('couponDescription').value = coupon?.description || '';
  document.getElementById('couponExpires').value = coupon?.expires_at ? coupon.expires_at.split('T')[0] : '';
  document.getElementById('couponActive').checked = coupon?.is_active !== false;
  document.getElementById('couponModal').style.display = 'flex';
}

function closeCouponModal() {
  document.getElementById('couponModal').style.display = 'none';
  editingCouponId = null;
}

async function editCoupon(id) {
  try {
    const coupons = await api('/erp/coupons');
    const coupon = coupons.find(c => c.id === id);
    if (coupon) showCouponModal(coupon);
  } catch(e) { toast(e.message, 'error'); }
}

async function saveCoupon() {
  const data = {
    code: document.getElementById('couponCode').value.toUpperCase().trim(),
    type: document.getElementById('couponType').value,
    value: parseFloat(document.getElementById('couponValue').value),
    min_value: parseFloat(document.getElementById('couponMinValue').value) || 0,
    max_uses: document.getElementById('couponMaxUses').value ? parseInt(document.getElementById('couponMaxUses').value) : null,
    description: document.getElementById('couponDescription').value.trim() || null,
    expires_at: document.getElementById('couponExpires').value || null,
    is_active: document.getElementById('couponActive').checked ? 1 : 0,
  };
  if (!data.code || !data.value) { toast('Codigo e valor sao obrigatorios', 'error'); return; }
  try {
    if (editingCouponId) {
      await api(`/erp/coupons/${editingCouponId}`, { method: 'PUT', body: JSON.stringify(data) });
      toast('Cupom atualizado!', 'success');
    } else {
      await api('/erp/coupons', { method: 'POST', body: JSON.stringify(data) });
      toast('Cupom criado!', 'success');
    }
    closeCouponModal();
    loadCoupons();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteCoupon(id) {
  if (!confirm('Excluir este cupom?')) return;
  try {
    await api(`/erp/coupons/${id}`, { method: 'DELETE' });
    toast('Cupom excluido!', 'success');
    loadCoupons();
  } catch(e) { toast(e.message, 'error'); }
}

// ========== DELIVERY SETTINGS ==========

let deliveryZones = [];

async function loadDelivery() {
  loading();
  try {
    const allSettings = await api('/admin/settings');
    document.getElementById('deliveryFee').value = allSettings.store_delivery_fee || 7;
    document.getElementById('freeDeliveryAbove').value = allSettings.store_free_delivery_above || 90;
    const zonesRaw = allSettings.store_delivery_zones || '[]';
    let zones = [];
    try { zones = typeof zonesRaw === 'string' ? JSON.parse(zonesRaw) : []; } catch { zones = []; }
    deliveryZones = zones;
    renderDeliveryZones();
  } catch(e) { toast(e.message, 'error'); }
  loading(false);
}

function renderDeliveryZones() {
  const el = document.getElementById('deliveryZones');
  if (!deliveryZones.length) {
    el.innerHTML = '<p style="color:var(--muted)">Nenhuma zona configurada. Adicione zonas para calculo automatico de frete.</p>';
    return;
  }
  el.innerHTML = deliveryZones.map((z, i) => `<div style="background:var(--sidebar);border-radius:8px;padding:1rem;margin-bottom:0.75rem;display:grid;grid-template-columns:1fr 2fr 1fr 1fr auto;gap:0.75rem;align-items:center">
    <div><label style="color:var(--muted);font-size:0.75rem">Nome</label><input class="input zone-name" value="${esc(z.name)}" style="width:100%"></div>
    <div><label style="color:var(--muted);font-size:0.75rem">Palavras-chave (virgula)</label><input class="input zone-keywords" value="${(z.keywords||[]).join(', ')}" style="width:100%"></div>
    <div><label style="color:var(--muted);font-size:0.75rem">Taxa (R$)</label><input type="number" class="input zone-fee" value="${z.fee}" step="0.01" style="width:100%"></div>
    <div><label style="color:var(--muted);font-size:0.75rem">Prazo (min)</label><input class="input zone-minutes" value="${z.estimated_minutes||'30-45'}" style="width:100%"></div>
    <button class="btn btn-danger" onclick="removeDeliveryZone(${i})" style="padding:0.5rem">X</button>
  </div>`).join('');
}

function addDeliveryZone() {
  deliveryZones.push({ name: '', keywords: [], fee: 5, estimated_minutes: '30-45' });
  renderDeliveryZones();
}

function removeDeliveryZone(i) {
  deliveryZones.splice(i, 1);
  renderDeliveryZones();
}

async function saveDeliverySettings() {
  const zonesFromUI = document.querySelectorAll('#deliveryZones > div');
  const zones = [];
  zonesFromUI.forEach(el => {
    const name = el.querySelector('.zone-name')?.value || '';
    const keywords = (el.querySelector('.zone-keywords')?.value || '').split(',').map(k => k.trim()).filter(Boolean);
    const fee = parseFloat(el.querySelector('.zone-fee')?.value) || 0;
    const minutes = el.querySelector('.zone-minutes')?.value || '30-45';
    if (name) zones.push({ name, keywords, fee, estimated_minutes: minutes });
  });
  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify({ key: 'store_delivery_fee', value: document.getElementById('deliveryFee').value }) });
    await api('/settings', { method: 'PUT', body: JSON.stringify({ key: 'store_free_delivery_above', value: document.getElementById('freeDeliveryAbove').value }) });
    await api('/settings', { method: 'PUT', body: JSON.stringify({ key: 'store_delivery_zones', value: JSON.stringify(zones) }) });
    toast('Configuracoes de entrega salvas!', 'success');
  } catch(e) { toast(e.message, 'error'); }
}