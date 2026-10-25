import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';
import config from '../../src/config.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;

const SESSION_COOKIE = config.cookieName;

describe('public display', () => {
  let db;
  let app;
  let cleanup;

  function countSessions() {
    return db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count;
  }

  function hasSessionCookie(response) {
    const cookies = response.headers['set-cookie'] || [];
    return cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  }

  beforeAll(() => {
    const testDb = createTestDatabase({ includeTickets: true });
    db = testDb.db;
    cleanup = testDb.cleanup;
    app = createTestApp(db).app;
  });

  afterAll(() => {
    cleanup();
  });

  it('shows the lobby board to a signed-out visitor and refuses caching', async () => {
    const response = await request(app).get('/display');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Registrar');
    expect(response.text).toContain('Cashier');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('never shows student names, emails, or student numbers on the board', async () => {
    const response = await request(app).get('/display');

    expect(response.text).not.toContain('Alex Reyes');
    expect(response.text).not.toContain('student1@cspc.edu.ph');
    expect(response.text).not.toContain('2026-0001');
  });

  it('serves the same board as JSON with only codes, counters, and counts', async () => {
    const response = await request(app).get('/api/display');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.services)).toBe(true);
    expect(response.body.updatedAt).toBeTruthy();

    const registrar = response.body.services.find((row) => row.code === 'REG');
    expect(registrar.waitingCount).toBe(2);

    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('cspc.edu.ph');
    expect(raw).not.toContain('Alex');
  });

  it('does not mint a session while an anonymous visitor polls /display', async () => {
    const agent = request.agent(app);
    const before = countSessions();

    const first = await agent.get('/display');
    const second = await agent.get('/display');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(hasSessionCookie(first)).toBe(false);
    expect(hasSessionCookie(second)).toBe(false);
    expect(countSessions()).toBe(before);
  });

  it('does not mint a session while the board polls /api/display', async () => {
    const agent = request.agent(app);
    const before = countSessions();

    const first = await agent.get('/api/display');
    const second = await agent.get('/api/display');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(hasSessionCookie(first)).toBe(false);
    expect(hasSessionCookie(second)).toBe(false);
    expect(countSessions()).toBe(before);
  });

  it('still renders a non-empty CSRF token on the login form', async () => {
    const token = await getCsrf(request.agent(app), '/login');

    expect(token.length).toBeGreaterThan(0);
  });

  it('accepts a login POST with the lazily minted CSRF token', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/login');

    const response = await agent
      .post('/login')
      .type('form')
      .send({ email: 'student1@cspc.edu.ph', password: DEMO_PASSWORD, _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/queue');
  });
});
