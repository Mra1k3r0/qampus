# 02 Architecture: Student Queueing System

Status: implemented for Round 1, including stale-ticket expiry. Scope: one Node process, one SQLite file, server-rendered EJS, public display board.

## 1. Decision summary

| Decision | Choice | Reason |
| --- | --- | --- |
| Runtime | Node.js 22 LTS | Course target, stable, broad host support |
| Web framework | Express 4.21 | Course stack, explicit middleware order |
| View layer | EJS 3 with head/nav/foot partials | Course stack, escaped output by default |
| Database | SQLite via better-sqlite3 | No MySQL on the demo machine, file backup is simple, transactions are synchronous |
| Session store | Custom SQLite store in the same file | No MemoryStore in production, no second service |
| Validation | zod schemas at the route boundary | One source of truth for parsing and messages |
| Passwords | bcryptjs cost 12 | Meets course NFR, no native build on the host |
| Tests | Vitest + Supertest, Playwright for viewport checks | Course stack plus responsive proof |
| Deployment | Railway with a volume, local LAN fallback | Persistent SQLite without a driver change |

SQLite is a documented fallback for MySQL. The repository keeps SQL portable: no SQLite-only syntax in the domain layer beyond the partial unique index and `ON CONFLICT`, both isolated in migrations. Rejected for Round 1: MySQL, React or an SPA, Bootstrap or Tailwind, Prisma, MemoryStore sessions, Turso as primary, and microservices. Each adds a service, a build step, or a dependency the demo does not need.

## 2. Module layout

Round 1 uses the lean feature-first tree below. The full target tree for a later iteration is in `02a-code-tree-full.md` as a reference, not as the scaffold.

```text
src/
  app.js  server.js  routes.js  config.js
  core/  db.js schema.sql errors.js logger.js security.js session-store.js validation.js audit.js context.js time.js
         mailer/ index.js brevo.js ethereal.js memory.js crypto.js outbox.js render.js worker.js
  modules/auth/     routes register.routes.js verification.routes.js reset.routes.js
                    service verification.service.js reset.service.js repository schemas challenges.* auth.session.js auth.cleanup.js
  modules/tickets/  rules service repository schemas
  modules/queue/    queue.routes.js
  modules/staff/    staff.routes.js
  modules/display/  display.routes.js display.service.js
  modules/admin/    routes service repository schemas
views/  layouts/ partials/ pages/ emails/
public/ css/ js/ icons/
tests/  unit/ integration/ helpers/ fixtures/
scripts/ db.js demo.js load.js
```

Routes own the HTTP handlers. Split a controller out only when a route file passes about 120 lines. `tickets` is the only module that changes ticket state; `queue` and `staff` are thin HTTP adapters over `tickets.service`. `core` may import the database and other infrastructure, but never a feature module. Feature modules may import `core` and each other's public service, never another module's repository.

## 3. Request lifecycle

1. `helmet`, `pino-http`, `express.urlencoded({ extended: false, limit: '16kb' })`, and static files from `public/`. `scripts/build-assets.js` builds the route-specific `page-*.min.css` bundles and minified JS before the server starts.
2. Session middleware reads `cspc_queue.sid`; `loadUser` sets `req.user`, and `locals` exposes `user`, `csrfToken`, `flash`, `currentPath`, and `appName`.
3. A route guard checks authentication and role, validation parses typed input, and the service runs one transaction per state change.
4. The route renders EJS or redirects with 303 after a successful POST. 404 renders the not-found page; errors log with a request id and render a safe 500 page.

## 4. Data model

```sql
users(id, full_name, student_no UNIQUE, email UNIQUE, password_hash, role,
      email_verified_at, session_version, created_at)
services(id, code UNIQUE, name, description, avg_minutes, open_days, opens_at, closes_at, is_open, created_at)
counters(id, service_id, name, is_active)
tickets(id, code, service_id, user_id, counter_id, called_by, status, note, service_date,
        sequence, call_count, called_at, started_at, ended_at, created_at, updated_at,
        UNIQUE(service_id, service_date, sequence), UNIQUE(code, service_date))
auth_challenges(id, user_id, purpose, code_hash, attempts, max_attempts, expires_at, verified_at, consumed_at, superseded_at, created_at)
auth_throttle(key PRIMARY KEY, count, window_started_at, blocked_until)
mail_outbox(id, to_email, template, subject, payload_ciphertext, payload_iv, payload_tag,
            status, attempts, next_attempt_at, last_error, provider_message_id, sent_at, created_at)
audit_log(id, actor_user_id, action, entity_type, entity_id, before_json, after_json, request_id, created_at)
sessions(sid PRIMARY KEY, sess, expires_at)  schema_migrations(version PRIMARY KEY, applied_at)
```

`users.role` is CHECKed to `student`, `staff`, or `admin`; `session_version` defaults to 1. `auth_challenges.purpose` is `verify_email` or `reset_password`, and a partial unique index allows one active challenge per user and purpose. `mail_outbox` stores only sealed payloads until send, then nulls them. `tickets.status` is CHECKed to `waiting`, `called`, `serving`, `served`, `left`, `no_show`, or `expired`.

The partial unique index below enforces one active ticket per student per service per day. It is the last line of defence when two requests race.

```sql
CREATE UNIQUE INDEX one_active_ticket
ON tickets(user_id, service_id, service_date)
WHERE status IN ('waiting','called','serving');
```

## 5. Ticket lifecycle

```text
waiting --staff call--> called --staff start--> serving --staff serve--> served
   |                       |                        |
   |                       +--staff no-show--> no_show
   |                       +--staff recall--> called (call_count + 1)
   +--student leave--> left
```

Rules: only the owner can leave a waiting ticket. Called and serving tickets cannot be left. Only staff or admin can call, start, serve, no-show, or recall. A no-show frees the active slot, so the same student can rejoin that day. Every transition writes an audit row. Join policy is pure in `tickets.rules.js`, evaluated as service open, window, no-show block, active cap, cooldown, then insert. The window closes `JOIN_CUTOFF_MINUTES` (30) before `closes_at` in Asia/Manila. One ticket per service and at most `MAX_ACTIVE_TICKETS` (2) across services per day. Two joins inside `JOIN_COOLDOWN_SECONDS` (60) return 429. `NO_SHOW_LIMIT` (2) blocks the rest of the day. `QUEUE_ENFORCE_HOURS=false` skips only the window check for demos; the cap, cooldown, and no-show rule stay on. The visible open or closed state uses the same schedule check without the 30-minute join cutoff, so a manual `is_open` flag alone cannot show a window as open after `closes_at`. A waiting, called, or serving ticket from an earlier Manila service date is shown as `expired`, cannot transition, and is expired by the sweep. The rules are published at `GET /rules`.

## 6. Concurrency and numbering

- `better-sqlite3` is synchronous. Wrap each transition in `db.transaction(...)` and use `BEGIN IMMEDIATE` for call-next, join, and auth challenge writes. WAL mode, `busy_timeout=5000`, and one process keep lock contention low.
- Join computes `MAX(sequence) + 1` inside the transaction, inserts, and handles two conflicts: an active-ticket conflict returns the existing ticket, and a sequence collision recomputes once. Call-next selects the oldest waiting ticket with `ORDER BY sequence ASC LIMIT 1`; if no row is waiting, it returns null.
- The partial unique index prevents a double join even if the service check is bypassed. A startup sweep and the first request of a new Manila day expire earlier active tickets, each with an audit row in the same transaction; `node scripts/db.js expire` is the manual fallback.

## 7. Authentication and sessions

- Register creates a student only; staff and admin accounts are seeded or created by an admin. The `admin` role is labelled "Office head" in the interface. Registration writes the unverified user and its audit row in one immediate transaction, then issues an 8-digit challenge and queues the `verify-code` mail in a second transaction. `POST /verify-email` hashes and checks the code, then marks the email verified and increments `session_version`. Existing verified emails get an `account-exists` mail instead, and the password is unchanged.
- Login compares bcrypt hashes with a generic error for unknown email, wrong password, and inactive or unverified accounts. The portal field only picks copy and landing, never authorization. `loadUser` drops a session when the account is inactive, unverified, or its `session_version` is stale.
- Self-serve reset is generic for known and unknown email, with dummy bcrypt work on both paths. A valid code regenerates the session and stores a 10-minute reset grant bound to the user id. Setting the password updates the hash, increments `session_version`, and writes the audit row in one immediate transaction, so every old session dies. No reset or verification path auto-signs-in.
- On successful login, `req.session.regenerate` prevents session fixation, then sets `userId`, `role`, and `sessionVersion`.
- Cookie: `cspc_queue.sid`, `httpOnly`, `sameSite=lax`, `secure` in production, 8 hour max age, rolling. Sessions live in the `sessions` table and are deleted on logout and expiry. A cleanup query runs at boot and every hour.
- CSRF uses a synchronizer token in the session. Every POST form includes `_csrf`; the server compares with `crypto.timingSafeEqual`. Failure returns 403 and an audit row. Anonymous reads of `/`, `/policy`, `/display`, and `/api/display` skip flash and the lazy CSRF getter, so they set no cookie and create no session row. Express spreads `res.locals` into render options, so an enumerable token getter would mint a session even when the template never reads it.
- Mail: Brevo HTTPS in production, Ethereal plus Nodemailer outside it, memory in tests. `enqueueMail` only seals and inserts. The in-process worker drains one row at a time on boot and every 2 seconds; the boot drain is the only place that resets stale `sending` rows. Sent payloads are nulled; retries back off on 429, 5xx, and network errors.

## 8. Authorization

| Route | Student | Staff | Admin |
| --- | --- | --- | --- |
| `GET /` | public | public | public |
| `GET /display`, `GET /api/display` | public | public | public |
| `/register`, `/login`, `/register/check-email`, `/verify-email`, `/verify-email/resend`, `/forgot-password`, `/forgot-password/sent`, `/reset-password`, `/reset-password/new` | guest | guest | guest |
| `GET /queue`, `GET /queue/:serviceId`, `POST /queue/:serviceId/join`, `GET /queue/tickets/:id`, `POST /queue/tickets/:id/leave` | own | no | no |
| `GET /staff/queue`, `POST /staff/queue/:serviceId/call-next`, `GET /staff/tickets/:id`, `POST /staff/tickets/:id/start`, `POST /staff/tickets/:id/serve`, `POST /staff/tickets/:id/no-show`, `POST /staff/tickets/:id/recall` | no | yes | yes |
| `GET /admin/services`, `POST /admin/services/:id` | no | no | yes |
| `GET /admin/staff`, `POST /admin/staff`, `POST /admin/staff/:id`, `POST /admin/staff/:id/password`, `POST /admin/staff/:id/status` | no | no | yes |

Student ticket reads use `WHERE id = ? AND user_id = ?`. A miss returns 404, not 403, so ticket ids are not enumerable. Staff routes use `requireRole('staff','admin')`.

## 9. Validation, errors, and logging

- Every body is parsed with a zod schema; unknown keys are stripped, strings are trimmed and length-limited, and failure re-renders the form with 400, preserves old values, and focuses the error summary.
- `createError(status, safeMessage, extra)` from `http-errors` carries a safe public message. Unexpected errors render 500 with a request id and no stack trace. Async route errors are caught by `express-async-errors`.
- `pino-http` logs method, path, status, duration, and request id. It redacts cookies, authorization, password, and CSRF values.
- Audit actions: login, logout, register, email verified, verification requested, reset requested, password reset, join, leave, call, recall, start, serve, no-show, ticket expire, service update, staff create, staff update, staff password reset, staff activate, staff deactivate. Auth audit rows never contain a code, hash, or raw email.

## 10. Security posture

- `helmet` with CSP: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; require-trusted-types-for 'script'; trusted-types qampus-html. HSTS is `max-age=31536000; includeSubDomains; preload`; the only remote origin is the Cloudflare Web Analytics beacon.
- No inline scripts or styles. All JS is external. Dynamic HTML strings pass through the `qampus-html` Trusted Types policy before `DOMParser`. EJS uses `<%= %>` for data and `<%- include() %>` only for trusted partials and validated Lucide icons. Parameterised SQL only, with no interpolation of values, column names, or ORDER BY.
- Rate limits per IP: login 10 per 15 minutes, register 5 per hour, verify 10 per 15 minutes, resend 5 per 15 minutes, forgot 5 per 15 minutes, reset 10 per 15 minutes; join 20 per hour per user. Per-account auth limits: 3 per 15 minutes, 5 per hour, 10 per day, keyed by HMAC of the email.
- `express.urlencoded` and JSON limits are 16 KB; no file uploads in Round 1. Cookies are HttpOnly, SameSite=Lax, and Secure in production. `app.disable('x-powered-by')`. Static files come only from `public/`; the project root is never served.

## 11. Time and display

- Store timestamps as ISO 8601 UTC strings. Compute the Manila service date with `dayjs` plus the `utc` and `timezone` plugins. Ticket codes use the service prefix plus a three digit daily sequence, for example `REG-014`; prefixes are 2 to 4 uppercase letters and are validated at seed and admin time.
- ETA uses the waiting tickets ahead multiplied by the service average minutes, plus the remaining average for the ticket at the desk (called or serving). A serving ticket's remainder is its average minus elapsed time since `started_at`, floored at zero. The page shows a clock time and a relative minute range, not a fake precise promise.
- Display polling: 5 seconds for `/api/display`, 10 seconds for a student ticket. Pause when `document.hidden` is true. Announce a changed ticket once with `aria-live="polite"`.
- `/api/display` returns every service. `GET /api/display?service=<id>` returns one service and a 404 JSON error when the id is unknown. The public board uses the all-services payload.

## 12. Testing seams

- `createApp({ db, config, enableSweep, mailer })` accepts an injected database and mailer so tests use a temporary file and never touch the demo file or a real inbox; `enableSweep` can turn off the lazy sweep. Pure rules for code, position, ETA, stale display, and transitions are tested without HTTP.
- Integration tests use a Supertest agent to keep cookies, parse the CSRF token from a rendered form, and assert status codes and database rows. Playwright runs the responsive matrix in `03b-responsive.md` and axe checks on the main pages.

## 13. Decisions to defend

Server-rendered HTML shows the HTTP cycle and works without JavaScript. SQLite with WAL handles one office without a second service. The partial index prevents duplicate active tickets. Sessions and CSRF are server-side, so editing a cookie cannot grant a role. Every state change is audited.
