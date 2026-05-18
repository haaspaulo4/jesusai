const translations = {
  'pt-BR': {
    welcomeTitle: 'Olá! Estou aqui para ajudar.',
    welcomeBody: 'Estou aqui para ouvir você, responder suas perguntas e aprender com nossas conversas. Pergunte-me qualquer coisa — vou responder com conhecimento e cuidado.',
    welcomeHint: 'Me diga seu nome, se quiser. Eu me lembro de você.',
    welcomeTTS: 'Olá! Estou aqui para ajudar você. Pergunte-me qualquer coisa. Me diga seu nome, se quiser. Eu me lembro de você.',
    newChat: 'Nova conversa',
    inputPlaceholder: 'Pergunte ou compartilhe comigo...',
    chatError: 'Não foi possível me conectar agora. Verifique sua internet e tente novamente.',
    chatErrorVerse: 'Tudo vai dar certo — tente novamente.',
    chatNoResponse: 'Não foi possível gerar uma resposta agora. Tente novamente em breve.',
    cjkFallback: 'Desculpe, não consegui processar sua mensagem corretamente. Por favor, tente novamente.',
    sourcesTitle: 'Fontes utilizadas',
    sourcesToggle: 'ocultar',
    sourcesToggleShow: 'mostrar',
    sidebarChat: 'Chat',
    sidebarWord: 'Conteúdo',
    sidebarSearch: 'Buscar',
    sidebarConversations: 'Conversas',
    sidebarProfile: 'Seu perfil',
    profileNamePlaceholder: 'Seu nome...',
    profileJourneyPlaceholder: 'Conte sobre sua experiência...',
    donateBtn: 'Contribuir',
    donateTitle: 'Apoie este projeto',
    donateVerse: '"Cada um contribua segundo o que decidiu no coração."',
    donatePixLabel: 'Chave PIX (email):',
    donatePixHint: 'Abra o app do seu banco, escolha PIX e cole a chave acima.',
    donateVoluntary: 'A contribuição é <strong>voluntária</strong>. Ninguém fica impedido de usar por falta de recursos.',
    donateAlt: 'O código é open source. Quem quiser pode rodar por conta própria.',
    settingsApiKey: 'Sua API Key (opcional)',
    settingsApiKeyDesc: 'Se a resposta falhar, você pode usar sua própria chave da Ollama Cloud.',
    settingsApiKeySave: 'Salvar chave',
    settingsApiKeyRemove: 'Remover',
    settingsApiKeyLogin: 'Faça login para salvar sua API key.',
    settingsApiKeySaved: 'API key salva. Agora você usa sua própria chave para o chat.',
    settingsApiKeyRemoved: 'API key removida. Usando a chave padrão do servidor.',
    settingsApiKeyError: 'Erro ao salvar.',
    feedbackTitle: 'Feedback',
    feedbackSuggestion: 'Sugestão',
    feedbackBug: 'Bug',
    feedbackPraise: 'Elogio',
    feedbackOther: 'Outro',
    feedbackPlaceholder: 'Compartilhe algo conosco...',
    feedbackSubmit: 'Enviar',
    feedbackSent: 'Enviado!',
    onboardingTitle1: 'Bem-vindo ao MetaPersona.AI',
    onboardingDesc1: 'Converse com nosso assistente virtual. Respostas fundamentadas em conhecimento real, com memória e personalização.',
    onboardingTitle2: 'Conhecimento e Busca',
    onboardingDesc2: 'Busque informações por tema, palavra ou referência. Conteúdo atualizado e relevante.',
    onboardingTitle3: 'Como quer ser chamado?',
    onboardingDesc3: 'Queremos te conhecer pelo nome. É opcional, mas vamos nos lembrar de você.',
    onboardingNamePlaceholder: 'Seu nome (opcional)',
    onboardingNext: 'Avançar',
    onboardingStart: 'Começar',
    onboardingSkip: 'Pular',
    authLogin: 'Entrar',
    authRegister: 'Criar conta',
    authEmail: 'Email',
    authPassword: 'Senha',
    authPasswordPlaceholder: 'Mínimo 6 caracteres',
    authName: 'Nome (opcional)',
    authNamePlaceholder: 'Seu nome',
    authNoAccount: 'Não tem conta?',
    authHasAccount: 'Já tem conta?',
    authLoginBtn: 'Entrar',
    authRegisterBtn: 'Criar conta',
    authLoggingIn: 'Entrando...',
    authCreating: 'Criando...',
    authEnterEmail: 'Preencha email e senha.',
    authSkip: 'Continuar sem login',
    authTitle: 'Entre para salvar suas conversas',
    authGoogleBtn: 'Continuar com Google',
    authOr: 'ou',
    logoutBtn: 'Sair',
    blogTitle: 'Conteúdo do Dia',
    blogSubtitle: 'Reflexões e conteúdos gerados diariamente',
    blogEmpty: 'Nenhum artigo ainda. Volte em breve!',
    blogError: 'Erro ao carregar artigos.',
    blogComments: 'Comentários',
    blogCommentPlaceholder: 'Compartilhe sua reflexão...',
    blogCommentBtn: 'Enviar',
    blogReplyPlaceholder: 'Escreva uma resposta...',
    blogReplySubmit: 'Responder',
    blogReplyCancel: 'Cancelar',
    blogBack: 'Voltar aos artigos',
    searchTitle: 'Buscar no Conhecimento',
    searchSubtitle: 'Encontre informações por tema, palavra ou referência',
    searchPlaceholder: 'Ex: vendas, liderança, estratégia...',
    searchBtn: 'Buscar',
    searchLoading: 'Buscando...',
    searchEmpty: 'Nenhum resultado encontrado para essa busca. Tente outra palavra.',
    searchError: 'Erro na busca. O servidor pode estar offline. Tente novamente.',
    landingTitle: 'Converse com <span class="gold">inteligência</span>',
    landingSubtitle: 'Um assistente virtual com conhecimento real, que te conhece pelo nome e lembra de você. Pergunte, compartilhe, aprenda.',
    landingBadge: 'Plataforma Whitelabel de IA',
    landingCta: 'Começar agora',
    landingLearnMore: 'Saiba mais',
    landingVerse: '"Conhecimento é poder — quando compartilhado com propósito."',
    landingFeature1Title: 'Conhecimento Real',
    landingFeature1Desc: 'Cada resposta é fundamentada em conteúdo indexado, buscado automaticamente por tema e relevância.',
    landingFeature2Title: 'Memória e Contexto',
    landingFeature2Desc: 'O assistente se lembra de você — seu nome, seus temas, suas preferências. Cada conversa constrói um relacionamento.',
    landingFeature3Title: 'Áudio e Texto',
    landingFeature3Desc: 'Ouça as respostas em voz natural, com TTS nativo em português do Brasil.',
    landingFeature4Title: 'Busca Inteligente',
    landingFeature4Desc: 'Pesquise por tema, palavra ou referência no conhecimento indexado.',
    landingFeature5Title: 'Conteúdo do Dia',
    landingFeature5Desc: 'Conteúdo gerado diariamente com base no conhecimento, sempre relevante.',
    landingFeature6Title: 'Telegram Bot',
    landingFeature6Desc: 'Converse pelo Telegram, com os mesmos recursos de memória e personalização.',
    landingFeature7Title: 'WhatsApp Bot',
    landingFeature7Desc: 'Converse pelo WhatsApp, com áudio e memória entre plataformas.',
    landingAboutTitle: 'Sobre o projeto',
    landingAboutText: 'MetaPersona.AI é uma plataforma de assistentes virtuais com RAG multimodal. Usamos inteligência artificial para buscar conhecimento relevante e gerar respostas fundamentadas.',
    landingAboutDisclaimer: '<strong>Importante:</strong> Este é um assistente virtual com inteligência artificial. As respostas são geradas com base no conhecimento indexado e podem conter imperfeições.',
    landingStat1: 'Itens indexados',
    landingStat2: 'Fontes de conhecimento',
    landingStat3: 'Sempre disponível',
    landingSupportTitle: 'Apoie este projeto',
    landingSupportText: 'MetaPersona.AI é <strong>gratuito e sempre será</strong>. Ninguém fica impedido de conversar por falta de recursos. Sua contribuição ajuda a manter os servidores e melhorar a experiência.',
    landingSupportVerse: '"Cada um contribua segundo o que decidiu no coração."',
    landingDonateCta: 'Contribuir via PIX',
    landingPrinciple1Title: '100% voluntário',
    landingPrinciple1Desc: 'Contribuição nunca é obrigatória',
    landingPrinciple2Title: 'Open Source',
    landingPrinciple2Desc: 'Código aberto — modifique, adapte, auto-hospede',
    landingPrinciple3Title: 'Conhecimento acessível',
    landingPrinciple3Desc: 'Tecnologia a serviço do humano',
    landingNavBlog: 'Conteúdo',
    landingNavSearch: 'Buscar',
    landingNavLogin: 'Entrar',
    disclaimerMain: 'Assistente virtual com IA. As respostas são geradas com base no conhecimento indexado e podem conter imperfeições.',
    disclaimerSub: 'Plataforma whitelabel de assistentes virtuais com RAG multimodal e multi-persona.',
    footer: 'MetaPersona.AI — Open source.',
    identityPrompt: `CRITICAL: You MUST respond in the SAME LANGUAGE the person is using. If they write in English, respond in English. If they write in Portuguese, respond in Portuguese. If they write in Spanish, respond in Spanish. NEVER output Chinese characters. This is an absolute rule.

You are a virtual assistant powered by AI. You are helpful, knowledgeable, and empathetic.

YOUR PURPOSE:
- Help people with their questions and concerns
- Provide accurate, well-founded answers based on the knowledge available
- Be genuinely interested in each person and their needs
- Maintain a warm, professional, and respectful tone

YOUR CAPABILITIES:
- Search and retrieve relevant information from indexed knowledge bases
- Remember details about each person across conversations
- Respond in the language the person is using
- Provide sources for your answers when available

INVARIABLE RULES:
1. Be authentic and helpful — never dismissive or cold
2. BASE your responses on the knowledge provided in the CONTEXT below. If no relevant information is available, say: "I don't have specific information about this in my knowledge base. What I can tell you is..."
3. CITE your sources when you reference specific information
4. Use warm but professional language — be empathetic without being superficial
5. Adapt your tone: comforting for those who are struggling, encouraging for those seeking motivation, informative for those seeking knowledge
6. Remember what each person shares — personalize your responses
7. RESPOND IN THE LANGUAGE THE PERSON IS USING
8. If someone asks something outside your knowledge base, be honest about your limitations
9. Always encourage critical thinking and seeking additional sources when appropriate
10. If someone is in crisis, guide them to seek appropriate professional help`,
    contextBlock: `\n\nKNOWLEDGE FOUND (CONTEXT FOR THIS RESPONSE):\n{context}\n\nUse this knowledge as the basis for your response. Cite it when relevant.`,
    memoryBlock: `\n\nMEMORY OF THIS CONVERSATION:\n{memory}\n\nRemember what this person has shared. Respond as someone who knows and cares.`,
    profileBlock: '\n\nTHIS PERSON\'S PROFILE (persists across conversations):\n{profile}\nUse this knowledge to personalize your response. Call them by name if you know it, reference topics and emotions when relevant.',
    conversationWith: 'Talking with: {name}. Call this person by name when appropriate.',
    voiceLabel: 'Ouvir',
    transcribed: 'Transcrito: "{text}"',
    audioFallback: 'Recebi seu áudio, mas não consegui transcrever. Por favor, envie como texto.',
    audioDownloadFail: 'Recebi seu áudio, mas não consegui baixar. Por favor, envie como texto.',
    audioProcessFail: 'Não consegui processar seu áudio. Por favor, envie como texto.',
    audioTooLarge: 'Áudio muito grande. Envie áudios de até 20MB.',
    llmError: 'Desculpe, houve uma dificuldade técnica. Por favor, tente novamente em breve.',
  },

  'en-US': {
    welcomeTitle: 'Hello! I\'m here to help.',
    welcomeBody: 'I\'m here to listen to you, answer your questions, and learn from our conversations. Ask me anything — I\'ll respond with knowledge and care.',
    welcomeHint: 'Tell me your name, if you wish. I will remember you.',
    welcomeTTS: 'Hello! I\'m here to help you. Ask me anything. Tell me your name, if you wish. I will remember you.',
    newChat: 'New conversation',
    inputPlaceholder: 'Ask or share with me...',
    chatError: 'Could not connect right now. Check your internet and try again.',
    chatErrorVerse: 'Everything will be alright — please try again.',
    chatNoResponse: 'Could not generate a response right now. Please try again later.',
    cjkFallback: 'Sorry, I couldn\'t process your message correctly. Please try again.',
    sourcesTitle: 'Sources used',
    sourcesToggle: 'hide',
    sourcesToggleShow: 'show',
    sidebarChat: 'Chat',
    sidebarWord: 'Content',
    sidebarSearch: 'Search',
    sidebarConversations: 'Conversations',
    sidebarProfile: 'Your profile',
    profileNamePlaceholder: 'Your name...',
    profileJourneyPlaceholder: 'Share about your experience...',
    donateBtn: 'Donate',
    donateTitle: 'Support this project',
    donateVerse: '"Each of you should give what you have decided in your heart to give."',
    donatePixLabel: 'PIX key (email):',
    donatePixHint: 'Open your banking app, choose PIX and paste the key above.',
    donateVoluntary: 'Contributions are <strong>voluntary</strong>. No one is prevented from using this for lack of resources.',
    donateAlt: 'The code is open source. Anyone can run it on their own.',
    settingsApiKey: 'Your API Key (optional)',
    settingsApiKeyDesc: 'If the response fails, you can use your own Ollama Cloud key.',
    settingsApiKeySave: 'Save key',
    settingsApiKeyRemove: 'Remove',
    settingsApiKeyLogin: 'Log in to save your API key.',
    settingsApiKeySaved: 'API key saved. Now using your own key for chat.',
    settingsApiKeyRemoved: 'API key removed. Using the default server key.',
    settingsApiKeyError: 'Error saving.',
    feedbackTitle: 'Feedback',
    feedbackSuggestion: 'Suggestion',
    feedbackBug: 'Bug',
    feedbackPraise: 'Praise',
    feedbackOther: 'Other',
    feedbackPlaceholder: 'Share something with us...',
    feedbackSubmit: 'Submit',
    feedbackSent: 'Sent!',
    onboardingTitle1: 'Welcome to MetaPersona.AI',
    onboardingDesc1: 'Chat with our virtual assistant. Answers grounded in real knowledge, with memory and personalization.',
    onboardingTitle2: 'Knowledge & Search',
    onboardingDesc2: 'Search for information by topic, word, or reference. Updated and relevant content.',
    onboardingTitle3: 'What should I call you?',
    onboardingDesc3: 'We\'d love to know you by name. It\'s optional, but we\'ll remember you.',
    onboardingNamePlaceholder: 'Your name (optional)',
    onboardingNext: 'Next',
    onboardingStart: 'Start',
    onboardingSkip: 'Skip',
    authLogin: 'Log in',
    authRegister: 'Create account',
    authEmail: 'Email',
    authPassword: 'Password',
    authPasswordPlaceholder: 'Minimum 6 characters',
    authName: 'Name (optional)',
    authNamePlaceholder: 'Your name',
    authNoAccount: "Don't have an account?",
    authHasAccount: 'Already have an account?',
    authLoginBtn: 'Log in',
    authRegisterBtn: 'Create account',
    authLoggingIn: 'Logging in...',
    authCreating: 'Creating...',
    authEnterEmail: 'Please fill in email and password.',
    authSkip: 'Continue without login',
    authTitle: 'Log in to save your conversations',
    authGoogleBtn: 'Continue with Google',
    authOr: 'or',
    logoutBtn: 'Log out',
    blogTitle: 'Content of the Day',
    blogSubtitle: 'Daily reflections and generated content',
    blogEmpty: 'No articles yet. Come back soon!',
    blogError: 'Error loading articles.',
    blogComments: 'Comments',
    blogCommentPlaceholder: 'Share your thoughts...',
    blogCommentBtn: 'Submit',
    blogReplyPlaceholder: 'Write a reply...',
    blogReplySubmit: 'Reply',
    blogReplyCancel: 'Cancel',
    blogBack: 'Back to articles',
    searchTitle: 'Search Knowledge',
    searchSubtitle: 'Find information by topic, word, or reference',
    searchPlaceholder: 'e.g., sales, leadership, strategy...',
    searchBtn: 'Search',
    searchLoading: 'Searching...',
    searchEmpty: 'No results found for this search. Try another word.',
    searchError: 'Search error. The server may be offline. Please try again.',
    landingTitle: 'Talk to <span class="gold">intelligence</span>',
    landingSubtitle: 'A virtual assistant with real knowledge, that knows you by name and remembers you. Ask, share, learn.',
    landingBadge: 'Whitelabel AI Platform',
    landingCta: 'Start now',
    landingLearnMore: 'Learn more',
    landingVerse: '"Knowledge is power — when shared with purpose."',
    landingFeature1Title: 'Real Knowledge',
    landingFeature1Desc: 'Every answer is grounded in indexed content, automatically searched by topic and relevance.',
    landingFeature2Title: 'Memory & Context',
    landingFeature2Desc: 'The assistant remembers you — your name, your topics, your preferences. Each conversation builds a relationship.',
    landingFeature3Title: 'Audio & Text',
    landingFeature3Desc: 'Listen to responses aloud with native text-to-speech.',
    landingFeature4Title: 'Smart Search',
    landingFeature4Desc: 'Search by topic, word, or reference across all indexed knowledge.',
    landingFeature5Title: 'Daily Content',
    landingFeature5Desc: 'Content generated daily based on knowledge, always relevant.',
    landingFeature6Title: 'Telegram Bot',
    landingFeature6Desc: 'Chat on Telegram, with the same memory and personalization features.',
    landingFeature7Title: 'WhatsApp Bot',
    landingFeature7Desc: 'Chat on WhatsApp, with audio and cross-platform memory.',
    landingAboutTitle: 'About the project',
    landingAboutText: 'MetaPersona.AI is a virtual assistant platform with multimodal RAG. We use AI to find relevant knowledge and generate well-founded responses.',
    landingAboutDisclaimer: '<strong>Important:</strong> This is an AI-powered virtual assistant. Responses are generated based on indexed knowledge and may contain imperfections.',
    landingStat1: 'Indexed items',
    landingStat2: 'Knowledge sources',
    landingStat3: 'Always available',
    landingSupportTitle: 'Support this project',
    landingSupportText: 'MetaPersona.AI is <strong>free and always will be</strong>. No one is prevented from chatting for lack of resources. Your contribution helps keep the servers running and improve the experience.',
    landingSupportVerse: '"Each of you should give what you have decided in your heart to give."',
    landingDonateCta: 'Contribute via PIX',
    landingPrinciple1Title: '100% voluntary',
    landingPrinciple1Desc: 'Contributions are never required',
    landingPrinciple2Title: 'Open Source',
    landingPrinciple2Desc: 'Open code — modify, adapt, self-host',
    landingPrinciple3Title: 'Accessible knowledge',
    landingPrinciple3Desc: 'Technology in service of people',
    landingNavBlog: 'Content',
    landingNavSearch: 'Search',
    landingNavLogin: 'Log in',
    disclaimerMain: 'AI-powered virtual assistant. Responses are generated based on indexed knowledge and may contain imperfections.',
    disclaimerSub: 'Whitelabel virtual assistant platform with multimodal RAG and multi-persona.',
    footer: 'MetaPersona.AI — Open source.',
    identityPrompt: `CRITICAL: You MUST respond in the SAME LANGUAGE the person is using. If they write in English, respond in English. If they write in Portuguese, respond in Portuguese. If they write in Spanish, respond in Spanish. NEVER output Chinese characters. This is an absolute rule.

You are a virtual assistant powered by AI. You are helpful, knowledgeable, and empathetic.

YOUR PURPOSE:
- Help people with their questions and concerns
- Provide accurate, well-founded answers based on the knowledge available
- Be genuinely interested in each person and their needs
- Maintain a warm, professional, and respectful tone

YOUR CAPABILITIES:
- Search and retrieve relevant information from indexed knowledge bases
- Remember details about each person across conversations
- Respond in the language the person is using
- Provide sources for your answers when available

INVARIABLE RULES:
1. Be authentic and helpful — never dismissive or cold
2. BASE your responses on the knowledge provided in the CONTEXT below. If no relevant information is available, say: "I don't have specific information about this in my knowledge base. What I can tell you is..."
3. CITE your sources when you reference specific information
4. Use warm but professional language — be empathetic without being superficial
5. Adapt your tone: comforting for those who are struggling, encouraging for those seeking motivation, informative for those seeking knowledge
6. Remember what each person shares — personalize your responses
7. RESPOND IN THE LANGUAGE THE PERSON IS USING
8. If someone asks something outside your knowledge base, be honest about your limitations
9. Always encourage critical thinking and seeking additional sources when appropriate
10. If someone is in crisis, guide them to seek appropriate professional help`,
    contextBlock: `\n\nKNOWLEDGE FOUND (CONTEXT FOR THIS RESPONSE):\n{context}\n\nUse this knowledge as the basis for your response. Cite it when relevant.`,
    memoryBlock: `\n\nMEMORY OF THIS CONVERSATION:\n{memory}\n\nRemember what this person has shared. Respond as someone who knows and cares.`,
    profileBlock: '\n\nTHIS PERSON\'S PROFILE (persists across conversations):\n{profile}\nUse this knowledge to personalize your response. Call them by name if you know it, reference topics and emotions when relevant.',
    conversationWith: 'Talking with: {name}. Call this person by name when appropriate.',
    voiceLabel: 'Listen',
    transcribed: 'Transcribed: "{text}"',
    audioFallback: 'I received your audio but could not transcribe it. Please send a text message.',
    audioDownloadFail: 'I received your audio but could not download it. Please send a text message.',
    audioProcessFail: 'I could not process your audio. Please send a text message.',
    audioTooLarge: 'Audio file too large. Please send audio files up to 20MB.',
    llmError: 'Sorry, there was a technical difficulty. Please try again soon.',
  },

  'es-ES': {
    welcomeTitle: '¡Hola! Estoy aquí para ayudar.',
    welcomeBody: 'Estoy aquí para escucharte, responder tus preguntas y aprender de nuestras conversaciones. Pregúntame lo que quieras — responderé con conocimiento y cuidado.',
    welcomeHint: 'Dime tu nombre, si quieres. Yo me acordaré de ti.',
    welcomeTTS: '¡Hola! Estoy aquí para ayudarte. Pregúntame lo que quieras. Dime tu nombre, si quieres. Yo me acordaré de ti.',
    newChat: 'Nueva conversación',
    inputPlaceholder: 'Pregunta o comparte conmigo...',
    chatError: 'No pude conectarme ahora. Verifica tu internet e inténtalo de nuevo.',
    chatErrorVerse: 'Todo va a salir bien — inténtalo de nuevo.',
    chatNoResponse: 'No se pudo generar una respuesta ahora. Inténtalo de nuevo más tarde.',
    cjkFallback: 'Disculpa, no pude procesar tu mensaje correctamente. Por favor, inténtalo de nuevo.',
    sourcesTitle: 'Fuentes utilizadas',
    sourcesToggle: 'ocultar',
    sourcesToggleShow: 'mostrar',
    sidebarChat: 'Chat',
    sidebarWord: 'Contenido',
    sidebarSearch: 'Buscar',
    sidebarConversations: 'Conversaciones',
    sidebarProfile: 'Tu perfil',
    profileNamePlaceholder: 'Tu nombre...',
    profileJourneyPlaceholder: 'Cuéntame sobre tu experiencia...',
    donateBtn: 'Contribuir',
    donateTitle: 'Apoya este proyecto',
    donateVerse: '"Cada uno contribuya según lo que haya decidido en su corazón."',
    donatePixLabel: 'Clave PIX (email):',
    donatePixHint: 'Abre la app de tu banco, elige PIX y pega la clave arriba.',
    donateVoluntary: 'La contribución es <strong>voluntaria</strong>. Nadie queda impedido de usar por falta de recursos.',
    donateAlt: 'El código es open source. Quien quiera puede ejecutarlo por su cuenta.',
    settingsApiKey: 'Tu API Key (opcional)',
    settingsApiKeyDesc: 'Si la respuesta falla, puedes usar tu propia clave de Ollama Cloud.',
    settingsApiKeySave: 'Guardar clave',
    settingsApiKeyRemove: 'Eliminar',
    settingsApiKeyLogin: 'Inicia sesión para guardar tu API key.',
    settingsApiKeySaved: 'API key guardada. Ahora usas tu propia clave para el chat.',
    settingsApiKeyRemoved: 'API key eliminada. Usando la clave predeterminada del servidor.',
    settingsApiKeyError: 'Error al guardar.',
    feedbackTitle: 'Comentarios',
    feedbackSuggestion: 'Sugerencia',
    feedbackBug: 'Bug',
    feedbackPraise: 'Elogio',
    feedbackOther: 'Otro',
    feedbackPlaceholder: 'Comparte algo con nosotros...',
    feedbackSubmit: 'Enviar',
    feedbackSent: '¡Enviado!',
    onboardingTitle1: 'Bienvenido a MetaPersona.AI',
    onboardingDesc1: 'Habla con nuestro asistente virtual. Respuestas fundamentadas en conocimiento real, con memoria y personalización.',
    onboardingTitle2: 'Conocimiento y Búsqueda',
    onboardingDesc2: 'Busca información por tema, palabra o referencia. Contenido actualizado y relevante.',
    onboardingTitle3: '¿Cómo quieres que te llame?',
    onboardingDesc3: 'Queremos conocerte por nombre. Es opcional, pero nos acordaremos de ti.',
    onboardingNamePlaceholder: 'Tu nombre (opcional)',
    onboardingNext: 'Siguiente',
    onboardingStart: 'Comenzar',
    onboardingSkip: 'Omitir',
    authLogin: 'Iniciar sesión',
    authRegister: 'Crear cuenta',
    authEmail: 'Email',
    authPassword: 'Contraseña',
    authPasswordPlaceholder: 'Mínimo 6 caracteres',
    authName: 'Nombre (opcional)',
    authNamePlaceholder: 'Tu nombre',
    authNoAccount: '¿No tienes cuenta?',
    authHasAccount: '¿Ya tienes cuenta?',
    authLoginBtn: 'Iniciar sesión',
    authRegisterBtn: 'Crear cuenta',
    authLoggingIn: 'Iniciando...',
    authCreating: 'Creando...',
    authEnterEmail: 'Por favor completa email y contraseña.',
    authSkip: 'Continuar sin login',
    authTitle: 'Inicia sesión para guardar tus conversaciones',
    authGoogleBtn: 'Continuar con Google',
    authOr: 'o',
    logoutBtn: 'Cerrar sesión',
    blogTitle: 'Contenido del Día',
    blogSubtitle: 'Reflexiones y contenidos generados diariamente',
    blogEmpty: 'Sin artículos aún. ¡Vuelve pronto!',
    blogError: 'Error al cargar artículos.',
    blogComments: 'Comentarios',
    blogCommentPlaceholder: 'Comparte tu reflexión...',
    blogCommentBtn: 'Enviar',
    blogReplyPlaceholder: 'Escribe una respuesta...',
    blogReplySubmit: 'Responder',
    blogReplyCancel: 'Cancelar',
    blogBack: 'Volver a los artículos',
    searchTitle: 'Buscar en el Conocimiento',
    searchSubtitle: 'Encuentra información por tema, palabra o referencia',
    searchPlaceholder: 'Ej: ventas, liderazgo, estrategia...',
    searchBtn: 'Buscar',
    searchLoading: 'Buscando...',
    searchEmpty: 'No se encontraron resultados para esta búsqueda. Intenta con otra palabra.',
    searchError: 'Error en la búsqueda. El servidor puede estar offline. Inténtalo de nuevo.',
    landingTitle: 'Habla con <span class="gold">inteligencia</span>',
    landingSubtitle: 'Un asistente virtual con conocimiento real, que te conoce por tu nombre y se acuerda de ti. Pregunta, comparte, aprende.',
    landingBadge: 'Plataforma Whitelabel de IA',
    landingCta: 'Comenzar ahora',
    landingLearnMore: 'Saber más',
    landingVerse: '"El conocimiento es poder — cuando se comparte con propósito."',
    landingFeature1Title: 'Conocimiento Real',
    landingFeature1Desc: 'Cada respuesta está fundamentada en contenido indexado, buscado automáticamente por tema y relevancia.',
    landingFeature2Title: 'Memoria y Contexto',
    landingFeature2Desc: 'El asistente se acuerda de ti — tu nombre, tus temas, tus preferencias. Cada conversación construye una relación.',
    landingFeature3Title: 'Audio y Texto',
    landingFeature3Desc: 'Escucha las respuestas en voz natural, con TTS nativo.',
    landingFeature4Title: 'Búsqueda Inteligente',
    landingFeature4Desc: 'Busca por tema, palabra o referencia en el conocimiento indexado.',
    landingFeature5Title: 'Contenido del Día',
    landingFeature5Desc: 'Contenido generado diariamente desde el conocimiento, siempre relevante.',
    landingFeature6Title: 'Bot de Telegram',
    landingFeature6Desc: 'Habla por Telegram, con los mismos recursos de memoria y personalización.',
    landingFeature7Title: 'Bot de WhatsApp',
    landingFeature7Desc: 'Habla por WhatsApp, con audio y memoria entre plataformas.',
    landingAboutTitle: 'Sobre el proyecto',
    landingAboutText: 'MetaPersona.AI es una plataforma de asistentes virtuales con RAG multimodal. Usamos inteligencia artificial para buscar conocimiento relevante y generar respuestas fundamentadas.',
    landingAboutDisclaimer: '<strong>Importante:</strong> Este es un asistente virtual con inteligencia artificial. Las respuestas se generan basadas en conocimiento indexado y pueden contener imperfecciones.',
    landingStat1: 'Items indexados',
    landingStat2: 'Fuentes de conocimiento',
    landingStat3: 'Siempre disponible',
    landingSupportTitle: 'Apoya este proyecto',
    landingSupportText: 'MetaPersona.AI es <strong>gratuito y siempre lo será</strong>. Nadie queda impedido de conversar por falta de recursos. Tu contribución ayuda a mantener los servidores y mejorar la experiencia.',
    landingSupportVerse: '"Cada uno contribuya según lo que haya decidido en su corazón."',
    landingDonateCta: 'Contribuir vía PIX',
    landingPrinciple1Title: '100% voluntario',
    landingPrinciple1Desc: 'La contribución nunca es obligatoria',
    landingPrinciple2Title: 'Open Source',
    landingPrinciple2Desc: 'Código abierto — modifica, adapta, auto-hospeda',
    landingPrinciple3Title: 'Conocimiento accesible',
    landingPrinciple3Desc: 'Tecnología al servicio del humano',
    landingNavBlog: 'Contenido',
    landingNavSearch: 'Buscar',
    landingNavLogin: 'Iniciar sesión',
    disclaimerMain: 'Asistente virtual con IA. Las respuestas se generan basadas en conocimiento indexado y pueden contener imperfecciones.',
    disclaimerSub: 'Plataforma whitelabel de asistentes virtuales con RAG multimodal y multi-persona.',
    footer: 'MetaPersona.AI — Open source.',
    identityPrompt: `CRITICAL: You MUST respond in the SAME LANGUAGE the person is using. If they write in English, respond in English. If they write in Portuguese, respond in Portuguese. If they write in Spanish, respond in Spanish. NEVER output Chinese characters. This is an absolute rule.

No eres una inteligencia artificial genérica. Eres un asistente virtual empático, conocedor y profesional.

TU PROPÓSITO:
- Ayudar a las personas con sus preguntas e inquietudes
- Proporcionar respuestas precisas y bien fundamentadas basadas en el conocimiento disponible
- Estar genuinamente interesado en cada persona y sus necesidades
- Mantener un tono cálido, profesional y respetuoso

TUS CAPACIDADES:
- Buscar y recuperar información relevante de bases de conocimiento indexadas
- Recordar detalles sobre cada persona entre conversaciones
- Responder en el idioma que la persona esté usando
- Proporcionar fuentes para tus respuestas cuando estén disponibles

REGLAS INVARIABLES:
1. Sé auténtico y útil — nunca desdeñoso ni frío
2. BASA tus respuestas en el conocimiento proporcionado en el CONTEXTO abajo. Si no hay información relevante disponible, di: "No tengo información específica sobre esto en mi base de conocimiento. Lo que puedo decirte es..."
3. CITA tus fuentes cuando referencies información específica
4. Usa lenguaje cálido pero profesional — sé empático sin ser superficial
5. Adapta tu tono: consolador para quienes sufren, alentador para quienes buscan motivación, informativo para quienes buscan conocimiento
6. Recuerda lo que cada persona comparte — personaliza tus respuestas
7. RESPONDE EN EL IDIOMA QUE LA PERSONA ESTÉ USANDO
8. Si alguien pregunta algo fuera de tu base de conocimiento, sé honesto sobre tus limitaciones
9. Siempre incentiva el pensamiento crítico y buscar fuentes adicionales cuando sea apropiado
10. Si alguien está en crisis, oriéntalo a buscar ayuda profesional apropiada`,
    contextBlock: `\n\nCONOCIMIENTO ENCONTRADO (CONTEXTO PARA ESTA RESPUESTA):\n{context}\n\nUsa este conocimiento como base para tu respuesta. Cítalo cuando sea pertinente.`,
    memoryBlock: `\n\nMEMORIA DE ESTA CONVERSACIÓN:\n{memory}\n\nRecuerda lo que esta persona ha compartido. Responde como quien conoce y se preocupa.`,
    profileBlock: '\n\nPERFIL DE ESTA PERSONA (persiste entre conversaciones):\n{profile}\nUsa este conocimiento para personalizar tu respuesta. Llámala por su nombre si lo sabes, referencia temas y emociones cuando sea pertinente.',
    conversationWith: 'Conversando con: {name}. Llama a esta persona por su nombre cuando sea apropiado.',
    voiceLabel: 'Escuchar',
    transcribed: 'Transcrito: "{text}"',
    audioFallback: 'Recibí tu audio pero no pude transcribirlo. Por favor, envía un mensaje de texto.',
    audioDownloadFail: 'Recibí tu audio pero no pude descargarlo. Por favor, envía un mensaje de texto.',
    audioProcessFail: 'No pude procesar tu audio. Por favor, envía un mensaje de texto.',
    audioTooLarge: 'Audio demasiado grande. Envía audios de hasta 20MB.',
    llmError: 'Disculpa, hubo una dificultad técnica. Por favor, inténtalo de nuevo pronto.',
  },
};

const SUPPORTED_LANGS = Object.keys(translations);
const DEFAULT_LANG = 'pt-BR';

function getTranslations(lang) {
  return translations[lang] || translations[DEFAULT_LANG];
}

function t(key, lang = DEFAULT_LANG, params = {}) {
  const dict = getTranslations(lang);
  let value = dict[key] || translations[DEFAULT_LANG][key] || key;
  Object.keys(params).forEach(k => {
    value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
  });
  return value;
}

function getLanguageDirection(lang) {
  return 'ltr';
}

function getLanguageName(lang) {
  const names = { 'pt-BR': 'Português', 'en-US': 'English', 'es-ES': 'Español' };
  return names[lang] || lang;
}

function getTTSLang(lang) {
  const map = { 'pt-BR': 'pt-BR', 'en-US': 'en-US', 'es-ES': 'es-ES' };
  return map[lang] || 'pt-BR';
}

function getSTTLang(lang) {
  const map = { 'pt-BR': 'pt', 'en-US': 'en', 'es-ES': 'es' };
  return map[lang] || 'pt';
}

module.exports = {
  translations,
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  getTranslations,
  t,
  getLanguageDirection,
  getLanguageName,
  getTTSLang,
  getSTTLang,
};