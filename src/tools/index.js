const { pool } = require('../db');
const { getSetting } = require('../settings');
const toolRegistry = require('./registry');

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'use_external_tool',
      description: 'Executa ferramentas externas especializadas: nutricional (TACO, OpenFood Facts), educação (ENEM), saúde (IMC), conversão de moedas, CEP, Bible, Weather, News, Trivia, B2B (prospecção de leads, CNPJ, scoring, scraping, Google Places, WhatsApp templates, IBGE), geocoding, horóscopo, definições, conselhos, Wikipedia, QR Code, API de imagens. Use quando precisar de dados reais e atualizados.',
      parameters: {
        type: 'object',
        properties: {
          tool_id: { type: 'string', description: 'ID da ferramenta (ex: taco_foods, enem_questions, calc_imc, currency_converter, weather, cep_lookup, bible_search, news_search, trivia)' },
          params: { type: 'object', description: 'Parâmetros de entrada para a ferramenta' },
        },
        required: ['tool_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_external_tools',
      description: 'Lista todas as ferramentas externas disponíveis por categoria.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filtrar por categoria (nutrition, education, health, finance, weather, religion, news, games, address)' },
          niche: { type: 'string', description: 'Filtrar por nicho (fitness, enem, nutrition, general)' },
        },
      },
    },
  },
];

async function executeTool(name, args, context = {}) {
  switch (name) {
    case 'use_external_tool': {
      const { tool_id, params } = args;
      if (!tool_id) return { error: 'tool_id é obrigatório' };
      try {
        const result = await toolRegistry.executeTool(tool_id, params || {});
        return { success: true, tool: tool_id, result };
      } catch (err) {
        return { error: `Erro ao executar ${tool_id}: ${err.message}` };
      }
    }

    case 'list_external_tools': {
      const { category, niche } = args;
      const tools = toolRegistry.listTools({ category, niche, enabled: true });
      const categories = toolRegistry.getCategories();
      return { tools: tools.map(t => ({ id: t.id, name: t.name, category: t.category, niche: t.niche, description: t.description })), categories };
    }

    default:
      return { error: `Tool desconhecida: ${name}` };
  }
}

function getToolDefinitions() {
  return TOOL_DEFINITIONS;
}

async function loadTools() {
  await toolRegistry.loadRegistry();
  console.log('[ExternalTools] Registry loaded');
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  getToolDefinitions,
  loadTools,
};