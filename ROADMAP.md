# MetaPersona.AI — Roadmap & Plano de Ação

## Visão

Produto SaaS multi-nicho para automação de vendas, atendimento e conhecimento via IA.
Cada instalação = 1 cliente. O mesmo produto serve hamburgueria, clínica médica, escola, escritório de advocacia, loja de roupas, etc.

**Modelo**: Implementação (R$ 2.000–5.000) + mensalidade (R$ 297–997/mês) + usage (API/LLM)

---

## Estado Atual (Jun 2026)

### ✅ Funcionando

- Chat engine com multi-persona e RAG
- WhatsApp bot com Evolution API
- Commerce completo (catálogo, carrinho, endereço, pagamento, pedido, cupom)
- Storefront whitelabel (`/store`)
- Admin panel completo (dashboard, personas, skills, ERP, etc.)
- 62 LLM tools (29 base + 7 language + 23 ERP + 10 commerce)
- Onboarding por persona (loja-hlb = nome + telefone)
- Audio toggle por sessão (natural language detection)
- PIX key e payment methods configuráveis
- catalog_search filtrado por persona_id
- Biblical tools condicionais (só aparecem para persona com fonte bíblica)
- Blog genérico (não mais religioso por default)
- Rate limits por role (guest 20, user 500, premium 1000, admin 9999)

### 🔧 Corrigido Nesta Sessão

- `loja-hlb` persona identity NULL → commerce identity completo
- `seedDefaultCommands` não exportado → exportado
- Commerce system prompt: venda proativa, upsell, cross-sell
- `WHATSAPP_PERSONA_ID` env var → persona default no WhatsApp
- Onboarding loja-hlb: nome + telefone (não interesse/sentimento)
- `session_id` opcional em commerce tools (fallback para context)
- `catalog_search` filtra por `persona_id`
- PIX key, payment methods injetados no commerce prompt
- Audio toggle: detecção natural ("para de mandar áudio") + `/audio` `/texto`
- Biblical tools condicionais por knowledge source
- Blog topics genéricos (não bíblicos)
- `'jesus'` hardcodes → settings dinâmicos em 7 arquivos
- Admin allowlist: store_payment_methods, store_pix_key, store_pix_name, store_bank_info

### ❌ Problemas Conhecidos

- Kokoro TTS não está rodando (fallback para Edge TTS)
- API Embeddings 401 (vector search desabilitado, TF-IDF only)
- WhatsApp `sendList` bug (use text fallback)
- `sendPresence` 400 error (Evolution API v2.3 incompatibilidade)
- Alguns Ollama keys unhealthy (8 de 20)

---

## PLANO DE AÇÃO

---

## FASE 1 — Correções Críticas (1 semana)

### 1.1 WhatsApp Stability
- [ ] Corrigir `sendPresence` 400 error — adaptar para Evolution API v2.3
- [ ] Corrigir `markAsRead` 400 error — campos `fromMe` e `remoteJid` obrigatórios
- [ ] Corrigir `sendList` — implementar formato v2.3 ou manter text fallback limpo
- [ ] Testar fluxo completo de pedido via WhatsApp E2E
- [ ] Lidar com mensagem de mídia (imagem/video) no commerce — customer manda foto do produto

### 1.2 Commerce Flow Robusto
- [ ] Quando LLM falha (tool call malformado), retornar mensagem amigável em vez de "dificuldade técnica"
- [ ] Retry automático quando tool call falha (máx 2 retries)
- [ ] Validar product_id em `commerce_add_to_cart` — se não existe, sugerir similar via `catalog_search`
- [ ] Calcular troco automaticamente quando cliente diz valor (ex: "vou pagar 100" → troco R$28)
- [ ] Horário de funcionamento — commerce prompt deve usar setting `business_hours` da persona
- [ ] Pedido mínimo configurável (setting `store_min_order`)
- [ ] Cancelar pedido via tool `commerce_cancel_order`
- [ ] Status update do pedido via tool `commerce_update_order_status`

### 1.3 Security & Auth
- [ ] Rate limiting por IP para rotas públicas (`/api/store/*`, `/api/chat`)
- [ ] Validação de input em todas as commerce tools (sanitizar quantity, price, address)
- [ ] CORS restritivo para API routes
- [ ] Helmet.js para headers de segurança
- [ ] LGPD: termos de uso e política de privacidade (página)

---

## FASE 2 — Features de Venda (2 semanas)

### 2.1 Programa de Fidelidade + Cashback 🔴 CRÍTICO

**Tabelas novas:**
```sql
CREATE TABLE loyalty_programs (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60),
  name VARCHAR(100),
  type ENUM('points','cashback','stamp_card','tier'),
  points_per_real DECIMAL(5,2) DEFAULT 1,
  cashback_percent DECIMAL(5,2) DEFAULT 5,
  redemption_threshold INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE loyalty_rewards (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60),
  name VARCHAR(100),
  description TEXT,
  points_cost INT,
  product_id VARCHAR(80),
  discount_percent DECIMAL(5,2),
  is_active TINYINT DEFAULT 1
);
```

**LLM Tools:**
- `loyalty_check_balance` — consulta saldo de pontos/cashback
- `loyalty_redeem` — resgata pontos por desconto ou item
- `loyalty_history` — histórico de pontos

**Commerce integration:**
- Ao finalizar pedido → earn pontos automaticamente
- No `commerce_cart_summary` → mostrar pontos disponíveis e valor de desconto
- No `commerce_set_payment` → opção de usar pontos/cashback

**Settings:**
- `loyalty_enabled` — on/off por instalação
- `loyalty_type` — points, cashback, stamp_card
- `loyalty_points_per_real` — pontos por R$1 gasto
- `loyalty_cashback_percent` — % de cashback
- `loyalty_minimum_redemption` — mínimo para resgatar

### 2.2 Recuperador de Clientes 🔴 CRÍTICO

**Templates de automação prontos (seed na DB):**

```javascript
// Inativa 7 dias → mensagem amigável + cupom 10%
{
  trigger_type: 'interval_messages',
  trigger_config: { every_n: 0, days_inactive: 7 },
  action_type: 'message',
  action_config: {
    message: 'Oi {name}! Faz um tempinho... Que tal um {discount} no seu pedido?',
    coupon_code: 'VOLTEI10',
    discount_percent: 10
  }
}

// Inativa 15 dias → oferta especial
// Inativa 30 dias → última chance + cupom 20%
// Após pedido → "Avalie e ganhe pontos"
// Aniversário → cupom especial
```

**Implementação:**
- [ ] `persona_automations` já suporta `interval_messages` e `schedule`
- [ ] Adicionar `days_inactive` no trigger_config do proactive engine
- [ ] Adicionar `event` trigger `on_order_completed` no event bus
- [ ]Criar seeds de automação no startup para personas de comércio
- [ ] LLM tool: `manage_automations` já existe — expandir com templates

### 2.3 Disparos em Massa (Broadcast)

**Tabelas novas:**
```sql
CREATE TABLE broadcasts (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60),
  title VARCHAR(200),
  message TEXT,
  segment ENUM('all','new','inactive_7d','inactive_30d','vip','stagex'),
  status ENUM('draft','scheduled','sending','sent','failed'),
  scheduled_at TIMESTAMP,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE broadcast_logs (
  id VARCHAR(80) PRIMARY KEY,
  broadcast_id VARCHAR(80),
  user_id VARCHAR(60),
  phone VARCHAR(50),
  status ENUM('sent','delivered','read','failed'),
  sent_at TIMESTAMP
);
```

**Funcionalidade:**
- [ ] Admin API: `POST /api/admin/broadcasts` — criar campanha
- [ ] Admin API: `POST /api/admin/broadcasts/:id/send` — disparar
- [ ] Segmentação: todos, novos, inativos X dias, VIP, por tag
- [ ] LLM pode gerar mensagem personalizada por segmento
- [ ] Template variables: `{name}`, `{discount}`, `{last_order}`, `{points}`
- [ ] Rate limiting: respeitar limites do WhatsApp (1 msg/segundo)
- [ ] Dashboard: contadores de enviado/entregue/lido/falhou

### 2.4 Relatórios Financeiros 🔴 CRÍTICO

**Novas APIs:**
```
GET /api/admin/reports/revenue?from=2026-01-01&to=2026-01-31
GET /api/admin/reports/orders?period=today|week|month
GET /api/admin/reports/products?top=10&period=month
GET /api/admin/reports/customers?period=month
GET /api/admin/reports/conversion?period=month
```

**Métricas:**
- Faturamento por período (dia, semana, mês)
- Ticket médio
- Taxa de conversão (chat → pedido)
- Top produtos
- Top clientes
- Pedidos por status
- Receita por método de pagamento
- Churn rate (clientes que não voltam)
- LTV (lifetime value) estimado
- Funil: mensagem → catalog_search → add_to_cart → finalize_order

**Admin UI:**
- [ ] Gráficos simples (Chart.js CDN) para dashboard financeiro
- [ ] Exportar CSV/Excel
- [ ] Comparar períodos (este mês vs mês anterior)

### 2.5 Setup Wizard (5 minutos) 🔴 CRÍTICO

**Fluxo:**
```
1. Marca → nome, tagline, logo URL, cor primária, cor secundária
2. Persona → tipo de negócio (hamburgueria, clínica, escola, ...), tom de voz, horário
3. Produtos → CSV upload ou manual (5-10 produtos iniciais)
4. WhatsApp → conectar Evolution API
5. Pronto → URL do cardápio + bot funcionando
```

**API:**
```
POST /api/setup/brand — salva brand settings
POST /api/setup/persona — cria persona via meta-rag
POST /api/setup/products — bulk insert via CSV/JSON
POST /api/setup/whatsapp — configura Evolution API
GET  /api/setup/status — verifica progresso do setup
```

**Frontend:** Wizard responsivo em `/setup` (página separada)

---

## FASE 3 — Frontend & UX (2 semanas)

### 3.1 Storefront Mobile-First 🟡 IMPORTANTE

**Melhorias no `/store`:**
- [ ] PWA manifest + service worker (offline, installável)
- [ ] Skeleton loading states
- [ ] Animação de adicionar ao carrinho (fly to cart)
- [ ] Busca de produtos com debounce
- [ ] Filtros por categoria (sidebar mobile)
- [ ] Galeria de imagens com zoom
- [ ] Avaliação por estrelas nos produtos
- [ ] Botão WhatsApp flutuante com mensagem pré-formatada
- [ ] Checkout progress bar (endereco → pagamento → confirmação)
- [ ] Order tracking page (`/store/order/:number`)
- [ ] Horário de funcionamento banner (aberto/fechado)
- [ ] Modo escuro automático (preferência do sistema)

### 3.2 Admin Dashboard Financeiro

**Novas seções no admin.html:**
- [ ] Relatórios → gráficos de receita, pedidos, conversão
- [ ] Fidelidade → configuração do programa, saldo de clientes
- [ ] Broadcast → criar campanha, ver status
- [ ] Recuperação → templates de automação, stats de recuperação
- [ ] Setup Wizard → configurar marca, persona, produtos, WhatsApp

### 3.3 Landing Page Dinâmica

**Melhorias em `index.html`:**
- [ ] Seções carregadas da API (`/api/store/sections`) — não hardcoded
- [ ] Hero video support
- [ ] Testimonials section (reviews de clientes reais)
- [ ] Pricing section (planos: básico, profissional, enterprise)
- [ ] CTA dinâmico baseado em settings
- [ ] SEO meta tags dinâmicos
- [ ] Open Graph para compartilhamento social

---

## FASE 4 — Integrações (1 semana)

### 4.1 Gateway de Pagamento Real

- [ ] **Mercado Pago** — checkout transparente (PIX, cartão, boleto)
- [ ] **PagHippo** — alternativa para PIX
- [ ] Webhook de confirmação de pagamento → atualizar order status
- [ ] QR Code PIX dinâmico no WhatsApp (imagem gerada)
- [ ] Link de pagamento no checkout do storefront

**Settings:**
```
payment_gateway — 'mercadopago' | 'paghippo' | 'manual'
mercadopago_access_token
mercadopago_public_key
paghippo_api_key
```

### 4.2 Módulo Motoboy

```sql
CREATE TABLE delivery_drivers (
  id VARCHAR(80) PRIMARY KEY,
  persona_id VARCHAR(60),
  name VARCHAR(100),
  phone VARCHAR(20),
  vehicle_type ENUM('motorcycle','bicycle','car','on_foot'),
  is_active TINYINT DEFAULT 1,
  current_lat DECIMAL(10,8),
  current_lng DECIMAL(11,8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE delivery_assignments (
  id VARCHAR(80) PRIMARY KEY,
  order_id VARCHAR(80),
  driver_id VARCHAR(80),
  status ENUM('assigned','picked_up','on_the_way','delivered','failed'),
  assigned_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP
);
```

- [ ] Atribuir motoboy ao pedido
- [ ] Status tracking: pedido → preparando → saiu p/ entrega → entregue
- [ ] Notificação automática no WhatsApp: "Seu pedido saiu para entrega!"
- [ ] ETA estimado baseado na zona

### 4.3 LGPD Compliance

- [ ] Página `/privacidade` — política de privacidade completa
- [ ] Página `/termos` — termos de uso
- [ ] Cookie consent banner (já existe no storefront)
- [ ] Exportar dados do usuário (direito de portabilidade)
- [ ] Deletar dados do usuário (direito de esquecimento)
- [ ] Consentimento explícito no onboarding

---

## FASE 5 — Multi-Niche Polish (1 semana)

### 5.1 Blueprints por Nicho

**Templates prontos para criar persona em 2 minutos:**

| Nicho | Blueprint ID | Conteúdo |
|---|---|---|
| Hamburgueria/Delivery | `bp_delivery` | Cardápio, delivery, PIX, horário, upsell |
| Clínica Médica | `bp_clinica` | Agendamento, tipos de consulta, convênios |
| Escola/Curso | `bp_escola` | Matrículas, grade curricular, materiais |
| Escritório Advocacia | `bp_advocacia` | Consultas, áreas de atuação, honorários |
| Loja de Roupas | `bp_moda` | Catálogo, tamanhos, trocas, promoções |
| Salão/Barbearia | `bp_salao` | Agendamento, serviços, fidelidade |
| Imobiliária | `bp_imobiliaria` | Imóveis, tours virtuais, financiamento |
| Personal Trainer | `bp_fitness` | Planos, agendamento, evolução |
| Consultor/Vendas | `bp_consultor` | Diagnóstico, proposta, follow-up |

Cada blueprint inclui:
- Identity (tom de voz, regras, onboarding)
- Knowledge sources sugeridos
- Skills/templates de automação
- Commerce config (se aplicável)
- Onboarding steps específicos

### 5.2 Landing Page por Nicho

- `/p/delivery` — demonstração hamburgueria
- `/p/clinica` — demonstração clínica
- `/p/escola` — demonstração escola
- Cada uma com hero, features, pricing, CTA específico

### 5.3 De-hardcoding Final

**Arquivos restantes com `'jesus'` hardcoded:**

| Arquivo | O que mudar |
|---|---|
| `src/persona/config.js` | ✅ Já é fallback — DB sobrescreve |
| `src/whatsapp/bot.js` | Comandos `/versiculo`, `/oracao` → persona-conditional |
| `src/memory/profile.js` | `spiritualJourney` → `personalJourney` |
| `public/js/app.js` | `'jesus'` default → API default, `✝️` emoji → `persona.icon` |
| `public/js/admin.js` | `jesus_ai_token` → `mp_token` |
| `src/i18n/` | `donateVerse` → `donateMessage` genérico |
| `src/db/index.js` | `spiritual_journey` column → manter (compat), alias `personal_journey` |
| `src/mcp/client.js` | `jesus-ai` → `metapersona` |

---

## FASE 6 — Escala & Performance (contínuo)

### 6.1 Performance
- [ ] Redis para cache de personas e settings (elimina DB queries por request)
- [ ] Connection pooling MySQL otimizado
- [ ] Response caching para catalog_search (5 min TTL)
- [ ] CDN para assets estáticos
- [ ] Compression (gzip/brotli) nas responses

### 6.2 Observabilidade
- [ ] Logging estruturado (JSON) com níveis
- [ ] Health check endpoint (`/api/health`)
- [ ] Métricas: tempo de resposta por endpoint, erros, tool usage
- [ ] Alertas: key unhealthy, rate limit, disk space
- [ ] Dashboard de métricas no admin

### 6.3 Multi-tenancy Prep
- [ ] Namespacing de settings por installation_id (futuro)
- [ ] Isolamento de dados por installation_id (futuro)
- [ ] Master admin panel para gerenciar instalações (futuro)

---

## Métricas de Sucesso (KPIs)

| Métrica | Meta (3 meses) | Meta (6 meses) |
|---|---|---|
| Instalações ativas | 10 | 50 |
| Pedidos via WhatsApp/mês | 500 | 5.000 |
| Taxa de conversão (chat → pedido) | 15% | 25% |
| Tempo médio de setup | 30 min | 10 min |
| NPS dos clientes | 40 | 60 |
| Churn mensal | <10% | <5% |

---

## Preço Sugerido

| Plano | Mensal | Incluso |
|---|---|---|
| **Starter** | R$ 297 | 1 persona, 500 pedidos/mês, suporte WhatsApp |
| **Profissional** | R$ 597 | 3 personas, 2.000 pedidos/mês, broadcast, fidelidade |
| **Enterprise** | R$ 997 | Personas ilimitadas, pedidos ilimitados, white-label, API, SLA |

**Implementação**: R$ 2.000–5.000 (setup, configuração, treino de persona)
**Gestão mensal**: R$ 297–997 (inclui suporte, otimização, atualizações)

---

## Ordem de Execução (Prioridade)

```
Semana 1:  FASE 1 (correções críticas)
Semana 2-3: FASE 2 (fidelidade, recuperação, broadcast, relatórios, setup)
Semana 4-5: FASE 3 (storefront, admin, landing)
Semana 6: FASE 4 (pagamento, motoboy, LGPD)
Semana 7: FASE 5 (blueprints, de-hardcoding)
Contínuo: FASE 6 (performance, observabilidade)
```

---

## Arquitetura Final (Target)

```
┌─────────────────────────────────────────────────────────────┐
│                    MetaPersona.AI                             │
├─────────────────────────────────────────────────────────────┤
│  WhatsApp Bot  │  Telegram Bot  │  Instagram  │  Web Chat    │
├─────────────────────────────────────────────────────────────┤
│                    Chat Engine (LLM)                         │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │Commerce │ │ Knowledge│ │ Cognitive│ │  Automations │  │
│  │  Tools  │ │  (RAG)   │ │ Pipeline │ │  (Event Bus) │  │
│  └─────────┘ └──────────┘ └──────────┘ └──────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ERP  │  CRM  │  Loyalty  │  Broadcast │  Reports         │
├─────────────────────────────────────────────────────────────┤
│  MySQL 8.4  │  Redis (cache)  │  BullMQ (jobs)            │
├─────────────────────────────────────────────────────────────┤
│  Storefront (PWA)  │  Admin Panel  │  Setup Wizard          │
│  Landing (dynamic) │  Blog  │  API (public + admin)       │
└─────────────────────────────────────────────────────────────┘
```

---

*Última atualização: 20/05/2026*
*Próxima revisão: a cada sprint (1 semana)*