ALTER TABLE chatbot_sessions
  ADD COLUMN location_slug VARCHAR(80) NOT NULL DEFAULT 'global' AFTER service_mode,
  ADD KEY idx_sessions_location_agent_queue (location_slug, agent_chat_status, last_activity_at);
