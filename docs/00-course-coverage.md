# CCIT 106 Course Coverage: Student Queueing System

Project: Student Queueing System. Team of three. Stack: Node.js, Express, EJS, SQLite.
Target: public deployment. Milestone: Round 1 showcase, Week 9.

## 1. Course Outcomes and Course Indicators

- CO1. Evaluate current and emerging application development technologies against the requirements of a chosen problem domain.
- CI1. Produce a technology review comparing candidate runtimes, frameworks, devices, and library APIs and justifying the selected stack.
- CO2. Apply industry-recognized standards, architectural patterns, coding conventions, version control workflows, and professional, legal, and ethical obligations.
- CI2. Maintain a repository with a defined branching model, reviewed pull requests, conventional commits, an explicit licence, and a written ethical, privacy, and AI-disclosure record.
- CO3. Analyze a real-world problem and its user needs to develop a software requirements specification with functional and non-functional requirements and use cases.
- CI3. Submit a requirements specification with stakeholder analysis, prioritized requirements, use cases with expected and exception paths, and a technology inventory.
- CO4. Design, implement, and evaluate a database-driven web application that satisfies its requirements under security, usability, and performance constraints.
- CI4. Deliver a working framework-based application with pages, forms, stored data, validated input, login and session handling, and safe error handling.
- CO5. Test, inspect, document, and deploy the application as a member of a development team.
- CI5. Contribute to a team deliverable with a passing test suite, source code inspection report, reproducible deployment, and technical and user documentation.

## 2. Weeks 1 to 8

| Week | Topic | Concept the project must demonstrate | Artifact that proves it |
| --- | --- | --- | --- |
| 1 | Orientation, VMGO, policies, environment setup | Node, npm, and Git are distinct tools; the toolchain is installed and verified before Week 5 | Environment Setup Checklist with version output and `node check.js` output |
| 2 | Application development and emerging technologies | Client and server exchange HTTP messages; queue reads use GET, queue changes use POST; status codes identify who is at fault | Technology Review covering the stack and rejected options |
| 3 | Professional, ethical, and legal considerations | Data minimisation for student data under RA 10173; an explicit licence; AI-generated work is disclosed | Ethics case analysis, LICENSE file, disclosure record |
| 4 | Requirements and user needs | Students, window staff, and office head are distinct stakeholders; functional and non-functional requirements are testable; use cases include exception paths | Requirements Document with stakeholder register, FR and NFR list, use cases |
| 5 | Node, npm, Express, routing, static files | Queue routes are separated; middleware runs in order; `public/` serves static assets; a 404 handler is registered after routes | Running server, route list, linked stylesheet from `public/` |
| 6 | Views, forms, database, CRUD | EJS renders queue data; form input is validated before storage; SQLite queries are parameterised; Post-Redirect-Get prevents duplicate tickets | CRUD screens, wireframes including empty and error states, create and status routes |
| 7 | Version control and collaborative development | One protected main; one short-lived branch per feature; pull requests reviewed before merge; conventional commits linked to issues | Team repository with branches, reviewed pull requests, issue links, commit history |
| 8 | AI-assisted and agentic software development | An agent receives a scoped task with a definition of done; the diff is reviewed and tested before merge; credentials never enter a prompt | AI-Assisted Development Log and `Assisted-by:` commit trailers |

## 3. Rubric I: Campus System, Round 1

| Criterion | Weight | Evidence to show |
| --- | --- | --- |
| GitHub Collaboration and Workflow (CO2) | 25% | Feature branches, pull requests with teammate review comments, conventional commit history traceable to issues, balanced contribution from all three members, LICENSE, disclosed AI use |
| Requirements and Fitness for the Assigned System (CO3) | 20% | Requirements Document naming real users and stakeholders, clear functional and non-functional requirements, usable use cases, and a build that matches them |
| Application Implementation (CO4) | 25% | Routing, EJS templates, forms, and stored SQLite data working together end to end for the main queue tasks; clear and consistent project structure |
| Basic Access Control and Data Handling (CO4) | 15% | Student and staff accounts, working login and sessions, role-restricted pages, server-side input checks before storage, no credentials or secrets in the repository |
| Round 1 Showcase, Critique, and Defense (CO1, CO5) | 15% | Clear live demonstration, specific evidence-based critique of the counterpart build, and every member explaining and defending their own contribution |

## 4. Showcase Evidence Checklist

- [ ] Public URL loads the queue application without a local server running.
- [ ] Student can join a queue and receives a ticket reference.
- [ ] Staff can call the next ticket and change ticket status.
- [ ] Refresh after a form submission does not create a duplicate ticket; address bar shows a GET.
- [ ] Login works for a student account and a staff account.
- [ ] A student cannot open a staff-only page by editing the URL.
- [ ] Empty queue, invalid input, and not-found pages render as designed.
- [ ] Wireframes include list, form, detail, empty state, and error state.
- [ ] Requirements Document is available and matches the demonstrated build.
- [ ] Repository shows branches, reviewed pull requests, conventional commits, and issue links.
- [ ] LICENSE file is present and AI use is disclosed in the README and commit history.
- [ ] Contribution from each of the three members is visible in the repository graph.
- [ ] Counterpart build has been examined and at least three specific critique points are written down.
- [ ] Each member can name the files they wrote and explain the logic without reading slides.

## 5. Twelve Concept Questions for the Presenter

1. What is the difference between Node.js and Express?
   Node.js is the runtime that executes JavaScript outside the browser. Express is a library installed into a Node project that handles routing, requests, responses, and middleware.

2. How do the client and server interact in this system?
   The browser sends an HTTP request to the Express server. The server queries SQLite, renders an EJS view, and returns HTML with a status code. They never share memory.

3. Why does a queue join use POST and not GET?
   GET is safe and must never change data; crawlers and prefetchers follow GET links. Creating a ticket changes state, so it is sent through a form as POST.

4. What does idempotent mean, and why does it matter here?
   Repeating the operation leaves the system in the same state. PUT and DELETE are idempotent; POST is not, which is why duplicate submissions must be handled.

5. What is Post-Redirect-Get and what problem does it solve?
   After a successful POST, the server redirects with 303 See Other to a GET route. Refresh then re-reads the queue instead of resubmitting the form and creating a duplicate ticket.

6. Why 303 rather than 302 or 307?
   303 instructs the browser to follow up with a GET. A 302 is usually treated that way but is not guaranteed; 307 repeats the POST, which is the opposite of what is needed.

7. What is the difference between 401 and 403?
   401 Unauthorized means the server does not know who you are; log in. 403 Forbidden means the server knows who you are and you still may not perform the action.

8. When do you return 404 and when do you return 500?
   404 when the requested record or route does not exist or is not yours. 500 when the server fails unexpectedly, such as an unhandled database error.

9. Why does middleware order matter in Express?
   Middleware runs top to bottom. Body parsing must precede routes that read form data; the 404 handler must follow all routes; the error handler with four parameters is registered last.

10. What is the difference between `<%= %>` and `<%- %>` in EJS?
    `<%= %>` escapes output and is the default for user data. `<%- %>` prints raw HTML and turns stored user input into a cross-site scripting risk.

11. Why are parameterised queries required for SQLite?
    They keep user input out of the SQL text, which prevents SQL injection. String concatenation lets a crafted ticket field change the query.

12. What must be disclosed when AI assists a commit, and what stays out of the prompt?
    The commit and documentation state that AI assisted, using an `Assisted-by:` trailer, and the author must still explain and defend the code. Passwords, `.env` contents, student personal data, and credentials never enter a prompt.
