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
  core/  db.js schema.sql errors.js logger.js security.js session-store.js
         validation.js audit.js context.js time.js
  modules/auth/     routes service repository schemas
  modules/tickets/  rules service repository schemas
  modules/queue/    queue.routes.js
  modules/staff/    staff.routes.js
  modules/display/  display.routes.js display.service.js
  modules/admin/    routes service repository schemas
views/  layouts/ partials/ pages/
public/ css/ js/ icons/
tests/  unit/ integration/ helpers/ fixtures/
scripts/ db.js demo.js load.js
```

Routes own the HTTP handlers. Split a controller out only when a route file passes about 120 lines. `tickets` is the only module that changes ticket state; `queue` and `staff` are thin HTTP adapters over `tickets.service`. `core` may import the database and other infrastructure, but never a feature module. Feature modules may import `core` and each other's public service, never another module's repository.

## 3. Request lifecycle

1. `helmet`, `pino-http`, `express.urlencoded({ extended: false, limit: '16kb' })`, and static files from `public/`. `scripts/build-assets.js` builds the route-specific `page-*.min.css` bundles and minified JS before the server starts.
2. Session middleware reads `cspc_queue.sid`; `loadUser` sets `req.user`, and `locals` exposes `user`, `csrfToken`, `flash`, `currentPath`, and `appName`.
3. Route guard checks authentication and role. Validation parses params, query, and body into typed data.
4. Service layer runs one transaction for each state change.
5. Route renders EJS or redirects with 303 after a successful POST.
6. 404 renders the not-found page. Errors log with a request id and render a safe 500 page.

## 4. Data model

```sql
users(id, full_name, student_no UNIQUE, email UNIQUE, password_hash, role, created_at)
services(id, code UNIQUE, name, description, avg_minutes, open_days, opens_at, closes_at, is_open, created_at)
counters(id, service_id, name, is_active)
tickets(id, code, service_id, user_id, counter_id, called_by, status, note, service_date,
        sequence, call_count, called_at, started_at, ended_at, created_at, updated_at,
        UNIQUE(service_id, service_date, sequence), UNIQUE(code, service_date))
audit_log(id, actor_user_id, action, entity_type, entity_id, before_json, after_json, request_id, created_at)
sessions(sid PRIMARY KEY, sess, expires_at)
schema_migrations(version PRIMARY KEY, applied_at)
```

`users.role` is CHECKed to `student`, `staff`, or `admin`. `tickets.status` is CHECKed to `waiting`, `called`, `serving`, `served`, `left`, `no_show`, or `expired`.

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

- `better-sqlite3` is synchronous. Wrap each transition in `db.transaction(...)` and use `BEGIN IMMEDIATE` for call-next and join.
- Join computes `MAX(sequence) + 1` inside the transaction, inserts, and handles two conflicts separately: an active-ticket conflict returns the existing ticket, and a sequence collision recomputes once.
- Call-next selects the oldest waiting ticket with `ORDER BY sequence ASC LIMIT 1`, updates it, and returns it. If no row is waiting, return null and show the empty state.
- The partial unique index prevents a double join even if the service check is bypassed. A startup sweep and the first request of a new Manila day expire earlier active tickets, each with an audit row in the same transaction; `node scripts/db.js expire` is the manual fallback.
- WAL mode, `busy_timeout=5000`, and one process keep lock contention low.

## 7. Authentication and sessions

- Register creates a student only. Staff and admin accounts are seeded or created by an admin. The `admin` role is labelled "Office head" in the interface.
- Login compares bcrypt hashes with a generic error for unknown email and wrong password. The portal field only picks copy and landing, never authorization. Inactive accounts (migration `002_user_is_active`) get the same generic error, and an existing session is dropped on the next request.
- On success, `req.session.regenerate` prevents session fixation, then sets `userId` and `role`.
- Cookie: `cspc_queue.sid`, `httpOnly`, `sameSite=lax`, `secure` in production, 8 hour max age, rolling. Sessions live in the `sessions` table and are deleted on logout and expiry. A cleanup query runs at boot and every hour.
- CSRF uses a synchronizer token in the session. Every POST form includes `_csrf`; the server compares with `crypto.timingSafeEqual`. Failure returns 403 and an audit row. Anonymous reads of `/`, `/policy`, `/display`, and `/api/display` skip flash and the lazy CSRF getter, so they set no cookie and create no session row. Express spreads `res.locals` into render options, so an enumerable token getter would mint a session even when the template never reads it.

## 8. Authorization

| Route | Student | Staff | Admin |
| --- | --- | --- | --- |
| `GET /` | public | public | public |
| `GET /display`, `GET /api/display` | public | public | public |
| `GET /queue`, `GET /queue/:serviceId`, `POST /queue/:serviceId/join`, `GET /queue/tickets/:id`, `POST /queue/tickets/:id/leave` | own | no | no |
| `GET /staff/queue`, `POST /staff/queue/:serviceId/call-next`, `GET /staff/tickets/:id`, `POST /staff/tickets/:id/start`, `POST /staff/tickets/:id/serve`, `POST /staff/tickets/:id/no-show`, `POST /staff/tickets/:id/recall` | no | yes | yes |
| `GET /admin/services`, `POST /admin/services/:id` | no | no | yes |
| `GET /admin/staff`, `POST /admin/staff`, `POST /admin/staff/:id`, `POST /admin/staff/:id/password`, `POST /admin/staff/:id/status` | no | no | yes |

Student ticket reads use `WHERE id = ? AND user_id = ?`. A miss returns 404, not 403, so ticket ids are not enumerable. Staff routes use `requireRole('staff','admin')`.

## 9. Validation, errors, and logging

- Every body is parsed with a zod schema. Unknown keys are stripped. Strings are trimmed and length-limited.
- Validation failure re-renders the form with 400, preserves old values, and focuses the error summary.
- `createError(status, safeMessage, extra)` from `http-errors` carries a safe public message. Unexpected errors render 500 with a request id and no stack trace. Async route errors are caught by `express-async-errors`.
- `pino-http` logs method, path, status, duration, and request id. It redacts cookies, authorization, password, and CSRF values.
- Audit actions: login, logout, join, leave, call, recall, start, serve, no-show, ticket expire, service update, staff create, staff update, staff password reset, staff activate, staff deactivate.

## 10. Security posture

- `helmet` with CSP: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; require-trusted-types-for 'script'; trusted-types qampus-html. HSTS is `max-age=31536000; includeSubDomains; preload`; the only remote origin is the Cloudflare Web Analytics beacon.
- No inline scripts or styles. All JS is external. Dynamic HTML strings pass through the `qampus-html` Trusted Types policy before `DOMParser`. EJS uses `<%= %>` for data and `<%- include() %>` only for trusted partials and validated Lucide icons. Parameterised SQL only, with no interpolation of values, column names, or ORDER BY.
- Rate limits: login 10 per 15 minutes per IP, register 5 per hour per IP, join 20 per hour per user.
- `express.urlencoded` limit 16 KB. JSON limit 16 KB. No file uploads in Round 1.
- Cookies are HttpOnly, SameSite=Lax, Secure in production. `app.disable('x-powered-by')`. Static files come only from `public/`; the project root is never served.

## 11. Time and display

- Store timestamps as ISO 8601 UTC strings. Compute the Manila service date with `dayjs` plus the `utc` and `timezone` plugins.
- Ticket codes use the service prefix plus a three digit daily sequence, for example `REG-014`. Prefixes are 2 to 4 uppercase letters and are validated at seed and admin time.
- ETA uses the waiting tickets ahead multiplied by the service average minutes, plus the remaining average for the ticket at the desk (called or serving). A serving ticket's remainder is its average minus elapsed time since `started_at`, floored at zero. The page shows a clock time and a relative minute range, not a fake precise promise.
- Display polling: 5 seconds for `/api/display`, 10 seconds for a student ticket. Pause when `document.hidden` is true. Announce a changed ticket once with `aria-live="polite"`.
- `/api/display` returns every service. `GET /api/display?service=<id>` returns one service and a 404 JSON error when the id is unknown. The public board uses the all-services payload.

## 12. Testing seams

- `createApp({ db, config, enableSweep })` accepts an injected database so tests use a temporary file and never touch the demo file; `enableSweep` can turn off the lazy sweep. Pure rules for code, position, ETA, stale display, and transitions are tested without HTTP.
- Integration tests use a Supertest agent to keep cookies, parse the CSRF token from a rendered form, and assert status codes and database rows.
- Playwright runs the responsive matrix in `03b-responsive.md` and axe checks on the main pages.

## 13. Decisions to defend

Server-rendered HTML shows the HTTP cycle and works without JavaScript. SQLite with WAL handles one office without a second service. The partial index prevents duplicate active tickets. Sessions and CSRF are server-side, so editing a cookie cannot grant a role. Every state change is audited.
