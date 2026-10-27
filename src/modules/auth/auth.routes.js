const express = require('express');
const { validateBody } = require('../../core/validation');
const { loginSchema } = require('./auth.schemas');
const authService = require('./auth.service');
const {
  regenerateSession,
  saveSession,
  destroySession,
} = require('./auth.session');

const PORTALS = new Set(['student', 'staff', 'admin']);
const LOGIN_REQUIRED_FIELDS = ['email', 'password'];

function normalizePortal(value) {
  return typeof value === 'string' && PORTALS.has(value) ? value : 'student';
}

function getMissingFields(body, fieldNames) {
  const input = body && typeof body === 'object' ? body : {};
  return fieldNames.filter((name) => typeof input[name] !== 'string' || input[name].trim() === '');
}

function loginFormValues(body) {
  return {
    email: typeof body.email === 'string' ? body.email : '',
    portal: normalizePortal(body.portal),
    remember: body.remember === 'on' ? 'on' : '',
  };
}

function createAuthRouter({ db, config, security }) {
  const router = express.Router();

  function renderLogin(res, { status = 200, errors = {}, values = {}, missingFields = [], nextPath = null } = {}) {
    res.status(status).render('pages/login', {
      title: 'Sign in',
      errors,
      values,
      missingFields,
      nextPath,
    });
  }

  function loginValidationError(err, req, res, next) {
    if (err.status === 400) {
      renderLogin(res, {
        status: 400,
        errors: err.fieldErrors || { form: err.message },
        values: loginFormValues(req.body),
        missingFields: getMissingFields(req.body, LOGIN_REQUIRED_FIELDS),
        nextPath: security.safeNextPath(req.body.next),
      });
      return;
    }
    next(err);
  }

  router.get('/login', security.requireGuest, (req, res) => {
    renderLogin(res, {
      values: { portal: normalizePortal(req.query.portal) },
      nextPath: security.safeNextPath(req.query.next),
    });
  });

  router.post(
    '/login',
    security.loginLimiter,
    validateBody(loginSchema, { onError: loginValidationError }),
    async (req, res, next) => {
      const { email, password, portal, remember, next: nextCandidate } = req.validatedBody;
      let user;

      try {
        user = await authService.login(db, { email, password, portal, requestId: req.id });
      } catch (err) {
        if (err.status === 401) {
          renderLogin(res, {
            status: 401,
            errors: { form: err.message },
            values: { email, portal: normalizePortal(portal), remember },
            nextPath: security.safeNextPath(nextCandidate),
          });
          return;
        }
        next(err);
        return;
      }

      try {
        await regenerateSession(req);
        req.session.cookie.maxAge = remember === 'on' ? config.sessionRememberMaxAgeMs : null;
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.sessionVersion = user.sessionVersion;
        req.csrfToken(true);
        await saveSession(req);
      } catch (err) {
        next(err);
        return;
      }

      const fallbackPath = security.homePathFor(user.role);
      res.redirect(303, security.safeNextPath(nextCandidate) || fallbackPath);
    },
  );

  router.post('/logout', security.requireAuth, async (req, res, next) => {
    const userId = req.user.id;
    authService.logout(db, { userId, requestId: req.id });

    try {
      await destroySession(req);
    } catch (err) {
      next(err);
      return;
    }

    res.clearCookie(config.cookieName);
    res.redirect(303, '/login');
  });

  return router;
}

module.exports = {
  createAuthRouter,
  normalizePortal,
};
