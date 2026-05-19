const { pool } = require('../db');
const { executeTool } = require('../tools');
const integrations = require('../llm/integrationManager');
const { getSetting } = require('../settings');

const SERPER_KEY = () => process.env.SERPER_KEY || process.env.SERPER_API_KEY || '';

async function serperSearch(query, searchType = 'search') {
  const key = SERPER_KEY();
  if (!key) return { error: 'SERPER_KEY não configurada' };
  try {
    const endpoint = searchType === 'places' ? 'places' : 'search';
    const res = await fetch(`https://google.serper.dev/${endpoint}`, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: 20 })
    });
    return await res.json();
  } catch (e) { return { error: e.message }; }
}

async function discover(niche, location, options = {}) {
  const limit = options.limit || 20;
  const queries = generateQueries(niche, location);
  const allLeads = [];
  const seen = new Set();

  for (const q of queries.slice(0, 3)) {
    const [organic, places] = await Promise.all([
      serperSearch(q, 'search'),
      serperSearch(q, 'places')
    ]);

    if (organic?.organic) {
      for (const r of organic.organic) {
        const domain = extractDomain(r.link);
        const key = domain || r.title?.toLowerCase().trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          allLeads.push({
            title: r.title,
            website: r.link,
            snippet: r.snippet || '',
            domain,
            source: 'organic',
            has_website: true,
          });
        }
      }
    }

    if (places?.places) {
      for (const p of places.places) {
        const key = p.title?.toLowerCase().trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          allLeads.push({
            title: p.title,
            address: p.address || '',
            phone: p.phoneNumber || p.phone || '',
            website: p.website || '',
            rating: p.rating || null,
            reviews: p.reviews || null,
            maps_link: p.url || '',
            category: p.category || '',
            has_website: !!p.website,
            has_google_maps: true,
            source: 'places',
          });
        }
      }
    }

    if (allLeads.length >= limit) break;
    await new Promise(r => setTimeout(r, 2000));
  }

  return allLeads.slice(0, limit);
}

function generateQueries(niche, location) {
  const variations = [
    `${niche} em ${location}`,
    `melhores ${niche} ${location}`,
    `${niche} ${location} whatsapp`,
    `${niche} ${location} site`,
    `${niche} ${location} telefone`,
  ];
  return variations;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

async function enrichLead(lead) {
  const enriched = { ...lead };

  if (enriched.website) {
    try {
      const scrape = await executeTool('site_scraper', { url: enriched.website });
      if (!scrape.error) {
        if (scrape.emails?.length) enriched.emails = scrape.emails;
        if (scrape.phones?.length) enriched.phones_from_site = scrape.phones;
        if (scrape.social_links) enriched.social_links = { ...enriched.social_links, ...scrape.social_links };
        if (scrape.cnpj) enriched.cnpj_hint = scrape.cnpj;
        if (scrape.title) enriched.site_title = scrape.title;
        if (scrape.description) enriched.site_description = scrape.description;
        enriched.has_email = scrape.emails?.length > 0;
        enriched.has_instagram = !!(scrape.social_links?.instagram?.length);
        enriched.has_youtube = !!(scrape.social_links?.youtube?.length);
        enriched.has_tiktok = !!(scrape.social_links?.tiktok?.length);
      }
    } catch (e) { enriched.scrape_error = e.message; }
  }

  const cnpj = extractCnpj(lead) || enriched.cnpj_hint;
  if (cnpj) {
    const cnpjData = await executeTool('cnpj_lookup', { cnpj });
    if (!cnpjData.error) {
      enriched.cnpj = cnpjData.cnpj;
      enriched.razao_social = cnpjData.razao_social;
      enriched.nome_fantasia = cnpjData.nome_fantasia;
      enriched.capital_social = cnpjData.capital_social;
      enriched.porte = cnpjData.porte;
      enriched.cnae = cnpjData.cnae;
      enriched.cnae_codigo = cnpjData.cnae_codigo;
      enriched.situacao = cnpjData.situacao;
      enriched.socios = cnpjData.socios;
      enriched.abertura = cnpjData.abertura;
      enriched.is_mei = cnpjData.mei;
      enriched.municipio = cnpjData.municipio;
      enriched.uf = cnpjData.uf;
      enriched.email_cnpj = cnpjData.email;
      enriched.telefone_cnpj = cnpjData.telefone;
    }
  }

  return enriched;
}

function extractCnpj(lead) {
  const text = [lead.snippet, lead.website, lead.address].join(' ');
  const match = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  return match ? match[0].replace(/\D/g, '') : null;
}

function calculateLeadScore(lead) {
  let score = 0;
  const breakdown = {};

  if (lead.has_website) { score += 15; breakdown.site = 15; } else { breakdown.site = 0; }
  if (lead.has_instagram) { score += 10; breakdown.instagram = 10; } else { breakdown.instagram = 0; }
  if (lead.has_google_maps) { score += 10; breakdown.maps = 10; } else { breakdown.maps = 0; }
  if (lead.has_ads) { score += 10; breakdown.ads = 10; } else { breakdown.ads = 0; }
  if (lead.has_email) { score += 5; breakdown.email = 5; } else { breakdown.email = 0; }
  if (lead.phone || lead.phones_from_site?.length) { score += 3; breakdown.phone = 3; } else { breakdown.phone = 0; }
  if (lead.has_youtube) { score += 3; breakdown.youtube = 3; } else { breakdown.youtube = 0; }
  if (lead.has_tiktok) { score += 2; breakdown.tiktok = 2; } else { breakdown.tiktok = 0; }

  const capital = parseFloat(lead.capital_social) || 0;
  if (capital >= 100000) { breakdown.capital = 20; score += 20; }
  else if (capital >= 50000) { breakdown.capital = 15; score += 15; }
  else if (capital >= 10000) { breakdown.capital = 10; score += 10; }
  else if (capital > 0) { breakdown.capital = 5; score += 5; }
  else { breakdown.capital = 0; }

  const rating = parseFloat(lead.rating) || 0;
  if (rating >= 4.5) { breakdown.rating = 15; score += 15; }
  else if (rating >= 4.0) { breakdown.rating = 10; score += 10; }
  else if (rating >= 3.5) { breakdown.rating = 7; score += 7; }
  else if (rating > 0) { breakdown.rating = 3; score += 3; }
  else { breakdown.rating = 0; }

  const reviews = parseInt(lead.reviews) || 0;
  if (reviews >= 100) score += 5; else if (reviews >= 20) score += 3;

  if (lead.is_mei) { score -= 5; breakdown.mei_penalty = -5; }

  score = Math.max(0, Math.min(100, score));

  let priority, recommendation;
  if (score >= 70) { priority = 'medio'; recommendation = 'Presença digital forte — foque em diferenciais e upselling.'; }
  else if (score >= 40) { priority = 'alto'; recommendation = 'Oportunidade clara — presença parcial. Ofereça pacotes de melhoria.'; }
  else { priority = 'muito_alto'; recommendation = 'Alta necessidade — pouca ou nenhuma presença digital. Cliente ideal para serviços digitais.'; }

  return { score, breakdown, priority, recommendation };
}

async function analyzeMarket(leads, niche, location) {
  const prompt = `Analise o mercado de "${niche}" em "${location}" com base nos seguintes dados de ${leads.length} empresas encontradas:

${leads.slice(0, 20).map((l, i) => `${i + 1}. ${l.title} | Site: ${l.has_website ? '✅' : '❌'} | Instagram: ${l.has_instagram ? '✅' : '❌'} | Maps: ${l.has_google_maps ? '✅' : '❌'} | Score: ${l.score || 'N/A'}`).join('\n')}

Responda em JSON com:
{
  "resumo": "Resumo executivo do mercado (2-3 frases)",
  "pontos_fracos": ["Lista de fraquezas comuns"],
  "oportunidades": ["Lista de oportunidades identificadas"],
  "estrategia_entrada": "Estratégia recomendada para entrar no mercado",
  "ticket_medio": "Estimativa de ticket médio mensal",
  "concorrencia": "Nível de concorrência (baixo/médio/alto)",
  "dicas_abordagem": ["Dicas práticas de abordagem"]
}`;

  try {
    const result = await integrations.callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    });
    const content = result?.message?.content || result?.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { return { resumo: content, raw: true }; }
    }
    return { resumo: content, raw: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function diagnoseLead(lead, marketContext) {
  const prompt = `Faça um diagnóstico B2B completo para esta empresa:

**Empresa:** ${lead.title}
**Site:** ${lead.website || 'Não possui'}
**Instagram:** ${lead.has_instagram ? '✅' : '❌'}
**Google Maps:** ${lead.has_google_maps ? '✅' : '❌'} | Rating: ${lead.rating || 'N/A'} | Reviews: ${lead.reviews || 'N/A'}
**CNPJ:** ${lead.cnpj || 'Não encontrado'} | Capital: ${lead.capital_social ? `R$ ${lead.capital_social}` : 'N/A'} | MEI: ${lead.is_mei ? 'Sim' : 'Não'}
**Score:** ${lead.score || 'N/A'}/100
**Telefone:** ${lead.phone || lead.telefone_cnpj || 'N/A'}
**Email:** ${lead.emails?.[0] || lead.email_cnpj || 'N/A'}
**CNAE:** ${lead.cnae || 'N/A'}
**Endereço:** ${lead.address || 'N/A'}

${marketContext ? `**Contexto de mercado:** ${marketContext.resumo || ''}` : ''}

Responda em JSON com:
{
  "resumo": "Resumo diagnóstico (2-3 frases)",
  "pontos_fracos": ["Fraquezas digitais identificadas"],
  "pontos_fortes": ["Pontos fortes da empresa"],
  "urgencia": "alta/media/baixa",
  "servicos_sugeridos": ["Serviços que esta empresa precisa"],
  "abordagem_whatsapp": "Template de mensagem de abordagem personalizada para WhatsApp (3-4 linhas, amigável e profissional)",
  "estimativa_receita": "Estimativa de receita mensal potencial",
  "concorrencia_local": "Nível de concorrência local",
  "objetivo_abordagem": "Objetivo principal da abordagem"
}`;

  try {
    const result = await integrations.callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    });
    const content = result?.message?.content || result?.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { return { resumo: content, raw: true }; }
    }
    return { resumo: content, raw: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function pipeline(niche, location, options = {}) {
  const steps = options.steps || ['discover', 'enrich', 'score', 'analyze'];
  const result = { niche, location, leads: [], market_analysis: null, created_at: new Date().toISOString() };

  if (steps.includes('discover')) {
    console.log(`[B2B] Discovery: "${niche}" em "${location}"`);
    result.leads = await discover(niche, location, { limit: options.limit || 20 });
    console.log(`[B2B] Found ${result.leads.length} leads`);
  }

  if (steps.includes('enrich') && result.leads.length > 0) {
    console.log(`[B2B] Enriching ${result.leads.length} leads...`);
    for (let i = 0; i < result.leads.length; i++) {
      result.leads[i] = await enrichLead(result.leads[i]);
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (steps.includes('score') && result.leads.length > 0) {
    console.log(`[B2B] Scoring ${result.leads.length} leads...`);
    for (const lead of result.leads) {
      const scoring = calculateLeadScore(lead);
      Object.assign(lead, scoring);
    }
    result.leads.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  if (steps.includes('analyze') && result.leads.length > 0) {
    console.log(`[B2B] Analyzing market...`);
    result.market_analysis = await analyzeMarket(result.leads, niche, location);
  }

  if (steps.includes('diagnose') && result.leads.length > 0) {
    console.log(`[B2B] Diagnosing top ${Math.min(5, result.leads.length)} leads...`);
    for (let i = 0; i < Math.min(5, result.leads.length); i++) {
      result.leads[i].diagnosis = await diagnoseLead(result.leads[i], result.market_analysis);
    }
  }

  return result;
}

async function saveSearch(userId, niche, location, result) {
  const id = `b2b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    await pool.execute(
      `INSERT INTO b2b_searches (id, user_id, niche, location, results, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [id, userId, niche, location, JSON.stringify(result)]
    );
    return { id, niche, location, lead_count: result.leads?.length || 0 };
  } catch (e) {
    console.error('[B2B] Save search error:', e.message);
    return { error: e.message };
  }
}

async function listSearches(userId, limit = 20) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, niche, location, JSON_LENGTH(results) as lead_count, created_at FROM b2b_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, Number(limit)]
    );
    return rows;
  } catch (e) {
    console.error('[B2B] List searches error:', e.message);
    return [];
  }
}

async function getSearch(id, userId) {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM b2b_searches WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    row.results = typeof row.results === 'string' ? JSON.parse(row.results) : row.results;
    return row;
  } catch (e) {
    console.error('[B2B] Get search error:', e.message);
    return null;
  }
}

async function deleteSearch(id, userId) {
  try {
    await pool.execute('DELETE FROM b2b_searches WHERE id = ? AND user_id = ?', [id, userId]);
    return { deleted: true };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  discover, enrichLead, calculateLeadScore, analyzeMarket, diagnoseLead,
  pipeline, saveSearch, listSearches, getSearch, deleteSearch,
  serperSearch,
};