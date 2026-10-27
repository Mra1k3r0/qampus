const express = require('express');
const { validateBody } = require('../../core/validation');
const { registerSchema } = require('./auth.schemas');
const authService = require('./auth.service');
const {
  regenerateSession,
  saveSession,
  setPending,
  clearPending,
} = require('./auth.session');
const { setFlash } = require('../../core/context');

const REGISTER_REQUIRED_FIELDS = ['fullName', 'studentNo', 'email', 'password', 'confirmPassword'];

function getMissingFields(body, fieldNames) {
  const input = body && typeof body === 'object' ? body : {};
  return fieldNames.filter((name) => typeof input[name] !== 'string' || input[name].trim() === '');
}

function formValues(body) {
  return {
    fullName: typeof body.fullName === 'string' ? body.fullName : '',
    studentNo: typeof body.studentNo === 'string' ? body.studentNo : '',
    email: typeof body.email === 'string' ? body.email : '',
    policy: body.policy === 'agreed' ? 'agreed' : '',
  };
}

function createRegisterRouter({ db, config, security }) {
  const router = express.Router();

  function renderRegister(res, { status = 200, errors = {}, values = {}, missingFields = [] } = {}) {
    res.status(status).render('pages/register', {
      title: 'Create account',
      errors,
      values,
      missingFields,
    });
  }

  function registerValidationError(err, req, res, next) {
    if (err.status === 400) {
      renderRegister(res, {
        status: 400,
        errors: err.fieldErrors || { form: err.message },
        values: formValues(req.body),
        missingFields: getMissingFields(req.body, REGISTER_REQUIRED_FIELDS),
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
    security.requireGuest,
    security.registerLimiter,
    validateBody(registerSchema, { onError: registerValidationError }),
    async (req, res, next) => {
      try {
        const result = await authService.register(db, {
          ...req.validatedBody,
          requestId: req.id,
          passwordLeakCheck: config.passwordLeakCheck,
          mailConfig: config.mail,
        });

        await regenerateSession(req);

        if (result.isVerified) {
          clearPending(req);
        } else {
          setPending(req, { userId: result.user.id, email: result.user.email });
          if (result.challengeError) {
            setFlash(req, 'error', 'Wait before requesting another code.');
          }
        }

        req.csrfToken(true);
        await saveSession(req);
        res.redirect(303, '/register/check-email');
      } catch (err) {
        if (err.status === 400 || err.status === 409) {
          renderRegister(res, {
            status: err.status,
            errors: err.fieldErrors || { form: err.message },
            values: formValues(req.body),
            missingFields: getMissingFields(req.body, REGISTER_REQUIRED_FIELDS),
          });
          return;
        }
        next(err);
      }
    },
  );

  return router;
}

module.exports = {
  createRegisterRouter,
};
