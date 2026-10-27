const ACTIVE_STATUSES = ['waiting', 'called', 'serving'];

const POSITION_SQL = `(
  SELECT COUNT(*)
  FROM tickets w
  WHERE w.service_id = t.service_id
    AND w.service_date = t.service_date
    AND w.status = 'waiting'
    AND w.sequence <= t.sequence
) AS position`;

function mapService(row) {
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
    waitingCount: row.waiting_count || 0,
    currentCode: row.current_code || null,
    currentCounter: row.current_counter || null,
    currentUpdatedAt: row.current_updated_at || null,
  };
}

function mapTicket(row) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    sequence: row.sequence,
    serviceId: row.service_id,
    serviceCode: row.service_code,
    serviceName: row.service_name,
    avgMinutes: row.avg_minutes,
    counterName: row.counter_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    callCount: row.call_count || 0,
    position: row.position || null,
  };
}

function mapStaffTicket(row) {
  return {
    ...mapTicket(row),
    userId: row.user_id,
    studentName: row.student_name,
    callCount: row.call_count,
    calledAt: row.called_at || null,
    startedAt: row.started_at || null,
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

function listServicesWithStatus(db, date) {
  return db
    .prepare(
      `SELECT s.id, s.code, s.name, s.description, s.avg_minutes, s.open_days,
              s.opens_at, s.closes_at, s.is_open,
              (SELECT COUNT(*) FROM tickets w
               WHERE w.service_id = s.id AND w.service_date = ? AND w.status = 'waiting') AS waiting_count,
              (SELECT t.code FROM tickets t
               WHERE t.service_id = s.id AND t.service_date = ?
                 AND t.status IN ('called', 'serving')
               ORDER BY t.updated_at DESC LIMIT 1) AS current_code,
              (SELECT c.name FROM tickets t
               LEFT JOIN counters c ON c.id = t.counter_id
               WHERE t.service_id = s.id AND t.service_date = ?
                 AND t.status IN ('called', 'serving')
               ORDER BY t.updated_at DESC LIMIT 1) AS current_counter,
              (SELECT t.updated_at FROM tickets t
               WHERE t.service_id = s.id AND t.service_date = ?
                 AND t.status IN ('called', 'serving')
               ORDER BY t.updated_at DESC LIMIT 1) AS current_updated_at
       FROM services s
       ORDER BY s.id ASC`,
    )
    .all(date, date, date, date)
    .map(mapService);
}

function listActiveTicketsForUser(db, { userId, date }) {
  return db
    .prepare(
      `SELECT t.id, t.code, t.status, t.sequence, t.service_id, t.created_at, t.updated_at,
              t.call_count,
              s.code AS service_code, s.name AS service_name, s.avg_minutes,
              c.name AS counter_name,
              ${POSITION_SQL}
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       LEFT JOIN counters c ON c.id = t.counter_id
       WHERE t.user_id = ? AND t.service_date = ?
         AND t.status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})
       ORDER BY t.created_at ASC, t.id ASC`,
    )
    .all(userId, date, ...ACTIVE_STATUSES)
    .map(mapTicket);
}

function listActiveTicketsForDate(db, date) {
  return db
    .prepare(
      `SELECT t.id, t.code, t.status, t.sequence, t.service_id, t.user_id,
              t.created_at, t.updated_at, t.call_count, t.called_at, t.started_at,
              s.code AS service_code, s.name AS service_name, s.avg_minutes,
              c.name AS counter_name, u.full_name AS student_name,
              ${POSITION_SQL}
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       JOIN users u ON u.id = t.user_id
       LEFT JOIN counters c ON c.id = t.counter_id
       WHERE t.service_date = ?
         AND t.status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})
       ORDER BY s.id ASC,
         CASE t.status WHEN 'serving' THEN 0 WHEN 'called' THEN 1 ELSE 2 END,
         t.sequence ASC`,
    )
    .all(date, ...ACTIVE_STATUSES)
    .map(mapStaffTicket);
}

function countTicketsByStatus(db, date) {
  return db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM tickets
       WHERE service_date = ?
       GROUP BY status`,
    )
    .all(date)
    .reduce((counts, row) => {
      counts[row.status] = row.count;
      return counts;
    }, {});
}

function latestUpdatedAt(db, date) {
  const row = db
    .prepare('SELECT MAX(updated_at) AS updated_at FROM tickets WHERE service_date = ?')
    .get(date);
  return row ? row.updated_at : null;
}

module.exports = {
  ACTIVE_STATUSES,
  listServices,
  listServicesWithStatus,
  listActiveTicketsForUser,
  listActiveTicketsForDate,
  countTicketsByStatus,
  latestUpdatedAt,
};
