// c:\laragon\www\jesus.ai\src\tools\conclave.js
const integrations = require('../llm/integrationManager');

/**
 * Invoca um Conclave de Agentes Especialistas em Paralelo
 * 
 * @param {string} task A tarefa central a ser analisada.
 * @param {Array<string>} agents Lista de agentes (Ex: ['Analyst', 'Dev', 'QA'])
 * @returns {Promise<Object>} Resultado consolidado das análises
 */
async function invokeConclave(task, agents = ['Analyst', 'Dev', 'QA']) {
  console.log(`[Conclave] ⚖️ Iniciando conclave de agentes para a tarefa: "${task.substring(0, 80)}..."`);
  
  // Definição estática dos papéis cognitivos
  const rolePrompts = {
    Analyst: {
      roleName: 'Analyst (Analista de Sistemas & Negócios)',
      system: 'Você é um Analista de Sistemas & Negócios extremamente minucioso e sênior. Sua especialidade é destrinchar requisitos, arquitetura de sistemas, dependências, potenciais impactos colaterais e viabilidade de implementação. Analise a tarefa fornecida pelo usuário, aponte os pré-requisitos, estruture os fluxos de dados lógicos e forneça um plano analítico de alta performance.'
    },
    Dev: {
      roleName: 'Dev (Engenheiro de Software & Automações)',
      system: 'Você é um Engenheiro de Software Fullstack & Specialist em Automações Windows/Linux. Sua especialidade é fornecer algoritmos elegantes, códigos-fonte robustos, scripts de integração e caminhos físicos perfeitos. Proponha a implementação técnica detalhada em código para a tarefa fornecida pelo usuário.'
    },
    QA: {
      roleName: 'QA & Security Auditor (Garantia de Qualidade & Auditor de Segurança)',
      system: 'Você é um Analista de QA, Auditor de Segurança e Defensor de Confiabilidade de Sistemas (SRE). Sua especialidade é caçar bugs, prever falhas em ambientes de produção (VPS Linux, Windows), casos de borda críticos que quebram o código do Desenvolvedor e propor correções preventivas (patches) para garantir segurança e robustez absoluta.'
    }
  };

  const agentPromises = agents.map(async (agentKey) => {
    const roleDef = rolePrompts[agentKey];
    if (!roleDef) return { agent: agentKey, error: `Papel do agente "${agentKey}" desconhecido.` };

    try {
      const messages = [
        { role: 'system', content: roleDef.system },
        { role: 'user', content: `Analise a seguinte tarefa e entregue o seu parecer especializado:\n\nTAREFA:\n${task}` }
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
      content: `Tarefa Original:\n${task}\n\nPareceres dos Agentes Especialistas:\n\n${successfulOpinions.map(o => `### AGENTE: ${o.roleName}\n\n${o.opinion}`).join('\n\n')}\n\nConsolide estes pareceres em uma recomendação tática corporativa soberana e infalível.` 
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
    decision
  };
}

module.exports = {
  invokeConclave
};
