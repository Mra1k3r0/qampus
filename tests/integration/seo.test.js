import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import config from '../../src/config.js';
import assets from '../../src/core/assets.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { assetUrl } = assets;

const LOC_PATTERN = /<loc>([^<]+)<\/loc>/g;

function sitemapLocations(text) {
  return Array.from(text.matchAll(LOC_PATTERN), (match) => match[1]);
}

describe('discovery routes', () => {
  let db;
  let app;
  let cleanup;

  beforeAll(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
    app = createTestApp(db).app;
  });

  afterAll(() => {
    cleanup();
  });

  it('lists the rules page in the sitemap and drops the old path', async () => {
    const response = await request(app).get('/sitemap.xml');

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<loc>http:\/\/127\.0\.0\.1:\d+\/rules<\/loc>/);
    expect(response.text).not.toContain('/policy');
  });

  it('points robots at the sitemap and keeps private routes out', async () => {
    const response = await request(app).get('/robots.txt');

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
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
    expect(response.text).toMatch(/<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/">/);
    expect(response.text).toContain('property="og:title"');
    expect(response.text).toContain('application/ld+json');
  });

  it('derives the sitemap origin from the forwarded host and protocol', async () => {
    const response = await request(app)
      .get('/sitemap.xml')
      .set('Host', 'qampus.dpdns.org')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    const locations = sitemapLocations(response.text);
    expect(locations.length).toBeGreaterThan(0);
    locations.forEach((location) => {
      expect(location.startsWith('https://qampus.dpdns.org')).toBe(true);
    });
  });

  it('derives the robots sitemap origin from the forwarded host and protocol', async () => {
    const response = await request(app)
      .get('/robots.txt')
      .set('Host', 'qampus.dpdns.org')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Sitemap: https://qampus.dpdns.org/sitemap.xml');
  });

  it('prefers an explicit public base URL over forwarded headers', async () => {
    const configuredApp = createTestApp(db, { publicBaseUrl: 'https://queue.example.edu' }).app;
    const response = await request(configuredApp)
      .get('/sitemap.xml')
      .set('Host', 'evil.example')
      .set('X-Forwarded-Host', 'evil.example')
      .set('X-Forwarded-Proto', 'http');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<loc>https://queue.example.edu/</loc>');
    expect(sitemapLocations(response.text).every(
      (location) => location.startsWith('https://queue.example.edu'),
    )).toBe(true);
  });

  it('keeps a local test host on http', async () => {
    const response = await request(app)
      .get('/sitemap.xml')
      .set('Host', '127.0.0.1:4567');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<loc>http://127.0.0.1:4567/</loc>');
  });

  it('rejects a hostile forwarded host and falls back without redirecting', async () => {
    const response = await request(app)
      .get('/sitemap.xml')
      .set('Host', '127.0.0.1:4567')
      .set('X-Forwarded-Host', 'evil.com/path')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    expect(response.headers.location).toBeUndefined();
    expect(response.text).not.toContain('evil.com');
    expect(sitemapLocations(response.text).every(
      (location) => location.startsWith(config.publicBaseUrl),
    )).toBe(true);
  });

  it('uses the forwarded origin in canonical and social tags', async () => {
    const response = await request(app)
      .get('/')
      .set('Host', 'qampus.dpdns.org')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(200);
    expect(response.text).toContain('<link rel="canonical" href="https://qampus.dpdns.org/">');
    expect(response.text).toContain('property="og:url" content="https://qampus.dpdns.org/"');
  });

  it('marks rendered pages as no-store', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('allows long-lived caching for a versioned stylesheet', async () => {
    const response = await request(app).get(assetUrl('/css/page-home.min.css'));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('requires revalidation for an unversioned stylesheet', async () => {
    const response = await request(app).get('/css/page-home.min.css');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('allows long-lived caching for a versioned script', async () => {
    const response = await request(app).get(assetUrl('/js/theme.min.js'));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });
});
