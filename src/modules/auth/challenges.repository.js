const ACTIVE_CHALLENGE = 'user_id = ? AND purpose = ? AND consumed_at IS NULL AND superseded_at IS NULL';

function findActive(db, userId, purpose) {
  return db
    .prepare(`SELECT * FROM auth_challenges WHERE ${ACTIVE_CHALLENGE} ORDER BY id DESC LIMIT 1`)
    .get(userId, purpose) || null;
}

function findLatest(db, userId, purpose) {
  return db
    .prepare(
      `SELECT * FROM auth_challenges
       WHERE user_id = ? AND purpose = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(userId, purpose) || null;
}

function supersedeActive(db, userId, purpose, supersededAt) {
  return db
    .prepare(
      `UPDATE auth_challenges SET superseded_at = ?
       WHERE ${ACTIVE_CHALLENGE}`,
    )
    .run(supersededAt, userId, purpose).changes;
}

function supersedeById(db, id, supersededAt) {
  return db
    .prepare(
      `UPDATE auth_challenges SET superseded_at = ?
       WHERE id = ? AND consumed_at IS NULL AND superseded_at IS NULL`,
    )
    .run(supersededAt, id).changes;
}

function insertChallenge(db, {
  userId,
  purpose,
  codeHash,
  maxAttempts,
  expiresAt,
  createdAt,
}) {
  const result = db
    .prepare(
      `INSERT INTO auth_challenges
        (user_id, purpose, code_hash, attempts, max_attempts, expires_at, created_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(userId, purpose, codeHash, maxAttempts, expiresAt, createdAt);
  return Number(result.lastInsertRowid);
}

function incrementAttempts(db, id, attempts) {
  db.prepare('UPDATE auth_challenges SET attempts = ? WHERE id = ?').run(attempts, id);
}

function markConsumed(db, id, verifiedAt, consumedAt) {
  db.prepare(
    `UPDATE auth_challenges SET verified_at = ?, consumed_at = ?
     WHERE id = ? AND consumed_at IS NULL AND superseded_at IS NULL`,
  ).run(verifiedAt, consumedAt, id);
}

function findThrottle(db, key) {
  return db.prepare('SELECT * FROM auth_throttle WHERE key = ?').get(key) || null;
}

function insertThrottle(db, key, startedAt) {
  db.prepare(
    'INSERT INTO auth_throttle (key, count, window_started_at, blocked_until) VALUES (?, 1, ?, NULL)',
  ).run(key, startedAt);
}

function incrementThrottle(db, key) {
  db.prepare('UPDATE auth_throttle SET count = count + 1 WHERE key = ?').run(key);
}

function resetThrottle(db, key, startedAt) {
  db.prepare(
    'UPDATE auth_throttle SET count = 1, window_started_at = ?, blocked_until = NULL WHERE key = ?',
  ).run(startedAt, key);
}

function blockThrottle(db, key, blockedUntil) {
  db.prepare('UPDATE auth_throttle SET blocked_until = ? WHERE key = ?').run(blockedUntil, key);
}

module.exports = {
  findActive,
  findLatest,
  supersedeActive,
  supersedeById,
  insertChallenge,
  incrementAttempts,
  markConsumed,
  findThrottle,
  insertThrottle,
  incrementThrottle,
  resetThrottle,
  blockThrottle,
};
