const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const createError = require('http-errors');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 10;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_LIMIT = 5;
const JOIN_WINDOW_MS = 60 * 1000;
const JOIN_LIMIT = 20;
const MAX_NEXT_PATH_LENGTH = 2048;
const HOME_PATHS = {
  student: '/queue',
  staff: '/staff/queue',
  admin: '/admin/services',
};

function homePathFor(role) {
  return HOME_PATHS[role] || '/login';
}

function isStaff(user) {
  return Boolean(user) && (user.role === 'staff' || user.role === 'admin');
}

function safeNextPath(candidate) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const value = candidate.trim();
  if (!value || value.length > MAX_NEXT_PATH_LENGTH) {
    return null;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  const hasControlCharacter = [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (hasControlCharacter) {
    return null;
  }
  try {
    const parsed = new URL(value, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function createHelmet() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
  });
}

function createLimiters() {
  const loginLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: LOGIN_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).type('text').send('Too many sign in attempts. Try again later.');
    },
  });

  const registerLimiter = rateLimit({
    windowMs: REGISTER_WINDOW_MS,
    limit: REGISTER_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).type('text').send('Too many registration attempts. Try again later.');
    },
  });

  const joinLimiter = rateLimit({
    windowMs: JOIN_WINDOW_MS,
    limit: JOIN_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).type('text').send('Too many ticket requests. Try again in a minute.');
    },
  });

  return { loginLimiter, registerLimiter, joinLimiter };
}

function createSecurity() {
  function redirectToLogin(req, res) {
    const nextPath = safeNextPath(req.originalUrl);
    const target = nextPath
      ? `/login?next=${encodeURIComponent(nextPath).replace(/%2F/g, '/')}`
      : '/login';
    res.redirect(302, target);
  }

  function requireAuth(req, res, next) {
    if (req.user) {
      next();
      return;
    }
    redirectToLogin(req, res);
  }

  function requireRole(...roles) {
    return function checkRole(req, res, next) {
      if (!req.user) {
        redirectToLogin(req, res);
        return;
      }
      if (!roles.includes(req.user.role)) {
        next(createError(403, 'You do not have access to that page.'));
        return;
      }
      next();
    };
  }

  function requireGuest(req, res, next) {
    if (req.user) {
      res.redirect(303, homePathFor(req.user.role));
      return;
    }
    next();
  }

  const { loginLimiter, registerLimiter, joinLimiter } = createLimiters();

  return {
    helmet: createHelmet(),
    requireAuth,
    requireRole,
    requireGuest,
    loginLimiter,
    registerLimiter,
    joinLimiter,
    isStaff,
    safeNextPath,
    homePathFor,
  };
}

module.exports = {
  createSecurity,
  safeNextPath,
  isStaff,
  homePathFor,
  LOGIN_WINDOW_MS,
  LOGIN_LIMIT,
  REGISTER_WINDOW_MS,
  REGISTER_LIMIT,
  JOIN_WINDOW_MS,
  JOIN_LIMIT,
};
