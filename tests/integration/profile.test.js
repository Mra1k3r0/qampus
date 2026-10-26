import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';
import config from '../../src/config.js';
import authRepository from '../../src/modules/auth/auth.repository.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);

describe('profile settings', () => {
  let db;
  let app;
  let cleanup;
  let agent;
  let student;

  beforeAll(async () => {
    const testDb = createTestDatabase({ includeTickets: false });
    db = testDb.db;
    cleanup = testDb.cleanup;
    app = createTestApp(db).app;
    student = db
      .prepare("SELECT id, full_name, student_no, email FROM users WHERE role = 'student' ORDER BY id LIMIT 1")
      .get();

    agent = request.agent(app);
    const token = await getCsrf(agent, '/login');
    await agent
      .post('/login')
      .type('form')
      .send({ email: 'student1@my.cspc.edu.ph', password: DEMO_PASSWORD, _csrf: token });
  });

  afterAll(() => {
    if (fs.existsSync(config.avatarUploadDir)) {
      for (const name of fs.readdirSync(config.avatarUploadDir)) {
        if (name.startsWith(`${student.id}-`)) {
          fs.unlinkSync(path.join(config.avatarUploadDir, name));
        }
      }
    }
    cleanup();
  });

  function userRow() {
    return db
      .prepare(
        `SELECT avatar_type, avatar_value, avatar_updated_at, full_name
         FROM users WHERE id = ?`,
      )
      .get(student.id);
  }

  function auditCount(action) {
    return db
      .prepare('SELECT COUNT(*) AS count FROM audit_log WHERE action = ? AND entity_id = ?')
      .get(action, student.id).count;
  }

  it('redirects an anonymous visitor from the profile page to sign in', async () => {
    const response = await request(app).get('/profile');

    expect(response.status).toBe(302);
    expect(response.headers.location.startsWith('/login')).toBe(true);
  });

  it('shows the student details and the preset avatar choices', async () => {
    const response = await agent.get('/profile');

    expect(response.status).toBe(200);
    expect(response.text).toContain(student.full_name);
    expect(response.text).toContain(student.student_no);
    expect(response.text).toContain(student.email);
    expect(response.text).toContain('/images/avatars/preset-01.svg');
    expect(response.text).toContain('Lark');
  });

  it('updates the full name and writes an audit row', async () => {
    const token = await getCsrf(agent, '/profile');
    const before = auditCount('profile_update');

    const response = await agent
      .post('/profile')
      .type('form')
      .send({ fullName: 'Alex Rivera Reyes', _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/profile');
    expect(userRow().full_name).toBe('Alex Rivera Reyes');
    expect(auditCount('profile_update')).toBe(before + 1);
  });

  it('rejects a blank full name with a 400 response', async () => {
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile')
      .type('form')
      .send({ fullName: '   ', _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Enter your full name.');
  });

  it('selects a preset avatar and changes the user avatar URL', async () => {
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile/avatar/preset')
      .type('form')
      .send({ preset: 'preset-04', _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/profile');

    const row = userRow();
    expect(row.avatar_type).toBe('preset');
    expect(row.avatar_value).toBe('preset-04');

    const user = authRepository.findById(db, student.id);
    expect(user.avatarUrl).toBe(`/avatar/${student.id}?v=${Date.parse(row.avatar_updated_at)}`);
  });

  it('rejects an unknown preset key', async () => {
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile/avatar/preset')
      .type('form')
      .send({ preset: 'preset-99', _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Choose one of the profile pictures.');
    expect(userRow().avatar_value).toBe('preset-04');
  });

  it('shuffles to a different preset avatar', async () => {
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile/avatar/shuffle')
      .type('form')
      .send({ _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/profile');
    expect(userRow().avatar_type).toBe('preset');
    expect(userRow().avatar_value).not.toBe('preset-04');
  });

  it('accepts a tiny valid PNG upload', async () => {
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile/avatar/upload')
      .field('_csrf', token)
      .attach('avatar', PNG_BYTES, { filename: 'tiny.png', contentType: 'image/png' });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/profile');

    const row = userRow();
    expect(row.avatar_type).toBe('upload');
    expect(row.avatar_value).toMatch(new RegExp(`^${student.id}-\\d+\\.png$`));
    expect(fs.existsSync(path.join(config.avatarUploadDir, row.avatar_value))).toBe(true);
  });

  it('rejects a text payload that is not an image', async () => {
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile/avatar/upload')
      .field('_csrf', token)
      .attach('avatar', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Choose a PNG, JPEG, or WebP image.');
  });

  it('rejects an SVG payload', async () => {
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile/avatar/upload')
      .field('_csrf', token)
      .attach('avatar', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), {
        filename: 'avatar.svg',
        contentType: 'image/svg+xml',
      });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Choose a PNG, JPEG, or WebP image.');
  });

  it('rejects an upload larger than 2 MB', async () => {
    const token = await getCsrf(agent, '/profile');
    const tooLarge = Buffer.alloc(config.avatarMaxBytes + 1);
    PNG_BYTES.copy(tooLarge);

    const response = await agent
      .post('/profile/avatar/upload')
      .field('_csrf', token)
      .attach('avatar', tooLarge, { filename: 'huge.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(response.text).toContain('larger than 2 MB');
  });

  it('clears the avatar and removes the uploaded file', async () => {
    const uploaded = userRow().avatar_value;
    expect(userRow().avatar_type).toBe('upload');
    const token = await getCsrf(agent, '/profile');

    const response = await agent
      .post('/profile/avatar/clear')
      .type('form')
      .send({ _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/profile');
    expect(userRow().avatar_type).toBeNull();
    expect(userRow().avatar_value).toBeNull();
    expect(fs.existsSync(path.join(config.avatarUploadDir, uploaded))).toBe(false);
  });

  it('serves a preset avatar image and 404s for an unknown user', async () => {
    const presetUser = db
      .prepare("SELECT id FROM users WHERE role = 'student' ORDER BY id LIMIT 1 OFFSET 1")
      .get();

    const response = await request(app).get(`/avatar/${presetUser.id}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toContain('max-age=300');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.body.length).toBeGreaterThan(0);

    const missing = await request(app).get('/avatar/999999');
    expect(missing.status).toBe(404);

    const invalid = await request(app).get('/avatar/not-a-number');
    expect(invalid.status).toBe(404);
  });

  it('rejects a profile POST without a CSRF token', async () => {
    const response = await agent
      .post('/profile/avatar/shuffle')
      .type('form')
      .send({});

    expect(response.status).toBe(403);
  });
});
