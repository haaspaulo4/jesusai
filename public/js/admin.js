const API = '/api/admin';
let token = localStorage.getItem('jesus_ai_token');
let currentPage = 'dashboard';

const pages = ['dashboard','users','personas','knowledge','surveys','ratings','followups','bots','integrations','settings'];

document.addEventListener('DOMContentLoaded', () => {
  if (!token) { window.location.href = '/'; return; }
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
    if (!res.ok) { window.location.href = '/'; return; }
    const me = await res.json();
    if (me.role !== 'admin') { window.location.href = '/'; }
    const brandName = document.getElementById('brandName');
    if (brandName && me.name) brandName.textContent = me.name;
  } catch { window.location.href = '/'; }
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  const loaders = { dashboard: loadDashboard, users: loadUsers, personas: loadPersonas, knowledge: loadKnowledge, surveys: loadSurveys, ratings: loadRatings, followups: loadFollowups, bots: loadBots, integrations: loadIntegrations, settings: loadSettings };
  loaders[page]?.();
}

function logout() { localStorage.removeItem('jesus_ai_token'); window.location.href = '/'; }
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
    const data = await api('/integrations');
    const entries = Object.entries(data);
    document.getElementById('integrationsList').innerHTML = entries.map(([type, info]) => {
      const items = (info.integrations || []).map(i => `<div class="integration-card"><h4>${i.label || type}</h4><div class="meta">${type} | ${i.healthy ? '<span class="badge-active">OK</span>' : '<span class="badge-inactive">Erro</span>'}</div><div class="actions"><button class="btn btn-sm" onclick="toggleIntegration(${i.id})">${i.is_active ? 'Desativar' : 'Ativar'}</button> <button class="btn btn-sm btn-danger" onclick="removeIntegration(${i.id})">Remover</button></div></div>`).join('');
      return items || `<div class="integration-card"><h4>${info.label || type}</h4><div class="meta">${info.healthy}/${info.total} OK</div></div>`;
    }).join('');
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