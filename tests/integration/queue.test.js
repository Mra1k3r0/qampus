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

describe('queue read model', () => {
  let db;
  let app;
  let cleanup;

  beforeAll(() => {
    const testDb = createTestDatabase({ includeTickets: true });
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

  it('shows a student their active ticket with position and wait', async () => {
    const agent = request.agent(app);
    await login(agent, 'student1@cspc.edu.ph');

    const response = await agent.get('/queue');

    expect(response.status).toBe(200);
    expect(response.text).toContain('REG-001');
    expect(response.text).toContain('Registrar');
    expect(response.text).toContain('Position');
    expect(response.text).toContain('Est. wait');
  });

  it('renders the called-ticket sound control with the current call count', async () => {
    const agent = request.agent(app);
    await login(agent, 'student1@cspc.edu.ph');
    const row = db.prepare('SELECT call_count FROM tickets WHERE id = 1').get();

    const response = await agent.get('/queue/tickets/1');

    expect(response.status).toBe(200);
    expect(response.text).toContain('data-called-sound');
    expect(response.text).toContain('src="/audio/called.mp3"');
    expect(response.text).toContain(`data-call-count="${row.call_count}"`);
  });

  it('serves the called-ticket sound as a self-hosted mp3', async () => {
    const response = await request(app).get('/audio/called.mp3');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('audio/mpeg');
  });

  it('sends staff to the staff queue after login', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'staff@cspc.edu.ph');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/staff/queue');
  });

  it('shows the seeded waiting tickets and service windows on the staff console', async () => {
    const agent = request.agent(app);
    await login(agent, 'staff@cspc.edu.ph');

    const response = await agent.get('/staff/queue');

    expect(response.status).toBe(200);
    expect(response.text).toContain('REG-001');
    expect(response.text).toContain('CSH-002');
    expect(response.text).toContain('Library');
    expect(response.text).not.toContain('No service windows are loaded');
  });

  it('sends a signed-out visitor to the login page with a next path', async () => {
    const response = await request(app).get('/queue');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login?next=/queue');
  });

  it('returns 404 when a student opens another student ticket', async () => {
    const agent = request.agent(app);
    await login(agent, 'student2@cspc.edu.ph');

    const response = await agent.get('/queue/tickets/1');

    expect(response.status).toBe(404);
  });
});
