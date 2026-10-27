import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';

const cjsRequire = createRequire(import.meta.url);
const config = cjsRequire('../../src/config');

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;

const STUDENT_EMAIL = 'student1@my.cspc.edu.ph';
const MONDAY_10AM = new Date('2026-10-26T02:00:00.000Z').getTime();
const ONE_MINUTE_MS = 60 * 1000;

describe('join policy', () => {
  let db;
  let app;
  let cleanup;
  let nowMs;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    nowMs = MONDAY_10AM;
    vi.setSystemTime(new Date(nowMs));

    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
    app = createTestApp(db).app;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function advance(ms) {
    nowMs += ms;
    vi.setSystemTime(new Date(nowMs));
  }

  async function login(email = STUDENT_EMAIL) {
    const agent = request.agent(app);
    const token = await getCsrf(agent, '/login');
    await agent.post('/login').type('form').send({ email, password: DEMO_PASSWORD, _csrf: token });
    return agent;
  }

  async function join(agent, serviceId) {
    const token = await getCsrf(agent, '/queue');
    return agent.post(`/queue/${serviceId}/join`).type('form').send({ _csrf: token });
  }

  async function leave(agent, ticketId) {
    const token = await getCsrf(agent, '/queue');
    return agent
      .post(`/queue/tickets/${ticketId}/leave`)
      .type('form')
      .send({ _csrf: token });
  }

  function setService(serviceId, fields) {
    const assignments = Object.keys(fields).map((column) => `${column} = ?`).join(', ');
    db.prepare(`UPDATE services SET ${assignments} WHERE id = ?`).run(
      ...Object.values(fields),
      serviceId,
    );
  }

  function studentId() {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(STUDENT_EMAIL).id;
  }

  function insertNoShow({ serviceId, sequence, code }) {
    const createdAt = new Date(nowMs - 10 * ONE_MINUTE_MS).toISOString();
    db.prepare(
      `INSERT INTO tickets
        (code, service_id, user_id, status, service_date, sequence, call_count, created_at, updated_at)
       VALUES (?, ?, ?, 'no_show', '2026-10-26', ?, 1, ?, ?)`,
    ).run(code, serviceId, studentId(), sequence, createdAt, createdAt);
  }

  it('blocks a third active ticket across services', async () => {
    const agent = await login();

    expect((await join(agent, 1)).status).toBe(303);
    advance(ONE_MINUTE_MS);
    expect((await join(agent, 2)).status).toBe(303);
    advance(ONE_MINUTE_MS);

    const response = await join(agent, 3);

    expect(response.status).toBe(409);
    expect(response.text).toContain('You already hold 2 tickets today. Finish or leave one first.');
  });

  it('returns alreadyHeld when the same service is joined twice', async () => {
    const agent = await login();

    await join(agent, 1);
    const second = await join(agent, 1);

    expect(second.status).toBe(303);
    const page = await agent.get(second.headers.location);
    expect(page.text).toContain('You already hold ticket');
  });

  it('blocks a rejoin within 60 seconds and allows it after 61 seconds', async () => {
    const agent = await login();

    const first = await join(agent, 1);
    const ticketId = first.headers.location.split('/').pop();
    await leave(agent, ticketId);

    const blocked = await join(agent, 1);

    expect(blocked.status).toBe(429);
    expect(blocked.text).toContain('Give it a minute before taking another ticket.');

    advance(61 * 1000);
    const allowed = await join(agent, 1);

    expect(allowed.status).toBe(303);
  });

  it('blocks all joins after two no-shows and allows one', async () => {
    const oneNoShow = await login();
    insertNoShow({ serviceId: 1, sequence: 901, code: 'REG-901' });
    expect((await join(oneNoShow, 2)).status).toBe(303);

    const twoNoShows = await login();
    insertNoShow({ serviceId: 1, sequence: 902, code: 'REG-902' });
    insertNoShow({ serviceId: 2, sequence: 902, code: 'CSH-902' });

    const response = await join(twoNoShows, 3);

    expect(response.status).toBe(409);
    expect(response.text).toContain('You missed two calls today. You can join again tomorrow.');
  });

  it('rejects a join when the service is closed', async () => {
    const agent = await login();
    setService(1, { is_open: 0 });

    const response = await join(agent, 1);

    expect(response.status).toBe(409);
    expect(response.text).toContain('That service window is closed right now.');
  });

  it('rejects a join within 30 minutes of closing', async () => {
    const agent = await login();
    setService(1, { opens_at: '00:00', closes_at: '10:10' });

    const response = await join(agent, 1);

    expect(response.status).toBe(409);
    expect(response.text).toContain('That window closes soon. Try again when it reopens.');
  });

  it('allows a join outside hours when the hours flag is off', async () => {
    const agent = await login();
    setService(1, { opens_at: '12:00', closes_at: '17:00' });

    const previous = config.queueEnforceHours;
    config.queueEnforceHours = false;
    try {
      const response = await join(agent, 1);
      expect(response.status).toBe(303);
    } finally {
      config.queueEnforceHours = previous;
    }
  });

  function setWeekdayHours(serviceId) {
    setService(serviceId, {
      open_days: JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
      opens_at: '08:00',
      closes_at: '17:00',
    });
  }

  it('rejects a join at 17:38 PHT after the window closed', async () => {
    vi.setSystemTime(new Date('2026-10-27T09:38:00.000Z'));
    setWeekdayHours(1);
    const agent = await login();

    const response = await join(agent, 1);

    expect(response.status).toBe(409);
    expect(response.text).toContain('That service window is closed right now.');
  });

  it('rejects a join at 16:45 PHT within the closing cutoff', async () => {
    vi.setSystemTime(new Date('2026-10-27T08:45:00.000Z'));
    setWeekdayHours(1);
    const agent = await login();

    const response = await join(agent, 1);

    expect(response.status).toBe(409);
    expect(response.text).toContain('That window closes soon. Try again when it reopens.');
  });

  it('allows a join at 10:00 PHT inside the window', async () => {
    vi.setSystemTime(new Date('2026-10-27T02:00:00.000Z'));
    setWeekdayHours(1);
    const agent = await login();

    const response = await join(agent, 1);

    expect(response.status).toBe(303);
  });
});
