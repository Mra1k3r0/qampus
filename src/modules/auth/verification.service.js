const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { nowIso } = require('../../core/time');
const authRepository = require('./auth.repository');
const challengesService = require('./challenges.service');
const authService = require('./auth.service');

const VERIFY_EMAIL = 'verify_email';

function findPendingUser(db, userId) {
  return authRepository.findById(db, userId);
}

async function verifyEmail(db, { userId, code, requestId }) {
  const now = nowIso();
  const result = await challengesService.verifyChallenge(db, {
    userId,
    purpose: VERIFY_EMAIL,
    code,
    now,
  });

  if (!result.ok) {
    return result;
  }

  immediateTransaction(db, () => {
    authRepository.markEmailVerified(db, userId, now);
    authRepository.incrementSessionVersion(db, userId);
    writeAudit(db, {
      actorUserId: userId,
      action: 'auth.email_verified',
      entityType: 'user',
      entityId: userId,
      after: {},
      requestId,
    });
  });

  return { ok: true, reason: null };
}

async function resendVerification(db, { userId, email, requestId, mailConfig }) {
  const user = authRepository.findById(db, userId);

  if (!user) {
    return { ok: false, reason: 'missing' };
  }

  if (user.emailVerifiedAt) {
    authService.sendAccountExists(db, { userId: user.id, email: user.email, requestId, mailConfig });
    return { ok: false, reason: 'verified' };
  }

  const { challengeError } = await authService.issueVerification(db, {
    userId: user.id,
    email,
    requestId,
    mailConfig,
  });

  return { ok: true, challengeError };
}

module.exports = {
  findPendingUser,
  verifyEmail,
  resendVerification,
};
