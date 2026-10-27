const bcrypt = require('bcryptjs');
const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { enqueueMail } = require('../../core/mailer/outbox');
const { nowIso } = require('../../core/time');
const authRepository = require('./auth.repository');
const challengesService = require('./challenges.service');
const { DUMMY_HASH, hashPassword } = require('./auth.service');

const RESET_PASSWORD = 'reset_password';
const GENERIC_CODE_FAILURE = 'invalid';

async function requestPasswordReset(db, { email, requestId, mailConfig }) {
  const user = authRepository.findByEmail(db, email);

  if (!user) {
    await bcrypt.compare('not-a-real-code', DUMMY_HASH);
    return { sent: false };
  }

  try {
    await challengesService.issueChallenge(db, {
      userId: user.id,
      purpose: RESET_PASSWORD,
      email: user.email,
      config: mailConfig,
      requestId,
    });
    return { sent: true };
  } catch (err) {
    if (err.status === 429) {
      return { sent: false };
    }
    throw err;
  }
}

async function verifyResetCode(db, { email, code, now = nowIso() }) {
  const user = authRepository.findByEmail(db, email);

  if (!user) {
    await bcrypt.compare(code, DUMMY_HASH);
    return { ok: false, reason: GENERIC_CODE_FAILURE };
  }

  const result = await challengesService.verifyChallenge(db, {
    userId: user.id,
    purpose: RESET_PASSWORD,
    code,
    now,
  });

  if (!result.ok) {
    return { ok: false, reason: GENERIC_CODE_FAILURE };
  }

  return { ok: true, user };
}

function updatePassword(db, { userId, passwordHash, requestId }) {
  return immediateTransaction(db, () => {
    authRepository.updatePasswordHash(db, userId, passwordHash);
    authRepository.incrementSessionVersion(db, userId);

    writeAudit(db, {
      actorUserId: userId,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: userId,
      after: {},
      requestId,
    });
  });
}

async function setNewPassword(db, {
  userId, password, requestId, mailConfig, logger,
}) {
  const passwordHash = await hashPassword(password);
  updatePassword(db, { userId, passwordHash, requestId });

  try {
    enqueueMail(
      db,
      {
        to: authRepository.findById(db, userId).email,
        template: 'password-changed',
        subject: 'Your Qampus password was changed',
        data: {},
      },
      { encryptionKey: mailConfig.encryptionKey },
    );
  } catch (err) {
    if (logger) {
      logger.error({ err: err.message, userId }, 'could not queue password-changed mail');
    }
  }
}

module.exports = {
  requestPasswordReset,
  verifyResetCode,
  setNewPassword,
};
