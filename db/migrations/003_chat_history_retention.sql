ALTER TABLE chatbot_messages
  ADD KEY idx_messages_created_at (created_at);
