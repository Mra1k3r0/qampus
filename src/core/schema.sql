CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  student_no TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'staff', 'admin')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  avatar_type TEXT CHECK (avatar_type IN ('preset', 'upload')),
  avatar_value TEXT,
  avatar_updated_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avg_minutes INTEGER NOT NULL CHECK (avg_minutes > 0),
  open_days TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES services(id),
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  service_id INTEGER NOT NULL REFERENCES services(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  counter_id INTEGER REFERENCES counters(id),
  called_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'called', 'serving', 'served', 'left', 'no_show', 'expired')),
  note TEXT NOT NULL DEFAULT '',
  service_date TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  called_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (service_id, service_date, sequence),
  UNIQUE (code, service_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_ticket
  ON tickets (user_id, service_id, service_date)
  WHERE status IN ('waiting', 'called', 'serving');

CREATE INDEX IF NOT EXISTS idx_tickets_waiting
  ON tickets (service_id, service_date, status, sequence);

CREATE INDEX IF NOT EXISTS idx_tickets_user_active
  ON tickets (user_id, status);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON audit_log (created_at);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions (expires_at);
