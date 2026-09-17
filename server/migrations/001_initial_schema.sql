CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  nickname VARCHAR(50) NOT NULL,
  password_hash VARCHAR(100),
  email VARCHAR(120) UNIQUE,
  status TINYINT NOT NULL DEFAULT 1,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3),
  last_login_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_users_status CHECK (status IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sms_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  scene ENUM('register', 'login', 'bind_phone') NOT NULL,
  send_status ENUM('pending', 'accepted', 'rejected') NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed TINYINT NOT NULL DEFAULT 0,
  verify_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sms_codes_lookup (phone, scene, created_at),
  CONSTRAINT chk_sms_attempts CHECK (verify_attempts <= 5)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sms_deliveries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL UNIQUE,
  phone_masked VARCHAR(20) NOT NULL,
  phone_hash CHAR(64) NOT NULL,
  scene VARCHAR(30) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  provider_message_id VARCHAR(100),
  status VARCHAR(30) NOT NULL,
  error_code VARCHAR(100),
  sent_at DATETIME(3),
  delivered_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_sms_provider_message (provider, provider_message_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  revoked TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_refresh_user_active (user_id, revoked, expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_identities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,
  provider_user_id VARCHAR(128) NOT NULL,
  union_id VARCHAR(128),
  profile_json JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_identity (provider, provider_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cars (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  tagline VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  price_from INT UNSIGNED NOT NULL,
  range_km SMALLINT UNSIGNED NOT NULL,
  acceleration DECIMAL(4,2) NOT NULL,
  max_power_ps SMALLINT UNSIGNED NOT NULL,
  top_speed SMALLINT UNSIGNED NOT NULL,
  body_type VARCHAR(50) NOT NULL,
  image_url VARCHAR(1000) NOT NULL,
  gallery JSON NOT NULL,
  highlights JSON NOT NULL,
  status ENUM('draft', 'published', 'offline') NOT NULL DEFAULT 'draft',
  sort_order INT NOT NULL DEFAULT 0,
  published_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS content_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  content_key VARCHAR(100) NOT NULL UNIQUE,
  content_type VARCHAR(30) NOT NULL,
  draft_payload JSON NOT NULL,
  published_payload JSON,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  published_at DATETIME(3),
  updated_by BIGINT UNSIGNED,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dealers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  province VARCHAR(50) NOT NULL,
  city VARCHAR(50) NOT NULL,
  address VARCHAR(300) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  longitude DECIMAL(10,7),
  latitude DECIMAL(10,7),
  business_hours VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_dealers_city_status (city, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dealer_inventory (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dealer_id BIGINT UNSIGNED NOT NULL,
  car_id BIGINT UNSIGNED NOT NULL,
  total_qty INT UNSIGNED NOT NULL DEFAULT 0,
  reserved_qty INT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (dealer_id) REFERENCES dealers(id),
  FOREIGN KEY (car_id) REFERENCES cars(id),
  UNIQUE KEY uk_inventory_dealer_car (dealer_id, car_id),
  CONSTRAINT chk_inventory_available CHECK (reserved_qty <= total_qty)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(40) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  dealer_id BIGINT UNSIGNED NOT NULL,
  car_id BIGINT UNSIGNED NOT NULL,
  inventory_id BIGINT UNSIGNED NOT NULL,
  amount INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending_confirmation', 'confirmed', 'cancelled', 'expired', 'completed') NOT NULL,
  contact_name VARCHAR(80) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  reservation_expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (dealer_id) REFERENCES dealers(id),
  FOREIGN KEY (car_id) REFERENCES cars(id),
  FOREIGN KEY (inventory_id) REFERENCES dealer_inventory(id),
  INDEX idx_orders_expiry (status, reservation_expires_at),
  CONSTRAINT chk_order_amount_zero CHECK (amount = 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  scope VARCHAR(50) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  resource_id BIGINT UNSIGNED,
  request_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_idempotency (user_id, scope, idempotency_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_drives (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  car_id BIGINT UNSIGNED NOT NULL,
  dealer_id BIGINT UNSIGNED NOT NULL,
  contact_name VARCHAR(80) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  preferred_date DATE NOT NULL,
  status ENUM('submitted', 'contacted', 'scheduled', 'completed', 'cancelled') NOT NULL DEFAULT 'submitted',
  notes VARCHAR(500),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (car_id) REFERENCES cars(id),
  FOREIGN KEY (dealer_id) REFERENCES dealers(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS test_drive_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_drive_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  actor_type ENUM('user', 'admin', 'system') NOT NULL,
  actor_id BIGINT UNSIGNED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (test_drive_id) REFERENCES test_drives(id),
  INDEX idx_test_drive_history (test_drive_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  mfa_secret_encrypted VARBINARY(512),
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3),
  last_login_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(300),
  is_system TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_user_roles (
  admin_user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (admin_user_id, role_id),
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_type ENUM('user', 'admin', 'system') NOT NULL,
  actor_id BIGINT UNSIGNED,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id VARCHAR(100),
  result ENUM('success', 'failure', 'denied') NOT NULL,
  ip VARCHAR(45),
  user_agent VARCHAR(500),
  metadata JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_actor_time (actor_type, actor_id, created_at),
  INDEX idx_audit_resource (resource_type, resource_id, created_at)
) ENGINE=InnoDB;
