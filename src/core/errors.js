const createError = require('http-errors');
const { writeAudit } = require('./audit');

function notFoundHandler(_req, _res, next) {
  next(createError(404, 'That page does not exist.'));
}

function wantsJson(req) {
  return req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';
}

function auditCsrfFailure(db, req) {
  try {
    writeAudit(db, {
      actorUserId: req.user ? req.user.id : null,
      action: 'csrf_failure',
      entityType: 'request',
      entityId: null,
      after: { method: req.method, path: req.path },
      requestId: req.id || null,
    });
  } catch (err) {
    if (req.log) {
      req.log.error({ err }, 'could not write csrf audit row');
    }
  }
}

function createErrorHandler({ db }) {
  return function errorHandler(err, req, res, next) {
    if (res.headersSent) {
      next(err);
      return;
    }

    const status = err.status || err.statusCode || 500;
    const isServerError = status >= 500;

    if (isServerError && req.log) {
      req.log.error({ err, requestId: req.id }, 'unhandled request error');
    }

    if (err.code === 'EBADCSRFTOKEN') {
      auditCsrfFailure(db, req);
    }

    let message = isServerError ? 'Something went wrong. Try again.' : err.message;
    if (err.code === 'EBADCSRFTOKEN') {
      message = 'Your form expired. Reload the page and try again.';
    }

    if (wantsJson(req)) {
      res.status(status).json({
        error: err.code || 'request_error',
        message,
        requestId: req.id,
      });
      return;
    }

    const view = status === 404 ? 'pages/404' : 'pages/error';
    res.status(status).render(view, {
      title: status === 404 ? 'Page not found' : 'Request failed',
      status,
      message,
      requestId: req.id,
    });
  };
}

module.exports = {
  notFoundHandler,
  createErrorHandler,
};
