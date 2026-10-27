import { describe, it, expect } from 'vitest';
import ticketsService from '../../src/modules/tickets/tickets.service.js';
import ticketsRules from '../../src/modules/tickets/tickets.rules.js';

const { ticketCode } = ticketsService;
const {
  isOwner,
  canViewTicket,
  canLeave,
  canJoin,
  isActiveStatus,
  evaluateJoinPolicy,
  estimateWaitMinutes,
  serviceScheduleState,
  toServiceView,
} = ticketsRules;

describe('ticket codes', () => {
  it('pads the sequence to three digits after the window code', () => {
    expect(ticketCode('REG', 7)).toBe('REG-007');
    expect(ticketCode('LIB', 120)).toBe('LIB-120');
  });
});

describe('ticket ownership rules', () => {
  const owner = { id: 1, role: 'student' };
  const otherStudent = { id: 2, role: 'student' };
  const staff = { id: 3, role: 'staff' };
  const admin = { id: 4, role: 'admin' };
  const waitingTicket = { userId: 1, status: 'waiting' };
  const calledTicket = { userId: 1, status: 'called' };

  it('recognises the owner and rejects another student', () => {
    expect(isOwner(waitingTicket, owner)).toBe(true);
    expect(isOwner(waitingTicket, otherStudent)).toBe(false);
  });

  it('lets staff and the office head view any ticket, students only their own', () => {
    expect(canViewTicket(waitingTicket, staff)).toBe(true);
    expect(canViewTicket(waitingTicket, admin)).toBe(true);
    expect(canViewTicket(waitingTicket, owner)).toBe(true);
    expect(canViewTicket(waitingTicket, otherStudent)).toBe(false);
    expect(canViewTicket(waitingTicket, null)).toBe(false);
  });

  it('allows leaving only a waiting ticket the user owns', () => {
    expect(canLeave(waitingTicket, owner)).toBe(true);
    expect(canLeave(calledTicket, owner)).toBe(false);
    expect(canLeave(waitingTicket, otherStudent)).toBe(false);
  });

  it('allows only signed-in students to join a queue', () => {
    expect(canJoin(owner)).toBe(true);
    expect(canJoin(staff)).toBe(false);
    expect(canJoin(null)).toBe(false);
  });

  it('treats waiting, called, and serving as active, and served, left, and no_show as closed', () => {
    expect(isActiveStatus('waiting')).toBe(true);
    expect(isActiveStatus('called')).toBe(true);
    expect(isActiveStatus('serving')).toBe(true);
    expect(isActiveStatus('served')).toBe(false);
    expect(isActiveStatus('left')).toBe(false);
    expect(isActiveStatus('no_show')).toBe(false);
  });
});

describe('wait estimates', () => {
  const base = {
    position: 1,
    avgMinutes: 8,
    now: '2026-10-27T01:02:00.000Z',
  };

  it('returns zero when the student is next and no ticket holds the window', () => {
    expect(estimateWaitMinutes(base)).toBe(0);
  });

  it('multiplies the waiting tickets ahead by the service average', () => {
    expect(estimateWaitMinutes({ ...base, position: 4 })).toBe(24);
  });

  it('adds the full average while a called ticket holds the window', () => {
    expect(estimateWaitMinutes({ ...base, currentStatus: 'called' })).toBe(8);
  });

  it('adds the remaining average while a ticket is being served', () => {
    expect(estimateWaitMinutes({
      ...base,
      currentStatus: 'serving',
      currentStartedAt: '2026-10-27T01:00:00.000Z',
    })).toBe(6);
  });

  it('never drops below zero when the serving ticket runs long', () => {
    expect(estimateWaitMinutes({
      ...base,
      currentStatus: 'serving',
      currentStartedAt: '2026-10-26T23:00:00.000Z',
    })).toBe(0);
  });

  it('uses the full average when a serving ticket has no start time', () => {
    expect(estimateWaitMinutes({
      ...base,
      currentStatus: 'serving',
      currentStartedAt: null,
    })).toBe(8);
  });
});

describe('join window policy', () => {
  const service = {
    isOpen: true,
    openDays: JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
    opensAt: '08:00',
    closesAt: '17:00',
  };

  function at(minutes, overrides = {}) {
    return evaluateJoinPolicy({ service, weekday: 'Mon', minutes, ...overrides });
  }

  it('rejects 07:59, one minute before the window opens', () => {
    const decision = at(7 * 60 + 59);

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(409);
    expect(decision.message).toBe('That service window is closed right now.');
  });

  it('allows 08:00 when the window opens', () => {
    expect(at(8 * 60).allowed).toBe(true);
  });

  it('allows 16:29, one minute before the join cutoff', () => {
    expect(at(16 * 60 + 29).allowed).toBe(true);
  });

  it('rejects 16:30 because it is within 30 minutes of closing', () => {
    const decision = at(16 * 60 + 30);

    expect(decision.allowed).toBe(false);
    expect(decision.message).toBe('That window closes soon. Try again when it reopens.');
  });

  it('rejects 16:59 for the same closing cutoff', () => {
    expect(at(16 * 60 + 59).allowed).toBe(false);
  });

  it('rejects Sunday even during the usual clock hours', () => {
    const decision = at(10 * 60, { weekday: 'Sun' });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(409);
  });

  it('allows a join outside hours when QUEUE_ENFORCE_HOURS is off', () => {
    const decision = at(10 * 60, { weekday: 'Sun', enforceHours: false });

    expect(decision.allowed).toBe(true);
  });

  it('still enforces the cap when hours are not enforced', () => {
    const decision = at(10 * 60, { weekday: 'Sun', enforceHours: false, activeCount: 2 });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(409);
  });
});

describe('service schedule state', () => {
  const service = {
    isOpen: true,
    openDays: JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']),
    opensAt: '08:00',
    closesAt: '17:00',
  };

  function at(minutes, overrides = {}) {
    return serviceScheduleState({ service, weekday: 'Tue', minutes, ...overrides });
  }

  it('closes a weekday window at 17:38 PHT', () => {
    expect(at(17 * 60 + 38)).toEqual({ isOpen: false, reason: 'after-hours' });
  });

  it('keeps a weekday window open at 16:45 PHT', () => {
    expect(at(16 * 60 + 45)).toEqual({ isOpen: true, reason: 'open' });
  });

  it('closes a weekday window before 08:00 PHT', () => {
    expect(at(7 * 60)).toEqual({ isOpen: false, reason: 'before-hours' });
  });

  it('closes the window on a non-open day', () => {
    expect(at(10 * 60, { weekday: 'Sat' })).toEqual({ isOpen: false, reason: 'closed-day' });
  });

  it('derives the effective view state from the schedule', () => {
    const beforeHours = toServiceView(service, { weekday: 'Tue', minutes: 7 * 60 });
    const afterHours = toServiceView(service, { weekday: 'Tue', minutes: 17 * 60 + 38 });
    const cutoff = toServiceView(service, { weekday: 'Tue', minutes: 16 * 60 + 45 });

    expect(afterHours.isOpen).toBe(false);
    expect(afterHours.openLabel).toBe('Closed');
    expect(afterHours.openClass).toBe('pill--closed');
    expect(afterHours.scheduleState.reason).toBe('after-hours');
    expect(beforeHours.isOpen).toBe(false);
    expect(beforeHours.scheduleState.reason).toBe('before-hours');
    expect(cutoff.isOpen).toBe(true);
    expect(cutoff.openLabel).toBe('Open');
    expect(evaluateJoinPolicy({
      service,
      weekday: 'Tue',
      minutes: 16 * 60 + 45,
    }).message).toBe('That window closes soon. Try again when it reopens.');
  });

  it('keeps a manual close closed even inside the schedule', () => {
    const view = toServiceView(
      { ...service, isOpen: false },
      { weekday: 'Tue', minutes: 10 * 60 },
    );

    expect(view.isOpen).toBe(false);
    expect(view.openLabel).toBe('Closed');
    expect(view.scheduleState.isOpen).toBe(true);
  });

  it('does not let the schedule close the window in demo mode', () => {
    const view = toServiceView(service, {
      weekday: 'Tue',
      minutes: 17 * 60 + 38,
      enforceHours: false,
    });

    expect(view.isOpen).toBe(true);
  });
});
