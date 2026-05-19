function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeColor(c) {
  if (!c) return '#d4a843';
  const hex = String(c).trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) return hex;
  if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return '#' + hex;
  return '#d4a843';
}

function sanitizeUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (/^(https?:\/\/|\/)[^\s<"']*$/.test(s)) return s;
  return '';
}

function buildPersonaPage(d) {
  const logoUrl = sanitizeUrl(d.brandLogoUrl);
  const favicon = logoUrl
    ? '<link rel="icon" href="' + logoUrl + '">'
    : '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>🤖</text></svg>">';
  const logoImg = d.brandLogoUrl
    ? '<img src="' + d.brandLogoUrl + '" alt="' + escapeHtml(d.brandName) + '" style="height:28px;margin-right:8px;border-radius:4px;">'
    : '<span class="persona-icon">🤖</span>';

  return '<!DOCTYPE html><html lang="pt-BR"><head>' +
  '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<title>' + escapeHtml(d.personaName) + ' — ' + escapeHtml(d.brandName) + '</title>' +
  '<meta name="description" content="' + escapeHtml(d.shortDesc) + '">' +
  '<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/site.css">' +
  favicon +
  '<style>' +
  ':root{--gold:' + sanitizeColor(d.brandPrimaryColor) + ';--dark-bg:' + sanitizeColor(d.brandSecondaryColor) + ';}' +
  '.pl-hero{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8rem 2rem 4rem;}' +
  '.pl-hero-glow{position:absolute;width:500px;height:500px;border-radius:50%;background:' + sanitizeColor(d.brandPrimaryColor) + ';opacity:0.06;filter:blur(120px);top:10%;left:50%;transform:translateX(-50%);pointer-events:none;}' +
  '.pl-avatar{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,' + sanitizeColor(d.brandPrimaryColor) + '22,' + sanitizeColor(d.brandPrimaryColor) + '44);border:2px solid ' + sanitizeColor(d.brandPrimaryColor) + '55;display:flex;align-items:center;justify-content:center;font-size:3rem;margin-bottom:2rem;box-shadow:0 0 40px ' + sanitizeColor(d.brandPrimaryColor) + '22;}' +
  '.pl-badge{display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 1.2rem;border:1px solid ' + sanitizeColor(d.brandPrimaryColor) + '33;border-radius:999px;font-size:0.78rem;color:' + sanitizeColor(d.brandPrimaryColor) + ';background:' + sanitizeColor(d.brandPrimaryColor) + '11;margin-bottom:1.5rem;backdrop-filter:blur(8px);}' +
  '.pl-badge-dot{width:6px;height:6px;border-radius:50%;background:' + sanitizeColor(d.brandPrimaryColor) + ';animation:pulse-glow 2s ease-in-out infinite;}' +
  '.pl-title{font-size:clamp(2.2rem,5vw,3.5rem);font-weight:800;color:var(--text);line-height:1.1;margin-bottom:1rem;letter-spacing:-0.03em;}' +
  '.pl-desc{font-size:1.1rem;color:var(--text-muted);line-height:1.7;max-width:600px;margin:0 auto 2rem;}' +
  '.pl-actions{display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;margin-bottom:3rem;}' +
  '.pl-features{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.25rem;max-width:800px;width:100%;margin:0 auto 4rem;}' +
  '.pl-feature{background:var(--surface-glass);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;text-align:left;transition:all 0.3s ease;}' +
  '.pl-feature:hover{border-color:' + sanitizeColor(d.brandPrimaryColor) + '44;transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,0,0,0.2);}' +
  '.pl-feature-icon{font-size:1.5rem;margin-bottom:0.75rem;}' +
  '.pl-feature h4{color:var(--text);font-size:0.95rem;font-weight:600;margin-bottom:0.3rem;}' +
  '.pl-feature p{color:var(--text-muted);font-size:0.82rem;line-height:1.5;}' +
  '.pl-section{position:relative;z-index:1;padding:4rem 2rem;}' +
  '.pl-section-alt{background:rgba(255,255,255,0.015);}' +
  '.pl-container{max-width:900px;margin:0 auto;}' +
  '.pl-other-personas{display:flex;flex-direction:column;gap:0.75rem;max-width:500px;margin:0 auto;}' +
  '.persona-card-mini{display:flex;align-items:center;gap:1rem;padding:1rem 1.25rem;background:var(--surface-glass);border:1px solid var(--border);border-radius:var(--radius);transition:all 0.25s ease;text-decoration:none;color:var(--text);}' +
  '.persona-card-mini:hover{border-color:' + sanitizeColor(d.brandPrimaryColor) + '44;transform:translateX(4px);}' +
  '.pcm-icon{font-size:1.5rem;}' +
  '.persona-card-mini strong{display:block;font-size:0.95rem;}' +
  '.persona-card-mini small{display:block;color:var(--text-muted);font-size:0.8rem;margin-top:0.15rem;}' +
  '.pcm-arrow{margin-left:auto;color:' + sanitizeColor(d.brandPrimaryColor) + ';font-weight:600;}' +
  '.pl-identity-rules{background:var(--surface-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:2rem;margin-bottom:2rem;}' +
  '.pl-identity-rules h3{color:' + sanitizeColor(d.brandPrimaryColor) + ';font-size:0.85rem;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1rem;}' +
  '.pl-rule-item{display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:0.75rem;font-size:0.88rem;color:var(--text-muted);line-height:1.5;}' +
  '.pl-disclaimer{font-size:0.8rem;color:var(--text-muted);opacity:0.7;line-height:1.6;max-width:600px;margin:2rem auto 0;text-align:center;}' +
  '@media(max-width:600px){.pl-hero{padding:7rem 1.5rem 3rem;}.pl-features{grid-template-columns:1fr;}}' +
  '</style></head><body>' +
  '<div class="landing" id="landingPage">' +
  '<div class="landing-bg"><div class="bg-gradient"></div><div class="bg-grid"></div><div class="bg-orbs"><div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div></div></div>' +
  '<div class="pl-hero-glow"></div>' +
  '<nav class="site-nav"><div class="site-nav-inner">' +
  '<a href="/" class="site-logo">' + logoImg + ' <span>' + escapeHtml(d.brandName) + '</span></a>' +
  '<div class="site-nav-links"><a href="/site">Plataforma</a><a href="#features">Recursos</a><a href="#personas">Personas</a></div>' +
  '<button class="nav-cta-btn" onclick="startChat()">Conversar</button>' +
  '</div></nav>' +
  '<section class="pl-hero">' +
  '<div class="pl-avatar">🤖</div>' +
  '<div class="pl-badge"><span class="pl-badge-dot"></span>' + (d.hasKnowledge ? 'RAG Multimodal' : 'IA Assistente') + '</div>' +
  '<h1 class="pl-title">' + escapeHtml(d.welcomeTitle) + '</h1>' +
  '<p class="pl-desc">' + escapeHtml(d.welcomeBody) + '</p>' +
  '<div class="pl-actions">' +
  '<button class="hero-btn primary" onclick="startChat()"><span>Começar a conversar</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>' +
  '<a href="/site" class="hero-btn secondary">Ver todas as personas</a>' +
  '</div>' +
  '<div class="pl-features" id="features">' +
  '<div class="pl-feature"><div class="pl-feature-icon">💬</div><h4>Conversa inteligente</h4><p>Respostas fundamentadas' + (d.hasKnowledge ? ' no conhecimento indexado' : '') + ', com memória e contexto.</p></div>' +
  '<div class="pl-feature"><div class="pl-feature-icon">🧠</div><h4>Memória e contexto</h4><p>Lembra do seu nome, seus interesses e suas conversas anteriores.</p></div>' +
  '<div class="pl-feature"><div class="pl-feature-icon">🔊</div><h4>Voz natural</h4><p>Ouça as respostas em áudio com TTS em português, inglês ou espanhol.</p></div>' +
  '<div class="pl-feature"><div class="pl-feature-icon">🌍</div><h4>3 idiomas</h4><p>Responde automaticamente no idioma que você usar.</p></div>' +
  '</div></section>' +
  (d.identityRulesHtml ? '<section class="pl-section pl-section-alt"><div class="pl-container"><div class="pl-identity-rules"><h3>Como ' + escapeHtml(d.personaName) + ' funciona</h3>' + d.identityRulesHtml + '</div></div></section>' : '') +
  (d.disclaimer ? '<section class="pl-section"><div class="pl-container" style="text-align:center;"><p class="pl-disclaimer">' + escapeHtml(d.disclaimer) + '</p></div></section>' : '') +
  (d.otherPersonasHtml ? '<section class="pl-section pl-section-alt" id="personas"><div class="pl-container"><div style="text-align:center;margin-bottom:2.5rem;"><div class="section-label" style="color:' + sanitizeColor(d.brandPrimaryColor) + ';">Multi-Persona</div><h2 class="section-title" style="background:linear-gradient(135deg,var(--text),' + sanitizeColor(d.brandPrimaryColor) + ');-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Outras personas disponíveis</h2><p class="section-subtitle">Cada persona tem identidade, conhecimento e voz próprios.</p></div><div class="pl-other-personas">' + d.otherPersonasHtml + '<a href="/site" class="hero-btn secondary" style="text-align:center;margin-top:0.5rem;">Ver todas as personas →</a></div></div></section>' : '') +
  '<section class="pl-section" style="text-align:center;padding:4rem 2rem;"><div class="pl-container">' +
  '<h2 style="font-size:clamp(1.5rem,3vw,2rem);font-weight:800;color:var(--text);margin-bottom:0.5rem;">Pronto para conversar?</h2>' +
  '<p style="color:var(--text-muted);margin-bottom:2rem;">Comece agora — grátis, sem fila, 24 horas por dia.</p>' +
  '<button class="hero-btn primary" onclick="startChat()" style="font-size:1.05rem;padding:1rem 2.5rem;">Conversar com ' + escapeHtml(d.personaName) + ' <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:0.5rem;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>' +
  '</div></section>' +
  '<footer style="text-align:center;padding:2rem;border-top:1px solid var(--border);position:relative;z-index:1;">' +
  '<p style="color:var(--text-muted);font-size:0.82rem;">' + escapeHtml(d.brandName) + ' © ' + new Date().getFullYear() + ' · <a href="/site" style="color:' + sanitizeColor(d.brandPrimaryColor) + ';text-decoration:none;">Plataforma</a> · <a href="/admin" style="color:var(--text-muted);text-decoration:none;">Admin</a></p>' +
  '</footer></div>' +
   '<script>const PERSONA_ID=\'' + escapeHtml(d.personaId).replace(/'/g, "\\'") + '\';function startChat(){window.location.href=\'/?persona=\'+PERSONA_ID;}</script>' +
  '</body></html>';
}

function buildSitePage(d) {
  const logoUrl = sanitizeUrl(d.brandLogoUrl);
  const favicon = logoUrl
    ? '<link rel="icon" href="' + logoUrl + '">'
    : '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>🤖</text></svg>">';
  const logoImg = logoUrl
    ? '<img src="' + logoUrl + '" alt="' + escapeHtml(d.brandName) + '" style="height:28px;margin-right:8px;border-radius:4px;">'
    : '<span class="persona-icon">🤖</span>';
  const footerLogo = logoUrl
    ? '<img src="' + logoUrl + '" alt="' + escapeHtml(d.brandName) + '" style="height:24px;margin-right:8px;border-radius:4px;">'
    : '<span class="persona-icon">🤖</span>';

  const personaCards = d.personas.map(function(p) {
    const identity = p.identity?.[d.lang] || p.identity?.['pt-BR'] || p.identity || '';
    const identityStr = typeof identity === 'string' ? identity : (identity?.core || '');
    const shortDesc = identityStr.split('.')[0] || p.name;
    const pName = d.lang === 'en-US' ? (p.nameEn || p.name) : (d.lang === 'es-ES' ? (p.nameEs || p.name) : p.name);
    const kCount = (p.knowledgeSources || []).length;
    const badges = '<span class="spc-badge">📚 ' + kCount + ' fonte' + (kCount !== 1 ? 's' : '') + '</span><span class="spc-badge">🔊 Voz</span><span class="spc-badge">🌍 3 idiomas</span>';
    return '<a href="/p/' + p.id + '" class="site-persona-card">' +
      '<div class="spc-avatar">🤖</div>' +
      '<h3>' + escapeHtml(pName) + '</h3>' +
      '<p>' + escapeHtml(shortDesc) + '</p>' +
      '<div class="spc-badges">' + badges + '</div>' +
      '<span class="spc-cta">Conversar →</span></a>';
  }).join('\n');

  const personaFooter = d.personas.slice(0, 5).map(function(p) {
    return '<a href="/p/' + p.id + '">' + escapeHtml(p.name) + '</a>';
  }).join('\n          ');

  return '<!DOCTYPE html><html lang="pt-BR"><head>' +
  '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<title>' + escapeHtml(d.brandName) + ' — ' + escapeHtml(d.brandTagline || 'Plataforma Whitelabel de IA') + '</title>' +
  '<meta name="description" content="' + escapeHtml(d.brandTagline || 'Plataforma whitelabel de assistentes virtuais com RAG multimodal, multi-persona e onboarding automático.') + '">' +
  '<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/site.css">' +
  favicon +
  '<style>:root{--gold:' + sanitizeColor(d.brandPrimaryColor) + ';--dark-bg:' + sanitizeColor(d.brandSecondaryColor) + ';}' +
  '.spc-avatar{width:64px;height:64px;border-radius:50%;background:' + sanitizeColor(d.brandPrimaryColor) + '18;border:2px solid ' + sanitizeColor(d.brandPrimaryColor) + '44;display:flex;align-items:center;justify-content:center;font-size:2rem;margin-bottom:1rem;}' +
  '.spc-badges{display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.75rem;margin-bottom:0.75rem;}' +
  '.spc-badge{font-size:0.7rem;padding:0.2rem 0.6rem;border-radius:999px;background:' + sanitizeColor(d.brandPrimaryColor) + '15;color:' + sanitizeColor(d.brandPrimaryColor) + ';border:1px solid ' + sanitizeColor(d.brandPrimaryColor) + '22;}' +
  '.site-persona-card h3{color:var(--text);font-size:1.15rem;font-weight:700;}' +
  '.site-persona-card p{color:var(--text-muted);font-size:0.88rem;line-height:1.5;}' +
  '.spc-cta{margin-top:auto;color:' + sanitizeColor(d.brandPrimaryColor) + ';font-size:0.85rem;font-weight:600;display:inline-flex;align-items:center;gap:0.3rem;transition:gap 0.2s;}' +
  '.site-persona-card:hover .spc-cta{gap:0.6rem;}' +
  '.create-persona-cta{text-align:center;padding:3rem 2rem;background:linear-gradient(135deg,' + sanitizeColor(d.brandPrimaryColor) + '08,' + sanitizeColor(d.brandSecondaryColor) + '22);border:2px dashed ' + sanitizeColor(d.brandPrimaryColor) + '33;border-radius:var(--radius-lg);}' +
  '.create-persona-cta h3{font-size:1.3rem;font-weight:700;color:var(--text);margin-bottom:0.5rem;}' +
  '.create-persona-cta p{color:var(--text-muted);margin-bottom:1.5rem;font-size:0.95rem;}' +
  '.create-card{border:1px solid ' + sanitizeColor(d.brandPrimaryColor) + '33;border-radius:var(--radius-lg);padding:2rem;display:flex;flex-direction:column;align-items:center;text-align:center;transition:all 0.3s ease;}' +
  '.create-card:hover{border-color:' + sanitizeColor(d.brandPrimaryColor) + '66;box-shadow:0 0 40px ' + sanitizeColor(d.brandPrimaryColor) + '15;}' +
  '.step-num{width:36px;height:36px;border-radius:50%;background:' + sanitizeColor(d.brandPrimaryColor) + '22;color:' + sanitizeColor(d.brandPrimaryColor) + ';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;margin-bottom:1rem;border:1px solid ' + sanitizeColor(d.brandPrimaryColor) + '44;}' +
  '.step-card{background:var(--surface-glass);border:1px solid var(--border);border-radius:var(--radius-lg);padding:2rem;text-align:center;transition:all 0.3s ease;}' +
  '.step-card:hover{border-color:' + sanitizeColor(d.brandPrimaryColor) + '44;transform:translateY(-4px);}' +
  '.step-card h4{color:var(--text);font-weight:600;margin-bottom:0.5rem;}' +
  '.step-card p{color:var(--text-muted);font-size:0.85rem;line-height:1.5;}' +
  '</style></head><body>' +
  '<nav class="site-nav"><div class="site-nav-inner">' +
  '<a href="/" class="site-logo">' + logoImg + ' <span>' + escapeHtml(d.brandName) + '</span></a>' +
  '<div class="site-nav-links"><a href="#personas">Personas</a><a href="#create">Criar Persona</a><a href="#platform">Plataforma</a><a href="#tech">Tecnologia</a></div>' +
  '<button class="nav-cta-btn" onclick="window.location.href=\'/\'">Começar</button>' +
  '<button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Menu"><span></span><span></span><span></span></button>' +
  '</div></nav>' +
  '<section class="site-hero"><div class="landing-bg"><div class="bg-gradient"></div><div class="bg-grid"></div><div class="bg-orbs"><div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div></div></div>' +
  '<div class="site-hero-content">' +
  '<div class="site-hero-badge">Plataforma Whitelabel de IA</div>' +
  '<h1>Qual persona<br><span class="gold">você precisa?</span></h1>' +
  '<p class="site-hero-sub">' + escapeHtml(d.brandTagline || 'Crie assistentes virtuais com identidade própria, conhecimento real e voz natural. Ou escolha uma persona pronta e comece a conversar agora.') + '</p>' +
  '<div class="site-hero-actions"><a href="#personas" class="hero-btn primary">Explorar personas</a><a href="#create" class="hero-btn secondary">Criar do zero</a></div>' +
  '</div></section>' +
  '<section class="site-section" id="personas"><div class="site-container">' +
  '<h2 class="section-title">Personas disponíveis</h2><p class="section-subtitle">Cada persona tem identidade, conhecimento e voz próprios. Escolha, clique e converse.</p>' +
  '<div class="site-personas">' + personaCards +
  '<div class="site-persona-card create-card" style="cursor:default;"><div class="spc-avatar">✨</div><h3>Criar nova persona</h3><p>Descreva em texto livre o que você precisa. A IA gera identidade, regras, conhecimento e voz automaticamente.</p><span class="spc-cta" style="color:var(--text-muted);">Meta-RAG →</span></div>' +
  '</div></div></section>' +
  '<section class="site-section site-section-alt" id="create"><div class="site-container">' +
  '<div class="create-persona-cta"><h3>✨ Crie qualquer persona com Meta-RAG</h3><p>Descreva em texto livre o assistente que você precisa. A IA gera tudo automaticamente.</p></div>' +
  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.25rem;margin-top:2.5rem;">' +
  '<div class="step-card"><div class="step-num">1</div><h4>Descreva</h4><p>Escreva em português, inglês ou espanhol o que a persona deve ser e fazer.</p></div>' +
  '<div class="step-card"><div class="step-num">2</div><h4>IA gera</h4><p>Meta-RAG cria identidade, regras, personalidade, tópicos e voz automaticamente.</p></div>' +
  '<div class="step-card"><div class="step-num">3</div><h4>Converse</h4><p>Sua persona está pronta. Alimente com conhecimento e comece a conversar.</p></div>' +
  '</div><div style="text-align:center;margin-top:2rem;"><a href="/" class="hero-btn primary">Começar agora</a></div></div></section>' +
  '<section class="site-section" id="platform"><div class="site-container"><h2 class="section-title">A plataforma</h2><p class="section-subtitle">Tudo que você precisa para lançar seu assistente virtual.</p>' +
  '<div class="site-grid-2">' +
  '<div class="site-feature"><div class="site-feature-icon">💬</div><div><h3>Conversa inteligente</h3><p>RAG multimodal busca conhecimento real antes de responder. Não é alucinação — é fundamentação.</p></div></div>' +
  '<div class="site-feature"><div class="site-feature-icon">🎭</div><div><h3>Multi-Persona com Meta-RAG</h3><p>Descreva uma persona em texto e a IA cria tudo — identidade, regras, conhecimento, voz.</p></div></div>' +
  '<div class="site-feature"><div class="site-feature-icon">👋</div><div><h3>Onboarding automático</h3><p>Novo usuário? A IA pergunta nome, interesse, sentimento. State machine configurável.</p></div></div>' +
  '<div class="site-feature"><div class="site-feature-icon">🔊</div><div><h3>Voz natural</h3><p>Kokoro TTS com vozes por persona. Português, inglês, espanhol. Texto e áudio simultâneos.</p></div></div>' +
  '<div class="site-feature"><div class="site-feature-icon">📱</div><div><h3>Multi-plataforma</h3><p>Web, Telegram e WhatsApp. Múltiplas instâncias com persona diferente em cada bot.</p></div></div>' +
  '<div class="site-feature"><div class="site-feature-icon">🔒</div><div><h3>Segurança e controle</h3><p>Role-based access, rate limiting, JWT, OAuth. Painel admin completo.</p></div></div>' +
  '<div class="site-feature"><div class="site-feature-icon">📊</div><div><h3>Surveys e ratings</h3><p>Pesquisas com triggers automáticos. Avaliações 1-5 estrelas. Follow-ups inteligentes.</p></div></div>' +
  '<div class="site-feature"><div class="site-feature-icon">🌐</div><div><h3>Whitelabel completo</h3><p>Marca, cores, logo, mensagens — tudo via API ou painel admin.</p></div></div>' +
  '</div></div></section>' +
  '<section class="site-section site-section-alt" id="tech"><div class="site-container"><h2 class="section-title">Tecnologia</h2><p class="section-subtitle">Stack moderno, open source, extensível.</p>' +
  '<div class="site-grid-4">' +
  '<div class="site-tech-card"><div class="site-tech-icon">⚡</div><h4>Node.js 18+</h4><p>Express + async/await</p></div>' +
  '<div class="site-tech-card"><div class="site-tech-icon">🗄️</div><h4>MySQL 8.4</h4><p>Dados persistentes</p></div>' +
  '<div class="site-tech-card"><div class="site-tech-icon">🧠</div><h4>GLM-5.1</h4><p>LLM com fallback</p></div>' +
  '<div class="site-tech-card"><div class="site-tech-icon">📖</div><h4>TF-IDF RAG</h4><p>Multimodal</p></div>' +
  '<div class="site-tech-card"><div class="site-tech-icon">🎤</div><h4>Kokoro TTS</h4><p>Edge TTS fallback</p></div>' +
  '<div class="site-tech-card"><div class="site-tech-icon">🔑</div><h4>JWT + OAuth</h4><p>Role-based access</p></div>' +
  '<div class="site-tech-card"><div class="site-tech-icon">📱</div><h4>WhatsApp + TG</h4><p>Multi-instance</p></div>' +
  '<div class="site-tech-card"><div class="site-tech-icon">🌍</div><h4>i18n</h4><p>pt-BR, en-US, es-ES</p></div>' +
  '</div></div></section>' +
  '<section class="site-section site-section-cta"><div class="site-container site-cta-content" style="text-align:center;">' +
  '<h2 style="font-size:clamp(1.5rem,3vw,2.5rem);font-weight:800;color:var(--text);margin-bottom:0.75rem;">Crie sua persona. <span style="background:linear-gradient(135deg,' + sanitizeColor(d.brandPrimaryColor) + ',' + sanitizeColor(d.brandPrimaryColor) + 'cc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Converse agora.</span></h2>' +
  '<p style="color:var(--text-muted);font-size:1.05rem;margin-bottom:2rem;">Grátis. Sem limite de personas. Conhecimento ilimitado.</p>' +
  '<div class="site-cta-actions"><a href="/" class="hero-btn primary" style="font-size:1.05rem;padding:1rem 2.5rem;">Começar agora</a><a href="#personas" class="hero-btn secondary">Ver personas</a></div>' +
  '</div></section>' +
  '<footer class="site-footer"><div class="site-container"><div class="site-footer-grid">' +
  '<div class="site-footer-col"><div class="site-logo">' + footerLogo + ' <span>' + escapeHtml(d.brandName) + '</span></div><p class="site-footer-desc">' + escapeHtml(d.brandTagline || 'Plataforma whitelabel de assistentes virtuais com RAG multimodal e multi-persona.') + '</p></div>' +
  '<div class="site-footer-col"><h4>Produto</h4><a href="/">Chat</a><a href="/site">Site</a><a href="/admin">Admin</a></div>' +
  '<div class="site-footer-col"><h4>Personas</h4>' + personaFooter + '</div>' +
  '<div class="site-footer-col"><h4>Legal</h4><a href="#">Termos de uso</a><a href="#">Privacidade</a></div>' +
  '</div><div class="site-footer-bottom"><p>© ' + new Date().getFullYear() + ' ' + escapeHtml(d.brandName) + '. Todos os direitos reservados.</p></div></div></footer>' +
  '<script>document.getElementById("mobileMenuBtn").addEventListener("click",function(){document.querySelector(".site-nav-links").classList.toggle("active")});document.querySelectorAll(".site-nav-links a").forEach(function(a){a.addEventListener("click",function(){document.querySelector(".site-nav-links").classList.remove("active")})});</script>' +
  '</body></html>';
}

function buildCreatePersonaPage(d) {
  var logoUrl = sanitizeUrl(d.brandLogoUrl);
  var favicon = logoUrl
    ? '<link rel="icon" href="' + logoUrl + '">'
    : '<link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>🤖</text></svg>">';
  var logoImg = logoUrl
    ? '<img src="' + logoUrl + '" alt="' + escapeHtml(d.brandName) + '" style="height:28px;margin-right:8px;border-radius:4px;">'
    : '<span class="persona-icon">🤖</span>';

  return '<!DOCTYPE html><html lang="pt-BR"><head>' +
  '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<title>Criar Persona — ' + escapeHtml(d.brandName) + '</title>' +
  '<meta name="description" content="Crie sua própria persona com IA. Descreva, personalise e converse.">' +
  '<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/site.css">' +
  favicon +
  '<style>' +
  ':root{--gold:' + sanitizeColor(d.brandPrimaryColor) + ';--dark-bg:' + sanitizeColor(d.brandSecondaryColor) + ';}' +
  '.cp-container{max-width:720px;margin:0 auto;padding:7rem 2rem 4rem;min-height:100vh;position:relative;z-index:1;}' +
  '.cp-back{display:inline-flex;align-items:center;gap:0.5rem;color:var(--text-muted);font-size:0.9rem;text-decoration:none;margin-bottom:2rem;transition:color 0.2s;}' +
  '.cp-back:hover{color:' + sanitizeColor(d.brandPrimaryColor) + ';}' +
  '.cp-title{font-size:clamp(1.8rem,4vw,2.5rem);font-weight:800;color:var(--text);margin-bottom:0.5rem;letter-spacing:-0.02em;}' +
  '.cp-subtitle{color:var(--text-muted);font-size:1rem;margin-bottom:2.5rem;line-height:1.6;}' +
  '.cp-subtitle span{color:' + sanitizeColor(d.brandPrimaryColor) + ';font-weight:600;}' +
  '.cp-steps{display:flex;gap:0.5rem;margin-bottom:2.5rem;}' +
  '.cp-step{flex:1;height:4px;border-radius:2px;background:var(--border);transition:background 0.3s;}' +
  '.cp-step.active{background:' + sanitizeColor(d.brandPrimaryColor) + ';}' +
  '.cp-step.done{background:' + sanitizeColor(d.brandPrimaryColor) + '88;}' +
  '.cp-form{display:flex;flex-direction:column;gap:1.5rem;}' +
  '.cp-field{display:flex;flex-direction:column;gap:0.5rem;}' +
  '.cp-label{font-weight:600;color:var(--text);font-size:0.9rem;}' +
  '.cp-hint{color:var(--text-muted);font-size:0.8rem;line-height:1.4;}' +
  '.cp-input,.cp-textarea,.cp-select{background:var(--surface-glass);border:1px solid var(--border);border-radius:var(--radius);padding:0.75rem 1rem;color:var(--text);font-size:0.95rem;font-family:inherit;transition:border-color 0.2s;outline:none;}' +
  '.cp-input:focus,.cp-textarea:focus,.cp-select:focus{border-color:' + sanitizeColor(d.brandPrimaryColor) + ';}' +
  '.cp-input::placeholder,.cp-textarea::placeholder{color:var(--text-muted);opacity:0.6;}' +
  '.cp-textarea{min-height:120px;resize:vertical;}' +
  '.cp-select{cursor:pointer;}' +
  '.cp-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}' +
  '.cp-actions{display:flex;gap:0.75rem;margin-top:1rem;}' +
  '.cp-btn{padding:0.75rem 1.5rem;border-radius:var(--radius);font-weight:600;font-size:0.95rem;cursor:pointer;border:none;transition:all 0.2s;}' +
  '.cp-btn-primary{background:' + sanitizeColor(d.brandPrimaryColor) + ';color:#fff;}' +
  '.cp-btn-primary:hover{opacity:0.9;transform:translateY(-1px);}' +
  '.cp-btn-primary:disabled{opacity:0.5;cursor:not-allowed;transform:none;}' +
  '.cp-btn-secondary{background:var(--surface-glass);color:var(--text);border:1px solid var(--border);}' +
  '.cp-btn-secondary:hover{border-color:' + sanitizeColor(d.brandPrimaryColor) + '44;}' +
  '.cp-loading{display:none;align-items:center;gap:0.75rem;color:var(--text-muted);font-size:0.9rem;margin-top:1rem;}' +
  '.cp-loading.show{display:flex;}' +
  '.cp-spinner{width:20px;height:20px;border:2px solid var(--border);border-top-color:' + sanitizeColor(d.brandPrimaryColor) + ';border-radius:50%;animation:spin 0.8s linear infinite;}' +
  '@keyframes spin{to{transform:rotate(360deg);}}' +
  '.cp-result{display:none;margin-top:2rem;padding:2rem;background:var(--surface-glass);border:1px solid ' + sanitizeColor(d.brandPrimaryColor) + '33;border-radius:var(--radius-lg);text-align:center;}' +
  '.cp-result.show{display:block;}' +
  '.cp-result-icon{font-size:3rem;margin-bottom:1rem;}' +
  '.cp-result h3{font-size:1.3rem;font-weight:700;color:var(--text);margin-bottom:0.5rem;}' +
  '.cp-result p{color:var(--text-muted);font-size:0.95rem;margin-bottom:1.5rem;line-height:1.5;}' +
  '.cp-result-details{text-align:left;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1.5rem;max-height:300px;overflow-y:auto;}' +
  '.cp-result-details dt{color:' + sanitizeColor(d.brandPrimaryColor) + ';font-weight:600;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.05em;margin-top:0.75rem;}' +
  '.cp-result-details dt:first-child{margin-top:0;}' +
  '.cp-result-details dd{color:var(--text-muted);font-size:0.88rem;line-height:1.5;margin:0.25rem 0 0;}' +
  '.cp-error{display:none;color:#f44336;font-size:0.9rem;margin-top:1rem;padding:0.75rem;background:rgba(244,67,54,0.08);border-radius:var(--radius);}' +
  '.cp-error.show{display:block;}' +
  '.cp-features{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:2rem;}' +
  '.cp-feature{text-align:center;padding:1rem;}' +
  '.cp-feature-icon{font-size:1.5rem;margin-bottom:0.5rem;}' +
  '.cp-feature p{color:var(--text-muted);font-size:0.82rem;}' +
  '@media(max-width:600px){.cp-row{grid-template-columns:1fr;}.cp-features{grid-template-columns:1fr;}}' +
  '</style></head><body>' +
  '<nav class="site-nav"><div class="site-nav-inner">' +
  '<a href="/" class="site-logo">' + logoImg + ' <span>' + escapeHtml(d.brandName) + '</span></a>' +
  '<div class="site-nav-links"><a href="/site">Plataforma</a><a href="/create-persona">Criar Persona</a></div>' +
  '<button class="nav-cta-btn" onclick="window.location.href=\'/\'">Chat</button>' +
  '</div></nav>' +
  '<div class="cp-container">' +
  '<a href="/site" class="cp-back">← Voltar para personas</a>' +
  '<div class="cp-steps" id="steps">' +
  '<div class="cp-step active" id="step1"></div>' +
  '<div class="cp-step" id="step2"></div>' +
  '<div class="cp-step" id="step3"></div>' +
  '</div>' +
  '<div id="formSection">' +
  '<div id="step1Content">' +
  '<h1 class="cp-title">Crie sua persona</h1>' +
  '<p class="cp-subtitle">Descreva o assistente virtual que você precisa. A <span>IA gera tudo</span> — identidade, regras, personalidade, voz.</p>' +
  '<div class="cp-form">' +
  '<div class="cp-field">' +
  '<label class="cp-label" for="descArea">Descreva sua persona *</label>' +
  '<textarea class="cp-textarea" id="descArea" placeholder="Ex: Um coach de vendas experiente que ajuda equipes a melhorar resultados. Fala de forma direta e prática, com exemplos reais do mercado brasileiro..."></textarea>' +
  '<span class="cp-hint">Quanto mais detalhes, melhor o resultado. Idioma, tom, especialidade, público-alvo.</span>' +
  '</div>' +
  '<div class="cp-row">' +
  '<div class="cp-field">' +
  '<label class="cp-label" for="nameInput">Nome (opcional)</label>' +
  '<input class="cp-input" id="nameInput" placeholder="Ex: Coach de Vendas">' +
  '<span class="cp-hint">Se deixar vazio, a IA escolhe o nome.</span>' +
  '</div>' +
  '<div class="cp-field">' +
  '<label class="cp-label" for="langSelect">Idioma principal</label>' +
  '<select class="cp-select" id="langSelect">' +
  '<option value="pt-BR">Português (BR)</option>' +
  '<option value="en-US">English (US)</option>' +
  '<option value="es-ES">Español (ES)</option>' +
  '</select>' +
  '</div>' +
  '</div>' +
  '<div class="cp-actions">' +
  '<button class="cp-btn cp-btn-primary" id="generateBtn" onclick="generatePersona()">Gerar persona com IA ✨</button>' +
  '</div>' +
  '</div>' +
  '<div class="cp-loading" id="loadingIndicator"><div class="cp-spinner"></div><span>A IA está criando sua persona... (pode levar 30s)</span></div>' +
  '<div class="cp-error" id="errorMsg"></div>' +
  '</div>' +
  '<div id="step2Content" style="display:none;">' +
  '<h1 class="cp-title">Personalize sua persona</h1>' +
  '<p class="cp-subtitle">Revise e ajuste os detalhes. Tudo pode ser editado depois.</p>' +
  '<div class="cp-form">' +
  '<div class="cp-row">' +
  '<div class="cp-field">' +
  '<label class="cp-label" for="editName">Nome</label>' +
  '<input class="cp-input" id="editName">' +
  '</div>' +
  '<div class="cp-field">' +
  '<label class="cp-label" for="editVoice">Voz TTS</label>' +
  '<select class="cp-select" id="editVoice">' +
  '<option value="pm_alex">Masculino PT (Alex)</option>' +
  '<option value="pf_dora">Feminino PT (Dora)</option>' +
  '<option value="am_adam">Masculino EN (Adam)</option>' +
  '<option value="af_bella">Feminino EN (Bella)</option>' +
  '</select>' +
  '</div>' +
  '</div>' +
  '<div class="cp-field">' +
  '<label class="cp-label">Identidade gerada</label>' +
  '<div class="cp-result-details" id="identityPreview"></div>' +
  '</div>' +
  '<div class="cp-actions">' +
  '<button class="cp-btn cp-btn-secondary" onclick="goToStep(1)">← Voltar</button>' +
  '<button class="cp-btn cp-btn-primary" onclick="goToStep(3)">Salvar e continuar →</button>' +
  '</div>' +
  '</div>' +
  '</div>' +
  '<div id="step3Content" style="display:none;">' +
  '<h1 class="cp-title">Persona criada!</h1>' +
  '<p class="cp-subtitle">Sua persona está pronta. Agora você pode adicionar conhecimento e começar a conversar.</p>' +
  '<div class="cp-result show" id="resultCard">' +
  '<div class="cp-result-icon">🎉</div>' +
  '<h3 id="resultName"></h3>' +
  '<p id="resultDesc"></p>' +
  '<dl class="cp-result-details" id="resultDetails"></dl>' +
  '</div>' +
  '<div class="cp-actions">' +
  '<a href="/" class="cp-btn cp-btn-primary" id="chatBtn">Conversar agora →</a>' +
  '<a href="/site" class="cp-btn cp-btn-secondary">Ver todas as personas</a>' +
  '</div>' +
  '<div class="cp-features">' +
  '<div class="cp-feature"><div class="cp-feature-icon">📚</div><p>Adicione conhecimento via Admin ou RAG</p></div>' +
  '<div class="cp-feature"><div class="cp-feature-icon">🔊</div><p>Voz natural em 3 idiomas</p></div>' +
  '<div class="cp-feature"><div class="cp-feature-icon">📱</div><p>Disponível no Telegram e WhatsApp</p></div>' +
  '</div>' +
  '</div>' +
  '</div>' +
  '<footer style="text-align:center;padding:2rem;border-top:1px solid var(--border);margin-top:3rem;position:relative;z-index:1;">' +
  '<p style="color:var(--text-muted);font-size:0.82rem;">' + escapeHtml(d.brandName) + ' &copy; ' + new Date().getFullYear() + ' · <a href="/site" style="color:' + sanitizeColor(d.brandPrimaryColor) + ';text-decoration:none;">Plataforma</a> · <a href="/admin" style="color:var(--text-muted);text-decoration:none;">Admin</a></p>' +
  '</footer></div>' +
  '<script>' +
  'var generatedData=null;' +
  'var currentStep=1;' +
  'function goToStep(n){' +
  'currentStep=n;' +
  'document.getElementById("step1Content").style.display=n===1?"block":"none";' +
  'document.getElementById("step2Content").style.display=n===2?"block":"none";' +
  'document.getElementById("step3Content").style.display=n===3?"block":"none";' +
  'for(var i=1;i<=3;i++){' +
  'var el=document.getElementById("step"+i);' +
  'el.className="cp-step"+(i<n?" done":(i===n?" active":""));' +
  '}' +
  'window.scrollTo({top:0,behavior:"smooth"});' +
  '}' +
  'async function generatePersona(){' +
  'var desc=document.getElementById("descArea").value.trim();' +
  'if(!desc){document.getElementById("errorMsg").textContent="Descreva sua persona para continuar.";document.getElementById("errorMsg").classList.add("show");return;}' +
  'document.getElementById("errorMsg").classList.remove("show");' +
  'document.getElementById("generateBtn").disabled=true;' +
  'document.getElementById("loadingIndicator").classList.add("show");' +
  'try{' +
  'var res=await fetch("/api/chat/persona/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:desc,name:document.getElementById("nameInput").value||undefined,lang:document.getElementById("langSelect").value})});' +
  'if(!res.ok){var err=await res.json().catch(function(){return{error:"Erro ao gerar persona"}});throw new Error(err.error||"Erro ao gerar persona");}' +
  'generatedData=await res.json();' +
  'document.getElementById("editName").value=generatedData.name||"";' +
  'var ident=generatedData.identity;' +
  'if(typeof ident==="object"){var h="";var langs=Object.keys(ident);for(var li=0;li<langs.length;li++){h+="<dt>"+langs[li]+"</dt><dd>"+(ident[langs[li]].core||ident[langs[li]])+"</dd>";}' +
  'document.getElementById("identityPreview").innerHTML=h;}' +
  'else{document.getElementById("identityPreview").innerHTML="<dd>"+ident+"</dd>";}' +
  'goToStep(2);' +
  '}catch(e){document.getElementById("errorMsg").textContent=e.message;document.getElementById("errorMsg").classList.add("show");}' +
  'finally{document.getElementById("generateBtn").disabled=false;document.getElementById("loadingIndicator").classList.remove("show");}' +
  '}' +
  'function goToStep(n){' +
  'if(n===3&&generatedData){' +
  'document.getElementById("resultName").textContent=generatedData.name||document.getElementById("editName").value;' +
  'var id2=generatedData.identity||{};' +
  'var corePt=typeof id2["pt-BR"]==="object"?id2["pt-BR"].core:id2["pt-BR"]||"";' +
  'var short=corePt.split(".")[0]||generatedData.name;' +
  'document.getElementById("resultDesc").textContent=short;' +
  'var dl="";' +
  'dl+="<dt>ID</dt><dd>"+(generatedData.id||"")+"</dd>";' +
  'dl+="<dt>Nome</dt><dd>"+(generatedData.name||"")+"</dd>";' +
  'dl+="<dt>Idiomas</dt><dd>pt-BR, en-US, es-ES</dd>";' +
  'dl+="<dt>Voz</dt><dd>"+(document.getElementById("editVoice").value||"pm_alex")+"</dd>";' +
  'var ks=generatedData.knowledgeSources||[];dl+="<dt>Fontes de conhecimento</dt><dd>"+(ks.length?ks.join(", "):"Nenhuma (adicione via Admin)")+"</dd>";' +
  'document.getElementById("resultDetails").innerHTML=dl;' +
  'document.getElementById("chatBtn").href="/?persona="+(generatedData.id||"");' +
  '}' +
  'currentStep=n;' +
  'document.getElementById("step1Content").style.display=n===1?"block":"none";' +
  'document.getElementById("step2Content").style.display=n===2?"block":"none";' +
  'document.getElementById("step3Content").style.display=n===3?"block":"none";' +
  'for(var i=1;i<=3;i++){var el=document.getElementById("step"+i);el.className="cp-step"+(i<n?" done":(i===n?" active":""));}' +
  'window.scrollTo({top:0,behavior:"smooth"});' +
  '}' +
  '</script>' +
  '</body></html>';
}

module.exports = { escapeHtml, buildPersonaPage, buildSitePage, buildCreatePersonaPage };