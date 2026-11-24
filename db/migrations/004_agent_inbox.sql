CREATE TABLE chatbot_agents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_agent_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  agent_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_agent_sessions_agent_expiry (agent_id, expires_at),
  CONSTRAINT fk_agent_session_agent FOREIGN KEY (agent_id) REFERENCES chatbot_agents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE chatbot_sessions
  ADD COLUMN agent_chat_status ENUM('none', 'waiting', 'active', 'closed') NOT NULL DEFAULT 'none',
  ADD COLUMN assigned_agent_id BIGINT UNSIGNED NULL,
  ADD KEY idx_sessions_agent_queue (agent_chat_status, last_activity_at),
  ADD KEY idx_sessions_assigned_agent (assigned_agent_id),
  ADD CONSTRAINT fk_chat_session_assigned_agent FOREIGN KEY (assigned_agent_id) REFERENCES chatbot_agents(id) ON DELETE SET NULL;

ALTER TABLE chatbot_messages
  MODIFY message_type ENUM('user', 'assistant', 'agent', 'system') NOT NULL;
