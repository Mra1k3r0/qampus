const express = require('express');
const { validateBody } = require('../../core/validation');
const { setFlash } = require('../../core/context');
const { codeFormSchema } = require('./auth.schemas');
const verificationService = require('./verification.service');
const {
  saveSession,
  clearPending,
} = require('./auth.session');

const CODE_MESSAGES = Object.freeze({
  invalid: 'That code is incorrect.',
  expired: 'That code expired. Send a new code.',
  too_many_attempts: 'Too many attempts. Send a new code.',
  missing: 'That code is no longer valid. Send a new code.',
});

const CHECK_EMAIL_FLASH = 'Check your email to continue.';
const COOLDOWN_FLASH = 'Wait before requesting another code.';
const RESEND_FLASH = 'A new code is on the way.';
const VERIFIED_FLASH = 'Email confirmed. Sign in to continue.';

function createVerificationRouter({ db, config, security }) {
  const router = express.Router();

  function renderVerify(res, { status = 200, email = '', errors = {} } = {}) {
    res.status(status).render('pages/verify-email', {
      title: 'Verify your email',
      email,
      errors,
      values: {},
      missingFields: [],
    });
  }

  function requirePending(req, res, next) {
    if (!req.session.pending) {
      res.redirect(303, '/register');
      return;
    }
    next();
  }

  function verifyValidationError(err, req, res, next) {
    if (err.status === 400) {
      renderVerify(res, {
        status: 400,
        email: req.session.pending ? req.session.pending.email : '',
        errors: { code: (err.fieldErrors && err.fieldErrors.code) || 'Enter the 8-digit code.' },
      });
      return;
    }
    next(err);
  }

  router.get('/register/check-email', security.requireGuest, (req, res) => {
    res.render('pages/check-email', {
      title: 'Check your email',
      email: req.session.pending ? req.session.pending.email : '',
    });
  });

  router.get('/verify-email', security.requireGuest, async (req, res) => {
    const pending = req.session.pending;
    if (!pending) {
      res.redirect(303, '/register');
      return;
    }

    const user = verificationService.findPendingUser(db, pending.userId);
    if (!user) {
      clearPending(req);
      await saveSession(req);
      res.redirect(303, '/register');
      return;
    }

    if (user.emailVerifiedAt) {
      clearPending(req);
      await saveSession(req);
      res.redirect(303, '/login');
      return;
    }

    renderVerify(res, { email: pending.email });
  });

  router.post(
    '/verify-email',
    security.requireGuest,
    security.verifyLimiter,
    requirePending,
    validateBody(codeFormSchema, { onError: verifyValidationError }),
    async (req, res) => {
      const pending = req.session.pending;

      const result = await verificationService.verifyEmail(db, {
        userId: pending.userId,
        code: req.validatedBody.code,
        requestId: req.id,
      });

      if (!result.ok) {
        renderVerify(res, {
          status: 400,
          email: pending.email,
          errors: { code: CODE_MESSAGES[result.reason] || CODE_MESSAGES.missing },
        });
        return;
      }

      clearPending(req);
      setFlash(req, 'success', VERIFIED_FLASH);
      await saveSession(req);
      res.redirect(303, '/login?verified=1');
    },
  );

  router.post(
    '/verify-email/resend',
    security.requireGuest,
    security.resendLimiter,
    requirePending,
    async (req, res) => {
      const pending = req.session.pending;

      const result = await verificationService.resendVerification(db, {
        userId: pending.userId,
        email: pending.email,
        requestId: req.id,
        mailConfig: config.mail,
      });

      if (!result.ok) {
        clearPending(req);
        setFlash(req, 'error', CHECK_EMAIL_FLASH);
        await saveSession(req);
        res.redirect(303, '/register/check-email');
        return;
      }

      setFlash(req, 'success', result.challengeError ? COOLDOWN_FLASH : RESEND_FLASH);
      await saveSession(req);
      res.redirect(303, '/register/check-email');
    },
  );

  return router;
}

module.exports = {
  createVerificationRouter,
};
