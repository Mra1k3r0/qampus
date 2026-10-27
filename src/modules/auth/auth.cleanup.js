const { nowIso } = require('../../core/time');

const HOUR_MS = 60 * 60 * 1000;
const CHALLENGE_RETENTION_MS = 24 * HOUR_MS;
const THROTTLE_RETENTION_MS = 24 * HOUR_MS;
const SENT_OUTBOX_RETENTION_MS = 7 * 24 * HOUR_MS;
const FAILED_OUTBOX_RETENTION_MS = 30 * 24 * HOUR_MS;

function cleanupAuth(db, now = nowIso()) {
  const nowMs = new Date(now).getTime();
  const challengeCutoff = new Date(nowMs - CHALLENGE_RETENTION_MS).toISOString();
  const throttleCutoff = new Date(nowMs - THROTTLE_RETENTION_MS).toISOString();
  const sentCutoff = new Date(nowMs - SENT_OUTBOX_RETENTION_MS).toISOString();
  const failedCutoff = new Date(nowMs - FAILED_OUTBOX_RETENTION_MS).toISOString();

  const challenges = db.prepare(`
    DELETE FROM auth_challenges
    WHERE (consumed_at IS NOT NULL AND consumed_at < ?)
       OR (superseded_at IS NOT NULL AND superseded_at < ?)
       OR expires_at < ?
  `).run(challengeCutoff, challengeCutoff, challengeCutoff).changes;

  const throttle = db.prepare(`
    DELETE FROM auth_throttle
    WHERE (blocked_until IS NOT NULL AND blocked_until < ?)
       OR window_started_at < ?
  `).run(now, throttleCutoff).changes;

  const outbox = db.prepare(`
    DELETE FROM mail_outbox
    WHERE (status = 'sent' AND sent_at < ?)
       OR (status = 'failed' AND created_at < ?)
  `).run(sentCutoff, failedCutoff).changes;

  return { challenges, throttle, outbox };
}

module.exports = {
  cleanupAuth,
};
