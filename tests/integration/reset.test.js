import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';
import renderModule from '../../src/core/mailer/render.js';
import outboxModule from '../../src/core/mailer/outbox.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;
const { createRenderer } = renderModule;
const { runMailOutbox } = outboxModule;

const NEW_PASSWORD = 'Restarted2026!';
const CODE_PATTERN = /\b(\d{8})\b/;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const KNOWN_EMAIL = 'student1@my.cspc.edu.ph';
const SECOND_EMAIL = 'student2@my.cspc.edu.ph';
const THIRD_EMAIL = 'student3@my.cspc.edu.ph';
const FOURTH_EMAIL = 'student4@my.cspc.edu.ph';
const FIFTH_EMAIL = 'student5@my.cspc.edu.ph';
const SIXTH_EMAIL = 'student6@my.cspc.edu.ph';
const UNKNOWN_EMAIL = 'nobody@my.cspc.edu.ph';

describe('password reset routes', () => {
  let db;
  let cleanup;

  beforeAll(() => {
    const testDb = createTestDatabase();
    db = testDb.db;
    cleanup = testDb.cleanup;
  });

  afterAll(() => {
    cleanup();
  });

  function freshApp(overrides = {}) {
    return createTestApp(db, overrides);
  }

  function userIdFor(email) {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    return row ? row.id : null;
  }

  function outboxRows(email, template) {
    return db
      .prepare('SELECT * FROM mail_outbox WHERE to_email = ? AND template = ? ORDER BY id')
      .all(email, template);
  }

  function resetChallenges(userId) {
    return db
      .prepare(
        `SELECT * FROM auth_challenges
         WHERE user_id = ? AND purpose = 'reset_password' ORDER BY id`,
      )
      .all(userId);
  }

  function resetSession(userId) {
    return db
      .prepare('SELECT sid, sess FROM sessions')
      .all()
      .map((row) => ({ sid: row.sid, data: JSON.parse(row.sess) }))
      .find((row) => row.data.reset && row.data.reset.userId === userId) || null;
  }

  function authenticatedSessions(userId) {
    return db
      .prepare('SELECT sid, sess FROM sessions')
      .all()
      .map((row) => ({ sid: row.sid, data: JSON.parse(row.sess) }))
      .filter((row) => row.data.userId === userId);
  }

  function sessionCountWithReset() {
    return db
      .prepare('SELECT sess FROM sessions')
      .all()
      .filter((row) => Boolean(JSON.parse(row.sess).reset)).length;
  }

  async function drainOutbox(testApp) {
    return runMailOutbox({
      db,
      mailer: testApp.mailer,
      render: createRenderer(),
      encryptionKey: testApp.config.mail.encryptionKey,
      limit: 50,
    });
  }

  function newestCode(testApp) {
    const message = testApp.mailer.messages.at(-1);
    const match = CODE_PATTERN.exec(message.text);
    return match ? match[1] : null;
  }

  async function requestResetCode(testApp, agent, email) {
    const token = await getCsrf(agent, '/forgot-password');
    const response = await agent.post('/forgot-password').type('form').send({ email, _csrf: token });
    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/forgot-password/sent');
    await drainOutbox(testApp);
    return newestCode(testApp);
  }

  async function openResetSession(testApp, email) {
    const agent = request.agent(testApp.app);
    const code = await requestResetCode(testApp, agent, email);
    const token = await getCsrf(agent, '/reset-password');
    const response = await agent
      .post('/reset-password')
      .type('form')
      .send({ email, code, _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/reset-password/new');
    return { agent, code };
  }

  async function login(agent, email) {
    const token = await getCsrf(agent, '/login');
    return agent
      .post('/login')
      .type('form')
      .send({ email, password: DEMO_PASSWORD, _csrf: token });
  }

  it('returns the same redirect for a known and an unknown email and only queues mail for the known one', async () => {
    const testApp = freshApp();
    const knownAgent = request.agent(testApp.app);
    const unknownAgent = request.agent(testApp.app);

    const knownToken = await getCsrf(knownAgent, '/forgot-password');
    const known = await knownAgent
      .post('/forgot-password')
      .type('form')
      .send({ email: KNOWN_EMAIL, _csrf: knownToken });

    const unknownToken = await getCsrf(unknownAgent, '/forgot-password');
    const unknown = await unknownAgent
      .post('/forgot-password')
      .type('form')
      .send({ email: UNKNOWN_EMAIL, _csrf: unknownToken });

    expect(known.status).toBe(303);
    expect(known.headers.location).toBe('/forgot-password/sent');
    expect(unknown.status).toBe(303);
    expect(unknown.headers.location).toBe('/forgot-password/sent');
    expect(outboxRows(KNOWN_EMAIL, 'reset-code')).toHaveLength(1);
    expect(outboxRows(UNKNOWN_EMAIL, 'reset-code')).toHaveLength(0);
  });

  it('renders the generic sent page without echoing an email', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);

    const response = await agent.get(`/forgot-password/sent?email=${encodeURIComponent(KNOWN_EMAIL)}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('Check your email');
    expect(response.text).not.toContain(KNOWN_EMAIL);
  });

  it('opens the new password page from a valid code, stores a ten minute reset session, and consumes the challenge', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const code = await requestResetCode(testApp, agent, KNOWN_EMAIL);
    const userId = userIdFor(KNOWN_EMAIL);

    const token = await getCsrf(agent, '/reset-password');
    const response = await agent
      .post('/reset-password')
      .type('form')
      .send({ email: KNOWN_EMAIL, code, _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/reset-password/new');

    const stored = resetSession(userId);
    expect(stored).not.toBeNull();
    const verifiedAt = new Date(stored.data.reset.verifiedAt).getTime();
    const expiresAt = new Date(stored.data.reset.expiresAt).getTime();
    expect(expiresAt - verifiedAt).toBe(TEN_MINUTES_MS);
    expect(expiresAt).toBeGreaterThan(Date.now());

    const challenges = resetChallenges(userId);
    expect(challenges).toHaveLength(1);
    expect(challenges[0].consumed_at).not.toBeNull();

    const page = await agent.get('/reset-password/new');
    expect(page.status).toBe(200);
    expect(page.text).toContain('Set a new password');
  });

  it('updates the password, bumps the session version, queues the notice, and does not log the user in', async () => {
    const testApp = freshApp();
    const userId = userIdFor(SECOND_EMAIL);
    const before = db.prepare('SELECT password_hash, session_version FROM users WHERE id = ?').get(userId);
    const { agent } = await openResetSession(testApp, SECOND_EMAIL);

    const token = await getCsrf(agent, '/reset-password/new');
    const response = await agent
      .post('/reset-password/new')
      .type('form')
      .send({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/login?reset=1');

    const after = db.prepare('SELECT password_hash, session_version FROM users WHERE id = ?').get(userId);
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(await bcrypt.compare(NEW_PASSWORD, after.password_hash)).toBe(true);
    expect(after.session_version).toBe(before.session_version + 1);
    expect(outboxRows(SECOND_EMAIL, 'password-changed')).toHaveLength(1);
    expect(resetSession(userId)).toBeNull();

    const loginPage = await agent.get('/login');
    expect(loginPage.status).toBe(200);

    const queue = await agent.get('/queue');
    expect(queue.status).toBe(302);
    expect(queue.headers.location).toContain('/login');

    const audit = db
      .prepare("SELECT * FROM audit_log WHERE action = 'auth.password_reset' AND entity_id = ?")
      .get(userId);
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
  });

  it('rejects an existing authenticated session after the password change', async () => {
    const testApp = freshApp();
    const userId = userIdFor(THIRD_EMAIL);
    const signedInAgent = request.agent(testApp.app);

    const signedIn = await login(signedInAgent, THIRD_EMAIL);
    expect(signedIn.status).toBe(303);
    expect(authenticatedSessions(userId)).toHaveLength(1);

    const { agent } = await openResetSession(testApp, THIRD_EMAIL);
    const token = await getCsrf(agent, '/reset-password/new');
    const changed = await agent
      .post('/reset-password/new')
      .type('form')
      .send({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, _csrf: token });
    expect(changed.status).toBe(303);

    const response = await signedInAgent.get('/queue');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login');
    expect(authenticatedSessions(userId)).toHaveLength(0);
  });

  it('returns 400 with a field error for an invalid forgot email', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);

    const token = await getCsrf(agent, '/forgot-password');
    const response = await agent
      .post('/forgot-password')
      .type('form')
      .send({ email: 'not-an-email', _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Enter a valid email address.');
    expect(outboxRows('not-an-email', 'reset-code')).toHaveLength(0);
  });

  it('renders 400 for an invalid new password and keeps the reset session valid', async () => {
    const testApp = freshApp();
    const userId = userIdFor(SIXTH_EMAIL);
    const { agent } = await openResetSession(testApp, SIXTH_EMAIL);

    const token = await getCsrf(agent, '/reset-password/new');
    const response = await agent
      .post('/reset-password/new')
      .type('form')
      .send({ password: 'short', confirmPassword: 'short', _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Password must have at least 8 characters');
    expect(resetSession(userId)).not.toBeNull();

    const page = await agent.get('/reset-password/new');
    expect(page.status).toBe(200);
  });

  it('returns 400 for a wrong code without creating a reset session', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    await requestResetCode(testApp, agent, FOURTH_EMAIL);
    const userId = userIdFor(FOURTH_EMAIL);

    const token = await getCsrf(agent, '/reset-password');
    const response = await agent
      .post('/reset-password')
      .type('form')
      .send({ email: FOURTH_EMAIL, code: '00000000', _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('That code is incorrect or expired.');
    expect(resetSession(userId)).toBeNull();
  });

  it('returns 400 for an expired code without creating a reset session', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const code = await requestResetCode(testApp, agent, FIFTH_EMAIL);
    const userId = userIdFor(FIFTH_EMAIL);

    db.prepare('UPDATE auth_challenges SET expires_at = ? WHERE user_id = ? AND purpose = ?')
      .run(new Date(Date.now() - 60 * 1000).toISOString(), userId, 'reset_password');

    const token = await getCsrf(agent, '/reset-password');
    const response = await agent
      .post('/reset-password')
      .type('form')
      .send({ email: FIFTH_EMAIL, code, _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('That code is incorrect or expired.');
    expect(resetSession(userId)).toBeNull();
  });

  it('redirects GET and POST on the new password page when there is no reset session', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);

    const getResponse = await agent.get('/reset-password/new');
    expect(getResponse.status).toBe(303);
    expect(getResponse.headers.location).toBe('/forgot-password');

    const token = await getCsrf(agent, '/forgot-password');
    const postResponse = await agent
      .post('/reset-password/new')
      .type('form')
      .send({ password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, _csrf: token });
    expect(postResponse.status).toBe(303);
    expect(postResponse.headers.location).toBe('/forgot-password');
  });

  it('requires CSRF on every reset POST', async () => {
    const testApp = freshApp();

    for (const path of ['/forgot-password', '/reset-password', '/reset-password/new']) {
      const agent = request.agent(testApp.app);
      const response = await agent.post(path).type('form').send({ email: KNOWN_EMAIL, code: '12345678' });
      expect(response.status).toBe(403);
    }
  });

  it('gives the same generic failure for an unknown email and creates no session', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const resetSessionsBefore = sessionCountWithReset();

    const token = await getCsrf(agent, '/reset-password');
    const response = await agent
      .post('/reset-password')
      .type('form')
      .send({ email: UNKNOWN_EMAIL, code: '12345678', _csrf: token });

    expect(response.status).toBe(400);
    expect(response.text).toContain('That code is incorrect or expired.');
    expect(userIdFor(UNKNOWN_EMAIL)).toBeNull();
    expect(sessionCountWithReset()).toBe(resetSessionsBefore);
  });
});
