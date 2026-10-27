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

describe('wait estimates', () => {
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

  it('adds the ticket at the desk to a waiting estimate', async () => {
    const now = new Date().toISOString();
    db.prepare("UPDATE tickets SET status = 'called', called_at = ?, updated_at = ? WHERE id = 1")
      .run(now, now);

    const agent = request.agent(app);
    await login(agent, 'student5@my.cspc.edu.ph');

    const response = await agent.get('/queue/tickets/5');

    expect(response.status).toBe(200);
    expect(response.text).toContain('REG-002');
    expect(response.text).toMatch(/Est\. wait<\/dt>\s*<dd class="fact__value">8 min<\/dd>/);
  });

  it('uses the remaining average while the desk ticket is being served', async () => {
    const startedAt = new Date(Date.now() - (2 * 60 * 1000)).toISOString();
    db.prepare("UPDATE tickets SET status = 'serving', started_at = ?, updated_at = ? WHERE id = 1")
      .run(startedAt, startedAt);

    const agent = request.agent(app);
    await login(agent, 'student5@my.cspc.edu.ph');

    const response = await agent.get('/queue/tickets/5');

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/Est\. wait<\/dt>\s*<dd class="fact__value">6 min<\/dd>/);
  });
});
