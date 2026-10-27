import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;

const VERIFIED_EMAIL = 'student1@my.cspc.edu.ph';
const SECOND_STUDENT_EMAIL = 'student2@my.cspc.edu.ph';

describe('verified session guard', () => {
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

  async function login(agent, email = VERIFIED_EMAIL, password = DEMO_PASSWORD) {
    const token = await getCsrf(agent, '/login');
    return agent.post('/login').type('form').send({ email, password, _csrf: token });
  }

  function userIdFor(email) {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  }

  function sessionsContainingUserId(userId) {
    return db
      .prepare('SELECT sid, sess FROM sessions')
      .all()
      .filter((row) => row.sess.includes(`"userId":${userId}`));
  }

  it('returns the generic 401 when an unverified account tries to sign in', async () => {
    const agent = request.agent(app);
    const registerToken = await getCsrf(agent, '/register');
    const email = 'pending.student@my.cspc.edu.ph';

    const registered = await agent.post('/register').type('form').send({
      fullName: 'Pending Student',
      studentNo: '2026-9401',
      email,
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
      policy: 'agreed',
      _csrf: registerToken,
    });

    expect(registered.status).toBe(303);

    const row = db.prepare('SELECT email_verified_at FROM users WHERE email = ?').get(email);
    expect(row.email_verified_at).toBeNull();

    const response = await login(agent, email, 'QueueDemo2026!');

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
    expect(sessionsContainingUserId(userIdFor(email))).toHaveLength(0);
  });

  it('rejects a stale session version, clears the session, and redirects to login', async () => {
    const agent = request.agent(app);
    const userId = userIdFor(VERIFIED_EMAIL);

    const signedIn = await login(agent);
    expect(signedIn.status).toBe(303);
    expect(sessionsContainingUserId(userId)).toHaveLength(1);

    db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(userId);

    const response = await agent.get('/queue');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login');
    expect(sessionsContainingUserId(userId)).toHaveLength(0);

    const loginPage = await agent.get('/login');
    expect(loginPage.status).toBe(200);
  });

  it('rejects an authenticated session when the user becomes unverified', async () => {
    const agent = request.agent(app);
    const userId = userIdFor(SECOND_STUDENT_EMAIL);

    const signedIn = await login(agent, SECOND_STUDENT_EMAIL);
    expect(signedIn.status).toBe(303);

    db.prepare('UPDATE users SET email_verified_at = NULL WHERE id = ?').run(userId);

    const response = await agent.get('/queue');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login');
    expect(sessionsContainingUserId(userId)).toHaveLength(0);
  });

  it('keeps a verified login working and stores the session version', async () => {
    const agent = request.agent(app);
    const userId = userIdFor('staff@my.cspc.edu.ph');

    const response = await login(agent, 'staff@my.cspc.edu.ph');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/staff/queue');

    const stored = db
      .prepare('SELECT sess FROM sessions')
      .all()
      .find((row) => row.sess.includes(`"userId":${userId}`));
    expect(stored).toBeDefined();
    expect(stored.sess).toContain('"sessionVersion":1');

    const staffQueue = await agent.get('/staff/queue');
    expect(staffQueue.status).toBe(200);
  });

  it('exposes the memory mailer to integration tests', () => {
    expect(Array.isArray(app.locals.mailer.messages)).toBe(true);
  });
});
