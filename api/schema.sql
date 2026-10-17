-- MySQL 5.7+ / MariaDB 10.4+. Run using php api/install.php from a terminal.
CREATE TABLE IF NOT EXISTS store_meta (
  setting_key VARCHAR(50) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory (
  product_id INT UNSIGNED NOT NULL,
  size VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, size)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  customer_json JSON NOT NULL,
  items_json JSON NOT NULL,
  subtotal INT UNSIGNED NOT NULL,
  shipping INT UNSIGNED NOT NULL,
  total INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX orders_created (created_at),
  INDEX orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  note_text TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT notes_order FOREIGN KEY (reference) REFERENCES orders(reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT events_order FOREIGN KEY (reference) REFERENCES orders(reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX rate_limits_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO store_meta (setting_key, setting_value) VALUES ('schema_version', '1')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
