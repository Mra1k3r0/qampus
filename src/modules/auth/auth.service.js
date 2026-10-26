const bcrypt = require('bcryptjs');
const createError = require('http-errors');
const { writeAudit } = require('../../core/audit');
const { immediateTransaction } = require('../../core/db');
const { nowIso } = require('../../core/time');
const authRepository = require('./auth.repository');

const BCRYPT_COST = 12;
const DUMMY_HASH = '$2b$12$FJNFhBSj9MAhqoJ1VxN0i.4WSOGyLN1Dh2l8GlsE9LyEQwB7xxk7m';

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function isUniqueViolation(err) {
  return err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}

async function register(db, { fullName, studentNo, email, password, requestId }) {
  const existing = authRepository.findByEmail(db, email);
  if (existing) {
    throw createError(409, 'That email is already registered.', {
      fieldErrors: { email: 'That email is already registered.' },
    });
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = immediateTransaction(db, () => {
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
    if (isUniqueViolation(err)) {
      const isStudentNo = String(err.message).includes('users.student_no');
      const field = isStudentNo ? 'studentNo' : 'email';
      const message = isStudentNo
        ? 'That student number is already registered.'
        : 'That email is already registered.';
      throw createError(409, message, { fieldErrors: { [field]: message } });
    }
    throw err;
  }

  return user;
}

async function login(db, { email, password, portal, requestId }) {
  const user = authRepository.findByEmail(db, email);
  const hash = user ? user.passwordHash : DUMMY_HASH;
  const passwordMatches = await verifyPassword(password, hash);

  if (!user || !passwordMatches || !user.isActive) {
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
  hashPassword,
  verifyPassword,
  register,
  login,
  logout,
};
