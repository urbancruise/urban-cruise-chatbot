INSERT INTO chatbot_business_hours (weekday, day_start, day_end, is_open)
VALUES
  (0, '09:00:00', '21:00:00', TRUE),
  (1, '09:00:00', '21:00:00', TRUE),
  (2, '09:00:00', '21:00:00', TRUE),
  (3, '09:00:00', '21:00:00', TRUE),
  (4, '09:00:00', '21:00:00', TRUE),
  (5, '09:00:00', '21:00:00', TRUE),
  (6, '09:00:00', '21:00:00', TRUE);

INSERT INTO chatbot_settings (setting_key, setting_value)
VALUES
  ('service_mode_override', JSON_QUOTE('auto')),
  ('default_language', JSON_QUOTE('en')),
  ('consent_text_version', JSON_QUOTE('provisional-v1'));
