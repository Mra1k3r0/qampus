const express = require('express');
const queueService = require('./modules/queue/queue.service');
const { serviceDateLabel } = require('./core/time');
const { createAuthRouter } = require('./modules/auth/auth.routes');
const { createQueueRouter } = require('./modules/queue/queue.routes');
const { createStaffRouter } = require('./modules/staff/staff.routes');
const { createDisplayRouter } = require('./modules/display/display.routes');
const { createAdminRouter } = require('./modules/admin/admin.routes');

function createRouter({ db, config, security }) {
  const router = express.Router();

  router.use(createDisplayRouter({ db }));

  router.get('/', (req, res) => {
    const services = queueService.listServices(db);
    res.render('pages/home', {
      title: 'Student Queue',
      services,
      hasServices: services.length > 0,
      serviceCount: services.length,
      openCount: services.filter((service) => service.isOpen).length,
      todayLabel: serviceDateLabel(),
    });
  });

  router.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'error' });
    }
  });

  router.get('/policy', (_req, res) => {
    res.render('pages/policy', { title: 'Queue rules' });
  });

  router.use(createAuthRouter({ db, config, security }));
  router.use(createQueueRouter({ db, security }));
  router.use(createStaffRouter({ db, security }));
  router.use(createAdminRouter({ db, security }));

  return router;
}

module.exports = {
  createRouter,
};
