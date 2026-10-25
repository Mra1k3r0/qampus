function mapService(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    avgMinutes: row.avg_minutes,
    openDays: row.open_days,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    isOpen: row.is_open === 1,
  };
}

function listServices(db) {
  return db
    .prepare(
      `SELECT id, code, name, description, avg_minutes, open_days, opens_at, closes_at, is_open
       FROM services
       ORDER BY id ASC`,
    )
    .all()
    .map(mapService);
}

function findById(db, serviceId) {
  const row = db
    .prepare(
      `SELECT id, code, name, description, avg_minutes, open_days, opens_at, closes_at, is_open
       FROM services WHERE id = ?`,
    )
    .get(serviceId);
  return mapService(row);
}

function updateService(db, { serviceId, name, description, avgMinutes, opensAt, closesAt, isOpen }) {
  db.prepare(
    `UPDATE services
     SET name = ?, description = ?, avg_minutes = ?, opens_at = ?, closes_at = ?, is_open = ?
     WHERE id = ?`,
  ).run(name, description, avgMinutes, opensAt, closesAt, isOpen ? 1 : 0, serviceId);

  return findById(db, serviceId);
}

function mapStaff(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

const STAFF_COLUMNS = 'id, full_name, email, is_active, created_at';

function listStaff(db) {
  return db
    .prepare(
      `SELECT ${STAFF_COLUMNS}
       FROM users
       WHERE role = 'staff'
       ORDER BY full_name ASC, id ASC`,
    )
    .all()
    .map(mapStaff);
}

function findStaffById(db, staffId) {
  const row = db
    .prepare(`SELECT ${STAFF_COLUMNS} FROM users WHERE id = ? AND role = 'staff'`)
    .get(staffId);
  return mapStaff(row);
}

function findUserByEmail(db, email) {
  return db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
}

function nextStaffNumber(db) {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(CAST(substr(student_no, 7) AS INTEGER)), 0) + 1 AS next
       FROM users WHERE student_no LIKE 'STAFF-%'`,
    )
    .get();
  return `STAFF-${String(row.next).padStart(3, '0')}`;
}

function createStaff(db, { fullName, email, studentNo, passwordHash, createdAt }) {
  const result = db
    .prepare(
      `INSERT INTO users (full_name, student_no, email, password_hash, role, is_active, created_at)
       VALUES (?, ?, ?, ?, 'staff', 1, ?)`,
    )
    .run(fullName, studentNo, email, passwordHash, createdAt);

  return findStaffById(db, result.lastInsertRowid);
}

function updateStaff(db, { staffId, fullName, email }) {
  db.prepare(
    `UPDATE users SET full_name = ?, email = ? WHERE id = ? AND role = 'staff'`,
  ).run(fullName, email, staffId);

  return findStaffById(db, staffId);
}

function updateStaffPassword(db, { staffId, passwordHash }) {
  db.prepare(
    `UPDATE users SET password_hash = ? WHERE id = ? AND role = 'staff'`,
  ).run(passwordHash, staffId);
}

function updateStaffStatus(db, { staffId, isActive }) {
  db.prepare(
    `UPDATE users SET is_active = ? WHERE id = ? AND role = 'staff'`,
  ).run(isActive ? 1 : 0, staffId);

  return findStaffById(db, staffId);
}

module.exports = {
  listServices,
  findById,
  updateService,
  listStaff,
  findStaffById,
  findUserByEmail,
  nextStaffNumber,
  createStaff,
  updateStaff,
  updateStaffPassword,
  updateStaffStatus,
};
