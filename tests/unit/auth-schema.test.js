import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dbModule from '../../src/core/db.js';
import authRepository from '../../src/modules/auth/auth.repository.js';
import seedModule from '../../src/core/seed.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const { openDatabase, migrate, AUTH_VERIFICATION_MIGRATION } = dbModule;
const { seedDatabase, DEMO_ACCOUNT_EMAILS } = seedModule;

const LEGACY_MIGRATIONS = [
  '001_init',
  '002_user_is_active',
  '003_user_avatar',
  '004_ticket_expired_status',
];

function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
}

function columnNames(db, table) {
  return db.pragma(`table_info(${table})`).map((row) => row.name);
}

describe('auth verification schema', () => {
  it('applies migration 005 twice on a fresh database without changing the result', () => {
    const db = openDatabase(':memory:', { journalMode: 'DELETE' });

    expect(migrate(db)).toBe(true);
    expect(migrate(db)).toBe(false);

    const userColumns = columnNames(db, 'users');
    expect(userColumns).toContain('email_verified_at');
    expect(userColumns).toContain('session_version');

    const sessionVersion = db
      .pragma('table_info(users)')
      .find((row) => row.name === 'session_version');
    expect(sessionVersion.notnull).toBe(1);
    expect(String(sessionVersion.dflt_value)).toBe('1');

    const tables = tableNames(db);
    expect(tables).toContain('auth_challenges');
    expect(tables).toContain('mail_outbox');
    expect(tables).toContain('auth_throttle');

    const challengeIndex = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'one_active_auth_challenge'")
      .get();
    expect(challengeIndex).toBeTruthy();
    expect(challengeIndex.sql.toLowerCase()).toContain(
      'where consumed_at is null and superseded_at is null',
    );

    const applied = db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version);
    expect(applied).toContain(AUTH_VERIFICATION_MIGRATION);

    db.close();
  });

  it('marks existing users verified and sets session_version when upgraded', () => {
    const db = openDatabase(':memory:', { journalMode: 'DELETE' });
    db.exec(fs.readFileSync(path.resolve(currentDir, '../../src/core/schema.sql'), 'utf8'));

    const recordMigration = db.prepare(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    );
    for (const version of LEGACY_MIGRATIONS) {
      recordMigration.run(version, '2026-01-01T00:00:00.000Z');
    }

    db.prepare(
      `INSERT INTO users (full_name, student_no, email, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'Legacy User',
      '2025-0001',
      'legacy@my.cspc.edu.ph',
      'legacy-hash',
      'student',
      '2025-01-01T00:00:00.000Z',
    );

    migrate(db);

    const user = db
      .prepare('SELECT email_verified_at, session_version FROM users WHERE email = ?')
      .get('legacy@my.cspc.edu.ph');
    expect(user.email_verified_at).toBeTruthy();
    expect(user.session_version).toBe(1);

    db.close();
  });

  it('leaves users created after the migration unverified', () => {
    const db = openDatabase(':memory:', { journalMode: 'DELETE' });
    migrate(db);

    const user = authRepository.createUser(db, {
      fullName: 'New Student',
      studentNo: '2026-0100',
      email: 'new@my.cspc.edu.ph',
      passwordHash: 'new-hash',
      role: 'student',
      createdAt: '2026-10-27T00:00:00.000Z',
    });

    expect(user.emailVerifiedAt).toBeNull();
    expect(user.sessionVersion).toBe(1);

    db.close();
  });

  it('seeds every demo account with a verified email', () => {
    const db = openDatabase(':memory:', { journalMode: 'DELETE' });
    migrate(db);
    seedDatabase(db);

    const placeholders = DEMO_ACCOUNT_EMAILS.map(() => '?').join(', ');
    const demoUsers = db
      .prepare(`SELECT email, email_verified_at FROM users WHERE email IN (${placeholders})`)
      .all(...DEMO_ACCOUNT_EMAILS);

    expect(demoUsers).toHaveLength(DEMO_ACCOUNT_EMAILS.length);
    for (const user of demoUsers) {
      expect(user.email_verified_at).toBeTruthy();
    }

    const unverified = db
      .prepare(`
        SELECT email FROM users
        WHERE email IN (${placeholders}) AND email_verified_at IS NULL
      `)
      .all(...DEMO_ACCOUNT_EMAILS);
    expect(unverified).toEqual([]);

    db.close();
  });
});
