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

const REGISTRATOR_ID = 1;
const CASHIER_ID = 2;
const SCHOLARSHIP_ID = 3;
const LIBRARY_ID = 4;

describe('staff console', () => {
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

  async function staffAgent() {
    const agent = request.agent(app);
    await login(agent, 'staff@my.cspc.edu.ph');
    return agent;
  }

  it('returns 403 when a student opens the staff console', async () => {
    const agent = request.agent(app);
    await login(agent, 'student1@my.cspc.edu.ph');

    const response = await agent.get('/staff/queue');

    expect(response.status).toBe(403);
  });

  it('calls the oldest waiting registrar ticket and shows the student at the desk', async () => {
    const agent = await staffAgent();
    const token = await getCsrf(agent, '/staff/queue');

    const call = await agent
      .post(`/staff/queue/${REGISTRATOR_ID}/call-next`)
      .type('form')
      .send({ _csrf: token });

    expect(call.status).toBe(303);
    expect(call.headers.location).toBe('/staff/queue');

    const page = await agent.get('/staff/tickets/1');
    expect(page.status).toBe(200);
    expect(page.text).toContain('REG-001');
    expect(page.text).toContain('Alex Reyes');
  });

  it('starts then completes a called ticket', async () => {
    const agent = await staffAgent();
    const token = await getCsrf(agent, '/staff/queue');

    const start = await agent.post('/staff/tickets/1/start').type('form').send({ _csrf: token });
    expect(start.status).toBe(303);
    expect(start.headers.location).toBe('/staff/tickets/1');

    const serve = await agent.post('/staff/tickets/1/serve').type('form').send({ _csrf: token });
    expect(serve.status).toBe(303);
    expect(serve.headers.location).toBe('/staff/queue');

    const ticket = db.prepare('SELECT status FROM tickets WHERE id = 1').get();
    expect(ticket.status).toBe('served');
  });

  it('marks a called cashier ticket as no-show', async () => {
    const agent = await staffAgent();
    const token = await getCsrf(agent, '/staff/queue');

    await agent
      .post(`/staff/queue/${CASHIER_ID}/call-next`)
      .type('form')
      .send({ _csrf: token });

    const noShow = await agent
      .post('/staff/tickets/2/no-show')
      .type('form')
      .send({ _csrf: token });
    expect(noShow.status).toBe(303);
    expect(noShow.headers.location).toBe('/staff/queue');

    const ticket = db.prepare('SELECT status FROM tickets WHERE id = 2').get();
    expect(ticket.status).toBe('no_show');
  });

  it('recalls a called scholarship ticket and counts it as the second call', async () => {
    const agent = await staffAgent();
    const token = await getCsrf(agent, '/staff/queue');

    await agent
      .post(`/staff/queue/${SCHOLARSHIP_ID}/call-next`)
      .type('form')
      .send({ _csrf: token });

    const recall = await agent.post('/staff/tickets/3/recall').type('form').send({ _csrf: token });
    expect(recall.status).toBe(303);
    expect(recall.headers.location).toBe('/staff/tickets/3');

    const ticket = db.prepare('SELECT call_count FROM tickets WHERE id = 3').get();
    expect(ticket.call_count).toBe(2);
  });

  it('reports an empty window without failing the request', async () => {
    const agent = await staffAgent();
    const token = await getCsrf(agent, '/staff/queue');

    await agent.post(`/staff/queue/${LIBRARY_ID}/call-next`).type('form').send({ _csrf: token });
    const empty = await agent
      .post(`/staff/queue/${LIBRARY_ID}/call-next`)
      .type('form')
      .send({ _csrf: token });
    expect(empty.status).toBe(303);

    const page = await agent.get('/staff/queue');
    expect(page.text).toContain('No one is waiting for that window.');
  });

  it('returns 404 when staff opens a ticket that does not exist', async () => {
    const agent = await staffAgent();

    const response = await agent.get('/staff/tickets/99999');

    expect(response.status).toBe(404);
  });

  it('rejects a staff POST without a CSRF token', async () => {
    const agent = await staffAgent();

    const response = await agent.post(`/staff/queue/${REGISTRATOR_ID}/call-next`).type('form').send({});

    expect(response.status).toBe(403);
  });
});
