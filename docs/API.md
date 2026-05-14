# MetaPersona.AI — API Reference

## Route Mount Prefixes

| Prefix | Route File | Description |
|---|---|---|
| `/api` | `chat.js` | Chat, personas, TTS, STT, ratings, surveys, follow-ups, sessions, profiles, blueprints |
| `/api/auth` | `auth.js` | Authentication (register, login, Google OAuth, profile) |
| `/api/blog` | `blog.js` | Blog posts, comments, Bible search |
| `/api/whatsapp` | `whatsapp.js` | WhatsApp webhook & group management |
| `/api/email` | `email.js` | Newsletter, contact, daily devotional |
| `/api/admin` | `admin.js` | Admin panel (most require auth + admin role) |

---

## Auth (`/api/auth`)

### POST `/api/auth/register`
- **Auth:** None
- **Body:** `{ email, password, name }`
- **Response:** `{ user: { id, email, name, role: "user" }, token }`

### POST `/api/auth/login`
- **Auth:** None
- **Body:** `{ email, password }`
- **Response:** `{ user: { id, email, name, role, avatar }, token }`

### POST `/api/auth/google`
- **Auth:** None
- **Body:** `{ idToken?, email, name?, googleId, avatar? }`
- **Response:** `{ user: { id, email, name, role, avatar }, token }`

### GET `/api/auth/me`
- **Auth:** Bearer token
- **Response:** `{ id, email, name, role, avatar, ... }`

### PUT `/api/auth/me`
- **Auth:** Bearer token
- **Body:** `{ name }`
- **Response:** Updated user object

---

## Chat (`/api`)

### POST `/api/chat`
- **Auth:** None (rate-limited by userId)
- **Body:** `{ message, sessionId?, userId?, language?, personaId? }`
- **Response:**
```json
{
  "response": "...",
  "sessionId": "sess_...",
  "sources": [{ "reference": "João 3:16", "text": "..." }],
  "language": "pt-BR",
  "personaId": "jesus",
  "personaName": "Jesus",
  "ttsVoice": "pm_alex",
  "ttsLang": "pt-BR",
  "onboarding": false,
  "onboardingDone": false
}
```
- **Errors:** `403` (banned), `429` (rate limited), `500` (server error)

### POST `/api/stt`
- **Auth:** None
- **Body:** multipart/form-data: `audio` file, `language?`
- **Response:** `{ text }`

### POST `/api/tts`
- **Auth:** None
- **Body:** `{ text, lang?, voice? }`
- **Response:** Binary audio buffer (Content-Type auto-detected)

### POST `/api/feedback`
- **Auth:** None
- **Body:** `{ type, message, userId?, sessionId? }`
- **Response:** `{ ok: true, id }`

### GET `/api/donate`
- **Query:** `lang?`
- **Response:** `{ pix: { key, type, name }, stripe, message }`

### GET `/api/config`
- **Response:** `{ telegramUrl, telegramGroupUrl, whatsappUrl, whatsappGroupUrl }`

### GET `/api/translations/:lang`
- **Response:** Translations object

### PUT `/api/settings/apikey`
- **Auth:** Bearer token
- **Body:** `{ ollamaApiKey }`
- **Response:** `{ ok: true, hasCustomKey, message }`

### GET `/api/settings/apikey`
- **Auth:** Bearer token
- **Response:** `{ hasCustomKey, keyPreview? }`

### GET `/api/health`
- **Response:** `{ status: "ok", timestamp }`

---

## Sessions (`/api`)

### GET `/api/sessions`
- **Query:** `userId?`
- **Response:** Array of sessions

### GET `/api/session/:id`
- **Response:** `{ id, userId, userName, messageCount, topics, emotions, summary, messages }`

### POST `/api/session`
- **Body:** `{ userId? }`
- **Response:** `{ id, createdAt }`

### DELETE `/api/session/:id`
- **Response:** `{ ok: true }`

---

## Profiles (`/api`)

### GET `/api/profile/:userId`
- **Response:** Profile object

### PUT `/api/profile/:userId`
- **Body:** `{ name?, spiritualJourney? }`
- **Response:** Updated profile

---

## Personas (`/api`)

### GET `/api/personas`
- **Response:** Array of available personas:
```json
[{
  "id": "jesus",
  "name": "Jesus",
  "nameEn": "Jesus",
  "nameEs": "Jesús",
  "ttsVoice": "pm_alex",
  "ttsLang": "pt-BR",
  "isActive": true,
  "priority": 1,
  "avatarUrl": "...",
  "accentColor": "#D4A843",
  "palette": { "primary": "#D4A843", "secondary": "#1a1a2e" }
}]
```

### POST `/api/persona/switch`
- **Body:** `{ personaId, sessionId?, userId? }`
- **Response:** Switch result + visual identity:
```json
{
  "id": "coach-vendas",
  "name": "coach-vendas",
  "welcomeTitle": { "pt-BR": "Coach de Vendas ativo! 🚀", ... },
  "welcomeBody": { "pt-BR": "Pronto para transformar suas vendas!...", ... },
  "avatarUrl": "...",
  "accentColor": "#D4A843",
  "palette": { "primary": "#D4A843", "secondary": "#1a1a2e" },
  "fontFamily": "Inter",
  "backgroundStyle": { "type": "gradient", "colors": [...] }
}
```

### POST `/api/persona/create`
- **Body:** `{ description, name?, lang? }`
- **Response:** `{ id, name, nameEn, nameEs, knowledgeSources }`

### GET `/api/persona/current`
- **Query:** `sessionId?, userId?`
- **Response:** `{ id, name, nameEn, nameEs, ttsVoice, ttsLang }`

### GET `/api/persona/:id/public`
- **Response:** `{ id, name, nameEn, nameEs, description, welcomeTitle, welcomeBody, disclaimer, ttsVoice, ttsLang }`

---

## Ratings (`/api`)

### POST `/api/rating`
- **Body:** `{ userId?, sessionId?, messageId?, rating (1-5), feedback?, category?, source? }`
- **Response:** `{ ok: true }`

---

## Surveys (`/api/chat`)

### GET `/api/surveys/active`
- **Query:** `userId?, sessionId?`
- **Response:** Survey object or `null`

### POST `/api/surveys/:id/respond`
- **Body:** `{ userId?, sessionId?, answers }`
- **Response:** `{ ok: true }`

---

## Follow-Ups (`/api/chat`)

### GET `/api/followups/pending`
- **Query:** `userId` (required), `sessionId?`
- **Response:** Follow-up object or `null` / `[]`

### POST `/api/followups/:id/respond`
- **Body:** `{ response }`
- **Response:** `{ ok: true }`

---

## Blueprints — Public (`/api/chat`)

### GET `/api/blueprints`
- **Query:** `category?, niche?, search?, limit?`
- **Response:** `{ blueprints: [{ id, name, description, category, niche, is_official, tags, icon, color, preview }] }`

### GET `/api/blueprints/categories`
- **Response:** `{ categories }`

### GET `/api/blueprints/niches`
- **Query:** `category?`
- **Response:** `{ niches }`

### GET `/api/blueprints/:id`
- **Response:** Full blueprint object (if active)

### POST `/api/blueprints/:id/clone`
- **Body:** `{ overrides? }`
- **Response:** `{ success: true, persona: { id, name } }`

---

## Blog (`/api/blog`)

### GET `/api/blog/posts`
- **Response:** Array of `{ slug, title, topic, verse, publishedAt, commentCount, excerpt }`

### GET `/api/blog/posts/:slug`
- **Response:** Full post object with comments

### POST `/api/blog/posts/:slug/comments`
- **Body:** `{ content, authorName?, authorId?, parentId? }`
- **Response:** Comment object

### GET `/api/blog/search`
- **Query:** `q`, `limit?` (max 50)
- **Response:** Array of verse search results

### GET `/api/blog/books`
- **Response:** Bible books index (Old/New Testament)

---

## Email / Newsletter (`/api/email`)

### POST `/api/email/subscribe`
- **Body:** `{ email, name? }`
- **Response:** Subscription result

### GET `/api/email/confirm/:token`
- **Response:** HTML confirmation page

### GET `/api/email/unsubscribe/:token`
- **Response:** HTML unsubscribe page

### POST `/api/email/contact`
- **Body:** `{ name?, email, subject?, message }`
- **Response:** `{ ok: true }`

---

## Admin Endpoints (`/api/admin`)

All `/api/admin/*` require `authMiddleware`. Most require `adminMiddleware` (role=admin). Some (Tasks, Calendar, Contacts, Goals, etc.) only require `authMiddleware`.

### Quick Reference — User-Level (auth only)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | Dashboard stats |
| GET/POST/PUT/DELETE | `/api/admin/tasks/*` | Task CRUD |
| GET/POST/PUT/DELETE | `/api/admin/calendar/*` | Calendar CRUD |
| GET/POST/PUT/DELETE | `/api/admin/contacts/*` | Contact/CRM CRUD |
| GET/POST/PUT/DELETE | `/api/admin/automations/*` | Automation CRUD |
| GET/POST/PUT/DELETE | `/api/admin/goals/*` | Goal CRUD + hierarchy + progress |
| GET/POST/PUT/DELETE | `/api/admin/stages/*` | Conversation stage CRUD |
| GET/POST/PUT/DELETE | `/api/admin/org-memory/*` | Org memory CRUD + search |
| GET/POST | `/api/admin/xp/*` | XP, badges, leaderboard |
| GET/PUT/PATCH | `/api/admin/progress/*` | Progress state |
| GET | `/api/admin/cognitive/*` | Cognitive state + history + stats |
| GET | `/api/admin/override/status/:sessionId` | Override status |
| GET | `/api/admin/creatives` | List creatives |
| GET | `/api/admin/creatives/templates` | Available templates |

### Quick Reference — Admin-Level (auth + admin)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | List users (paginated, filterable) |
| GET/PUT/DELETE | `/api/admin/users/:id` | User management |
| PUT | `/api/admin/users/:id/role` | Set user role |
| GET/POST/PUT/DELETE | `/api/admin/personas/*` | Persona CRUD |
| POST | `/api/admin/personas/generate` | Meta-RAG generate persona |
| GET/POST/PUT/DELETE | `/api/admin/skills/*` | Skill CRUD + invoke |
| GET/POST/PUT/DELETE | `/api/admin/surveys/*` | Survey CRUD + responses |
| GET | `/api/admin/ratings` | Rating stats |
| GET/POST | `/api/admin/followups/*` | Follow-up management |
| GET/POST/PUT/DELETE | `/api/admin/bots/*` | Bot instance CRUD + start/stop |
| GET/POST/PUT/DELETE | `/api/admin/integrations/*` | Integration CRUD + toggle + test |
| GET/POST/DELETE | `/api/admin/knowledge/*` | Knowledge stats + reindex + upload |
| GET/PUT | `/api/admin/settings` | Settings management |
| GET/POST/DELETE | `/api/admin/mcp/*` | MCP server management |
| GET/POST/DELETE | `/api/admin/blueprints/*` | Blueprint CRUD + clone + apply |
| POST/PUT/DELETE | `/api/admin/override/*` | Human override activate/deactivate |
| GET | `/api/admin/thoughts` | Agent thought logs |
| GET | `/api/admin/thoughts/stats` | Thought statistics |
| GET | `/api/admin/suggestions` | Self-optimization suggestions |
| POST | `/api/admin/simulate` | Conversation simulation |
| GET/POST/PUT/DELETE | `/api/admin/commands/*` | Chat command CRUD |
| GET | `/api/admin/events/log` | Event log |
| GET | `/api/admin/events/stats` | Event statistics |
| GET | `/api/admin/search` | Global fulltext search |
| GET | `/api/admin/search/stats` | FlexSearch stats |
| GET | `/api/admin/vector-stats` | Vector DB statistics |
| POST | `/api/admin/vector-reindex` | Trigger vector reindex |
| GET/POST/DELETE | `/api/admin/creatives/*` | Creative generation + management |
| GET | `/api/admin/queue-stats` | BullMQ queue statistics |

---

## WebSocket Events (Socket.IO)

Connect to `/` with `auth: { userId, sessionId }`.

### Client → Server
| Event | Data |
|---|---|
| `auth` | `{ userId, sessionId }` |
| `join_session` | `{ sessionId }` |
| `leave_session` | `{ sessionId }` |
| `typing` | `{ sessionId }` |

### Server → Client
| Event | Data | Description |
|---|---|---|
| `new_message` | `{ role, content, personaId }` | New chat message |
| `agent_thinking` | `{ sessionId }` | AI is processing |
| `agent_step` | `{ sessionId, step }` | Processing pipeline step |
| `xp_update` | `{ xp, level, streak, badge }` | XP/level/streak change |
| `badge_earned` | `{ badge }` | New badge earned |
| `stage_advance` | `{ stage }` | Conversation stage advanced |
| `goal_update` | `{ goal }` | Goal progress update |
| `creative_progress` | `{ progress }` | Creative generation progress |
| `override_status` | `{ is_active, type }` | Human override status |
| `cognitive_state` | `{ emotion, intent, churn_risk }` | Cognitive analysis |

---

## Error Responses

| Status | Description |
|---|---|
| `400` | Bad request (missing fields) |
| `401` | Unauthorized (missing/invalid token for protected endpoints) |
| `403` | Forbidden (banned user or insufficient role) |
| `429` | Rate limited (includes `limit`, `resetIn` in response) |
| `500` | Server error |