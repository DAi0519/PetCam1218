CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  is_banned INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  user_email TEXT,
  ip_address TEXT,
  prompt TEXT,
  created_at INTEGER,
  status TEXT,
  image_metadata TEXT,
  image_uri TEXT,
  error_log TEXT
);

CREATE INDEX IF NOT EXISTS idx_generations_ip_created_at
  ON generations (ip_address, created_at);

CREATE INDEX IF NOT EXISTS idx_generations_status
  ON generations (status);
