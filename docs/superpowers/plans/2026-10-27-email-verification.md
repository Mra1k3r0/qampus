# Email Verification and Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8-digit email verification at registration and self-serve password reset, with Brevo in production and Ethereal in development.

**Architecture:** Split auth routes into register, verification, reset, and login routers. Store hashed challenges and an encrypted mail outbox in SQLite. An in-process worker drains the outbox. Unverified users cannot authenticate.

**Tech Stack:** Node 22, Express 4, EJS 3, better-sqlite3, bcryptjs, zod, vitest, supertest, nodemailer (Ethereal only), Brevo HTTPS API.

**Spec:** `docs/superpowers/specs/2026-10-27-email-verification-design.md`

## Global Constraints

- Follow `AGENTS.md`: no Bootstrap, no emoji, no em dash, custom CSS, Lucide only, 303 after POST, audit every state change.
- Time is Asia/Manila. Store UTC ISO strings. Use `nowIso()` and the existing time helpers.
- Codes: 8 digits, 10-minute TTL, 5 attempts, 60-second resend cooldown.
- Never store a plaintext code. Hash with bcrypt cost 12; encrypt outbox payload with AES-256-GCM.
- No new dependency except `nodemailer`, and only for the Ethereal adapter.
- Every task ends with `npm run lint`, the task tests, and a conventional commit.

---

### Task 1: Config, migration, seed, repository

**Files:** Modify `src/config.js`, `src/core/db.js`, `src/core/seed.js`, `src/modules/auth/auth.repository.js`; create `tests/unit/auth-schema.test.js`.

**Interfaces:** `config.mail = { driver, from, replyTo, brevoApiKey, encryptionKey, authPepper, ttlMinutes, maxAttempts, resendCooldownSeconds }`; `findByEmail` returns `emailVerifiedAt` and `sessionVersion`; `markEmailVerified`, `updatePasswordHash`, `incrementSessionVersion`.

- [ ] Write a failing test that runs `migrate()` twice on a fresh database and asserts the new columns, three tables, and partial unique index exist.
- [ ] Add migration `005_auth_email_verification`: `users.email_verified_at`, `users.session_version`, `auth_challenges`, `mail_outbox`, `auth_throttle`. Mark existing users verified and set `session_version = 1`.
- [ ] Add config parsing and production guards. In test, default `driver=memory`; in dev, `ethereal`; in production require `brevo`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_ENCRYPTION_KEY`, `AUTH_PEPPER`, and `PUBLIC_BASE_URL`. Derive dev keys from `SESSION_SECRET` only when not production.
- [ ] Update seed inserts to set `email_verified_at`, including `ON CONFLICT(email) DO UPDATE` so reseeding verifies demo rows. Update `mapUser`, `USER_COLUMNS`, and `createUser`.
- [ ] Run `npm test -- tests/unit/auth-schema.test.js`; commit `feat: add auth verification schema and config`.

### Task 2: Mailer, encryption, and outbox

**Files:** Create `src/core/mailer/{index.js,brevo.js,ethereal.js,memory.js,crypto.js,outbox.js,render.js}`; modify `src/app.js`, `src/core/logger.js`, `package.json`; create `tests/unit/mailer.test.js`.

**Interfaces:** `createMailer(config, { logger }) -> { send({ to, subject, html, text, idempotencyKey }) }`; `enqueueMail(db, { to, template, subject, data }, { encryptionKey })`; `runMailOutbox({ db, mailer, render, logger, limit })`; `createApp({ db, config, mailer })` exposes `app.locals.mailer`.

- [ ] Run `npm install nodemailer`; record the reason in the commit body.
- [ ] Write failing tests for AES-256-GCM round trip, memory capture, outbox send, retry on 5xx, Brevo 201 and 500 responses with a mocked fetch, and no plaintext code in `mail_outbox`.
- [ ] Implement `seal` and `open` with `randomBytes(12)`, `createCipheriv('aes-256-gcm')`, and auth-tag validation.
- [ ] Implement the three adapters. Brevo uses `fetch` with `api-key`, 5-second `AbortSignal.timeout`, and `IdempotencyKey`; Ethereal uses a lazy `nodemailer.createTestAccount()` and logs the preview URL only when not production; memory stores messages.
- [ ] Implement `enqueueMail` and `runMailOutbox`: claim with `BEGIN IMMEDIATE`, decrypt, render, send, mark `sent` or `failed`, backoff on 429/5xx/network, stop on 4xx, null the payload after send, and reset stale `sending` rows on boot.
- [ ] Add pino redaction paths `req.body.code`, `req.body.otp`, `req.body.token`, `req.body.resetToken`.
- [ ] Run the unit test; commit `feat: add encrypted mail outbox and providers`.

### Task 3: Challenge and throttle services

**Files:** Create `src/modules/auth/challenges.repository.js`, `src/modules/auth/challenges.service.js`; modify `src/modules/auth/auth.schemas.js`; create `tests/unit/challenges.test.js`.

**Interfaces:** `issueChallenge(db, { userId, purpose, email, config }) -> { id, code, expiresAt }`; `verifyChallenge(db, { userId, purpose, code }) -> { ok, reason }`; `consumeThrottle(db, { key, limit, windowSeconds, blockSeconds }) -> { allowed, retryAfterSeconds }`.

- [ ] Write failing tests for a valid code, wrong code, fifth wrong attempt, expiry, one-active-challenge supersede, and cooldown.
- [ ] Implement `generateCode()` with `crypto.randomInt(0, 100_000_000).toString().padStart(8, '0')`, bcrypt hash, and `nowIso()` arithmetic.
- [ ] Implement `issueChallenge` in `BEGIN IMMEDIATE`: supersede old active rows, insert, call `enqueueMail`, audit `auth.verification_requested` or `auth.reset_requested`.
- [ ] Implement `verifyChallenge`: select active row, check expiry and attempts, bcrypt compare, increment attempts on failure, supersede on the fifth failure, set `consumed_at` on success, audit.
- [ ] Implement `consumeThrottle` with HMAC-SHA-256 email keys using `config.mail.authPepper`. Add zod schemas for `code` (`^\d{8}$`) and the reset password.
- [ ] Run the unit test; commit `feat: add auth challenge and throttle services`.

### Task 4: Session guard, limiters, and unverified login

**Files:** Create `src/modules/auth/auth.session.js`; modify `src/app.js`, `src/core/security.js`, `src/modules/auth/auth.routes.js`, `src/modules/auth/auth.service.js`, `tests/helpers/app.js`; create `tests/integration/verification.test.js`.

**Interfaces:** `regenerateSession(req)`, `saveSession(req)`, `destroySession(req)`, `setPending(req, pending)`, `clearPending(req)`, `setReset(req, reset)`, `clearReset(req)`; `createApp` exposes `app.locals.mailer`; new limiters `forgotLimiter`, `resetLimiter`, `verifyLimiter`, `resendLimiter`.

- [ ] Write a failing test that logs in an unverified user and expects the generic 401, and one that rejects a stale `sessionVersion`.
- [ ] Move the session promise helpers from `auth.routes.js` into `auth.session.js`. Leave the existing route map intact so the app still works mid-plan.
- [ ] In `loadUser`, reject when `user.emailVerifiedAt` is null or `req.session.sessionVersion !== user.sessionVersion`; clear the session. On login success, set `req.session.sessionVersion = user.sessionVersion`.
- [ ] In `auth.service.login`, reject unverified users with the same generic 401. Add the four IP limiters to `security.js`.
- [ ] Update `createTestApp` to use the memory mailer and expose `app.locals.mailer.messages`.
- [ ] Run the integration test; commit `feat: guard sessions for unverified users`.

### Task 5: Register and verification routes

**Files:** Create `src/modules/auth/register.routes.js`, `src/modules/auth/verification.routes.js`; modify `src/modules/auth/auth.routes.js`, `src/modules/auth/auth.service.js`, `src/modules/auth/auth.schemas.js`, `src/routes.js`, `views/layouts/app.ejs`, `scripts/build-assets.js`, `tests/integration/auth.test.js`; create `views/pages/{check-email.ejs,verify-email.ejs}`, `tests/integration/verification.test.js`.

**Interfaces:** `createRegisterRouter({ db, config, security })` handles `GET/POST /register`; `createVerificationRouter({ db, config, security })` handles `GET /register/check-email`, `GET/POST /verify-email`, `POST /verify-email/resend`.

- [ ] Write failing integration tests: valid register creates an unverified user, enqueues one mail, redirects 303 to `/register/check-email`; duplicate email behaves identically; valid code verifies and redirects to `/login?verified=1`; wrong code, resend cooldown, and missing pending session fail safely; CSRF is required.
- [ ] Change `authService.register` to create or reuse an unverified user, issue a challenge, enqueue mail, and audit. For an existing verified email, enqueue `account-exists` and create no challenge. Keep the password unchanged for an existing account.
- [ ] Add routes with `security.registerLimiter`, zod validation, pending-session checks, and 303 redirects. Verification calls `markEmailVerified` and increments `session_version` inside `immediateTransaction`, clears pending, and sets a success flash.
- [ ] Remove the register routes from `auth.routes.js`; mount the two new routers in `src/routes.js`. Update the duplicate-email and register-redirect assertions in `auth.test.js`.
- [ ] Designer lane: create the two pages using `views/pages/register.ejs` patterns, `tokens.css`, and the error-summary contract. Add all auth paths to the layout's auth CSS/script branches and to the `auth` bundle in `scripts/build-assets.js`.
- [ ] Run `npm test -- tests/integration/verification.test.js tests/integration/auth.test.js`, `npm run lint`, `npm run build:assets`; commit `feat: add registration verification flow`.

### Task 6: Forgot and reset routes

**Files:** Create `src/modules/auth/reset.routes.js`; modify `src/modules/auth/auth.routes.js`, `src/modules/auth/auth.service.js`, `src/modules/auth/auth.schemas.js`, `src/routes.js`, `views/layouts/app.ejs`, `scripts/build-assets.js`, `tests/integration/auth.test.js`; replace `views/pages/forgot-password.ejs`; create `views/pages/{forgot-sent.ejs,reset-password.ejs,reset-password-new.ejs}`, `tests/integration/reset.test.js`.

**Interfaces:** `createResetRouter({ db, config, security })` handles `GET/POST /forgot-password`, `GET /forgot-password/sent`, `GET/POST /reset-password`, `GET/POST /reset-password/new`.

- [ ] Write failing integration tests: unknown email returns the same 303 as a known email; known email enqueues a code; valid code opens the new-password form; new password updates the hash, increments `session_version`, and redirects to `/login?reset=1`; expired or wrong code fails; no auto-login; CSRF is required.
- [ ] Implement the generic request path, dummy bcrypt work for unknown emails, the 10-minute reset session, and the password update in one transaction.
- [ ] Remove the forgot route from `auth.routes.js`; mount `createResetRouter` in `src/routes.js`. The final `auth.routes.js` contains login and logout only.
- [ ] Designer lane: replace the office-only page with the email form, keep the short office fallback note, and build the sent, code, and new-password pages. Add all pages to the `auth` bundle and layout auth branches.
- [ ] Run `npm test -- tests/integration/reset.test.js tests/integration/auth.test.js`, `npm run lint`, `npm run build:assets`; commit `feat: add email password reset flow`.

### Task 7: Server worker, cleanup, demo, and seed

**Files:** Modify `src/server.js`, `src/core/seed.js`, `scripts/demo.js`, `tests/unit/auth-schema.test.js`.

**Interfaces:** `startMailWorker({ db, mailer, render, logger, intervalMs }) -> { stop }`; `cleanupAuth(db, now)`.

- [ ] Write a failing test that seeds a database and asserts every demo account has `email_verified_at`.
- [ ] Start the mail worker after `createApp`; run one drain on boot and every 2 seconds; stop it in `shutdown`.
- [ ] Add hourly cleanup for expired challenges, throttle rows, and sent outbox rows.
- [ ] Add a verified-account check to `scripts/demo.js` so `demo:verify` fails if a demo account is unverified.
- [ ] Run `npm run demo:reset`, `npm run demo:verify`, and the unit test; commit `feat: run auth mail worker and seed verified accounts`.

### Task 8: Docs, traceability, and full verification

**Files:** Modify `docs/01-requirements.md`, `docs/02-architecture.md`, `docs/03-ui-design.md`, `docs/03b-responsive.md`, `docs/05-test-plan.md`, `docs/07-demo-script.md`, `docs/08-deployment.md`, `docs/09-traceability.md`, `.env.example`, `docs/06-git-and-ai.md`.

- [ ] Update the requirements from office-only reset to email verification and self-serve reset.
- [ ] Document the new tables, routes, mail drivers, env vars, Brevo DNS records, and the in-process worker.
- [ ] Add the new manual checks and traceability rows. Record the Brevo free-tier branding and 300/day limit.
- [ ] Run `npm run lint`, `npm test`, `npm run demo:verify`, `npm run build:assets`, and `git diff --exit-code -- public/css public/js`.
- [ ] Commit `docs: document email verification and reset`.

## Self-Review

- Spec coverage: data model (1), mail (2), challenges/throttle (3), session guard (4), registration (5), reset (6), worker/demo (7), docs (8).
- No placeholders: each task names files, interfaces, tests, and commands.
- Names: `email_verified_at` maps to `emailVerifiedAt`; `session_version` maps to `sessionVersion`; `auth_challenges`, `mail_outbox`, `auth_throttle` are consistent.
