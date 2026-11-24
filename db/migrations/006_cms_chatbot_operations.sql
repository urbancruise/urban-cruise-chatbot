ALTER TABLE chatbot_sessions
  ADD COLUMN assigned_cms_user_id INT NULL AFTER assigned_agent_id,
  ADD KEY idx_sessions_assigned_cms_user (assigned_cms_user_id),
  ADD CONSTRAINT fk_chat_session_cms_user
    FOREIGN KEY (assigned_cms_user_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE roles
SET permissions = JSON_ARRAY_APPEND(COALESCE(permissions, JSON_ARRAY()), '$', 'chatbot.manage')
WHERE slug = 'agent'
  AND NOT JSON_CONTAINS(
    COALESCE(permissions, JSON_ARRAY()),
    JSON_QUOTE('chatbot.manage')
  );
