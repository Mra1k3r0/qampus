const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { nowIso } = require('./time');

const INITIAL_MIGRATION = '001_init';
const USER_ACTIVE_MIGRATION = '002_user_is_active';
const USER_AVATAR_MIGRATION = '003_user_avatar';
const TICKET_EXPIRED_MIGRATION = '004_ticket_expired_status';
const USER_ACTIVE_COLUMN = 'is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))';
const USER_AVATAR_COLUMNS = [
  ['avatar_type', "avatar_type TEXT CHECK (avatar_type IN ('preset', 'upload'))"],
  ['avatar_value', 'avatar_value TEXT'],
  ['avatar_updated_at', 'avatar_updated_at TEXT'],
];
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function applyPragmas(db, { journalMode = 'WAL' } = {}) {
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma(`journal_mode = ${journalMode}`);
  db.pragma('synchronous = NORMAL');
}

function openDatabase(filename, options = {}) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  applyPragmas(db, options);
  return db;
}

function hasColumn(db, table, column) {
  return db
    .pragma(`table_info(${table})`)
    .some((row) => row.name === column);
}

function addUserActiveColumn(db) {
  if (hasColumn(db, 'users', 'is_active')) {
    return;
  }
  db.exec(`ALTER TABLE users ADD COLUMN ${USER_ACTIVE_COLUMN}`);
}

function addUserAvatarColumns(db) {
  for (const [column, definition] of USER_AVATAR_COLUMNS) {
    if (!hasColumn(db, 'users', column)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${definition}`);
    }
  }
}

function ticketsAllowExpiredStatus(db) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tickets'")
    .get();
  return Boolean(row && row.sql && row.sql.includes("'expired'"));
}

function addExpiredTicketStatus(db) {
  if (ticketsAllowExpiredStatus(db)) {
    return;
  }

  db.exec(`
    ALTER TABLE tickets RENAME TO tickets_legacy;
    CREATE TABLE tickets (
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
    INSERT INTO tickets
      (id, code, service_id, user_id, counter_id, called_by, status, note, service_date,
       sequence, call_count, called_at, started_at, ended_at, created_at, updated_at)
    SELECT
      id, code, service_id, user_id, counter_id, called_by, status, note, service_date,
      sequence, call_count, called_at, started_at, ended_at, created_at, updated_at
    FROM tickets_legacy;
    DROP TABLE tickets_legacy;
    CREATE UNIQUE INDEX one_active_ticket
      ON tickets (user_id, service_id, service_date)
      WHERE status IN ('waiting', 'called', 'serving');
    CREATE INDEX idx_tickets_waiting
      ON tickets (service_id, service_date, status, sequence);
    CREATE INDEX idx_tickets_user_active
      ON tickets (user_id, status);
  `);
}

const MIGRATIONS = [
  {
    version: INITIAL_MIGRATION,
    up(db) {
      db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    },
  },
  {
    version: USER_ACTIVE_MIGRATION,
    up: addUserActiveColumn,
  },
  {
    version: USER_AVATAR_MIGRATION,
    up: addUserAvatarColumns,
  },
  {
    version: TICKET_EXPIRED_MIGRATION,
    up: addExpiredTicketStatus,
  },
];

function migrate(db) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );

  const appliedVersions = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version),
  );

  let appliedAny = false;

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const runMigration = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        nowIso(),
      );
    });

    runMigration.immediate();
    appliedAny = true;
  }

  return appliedAny;
}

function immediateTransaction(db, fn) {
  return db.transaction(fn).immediate();
}

module.exports = {
  openDatabase,
  migrate,
  immediateTransaction,
  INITIAL_MIGRATION,
  USER_ACTIVE_MIGRATION,
  USER_AVATAR_MIGRATION,
  TICKET_EXPIRED_MIGRATION,
};
