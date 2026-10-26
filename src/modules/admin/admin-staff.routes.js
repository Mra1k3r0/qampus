const express = require('express');
const adminService = require('./admin.service');
const { validateBody, validateParams } = require('../../core/validation');
const { setFlash } = require('../../core/context');
const {
  staffParamsSchema, createStaffSchema, updateStaffSchema,
  resetStaffPasswordSchema, staffStatusSchema,
} = require('./admin.schemas');

const STAFF_PATH = '/admin/staff';
const BAD_REQUEST = 400;
const SEE_OTHER = 303;

function staffValues(body = {}) {
  const fullName = body.full_name !== undefined ? body.full_name : body.fullName;
  const name = typeof fullName === 'string' ? fullName : '';
  return { full_name: name, fullName: name, email: typeof body.email === 'string' ? body.email : '' };
}

function createAdminStaffRouter({ db, security, config }) {
  const router = express.Router();
  const adminOnly = security.requireRole('admin');

  function renderStaff(res, { status = 200, errors = {}, values = null, editingStaffId = null } = {}) {
    const staff = adminService.listStaff(db);
    res.status(status).render('pages/admin-staff', {
      title: 'Staff accounts', staff, staffCount: staff.length, errors, values, editingStaffId,
    });
  }
  function renderFailure(res, err, { values = null, editingStaffId = null } = {}) {
    renderStaff(res, {
      status: BAD_REQUEST, errors: err.fieldErrors || { form: err.message }, values, editingStaffId,
    });
  }
  function onFormError(getOptions) {
    return (err, req, res, next) => {
      if (err.status !== BAD_REQUEST) return next(err);
      renderFailure(res, err, getOptions(req));
    };
  }
  function mutation(run, getOptions) {
    return async (req, res, next) => {
      try {
        await run(req, res);
      } catch (err) {
        if (!getOptions || err.status !== BAD_REQUEST) return next(err);
        renderFailure(res, err, getOptions(req));
      }
    };
  }
  function finish(req, res, message) {
    setFlash(req, 'success', message);
    res.redirect(SEE_OTHER, STAFF_PATH);
  }
  const createOptions = (req) => ({ values: staffValues(req.body) });
  const updateOptions = (req) => ({ values: staffValues(req.body), editingStaffId: req.validatedParams.id });
  const actionOptions = (req) => ({ editingStaffId: req.validatedParams.id });

  router.get(STAFF_PATH, adminOnly, (req, res) => {
    const editId = Number.parseInt(req.query.edit, 10);
    const editing = Number.isInteger(editId) && editId > 0 ? adminService.findStaff(db, editId) : null;
    renderStaff(res, {
      values: editing ? staffValues({ full_name: editing.fullName, email: editing.email }) : null,
      editingStaffId: editing ? editing.id : null,
    });
  });

  router.post(
    STAFF_PATH,
    adminOnly,
    validateBody(createStaffSchema, { onError: onFormError(createOptions) }),
    mutation(async (req, res) => {
      const staff = await adminService.createStaff(db, {
        values: req.validatedBody, actorUserId: req.user.id, requestId: req.id,
        passwordLeakCheck: config.passwordLeakCheck,
      });
      finish(req, res, `Staff account created for ${staff.fullName}.`);
    }, createOptions),
  );

  router.post(
    `${STAFF_PATH}/:id`,
    adminOnly,
    validateParams(staffParamsSchema),
    validateBody(updateStaffSchema, { onError: onFormError(updateOptions) }),
    mutation((req, res) => {
      const staff = adminService.updateStaff(db, {
        staffId: req.validatedParams.id, values: req.validatedBody,
        actorUserId: req.user.id, requestId: req.id,
      });
      finish(req, res, `${staff.fullName} was updated.`);
    }, updateOptions),
  );

  router.post(
    `${STAFF_PATH}/:id/password`,
    adminOnly,
    validateParams(staffParamsSchema),
    validateBody(resetStaffPasswordSchema, { onError: onFormError(actionOptions) }),
    mutation(async (req, res) => {
      const staff = await adminService.resetStaffPassword(db, {
        staffId: req.validatedParams.id, values: req.validatedBody,
        actorUserId: req.user.id, requestId: req.id,
        passwordLeakCheck: config.passwordLeakCheck,
      });
      finish(req, res, `Password reset for ${staff.fullName}.`);
    }),
  );

  router.post(
    `${STAFF_PATH}/:id/status`,
    adminOnly,
    validateParams(staffParamsSchema),
    validateBody(staffStatusSchema, { onError: onFormError(actionOptions) }),
    mutation((req, res) => {
      const staff = adminService.setStaffStatus(db, {
        staffId: req.validatedParams.id, isActive: req.validatedBody.isActive === '1',
        actorUserId: req.user.id, requestId: req.id,
      });
      finish(req, res, `${staff.fullName} was ${staff.isActive ? 'reactivated' : 'deactivated'}.`);
    }),
  );

  return router;
}

module.exports = {
  createAdminStaffRouter,
};
