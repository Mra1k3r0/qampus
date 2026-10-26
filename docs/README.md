# Student Queueing System: Project Pack

CSPC CCIT 106, Application Development and Emerging Technologies. Midterm project, Round 1. Team of three. Target: public deployment and a live showcase in Week 9.

Current state: planning and design documents are written and the lean feature-first tree is locked. P1 and P2 scaffold the design system and the walking skeleton. Read section 4 before starting code.

## 1. What the system does

A student signs in, joins the queue for an open campus office, and receives a short ticket code with a position and an estimated wait. Staff call the next ticket, start service, and mark the outcome. A public board shows the now-serving code without any student name, email, or student number. An office head can open or close a service and set its hours.

Round 1 offices: Registrar, Cashier, Scholarship, Library.

## 2. Stack and constraints

- Node.js 22, Express 4, EJS 3, SQLite through better-sqlite3.
- Server-rendered pages, progressive enhancement, no SPA build step.
- Custom CSS with a documented token set. No Bootstrap. No emoji. No em dash.
- Lucide icons, self-hosted fonts, MIT licence for the project code.
- Tests with Vitest and Supertest. Playwright is an optional viewport and axe check.

SQLite is a documented fallback for the course's MySQL default. The reason and the trade-off are in `02-architecture.md` section 13. This must be disclosed in the showcase.

## 3. Document map

| File | What it answers | Status |
| --- | --- | --- |
| `00-course-coverage.md` | Which course outcomes and rubric rows each artifact proves | Done |
| `01-requirements.md` | Who the users are, what the system must do, use cases, scope | Done |
| `02-architecture.md` | Stack, lean modules, schema, state machine, security, rejected options | Done |
| `02a-code-tree-full.md` | Full target tree and the migration path from the lean scaffold | Reference |
| `03-ui-design.md` | Visual direction, tokens, page intent, icon set, anti-slop rules | Done |
| `03b-responsive.md` | Layout contract from 320px to 3840px, touch, zoom, print | Done |
| `04-sdlc-plan.md` | Ranked phases, dependencies, parallel lanes, gates, risks, cuts | Done |
| `05-test-plan.md` | Unit, integration, manual, and failure drill matrices | Done |
| `06-git-and-ai.md` | Branching, commits, PR template, review, licence, AI log | Done |
| `07-demo-script.md` | Eight minute run of show, accounts, fallbacks, Q&A | Done |
| `08-deployment.md` | Hosting options, environment variables, local LAN, smoke test | Done |
| `08a-pterodactyl-tunnel.md` | Pterodactyl, Cloudflare Tunnel, health checks, troubleshooting | Done |
| `09-traceability.md` | Requirement to code to test to evidence matrix | Done as a plan |
| `README.md` | This index and the start-here path | Done |

## 4. Reading order

For a teammate starting code:

1. `04-sdlc-plan.md` sections 2 to 5. Know the phase order and your lane.
2. `02-architecture.md` sections 2 to 8. Know the module layout, schema, and request flow.
3. `01-requirements.md` sections 4 to 6. Know the requirement ids you are implementing.
4. `05-test-plan.md` sections 3 and 4. Know the test ids that must pass.
5. `03-ui-design.md` and `03b-responsive.md` before writing a template.

For the evaluator:

1. `01-requirements.md` for the problem and scope.
2. `02-architecture.md` for the design decisions.
3. `09-traceability.md` for coverage.
4. `06-git-and-ai.md` for the workflow evidence.
5. `07-demo-script.md` for the live path.

## 5. Phase summary

| Phase | Output | Gate |
| --- | --- | --- |
| P0 | Scope and docs | Docs agree on roles and scope |
| P1 | Design tokens and shell | Static shell works at 320 and 1440 |
| P2 | Walking skeleton | Migrations, seed, health, one test |
| P3 | Auth and access control | Role and CSRF checks pass |
| P4 | Queue core | Join, code, position, ETA, leave |
| P5 | Staff and display | Call, start, serve, no-show, recall, JSON |
| P6 | All UI pages | Every page usable at 320 to 3840 |
| P7 | Hardening | CSP, limits, 404, 500, authorization matrix |
| P8 | Verification | Release gate passes |
| P9 | Deployment | Public URL smoke test passes |
| P10 | Showcase pack | Demo runs twice without help |
| P11 | Admin console | Service open/close works |
| P12 | Playwright and axe | Optional viewport and accessibility proof |
| P13 | Pagination and filters | Optional staff scale check |

The critical path is P0, P1, P2, P3, P4, P5, P6, P7, P8, P9, P10. P11 is a Must for FR-10. P12 and P13 are cut first.

## 6. Planned commands

These commands do not exist until P2. They are the contract the scaffold must satisfy.

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run db:reset
npm run demo:reset
npm run demo:verify
npm start
npm test
npm run lint
npm run test:e2e
```

Environment variables are listed in `08-deployment.md`. The minimum set is `PORT`, `NODE_ENV`, `SESSION_SECRET`, `DATABASE_PATH`, and `TZ=Asia/Manila`.

## 7. Team placeholders

| Member | Primary lane | Files they must be able to explain |
| --- | --- | --- |
| Member A | Requirements, auth, evidence | `01-requirements.md`, `src/modules/auth/`, `src/core/security.js`, `src/core/session-store.js` |
| Member B | Queue and staff backend | `src/modules/tickets/`, `src/modules/queue/queue.routes.js`, `src/modules/staff/staff.routes.js` |
| Member C | UI, responsive, display | `views/`, `public/css/`, `public/js/poll.js`, `03-ui-design.md`, `03b-responsive.md` |

Replace names before submission. Contribution must be visible in the Git graph, not only in this table.

## 8. Non-negotiable decisions

- One active ticket per student per service per day, enforced by a partial unique index.
- Every POST is CSRF protected and every state change is audited.
- A student cannot read another student's ticket; a miss returns 404.
- Staff routes check the role on the server, not in the template.
- The display board contains no personal data.
- 303 redirect after a successful POST, so refresh does not duplicate a ticket.
- The demo database is seeded and resettable with one command.

## 9. Open items before code

| Item | Owner | Needed by |
| --- | --- | --- |
| Approve the phase order and the Must list | whole team | before P1 |
| Create the GitHub repository, issues, and branch protection | Member A | P2 |
| Confirm the hosting account and volume | Member B | P9 |
| Replace the three member names | whole team | P0 close |
| Decide whether P12 Playwright runs | Member C | P8 |

## 10. Evidence and honesty

The documents describe a plan and a set of requirements. They are not proof that the application works. Proof is a passing command, a reviewed pull request, a screenshot, or a deployed URL, recorded in `09-traceability.md` section 10. If a requirement is not built, say so in the showcase and list it under future work. Do not present a planned feature as a working one.
