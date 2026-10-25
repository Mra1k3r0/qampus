require('express-async-errors');

const path = require('node:path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const { csrfSync } = require('csrf-sync');
const config = require('./config');
const { createLogger, createHttpLogger } = require('./core/logger');
const { SQLiteStore } = require('./core/session-store');
const { createSecurity } = require('./core/security');
const { createContext } = require('./core/context');
const { notFoundHandler, createErrorHandler } = require('./core/errors');
const authRepository = require('./modules/auth/auth.repository');
const { createRouter } = require('./routes');

const PUBLIC_BOARD_PATHS = new Set(['/display', '/api/display']);
const ANONYMOUS_READ_PATHS = new Set(['/', '/policy', '/display', '/api/display']);

function loadUser(db) {
  return function loadUserMiddleware(req, _res, next) {
    if (!req.session.userId) {
      req.user = null;
      next();
      return;
    }

    const user = authRepository.findById(db, req.session.userId);
    if (!user || !user.isActive) {
      delete req.session.userId;
      delete req.session.role;
      req.user = null;
      next();
      return;
    }

    req.user = user;
    next();
  };
}

function createApp({ db, config: appConfig = config }) {
  const app = express();
  const logger = createLogger(appConfig);
  const security = createSecurity();
  const sessionStore = new SQLiteStore(db, { ttlMs: appConfig.sessionMaxAgeMs });
  const { csrfSynchronisedProtection } = csrfSync({
    getTokenFromRequest: (req) => (req.body && req.body._csrf) || req.get('x-csrf-token'),
  });

  app.disable('x-powered-by');
  if (appConfig.isProduction) {
    app.set('trust proxy', 1);
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(appConfig.projectRoot, 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layouts/app');

  app.use(security.helmet);
  app.use(createHttpLogger(logger));
  app.use(express.static(path.join(appConfig.projectRoot, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(express.json({ limit: '16kb' }));

  app.use(
    session({
      name: appConfig.cookieName,
      secret: appConfig.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: appConfig.isProduction,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: appConfig.cookieSecure,
        maxAge: appConfig.sessionMaxAgeMs,
      },
    }),
  );

  const flashMiddleware = flash();
  app.use((req, res, next) => {
    // connect-flash seeds req.session.flash on every request, which mints a session for anonymous readers
    if (req.method === 'GET' && !req.session.userId && ANONYMOUS_READ_PATHS.has(req.path)) {
      next();
      return;
    }
    flashMiddleware(req, res, next);
  });
  app.use(loadUser(db));
  app.use(csrfSynchronisedProtection);
  app.use((req, res, next) => {
    const needsToken = !ANONYMOUS_READ_PATHS.has(req.path) || Boolean(req.user);
    if (req.path !== '/health' && !PUBLIC_BOARD_PATHS.has(req.path) && needsToken) {
      Object.defineProperty(res.locals, 'csrfToken', {
        configurable: true,
        enumerable: true,
        get: () => req.csrfToken(),
      });
    }
    next();
  });
  const context = createContext({ appName: appConfig.appName });
  app.use((req, res, next) => {
    // flash() writes req.session.flash on every read, which would persist a session for the board
    if (PUBLIC_BOARD_PATHS.has(req.path)) {
      res.locals.appName = appConfig.appName;
      next();
      return;
    }
    context(req, res, next);
  });

  app.use(createRouter({ db, config: appConfig, security }));

  app.use(notFoundHandler);
  app.use(createErrorHandler({ db }));

  app.locals.db = db;
  app.locals.logger = logger;
  app.locals.sessionStore = sessionStore;

  return app;
}

module.exports = {
  createApp,
};
