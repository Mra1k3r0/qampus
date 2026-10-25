# CSPC Student Queueing System

Server-rendered queueing system for the CSPC CCIT 106 midterm. Node.js 22, Express 4, EJS, and SQLite through better-sqlite3.

This is the P2 backend walking skeleton: app factory, database, seed data, sessions, CSRF, auth, and test seams. The views and CSS live in a parallel lane.

## Requirements

- Node.js 22 (see `.nvmrc`)
- npm 10 or newer

## Setup

```bash
npm install
copy .env.example .env
npm run db:reset
npm start
```

The app listens on `http://localhost:3000`. Open `/health` for a database check.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enforces a strong secret and secure cookie |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `data/cspc_queue.sqlite` | SQLite file, created on first run |
| `SESSION_SECRET` | development fallback | At least 32 characters in production |
| `COOKIE_NAME` | `cspc_queue.sid` | Session cookie name |
| `SESSION_MAX_AGE_MS` | `28800000` | 8 hours |
| `COOKIE_SECURE` | `false` | Forced on in production |
| `LOG_LEVEL` | `info` | pino level, `silent` in tests |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint over the repository |
| `npm test` | Full Vitest run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:migrate` | Apply schema migrations |
| `npm run db:seed` | Seed an existing database |
| `npm run db:reset` | Delete the database file, migrate, and seed |
| `npm run demo:reset` | Rebuild the deterministic demo database |
| `npm run demo:verify` | Check the demo counts and password hash |
| `npm run load` | Fetch `/health` repeatedly with Node 22 fetch |
| `npm start` | Start the server |
| `npm run dev` | Start with `node --watch` |

`node scripts/db.js retention --dry-run` reports expired sessions and audit rows older than 90 days. Run it without `--dry-run` to delete them.

## Demo accounts

All demo accounts use the password `QueueDemo2026!`.

| Role | Email |
| --- | --- |
| Staff | `staff@cspc.edu.ph` |
| Office head | `admin@cspc.edu.ph` |
| Student | `student1@cspc.edu.ph` to `student6@cspc.edu.ph` |

The seed creates 4 services (REG 8 min, CSH 5 min, SCH 10 min, LIB 4 min), one counter per service, 1 staff, 1 admin, 6 students, and 6 waiting tickets.

## Layout

```text
src/
  app.js          createApp({ db, config })
  server.js       migrate, seed when empty, listen, cleanup, shutdown
  routes.js       home, health, feature routers
  config.js       env parsing and production guards
  core/           db, schema, errors, logger, security, sessions, validation, audit, context, time, seed
  modules/auth/   register, login, logout
  modules/queue/  service listing and the /queue placeholder
  modules/staff/  /staff/queue role-guarded placeholder
  modules/tickets/ ownership and active status predicates
scripts/          db, demo, load
tests/            unit, integration, helpers, fixtures
```

## Requests and security

- Every POST requires a `_csrf` field that matches the session token with a timing-safe compare.
- Helmet sets a self-only CSP, `X-Frame-Options: DENY`, and `nosniff`.
- Login is limited to 10 attempts per 15 minutes per IP. Register is limited to 5 per hour per IP.
- Sessions live in SQLite. The cookie is HttpOnly, SameSite=Lax, and Secure in production. Login regenerates the session and logout destroys it.
- Only the owner can leave a waiting ticket. Role checks run on the server.
- Register, login, logout, and CSRF failures write an audit row.

## View contract

The backend renders these EJS templates with the `layouts/app` layout. The designer owns the files.

| Template | Locals |
| --- | --- |
| `pages/home` | `services` |
| `pages/register` | `errors`, `values` |
| `pages/login` | `errors`, `values`, `nextPath` |
| `pages/queue-dashboard` | `tickets`, `services` |
| `pages/staff-queue` | `tickets`, `services` |
| `pages/404` | `message` |
| `pages/error` | `status`, `message`, `requestId` |

Shared locals from `core/context.js`: `appName`, `user`, `csrfToken`, `flash`, `currentPath`, `requestId`, `icons`. Every form that submits with POST must include `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`.

## Tests

Unit tests cover bcrypt cost 12, hashing and verification, auth schemas, and the Asia/Manila day boundary:

```bash
npx vitest run tests/unit
```

Integration tests use Supertest against a real SQLite file per worker. They exercise auth and security, including CSRF, rate limits, and database constraints. Integration tests that render a page need the matching view from the contract above.

```bash
npx vitest run tests/integration
```

## Notes

- Time is Asia/Manila for service dates and display, stored as UTC ISO strings.
- The partial unique index `one_active_ticket` prevents two active tickets for one student, service, and day.
- No Bootstrap, no emoji, no inline script or style, and no client-side router.

## License

MIT. See `LICENSE`.
