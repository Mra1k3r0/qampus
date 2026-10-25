import { describe, it, expect } from 'vitest';
import security from '../../src/core/security.js';
import ticketsRules from '../../src/modules/tickets/tickets.rules.js';

const { isStaff, safeNextPath, homePathFor } = security;
const { canLeave, canJoin } = ticketsRules;

describe('security predicates', () => {
  it('identifies staff and admin roles only', () => {
    expect(isStaff({ role: 'staff' })).toBe(true);
    expect(isStaff({ role: 'admin' })).toBe(true);
    expect(isStaff({ role: 'student' })).toBe(false);
    expect(isStaff(null)).toBe(false);
  });

  it('maps each role to its home path', () => {
    expect(homePathFor('student')).toBe('/queue');
    expect(homePathFor('staff')).toBe('/staff/queue');
    expect(homePathFor('admin')).toBe('/admin/services');
    expect(homePathFor('unknown')).toBe('/login');
    expect(homePathFor(undefined)).toBe('/login');
  });

  it('only accepts local next paths', () => {
    expect(safeNextPath('/queue')).toBe('/queue');
    expect(safeNextPath('/staff/queue?status=waiting')).toBe('/staff/queue?status=waiting');
    expect(safeNextPath('https://evil.example')).toBe(null);
    expect(safeNextPath('//evil.example')).toBe(null);
    expect(safeNextPath('/\\evil.example')).toBe(null);
    expect(safeNextPath('')).toBe(null);
  });
});

describe('ticket ownership predicates', () => {
  const owner = { id: 1, role: 'student' };
  const other = { id: 2, role: 'student' };
  const ticket = { userId: 1, status: 'waiting' };

  it('allows only the owner to leave a waiting ticket', () => {
    expect(canLeave(ticket, owner)).toBe(true);
    expect(canLeave(ticket, other)).toBe(false);
    expect(canLeave({ ...ticket, status: 'called' }, owner)).toBe(false);
  });

  it('allows only students to join the queue', () => {
    expect(canJoin(owner)).toBe(true);
    expect(canJoin({ id: 3, role: 'staff' })).toBe(false);
  });
});
