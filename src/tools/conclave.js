// c:\laragon\www\jesus.ai\src\tools\conclave.js
const integrations = require('../llm/integrationManager');

/**
 * Invoca um Conclave de Agentes Especialistas em Paralelo
 * 
 * @param {string} task A tarefa central a ser analisada.
 * @param {Array<string>} agents Lista de agentes (Ex: ['Analyst', 'Dev', 'QA'])
 * @returns {Promise<Object>} Resultado consolidado das análises
 */
async function invokeConclave(task, agents = ['Analyst', 'Dev', 'QA'], options = {}) {
  const { synapseContext = null, extraInstructions = '' } = options;

  console.log(`[Conclave] ⚖️ Iniciando conclave de agentes para a tarefa: "${task.substring(0, 80)}..."`);

  // Rich context injection from Synapse (L0-L7)
  let contextBlock = '';
  if (synapseContext) {
    if (typeof synapseContext === 'string') {
      contextBlock = `\n\n=== CONTEXTO ESTRUTURADO DO SISTEMA (SYNAPSE) ===\n${synapseContext}\n`;
    } else if (typeof synapseContext === 'object') {
      contextBlock = `\n\n=== CONTEXTO ESTRUTURADO DO SISTEMA (SYNAPSE LAYERS) ===\n`;
      if (synapseContext.l0) contextBlock += `\n[L0 - Constitution]\n${JSON.stringify(synapseContext.l0)}\n`;
      if (synapseContext.l1) contextBlock += `\n[L1 - Global Context]\n${JSON.stringify(synapseContext.l1)}\n`;
      if (synapseContext.l2) contextBlock += `\n[L2 - Agent Memory]\n${JSON.stringify(synapseContext.l2)}\n`;
      if (synapseContext.currentState) contextBlock += `\n[Current System State]\n${JSON.stringify(synapseContext.currentState)}\n`;
      if (synapseContext.relevantLayers) contextBlock += `\n[Relevant Layers for this task]\n${JSON.stringify(synapseContext.relevantLayers)}\n`;
    }
  }

  const fullTask = `${task}${contextBlock}${extraInstructions ? '\n\n' + extraInstructions : ''}`;

  // Definição estática dos papéis cognitivos (enriched with Meta authority)
  const rolePrompts = {
    Analyst: {
      roleName: 'Analyst (Analista de Sistemas & Negócios)',
      system: `Você é um Analista de Sistemas & Negócios extremamente minucioso e sênior. Sua especialidade é destrinchar requisitos, arquitetura de sistemas, dependências, potenciais impactos colaterais e viabilidade de implementação. Analise a tarefa, aponte os pré-requisitos, estruture os fluxos e forneça um plano analítico de alta performance.

Você tem acesso ao contexto Synapse completo do sistema (L0 Constituição até L7 Star Commands). Use-o para tomar decisões alinhadas com a identidade, regras e estado atual do sistema.`
    },
    Dev: {
      roleName: 'Dev (Engenheiro de Software & Automações)',
      system: `Você é um Engenheiro de Software Fullstack & Specialist em Automações Windows/Linux. Sua especialidade é fornecer algoritmos elegantes, códigos-fonte robustos, scripts de integração e caminhos físicos perfeitos. Proponha a implementação técnica detalhada em código.

Use o contexto Synapse para entender o estado atual do sistema, automações existentes, e propor soluções que se integrem perfeitamente ao ecossistema.`
    },
    QA: {
      roleName: 'QA & Security Auditor (Garantia de Qualidade & Auditor de Segurança)',
      system: `Você é um Analista de QA, Auditor de Segurança e Defensor de Confiabilidade de Sistemas (SRE). Sua especialidade é caçar bugs, prever falhas em produção, casos de borda críticos e propor correções preventivas.

Use o contexto Synapse para validar contra as regras de constituição (L0), estado atual e possíveis riscos de segurança/estabilidade.`
    }
  };

  const agentPromises = agents.map(async (agentKey) => {
    const roleDef = rolePrompts[agentKey];
    if (!roleDef) return { agent: agentKey, error: `Papel do agente "${agentKey}" desconhecido.` };

    try {
      const messages = [
        { role: 'system', content: roleDef.system },
        { role: 'user', content: `Analise a seguinte tarefa e entregue o seu parecer especializado:\n\nTAREFA:\n${fullTask}` }
      ];

      console.log(`[Conclave] ⚙️ Despachando agente em paralelo: ${roleDef.roleName}...`);
      const response = await integrations.callLLM(messages, { temperature: 0.5, timeout: 60000 });
      
      const content = response.message?.content || response.content || '';
      const thinking = response.message?.thinking || '';

      return {
        agent: agentKey,
        roleName: roleDef.roleName,
        thinking: thinking,
        opinion: content
      };
    } catch (err) {
      console.error(`[Conclave] ❌ Falha ao processar agente "${agentKey}":`, err.message);
      return { agent: agentKey, error: err.message };
    }
  });

  const results = await Promise.all(agentPromises);

  // Consolidação final
  const successfulOpinions = results.filter(r => !r.error);
  const consolidationMessages = [
    { 
      role: 'system', 
      content: 'Você é a Meta-Persona Admin God do Conclave. Sua tarefa é analisar os pareceres consolidados dos seus sub-agentes especialistas e produzir uma decisão unificada, estratégica e estruturada em formato executivo premium, descrevendo o plano de ação ideal e garantindo que todas as falhas apontadas pelo QA sejam resolvidas no design técnico sugerido pelo Dev.' 
    },
    { 
      role: 'user', 
      content: `Tarefa Original:\n${task}\n\nCONTEXTO SYNAPSE FORNECIDO AOS AGENTES:\n${contextBlock || 'Nenhum contexto estruturado adicional.'}\n\nPareceres dos Agentes Especialistas:\n\n${successfulOpinions.map(o => `### AGENTE: ${o.roleName}\n\n${o.opinion}`).join('\n\n')}\n\nConsolide estes pareceres em uma recomendação tática corporativa soberana e infalível, respeitando o contexto do sistema.` 
    }
  ];

  console.log('[Conclave] 🧠 Consolidando opiniões de sub-agentes...');
  let decision = '';
  try {
    const response = await integrations.callLLM(consolidationMessages, { temperature: 0.3 });
    decision = response.message?.content || response.content || '';
  } catch (err) {
    console.error('[Conclave] Falha ao consolidar pareceres:', err.message);
    decision = `Erro de Consolidação. Pareceres brutos anexados.`;
  }

  return {
    success: true,
    task,
    opinions: results,
    decision,
    synapseContextUsed: !!synapseContext,
    contextSummary: synapseContext ? (typeof synapseContext === 'object' ? Object.keys(synapseContext) : 'string context') : null
  };
}

module.exports = {
  invokeConclave
};
