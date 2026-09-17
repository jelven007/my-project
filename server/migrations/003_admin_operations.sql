CREATE TABLE IF NOT EXISTS content_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  content_entry_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  change_summary VARCHAR(300),
  published_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (content_entry_id) REFERENCES content_entries(id),
  FOREIGN KEY (published_by) REFERENCES admin_users(id),
  UNIQUE KEY uk_content_version (content_entry_id, version)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  object_key VARCHAR(500) NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  width INT UNSIGNED,
  height INT UNSIGNED,
  checksum_sha256 CHAR(64) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  status ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3),
  FOREIGN KEY (uploaded_by) REFERENCES admin_users(id),
  INDEX idx_media_checksum (checksum_sha256)
) ENGINE=InnoDB;

ALTER TABLE test_drives
  ADD COLUMN assigned_admin_id BIGINT UNSIGNED NULL AFTER status,
  ADD COLUMN follow_up_note VARCHAR(1000) NULL AFTER assigned_admin_id,
  ADD CONSTRAINT fk_test_drive_admin
    FOREIGN KEY (assigned_admin_id) REFERENCES admin_users(id);
