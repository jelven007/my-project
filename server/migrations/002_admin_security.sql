CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  revoked TINYINT NOT NULL DEFAULT 0,
  ip VARCHAR(45),
  user_agent VARCHAR(500),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id),
  INDEX idx_admin_refresh_active (admin_user_id, revoked, expires_at)
) ENGINE=InnoDB;
