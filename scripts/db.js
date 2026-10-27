const fs = require('node:fs');
const config = require('../src/config');
const { openDatabase, migrate } = require('../src/core/db');
const { seedDatabase } = require('../src/core/seed');
const { nowIso } = require('../src/core/time');
const { expireStaleTickets } = require('../src/modules/tickets/tickets.sweep');

const AUDIT_RETENTION_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function removeDatabaseFiles() {
  const suffixes = ['', '-wal', '-shm'];

  for (const suffix of suffixes) {
    const filename = `${config.databasePath}${suffix}`;
    if (fs.existsSync(filename)) {
      fs.unlinkSync(filename);
    }
  }
}

function resetDatabase(options = {}) {
  const { studentCount = 6, includeTickets = true } = options;
  removeDatabaseFiles();
  const db = openDatabase(config.databasePath);
  migrate(db);
  const counts = seedDatabase(db, { studentCount, includeTickets });
  db.close();
  return counts;
}

function migrateDatabase() {
  const db = openDatabase(config.databasePath);
  const applied = migrate(db);
  db.close();
  return applied;
}

function seedExistingDatabase(options = {}) {
  const db = openDatabase(config.databasePath);
  migrate(db);
  const counts = seedDatabase(db, options);
  db.close();
  return counts;
}

function expireTickets({ dryRun = false } = {}) {
  const db = openDatabase(config.databasePath);
  migrate(db);
  const result = expireStaleTickets(db, { dryRun });
  db.close();
  return result;
}

function retention({ dryRun = false } = {}) {
  const db = openDatabase(config.databasePath);
  migrate(db);

  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * MS_PER_DAY).toISOString();
  const expiredSessions = db
    .prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires_at <= ?')
    .get(nowIso()).count;
  const oldAuditRows = db
    .prepare('SELECT COUNT(*) AS count FROM audit_log WHERE created_at < ?')
    .get(cutoff).count;

  if (!dryRun) {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
    db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff);
  }

  db.close();
  return { expiredSessions, oldAuditRows, dryRun, cutoff };
}

function main() {
  const command = process.argv[2];

  if (command === 'migrate') {
    const applied = migrateDatabase();
    console.log(applied ? 'Applied pending migrations.' : 'Database is already up to date.');
    return;
  }

  if (command === 'seed') {
    const counts = seedExistingDatabase();
    console.log(JSON.stringify(counts));
    return;
  }

  if (command === 'reset') {
    const counts = resetDatabase();
    console.log(JSON.stringify(counts));
    return;
  }

  if (command === 'expire') {
    const dryRun = process.argv.includes('--dry-run');
    const result = expireTickets({ dryRun });
    const prefix = dryRun ? 'Would expire' : 'Expired';
    console.log(`${prefix} ${result.expired} stale tickets for ${result.date}.`);
    return;
  }

  if (command === 'retention') {
    const dryRun = process.argv.includes('--dry-run');
    const result = retention({ dryRun });
    const prefix = dryRun ? 'Would delete' : 'Deleted';
    console.log(
      `${prefix} ${result.expiredSessions} expired sessions and ${result.oldAuditRows} audit rows older than ${result.cutoff}.`,
    );
    return;
  }

  console.error('Usage: node scripts/db.js <migrate|seed|reset|expire [--dry-run]|retention [--dry-run]>');
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  resetDatabase,
  migrateDatabase,
  seedExistingDatabase,
  expireTickets,
  retention,
  AUDIT_RETENTION_DAYS,
};
