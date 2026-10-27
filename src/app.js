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
const { createMailer } = require('./core/mailer');
const { notFoundHandler, createErrorHandler } = require('./core/errors');
const {
  THEME_BOOTSTRAP_SCRIPT,
  assetUrl,
  initAssets,
  isVersionedDir,
  isVersionedRequest,
} = require('./core/assets');
const authRepository = require('./modules/auth/auth.repository');
const { regenerateSession } = require('./modules/auth/auth.session');
const { AVATAR_UPLOAD_PATH, avatarUploadPreCsrf } = require('./modules/profile/profile.upload');
const { createDailySweep } = require('./modules/tickets/tickets.sweep');
const { createRouter } = require('./routes');

const PUBLIC_BOARD_PATHS = new Set(['/display', '/api/display']);
const ANONYMOUS_READ_PATHS = new Set(['/', '/rules', '/policy', '/display', '/api/display']);
const STATIC_CACHE_METHODS = new Set(['GET', 'HEAD']);
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE_CACHE = 'no-cache';
const NO_STORE_CACHE = 'no-store';

function createAssetCacheHeaders() {
  return function assetCacheHeaders(req, res, next) {
    if (isVersionedDir(req.path)) {
      const isImmutable = STATIC_CACHE_METHODS.has(req.method)
        && isVersionedRequest(req.path, req.query.v);
      res.set('Cache-Control', isImmutable ? IMMUTABLE_CACHE : REVALIDATE_CACHE);
      next();
      return;
    }
    res.set('Cache-Control', NO_STORE_CACHE);
    next();
  };
}

function isSessionUserValid(user, session) {
  return Boolean(user)
    && user.isActive
    && Boolean(user.emailVerifiedAt)
    && session.sessionVersion === user.sessionVersion;
}

function loadUser(db) {
  return function loadUserMiddleware(req, _res, next) {
    if (!req.session.userId) {
      req.user = null;
      next();
      return;
    }

    const user = authRepository.findById(db, req.session.userId);
    if (!isSessionUserValid(user, req.session)) {
      req.user = null;
      regenerateSession(req).then(() => next(), next);
      return;
    }

    req.user = user;
    next();
  };
}

function createApp({ db, config: appConfig = config, enableSweep = true, mailer }) {
  const app = express();
  const logger = createLogger(appConfig);
  const mailerInstance = mailer || createMailer(appConfig, { logger });
  const security = createSecurity();
  const sessionStore = new SQLiteStore(db, {
    ttlMs: appConfig.sessionMaxAgeMs,
    rememberMaxAgeMs: appConfig.sessionRememberMaxAgeMs,
  });
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
  initAssets(path.join(appConfig.projectRoot, 'public'));
  app.use(createAssetCacheHeaders());
  app.use(express.static(path.join(appConfig.projectRoot, 'public'), { cacheControl: false }));
  if (enableSweep) {
    app.use(createDailySweep({ db, logger }));
  }
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    // multipart must be parsed before the global CSRF check can read req.body._csrf
    if (req.method === 'POST' && req.path === AVATAR_UPLOAD_PATH) {
      avatarUploadPreCsrf(req, res, next);
      return;
    }
    next();
  });

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
  app.use((req, res, next) => {
    res.locals.publicBaseUrl = appConfig.publicBaseUrl;
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
  app.locals.mailer = mailerInstance;
  app.locals.sessionStore = sessionStore;
  app.locals.assetUrl = assetUrl;
  app.locals.themeBootstrap = THEME_BOOTSTRAP_SCRIPT;

  return app;
}

module.exports = {
  createApp,
};
