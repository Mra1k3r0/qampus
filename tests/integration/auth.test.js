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

  async function login(agent, email = 'student1@cspc.edu.ph', password = DEMO_PASSWORD, portal) {
    const token = await getCsrf(agent, '/login');
    const payload = { email, password, _csrf: token };
    if (portal) {
      payload.portal = portal;
    }
    return agent.post('/login').type('form').send(payload);
  }

  it('creates a student and stores a hashed password on a valid register', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/register');
    const payload = {
      fullName: 'New Student',
      studentNo: '2026-9001',
      email: 'new.student@cspc.edu.ph',
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
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
      email: 'student1@cspc.edu.ph',
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
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
      _csrf: token,
    });

    expect(response.status).toBe(400);
    expect(response.text).toContain('email');
    const row = db
      .prepare('SELECT id FROM users WHERE student_no = ?')
      .get('2026-9003');
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
    const response = await login(agent, 'student1@cspc.edu.ph', 'WrongPassword2026!');

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
  });

  it('returns the same generic 401 for an unknown email', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'nobody@cspc.edu.ph', 'WrongPassword2026!');

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
  });

  it('redirects a staff login with the staff portal to the staff queue', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'staff@cspc.edu.ph', DEMO_PASSWORD, 'staff');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/staff/queue');
  });

  it('redirects an office head login with the admin portal to admin services', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'admin@cspc.edu.ph', DEMO_PASSWORD, 'admin');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/admin/services');

    const guestResponse = await agent.get('/login');
    expect(guestResponse.status).toBe(303);
    expect(guestResponse.headers.location).toBe('/admin/services');
  });

  it('returns the generic 401 when the portal does not match the role', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'student1@cspc.edu.ph', DEMO_PASSWORD, 'staff');

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

  it('renders no demo credentials or fill controls on the login page', async () => {
    const agent = request.agent(app);
    const response = await agent.get('/login');

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('QueueDemo2026!');
    expect(response.text).not.toContain('data-demo-fill');
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
