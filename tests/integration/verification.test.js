import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import dbHelper from '../helpers/db.js';
import appHelper from '../helpers/app.js';
import csrfHelper from '../helpers/csrf.js';
import seedModule from '../../src/core/seed.js';
import renderModule from '../../src/core/mailer/render.js';
import outboxModule from '../../src/core/mailer/outbox.js';
import cryptoModule from '../../src/core/mailer/crypto.js';

const { createTestDatabase } = dbHelper;
const { createTestApp } = appHelper;
const { getCsrf } = csrfHelper;
const { DEMO_PASSWORD } = seedModule;
const { createRenderer } = renderModule;
const { runMailOutbox } = outboxModule;
const { open } = cryptoModule;

const TEST_PASSWORD = 'QueueDemo2026!';
const CODE_PATTERN = /\b(\d{8})\b/;

const VERIFIED_EMAIL = 'student1@my.cspc.edu.ph';
const SECOND_STUDENT_EMAIL = 'student2@my.cspc.edu.ph';

describe('verified session guard', () => {
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

  async function login(agent, email = VERIFIED_EMAIL, password = DEMO_PASSWORD) {
    const token = await getCsrf(agent, '/login');
    return agent.post('/login').type('form').send({ email, password, _csrf: token });
  }

  function userIdFor(email) {
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  }

  function sessionsContainingUserId(userId) {
    return db
      .prepare('SELECT sid, sess FROM sessions')
      .all()
      .filter((row) => JSON.parse(row.sess).userId === userId);
  }

  it('returns the generic 401 when an unverified account tries to sign in', async () => {
    const agent = request.agent(app);
    const registerToken = await getCsrf(agent, '/register');
    const email = 'pending.student@my.cspc.edu.ph';

    const registered = await agent.post('/register').type('form').send({
      fullName: 'Pending Student',
      studentNo: '2026-9401',
      email,
      password: 'QueueDemo2026!',
      confirmPassword: 'QueueDemo2026!',
      policy: 'agreed',
      _csrf: registerToken,
    });

    expect(registered.status).toBe(303);

    const row = db.prepare('SELECT email_verified_at FROM users WHERE email = ?').get(email);
    expect(row.email_verified_at).toBeNull();

    const response = await login(agent, email, 'QueueDemo2026!');

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
    expect(sessionsContainingUserId(userIdFor(email))).toHaveLength(0);
  });

  it('rejects a stale session version, clears the session, and redirects to login', async () => {
    const agent = request.agent(app);
    const userId = userIdFor(VERIFIED_EMAIL);

    const signedIn = await login(agent);
    expect(signedIn.status).toBe(303);
    expect(sessionsContainingUserId(userId)).toHaveLength(1);

    db.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').run(userId);

    const response = await agent.get('/queue');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login');
    expect(sessionsContainingUserId(userId)).toHaveLength(0);

    const loginPage = await agent.get('/login');
    expect(loginPage.status).toBe(200);
  });

  it('rejects an authenticated session when the user becomes unverified', async () => {
    const agent = request.agent(app);
    const userId = userIdFor(SECOND_STUDENT_EMAIL);

    const signedIn = await login(agent, SECOND_STUDENT_EMAIL);
    expect(signedIn.status).toBe(303);

    db.prepare('UPDATE users SET email_verified_at = NULL WHERE id = ?').run(userId);

    const response = await agent.get('/queue');

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/login');
    expect(sessionsContainingUserId(userId)).toHaveLength(0);
  });

  it('keeps a verified login working and stores the session version', async () => {
    const agent = request.agent(app);
    const userId = userIdFor('staff@my.cspc.edu.ph');

    const response = await login(agent, 'staff@my.cspc.edu.ph');

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/staff/queue');

    const stored = db
      .prepare('SELECT sess FROM sessions')
      .all()
      .find((row) => row.sess.includes(`"userId":${userId}`));
    expect(stored).toBeDefined();
    expect(stored.sess).toContain('"sessionVersion":1');

    const staffQueue = await agent.get('/staff/queue');
    expect(staffQueue.status).toBe(200);
  });

  it('exposes the memory mailer to integration tests', () => {
    expect(Array.isArray(app.locals.mailer.messages)).toBe(true);
  });
});

describe('registration and verification flow', () => {
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

  function freshApp() {
    return createTestApp(db);
  }

  async function registerUser(agent, {
    fullName = 'Flow Student',
    studentNo,
    email,
    password = TEST_PASSWORD,
  }) {
    const token = await getCsrf(agent, '/register');
    return agent.post('/register').type('form').send({
      fullName,
      studentNo,
      email,
      password,
      confirmPassword: password,
      policy: 'agreed',
      _csrf: token,
    });
  }

  async function login(agent, email, password = TEST_PASSWORD) {
    const token = await getCsrf(agent, '/login');
    return agent.post('/login').type('form').send({ email, password, _csrf: token });
  }

  function userIdFor(email) {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    return row ? row.id : null;
  }

  function activeChallenges(userId) {
    return db
      .prepare(
        `SELECT * FROM auth_challenges
         WHERE user_id = ? AND purpose = 'verify_email'
           AND consumed_at IS NULL AND superseded_at IS NULL`,
      )
      .all(userId);
  }

  function challengeRows(userId) {
    return db
      .prepare("SELECT * FROM auth_challenges WHERE user_id = ? AND purpose = 'verify_email' ORDER BY id")
      .all(userId);
  }

  function outboxRows(email, template) {
    return db
      .prepare('SELECT * FROM mail_outbox WHERE to_email = ? AND template = ? ORDER BY id')
      .all(email, template);
  }

  function pendingSession(userId) {
    return db
      .prepare('SELECT sid, sess FROM sessions')
      .all()
      .map((row) => ({ sid: row.sid, data: JSON.parse(row.sess) }))
      .find((row) => row.data.pending && row.data.pending.userId === userId) || null;
  }

  function allSessionsForPending(userId) {
    return db
      .prepare('SELECT sess FROM sessions')
      .all()
      .filter((row) => {
        const data = JSON.parse(row.sess);
        return data.pending && data.pending.userId === userId;
      });
  }

  async function drainOutbox(testApp) {
    const result = await runMailOutbox({
      db,
      mailer: testApp.mailer,
      render: createRenderer(),
      encryptionKey: testApp.config.mail.encryptionKey,
      limit: 50,
    });
    return result;
  }

  function newestCode(testApp) {
    const message = testApp.mailer.messages.at(-1);
    const match = CODE_PATTERN.exec(message.text);
    return match ? match[1] : null;
  }

  async function registerAndVerify(testApp, agent, { email, studentNo }) {
    const registered = await registerUser(agent, { email, studentNo });
    expect(registered.status).toBe(303);

    await drainOutbox(testApp);
    const code = newestCode(testApp);
    const token = await getCsrf(agent, '/verify-email');
    const verified = await agent.post('/verify-email').type('form').send({ code, _csrf: token });

    return { code, verified };
  }

  it('creates an unverified user, one challenge, and one queued code on register', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.new@my.cspc.edu.ph';

    const response = await registerUser(agent, { email, studentNo: '2026-9501' });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/register/check-email');

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    expect(user.email_verified_at).toBeNull();
    expect(activeChallenges(user.id)).toHaveLength(1);

    const queued = outboxRows(email, 'verify-code');
    expect(queued).toHaveLength(1);
    expect(queued[0].status).toBe('pending');

    const challenge = challengeRows(user.id)[0];
    const sealed = queued[0];
    const code = JSON.parse(open({
      ciphertext: sealed.payload_ciphertext,
      iv: sealed.payload_iv,
      tag: sealed.payload_tag,
    }, testApp.config.mail.encryptionKey)).code;

    expect(code).toMatch(/^\d{8}$/);
    expect(challenge.code_hash).not.toMatch(/^\d{8}$/);
    expect(challenge.code_hash.startsWith('$2')).toBe(true);
    expect(JSON.stringify(challenge)).not.toContain(code);
    expect(JSON.stringify(sealed)).not.toContain(code);

    const pending = pendingSession(user.id);
    expect(pending).not.toBeNull();
    expect(pending.data.pending.email).toBe(email);
  });

  it('renders check-email and verify-email for a pending session', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.render@my.cspc.edu.ph';

    await registerUser(agent, { email, studentNo: '2026-9502' });

    const checkEmail = await agent.get('/register/check-email');
    expect(checkEmail.status).toBe(200);
    expect(checkEmail.text).toContain('Check your email');
    expect(checkEmail.text).toContain(email);

    const verifyEmail = await agent.get('/verify-email');
    expect(verifyEmail.status).toBe(200);
    expect(verifyEmail.text).toContain('Verify your email');
    expect(verifyEmail.text).toContain(email);
  });

  it('verifies the emailed code, bumps the session version, and allows login', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.verify@my.cspc.edu.ph';

    const { verified } = await registerAndVerify(testApp, agent, {
      email,
      studentNo: '2026-9503',
    });

    expect(verified.status).toBe(303);
    expect(verified.headers.location).toBe('/login?verified=1');

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    expect(user.email_verified_at).not.toBeNull();
    expect(user.session_version).toBe(2);
    expect(allSessionsForPending(user.id)).toHaveLength(0);

    const challenges = challengeRows(user.id);
    expect(challenges).toHaveLength(1);
    expect(challenges[0].consumed_at).not.toBeNull();

    const signedIn = await login(request.agent(testApp.app), email);
    expect(signedIn.status).toBe(303);
  });

  it('rejects a wrong code and still accepts the correct one later', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.wrong@my.cspc.edu.ph';

    await registerUser(agent, { email, studentNo: '2026-9504' });
    await drainOutbox(testApp);
    const code = newestCode(testApp);
    const userId = userIdFor(email);

    const token = await getCsrf(agent, '/verify-email');
    const wrong = await agent
      .post('/verify-email')
      .type('form')
      .send({ code: '00000000', _csrf: token });

    expect(wrong.status).toBe(400);
    expect(wrong.text).toContain('That code is incorrect.');
    expect(activeChallenges(userId)[0].attempts).toBe(1);
    expect(pendingSession(userId)).not.toBeNull();

    const correct = await agent
      .post('/verify-email')
      .type('form')
      .send({ code, _csrf: token });

    expect(correct.status).toBe(303);
    expect(correct.headers.location).toBe('/login?verified=1');
  });

  it('redirects to register when there is no pending session', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const token = await getCsrf(agent, '/register');

    const getVerify = await agent.get('/verify-email');
    expect(getVerify.status).toBe(303);
    expect(getVerify.headers.location).toBe('/register');

    const postVerify = await agent
      .post('/verify-email')
      .type('form')
      .send({ code: '12345678', _csrf: token });
    expect(postVerify.status).toBe(303);
    expect(postVerify.headers.location).toBe('/register');

    const postResend = await agent.post('/verify-email/resend').type('form').send({ _csrf: token });
    expect(postResend.status).toBe(303);
    expect(postResend.headers.location).toBe('/register');
  });

  it('applies the resend cooldown without creating a second challenge or code', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.cooldown@my.cspc.edu.ph';

    await registerUser(agent, { email, studentNo: '2026-9505' });
    const userId = userIdFor(email);

    const token = await getCsrf(agent, '/register/check-email');
    const response = await agent.post('/verify-email/resend').type('form').send({ _csrf: token });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/register/check-email');
    expect(challengeRows(userId)).toHaveLength(1);
    expect(outboxRows(email, 'verify-code')).toHaveLength(1);
  });

  it('sends account-exists mail and creates no challenge for a verified duplicate', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.duplicate.verified@my.cspc.edu.ph';

    await registerAndVerify(testApp, agent, { email, studentNo: '2026-9506' });
    const userId = userIdFor(email);

    const duplicateApp = freshApp();
    const duplicateAgent = request.agent(duplicateApp.app);
    const response = await registerUser(duplicateAgent, {
      email,
      studentNo: '2026-9507',
      fullName: 'Another Name',
    });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/register/check-email');
    expect(db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get(email).count).toBe(1);
    expect(activeChallenges(userId)).toHaveLength(0);

    const mail = outboxRows(email, 'account-exists');
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe('Your Qampus account');

    const audits = db
      .prepare("SELECT * FROM audit_log WHERE action = 'register_existing' AND entity_id = ?")
      .all(userId);
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain(email);
  });

  it('returns a redirect when an unverified duplicate registers during the cooldown', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.duplicate.pending@my.cspc.edu.ph';

    await registerUser(agent, { email, studentNo: '2026-9508' });
    const userId = userIdFor(email);

    const secondApp = freshApp();
    const secondAgent = request.agent(secondApp.app);
    const response = await registerUser(secondAgent, {
      email,
      studentNo: '2026-9509',
      fullName: 'Duplicate Pending',
    });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('/register/check-email');
    expect(db.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get(email).count).toBe(1);
    expect(challengeRows(userId)).toHaveLength(1);
    expect(outboxRows(email, 'verify-code')).toHaveLength(1);
  });

  it('replaces the pending password and profile when an unverified email registers again', async () => {
    const testApp = freshApp();
    const email = 'flow.duplicate.takeover@my.cspc.edu.ph';
    const firstAgent = request.agent(testApp.app);
    const secondAgent = request.agent(testApp.app);

    await registerUser(firstAgent, {
      email,
      studentNo: '2026-9511',
      fullName: 'First Claim',
      password: 'FirstPass2026!',
    });
    const second = await registerUser(secondAgent, {
      email,
      studentNo: '2026-9512',
      fullName: 'Email Owner',
      password: 'SecondPass2026!',
    });

    expect(second.status).toBe(303);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    expect(user.full_name).toBe('Email Owner');
    expect(user.student_no).toBe('2026-9512');

    await drainOutbox(testApp);
    const code = newestCode(testApp);
    const token = await getCsrf(secondAgent, '/verify-email');
    const verified = await secondAgent.post('/verify-email').type('form').send({ code, _csrf: token });
    expect(verified.status).toBe(303);

    const freshAgent = request.agent(testApp.app);
    const firstLogin = await login(freshAgent, email, 'FirstPass2026!');
    expect(firstLogin.status).toBe(401);
    const secondLogin = await login(freshAgent, email, 'SecondPass2026!');
    expect(secondLogin.status).toBe(303);
  });

  it('requires CSRF on the verify POST and does not change state without it', async () => {
    const testApp = freshApp();
    const agent = request.agent(testApp.app);
    const email = 'flow.csrf@my.cspc.edu.ph';

    await registerUser(agent, { email, studentNo: '2026-9510' });
    await drainOutbox(testApp);
    const code = newestCode(testApp);
    const userId = userIdFor(email);

    const response = await agent.post('/verify-email').type('form').send({ code });

    expect(response.status).toBe(403);
    const user = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(userId);
    expect(user.email_verified_at).toBeNull();
    expect(activeChallenges(userId)[0].attempts).toBe(0);
  });
});
