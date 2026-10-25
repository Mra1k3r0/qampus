import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import time from '../../src/core/time.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { serviceDate } = time;

describe('security', () => {
  let db;
  let app;
  let cleanup;

  beforeAll(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
    app = createTestApp(db).app;
  });

  afterAll(() => {
    cleanup();
  });

  function firstService() {
    return db.prepare('SELECT id, code FROM services ORDER BY id LIMIT 1').get();
  }

  function studentAt(offset = 0) {
    return db
      .prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id LIMIT 1 OFFSET ?")
      .get(offset);
  }

  function insertTicket({ serviceId, userId, status = 'waiting', sequence = 1, code = 'REG-001' }) {
    const now = new Date().toISOString();
    return db
      .prepare(
        `INSERT INTO tickets
          (code, service_id, user_id, status, service_date, sequence, call_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(code, serviceId, userId, status, serviceDate(), sequence, now, now);
  }

  it('rate limits the eleventh login attempt with Retry-After', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/login');
    let lastResponse;

    for (let attempt = 1; attempt <= 11; attempt += 1) {
      lastResponse = await agent
        .post('/login')
        .type('form')
        .send({ email: 'student1@cspc.edu.ph', password: 'WrongPassword2026!', _csrf: token });
    }

    expect(lastResponse.status).toBe(429);
    expect(lastResponse.headers['retry-after']).toBeDefined();
  });

  it('sends self-only CSP and no X-Powered-By header', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects a POST without a CSRF token and writes an audit row', async () => {
    const before = db
      .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'csrf_failure'")
      .get().count;

    const response = await request(app).post('/register').type('form').send({
      fullName: 'No Token',
      studentNo: '2026-9100',
      email: 'no.token@cspc.edu.ph',
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
    });

    expect(response.status).toBe(403);
    const after = db
      .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action = 'csrf_failure'")
      .get().count;
    expect(after).toBe(before + 1);
  });

  it('rejects a second active ticket through the partial unique index', () => {
    const service = firstService();
    const student = studentAt(0);

    insertTicket({ serviceId: service.id, userId: student.id, sequence: 1, code: 'REG-001' });

    expect(() =>
      insertTicket({ serviceId: service.id, userId: student.id, sequence: 2, code: 'REG-002' }),
    ).toThrow(expect.objectContaining({ code: 'SQLITE_CONSTRAINT_UNIQUE' }));
  });

  it('rejects a bogus ticket status through the CHECK constraint', () => {
    const service = firstService();
    const student = studentAt(1);
    const result = insertTicket({
      serviceId: service.id,
      userId: student.id,
      sequence: 3,
      code: 'REG-003',
    });

    expect(() =>
      db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run('bogus', result.lastInsertRowid),
    ).toThrow(expect.objectContaining({ code: 'SQLITE_CONSTRAINT_CHECK' }));
  });

  it('rejects a ticket for an unknown service through the foreign key', () => {
    const student = studentAt(2);

    expect(() =>
      insertTicket({
        serviceId: 99999,
        userId: student.id,
        sequence: 4,
        code: 'REG-004',
      }),
    ).toThrow(expect.objectContaining({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }));
  });
});
