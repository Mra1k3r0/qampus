import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import ticketsService from '../../src/modules/tickets/tickets.service.js';
import ticketsSweep from '../../src/modules/tickets/tickets.sweep.js';

const cjsRequire = createRequire(import.meta.url);
const { migrate } = cjsRequire('../../src/core/db');
const { serviceDate } = cjsRequire('../../src/core/time');
const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { expireStaleTickets } = ticketsSweep;

const NOW = new Date('2026-10-27T02:00:00.000Z').getTime();
const YESTERDAY = '2026-10-26';
const TODAY = '2026-10-27';

describe('stale ticket expiry', () => {
  let db;
  let cleanup;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function students() {
    return db.prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id").all();
  }

  function staffId() {
    return db.prepare("SELECT id FROM users WHERE role = 'staff'").get().id;
  }

  function insertTicket({
    status = 'waiting',
    serviceId = 1,
    userId,
    sequence = 1,
    serviceDate: ticketDate = YESTERDAY,
    code = `OLD-${status}`,
  }) {
    const createdAt = `${ticketDate}T01:00:00.000Z`;
    const result = db
      .prepare(
        `INSERT INTO tickets
          (code, service_id, user_id, status, service_date, sequence, call_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(code, serviceId, userId, status, ticketDate, sequence, createdAt, createdAt);
    return Number(result.lastInsertRowid);
  }

  function auditCount() {
    return db.prepare('SELECT COUNT(*) AS count FROM audit_log').get().count;
  }

  it('expires active tickets from earlier service dates and leaves today alone', () => {
    const [first, second, third, fourth, fifth] = students();
    const waitingId = insertTicket({ userId: first.id, serviceId: 1, sequence: 1 });
    const calledId = insertTicket({
      userId: second.id,
      serviceId: 2,
      status: 'called',
      sequence: 1,
      code: 'OLD-CALLED',
    });
    const servingId = insertTicket({
      userId: third.id,
      serviceId: 3,
      status: 'serving',
      sequence: 1,
      code: 'OLD-SERVING',
    });
    const todayId = insertTicket({
      userId: fourth.id,
      serviceId: 1,
      serviceDate: TODAY,
      code: 'REG-001',
    });
    const servedId = insertTicket({
      userId: fifth.id,
      serviceId: 1,
      status: 'served',
      serviceDate: YESTERDAY,
      sequence: 2,
      code: 'OLD-SERVED',
    });

    const result = expireStaleTickets(db, { requestId: 'sweep-1' });

    expect(result).toMatchObject({ date: TODAY, expired: 3, dryRun: false });
    for (const ticketId of [waitingId, calledId, servingId]) {
      const row = db.prepare('SELECT status, ended_at FROM tickets WHERE id = ?').get(ticketId);
      expect(row.status).toBe('expired');
      expect(row.ended_at).toBe('2026-10-26T16:00:00.000Z');
    }
    expect(db.prepare('SELECT status FROM tickets WHERE id = ?').get(todayId).status).toBe('waiting');
    expect(db.prepare('SELECT status FROM tickets WHERE id = ?').get(servedId).status).toBe('served');

    const audits = db
      .prepare("SELECT actor_user_id, before_json, after_json, request_id FROM audit_log WHERE action = 'ticket.expire'")
      .all();
    expect(audits).toHaveLength(3);
    for (const audit of audits) {
      expect(audit.actor_user_id).toBeNull();
      expect(audit.request_id).toBe('sweep-1');
      expect(JSON.parse(audit.before_json).serviceDate).toBe(YESTERDAY);
      expect(JSON.parse(audit.after_json)).toMatchObject({
        status: 'expired',
        reason: 'service_day_ended',
      });
    }

    expect(expireStaleTickets(db).expired).toBe(0);
  });

  it('starts today at sequence 1 after yesterday tickets are expired', () => {
    const [first, second] = students();
    insertTicket({ userId: first.id, serviceId: 1, sequence: 5, code: 'REG-005' });

    expireStaleTickets(db);
    const result = ticketsService.joinQueue(db, {
      userId: second.id,
      serviceId: 1,
      requestId: 'join-1',
      enforceHours: false,
    });

    expect(result.ticket.code).toBe('REG-001');
    expect(result.ticket.serviceDate).toBe(TODAY);
  });

  it('counts stale tickets without changing them in dry-run mode', () => {
    const [first] = students();
    const ticketId = insertTicket({ userId: first.id });

    const result = expireStaleTickets(db, { dryRun: true });

    expect(result).toMatchObject({ date: TODAY, expired: 1, dryRun: true });
    expect(db.prepare('SELECT status FROM tickets WHERE id = ?').get(ticketId).status).toBe('waiting');
    expect(auditCount()).toBe(0);
  });

  it('shows an earlier active ticket as expired and rejects transitions before the sweep runs', () => {
    const [first, second] = students();
    const waitingId = insertTicket({ userId: first.id, serviceId: 1 });
    const calledId = insertTicket({
      userId: second.id,
      serviceId: 2,
      status: 'called',
      sequence: 1,
      code: 'OLD-CALLED',
    });
    const before = auditCount();

    const view = ticketsService.getStudentTicket(db, {
      userId: first.id,
      ticketId: waitingId,
    });
    expect(view.status).toBe('expired');
    expect(view.statusLabel).toBe('Expired');
    expect(view.endedCaption).toBe('Expired');

    expect(() =>
      ticketsService.leaveTicket(db, {
        userId: first.id,
        ticketId: waitingId,
        requestId: 'request-1',
      }),
    ).toThrow(/waiting ticket/i);
    expect(() =>
      ticketsService.startTicket(db, {
        ticketId: calledId,
        staffUserId: staffId(),
        requestId: 'request-2',
      }),
    ).toThrow(/called ticket/i);
    expect(auditCount()).toBe(before);
  });

  it('expires stale tickets on the first request after the service day changes', async () => {
    const [first] = students();
    const ticketId = insertTicket({ userId: first.id });
    const { app } = createTestApp(db);

    const response = await request(app).get('/display');

    expect(response.status).toBe(200);
    expect(serviceDate()).toBe(TODAY);
    expect(db.prepare('SELECT status FROM tickets WHERE id = ?').get(ticketId).status).toBe('expired');
    const audit = db
      .prepare("SELECT request_id FROM audit_log WHERE action = 'ticket.expire'")
      .get();
    expect(audit.request_id).toBeTruthy();
  });

  it('migrates an old tickets table to accept the expired status', () => {
    const testDb = createTestDatabase({ seed: true, includeTickets: true });
    const oldDb = testDb.db;
    try {
      oldDb.prepare("DELETE FROM schema_migrations WHERE version = '004_ticket_expired_status'").run();
      oldDb.exec('DROP TABLE tickets');

      const schema = fs
        .readFileSync(path.join(process.cwd(), 'src/core/schema.sql'), 'utf8')
        .replace("'no_show', 'expired'", "'no_show'");
      oldDb.exec(schema);

      const [first] = oldDb
        .prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id")
        .all();
      const inserted = oldDb
        .prepare(
          `INSERT INTO tickets
            (code, service_id, user_id, status, service_date, sequence, call_count, created_at, updated_at)
           VALUES ('OLD-001', 1, ?, 'waiting', ?, 1, 0, ?, ?)`,
        )
        .run(first.id, YESTERDAY, `${YESTERDAY}T01:00:00.000Z`, `${YESTERDAY}T01:00:00.000Z`);
      const ticketId = Number(inserted.lastInsertRowid);

      expect(migrate(oldDb)).toBe(true);
      const tableSql = oldDb
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tickets'")
        .get().sql;
      expect(tableSql).toContain("'expired'");
      expect(oldDb.prepare('SELECT status FROM tickets WHERE id = ?').get(ticketId).status).toBe(
        'waiting',
      );
      oldDb.prepare("UPDATE tickets SET status = 'expired' WHERE id = ?").run(ticketId);
      expect(oldDb.prepare('SELECT status FROM tickets WHERE id = ?').get(ticketId).status).toBe(
        'expired',
      );
      const indexes = oldDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'tickets'")
        .all()
        .map((row) => row.name);
      expect(indexes).toEqual(
        expect.arrayContaining(['one_active_ticket', 'idx_tickets_waiting', 'idx_tickets_user_active']),
      );
      const next = oldDb
        .prepare(
          `INSERT INTO tickets
            (code, service_id, user_id, status, service_date, sequence, call_count, created_at, updated_at)
           VALUES ('NEW-001', 1, ?, 'waiting', ?, 1, 0, ?, ?)`,
        )
        .run(first.id, TODAY, `${TODAY}T02:00:00.000Z`, `${TODAY}T02:00:00.000Z`);
      expect(Number(next.lastInsertRowid)).toBeGreaterThan(ticketId);
      expect(migrate(oldDb)).toBe(false);
    } finally {
      testDb.cleanup();
    }
  });
});
