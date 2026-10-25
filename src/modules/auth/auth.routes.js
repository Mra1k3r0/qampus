const express = require('express');
const { validateBody } = require('../../core/validation');
const { setFlash } = require('../../core/context');
const { registerSchema, loginSchema } = require('./auth.schemas');
const authService = require('./auth.service');

const PORTALS = new Set(['student', 'staff', 'admin']);

function normalizePortal(value) {
  return typeof value === 'string' && PORTALS.has(value) ? value : 'student';
}

function formValues(body) {
  return {
    fullName: typeof body.fullName === 'string' ? body.fullName : '',
    studentNo: typeof body.studentNo === 'string' ? body.studentNo : '',
    email: typeof body.email === 'string' ? body.email : '',
  };
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function createAuthRouter({ db, config, security }) {
  const router = express.Router();

  function renderRegister(res, { status = 200, errors = {}, values = {} } = {}) {
    res.status(status).render('pages/register', {
      title: 'Create account',
      errors,
      values,
    });
  }

  function renderLogin(res, { status = 200, errors = {}, values = {}, nextPath = null } = {}) {
    res.status(status).render('pages/login', {
      title: 'Sign in',
      errors,
      values,
      nextPath,
    });
  }

  function registerValidationError(err, req, res, next) {
    if (err.status === 400) {
      renderRegister(res, {
        status: 400,
        errors: err.fieldErrors || { form: err.message },
        values: formValues(req.body),
      });
      return;
    }
    next(err);
  }

  function loginValidationError(err, req, res, next) {
    if (err.status === 400) {
      renderLogin(res, {
        status: 400,
        errors: err.fieldErrors || { form: err.message },
        values: {
          email: typeof req.body.email === 'string' ? req.body.email : '',
          portal: normalizePortal(req.body.portal),
        },
        nextPath: security.safeNextPath(req.body.next),
      });
      return;
    }
    next(err);
  }

  router.get('/register', security.requireGuest, (_req, res) => {
    renderRegister(res);
  });

  router.post(
    '/register',
    security.registerLimiter,
    validateBody(registerSchema, { onError: registerValidationError }),
    async (req, res, next) => {
      try {
        await authService.register(db, {
          ...req.validatedBody,
          requestId: req.id,
        });
        setFlash(req, 'success', 'Account created. Sign in to continue.');
        res.redirect(303, '/login');
      } catch (err) {
        if (err.status === 409) {
          renderRegister(res, {
            status: 409,
            errors: err.fieldErrors || { form: err.message },
            values: formValues(req.body),
          });
          return;
        }
        next(err);
      }
    },
  );

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
      const { email, password, portal, next: nextCandidate } = req.validatedBody;
      let user;

      try {
        user = await authService.login(db, { email, password, portal, requestId: req.id });
      } catch (err) {
        if (err.status === 401) {
          renderLogin(res, {
            status: 401,
            errors: { form: err.message },
            values: { email, portal: normalizePortal(portal) },
            nextPath: security.safeNextPath(nextCandidate),
          });
          return;
        }
        next(err);
        return;
      }

      try {
        await regenerateSession(req);
        req.session.userId = user.id;
        req.session.role = user.role;
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
