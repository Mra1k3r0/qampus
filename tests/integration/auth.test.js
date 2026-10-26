import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';
import configModule from '../../src/config.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;
const { sessionMaxAgeMs, sessionRememberMaxAgeMs } = configModule;

const DAY_MS = 24 * 60 * 60 * 1000;

describe('auth routes', () => {
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

  async function login(agent, email = 'student1@my.cspc.edu.ph', password = DEMO_PASSWORD, portal, remember) {
    const token = await getCsrf(agent, '/login');
    const payload = { email, password, _csrf: token };
    if (portal) {
      payload.portal = portal;
    }
    if (remember) {
      payload.remember = remember;
    }
    return agent.post('/login').type('form').send(payload);
  }

  it('creates a student and stores a hashed password on a valid register', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/register');
    const payload = {
      fullName: 'New Student',
      studentNo: '2026-9001',
      email: 'new.student@my.cspc.edu.ph',
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
      policy: 'agreed',
      _csrf: token,
    };

    const response = await agent.post('/register').type('form').send(payload);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/login');

    const row = db
      .prepare('SELECT role, password_hash FROM users WHERE email = ?')
      .get(payload.email);
    expect(row.role).toBe('student');
    expect(row.password_hash).not.toBe(payload.password);
    expect(row.password_hash.startsWith('$2')).toBe(true);
  });

  it('returns 409 when the email already exists', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/register');
    const payload = {
      fullName: 'Alex Reyes',
      studentNo: '2026-9002',
      email: 'student1@my.cspc.edu.ph',
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
      policy: 'agreed',
      _csrf: token,
    };

    const response = await agent.post('/register').type('form').send(payload);

    expect(response.status).toBe(409);
    expect(response.text).toContain('already registered');
    const count = db
      .prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?')
      .get(payload.email).count;
    expect(count).toBe(1);
  });

  it('returns 400 with field errors for an invalid register payload', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/register');

    const response = await agent.post('/register').type('form').send({
      fullName: 'Bad Input',
      studentNo: '2026-9003',
      email: 'not-an-email',
      password: 'short12',
      confirmPassword: 'short12',
      policy: 'agreed',
      _csrf: token,
    });

    expect(response.status).toBe(400);
    expect(response.text).toContain('email');
    const row = db
      .prepare('SELECT id FROM users WHERE student_no = ?')
      .get('2026-9003');
    expect(row).toBeUndefined();
  });

  it('returns 400 when the policy is not accepted', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/register');

    const response = await agent.post('/register').type('form').send({
      fullName: 'No Consent',
      studentNo: '2026-9004',
      email: 'no.consent@my.cspc.edu.ph',
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
      _csrf: token,
    });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Agree to the Terms of Use and Privacy Policy');
    const row = db
      .prepare('SELECT id FROM users WHERE student_no = ?')
      .get('2026-9004');
    expect(row).toBeUndefined();
  });

  it('redirects to the queue and sets the session cookie on a valid login', async () => {
    const agent = request.agent(app);
    const response = await login(agent);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/queue');
    expect(response.headers['set-cookie'].join(';')).toContain('cspc_queue.sid');
  });

  it('returns a generic 401 for a wrong password', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'student1@my.cspc.edu.ph', 'WrongPassword2026!');

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
  });

  it('returns the same generic 401 for an unknown email', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'nobody@my.cspc.edu.ph', 'WrongPassword2026!');

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
  });

  it('redirects a staff login with the staff portal to the staff queue', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'staff@my.cspc.edu.ph', DEMO_PASSWORD, 'staff');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/staff/queue');
  });

  it('redirects an office head login with the admin portal to admin services', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'admin@my.cspc.edu.ph', DEMO_PASSWORD, 'admin');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/admin/services');

    const guestResponse = await agent.get('/login');
    expect(guestResponse.status).toBe(303);
    expect(guestResponse.headers.location).toBe('/admin/services');
  });

  it('returns the generic 401 when the portal does not match the role', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'student1@my.cspc.edu.ph', DEMO_PASSWORD, 'staff');

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
    expect(response.text).not.toContain('do not have access');
  });

  it('still logs in when no portal is supplied', async () => {
    const agent = request.agent(app);
    const response = await login(agent);

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/queue');
  });

  it('renders no demo credentials, fill controls, or footer on the auth pages', async () => {
    const agent = request.agent(app);
    const loginPage = await agent.get('/login');
    const registerPage = await agent.get('/register');

    expect(loginPage.status).toBe(200);
    expect(loginPage.text).not.toContain('QueueDemo2026!');
    expect(loginPage.text).not.toContain('data-demo-fill');
    expect(loginPage.text).not.toContain('Office hours');
    expect(registerPage.status).toBe(200);
    expect(registerPage.text).not.toContain('Office hours');
  });

  it('destroys the session on logout', async () => {
    const agent = request.agent(app);
    await login(agent);
    const token = await getCsrf(agent, '/queue');

    const logout = await agent.post('/logout').type('form').send({ _csrf: token });
    expect(logout.status).toBe(303);
    expect(logout.headers.location).toBe('/login');

    const afterLogout = await agent.get('/queue');
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.location).toContain('/login');
  });

  it('keeps the session across requests and shows the student name', async () => {
    const agent = request.agent(app);
    await login(agent);

    const response = await agent.get('/queue');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Alex Reyes');
  });

  it('returns 403 when a student opens the staff queue', async () => {
    const agent = request.agent(app);
    await login(agent);

    const response = await agent.get('/staff/queue');

    expect(response.status).toBe(403);
  });

  it('redirects an anonymous staff queue request to login with a return path', async () => {
    const agent = request.agent(app);

    const response = await agent.get('/staff/queue');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login?next=/staff/queue');
  });
});

describe('remember me and password help', () => {
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

  async function login(agent, email = 'student1@my.cspc.edu.ph', password = DEMO_PASSWORD, portal, remember) {
    const token = await getCsrf(agent, '/login');
    const payload = { email, password, _csrf: token };
    if (portal) {
      payload.portal = portal;
    }
    if (remember) {
      payload.remember = remember;
    }
    return agent.post('/login').type('form').send(payload);
  }

  function sessionCookie(response) {
    const cookies = response.headers['set-cookie'] || [];
    return cookies.find((cookie) => cookie.startsWith('cspc_queue.sid='));
  }

  function latestSessionExpiry() {
    return db.prepare('SELECT expires_at FROM sessions ORDER BY rowid DESC LIMIT 1').get();
  }

  function cookieRemainingMs(cookie) {
    const match = /Expires=([^;]+)/i.exec(cookie);
    if (!match) {
      return null;
    }
    return new Date(match[1]).getTime() - Date.now();
  }

  it('keeps a checked remember login for 30 days in the cookie and the session store', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'student1@my.cspc.edu.ph', DEMO_PASSWORD, undefined, 'on');

    expect(response.status).toBe(303);
    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();

    const cookieRemaining = cookieRemainingMs(cookie);
    expect(cookieRemaining).not.toBeNull();
    expect(cookieRemaining).toBeGreaterThan(29 * DAY_MS);
    expect(cookieRemaining).toBeLessThanOrEqual(sessionRememberMaxAgeMs + 5000);

    const row = latestSessionExpiry();
    const sessionRemaining = new Date(row.expires_at).getTime() - Date.now();
    expect(sessionRemaining).toBeGreaterThan(29 * DAY_MS);
    expect(sessionRemaining).toBeLessThanOrEqual(sessionRememberMaxAgeMs + 5000);
  });

  it('sets a browser-session cookie and the 8h fallback when remember is unchecked', async () => {
    const agent = request.agent(app);
    const response = await login(agent);

    expect(response.status).toBe(303);
    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).not.toMatch(/Max-Age=/i);
    expect(cookie).not.toMatch(/Expires=/i);

    const row = latestSessionExpiry();
    const sessionRemaining = new Date(row.expires_at).getTime() - Date.now();
    expect(sessionRemaining).toBeGreaterThan(sessionMaxAgeMs - 60 * 1000);
    expect(sessionRemaining).toBeLessThanOrEqual(sessionMaxAgeMs + 5000);
  });

  it('does not widen the session cookie for a remember value other than on', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'student1@my.cspc.edu.ph', DEMO_PASSWORD, undefined, 'yes');

    expect(response.status).toBe(400);
    const cookies = response.headers['set-cookie'] || [];
    for (const cookie of cookies) {
      const remaining = cookieRemainingMs(cookie);
      if (remaining !== null) {
        expect(remaining).toBeLessThan(29 * DAY_MS);
      }
    }
  });

  it('renders the office-assisted forgot password page for a guest', async () => {
    const agent = request.agent(app);
    const response = await agent.get('/forgot-password');

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/office/i);
    expect(response.text).toMatch(/password/i);
  });

  it('redirects a signed-in user from forgot password to their home path', async () => {
    const agent = request.agent(app);
    await login(agent, 'staff@my.cspc.edu.ph', DEMO_PASSWORD, 'staff');

    const response = await agent.get('/forgot-password');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/staff/queue');
  });
});

describe('password strength rules', () => {
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

  it('rejects an 8 character or longer password without a digit or without a letter', async () => {
    const message = 'Password must have at least 8 characters, including a letter and a number.';
    const cases = [
      { password: 'abcdefgh', email: 'no.digit@my.cspc.edu.ph', studentNo: '2026-9201' },
      { password: '12345678', email: 'no.letter@my.cspc.edu.ph', studentNo: '2026-9202' },
    ];

    for (const testCase of cases) {
      const agent = request.agent(app);
      const token = await getCsrf(agent, '/register');
      const response = await agent.post('/register').type('form').send({
        fullName: 'Weak Password',
        studentNo: testCase.studentNo,
        email: testCase.email,
        password: testCase.password,
        confirmPassword: testCase.password,
        policy: 'agreed',
        _csrf: token,
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain(message);
      const row = db.prepare('SELECT id FROM users WHERE email = ?').get(testCase.email);
      expect(row).toBeUndefined();
    }
  });

  it('rejects a leaked password when the breach check is enabled', async () => {
    const testDb = createTestDatabase();
    const password = 'LeakedPass2026!';
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `${digest.slice(5)}:7`,
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const leakApp = createTestApp(testDb.db, { passwordLeakCheck: true }).app;
      const agent = request.agent(leakApp);
      const token = await getCsrf(agent, '/register');
      const email = 'leaked@my.cspc.edu.ph';

      const response = await agent.post('/register').type('form').send({
        fullName: 'Leaked Password',
        studentNo: '2026-9301',
        email,
        password,
        confirmPassword: password,
        policy: 'agreed',
        _csrf: token,
      });

      expect(response.status).toBe(400);
      expect(response.text).toContain('This password has appeared in a data breach. Choose a different one.');
      const row = testDb.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      expect(row).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`,
      );
    } finally {
      vi.unstubAllGlobals();
      testDb.cleanup();
    }
  });
});

describe('login portal selection', () => {
  let db;
  let app;
  let cleanup;
  let renders;

  beforeAll(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
    const testApp = createTestApp(db);
    app = testApp.app;
    renders = [];

    const originalRender = app.render.bind(app);
    app.render = (view, options, callback) => {
      if (view === 'pages/login') {
        renders.push(options);
      }
      return originalRender(view, options, callback);
    };
  });

  afterAll(() => {
    cleanup();
  });

  function lastLoginOptions() {
    return renders[renders.length - 1];
  }

  it('passes the requested portal to the login view', async () => {
    for (const portal of ['student', 'staff', 'admin']) {
      const response = await request(app).get(`/login?portal=${portal}`);

      expect(response.status).toBe(200);
      expect(lastLoginOptions().values.portal).toBe(portal);
    }
  });

  it('falls back to the student portal for an unknown value', async () => {
    const response = await request(app).get('/login?portal=teacher');

    expect(response.status).toBe(200);
    expect(lastLoginOptions().values.portal).toBe('student');
  });

  it('preserves the submitted portal when login validation fails', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/login');

    const response = await agent
      .post('/login')
      .type('form')
      .send({ email: 'not-an-email', password: '', portal: 'staff', _csrf: token });

    expect(response.status).toBe(400);
    expect(lastLoginOptions().values.portal).toBe('staff');
  });
});
