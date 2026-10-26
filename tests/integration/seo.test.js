import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import config from '../../src/config.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;

describe('discovery routes', () => {
  let app;
  let cleanup;

  beforeAll(() => {
    const testDb = createTestDatabase();
    cleanup = testDb.cleanup;
    app = createTestApp(testDb.db).app;
  });

  afterAll(() => {
    cleanup();
  });

  it('lists the rules page in the sitemap and drops the old path', async () => {
    const response = await request(app).get('/sitemap.xml');

    expect(response.status).toBe(200);
    expect(response.text).toContain(`<loc>${config.publicBaseUrl}/rules</loc>`);
    expect(response.text).not.toContain('/policy');
  });

  it('points robots at the sitemap and keeps private routes out', async () => {
    const response = await request(app).get('/robots.txt');

    expect(response.status).toBe(200);
    expect(response.text).toContain(`Sitemap: ${config.publicBaseUrl}/sitemap.xml`);
    expect(response.text).toContain('Disallow: /staff');
    expect(response.text).toContain('Disallow: /admin');
  });

  it('serves the discovery files from the public root', async () => {
    const [llms, manifest] = await Promise.all([
      request(app).get('/llms.txt'),
      request(app).get('/site.webmanifest'),
    ]);

    expect(llms.status).toBe(200);
    expect(llms.text).toContain('[Terms of Use](/rules)');
    expect(manifest.status).toBe(200);
    expect(manifest.body.name).toBe('Qampus');
  });

  it('puts canonical and social metadata in the page head', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain(`<link rel="canonical" href="${config.publicBaseUrl}/">`);
    expect(response.text).toContain('property="og:title"');
    expect(response.text).toContain('application/ld+json');
  });
});
