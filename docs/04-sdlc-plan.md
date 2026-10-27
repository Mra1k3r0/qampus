# 04 SDLC Plan: Ranked Build Phases

Status: proposed, pending approval. This plan ranks work by demo risk, dependency order, and rubric value. Design and backend come first because every page depends on the design contract and every demo action depends on the queue transaction.

## 1. Ranking rule

A phase moves up when it meets one or more of these:

1. It unblocks other work (schema, auth, design tokens).
2. It is on the live demo path (join, call, serve, display).
3. It protects the rubric score (tests, access control, SDLC evidence).
4. It prevents a public failure (deployment, seed, 404, mobile layout).

A phase moves down when it is cosmetic, easy to fake, or can be cut without breaking the demo story.

## 2. Phase table

| Rank | Phase | Priority | Depends on | Main output | Done when | Effort |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Scope and evidence lock | Must | none | Requirements, UI, responsive, test, git, deploy docs | Docs agree on scope and roles | done |
| P1 | Design contract and tokens | Must | P0 | `tokens.css`, `base.css`, component specs, icon map | A static shell renders at 320 and 1440 with no horizontal scroll | 2h |
| P2 | Walking skeleton | Must | P1 contracts | Repo, env, DB schema, migrations, seed, app factory, health, test harness | `npm test` runs one passing smoke test; `/health` returns 200 | 3h |
| P3 | Auth and access control | Must | P2 | Register, login, logout, SQLite session store, CSRF, role guards, audit | Student and staff sessions work; a student gets 403 on staff routes | 3h |
| P4 | Queue core | Must | P3 | Join, ticket code, position, ETA, ownership, leave, duplicate guard | Two joins create one active ticket; code is `REG-001` style | 3h |
| P5 | Staff operations and display API | Must | P4 | Call next, recall, start, serve, no-show, display JSON, audit | Call next moves the oldest waiting ticket and the board reflects it | 3h |
| P6 | Student and staff UI | Must | P1, P4, P5 | All pages, states, responsive CSS, progressive enhancement | Every page is usable at 320 to 3840; no lorem ipsum | 5h |
| P7 | Hardening and error states | Must | P6 | CSP, rate limits, 404, 500, validation errors, authorization matrix | Security checklist passes; no stack trace reaches the browser | 2h |
| P8 | Verification | Must | P6, P7 | Unit, integration, viewport, axe, defect log | Release gate in `05-test-plan.md` passes | 3h |
| P9 | Deployment | Must | P8 | Railway service, volume, env, seed, smoke test, fallback | Public URL completes join, call, serve, display | 2h |
| P10 | Showcase package | Must | P8, P9 | README, LICENSE, AI log, issues, PRs, demo script, rehearsal | A teammate can run the demo from the script without help | 2h |
| P11 | Admin service console | Must | P6 | Service open/close, hours, average minutes | Admin can close a service and students see it closed | 1.5h |
| P12 | Playwright and axe suite | Should | P8 | Browser viewport matrix, accessibility checks | 12 widths pass, no serious axe violations | 2h |
| P13 | Pagination and filters | Could | P8 | 20-row pages, status filter | Staff can page a 40-ticket queue | 1.5h |

Total must-have effort is about 29.5 focused hours. Three parallel lanes can compress wall clock to 10 to 12 hours, but only if the cut list is respected.

## 3. Why design and backend come first

- P1 prevents the common failure where every page is styled differently and mobile is fixed at the end. Tokens and component contracts are cheaper before templates exist.
- P2 to P5 create the only thing the demo cannot fake: a ticket that moves through a real state machine and survives a restart.
- P6 is intentionally after the backend contracts. Building pages against unstable data shapes causes rework.
- P7 and P8 are not polish. They are the evidence for access control, data handling, and requirements fitness.

## 4. Parallel lanes

| Lane | Owner | Scope | Writes |
| --- | --- | --- | --- |
| A: backend | fixer | P2, P3, P4, P5, P7 | `src/`, `tests/`, `package.json` |
| B: design and views | designer then fixer | P1, P6, P11 | `public/css/`, `views/`, `public/js/` |
| C: evidence | fixer | P0 gaps, P10, traceability | `docs/`, `README.md`, `LICENSE`, `.github/` |
| D: verification | fixer plus oracle review | P8, P12 | `tests/`, `docs/05-test-plan.md` results |

Rules: Lane A and Lane B do not edit the same file. The integration contract is a short list of view variables per route in `docs/02-architecture.md` section 3. Lane D runs after Lane A and Lane B reconcile, not during active edits.

## 5. Sequence and gates

```text
P0 -> P1 -> P2 -> P3 -> P4 -> P5 -> P6 -> P7 -> P8 -> P9 -> P10
                     \-> P11 after P6
                     \-> P12 after P8
```

Gate 1, after P2: database opens, migrations are idempotent, seed is repeatable, health check is green.
Gate 2, after P3: a student cannot read another student's ticket; a student cannot post to a staff route; CSRF failure returns 403.
Gate 3, after P5: a full queue cycle passes in an integration test and in the browser.
Gate 4, after P6 and P11: all pages, including the admin console, pass the 320px, 768px, 1440px checks.
Gate 5, after P8: release gate passes; no open P1 or P2 defect.
Gate 6, after P9: the public URL passes the same smoke test as local.

Do not start P9 before Gate 5. A public demo with a broken queue is worse than a local demo that works.

## 6. Minimum demo-complete cut

If time is short, ship this and stop:

1. P0 to P6.
2. P11 minimal admin service console, because FR-10 is a Must.
3. P7 limited to CSP, rate limit on login, 404, 500, and the authorization matrix.
4. P8 limited to 10 unit tests, 15 integration tests, 3 viewport checks.
5. P9 with Railway or local LAN fallback.
6. P10 with README, AI log, demo script, and issue board evidence.

Cut in this order: P13, P12, admin analytics, print styles, dark mode, extra animations. Never cut: CSRF, role checks, duplicate-ticket guard, seed reset, deployment smoke test.

## 7. Tonight schedule, relative blocks

| Block | Work | Exit condition |
| --- | --- | --- |
| T-12h to T-10h | P1 tokens and shell; P2 scaffold in parallel | Static shell and empty app boot |
| T-10h to T-7h | P3 auth and session; P6 static templates | Login works; templates compile |
| T-7h to T-5h | P4 queue core; P6 student pages | Join and ticket page work |
| T-5h to T-3h | P5 staff and display; P6 staff pages | Full cycle works in browser |
| T-3h to T-2h | P7 hardening; P8 tests in parallel | Release gate passes |
| T-2h to T-1h | P9 deploy and smoke test | Public URL works |
| T-1h to T-0h | P10 evidence, rehearsal, freeze | Demo runs twice without help |

Freeze code at T-30 minutes. Use the remaining time for rehearsal, screenshots, and the fallback plan.

## 8. Risk register

| Risk | Likelihood | Impact | Response |
| --- | --- | --- | --- |
| better-sqlite3 native build fails on Windows | Medium | High | Use Node 22 prebuilt binary; pin version; fallback to `node:sqlite` only if it supports the schema; last resort use `sqlite3` package |
| Railway trial credit or volume issue | Medium | High | Test at T-2h; keep Render + Turso and local LAN fallbacks ready |
| Campus Wi-Fi blocks the host | Medium | High | Demo from a phone hotspot; keep a local run on `0.0.0.0:3000` |
| SQLite write lock during demo | Low | Medium | One process, WAL, busy timeout, no long transactions |
| Mobile layout breaks at 320 | Medium | Medium | Test early at 320; use the table-to-list pattern already specified |
| Time runs out before tests | High | High | Write integration tests with each backend slice, not at the end |
| Team member cannot explain the code | Medium | High | Each owner writes a 5-line explanation in the PR; rehearse questions |
| AI slop copy or visuals | Medium | Medium | Run the anti-slop checklist; remove filler, emoji, and generic gradients |

## 9. Definition of done for every phase

- Code runs from a clean clone with `npm ci`, `npm run db:reset`, `npm start`.
- The phase has at least one automated check or a manual evidence line.
- The PR description names the requirement ids it satisfies.
- No secret, real student data, or `.env` file is committed.
- The phase does not break an earlier gate.

## 10. What we will not build in Round 1

Appointments, SMS or email queue notifications, multi-campus tenancy, native mobile apps, analytics dashboards, chat, file uploads, payment integration, and a drag-and-drop queue reorder. These are listed as future work in the README so the scope stays honest.
