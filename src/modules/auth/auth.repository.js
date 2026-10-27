const { avatarUrl, initials } = require('../../core/user-view');

function mapUser(row) {
  if (!row) {
    return null;
  }
  const user = {
    id: row.id,
    fullName: row.full_name,
    studentNo: row.student_no,
    email: row.email,
    role: row.role,
    isActive: row.is_active === 1,
    emailVerifiedAt: row.email_verified_at || null,
    sessionVersion: row.session_version,
    createdAt: row.created_at,
    avatarType: row.avatar_type || null,
    avatarValue: row.avatar_value || null,
    avatarUpdatedAt: row.avatar_updated_at || null,
  };
  user.avatarUrl = avatarUrl(user);
  user.initials = initials(user.fullName);
  return user;
}

const USER_COLUMNS = 'id, full_name, student_no, email, role, is_active, email_verified_at, '
  + 'session_version, created_at, avatar_type, avatar_value, avatar_updated_at';

function findById(db, id) {
  const row = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .get(id);
  return mapUser(row);
}

function findByEmail(db, email) {
  const row = db
    .prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`)
    .get(email);

  if (!row) {
    return null;
  }

  return {
    ...mapUser(row),
    passwordHash: row.password_hash,
  };
}

function createUser(db, { fullName, studentNo, email, passwordHash, role, createdAt }) {
  const result = db
    .prepare(
      `INSERT INTO users (full_name, student_no, email, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(fullName, studentNo, email, passwordHash, role, createdAt);

  return findById(db, result.lastInsertRowid);
}

function markEmailVerified(db, userId, verifiedAt) {
  db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(verifiedAt, userId);
  return findById(db, userId);
}

function updatePasswordHash(db, userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  return findById(db, userId);
}

function incrementSessionVersion(db, userId) {
  db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(userId);
  return findById(db, userId);
}

module.exports = {
  findById,
  findByEmail,
  createUser,
  markEmailVerified,
  updatePasswordHash,
  incrementSessionVersion,
};
