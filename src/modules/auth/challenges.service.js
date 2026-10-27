const bcrypt = require('bcryptjs');
const { createHmac, randomInt } = require('node:crypto');
const createError = require('http-errors');
const config = require('../../config');
const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { enqueueMail } = require('../../core/mailer/outbox');
const { nowIso } = require('../../core/time');
const repo = require('./challenges.repository');

const BCRYPT_COST = 12;
const CODE_MAX = 100_000_000;
const CODE_LENGTH = 8;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const VERIFY_EMAIL = 'verify_email';
const RESET_PASSWORD = 'reset_password';
const PURPOSES = Object.freeze([VERIFY_EMAIL, RESET_PASSWORD]);

const PURPOSE_MAIL = Object.freeze({
  [VERIFY_EMAIL]: {
    template: 'verify-code',
    subject: 'Your Qampus verification code',
    action: 'auth.verification_requested',
  },
  [RESET_PASSWORD]: {
    template: 'reset-code',
    subject: 'Your Qampus password reset code',
    action: 'auth.reset_requested',
  },
});

const ACCOUNT_LIMITS = Object.freeze([
  { label: '15m', limit: 3, windowSeconds: 15 * 60 },
  { label: '1h', limit: 5, windowSeconds: 60 * 60 },
  { label: '1d', limit: 10, windowSeconds: 24 * 60 * 60 },
]);

function generateCode() {
  return randomInt(0, CODE_MAX).toString().padStart(CODE_LENGTH, '0');
}

function toMs(value) {
  return new Date(value).getTime();
}

function assertPurpose(purpose) {
  if (!PURPOSES.includes(purpose)) {
    throw new Error(`Unknown challenge purpose: ${purpose}`);
  }
}

function throttleKey(purpose, label, email, pepper) {
  const digest = createHmac('sha256', pepper).update(`${purpose}:${email}`).digest('hex');
  return `account:${purpose}:${label}:${digest}`;
}

function consumeThrottle(db, {
  key, limit, windowSeconds, blockSeconds, now = nowIso(),
}) {
  const nowMs = toMs(now);
  const row = repo.findThrottle(db, key);

  if (row && row.blocked_until && toMs(row.blocked_until) > nowMs) {
    const retryAfterSeconds = Math.ceil((toMs(row.blocked_until) - nowMs) / MS_PER_SECOND);
    return { allowed: false, retryAfterSeconds };
  }

  if (!row) {
    repo.insertThrottle(db, key, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const windowEndsAt = toMs(row.window_started_at) + windowSeconds * MS_PER_SECOND;
  if (nowMs >= windowEndsAt) {
    repo.resetThrottle(db, key, now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (row.count < limit) {
    repo.incrementThrottle(db, key);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const blockedUntil = new Date(nowMs + blockSeconds * MS_PER_SECOND).toISOString();
  repo.blockThrottle(db, key, blockedUntil);
  return { allowed: false, retryAfterSeconds: blockSeconds };
}

function assertCanIssue(db, { userId, purpose, email, mailConfig, now }) {
  const latest = repo.findLatest(db, userId, purpose);
  if (latest) {
    const elapsedSeconds = (toMs(now) - toMs(latest.created_at)) / MS_PER_SECOND;
    if (elapsedSeconds < mailConfig.resendCooldownSeconds) {
      throw createError(429, 'Wait before requesting another code.', {
        reason: 'cooldown',
        retryAfterSeconds: Math.ceil(mailConfig.resendCooldownSeconds - elapsedSeconds),
      });
    }
  }

  for (const window of ACCOUNT_LIMITS) {
    const result = consumeThrottle(db, {
      key: throttleKey(purpose, window.label, email, mailConfig.authPepper),
      limit: window.limit,
      windowSeconds: window.windowSeconds,
      blockSeconds: window.windowSeconds,
      now,
    });

    if (!result.allowed) {
      throw createError(429, 'Too many code requests. Try again later.', {
        reason: 'throttled',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
  }
}

async function issueChallenge(db, {
  userId, purpose, email, config: mailConfig = config.mail, now = nowIso(), requestId = null,
}) {
  assertPurpose(purpose);

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(toMs(now) + mailConfig.ttlMinutes * MS_PER_MINUTE).toISOString();

  return immediateTransaction(db, () => {
    assertCanIssue(db, { userId, purpose, email, mailConfig, now });

    repo.supersedeActive(db, userId, purpose, now);
    const id = repo.insertChallenge(db, {
      userId, purpose, codeHash, maxAttempts: mailConfig.maxAttempts, expiresAt, createdAt: now,
    });

    const mail = PURPOSE_MAIL[purpose];
    enqueueMail(
      db,
      {
        to: email,
        template: mail.template,
        subject: mail.subject,
        data: { code, expiresAt, ttlMinutes: mailConfig.ttlMinutes },
      },
      { encryptionKey: mailConfig.encryptionKey },
    );

    writeAudit(db, {
      actorUserId: userId,
      action: mail.action,
      entityType: 'auth_challenge',
      entityId: id,
      after: { purpose, expiresAt },
      requestId,
    });

    return { id, code, expiresAt };
  });
}

function writeChallengeAudit(db, { userId, challengeId, purpose, outcome, attempts }) {
  writeAudit(db, {
    actorUserId: userId,
    action: outcome === 'verified' ? 'auth.challenge_verified' : 'auth.challenge_failed',
    entityType: 'auth_challenge',
    entityId: challengeId,
    after: { purpose, outcome, attempts },
  });
}

function fail(db, { challenge, userId, now, reason, attempts = challenge.attempts }) {
  if (reason === 'too_many_attempts') {
    repo.supersedeById(db, challenge.id, now);
  }
  writeChallengeAudit(db, {
    userId,
    challengeId: challenge.id,
    purpose: challenge.purpose,
    outcome: reason,
    attempts,
  });
  return { ok: false, reason };
}

function settleFailure(db, { challenge, userId, now }) {
  if (toMs(challenge.expires_at) <= toMs(now)) {
    repo.supersedeById(db, challenge.id, now);
    return fail(db, { challenge, userId, now, reason: 'expired' });
  }
  if (challenge.attempts >= challenge.max_attempts) {
    return fail(db, { challenge, userId, now, reason: 'too_many_attempts' });
  }

  const attempts = challenge.attempts + 1;
  repo.incrementAttempts(db, challenge.id, attempts);
  const reason = attempts >= challenge.max_attempts ? 'too_many_attempts' : 'invalid';
  return fail(db, { challenge, userId, now, reason, attempts });
}

async function verifyChallenge(db, { userId, purpose, code, now = nowIso() }) {
  assertPurpose(purpose);

  const pending = repo.findActive(db, userId, purpose);
  if (!pending) {
    return { ok: false, reason: 'missing' };
  }

  const matches = await bcrypt.compare(code, pending.code_hash);

  return immediateTransaction(db, () => {
    const challenge = repo.findActive(db, userId, purpose);
    if (!challenge) {
      return { ok: false, reason: 'missing' };
    }
    if (challenge.id !== pending.id) {
      return { ok: false, reason: 'missing' };
    }
    if (!matches) {
      return settleFailure(db, { challenge, userId, now });
    }
    if (toMs(challenge.expires_at) <= toMs(now)) {
      repo.supersedeById(db, challenge.id, now);
      return fail(db, { challenge, userId, now, reason: 'expired' });
    }
    if (challenge.attempts >= challenge.max_attempts) {
      return fail(db, { challenge, userId, now, reason: 'too_many_attempts' });
    }

    repo.markConsumed(db, challenge.id, now, now);
    writeChallengeAudit(db, {
      userId,
      challengeId: challenge.id,
      purpose: challenge.purpose,
      outcome: 'verified',
      attempts: challenge.attempts,
    });

    return { ok: true, reason: null };
  });
}

module.exports = {
  generateCode,
  issueChallenge,
  verifyChallenge,
  consumeThrottle,
  ACCOUNT_LIMITS,
};
