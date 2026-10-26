const config = require('./config');
const { openDatabase, migrate } = require('./core/db');
const { createLogger } = require('./core/logger');
const { seedDatabase } = require('./core/seed');
const { createApp } = require('./app');
const { isTunnelEnabled, parseExtraArgs, startTunnel } = require('./tunnel');

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const logger = createLogger(config);
let db;
let server;
let cleanupTimer;
let tunnelHandle = null;

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
  if (tunnelHandle) {
    tunnelHandle.dispose();
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

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const listener = app.listen(port, '0.0.0.0', () => resolve(listener));
    listener.once('error', reject);
  });
}

async function maybeStartTunnel() {
  if (!isTunnelEnabled()) return null;
  if (!process.env.CLOUDFLARED_TOKEN) {
    logger.warn('TUNNEL is enabled without CLOUDFLARED_TOKEN; starting a quick tunnel');
  }
  try {
    return await startTunnel({
      port: config.port,
      token: process.env.CLOUDFLARED_TOKEN,
      hostname: process.env.TUNNEL_HOSTNAME,
      version: process.env.CLOUDFLARED_VERSION,
      binOverride: process.env.CLOUDFLARED_BIN,
      extraArgs: parseExtraArgs(process.env.CLOUDFLARED_EXTRA_ARGS),
      onLog: (message) => logger.info(message),
      onWarn: (message) => logger.warn(message),
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'tunnel unavailable, serving locally only');
    return null;
  }
}

async function main() {
  db = openDatabase(config.databasePath);
  migrate(db);

  if (countServices() === 0) {
    seedDatabase(db);
    logger.info('seeded the empty database');
  }

  const app = createApp({ db, config });
  server = await listen(app, config.port);
  logger.info({ port: config.port }, 'server listening');

  startCleanup(app.locals.sessionStore);

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  tunnelHandle = await maybeStartTunnel();
}

main().catch((err) => {
  logger.error({ err }, 'failed to start the server');
  if (db) {
    db.close();
  }
  process.exit(1);
});
