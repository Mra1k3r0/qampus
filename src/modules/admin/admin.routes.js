const express = require('express');
const adminService = require('./admin.service');
const { createAdminStaffRouter } = require('./admin-staff.routes');
const { validateBody, validateParams } = require('../../core/validation');
const { setFlash } = require('../../core/context');
const {
  serviceParamsSchema,
  updateServiceSchema,
} = require('./admin.schemas');

function createAdminRouter({ db, security }) {
  const router = express.Router();

  function renderServices(res, { status = 200, errors = {}, values = null, editingServiceId = null } = {}) {
    const services = adminService.listServices(db);
    res.status(status).render('pages/admin-services', {
      title: 'Service windows',
      services,
      hasServices: services.length > 0,
      serviceCount: services.length,
      openCount: services.filter((service) => service.isOpen).length,
      errors,
      values,
      editingServiceId,
    });
  }

  router.get('/admin/services', security.requireRole('admin'), (_req, res) => {
    renderServices(res);
  });

  router.post(
    '/admin/services/:id',
    security.requireRole('admin'),
    validateParams(serviceParamsSchema),
    validateBody(updateServiceSchema, {
      onError(err, req, res, next) {
        if (err.status === 400) {
          renderServices(res, {
            status: 400,
            errors: err.fieldErrors || { form: err.message },
            values: req.body,
            editingServiceId: req.validatedParams.id,
          });
          return;
        }
        next(err);
      },
    }),
    (req, res, next) => {
      try {
        const service = adminService.updateService(db, {
          serviceId: req.validatedParams.id,
          values: req.validatedBody,
          actorUserId: req.user.id,
          requestId: req.id,
        });
        setFlash(req, 'success', `${service.name} was updated.`);
        res.redirect(303, '/admin/services');
      } catch (err) {
        next(err);
      }
    },
  );

  router.use(createAdminStaffRouter({ db, security }));

  return router;
}

module.exports = {
  createAdminRouter,
};
