const bcrypt = require('bcryptjs');
const { serviceDate } = require('./time');

const BCRYPT_COST = 12;
const DEMO_PASSWORD = 'QueueDemo2026!';
const OPEN_DAYS = JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const DEFAULT_SERVICE_HOURS = Object.freeze({ opensAt: '08:00', closesAt: '17:00' });

const SERVICES = [
  {
    code: 'REG',
    name: 'Registrar',
    description: 'Enrollment records, transcripts, and certification requests.',
    avgMinutes: 8,
  },
  {
    code: 'CSH',
    name: 'Cashier',
    description: 'Tuition payments, receipts, and assessment balances.',
    avgMinutes: 5,
  },
  {
    code: 'SCH',
    name: 'Scholarship',
    description: 'Scholarship applications, renewals, and grant releases.',
    avgMinutes: 10,
  },
  {
    code: 'LIB',
    name: 'Library',
    description: 'Library cards, clearances, and borrowed materials.',
    avgMinutes: 4,
  },
];

const STAFF = {
  fullName: 'Liza Fernandez',
  studentNo: 'STAFF-001',
  email: 'staff@my.cspc.edu.ph',
  role: 'staff',
};

const ADMIN = {
  fullName: 'Ramon Dela Cruz',
  studentNo: 'ADMIN-001',
  email: 'admin@my.cspc.edu.ph',
  role: 'admin',
};

const STUDENTS = [
  { fullName: 'Alex Reyes', studentNo: '2026-0001', email: 'student1@my.cspc.edu.ph' },
  { fullName: 'Bea Cruz', studentNo: '2026-0002', email: 'student2@my.cspc.edu.ph' },
  { fullName: 'Carlo Mendoza', studentNo: '2026-0003', email: 'student3@my.cspc.edu.ph' },
  { fullName: 'Dana Lim', studentNo: '2026-0004', email: 'student4@my.cspc.edu.ph' },
  { fullName: 'Elio Garcia', studentNo: '2026-0005', email: 'student5@my.cspc.edu.ph' },
  { fullName: 'Faith Navarro', studentNo: '2026-0006', email: 'student6@my.cspc.edu.ph' },
];

const TICKET_PLAN = [
  { serviceCode: 'REG', sequence: 1 },
  { serviceCode: 'CSH', sequence: 1 },
  { serviceCode: 'SCH', sequence: 1 },
  { serviceCode: 'LIB', sequence: 1 },
  { serviceCode: 'REG', sequence: 2 },
  { serviceCode: 'CSH', sequence: 2 },
];

const DEMO_ACCOUNT_EMAILS = Object.freeze([
  STAFF.email,
  ADMIN.email,
  ...STUDENTS.map((student) => student.email),
]);

function seedBaseDate() {
  const today = serviceDate();
  return new Date(`${today}T00:00:00.000Z`);
}

function insertUser(db, user, passwordHash, createdAt) {
  db.prepare(
    `INSERT INTO users (full_name, student_no, email, password_hash, role, email_verified_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET email_verified_at = excluded.email_verified_at`,
  ).run(
    user.fullName,
    user.studentNo,
    user.email,
    passwordHash,
    user.role,
    createdAt,
    createdAt,
  );

  return db.prepare('SELECT * FROM users WHERE email = ?').get(user.email);
}

function assignStudentAvatar(db, student, index, updatedAt) {
  const presetKey = `preset-${String(index + 1).padStart(2, '0')}`;
  db.prepare(
    `UPDATE users
     SET avatar_type = 'preset', avatar_value = ?, avatar_updated_at = ?
     WHERE id = ? AND avatar_type IS NULL`,
  ).run(presetKey, updatedAt, student.id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(student.id);
}

function insertService(db, service, options, createdAt) {
  db.prepare(
    `INSERT INTO services
      (code, name, description, avg_minutes, open_days, opens_at, closes_at, is_open, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO NOTHING`,
  ).run(
    service.code,
    service.name,
    service.description,
    service.avgMinutes,
    options.openDays,
    options.opensAt,
    options.closesAt,
    1,
    createdAt,
  );

  return db.prepare('SELECT * FROM services WHERE code = ?').get(service.code);
}

function ensureCounter(db, service) {
  const name = `${service.name} Window 1`;
  const existing = db
    .prepare('SELECT * FROM counters WHERE service_id = ? AND name = ?')
    .get(service.id, name);

  if (existing) {
    return existing;
  }

  const result = db
    .prepare('INSERT INTO counters (service_id, name, is_active) VALUES (?, ?, 1)')
    .run(service.id, name);
  return db.prepare('SELECT * FROM counters WHERE id = ?').get(result.lastInsertRowid);
}

function insertTicket(db, { code, serviceId, userId, sequence, serviceDateValue, createdAt }) {
  db.prepare(
    `INSERT INTO tickets
      (code, service_id, user_id, status, service_date, sequence, call_count, created_at, updated_at)
     VALUES (?, ?, ?, 'waiting', ?, ?, 0, ?, ?)
     ON CONFLICT(code, service_date) DO NOTHING`,
  ).run(code, serviceId, userId, serviceDateValue, sequence, createdAt, createdAt);
}

function seedDatabase(db, {
  studentCount = 6,
  includeTickets = true,
  serviceHours = DEFAULT_SERVICE_HOURS,
  openDays = OPEN_DAYS,
} = {}) {
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, BCRYPT_COST);
  const base = seedBaseDate();
  const baseIso = base.toISOString();
  const dateValue = serviceDate(base);
  const serviceOptions = {
    openDays: Array.isArray(openDays) ? JSON.stringify(openDays) : openDays,
    opensAt: serviceHours.opensAt,
    closesAt: serviceHours.closesAt,
  };

  const runSeed = db.transaction(() => {
    const staff = insertUser(db, STAFF, passwordHash, baseIso);
    const admin = insertUser(db, ADMIN, passwordHash, baseIso);
    const students = STUDENTS.slice(0, studentCount).map((student, index) => {
      const row = insertUser(db, { ...student, role: 'student' }, passwordHash, baseIso);
      return assignStudentAvatar(db, row, index, baseIso);
    });

    const services = SERVICES.map((service) => insertService(db, service, serviceOptions, baseIso));
    for (const service of services) {
      ensureCounter(db, service);
    }

    if (includeTickets) {
      TICKET_PLAN.slice(0, studentCount).forEach((plan, index) => {
        const service = services.find((row) => row.code === plan.serviceCode);
        const student = students[index];
        if (!service || !student) {
          return;
        }
        const createdAt = new Date(base.getTime() + index * 60 * 1000).toISOString();
        insertTicket(db, {
          code: `${service.code}-${String(plan.sequence).padStart(3, '0')}`,
          serviceId: service.id,
          userId: student.id,
          sequence: plan.sequence,
          serviceDateValue: dateValue,
          createdAt,
        });
      });
    }

    return { staff, admin, students, services };
  });

  const result = runSeed.immediate();

  return {
    services: result.services.length,
    staff: result.staff ? 1 : 0,
    admin: result.admin ? 1 : 0,
    students: result.students.length,
    tickets: includeTickets ? TICKET_PLAN.slice(0, studentCount).length : 0,
  };
}

module.exports = {
  DEMO_PASSWORD,
  DEMO_ACCOUNT_EMAILS,
  SERVICES,
  seedDatabase,
};
