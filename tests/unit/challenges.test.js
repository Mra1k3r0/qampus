import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import dbModule from '../../src/core/db.js';
import repo from '../../src/modules/auth/auth.repository.js';
import challenges from '../../src/modules/auth/challenges.service.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const { openDatabase, migrate } = dbModule;
const { createUser } = repo;
const { issueChallenge, verifyChallenge, consumeThrottle } = challenges;

const NOW = '2026-10-27T02:00:00.000Z';
const ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
const TEST_CONFIG = {
  ttlMinutes: 10,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  authPepper: 'test-auth-pepper-0123456789abcdef',
  encryptionKey: ENCRYPTION_KEY,
};

let db;
let userId;

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function addSeconds(iso, seconds) {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

function activeChallenges(purpose = 'verify_email') {
  return db
    .prepare(
      `SELECT * FROM auth_challenges
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND superseded_at IS NULL`,
    )
    .all(userId, purpose);
}

function challengeRows(purpose = 'verify_email') {
  return db
    .prepare('SELECT * FROM auth_challenges WHERE user_id = ? AND purpose = ? ORDER BY id')
    .all(userId, purpose);
}

function outboxRows() {
  return db.prepare('SELECT * FROM mail_outbox ORDER BY id').all();
}

function issue(overrides = {}) {
  return issueChallenge(db, {
    userId,
    purpose: 'verify_email',
    email: 'student@example.com',
    config: TEST_CONFIG,
    now: NOW,
    ...overrides,
  });
}

async function fiveWrongAttempts(startIso) {
  const results = [];
  for (let index = 0; index < 5; index += 1) {
    results.push(await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: '00000000',
      now: addSeconds(startIso, index),
    }));
  }
  return results;
}

beforeEach(() => {
  db = openDatabase(':memory:', { journalMode: 'DELETE' });
  migrate(db);
  const user = createUser(db, {
    fullName: 'Challenge Student',
    studentNo: '2026-0200',
    email: 'student@example.com',
    passwordHash: 'hash',
    role: 'student',
    createdAt: NOW,
  });
  userId = user.id;
});

afterEach(() => {
  db.close();
});

describe('issueChallenge', () => {
  it('issues an 8-digit code and stores only a hash', async () => {
    const issued = await issue();

    expect(issued.id).toBeGreaterThan(0);
    expect(issued.code).toMatch(/^\d{8}$/);
    expect(issued.expiresAt).toBe(addMinutes(NOW, 10));

    const row = challengeRows()[0];
    expect(row.code_hash).not.toBe(issued.code);
    expect(row.code_hash).not.toContain(issued.code);
    expect(row.attempts).toBe(0);
    expect(row.max_attempts).toBe(5);
    expect(row.expires_at).toBe(issued.expiresAt);

    const stored = JSON.stringify(challengeRows());
    expect(stored).not.toContain(issued.code);
  });

  it('enqueues the matching email with an encrypted payload', async () => {
    const issued = await issue();

    const [mail] = outboxRows();
    expect(mail.to_email).toBe('student@example.com');
    expect(mail.template).toBe('verify-code');
    expect(mail.subject).toBe('Your Qampus verification code');
    expect(mail.payload_ciphertext).not.toContain(issued.code);

    const { open } = await import('../../src/core/mailer/crypto.js').then((mod) => mod.default);
    const data = JSON.parse(open({
      ciphertext: mail.payload_ciphertext,
      iv: mail.payload_iv,
      tag: mail.payload_tag,
    }, ENCRYPTION_KEY));

    expect(data).toMatchObject({ code: issued.code, ttlMinutes: 10 });
    expect(data.expiresAt).toBe(issued.expiresAt);
  });

  it('writes a verification requested audit row', async () => {
    const issued = await issue();

    const audits = db.prepare("SELECT * FROM audit_log WHERE action = 'auth.verification_requested'").all();
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_user_id).toBe(userId);
    expect(audits[0].entity_type).toBe('auth_challenge');
    expect(audits[0].entity_id).toBe(issued.id);
    expect(audits[0].after_json).toContain('verify_email');
    expect(audits[0].after_json).not.toContain(issued.code);
  });

  it('uses the reset template and audit action for password resets', async () => {
    const issued = await issue({ purpose: 'reset_password' });

    expect(issued.code).toMatch(/^\d{8}$/);
    expect(outboxRows()[0].template).toBe('reset-code');
    expect(outboxRows()[0].subject).toBe('Your Qampus password reset code');
    expect(
      db.prepare("SELECT * FROM audit_log WHERE action = 'auth.reset_requested'").all(),
    ).toHaveLength(1);
  });

  it('supersedes the previous active challenge so only one stays active', async () => {
    const first = await issue();
    const second = await issue({ now: addSeconds(NOW, 61) });

    const rows = challengeRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].superseded_at).toBe(addSeconds(NOW, 61));
    expect(rows[0].consumed_at).toBeNull();
    expect(activeChallenges()).toHaveLength(1);
    expect(activeChallenges()[0].id).toBe(second.id);
    expect(second.id).not.toBe(first.id);
  });

  it('rejects a resend inside the cooldown with a retry time', async () => {
    await issue();

    const failure = await issue({ now: addSeconds(NOW, 30) }).catch((err) => err);

    expect(failure.status).toBe(429);
    expect(failure.reason).toBe('cooldown');
    expect(failure.retryAfterSeconds).toBe(30);
    expect(challengeRows()).toHaveLength(1);
    expect(outboxRows()).toHaveLength(1);
  });

  it('rejects requests past the per-account limit with a different reason', async () => {
    await issue({ now: NOW });
    await issue({ now: addSeconds(NOW, 61) });
    await issue({ now: addSeconds(NOW, 122) });

    const failure = await issue({ now: addSeconds(NOW, 183) }).catch((err) => err);

    expect(failure.status).toBe(429);
    expect(failure.reason).toBe('throttled');
    expect(failure.retryAfterSeconds).toBeGreaterThan(0);
    expect(challengeRows()).toHaveLength(3);
    expect(outboxRows()).toHaveLength(3);
  });
});

describe('verifyChallenge', () => {
  it('accepts the valid code and consumes the challenge', async () => {
    const issued = await issue();

    const result = await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: issued.code,
      now: addMinutes(NOW, 1),
    });

    expect(result).toEqual({ ok: true, reason: null });

    const [row] = challengeRows();
    expect(row.consumed_at).toBe(addMinutes(NOW, 1));
    expect(row.verified_at).toBe(addMinutes(NOW, 1));
    expect(activeChallenges()).toHaveLength(0);

    const audits = db.prepare("SELECT * FROM audit_log WHERE action = 'auth.challenge_verified'").all();
    expect(audits).toHaveLength(1);
    expect(audits[0].after_json).toContain('verify_email');
  });

  it('rejects a wrong code and increments attempts', async () => {
    await issue();

    const result = await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: '00000000',
      now: addMinutes(NOW, 1),
    });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    const [row] = challengeRows();
    expect(row.attempts).toBe(1);
    expect(row.consumed_at).toBeNull();
    expect(row.superseded_at).toBeNull();
    expect(activeChallenges()).toHaveLength(1);
  });

  it('supersedes the challenge on the fifth wrong attempt', async () => {
    const issued = await issue();

    const results = await fiveWrongAttempts(addMinutes(NOW, 1));
    const reasons = results.map((item) => item.reason);
    expect(reasons).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'too_many_attempts']);

    const [row] = challengeRows();
    expect(row.attempts).toBe(5);
    expect(row.superseded_at).toBeTruthy();
    expect(activeChallenges()).toHaveLength(0);

    const after = await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: issued.code,
      now: addMinutes(NOW, 2),
    });
    expect(after).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects an expired code', async () => {
    const issued = await issue();

    const result = await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: issued.code,
      now: addMinutes(NOW, 11),
    });

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(challengeRows()[0].consumed_at).toBeNull();
    expect(activeChallenges()).toHaveLength(0);
  });

  it('returns missing when there is no active challenge', async () => {
    const result = await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: '12345678',
      now: NOW,
    });

    expect(result).toEqual({ ok: false, reason: 'missing' });
  });

  it('does not mark the user verified', async () => {
    const issued = await issue();

    await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: issued.code,
      now: addMinutes(NOW, 1),
    });

    const user = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(userId);
    expect(user.email_verified_at).toBeNull();
  });

  it('returns missing when the pending challenge is superseded during the compare', async () => {
    const first = await issue();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const originalCompare = bcrypt.compare;
    const compareSpy = vi.spyOn(bcrypt, 'compare').mockImplementation(async (code, hash) => {
      await gate;
      return originalCompare(code, hash);
    });

    try {
      const verification = verifyChallenge(db, {
        userId,
        purpose: 'verify_email',
        code: first.code,
        now: addSeconds(NOW, 62),
      });
      expect(compareSpy).toHaveBeenCalledTimes(1);

      const replacement = await issue({ now: addSeconds(NOW, 61) });
      release();

      const result = await verification;
      expect(result).toEqual({ ok: false, reason: 'missing' });

      const rows = challengeRows();
      expect(rows).toHaveLength(2);
      const active = activeChallenges();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(replacement.id);
      expect(active[0].attempts).toBe(0);
      expect(active[0].consumed_at).toBeNull();
      expect(rows[0].attempts).toBe(0);
      expect(rows[0].consumed_at).toBeNull();
    } finally {
      compareSpy.mockRestore();
      release();
    }
  });

  it('rejects a code issued for a different purpose', async () => {
    const issued = await issue({ purpose: 'reset_password' });

    const result = await verifyChallenge(db, {
      userId,
      purpose: 'verify_email',
      code: issued.code,
      now: addMinutes(NOW, 1),
    });

    expect(result).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('consumeThrottle', () => {
  it('allows up to the limit, then blocks within the window', () => {
    const options = { key: 'throttle-a', limit: 3, windowSeconds: 900, blockSeconds: 900 };

    expect(consumeThrottle(db, { ...options, now: addSeconds(NOW, 0) }).allowed).toBe(true);
    expect(consumeThrottle(db, { ...options, now: addSeconds(NOW, 1) }).allowed).toBe(true);
    expect(consumeThrottle(db, { ...options, now: addSeconds(NOW, 2) }).allowed).toBe(true);

    const blocked = consumeThrottle(db, { ...options, now: addSeconds(NOW, 3) });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(900);

    const stillBlocked = consumeThrottle(db, { ...options, now: addSeconds(NOW, 600) });
    expect(stillBlocked.allowed).toBe(false);
    expect(stillBlocked.retryAfterSeconds).toBe(303);
  });

  it('starts a fresh window after the window passes', () => {
    const options = { key: 'throttle-b', limit: 1, windowSeconds: 60, blockSeconds: 60 };
    consumeThrottle(db, { ...options, now: NOW });
    expect(consumeThrottle(db, { ...options, now: addSeconds(NOW, 30) }).allowed).toBe(false);

    const reset = consumeThrottle(db, { ...options, now: addSeconds(NOW, 120) });
    expect(reset.allowed).toBe(true);
    expect(db.prepare('SELECT count FROM auth_throttle WHERE key = ?').get('throttle-b').count).toBe(1);
  });
});

describe('throttle privacy', () => {
  it('stores no raw email in auth_throttle for account limits', async () => {
    await issue({ now: NOW });
    await issue({ now: addSeconds(NOW, 61) });
    await issue({ now: addSeconds(NOW, 122) });
    await issue({ now: addSeconds(NOW, 183) }).catch(() => null);

    const rows = db.prepare('SELECT * FROM auth_throttle').all();
    expect(rows.length).toBeGreaterThan(0);
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain('student@example.com');
    expect(stored).not.toContain('student');
  });
});
