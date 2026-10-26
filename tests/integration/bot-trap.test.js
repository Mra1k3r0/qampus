import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;

describe('bot trap', () => {
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

  it('returns 400 and creates no user when the register trap is filled', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/register');
    const email = 'trap.student@my.cspc.edu.ph';

    const response = await agent.post('/register').type('form').send({
      fullName: 'Trap Student',
      studentNo: '2026-9101',
      email,
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
      policy: 'agreed',
      website_url: 'https://spam.example',
      _csrf: token,
    });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Check the form and try again.');
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    expect(row).toBeUndefined();
  });

  it('returns 401 and keeps the session unauthenticated when the login trap is filled', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/login');

    const response = await agent.post('/login').type('form').send({
      email: 'student1@my.cspc.edu.ph',
      password: 'QueueDemo2026!',
      website_url: 'https://spam.example',
      _csrf: token,
    });

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');

    const cookies = response.headers['set-cookie'] || [];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('cspc_queue.sid='));
    const cookieValue = decodeURIComponent(
      sessionCookie.slice('cspc_queue.sid='.length).split(';')[0],
    );
    const sid = cookieValue.slice('s:'.length).split('.')[0];
    const row = db.prepare('SELECT sess FROM sessions WHERE sid = ?').get(sid);
    const session = row ? JSON.parse(row.sess) : {};
    expect(session.userId).toBeUndefined();
  });

  it('renders the trap on both auth pages without the old visible label', async () => {
    const loginPage = await request(app).get('/login');
    const registerPage = await request(app).get('/register');

    expect(loginPage.status).toBe(200);
    expect(registerPage.status).toBe(200);
    expect(loginPage.text).toContain('name="website_url"');
    expect(registerPage.text).toContain('name="website_url"');
    expect(loginPage.text).not.toContain('Company website');
    expect(registerPage.text).not.toContain('Company website');
  });
});
