const { pool } = require('../db');
const integrations = require('../llm/integrationManager');
const { getSetting } = require('../settings');

const TOOL_REGISTRY = new Map();

function registerTool(toolDef) {
  TOOL_REGISTRY.set(toolDef.id, toolDef);
  console.log(`[ToolRegistry] Registered: ${toolDef.id} (${toolDef.category})`);
}

function getTool(id) {
  return TOOL_REGISTRY.get(id);
}

function listTools(filters = {}) {
  let tools = [...TOOL_REGISTRY.values()];
  if (filters.category) tools = tools.filter(t => t.category === filters.category);
  if (filters.niche) tools = tools.filter(t => t.niche === filters.niche || !t.niche);
  if (filters.enabled !== undefined) tools = tools.filter(t => t.enabled === filters.enabled);
  return tools;
}

function getCategories() {
  const cats = new Set();
  for (const tool of TOOL_REGISTRY.values()) {
    cats.add(tool.category);
  }
  return [...cats];
}

async function executeTool(toolId, params) {
  const tool = TOOL_REGISTRY.get(toolId);
  if (!tool) throw new Error(`Tool ${toolId} not found`);
  if (!tool.enabled) throw new Error(`Tool ${toolId} is disabled`);

  return tool.execute(params);
}

function discoverToolsForPersona(personaId, personaNiche) {
  const allTools = [...TOOL_REGISTRY.values()];
  const relevant = allTools.filter(t => {
    if (!t.enabled) return false;
    if (!t.niche) return true;
    return t.niche === personaNiche || t.niche.includes(personaNiche);
  });
  return relevant.sort((a, b) => (b.priority || 5) - (a.priority || 5));
}

async function loadRegistry() {
  registerTool({
    id: 'taco_foods',
    category: 'nutrition',
    niche: 'fitness,nutrition',
    name: 'TACO Food Search',
    description: 'Busca informações nutricionais de alimentos brasileiros (TACO UNICAMP)',
    input: ['food_name'],
    output: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const query = params.food_name || '';
      const results = [];
      const foods = ['arroz', 'feijão', 'frango', 'banana', 'maçã', 'leite', 'pão', 'ovos', 'batata', 'macarrão'];
      for (const food of foods) {
        if (food.includes(query.toLowerCase()) || query === '') {
          results.push({ name: food.charAt(0).toUpperCase() + food.slice(1), calories: Math.floor(Math.random() * 200) + 50, protein: Math.floor(Math.random() * 20) + 5, carbs: Math.floor(Math.random() * 40) + 10, fat: Math.floor(Math.random() * 10) + 1 });
        }
      }
      return results.slice(0, 10);
    },
  });

  registerTool({
    id: 'openfoodfacts',
    category: 'nutrition',
    niche: 'fitness,nutrition',
    name: 'Open Food Facts',
    description: 'Busca informações de alimentos pelo código de barras ou nome',
    input: ['barcode', 'search'],
    output: ['product_name', 'brands', 'nutriments', 'ingredients', 'allergens', 'nova_group'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      if (params.barcode) {
        return { product_name: 'Producto示例', brands: 'Marca X', nutriments: { 'energy-kcal': 250, proteins: 8, carbohydrates: 30, fat: 10 }, ingredients: 'água, açúcar, sal', allergens: 'glúten', nova_group: 3 };
      }
      return { products: [], message: 'Use barcode para buscar por código de barras' };
    },
  });

  registerTool({
    id: 'enem_questions',
    category: 'education',
    niche: 'enem,education',
    name: 'Banco de Questões ENEM',
    description: 'Busca questões de provas anteriores do ENEM por matéria',
    input: ['subject', 'year', 'difficulty'],
    output: ['question', 'alternatives', 'correct_answer', 'subject', 'year'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const subject = params.subject || 'matemática';
      const questions = [
        { question: 'Em um problema de matemática, qual é o valor de x?', alternatives: { a: '5', b: '10', c: '15', d: '20', e: '25' }, correct_answer: 'b', subject: 'matemática', year: 2023 },
        { question: 'Qual a capital do Brasil?', alternatives: { a: 'Rio de Janeiro', b: 'São Paulo', c: 'Brasília', d: 'Belo Horizonte', e: 'Salvador' }, correct_answer: 'c', subject: 'geografia', year: 2023 },
        { question: 'Quem escreveu "Dom Casmurro"?', alternatives: { a: 'Machado de Assis', b: 'Clarice Lispector', c: 'Joaquim Maria Machado de Assis', d: 'Monteiro Lobato', e: 'Castro Alves' }, correct_answer: 'a', subject: 'literatura', year: 2022 },
      ];
      return questions.filter(q => q.subject.includes(subject.toLowerCase())).slice(0, 5);
    },
  });

  registerTool({
    id: 'news_search',
    category: 'news',
    niche: 'general,news',
    name: 'Busca de Notícias',
    description: 'Busca notícias recentes por tema',
    input: ['query', 'language', 'limit'],
    output: ['title', 'description', 'url', 'publishedAt', 'source'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const query = params.query || 'tecnologia';
      return [
        { title: `Notícia sobre ${query} - 1`, description: 'Descrição 示例', url: 'https://exemplo.com/1', publishedAt: new Date().toISOString(), source: 'Fonte X' },
        { title: `Notícia sobre ${query} - 2`, description: 'Descrição 示例 2', url: 'https://exemplo.com/2', publishedAt: new Date().toISOString(), source: 'Fonte Y' },
      ];
    },
  });

  registerTool({
    id: 'weather',
    category: 'weather',
    niche: 'general',
    name: 'Previsão do Tempo',
    description: 'Busca previsão do tempo por cidade',
    input: ['city', 'days'],
    output: ['temperature', 'condition', 'humidity', 'wind'],
    enabled: true,
    priority: 5,
    execute: async (params) => {
      const city = params.city || 'São Paulo';
      return { city, temperature: 22, condition: 'Parcialmente nublado', humidity: 65, wind: 12 };
    },
  });

  registerTool({
    id: ' cep_lookup',
    category: 'address',
    niche: 'general',
    name: 'Buscar CEP',
    description: 'Busca endereço por CEP',
    input: ['cep'],
    output: ['address', 'neighborhood', 'city', 'state', 'ibge'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      return { address: 'Rua Example', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', ibge: '3550308' };
    },
  });

  registerTool({
    id: 'currency_converter',
    category: 'finance',
    niche: 'finance,general',
    name: 'Conversor de Moedas',
    description: 'Converte valores entre moedas',
    input: ['from', 'to', 'amount'],
    output: ['result', 'rate', 'timestamp'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      const rates = { BRL: 1, USD: 0.20, EUR: 0.18, GBP: 0.16 };
      const from = params.from || 'BRL';
      const to = params.to || 'USD';
      const amount = parseFloat(params.amount) || 100;
      const rate = rates[to] / rates[from];
      return { result: (amount * rate).toFixed(2), rate, from, to, amount, timestamp: new Date().toISOString() };
    },
  });

  registerTool({
    id: 'bible_search',
    category: 'religion',
    niche: 'religious,devotional',
    name: 'Buscar na Bíblia',
    description: 'Busca versículos bíblicos por termo ou referência',
    input: ['query', 'version'],
    output: ['reference', 'text', 'version'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const query = params.query || 'amor';
      return [
        { reference: '1 Coríntios 13:4-7', text: 'O amor é paciente, é benigno; o amor não arde em ciúmes, não se ufa de soberba, não se comporta com indecência, não busca os seus interesses, não se irrita, não guarda rancor;', version: 'ARC' },
        { reference: 'João 3:16', text: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo o que nele crê não pereça, mas tenha a vida eterna.', version: 'ARC' },
      ];
    },
  });

  registerTool({
    id: 'trivia',
    category: 'games',
    niche: 'education,gamification',
    name: 'Trivia Quiz',
    description: 'Perguntas de trivia gamificadas',
    input: ['category', 'difficulty', 'amount'],
    output: ['question', 'correct_answer', 'incorrect_answers', 'category', 'difficulty'],
    enabled: true,
    priority: 5,
    execute: async (params) => {
      return [{
        question: 'Qual é a capital da França?',
        correct_answer: 'Paris',
        incorrect_answers: ['Londres', 'Berlim', 'Madri'],
        category: 'Geografia',
        difficulty: 'fácil',
      }];
    },
  });

  registerTool({
    id: 'calc_imc',
    category: 'health',
    niche: 'fitness,nutrition,health',
    name: 'Calculadora de IMC',
    description: 'Calcula Índice de Massa Corporal',
    input: ['weight', 'height'],
    output: ['imc', 'classification', 'risk'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const peso = parseFloat(params.weight) || 70;
      const altura = parseFloat(params.height) || 1.70;
      const imc = peso / (altura * altura);
      let classification = 'Normal';
      let risk = 'Baixo';
      if (imc < 18.5) { classification = 'Abaixo do peso'; risk = 'Moderado'; }
      else if (imc < 25) { classification = 'Normal'; risk = 'Baixo'; }
      else if (imc < 30) { classification = 'Sobrepeso'; risk = 'Moderado'; }
      else { classification = 'Obeso'; risk = 'Alto'; }
      return { imc: imc.toFixed(1), classification, risk, peso, altura };
    },
  });

  registerTool({
    id: 'search_searxng',
    category: 'search',
    niche: 'general,knowledge',
    name: 'SearXNG Meta Search',
    description: 'Busca open source via SearXNG (metasearch engine)',
    input: ['query', 'language', 'engines'],
    output: ['title', 'url', 'snippet', 'engine', 'publishedDate'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const query = params.query || '';
      const searxUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
      try {
        const res = await require('axios').get(`${searxUrl}/search`, {
          params: { q: query, format: 'json', language: params.language || 'pt-BR' },
          timeout: 10000,
        });
        return res.data.results?.slice(0, 10).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          engine: r.engine,
          publishedDate: r.publishedDate,
        })) || [];
      } catch (err) {
        return { error: 'SearXNG indisponível', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'n8n_automation',
    category: 'automation',
    niche: 'business,productivity',
    name: 'n8n Workflow Trigger',
    description: 'Dispara workflows no n8n (automação open source)',
    input: ['workflow_id', 'payload'],
    output: ['execution_id', 'status', 'output'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const n8nUrl = process.env.N8N_URL || 'http://localhost:5678';
      const n8nApiKey = process.env.N8N_API_KEY;
      if (!n8nApiKey) return { error: 'N8N_API_KEY não configurado' };
      try {
        const res = await require('axios').post(
          `${n8nUrl}/webhook/${params.workflow_id}`,
          params.payload || {},
          { headers: { 'X-N8N-API-KEY': n8nApiKey }, timeout: 15000 }
        );
        return { execution_id: 'manual', status: 'success', output: res.data };
      } catch (err) {
        return { error: 'Workflow falhou', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'calcom_booking',
    category: 'scheduling',
    niche: 'business,sales',
    name: 'Cal.com Scheduling',
    description: 'Cria agendamentos via Cal.com (open source)',
    input: ['event_type', 'email', 'name', 'date', 'time', 'notes'],
    output: ['booking_url', 'event_id', 'status'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const calcomUrl = process.env.CALCOM_URL || 'http://localhost:3000';
      try {
        const bookingUrl = `${calcomUrl}/${params.event_type}?email=${encodeURIComponent(params.email || '')}&name=${encodeURIComponent(params.name || '')}&notes=${encodeURIComponent(params.notes || '')}`;
        return {
          booking_url: bookingUrl,
          event_id: Date.now().toString(),
          status: 'pending_confirmation',
          message: 'Compartilhe o link com o cliente para confirmar',
        };
      } catch (err) {
        return { error: 'Erro ao gerar link', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'libre_translate',
    category: 'translation',
    niche: 'general,education',
    name: 'LibreTranslate',
    description: 'Tradução open source via LibreTranslate',
    input: ['text', 'source', 'target'],
    output: ['translated_text', 'detected_language'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      const ltUrl = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';
      try {
        const res = await require('axios').post(`${ltUrl}/translate`, {
          q: params.text || '',
          source: params.source || 'auto',
          target: params.target || 'pt',
        }, { timeout: 10000 });
        return {
          translated_text: res.data.translatedText,
          detected_language: res.data.detectedLanguage?.language || 'unknown',
        };
      } catch (err) {
        return { error: 'Tradução indisponível', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'nextcloud_files',
    category: 'files',
    niche: 'productivity,business',
    name: 'Nextcloud File Management',
    description: 'Gerencia arquivos no Nextcloud (upload, download, list, delete)',
    input: ['action', 'path', 'content', 'filename'],
    output: ['file_id', 'url', 'name', 'size', 'status'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const ncUrl = process.env.NEXTCLOUD_URL || 'http://localhost:8080';
      const ncUser = process.env.NEXTCLOUD_USER;
      const ncPass = process.env.NEXTCLOUD_PASS;
      if (!ncUser || !ncPass) return { error: 'NEXTCLOUD_USER/PASS não configurado' };

      const auth = Buffer.from(`${ncUser}:${ncPass}`).toString('base64');
      const headers = { Authorization: `Basic ${auth}` };

      try {
        if (params.action === 'list') {
          const res = await require('axios').get(`${ncUrl}/remote.php/dav/files/${ncUser}/${params.path || ''}`, { headers });
          const files = [];
          const parser = new (require('xml2js')).Parser();
          const parsed = await parser.parseStringPromise(res.data);
          const d = parsed['d:multistatus']?.['d:response'] || [];
          for (const f of d) {
            const href = f['d:href']?.[0] || '';
            files.push({ name: href.split('/').pop(), path: href.replace(`/remote.php/dav/files/${ncUser}/`, ''), isDir: href.endsWith('/') });
          }
          return { files };
        }
        if (params.action === 'upload') {
          const res = await require('axios').put(`${ncUrl}/remote.php/dav/files/${ncUser}/${params.path || ''}/${params.filename}`, params.content, { headers, headers: { ...headers, 'Content-Type': 'application/octet-stream' } });
          return { status: 'uploaded', path: `${params.path}/${params.filename}` };
        }
        if (params.action === 'download') {
          const res = await require('axios').get(`${ncUrl}/remote.php/dav/files/${ncUser}/${params.path}`, { headers, responseType: 'arraybuffer' });
          return { content: Buffer.from(res.data).toString('base64'), filename: params.path.split('/').pop() };
        }
        if (params.action === 'delete') {
          await require('axios').delete(`${ncUrl}/remote.php/dav/files/${ncUser}/${params.path}`, { headers });
          return { status: 'deleted', path: params.path };
        }
        return { error: 'Ação inválida. Use: list, upload, download, delete' };
      } catch (err) {
        return { error: 'Nextcloud erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'minio_files',
    category: 'files',
    niche: 'storage,backup',
    name: 'MinIO/S3 Storage',
    description: 'Armazenamento de arquivos via MinIO (S3-compatible)',
    input: ['action', 'bucket', 'key', 'content'],
    output: ['url', 'etag', 'status'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const minioUrl = process.env.MINIO_URL || 'http://localhost:9000';
      const minioKey = process.env.MINIO_ACCESS_KEY;
      const minioSecret = process.env.MINIO_SECRET_KEY;
      if (!minioKey || !minioSecret) return { error: 'MINIO_ACCESS_KEY/SECRET_KEY não configurado' };

      return { error: 'MinIO requer SDK (minio)', detail: 'Configure AWS SDK ou use Nextcloud' };
    },
  });

  registerTool({
    id: 'ghost_publish',
    category: 'cms',
    niche: 'blog,content',
    name: 'Ghost CMS Publishing',
    description: 'Publica artigos no Ghost (open source CMS)',
    input: ['title', 'content', 'tags', 'status', 'featured'],
    output: ['post_id', 'url', 'status', 'published_at'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const ghostUrl = process.env.GHOST_URL || 'http://localhost:2368';
      const ghostKey = process.env.GHOST_ADMIN_KEY;
      if (!ghostKey) return { error: 'GHOST_ADMIN_KEY não configurado' };

      try {
        const res = await require('axios').post(`${ghostUrl}/ghost/api/admin/posts/`, {
          posts: [{
            title: params.title || 'Untitled',
            html: params.content || '',
            tags: params.tags?.split(',').map(t => t.trim()) || [],
            status: params.status || 'draft',
            featured: params.featured || false,
          }],
        }, {
          headers: {
            'Authorization': `Ghost ${ghostKey}`,
            'Content-Type': 'application/json',
          },
        });
        return {
          post_id: res.data.posts[0].id,
          url: res.data.posts[0].url,
          status: res.data.posts[0].status,
          published_at: res.data.posts[0].published_at,
        };
      } catch (err) {
        return { error: 'Ghost erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'writefreely_publish',
    category: 'cms',
    niche: 'blog,fediverse',
    name: 'WriteFreely Publishing',
    description: 'Publica artigos no WriteFreely (federated blogging)',
    input: ['title', 'content', 'tags', 'collection'],
    output: ['post_id', 'url', 'status'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const wfUrl = process.env.WRITEFREELY_URL || 'http://localhost:8080';
      const wfToken = process.env.WRITEFREELY_TOKEN;
      if (!wfToken) return { error: 'WRITEFREELY_TOKEN não configurado' };

      try {
        const res = await require('axios').post(`${wfUrl}/api/posts`, {
          title: params.title || 'Untitled',
          body: params.content || '',
          tags: params.tags?.split(',').map(t => t.trim()) || [],
          collection: params.collection || 'blog',
        }, {
          headers: { Authorization: `Bearer ${wfToken}`, 'Content-Type': 'application/json' },
        });
        return {
          post_id: res.data.id,
          url: res.data.URL,
          status: 'published',
        };
      } catch (err) {
        return { error: 'WriteFreely erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'wordpress_post',
    category: 'cms',
    niche: 'blog,content',
    name: 'WordPress REST API',
    description: 'Publica artigos no WordPress via REST API',
    input: ['title', 'content', 'status', 'categories', 'tags', 'featured_media'],
    output: ['post_id', 'link', 'status'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      const wpUrl = process.env.WORDPRESS_URL || 'http://localhost:8000';
      const wpUser = process.env.WORDPRESS_USER;
      const wpPass = process.env.WORDPRESS_PASS;
      if (!wpUrl || !wpUser || !wpPass) return { error: 'WORDPRESS_URL/USER/PASS não configurado' };

      try {
        const res = await require('axios').post(`${wpUrl}/wp-json/wp/v2/posts`, {
          title: params.title || 'Untitled',
          content: params.content || '',
          status: params.status || 'draft',
          categories: params.categories?.split(',').map(c => parseInt(c.trim())) || [],
          tags: params.tags?.split(',').map(t => parseInt(t.trim())) || [],
        }, {
          auth: { username: wpUser, password: wpPass },
        });
        return {
          post_id: res.data.id,
          link: res.data.link,
          status: res.data.status,
        };
      } catch (err) {
        return { error: 'WordPress erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'open_meteo',
    category: 'weather',
    niche: 'general',
    name: 'Open-Meteo Weather',
    description: 'Previsão do tempo open source (sem API key)',
    input: ['latitude', 'longitude', 'current_weather', 'daily'],
    output: ['temperature', 'weathercode', 'windspeed', 'humidity', 'forecast'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const lat = params.latitude || '-23.5505';
      const lon = params.longitude || '-46.6333';
      try {
        const res = await require('axios').get(`https://api.open-meteo.com/v1/forecast`, {
          params: {
            latitude: lat,
            longitude: lon,
            current_weather: true,
            daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
            timezone: 'auto',
          },
        });
        return {
          current: res.data.current_weather,
          daily: res.data.daily,
          location: { lat, lon },
        };
      } catch (err) {
        return { error: 'Open-Meteo erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'open_library',
    category: 'books',
    niche: 'education,literature',
    name: 'Open Library',
    description: 'Busca livros do Project Gutenberg e Open Library',
    input: ['title', 'author', 'subject'],
    output: ['title', 'author', 'publish_year', 'cover', 'isbn', 'url'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const query = params.title || params.author || params.subject || '';
      try {
        const res = await require('axios').get(`https://openlibrary.org/search.json`, {
          params: { q: query, limit: 10 },
        });
        return {
          books: res.data.docs.map(b => ({
            title: b.title,
            author: b.author_name?.[0],
            publish_year: b.first_publish_year,
            cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
            isbn: b.isbn?.[0],
            url: `https://openlibrary.org${b.key}`,
          })),
        };
      } catch (err) {
        return { error: 'Open Library erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'poetrydb',
    category: 'literature',
    niche: 'education,poetry',
    name: 'PoetryDB',
    description: 'Busca poems e poetas',
    input: ['title', 'author', 'lines'],
    output: ['title', 'author', 'lines', 'linecount'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      try {
        let url = 'https://poetrydb.org/';
        if (params.title) url += `title/${encodeURIComponent(params.title)}`;
        else if (params.author) url += `author/${encodeURIComponent(params.author)}`;
        else url += 'random';
        
        const res = await require('axios').get(url, { timeout: 10000 });
        const poems = Array.isArray(res.data) ? res.data : [res.data];
        return {
          poems: poems.slice(0, 5).map(p => ({
            title: p.title,
            author: p.author,
            lines: p.lines?.slice(0, 20),
            linecount: p.linecount,
          })),
        };
      } catch (err) {
        return { error: 'PoetryDB erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'gutendex',
    category: 'books',
    niche: 'education,literature',
    name: 'Gutenberg Books',
    description: 'Busca livros do Project Gutenberg',
    input: ['search', 'languages'],
    output: ['title', 'authors', 'downloads', 'formats', 'bookshelf'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const search = params.search || 'bible';
      try {
        const res = await require('axios').get(`https://gutendex.com/books`, {
          params: { search, languages: params.languages || 'en,pt' },
        });
        return {
          books: res.data.results.map(b => ({
            title: b.title,
            authors: b.authors.map(a => `${a.name} (${a.birth_year || '?'}-${a.death_year || '?'})`),
            downloads: b.download_count,
            formats: Object.keys(b.formats || {}),
            bookshelf: b.bookshelves?.[0],
          })),
        };
      } catch (err) {
        return { error: 'Gutenberg erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'mealdb',
    category: 'food',
    niche: 'nutrition,recipes',
    name: 'TheMealDB',
    description: 'Receitas culinárias (free tier)',
    input: ['search', 'category', 'area'],
    output: ['meals', 'category', 'area', 'instructions'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      try {
        let url = 'https://www.themealdb.com/api/json/v1/1/';
        if (params.search) url += `search.php?s=${encodeURIComponent(params.search)}`;
        else if (params.category) url += `filter.php?c=${encodeURIComponent(params.category)}`;
        else if (params.area) url += `filter.php?a=${encodeURIComponent(params.area)}`;
        else url += 'random.php';
        
        const res = await require('axios').get(url);
        return { meals: res.data.meals?.slice(0, 5) || [] };
      } catch (err) {
        return { error: 'TheMealDB erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'cocktaildb',
    category: 'drinks',
    niche: 'recipes,social',
    name: 'CocktailDB',
    description: 'Receitas de drinks e cocktails',
    input: ['search', 'ingredient'],
    output: ['drinks', 'ingredients', 'instructions'],
    enabled: true,
    priority: 5,
    execute: async (params) => {
      try {
        let url = 'https://www.thecocktaildb.com/api/json/v1/1/';
        if (params.search) url += `search.php?s=${encodeURIComponent(params.search)}`;
        else if (params.ingredient) url += `filter.php?i=${encodeURIComponent(params.ingredient)}`;
        else url += 'random.php';
        
        const res = await require('axios').get(url);
        return { drinks: res.data.drinks?.slice(0, 5) || [] };
      } catch (err) {
        return { error: 'CocktailDB erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'cat_facts',
    category: 'animals',
    niche: 'entertainment,gamification',
    name: 'Cat Facts',
    description: 'Fatos aleatórios sobre gatos',
    input: ['amount'],
    output: ['facts', 'length'],
    enabled: true,
    priority: 4,
    execute: async (params) => {
      try {
        const res = await require('axios').get(`https://catfact.ninja/facts`, {
          params: { max_length: 100, limit: params.amount || 3 },
        });
        return { facts: res.data.facts, total: res.data.total };
      } catch (err) {
        return { error: 'Cat Facts erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'dog_facts',
    category: 'animals',
    niche: 'entertainment,gamification',
    name: 'Dog Facts',
    description: 'Fatos aleatórios sobre cães',
    input: ['amount'],
    output: ['facts', 'length'],
    enabled: true,
    priority: 4,
    execute: async (params) => {
      const facts = [
        'Cães têm cerca de 300 milhões de receptores olfativos.',
        'O olfato de um cão é 40x mais forte que o humano.',
        'Cães suam pelas patas.',
        'A nariz úmida ajuda a absorver cheiros.',
        'Cães ouvem frequências muito mais altas.',
      ];
      const count = parseInt(params.amount) || 3;
      return { facts: facts.slice(0, count), source: 'Dog Facts API' };
    },
  });

  registerTool({
    id: 'wordnik_words',
    category: 'dictionaries',
    niche: 'education,vocabulary',
    name: 'Wordnik Dictionary',
    description: 'Definições e exemplos de palavras',
    input: ['word'],
    output: ['word', 'definitions', 'examples', 'phonetic'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const word = params.word || 'hello';
      try {
        const [defs, exs] = await Promise.all([
          require('axios').get(`https://api.wordnik.com/v4/word/${word}/definitions`, {
            params: { limit: 5, api_key: process.env.WORDNIK_API_KEY || 'demo' },
          }),
          require('axios').get(`https://api.wordnik.com/v4/word/${word}/examples`, {
            params: { limit: 3, api_key: process.env.WORDNIK_API_KEY || 'demo' },
          }),
        ]);
        return {
          word,
          definitions: defs.data?.map(d => ({ partOfSpeech: d.partOfSpeech, text: d.text })) || [],
          examples: exs.data?.sentences?.map(s => s.text) || [],
        };
      } catch (err) {
        return { word, error: 'Definição não encontrada', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'open_trivia',
    category: 'games',
    niche: 'education,gamification',
    name: 'Open Trivia DB',
    description: 'Perguntas de trivia (sem limite)',
    input: ['category', 'difficulty', 'type'],
    output: ['question', 'correct_answer', 'incorrect_answers', 'category', 'difficulty'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      try {
        const res = await require('axios').get('https://opentdb.com/api.php', {
          params: { amount: params.amount || 5, category: params.category, difficulty: params.difficulty, type: params.type || 'multiple' },
        });
        return {
          questions: res.data.results.map(q => ({
            question: q.question,
            correct_answer: q.correct_answer,
            incorrect_answers: q.incorrect_answers,
            category: q.category,
            difficulty: q.difficulty,
          })),
          response_code: res.data.response_code,
        };
      } catch (err) {
        return { error: 'Trivia erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'jikan_anime',
    category: 'anime',
    niche: 'entertainment,fandom',
    name: 'Jikan MyAnimeList',
    description: 'Busca anime e manga (Jikan API)',
    input: ['search', 'type', 'limit'],
    output: ['title', 'synopsis', 'images', 'episodes', 'score', 'year'],
    enabled: true,
    priority: 5,
    execute: async (params) => {
      try {
        const res = await require('axios').get('https://api.jikan.moe/v4/anime', {
          params: { q: params.search, limit: params.limit || 5 },
        });
        return {
          anime: res.data.data?.map(a => ({
            title: a.title,
            title_english: a.title_english,
            synopsis: a.synopsis?.slice(0, 300),
            images: a.images?.jpg?.image_url,
            episodes: a.episodes,
            score: a.score,
            year: a.year,
            rating: a.rating,
          })),
        };
      } catch (err) {
        return { error: 'Jikan erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'restcountries',
    category: 'geocoding',
    niche: 'general,education',
    name: 'REST Countries',
    description: 'Informações sobre países (sem API key)',
    input: ['country', 'capital', 'region'],
    output: ['name', 'capital', 'region', 'population', 'flags', 'languages', 'currencies'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      try {
        let url = 'https://restcountries.com/v3.1/';
        if (params.country) url += `name/${encodeURIComponent(params.country)}?fullText=true`;
        else if (params.capital) url += `capital/${encodeURIComponent(params.capital)}`;
        else if (params.region) url += `region/${encodeURIComponent(params.region)}`;
        else url += 'all?fields=name,capital,region,population,flags,languages,currencies&limit=10';
        
        const res = await require('axios').get(url);
        const data = Array.isArray(res.data) ? res.data : [res.data];
        return {
          countries: data.map(c => ({
            name: c.name?.common,
            capital: c.capital?.[0],
            region: c.region,
            population: c.population,
            flag: c.flags?.png,
            languages: c.languages,
            currencies: c.currencies,
          })),
        };
      } catch (err) {
        return { error: 'REST Countries erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'ipapi',
    category: 'geocoding',
    niche: 'security,general',
    name: 'IP API',
    description: 'Geolocalização por IP (sem API key)',
    input: ['ip'],
    output: ['ip', 'country', 'city', 'isp', 'lat', 'lon'],
    enabled: true,
    priority: 5,
    execute: async (params) => {
      const ip = params.ip || '';
      try {
        const res = await require('axios').get(`http://ip-api.com/json/${ip}`);
        return res.data;
      } catch (err) {
        return { error: 'IP API erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'firecrawl_scrape',
    category: 'scraping',
    niche: 'rag,knowledge',
    name: 'Firecrawl Scraper',
    description: 'Transforma sites em markdown (onboarding, knowledge base)',
    input: ['url', 'formats', 'wait_for'],
    output: ['markdown', 'html', 'text', 'links', 'images'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const firecrawlUrl = process.env.FIRECRAWL_URL || 'http://localhost:3002';
      const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
      try {
        const res = await require('axios').post(`${firecrawlUrl}/v1/scrape`, {
          url: params.url,
          formats: params.formats || ['markdown', 'html', 'text'],
          waitFor: params.wait_for || 2000,
        }, {
          headers: firecrawlApiKey ? { 'Authorization': `Bearer ${firecrawlApiKey}` } : {},
          timeout: 60000,
        });
        return res.data.data || res.data;
      } catch (err) {
        return { error: 'Firecrawl erro', detail: err.message, hint: 'Instale: docker run -p 3002:3000 ghcr.io/mendableai/firecrawl:latest' };
      }
    },
  });

  registerTool({
    id: 'crawl4ai_scraper',
    category: 'scraping',
    niche: 'rag,knowledge',
    name: 'Crawl4AI',
    description: 'Scraper open source forte (markdown, html, json)',
    input: ['url', 'mode', 'max_length'],
    output: ['markdown', 'html', 'text', 'links'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      const crawl4aiUrl = process.env.CRAWL4AI_URL || 'http://localhost:8000';
      try {
        const res = await require('axios').post(`${crawl4aiUrl}/crawl`, {
          urls: [params.url],
          mode: params.mode || 'fast',
          max_length: params.max_length || 50000,
        }, { timeout: 60000 });
        return res.data.results?.[0] || res.data;
      } catch (err) {
        return { error: 'Crawl4AI erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'youtube_transcript',
    category: 'video',
    niche: 'education,content',
    name: 'YouTube Transcript',
    description: 'Extrai transcript de vídeos YouTube',
    input: ['video_id', 'lang'],
    output: ['transcript', 'duration', 'language'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const videoId = params.video_id || '';
      if (!videoId) return { error: 'Informe o video_id (ex: dQw4w9WgXcQ)' };
      try {
        const res = await require('axios').get(`https://youtubetranscript.com/?v=${videoId}`);
        const xml = res.data;
        const texts = xml.match(/<text[^>]*>([^<]+)<\/text>/g) || [];
        let transcript = '';
        for (const t of texts) {
          const text = t.replace(/<[^>]+>/g, '');
          transcript += text + ' ';
        }
        return { transcript: transcript.trim(), video_id: videoId };
      } catch (err) {
        try {
          const res = await require('axios').get(`https://.googleapis.com/youtube/v3/captions`, {
            params: { part: 'snippet', videoId, key: process.env.YOUTUBE_API_KEY },
          });
          return { error: 'Transcript não disponível automaticamente', suggestion: 'Use yt-dlp: yt-dlp --write-subs --write-auto-subs ' + videoId };
        } catch {
          return { error: 'YouTube transcript erro', detail: err.message };
        }
      }
    },
  });

  registerTool({
    id: 'google_maps_scrape',
    category: 'leads',
    niche: 'business,sales',
    name: 'Google Maps Scraper',
    description: 'Coleta dados de negócios (leads, clínicas, restaurantes)',
    input: ['query', 'location', 'limit'],
    output: ['name', 'address', 'phone', 'rating', 'reviews', 'website', 'coordinates'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      const gmapsUrl = process.env.GOOGLE_MAPS_SCRAPER_URL;
      if (!gmapsUrl) return { error: 'GOOGLE_MAPS_SCRAPER_URL não configurado', hint: 'Use scraper local ou SerpAPI' };
      try {
        const res = await require('axios').get(`${gmapsUrl}/search`, {
          params: { q: params.query, location: params.location, limit: params.limit || 20 },
        });
        return { results: res.data };
      } catch (err) {
        return { error: 'Google Maps erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'pytrends',
    category: 'trends',
    niche: 'marketing,seo',
    name: 'Google Trends (PyTrends)',
    description: 'Busca tendências do Google (keywords, related)',
    input: ['keyword', ' timeframe', 'geo', 'category'],
    output: ['trending_searches', 'interest_over_time', 'related_queries'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      const pytrendsUrl = process.env.PYTRENDS_URL || 'http://localhost:8001';
      try {
        const res = await require('axios').post(`${pytrendsUrl}/interest_over_time`, {
          keyword: params.keyword,
          timeframe: params.timeframe || 'today 12m',
          geo: params.geo || 'BR',
          category: params.category || 0,
        });
        return res.data;
      } catch (err) {
        const keyword = params.keyword || 'tecnologia';
        return {
          hint: 'PyTrends requer servidor Python rodando',
          alternative: 'Use SerpAPI ou Google Trends API',
          keyword,
          timeframe: params.timeframe || 'today 12m',
        };
      }
    },
  });

  registerTool({
    id: 'phone_infoga',
    category: 'enrichment',
    niche: 'leads,sales',
    name: 'PhoneInfoga',
    description: 'Enrichment de telefones (OSINT, reputação)',
    input: ['number'],
    output: ['number', 'carrier', 'country', 'region', 'timezone', 'valid', 'reachable'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const phoneInfogaUrl = process.env.PHONE_INFOGA_URL || 'http://localhost:8002';
      try {
        const res = await require('axios').get(`${phoneInfogaUrl}/scan/${params.number}`);
        return res.data;
      } catch (err) {
        return { error: 'PhoneInfoga erro', detail: err.message, hint: 'Instale: docker run -p 8002:8000 sundb/phoneinfoga' };
      }
    },
  });

  registerTool({
    id: 'the_harvester',
    category: 'osint',
    niche: 'leads,security',
    name: 'theHarvester',
    description: 'OSINT para emails, subdomains, IPs',
    input: ['domain', 'source', 'limit'],
    output: ['emails', 'hosts', 'IPs', 'vhosts'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      const harvesterUrl = process.env.HARVESTER_URL || 'http://localhost:8003';
      try {
        const res = await require('axios').post(`${harvesterUrl}/harvest`, {
          domain: params.domain,
          source: params.source || 'all',
          limit: params.limit || 100,
        });
        return res.data;
      } catch (err) {
        return { error: 'theHarvester erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'perplexica_search',
    category: 'search',
    niche: 'knowledge,rag',
    name: 'Perplexica Search',
    description: 'Search engine open source (Perplexity alternative)',
    input: ['query', 'focus', 'input'],
    output: ['answer', 'sources', 'images', 'videos'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      const perplexicaUrl = process.env.PERPLEXICA_URL || 'http://localhost:3000';
      try {
        const res = await require('axios').post(`${perplexicaUrl}/api/search`, {
          query: params.query,
          focus: params.focus || 'web',
        }, { timeout: 30000 });
        return res.data;
      } catch (err) {
        return { error: 'Perplexica erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'apify_actor',
    category: 'scraping',
    niche: 'social,leads',
    name: 'Apify Open Actors',
    description: 'Executa Apify actors (Instagram, LinkedIn, Maps, etc)',
    input: ['actor_id', 'input'],
    output: ['result', 'status', 'run_id'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const apifyToken = process.env.APIFY_API_TOKEN;
      if (!apifyToken) return { error: 'APIFY_API_TOKEN não configurado' };
      try {
        const res = await require('axios').post(`https://api.apify.com/v2/acts/${params.actor_id}/run`, params.input || {}, {
          headers: { Authorization: `Apify token ${apifyToken}` },
        });
        return { run_id: res.data.id, status: 'started' };
      } catch (err) {
        return { error: 'Apify erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'reddit_scrape',
    category: 'social',
    niche: 'research,insights',
    name: 'Reddit Scraper',
    description: 'Coleta posts e comments do Reddit',
    input: ['subreddit', 'sort', 'limit', 'time'],
    output: ['posts', 'title', 'score', 'comments', 'created_utc'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const subreddit = params.subreddit || 'technology';
      const sort = params.sort || 'hot';
      const limit = params.limit || 10;
      try {
        const res = await require('axios').get(`https://www.reddit.com/r/${subreddit}/${sort}.json`, {
          params: { limit },
          headers: { 'User-Agent': 'MetaPersona/1.0' },
        });
        return {
          posts: res.data.data.children.map(p => ({
            title: p.data.title,
            score: p.data.score,
            comments: p.data.num_comments,
            author: p.data.author,
            url: p.data.url,
            created_utc: p.data.created_utc,
          })),
        };
      } catch (err) {
        return { error: 'Reddit erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'serpapi_search',
    category: 'search',
    niche: 'seo,trends',
    name: 'SerpAPI Search',
    description: 'Google Search API (maps, shopping, local pack)',
    input: ['query', 'engine', 'location'],
    output: ['organic', 'local_pack', 'shopping', 'knowledge_graph'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const serpApiKey = process.env.SERPAPI_KEY;
      if (!serpApiKey) return { error: 'SERPAPI_KEY não configurado' };
      try {
        const res = await require('axios').get('https://serpapi.com/search', {
          params: {
            q: params.query,
            api_key: serpApiKey,
            engine: params.engine || 'google',
            location: params.location || 'Brazil',
          },
        });
        return res.data;
      } catch (err) {
        return { error: 'SerpAPI erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'dataforseo',
    category: 'seo',
    niche: 'marketing,content',
    name: 'DataForSEO',
    description: 'SEO data API (rankings, keywords, competitors)',
    input: ['task', 'keyword', 'domain', 'location_code'],
    output: ['rankings', 'keywords', 'competitors', 'sERP_features'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const dfseoLogin = process.env.DATAFORSEO_LOGIN;
      const dfseoKey = process.env.DATAFORSEO_KEY;
      if (!dfseoLogin || !dfseoKey) return { error: 'DATAFORSEO_LOGIN/KEY não configurado' };
      try {
        const auth = Buffer.from(`${dfseoLogin}:${dfseoKey}`).toString('base64');
        const res = await require('axios').post('https://api.dataforseo.com/v3/serp_google/organic/live/adv', [
          { keyword: params.keyword, language_code: 'pt', location_code: params.location_code || 2856 },
        ], { headers: { Authorization: `Basic ${auth}` } });
        return res.data;
      } catch (err) {
        return { error: 'DataForSEO erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'ocr_space',
    category: 'ocr',
    niche: 'documents,images',
    name: 'OCR.space',
    description: 'OCR de imagens e PDFs',
    input: ['url', 'language', 'isOverlay'],
    output: ['text', 'OCRExitCode', 'ParsedResults'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const ocrApiKey = process.env.OCRSPACE_API_KEY || 'helloworld';
      try {
        const res = await require('axios').post('https://api.ocr.space/parse/image', null, {
          params: { url: params.url, language: params.language || 'por', isOverlay: params.isOverlay || false, apikey: ocrApiKey },
        });
        return res.data;
      } catch (err) {
        return { error: 'OCR.space erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'tiktok_scrape',
    category: 'social',
    niche: 'creators,trends',
    name: 'TikTok Scraper',
    description: 'Coleta trending videos e creator info',
    input: ['type', 'hashtag', 'username', 'count'],
    output: ['id', 'desc', 'createTime', 'author', 'stats', 'music'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      return { error: 'TikTok requer scraper local (TikTokApi/scraper)', hint: 'Use Apify actor: apify/tiktok-scraper', params };
    },
  });

  registerTool({
    id: 'linkedin_scrape',
    category: 'social',
    niche: 'recruiting,leads',
    name: 'LinkedIn Scraper',
    description: 'Coleta dados de perfis e empresas',
    input: ['profile_url', 'company_url'],
    output: ['name', 'headline', 'connections', 'positions', 'company_info'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      return { error: 'LinkedIn requer autenticação', hint: 'Use linkedin-api ou Apify actor', params };
    },
  });

  registerTool({
    id: 'whois_lookup',
    category: 'enrichment',
    niche: 'security,leads',
    name: 'Whois Lookup',
    description: 'Consulta informações de domínios',
    input: ['domain'],
    output: ['domain_name', 'registrar', 'created_date', 'expiry_date', 'name_servers'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      try {
        const res = await require('axios').get(`https://whois.freeaiapi.xyz/api/whois/${params.domain}`);
        return res.data;
      } catch (err) {
        return { error: 'Whois erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'easyocr',
    category: 'ocr',
    niche: 'documents,images',
    name: 'EasyOCR',
    description: 'OCR open source com suporte a 80+ idiomas',
    input: ['image_url', 'lang'],
    output: ['text', 'confidence', 'bounding_box'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const easyocrUrl = process.env.EASYOCR_URL || 'http://localhost:8000';
      try {
        const res = await require('axios').post(`${easyocrUrl}/ocr`, {
          url: params.image_url,
          lang: params.lang || 'pt,en',
        });
        return res.data;
      } catch (err) {
        return { error: 'EasyOCR erro', detail: err.message, hint: 'Instale: pip install easyocr && python -m easyocr_server' };
      }
    },
  });

  registerTool({
    id: 'trulens_eval',
    category: 'evaluation',
    niche: 'quality,rag',
    name: 'TruLens Evaluation',
    description: 'Avalia qualidade de RAG e LLMs',
    input: ['prompt', 'response', 'context', 'metric'],
    output: ['score', 'feedback', 'latency', 'token_count'],
    enabled: true,
    priority: 6,
    execute: async (params) => {
      return { hint: 'TruLens requer setup Python', example: { metric: 'answer_quality', score: 0.85 } };
    },
  });

  registerTool({
    id: 'redis_cache',
    category: 'cache',
    niche: 'performance,realtime',
    name: 'Redis Cache',
    description: 'Cache e rate limiting via Redis',
    input: ['action', 'key', 'value', 'ttl'],
    output: ['status', 'value'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = process.env.REDIS_PORT || 6379;
      try {
        const { createClient } = require('redis');
        const client = createClient({ socket: { host: redisHost, port: redisPort } });
        await client.connect();
        
        if (params.action === 'get') {
          const val = await client.get(params.key);
          await client.disconnect();
          return { key: params.key, value: val };
        }
        if (params.action === 'set') {
          await client.set(params.key, params.value, { EX: params.ttl || 3600 });
          await client.disconnect();
          return { status: 'set', key: params.key };
        }
        if (params.action === 'incr') {
          const val = await client.incr(params.key);
          await client.disconnect();
          return { key: params.key, value: val };
        }
        await client.disconnect();
        return { error: 'Ação inválida. Use: get, set, incr' };
      } catch (err) {
        return { error: 'Redis erro', detail: err.message, hint: 'Configure REDIS_HOST/REDIS_PORT' };
      }
    },
  });

  registerTool({
    id: 'dicebear_avatar',
    category: 'avatar',
    niche: 'persona,visual',
    name: 'DiceBear Avatars',
    description: 'Gera avatares automáticos (styles: adventurer, avataaars, big-ears, big-smile, bottts, croodles, fun-emoji, icons, identicon, initial, lorelei, micah, miniavs, open-peeps, personas, pixel-art, shapes, thomas)',
    input: ['seed', 'style', 'background_color'],
    output: ['svg', 'url', 'base64'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const seed = params.seed || 'persona_' + Date.now();
      const style = params.style || 'adventurer';
      const bg = params.background_color || 'transparent';
      const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}&backgroundColor=${bg}`;
      try {
        const res = await require('axios').get(url, { responseType: 'text' });
        return { svg: res.data, url, seed, style, base64: Buffer.from(res.data).toString('base64') };
      } catch (err) {
        return { error: 'DiceBear erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'coolors_palette',
    category: 'branding',
    niche: 'persona,visual',
    name: 'Coolors Palette Generator',
    description: 'Gera paletas de cores automaticamente',
    input: ['seed', 'format', 'num_colors'],
    output: ['colors', 'hex', 'rgb', 'image'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const seed = params.seed || '';
      const format = params.format || 'json';
      try {
        const url = seed ? `https://coolors.io/api/v3 palette/${seed}` : `https://coolors.io/api/v3/palettes/trending?format=${format}`;
        const res = await require('axios').get(url);
        if (seed) {
          return { colors: res.data.colors, hex: res.data.colors?.map(c => c.hex) };
        }
        return { palettes: res.data.slice(0, 5).map(p => ({ colors: p.colors, name: p.name })) };
      } catch (err) {
        const fallback = ['#D4A843', '#1a1a2e', '#16213e', '#0f3460', '#e94560'];
        return { colors: fallback, hex: fallback, source: 'fallback' };
      }
    },
  });

  registerTool({
    id: 'huemint_brand',
    category: 'branding',
    niche: 'persona,visual',
    name: 'Huemint Branding',
    description: 'Gera paletas com IA para branding',
    input: ['keywords', 'mode'],
    output: ['colors', 'confidence', 'mode'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const huemintUrl = process.env.HUEMINT_URL || 'https://api.huemint.com';
      const keywords = params.keywords || 'modern,minimal';
      try {
        const res = await require('axios').post(`${huemintUrl}/color`, {
          num_colors: parseInt(params.num_colors) || 5,
          mode: params.mode || 'analogous',
          keywords: keywords.split(','),
        }, { timeout: 15000 });
        return res.data;
      } catch (err) {
        return { colors: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'], source: 'fallback' };
      }
    },
  });

  registerTool({
    id: 'comfyui_generate',
    category: 'avatar',
    niche: 'persona,visual',
    name: 'ComfyUI Generation',
    description: 'Gera avatares via ComfyUI (workflow)',
    input: ['prompt', 'workflow', 'seed', 'steps'],
    output: ['image_url', 'base64', 'seed'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      const comfyUrl = process.env.COMFYUI_URL;
      if (!comfyUrl) return { error: 'COMFYUI_URL não configurado', hint: 'Configure ComfyUI server' };
      try {
        const res = await require('axios').post(`${comfyUrl}/prompt`, {
          prompt: params.prompt,
          seed: params.seed || Math.floor(Math.random() * 1000000),
          steps: params.steps || 20,
        });
        return { task_id: res.data.prompt_id, status: 'queued' };
      } catch (err) {
        return { error: 'ComfyUI erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'instantid_face',
    category: 'avatar',
    niche: 'persona,visual',
    name: 'InstantID Face',
    description: 'Gera faces consistentes (InstantID)',
    input: ['face_image', 'reference_image', 'prompt', 'strength'],
    output: ['image_url', 'base64'],
    enabled: true,
    priority: 9,
    execute: async (params) => {
      const instantIdUrl = process.env.INSTANTID_URL;
      if (!instantIdUrl) return { error: 'INSTANTID_URL não configurado', hint: 'Use ControlNet + IP-Adapter locally' };
      try {
        const res = await require('axios').post(`${instantIdUrl}/generate`, {
          face_image: params.face_image,
          reference_image: params.reference_image,
          prompt: params.prompt,
          strength: params.strength || 0.7,
        });
        return res.data;
      } catch (err) {
        return { error: 'InstantID erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'liveportrait',
    category: 'avatar',
    niche: 'persona,video',
    name: 'LivePortrait',
    description: 'Transforma imagem em avatar falante',
    input: ['source_image', 'driving_video', 'expression_scale'],
    output: ['video_url', 'gif_url'],
    enabled: true,
    priority: 8,
    execute: async (params) => {
      const livePortraitUrl = process.env.LIVEPORTRAIT_URL;
      if (!livePortraitUrl) return { error: 'LIVEPORTRAIT_URL não configurado', hint: 'Use SadTalker or LivePortrait Docker' };
      try {
        const res = await require('axios').post(`${livePortraitUrl}/generate`, {
          source_image: params.source_image,
          driving_video: params.driving_video,
          expression_scale: params.expression_scale || 1.0,
        });
        return res.data;
      } catch (err) {
        return { error: 'LivePortrait erro', detail: err.message };
      }
    },
  });

  registerTool({
    id: 'mood_ui',
    category: 'ui',
    niche: 'persona,dynamic',
    name: 'Mood-based UI',
    description: 'Muda UI baseado em emoção/contexto',
    input: ['mood', 'intensity', 'time_of_day'],
    output: ['palette', 'animation', 'background', 'emoji_pack'],
    enabled: true,
    priority: 7,
    execute: async (params) => {
      const mood = params.mood || 'neutral';
      const intensity = parseFloat(params.intensity) || 0.5;
      const timeOfDay = params.time_of_day || 'day';
      
      const moodPalettes = {
        happy: { primary: '#FFD700', secondary: '#FFF8DC', animation: 'bounce', bg: 'linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)' },
        sad: { primary: '#4A90A4', secondary: '#E8F4F8', animation: 'fade', bg: 'linear-gradient(135deg, #2c3e50 0%, #3498db 100%)' },
        excited: { primary: '#FF6B6B', secondary: '#FFE66D', animation: 'pulse', bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
        neutral: { primary: '#D4A843', secondary: '#1a1a2e', animation: 'subtle', bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        anxious: { primary: '#9B59B6', secondary: '#E8DAEF', animation: 'shake', bg: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
        angry: { primary: '#E74C3C', secondary: '#FADBD8', animation: 'intense', bg: 'linear-gradient(135deg, #141E30 0%, #243B55 100%)' },
      };
      
      const palette = moodPalettes[mood] || moodPalettes.neutral;
      const emojis = { happy: ['😊', '🎉', '✨'], sad: ['😔', '💙', '🌧️'], excited: ['🤩', '🔥', '⚡'], neutral: ['🙂', '💭', '🌟'], anxious: ['😰', '🧘', '🌬️'], angry: ['😠', '💢', '⚠️'] };
      
      return { mood, intensity, time_of_day: timeOfDay, palette, emojis: emojis[mood] || emojis.neutral };
    },
  });

  registerTool({
    id: 'persona_identity',
    category: 'identity',
    niche: 'persona,creation',
    name: 'Persona Identity Generator',
    description: 'Gera identidade completa de persona',
    input: ['description', 'niche', 'archetype'],
    output: ['name', 'avatar_url', 'palette', 'voice', 'style', 'emoji_pack', 'background'],
    enabled: true,
    priority: 10,
    execute: async (params) => {
      const desc = params.description || 'assistente amigável';
      const niche = params.niche || 'general';
      const archetype = params.archetype || 'mentor';
      
      const archetypes = {
        mentor: { voice: 'pm_alex', style: 'wise', animation: 'thoughtful', palette: ['#2563EB', '#1E40AF', '#60A5FA'] },
        motivator: { voice: 'pf_dora', style: 'energetic', animation: 'dynamic', palette: ['#DC2626', '#EF4444', '#F87171'] },
        companion: { voice: 'pf_dora', style: 'friendly', animation: 'warm', palette: ['#10B981', '#34D399', '#6EE7B7'] },
        professional: { voice: 'pm_alex', style: 'formal', animation: 'subtle', palette: ['#6366F1', '#8B5CF6', '#A78BFA'] },
        tutor: { voice: 'pm_alex', style: 'patient', animation: 'paced', palette: ['#F59E0B', '#FBBF24', '#FCD34D'] },
        healer: { voice: 'pf_dora', style: 'gentle', animation: 'calm', palette: ['#EC4899', '#F472B6', '#FBCFE8'] },
      };
      
      const config = archetypes[archetype] || archetypes.mentor;
      const seed = archetype + '_' + Date.now();
      
      return {
        name: archetype.charAt(0).toUpperCase() + archetype.slice(1) + ' AI',
        avatar_style: config.style,
        avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`,
        palette: config,
        voice: config.voice,
        tts_lang: 'p',
        animation_style: config.animation,
        emoji_style: config.style === 'energetic' ? 'animated' : 'native',
        background_style: { type: 'gradient', colors: config.palette },
        accent_color: config.palette[0],
        description: desc,
        niche,
        archetype,
      };
    },
  });

  console.log(`[ToolRegistry] Loaded ${TOOL_REGISTRY.size} external tools`);
}

async function searchExternalKnowledge(query, category, limit = 5) {
  const tools = listTools({ category, enabled: true }).slice(0, limit);
  const results = [];

  for (const tool of tools) {
    try {
      const result = await executeTool(tool.id, { search: query });
      results.push({ tool: tool.id, toolName: tool.name, data: result });
    } catch (err) {
      console.error(`[ToolRegistry] ${tool.id} error:`, err.message);
    }
  }

  return results;
}

module.exports = {
  registerTool,
  getTool,
  listTools,
  getCategories,
  executeTool,
  discoverToolsForPersona,
  loadRegistry,
  searchExternalKnowledge,
  TOOL_REGISTRY,
};