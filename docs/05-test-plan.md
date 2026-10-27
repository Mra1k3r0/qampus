# Test and Verification Plan: Student Queueing System

Stack: Express 4, EJS, better-sqlite3, express-session, bcryptjs, zod, Vitest, Supertest. Scope: FR-01 to FR-15, auth and reset routes, queue, staff, admin, /api/display, plus SQLite constraints. Test IDs: U unit, I integration, M manual, D failure drill.
## 1. Test Strategy

Pyramid: 60 percent unit, 30 percent integration, 10 percent manual. Unit tests pin pure rules (codes, position, ETA, transitions, schemas) in milliseconds. Integration tests prove routing, sessions, CSRF, authorization, and database constraints through Supertest against the real app and a real SQLite file. Manual tests cover keyboard, screen reader, zoom, mobile width, projector, and judgment calls a DOM assertion cannot make. No browser E2E suite in this phase; Supertest plus manual covers the demo risk.
## 2. Test Environment

- `vitest.config.js`: `environment: "node"`, `setupFiles: ["tests/helpers/env.js"]`, `globalSetup: ["tests/helpers/global.js"]`, `pool: "forks"`.
- Database: `tests/helpers/db.js` creates `tests/.tmp/test-<pid>-<worker>.sqlite` per worker, calls `migrate()` from `src/core/db.js`, then `tests/fixtures/seed.js`. `afterAll` closes and unlinks the file; `tests/helpers/global.js` removes `tests/.tmp`.
- Per-test isolation: `beforeEach` runs migrations on a fresh file or truncates in FK order (`tickets`, `services`, `users`, `sessions`), reseeds 2 services and 3 students, and resets sequences.
- SQLite pragmas in test: `foreign_keys = ON`, `busy_timeout = 5000`, `journal_mode = DELETE`. Production uses WAL; WAL is disabled in tests for deterministic cleanup.
- Sessions: `supertest.agent(app)` holds `cspc_queue.sid`. One agent per role. Tests use the real SQLite session store so the production path is exercised; the test database is truncated between tests.
- CSRF: helper `getCsrf(agent, path)` parses the hidden `_csrf` input from the rendered EJS form and the helper attaches the session token.
- Fake timers: `vi.useFakeTimers({ now: new Date("2026-10-20T08:00:00+08:00") })`; restore in `afterEach`. Used for ETA, day boundary, ticket age, and rate-limit windows.
- Commands: `npm ci`; `npm test`; `npx vitest run tests/unit`; `npx vitest run tests/integration`; `npx vitest run --coverage`; `npm run test:watch`.
- Coverage gate lives in `vitest.config.js`, not in CI-only flags, so local and demo runs match.
## 3. Unit Test Matrix

| ID | Target | Case | Assertion |
|----|--------|------|-----------|
| U01 | `src/modules/tickets/tickets.service.js` | Format for service REG, sequence 7 | `ticketCode('REG', 7)` returns `REG-007`; three digit padding holds at 120 |
| U02 | `tickets.rules.js` | Predicates matrix | `canViewTicket` true for staff and admin on any ticket, false for another student or null; `canJoin` true only for students; `isActiveStatus` true for waiting, called, serving, false for served, left, no_show, expired |
| U04 | `src/modules/tickets/tickets.rules.js` | Three waiting tickets ahead | Position is 4 |
| U05 | `tickets.rules.js` | Served, no_show, left tickets ahead | Excluded; position counts only waiting and called |
| U06 | `tickets.rules.js` | Equal `created_at` | Tie broken by ascending `id`, stable result |
| U07 | `src/modules/tickets/tickets.rules.js` | Avg 5 min, position 4, empty window | ETA is 15 minutes |
| U08 | `tickets.rules.js` | Tickets from another service and prior day | Excluded from average and position |
| U09 | `tickets.rules.js` | Position 1, then a called or serving ticket at the desk | ETA is 0 with an empty window, the full average for a called ticket, and the remaining average for a serving ticket |
| U10 | `src/modules/tickets/tickets.rules.js` | Allowed matrix | waiting to called, called to serving, serving to served, called to no_show, waiting to left, and called to called on recall are allowed |
| U11 | `tickets.rules.js` | Forbidden matrix | served to serving, left to called, no_show to served all return false |
| U12 | `tickets.rules.js`, `src/core/security.js` | Predicates and role | `isStaff({role:"staff"})` true, student false; `canLeave` true only for owner with status waiting; `canJoin` false for staff and another student's ticket |
| U14 | `src/modules/auth/auth.schemas.js` | Register, verify, and reset schemas | Bad email and 7-char password rejected; valid payload passes with trimmed name; code must be 8 digits; reset password matches register rules |
| U15 | `src/modules/auth/auth.schemas.js`, `src/modules/tickets/tickets.schemas.js` | Join and params schemas | `serviceId: "abc"` rejected; negative ticket id rejected |
| U16 | `src/modules/auth/auth.service.js` | Hash and verify | Hash starts `$2`, cost 12, verify true for match, false for wrong, plaintext absent |
| U17 | `src/core/security.js` | Open redirect guard | Accepts local paths; rejects absolute, protocol-relative, backslash, and control-character paths |
| U18 | `src/core/time.js` | Day boundary | `2026-10-20T16:30:00Z` is `2026-10-21` in Asia/Manila; `15:59Z` is `2026-10-20` |
| U19 | `tests/unit/challenges.test.js` | Challenge and throttle service | Valid code passes; wrong code increments attempts; fifth wrong attempt supersedes; expiry fails; a new challenge supersedes the old one; cooldown blocks and resets |
## 4. Integration Test Matrix

| ID | File | Case | Assertion |
|----|------|------|-----------|
| I01 | `tests/integration/verification.test.js` | `POST /register` valid | 303 to `/register/check-email`; users row role `student` and unverified; one sealed `verify-code` outbox row; stored hash is not plaintext |
| I02 | `verification.test.js` | `POST /register` duplicate email | Same 303 and copy as I01; no second user; password unchanged; verified address gets one `account-exists` mail |
| I03 | `auth.test.js` | `POST /register` and `POST /login` invalid payload | 400; auth summary is short and label-free; inline field errors remain; no user row |
| I04 | `auth.test.js` | `POST /login` valid | 302 to `/queue`; `Set-Cookie` contains `cspc_queue.sid` |
| I05 | `auth.test.js` | `POST /login` wrong password, unknown email, unverified or inactive account | 401; same generic message and timing shape; no `req.session.user` |
| I07 | `auth.test.js` | `POST /logout` | 302 `/login`; next `GET /queue` redirects to login |
| I08 | `auth.test.js` | Session persistence | Agent keeps session; `GET /queue` 200 contains student name |
| I09 | `auth.test.js` | Student `GET /staff/queue` | 403; no queue rows rendered |
| I10 | `auth.test.js` | Anonymous `GET /staff/queue` | 302 to `/login?next=/staff/queue` |
| I11 | `tests/integration/queue.test.js` | Join without or with a mismatched CSRF token | 403; error page; no ticket created |
| I13 | `queue.test.js` | `POST /queue/1/join` | 302 `/queue/1`; active ticket with code, position 1 |
| I14 | `queue.test.js` | Duplicate active join same service and day | 303 to the existing ticket with a flash; exactly one active ticket remains |
| I15 | `queue.test.js` | Join unknown service `POST /queue/999/join` | 404; no ticket |
| I16 | `queue.test.js` | Join inactive service | 409 `service_closed`; no ticket |
| I17 | `queue.test.js` | Leave own waiting ticket | 302; status `left`; position list shrinks |
| I18 | `queue.test.js` | Leave another student's ticket | 404; status unchanged; no ticket id leak |
| I19 | `queue.test.js` | Leave called ticket | 409 `invalid_transition`; status remains `called` |
| I20 | `tests/integration/staff.test.js` | `POST /staff/queue/1/call-next` | 303 to `/staff/queue`; oldest waiting becomes `called`; ticket page shows the code and student name |
| I21 | `staff.test.js` | Call next on an empty window | 303 with flash "No one is waiting for that window."; no ticket mutated |
| I22 | `staff.test.js` | Two staff agents call next concurrently | `Promise.all`; exactly one called ticket; the second request gets the empty-queue message |
| I23 | `staff.test.js` | Start then serve a called ticket | 303 each; status `served`; redirect lands on `/staff/queue` |
| I24 | `staff.test.js` | Mark no-show | 303; status `no_show` |
| I25 | `staff.test.js` | Recall called ticket | 303 to the ticket page; `call_count` becomes 2 (call plus recall) |
| I26 | `tests/integration/display.test.js` | `GET /display` and `GET /api/display`, including an unknown service | 200 with `Cache-Control: no-store`; no student name, email, or student number; unknown service is 404 JSON `{error:"service_not_found"}` |
| I28 | `tests/integration/errors.test.js` | `GET /nope` | 404 renders `views/pages/404.ejs`; no stack trace |
| I29 | `errors.test.js` | Forced handler failure | 500; generic message; stack logged server-side only |
| I30 | `tests/integration/security.test.js` | 11 rapid `POST /login` | 429 with `Retry-After`; no credential check on 11th |
| I31 | `security.test.js` | `GET /` headers | CSP present, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, no `X-Powered-By` |
| I32 | `security.test.js` | Direct second active insert | Throws `SQLITE_CONSTRAINT_UNIQUE` |
| I33 | `security.test.js` | Direct bogus status update | Throws `SQLITE_CONSTRAINT_CHECK` |
| I34 | `security.test.js` | Ticket with unknown service id | Throws `SQLITE_CONSTRAINT_FOREIGNKEY` |
| I35 | `staff.test.js` | Filter by service and status | 200; every row matches both filters; filter values persist in the session |
| I36 | `queue.test.js` | Join outside the service window | 409 `service_closed`; no ticket |
| I37 | `audit.test.js` | Join, call, and serve | At least three audit rows with actor, action, before and after; no password or token |
| I38 | `tests/integration/admin.test.js` | Staff opens `/admin/services` | 403; no form rendered |
| I39 | `admin.test.js` | Office head updates a window | 303 to `/admin/services`; new name on the page; one `service.update` audit row |
| I40 | `admin.test.js` | Invalid average wait | 400 re-render with the field error; no service row changed |
| I41 | `admin.test.js` | Admin POST without CSRF token | 403; service unchanged |
| I42 | `tests/integration/queue.test.js` | Anonymous `GET /queue` | 302 to `/login?next=/queue` |
| I43 | `queue.test.js` | Student opens another student ticket | 404; no ticket data leaked |
| I44 | `tests/integration/staff.test.js` | Staff opens unknown ticket id and POSTs without CSRF | 404 for `GET /staff/tickets/99999`; 403 for the tokenless POST |
| I45 | `tests/integration/queue-policy.test.js` | Join inside the 30-minute cutoff, and a third active ticket across services | 409 `outside_window` with no ticket; 409 `active_cap` with no third ticket |
| I46 | `queue-policy.test.js` | Second join inside the 60-second cooldown, and a join after two no-shows | 429 `cooldown` with no second ticket; 409 `no_show_block` with no ticket |
| I47 | `display.test.js` | Anonymous `GET /display` and `GET /api/display` | 200; no session cookie; `sessions` row count unchanged |
| I48 | `tests/integration/policy.test.js` | Anonymous and signed-in `GET /rules`; old `GET /policy` | 200 with the window, cap, cooldown, and no-show rules; no student PII; no session minted for anonymous readers; signed-in layout keeps the sign-out control; old path returns 301 to `/rules` |
| I49 | `auth.test.js` | Each portal with a matching role, and a portal that does not match | Matching portal lands on the role home; mismatch returns the same 401 as a bad password |
| I50 | `tests/integration/admin-staff.test.js` | Office head lists, creates, edits, resets a password, deactivates, and reactivates staff; staff and students try every route; a deactivated account signs in | 303 and an audit row per mutation, 403 for non-admins, 400 on duplicate email, 404 on admin ids, generic 401 and dead session after deactivation, password never rendered |
| I51 | `queue.test.js` | Global call watcher markup and the alert asset | `GET /queue/tickets/1` contains one `data-call-watch` with `data-status-url`, `data-call-code`, service, counter, open, and dismiss controls, loads `/js/call-watch.js`, keeps the ticket live region with `data-ticket-status`, and has exactly one dialog outside the live region; the old `data-called-sound`, `data-sound-toggle`, and `Turn off call sound` label are absent; a staff page has no watcher or script; `GET /audio/called.mp3` returns 200 with `audio/mpeg` |
| I52 | `queue.test.js`, `tickets.test.js` | Schedule-derived window state at 17:38, 16:45, 10:00, before 08:00, and a non-open day | At 17:38 PHT the home page, dashboard, and service page show zero open windows and a red Closed pill; at 16:45 the window is still open for display but joins are denied by the 30-minute cutoff; at 10:00 it is open; before 08:00 and on a non-open day it is closed; a manual close stays closed inside the schedule; demo mode keeps the schedule from closing the display |
| I53 | `seo.test.js` | Public origin and versioned asset cache policy | Forwarded host and protocol produce the matching absolute origin; `PUBLIC_BASE_URL` wins; a hostile forwarded host is rejected; rendered pages are `no-store`; versioned assets are immutable and unversioned paths revalidate |
| I55 | `security.test.js` | Permissions-Policy and HSTS | `autoplay=(self)` is present for the same-origin call chime; camera, microphone, geolocation, payment, and USB stay denied; the policy has no wildcard; HSTS is `max-age=63072000; includeSubDomains; preload`; the only inline script is the hashed theme bootstrap |
| I56 | `expiry.test.js` | Stale tickets across the Manila day boundary | Prior-day waiting, called, and serving tickets become `expired` with one system audit row each and a request id; today and served tickets stay unchanged, and today starts at sequence 1; a second run and dry-run are safe; a direct read shows Expired and transitions are rejected; the first request of a new day sweeps; migration 004 rebuilds the status CHECK and preserves rows; `node scripts/db.js expire` is the manual fallback |
| I57 | `verification.test.js` | `POST /verify-email` with a valid, wrong, expired, and fifth-attempt code, and no pending session | Valid code sets `email_verified_at`, increments `session_version`, clears pending, and 303s to `/login?verified=1`; wrong code stays unverified; fifth failure supersedes; expired code fails; missing pending redirects to `/register`; CSRF is required |
| I58 | `verification.test.js` | `POST /verify-email/resend` inside and after the cooldown, and from a signed-in guest | Cooldown shows an error and posts one mail; later resend posts one new mail; signed-in POST 303s home and creates no user |
| I59 | `reset.test.js` | `POST /forgot-password` for known, unknown, and throttled email | Same 303 to `/forgot-password/sent`; known enqueues one `reset-code`; unknown and throttled do dummy bcrypt work; no email is echoed; audit, log, and outbox ciphertext contain no raw code |
| I60 | `reset.test.js` | Reset code, new password, expired session, revocation, and no auto-login | Valid code opens the new form with a 10-minute grant; wrong or missing challenge gets the generic 400; new password updates the hash, increments `session_version`, kills an earlier session, writes one audit row, queues `password-changed`, and 303s to `/login?reset=1`; expired grant redirects to forgot; CSRF is required |
## 5. Manual Test Matrix
| ID | Case | Pass condition |
|----|------|----------------|
| M01 | Keyboard-only register and join | Tab reaches every field and button in order; Enter submits; focus ring is visible on all controls against both light surfaces; no mouse needed |
| M03 | Screen reader labels | Join, Leave, Call next, Serve, No-show announce name, service, and state |
| M04 | Live updates | Position and ETA changes announced politely via `aria-live`, not on every poll; a signed-in student on `/` or `/queue/tickets/:id` sees the global dialog when staff calls the ticket, with the page blurred and the chime repeating every 4 seconds; `Got it` dismisses it and it does not reopen for the same count; a recall reopens it; the sound prompt appears only when sound was never enabled and stays hidden after a reload; the footer theme toggle switches the header in the same frame without the wordmark going blank |
| M05 | Validation focus | Submit invalid register form; focus lands on error summary, errors linked by `aria-describedby`; a password without a letter or number is blocked in the browser and on the server; login and register show only the top-left brand mark, with no header bar or footer |
| M06 | Contrast and 200 percent zoom | Body text at least 4.5:1, large display text at least 3:1, focus indicator 3:1; no clipped controls or horizontal scroll at 1280px with 200 percent zoom |
| M08 | Mobile 360px | Join flow completes without horizontal scroll; tap targets at least 44px |
| M09 | Reduced motion | With `prefers-reduced-motion: reduce`, no pulsing or sliding; state still updates |
| M10 | Empty queue | Student and staff empty states explain what happens next, no blank table |
| M11 | Projector readability | 1920x1080 display board: ticket code at least 72px, readable at 5 meters |
| M12 | Display polling | Board refreshes within 5 seconds, no flicker, stale data marked after 15 seconds |
| M13 | Session expiry | Expired session on join redirects to login with return path and clear message; Keep me signed in unchecked ends with the browser, checked lasts 30 days |
| M14 | Staff filters | Filter by service and status combines correctly and survives refresh |
| M15 | Error recovery | 500 page offers safe back link; no raw SQL or stack visible |
| M16 | Double click join | Rapid double click creates one ticket and one confirmation |
| M17 | Register and verify | Register with any address, read the code from Ethereal, enter it, land on `/login?verified=1`, and sign in; an unverified account gets the generic login error; a wrong code shows one generic message |
| M18 | Reset and revoke | Request reset for a known and an unknown address; both show the same sent page; use the code, set a new password, then confirm the old session is signed out and only the new password works |
## 6. Defect Log Template
| ID | Severity | Steps | Expected | Actual | Evidence | Owner | Status |
|----|----------|-------|----------|--------|----------|-------|--------|
| BUG-001 | S1 to S4 | 1. Route 2. Action 3. Observe | Contract from this plan | Observed behavior | Screenshot, trace, test ID | Name | Open |
Severity: S1 demo blocker or data loss, S2 major flow broken, S3 minor with workaround, S4 cosmetic. A defect is closed only with a passing automated test or a signed manual retest referencing its ID.
## 7. Coverage Targets and Exclusions
- `src/modules/tickets/tickets.rules.js`, `src/modules/*/*.schemas.js`, `src/core/security.js`, `src/core/time.js`: 95 percent lines and branches.
- `src/modules/**/*.routes.js`: 90 percent lines; every route has at least one success and one failure test.
- `src/modules/**/*.service.js` and `src/core/audit.js`: 90 percent lines.
- Status transition matrix: 100 percent of allowed and forbidden pairs.
- Overall statements: 85 percent. Views and `src/core/schema.sql` excluded from the gate but exercised by integration setup.
- Deliberately not covered: real Brevo delivery and DNS setup, SMS, multi-node session replication, load and soak testing, SQLite backup and restore, non-Chromium browser matrix, screen reader vendor matrix beyond one NVDA pass, i18n, TLS and reverse proxy config, penetration testing beyond I30 to I34.
## 8. Release Gate, No Loophole

All commands run from the repo root on a clean clone. Any failure blocks the demo.

1. `npm ci` and `npm run lint` exit 0.
2. `npx vitest run --coverage` exits 0 with zero failed, zero skipped, and thresholds from section 7 enforced.
3. `grep -rn "\.only(\|test\.skip\|it\.skip\|describe\.skip" tests src` returns nothing.
4. Fresh DB: `npm run demo:reset` exits 0; `npm run demo:verify` confirms 4 services, 1 staff, 1 admin, 6 students, 6 waiting tickets, and every demo account verified.
5. `npm start` with `NODE_ENV=production`, then `curl -i localhost:3000/health` returns 200 and section 4 security headers.
6. `curl -s localhost:3000/api/display` returns valid JSON matching the display contract.
7. Manual M01, M03 to M18 signed off in the defect log; no open S1 or S2 defects; every S3 has an owner and workaround.
8. `git status` clean except the tagged release commit; demo database and `.env` not committed.
## 9. Failure Drills

| ID | Drill | Expected behavior | Proof |
|----|-------|-------------------|-------|
| D01 | Database locked: hold a write transaction 6 seconds, then join | Request waits up to `busy_timeout`, then returns 503 JSON or error page; no partial ticket | `tests/integration/drills.test.js`, manual log |
| D02 | Session store down: swap store methods to throw | Login returns 503 with retry message; no cookie issued; app stays up | Drill test plus `/health` check |
| D03 | Invalid status: POST serve on a `left` ticket | 409 `invalid_transition`, DB unchanged; CHECK constraint as backstop | U10, U11, I19, I33 |
| D04 | Duplicate submit: double POST join with same session and token | First 302, second 409 or idempotent redirect; one active ticket | I14, M16 |
| D05 | Unauthorized ticket access: student B leaves student A ticket | 404, no mutation, attempt logged with user id and ticket id | I18, audit log line |
