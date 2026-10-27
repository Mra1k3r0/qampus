# Email verification and password reset

Status: proposed
Date: 2026-10-27
Owner: auth
Supersedes: none

## Problem

Registration accepts any email and logs in immediately. Password reset is office-assisted. Neither proves email ownership. New accounts must prove control before queue access, and all roles need a self-serve reset.

## Decisions

- 8-digit numeric code. No magic links in v1.
- Unverified accounts cannot log in, hold a session, or join the queue.
- All roles can reset by email.
- Registration accepts any email; verification proves ownership.
- Existing seeded and migrated accounts are grandfathered as verified.
- `/forgot-password` becomes self-serve; keep a short "contact the office" fallback.
- Code-only v1. No email change, MFA, or magic link.
- Production sender: Brevo transactional API. Dev: Ethereal SMTP. Tests: memory.
- Mail provider sits behind one interface; swapping providers changes only the adapter and env.

## Provider note

Resend's official pricing includes 3,000 sent emails per month, 100 per day. Brevo free is 300 per day. Both require a verified sending domain to deliver to arbitrary recipients. Brevo's free plan adds "Sent with Brevo" branding. The adapter hides the choice. If branding is a blocker, swap to Resend or Mailtrap before launch.

## Architecture

New files:

- `src/modules/auth/{verification.routes.js,reset.routes.js,challenges.service.js,challenges.repository.js}`
- `src/core/mailer/{index.js,brevo.js,ethereal.js,memory.js,outbox.js,crypto.js}`
- `views/emails/{shell.ejs,verify-code.ejs,reset-code.ejs,password-changed.ejs,account-exists.ejs}`
- `views/pages/{check-email.ejs,verify-email.ejs,forgot-sent.ejs,reset-password.ejs,reset-password-new.ejs}`

Keep `auth.routes.js` under its soft limit by moving the new routes out. `auth.service.js` stays under 250 lines; if not, split challenge logic into `challenges.service.js`. No feature imports another feature's repository.

## Data model

Migration, idempotent:

- `users.email_verified_at TEXT` (null means unverified).
- `users.session_version INTEGER NOT NULL DEFAULT 1`.
- `auth_challenges`: `id`, `user_id`, `purpose` (`verify_email` or `reset_password`), `code_hash`, `attempts`, `max_attempts`, `expires_at`, `verified_at`, `consumed_at`, `superseded_at`, `created_at`.
- Partial unique index: one active challenge per `user_id` and `purpose` where `consumed_at IS NULL AND superseded_at IS NULL`.
- `mail_outbox`: `id`, `to_email`, `template`, `subject`, `payload_ciphertext`, `payload_iv`, `payload_tag`, `status`, `attempts`, `next_attempt_at`, `last_error`, `provider_message_id`, `created_at`, `sent_at`.
- `auth_throttle`: `key`, `count`, `window_started_at`, `blocked_until`.

Seeded demo users get `email_verified_at = now`. Migration marks every existing row verified and sets `session_version = 1`; sessions without that version are invalidated once.

Codes are hashed with bcrypt cost 12. The outbox payload is encrypted with AES-256-GCM using `MAIL_ENCRYPTION_KEY`, so no code is stored in plaintext. The outbox row is nulled after send.

## Registration and verification

1. `POST /register` validates with zod, hashes the password, and inserts the user with `email_verified_at = NULL`.
2. If the email already exists, respond exactly like a new registration. Verified accounts get an "account exists" email, no challenge, and a cleared pending session; unverified accounts get a fresh code. Both redirect 303 to `/register/check-email`. This prevents enumeration.
3. For a new or unverified account, regenerate the session, store `pending = { userId, email }`, create a `verify_email` challenge, enqueue the code, and redirect 303 to `/register/check-email`.
4. `GET /register/check-email` shows a generic "check your email" page and a resend form.
5. `POST /verify-email` checks the pending session, expiry, attempts, and bcrypt hash. On success, set `email_verified_at`, bump `session_version`, consume the challenge, clear pending, audit, and redirect 303 to `/login?verified=1`.
6. `POST /verify-email/resend` applies cooldown and limits, supersedes the old challenge, creates a new one, enqueues, and redirects 303 back.
7. `POST /login` rejects unverified users with the same generic credentials message. It does not create an authenticated session.

The verification page is reachable only with a pending session. A verified user who opens it is redirected to login.

## Password reset

1. `GET /forgot-password` shows the email form.
2. `POST /forgot-password` always redirects 303 to `/forgot-password/sent`. For a real account, create a `reset_password` challenge and enqueue a code. For an unknown email, perform the same validation and a dummy hash, then discard. Never reveal existence.
3. `GET /reset-password` shows email and code fields.
4. `POST /reset-password` verifies the code. On success, regenerate the session, store `reset = { userId, verifiedAt, expiresAt }` with a 10-minute lifetime, consume the challenge, and redirect 303 to `/reset-password/new`.
5. `GET /reset-password/new` requires a verified reset session.
6. `POST /reset-password/new` validates the password, updates the hash, increments `session_version`, clears the reset session, audits, and redirects 303 to `/login?reset=1`. No auto-login.
7. A password-changed email is queued after commit. It contains no code.

The reset session is separate from an authenticated session. `requireAuth` ignores it.

## Session and authorization

- `loadUser` rejects a session whose `session_version` does not match the user row, and clears it.
- `loadUser` rejects a session for an unverified user. This is defense in depth; login already blocks.
- Login and registration regenerate the session. Logout destroys it.
- `requireAuth` and `requireRole` are unchanged in name and behavior. Unverified users never get `req.user`.

## Mail delivery

- `mailer.send({ to, subject, html, text, idempotencyKey })` is the only interface.
- `MAIL_DRIVER=brevo` sends `POST https://api.brevo.com/v3/smtp/email` with the `api-key` header, 5-second timeout, and outbox id as idempotency key. This uses HTTPS 443, so Pterodactyl does not need SMTP ports.
- `MAIL_DRIVER=ethereal` uses Nodemailer and a generated Ethereal account. It logs the preview URL only outside production.
- `MAIL_DRIVER=memory` records messages for tests.
- The worker runs in `src/server.js`: claim one row with `BEGIN IMMEDIATE`, decrypt, render, send, mark sent or failed, backoff on 429/5xx/network, stop on permanent 4xx. It wakes every 2 seconds and drains on boot.
- A failed code email is recoverable by resending. A failed password-changed email is retried.

## Email templates

- 600px shell, raised paper, 2px gold top rule, text wordmark, no images, no tracking pixel.
- Inline CSS only. No `juice` or CSS build step. Keep each message under 50KB.
- Code is one text node, mono 44px, 0.14em letter spacing; 36px at 320px.
- Subjects: "Your Qampus verification code", "Your Qampus password reset code", "Your Qampus password was changed", "You already have a Qampus account".
- Preheaders: "Your 8-digit code expires in 10 minutes.", "Use this code to reset your password.", "If this was not you, contact the office.", "Sign in or reset your password."
- Plain text is generated from the same data. Do not strip HTML.
- Expiry is shown in Asia/Manila with an absolute time and "10 minutes".

## Security controls

- Codes: 8 digits from `crypto.randomInt`, 10-minute TTL, 5 attempts, one active challenge.
- Resend cooldown 60 seconds. Per account: 3 per 15 minutes, 5 per hour, 10 per day. Per IP: express-rate-limit on register, forgot, reset, resend.
- `auth_throttle` keys use HMAC-SHA-256 of the email with `AUTH_PEPPER`; no raw email in the table.
- Generic responses for register, forgot, and login. No `403` that reveals existence.
- CSRF on every POST. GET never consumes a code.
- Codes and reset sessions are never logged. Add pino redaction for `code`, `otp`, `token`, `resetToken`.
- Audit rows record `user_id`, `challenge_id`, purpose, and outcome. No code, hash, or raw email.
- Password reset bumps `session_version`, which invalidates all sessions.
- No auto-login after verification or reset.

## Config

Add to `.env.example`:

- `MAIL_DRIVER=ethereal`, `MAIL_FROM="Qampus <no-reply@mail.qampus.dpdns.org>"`, `MAIL_REPLY_TO=`
- `BREVO_API_KEY=`, `MAIL_ENCRYPTION_KEY=` 32-byte base64, `AUTH_PEPPER=` 32+ characters
- `OTP_TTL_MINUTES=10`, `OTP_MAX_ATTEMPTS=5`, `OTP_RESEND_COOLDOWN_SECONDS=60`

Production must fail fast if `MAIL_DRIVER` is `ethereal` or `memory`, or if the selected driver's keys, `MAIL_FROM`, `MAIL_ENCRYPTION_KEY`, `AUTH_PEPPER`, or `PUBLIC_BASE_URL` is missing.

## Deployment

- Verify `mail.qampus.dpdns.org` in Brevo. Add SPF, DKIM, and DMARC records in Cloudflare DNS. Do not enable Email Routing on that hostname.
- Set the env vars in Pterodactyl. Keep `data/` on the persistent volume.
- Confirm outbound HTTPS to `api.brevo.com` works. No SMTP ports required.
- Brevo may require account activation or a support ticket before transactional sending. Do this before the demo.
- Demo reset reseeds verified accounts. The demo script uses a seeded student and does not depend on email delivery.

## Tests

- Unit: code generation, expiry, attempt limit, one-active index, throttle windows, encryption round trip, template rendering.
- Integration: register pending, verify, login; unverified login blocked; resend cooldown; forgot generic for unknown; reset code, new password, sessions revoked; wrong code and expiry; CSRF on all POSTs; session fixation; 404 ownership; no enumeration; rate limits; no plaintext code in DB.
- Mail: memory driver asserts recipient, subject, code presence, no code in logs; outbox retry and idempotency.
- Run `npm run lint`, `npm test`, and `npm run demo:verify`.

## Docs

Update `docs/01-requirements.md`, `docs/02-architecture.md`, `docs/03-ui-design.md`, `docs/05-test-plan.md`, `docs/07-demo-script.md`, `docs/08-deployment.md`, and `docs/09-traceability.md` in the same branch.

## Risks

- Brevo free branding and 300/day may be tight. The adapter allows a swap.
- In-process worker dies with the server; the outbox drains on boot. IP limits are in-memory; account limits are in SQLite.
- New routes and services can breach soft limits; split before adding more. The demo must not depend on live email.
