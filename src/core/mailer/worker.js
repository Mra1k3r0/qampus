const { runMailOutbox } = require('./outbox');

const DEFAULT_INTERVAL_MS = 2000;

function startMailWorker({
  db,
  mailer,
  render,
  logger,
  intervalMs = DEFAULT_INTERVAL_MS,
}) {
  function drain(resetStale) {
    runMailOutbox({ db, mailer, render, logger, resetStale }).catch((err) => {
      logger.error({ err }, 'mail worker drain failed');
    });
  }

  drain(true);

  const timer = setInterval(() => drain(false), intervalMs);
  timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

module.exports = {
  startMailWorker,
};
