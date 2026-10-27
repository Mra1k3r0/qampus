const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { openDatabase, migrate } = require('../src/core/db');
const { DEMO_PASSWORD, DEMO_ACCOUNT_EMAILS } = require('../src/core/seed');
const { resetDatabase } = require('./db');

const EXPECTED = {
  services: 4,
  counters: 4,
  staff: 1,
  admin: 1,
  students: 6,
  waitingTickets: 6,
};

function collectCounts(db) {
  const count = (sql, ...params) => db.prepare(sql).get(...params).count;
  return {
    services: count('SELECT COUNT(*) AS count FROM services'),
    staff: count("SELECT COUNT(*) AS count FROM users WHERE role = 'staff'"),
    admin: count("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"),
    students: count("SELECT COUNT(*) AS count FROM users WHERE role = 'student'"),
    waitingTickets: count("SELECT COUNT(*) AS count FROM tickets WHERE status = 'waiting'"),
    counters: count('SELECT COUNT(*) AS count FROM counters'),
  };
}

function verifyDemo() {
  const db = openDatabase(config.databasePath);
  migrate(db);
  const counts = collectCounts(db);
  const staff = db
    .prepare("SELECT password_hash FROM users WHERE email = 'staff@my.cspc.edu.ph'")
    .get();

  const checks = [
    ['services', counts.services, EXPECTED.services],
    ['counters', counts.counters, EXPECTED.counters],
    ['staff', counts.staff, EXPECTED.staff],
    ['admin', counts.admin, EXPECTED.admin],
    ['students', counts.students, EXPECTED.students],
    ['waiting tickets', counts.waitingTickets, EXPECTED.waitingTickets],
  ];

  let failed = false;
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) {
      failed = true;
    }
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${actual} (expected ${expected})`);
  }

  const passwordOk = staff ? bcrypt.compareSync(DEMO_PASSWORD, staff.password_hash) : false;
  if (!passwordOk) {
    failed = true;
  }
  console.log(`${passwordOk ? 'PASS' : 'FAIL'} demo password verifies for staff account`);

  const placeholders = DEMO_ACCOUNT_EMAILS.map(() => '?').join(', ');
  const unverified = db
    .prepare(`
      SELECT COUNT(*) AS count FROM users
      WHERE email IN (${placeholders}) AND email_verified_at IS NULL
    `)
    .get(...DEMO_ACCOUNT_EMAILS).count;
  if (unverified !== 0) {
    failed = true;
  }
  const verifiedLabel = unverified === 0
    ? 'demo accounts verified'
    : `demo accounts verified: ${unverified} unverified`;
  console.log(`${unverified === 0 ? 'PASS' : 'FAIL'} ${verifiedLabel}`);

  db.close();
  return !failed;
}

function main() {
  const command = process.argv[2];

  if (command === 'reset') {
    const counts = resetDatabase();
    console.log(`Demo database reset: ${JSON.stringify(counts)}`);
    return;
  }

  if (command === 'verify') {
    const ok = verifyDemo();
    process.exitCode = ok ? 0 : 1;
    return;
  }

  console.error('Usage: node scripts/demo.js <reset|verify>');
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  verifyDemo,
  collectCounts,
  EXPECTED,
};
