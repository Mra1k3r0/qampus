# 02a - Full feature-first code tree

Status: reference only. Round 1 scaffolds the lean tree in `02-architecture.md` section 2. This document keeps the fuller target structure for a later iteration when the project has more time, more tests, and more than one developer working in parallel.

## 1. When to use this tree

Use the full tree when at least two of these are true:

- The team has more than one backend developer working in parallel.
- A route file passes about 120 lines and needs a controller.
- A service passes about 250 lines and needs a policy or rule split.
- The test suite needs per-function files for coverage review.
- The project adds another actor, portal, or integration.

Do not start with this tree for Round 1. It creates files that only forward calls, which makes a small midterm harder to review.

## 2. Full tree

```text
projects/
├─ .github/
│  ├─ workflows/

│  │  └─ ci.yml
│  ├─ ISSUE_TEMPLATE/
│  │  ├─ feature.yml
│  │  └─ bug.yml
│  └─ pull_request_template.md
├─ docs/
│  ├─ 00-course-coverage.md
│  ├─ 01-requirements.md
│  ├─ 02-architecture.md
│  ├─ 02a-code-tree-full.md
│  ├─ 03-ui-design.md
│  ├─ 03b-responsive.md
│  ├─ 04-sdlc-plan.md
│  ├─ 05-test-plan.md
│  ├─ 06-git-and-ai.md
│  ├─ 07-demo-script.md
│  ├─ 08-deployment.md
│  ├─ 09-traceability.md
│  └─ README.md
├─ scripts/
│  ├─ db-migrate.js
│  ├─ db-seed.js
│  ├─ db-reset.js
│  ├─ demo-reset.js
│  ├─ demo-verify.js
│  ├─ load.js
│  └─ retention.js
├─ src/
│  ├─ app.js
│  ├─ server.js
│  ├─ routes.js
│  ├─ config/
│  │  ├─ env.js
│  │  └─ constants.js
│  ├─ core/
│  │  ├─ db/
│  │  │  ├─ connection.js
│  │  │  ├─ migrate.js
│  │  │  ├─ transaction.js
│  │  │  └─ schema.sql
│  │  ├─ http/
│  │  │  ├─ app-error.js
│  │  │  ├─ async-handler.js
│  │  │  ├─ not-found.js
│  │  │  └─ error-handler.js
│  │  ├─ logging/
│  │  │  └─ logger.js
│  │  ├─ security/
│  │  │  ├─ csrf.js
│  │  │  ├─ password.js
│  │  │  ├─ rate-limit.js
│  │  │  ├─ session-store.js
│  │  │  └─ helmet.js
│  │  ├─ validation/
│  │  │  └─ validate.js
│  │  ├─ audit/
│  │  │  └─ audit.js
│  │  └─ views/
│  │     ├─ context.js
│  │     └─ flash.js
│  ├─ middleware/
│  │  ├─ auth.js
│  │  ├─ locals.js
│  │  └─ request-id.js
│  ├─ shared/
│  │  ├─ time.js
│  │  └─ pagination.js
│  └─ modules/
│     ├─ auth/
│     │  ├─ auth.routes.js
│     │  ├─ auth.controller.js
│     │  ├─ auth.service.js
│     │  ├─ auth.repository.js
│     │  ├─ auth.schemas.js
│     │  └─ auth.policy.js
│     ├─ tickets/
│     │  ├─ tickets.routes.js
│     │  ├─ tickets.controller.js
│     │  ├─ tickets.service.js
│     │  ├─ tickets.repository.js
│     │  ├─ tickets.schemas.js
│     │  ├─ tickets.policy.js
│     │  ├─ ticket-code.js
│     │  ├─ ticket-status.js
│     │  ├─ queue-position.js
│     │  ├─ eta.js
│     │  └─ board.js
│     ├─ queue/
│     │  ├─ queue.routes.js
│     │  └─ queue.controller.js
│     ├─ staff/
│     │  ├─ staff.routes.js
│     │  ├─ staff.controller.js
│     │  └─ staff.service.js
│     ├─ display/
│     │  ├─ display.routes.js
│     │  ├─ display.controller.js
│     │  └─ display.service.js
│     ├─ admin/
│     │  ├─ admin.routes.js
│     │  ├─ admin.controller.js
│     │  ├─ admin.service.js
│     │  ├─ admin.repository.js
│     │  ├─ admin.schemas.js
│     │  └─ admin.policy.js
│     └─ audit/
│        ├─ audit.service.js
│        └─ audit.repository.js
├─ views/
│  ├─ layouts/
│  │  ├─ app.ejs
│  │  └─ board.ejs
│  ├─ partials/
│  │  ├─ head.ejs
│  │  ├─ nav.ejs
│  │  ├─ foot.ejs
│  │  ├─ flash.ejs
│  │  ├─ icon.ejs
│  │  ├─ field-error.ejs
│  │  └─ status-pill.ejs
│  ├─ auth/
│  │  ├─ login.ejs
│  │  └─ register.ejs
│  ├─ queue/
│  │  ├─ dashboard.ejs
│  │  ├─ service.ejs
│  │  ├─ ticket.ejs
│  │  └─ confirm-leave.ejs
│  ├─ staff/
│  │  ├─ console.ejs
│  │  ├─ ticket.ejs
│  │  └─ confirm-no-show.ejs
│  ├─ admin/
│  │  └─ services.ejs
│  ├─ display/
│  │  └─ board.ejs
│  └─ errors/
│     ├─ 404.ejs
│     └─ 500.ejs
├─ public/
│  ├─ css/
│  │  ├─ tokens.css
│  │  ├─ base.css
│  │  ├─ layout.css
│  │  ├─ components.css
│  │  ├─ pages.css
│  │  └─ print.css
│  ├─ js/
│  │  ├─ app.js
│  │  ├─ confirm.js
│  │  ├─ menu.js
│  │  ├─ poll-ticket.js
│  │  └─ poll-display.js
│  ├─ fonts/
│  │  └─ .gitkeep
│  └─ icons/
│     └─ lucide.json
├─ tests/
│  ├─ unit/
│  │  ├─ ticket-code.test.js
│  │  ├─ ticket-status.test.js
│  │  ├─ queue-position.test.js
│  │  ├─ eta.test.js
│  │  ├─ authz.test.js
│  │  ├─ schemas.test.js
│  │  ├─ password.test.js
│  │  ├─ csrf.test.js
│  │  └─ time.test.js
│  ├─ integration/
│  │  ├─ auth.test.js
│  │  ├─ queue.test.js
│  │  ├─ staff.test.js
│  │  ├─ display.test.js
│  │  ├─ admin.test.js
│  │  ├─ security.test.js
│  │  └─ drills.test.js
│  ├─ e2e/
│  │  ├─ viewport.spec.js
│  │  └─ axe.spec.js
│  ├─ helpers/
│  │  ├─ app.js
│  │  ├─ db.js
│  │  └─ csrf.js
│  └─ fixtures/
│     └─ seed.js
├─ data/
│  └─ .gitkeep
├─ .env.example
├─ .gitignore
├─ .nvmrc
├─ eslint.config.js
├─ package.json
├─ README.md
├─ LICENSE
├─ vitest.config.js
└─ playwright.config.js
```

## 3. Boundaries in the full tree

| Layer | Owns | Never does |
| --- | --- | --- |
| `*.routes.js` | URL, middleware chain, controller binding | SQL, business rules, HTML |
| `*.controller.js` | Request parsing, service call, render or redirect | SQL, transactions, business rules |
| `*.service.js` | Use cases, transactions, audit calls | `req`, `res`, HTML |
| `*.repository.js` | Parameterised SQL, row mapping | Permission decisions |
| `*.policy.js` | Role and ownership predicates | Database, Express |
| `*.schemas.js` | zod input contracts | Database |
| `core/` | Database, HTTP errors, logging, security, validation, audit, views | Import a feature module |
| `shared/` | Pure cross-feature helpers | Database, Express |

Dependency direction:

```text
routes -> controller -> service -> repository -> core/db
                          |
                 policy + schemas + audit
```

## 4. Migration path from the lean tree

Move one concern at a time, with tests green after each move:

1. Extract a controller when a route file passes about 120 lines.
2. Extract a policy when authorization rules are reused by two services.
3. Split `tickets.rules.js` into `ticket-code.js`, `ticket-status.js`, `queue-position.js`, and `eta.js` when the file passes about 200 lines.
4. Split `core/security.js` into `csrf.js`, `password.js`, `rate-limit.js`, `session-store.js`, and `helmet.js` when it passes about 200 lines.
5. Split CSS only when `main.css` passes about 600 lines.
6. Add Playwright and per-function unit files only when the demo is stable.

Do not move files without a failing test or a measured size problem. File count is not a goal by itself.
