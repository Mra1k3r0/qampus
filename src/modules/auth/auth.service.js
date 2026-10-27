const bcrypt = require('bcryptjs');
const createError = require('http-errors');
const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { enqueueMail } = require('../../core/mailer/outbox');
const { isPasswordLeaked, LEAKED_PASSWORD_MESSAGE } = require('../../core/password-safety');
const { nowIso } = require('../../core/time');
const authRepository = require('./auth.repository');
const challengesService = require('./challenges.service');

const BCRYPT_COST = 12;
const DUMMY_HASH = '$2b$12$FJNFhBSj9MAhqoJ1VxN0i.4WSOGyLN1Dh2l8GlsE9LyEQwB7xxk7m';
const VERIFY_EMAIL = 'verify_email';

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function isUniqueViolation(err) {
  return err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}

function isStudentNoConflict(err) {
  return isUniqueViolation(err) && String(err.message).includes('users.student_no');
}

function studentNoConflictError() {
  return createError(409, 'That student number is already registered.', {
    fieldErrors: { studentNo: 'That student number is already registered.' },
  });
}

function sendAccountExists(db, { userId, email, requestId, mailConfig }) {
  immediateTransaction(db, () => {
    enqueueMail(
      db,
      {
        to: email,
        template: 'account-exists',
        subject: 'Your Qampus account',
        data: {},
      },
      { encryptionKey: mailConfig.encryptionKey },
    );

    writeAudit(db, {
      actorUserId: userId,
      action: 'register_existing',
      entityType: 'user',
      entityId: userId,
      after: { outcome: 'account_exists' },
      requestId,
    });
  });
}

async function issueVerification(db, { userId, email, requestId, mailConfig }) {
  try {
    await challengesService.issueChallenge(db, {
      userId,
      purpose: VERIFY_EMAIL,
      email,
      config: mailConfig,
      requestId,
    });
    return { challengeError: null };
  } catch (err) {
    if (err.status === 429) {
      return { challengeError: err };
    }
    throw err;
  }
}

function createUser(db, { fullName, studentNo, email, passwordHash, requestId }) {
  try {
    return immediateTransaction(db, () => {
      const created = authRepository.createUser(db, {
        fullName,
        studentNo,
        email,
        passwordHash,
        role: 'student',
        createdAt: nowIso(),
      });

      writeAudit(db, {
        actorUserId: created.id,
        action: 'register',
        entityType: 'user',
        entityId: created.id,
        after: { role: created.role, policyAccepted: true },
        requestId,
      });

      return created;
    });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }
    if (isStudentNoConflict(err)) {
      throw studentNoConflictError();
    }
    return authRepository.findByEmail(db, email);
  }
}

function updatePendingUser(db, {
  userId, fullName, studentNo, passwordHash, requestId,
}) {
  try {
    return immediateTransaction(db, () => {
      const updated = authRepository.updatePendingRegistration(db, {
        userId,
        fullName,
        studentNo,
        passwordHash,
      });
      if (!updated) {
        return null;
      }

      writeAudit(db, {
        actorUserId: updated.id,
        action: 'register_pending_update',
        entityType: 'user',
        entityId: updated.id,
        after: { fields: ['fullName', 'studentNo'] },
        requestId,
      });

      return updated;
    });
  } catch (err) {
    if (isStudentNoConflict(err)) {
      throw studentNoConflictError();
    }
    throw err;
  }
}

async function register(db, {
  fullName,
  studentNo,
  email,
  password,
  requestId,
  passwordLeakCheck = false,
  mailConfig,
}) {
  const existing = authRepository.findByEmail(db, email);

  if (existing && existing.emailVerifiedAt) {
    sendAccountExists(db, { userId: existing.id, email, requestId, mailConfig });
    return { user: existing, isVerified: true, challengeError: null };
  }

  if (passwordLeakCheck && await isPasswordLeaked(password)) {
    throw createError(400, LEAKED_PASSWORD_MESSAGE, {
      fieldErrors: { password: LEAKED_PASSWORD_MESSAGE },
    });
  }

  const passwordHash = await hashPassword(password);
  let user = existing;
  if (!user) {
    user = createUser(db, { fullName, studentNo, email, passwordHash, requestId });
    if (!user) {
      throw createError(500, 'Could not create the account.');
    }
    // another request may have inserted this email between the lookup and the insert
    if (user.emailVerifiedAt) {
      sendAccountExists(db, { userId: user.id, email, requestId, mailConfig });
      return { user, isVerified: true, challengeError: null };
    }
  } else {
    // The latest person to register sets the password. Otherwise an unverified
    // squatter keeps a password the email owner does not know.
    user = updatePendingUser(db, {
      userId: user.id,
      fullName,
      studentNo,
      passwordHash,
      requestId,
    });
    if (!user) {
      const current = authRepository.findByEmail(db, email);
      if (current && current.emailVerifiedAt) {
        sendAccountExists(db, { userId: current.id, email, requestId, mailConfig });
        return { user: current, isVerified: true, challengeError: null };
      }
      throw createError(500, 'Could not create the account.');
    }
  }

  const { challengeError } = await issueVerification(db, {
    userId: user.id,
    email,
    requestId,
    mailConfig,
  });

  return { user, isVerified: false, challengeError };
}

async function login(db, { email, password, portal, requestId }) {
  const user = authRepository.findByEmail(db, email);
  const hash = user ? user.passwordHash : DUMMY_HASH;
  const passwordMatches = await verifyPassword(password, hash);

  if (!user || !passwordMatches || !user.isActive || !user.emailVerifiedAt) {
    throw createError(401, 'Email or password is incorrect.');
  }

  if (portal && portal !== user.role) {
    throw createError(401, 'Email or password is incorrect.');
  }

  writeAudit(db, {
    actorUserId: user.id,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    after: { role: user.role },
    requestId,
  });

  return {
    id: user.id,
    fullName: user.fullName,
    studentNo: user.studentNo,
    email: user.email,
    role: user.role,
    sessionVersion: user.sessionVersion,
  };
}

function logout(db, { userId, requestId }) {
  writeAudit(db, {
    actorUserId: userId,
    action: 'logout',
    entityType: 'user',
    entityId: userId,
    requestId,
  });
}

module.exports = {
  BCRYPT_COST,
  DUMMY_HASH,
  hashPassword,
  verifyPassword,
  register,
  login,
  logout,
  issueVerification,
  sendAccountExists,
};
