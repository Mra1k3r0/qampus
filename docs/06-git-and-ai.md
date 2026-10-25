# Git Workflow and AI Use Disclosure
**Project:** Student Queueing System (Express, EJS, SQLite). **Team:** Member A, Member B, Member C. Replace names before submission.
## 1. Branching model
- `main` is protected: pull requests only, one approval, passing checks, resolved conversations.
- Use one short-lived branch per issue, keep it under three days, and delete it after merge.
- Name branches `<type>/<issue>-<slug>`, for example `feat/12-call-next` or `fix/18-duplicate-ticket`.
```text
main       ----o----------o----> protected, tagged demo
              \        /
short-lived    o--o--o  (one issue per branch)
```
## 2. Conventional commits
Format: `<type>(<scope>): <imperative summary>`. Use feat, fix, test, docs, refactor, or chore. Add `Refs #<issue>` in the footer.
```text
feat(db): create tickets table with status and timestamps
feat(queue): add student ticket creation form
feat(queue): show waiting count and estimated wait
feat(staff): add call-next action to queue dashboard
feat(auth): add session login for staff routes
fix(queue): prevent duplicate ticket for same student number
fix(auth): reject staff dashboard without a session
fix(ui): keep ticket list readable on narrow screens
test(queue): cover waiting, called, and served transitions
test(routes): reject blank names and invalid student numbers
docs(readme): document setup, demo accounts, and test command
docs(ai): disclose prompt scope and verification in PR
refactor(db): move ticket SQL into parameterized queries
chore(ci): run npm test on every pull request
fix(seed): reset queue data before the demo
```
## 3. Issue list (balanced at four each; replace A, B, C with names)
| Issue | Labels | Owner |
|---|---|---|
| Set up Express, EJS, and SQLite skeleton | setup, backend | A |
| Create tickets schema and seed script | database | A |
| Add ticket status flow: waiting, called, served | feature, backend | A |
| Reject duplicate and invalid student numbers | bug, backend | A |
| Build student ticket creation form with validation | feature, frontend | B |
| Show queue position and estimated wait | feature, frontend | B |
| Add accessible status messages and focus handling | a11y, frontend | B |
| Make student and staff views responsive | a11y, frontend | B |
| Build staff dashboard with call-next action | feature, frontend | C |
| Protect staff routes with session login | security, backend | C |
| Add route and model tests for queue transitions | test | C |
| Write README, demo script, and AI disclosure | docs | C |
## 4. Pull request template
```markdown
**What:** <linked issue and user-facing change>
**Why:** <problem and rubric value>
**How to test:** 1. Run `npm ci`, `npm run db:seed`, `npm test`. 2. <steps and expected result>
**Screenshots:** <before/after for UI changes, or "not applicable">
**Accessibility check:** [ ] Keyboard reachable; labels, focus, contrast, and status announcements checked
**Security check:** [ ] Inputs validated; SQL parameterized; no secrets or student data logged
**AI disclosure:** <tool/model, scope, files, human edits, verification, and no restricted data shared>
**Checklist:** [ ] Conventional title; linked issue; tests pass; docs updated; no secrets
```
## 5. Peer review checklist (copy one or more into the review)
1. Does this PR do one thing and link the issue it closes?
2. Are the branch name, commit titles, and scope conventional and clear?
3. Do the tests fail before the fix and pass after it?
4. Are SQL queries parameterized and all inputs validated server-side?
5. Are staff routes protected and session handling safe?
6. Are secrets, `.env` values, and real student data absent?
7. Can every control be reached and operated by keyboard?
8. Are labels, focus states, contrast, and status messages accessible?
9. Is the AI disclosure complete, and was generated code verified?
10. Do setup, seed, and demo instructions still work from a clean clone?
## 6. Merge order and conflict protocol
Merge database/schema first, then backend routes, then EJS views, then tests and docs. Update each branch from `main`, run `npm test`, get approval, and squash merge. Delete the branch.
```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch <branch>
git merge origin/main
npm test
git push origin <branch>
```
For a conflict, announce it, resolve the smallest change on the branch, test, and push. Never force push a shared branch. Use `git merge --abort` only to restart the merge.
```bash
git status
git add <resolved-files>
git commit -m "chore(merge): resolve main conflict in <scope>"
npm test
git push
```
## 7. Release and tag plan
Freeze `main` at T-30 minutes before the demo. Merge planned PRs, run tests, seed a clean database, and rehearse student, staff, and error flows.
```bash
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore(release): prepare v0.1.0 midterm demo"
git tag -a v0.1.0-midterm.1 -m "CCIT 106 midterm demo"
git push origin main --tags
gh release create v0.1.0-midterm.1 --title "Midterm demo" --generate-notes
```
## 8. MIT licence
1. On GitHub choose Add file > Create new file, name it `LICENSE`, select the MIT template, and set 2026 plus all three member names. Submit it through a docs branch and PR.
2. Keep the repository private if required, but state the licence explicitly in `package.json`.
```json
{
  "name": "student-queueing-system", "version": "0.1.0",
  "description": "CCIT 106 Student Queueing System",
  "license": "MIT", "author": "Member A, Member B, Member C",
  "repository": { "type": "git", "url": "https://github.com/<org>/<repo>.git" }
}
```
## 9. AI-use disclosure
Every AI-assisted commit includes trailers. Write `AI-Tool: none` when no AI was used.
```text
AI-Tool: <tool and model>
AI-Scope: <what was generated>
AI-Verified: <test plus manual check and reviewer>
```
The PR must name the tool/model, summarize the prompt and generated files, list human edits, state verification, and confirm no restricted data was shared. Never paste passwords, API keys, `.env` values, real student records, database dumps, private URLs, or another team's code without permission.
| Date | Task | Tool | What changed | Verified by |
|---|---|---|---|---|
| <date> | 01: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 02: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 03: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 04: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 05: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 06: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 07: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 08: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 09: <task> | <tool> | <files and human edits> | <member, check> |
| <date> | 10: <task> | <tool> | <files and human edits> | <member, check> |
## 10. Contribution evidence
Each member authors four issue-linked PRs with real commits and reviews two teammates' PRs; no self-approval. Do not pad with whitespace, bot commits, copied work, or last-minute reassignment.
- A: database and queue logic; four PRs; reviews B and C; demo evidence is the seeded database and status transitions.
- B: student flow and accessibility; four PRs; reviews A and C; demo evidence is ticket creation, queue position, and keyboard use.
- C: staff flow, tests, and docs; four PRs; reviews A and B; demo evidence is call-next, protected routes, and test output.
## 11. Pre-submission audit
```bash
git fetch --all --prune
git switch main
git pull --ff-only origin main
git status
git log --oneline --decorate --graph --all -30
git shortlog -sn --all
git branch -a
git tag -n
git diff --check
npm test
gh pr list --state all --limit 100
gh issue list --state all --limit 100
gh api repos/{owner}/{repo}/branches/main/protection
gh release list
gh repo view --json licenseInfo,description
```
