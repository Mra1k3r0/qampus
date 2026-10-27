# 01 Requirements: Student Queueing System (CSPC CCIT 106 Midterm)
**Team:** Member A, Member B, Member C (replace names). **Stack:** Node.js, Express 4, EJS 3, better-sqlite3 (SQLite documented fallback; course uses MySQL). **Version:** 1.0. **Date:** 2026-10-20. **Status:** Round 1 showcase.
## 1. Purpose, Scope, Definitions
Purpose: a web system for CSPC campus offices to issue queue tickets, show queue position and estimated wait, call the next student, and display a public now-serving board.
In scope for Round 1: local accounts and roles (student, service staff, office head), student join and status and leave, staff call and serve and no-show and recall and filter, office-head service windows, public display, audit log, accessibility, tests, and a public deployed URL.
Out of scope for Round 1: every channel and process listed in section 9.
Definitions: **Ticket** one student's place in one service queue for one service day. **Active ticket** a ticket in waiting, called, or serving state. **Ticket code** a short code with service prefix and daily sequence, for example R-014. **Service window** the configured days and times when a service accepts and serves tickets. **Now serving** the ticket currently called or serving at a counter. **ETA** estimated clock time derived from position and recent average service duration.
## 2. Stakeholder Register
| Stakeholder | Interest | Influence | Needs |
|---|---|---|---|
| Student | High | Low | Fast join, clear ticket code, position, ETA, and a leave option |
| Service staff | High | Medium | Call, start, serve, no-show, recall, and filter the queue without paper |
| Office head | Medium | High | Set service windows, see throughput, and review staff actions |
| IT office | Medium | High | Reproducible deploy, health check, safe defaults, and a support path |
| Data protection officer | Low | High | Lawful data use, minimisation, retention limits, and access control |
| Student with disability | High | Medium | Keyboard, screen reader, contrast, reduced motion, and visual calls |
## 3. Current Process and Pain Points (observation notes)
- At Registrar, two paper lines form, one for inquiries and one for document claiming, and no sign explains the split.
- Students leave bags or paper on chairs to hold a place, and disputes follow when they return.
- Staff call given names, not codes, so students with similar names answer by mistake.
- No wait estimate is posted, so students ask the guard or peers whether to stay.
- When a window closes for a break, the line is not told or redirected.
- Scholarship and Library counters share a lobby, so students cannot tell which queue is which.
- No-shows are not recorded, so staff cannot tell who was called and who never arrived.
- A student with a hearing or mobility disability can miss a call and has no visual alternative.
## 4. Functional Requirements
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | A signed-in student joins an open service; the system allows one active ticket per service per day and rejects closed services. | Must |
| FR-02 | The system issues a human-readable ticket code with a service prefix and a zero-padded daily sequence, unique per service per day. | Must |
| FR-03 | The student ticket view shows position, counting waiting and called tickets ahead, and an ETA from the recent average service duration, refreshed at most every 10 seconds. | Must |
| FR-04 | A student leaves an owned waiting ticket before a call; a called or serving ticket cannot be left, and the action is logged. | Must |
| FR-05 | Staff calls the oldest waiting ticket for a chosen service and counter; the system atomically sets called, records staff and call time, and reports an empty queue. | Must |
| FR-06 | Staff starts a called ticket, which records serving status, counter, and start time. | Must |
| FR-07 | Staff marks a serving ticket served, which removes it from the active queue and records completion time. | Must |
| FR-08 | Staff marks a called ticket no-show, which records the outcome, frees the place, and lets the same student rejoin the same day. | Must |
| FR-09 | Staff recalls a called ticket, which increments a recall count, re-announces it on the public display, and records the event. | Should |
| FR-10 | An office head sets weekly service windows, opens or closes a service, and labels counters; a closed service rejects new joins but existing tickets continue. | Must |
| FR-11 | A public display shows each service's now-serving code, counter, waiting count, and last update, with no student name, email, or student number, and refreshes every 5 seconds. | Must |
| FR-12 | Staff filters the queue by service, status, and date; filters combine and persist for the session. | Should |
| FR-13 | A visitor registers a student account with full name, email, student number, and password; an 8-digit code sent to that email must be entered before sign-in; passwords are hashed with bcrypt; login and logout manage a server-side session. | Must |
| FR-14 | Server-side role checks limit student actions to owned tickets and staff actions to staff or admin; unauthorized requests are rejected and audited. | Must |
| FR-15 | Any account can request a password reset by email and set a new password with an 8-digit code; responses do not reveal whether an email is registered; all existing sessions end after the change. | Must |

FR-13 to FR-15 are foundational account controls. They are numbered after the queue requirements so the queue IDs stay stable across the requirements, UI, test, and traceability documents.
## 5. Non-Functional Requirements
| ID | Requirement | Proof technique |
|---|---|---|
| NFR-01 | The 95th percentile response for join, status, and staff actions stays under 2 seconds with 100 concurrent users, and the board payload stays under 50 KB. | Load test before showcase |
| NFR-02 | Passwords use bcrypt cost 12; verification and reset codes are 8 digits, expire in 10 minutes, allow 5 attempts, and are stored only as bcrypt hashes; session cookies are HttpOnly, SameSite=Lax, and Secure in production; state-changing forms use CSRF tokens; helmet headers are set; login, register, verify, resend, forgot, and reset have IP rate limits. | Security tests and header checks |
| NFR-03 | A first-time student completes join and reads position in under 60 seconds without help, and the system scores at least 70 on the System Usability Scale. | Moderated usability test with 5 participants |
| NFR-04 | The system meets WCAG 2.2 Level AA, verified with axe-core plus manual keyboard and screen-reader passes. | Named standard plus tool audit |
| NFR-05 | Collect only name, email, student number, role, and ticket events; no gender field in Round 1; personal queue records are deleted after 30 days and audit records after 90 days. | RA 10173, NPC guidance, data inventory |
| NFR-06 | Availability is 99.0 percent monthly during 08:00 to 17:00 Monday to Friday, with a health endpoint polled every 60 seconds and a graceful 503 when the database is busy. | Uptime monitor and drill |
| NFR-07 | Append-only audit rows cover login, role change, join, leave, call, recall, no-show, serve, and window changes, with actor, ISO 8601 time, ticket, service, and before/after state, and never passwords or tokens. | OWASP Logging Cheat Sheet review |
| NFR-08 | Support the latest two versions of Chrome, Edge, Firefox, and Safari plus a 360 pixel mobile viewport; older browsers may show a notice. | Manual browser matrix |

## 6. Use Cases
### UC-01 Join a Queue
**Actor:** Student. **Stakeholders:** Student, service staff, office head.
**Preconditions:** student signed in, service open and inside its window, no active ticket for that service that day.
**Trigger:** student selects Join queue. **Postcondition:** one waiting ticket, code and position and ETA shown, audit row written.
**Main success scenario:**
1. Student opens the service list with open services, waiting counts, and the next window.
2. Student selects Registrar and confirms the join.
3. System verifies the window and no duplicate, then creates a waiting ticket with the next daily code.
4. System shows the code, position, ETA, and leave action.
**Exception paths:**
- E1 Service closed or outside window: reject, show the next opening, write no ticket.
- E2 Active ticket already exists: show the existing ticket and write no duplicate.
- E3 Concurrent duplicate submit or database busy: create at most one ticket; retry or return the existing ticket with a clear message.

### UC-02 Call the Next Ticket
**Actor:** Service staff. **Stakeholders:** Student, service staff, office head, IT office.
**Preconditions:** staff signed in and assigned to a service, service open, counter selected.
**Trigger:** staff selects Call next. **Postcondition:** oldest waiting ticket is called, assigned to staff and counter, shown on the public board, and audited.
**Main success scenario:**
1. Staff opens the filtered service queue, chooses a counter, and presses Call next.
2. System locks the selection and picks the oldest waiting ticket.
3. System sets called, staff, counter, call time, and call count, then updates the staff view and public display.
4. Student status view changes to called and tells the student where to go.
**Exception paths:**
- E1 Queue is empty: no ticket changes, and staff sees an empty message.
- E2 Another staff member calls the same ticket first: one call succeeds, the other gets an already-called message and a refreshed queue.
- E3 Selected ticket left or service closed before the call: no call is made, the queue refreshes, and staff may retry.

### UC-03 Leave a Queue
**Actor:** Student. **Stakeholders:** Student, service staff, office head.
**Preconditions:** student signed in, student owns the ticket, ticket status is waiting.
**Trigger:** student selects Leave queue. **Postcondition:** ticket status is left, it leaves active counts, later positions are recalculated, and the action is audited.
**Main success scenario:**
1. Student opens the active ticket view with service, code, position, and the leave action.
2. Student selects Leave queue and sees a confirmation that explains the loss of place.
3. Student confirms.
4. System marks the ticket left, removes it from active counts, recalculates positions, and confirms.
**Exception paths:**
- E1 Ticket already called or serving: refuse the leave, keep the ticket active, and tell the student to approach staff.
- E2 Student does not own the ticket: return a generic forbidden response, change nothing, and record the attempt.
- E3 Staff calls the ticket during confirmation: the leave loses the race, the status stays called, and the student sees the call.

## 7. Accessibility and Inclusivity
- Every input has a persistent visible label; placeholders are never the only label.
- All actions are keyboard operable in a logical focus order, with a visible focus indicator of at least 3:1 and a skip link.
- Text contrast is at least 4.5:1 for body text and 3:1 for large text and controls, and no state relies on color alone.
- Errors appear as text, link to fields with aria-describedby, and move focus to an error summary.
- With prefers-reduced-motion: reduce, remove pulsing and sliding; announce position changes politely through aria-live and not on every poll.
- The name field accepts one full name of 2 to 100 Unicode letters, spaces, hyphens, apostrophes, and periods, and does not force first and last fields.
- Gender is not collected in Round 1 because no report uses it; if added later, it is optional, has no default, and includes Prefer not to say.
- The public display uses large high-contrast ticket codes and text states, never sound alone, and remains usable at 200 percent zoom.

## 8. Technology and API Inventory
| Component | Use | Licence |
|---|---|---|
| Express 4 | HTTP routing and middleware | MIT |
| EJS 3 | Server-rendered views | Apache-2.0 |
| better-sqlite3 | SQLite driver | MIT |
| express-session | Session handling | MIT |
| bcryptjs | Password hashing, cost at least 10 | MIT |
| zod | Input schema validation | MIT |
| helmet | Security headers | MIT |
| express-rate-limit | Login, register, verification, and reset rate limits | MIT |
| Vitest | Unit and integration test runner | MIT |
| Supertest | HTTP route tests | MIT |
| Lucide | Interface icons | ISC |
| Nodemailer | Ethereal mail in development only | MIT |
| Brevo HTTPS API | Verification and reset mail in production | Commercial free tier |
| System font stacks only (no webfonts) | Typography via local system fonts | SIL OFL 1.1 |
APIs: Brevo sends account mail in production; Nodemailer uses an Ethereal test inbox outside production; tests use an in-memory mailer. Internal endpoints are read-only JSON at GET /api/display and GET /health; all other interaction is HTML form posts.

## 9. Out of Scope / Won't List for Round 1
- Won't send queue notifications by SMS, email, or push; account verification and password reset are the only mail.
- Won't provide a native mobile app, kiosk, QR check-in, or printing.
- Won't process payments, document requests, appointments, or grades.
- Won't offer priority lanes, remote queues, or cross-office transfers.
- Won't integrate with CSPC SIS, HR, or an external identity provider; accounts stay local.
- Won't provide multi-node replication, 24/7 support, or non-SQLite databases.

## 10. AI-Use Disclosure
AI tools were used to draft, outline, review wording, and suggest test and risk ideas. The team checked every requirement against the assignment and course material, wrote the final content, and accepts full responsibility. No real student data, credentials, private URLs, or restricted material was entered into any AI tool. The running log is docs/06-git-and-ai.md section 9; each entry names the tool, scope, human edits, and verification.
