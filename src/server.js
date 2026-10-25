const config = require('./config');
const { openDatabase, migrate } = require('./core/db');
const { createLogger } = require('./core/logger');
const { seedDatabase } = require('./core/seed');
const { createApp } = require('./app');

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const logger = createLogger(config);
let db;
let server;
let cleanupTimer;

function countServices() {
  return db.prepare('SELECT COUNT(*) AS count FROM services').get().count;
}

function startCleanup(store) {
  store.clearExpired();
  cleanupTimer = setInterval(() => {
    store.clearExpired();
  }, SESSION_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  if (!server) {
    if (db) {
      db.close();
    }
    process.exit(0);
    return;
  }

  server.close(() => {
    if (db) {
      db.close();
    }
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

function main() {
  db = openDatabase(config.databasePath);
  migrate(db);

  if (countServices() === 0) {
    seedDatabase(db);
    logger.info('seeded the empty database');
  }

  const app = createApp({ db, config });
  server = app.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'server listening');
  });

  startCleanup(app.locals.sessionStore);

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (err) {
  logger.error({ err }, 'failed to start the server');
  if (db) {
    db.close();
  }
  process.exit(1);
}
