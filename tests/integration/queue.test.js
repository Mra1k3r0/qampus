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
    await login(agent, 'student1@my.cspc.edu.ph');

    const response = await agent.get('/queue');

    expect(response.status).toBe(200);
    expect(response.text).toContain('REG-001');
    expect(response.text).toContain('Registrar');
    expect(response.text).toContain('Position');
    expect(response.text).toContain('Est. wait');
  });

  it('renders the global call watcher for a signed-in student', async () => {
    const agent = request.agent(app);
    await login(agent, 'student1@my.cspc.edu.ph');

    const response = await agent.get('/queue/tickets/1');

    expect(response.status).toBe(200);
    expect(response.text).toContain('data-call-watch');
    expect(response.text).toContain('data-status-url="/api/queue/status"');
    expect(response.text).toContain('data-call-code');
    expect(response.text).toContain('data-call-service');
    expect(response.text).toContain('data-call-counter');
    expect(response.text).toContain('data-call-open');
    expect(response.text).toContain('data-call-dismiss');
    expect(response.text).toContain('/js/call-watch.min.js');
    expect(response.text).toContain('data-ticket-status=');
    expect(response.text).not.toContain('data-called-sound');
    expect(response.text).not.toContain('data-sound-toggle');
    expect(response.text).not.toContain('aria-label="Turn off call sound"');
    expect(response.text).not.toContain('data-call-count=');
  });

  it('keeps the called-ticket dialog outside the live region', async () => {
    const agent = request.agent(app);
    await login(agent, 'student1@my.cspc.edu.ph');

    const response = await agent.get('/queue/tickets/1');
    const liveBlock = response.text.match(/<div data-live-region[\s\S]*?<\/article>\s*<\/div>/);
    const dialogCount = response.text.split('data-call-dialog').length - 1;

    expect(response.status).toBe(200);
    expect(liveBlock).not.toBeNull();
    expect(liveBlock[0]).not.toContain('data-call-dialog');
    expect(dialogCount).toBe(1);
  });

  it('labels the global dialog with its ticket fields and actions', async () => {
    const agent = request.agent(app);
    await login(agent, 'student1@my.cspc.edu.ph');

    const response = await agent.get('/queue/tickets/1');
    const dialogStart = response.text.indexOf('<dialog class="call-dialog"');

    expect(response.status).toBe(200);
    expect(dialogStart).toBeGreaterThan(-1);

    const dialog = response.text.slice(dialogStart, response.text.indexOf('</dialog>', dialogStart));

    expect(dialog).toContain('role="alertdialog"');
    expect(dialog).toContain('aria-labelledby="call-dialog-title"');
    expect(dialog).toContain('aria-describedby="call-dialog-desc"');
    expect(dialog).toContain('id="call-dialog-title">Your turn</h2>');
    expect(dialog).toContain('id="call-dialog-desc"');
    expect(dialog).toContain('data-call-code');
    expect(dialog).toContain('data-call-service');
    expect(dialog).toContain('data-call-counter');
    expect(dialog).toContain('data-call-open');
    expect(dialog).toContain('Open ticket');
    expect(dialog).toContain('data-call-dismiss');
    expect(dialog).toContain('>Got it</button>');
    expect(response.text).toContain('data-ticket-code');
    expect(response.text).toContain('data-ticket-service');
    expect(response.text).toContain('data-ticket-counter');
  });

  it('serves the called-ticket sound as a self-hosted mp3', async () => {
    const response = await request(app).get('/audio/called.mp3');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('audio/mpeg');
  });

  it('sends staff to the staff queue after login', async () => {
    const agent = request.agent(app);
    const response = await login(agent, 'staff@my.cspc.edu.ph');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/staff/queue');
  });

  it('shows the seeded waiting tickets and service windows on the staff console', async () => {
    const agent = request.agent(app);
    await login(agent, 'staff@my.cspc.edu.ph');

    const response = await agent.get('/staff/queue');

    expect(response.status).toBe(200);
    expect(response.text).toContain('REG-001');
    expect(response.text).toContain('CSH-002');
    expect(response.text).toContain('Library');
    expect(response.text).not.toContain('No service windows are loaded');
    expect(response.text).not.toContain('data-call-watch');
    expect(response.text).not.toContain('/js/call-watch.min.js');
  });

  it('sends a signed-out visitor to the login page with a next path', async () => {
    const response = await request(app).get('/queue');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login?next=/queue');
  });

  it('returns 404 when a student opens another student ticket', async () => {
    const agent = request.agent(app);
    await login(agent, 'student2@my.cspc.edu.ph');

    const response = await agent.get('/queue/tickets/1');

    expect(response.status).toBe(404);
  });

  it('redirects a signed-out visitor from the call status API to login', async () => {
    const response = await request(app).get('/api/queue/status');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login?next=/api/queue/status');
  });

  it('returns 403 when staff opens the student call status API', async () => {
    const agent = request.agent(app);
    await login(agent, 'staff@my.cspc.edu.ph');

    const response = await agent.get('/api/queue/status');

    expect(response.status).toBe(403);
  });

  it('returns only the signed-in student ticket fields from the call status API', async () => {
    const agent = request.agent(app);
    await login(agent, 'student1@my.cspc.edu.ph');

    const response = await agent.get('/api/queue/status');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.tickets).toHaveLength(1);

    const [ticket] = response.body.tickets;
    expect(ticket.status).toBe('waiting');
    expect(ticket.callCount).toBe(0);
    expect(ticket.serviceName).toBe('Registrar');
    expect(ticket).toHaveProperty('counterName');
    expect(ticket).not.toHaveProperty('studentName');
    expect(ticket).not.toHaveProperty('email');
    expect(ticket).not.toHaveProperty('studentNo');
  });

  it('reports the called status and incremented call count from the call status API', async () => {
    db.prepare('UPDATE tickets SET status = ?, call_count = call_count + 1 WHERE id = ?')
      .run('called', 1);

    const agent = request.agent(app);
    await login(agent, 'student1@my.cspc.edu.ph');

    const response = await agent.get('/api/queue/status');

    expect(response.status).toBe(200);
    expect(response.body.tickets).toHaveLength(1);
    expect(response.body.tickets[0].status).toBe('called');
    expect(response.body.tickets[0].callCount).toBe(1);
  });
});
