const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { nowIso } = require('./time');

const INITIAL_MIGRATION = '001_init';
const USER_ACTIVE_MIGRATION = '002_user_is_active';
const USER_AVATAR_MIGRATION = '003_user_avatar';
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
};
