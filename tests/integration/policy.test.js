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

describe('queue rules page', () => {
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

  it('serves the rules page to a signed-out visitor', async () => {
    const response = await request(app).get('/policy');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Queue rules');
  });

  it('states the live policy limits', async () => {
    const response = await request(app).get('/policy');

    expect(response.text).toContain('60 seconds');
    expect(response.text).toContain('30 minutes');
    expect(response.text).toContain('Two no-shows');
  });

  it('shows no student data and no em dash', async () => {
    const response = await request(app).get('/policy');

    expect(response.text).not.toContain('\u2014');
    expect(response.text).not.toContain('Alex Reyes');
    expect(response.text).not.toContain('student1@cspc.edu.ph');
  });

  it('does not mint a session for an anonymous visitor', async () => {
    const agent = request.agent(app);
    const before = countSessions();

    const response = await agent.get('/policy');

    expect(response.status).toBe(200);
    expect(hasSessionCookie(response)).toBe(false);
    expect(countSessions()).toBe(before);
  });

  it('renders the signed-in layout on the rules page', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/login');
    await agent.post('/login').type('form').send({
      email: 'student1@cspc.edu.ph',
      password: DEMO_PASSWORD,
      portal: 'student',
      _csrf: token,
    });

    const response = await agent.get('/policy');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Sign out');
  });

  it('links to the rules page from the home footer', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/policy"');
  });
});
