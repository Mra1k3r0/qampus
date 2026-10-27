const config = require('../../config');
const { immediateTransaction } = require('../db');
const { nowIso } = require('../time');
const { open, seal } = require('./crypto');

const DEFAULT_LIMIT = 10;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 5 * 60 * 1000;
const STALE_SENDING_MS = 5 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

const CLAIMABLE = "status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)";

function truncateError(err) {
  const message = err && err.message ? err.message : 'Mail send failed.';
  return String(message).slice(0, MAX_ERROR_LENGTH);
}

function retryDelayMs(attempts) {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(RETRY_BASE_MS * (2 ** exponent), RETRY_MAX_MS);
}

function isRetryable(err) {
  if (err && typeof err.retryable === 'boolean') {
    return err.retryable;
  }
  const status = Number(err && (err.status || err.statusCode));
  if (!Number.isFinite(status) || status === 0) {
    return true;
  }
  return status === 429 || status >= 500;
}

function enqueueMail(db, { to, template, subject, data }, { encryptionKey } = {}) {
  const sealed = seal(JSON.stringify(data || {}), encryptionKey);
  const createdAt = nowIso();
  const result = db
    .prepare(`
      INSERT INTO mail_outbox
        (to_email, template, subject, payload_ciphertext, payload_iv, payload_tag,
         status, attempts, next_attempt_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    `)
    .run(
      to,
      template,
      subject,
      sealed.ciphertext,
      sealed.iv,
      sealed.tag,
      createdAt,
      createdAt,
    );
  return Number(result.lastInsertRowid);
}

function resetStaleSending(db, nowMs = Date.now()) {
  const cutoff = new Date(nowMs - STALE_SENDING_MS).toISOString();
  return db
    .prepare("UPDATE mail_outbox SET status = 'pending' WHERE status = 'sending' AND created_at <= ?")
    .run(cutoff).changes;
}

function claimNext(db, now) {
  return immediateTransaction(db, () => {
    const candidate = db
      .prepare(`SELECT * FROM mail_outbox WHERE ${CLAIMABLE} ORDER BY id LIMIT 1`)
      .get(now);
    if (!candidate) {
      return null;
    }
    db.prepare(`
      UPDATE mail_outbox
      SET status = 'sending', attempts = attempts + 1
      WHERE id = ? AND status = 'pending'
    `).run(candidate.id);
    return { ...candidate, attempts: candidate.attempts + 1 };
  });
}

function markSent(db, id, providerMessageId) {
  db.prepare(`
    UPDATE mail_outbox
    SET status = 'sent',
        sent_at = ?,
        provider_message_id = ?,
        last_error = NULL,
        next_attempt_at = NULL,
        payload_ciphertext = NULL,
        payload_iv = NULL,
        payload_tag = NULL
    WHERE id = ?
  `).run(nowIso(), providerMessageId || null, id);
}

function markRetry(db, id, err, attempts) {
  const nextAttemptAt = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
  db.prepare(`
    UPDATE mail_outbox
    SET status = 'pending', last_error = ?, next_attempt_at = ?
    WHERE id = ?
  `).run(truncateError(err), nextAttemptAt, id);
}

function markFailed(db, id, err) {
  db.prepare(`
    UPDATE mail_outbox
    SET status = 'failed',
        last_error = ?,
        next_attempt_at = NULL,
        payload_ciphertext = NULL,
        payload_iv = NULL,
        payload_tag = NULL
    WHERE id = ?
  `).run(truncateError(err), id);
}

async function sendRow({ db, mailer, render, logger, encryptionKey, row }) {
  let data;
  let rendered;

  try {
    data = JSON.parse(open({
      ciphertext: row.payload_ciphertext,
      iv: row.payload_iv,
      tag: row.payload_tag,
    }, encryptionKey));
    rendered = await render({ template: row.template, data });
  } catch (err) {
    markFailed(db, row.id, err);
    if (logger) {
      logger.error({ outboxId: row.id, template: row.template }, 'could not prepare queued mail');
    }
    return { id: row.id, status: 'failed' };
  }

  try {
    const result = await mailer.send({
      to: row.to_email,
      subject: row.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: String(row.id),
    });
    markSent(db, row.id, result && result.id);
    return { id: row.id, status: 'sent' };
  } catch (err) {
    if (isRetryable(err)) {
      markRetry(db, row.id, err, row.attempts);
      if (logger) {
        logger.warn({ outboxId: row.id, template: row.template }, 'queued mail will retry');
      }
      return { id: row.id, status: 'retry' };
    }

    markFailed(db, row.id, err);
    if (logger) {
      logger.error({ outboxId: row.id, template: row.template }, 'queued mail failed permanently');
    }
    return { id: row.id, status: 'failed' };
  }
}

let isDraining = false;

function skippedResult() {
  return {
    skipped: true,
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    results: [],
  };
}

async function runMailOutbox({
  db,
  mailer,
  render,
  logger,
  limit = DEFAULT_LIMIT,
  encryptionKey,
  resetStale = false,
} = {}) {
  if (isDraining) {
    return skippedResult();
  }
  if (typeof render !== 'function') {
    throw new Error('runMailOutbox requires a render function.');
  }

  isDraining = true;
  try {
    const key = encryptionKey || config.mail.encryptionKey;
    if (resetStale) {
      resetStaleSending(db);
    }

    const results = [];
    let processed = 0;

    while (processed < limit) {
      const row = claimNext(db, nowIso());
      if (!row) {
        break;
      }

      const result = await sendRow({ db, mailer, render, logger, encryptionKey: key, row });
      results.push(result);
      processed += 1;
    }

    return {
      skipped: false,
      processed,
      sent: results.filter((item) => item.status === 'sent').length,
      retried: results.filter((item) => item.status === 'retry').length,
      failed: results.filter((item) => item.status === 'failed').length,
      results,
    };
  } finally {
    isDraining = false;
  }
}

module.exports = {
  enqueueMail,
  runMailOutbox,
  resetStaleSending,
  isRetryable,
};
