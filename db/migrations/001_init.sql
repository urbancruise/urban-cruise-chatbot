CREATE TABLE chatbot_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_token_hash CHAR(64) NOT NULL UNIQUE,
  language_code VARCHAR(8) NOT NULL DEFAULT 'en',
  service_mode ENUM('day', 'night') NOT NULL,
  status ENUM('active', 'closed') NOT NULL DEFAULT 'active',
  last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sessions_activity (last_activity_at),
  KEY idx_sessions_status_time (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faq_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  display_name_en VARCHAR(160) NOT NULL,
  display_name_hi VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_faq_categories_status_order (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_faqs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(8) NOT NULL,
  question VARCHAR(500) NOT NULL,
  answer TEXT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  needs_approval BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_faq_lookup (category_id, language_code, status),
  KEY idx_faq_language_status (language_code, status),
  FULLTEXT KEY ft_faq_question (question),
  CONSTRAINT fk_faq_category FOREIGN KEY (category_id) REFERENCES faq_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faq_keywords (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  faq_id BIGINT UNSIGNED NOT NULL,
  keyword VARCHAR(160) NOT NULL,
  normalized_keyword VARCHAR(160) NOT NULL,
  UNIQUE KEY uq_faq_keyword (faq_id, normalized_keyword),
  KEY idx_faq_keyword_normalized (normalized_keyword),
  CONSTRAINT fk_faq_keyword_faq FOREIGN KEY (faq_id) REFERENCES chatbot_faqs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faq_related (
  faq_id BIGINT UNSIGNED NOT NULL,
  related_faq_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (faq_id, related_faq_id),
  KEY idx_faq_related_order (faq_id, sort_order),
  CONSTRAINT fk_faq_related_faq FOREIGN KEY (faq_id) REFERENCES chatbot_faqs(id) ON DELETE CASCADE,
  CONSTRAINT fk_faq_related_target FOREIGN KEY (related_faq_id) REFERENCES chatbot_faqs(id) ON DELETE CASCADE,
  CONSTRAINT chk_faq_related_not_self CHECK (faq_id <> related_faq_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  message_type ENUM('user', 'assistant', 'system') NOT NULL,
  body TEXT NOT NULL,
  faq_id BIGINT UNSIGNED NULL,
  match_type ENUM('exact', 'normalized_phrase', 'keyword', 'category', 'fallback') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_session_time (session_id, created_at),
  KEY idx_messages_faq_time (faq_id, created_at),
  CONSTRAINT fk_message_session FOREIGN KEY (session_id) REFERENCES chatbot_sessions(id),
  CONSTRAINT fk_message_faq FOREIGN KEY (faq_id) REFERENCES chatbot_faqs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lead_reference VARCHAR(32) NOT NULL UNIQUE,
  session_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  pickup VARCHAR(255) NOT NULL,
  dropoff VARCHAR(255) NOT NULL,
  travel_date DATE NOT NULL,
  return_date DATE NULL,
  vehicle_type VARCHAR(80) NOT NULL,
  passenger_count SMALLINT UNSIGNED NOT NULL,
  trip_type ENUM('local', 'airport', 'outstation', 'wedding', 'corporate', 'pilgrimage', 'other') NOT NULL,
  requirements VARCHAR(2000) NULL,
  consent BOOLEAN NOT NULL,
  consent_text_version VARCHAR(40) NOT NULL,
  status ENUM('new', 'contacted', 'quoted', 'closed') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lead_session_idempotency (session_id, idempotency_key),
  KEY idx_leads_status_time (status, created_at),
  KEY idx_leads_session_time (session_id, created_at),
  CONSTRAINT fk_lead_session FOREIGN KEY (session_id) REFERENCES chatbot_sessions(id),
  CONSTRAINT chk_lead_consent CHECK (consent = TRUE),
  CONSTRAINT chk_lead_passengers CHECK (passenger_count > 0),
  CONSTRAINT chk_lead_return_date CHECK (return_date IS NULL OR return_date >= travel_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_business_hours (
  weekday TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  day_start TIME NULL,
  day_end TIME NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_business_hours_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_business_hours_range CHECK (
    (is_open = FALSE AND day_start IS NULL AND day_end IS NULL) OR
    (is_open = TRUE AND day_start IS NOT NULL AND day_end IS NOT NULL AND day_start < day_end)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_holidays (
  holiday_date DATE NOT NULL PRIMARY KEY,
  label VARCHAR(160) NOT NULL,
  mode_override ENUM('day', 'night', 'closed') NOT NULL DEFAULT 'closed',
  day_start TIME NULL,
  day_end TIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_holidays_active_date (is_active, holiday_date),
  CONSTRAINT chk_holiday_hours CHECK (
    (day_start IS NULL AND day_end IS NULL) OR
    (day_start IS NOT NULL AND day_end IS NOT NULL AND day_start < day_end)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_settings (
  setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chatbot_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  event_data JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_session_time (session_id, created_at),
  KEY idx_audit_event_time (event_type, created_at),
  CONSTRAINT fk_audit_session FOREIGN KEY (session_id) REFERENCES chatbot_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
