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
    createdAt: row.created_at,
    avatarType: row.avatar_type || null,
    avatarValue: row.avatar_value || null,
    avatarUpdatedAt: row.avatar_updated_at || null,
  };
  user.avatarUrl = avatarUrl(user);
  user.initials = initials(user.fullName);
  return user;
}

const USER_COLUMNS = 'id, full_name, student_no, email, role, is_active, created_at, '
  + 'avatar_type, avatar_value, avatar_updated_at';

function findById(db, id) {
  const row = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .get(id);
  return mapUser(row);
}

function findByEmail(db, email) {
  const row = db
    .prepare(
      `SELECT id, full_name, student_no, email, password_hash, role, is_active, created_at,
        avatar_type, avatar_value, avatar_updated_at
       FROM users WHERE email = ?`,
    )
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

module.exports = {
  findById,
  findByEmail,
  createUser,
};
