const fs = require('node:fs');
const path = require('node:path');
const { openDatabase, migrate } = require('../../src/core/db');
const { seedTestDatabase } = require('../fixtures/seed');

const TMP_DIR = path.join(__dirname, '..', '.tmp');

function createTestDatabase({ seed = true, includeTickets = false } = {}) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const worker = process.env.VITEST_WORKER_ID || String(process.pid);
  const filename = path.join(
    TMP_DIR,
    `test-${worker}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );

  const db = openDatabase(filename, { journalMode: 'DELETE' });
  migrate(db);

  if (seed) {
    seedTestDatabase(db, { includeTickets });
  }

  function cleanup() {
    if (db.open) {
      db.close();
    }
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const file = `${filename}${suffix}`;
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }

  return { db, filename, cleanup };
}

module.exports = {
  createTestDatabase,
  TMP_DIR,
};
