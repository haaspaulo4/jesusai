const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jesus_ai',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(60) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255),
  name VARCHAR(255) DEFAULT '',
  google_id VARCHAR(255),
  avatar TEXT,
  ollama_api_key TEXT,
  telegram_chat_id VARCHAR(50),
  role VARCHAR(20) DEFAULT 'user',
  persona_id VARCHAR(60) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_users_email (email),
  KEY idx_users_google_id (google_id),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(80) PRIMARY KEY,
  user_id VARCHAR(60),
  user_name VARCHAR(255),
  user_context JSON,
  summary TEXT,
  persona_id VARCHAR(60) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(80) NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_session (session_id),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(60) PRIMARY KEY,
  name VARCHAR(255),
  story TEXT,
  topics JSON,
  emotions JSON,
  spiritual_journey TEXT,
  prayer_requests JSON,
  last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  slug VARCHAR(255) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  topic VARCHAR(500),
  verse VARCHAR(255),
  content LONGTEXT,
  sources JSON,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_posts_published (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(80) PRIMARY KEY,
  post_slug VARCHAR(255) NOT NULL,
  parent_id VARCHAR(80),
  author_name VARCHAR(255) DEFAULT 'Anônimo',
  author_id VARCHAR(60),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_comments_post (post_slug),
  KEY idx_comments_parent (parent_id),
  FOREIGN KEY (post_slug) REFERENCES posts(slug) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedback (
  id VARCHAR(60) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  user_id VARCHAR(60),
  session_id VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'new'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) DEFAULT '',
  confirmed TINYINT(1) DEFAULT 0,
  confirm_token VARCHAR(128),
  unsub_token VARCHAR(128),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_newsletter_email (email),
  KEY idx_newsletter_confirmed (confirmed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) DEFAULT '',
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) DEFAULT '',
  message TEXT NOT NULL,
  user_id VARCHAR(60),
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(255) PRIMARY KEY,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_type VARCHAR(50) NOT NULL,
  api_key TEXT,
  base_url VARCHAR(500) DEFAULT '',
  model VARCHAR(100) DEFAULT '',
  label VARCHAR(255) DEFAULT '',
  priority INT DEFAULT 100,
  is_active TINYINT(1) DEFAULT 1,
  extra_config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_api_keys_type (service_type),
  KEY idx_api_keys_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personas (
  persona_id VARCHAR(60) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  name_es VARCHAR(255),
  identity JSON,
  commands JSON,
  topic_keywords JSON,
  emotion_keywords JSON,
  name_patterns JSON,
  disclaimer JSON,
  conversation_with JSON,
  memory_block JSON,
  profile_block JSON,
  group_context JSON,
  cjk_fallback JSON,
  llm_error JSON,
  welcome_title JSON,
  welcome_body JSON,
  prayer_prompt JSON,
  blog_prompt JSON,
  blog_topics JSON,
  donate_verse JSON,
  summary_prompt JSON,
  profile_summary_prompt JSON,
  tts_voice VARCHAR(100) DEFAULT 'pm_alex',
  tts_lang VARCHAR(10) DEFAULT 'p',
  model VARCHAR(100) DEFAULT NULL,
  knowledge_sources JSON,
  priority INT DEFAULT 100,
  is_active TINYINT(1) DEFAULT 1,
  -- Identity Visual System
  avatar_url TEXT,
  avatar_style VARCHAR(50) DEFAULT 'realistic',
  palette JSON,
  font_family VARCHAR(100) DEFAULT 'Inter',
  emoji_style VARCHAR(50) DEFAULT 'native',
  background_style JSON,
  animation_style VARCHAR(50) DEFAULT 'subtle',
  accent_color VARCHAR(20) DEFAULT '#D4A843',
  -- Media Identity
  avatar_video_url TEXT,
  avatar_audio_greeting TEXT,
  cover_image_url TEXT,
  media_gallery JSON,
  response_media_enabled TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mcp_servers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  command VARCHAR(500) NOT NULL,
  args JSON,
  env_vars JSON,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  command VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  response_template TEXT,
  response_type VARCHAR(20) DEFAULT 'text',
  action_type VARCHAR(30) DEFAULT 'respond',
  action_config JSON,
  required_role VARCHAR(20) DEFAULT 'user',
  required_persona_id VARCHAR(60),
  aliases JSON,
  usage_examples JSON,
  category VARCHAR(50) DEFAULT 'general',
  is_active TINYINT(1) DEFAULT 1,
  usage_count INT DEFAULT 0,
  created_by VARCHAR(60),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(60) NOT NULL,
  service_type VARCHAR(50) NOT NULL,
  request_count INT DEFAULT 0,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_rate_limits_user_service (user_id, service_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS surveys (
  id VARCHAR(60) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  questions JSON NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  trigger_type VARCHAR(50) DEFAULT 'manual',
  trigger_config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS survey_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id VARCHAR(60) NOT NULL,
  user_id VARCHAR(60) NOT NULL,
  session_id VARCHAR(80),
  answers JSON NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_responses_survey (survey_id),
  KEY idx_responses_user (user_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(60) NOT NULL,
  session_id VARCHAR(80),
  message_id INT,
  rating TINYINT NOT NULL,
  feedback TEXT,
  category VARCHAR(50) DEFAULT 'general',
  source VARCHAR(30) DEFAULT 'web',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ratings_user (user_id),
  KEY idx_ratings_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follow_ups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(60) NOT NULL,
  session_id VARCHAR(80),
  type VARCHAR(50) NOT NULL,
  question TEXT NOT NULL,
  response TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  scheduled_at TIMESTAMP NULL,
  sent_at TIMESTAMP NULL,
  responded_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_followups_user (user_id),
  KEY idx_followups_status (status),
  KEY idx_followups_type (type),
  KEY idx_followups_scheduled (scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bot_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform ENUM('telegram', 'whatsapp') NOT NULL,
  name VARCHAR(255) NOT NULL,
  token VARCHAR(500) DEFAULT NULL,
  webhook_url VARCHAR(500) DEFAULT NULL,
  instance_name VARCHAR(255) DEFAULT NULL,
  persona_id VARCHAR(60) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  config JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bot_platform (platform),
  KEY idx_bot_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  step_key VARCHAR(100) NOT NULL,
  step_order INT DEFAULT 0,
  question TEXT NOT NULL,
  question_en TEXT,
  question_es TEXT,
  field VARCHAR(100) NOT NULL,
  field_type ENUM('text','choice','email','phone','number') DEFAULT 'text',
  choices JSON,
  required TINYINT(1) DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_onboarding (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(60) NOT NULL,
  step_key VARCHAR(100) NOT NULL,
  answer TEXT,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_onboarding_user_step (user_id, step_key),
  KEY idx_onboarding_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_skills (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'action',
  prompt TEXT NOT NULL,
  parameters JSON,
  output_format VARCHAR(20) DEFAULT 'text',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_skills_persona (persona_id),
  KEY idx_skills_type (type),
  KEY idx_skills_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_tasks (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  owner_id VARCHAR(60) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  due_date TIMESTAMP NULL,
  assigned_to VARCHAR(60) DEFAULT NULL,
  result TEXT,
  auto_execute TINYINT(1) DEFAULT 0,
  skill_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tasks_owner (owner_id),
  KEY idx_tasks_persona (persona_id),
  KEY idx_tasks_status (status),
  KEY idx_tasks_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_calendar (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  owner_id VARCHAR(60) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  event_type VARCHAR(50) DEFAULT 'meeting',
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NULL,
  location VARCHAR(500) DEFAULT NULL,
  attendees JSON,
  reminders JSON,
  status VARCHAR(20) DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_calendar_owner (owner_id),
  KEY idx_calendar_persona (persona_id),
  KEY idx_calendar_start (start_time),
  KEY idx_calendar_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_contacts (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  owner_id VARCHAR(60) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  company VARCHAR(255) DEFAULT NULL,
  role VARCHAR(255) DEFAULT NULL,
  tags JSON,
  notes TEXT,
  stage VARCHAR(50) DEFAULT 'lead',
  custom_fields JSON,
  last_contact_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_contacts_owner (owner_id),
  KEY idx_contacts_persona (persona_id),
  KEY idx_contacts_email (email),
  KEY idx_contacts_stage (stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_automations (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  owner_id VARCHAR(60) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_config JSON,
  action_type VARCHAR(50) NOT NULL,
  action_config JSON,
  is_active TINYINT(1) DEFAULT 1,
  last_run_at TIMESTAMP NULL,
  run_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_auto_owner (owner_id),
  KEY idx_auto_persona (persona_id),
  KEY idx_auto_trigger (trigger_type),
  KEY idx_auto_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  session_id VARCHAR(80) DEFAULT NULL,
  user_id VARCHAR(60) NOT NULL,
  role ENUM('user','assistant','system','tool') NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSON,
  tool_results JSON,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_msgs_user (user_id),
  KEY idx_msgs_session (session_id),
  KEY idx_msgs_persona (persona_id),
  KEY idx_msgs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_goals (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  owner_id VARCHAR(60) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  goal_type VARCHAR(30) DEFAULT 'strategic',
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'active',
  progress INT DEFAULT 0,
  target_metric VARCHAR(255) DEFAULT NULL,
  target_value VARCHAR(255) DEFAULT NULL,
  current_value VARCHAR(255) DEFAULT NULL,
  parent_goal_id VARCHAR(100) DEFAULT NULL,
  due_date TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_goals_owner (owner_id),
  KEY idx_goals_persona (persona_id),
  KEY idx_goals_status (status),
  KEY idx_goals_type (goal_type),
  KEY idx_goals_parent (parent_goal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_conversation_stages (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  stage_order INT DEFAULT 0,
  triggers JSON,
  responses JSON,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_user_stages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(60) NOT NULL,
  persona_id VARCHAR(60) DEFAULT NULL,
  session_id VARCHAR(80) DEFAULT NULL,
  current_stage VARCHAR(100) NOT NULL,
  stage_data JSON,
  stage_history JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_user_stage (user_id, persona_id),
  KEY idx_user_stage_session (user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_org_memory (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  owner_id VARCHAR(60) NOT NULL,
  category VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  tags JSON,
  priority VARCHAR(20) DEFAULT 'medium',
  is_active TINYINT(1) DEFAULT 1,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org_owner (owner_id),
  KEY idx_org_persona (persona_id),
  KEY idx_org_category (category),
  KEY idx_org_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_xp (
  user_id VARCHAR(60) NOT NULL,
  persona_id VARCHAR(60) NOT NULL,
  xp INT DEFAULT 0,
  level INT DEFAULT 1,
  streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_activity TIMESTAMP NULL,
  badges JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, persona_id),
  KEY idx_xp_level (level),
  KEY idx_xp_streak (streak)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_xp_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(60) NOT NULL,
  persona_id VARCHAR(60) NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_xplog_user (user_id, persona_id),
  KEY idx_xplog_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_progress (
  user_id VARCHAR(60) NOT NULL,
  persona_id VARCHAR(60) NOT NULL,
  state JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, persona_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cognitive_states (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(60) NOT NULL,
  persona_id VARCHAR(60) DEFAULT NULL,
  session_id VARCHAR(80) DEFAULT NULL,
  message_id INT DEFAULT NULL,
  emotion VARCHAR(30) DEFAULT 'neutral',
  emotion_confidence FLOAT DEFAULT 0.5,
  intent VARCHAR(50) DEFAULT 'general',
  intent_confidence FLOAT DEFAULT 0.5,
  topics JSON,
  churn_risk FLOAT DEFAULT 0,
  conversion_probability FLOAT DEFAULT 0,
  engagement_score FLOAT DEFAULT 0.5,
  suggested_action VARCHAR(100) DEFAULT NULL,
  context_snapshot JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cog_user (user_id),
  KEY idx_cog_persona (persona_id),
  KEY idx_cog_emotion (emotion),
  KEY idx_cog_intent (intent),
  KEY idx_cog_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS human_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(80) NOT NULL,
  user_id VARCHAR(60) DEFAULT NULL,
  persona_id VARCHAR(60) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 0,
  override_type ENUM('full','approval','observation') DEFAULT 'full',
  human_message TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_override_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_blueprints (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'general',
  niche VARCHAR(100) DEFAULT 'general',
  config JSON NOT NULL,
  preview JSON,
  is_official TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  tags JSON,
  icon VARCHAR(50) DEFAULT NULL,
  color VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bp_category (category),
  KEY idx_bp_niche (niche),
  KEY idx_bp_official (is_official),
  KEY idx_bp_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_log (
  id VARCHAR(100) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(60) DEFAULT NULL,
  persona_id VARCHAR(60) DEFAULT NULL,
  session_id VARCHAR(80) DEFAULT NULL,
  data JSON,
  results JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_evt_type (event_type),
  KEY idx_evt_user (user_id),
  KEY idx_evt_persona (persona_id),
  KEY idx_evt_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_thoughts (
  id VARCHAR(100) PRIMARY KEY,
  session_id VARCHAR(80) DEFAULT NULL,
  user_id VARCHAR(60) DEFAULT NULL,
  persona_id VARCHAR(60) DEFAULT NULL,
  message_input TEXT,
  message_output TEXT,
  tools_used JSON,
  context_injected JSON,
  reasoning TEXT,
  decision VARCHAR(500) DEFAULT NULL,
  response_time_ms INT DEFAULT NULL,
  tokens_used INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_thoughts_session (session_id),
  KEY idx_thoughts_user (user_id),
  KEY idx_thoughts_persona (persona_id),
  KEY idx_thoughts_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS embeddings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id VARCHAR(100) NOT NULL,
  doc_id VARCHAR(500) NOT NULL,
  text TEXT,
  vector JSON,
  model VARCHAR(100) DEFAULT 'nomic-embed-text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_embed_source_doc (source_id, doc_id),
  KEY idx_embed_source (source_id),
  KEY idx_embed_model (model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creatives (
  id VARCHAR(100) PRIMARY KEY,
  persona_id VARCHAR(60) DEFAULT NULL,
  owner_id VARCHAR(60) DEFAULT NULL,
  type VARCHAR(50) DEFAULT 'quote_post',
  template_id VARCHAR(50) DEFAULT NULL,
  data JSON,
  html_path TEXT,
  image_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_creative_persona (persona_id),
  KEY idx_creative_owner (owner_id),
  KEY idx_creative_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(60) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) DEFAULT NULL,
  owner_id VARCHAR(60) DEFAULT NULL,
  plan VARCHAR(20) DEFAULT 'free',
  settings JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_workspace_slug (slug),
  KEY idx_workspace_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_members (
  id VARCHAR(80) PRIMARY KEY,
  workspace_id VARCHAR(60) NOT NULL,
  user_id VARCHAR(60) NOT NULL,
  role VARCHAR(20) DEFAULT 'operator',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_ws_member (workspace_id, user_id),
  KEY idx_ws_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_rules (
  id VARCHAR(80) PRIMARY KEY,
  workspace_id VARCHAR(60) DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rule_type VARCHAR(50) DEFAULT 'custom',
  rule_config JSON,
  priority INT DEFAULT 50,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_brule_workspace (workspace_id),
  KEY idx_brule_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS channel_messages (
  id VARCHAR(80) PRIMARY KEY,
  direction ENUM('inbound','outbound') NOT NULL,
  channel VARCHAR(30) NOT NULL,
  session_id VARCHAR(80) DEFAULT NULL,
  user_id VARCHAR(60) DEFAULT NULL,
  persona_id VARCHAR(60) DEFAULT NULL,
  content TEXT,
  metadata JSON,
  status VARCHAR(20) DEFAULT 'delivered',
  workspace_id VARCHAR(60) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chmsg_session (session_id),
  KEY idx_chmsg_user (user_id),
  KEY idx_chmsg_channel (channel),
  KEY idx_chmsg_direction (direction),
  KEY idx_chmsg_workspace (workspace_id),
  KEY idx_chmsg_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(80) PRIMARY KEY,
  workspace_id VARCHAR(60) NOT NULL,
  plan VARCHAR(20) DEFAULT 'free',
  status VARCHAR(20) DEFAULT 'active',
  current_period_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sub_workspace (workspace_id),
  KEY idx_sub_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usage_tracking (
  id VARCHAR(80) PRIMARY KEY,
  workspace_id VARCHAR(60) DEFAULT NULL,
  resource VARCHAR(50) NOT NULL,
  amount INT DEFAULT 1,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_usage_workspace (workspace_id),
  KEY idx_usage_resource (resource),
  KEY idx_usage_period (period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS persona_lifecycle_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  persona_id VARCHAR(60) NOT NULL,
  from_state VARCHAR(20) DEFAULT NULL,
  to_state VARCHAR(20) NOT NULL,
  changed_by VARCHAR(60) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_plc_persona (persona_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function initDatabase() {
  const statements = SCHEMA.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    await pool.execute(stmt);
  }

  try { await pool.execute("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"); } catch {}
  try { await pool.execute("ALTER TABLE users ADD COLUMN persona_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE sessions ADD COLUMN persona_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute('CREATE INDEX idx_users_role ON users (role)'); } catch {}

  try { await pool.execute("ALTER TABLE personas ADD COLUMN genome JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN permissions JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN compliance_rules JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN conversation_stages JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN goal_hierarchy JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN org_memory JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE sessions ADD COLUMN human_override TINYINT(1) DEFAULT 0"); } catch {}
  try { await pool.execute("ALTER TABLE sessions ADD COLUMN override_type VARCHAR(20) DEFAULT NULL"); } catch {}

  try { await pool.execute("ALTER TABLE personas ADD COLUMN lifecycle_state VARCHAR(20) DEFAULT 'active'"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN approval_mode VARCHAR(20) DEFAULT 'full_auto'"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN tool_permissions JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE personas ADD COLUMN workspace_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE users ADD COLUMN workspace_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE persona_contacts ADD COLUMN workspace_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE persona_automations ADD COLUMN workspace_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE persona_tasks ADD COLUMN workspace_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE persona_goals ADD COLUMN workspace_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE persona_org_memory ADD COLUMN workspace_id VARCHAR(60) DEFAULT NULL"); } catch {}

  // Onboarding persona-aware + branching
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN persona_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN condition_field VARCHAR(100) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN condition_value VARCHAR(255) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE user_onboarding ADD COLUMN persona_id VARCHAR(60) DEFAULT 'global'"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD INDEX idx_onboarding_persona (persona_id)"); } catch {}
  try { await pool.execute("ALTER TABLE user_onboarding ADD INDEX idx_user_onboarding_persona (user_id, persona_id)"); } catch {}

  // Business config on personas
  try { await pool.execute("ALTER TABLE personas ADD COLUMN business_config JSON DEFAULT NULL"); } catch {}

  // Slug + persona_id on posts for whitelabel blog
  try { await pool.execute("ALTER TABLE posts ADD COLUMN persona_id VARCHAR(60) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE posts ADD COLUMN media JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE posts ADD COLUMN post_type VARCHAR(30) DEFAULT 'devotional'"); } catch {}
  try { await pool.execute("ALTER TABLE posts ADD COLUMN language VARCHAR(10) DEFAULT 'pt-BR'"); } catch {}
  try { await pool.execute("ALTER TABLE posts ADD INDEX idx_posts_persona (persona_id)"); } catch {}

  // Onboarding enhancements — i18n choices, icons, placeholders, skip labels, branching, multi-choice
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN choices_en JSON"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN choices_es JSON"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN icon VARCHAR(10) DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN placeholder JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN skip_label JSON DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN max_choices INT DEFAULT NULL"); } catch {}
  try { await pool.execute("ALTER TABLE onboarding_steps ADD COLUMN field_type ENUM('text','choice','email','phone','number','multichoice','confirm','message') DEFAULT 'text'"); } catch {}

  // Quizzes table
  try { await pool.execute(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id VARCHAR(80) PRIMARY KEY,
      persona_id VARCHAR(60) DEFAULT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      quiz_type VARCHAR(30) DEFAULT 'multiple_choice',
      questions JSON NOT NULL,
      settings JSON DEFAULT NULL,
      xp_reward INT DEFAULT 10,
      badge_id VARCHAR(100) DEFAULT NULL,
      time_limit_seconds INT DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      created_by VARCHAR(60) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_quiz_persona (persona_id),
      KEY idx_quiz_status (status),
      KEY idx_quiz_type (quiz_type),
      KEY idx_quiz_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`); } catch {}

  // Quiz attempts table
  try { await pool.execute(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id VARCHAR(80) PRIMARY KEY,
      quiz_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(60) NOT NULL,
      persona_id VARCHAR(60) DEFAULT NULL,
      answers JSON DEFAULT NULL,
      score INT DEFAULT 0,
      max_score INT DEFAULT 0,
      percentage INT DEFAULT 0,
      passed TINYINT(1) DEFAULT 0,
      time_taken_seconds INT DEFAULT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      KEY idx_attempt_quiz (quiz_id),
      KEY idx_attempt_user (user_id),
      KEY idx_attempt_persona (persona_id),
      KEY idx_attempt_completed (completed_at),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`); } catch {}

  // Media library table
  try { await pool.execute(`
    CREATE TABLE IF NOT EXISTS media_library (
      id VARCHAR(80) PRIMARY KEY,
      persona_id VARCHAR(60) DEFAULT NULL,
      owner_id VARCHAR(60) DEFAULT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      filename VARCHAR(500) DEFAULT NULL,
      original_name VARCHAR(500) DEFAULT NULL,
      mimetype VARCHAR(200) DEFAULT 'application/octet-stream',
      size BIGINT DEFAULT 0,
      url TEXT,
      type VARCHAR(30) DEFAULT 'other',
      alt_text VARCHAR(500) DEFAULT NULL,
      caption TEXT,
      metadata JSON DEFAULT NULL,
      tags JSON DEFAULT NULL,
      folder VARCHAR(255) DEFAULT NULL,
      source VARCHAR(30) DEFAULT 'upload',
      status VARCHAR(20) DEFAULT 'uploading',
      views INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_media_persona (persona_id),
      KEY idx_media_owner (owner_id),
      KEY idx_media_type (type),
      KEY idx_media_status (status),
      KEY idx_media_folder (folder)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`); } catch {}

  console.log('Database schema initialized (with migrations)');
}

module.exports = { pool, initDatabase };