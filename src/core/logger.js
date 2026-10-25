const pino = require('pino');
const pinoHttp = require('pino-http');
const { randomUUID } = require('node:crypto');

const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.confirmPassword',
  'req.body._csrf',
];

function createLogger(config) {
  return pino({
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  });
}

function createHttpLogger(logger) {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const requestId = req.headers['x-request-id'] || randomUUID();
      res.setHeader('X-Request-Id', requestId);
      return requestId;
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  });
}

module.exports = {
  createLogger,
  createHttpLogger,
};
