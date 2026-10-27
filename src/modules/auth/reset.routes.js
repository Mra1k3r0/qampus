const express = require('express');
const { validateBody } = require('../../core/validation');
const { setFlash } = require('../../core/context');
const { nowIso } = require('../../core/time');
const { forgotPasswordSchema, resetCodeSchema, resetPasswordSchema } = require('./auth.schemas');
const resetService = require('./reset.service');
const {
  regenerateSession,
  saveSession,
  setReset,
  clearReset,
  clearPending,
} = require('./auth.session');

const RESET_SESSION_MINUTES = 10;
const MS_PER_MINUTE = 60 * 1000;
const CODE_FAILURE_MESSAGE = 'That code is incorrect or expired.';
const PASSWORD_UPDATED_FLASH = 'Password updated. Sign in with your new password.';
const RESET_REQUIRED_FIELDS = ['password', 'confirmPassword'];

function getMissingFields(body, fieldNames) {
  const input = body && typeof body === 'object' ? body : {};
  return fieldNames.filter((name) => typeof input[name] !== 'string' || input[name].trim() === '');
}

function createResetRouter({ db, config, security }) {
  const router = express.Router();

  function renderForgot(res, { status = 200, errors = {}, values = {}, missingFields = [] } = {}) {
    res.status(status).render('pages/forgot-password', {
      title: 'Forgot password',
      errors,
      values,
      missingFields,
    });
  }

  function renderReset(res, { status = 200, email = '', errors = {}, values = {}, missingFields = [] } = {}) {
    res.status(status).render('pages/reset-password', {
      title: 'Reset password',
      email,
      errors,
      values,
      missingFields,
    });
  }

  function renderNewPassword(res, { status = 200, errors = {}, missingFields = [] } = {}) {
    res.status(status).render('pages/reset-password-new', {
      title: 'Set a new password',
      errors,
      missingFields,
    });
  }

  function forgotValidationError(err, req, res, next) {
    if (err.status !== 400) {
      next(err);
      return;
    }
    renderForgot(res, {
      status: 400,
      errors: err.fieldErrors || { form: err.message },
      values: { email: typeof req.body.email === 'string' ? req.body.email : '' },
      missingFields: getMissingFields(req.body, ['email']),
    });
  }

  function resetValidationError(err, req, res, next) {
    if (err.status !== 400) {
      next(err);
      return;
    }
    renderReset(res, {
      status: 400,
      email: typeof req.body.email === 'string' ? req.body.email : '',
      errors: err.fieldErrors || { form: err.message },
      values: { email: typeof req.body.email === 'string' ? req.body.email : '' },
      missingFields: getMissingFields(req.body, ['email', 'code']),
    });
  }

  function newPasswordValidationError(err, req, res, next) {
    if (err.status !== 400) {
      next(err);
      return;
    }
    renderNewPassword(res, {
      status: 400,
      errors: err.fieldErrors || { form: err.message },
      missingFields: getMissingFields(req.body, RESET_REQUIRED_FIELDS),
    });
  }

  function hasValidResetSession(req) {
    const reset = req.session.reset;
    if (!reset || typeof reset.userId !== 'number' || !reset.expiresAt) {
      return false;
    }
    return new Date(reset.expiresAt).getTime() > Date.now();
  }

  async function requireResetSession(req, res, next) {
    if (hasValidResetSession(req)) {
      next();
      return;
    }
    clearReset(req);
    await saveSession(req);
    res.redirect(303, '/forgot-password');
  }

  router.get('/forgot-password', security.requireGuest, (_req, res) => {
    renderForgot(res);
  });

  router.post(
    '/forgot-password',
    security.requireGuest,
    security.forgotLimiter,
    validateBody(forgotPasswordSchema, { onError: forgotValidationError }),
    async (req, res) => {
      await resetService.requestPasswordReset(db, {
        email: req.validatedBody.email,
        requestId: req.id,
        mailConfig: config.mail,
      });
      res.redirect(303, '/forgot-password/sent');
    },
  );

  router.get('/forgot-password/sent', security.requireGuest, (_req, res) => {
    res.render('pages/forgot-sent', { title: 'Check your email' });
  });

  router.get('/reset-password', security.requireGuest, (_req, res) => {
    renderReset(res, { email: '' });
  });

  router.post(
    '/reset-password',
    security.requireGuest,
    security.resetLimiter,
    validateBody(resetCodeSchema, { onError: resetValidationError }),
    async (req, res) => {
      const { email, code } = req.validatedBody;
      const now = nowIso();
      const result = await resetService.verifyResetCode(db, { email, code, now });

      if (!result.ok) {
        renderReset(res, {
          status: 400,
          email,
          errors: { code: CODE_FAILURE_MESSAGE },
          values: { email },
        });
        return;
      }

      const expiresAt = new Date(Date.parse(now) + RESET_SESSION_MINUTES * MS_PER_MINUTE).toISOString();
      await regenerateSession(req);
      setReset(req, { userId: result.userId, verifiedAt: now, expiresAt });
      clearPending(req);
      req.csrfToken(true);
      await saveSession(req);
      res.redirect(303, '/reset-password/new');
    },
  );

  router.get(
    '/reset-password/new',
    security.requireGuest,
    requireResetSession,
    (_req, res) => {
      renderNewPassword(res);
    },
  );

  router.post(
    '/reset-password/new',
    security.requireGuest,
    security.resetLimiter,
    requireResetSession,
    validateBody(resetPasswordSchema, { onError: newPasswordValidationError }),
    async (req, res) => {
      await resetService.setNewPassword(db, {
        userId: req.session.reset.userId,
        password: req.validatedBody.password,
        requestId: req.id,
        mailConfig: config.mail,
        logger: req.log,
      });

      clearReset(req);
      setFlash(req, 'success', PASSWORD_UPDATED_FLASH);
      await saveSession(req);
      res.redirect(303, '/login?reset=1');
    },
  );

  return router;
}

module.exports = {
  createResetRouter,
};
