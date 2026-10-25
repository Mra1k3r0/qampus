const { nowIso } = require('./time');

function toJson(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function writeAudit(db, {
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  before = null,
  after = null,
  requestId = null,
}) {
  db.prepare(
    `INSERT INTO audit_log
      (actor_user_id, action, entity_type, entity_id, before_json, after_json, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    actorUserId,
    action,
    entityType,
    entityId,
    toJson(before),
    toJson(after),
    requestId,
    nowIso(),
  );
}

module.exports = {
  writeAudit,
};
