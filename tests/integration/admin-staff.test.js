import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;

const STAFF_ROUTE_CASES = [
  { method: 'get', path: '/admin/staff' },
  {
    method: 'post',
    path: '/admin/staff',
    body: { full_name: 'Blocked Staff', email: 'blocked@cspc.edu.ph', password: 'Password2026!' },
  },
  {
    method: 'post',
    path: '/admin/staff/1',
    body: { full_name: 'Blocked Staff', email: 'blocked@cspc.edu.ph' },
  },
  { method: 'post', path: '/admin/staff/1/password', body: { password: 'Password2026!' } },
  { method: 'post', path: '/admin/staff/1/status', body: { isActive: '0' } },
];

function buildApp(db) {
  const { app } = createTestApp(db);
  const renders = [];
  const originalRender = app.render.bind(app);

  app.render = (view, options, callback) => {
    if (view === 'pages/admin-staff') {
      renders.push({ view, options });
      callback(null, '<!doctype html><html><body>staff stub</body></html>');
      return;
    }
    return originalRender(view, options, callback);
  };

  return { app, renders };
}

describe('admin staff accounts', () => {
  let db;
  let app;
  let renders;
  let cleanup;

  beforeEach(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
    ({ app, renders } = buildApp(db));
  });

  afterEach(() => {
    cleanup();
  });

  function lastRender() {
    return renders[renders.length - 1].options;
  }

  async function login(agent, email, password = DEMO_PASSWORD) {
    const token = await getCsrf(agent, '/login');
    return agent.post('/login').type('form').send({ email, password, _csrf: token });
  }

  async function adminAgent() {
    const agent = request.agent(app);
    await login(agent, 'admin@cspc.edu.ph');
    return agent;
  }

  function auditCount(action, entityId) {
    return db
      .prepare(
        'SELECT COUNT(*) AS count FROM audit_log WHERE action = ? AND entity_type = ? AND entity_id = ?',
      )
      .get(action, 'user', entityId).count;
  }

  function seededStaff() {
    return db
      .prepare("SELECT id, email, password_hash FROM users WHERE role = 'staff' ORDER BY id LIMIT 1")
      .get();
  }

  function insertSecondStaff() {
    const now = new Date().toISOString();
    const hash = seededStaff().password_hash;
    return db
      .prepare(
        `INSERT INTO users (full_name, student_no, email, password_hash, role, is_active, created_at)
         VALUES (?, ?, ?, ?, 'staff', 1, ?)`,
      )
      .run('Marco Second', 'STAFF-099', 'marco.staff@cspc.edu.ph', hash, now).lastInsertRowid;
  }

  it('lists staff accounts with the agreed view model', async () => {
    const agent = await adminAgent();

    const response = await agent.get('/admin/staff');

    expect(response.status).toBe(200);
    const view = lastRender();
    expect(view.title).toBe('Staff accounts');
    expect(view.staffCount).toBe(1);
    expect(view.editingStaffId).toBe(null);
    expect(view.values).toBe(null);
    expect(view.staff).toEqual([
      expect.objectContaining({
        fullName: 'Liza Fernandez',
        email: 'staff@cspc.edu.ph',
        isActive: true,
      }),
    ]);
    expect(view.staff[0]).toHaveProperty('id');
    expect(view.staff[0]).toHaveProperty('createdAt');
  });

  it('creates a staff account, hashes the password, and writes an audit row', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');
    const password = 'FreshStaff2026!';

    const response = await agent
      .post('/admin/staff')
      .type('form')
      .send({
        full_name: 'Nora Staff',
        email: 'nora.staff@cspc.edu.ph',
        password,
        _csrf: token,
      });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/admin/staff');

    const row = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get('nora.staff@cspc.edu.ph');
    expect(row.role).toBe('staff');
    expect(row.is_active).toBe(1);
    expect(row.student_no).toMatch(/^STAFF-\d{3}$/);
    expect(row.password_hash).not.toBe(password);
    expect(bcrypt.getRounds(row.password_hash)).toBe(12);
    await expect(bcrypt.compare(password, row.password_hash)).resolves.toBe(true);
    expect(auditCount('staff_create', row.id)).toBe(1);

    const page = await agent.get('/admin/staff');
    expect(page.status).toBe(200);
    expect(lastRender().staffCount).toBe(2);
  });

  it('edits a staff account and writes an audit row', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');
    const staff = seededStaff();

    const response = await agent
      .post(`/admin/staff/${staff.id}`)
      .type('form')
      .send({
        full_name: 'Liza F. Updated',
        email: 'liza.updated@cspc.edu.ph',
        _csrf: token,
      });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/admin/staff');

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(staff.id);
    expect(row.full_name).toBe('Liza F. Updated');
    expect(row.email).toBe('liza.updated@cspc.edu.ph');
    expect(auditCount('staff_update', staff.id)).toBe(1);

    await agent.get(`/admin/staff?edit=${staff.id}`);
    const view = lastRender();
    expect(view.editingStaffId).toBe(staff.id);
    expect(view.values.full_name).toBe('Liza F. Updated');
    expect(view.values.email).toBe('liza.updated@cspc.edu.ph');
  });

  it('resets a staff password without exposing it and writes an audit row', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');
    const staff = seededStaff();
    const password = 'ResetStaff2026!';

    const response = await agent
      .post(`/admin/staff/${staff.id}/password`)
      .type('form')
      .send({ password, _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/admin/staff');
    expect(response.text).not.toContain(password);

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(staff.id);
    await expect(bcrypt.compare(password, row.password_hash)).resolves.toBe(true);
    expect(bcrypt.getRounds(row.password_hash)).toBe(12);
    expect(auditCount('staff_password_reset', staff.id)).toBe(1);

    await agent.get('/admin/staff');
    expect(JSON.stringify(lastRender())).not.toContain(password);
  });

  it('deactivates and reactivates a staff account with audit rows for both', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');
    const staff = seededStaff();

    const deactivate = await agent
      .post(`/admin/staff/${staff.id}/status`)
      .type('form')
      .send({ isActive: '0', _csrf: token });

    expect(deactivate.status).toBe(303);
    expect(db.prepare('SELECT is_active FROM users WHERE id = ?').get(staff.id).is_active).toBe(0);
    expect(auditCount('staff_deactivate', staff.id)).toBe(1);

    const activate = await agent
      .post(`/admin/staff/${staff.id}/status`)
      .type('form')
      .send({ isActive: '1', _csrf: token });

    expect(activate.status).toBe(303);
    expect(db.prepare('SELECT is_active FROM users WHERE id = ?').get(staff.id).is_active).toBe(1);
    expect(auditCount('staff_activate', staff.id)).toBe(1);
  });

  it('returns 400 with an email field error when creating a duplicate email', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');
    const staff = seededStaff();

    const response = await agent
      .post('/admin/staff')
      .type('form')
      .send({
        full_name: 'Copy Cat',
        email: staff.email,
        password: 'Duplicate2026!',
        _csrf: token,
      });

    expect(response.status).toBe(400);
    const view = lastRender();
    expect(view.errors.email).toBe('That email is already in use.');
    expect(view.values.email).toBe(staff.email);
    const count = db
      .prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?')
      .get(staff.email).count;
    expect(count).toBe(1);
  });

  it('returns 400 with an email field error when editing to a duplicate email', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');
    const staff = seededStaff();
    const secondId = insertSecondStaff();

    const response = await agent
      .post(`/admin/staff/${secondId}`)
      .type('form')
      .send({
        full_name: 'Marco Second',
        email: staff.email,
        _csrf: token,
      });

    expect(response.status).toBe(400);
    const view = lastRender();
    expect(view.errors.email).toBe('That email is already in use.');
    expect(view.editingStaffId).toBe(secondId);
    expect(view.values.email).toBe(staff.email);
    const row = db.prepare('SELECT email FROM users WHERE id = ?').get(secondId);
    expect(row.email).toBe('marco.staff@cspc.edu.ph');
  });

  it('returns 403 for staff and students on every staff account route', async () => {
    const staffAgent = request.agent(app);
    await login(staffAgent, 'staff@cspc.edu.ph');
    const staffToken = await getCsrf(staffAgent, '/staff/queue');

    for (const testCase of STAFF_ROUTE_CASES) {
      const response = testCase.method === 'get'
        ? await staffAgent.get(testCase.path)
        : await staffAgent.post(testCase.path).type('form').send({ ...testCase.body, _csrf: staffToken });
      expect(response.status).toBe(403);
    }

    const studentAgent = request.agent(app);
    await login(studentAgent, 'student1@cspc.edu.ph');
    const studentToken = await getCsrf(studentAgent, '/queue');

    for (const testCase of STAFF_ROUTE_CASES) {
      const response = testCase.method === 'get'
        ? await studentAgent.get(testCase.path)
        : await studentAgent.post(testCase.path).type('form').send({ ...testCase.body, _csrf: studentToken });
      expect(response.status).toBe(403);
    }
  });

  it('redirects anonymous visitors to login on every staff account route', async () => {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/login');

    for (const testCase of STAFF_ROUTE_CASES) {
      const response = testCase.method === 'get'
        ? await agent.get(testCase.path)
        : await agent.post(testCase.path).type('form').send({ ...testCase.body, _csrf: token });
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/login');
    }
  });

  it('rejects a staff account mutation without a CSRF token', async () => {
    const agent = await adminAgent();

    const response = await agent
      .post('/admin/staff')
      .type('form')
      .send({ full_name: 'No Token', email: 'no.token@cspc.edu.ph', password: 'NoToken2026!' });

    expect(response.status).toBe(403);
  });

  it('returns 404 for unknown ids and ids that belong to an admin', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');
    const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
    const targetIds = [99999, adminId];
    const actions = [
      { path: (id) => `/admin/staff/${id}`, body: { full_name: 'Ghost', email: 'ghost@cspc.edu.ph' } },
      { path: (id) => `/admin/staff/${id}/password`, body: { password: 'GhostPass2026!' } },
      { path: (id) => `/admin/staff/${id}/status`, body: { isActive: '0' } },
    ];

    for (const id of targetIds) {
      for (const action of actions) {
        const response = await agent
          .post(action.path(id))
          .type('form')
          .send({ ...action.body, _csrf: token });
        expect(response.status).toBe(404);
      }
    }
  });

  it('blocks an inactive account from logging in and ends its existing session', async () => {
    const admin = await adminAgent();
    const staffAgent = request.agent(app);
    await login(staffAgent, 'staff@cspc.edu.ph');
    const staff = seededStaff();
    const token = await getCsrf(admin, '/admin/services');

    const deactivate = await admin
      .post(`/admin/staff/${staff.id}/status`)
      .type('form')
      .send({ isActive: '0', _csrf: token });
    expect(deactivate.status).toBe(303);

    const freshAgent = request.agent(app);
    const loginAttempt = await login(freshAgent, 'staff@cspc.edu.ph');
    expect(loginAttempt.status).toBe(401);
    expect(loginAttempt.text).toContain('Email or password is incorrect.');

    const existingSession = await staffAgent.get('/staff/queue');
    expect(existingSession.status).toBe(302);
    expect(existingSession.headers.location).toContain('/login');
  });
});
