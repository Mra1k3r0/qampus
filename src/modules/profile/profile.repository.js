function mapUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    fullName: row.full_name,
    studentNo: row.student_no,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    avatarType: row.avatar_type || null,
    avatarValue: row.avatar_value || null,
    avatarUpdatedAt: row.avatar_updated_at || null,
  };
}

const USER_COLUMNS = 'id, full_name, student_no, email, role, created_at, '
  + 'avatar_type, avatar_value, avatar_updated_at';

function findById(db, userId) {
  const row = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .get(userId);
  return mapUser(row);
}

function updateFullName(db, { userId, fullName }) {
  db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName, userId);
  return findById(db, userId);
}

function updateAvatar(db, { userId, avatarType, avatarValue, avatarUpdatedAt }) {
  db.prepare(
    `UPDATE users
     SET avatar_type = ?, avatar_value = ?, avatar_updated_at = ?
     WHERE id = ?`,
  ).run(avatarType, avatarValue, avatarUpdatedAt, userId);
  return findById(db, userId);
}

module.exports = {
  findById,
  updateFullName,
  updateAvatar,
};
