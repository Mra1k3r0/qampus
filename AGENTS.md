# AGENTS.md

Project instructions for the Student Queueing System. Read this before changing code. If a rule here conflicts with a casual request, ask first.

## 1. Project

CSPC CCIT 106 midterm, Round 1. Node.js 22, Express 4, EJS 3, SQLite through better-sqlite3. Server-rendered pages, custom CSS, no SPA build step. The demo must run locally and on a public URL.

## 2. Non-negotiables

- No Bootstrap. No emoji. No em dash in code, docs, or user-facing copy. Use a hyphen or colon.
- Custom CSS only, driven by `public/css/tokens.css`.
- Only Lucide icons, copied from the official set into `public/icons/lucide.json`.
- Every POST is CSRF protected and redirects with 303 after success.
- Every state change writes an audit row.
- Authorization is checked on the server. Never hide a control and call that security.
- One active ticket per student per service per day, enforced by the partial unique index.
- The public display contains no name, email, or student number.
- Time is Asia/Manila. Store timestamps in UTC ISO strings, derive the service date in `core/time.js`.
- No secrets in git. Use `.env`, and keep `.env.example` current.

## 3. Code tree

Round 1 uses the lean feature-first tree in `docs/02-architecture.md` section 2. The full target tree is in `docs/02a-code-tree-full.md`.

Do not scaffold the full tree now. It is a reference for a later iteration, not a to-do list. Move a file only when a measured problem exists: a route file passes about 120 lines, a service passes about 250, a rules file passes about 200, or two features reuse the same policy.

### Round 1 build map

Use these exact paths. Do not create parallel modules, alternate views, or a second CSS entry point.

| Concern | Exact paths |
| --- | --- |
| Public display | `src/modules/display/display.routes.js`, `src/modules/display/display.service.js`, `views/pages/display.ejs`, `public/css/display.css`, `public/js/display.js` |
| Student queue | `src/modules/queue/queue.routes.js`, `views/pages/queue-dashboard.ejs`, `views/pages/queue-service.ejs`, `views/pages/ticket.ejs`, `public/js/queue.js` |
| Ticket state | `src/modules/tickets/tickets.service.js`, `src/modules/tickets/tickets.repository.js`, `src/modules/tickets/tickets.schemas.js`, `src/modules/tickets/tickets.rules.js` |
| Staff console | `src/modules/staff/staff.routes.js`, `views/pages/staff-queue.ejs`, `views/pages/staff-ticket.ejs`, `public/js/staff.js` |
| Admin windows | `src/modules/admin/admin.routes.js`, `src/modules/admin/admin.service.js`, `src/modules/admin/admin.repository.js`, `src/modules/admin/admin.schemas.js`, `views/pages/admin-services.ejs` |
| Mounts and guards | `src/routes.js`, `src/core/security.js` |
| Auth and session | `src/modules/auth/auth.routes.js`, `src/modules/auth/auth.service.js`, `src/modules/auth/auth.repository.js`, `src/core/session-store.js` |
| Data and time | `src/core/schema.sql`, `src/core/db.js`, `src/core/time.js`, `src/core/audit.js` |
| CSS entry | `public/css/main.css` imports `public/css/display.css`; shared styles stay in `public/css/tokens.css`, `public/css/base.css`, `public/css/layout.css`, `public/css/components.css` |
| Tests | `tests/integration/queue.test.js`, `tests/integration/display.test.js`, `tests/integration/staff.test.js`, `tests/integration/admin.test.js`, `tests/integration/security.test.js`, `tests/unit/tickets.test.js` |
| Docs to update | `docs/02-architecture.md`, `docs/03-ui-design.md`, `docs/03b-responsive.md`, `docs/05-test-plan.md`, `docs/07-demo-script.md`, `docs/09-traceability.md` |

Public `GET /display` and `GET /api/display` contain ticket code, service, counter, waiting count, and updated time only. Student ticket reads and writes check ownership in `tickets.service`. Staff and admin routes use `requireRole`.

## 4. Layer rules

| Layer | Owns | Never does |
| --- | --- | --- |
| `*.routes.js` | URL, middleware, request parsing, render or redirect | SQL, business rules, HTML strings |
| `*.service.js` | Use cases, transactions, audit calls | `req`, `res`, HTML |
| `*.repository.js` | Parameterised SQL and row mapping | Permission decisions |
| `tickets.rules.js` | Pure ticket code, status, position, ETA, ownership predicates | Database or Express |
| `*.schemas.js` | zod input contracts | Database |
| `core/` | DB, errors, logging, security, sessions, validation, audit, context, time | Import a feature module |
| `views/` | Render a plain view model | Query or mutate |

Dependency direction is one way: `routes -> service -> repository -> core/db`. Rules, schemas, and audit are called by the service. `tickets` is the only module that changes ticket state. `queue` and `staff` are thin HTTP adapters over `tickets.service`.

No circular imports. No feature imports another feature's repository. No `utils.js` dumping ground.

## 5. Coding style

- Two spaces, semicolons, single quotes, trailing commas in multiline literals.
- `const` by default. No `var`. No `==` or `!=`.
- Early returns and guard clauses. Avoid nesting past three levels.
- Functions should do one thing. Soft limit: 40 lines. Split at 60.
- At most three parameters. Use an object for more.
- No nested ternaries. No clever one-liners that need a comment to explain.
- No magic numbers or strings. Name them in `config.js` or a local `const`.
- Use `async` and `await`. Never leave a floating promise.
- Use the shared logger. No `console.log` in `src/`.
- Catch only what you can handle. Do not swallow errors.
- Validate at the boundary with zod, then trust the parsed value inside the service.
- Prefer boring, readable code over a pattern you saw on a reel.

## 6. Comments

Default: write no comment. Good names and small functions should carry the code.

Write a comment only when it explains why, a trade-off, a constraint, or a non-obvious bug workaround. Do not narrate what the next line does. No commented-out code. No banner comments. No JSDoc on obvious internal functions.

Gen Alpha slang is allowed sometimes in non-critical code, as a sarcastic one-liner. Keep it to at most one per file, and never in auth, payments, migrations, security middleware, tests, commit messages, docs, or user-facing copy. Never mock a user, teammate, or reviewer. No emoji, no slurs, no all caps.

Acceptable examples:

```js
// bro really tried to call next twice, the transaction said no
// no cap, this is the only place that touches the sequence
// skill issue if this is not wrapped in BEGIN IMMEDIATE
// this map is doing a lot, but it is honestly not that deep
// cooked if the service date is not Asia/Manila
```

If the comment would not help a tired teammate at 2 a.m., delete it.

## 7. Naming and file size

- Files: `feature.layer.js`, for example `tickets.service.js`.
- Variables and functions: `camelCase`. Classes and factories: `PascalCase`.
- Booleans read as a question: `isOpen`, `canLeave`, `hasActiveTicket`.
- Constants: `UPPER_SNAKE_CASE`.
- Database columns: `snake_case`.
- Routes: plural nouns, no verbs in the path. Actions are POST subpaths.
- Soft size limits: route 120 lines, service 250, rules 200, core file 200, view 200, `main.css` 600. Split by concern when exceeded.

## 8. Errors, validation, and security

- Throw `AppError` with a stable status and a safe message. Never leak a stack trace to the browser.
- Unknown input returns 400 with field errors. Missing or unauthorized resource returns 404, not 403, when the resource is another user's ticket.
- Use `requireAuth` and `requireRole` from `core/security.js`.
- Ownership checks belong in `tickets.service`, not in a template.
- Parameterised SQL only. Never interpolate user input into a query.
- bcrypt cost 12. Compare with the library, never with `===`.
- Session cookie: `cspc_queue.sid`, `httpOnly`, `sameSite=lax`, `secure` in production.
- Regenerate the session on login. Destroy it on logout.
- Rate limit login and join. Return a plain message, not a stack.
- Helmet is on. CSP allows only self-hosted assets.
- Escape all user data in EJS with `<%= %>`. Never use `<%- %>` on user data.

## 9. Database

- `core/db.js` opens the database, sets `foreign_keys=ON`, `busy_timeout=5000`, `journal_mode=WAL`, `synchronous=NORMAL`.
- Migrations are idempotent and recorded in `schema_migrations`.
- Join and call-next run inside `BEGIN IMMEDIATE`. Use the transaction helper, not manual `BEGIN` strings in a route.
- Every ticket transition updates `updated_at` and writes an audit row in the same transaction.
- Seed data is deterministic. Demo reset must produce the same 4 services, 1 staff, 1 office head, 6 students, and 6 waiting tickets.
- No ORM. No query builder. Keep SQL readable and portable where practical.

## 10. HTTP and UI

- Server-rendered EJS. No client-side router. No framework.
- Progressive enhancement only. The page must work without JavaScript; polling is an enhancement.
- Polling: board every 5 seconds, student ticket every 10 seconds, pause when `document.hidden`.
- Every page works at 320px, 360px, 768px, 1024px, and 1440px.
- Tables become lists below 768px. No horizontal scroll.
- Focus states are visible. Touch targets are at least 44px.
- Copy is plain and specific. No hype, no fake urgency, no "seamless", "revolutionary", or "unlock".
- Status is shown with text plus color, never color alone.

## 11. Tests

- Vitest for unit and integration, Supertest for HTTP, real SQLite per worker.
- Test behavior and contracts, not private helpers.
- No `sleep`. Use fake timers for ETA, day boundary, and rate limits.
- Every route has at least one success and one failure test.
- Security tests cover CSRF, role checks, ownership, session fixation, and open redirect.
- Test names read as a sentence: `returns 404 when a student opens another ticket`.
- Do not weaken a test to make a change pass. Fix the code or change the contract first.

## 12. Docs

Default cap: 150 lines per document. Keep docs tight, specific, and free of lorem ipsum.

The only exception is `docs/02a-code-tree-full.md`. It is a reference tree and may exceed 150 lines. Do not split it just to satisfy the cap. Every other doc that passes 150 lines must be split or trimmed.

When behavior changes, update the matching doc and `docs/09-traceability.md` in the same branch. A stale doc is worse than no doc.

## 13. Git and review

- Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- One concern per commit. Do not mix formatting with behavior.
- Branch from `main`, open a PR, get one peer review, squash merge.
- No direct push to `main`. No force push.
- PR body: what changed, why, how it was tested, screenshots for UI, and the test IDs touched.
- Review the diff, not the summary. A green check is evidence, not consent.

## 14. AI use

- Disclose AI assistance in `docs/06-git-and-ai.md`.
- Never invent an API, package, or command. Check the installed version and the official docs.
- Review generated code as if a teammate wrote it. You own every line you commit.
- Do not paste secrets, personal data, or the production database into a prompt.

## 15. Definition of done

A task is done only when all of these are true:

1. The change is implemented and matches the requirement.
2. `npm run lint` exits 0.
3. `npm test` exits 0.
4. `npm run demo:verify` exits 0 when the change touches the demo flow.
5. The relevant manual check in `docs/05-test-plan.md` is recorded.
6. The traceability row is updated.
7. No new secret, no new dependency without a reason, and no unexplained file.

If you cannot prove it with a command, a test, a screenshot, or a reviewed PR, do not call it done.
