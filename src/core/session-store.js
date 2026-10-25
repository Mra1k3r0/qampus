const session = require('express-session');
const { nowIso } = require('./time');

class SQLiteStore extends session.Store {
  constructor(db, { ttlMs }) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
    this.getStatement = db.prepare('SELECT sess, expires_at FROM sessions WHERE sid = ?');
    this.setStatement = db.prepare(
      `INSERT INTO sessions (sid, sess, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`,
    );
    this.destroyStatement = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStatement = db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?');
    this.clearStatement = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  }

  expiryIso() {
    return new Date(Date.now() + this.ttlMs).toISOString();
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expires_at <= nowIso()) {
        this.destroyStatement.run(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      this.setStatement.run(sid, JSON.stringify(sess), this.expiryIso());
      if (callback) {
        callback(null);
      }
    } catch (err) {
      if (callback) {
        callback(err);
      }
    }
  }

  destroy(sid, callback) {
    try {
      this.destroyStatement.run(sid);
      if (callback) {
        callback(null);
      }
    } catch (err) {
      if (callback) {
        callback(err);
      }
    }
  }

  touch(sid, _sess, callback) {
    try {
      this.touchStatement.run(this.expiryIso(), sid);
      if (callback) {
        callback(null);
      }
    } catch (err) {
      if (callback) {
        callback(err);
      }
    }
  }

  clearExpired(callback) {
    try {
      const result = this.clearStatement.run(nowIso());
      if (callback) {
        callback(null, result.changes);
      }
      return result.changes;
    } catch (err) {
      if (callback) {
        callback(err);
      }
      return 0;
    }
  }
}

module.exports = {
  SQLiteStore,
};
