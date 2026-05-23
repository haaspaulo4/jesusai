const { createApp, ref, reactive, computed, onMounted, nextTick, watch } = Vue;

const app = createApp({
  setup() {
    const view = ref('landing');
    const sidebarOpen = ref(true);
    const sidebarTab = ref('chat');
    const showAuthModal = ref(false);
    const showDonate = ref(false);
    const showPersonaDropdown = ref(false);
    const authMode = ref('login');
    const authError = ref('');
    const authLoading = ref(false);
    const authEmail = ref('');
    const authPassword = ref('');
    const authName = ref('');

    const authToken = ref(localStorage.getItem('mp_token') || null);
    const currentUserId = ref(localStorage.getItem('mp_user_id') || 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8));
    const sessionId = ref(localStorage.getItem('mp_session_id') || null);
    const currentPersonaId = ref(localStorage.getItem('mp_persona') || 'jesus');
    const currentPersonaName = ref('');
    const currentPersonaIcon = ref('');
    const currentPersonaAvatar = ref('');
    const currentAccentColor = ref('#D4A843');
    const currentPalette = ref({ primary: '#D4A843', secondary: '#1a1a2e' });

    const isBusinessPersona = computed(() => {
      const id = currentPersonaId.value;
      return id !== 'jesus' && id !== '';
    });

    const contentTabLabel = computed(() => {
      const l = currentLang.value;
      if (isBusinessPersona.value) {
        return l === 'en-US' ? 'Articles' : l === 'es-ES' ? 'Artículos' : 'Artigos';
      }
      return l === 'en-US' ? 'Devotionals' : l === 'es-ES' ? 'Devocionales' : 'Devocionais';
    });
    const currentFontFamily = ref('Inter');
    const currentBackgroundStyle = ref({ type: 'gradient', colors: ['#667eea', '#764ba2'] });
    const currentAvatarStyle = ref('adventurer');
    const currentEmojiStyle = ref('native');
    const currentAnimationStyle = ref('subtle');
    const brandName = ref('MetaPersona.AI');
    const brandIcon = ref('\uD83E\uDD16');
    const brandLogoUrl = ref('');
    const telegramUrl = ref('https://t.me/+5kGF3gij-iFiMTYx');
    const whatsappUrl = ref('https://chat.whatsapp.com/KABKb5HF4fU4dG1bsrcWfs');
    const donateData = ref({ pix: { key: '', type: 'email', name: '' }, stripe: null, message: '' });

    const personas = ref([]);
    const messages = ref([]);
    const streaming = ref(false);
    const inputMsg = ref('');
    const isRecording = ref(false);
    let mediaRecorder = null;
    let audioChunks = [];
    const conversations = ref([]);
    const blogPosts = ref([]);
    const currentPost = ref(null);
    const searchQuery = ref('');
    const searchResults = ref([]);
    const searchDone = ref(false);
    const bibleBooks = ref({});
    const showBibleIndex = ref(true);
    const knowledgeSourceList = ref([]);
    const sourceContentView = ref(null);
    const sourceContentLoading = ref(false);
    const sourcesPanel = ref([]);
    const sourcesCollapsed = ref(false);
    const profileName = ref('');
    const profileTags = ref([]);
    const currentLang = ref(localStorage.getItem('mp_lang') || 'pt-BR');
    const currentTTSVoice = ref(null);
    const currentAudio = ref(null);
    const apiKeyInput = ref('');
    const apiKeyStatus = ref('');
    const pixCopied = ref(false);
    const showCookieBanner = ref(!localStorage.getItem('cookie_consent'));
    const showOnboarding = ref(false);
    const onboardingQuestion = ref('');
    const onboardingAnswer = ref('');
    const onboardingSteps = ref([]);
    const onboardingStepIndex = ref(0);
    const onboardingTotalSteps = ref(0);
    const onboardingCompletedSteps = ref(0);
    const onboardingProgress = ref(0);
    const onboardingIsComplete = ref(false);
    const onboardingShowCelebration = ref(false);
    const showFollowUp = ref(false);
    const followUpData = ref(null);
    const followUpAnswer = ref('');
    const quickActions = ref([]);
    const contextualWelcome = ref('');

    // Quiz state
    const quizzes = ref([]);
    const activeQuiz = ref(null);
    const quizAttempt = ref(null);
    const quizCurrentQuestion = ref(0);
    const quizAnswers = reactive({});
    const quizResults = ref(null);
    const quizLoading = ref(false);
    const quizSubmitting = ref(false);
    const quizTimeLeft = ref(null);
    let quizTimer = null;

    // Media state
    const mediaGallery = ref([]);
    const mediaFilter = ref('all');
    const mediaViewerItem = ref(null);
    const mediaLoading = ref(false);
    const mediaFolders = ref([]);
    const showMediaUpload = ref(false);
    const mediaUploading = ref(false);
    const mediaUploadProgress = ref(0);
    const mediaUploadFiles = ref([]);

    const inputEl = ref(null);
    const messagesContainer = ref(null);

    let socketIo = null;
    let chatHistory = [];

    const i18n = {
      'pt-BR': {
        login: 'Entrar', register: 'Criar conta', email: 'seu@email.com', password: 'Mínimo 6 caracteres',
        name: 'Seu nome (opcional)', noAccount: 'Não tem conta?', hasAccount: 'Já tem conta?',
        or: 'ou', continueWithoutLogin: 'Continuar sem login', newConversation: 'Nova conversa',
        chat: 'Chat', content: 'Conteúdo', search: 'Buscar', noConversations: 'Nenhuma conversa ainda',
        loading: 'Carregando...', yourName: 'Seu nome...', contribute: 'Contribuir', logout: 'Sair',
        searchKnowledge: 'Buscar no conhecimento...', noResults: 'Nenhum resultado.',
        bibleIndex: 'Índice bíblico', sources: 'Fontes', show: 'mostrar', hide: 'ocultar',
        askPlaceholder: 'Pergunte ou descreva o que precisa...',
        contributeProject: 'Apoie este projeto', contributeDesc: 'Código aberto, gratuito e sempre será. Sua doação mantém os servidores e alcança mais pessoas.',
        contributeBtn: 'Contribuir via PIX', pixKey: 'Chave PIX (email):', copy: 'Copiar', copied: 'Copiado!',
        apiKeyTitle: 'API Key (opcional)', apiKeyDesc: 'Se a resposta falhar, use sua chave da Ollama Cloud.',
        save: 'Salvar', remove: 'Remover', back: '← Voltar',
        onboardingAnswer: 'Sua resposta...', submit: 'Enviar', skip: 'Pular',
        onboardingComplete: 'Perfil completo! 🎉', onboardingCompleteDesc: 'Sua experiência foi personalizada. Vamos começar!',
        letsGo: 'Vamos começar!', selectUpTo: 'Selecione até',
        howItWorks: 'Como funciona', features: 'Recursos', startFree: 'Começar grátis',
        seeHow: 'Ver como funciona', supportProject: 'Apoie este projeto',
        quickActions: 'Ações rápidas', send: 'Enviar',
        startRecording: 'Gravar áudio', stopRecording: 'Parar gravação', listening: 'Ouvindo...',
      },
      'en-US': {
        login: 'Login', register: 'Sign up', email: 'your@email.com', password: 'Min 6 characters',
        name: 'Your name (optional)', noAccount: "Don't have an account?", hasAccount: 'Already have an account?',
        or: 'or', continueWithoutLogin: 'Continue without login', newConversation: 'New conversation',
        chat: 'Chat', content: 'Content', search: 'Search', noConversations: 'No conversations yet',
        loading: 'Loading...', yourName: 'Your name...', contribute: 'Contribute', logout: 'Logout',
        searchKnowledge: 'Search knowledge...', noResults: 'No results.',
        bibleIndex: 'Bible index', sources: 'Sources', show: 'show', hide: 'hide',
        askPlaceholder: 'Ask or describe what you need...',
        contributeProject: 'Support this project', contributeDesc: 'Open source, free, and always will be. Your donation keeps servers running and reaches more people.',
        contributeBtn: 'Contribute via PIX', pixKey: 'PIX key (email):', copy: 'Copy', copied: 'Copied!',
        apiKeyTitle: 'API Key (optional)', apiKeyDesc: 'If responses fail, use your Ollama Cloud key.',
        save: 'Save', remove: 'Remove', back: '← Back',
        onboardingAnswer: 'Your answer...', submit: 'Submit', skip: 'Skip',
        onboardingComplete: 'Profile complete! 🎉', onboardingCompleteDesc: 'Your experience has been personalized. Let\'s get started!',
        letsGo: 'Let\'s go!', selectUpTo: 'Select up to',
        howItWorks: 'How it works', features: 'Features', startFree: 'Start free',
        seeHow: 'See how it works', supportProject: 'Support this project',
        quickActions: 'Quick actions', send: 'Send',
        startRecording: 'Record audio', stopRecording: 'Stop recording', listening: 'Listening...',
      },
      'es-ES': {
        login: 'Iniciar sesi\u00F3n', register: 'Crear cuenta', email: 'tu@email.com', password: 'M\u00EDnimo 6 caracteres',
        name: 'Tu nombre (opcional)', noAccount: '\u00BFNo tienes cuenta?', hasAccount: '\u00BFYa tienes cuenta?',
        or: 'o', continueWithoutLogin: 'Continuar sin login', newConversation: 'Nueva conversa',
        chat: 'Chat', content: 'Contenido', search: 'Buscar', noConversations: 'Ninguna conversa a\u00FAn',
        loading: 'Cargando...', yourName: 'Tu nombre...', contribute: 'Contribuir', logout: 'Salir',
        searchKnowledge: 'Buscar en el conocimiento...', noResults: 'Sin resultados.',
        bibleIndex: '\u00CDndice b\u00EDblico', sources: 'Fuentes', show: 'mostrar', hide: 'ocultar',
        askPlaceholder: 'Pregunta o describe lo que necesitas...',
        contributeProject: 'Apoya este proyecto', contributeDesc: 'C\u00F3digo abierto, gratuito y siempre lo ser\u00E1. Tu donaci\u00F3n mantiene los servidores y alcanza a m\u00E1s personas.',
        contributeBtn: 'Contribuir via PIX', pixKey: 'Clave PIX (email):', copy: 'Copiar', copied: '\u00A1Copiado!',
        apiKeyTitle: 'API Key (opcional)', apiKeyDesc: 'Si la respuesta falla, usa tu clave de Ollama Cloud.',
        save: 'Guardar', remove: 'Eliminar', back: '\u2190 Volver',
        onboardingAnswer: 'Tu respuesta...', submit: 'Enviar', skip: 'Omitir',
        onboardingComplete: '¡Perfil completo! 🎉', onboardingCompleteDesc: 'Tu experiencia ha sido personalizada. ¡Empecemos!',
        letsGo: '¡Vamos!', selectUpTo: 'Selecciona hasta',
        howItWorks: 'C\u00F3mo funciona', features: 'Recursos', startFree: 'Empezar gratis',
        seeHow: 'Ver c\u00F3mo funciona', supportProject: 'Apoya este proyecto',
        quickActions: 'Acciones rápidas', send: 'Enviar',
        startRecording: 'Grabar audio', stopRecording: 'Detener grabación', listening: 'Escuchando...',
      }
    };

    function t(key) {
      return (i18n[currentLang.value] || i18n['pt-BR'])[key] || i18n['pt-BR'][key] || key;
    }

    const PERSONA_QUICK_QUESTIONS = {
      'jesus': {
        'pt-BR': ['Quem é você?', 'O que você pode fazer?', 'Me ajude com uma dúvida', 'Quero conhecer mais'],
        'en-US': ['Who are you?', 'What can you do?', 'Help me with a question', 'I want to learn more'],
        'es-ES': ['¿Quién eres?', '¿Qué puedes hacer?', 'Ayúdame con una duda', 'Quiero conocer más'],
      },
      'bp_coach_vendas': {
        'pt-BR': ['Como fechar mais vendas?', 'Técnicas de prospecção', 'Superar objeções', 'Montar um funil'],
        'en-US': ['How to close more sales?', 'Prospecting techniques', 'Overcoming objections', 'Building a pipeline'],
        'es-ES': ['¿Cómo cerrar más ventas?', 'Técnicas de prospección', 'Superar objeciones', 'Armar un funnel'],
      },
      'bp_nutricionista': {
        'pt-BR': ['Plano alimentar para emagrecer', 'Dicas de suplementação', 'Dieta para ganho muscular', 'Reeducação alimentar'],
        'en-US': ['Meal plan for weight loss', 'Supplement tips', 'Diet for muscle gain', 'Food re-education'],
        'es-ES': ['Plan alimentario para adelgazar', 'Tips de suplementación', 'Dieta para ganar músculo', 'Reeducación alimentaria'],
      },
    };

    const DEFAULT_QUICK_QUESTIONS = {
      'pt-BR': ['Quem é você?', 'O que você pode fazer?', 'Me ajude com algo', 'Quero saber mais'],
      'en-US': ['Who are you?', 'What can you do?', 'Help me with something', 'I want to know more'],
      'es-ES': ['¿Quién eres?', '¿Qué puedes hacer?', 'Ayúdame con algo', 'Quiero saber más'],
    };

    const quickQuestions = computed(() => {
      const pid = currentPersonaId.value;
      const qs = PERSONA_QUICK_QUESTIONS[pid] || DEFAULT_QUICK_QUESTIONS;
      return qs[currentLang.value] || qs['pt-BR'];
    });

    const features = computed(() => {
      const fs = {
        'pt-BR': [
          { icon: '\uD83D\uDCAC', title: 'Conversa natural', desc: 'Portugu\u00EAs, ingl\u00EAs e espanhol com mem\u00F3ria persistente' },
          { icon: '\uD83C\uDF0D', title: 'Tutor de Idiomas', desc: 'EN, ES, FR, DE com skills de tradu\u00E7\u00E3o, pron\u00FAncia, quizzes e roleplay' },
          { icon: '\uD83D\uDCDA', title: 'RAG Multimodal', desc: 'PDF, DOCX, imagens, \u00E1udio, APIs \u2014 busca por persona' },
          { icon: '\u26A1', title: 'Agente aut\u00F4nomo', desc: 'Tarefas, calend\u00E1rio, CRM, automa\u00E7\u00F5es, metas' },
          { icon: '\uD83E\uDDE0', title: 'Cogni\u00E7\u00E3o em tempo real', desc: 'Emo\u00E7\u00E3o, inten\u00E7\u00E3o, churn risk, convers\u00E3o' },
          { icon: '\uD83C\uDFC6', title: 'Gamifica\u00E7\u00E3o', desc: 'XP, n\u00EDveis, streaks, conquistas, ranking' },
          { icon: '\uD83D\uDCF1', title: 'Multi-canal', desc: 'WhatsApp, Telegram, Web, voz' },
          { icon: '\uD83E\uDEE0', title: 'Blueprints', desc: 'Templates prontos: vendas, terapia, ENEM, idiomas, imobili\u00E1rio' },
        ],
        'en-US': [
          { icon: '\uD83D\uDCAC', title: 'Natural conversation', desc: 'Portuguese, English, Spanish with persistent memory' },
          { icon: '\uD83C\uDF0D', title: 'Language Tutor', desc: 'EN, ES, FR, DE with translation, pronunciation, quizzes & roleplay skills' },
          { icon: '\uD83D\uDCDA', title: 'Multimodal RAG', desc: 'PDF, DOCX, images, audio, APIs \u2014 per-persona search' },
          { icon: '\u26A1', title: 'Autonomous agent', desc: 'Tasks, calendar, CRM, automations, goals' },
          { icon: '\uD83E\uDDE0', title: 'Real-time cognition', desc: 'Emotion, intent, churn risk, conversion' },
          { icon: '\uD83C\uDFC6', title: 'Gamification', desc: 'XP, levels, streaks, badges, leaderboard' },
          { icon: '\uD83D\uDCF1', title: 'Multi-channel', desc: 'WhatsApp, Telegram, Web, voice' },
          { icon: '\uD83E\uDEE0', title: 'Blueprints', desc: 'Ready-made templates: sales, therapy, ENEM, languages, real estate' },
        ],
        'es-ES': [
          { icon: '\uD83D\uDCAC', title: 'Conversaci\u00F3n natural', desc: 'Portugu\u00E9s, ingl\u00E9s y espa\u00F1ol con memoria persistente' },
          { icon: '\uD83C\uDF0D', title: 'Tutor de Idiomas', desc: 'EN, ES, FR, DE con skills de traducci\u00F3n, pronunciaci\u00F3n, quizzes y roleplay' },
          { icon: '\uD83D\uDCDA', title: 'RAG Multimodal', desc: 'PDF, DOCX, im\u00E1genes, audio, APIs \u2014 b\u00FAsqueda por persona' },
          { icon: '\u26A1', title: 'Agente aut\u00F3nomo', desc: 'Tareas, calendario, CRM, automatizaciones, metas' },
          { icon: '\uD83E\uDDE0', title: 'Cognici\u00F3n en tiempo real', desc: 'Emoci\u00F3n, intenci\u00F3n, churn risk, conversi\u00F3n' },
          { icon: '\uD83C\uDFC6', title: 'Gamificaci\u00F3n', desc: 'XP, niveles, streaks, insignias, ranking' },
          { icon: '\uD83D\uDCF1', title: 'Multi-canal', desc: 'WhatsApp, Telegram, Web, voz' },
          { icon: '\uD83E\uDEE0', title: 'Blueprints', desc: 'Plantillas listas: ventas, terapia, ENEM, idiomas, inmobiliario' },
        ],
      };
      return fs[currentLang.value] || fs['pt-BR'];
    });

    const getPersonaName = (p) => {
      if (!p) return '';
      if (currentLang.value === 'en-US') return p.nameEn || p.name || p.id;
      if (currentLang.value === 'es-ES') return p.nameEs || p.name || p.id;
      return p.name || p.id;
    };

    const welcomeTitle = computed(() => {
      const p = personas.value.find(p => p.id === currentPersonaId.value);
      if (!p) return t('howItWorks') + '?';
      const wt = p.welcomeTitle;
      if (!wt) return '\uD83D\uDC4B ' + getPersonaName(p);
      if (typeof wt === 'object') return wt[currentLang.value] || wt['pt-BR'] || wt['en-US'] || '\uD83D\uDC4B ' + getPersonaName(p);
      return wt;
    });

    const welcomeBody = computed(() => {
      const p = personas.value.find(p => p.id === currentPersonaId.value);
      if (!p) return t('askPlaceholder');
      const wb = p.welcomeBody;
      if (!wb) return t('askPlaceholder');
      if (typeof wb === 'object') return wb[currentLang.value] || wb['pt-BR'] || wb['en-US'] || '';
      return wb;
    });

    const inputPlaceholder = computed(() => {
      const name = currentPersonaName.value;
      if (currentLang.value === 'en-US') return name ? `Ask ${name}...` : t('askPlaceholder');
      if (currentLang.value === 'es-ES') return name ? `Pregunta a ${name}...` : t('askPlaceholder');
      return name ? `Pergunte a ${name}...` : t('askPlaceholder');
    });

    async function api(path, opts = {}, retry = true) {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken.value) headers['Authorization'] = `Bearer ${authToken.value}`;
      const res = await fetch(`/api${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
      if (res.status === 401 && retry) {
        const refreshToken = localStorage.getItem('mp_refresh_token');
        if (refreshToken) {
          try {
            const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              authToken.value = refreshData.token;
              localStorage.setItem('mp_token', refreshData.token);
              if (refreshData.refreshToken) localStorage.setItem('mp_refresh_token', refreshData.refreshToken);
              headers['Authorization'] = `Bearer ${refreshData.token}`;
              return api(path, opts, false);
            }
          } catch {}
        }
        localStorage.removeItem('mp_token');
        localStorage.removeItem('mp_refresh_token');
        authToken.value = null;
        showAuth('login');
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      return res;
    }

    function showAuth(mode) {
      authMode.value = mode;
      authError.value = '';
      showAuthModal.value = true;
    }

    function skipAuth() {
      showAuth('login');
    }

    async function doAuth() {
      authLoading.value = true;
      authError.value = '';
      try {
        const url = authMode.value === 'login' ? '/auth/login' : '/auth/register';
        const body = authMode.value === 'login'
          ? { email: authEmail.value, password: authPassword.value }
          : { email: authEmail.value, password: authPassword.value, name: authName.value };
        const res = await api(url, { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Auth error');
        authToken.value = data.token;
        currentUserId.value = data.user.id;
        localStorage.setItem('mp_token', data.token);
        localStorage.setItem('mp_user_id', data.user.id);
        if (data.refreshToken) {
          localStorage.setItem('mp_refresh_token', data.refreshToken);
        }
        if (data.user.name && profileName.value === '') profileName.value = data.user.name;
        showAuthModal.value = false;
        enterApp();
      } catch (err) {
        authError.value = err.message;
      } finally {
        authLoading.value = false;
      }
    }

    async function doGoogleAuth() {
      authLoading.value = true;
      authError.value = '';
      try {
        const res = await api('/auth/google', {
          method: 'POST',
          body: JSON.stringify({ googleId: 'web_' + Date.now(), name: '', email: '' }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          window.location.href = '/auth/google';
          return;
        }
      } catch (err) {
        authError.value = err.message;
      } finally {
        authLoading.value = false;
      }
    }

    async function changePassword(currentPassword, newPassword) {
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken.value}` },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Falha ao alterar senha');
        }
        const data = await res.json();
        if (data.token) { authToken.value = data.token; localStorage.setItem('mp_token', data.token); }
        if (data.refreshToken) { localStorage.setItem('mp_refresh_token', data.refreshToken); }
        return data;
      } catch (err) {
        throw err;
      }
    }

    function logout() {
      localStorage.removeItem('mp_token');
      localStorage.removeItem('mp_user_id');
      localStorage.removeItem('mp_session_id');
      authToken.value = null;
      sessionId.value = null;
      messages.value = [];
      view.value = 'landing';
      if (currentAudio.value) { currentAudio.value.pause(); currentAudio.value = null; }
      if (socketIo) { socketIo.disconnect(); socketIo = null; }
    }

    function enterApp() {
      if (!authToken.value) {
        showAuth('login');
        return;
      }
      view.value = 'chat';
      loadPersonas();
      loadBrandSettings();
      loadConversations();
      loadProfile();
      loadLinkStatus();
      loadBibleBooks();
      loadDonateData();
      connectSocketIO();
      if (!localStorage.getItem('mp_onboarded')) checkOnboarding();
      checkFollowUp();
      loadQuickActions();
      loadContextualWelcome();
      loadQuizzes();
      loadMediaGallery();
      loadMediaFolders();
    }

    function connectSocketIO() {
      try {
        if (socketIo) { socketIo.disconnect(); }
        socketIo = io({
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 3000,
          auth: { token: authToken.value, userId: currentUserId.value },
        });
        socketIo.on('connect', () => {
          if (currentUserId.value) socketIo.emit('auth', { userId: currentUserId.value, sessionId: sessionId.value || undefined });
        });
        socketIo.on('disconnect', () => {});
        socketIo.on('connect_error', () => {});
        socketIo.on('xp_update', () => {});
        socketIo.on('badge_earned', () => {});
      } catch (e) {}
    }

    async function loadBrandSettings() {
      try {
        const res = await api('/config');
        const s = await res.json();
        if (s.brandName) { brandName.value = s.brandName; document.title = s.brandName; }
        if (s.brandPrimaryColor) {
          currentAccentColor.value = s.brandPrimaryColor;
          document.documentElement.style.setProperty('--brand-500', s.brandPrimaryColor);
        }
        if (s.brandLogoUrl) {
          brandLogoUrl.value = s.brandLogoUrl;
          const favicon = document.getElementById('pageFavicon');
          if (favicon) favicon.href = s.brandLogoUrl;
        }
        if (s.telegramGroupUrl) telegramUrl.value = s.telegramGroupUrl;
        else if (s.telegramUrl) telegramUrl.value = s.telegramUrl;
        if (s.whatsappGroupUrl) whatsappUrl.value = s.whatsappGroupUrl;
        else if (s.whatsappUrl) whatsappUrl.value = s.whatsappUrl;
      } catch {}
    }

    async function loadDonateData() {
      try {
        const res = await api('/donate');
        if (res.ok) donateData.value = await res.json();
      } catch {}
    }

    async function loadPersonas() {
      try {
        const res = await api('/personas');
        personas.value = await res.json();
        updatePersonaDisplay();
      } catch {}
    }

    function applyPersonaVisuals(p) {
      currentAccentColor.value = p.accentColor || '#D4A843';
      currentPalette.value = p.palette || { primary: '#D4A843', secondary: '#1a1a2e' };
      currentFontFamily.value = p.fontFamily || 'Inter';
      currentAvatarStyle.value = p.avatarStyle || 'adventurer';
      currentEmojiStyle.value = p.emojiStyle || 'native';
      currentAnimationStyle.value = p.animationStyle || 'subtle';
      currentBackgroundStyle.value = p.backgroundStyle || { type: 'gradient', colors: ['#667eea', '#764ba2'] };
      currentPersonaAvatar.value = p.avatarUrl || '';
      document.documentElement.style.setProperty('--brand-500', p.accentColor || '#D4A843');
      if (p.fontFamily) document.documentElement.style.setProperty('--font-family', p.fontFamily);
    }

    function updatePersonaDisplay() {
      const p = personas.value.find(p => p.id === currentPersonaId.value) || personas.value[0];
      if (!p) return;
      currentPersonaName.value = getPersonaName(p);
      currentPersonaIcon.value = getPersonaEmoji(p.id);
      applyPersonaVisuals(p);
    }

    function getPersonaEmoji(id) {
      if (!id) return '\uD83C\uDFAD';
      if (id === 'jesus') return '\u271D\uFE0F';
      if (id === 'meta-persona') return '\uD83E\uDDE0';
      if (id.includes('coach') || id.includes('vendas')) return '\uD83C\uDFAF';
      if (id.includes('nutri') || id.includes('health') || id.includes('saude')) return '\uD83E\uDD57';
      if (id.includes('tutor') || id.includes('enem') || id.includes('edu')) return '\uD83C\uDF93';
      if (id.includes('imob') || id.includes('real')) return '\uD83C\uDFE0';
      if (id.includes('hipno') || id.includes('terapia')) return '\uD83E\uDDE8';
      return '\uD83C\uDFAD';
    }

    async function switchPersona(id) {
      try {
        const res = await api('/persona/switch', {
          method: 'POST',
          body: JSON.stringify({ personaId: id, sessionId: sessionId.value || undefined }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error('[Persona] Switch failed:', errData.error || res.statusText);
          alert(errData.error || 'Falha ao trocar persona');
          return;
        }
        const data = await res.json();
        currentPersonaId.value = id;
        localStorage.setItem('mp_persona', id);
        sessionId.value = null;
        localStorage.removeItem('mp_session_id');
        messages.value = [];
        chatHistory = [];
        sourcesPanel.value = [];
        showPersonaDropdown.value = false;

        currentPersonaName.value = data.nameEn && currentLang.value === 'en-US' ? data.nameEn : (data.nameEs && currentLang.value === 'es-ES' ? data.nameEs : data.name);
        currentPersonaIcon.value = getPersonaEmoji(id);

        const persona = personas.value.find(p => p.id === id);
        if (persona) {
          applyPersonaVisuals({ ...persona, accentColor: data.accentColor, avatarUrl: data.avatarUrl, ttsVoice: data.ttsVoice });
        } else {
          applyPersonaVisuals({ accentColor: data.accentColor, avatarUrl: data.avatarUrl, palette: data.palette, fontFamily: data.fontFamily, avatarStyle: data.avatarStyle, emojiStyle: data.emojiStyle, animationStyle: data.animationStyle, backgroundStyle: data.backgroundStyle });
        }
        if (data.ttsVoice) currentTTSVoice.value = data.ttsVoice;

        const wt = data.welcomeTitle || {};
        const wb = data.welcomeBody || {};
        const title = (typeof wt === 'object' ? (wt[currentLang.value] || wt['pt-BR'] || '') : (wt || ''));
        const body = (typeof wb === 'object' ? (wb[currentLang.value] || wb['pt-BR'] || '') : (wb || ''));
        if (title || body) {
          messages.value.push({ role: 'bot', content: (title ? `**${title}**\n\n` : '') + body, sources: [] });
        }

        loadBibleBooks();
        loadBlog();
        loadQuickActions();
        loadQuizzes();
        loadMediaGallery();

        await nextTick();
        scrollToBottom();
      } catch (err) {
        console.error('[Persona] Switch failed:', err);
      }
    }

    async function sendMessage(text) {
      text = (text || inputMsg.value).trim();
      if (!text || streaming.value) return;
      inputMsg.value = '';
      autoResize();

      messages.value.push({ role: 'user', content: text, sources: [] });
      chatHistory.push({ role: 'user', content: text });
      streaming.value = true;

      const botIdx = messages.value.length;
      messages.value.push({ role: 'bot', content: '', sources: [], speaking: false });

      try {
        const res = await api('/chat', {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            sessionId: sessionId.value || undefined,
            language: currentLang.value,
            personaId: currentPersonaId.value || undefined,
          }),
        });

        if (res.status === 401) {
          messages.value[botIdx].content = '🔒 Você precisa fazer login para conversar.';
          streaming.value = false;
          showAuth('login');
          return;
        }
        if (res.status === 403) {
          messages.value[botIdx].content = '\u26D4 Conta suspensa. Entre em contato com o suporte.';
          streaming.value = false;
          return;
        }
        if (res.status === 429) {
          const data = await res.json().catch(() => ({}));
          messages.value[botIdx].content = data.error || 'Limite de mensagens atingido. Tente novamente mais tarde.';
          streaming.value = false;
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        messages.value[botIdx].content = data.response || '';
        messages.value[botIdx].sources = data.sources || [];
        chatHistory.push({ role: 'assistant', content: data.response || '' });

        if (data.sessionId) {
          sessionId.value = data.sessionId;
          localStorage.setItem('mp_session_id', data.sessionId);
        }

        if (data.personaId) {
          currentPersonaId.value = data.personaId;
          localStorage.setItem('mp_persona', data.personaId);
        }
        if (data.personaName) currentPersonaName.value = data.personaName;
        if (data.ttsVoice) currentTTSVoice.value = data.ttsVoice;

        if (data.onboardingDone) {
          localStorage.setItem('mp_onboarded', 'true');
          showOnboarding.value = false;
        } else if (data.onboarding && data.response) {
          onboardingQuestion.value = data.response;
          showOnboarding.value = true;
        }

        if (data.sources && data.sources.length > 0) {
          sourcesPanel.value = data.sources;
        }

        updatePersonaDisplay();
        loadConversations();
        checkFollowUp();
      } catch (err) {
        console.error('Chat error:', err);
        messages.value[botIdx].content = 'N\u00E3o foi poss\u00EDvel conectar. Verifique sua internet e tente novamente.';
      } finally {
        streaming.value = false;
        await nextTick();
        scrollToBottom();
      }
    }

    function scrollToBottom() {
      nextTick(() => {
        if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      });
    }

    function autoResize() {
      if (inputEl.value) {
        inputEl.value.style.height = 'auto';
        inputEl.value.style.height = Math.min(inputEl.value.scrollHeight, 128) + 'px';
      }
    }

    async function toggleMic() {
      if (isRecording.value) {
        stopMic();
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        inputMsg.value = currentLang.value === 'en-US' ? 'Microphone not available' : currentLang.value === 'es-ES' ? 'Micrófono no disponible' : 'Microfone não disponível';
        return;
      }

      if (!window.MediaRecorder) {
        inputMsg.value = currentLang.value === 'en-US' ? 'Browser does not support audio recording' : currentLang.value === 'es-ES' ? 'Navegador no soporta grabación' : 'Navegador não suporta gravação de áudio';
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          isRecording.value = false;
          mediaRecorder = null;

          if (audioChunks.length === 0) return;

          const audioBlob = new Blob(audioChunks, { type: mimeType });
          const formData = new FormData();
          formData.append('audio', audioBlob, mimeType.includes('webm') ? 'audio.webm' : 'audio.ogg');

          if (streaming.value) return;
          streaming.value = true;
          const botIdx = messages.value.length;
          messages.value.push({ role: 'bot', content: currentLang.value === 'pt-BR' ? '🎤 Transcrevendo áudio...' : currentLang.value === 'es-ES' ? '🎤 Transcribiendo audio...' : '🎤 Transcribing audio...', sources: [], speaking: false });

          try {
            const token = authToken.value;
            const res = await fetch('/api/chat/stt', {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            });

            if (!res.ok) throw new Error(`STT ${res.status}`);
            const data = await res.json();
            messages.value.splice(botIdx, 1);
            streaming.value = false;

            if (data.text) {
              inputMsg.value = data.text;
              await nextTick();
              await sendMessage(data.text);
            } else {
              inputMsg.value = '';
            }
          } catch (err) {
            console.error('[STT] Error:', err);
            messages.value[botIdx].content = currentLang.value === 'pt-BR' ? 'Não consegui transcrever o áudio. Digite sua mensagem.' : currentLang.value === 'es-ES' ? 'No pude transcribir el audio. Escribe tu mensaje.' : 'Could not transcribe audio. Please type your message.';
            setTimeout(() => { streaming.value = false; }, 1000);
          }
        };

        mediaRecorder.onerror = () => {
          stream.getTracks().forEach(t => t.stop());
          isRecording.value = false;
          mediaRecorder = null;
        };

        mediaRecorder.start();
        isRecording.value = true;
      } catch (err) {
        console.error('[Mic] Error:', err);
        isRecording.value = false;
        inputMsg.value = currentLang.value === 'pt-BR' ? 'Permissão de microfone negada' : currentLang.value === 'es-ES' ? 'Permiso de micrófono denegado' : 'Microphone permission denied';
      }
    }

    function stopMic() {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      isRecording.value = false;
    }

    const TTS_CHUNK_SIZE = 200;

    function splitIntoChunks(text, maxLen) {
      const clean = text.replace(/\*[^*]+\*/g, m => m.replace(/\*/g, '')).replace(/<[^>]+>/g, '').replace(/#{1,6}\s/g, '').trim();
      if (!clean) return [];
      const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
      const chunks = [];
      let current = '';
      for (const s of sentences) {
        const t = s.trim();
        if (!t) continue;
        if ((current + ' ' + t).trim().length > maxLen && current.length > 0) {
          chunks.push(current.trim());
          current = t;
        } else {
          current = current ? current + ' ' + t : t;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks.length > 0 ? chunks : [clean.substring(0, maxLen)];
    }

    function speakText(text, index) {
      const msg = messages.value[index];
      if (!msg) return;

      if (currentAudio.value) {
        currentAudio.value.pause();
        currentAudio.value = null;
        if (messages.value.some(m => m.speaking)) {
          messages.value.forEach(m => m.speaking = false);
          return;
        }
      }

      msg.speaking = true;
      const ttsLang = { 'pt-BR': 'pt-BR', 'en-US': 'en-US', 'es-ES': 'es-ES' }[currentLang.value] || 'pt-BR';
      const chunks = splitIntoChunks(text, TTS_CHUNK_SIZE);

      if (chunks.length === 0) { msg.speaking = false; return; }

      let chunkIndex = 0;

      function playNextChunk() {
        if (chunkIndex >= chunks.length || !msg.speaking) {
          msg.speaking = false;
          currentAudio.value = null;
          return;
        }

        const chunk = chunks[chunkIndex];
        chunkIndex++;

        api('/tts', {
          method: 'POST',
          body: JSON.stringify({ text: chunk, lang: ttsLang, voice: currentTTSVoice.value || undefined }),
        }).then(res => {
          if (res.ok) return res.blob();
          throw new Error('TTS failed');
        }).then(blob => {
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          currentAudio.value = audio;
          audio.onended = () => { URL.revokeObjectURL(url); playNextChunk(); };
          audio.onerror = () => { URL.revokeObjectURL(url); playNextChunk(); };
          audio.play().catch(() => { URL.revokeObjectURL(url); speakWithBrowser(chunk, msg); });
        }).catch(() => {
          playNextChunk();
        });
      }

      playNextChunk();
    }

    function speakWithBrowser(text, msg) {
      if (!('speechSynthesis' in window)) { msg.speaking = false; return; }
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = { 'pt-BR': 'pt-BR', 'en-US': 'en-US', 'es-ES': 'es-ES' }[currentLang.value] || 'pt-BR';
      u.rate = 0.9;
      const voices = speechSynthesis.getVoices();
      const v = voices.find(v => v.lang.startsWith(u.lang)) || voices[0];
      if (v) u.voice = v;
      u.onend = () => { msg.speaking = false; };
      u.onerror = () => { msg.speaking = false; };
      speechSynthesis.speak(u);
    }

    function formatMarkdown(text) {
      if (!text) return '';
      let html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-surface-600 px-1 rounded text-brand-300 text-xs">$1</code>');
      html = html.replace(/((?:1|2|3)?\s*[A-Z][a-z\u00E1\u00E0\u00E2\u00E3\u00E9\u00E8\u00EA\u00ED\u00EF\u00F3\u00F4\u00F5\u00FA\u00FC\u00E7]+(?:\s+\w+)?\s+\d+:\d+(?:-\d+)?)/g, '<span class="text-brand-400 font-medium">$1</span>');
      html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
      const raw = `<p>${html}</p>`;
      return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(raw, { ALLOWED_TAGS: ['p', 'strong', 'em', 'code', 'br', 'span'], ALLOWED_ATTR: ['class'] }) : raw;
    }

    async function loadConversations() {
      try {
        const res = await api(`/sessions?userId=${currentUserId.value}`);
        if (res.ok) conversations.value = await res.json();
      } catch {}
    }

    async function loadSession(id) {
      try {
        const res = await api(`/session/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        sessionId.value = id;
        localStorage.setItem('mp_session_id', id);
        messages.value = [];
        if (data.messages) {
          for (const msg of data.messages) {
            const isBot = msg.role === 'bot' || msg.role === 'assistant';
            messages.value.push({
              role: isBot ? 'bot' : 'user',
              content: msg.content,
              sources: [],
              speaking: false,
            });
          }
        }
        chatHistory = (data.messages || []).slice(-10).map(m => ({
          role: (m.role === 'bot' || m.role === 'assistant') ? 'assistant' : m.role,
          content: m.content,
        }));
        if (data.personaId) {
          currentPersonaId.value = data.personaId;
          localStorage.setItem('mp_persona', data.personaId);
        }
        updatePersonaDisplay();
        sidebarOpen.value = false;
        await nextTick();
        scrollToBottom();
      } catch {}
    }

    async function deleteSession(id) {
      try {
        await api(`/session/${id}`, { method: 'DELETE' });
        conversations.value = conversations.value.filter(c => c.id !== id);
        if (sessionId.value === id) {
          sessionId.value = null;
          localStorage.removeItem('mp_session_id');
          messages.value = [];
        }
      } catch {}
    }

    function newChat() {
      sessionId.value = null;
      localStorage.removeItem('mp_session_id');
      messages.value = [];
      chatHistory = [];
      sourcesPanel.value = [];
      sidebarOpen.value = false;
    }

    async function loadProfile() {
      try {
        const res = await api(`/profile/${currentUserId.value}`);
        if (!res.ok) return;
        const p = await res.json();
        if (p.name) profileName.value = p.name;
        const tags = [...(p.topics || []), ...(p.emotions || [])];
        profileTags.value = tags.slice(0, 8);
      } catch {}
    }

    async function saveProfile() {
      try {
        await api(`/profile/${currentUserId.value}`, {
          method: 'PUT',
          body: JSON.stringify({ name: profileName.value }),
        });
      } catch {}
    }

    const linkCode = ref('');
    const linkCodeExpiry = ref('');
    const linkStatus = ref({ whatsappLinked: false, telegramLinked: false, whatsappId: null, telegramId: null });
    const showLinkCode = ref(false);

    async function loadLinkStatus() {
      try {
        const res = await api('/auth/link-status');
        if (res.ok) linkStatus.value = await res.json();
      } catch {}
    }

    async function generateLinkCode() {
      try {
        const res = await api('/auth/link-code', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          linkCode.value = data.code;
          linkCodeExpiry.value = new Date(data.expires).toLocaleTimeString();
          showLinkCode.value = true;
        }
      } catch {}
    }

    async function unlinkAccount(source) {
      try {
        await api('/auth/unlink', { method: 'POST', body: JSON.stringify({ source }) });
        await loadLinkStatus();
      } catch {}
    }

    async function loadBlog() {
      try {
        const pid = currentPersonaId.value || '';
        const res = await api(`/blog/posts?personaId=${encodeURIComponent(pid)}`);
        if (res.ok) {
          const data = await res.json();
          blogPosts.value = data.posts || data;
        }
      } catch {}
    }

    async function viewPost(slug) {
      try {
        const res = await api(`/blog/posts/${slug}`);
        if (res.ok) currentPost.value = await res.json();
      } catch {}
    }

    function searchSource(src) {
      sourceContentView.value = null;
      sourceContentLoading.value = true;
      api(`/blog/source-content/${encodeURIComponent(src)}`).then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed');
      }).then(data => {
        sourceContentView.value = data;
      }).catch(() => {
        const searchTerms = {
          'imersao-vendas-mod1': 'prospecção vendas abordagem',
          'imersao-vendas-mod2': 'negociação vendas objeções',
          'imersao-vendas-mod3': 'aquisição clientes fechamento vendas',
          'imersao-vendas-mod4': 'recorrência fidelização pós-venda',
          'imersao-vendas-mod5': 'gestão métricas liderança equipe vendas',
        };
        searchQuery.value = searchTerms[src] || src.replace(/[-_]/g, ' ');
        doSearch();
      }).finally(() => { sourceContentLoading.value = false; });
    }

    async function doSearch() {
      if (!searchQuery.value.trim()) return;
      searchDone.value = false;
      searchResults.value = [];
      try {
        const pid = currentPersonaId.value || '';
        const res = await api(`/blog/search?q=${encodeURIComponent(searchQuery.value)}&limit=20&personaId=${encodeURIComponent(pid)}`);
        if (res.ok) {
          const data = await res.json();
          searchResults.value = data.results || data;
        }
      } catch {}
      searchDone.value = true;
    }

    async function loadBibleBooks() {
      try {
        const pid = currentPersonaId.value || '';
        const res = await api(`/blog/books?personaId=${encodeURIComponent(pid)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.knowledgeSources && data.knowledgeSources.length > 0) {
            bibleBooks.value = {};
            showBibleIndex.value = true;
            knowledgeSourceList.value = data.knowledgeSources;
          } else {
            bibleBooks.value = data.bible || data;
            showBibleIndex.value = true;
            knowledgeSourceList.value = [];
          }
        }
      } catch {}
    }

    async function checkOnboarding() {
      try {
        const res = await api('/chat', {
          method: 'POST',
          body: JSON.stringify({ message: ' ', sessionId: sessionId.value || undefined, language: currentLang.value, personaId: currentPersonaId.value || undefined }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.onboarding && data.response) {
            onboardingQuestion.value = data.response;
            showOnboarding.value = true;
        if (data.humanOverride) {
          messages.value[botIdx].content = '👨‍💼 ' + (data.response || 'Um atendente humano está cuidando desta conversa.');
          messages.value[botIdx].overrideType = data.overrideType || 'full';
        }
        if (data.needsApproval) {
          messages.value[botIdx].approvalPending = true;
          messages.value[botIdx].content = '⏳ ' + (data.response || '') + '\n\n*(Aguardando aprovação humana)*';
        }
        if (data.observed) {
          messages.value[botIdx].observed = true;
        }

        if (data.sessionId) {
              sessionId.value = data.sessionId;
              localStorage.setItem('mp_session_id', data.sessionId);
            }
            loadOnboardingSteps();
          } else if (!data.onboarding) {
            localStorage.setItem('mp_onboarded', 'true');
          }
        }
      } catch {}
    }

    async function loadOnboardingSteps() {
      try {
        const params = new URLSearchParams({ personaId: currentPersonaId.value || '', userId: currentUserId.value, lang: currentLang.value });
        const res = await api(`/onboarding/steps?${params}`);
        if (res.ok) {
          const data = await res.json();
          onboardingSteps.value = data.steps || [];
          if (data.status) {
            onboardingTotalSteps.value = data.status.totalSteps || 0;
            onboardingCompletedSteps.value = data.status.completedSteps || 0;
            onboardingProgress.value = data.status.progress || 0;
          }
        }
      } catch {}
    }

    async function submitOnboardingAnswer(answer) {
      if (!answer.trim()) return;
      try {
        const res = await api('/chat', {
          method: 'POST',
          body: JSON.stringify({ message: answer, sessionId: sessionId.value || undefined, language: currentLang.value, personaId: currentPersonaId.value || undefined }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sessionId) {
            sessionId.value = data.sessionId;
            localStorage.setItem('mp_session_id', data.sessionId);
          }
          if (data.onboardingDone) {
            localStorage.setItem('mp_onboarded', 'true');
            showOnboarding.value = false;
            onboardingIsComplete.value = true;
            onboardingShowCelebration.value = true;
            setTimeout(() => { onboardingShowCelebration.value = false; }, 3000);
            if (data.personaId) {
              currentPersonaId.value = data.personaId;
              localStorage.setItem('mp_persona', data.personaId);
            }
            if (data.personaName) currentPersonaName.value = data.personaName;
            updatePersonaDisplay();
            loadQuickActions();
          } else if (data.onboarding && data.response) {
            onboardingQuestion.value = data.response;
            onboardingAnswer.value = '';
            onboardingStepIndex.value++;
            if (data.onboardingTotalSteps) onboardingTotalSteps.value = data.onboardingTotalSteps;
            if (data.onboardingCompletedSteps) onboardingCompletedSteps.value = data.onboardingCompletedSteps;
            onboardingProgress.value = data.onboardingTotalSteps ? (data.onboardingCompletedSteps / data.onboardingTotalSteps) : 0;
          } else if (data.response) {
            showOnboarding.value = false;
            messages.value.push({ role: 'bot', content: data.response, sources: data.sources || [] });
          }
        }
      } catch {}
    }

    async function loadQuickActions() {
      try {
        const params = new URLSearchParams({ personaId: currentPersonaId.value || '', userId: currentUserId.value });
        const res = await api(`/quick-actions?${params}`);
        if (res.ok) {
          const data = await res.json();
          quickActions.value = data.actions || [];
        }
      } catch {}
    }

    async function loadContextualWelcome() {
      try {
        const params = new URLSearchParams({ userId: currentUserId.value, personaId: currentPersonaId.value || '', lang: currentLang.value });
        const res = await api(`/welcome?${params}`);
        if (res.ok) {
          const data = await res.json();
          contextualWelcome.value = data.welcome || '';
        }
      } catch {}
    }

    function sendQuickAction(action) {
      const l = currentLang.value.startsWith('en') ? 'en-US' : currentLang.value.startsWith('es') ? 'es-ES' : 'pt-BR';
      const text = action[l] || action['pt-BR'] || action.id;
      inputMsg.value = text;
      sendMessage();
    }

    const dismissedFollowUps = new Set();

    async function checkFollowUp() {
      try {
        const res = await api(`/followups/pending?userId=${currentUserId.value}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.id && data.question && !dismissedFollowUps.has(data.id)) {
            followUpData.value = data;
            showFollowUp.value = true;
          }
        }
      } catch {}
    }

    function dismissFollowUp() {
      if (followUpData.value) dismissedFollowUps.add(followUpData.value.id);
      showFollowUp.value = false;
      followUpData.value = null;
    }

    async function answerFollowUp(response) {
      if (!followUpData.value || !response.trim()) return;
      try {
        await api(`/followups/${followUpData.value.id}/respond`, {
          method: 'POST',
          body: JSON.stringify({ response }),
        });
        dismissedFollowUps.add(followUpData.value.id);
        showFollowUp.value = false;
        followUpData.value = null;
      } catch {}
    }

    // ========== QUIZ FUNCTIONS ==========
    async function loadQuizzes() {
      quizLoading.value = true;
      try {
        const pid = currentPersonaId.value || '';
        const res = await api(`/quiz/active?persona_id=${encodeURIComponent(pid)}`);
        if (res.ok) {
          const data = await res.json();
          quizzes.value = data.quizzes || [];
        }
      } catch {} finally { quizLoading.value = false; }
    }

    function startQuizTimer() {
      if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
      if (quizTimeLeft.value === null || quizTimeLeft.value === undefined) return;
      quizTimer = setInterval(() => {
        if (quizTimeLeft.value === null || quizTimeLeft.value === undefined) {
          clearInterval(quizTimer); quizTimer = null; return;
        }
        if (quizTimeLeft.value <= 1) {
          quizTimeLeft.value = 0;
          clearInterval(quizTimer); quizTimer = null;
          submitQuiz();
          return;
        }
        quizTimeLeft.value--;
      }, 1000);
    }

    async function startQuiz(quizId) {
      quizLoading.value = true;
      quizResults.value = null;
      Object.keys(quizAnswers).forEach(k => delete quizAnswers[k]);
      quizCurrentQuestion.value = 0;
      if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
      try {
        const res = await api(`/quiz/${quizId}`);
        if (res.ok) {
          const quizData = await res.json();
          activeQuiz.value = quizData;
        }
        const attemptRes = await api(`/quiz/${quizId}/start`, {
          method: 'POST',
          body: JSON.stringify({ userId: currentUserId.value, personaId: currentPersonaId.value || '' }),
        });
        if (attemptRes.ok) {
          quizAttempt.value = await attemptRes.json();
          if (activeQuiz.value && activeQuiz.value.time_limit_seconds) {
            quizTimeLeft.value = activeQuiz.value.time_limit_seconds;
            startQuizTimer();
          }
        }
      } catch {} finally { quizLoading.value = false; }
    }

    function selectQuizAnswer(questionId, answer) {
      quizAnswers[questionId] = answer;
    }

    function toggleQuizAnswer(questionId, option) {
      const current = quizAnswers[questionId] || [];
      if (current.includes(option)) {
        quizAnswers[questionId] = current.filter(a => a !== option);
      } else {
        quizAnswers[questionId] = [...current, option];
      }
    }

    function nextQuizQuestion() {
      if (!activeQuiz.value) return;
      quizCurrentQuestion.value = Math.min(quizCurrentQuestion.value + 1, activeQuiz.value.questions.length - 1);
    }

    function prevQuizQuestion() {
      quizCurrentQuestion.value = Math.max(quizCurrentQuestion.value - 1, 0);
    }

    async function submitQuiz() {
      if (!quizAttempt.value) return;
      quizSubmitting.value = true;
      try {
        const answers = (activeQuiz.value.questions || []).map(q => ({
          questionId: q.id,
          answer: quizAnswers[q.id] || null,
          skipped: !quizAnswers[q.id],
        }));
        const res = await api(`/quiz/attempt/${quizAttempt.value.attemptId}/submit`, {
          method: 'POST',
          body: JSON.stringify({ answers, timeTakenSeconds: null }),
        });
        if (res.ok) {
          quizResults.value = await res.json();
        }
      } catch {} finally { quizSubmitting.value = false; }
    }

    function closeQuiz() {
      if (quizTimer) { clearInterval(quizTimer); quizTimer = null; }
      activeQuiz.value = null;
      quizAttempt.value = null;
      quizCurrentQuestion.value = 0;
      Object.keys(quizAnswers).forEach(k => delete quizAnswers[k]);
      quizResults.value = null;
      quizTimeLeft.value = null;
    }

    // ========== MEDIA FUNCTIONS ==========
    async function loadMediaGallery() {
      mediaLoading.value = true;
      try {
        const pid = currentPersonaId.value || '';
        const typeFilter = mediaFilter.value !== 'all' ? `&type=${mediaFilter.value}` : '';
        const res = await api(`/media/gallery?persona_id=${encodeURIComponent(pid)}${typeFilter}`);
        if (res.ok) {
          const data = await res.json();
          mediaGallery.value = data.gallery || [];
        }
      } catch {} finally { mediaLoading.value = false; }
    }

    async function loadMediaFolders() {
      try {
        const pid = currentPersonaId.value || '';
        const res = await api(`/media/folders?persona_id=${encodeURIComponent(pid)}`);
        if (res.ok) {
          const data = await res.json();
          mediaFolders.value = data.folders || [];
        }
      } catch {}
    }

    function openMediaViewer(item) {
      mediaViewerItem.value = item;
    }

    function closeMediaViewer() {
      mediaViewerItem.value = null;
    }

    function handleMediaUpload(files) {
      mediaUploadFiles.value = Array.from(files).map(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        let mediaType = 'document';
        if (f.type.startsWith('image/')) mediaType = 'image';
        else if (f.type.startsWith('video/')) mediaType = 'video';
        else if (f.type.startsWith('audio/')) mediaType = 'audio';
        else if (['pdf'].includes(ext)) mediaType = 'document';
        else if (['ppt','pptx','key'].includes(ext)) mediaType = 'presentation';
        else if (['xls','xlsx','csv'].includes(ext)) mediaType = 'spreadsheet';
        else if (['zip','rar','7z','tar','gz'].includes(ext)) mediaType = 'archive';
        return {
          file: f,
          name: f.name,
          type: mediaType,
          mimeType: f.type,
          size: f.size,
          preview: null,
          title: f.name.replace(/\.[^/.]+$/, ''),
        };
      });
      mediaUploadFiles.value.forEach(f => {
        if (f.mimeType && f.mimeType.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => { f.preview = e.target.result; };
          reader.readAsDataURL(f.file);
        }
      });
    }

    async function uploadMedia() {
      if (!mediaUploadFiles.value.length) return;
      mediaUploading.value = true;
      mediaUploadProgress.value = 0;
      try {
        const total = mediaUploadFiles.value.length;
        let completed = 0;
        for (const f of mediaUploadFiles.value) {
          const formData = new FormData();
          formData.append('file', f.file);
          formData.append('title', f.title);
          if (currentPersonaId.value) formData.append('persona_id', currentPersonaId.value);
          const headers = {};
          if (authToken.value) headers['Authorization'] = `Bearer ${authToken.value}`;
          const res = await fetch('/api/media/upload', {
            method: 'POST',
            headers,
            body: formData,
          });
          completed++;
          mediaUploadProgress.value = Math.round((completed / total) * 100);
        }
        showMediaUpload.value = false;
        mediaUploadFiles.value = [];
        mediaUploadProgress.value = 0;
        loadMediaGallery();
      } catch {} finally { mediaUploading.value = false; }
    }

    function removeUploadFile(index) {
      mediaUploadFiles.value.splice(index, 1);
    }

    function getMediaIcon(type) {
      const icons = { image: '🖼️', video: '🎬', audio: '🎵', document: '📄', presentation: '📊', spreadsheet: '📈', archive: '📦', other: '📎' };
      return icons[type] || '📎';
    }

    function formatFileSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatDuration(secs) {
      if (!secs) return '';
      const m = Math.floor(secs / 60);
      const s = Math.round(secs % 60);
      return m + ':' + String(s).padStart(2, '0');
    }

    async function saveApiKey() {
      if (!authToken.value) { apiKeyStatus.value = t('login') + ' primeiro.'; return; }
      try {
        const res = await api('/settings/apikey', { method: 'PUT', body: JSON.stringify({ ollamaApiKey: apiKeyInput.value }) });
        const data = await res.json();
        apiKeyStatus.value = data.message || t('save') + '!';
        apiKeyInput.value = '';
      } catch { apiKeyStatus.value = 'Erro ao salvar.'; }
    }

    async function removeApiKey() {
      if (!authToken.value) return;
      try {
        await api('/settings/apikey', { method: 'PUT', body: JSON.stringify({ ollamaApiKey: '' }) });
        apiKeyStatus.value = t('remove') + '.';
      } catch {}
    }

    function copyPix() {
      const pixKey = donateData.value.pix?.key || 'haaspaulo88@gmail.com';
      navigator.clipboard.writeText(pixKey);
      pixCopied.value = true;
      setTimeout(() => pixCopied.value = false, 2000);
    }

    function formatDate(d) {
      if (!d) return '';
      return new Date(d).toLocaleDateString(currentLang.value === 'en-US' ? 'en-US' : currentLang.value === 'es-ES' ? 'es-ES' : 'pt-BR');
    }

    function saveLang() {
      localStorage.setItem('mp_lang', currentLang.value);
      updatePersonaDisplay();
    }

    async function acceptCookies(level) {
      const consent = level === 'all' ? 'all' : 'necessary';
      localStorage.setItem('cookie_consent', consent);
      showCookieBanner.value = false;
      try {
        const token = authToken.value || localStorage.getItem('mp_token');
        if (token) {
          await fetch('/api/auth/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ data_processing: 1, cookie_consent: consent }),
          });
        }
      } catch {}
    }

    onMounted(() => {
      if (authToken.value) {
        enterApp();
      }

      if ('speechSynthesis' in window) {
        speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
      }

      document.addEventListener('click', (e) => {
        if (showPersonaDropdown.value && !e.target.closest('.persona-switcher-area')) {
          showPersonaDropdown.value = false;
        }
      });
    });

    return {
      view, sidebarOpen, sidebarTab, showAuthModal, showDonate, showPersonaDropdown,
      authMode, authError, authLoading, authEmail, authPassword, authName,
      authToken, currentPersonaId, currentPersonaName, currentPersonaIcon, currentPersonaAvatar, currentAccentColor,
      currentPalette, currentFontFamily, currentBackgroundStyle, currentAvatarStyle, currentEmojiStyle, currentAnimationStyle,
      isBusinessPersona, contentTabLabel,
      brandName, brandIcon, brandLogoUrl, telegramUrl, whatsappUrl, donateData,
      personas, messages, streaming, inputMsg, conversations,
      blogPosts, currentPost, searchQuery, searchResults, searchDone, bibleBooks,
      showBibleIndex, knowledgeSourceList, sourceContentView, sourceContentLoading,
      sourcesPanel, sourcesCollapsed, profileName, profileTags, inputEl, messagesContainer,
      quickQuestions, features, welcomeTitle, welcomeBody, inputPlaceholder,
      isRecording, apiKeyInput, apiKeyStatus, pixCopied,
      showOnboarding, onboardingQuestion, onboardingAnswer,
      onboardingSteps, onboardingStepIndex, onboardingTotalSteps,
      onboardingCompletedSteps, onboardingProgress, onboardingIsComplete,
      onboardingShowCelebration,
      showFollowUp, followUpData, followUpAnswer,
      quickActions, contextualWelcome,
      currentLang, t,

      // Quiz
      quizzes, activeQuiz, quizAttempt, quizCurrentQuestion, quizAnswers, quizResults, quizLoading, quizSubmitting, quizTimeLeft,
      // Media
      mediaGallery, mediaFilter, mediaViewerItem, mediaLoading, mediaFolders,
      showMediaUpload, mediaUploading, mediaUploadProgress, mediaUploadFiles,

      showAuth, skipAuth, doAuth, doGoogleAuth, logout, enterApp,
      changePassword,
      linkCode, linkCodeExpiry, linkStatus, showLinkCode,
      generateLinkCode, loadLinkStatus, unlinkAccount,
      switchPersona, getPersonaEmoji, getPersonaName, sendMessage, scrollToBottom, autoResize,
      speakText, formatMarkdown, loadConversations, loadSession, deleteSession, newChat,
      loadBlog, viewPost, doSearch, searchSource, loadBibleBooks,
      saveProfile, saveApiKey, removeApiKey, copyPix, formatDate, saveLang, acceptCookies,
      submitOnboardingAnswer, checkFollowUp, answerFollowUp, dismissFollowUp,
      sendQuickAction, loadQuickActions, loadContextualWelcome,
      isRecording, toggleMic,
      showCookieBanner,
      // Quiz functions
      loadQuizzes, startQuiz, selectQuizAnswer, toggleQuizAnswer, nextQuizQuestion, prevQuizQuestion, submitQuiz, closeQuiz,
      // Media functions
      loadMediaGallery, loadMediaFolders, openMediaViewer, closeMediaViewer, getMediaIcon, formatFileSize, formatDuration,
      handleMediaUpload, uploadMedia, removeUploadFile,
    };
  }
});

app.config.errorHandler = (err) => {
  if (err && err.message && err.message.includes("Cannot read properties of undefined (reading 'length')")) return;
  console.error('[MetaPersona.AI] Vue error:', err);
};

app.mount('#app');

console.log('[MetaPersona.AI] App mounted successfully');