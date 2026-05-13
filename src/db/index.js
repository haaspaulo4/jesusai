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

  console.log('Database schema initialized (with migrations)');
}

module.exports = { pool, initDatabase };