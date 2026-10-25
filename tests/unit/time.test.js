import { describe, it, expect } from 'vitest';
import time from '../../src/core/time.js';

const { serviceDate, formatTime, formatDateTime } = time;

describe('Asia/Manila service date', () => {
  it('rolls to the next day at 16:30 UTC', () => {
    expect(serviceDate(new Date('2026-10-20T16:30:00Z'))).toBe('2026-10-21');
  });

  it('stays on the same day at 15:59 UTC', () => {
    expect(serviceDate(new Date('2026-10-20T15:59:00Z'))).toBe('2026-10-20');
  });

  it('formats times in Manila, not the host zone', () => {
    expect(formatTime(new Date('2026-10-20T08:00:00Z'))).toBe('4:00 PM');
    expect(formatDateTime(new Date('2026-10-20T08:00:00Z'))).toContain('4:00 PM');
  });
});
