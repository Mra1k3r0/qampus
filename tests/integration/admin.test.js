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

describe('admin service windows', () => {
  let db;
  let app;
  let cleanup;

  beforeAll(() => {
    const testDb = createTestDatabase({ includeTickets: false });
    db = testDb.db;
    cleanup = testDb.cleanup;
    app = createTestApp(db).app;
  });

  afterAll(() => {
    cleanup();
  });

  async function login(agent, email) {
    const token = await getCsrf(agent, '/login');
    return agent.post('/login').type('form').send({ email, password: DEMO_PASSWORD, _csrf: token });
  }

  async function adminAgent() {
    const agent = request.agent(app);
    await login(agent, 'admin@cspc.edu.ph');
    return agent;
  }

  function validUpdate(overrides = {}) {
    return {
      name: 'Registrar Extended',
      description: 'Enrollment records, transcripts, and late enrollment.',
      avgMinutes: '12',
      opensAt: '08:00',
      closesAt: '17:00',
      isOpen: '1',
      ...overrides,
    };
  }

  it('returns 403 when staff opens the admin page', async () => {
    const agent = request.agent(app);
    await login(agent, 'staff@cspc.edu.ph');

    const response = await agent.get('/admin/services');

    expect(response.status).toBe(403);
  });

  it('lists the seeded windows for the office head', async () => {
    const agent = await adminAgent();

    const response = await agent.get('/admin/services');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Registrar');
    expect(response.text).toContain('Cashier');
  });

  it('updates a window, redirects, and writes an audit row', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');

    const response = await agent
      .post('/admin/services/1')
      .type('form')
      .send({ ...validUpdate(), _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/admin/services');

    const page = await agent.get('/admin/services');
    expect(page.text).toContain('Registrar Extended');

    const audit = db
      .prepare(
        "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'service.update' AND entity_id = 1",
      )
      .get();
    expect(audit.count).toBe(1);
  });

  it('re-renders the form with field errors on an invalid average wait', async () => {
    const agent = await adminAgent();
    const token = await getCsrf(agent, '/admin/services');

    const response = await agent
      .post('/admin/services/1')
      .type('form')
      .send({ ...validUpdate({ avgMinutes: '0' }), _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Average wait must be at least 1 minute.');
  });

  it('rejects a window update without a CSRF token', async () => {
    const agent = await adminAgent();

    const response = await agent.post('/admin/services/1').type('form').send(validUpdate());

    expect(response.status).toBe(403);
  });
});
