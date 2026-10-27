# 09 Traceability and Evidence Matrix

Purpose: prove that every rubric criterion and every requirement has a build artifact, a test, and a piece of evidence that can be shown or run. This document is a plan until the status column says Done. A file name alone is not evidence; the evidence is the passing command, the screenshot, or the reviewed PR.

## 1. Rules

- Source of truth for requirements: `01-requirements.md`, FR-01 to FR-15 and NFR-01 to NFR-08.
- Source of truth for test IDs: the U, I, M, and D matrices in `05-test-plan.md`. FR to test mapping lives in section 5 of this file.
- Source of truth for phases: `04-sdlc-plan.md`, P0 to P13.
- A requirement is covered only when the test exists, passes, and the evidence path is recorded in section 10.
- Do not mark a row Done because the page renders. Mark it Done when the failure case also passes.
- If a requirement is cut, change its priority and say so in section 11. Do not leave a Must requirement unbuilt.

## 2. Status legend

| Status | Meaning |
| --- | --- |
| Done | Artifact exists and evidence is recorded |
| Built | Artifact exists, test not yet run |
| Planned | Phase is scheduled, no artifact yet |
| Cut | Deliberately removed from Round 1, with a reason |

## 3. Rubric I evidence matrix

| Rubric criterion | Weight | What the evaluator should see | Artifact | Status |
| --- | --- | --- | --- | --- |
| GitHub collaboration and workflow (CO2) | 25 | One protected main, short-lived branches, reviewed PRs, conventional commits linked to issues, balanced graph, LICENSE, AI disclosure | `06-git-and-ai.md`, issue board, PR template, `LICENSE`, `README.md` | Planned |
| Requirements and fitness (CO3) | 20 | Real stakeholders, testable FR and NFR, use cases with exceptions, build matches the document | `01-requirements.md`, this file, `07-demo-script.md` | Documents done, build planned |
| Application implementation (CO4) | 25 | Routes, EJS templates, forms, SQLite persistence, main queue flow end to end, clear structure | `02-architecture.md`, `08a-pterodactyl-tunnel.md`, `src/`, `views/`, `public/`, deployed URL | Built |
| Basic access control and data handling (CO4) | 15 | Student and staff accounts, login and sessions, role-restricted pages, server-side validation, no secrets | FR-13, FR-14, FR-15, NFR-02, `I01` to `I05`, `I07` to `I11`, `I18`, `I30` to `I34`, `I38`, `I41` to `I44`, `I57` to `I60` | Built |
| Round 1 showcase, critique, defense (CO1, CO5) | 15 | Live demo, specific critique of the counterpart build, each member explains their files | `07-demo-script.md`, slides, critique notes, Q&A rehearsal | Planned |

## 4. Course outcome coverage

| Outcome | Indicator | Evidence | Status |
| --- | --- | --- | --- |
| CO1 | CI1 technology review and justified stack | `00-course-coverage.md`, `02-architecture.md` section 13, Q&A 1 to 3 | Done for docs |
| CO2 | CI2 repository workflow, licence, ethics, AI record | `06-git-and-ai.md`, `LICENSE`, AI log, PR reviews | Planned |
| CO3 | CI3 requirements specification with use cases | `01-requirements.md` sections 2 to 6, this file | Done |
| CO4 | CI4 working framework app with pages, forms, data, auth, safe errors | `02-architecture.md`, `src/`, `views/`, `I01` to `I44` | Built |
| CO5 | CI5 tests, inspection, deployment, documentation | `05-test-plan.md`, `08-deployment.md`, `07-demo-script.md`, `/health` | Planned |

## 5. Functional requirement traceability

| FR | Requirement in one line | Implementation | Automated tests | Manual | Status |
| --- | --- | --- | --- | --- | --- |
| FR-01 | Join an open service, one active ticket per service per day | `src/modules/tickets/tickets.service.js`, `src/core/schema.sql` | U01, I11 to I16, I32, I56 | M01, M16 | Built |
| FR-02 | Ticket code with prefix and daily sequence | `src/modules/tickets/tickets.service.js`, `tickets.rules.js` | U01, I13 | M11 | Built |
| FR-03 | Position and ETA, refreshed at most every 10 seconds | `src/modules/tickets/tickets.rules.js`, `src/modules/tickets/tickets.repository.js`, `src/modules/tickets/tickets.service.js`, `src/modules/queue/queue.repository.js`, `src/modules/queue/queue.service.js`, `public/js/queue.js` | U04 to U09, U18, I13, `queue-wait.test.js` | M04, M12 | Built |
| FR-04 | Leave an owned waiting ticket; called or serving cannot leave | `src/modules/tickets/tickets.service.js`, `src/modules/tickets/tickets.rules.js` | U02, U12, I17 to I19 | M03 | Built |
| FR-05 | Staff calls the oldest waiting ticket atomically | `src/modules/tickets/tickets.service.js`, `public/js/queue.js`, `public/js/call-watch.js`, `views/layouts/app.ejs`, `views/partials/call-watch.ejs`, `views/pages/queue-dashboard.ejs`, `views/pages/ticket.ejs`, `public/css/components.css` | U10, I20, I21, I51 | M04, M10 | Built |
| FR-06 | Staff starts a called ticket | `src/modules/tickets/tickets.service.js` | U10, I23 | M03 | Built |
| FR-07 | Staff marks a serving ticket served | `src/modules/tickets/tickets.service.js` | U10, I23 | M03 | Built |
| FR-08 | Staff marks a called ticket no-show; student may rejoin | `src/modules/tickets/tickets.service.js` | U10, I24, I33 | M10 | Built |
| FR-09 | Staff recalls a called ticket | `src/modules/tickets/tickets.service.js`, `public/js/call-watch.js`, `views/partials/call-watch.ejs`, `public/css/components.css` | U10, I25, I51 | M04 | Built |
| FR-10 | Office head sets weekly windows, opens or closes a service, labels counters | `src/modules/admin/admin.service.js`, `views/pages/admin-services.ejs` | I16, I36, I38 to I41 | M14 | Built |
| FR-11 | Public display with no PII, refreshed every 5 seconds | `src/modules/display/display.routes.js`, `display.service.js`, `public/js/display.js` | I26, I27 | M11, M12 | Built |
| FR-12 | Staff filters by service, status, date; filters persist | `src/modules/tickets/tickets.repository.js` | I35 | M14 | Planned |
| FR-13 | Register with verified email, login, logout, hashed password, server-side session | `src/modules/auth/*`, `src/core/session-store.js`, `src/core/mailer/*` | U14, U16, U19, I01 to I05, I07, I08, I57, I58 | M05, M13, M17 | Built |
| FR-14 | Server-side role and ownership checks, audited | `src/core/security.js`, `src/modules/tickets/tickets.rules.js`, `src/core/audit.js` | U02, U12, I09, I10, I42, I43, I44 | D05 | Built |
| FR-15 | Self-serve password reset by email, no account enumeration, old sessions revoked | `src/modules/auth/reset.routes.js`, `reset.service.js`, `challenges.*`, `views/pages/forgot-*.ejs`, `reset-*.ejs` | U15, U19, I59, I60 | M18 | Built |

## 6. Non-functional requirement traceability

| NFR | Target | Verification | Evidence | Status |
| --- | --- | --- | --- | --- |
| NFR-01 | p95 under 2 seconds for join, status, staff action at 100 concurrent users; board under 50 KB | `scripts/load.js` with autocannon against a seeded database | `docs/evidence/load.txt` with p95 and error count | Planned |
| NFR-02 | bcrypt at least 10 for passwords and codes, HttpOnly and SameSite cookie, Secure in production, CSRF via csrf-sync, helmet, login and auth limits, encrypted mail payloads | U14, U16, U17, U19, I11, I30, I31, I57 to I60, header check | Test output plus `curl -i` header capture | Planned |
| NFR-03 | First join and position in under 60 seconds; SUS at least 70 | Moderated test with 5 people, task sheet, SUS form | `docs/evidence/usability.md` with scores and notes | Planned |
| NFR-04 | WCAG 2.2 AA, axe plus keyboard and one screen reader pass | axe on 6 pages, M01 to M09, NVDA pass | axe JSON, manual checklist, 3 screenshots | Planned |
| NFR-05 | Collect only name, email, student number, role, ticket events; tickets purged after 30 days, audit after 90 days | `scripts/db.js retention`, data inventory in `01-requirements.md` section 7 | Dry-run output and inventory table | Planned |
| NFR-06 | 99.0 percent during office hours, health check every 60 seconds, 503 when busy | D01, `/health`, uptime monitor | Health JSON and one 503 drill log | Planned |
| NFR-07 | Append-only audit with actor, time, entity, before and after; no passwords or tokens | I37 plus code review of `src/core/audit.js` | Test output and one printed audit row | Planned |
| NFR-08 | Latest two Chrome, Edge, Firefox, Safari; 360px mobile | Manual browser matrix plus 320px and 360px checks | Screenshot per browser and width | Planned |

## 7. Use case and failure drill coverage

| Item | Main path tests | Exception tests | Status |
| --- | --- | --- | --- |
| UC-01 Join a queue | I13, I14, I16 | I11, I15, I32, D04 | Planned |
| UC-02 Call the next ticket | I20, I21 | I22, D03 | Planned |
| UC-03 Leave a queue | I17 | I18, I19, D05 | Planned |
| D01 Database locked | none | D01 | Planned |
| D02 Session store failure | none | D02 | Planned |
| D03 Invalid status | U10, U11 | I19, I33 | Planned |
| D04 Duplicate submit | I14, M16 | D04 | Planned |
| D05 Unauthorized ticket access | I18 | D05 | Planned |

## 8. Security and privacy checklist

- [ ] Passwords and 8-digit codes hashed with bcrypt cost 12; outbox payloads encrypted with AES-256-GCM; plaintext codes, hashes, and raw emails absent from logs and audit rows.
- [ ] Session id regenerated on login; cookie HttpOnly, SameSite=Lax, Secure in production.
- [ ] CSRF token on every POST; missing or mismatched token returns 403.
- [ ] Helmet CSP with one hashed inline theme bootstrap and no `unsafe-inline`; frame-ancestors none; nosniff; Permissions-Policy denies camera, microphone, geolocation, payment, and USB while keeping same-origin autoplay for the call chime; HSTS is two years with preload.
- [ ] Every query parameterised; no string-built SQL.
- [ ] zod validation on body, params, and query; unknown keys stripped; length limits set.
- [ ] Login rate limit 10 per 15 minutes; join limit 20 per hour per user.
- [ ] Role guard on every staff and admin route, tested from a student session.
- [ ] Ownership check on every student ticket route; a miss returns 404.
- [ ] Error pages show a request id, not a stack trace or SQL.
- [ ] No `.env`, database file, or secret in Git; `.gitignore` verified with `git status`.
- [ ] Audit rows contain no password, token, or full student number.
- [ ] Retention script dry-run shows the 30-day and 90-day cutoffs.
- [ ] `npm audit` reviewed; no critical vulnerability without a written exception.

## 9. Responsive and accessibility matrix

Test at 320, 360, 390, 414, 480, 768, 820, 1024, 1280, 1440, 1920, 2560, and 3840 CSS pixels. For each width, check `/`, `/queue`, `/queue/:serviceId`, `/queue/tickets/:id`, `/staff/queue`, `/staff/tickets/:id`, `/admin/services`, `/display`, `/login`, and the 404 page.

Pass condition per page: no horizontal scroll, no clipped control, no text under 14px, tap targets at least 44px on touch widths, one clear primary action, and the table converts to a definition list below 768px. Record the worst width and attach a screenshot. The full contract is in `03b-responsive.md`; the design tokens and page intent are in `03-ui-design.md`.

## 10. Evidence index to fill during P8 and P9

| Evidence | Path | Owner | Status |
| --- | --- | --- | --- |
| Test summary, zero failed, zero skipped | `docs/evidence/test-summary.txt` | verification lane | Planned |
| Coverage report | `docs/evidence/coverage.txt` | verification lane | Planned |
| Security headers | `docs/evidence/headers.txt` | backend lane | Planned |
| Load test p95 | `docs/evidence/load.txt` | verification lane | Planned |
| Viewport screenshots | `docs/evidence/viewport/radius-*.png` | design lane | Built |
| axe results | `docs/evidence/axe/` | verification lane | Planned |
| Deployment health | `docs/evidence/health.json` | backend lane | Planned |
| Public URL smoke test | `docs/evidence/smoke.md` | presenter 3 | Planned |
| GitHub issue and PR links | `README.md` section 6 | evidence lane | Planned |
| Critique notes | `docs/evidence/critique.md` | all members | Planned |

## 11. Gaps, cuts, and decisions
| Item | Decision | Reason | Follow-up |
| --- | --- | --- | --- |
| MySQL vs SQLite | SQLite, documented | No MySQL on the demo machine; one process is enough | Keep SQL portable; explain the trade-off in Q&A |
| FR-10 admin console | Keep as Must, minimal scope | The office head is a named stakeholder; open/close is enough for Round 1 | No analytics or per-day schedule editor |
| FR-12 filters | Keep as Should | Useful for staff, not on the critical demo path | Build after P11 if time remains |
| Load test NFR-01 | Must run before claiming | A p95 claim without a run is not evidence | Record the real number even if it misses; tune indexes and pragmas |
| Retention script | Must exist, may run manually | Privacy requirement is real, a cron job is out of scope | Add a documented daily command |
| Queue and action flows | Built, tested | Join, leave, call, start, serve, no-show, recall, display, and admin windows are implemented; 264 tests pass including staff, display, tunnel, policy, admin, auth, verification, reset, and expiry suites; the call-sound choice persists across reloads; My Queue actions use short labels with icons; the estimated wait includes the ticket at the desk; filters (FR-12) remain open | Extend I35 filter coverage if Round 1 time remains |
| Join policy, rules, and privacy pages | Built, tested | Window cutoff, two-ticket cap, 60-second cooldown, no-show block, role-aware sign-in, and the rules and privacy pages are implemented and covered by I45 to I49; both policy pages share a 34rem reading column, a sticky On this page rail at 1024 px, and heading ids for deep links; anonymous reads of `/`, `/rules`, `/policy`, `/display`, and `/api/display` mint no session | Rehearse the demo with `QUEUE_ENFORCE_HOURS` if the slot is outside office hours |
| Staff account management | Built, tested | Office head creates, edits, resets, deactivates, and reactivates staff accounts at `/admin/staff`; deactivation blocks sign-in and kills the live session; I50 covers the failure cases | No hard delete by design; add invite email only if Round 2 needs it |
| Remember me and password reset | Built, tested | Checked remember sets a 30-day cookie and matching `sessions.expires_at`; unchecked keeps the 8h fallback; passwords require 8+ characters with a letter and digit, enforced on register, reset, staff reset, and the browser check; Pwned Passwords checks fail open; reset is self-serve by 8-digit email code for all roles, returns the same sent page for known and unknown addresses, stores only a bcrypt hash, and increments `session_version` to kill old sessions; covered by `auth.test.js`, `reset.test.js`, `admin-staff.test.js`, and `password-safety.test.js` | Keep `SESSION_REMEMBER_MAX_AGE_MS`, `PASSWORD_LEAK_CHECK`, and OTP settings in `.env.example`; real Brevo delivery remains a deployment check |
| Window status, public origin, asset cache, and headers | Built, tested | The visible window state is derived from the weekday and Asia/Manila schedule without the 30-minute join cutoff, so a manual `is_open` flag cannot keep a window green after `closes_at`; the sitemap, robots file, canonical, and social tags use the request origin or `PUBLIC_BASE_URL` instead of the localhost fallback; static assets are content-versioned with immutable caching and the desk seal has 64 and 128 px sources; Permissions-Policy and a two-year HSTS header are live; I52, I53, I55 cover the behavior and the full suite is 264 tests | Re-run the live after-hours smoke test after deploy, then record the header capture and sitemap output in `docs/evidence/` |
| Stale ticket expiry | Built, tested | Waiting, called, and serving tickets from an earlier Manila date expire at startup, on the first request of a new day, or by `node scripts/db.js expire`; each expiry writes a system audit row, direct reads show Expired, and transitions reject; migration 004 preserves ids, sequence, and indexes; I56 covers the sweep, dry-run, idempotency, request sweep, and migration | Keep history; no automatic deletion |
## 12. Sign-off
| Role | Name | Confirms | Date |
| --- | --- | --- | --- |
| Requirements owner | Member A | FR and NFR match the build | |
| Backend owner | Member B | Auth, queue, staff, audit tests pass | |
| UI and evidence owner | Member C | Responsive, accessibility, demo evidence | |
| Whole team | A, B, C | No open S1 or S2 defect; demo rehearsed twice | |

A row is signed only after the evidence path exists. The final gate is `05-test-plan.md` section 8 plus a successful public URL smoke test. If a row is not signed, say so in the showcase instead of claiming coverage.
