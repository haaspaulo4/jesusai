# MetaPersona.AI — Meta Framework Documentation

> **The AI-Native Business Operating System**
> 
> Create, deploy, manage, and evolve AI agents through conversation.
> From chatbot to cognitive operational layer.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   META-PERSONA                       │
│         (Architect · Strategist · Orchestrator)      │
│                                                      │
│  Creates agents · Onboards businesses · Evolves      │
│  Manages goals · Coordinates · Self-reflects        │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────┴────────┐
              │  Agent Runtime   │
              │  (per persona)  │
              └────────┬────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
┌───┴───┐      ┌──────┴──────┐    ┌─────┴─────┐
│Persona │      │  Knowledge  │    │   Action   │
│ Layer  │      │    (RAG)    │    │   Layer    │
│        │      │ Intent-aware│    │  (Skills)  │
└───┬───┘      │ Emotion-aware│    └─────┬─────┘
    │          │ Goal-aware   │          │
    │          └──────┬──────┘          │
    │                 │                  │
┌───┴─────────────────┴──────────────────┴───┐
│              Memory Architecture             │
│  Short-term · Long-term · Emotional ·        │
│  Strategic · Behavioral                      │
└───┬─────────────────┬──────────────────┬───┘
    │                 │                  │
┌───┴───┐      ┌─────┴──────┐    ┌─────┴─────┐
│ Goals  │      │  Workflow   │    │  Events    │
│ Stack  │      │  Engine     │    │  & Proactive│
│        │      │  (State     │    │  Intelligence│
│ Global │      │   Machine)  │    │             │
│ Session│      └────────────┘    └─────────────┘
│ Conv.  │
│ Emot.  │
│ Immed.  │
└────────┘
```

---

## 2. Core Architectural Layers

### Layer 1: Meta-Persona (The Architect)

**Role**: Creates, configures, trains, evolves, and orchestrates agents.

**What it does**:
- Onboards businesses through intelligent conversation
- Extracts business context (niche, audience, tone, goals, restrictions)
- Compiles complete agent configurations (Persona Compiler)
- Creates skills, connects knowledge sources, sets up workflows
- Monitors agent performance and suggests optimizations
- Manages agent lifecycle (creation → training → deploy → optimization → scaling)

**How it works**:
```
User: "Quero uma IA para minha clínica odontológica"
  ↓
Meta-Persona Onboarding:
  1. What type of business? → dental clinic
  2. Name? → Sorriso Saúdo
  3. Specialties? → implants, whitening, braces
  4. Target audience? → adults 25-45, families
  5. Tone? → warm, professional, reassuring
  6. Main goal? → increase appointments
  7. Restrictions? → no diagnosis, suggest in-person evaluation
  8. Products/Services? → [user uploads PDFs with pricing]
  9. Team? → Dr. João (implants), Dra. Ana (braces)
  10. Communication channels? → WhatsApp, Instagram, Web
  ↓
Persona Compiler Output:
  - persona.json (identity, rules, tone, voice)
  - business_context.json (products, services, pricing, team)
  - sales_strategy.json (funnel stages, goals, CTAs)
  - compliance_rules.json (restrictions, permissions)
  - rag_index (knowledge from uploaded materials)
  - skills (schedule_appointment, send_quote, follow_up, etc.)
  - workflows (new_lead → interested → pre-booking → booked → reminder → completed → follow-up)
  - automations (daily follow-ups, birthday messages, recovery campaigns)
```

**Implementation**: `src/persona/meta-rag.js` — `getMetaPersona()` returns the orchestrator persona with all 20 tools enabled.

---

### Layer 2: Persona Layer (Identity + Behavior)

**Purpose**: Each agent has a distinct personality, tone, rules, and behavioral genome.

**Persona Genome** — The DNA of each agent:
```json
{
  "id": "sorriso-saudo",
  "name": "Sorriso Saudável",
  "identity": {
    "pt-BR": {
      "core": "...(200+ words defining who they are)",
      "rules": "...(12+ invariable rules)"
    }
  },
  "genome": {
    "tone": "warm_professional",
    "assertiveness": 0.6,
    "empathy": 0.9,
    "sales_aggressiveness": 0.3,
    "humor": 0.2,
    "verbosity": 0.5,
    "proactivity": 0.7,
    "formality": 0.7
  },
  "compliance_permissions": {
    "can_diagnose": false,
    "can_offer_discount": false,
    "can_schedule": true,
    "can_cancel_appointment": true,
    "can_refund": false,
    "can_send_email": true,
    "can_create_task": true,
    "can_switch_persona": false
  },
  "conversation_stages": [
    "new_lead",
    "interested",
    "considering",
    "pre_booking",
    "booked",
    "reminder_sent",
    "completed",
    "follow_up",
    "reactivation"
  ],
  "default_stage": "new_lead"
}
```

**Implementation**: Stored in `personas` table. Genome and permissions extend the current schema.

---

### Layer 3: Knowledge Layer (RAG)

**Current**: TF-IDF vector search across multiple sources.

**Evolution — Context-Aware Retrieval**:
```
Query: "quanto custa implante?"
  ↓
Intent Analysis: pricing inquiry (not clinical question)
Emotion: anxious, cost-sensitive
Goal: convert to appointment → needs reassuring + pricing info
Stage: considering → needs social proof + CTA
  ↓
Search Parameters:
  - intent_weight: 2.0 (pricing content)
  - emotion_weight: 1.5 (reassuring content)
  - goal_weight: 1.0 (conversion content)
  - stage_filter: "considering"
  ↓
Results PRIORITIZE:
  1. Pricing info with payment options
  2. Testimonials about implant experience
  3. Reassuring content about safety
  (NOT: technical clinical papers — wrong intent)
```

**DB Extension — `persona_knowledge_groups`**:
```sql
CREATE TABLE IF NOT EXISTS persona_knowledge_groups (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  intent_tags JSON,        -- ["pricing", "clinical", "reassurance", "testimonials"]
  emotion_tags JSON,       -- ["anxious", "curious", "urgent"]
  goal_tags JSON,          -- ["conversion", "information", "support"]
  stage_filter JSON,      -- ["new_lead", "considering", "booked"]
  source_ids JSON,         -- ["implant-guide", "pricing-table", "testimonials"]
  priority INT DEFAULT 100,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_kg_persona (persona_id)
);
```

**Implementation**: `src/knowledge/store.js` — `searchContextAware(query, personaId, intent, emotion, goal, stage)`

---

### Layer 4: Action Layer (Skills + Tool Execution)

**Current**: 20 LLM tools + skills CRUD.

**Evolution — Skill Compiler**:
```
Meta-Persona receives:
  "Preciso que a IA agende consultas e envie confirmação por WhatsApp"
    ↓
Skill Compiler creates:
  {
    "id": "schedule_appointment",
    "name": "Agendar Consulta",
    "type": "workflow",
    "prompt": "You are scheduling a dental appointment. Collect: patient name, preferred date/time, treatment type, insurance. Use manage_calendar to book. Use manage_contacts to update CRM stage. Confirm via WhatsApp.",
    "parameters": {
      "required": ["patient_name", "date", "treatment"],
      "optional": ["insurance", "phone", "notes"]
    },
    "output_format": "json",
    "permissions": ["calendar.create", "contacts.update", "whatsapp.send"],
    "triggers": ["user_requests_appointment", "conversation_stage:pre_booking"],
    "success_metric": "appointment_booked",
    "fallback_action": "handoff_human"
  }
```

**Skill Types**:
| Type | Description | Examples |
|------|-------------|----------|
| `action` | Single atomic action | schedule_appointment, cancel_booking |
| `generator` | Content generation | create_blog_post, generate_quote |
| `communication` | Message to user/third party | send_whatsapp, email_followup |
| `analysis` | Analyze data and return insights | analyze_conversion, sentiment_analysis |
| `workflow` | Multi-step orchestrated process | full_onboarding, lead_recovery, upsell_funnel |

**Implementation**: `src/skills/index.js` — `createSkill()`, `invokeSkill()`, `getSkillsForPersona()`

---

### Layer 5: Goal Stack (Strategic Intelligence)

**Architecture**:
```
┌─────────────────────────────────────────────┐
│                GLOBAL GOAL                   │
│   "Aumentar conversão de leads em 30%"       │
├─────────────────────────────────────────────┤
│              SESSION GOAL                     │
│   "Agendar consulta de implante"             │
├─────────────────────────────────────────────┤
│            CONVERSION GOAL                    │
│   "Converter esta interação em agendamento"  │
├─────────────────────────────────────────────┤
│           EMOTIONAL GOAL                      │
│   "Gerar confiança e reduzir ansiedade"      │
├─────────────────────────────────────────────┤
│           IMMEDIATE GOAL                      │
│   "Responder dúvida sobre preço"              │
└─────────────────────────────────────────────┘
```

**DB Schema — `persona_goals`**:
```sql
CREATE TABLE IF NOT EXISTS persona_goals (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  owner_id VARCHAR(60) NOT NULL,
  goal_type ENUM('global', 'session', 'conversion', 'emotional', 'immediate') NOT NULL,
  description TEXT NOT NULL,
  target_metric VARCHAR(255),
  target_value DECIMAL(10,2) DEFAULT NULL,
  current_value DECIMAL(10,2) DEFAULT NULL,
  priority INT DEFAULT 50,
  is_active TINYINT(1) DEFAULT 1,
  parent_goal_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_goals_persona (persona_id),
  KEY idx_goals_owner (owner_id),
  KEY idx_goals_type (goal_type)
);
```

**LLM Context Injection**:
```
[GOAL STACK]
Global: Increase lead conversion by 30%
Session: Schedule an implant consultation
Conversion: Convert this interaction into a booked appointment
Emotional: Build trust and reduce anxiety about dental procedures
Immediate: Address pricing question about implants
```

**How it changes responses**:
- Without goals: "O implante custa entre R$3.000 e R$8.000."
- With goals: "O implante dental varia de R$3.000 a R$8.000 dependendo do caso. Posso agendar uma avaliação com o Dr. João — ele avalia seu caso sem compromisso e apresenta o melhor plano de pagamento. Qual horário funciona melhor pra você?"

---

### Layer 6: Memory Architecture (Five Layers)

```
┌───────────────────────────────────────────────────────┐
│ Layer 1: SHORT-TERM MEMORY                             │
│   Last N messages. Session context. Emotional state.   │
│   TTL: Current session                                 │
│   Storage: persona_messages + sessions                 │
├───────────────────────────────────────────────────────┤
│ Layer 2: LONG-TERM MEMORY                              │
│   User profile, preferences, history across sessions.   │
│   TTL: Permanent                                       │
│   Storage: profiles                                     │
├───────────────────────────────────────────────────────┤
│ Layer 3: EMOTIONAL MEMORY                              │
│   User's emotional patterns, triggers, best responses.  │
│   "Responds better to short messages at night"         │
│   TTL: Evolving                                        │
│   Storage: persona_emotional_profiles (NEW)             │
├───────────────────────────────────────────────────────┤
│ Layer 4: STRATEGIC MEMORY                              │
│   What converts best. Best approaches by segment.       │
│   "Audios convert 40% more for this persona"            │
│   TTL: Permanent + auto-updated                        │
│   Storage: persona_strategic_insights (NEW)             │
├───────────────────────────────────────────────────────┤
│ Layer 5: ORGANIZATIONAL MEMORY                         │
│   Company knowledge, past campaigns, team info,         │
│   performance data, operational decisions.               │
│   TTL: Permanent + company-wide                         │
│   Storage: persona_org_memory (NEW)                     │
└───────────────────────────────────────────────────────┘
```

**New DB Tables**:
```sql
CREATE TABLE IF NOT EXISTS persona_emotional_profiles (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  user_id VARCHAR(60) NOT NULL,
  communication_preferences JSON,    -- {short_messages: true, prefers_audio: true, best_time: "evening"}
  emotional_patterns JSON,           -- {anxiety_triggers: ["price", "pain"], trust_builders: ["testimonials", "guarantee"]}
  response_effectiveness JSON,      -- {short_responses: 0.82, long_responses: 0.61, audio_responses: 0.91}
  conversion_patterns JSON,         -- {best_cta: "soft", best_timing: "after_3_messages", best_channel: "whatsapp"}
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ep_persona_user (persona_id, user_id)
);

CREATE TABLE IF NOT EXISTS persona_strategic_insights (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  insight_type VARCHAR(50) NOT NULL,   -- conversion, engagement, retention, channel, content_type
  insight_data JSON NOT NULL,           -- {metric, value, context, recommendation}
  confidence DECIMAL(3,2) DEFAULT 0.50,
  source VARCHAR(50),                    -- auto_detected, manual, a_b_test
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_si_persona_type (persona_id, insight_type)
);

CREATE TABLE IF NOT EXISTS persona_org_memory (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  category VARCHAR(50) NOT NULL,       -- product, service, team, pricing, policy, campaign, performance
  key_name VARCHAR(255) NOT NULL,
  value JSON NOT NULL,
  metadata JSON,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY_idx_om_persona_cat (persona_id, category)
);
```

---

### Layer 7: Conversation State Machine

**Purpose**: Know WHERE the user is in the business funnel, and WHAT the next best action is.

```
┌──────────┐    ┌───────────┐    ┌────────────┐    ┌────────────┐    ┌──────────┐
│ NEW_LEAD │───→│ INTERESTED │───→│ CONSIDERING│───→│ PRE_BOOKING│───→│  BOOKED   │
└──────────┘    └───────────┘    └────────────┘    └────────────┘    └────┬─────┘
      │                │                 │                    │                  │
      │                │                 │                    │          ┌──────▼──────┐
      │                │                 │                    │          │ REMINDER_SENT│
      │                │                 │                    │          └──────┬──────┘
      │                │                 │                    │                  │
      │                │                 │                    │          ┌──────▼──────┐
      │                │                 │                    │          │  COMPLETED   │
      │                │                 │                    │          └──────┬──────┘
      │                │                 │                    │                  │
      │                │                 │                    │          ┌──────▼──────┐
      │                │                 │                    │          │  FOLLOW_UP   │
      │                │                 │                    │          └──────┬──────┘
      │                │                 │                    │                  │
      │                │                 │                    └──────────┌──────▼──────┐
      │                │                 │                               │  REACTIVATION │
      │          ┌─────▼──────┐                                         └──────────────┘
      │          │  LOST_LEAD  │
      │          └─────────────┘
      │
      └──────→ (auto-triggered follow-ups at each stage)
```

**Each stage has**:
- **Goal**: What we want to achieve
- **Best approach**: Tone, content type, CTA style
- **Timeout rules**: When to follow up, how many times
- **Escalation rules**: When to hand off to human
- **Transition triggers**: What moves user to next stage

**DB Schema — `persona_conversation_stages`**:
```sql
CREATE TABLE IF NOT EXISTS persona_conversation_stages (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  stage_key VARCHAR(50) NOT NULL,
  stage_order INT DEFAULT 0,
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  name_es VARCHAR(255),
  description TEXT,
  goal TEXT,
  best_approach JSON,         -- {tone: "warm", content_type: "short", cta_style: "soft"}
  follow_up_rules JSON,       -- {after_minutes: 1440, max_attempts: 3, escalation: "human"}
  transition_triggers JSON,   -- {keywords: ["agendar", "consulta"], actions: ["appointment_requested"]}
  is_active TINYINT(1) DEFAULT 1,
  KEY idx_cs_persona (persona_id)
);

CREATE TABLE IF NOT EXISTS persona_user_stages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  user_id VARCHAR(60) NOT NULL,
  current_stage VARCHAR(50) NOT NULL,
  stage_entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  stage_data JSON,
  conversion_probability DECIMAL(3,2) DEFAULT 0.50,
  KEY idx_us_persona_user (persona_id, user_id),
  KEY idx_us_stage (current_stage)
);
```

---

### Layer 8: Proactive Intelligence (Event-Driven + Initiatives)

**Current**: `checkAndRunAutomations()` runs on every message.

**Evolution — Event Bus**:
```
Events generated:
  ├── appointment_created
  ├── appointment_cancelled
  ├── lead_cold (no response in N hours)
  ├── payment_received
  ├── payment_failed
  ├── user_birthday
  ├── conversion_completed
  ├── stage_changed
  ├── goal_achieved
  └── anomaly_detected

Each event triggers:
  ├── Evaluate rules
  ├── Execute actions (message, create_task, send_email, etc.)
  ├── Update state
  └── Record insight
```

**Proactive Logic**:
```javascript
// Runs on schedule (every 30 min) or on events
async function proactiveCycle() {
  // 1. Check cold leads
  const coldLeads = await findColdLeads({ hours: 24 });
  for (const lead of coldLeads) {
    await executeProactiveAction({
      type: 'follow_up',
      user_id: lead.user_id,
      stage: lead.current_stage,
      message: generateFollowUpMessage(lead)
    });
  }

  // 2. Check upcoming appointments
  const upcoming = await getUpcomingEvents({ hours: 24 });
  for (const event of upcoming) {
    await executeProactiveAction({
      type: 'reminder',
      user_id: event.owner_id,
      event: event
    });
  }

  // 3. Check abandoned carts/bookings
  const abandoned = await findAbandonedBookings();
  for (const booking of abandoned) {
    await executeProactiveAction({
      type: 'recovery',
      user_id: booking.user_id
    });
  }

  // 4. Self-reflection on recent conversations
  const insights = await analyzeRecentConversations();
  if (insights.improvements) {
    await createStrategicInsights(insights);
  }
}
```

**New DB Table — `persona_events`**:
```sql
CREATE TABLE IF NOT EXISTS persona_events (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  user_id VARCHAR(60) DEFAULT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSON,
  processed TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_events_type (event_type),
  KEY idx_events_persona_user (persona_id, user_id),
  KEY idx_events_processed (processed)
);
```

---

### Layer 9: Permission & Compliance Layer

**Purpose**: What the agent CAN and CANNOT do. Critical for enterprise adoption.

```json
{
  "permissions": {
    "can_diagnose": false,
    "can_offer_discount": false,
    "can_cancel_appointment": true,
    "can_reschedule": true,
    "can_refund": false,
    "can_send_email": true,
    "can_send_whatsapp": true,
    "can_create_task": true,
    "can_access_patient_data": true,
    "can_switch_persona": false,
    "can_create_new_persona": false,
    "can_modify_pricing": false,
    "max_discount_percent": 0,
    "requires_human_approval_above": 500,
    "data_retention_days": 365,
    "gdpr_compliant": true,
    "hipaa_compliant": false
  },
  "compliance_rules": [
    "NEVER provide definitive medical diagnosis",
    "ALWAYS suggest in-person evaluation for clinical questions",
    "NEVER share patient data between personas",
    "ALWAYS include disclaimer in health-related responses",
    "REQUIRE human approval for appointments above R$5000"
  ]
}
```

**DB Extension**:
```sql
ALTER TABLE personas ADD COLUMN permissions JSON DEFAULT NULL;
ALTER TABLE personas ADD COLUMN compliance_rules JSON DEFAULT NULL;
ALTER TABLE personas ADD COLUMN genome JSON DEFAULT NULL;
ALTER TABLE personas ADD COLUMN conversation_stages JSON DEFAULT NULL;
ALTER TABLE personas ADD COLUMN business_context JSON DEFAULT NULL;
```

---

### Layer 10: Self-Reflection & Optimization

**Purpose**: The agent evaluates its own performance and adapts.

```javascript
async function selfReflect(personaId, sessionId, userId) {
  // 1. Get recent conversation
  const recentMessages = await getHistory(personaId, userId, 20);
  
  // 2. Analyze effectiveness
  const analysis = await callLLM([
    { role: 'system', content: `Analyze this conversation for effectiveness.
Rate: engagement (0-1), conversion_probability (0-1), tone_match (0-1), goal_progress (0-1).
Suggest improvements: tone changes, response length, CTA style, follow-up timing.` },
    { role: 'user', content: JSON.stringify(recentMessages) }
  ]);
  
  // 3. Store insights
  await createStrategicInsight({
    persona_id: personaId,
    insight_type: 'self_reflection',
    insight_data: analysis,
    confidence: analysis.confidence || 0.5,
    source: 'auto_detected'
  });
  
  // 4. If confidence is high enough, auto-adjust
  if (analysis.confidence > 0.7 && analysis.suggested_adjustments) {
    await applyAdjustments(personaId, analysis.suggested_adjustments);
  }
}
```

---

## 3. Agent Lifecycle

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│  CREATE   │────→│  TRAIN    │────→│   TEST    │────→│  DEPLOY   │
│           │     │           │     │           │     │           │
│ Meta-P.   │     │ Upload    │     │ Simulate  │     │ Live      │
│ creates   │     │ knowledge │     │ scenarios │     │ channels  │
│ persona   │     │ Set rules │     │ Fix issues │     │           │
└───────────┘     └───────────┘     └───────────┘     └─────┬─────┘
                                                            │
                ┌───────────────────────────────────────────┘
                │
        ┌───────▼───────┐     ┌───────────┐     ┌───────────┐
        │   MONITOR      │────→│ OPTIMIZE   │────→│  SCALE     │
        │               │     │           │     │           │
        │ Dashboards   │     │ Self-refl. │     │ Clone     │
        │ Metrics       │     │ A/B tests  │     │ Blueprints│
        │ Alerts        │     │ Auto-adjust│     │ Marketplace│
        └───────────────┘     └───────────┘     └───────────┘
```

### Stage 1: CREATE (Meta-Persona Onboarding)

**Flow**:
1. User says: "I want an AI for my dental clinic"
2. Meta-persona activates structured onboarding
3. Collects: business type, name, specialties, tone, goals, restrictions, audience, channels, pricing
4. Uses `create_persona` tool + business context
5. Creates: persona + knowledge sources + skills + workflows + automations

**Onboarding questions** (stored in `onboarding_steps`, configurable per persona):
```sql
INSERT INTO onboarding_steps (step_key, step_order, question, question_en, question_es, field, field_type, choices, required, is_active) VALUES
('business_type', 1, 'Qual o tipo do seu negócio?', 'What type of business?', '¿Qué tipo de negocio?', 'business_type', 'choice', '["saúde","educação","vendas","serviços","jurídico","fitness","outro"]', 1, 1),
('business_name', 2, 'Qual o nome do negócio?', 'Business name?', '¿Nombre del negocio?', 'business_name', 'text', NULL, 1, 1),
('tone', 3, 'Qual tom de voz?', 'What tone?', '¿Qué tono?', 'tone', 'choice', '["acolhedor e profissional","formal e técnico","descontraído e amigável","persuasivo e direto"]', 1, 1),
('main_goal', 4, 'Qual o objetivo principal?', 'Main goal?', '¿Objetivo principal?', 'main_goal', 'choice', '["agendamentos","vendas","suporte","lead_qualification","engajamento"]', 1, 1),
('restrictions', 5, 'Quais restrições?', 'Restrictions?', '¿Restricciones?', 'restrictions', 'text', NULL, 0, 1),
('target_audience', 6, 'Quem é o público-alvo?', 'Target audience?', '¿Público objetivo?', 'target_audience', 'text', NULL, 0, 1),
('channels', 7, 'Quais canais?', 'Channels?', '¿Canales?', 'channels', 'choice', '["whatsapp","telegram","web","instagram"]', 1, 1);
```

### Stage 2: TRAIN (Knowledge Upload)

**Flow**:
1. User uploads: PDFs, DOCX, images, audio, text, JSON, URLs
2. System processes via `src/knowledge/ingester.js` multimodal ingestion
3. TF-IDF index built per source
4. Sources linked to persona via `knowledge_sources` array
5. Meta-persona verifies coverage and suggests gaps

### Stage 3: TEST (Simulation)

**Flow**:
1. Meta-persona simulates scenarios:
   - Angry customer
   - Indecisive lead
   - Technical question
   - Urgency
   - Objection handling
2. Evaluates responses against goals
3. Suggests adjustments if needed
4. Auto-corrects rules/prompt if confidence > 80%

### Stage 4: DEPLOY (Go Live)

**Flow**:
1. Connect to channels (WhatsApp, Telegram, Web)
2. Set conversation stages
3. Configure automations (follow-ups, reminders, recovery)
4. Enable proactive intelligence
5. Start monitoring dashboards

### Stage 5: MONITOR (Ongoing)

- Dashboard shows: engagement, conversion_probability, sentiment, stage distribution, top objections, response effectiveness
- Alerts on: cold leads, missed follow-ups, low conversion, anomalies

### Stage 6: OPTIMIZE (Self-Reflection)

- Self-reflection loop runs every N messages
- Compares response effectiveness across approaches
- A/B tests tone, content type, CTA style
- Auto-adjusts if confidence is high enough
- Records insights in `persona_strategic_insights`

### Stage 7: SCALE (Blueprint & Marketplace)

- Save successful agent configurations as Blueprints
- Clone blueprint for similar businesses
- Marketplace: publish, discover, install pre-made agents
- Agent Economy: rate, review, revenue sharing

---

## 4. Internal Monologue (Cognitive Pipeline)

**Current**: Input → LLM → Response

**Target**: Input → Analysis → Planning → Action → Response

```
User Input: "quanto custa implante?"
     │
     ▼
┌──────────────────────────────────────────────────────────┐
│ 1. EMOTIONAL ANALYSIS                                    │
│    Detect: anxious, cost-sensitive, comparing options      │
│    Confidence: 0.85                                       │
├──────────────────────────────────────────────────────────┤
│ 2. INTENT ANALYSIS                                        │
│    Primary: pricing inquiry                               │
│    Secondary: exploring options                           │
│    Implicit: might book if reassured                      │
├──────────────────────────────────────────────────────────┤
│ 3. CONTEXT RETRIEVAL                                      │
│    User profile: first visit, no history                  │
│    Stage: new_lead → considering                          │
│    Goal: convert to appointment                          │
│    Knowledge: implant pricing, payment plans, testimonials│
├──────────────────────────────────────────────────────────┤
│ 4. STRATEGIC PLANNING                                    │
│    Emotional goal: reduce anxiety about cost              │
│    Conversion goal: move from considering to pre-booking  │
│    Immediate goal: answer pricing question + CTA          │
│    Best approach: warm tone, transparent pricing,        │
│                    payment options, social proof, soft CTA │
├──────────────────────────────────────────────────────────┤
│ 5. ACTION DECISION                                       │
│    Actions:                                               │
│    - Provide pricing range (from knowledge)               │
│    - Mention payment plans (from business context)        │
│    - Offer free evaluation (from compliance rules)       │
│    - Update CRM stage: new_lead → considering             │
│    - Create follow-up reminder                            │
├──────────────────────────────────────────────────────────┤
│ 6. RESPONSE GENERATION                                   │
│    "O implante dental varia de R$3.000 a R$8.000         │
│     dependendo do caso. Temos planos de pagamento         │
│     em até 12x sem juros. Posso agendar uma avaliação    │
│     gratuita com o Dr. João — ele avalia seu caso e      │
│     apresenta a melhor opção. Qual horário funciona?"      │
├──────────────────────────────────────────────────────────┤
│ 7. POST-RESPONSE                                         │
│    - Update user_stage: considering                       │
│    - Set follow-up: 24h if no response                   │
│    - Update conversion_probability: 0.35 → 0.55          │
│    - Create insight: "Pricing inquiry → short response   │
│      with CTA converts better"                           │
└──────────────────────────────────────────────────────────┘
```

**Implementation approach**: Extend `processMessage` in `src/chat/engine.js` with a cognitive pipeline that enriches the system prompt with emotional analysis, intent, stage, goals, and strategic direction BEFORE the LLM call.

---

## 5. Tool-Aware RAG (Intent-Driven Retrieval)

**Current**: `searchMultiSource(query, sourceIds, topK)` — pure keyword/semantic search.

**Evolution**: `searchContextAware(query, personaId, { intent, emotion, goal, stage })`:
```javascript
async function searchContextAware(query, personaId, context) {
  // 1. Base TF-IDF search
  const baseResults = searchMultiSource(query, personaSources, topK * 2);
  
  // 2. Re-rank based on context
  const ranked = baseResults.map(result => {
    let score = 1 / (1 + result.distance);
    
    // Boost pricing content when intent is pricing
    if (context.intent === 'pricing' && /preço|custo|valor|plano/i.test(result.text)) {
      score *= 2.0;
    }
    
    // Boost reassurance content when emotion is anxious
    if (context.emotion === 'anxious' && /segurança|garantia|cuidado/i.test(result.text)) {
      score *= 1.5;
    }
    
    // Boost conversion content when goal is appointment
    if (context.goal === 'appointment' && /agendar|consulta|avaliação/i.test(result.text)) {
      score *= 1.8;
    }
    
    return { ...result, contextScore: score };
  });
  
  // 3. Return top-K by context score
  return ranked.sort((a, b) => b.contextScore - a.contextScore).slice(0, topK);
}
```

---

## 6. Agent Swarm (Internal Multi-Agent)

**Current**: Single persona responds per session.

**Evolution**: Coordinator agent dispatches to specialized sub-agents.

```
User: "Quero agendar mas tô com medo do preço"
     │
     ▼
┌──────────────────────────────────────┐
│         Coordinator (Meta-Persona)  │
│  Routes to appropriate sub-agent     │
└──────────────┬───────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Emotion │ │ Sales  │ │Schedule│
│ Agent  │ │ Agent  │ │ Agent  │
│        │ │        │ │        │
│Reducing│ │Pricing │ │Booking │
│anxiety │ │guidance│ │process │
└────────┘ └────────┘ └────────┘
    │          │          │
    └──────────┴──────────┘
               │
               ▼
    Combined response with:
    - Emotional reassurance
    - Transparent pricing
    - Clear scheduling CTA
```

**Implementation**: Same LLM call with multi-agent system prompt that includes role routing logic. No need for separate LLM calls — the coordinator decides routing and combines outputs.

---

## 7. Human + AI Hybrid Runtime

**Escalation Rules**:
```json
{
  "escalation_triggers": [
    {
      "condition": "user_anger_score > 0.8",
      "action": "notify_human",
      "message": "Cliente aparenta estar irritado. Sugerido: intervenção humana."
    },
    {
      "condition": "confidence_score < 0.3",
      "action": "handoff_human",
      "message": "Não tenho confiança suficiente para responder. Transferindo para atendente."
    },
    {
      "condition": "transaction_value > 5000",
      "action": "require_human_approval",
      "message": "Agendamento acima de R$5.000 requer aprovação humana."
    },
    {
      "condition": "medical_question == true",
      "action": "add_disclaimer + suggest_eval",
      "message": "Posso ajudar com informações, mas para diagnóstico preciso é necessário avaliação presencial."
    }
  ]
}
```

---

## 8. Operational Context Layer (Company Graph)

**Purpose**: The agent knows the business it represents — not just Q&A, but operations.

```sql
CREATE TABLE IF NOT EXISTS persona_org_memory (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  category VARCHAR(50) NOT NULL,       -- product, service, team, pricing, policy, campaign, faq
  key_name VARCHAR(255) NOT NULL,
  value JSON NOT NULL,
  metadata JSON,                        -- source, confidence, last_verified
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_om_persona_cat (persona_id, category)
);
```

**Example entries**:
```json
// Products/Services
{ "category": "service", "key_name": "implante_dental", "value": {
  "name": "Implante Dental", "price_range": [3000, 8000], 
  "duration": "60-90min", "recovery": "3-7 dias",
  "contraindications": ["diabetes_nao_controlada", "osteoporose_severa"],
  "upsell": ["provisória_imediata", "coroa_personalizada"],
  "faq": [" dói?", "quanto tempo dura?", "tem garantia?"]
}}

// Team
{ "category": "team", "key_name": "dr_joao", "value": {
  "name": "Dr. João Silva", "specialty": "Implantodontia",
  "availability": { "days": ["seg", "ter", "qua", "qui"], "hours": "8h-18h" },
  "bio": "15 anos de experiência, especialista em implantes"
}}

// Policies
{ "category": "policy", "key_name": "cancelamento", "value": {
  "rule": "Cancelamento com 24h de antecedência sem custos",
  "no_show_fee": 150, "reschedule_free": true
}}
```

---

## 9. Metrics & Dashboard (Cognitive Metrics)

```json
{
  "emotional_intelligence": {
    "avg_sentiment": 0.72,
    "trending": "improving",
    "common_emotions": ["anxious", "curious", "hopeful"]
  },
  "conversion_funnel": {
    "new_lead": 150,
    "interested": 89,
    "considering": 52,
    "pre_booking": 28,
    "booked": 18,
    "completed": 14,
    "conversion_rate": "9.3%"
  },
  "lead_temperature": {
    "hot": 12,
    "warm": 35,
    "cold": 78,
    "avg_temperature": 0.58
  },
  "operational_metrics": {
    "appointments_today": 8,
    "cancellations_this_week": 3,
    "no_shows": 1,
    "revenue_projected": 45000
  },
  "agent_performance": {
    "avg_response_time": "1.2s",
    "satisfaction_score": 4.2,
    "resolution_rate": "78%",
    "handoff_rate": "12%"
  }
}
```

---

## 10. Blueprint & Marketplace System

**Blueprint = Cloneable Agent Configuration**

```json
{
  "blueprint_id": "dental_clinic_premium",
  "name": "Clínica Odontológica Premium",
  "category": "saúde",
  "description": "Agente completo para clínicas odontológicas com agendamento, CRM e follow-up",
  "persona_genome": { "...genome..." },
  "default_skills": ["schedule_appointment", "send_confirmation", "follow_up", "handle_objections"],
  "default_automations": ["daily_reminder", "birthday_message", "recovery_campaign"],
  "default_stages": ["new_lead", "interested", "considering", "pre_booking", "booked", "completed"],
  "default_compliance": { "can_diagnose": false, "can_schedule": true },
  "popularity": 847,
  "rating": 4.8,
  "price": "free"
}
```

**DB Schema**:
```sql
CREATE TABLE IF NOT EXISTS persona_blueprints (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50),
  description TEXT,
  config JSON NOT NULL,           -- full configuration (genome, skills, stages, etc.)
  is_public TINYINT(1) DEFAULT 0,
  popularity INT DEFAULT 0,
  rating DECIMAL(2,1) DEFAULT 0.0,
  created_by VARCHAR(60),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_bp_category (category),
  KEY idx_bp_public (is_public, popularity)
);
```

---

## 11. Implementation Priority

### Phase 1 (NOW — Foundation already built)
- [x] Meta-persona with 20 tools
- [x] Skills system (CRUD + invocation)
- [x] Agent module (tasks, calendar, CRM, automations)
- [x] DB schema for all tables
- [x] Chat commands for all agent functions
- [x] API endpoints for all CRUD
- [x] Create persona page on site

### Phase 2 (NEXT — Intelligence Layer)
- [ ] Goal Stack (persona_goals table + LLM context injection)
- [ ] Conversation State Machine (persona_conversation_stages + persona_user_stages)
- [ ] Cognitive Pipeline (emotional analysis → intent → goals → planning → response)
- [ ] Persona Genome + Compliance Permissions (extend personas table)
- [ ] Operational Context Layer (persona_org_memory table)

### Phase 3 (AFTER — Proactive & Adaptive)
- [ ] Event Bus System (persona_events table + event processors)
- [ ] Proactive Intelligence (scheduled checks, automated follow-ups)
- [ ] Self-Reflection Loop (analyze conversations, suggest adjustments)
- [ ] Memory Architecture (5 layers — emotional, strategic, organizational)
- [ ] Tool-Aware RAG (context-aware retrieval)

### Phase 4 (FUTURE — Enterprise)
- [ ] Human Handoff System (escalation rules, operator awareness)
- [ ] Agent Swarm (internal multi-agent coordination)
- [ ] Blueprint System (clone, share, marketplace)
- [ ] Multi-Channel Unified Context (WhatsApp + Telegram + Web + Instagram)
- [ ] A/B Testing for responses and strategies
- [ ] Advanced Dashboard (cognitive metrics, funnel visualization)

---

## 12. Key Decisions & Constraints

1. **Every feature is conversationally accessible** — if you can do it via API, you can do it by talking to the meta-persona
2. **No hardcoded business logic** — everything is configurable per persona (stages, goals, permissions, genome)
3. **Safety first** — compliance permissions prevent agents from doing things they shouldn't
4. **Graceful degradation** — if cognitive pipeline fails, fall back to basic LLM response
5. **Self-improving** — agents get better over time through self-reflection and strategic insights
6. **Human-in-the-loop** — escalation rules ensure humans supervise critical moments
7. **Scalable architecture** — one codebase, infinite niches, marketplace-ready

---

> **MetaPersona.AI is not a chatbot. It's an AI-Native Business Operating System where conversations create, configure, and evolve intelligent agents.**