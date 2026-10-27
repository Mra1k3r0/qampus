const ACTIVE_STATUSES = ['waiting', 'called', 'serving'];

const CURRENT_DESK_JOIN = `
  LEFT JOIN tickets d ON d.id = (
    SELECT t2.id
    FROM tickets t2
    WHERE t2.service_id = t.service_id
      AND t2.service_date = t.service_date
      AND t2.status IN ('called', 'serving')
    ORDER BY CASE t2.status WHEN 'serving' THEN 0 ELSE 1 END, t2.sequence ASC
    LIMIT 1
  )`;

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

function mapTicket(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    code: row.code,
    serviceId: row.service_id,
    userId: row.user_id,
    counterId: row.counter_id,
    calledBy: row.called_by,
    status: row.status,
    note: row.note,
    serviceDate: row.service_date,
    sequence: row.sequence,
    callCount: row.call_count,
    calledAt: row.called_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    position: row.position || null,
    currentStatus: row.current_status || null,
    currentStartedAt: row.current_started_at || null,
    serviceCode: row.service_code,
    serviceName: row.service_name,
    avgMinutes: row.avg_minutes,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    counterName: row.counter_name || null,
    studentName: row.student_name || null,
  };
}

function findServiceById(db, serviceId) {
  const row = db
    .prepare(
      `SELECT id, code, name, description, avg_minutes, open_days, opens_at, closes_at, is_open
       FROM services WHERE id = ?`,
    )
    .get(serviceId);
  return mapService(row);
}

function findActiveTicketForUserService(db, { userId, serviceId, date }) {
  const row = db
    .prepare(
      `SELECT t.*, s.code AS service_code, s.name AS service_name, s.avg_minutes,
              s.opens_at, s.closes_at, c.name AS counter_name
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       LEFT JOIN counters c ON c.id = t.counter_id
       WHERE t.user_id = ? AND t.service_id = ? AND t.service_date = ?
         AND t.status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})
       LIMIT 1`,
    )
    .get(userId, serviceId, date, ...ACTIVE_STATUSES);
  return mapTicket(row);
}

function countActiveTicketsForUserToday(db, { userId, date }) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM tickets
       WHERE user_id = ? AND service_date = ?
         AND status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})`,
    )
    .get(userId, date, ...ACTIVE_STATUSES);
  return row.count;
}

function countNoShowTicketsForUserToday(db, { userId, date }) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM tickets
       WHERE user_id = ? AND service_date = ? AND status = 'no_show'`,
    )
    .get(userId, date);
  return row.count;
}

function findLatestTicketCreatedAtForUserToday(db, { userId, date }) {
  const row = db
    .prepare(
      `SELECT MAX(created_at) AS created_at
       FROM tickets
       WHERE user_id = ? AND service_date = ?`,
    )
    .get(userId, date);
  return row ? row.created_at : null;
}

function nextSequence(db, { serviceId, date }) {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
       FROM tickets WHERE service_id = ? AND service_date = ?`,
    )
    .get(serviceId, date);
  return row.sequence;
}

function insertTicket(db, { code, serviceId, userId, serviceDate, sequence, createdAt }) {
  const result = db
    .prepare(
      `INSERT INTO tickets
        (code, service_id, user_id, status, service_date, sequence, call_count, created_at, updated_at)
       VALUES (?, ?, ?, 'waiting', ?, ?, 0, ?, ?)`,
    )
    .run(code, serviceId, userId, serviceDate, sequence, createdAt, createdAt);
  return result.lastInsertRowid;
}

function findTicketById(db, ticketId) {
  const row = db
    .prepare(
      `SELECT t.*, s.code AS service_code, s.name AS service_name, s.avg_minutes,
              s.opens_at, s.closes_at, c.name AS counter_name, u.full_name AS student_name,
              d.status AS current_status, d.started_at AS current_started_at,
              (SELECT COUNT(*) FROM tickets w
               WHERE w.service_id = t.service_id AND w.service_date = t.service_date
                 AND w.status = 'waiting' AND w.sequence <= t.sequence) AS position
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       JOIN users u ON u.id = t.user_id
       LEFT JOIN counters c ON c.id = t.counter_id
       ${CURRENT_DESK_JOIN}
       WHERE t.id = ?`,
    )
    .get(ticketId);
  return mapTicket(row);
}

function findOldestWaitingForService(db, { serviceId, date }) {
  const row = db
    .prepare(
      `SELECT t.*, s.code AS service_code, s.name AS service_name, s.avg_minutes,
              s.opens_at, s.closes_at, c.name AS counter_name, u.full_name AS student_name
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       JOIN users u ON u.id = t.user_id
       LEFT JOIN counters c ON c.id = t.counter_id
       WHERE t.service_id = ? AND t.service_date = ? AND t.status = 'waiting'
       ORDER BY t.sequence ASC
       LIMIT 1`,
    )
    .get(serviceId, date);
  return mapTicket(row);
}

function findStaleActiveTickets(db, { beforeDate }) {
  return db
    .prepare(
      `SELECT id, status, service_date
       FROM tickets
       WHERE service_date < ?
         AND status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})
       ORDER BY id ASC`,
    )
    .all(beforeDate, ...ACTIVE_STATUSES);
}

function expireTicket(db, { ticketId, status, endedAt, updatedAt }) {
  const result = db
    .prepare(
      `UPDATE tickets
       SET status = 'expired', ended_at = ?, updated_at = ?
       WHERE id = ? AND status = ?`,
    )
    .run(endedAt, updatedAt, ticketId, status);
  return result.changes === 1;
}

function findCounterForService(db, serviceId) {
  return db
    .prepare(
      `SELECT id, name FROM counters
       WHERE service_id = ? AND is_active = 1
       ORDER BY id ASC LIMIT 1`,
    )
    .get(serviceId);
}

function markLeft(db, { ticketId, endedAt, updatedAt }) {
  db.prepare(
    `UPDATE tickets
     SET status = 'left', ended_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(endedAt, updatedAt, ticketId);
}

function markCalled(db, { ticketId, counterId, calledBy, calledAt, updatedAt }) {
  db.prepare(
    `UPDATE tickets
     SET status = 'called', counter_id = ?, called_by = ?, call_count = call_count + 1,
         called_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(counterId, calledBy, calledAt, updatedAt, ticketId);
}

function markServing(db, { ticketId, startedAt, updatedAt }) {
  db.prepare(
    `UPDATE tickets
     SET status = 'serving', started_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(startedAt, updatedAt, ticketId);
}

function markServed(db, { ticketId, endedAt, updatedAt }) {
  db.prepare(
    `UPDATE tickets
     SET status = 'served', ended_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(endedAt, updatedAt, ticketId);
}

function markNoShow(db, { ticketId, endedAt, updatedAt }) {
  db.prepare(
    `UPDATE tickets
     SET status = 'no_show', ended_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(endedAt, updatedAt, ticketId);
}

function markRecalled(db, { ticketId, calledAt, updatedAt }) {
  db.prepare(
    `UPDATE tickets
     SET call_count = call_count + 1, called_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(calledAt, updatedAt, ticketId);
}

module.exports = {
  findServiceById,
  findActiveTicketForUserService,
  countActiveTicketsForUserToday,
  countNoShowTicketsForUserToday,
  findLatestTicketCreatedAtForUserToday,
  nextSequence,
  insertTicket,
  findTicketById,
  findOldestWaitingForService,
  findStaleActiveTickets,
  expireTicket,
  findCounterForService,
  markLeft,
  markCalled,
  markServing,
  markServed,
  markNoShow,
  markRecalled,
};
