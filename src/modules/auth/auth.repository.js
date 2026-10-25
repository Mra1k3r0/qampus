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
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

function findById(db, id) {
  const row = db
    .prepare(
      'SELECT id, full_name, student_no, email, role, is_active, created_at FROM users WHERE id = ?',
    )
    .get(id);
  return mapUser(row);
}

function findByEmail(db, email) {
  const row = db
    .prepare(
      'SELECT id, full_name, student_no, email, password_hash, role, is_active, created_at FROM users WHERE email = ?',
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
