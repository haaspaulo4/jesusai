# LOJA AUTÔNOMA — Documentação Completa do Projeto

> **Uma loja que se cria sozinha, se gerencia sozinha, vende sozinha, compra sozinha e evolui sozinha.**
>
> O dono diz o que quer. A IA faz o resto. E melhora a cada dia.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Alojamento Cognitivo — A Arquitetura](#2-alojamento-cognitivo--a-arquitetura)
3. [Multi-Persona Engine](#3-multi-persona-engine)
4. [Pipeline Cognitivo — Perceive Think Decide Act Reflect](#4-pipeline-cognitivo--perceive-think-decide-act-reflect)
5. [Memória de 5 Camadas](#5-memória-de-5-camadas)
6. [Onboarding Inteligente — O Dono Fala, o Sistema Cria](#6-onboarding-inteligente--o-dono-fala-o-sistema-cria)
7. [Catálogo Autônomo](#7-catálogo-autônomo)
8. [Atendimento Cognitivo — Luna](#8-atendimento-cognitivo--luna)
9. [Compra Autônoma no Fornecedor — Nexus](#9-compra-autônoma-no-fornecedor--nexus)
10. [Segurança e Anti-Fraude — Guardian](#10-segurança-e-anti-fraude--guardian)
11. [Analytics Preditivo — Oracle](#11-analytics-preditivo--oracle)
12. [Marketing Autômato — Echo](#12-marketing-automático--echo)
13. [Funil de Conversação — State Machine](#13-funil-de-conversação--state-machine)
14. [Gamificação e Fidelização](#14-gamificação-e-fidelização)
15. [Modos de Integração — Oficial vs Não Oficial](#15-modos-de-integração--oficial-vs-não-oficial)
16. [Event Bus — O Sistema Nervoso](#16-event-bus--o-sistema-nervoso)
17. [Goal Stack — Metas Estratégicas](#17-goal-stack--metas-estratégicas)
18. [Self-Optimization — A Loja Melhora Sozinha](#18-self-optimization--a-loja-melhora-sozinha)
19. [Blueprint System — Clone e Escale](#19-blueprint-system--clone-e-escale)
20. [Canais de Venda](#20-canais-de-venda)
21. [Fluxo Completo do Cliente](#21-fluxo-completo-do-cliente)
22. [Fluxo do Dono — Zero Esforço](#22-fluxo-do-dono--zero-esforço)
23. [Regras de Negócio](#23-regras-de-negócio)
24. [Modelos de Receita](#24-modelos-de-receita)
25. [Schema do Banco de Dados](#25-schema-do-banco-de-dados)
26. [Roadmap de Evolução](#26-roadmap-de-evolução)
27. [Riscos e Mitigações](#27-riscos-e-mitigações)
28. [Resumo Executivo](#28-resumo-executivo)

---

## 1. Visão Geral

### O Problema

Vender online exige: criar loja, cadastrar produtos, precificar, atender clientes, comprar estoque, gerenciar pedidos, fazer marketing, lidar com devoluções. São 10+ papéis que uma pessoa precisa dominar. A maioria desiste.

### A Solução

Uma plataforma de e-commerce autônoma onde **uma IA cognitiva opera a loja inteira**. Não é um chatbot que responde perguntas. É um sistema operacional cognitivo que:

- **Percebe** a emoção, intenção e risco de churn de cada cliente
- **Pensa** com contexto de 5 camadas de memória + goals + estágio do funil
- **Decide** a melhor ação baseada em dados em tempo real
- **Age** com ferramentas concretas (carrinho, pedido, busca, desconto, follow-up)
- **Reflete** sobre o que funcionou e se otimiza

### O que o dono N precisa fazer

- ❌ Não precisa saber vender — Luna vende
- ❌ Não precisa atender — Luna atende 24/7 com cognição
- ❌ Não precisa comprar estoque — Nexus compra sob demanda
- ❌ Não precisa configurar nada — Athena cria tudo pelo onboarding
- ❌ Não precisa fazer marketing — Echo gera conteúdo e campanhas
- ❌ Não precisa analisar dados — Oracle prediz e recomenda
- ❌ Não precisa se preocupar com fraude — Guardian bloqueia
- ✅ O dono só precisa dizer o que quer — e acompanhar o lucro

### Diferencial para chatbot wrappers

| Camada | Chatbot Comum | Loja Autônoma (Este Projeto) |
|--------|-------------|------------------------------|
| **Memória** | Últimas N mensagens | 5 camadas (sessão, perfil, emocional, estratégica, organizacional) |
| **Goals** | Nenhum | Stack hierárquico (global → sessão → conversão → emocional → imediato) |
| **Cognição** | Nenhum | Emoção, intenção, churn risk, engajamento — tempo real |
| **Identidade** | System prompt | Personas com genoma, permissões, estágios, compliance |
| **Autonomia** | Nenhum | Carrinho, pedido, desconto, follow-up, compra no fornecedor |
| **Evolução** | Nenhum | Self-optimization, progress tracking, A/B testing de respostas |
| **Observabilidade** | Nenhum | Thought logs, cognitive states, sugestões de otimização |
| **Controle** | Nenhum | Human override (full/approval/observation) |
| **Escala** | Nenhum | Blueprint system — clona persona de perfume pra moda, eletrônicos, etc. |
| **Eventos** | Nenhum | Event bus — reage a cada ciclo de vida (compra, churn, level up) |

---

## 2. Alojamento Cognitivo — A Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LOJA AUTÔNOMA                                │
│                  Cognitive Operating System                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │  WhatsApp    │  │  Instagram  │  │  Web Chat   │  │ Telegram  │ │
│  │  (Evolution) │  │  (DM API)   │  │  (Socket.IO)│  │  (Bot)    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘ │
│         └─────────────────┴─────────────────┴───────────────┘       │
│                                    │                                 │
│                         ┌──────────▼──────────┐                    │
│                         │   Chat Engine         │                    │
│                         │   (Perceive → Think   │                    │
│                         │    → Decide → Act      │                    │
│                         │    → Reflect)          │                    │
│                         └──────────┬───────────┘                    │
│                                    │                                 │
│          ┌─────────────────────────┼─────────────────────────┐     │
│          │                         │                          │     │
│   ┌──────▼──────┐          ┌──────▼──────┐          ┌───────▼────┐│
│   │  Cognitive   │          │  Memory     │          │  Goal Stack ││
│   │  Pipeline    │          │  Layer      │          │             ││
│   │              │          │             │          │  Strategic   ││
│   │  Emotion     │          │  Session    │          │  Tactical    ││
│   │  Intent      │          │  Profile    │          │  Operational ││
│   │  Churn Risk  │          │  Emotional  │          │  Conversion  ││
│   │  Engagement  │          │  Strategic   │          │  Emotional   ││
│   │  Conversion  │          │  Org Memory  │          │  Immediate   ││
│   └──────┬──────┘          └──────┬──────┘          └───────┬────┘│
│          └─────────────────────────┼─────────────────────────┘     │
│                                    │                                 │
│                         ┌──────────▼──────────┐                    │
│                         │  Context Compiler    │                    │
│                         │  (8 camadas injetadas │                    │
│                         │   no system prompt)   │                    │
│                         └──────────┬───────────┘                    │
│                                    │                                 │
│    ┌───────────────────────────────┼────────────────────────────┐  │
│    │                               │                             │  │
│ ┌──▼──────┐  ┌──────────┐  ┌─────▼─────┐  ┌──────────┐  ┌───▼────┐│
│ │  RAG     │  │  Skills   │  │  Commerce  │  │  Event   │  │Override││
│ │  Layer   │  │  Runtime  │  │  Tools     │  │  Bus     │  │ System ││
│ │         │  │           │  │            │  │          │  │        ││
│ │ Intent- │  │ Action    │  │ Cart       │  │ Reactive │  │ Full   ││
│ │ aware   │  │ Generator │  │ Order      │  │ Triggers │  │ Approv.││
│ │ Per-    │  │ Communi-  │  │ Payment    │  │ Automations│ Observe││
│ │ persona │  │ cation    │  │ Delivery   │  │ Webhooks │  │        ││
│ │ TF-IDF+ │  │ Analysis  │  │ Coupon     │  │ Proactive│  │        ││
│ │ Vector  │  │ Workflow  │  │ Supplier   │  │ Engine   │  │        ││
│ └─────────┘  └──────────┘  └────────────┘  └──────────┘  └────────┘│
│                                                                     │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│    │ Blueprint│  │  Proactive│  │Supplier  │  │   Marketplace     │  │
│    │ System   │  │  Engine   │  │Engine    │  │   Integration     │  │
│    │          │  │ (Cron +   │  │(ML/Shop/ │  │   (ML/Shop/Ali)   │  │
│    │ Clone   │  │  Events)  │  │ Ali API) │  │   Official+Scrape │  │
│    │ Apply   │  │           │  │          │  │                   │  │
│    │ Create  │  │ Streaks  │  │ Search   │  │  Strategy Pattern │  │
│    │ Templates│  │ Goals   │  │ Buy      │  │  Hybrid Fallback │  │
│    └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                                     │
│    ┌──────────────────────────────────────────────────────────────┐│
│    │                    DATA LAYER                                 ││
│    │  MySQL 8.4  │  Redis Cache  │  BullMQ Jobs  │  File Storage  ││
│    └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Multi-Persona Engine

Cada loja tem um **ecossistema de personas** que trabalham juntas como uma equipe virtual. Não são chatbots isolados — são agentes cognitivos com personalidade, permissões, goals e memória compartilhada.

### Personas Centrais

| Persona | Identidade | Genoma | Função | Quando Atua |
|---------|-----------|--------|--------|-------------|
| **Athena** | Estratégista, direta, focada em números | `assertiveness: 0.9, empathy: 0.5, proactivity: 0.9` | Onboarding, gestão, precificação, análise | Setup, decisões críticas, relatórios diários |
| **Luna** | Vendedora empática, perspicaz, adaptativa | `assertiveness: 0.6, empathy: 0.95, sales_aggressiveness: 0.5, humor: 0.4, verbosity: 0.6` | Atendimento e vendas | Chat com cliente, WhatsApp, Instagram |
| **Nexus** | Operacional, rápido, preciso | `assertiveness: 0.7, empathy: 0.3, formality: 0.4, proactivity: 0.8` | Compras, logística, fornecedores | Pedido confirmado → compra no fornecedor |
| **Guardian** | Cauteloso, rígido, protetor | `assertiveness: 0.8, empathy: 0.2, formality: 1.0` | Segurança, anti-fraude, compliance | Toda transação, toda compra suspeita |
| **Oracle** | Analítico, preditivo, visão de futuro | `assertiveness: 0.5, empathy: 0.4, proactivity: 0.95` | Analytics, previsões, otimização | Cron jobs, dashboards, alertas |
| **Echo** | Criativa, engajadora, communicativa | `assertiveness: 0.6, empathy: 0.8, sales_aggressiveness: 0.3, humor: 0.7` | Marketing, conteúdo, SEO | Criação de posts, e-mails, descrições |

### Genoma de Persona

Cada persona tem um genoma que controla seu comportamento:

```json
{
  "tone": "warm_professional",
  "assertiveness": 0.7,
  "empathy": 0.85,
  "sales_aggressiveness": 0.4,
  "humor": 0.3,
  "verbosity": 0.5,
  "proactivity": 0.8,
  "formality": 0.6
}
```

Isso significa que Luna nunca vai ser agressiva demais (sales_aggressiveness: 0.4), sempre empática (empathy: 0.85), e proativa o suficiente pra sugerir upsell (proactivity: 0.8) sem ser chata.

### Compliance Permissions

```json
{
  "can_sell": true,
  "can_offer_discount": true,
  "max_discount_percent": 15,
  "can_finalize_order": false,
  "can_buy_from_supplier": false,
  "can_refund": false,
  "can_access_financial_data": false,
  "can_modify_pricing": false,
  "requires_human_approval_above": 500,
  "can_diagnose_product_authenticity": false,
  "can_promise_delivery_date": false
}
```

Luna **pode** vender e oferecer desconto até 15%. Luna **não pode** finalizar pedido, comprar do fornecedor ou acessar dados financeiros. Nexus finaliza e compra. Guardian aprova valores altos. Athena vê tudo.

### Orquestração das Personas

```
Cliente pergunta: "Quero um perfume pra minha sogra, mas não tá caro não viu?"
    │
    ▼
┌──────────────────────────────────────────────────┐
│ 1. COGNITIVE PIPELINE (Luna recebe)              │
│    Emoção: ansiosa (67%)                         │
│    Intenção: compra (72%) + restrição orçamento  │
│    Churn risk: 25%                               │
│    Conversão: 68%                                │
│    Goal imediato: atender com empatia + upsell   │
├──────────────────────────────────────────────────┤
│ 2. CONTEXT RETRIEVAL                             │
│    Perfil: primeira visita, sem histórico         │
│    Estágio: new_lead → considering               │
│    Memória emocional: (nova, sem padrão)         │
│    RAG: perfumes femininos florais R$50-100      │
│    Catálogo: busca catalog_search                │
├──────────────────────────────────────────────────┤
│ 3. STRATEGIC PLANNING                            │
│    Goal emocional: reduzir ansiedade sobre preço  │
│    Goal conversão: mover pra compra              │
│    Abordagem: empática, opções com preço acessível│
│    Cross-sell: hidratante mesmo fragrance        │
├──────────────────────────────────────────────────┤
│ 4. ACTION DECISION                              │
│    Luna chama: catalog_search("perfume feminino floral") │
│    Luna chama: commerce_add_to_cart (opção escolhida) │
│    Luna oferece: desconto de 10% (dentro do limite) │
├──────────────────────────────────────────────────┤
│ 5. RESPONSE GENERATION                          │
│    "Que delícia presentear a sogra! 🎁           │
│     Vou te mostrar opções lindas e acessíveis:  │
│     1. Floratta - R$69,90 (floral delicado)     │
│     2. Egeo Dolce - R$89,90 (doce com toque floral)│
│     3. Boticário Egeo - R$59,90 (custo-benefício!)│
│     Qual combina mais com a personalidade dela?" │
├──────────────────────────────────────────────────┤
│ 6. POST-RESPONSE                                │
│    Atualiza estágio: new_lead → considering      │
│    Cria follow-up automático: 24h se não responder│
│    Atualiza conversão: 68% → 74%               │
│    Registra insight: "ansiedade sobre preço +    │
│      presente pra sogra → resposta com opções    │
│      accessíveis converte melhor"               │
└──────────────────────────────────────────────────┘
```

---

## 4. Pipeline Cognitivo — Perceive, Think, Decide, Act, Reflect

Cada mensagem do cliente passa por 5 fases antes de receber uma resposta. Isso não é "recebe pergunta → devolve resposta". É cognição real.

### Perceive (Perceber)

```
Input: mensagem do cliente
    ↓
analyzeCognitiveState():
    ├── Emoção: { primary, secondary, confidence }
    │   "ansiosa" (67%), "esperançosa" (40%)
    ├── Intenção: { primary, secondary }
    │   "purchase" (72%), "information" (35%)
    ├── Churn risk: 0-1 (blended 60/40 com estado anterior)
    │   0.25 — baixo risco de desistência
    ├── Conversion probability: 0-1
    │   0.68 — boa chance de converter
    ├── Engagement score: 0-1
    │   0.75 — engajada, interessada
    └── Suggested action:
        "convert_lead" — focar em conversão
```

### Think (Pensar)

```
Context Compiler — 8 camadas injetadas no system prompt:
    1. Persona Identity (genoma + regras + compliance)
    2. Knowledge (RAG intent-aware)
    3. Goals (goal stack ativo)
    4. Memory (session + profile + emotional + strategic + org)
    5. Cognitive State (emoção, intenção, churn, conversão)
    6. Conversation Stage (funil position)
    7. Progress State (histórico de progresso do cliente)
    8. Gamification (XP, streaks, badges)
```

### Decide (Decidir)

```
Agent Runtime decide quais tools chamar:
    ├── catalog_search("perfume feminino floral") → busca no catálogo
    ├── commerce_add_to_cart → adiciona ao carrinho
    ├── commerce_cart_summary → mostra resumo
    ├── commerce_set_address → salva endereço
    ├── commerce_apply_coupon → aplica cupom
    ├── commerce_finalize_order → finaliza pedido
    ├── manage_contacts → atualiza CRM stage
    ├── manage_goals → atualiza meta de conversão
    └── manage_automations → agenda follow-up
```

### Act (Agir)

```
Executar tools sequencialmente (até 5 rounds de tool calls):
    Round 1: catalog_search → encontra 5 perfumes
    Round 2: commerce_add_to_cart → adiciona 1 perfume
    Round 3: commerce_cart_summary → mostra carrinho
    LLM gera resposta final com base nos resultados
```

### Reflect (Refletir)

```
logThought():
    ├── Ferramentas usadas: [catalog_search, commerce_add_to_cart]
    ├── Contexto injetado: {hasGoals, hasOrgMemory, hasStage, hasCognitive}
    ├── Raciocínio: "ansiosa sobre preço, apresentou opções acessíveis"
    ├── Decisão: "convert_lead com abordagem empática"
    ├── Tempo de resposta: 1.8s
    └── Tokens usados: 847

Self-Optimization (a cada 100 mensagens):
    └── generateSuggestions():
        └── "Emoção 'ansiosa' aparece em 35% das conversas → 
             aumentar tom empático em 15%"
        └── "Taxa de conversão quando oferece 3 opções: 42% vs 
             1 opção: 18% → sempre apresentar 3+ opções"
```

---

## 5. Memória de 5 Camadas

Sem memória, toda conversa é a primeira conversa. Com 5 camadas, Luna lembra de tudo que importa.

```
┌───────────────────────────────────────────────────────────────────┐
│ CAMADA 1: MEMÓRIA DE SESSÃO                                      │
│   Últimas N mensagens da conversa atual.                          │
│   TTL: até a sessão encerrar                                     │
│   "O cliente acabou de perguntar sobre o perfume X"              │
├───────────────────────────────────────────────────────────────────┤
│ CAMADA 2: MEMÓRIA DE PERFIL                                      │
│   Dados permanentes do cliente: nome, preferências, histórico.   │
│   TTL: permanente                                                 │
│   "Maria prefere fragrâncias florais, já comprou 3x, gasto R$450"│
├───────────────────────────────────────────────────────────────────┤
│ CAMADA 3: MEMÓRIA EMOCIONAL                                      │
│   Padrões emocionais do cliente: o que funciona, o que não.       │
│   TTL: evolui continuamente                                      │
│   "Maria responde melhor a áudios, pede desconto dps da 3a msg,  │
│    não gosta de ser pressionada, converte com frete grátis"       │
├───────────────────────────────────────────────────────────────────┤
│ CAMADA 4: MEMÓRIA ESTRATÉGICA                                   │
│   O que funciona pra essa persona/loja como um todo.             │
│   TTL: permanente + auto-atualizado                              │
│   "Áudios convertem 40% mais. Cupom de 10% após 2a msg: +25%.   │
│    Perfumes acima de R$150: cliente pede desconto em 68% das vezes│
│    Melhor horário pra follow-up: 19h-21h"                        │
├───────────────────────────────────────────────────────────────────┤
│ CAMADA 5: MEMÓRIA ORGANIZACIONAL                                 │
│   Conhecimento da loja: produtos, preços, políticas, equipe.     │
│   TTL: permanente + sincronizado com fornecedores                │
│   "Política: frete grátis acima de R$150. Troca em até 7 dias.  │
│    Perfume X custa R$80 no ML (margem 45%). Fornecedor Y: 4.8★" │
└───────────────────────────────────────────────────────────────────┘
```

### Exemplo de Memória Emocional em Ação

```
Cliente Maria (2a visita):
    Última compra: 3 semanas atrás
    Última interação: pediu desconto, não comprouu
    Padrão: "responde melhor a cupom de 10% após 2a mensagem"
    Horário preferido: 20h

Luna (sem memória emocional):
    "Oi! Posso te ajudar?" → genérico, sem contexto

Luna (com memória emocional):
    "Oi Maria! Voltei a ver o Egeo que você curtiu 💜 
     Liberando cupom de 10% só pra você! Ta esperando 
     por isso, né? 😊 Usa MARIAVIP10 no checkout!"
     → Conversão: 3x maior
```

---

## 6. Onboarding Inteligente — O Dono Fala, o Sistema Cria

### Fluxo

```
Dono: "Quero uma loja de perfumes femininos em São Paulo"
    │
    ▼
Athena (Meta-Persona): 
  "Perfeito! Vou criar sua loja de perfumes femininos. 
   Me confirma rapidinho:"
    1. Nome da loja? (ou quer que eu sugira?)
    2. Margem de lucro desejada? (sugestão: 40%)
    3. Só Pix ou também cartão?
    4. Foco em qual público? (ex: 20-40 anos, presente)
    │
    ▼ (respostas do dono)
    │
Athena cria TUDO automaticamente:
    ├── Identidade visual: logo, cores, nome → via AI
    ├── Persona Luna: genoma, regras, compliance, TTS voice
    ├── Catálogo: 50-200 produtos buscados no ML/Shopee por Nexus
    ├── Preços: margem calculada + precificação dinâmica por Athena
    ├── Descrições: geradas por Echo com SEO
    ├── Páginas: políticas, termos, sobre → via AI
    ├── Domínio: sualoja.com ou subdomínio
    ├── Pagamentos: Pix configurado (Mercado Pago/PagHiper)
    ├── Entrega: cálculo automático por zona
    ├── WhatsApp: bot Luna online atendendo
    ├── Goal Stack: meta de vendas, meta de clientes, meta de lucro
    ├── Event Bus: automações de follow-up, abandono, aniversário
    ├── Org Memory: políticas, preços, margens, horários
    ├── Luna já sabe tudo sobre os produtos (RAG)
    └── Dashboard: métricas, pedidos, lucro — tudo visível

    Tempo: 5 minutos.
```

### O que Athena cria (em termos técnicos)

```json
{
  "persona": {
    "id": "luna-perfumes-sp",
    "name": "Luna",
    "identity": {
      "pt-BR": "Você é a Luna, consultora de perfumes da [Nome da Loja]..."
    },
    "genome": {
      "tone": "warm_professional",
      "assertiveness": 0.6,
      "empathy": 0.95,
      "sales_aggressiveness": 0.4,
      "proactivity": 0.8
    },
    "compliance_permissions": {
      "can_sell": true,
      "can_offer_discount": true,
      "max_discount_percent": 15,
      "can_finalize_order": false,
      "requires_human_approval_above": 500
    },
    "conversation_stages": [
      "greeting", "discovery", "recommendation", "cart", "checkout", "retention"
    ],
    "tts_voice": "pf_dora",
    "tts_lang": "pt-BR"
  },
  "org_memory": {
    "products": [...50+ perfumes com preço, descrição, margem],
    "policies": {
      "frete_gratis_acima": 150,
      "troca": "7 dias",
      "desconto_maximo": 15
    },
    "pricing": {
      "margem_base": 40,
      "margem_premium": 60
    }
  },
  "goals": [
    {"type": "global", "description": "Faturar R$10.000/mês"},
    {"type": "tactical", "description": "Converter 20% dos leads em clientes"},
    {"type": "operational", "description": "Responder em menos de 30 segundos"}
  ],
  "supplier_mapping": [
    {"product_id": "perf-001", "ml_item": "MLB123456", "shopee_item": "1234567890", "margin": 0.42}
  ],
  "automations": [
    {"trigger": "days_inactive:7", "action": "send_message", "message": "Oi {name}! Faz tempo..."},
    {"trigger": "on_order_completed", "action": "send_message", "message": "Chegou? Que achou?"},
    {"trigger": "birthday", "action": "send_coupon", "discount": 20}
  ]
}
```

---

## 7. Catálogo Autônomo

### Busca e Sincronização

```python
# Nexus opera em ciclo contínuo:
SYNC_INTERVAL = 15 minutos  # configurável

def sync_catalog():
    for product in store.products:
        # 1. Buscar melhor preço nos fornecedores
        results = []
        for supplier in [MercadoLivre, Shopee, AliExpress]:
            results.append(supplier.search(product.keywords))
        
        # 2. Guardian filtra
        filtered = [
            r for r in results
            if r.seller_rating >= 4.5
            and r.delivery_days <= 10
            and r.in_stock
        ]
        
        # 3. Athena calcula preço
        best = min(filtered, key=lambda r: r.price)
        product.supplier_price = best.price
        product.selling_price = calculate_dynamic_price(
            cost=best.price + best.shipping,
            base_margin=0.40,
            demand_adjust=oracle.get_demand_factor(product),
            competition_adjust=athena.get_competition_factor(product)
        )
        
        # 4. Echo gera descrição
        if product.description_stale:
            product.description = echo.generate_seo_description(product)
        
        # 5. Verificar estoque
        if not best.in_stock:
            product.active = False
            notify_owner(f"{product.name} esgotou nos fornecedores")
```

### Precificação Dinâmica

```
preço_venda = custo_fornecedor
              + frete_fornecedor
              × (1 + margem_base)              // 40% padrão
              × (1 + ajuste_demanda)           // Oracle: +5% se muito procurado
              × (1 + ajuste_concorrência)      // Athena: baseado no mercado
              - desconto_volume                 // se cliente comprar mais
              + ajuste_sazonal                  // Dia das Mães: +15%

Exemplo prático:
    Perfume X no ML: R$80
    Frete: R$12
    Margem base: 40%
    Demanda: alta (+5%)
    Sazonalidade: próximo ao Dia das Mães (+10%)
    
    preço = (R$80 + R$12) × 1.40 × 1.05 × 1.10 = R$143.08
    Arredondado: R$143,90
    
    Custo total: R$92,00
    Lucro: R$51,90 (36%)
```

---

## 8. Atendimento Cognitivo — Luna

Luna não é um chatbot. Luna é uma vendedora cognitiva com memória, goals e personalidade.

### Capacidades

- **Análise emocional em tempo real** — percebe se o cliente está ansioso, empolgado, frustrado
- **Detecção de intenção** — sabe se o cliente quer comprar, tirar dúvida ou reclamar
- **Risco de churn** — calcula a probabilidade de o cliente desistir (churn_risk 0-1)
- **Probabilidade de conversão** — estima se vai vender (conversion_probability 0-1)
- **Adaptação de tom** — muda o tom, velocidade e abordagem baseado no estado emocional
- **Upsell inteligente** — sugere dentro do que o cliente quer, não aleatoriamente
- **Desconto dentro do limite** — até 15% sem pedir aprovação, acima pede pro dono
- **Follow-up automático** — agenda mensagens pro cliente que não respondeu
- **Carrinho e checkout via ferramentas** — commerce_add_to_cart, commerce_finalize_order
- **Pós-venda** — pergunta se chegou, coleta review, oferece recompra

### Conversa Real (com Pipeline Cognitivo)

```
[MENSAGEM DO CLIENTE]
Cliente: "oi, quero um perfume pro meu namorado, to meio perdida"

[PIPELINE COGNITIVO]
Emoção: confused (62%), hopeful (45%)
Intenção: purchase (55%), information (70%)
Churn risk: 0.18 (baixo)
Conversão: 0.72 (alta — já quer comprar)
Estágio: discovery
Goal imediato: ajudar a escolher + converter
Memória: primeira visita, sem perfil

[TOOLS CHAMADOS]
1. catalog_search("perfume masculino presente namorado")
2. manage_contacts(stage: "considering")

[RESPOSTA DA LUNA]
"Oi! Que legal presentear o namorado 💙 Me conta: ele é mais 
 do estilo esportivo, casual ou elegante? E a idade dele? 
 Assim consigo sugerir o perfume perfeito!"

[CLIENTE RESPONDE]
Cliente: "ele tem 28 anos, trabalha com suit e tal, mas gosta 
 de coisa mais descolada no fds"

[PIPELINE COGNITIVO — ATUALIZADO]
Emoção: excited (58%), confused diminishing (25%)
Intenção: purchase (75%)
Churn risk: 0.08 (quase zero — engajou)
Conversão: 0.85 (muito alta)
Estágio: discovery → recommendation
Goal: converter com upsell sutil

[TOOLS CHAMADOS]
1. catalog_search("perfume masculino 28 anos elegante casual")
2. commerce_add_to_cart (mostra preço)

[RESPOSTA DA LUNA]
"Entendi! Suit na semana, descolado no fim de semana — 
 ele vai amar essas 3 opções:

 🔹 Sauvage Dior — R$189,90 
    O clássico. Elegante pro suit, fresco pro fds.
    [MELHOR CUSTO-BENEFÍCIO]

 🔹 Villain For Him — R$89,90
    Descolado, marcante. Perfeito pro fds.
    [MAIS ACESSÍVEL]

 🔹 Invictus Paco Rabanne — R$219,90
    Esportivo-luxo. Ele vai amar.
    [MAIS PREMIUM]

 Qual combina mais com a vibe dele? 
 E se quiser, tem o kit com o hidratante 
 da mesma fragrância por +R$29,90 💝"

[CLIENTE]
Cliente: "o sauvage é legal mas 190 ta salgado kkk"

[PIPELINE]
Emoção: cost_conscious (80%), interested (70%)
Conversão: 0.78 (boa, mas hesitante pelo preço)
Goal emocional: reduzir ansiedade sobre preço
Recomendação: oferecer desconto OU mostrar alternativa

[RESPOSTA DA LUNA]
"Entendo! O Sauvage é investimento sim, mas rende MUITO — 
 dura o dia inteiro. E pra você, vou liberar cupom de 10%: 
 LUNA10. Fica R$170,91 com frete grátis 💜

 Ou se preferir economizar, o Villain é uma 
 alternativa incrível por R$89,90 — mesma vibe 
 marcante, outro patamar de preço.

 O que faz mais sentido pra você?"

[CLIENTE ESCOLHE E FINALIZA]
Cliente: "vou de sauvage com o cupom"

[TOOLS CHAMADOS]
1. commerce_add_to_cart(sauvage, qty=1)
2. commerce_apply_coupon("LUNA10")
3. commerce_cart_summary()
4. manage_contacts(stage: "checkout")
5. manage_automations(schedule_follow_up: 24h)

[RESPOSTA FINAL]
"Ótima escolha! Sauvage é presente que marca 💙

 📦 Seu pedido:
 Sauvage Dior - R$170,91 (com cupom LUNA10)
 🚚 Frete grátis!

 Qual a forma de pagamento? Pix ou cartão?"

[PÓS-VENDA AUTOMÁTICO]
+24h: "Seu Sauvage tá a caminho! Rastreio: BR123456789"
+3 dias: "Chegou? Me conta o que ele achou! 💙"
+7 dias: "Se ele curtiu, temos o hidratante Sauvage por R$49,90 
          pra completar a coleção 😊"
```

### Contexto que Luna Injeta no System Prompt

```
[IDENTITY] Você é a Luna, consultora de perfumes da [Loja]. 
           Empática, simpática, nunca pressionadora.

[GENOME] assertiveness: 0.6 | empathy: 0.95 | sales_aggressiveness: 0.4

[COGNITIVE STATE] emotion=excited (85%) | intent=purchase (78%) 
                  churn_risk=0.08 | conversion_probability=0.85
                  ACTION: convert_lead — high intent detected

[GOAL STACK]
  Global: Faturar R$10.000/mês
  Session: Converter esta conversa em venda
  Emotional: Reduzir ansiedade sobre preço
  Immediate: Apresentar opções com cupom de desconto

[CONVERSATION STAGE] recommendation → aproaching checkout

[ORG MEMORY]
  Política: frete grátis acima de R$150
  Desconto máximo Luna: 15%
  Fornecedor Sauvage: MLB123, R$80, margem 45%
  Horário de funcionamento: 8h-22h

[PROGRESS STATE]
  customer_type: new
  budget_range: R$80-200
  preference: masculine_elegant

[GAMIFICATION] Level 3 — 280 XP
```

---

## 9. Compra Autônoma no Fornecedor — Nexus

```
Pedido confirmado na loja (valor: R$170,91)
    │
    ▼
┌──────────────────────────────────────────────────┐
│ NEXUS SUPPLIER ENGINE                            │
│                                                   │
│ 1. BUSCAR FORNECEDOR                              │
│    produto: "Sauvage Dior 100ml"                  │
│    fornecedores mapeados:                          │
│      ML: MLB123456 → R$80,00 (4.8★, entrega 5d)  │
│      Shopee: 1234567890 → R$78,50 (4.6★, 7d)    │
│      AliExpress: AE987654 → R$45,00 (4.2★, 25d) │
│                                                   │
│ 2. GUARDIAN VERIFICA                              │
│    ✓ ML: 4.8★ ≥ 4.5 Mín  ✓ Prazo: 5d ≤ 10d    │
│    ✓ Shopee: 4.6★ ≥ 4.5  ✓ Prazo: 7d ≤ 10d     │
│    ✗ Ali: 4.2★ < 4.5  ✗ Prazo: 25d > 10d        │
│                                                   │
│ 3. ATHENA CALCULA MARGEM                          │
│    ML: (R$170,91 - R$80 - R$12) / R$170,91 = 46% │
│    Shopee: (R$170,91 - R$78,50 - R$15) / R$170,91 = 45%│
│    Ambos acima da margem mínima (20%) ✓           │
│                                                   │
│ 4. NEXUS ESCOLHE: ML (melhor rating + prazo)     │
│                                                   │
│ 5. NEXUS COMPRA                                   │
│    ┌─ Modo Oficial: API do ML (OAuth2)            │
│    │  POST /orders {item: MLB123456,               │
│    │    address: cliente.endereco,                  │
│    │    payment: saldo_ml }                        │
│    │                                                │
│    └─ Modo Não Oficial: Puppeteer/Scraping         │
│       Login → busca → adiciona → checkout → pago   │
│                                                   │
│ 6. NEXUS CAPTURA RASTREIO                         │
│    Código: BR123456789XX                           │
│                                                   │
│ 7. ATUALIZA PEDIDO                                │
│    Status: "Em transporte"                        │
│    Rastreio: BR123456789XX                        │
│                                                   │
│ 8. LUNA NOTIFICA CLIENTE                          │
│    "Seu Sauvage tá a caminho! Rastreio: BR..."   │
│                                                   │
│ 9. ORACLE REGISTRA DADOS                          │
│    Fornecedor ML: 5 dias, 4.8★, R$80              │
│    Margem real: 46%                               │
│    Insight: "ML delivery mais rápido que Shopee"  │
└──────────────────────────────────────────────────┘
```

---

## 10. Segurança e Anti-Fraude — Guardian

| Verificação | Quando | Ação | Threshold |
|---|---|---|---|
| Reputação do vendedor fornecedor | Antes de comprar | Bloqueia se < 4.5★ | Configurável |
| CPF/IP suspeito | No pedido do cliente | Marca pra revisão | Risk score > 0.7 |
| Pedido muito acima da média | No pagamento | Pede aprovação do dono | > R$500 |
| Variação brusca de preço | Na sincronização | Congela preço + alerta | > 20% de variação |
| Produto falso/irregular | No cadastro | Bloqueia por padrão | Lista negra de categorias |
| Múltiplos pedidos do mesmo IP | No checkout | Rate limit + captcha | > 3/hora |
| Chargeback recorrente | Pós-venda | Bloqueia cliente | > 1 em 6 meses |
| Email descartável | No cadastro | Marca pra verificação | Lista de domínios temporários |
| Endereço de entrega diferente | No pedido | Score de risco | Se +3 pedidos em endereços diferentes |
| Cartão sem 3DS | No pagamento | Score de risco | Configurável |

### Escalonamento

```
Risk score < 0.3  → Compra automática (Nexus)
Risk score 0.3-0.6 → Compra com notificação pro dono
Risk score > 0.6  → Requer aprovação manual do dono (pai/mãe)

Se Guardian reprovar:
    → Luna notifica: "Estamos processando seu pedido. 
       Em até 2h você receberá a confirmação!"
    → Dono recebe: "⚠️ Pedido #1234 requer aprovação. 
       Risk score: 0.72. Motivo: IP suspeito + valor alto."
```

---

## 11. Analytics Preditivo — Oracle

### O que Oracle Monitora

```json
{
  "vendas": {
    "hoje": 347,
    "semana": 2180,
    "mes": 12450,
    "ticket_medio": 127.40,
    "conversao_chat_pedido": "23%",
    "lucro_liquido_hoje": 498.80
  },
  "produtos": {
    "top_5": [
      {"nome": "Sauvage Dior", "vendas": 45, "margem": "46%"},
      {"nome": "Egeo Dolce", "vendas": 38, "margem": "52%"},
      {"nome": "Villain For Him", "vendas": 31, "margem": "58%"},
      {"nome": "Floratta", "vendas": 28, "margem": "44%"},
      {"nome": "212 VIP", "vendas": 22, "margem": "41%"}
    ],
    "estocados_mas_sem_venda_7d": ["Perfume X", "Perfume Y"],
    "margem_baixa": ["Bios NT 100ml - margem 18%"]
  },
  "clientes": {
    "novos_hoje": 12,
    "recorrentes_hoje": 8,
    "churn_risk_alto": 3,
    "ltv_medio": 342.00,
    "satisfacao": "4.2/5.0"
  },
  "fornecedores": {
    "melhor_rating": "ML (4.8★)",
    "mais_rapido": "ML (4.2 dias)",
    "mais_barato": "Shopee (-3%)",
    "problemas": "AliEx atrasou 2 pedidos esta semana"
  }
}
```

### Previsões que Oracle Faz

| Tipo | Exemplo | Ação Automática |
|---|---|---|
| **Demanda** | "Vendas de perfumes femininos sobem 40% no Dia das Mães" | Aumentar estoque 15/março, subir margem 10% |
| **Sazonalidade** | "Dia dos Namorados: 3x mais buscas por 'presente'" | Criar campanha Echo, curar coleção |
| **Churn** | "Maria está 7 dias sem interação — 68% chance de não voltar" | Luna envia cupom personalizado |
| **Margem** | "O perfume X está vendendo 3x mais — margem pode subir 5%" | Athena ajusta preço automaticamente |
| **Fornecedor** | "ML atrasou 2 pedidos esta semana — migrar pra Shopee" | Nexus muda fornecedor preferencial |
| **Tendência** | "Buscas por 'perfume barba' subiram 200% no TikTok" | Echo cria conteúdo sobre o tema |

---

## 12. Marketing Automático — Echo

| Ação | Onde | Quando | Persona |
|---|---|---|---|
| Descrições de produto com SEO | Loja | Ao cadastrar produto | Echo |
| Posts Instagram/TikTok | Redes sociais | 3x/semana automaticamente | Echo |
| E-mail pós-compra | E-mail | Após entrega confirmada | Luna |
| Cupom de aniversário | WhatsApp | Dia do aniversário | Luna |
| Recuperação de carrinho | WhatsApp | 2h após abandono | Luna |
| Recuperação de cliente inativo | WhatsApp | 7 dias sem interação | Luna (automated) |
| Remarketing | Meta/Google | Visitou mas não comprou | Echo |
| Stories com produto em alta | Instagram | Produto viraliza | Echo |
| Review automático | WhatsApp | 3 dias após entrega | Luna |
| Review → conteúdo de marketing | Instagram/Blog | Review positivo coletado | Echo |

### Recuperação de Clientes (Event Bus + Proactive Engine)

```
Dia 7 sem interação:
    → Luna: "Oi {nome}! Faz um tempinho... Que tal um {discount} 
             no seu próximo perfume? 💜 Use VOLTEI10"

Dia 15 sem interação:
    → Luna: "{nome}, seleção especial pra quem voltou: 
             produtos selecionados com 15% off + frete grátis!"

Dia 30 sem interação:
    → Luna: "Última chance! Cupom de 20%: VOLTEI20. 
             Válido só essa semana 💜"

Dia 45 sem interação:
    → Marcar como "churned" no CRM, parar de mandar
```

---

## 13. Funil de Conversação — State Machine

Cada cliente avança por estágios. Luna sabe em qual estágio cada pessoa está e adapta a abordagem.

```
┌──────────┐    ┌───────────┐    ┌──────────────┐    ┌──────────┐    ┌─────────┐
│ GREETING │───→│ DISCOVERY │───→│RECOMMENDATION│───→│  CART    │───→│ CHECKOUT│
└──────────┘    └───────────┘    └──────────────┘    └──────────┘    └────┬────┘
      │               │                  │                   │              │
      │               │                  │                   │      ┌──────▼──────┐
      │               │                  │                   │      │  COMPLETED   │
      │               │                  │                   │      └──────┬──────┘
      │               │                  │                   │              │
      │               │                  │                   │      ┌──────▼──────┐
      │               │                  │                   │      │  RETENTION  │
      │               │                  │                   │      └──────┬──────┘
      │               │                  │                   │              │
      │               │                  │                   │      ┌──────▼──────┐
      │               │                  │                   │      │  REACTIVATE │
      │               │                  │                   │      └─────────────┘
      │          ┌────▼──────┐                                │
      │          │  LOST_LEAD │                               │
      │          └───────────┘                                │
      └───────────────────────────────→ (follow-ups automáticos em cada estágio)
```

Cada estágio tem:
- **Goal**: O que queremos alcançar
- **Best approach**: Tom, tipo de conteúdo, estilo de CTA
- **Timeout rules**: Quando mandar follow-up, quantas vezes
- **Transition triggers**: O que move o cliente pro próximo estágio

```json
{
  "stage": "discovery",
  "goal": "Entender as preferências do cliente pra recomendar o perfume ideal",
  "best_approach": {
    "tone": "warm",
    "content_type": "questions + options",
    "cta_style": "soft"
  },
  "follow_up_rules": {
    "after_minutes": 1440,
    "max_attempts": 3,
    "escalation": "human"
  },
  "transition_triggers": {
    "keywords": ["quero", "pode ser esse", "gostei", "levar"],
    "actions": ["add_to_cart"]
  }
}
```

---

## 14. Gamificação e Fidelização

Programa de fidelidade integrado — Luna menciona pontos e benefícios naturalmente na conversa.

### Sistema de XP e Levels

```
Level 1:  0 XP    — Cliente novo
Level 5:  300 XP  — Cliente frequente (+5% desconto)
Level 10: 1.200 XP — Cliente VIP (+10% desconto)
Level 20: 5.000 XP — Cliente Elite (+15% desconto + frete grátis sempre)
Level 30: 15.000 XP — Cliente Diamond (acesso antecipado + presentes)

Ganhar XP:
+10 XP por mensagem
+50 XP por compra
+25 XP por review
+5 XP por dia de streak (conversas consecutivas)
+100 XP por indicação que compra

Badges automáticos:
🛒 "Primeira Compra" — primeira finalização
💬 "Conversador" — 50 mensagens
⭐ "Crítico" — primeira review
🎁 "Indicador" — primeira indicação convertida
🔥 "Streak 7" — 7 dias consecutivos
💎 "VIP" — Level 10+
```

### Programa de Fidelidade

```sql
-- Tabela: loyalty_programs
CREATE TABLE loyalty_programs (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60),
  name VARCHAR(100),
  type ENUM('points','cashback','stamp_card','tier'),
  points_per_real DECIMAL(5,2) DEFAULT 1,    -- 1 ponto por R$1 gasto
  cashback_percent DECIMAL(5,2) DEFAULT 5,    -- 5% de cashback
  redemption_threshold INT DEFAULT 100,      -- mínimo 100 pontos pra resgatar
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: loyalty_transactions
CREATE TABLE loyalty_transactions (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(60),
  persona_id VARCHAR(60),
  order_id VARCHAR(80),
  type ENUM('earn','redeem','expire','adjust'),
  points INT DEFAULT 0,
  cashback_amount DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Como Luna Usa Fidelidade

```
Luna (no carrinho):
"Você tem 350 pontos no programa LoyalLuna! 💎
 Pode usar pra ganhar R$17,50 de desconto agora.
 Quer resgatar os pontos ou acumular mais? 
 Faltam só 150 pontos pro Level 10 e +10% OFF!"
```

---

## 15. Modos de Integração — Oficial vs Não Oficial

### Modo Oficial (Recomendado para Produção)

| Plataforma | Método | Autenticação | Limitações | Rate Limit |
|---|---|---|---|---|
| Mercado Livre | API REST OAuth 2.0 | client_id + client_secret | Compra automatizada precisa aprovação | ~1000 req/h |
| Shopee | API REST HMAC-SHA256 | partner_id + partner_key | Precisa de app aprovado | Varia por app |
| AliExpress | API REST OAuth 2.0 | app_key + app_secret | Dropshipping API disponível | ~3000 req/min |
| Amazon | SP-API | AWS IAM + OAuth | Somente para sellers aprovados | Varia |

### Modo Não Oficial (Scraping — Risco Controlado)

| Método | Ferramentas | Risco | Quando Usar |
|---|---|---|---|
| Scraping DOM | simple_html_dom, BeautifulSoup | Alto — bloqueio IP, captcha | Protótipo, dados de pesquisa |
| Headless Browser | Puppeteer, Playwright, Selenium | Médio — mais difícil detectar | Quando API não disponível |
| API Reversa | Interceptor de requisições mobile/web | Alto — endpoints mudam | Último recurso |
| Bibliotecas terceiros | Pacotes NPM/Pip da comunidade | Médio — podem parar de funcionar | Testes e MVP |

### Estratégia Híbrida (Recomendada)

```
Busca e precificação    → API OFICIAL (confiável, estável)
Verificação de estoque   → API OFICIAL + scraping (fallback)
Compra automática       → API OFICIAL (se aprovado) ou MANUAL com assistência IA
Fallback geral          → Scraping controlado (proxy rotation, rate limiting)
Monitoramento de preço  → API OFICIAL (polling a cada 15 min)
Review e reputação      → Scraping (API não fornece facilmente)
```

### Proxy Management (para scraping)

```
Rotating proxies:      1 requisição/IP, pool de 100+ proxies
Rate limiting:          1 req/segundo por proxy
Fingerprint rotation:   User-Agent, headers, viewport randomização
Captcha solving:        2captcha / anti-captcha integration
Error handling:         Retry 3x, fallback to API oficial
Detection avoidance:    Headless browser com stealth plugin
```

---

## 16. Event Bus — O Sistema Nervoso

Cada evento importante dispara reações automáticas. O sistema é **reativo** — não precisa de intervenção humana.

| Evento | Trigger | Ação Automática |
|---|---|---|
| `on_order_completed` | Pedido finalizado | Nexus compra no fornecedor + Luna confirma |
| `on_order_shipped` | Produto enviado | Luna manda rastreio |
| `on_order_delivered` | Produto entregue | Luna pergunta "chegou? que achou?" + coleta review |
| `on_churn_risk_high` | Churn risk > 60% | Luna manda cupom personalizado |
| `on_stage_advance` | Cliente avança no funil | Atualiza CRM + meta |
| `on_badge_earned` | Ganhou badge | Luna parabeniza + incentiva mais |
| `on_xp_milestone` | Cruzou milestone de XP | Luna reconhece + oferece benefício |
| `on_review_submitted` | Review positivo | Echo gera conteúdo de marketing |
| `on_product_out_of_stock` | Produto esgotou no fornecedor | Desativa na loja + notifica dono |
| `on_price_changed` | Preço mudou > 20% | Congela preço + alerta dono |
| `on_suspicious_order` | Guardian flagou risco | Pausa compra + pede aprovação |
| `on_follow_up_due` | Follow-up agendado | Luna manda mensagem |
| `on_birthday` | Aniversário do cliente | Luna manda cupom + mensagem |
| `on_demand_spike` | Produto viralizando | Oracle ajusta preço + Echo cria conteúdo |
| `on_supplier_issue` | Fornecedor com problema | Nexus migra pra fornecedor alternativo |

---

## 17. Goal Stack — Metas Estratégicas

```
┌─────────────────────────────────────────────┐
│               GLOBAL GOAL                    │
│   "Faturar R$10.000/mês"                    │
│   Target: R$10.000 | Current: R$3.247       │
├─────────────────────────────────────────────┤
│              SESSION GOAL                    │
│   "Converter esta conversa em venda"         │
│   Probability: 68%                           │
├─────────────────────────────────────────────┤
│            CONVERSION GOAL                   │
│   "Cliente adicionou ao carrinho — finalizar"│
│   Stage: recommendation → cart               │
├─────────────────────────────────────────────┤
│           EMOTIONAL GOAL                     │
│   "Reduzir ansiedade sobre preço"            │
│   Emoção detectada: anxious (67%)            │
├─────────────────────────────────────────────┤
│           IMMEDIATE GOAL                     │
│   "Apresentar 3 opções com cupom"            │
│   Action: catalog_search + coupon            │
└─────────────────────────────────────────────┘
```

Goals são injetados em CADA system prompt. Luna sempre sabe o que está buscando, tanto no nível macro (meta da loja) quanto no nível micro (o que fazer NESTA mensagem).

---

## 18. Self-Optimization — A Loja Melhora Sozinha

A cada 100 mensagens processadas, Oracle analisa padrões e gera sugestões:

```json
{
  "persona_id": "luna-perfumes",
  "period": "7 days",
  "total_messages": 847,
  "suggestions": [
    {
      "type": "tone",
      "priority": "high",
      "title": "Aumentar empatia nas respostas noturnas",
      "description": "Clientes noturnos (21h-23h) têm 40% mais chance de churn quando recebem respostas curtas. Sugestão: respostas mais longas e empáticas no período noturno.",
      "data": { "time_range": "21h-23h", "churn_rate": 0.45, "avg_response_length": "42 chars" }
    },
    {
      "type": "retention",
      "priority": "high", 
      "title": "Cupom de 10% após 2a mensagem converte melhor",
      "description": "Taxa de conversão com cupom na 2a msg: 34% vs sem cupom: 18%. Aplicar como padrão.",
      "data": { "with_coupon": 0.34, "without_coupon": 0.18, "optimal_timing": "2nd message" }
    },
    {
      "type": "engagement",
      "priority": "medium",
      "title": "Áudios convertem mais que texto",
      "description": "Conversões com áudio: 42% vs texto: 28%. Considerar TTS proativo em momentos chave.",
      "data": { "audio_conversion": 0.42, "text_conversion": 0.28 }
    },
    {
      "type": "sales",
      "priority": "medium",
      "title": "Apresentar 3+ opções ao invés de 1",
      "description": "3 opções: 45% conversão vs 1 opção: 22%. Sempre mostrar pelo menos 3.",
      "data": { "3_options": 0.45, "1_option": 0.22 }
    }
  ]
}
```

Se a confiança da sugestão for > 70%, o sistema auto-aplica sem intervenção do dono.

---

## 19. Blueprint System — Clone e Escale

Uma vez que uma persona de perfume funciona, você clona pra qualquer nicho.

```
Blueprint: "Loja de Perfumes Premium"
    ├── Persona Luna (genoma, regras, compliance)
    ├── Catálogo (5-200 produtos via scraping)
    ├── Goals (meta de vendas, conversão, satisfação)
    ├── Stages (greeting → discovery → recommendation → cart → checkout → retention)
    ├── Automations (follow-up, birthday, abandoned cart)
    ├── Org Memory (políticas, margens, fornecedores)
    ├── Skills (catalog_search, commerce_* , loyalty_*)
    └── Knowledge Sources (perfume guide, fragrance families)

Comando: "Quero uma loja de eletrônicos"
    → Athena clona o blueprint
    → Adapta identidade, tom, regras, conhecimentos
    → Reconfigura fornecedores, margens, categorias
    → 5 minutos: loja de eletrônicos pronta
```

### Blueprints por Nicho

| Nicho | Blueprint ID | Conteúdo |
|---|---|---|
| Perfumes | `bp_perfumes` | Catálogo, margens, sazonalidade (Dia das Mães, Namorados) |
| Hamburgueria | `bp_delivery` | Cardápio, delivery, PIX, horário, upsell |
| Clínica Médica | `bp_clinica` | Agendamento, tipos de consulta, convênios |
| Loja de Roupas | `bp_moda` | Catálogo, tamanhos, trocas, promoções |
| Eletrônicos | `bp_eletronicos` | Especificações, garantia, comparativos |
| Cosméticos | `bp_cosmeticos` | Catálogo, skincare routine, reviews |
| Livraria | `bp_livraria` | Catálogo, indicações, clube de leitura |

---

## 20. Canais de Venda

### WhatsApp (Primário)

```
Cliente manda mensagem no WhatsApp
    → Evolution API (multi-instância)
    → Luna atende com personalidade e cognição
    → Catalog search, carrinho, endereço, pagamento
    → Tudo dentro do chat (sem sair do WhatsApp)
    → PIX com QR code direto no chat
    → Recibo formatado no WhatsApp
    → Follow-up automático
```

### Web Storefront

```
Cliente acessa sualoja.com
    → SPA responsivo (mobile-first)
    → Chat com Luna no canto
    → Catálogo, carrinho, checkout
    → PWA instalável
    → Order tracking
```

### Instagram (Social Commerce)

```
Cliente manda DM no Instagram
    → Luna atende via instagram-private-api
    → Redireciona pra WhatsApp ou Web pra finalizar
    → Stories com produto em alta (gerado por Echo)
    → Feed com descrições SEO
```

### Integração com MetaPersona.AI

A loja autônoma é um **blueprint** dentro da plataforma MetaPersona.AI:

```
MetaPersona.AI (já funcional)
    ├── Chat Engine (processMessage)
    ├── Persona Manager (multi-persona com DB)
    ├── Meta-RAG (criar persona via LLM)
    ├── Cognitive Pipeline (emoção, intenção, churn risk)
    ├── Commerce Tools (10 ferramentas de carrinho/pedido)
    ├── Goal Stack (metas hierárquicas)
    ├── Conversation Stages (state machine)
    ├── Org Memory (conhecimento da loja)
    ├── Gamification (XP, levels, streaks, badges)
    ├── Event Bus (12 tipos de evento)
    ├── Proactive Engine (follow-ups, streaks, goals)
    ├── Human Override (full/approval/observation)
    ├── Self-Optimization (suggestions)
    ├── Blueprint System (clone, marketplace)
    ├── Skills System (57 global + 7 language)
    ├── TTS/STT (Kokoro + Edge + Whisper)
    ├── WhatsApp Bot (Evolution API)
    ├── Telegram Bot (multi-instance)
    ├── ERP/CMS integrado (products, orders, finance)
    └── +60 LLM tools
```

---

## 21. Fluxo Completo do Cliente

```
1. Cliente acessa a loja (site, WhatsApp ou Instagram)
         │
         ▼
2. Luna saúda com personalidade: "Oi! 💜 Posso te ajudar a encontrar
   o perfume ideal?"
         │
         ▼
3. COGNITION: analyzeCognitiveState()
   → Emoção: curious (70%), Intent: browse (55%)
   → Churn risk: 0.15, Conversion: 0.45
         │
         ▼
4. Luna identifica interesse → sugere produtos por perfil
   → Tools: catalog_search, manage_contacts(stage: "discovery")
         │
         ▼
5. Cliente escolhe → Luna adiciona ao carrinho
   → Tools: commerce_add_to_cart, commerce_cart_summary
         │
         ▼
6. Upsell inteligente: "Quer incluir o hidratante da mesma fragrância?"
   → Cognitive: engagement alto + não é agressiva (genome: sales_aggressiveness 0.4)
         │
         ▼
7. Cliente define endereço → cálculo de frete automático
   → Tools: commerce_set_address, commerce_calculate_delivery
         │
         ▼
8. Cliente escolhe pagamento (Pix, cartão, dinheiro)
   → Tools: commerce_set_payment
         │
         ▼
9. GUARDIAN VERIFICA SEGURANÇA
   → Risk score < 0.3 → aprova automaticamente
   → Risk score 0.3-0.6 → notifica dono
   → Risk score > 0.6 → requer aprovação manual
         │
         ▼
10. Pedido confirmado → NEXUS COMPRA NO FORNECEDOR
    → Busca melhor preço/reputação/prazo
    → Compra com endereço do cliente
    → Captura rastreio
         │
         ▼
11. Luna manda rastreio: "Seu perfume tá a caminho! 📦"
         │
         ▼
12. ORACLE analisa: "Produto X vendido 3x esta semana → aumentar margem"
         │
         ▼
13. Produto entregre → Luna pergunta: "Chegou? O que achou? ⭐"
         │
         ▼
14. Review coletado → Echo gera conteúdo de marketing
         │
         ▼
15. +7 dias → Follow-up: "Tem o hidratante que combina por R$49,90 💜"
         │
         ▼
16. XP concedido: +50 XP por compra, +25 por review
    Level up: "Parabéns! Você é Level 3 agora! 🎉 +5% OFF na próxima!"
         │
         ▼
17. SELF-OPTIMIZATION: "Responder áudio converte 40% mais → 
    usar TTS em momentos chave"
```

---

## 22. Fluxo do Dono — Zero Esforço

### Setup Inicial (5 minutos com Athena)

```
Dono: "Quero uma loja de perfumes femininos em São Paulo"

Athena: "Perfeito! Vou criar tudo pra você 🚀
         1. Nome: [sugere 3 nomes] ou digite o seu
         2. Margem: 40% (padrão) ou digite a sua
         3. Pagamento: Pix, cartão ou ambos?
         4. Público: mulheres 20-45 anos (padrão)?
         
         Enquanto você responde, já tô criando:
         ✓ Identidade visual gerada
         ✓ 50 produtos sendo buscados no ML
         ✓ Luna sendo configurada
         ✓ WhatsApp sendo conectado
         ✓ Metas de vendas configuradas"

Dono: "Nome: Perfumes da Lua, margem 45%, só Pix, público tá certo"

Athena: "Pronto! Sua loja está online:
         
         🌐 LOJA: perfumesdalua.com
         📱 WHATSAPP: (11) 99999-0000 (Luna atendendo)
         💰 Margem: 45%
         📦 Produtos: 50 cadastrados (sync em tempo real)
         🤖 Luna tá no WhatsApp agora atendendo visitantes
         
         Seu primeiro resumo chega amanhã às 8h.
         Qualquer coisa, fala comigo aqui. Boas vendas! 💜"
```

### Dia a Dia (Tudo Automático)

```
Athena envia resumo diário às 8h:

"Bom dia! ☀️ Resumo de ontem (22/05):

 📊 VISITAS: 847 (+12% vs semana anterior)
 💬 CONVERSAS: 23 (95% atendidas por Luna)
 🛒 VENDAS: 5 pedidos (R$1.247,00)
 💰 LUCRO LÍQUIDO: R$498,80 (40% margem)
 📦 PEDIDOS EM TRÂNSITO: 3
 ⭐ SATISFAÇÃO: 4.5/5.0
 
 Destaques:
 🔥 Sauvage Dior vendeu 3x — subi margem pra 50%
 ⚠️ AliExpress atrasou 1 pedido — migrei pra ML
 🆕 12 novos clientes (3 via Instagram)
 💬 Luna converteu 23% dos chats em venda
 🎯 Meta: R$10k/mês — já temos R$3.2k (32%)
 
 Ações automáticas hoje:
 ✓ Luna mandou follow-up pra 4 clientes
 ✓ Echo postou no Instagram
 ✓ Oracle ajustou preço de 2 produtos
 ✓ Guardian bloqueou 1 pedido suspeito"
```

### Intervenção Manual (só quando necessário)

| Situação | Ação | Frequency |
|---|---|---|
| Pedido > R$500 | Guardian pede aprovação | ~2x/semana |
| Produto esgotou em todos os fornecedores | Notifica dono | ~1x/semana |
| Chargeback ou disputa | Guardian bloqueia + alerta | ~1x/mês |
| Margem caindo consistentemente | Oracle sugere ajuste | ~1x/mês |
| Novo fornecedor melhor identificado | Oracle sugere mudança | ~2x/mês |
| Review negativo significativo | Luna escalation | ~1x/mês |

**Total de intervenção humana: ~10 minutos por semana.**

---

## 23. Regras de Negócio

### Precificação

```
margem_mínima = configurável (padrão: 25%)
margem_ideal = configurável (padrão: 40%)  
margem_premium = configurável (padrão: 60%)
margem_black_friday = configurável (padrão: 20%)

preço_venda = custo × (1 + margem) + frete
preço_promo = preço_venda × (1 - desconto_máximo)
desconto_máximo_sem_aprovação = configurável (padrão: 15%)
Luna pode oferecer até desconto_máximo SEM aprovação
Acima disso → pede aprovação pro dono via Guardian

ajuste_demanda = +5% se produto muito procurado (Oracle)
ajuste_sazonal = +10% no Dia das Mães, +15% no Natal (Oracle)
ajuste_concorrência = baseado em scraping de preços (Athena)
```

### Compra no Fornecedor

```
reputação_mínima_vendedor = 4.5 estrelas (configurável)
prazo_entrega_máximo = 10 dias úteis (configurável)
valor_compra_automatica_máximo = R$500 (configurável)
valor_acima_disso = aprovação manual
tentativas_de_compra = 3 (se falhar, tenta outro fornecedor)
se_esgotar_todos = notifica dono + Luna avisa cliente com alternativa
```

### Atendimento (Luna)

```
tempo_resposta_máximo = 30 segundos
tom = empático, simpático, Nunca apressado (genome controlado)
idioma = português brasileiro
nunca_mentir = nunca inventar preço, prazo ou estoque
nunca_prometer = não prometer entrega em X dias sem confirmar
upsell_máximo = 2 sugestões por conversa (não ser chata)
desconto_automatico_máximo = 15% (sem aprovação)
follow_up_inatividade = 7 dias (1a msg), 15 dias (2a), 30 dias (3a)
recover_abandono_carrinho = 2 horas após abandono
```

### Segurança (Guardian)

```
bloquear_vendedor_reputação < 4.5 estrelas
bloquear_pedido_IP_duplicado = 3 por hora
bloquear_CPF_reincidência_chargeback = permanente
alertar_variação_preço > 20% = congelar produto
aprovação_manual_pedido > R$500
risk_score > 0.6 = bloquear até aprovação
risk_score 0.3-0.6 = notificar dono
```

---

## 24. Modelos de Receita

### Dono da Loja (Margem de Arbitragem)

```
Receita = preço_venda × quantidade_vendida
Custo = custo_fornecedor + frete_fornecedor + taxas_gateway
Lucro = Receita - Custo

Exemplo real:
  Sauvage Dior no ML: R$80,00
  Frete ML: R$12,00
  Margem: 45%
  
  Preço na loja: (80 + 12) × 1.45 = R$133,40
  Taxa gateway (2.5%): -R$3,34
  Custo total: R$95,34
  Lucro: R$38,06 (28.5%)
  
  Com 5 vendas/dia: R$190/dia = R$5.700/mês de lucro
  Com 20 vendas/dia: R$761/dia = R$22.830/mês de lucro
```

### Plataforma (SaaS — Quem Desenvolve o Sistema)

```
Opção A: Assinatura + Commission
  R$297/mês + 2% sobre vendas
  Setup: R$2.000-5.000 (criação da loja, onboarding, treino)

Opção B: Assinatura Premium
  R$697/mês (sem commission sobre vendas)
  Setup: R$3.000-7.000

Opção C: Freemium
  Loja grátis (margem 20% da plataforma)
  Upgrade: R$97/mês (margem reduz pra 5%)
  Premium: R$297/mês (margem 0% da plataforma)

Projeção com 100 lojas (Opção A):
  100 × R$297 = R$29.700/mês
  + 2% sobre vendas (média R$30k/mês/loja) = R$60.000/mês
  Total: R$89.700/mês
```

---

## 25. Schema do Banco de Dados

### Tabelas Core (Herança MetaPersona.AI)

As tabelas base já existem no MetaPersona.AI (68+ tabelas). Abaixo apenas as **novas tabelas** necessárias para a loja autônoma:

```sql
-- Mapeamento produto loja → produto fornecedor
CREATE TABLE supplier_mapping (
  id VARCHAR(80) PRIMARY KEY,
  product_id VARCHAR(80) NOT NULL,          -- produto na loja (products table)
  persona_id VARCHAR(60) NOT NULL,          -- loja/persona
  platform ENUM('mercadolivre','shopee','aliexpress','amazon','other'),
  platform_item_id VARCHAR(100),             -- ID no fornecedor
  platform_url TEXT,                         -- URL do produto no fornecedor
  supplier_price DECIMAL(10,2),              -- preço no fornecedor
  shipping_cost DECIMAL(10,2) DEFAULT 0,     -- frete do fornecedor
  seller_rating DECIMAL(3,2),                -- reputação do vendedor
  delivery_days INT,                         -- prazo de entrega
  in_stock TINYINT DEFAULT 1,               -- estoque disponível
  last_checked TIMESTAMP,                    -- última verificação
  is_preferred TINYINT DEFAULT 0,           -- fornecedor preferido
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sm_product (product_id),
  KEY idx_sm_platform (platform, platform_item_id),
  KEY idx_sm_persona (persona_id)
);

-- Configuração das APIs de fornecedor
CREATE TABLE supplier_api_config (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  platform ENUM('mercadolivre','shopee','aliexpress','amazon','other'),
  mode ENUM('official','unofficial','hybrid') DEFAULT 'hybrid',
  client_id VARCHAR(255),
  client_secret VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  token_expires TIMESTAMP,
  api_url VARCHAR(500),
  rate_limit_per_hour INT DEFAULT 1000,
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sac_persona (persona_id),
  KEY idx_sac_platform (platform)
);

-- Log de compras automáticas
CREATE TABLE purchase_log (
  id VARCHAR(80) PRIMARY KEY,
  order_id VARCHAR(80) NOT NULL,             -- pedido na loja (orders table)
  persona_id VARCHAR(60) NOT NULL,
  supplier_mapping_id VARCHAR(80),
  platform ENUM('mercadolivre','shopee','aliexpress','amazon','manual'),
  platform_order_id VARCHAR(100),            -- ID do pedido no fornecedor
  purchase_price DECIMAL(10,2),              -- preço pago no fornecedor
  shipping_cost DECIMAL(10,2) DEFAULT 0,
  tracking_code VARCHAR(100),               -- código de rastreio
  tracking_url VARCHAR(500),                 -- URL de rastreio
  status ENUM('pending','purchased','shipped','delivered','failed','refunded') DEFAULT 'pending',
  mode ENUM('official','unofficial','manual') DEFAULT 'official',
  error_message TEXT,
  purchased_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pl_order (order_id),
  KEY idx_pl_persona (persona_id),
  KEY idx_pl_status (status)
);

-- Configuração de precificação dinâmica
CREATE TABLE pricing_rules (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  product_id VARCHAR(80),                    -- null = regra global
  base_margin DECIMAL(5,2) DEFAULT 40,       -- margem base %
  premium_margin DECIMAL(5,2) DEFAULT 60,    -- margem premium %
  min_margin DECIMAL(5,2) DEFAULT 25,        -- margem mínima %
  demand_adjust_pct DECIMAL(5,2) DEFAULT 5,  -- ajuste por demanda %
  seasonal_adjust_pct DECIMAL(5,2) DEFAULT 0, -- ajuste sazonal %
  max_discount_without_approval DECIMAL(5,2) DEFAULT 15,
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pr_persona (persona_id),
  KEY idx_pr_product (product_id)
);

-- Histórico de preços (para Analytics)
CREATE TABLE price_history (
  id VARCHAR(80) PRIMARY KEY,
  product_id VARCHAR(80) NOT NULL,
  persona_id VARCHAR(60) NOT NULL,
  supplier_price DECIMAL(10,2),              -- preço no fornecedor
  selling_price DECIMAL(10,2),               -- preço de venda
  margin_pct DECIMAL(5,2),                   -- margem real %
  source ENUM('official','unofficial','manual','dynamic'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ph_product (product_id),
  KEY idx_ph_date (created_at)
);

-- Sincronização de estoque/preço
CREATE TABLE sync_log (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  platform ENUM('mercadolivre','shopee','aliexpress','amazon','other'),
  products_checked INT DEFAULT 0,
  products_updated INT DEFAULT 0,
  products_out_of_stock INT DEFAULT 0,
  price_changes INT DEFAULT 0,
  errors INT DEFAULT 0,
  sync_type ENUM('full','incremental','single') DEFAULT 'incremental',
  duration_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sl_persona (persona_id),
  KEY idx_sl_date (created_at)
);

-- Configuração de delivery zones (já existe parcialmente no ERP)
-- Estender: delivery_zones com mais faixas
```

---

## 26. Roadmap de Evolução

### Fase 1 — MVP (6 semanas)

- [ ] Onboarding conversacional com Athena (meta-persona)
- [ ] Loja gerada automaticamente (storefront whitelabel do MetaPersona)
- [ ] Luna atendendo no WhatsApp com commerce tools
- [ ] Catálogo importado do ML (scraping + API)
- [ ] Checkout com Pix (Mercado Pago/PagHiper)
- [ ] Compra manual no fornecedor (sistema sugere, dono confirma)
- [ ] Dashboard básico (vendas, lucro, pedidos)
- [ ] Commerce tools integrados (catalog_search, add_to_cart, finalize_order)
- [ ] Cognitive pipeline (emoção, intenção, churn risk)
- [ ] Conversation stages (greeting → discovery → checkout → retention)

### Fase 2 — Automação (4 semanas)

- [ ] Nexus comprando automaticamente no fornecedor
- [ ] Guardian verificando segurança de transações
- [ ] Oracle com analytics básico
- [ ] Sincronização automática de estoque e preço (cron 15 min)
- [ ] Rastreio automático (captura do fornecedor)
- [ ] Event Bus completo (todos os 15 eventos)
- [ ] Self-optimization (sugestões de melhoria)
- [ ] Program de fidelidade (XP, pontos, cashback)
- [ ] Follow-up automático (abandono, pós-venda, aniversário)

### Fase 3 — Inteligência (4 semanas)

- [ ] Luna com memória emocional (5 camadas)
- [ ] Oracle prevendo demanda e sugerindo reposição
- [ ] Echo gerando conteúdo de marketing automático
- [ ] Precificação dinâmica baseada em demanda + sazonalidade
- [ ] Blueprint System (clonar loja pra qualquer nicho)
- [ ] Recuperação de clientes (broadcast, segmentação)
- [ ] Relatórios financeiros (faturamento, lucro, conversão)
- [ ] Human Override (full/approval/observation)
- [ ] Setup Wizard em 5 minutos (interface web)

### Fase 4 — Escala (contínuo)

- [ ] Marketplace próprio (vários donos na plataforma)
- [ ] Fornecedores internacionais (AliExpress, 1688)
- [ ] App mobile pro dono acompanhar lucro
- [ ] Multi-idioma (espanhol, inglês)
- [ ] Instagram DM como canal de venda
- [ ] API aberta pra integrações de terceiros
- [ ] A/B testing de respostas e estratégias
- [ ] Agent Swarm (múltiplos agentes coordenados por nicho)
- [ ] PWA do storefront (instalar no celular)
- [ ] Integração com Correios (cálculo de frete real)

---

## 27. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| ML/Shopee bloquear conta por automação | Média | Alto | Usar API oficial + termo de uso + conta separada |
| Preço mudar entre compra e venda | Média | Médio | Sync a cada 15min + margem de segurança 5% |
| Produto esgotar após cliente comprar | Média | Alto | 3 fornecedores backup + reembolso rápido + Luna avisa |
| IA alucinar preço ou prazo | Baixa | Alto | Guardian valida ANTES de confirmar + Org Memory como source of truth |
| Cliente perceber que vem do ML | Média | Médio | Recibo customizado, embalagem neutra, rastreio próprio |
| Chargeback/fraude do cliente | Média | Médio | Guardian anti-fraude + risk score + bloqueio por CPF |
| APIs mudarem ou ficarem fora do ar | Média | Médio | Fallback pra scraping + múltiplos fornecedores + sync manual |
| Produto falsificado/irregular | Baixa | Alto | Guardian filtra por reputação 4.5+ + categorias confiáveis |
| IA vender abaixo do custo | Baixa | Crítico | Guardian nunca permite venda abaixo do custo + margem mínima hardcoded |
| Pedido grande que o dono não consegue cobrir | Baixa | Alto | Limite de compra automática + aprovação manual acima de R$500 |

---

## 28. Resumo Executivo

### Em Uma Frase

> **Uma loja que se cria sozinha, se gerencia sozinha, vende sozinha, compra sozinha e evolui sozinha. O dono só precisa dizer o que quer.**

### Em Números (Projeção Conservadora)

```
1 loja, 50 produtos, margem 40%:

Dia 1-30:    3 vendas/dia  → Lucro: R$114/dia    → R$3.420/mês
Dia 31-60:   10 vendas/dia → Lucro: R$380/dia    → R$11.400/mês
Dia 61-90:   20 vendas/dia → Lucro: R$760/dia    → R$22.800/mês

Com 100 lojas na plataforma:
Dia 90+:     R$2.280.000/mês (2% commission + R$297/loja)
```

### Em Conversa

```
Dono: "Quero minha loja"
    
Sistema: 
    ✅ Loja criada em sualoja.com
    ✅ 50 produtos cadastrados (sync em tempo real)
    ✅ Luna atendendo no WhatsApp
    ✅ Nexus comprando automaticamente no fornecedor
    ✅ Guardian protegendo contra fraude
    ✅ Oracle analisando dados e otimizando
    ✅ Echo fazendo marketing
    ✅ Metas configuradas (R$10k/mês)
    ✅ Dashboard online

Dono: "?????"

Sistema: "💰 Resumo do dia: 5 vendas, R$1.247 faturado, 
         R$498 de lucro. Luna converteu 23%. 
         Tô aumentando a margem do Sauvage pra 50% porque 
         tá vendendo muito. Amanhã tem mais."
```

### Em Diferenciação

| Feature | Loja Comum | Chatbot Wrapper | **Loja Autônoma (Este Projeto)** |
|---|---|---|---|
| Setup | Dias/semanas | Horas | **5 minutos** |
| Atendimento | Humano ou chatbot simples | Chatbot sem memória | **IA cognitiva com 5 camadas de memória** |
| Vendas | Depende do vendedor | Não vende | **Vende com cognição, goals e funil** |
| Compra estoque | Manual | Não faz | **Compra automaticamente no fornecedor** |
| Preço | Fixo | Fixo | **Dinâmico (demanda + sazonalidade + concorrência)** |
| Marketing | Manual | Não faz | **Automático (posts, follow-ups, cupons)** |
| Evolução | Não evolui | Não evolui | **Self-optimization (melhora todo dia)** |
| Escala | Uma loja | Uma loja | **Blueprint → clone pra qualquer nicho em minutos** |
| Observabilidade | Básico | Nenhum | **Thought logs, cognitive states, funil, churn prediction** |
| Controle | Total | Nenhum | **Human override (full/approval/observation)** |

---

*Documentação baseada na arquitetura MetaPersona.AI — Cognitive Operating System for AI Agents.*
*Módulos de comércio, fornecedores e precificação são extensões sobre a plataforma existente.*
*Última atualização: 20/05/2026*