# 07 Demo Script: Round 1 Showcase

Target: 8 minutes plus 2 minutes for questions. Three presenters. One laptop, one external display, one phone hotspot as network fallback.

## 1. Demo accounts

| Role | Email | Password | Used for |
| --- | --- | --- | --- |
| Student | `student1@my.cspc.edu.ph` | `QueueDemo2026!` | Live join and ticket tracking |
| Staff | `staff@my.cspc.edu.ph` | `QueueDemo2026!` | Call, start, serve |
| Admin | `admin@my.cspc.edu.ph` | `QueueDemo2026!` | Service windows and staff accounts, only if asked |

Passwords are demo-only, are not reused anywhere, and are rotated after the showcase. The seed script hashes them with bcrypt. No real student data is in the database.

## 2. Pre-demo checklist, T-30 minutes

1. Run `npm run demo:reset` and `npm run demo:verify`. Confirm 4 services, 6 demo students, 6 waiting tickets, and every demo account verified. Outside 08:00-17:00 Manila time, start the server with `QUEUE_ENFORCE_HOURS=false` or the join buttons will refuse.
2. Run `npm test`. Keep the passing output in a terminal tab. In development, account mail opens an Ethereal preview URL in the server log; keep that tab ready for the verification beat.
3. Open these tabs in order: `/display`, `/login` in a normal window, `/login` in a private window, `/policy`, the GitHub issue board, the latest merged PR, and the test output.
4. Set browser zoom to 100 percent. Hide the bookmarks bar. Close notifications.
5. Put the display window in full screen. Confirm the clock, the queue columns, and the footer are visible without scrolling.
6. Load the public URL once to wake the host. Then load the local fallback once.
7. Keep a folder of screenshots: display board, student ticket, staff console, mobile ticket, test summary, deployment health. These are the fallback if the network dies.
8. Confirm the phone hotspot is on and the laptop is charged.

## 3. Run of show

### 0:00 to 1:00, presenter 1: problem and scope

- "Enrolling, paying, and asking for records at the start of the semester means four lines and four different guesses about how long each line will take."
- "We built a queueing system for four offices: Registrar, Cashier, Scholarship, and Library."
- "A student joins from a phone, sees a ticket code and an honest estimate, and can leave the line without losing the day."
- "Staff see one queue per office, call the next student, and mark the outcome. The public board shows the same state."
- "The rules are visible at `/rules`: the join window closes 30 minutes before the office does, one ticket per service, at most two active tickets, and two no-shows blocks the rest of the day."
- State the boundary: "Round 1 is a working single-campus queue. We did not build appointments, SMS, or payments."

### 1:00 to 2:00, presenter 1: architecture in one slide

- "Express and EJS on Node 22, SQLite with WAL, server-rendered pages, one process."
- "Why SQLite: no separate database service, the file is easy to back up, and the queue fits one campus office. MySQL is the course default; we documented the fallback and kept the SQL portable."
- "The important part is not the stack. It is the transaction: join, call, start, serve. Each step is one transaction and one audit row."
- "A partial unique index makes a duplicate active ticket impossible, even if two requests arrive at the same time."

### 2:00 to 5:00, presenter 2: student flow

1. Open `/login` in the private window. Pick the Student portal, then sign in as `student1@my.cspc.edu.ph` with the demo password. "The portal only chooses the landing page; the server still checks the role against the account."
2. Point at the dashboard: "One active ticket, four offices, current wait, and the office hours."
3. Open Registrar. Point at the service status, average minutes, and the queue count. Press "Join queue".
4. On the ticket page, point at the code, position, estimated time, and status timeline. "This is a real row, not a mock."
5. Open the same ticket on the phone or at 390px width. "The same information, one column, the action bar within thumb reach."
6. Leave the ticket page open. Say: "We will come back when staff calls this ticket."
7. Optional: show the duplicate guard. Press join again in a second tab. "It returns the same active ticket instead of creating a second one."

Optional 40-second account beat, only if time allows:

- Open `/register`, create a test student, then open the Ethereal mail from the server log. "The account is unverified until this 8-digit code is entered; the code is hashed, expires in 10 minutes, and is stored as ciphertext in the outbox."
- Enter the code, land on sign-in, and say: "The account is verified now. An unverified account gets the same generic login error as a wrong password."
- Open `/forgot-password`. "Any address gets the same response, so the page cannot be used to ask who has an account. A reset ends every old session."

Do not read the page aloud. Point, say the one number that matters, move on.

### 5:00 to 7:00, presenter 3: staff flow and public display

1. Switch the external display to `/display`. Point at the four columns, the now-serving code, and the waiting count.
2. In the normal window, sign in as staff: pick the Staff portal, then use `staff@my.cspc.edu.ph`. Open the Registrar console.
3. Point at the queue table: code, student name masked, wait time, status, actions.
4. Press "Call next". The oldest waiting ticket becomes called. The board updates within 5 seconds.
5. Switch to the student ticket. It now says called, with the window. Say: "The student sees this without refreshing manually."
6. Back to staff. Press "Start serving", then "Mark served".
7. Switch to the student ticket. It says served, with the completion time. Say: "The row is closed, the audit log has three entries, and the student can join again tomorrow."
8. Point at the board again. The next ticket is now first in line.

If the board does not update, refresh once. If it still does not, say: "The API is the source of truth; the board polls it every five seconds." Show `/api/display` in a tab. Do not debug live.

### 7:00 to 9:00, presenter 1: evidence

- GitHub: show the issue board, one issue closed by a PR, the PR review comment, and the commit history with conventional prefixes.
- Tests: show the passing summary. Name three tests: duplicate join, role guard, call-next ordering.
- Security: "CSRF token on every POST, HttpOnly session cookie, bcrypt cost 12, 8-digit codes hashed at rest, encrypted mail payloads, parameterised SQL, rate limits on login and every auth POST, a CSP that allows only one hashed theme bootstrap, and a Permissions-Policy that keeps camera and microphone off while allowing the same-origin call chime."
- If asked about accounts: open `/admin/staff`. "The office head adds, edits, resets, and deactivates staff. Deactivation blocks sign-in and ends the live session; history stays."
- Deployment: show `/health` returning 200 and the public URL. "The database is on a mounted volume, so a redeploy does not wipe the queue."
- AI use: "We used AI for scaffolding, test ideas, and copy review. Every generated change was read, tested, and explained by the owner. The AI log lists the prompts and the review."
- Limitations: one campus, no queue notifications by SMS or email, SQLite instead of MySQL. "These are deliberate Round 1 cuts, listed in the README."

### 9:00 to 10:00, all: questions

Answer in this order: restate the question, give the decision, give the evidence, name the trade-off. If the answer is not known, say: "We do not have that number yet. We will check the audit log and follow up." Never invent a metric.

## 4. Likely questions and short answers

| Question | Answer |
| --- | --- |
| Why not MySQL? | Not installed on the demo machine; SQLite removes a service and a network hop; the schema and queries stay portable; we documented the trade-off. |
| What happens if two students join at once? | The join runs in an immediate transaction and a partial unique index blocks a second active ticket. The second request returns the existing ticket. |
| What if the server restarts? | Sessions and tickets are in SQLite on a volume. The queue survives. The display reconnects on the next poll. |
| Can a student call the next ticket? | No. Staff routes require the staff or admin role on the server. Hiding a button is not the control. |
| Can a student read another ticket? | No. The query includes `user_id`; a miss returns 404, not 403. |
| Is the ETA a promise? | No. It is an estimate from the active tickets ahead and the service average. The page says "about" and shows a range. |
| How do you prevent spam? | Login and join are rate limited. One active ticket per service, at most two active tickets across services, a 60-second cooldown between joins, a 30-minute join cutoff before closing, and two no-shows blocks the rest of the day. Staff can also mark a no-show. |
| Where is the audit log? | A table with actor, action, entity, before and after JSON, and request id. It is not exposed in Round 1. |
| What did AI do? | Scaffolding, test ideas, copy review, and documentation drafts. Each change was reviewed and tested by the owner. The log is in the repository. |
| What is next? | Appointments, queue notifications by SMS or email, multi-office scheduling, and a proper analytics view for the office head. |

## 5. Failure recovery

| Failure | Recovery |
| --- | --- |
| Public URL does not load | Use the local server on `http://localhost:3000`; the demo data is identical. |
| Campus Wi-Fi blocks the host | Switch to the phone hotspot, or stay local. |
| Railway cold start | Open the URL at T-30 and again at T-5. |
| Login fails | Check caps lock, use the seeded account, or run `npm run demo:reset` and restart. |
| Demo runs outside office hours | Restart with `QUEUE_ENFORCE_HOURS=false`, run `npm run demo:reset`, and say the hours gate is off for the demo only. |
| Display stale | Refresh once, then show `/api/display`. |
| A page looks broken | Switch to the prepared screenshot and keep talking. Fix after the demo. |
| Time is over | Skip "start serving" and "mark served"; show the ticket state and the audit table in the test output. |
| A teammate freezes | The next presenter asks a prepared question and takes over. |

## 6. After the demo

1. Rotate the demo passwords and delete the public demo database if it contains anything beyond seeded data.
2. Save the test output, screenshots, and the deployment health response to `docs/evidence/`.
3. Write the critique notes within 24 hours: what landed, what was confusing, what to change in Round 2.
4. Close the milestone and open Round 2 issues only after the critique.
