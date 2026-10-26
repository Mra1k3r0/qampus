const express = require('express');
const queueService = require('./modules/queue/queue.service');
const { serviceDateLabel } = require('./core/time');
const { createAuthRouter } = require('./modules/auth/auth.routes');
const { createQueueRouter } = require('./modules/queue/queue.routes');
const { createStaffRouter } = require('./modules/staff/staff.routes');
const { createDisplayRouter } = require('./modules/display/display.routes');
const { createAdminRouter } = require('./modules/admin/admin.routes');
const { createProfileRouter } = require('./modules/profile/profile.routes');

const PUBLIC_SITEMAP_PATHS = ['/', '/display', '/rules', '/privacy'];
const SITEMAP_LASTMOD = '2026-10-26';

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

  router.get('/rules', (_req, res) => {
    res.render('pages/policy', { title: 'Terms of Use' });
  });

  router.get('/policy', (_req, res) => {
    res.redirect(301, '/rules');
  });

  router.get('/privacy', (_req, res) => {
    res.render('pages/privacy', { title: 'Privacy Policy' });
  });

  router.get('/robots.txt', (_req, res) => {
    const lines = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /queue',
      'Disallow: /staff',
      'Disallow: /admin',
      'Disallow: /profile',
      'Disallow: /login',
      'Disallow: /register',
      'Disallow: /api/',
      'Disallow: /avatar/',
      'Disallow: /health',
      `Sitemap: ${config.publicBaseUrl}/sitemap.xml`,
      '',
    ];
    res.type('text/plain').send(lines.join('\n'));
  });

  router.get('/sitemap.xml', (_req, res) => {
    const urls = PUBLIC_SITEMAP_PATHS.map((path) => [
      '  <url>',
      `    <loc>${config.publicBaseUrl}${path}</loc>`,
      `    <lastmod>${SITEMAP_LASTMOD}</lastmod>`,
      '  </url>',
    ].join('\n')).join('\n');
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls,
      '</urlset>',
      '',
    ].join('\n');
    res.type('application/xml').send(xml);
  });

  router.use(createAuthRouter({ db, config, security }));
  router.use(createProfileRouter({ db, security }));
  router.use(createQueueRouter({ db, security }));
  router.use(createStaffRouter({ db, security }));
  router.use(createAdminRouter({ db, security }));

  return router;
}

module.exports = {
  createRouter,
};
