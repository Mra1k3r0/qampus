# Qampus: UI and UX Design Specification

Scope: the server-rendered screens of the CSPC queue, built with Express and EJS. Direction: a campus service desk, not a SaaS dashboard or a terminal. CSPC navy on warm paper, seal gold as the one accent, serif page titles, hard rules, oversized ticket numerals. No Bootstrap, no icon fonts, no emoji, no external fonts. Must read at 3 m and work at 320 px.

## 1. Design principles
- **The next action is always visible.** Every screen answers "what do I do now" in one primary control within the first viewport: join, show code, call next, or leave.
- **The ticket number is the hero.** Ticket code and position use the largest type on the page so a student can read them at arm's length and a projector can read them across a room.
- **Waiting is legible.** Show position, estimated wait, and last update time together; never replace a number with a spinner or "almost there".
- **Print logic, not dashboard logic.** Rules, columns, and margins organise the page; cards appear only where a physical ticket or board tile needs an edge.
- **One decision per screen.** Forms ask for the minimum, errors appear at the top and beside the field, and destructive actions sit apart from the primary path.

## 2. Design tokens

Source of truth: `public/css/tokens.css`. No new colour, radius, or motion value exists outside that file.

| Token | Hex | Use |
| --- | --- | --- |
| paper | #F7F4EC | Page background, print-like ground |
| paper-raised | #FDFBF4 | Inputs, ticket stock, hovered rows |
| ink | #172033 | Body text, emphatic rules |
| ink-muted | #5B6472 | Secondary copy, timestamps, helper text |
| rule | #DDD5C4 | Decorative hairlines and table dividers only |
| rule-strong | #8C8574 | Input and button borders, interactive boundaries |
| navy | #002A7A | Primary buttons, links, focus ring, board ground; navy-deep #001F5C for active states and deep board surfaces |
| gold | #B7791F | Accent hairlines, called status, board keyline; gold-ink #7A4E00 for gold text on paper |
| calm | #0B4A8F | Informational accents |
| success | #2F6B3E | Completed, open status |
| warning | #7A4E00 | Long wait, closing soon |
| danger | #A4261C | Errors, no-show, leave queue |
| board text | #F7F4EC / #CBD5E8 | Board numerals and labels on navy; secondary board text |

Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 px, exposed as clamps: page margin clamp(20px, 5vw, 64px), section rhythm clamp(48px, 8vw, 96px), component padding clamp(16px, 2vw, 24px). Radii: 0 on header, footer, bands, flash, error summary, tables, queue rows, ticket cards, service grids, and the board; 4 px on buttons, inputs, selects, icon buttons, and the skip link; 8 px on isolated panels, empty states, and the hero live strip; 999 px on status pills only. The live strip uses a 1 px full border and an inset 4 px navy marker that follows the 8 px corner. Shadows: none by default; one raised shadow (0 18 px 40 px, rgba(23, 32, 51, 0.1)) on the ticket detail panel only.

Focus ring: 3 px navy, 2 px offset from the control, on paper. On board surfaces, 3 px cream. Never remove the ring, never rely on colour alone. One exception: the error summary removes its own outline because it is focused programmatically on submit failure and must not look like a selected control; the danger rule and role="alert" carry the emphasis. Contrast, measured from the tokens: ink on paper 14.8:1; ink-muted 5.4:1; paper on navy 11.9:1; navy on paper 11.9:1; gold-ink 6.5:1; success 5.8:1; warning 6.5:1; danger 6.7:1; calm focus ring 8.0:1; board cream on navy 11.9:1; board bright on navy 9.4:1; rule-strong and gold on paper 3.3:1, non-text use only.

## 3. Typography

Three system stacks, no downloads, no CDN, no FOUT. Serif for page titles gives the desk its paperwork feel; sans carries the UI; mono is reserved for ticket codes and data that must not be misread.

| Role | Family and weight | Size / line height | Use |
| --- | --- | --- | --- |
| Ticket numeral | mono 700 | clamp(3.5rem, 10vw, 9rem) / 0.86, tracking -0.04em | Board, ticket detail, dashboard position |
| Page title | Georgia serif 400 | clamp(2.25rem, 1.4rem + 2.8vw, 3.75rem) / 1.0 | The one h1 per page |
| Display | Georgia serif 400 | clamp(2.75rem, 1.5rem + 4vw, 5.25rem) / 0.98, tracking -0.02em | Landing headline |
| Heading 2 | sans 600 | clamp(1.5rem, 2.2vw, 2.125rem) / 1.08 | Section titles |
| Heading 3 | sans 600 | 1.125rem / 1.3 | Card and panel titles |
| Body | sans 400 | 1.0625rem / 1.6, max 34rem measure | Paragraphs, descriptions |
| Small and meta | sans 400 | 0.875rem / 1.45 | Helper text, timestamps, table cells |
| Eyebrow and code | mono 600 | 0.8125rem / 1.2, uppercase, tracking 0.02em | Labels above data, ticket codes, board labels |
| Button and label | sans 600 | 0.9375rem / 1 | Buttons, form labels (labels 0.875rem) |

Font stacks live in tokens.css: body is Segoe UI and system fallbacks, display is Georgia with Times fallbacks, mono is Cascadia Mono with Consolas and monospace fallbacks. Rules: tabular numerals everywhere a number can change; no all-caps body copy; no weight below 400; no more than three type sizes visible in one panel.

## 4. Layout system

Content max width 1200 px; shell max 1440 px; board fills 100 vw and 100 vh. Page margin clamp(20px, 5vw, 64px). 12 columns, 24 px gutter desktop, 16 px mobile. Breakpoints: 480, 768, 1024, 1280. Build mobile first; test at 320, 375, 768, 1024, 1440, and projector 1920 by 1080.

Page shell order: skip link, header, main landmark, footer. Auth pages have no header bar and no footer: the brand mark sits at the top left above the form. One h1 per page. No sidebar that competes with the main task. Asymmetric grid: landing 7/5, login 5/7, join 7/5, ticket 8/4, staff console 12 with a three-column stats strip. Do not centre body content wider than 34rem.

Header: 64 px desktop, 56 px mobile, solid paper, 1 px rule below, sticky. Qampus wordmark; account and sign out at right. Mobile: wordmark plus one primary action; a text "Menu" control expands a full-width panel below the header with 44 px targets. Add 80 px scroll padding so the sticky header never covers a focused field. Mark the current page with aria-current and a 2 px ink underline, not colour alone.

Footer: 1 px rule above, 32 px vertical padding, four columns on desktop (brand and short description, office hours, location, help link); the brand spans the row at tablet and all columns stack on mobile. Base line carries the copyright and the time zone note. mono 0.75rem, muted ink. The help links stay in the same place on every page. Skip link: first tab stop, paper text on ink, 44 px high, appears at the top left on focus, jumps to main.

## 5. Component specs

Global states: default is the resting style; hover changes colour or border in 120 ms, never size; focus-visible always shows the ring; active darkens one step and may move 1 px down; disabled uses paper-raised plus muted ink and removes pointer events; loading keeps the control's width, sets aria-busy, and changes the label; error uses danger plus an icon plus text.

- **Buttons.** Primary navy with paper text, 48 px high (44 px minimum), 20 px side padding, 4 px radius, icon 16 px with 8 px gap. Hover navy-deep lighter step #00215F, active #001949. Secondary is transparent with a 1 px rule-strong border and ink text; hover fills paper-raised, active border ink. Quiet actions are underlined text with 3 px offset; destructive quiet actions use danger and sit 24 px apart. Loading example: "Taking ticket..." with a 2 px indeterminate bar under the label. Disabled: paper-raised with muted ink, no hover. Never icon-only except pagination arrows, which keep accessible names.
- **Inputs.** 48 px high, paper-raised, 1 px rule-strong, 4 px radius, 12 px horizontal padding. Visible label above with 8 px gap; hint 12 px below in muted ink. Hover border ink. Error: 2 px danger border plus CircleAlert and a 0.875rem message linked to the field; the focus ring stays calm. Disabled: muted text, paper fill, no border colour change. Autocomplete on name, email, and new-password.
- **Selects.** Native select, same 48 px shell and label. No custom dropdown and no icon font. Long service names truncate with an ellipsis only in the closed control; the open menu shows full text. Loading: disabled with "Loading services" until options arrive. Error and disabled match inputs.
- **Textareas.** Minimum 96 px high, vertical resize, 24 px padding, same border and focus treatment. Character counter in mono 0.75rem at the bottom right, muted until 20 characters remain, then warning. Hard limit stated in the label, not only in the counter. Error and disabled match inputs.
- **Error summary.** At the top of the form, paper-raised, 4 px danger left border, 24 px padding, CircleAlert and "There is a problem" as h2, then links to each field in page order. role="alert"; on submit failure, focus moves to the summary. The summary carries no focus outline, because programmatic focus on a large red box must not read as a selected control; the danger rule and the alert role carry the emphasis. Inline messages repeat the same wording. One summary per page.
- **Flash.** Full-width strip under the header, 4 px semantic left border, icon, message, and a text "Dismiss" button. role="status" for success, role="alert" for failure. No auto-dismiss; it clears on the next navigation. One flash at a time.
- **Status pill.** 28 px high, 1 px rule-strong border, 999 px radius, 6 px dot, mono 600 0.6875rem uppercase, tracking 0.08em, ink text. Waiting: muted dot. Called: gold dot with a slow 2.4 s soft pulse. Serving: navy dot with the same pulse. Completed: success dot. No-show: danger dot. The word always carries the meaning, never the dot alone.
- **Ticket card.** Paper-raised, 1 px rule-strong border, 0 radius, 24 px padding. Top row service and status; centre ticket code in mono 700 at clamp(2.5rem, 6vw, 4rem); bottom meta in two columns (issued, position, wait, window); dashed 1 px divider above the instruction "Show this code at the counter". Clickable cards change border to ink on hover and never lift. The detail page is the only place with the raised shadow.
- **Queue row.** 64 px high on desktop with columns position 48 px, ticket 120 px, student flexible, service flexible, wait 96 px, status 120 px, action 88 px. 1 px rule bottom, hover paper-raised, focus-within 2 px signal left bar. The row being served gets paper-raised plus a 2 px signal left bar. Mobile: two lines, code and status first, then name, service, and wait; action becomes a 44 px full-width button.
- **Now-serving tile.** Ink surface, paper text, 1 px paper border at 18% opacity, 32 px padding. Label in mono 0.75rem uppercase at 70% paper; code in signal-bright at clamp(4rem, 9vw, 9rem); station in paper at 1.25rem; elapsed in muted paper. On change, a 2 px signal-bright border appears for 600 ms. The tile is an aria-live polite region with a text label.
- **Empty state.** No illustration. A rule box with a large mono "0" or the relevant numeral, a 1.25rem heading, one sentence, and one primary action. Maximum 480 px wide, left aligned to the grid, 96 px vertical padding desktop and 40 px mobile.
- **Table.** Caption visible in mono 0.75rem uppercase. Header row mono 600 0.6875rem uppercase, 1 px ink bottom border; rows 56 px, 1 px rule, no zebra, hover paper-raised. Numbers right aligned with tabular figures. The table has a real caption and one row header per row. Below 768 px it becomes stacked rows, never a horizontally scrolling table. Loading: three 56 px paper-raised rows with muted bars and the caption "Loading queue". Error: one full-width row with CircleAlert and "Could not load the queue. Refresh."
- **Pagination.** 44 px square targets, mono numbers, 1 px rule separators. Current page: ink fill, paper text, aria-current="page". Previous and next use ChevronLeft and ChevronRight with visible text on desktop and accessible names on mobile. Disabled arrows are muted at 3:1 and not focusable.
- **Staff action bar.** Desktop right rail, sticky at 96 px from the top, 280 px wide, actions stacked with 12 px gaps. Mobile: fixed bottom, paper-raised, 1 px rule top, safe-area padding, primary full width, secondary 44 px. Add 96 px bottom padding to the page so the bar never covers the last field. Destructive actions sit below a rule with a confirmation step.

## 6. Page-by-page spec

- **1. Public landing.** Eye first: 7-column headline "Join the campus queue from your phone." with a mono kicker reading "CSPC STUDENT QUEUE / OPEN TODAY 08:00 to 17:00" above it and a live now-serving strip below. Primary: "Join the queue". The closing band carries exactly one role-aware action: Create an account for visitors, Go to my queue for signed-in students, Open staff queue for staff. There is no second "view the display" link anywhere on the page; the display is a destination, not a call to action. Empty (queue closed): the strip reads "Queue closed" with the next opening time and the primary becomes "See office hours". Desktop: 7/5 hero with the live strip in the right column. Mobile: strip stays after the primary action, headline at 2.25rem, the steps "01 Take a ticket", "02 Watch your place", "03 Show your code" stack, primary button full width. No three-card feature row; the steps sit between hairlines.
- **2. Now-serving board.** Eye first: current ticket code in signal-bright at 9rem on ink, with station and elapsed time. Primary: none; this is a public display. Bottom right shows the join URL in mono and "Refreshes every 5 seconds". Empty: "No ticket called yet" at 4rem with the next opening time, not a blank screen. Mobile: now-serving tile full width, next two tickets below, join URL hidden, clock at 0.75rem. Auto-refresh every 5 seconds, pause when the tab is hidden, announce changes once.
- **3. Student login and register.** Login eye: h1 "Student sign in" with the form on the right, 420 px wide. A role picker switches Student, Staff, and Office head; the left panel swaps its eyebrow, line, and note to match. Primary: "Sign in". Links: create account. Register fields: full name, student ID, email, password, confirm password, with the student ID hint taken from the ID card. Primary: "Create account". Empty: not applicable. Mobile: form only, editorial panel hidden, h1 1.75rem, inputs full width, error summary above the first field. No header bar on login or register; the seal, wordmark, and office line sit at the top left. Do not repeat the student ID on the next screen.
- **4. Student queue dashboard.** Eye first: active ticket code at 4rem with position and estimated wait in a three-column status band. Primary: "View ticket"; secondary: "Leave queue" after a confirmation. If serving, a signal band reads "It is your turn. Go to Window 2." Empty: "No active ticket" with a single "Join the queue" action and the office hours. Mobile: code and position above the fold, wait and joined time in two columns, sticky bottom bar with the primary action at 44 px.
- **5. Join queue form.** Eye first: the service select and the live wait estimate beside it. Primary: "Take a ticket". Fields: service, optional note (200 characters), accessibility assistance checkbox. The right rail previews service, estimated wait, and the ticket prefix before submission. Empty (no services open): replace the form with "The queue is closed" and office hours; no disabled form. Mobile: form first, preview collapses to one summary line above the button, select and button full width.
- **6. Ticket detail.** Eye first: ticket code at 6rem on paper-raised stock, with status and window. Primary: "Leave queue", the only ticket action, danger quiet with a confirmation dialog. The page reads like a printed ticket: service, issued, position, wait, and the instruction "Show this code at the counter. Staff will type it." An icon-only sound button above the sheet rings a two-chime alert when staff calls or recalls the ticket. Sound is on by default; the button shows a speaker with waves while on and a crossed speaker while off, saves the choice per browser, and stays hidden without JavaScript. A called ticket turns the in-page banner navy with a gold signal rule and a bell icon, and a native dialog with a gold rule, bell badge, ticket code, counter, and service opens on load or when the call count rises. It closes with Got it, Escape, or a backdrop click, and does not reopen for the same count. Empty: if completed or cancelled, the same panel becomes a receipt with "Completed at 14:32" and a "Join again" secondary. Mobile: code stays at 3.5rem, meta stacks, actions full width, no shadow.
- **7. Staff console.** Eye first: the live queue table and the "Call next" button in the header. Primary: "Call next". A three-column stats strip shows waiting, average wait, served today. Filters are text tabs (Waiting, Serving, All) with a 2 px underline, not pills. Empty: "Queue is clear" with the last served ticket and time, plus a refresh timestamp. Paginate at 20 rows. Mobile: rows stack, "Call next" becomes a fixed bottom bar, filters wrap to two lines, no horizontal scroll.
- **8. Staff ticket detail.** Eye first: ticket code, status, and waiting time in a 7-column header. Primary depends on state: "Start serving" for waiting, "Mark complete" for serving. Notes are read-only unless the staff member edits them. Audit trail lists time and action in mono. Empty: not applicable; show "Ticket not found" as a 404-style panel with a search field. Mobile: action bar fixed at the bottom, primary first, no-show below a rule, audit trail after the facts.
- **9. 404 and 500.** Eye first: the numeral 404 or 500 at clamp(6rem, 18vw, 12rem) in mono. Primary: "Back to home"; secondary "View the board". 500 adds a reference code in mono and the line "The queue is still running. Try again in a moment." Empty: not applicable. Mobile: numeral at 30vw, copy at 1rem, actions stack full width. No joke copy, no illustration, no emoji.
- **10. Profile settings.** Eye first: the 120 px round identity photo, name, and student number. The photo panel pairs a 104 px square preview with the file picker and the primary "Save photo"; the preview shows the saved photo on load and the cropped result before saving. Choosing a file opens a native dialog with a 1:1 stage, drag to reposition, arrow keys to nudge, a Zoom slider from 1 to 3, Cancel, and "Use photo". Use photo crops to a 512 by 512 JPEG and updates the preview without submitting; Save photo persists it. Presets stay in the 6-up grid, and Shuffle and Remove stay quiet actions. Without JavaScript the picker posts the original file. Mobile: preview and field stack, the dialog fits 320 px, and actions keep 44 px targets.

## 7. Motion

Durations: 120 ms for hover and focus colour, 180 ms for panel and row entrances, 240 ms for page-level reveals, 400 ms for board ticket changes. Easing: cubic-bezier(0.2, 0.7, 0.2, 1) for entrances, ease-out for exits. Page load: header appears first, then main content rises 8 px and fades in; on the landing hero the headline, lede, and actions stagger at 70, 140, and 210 ms with the live strip at 160 ms. Called and serving pill dots soft-pulse over 2.4 s so a live state reads as live without demanding attention. Nothing animates twice.

Board: old code fades out over 180 ms, new code fades in over 220 ms with a 2 px signal-bright border for 600 ms. No slide, no flip, no ticker scroll. Buttons: active state moves down 1 px; no bounce, no scale above 1, no ripple. Loading bar loops at 700 ms and stops on response.

Reduced motion: replace transforms with opacity only at 120 ms; stop the loading bar and show "Working..." text; board updates instantly with no flash; no auto-advancing content. Motion never delays an action.

## 8. Accessibility contract

WCAG 2.2 AA is the floor. Every page has one h1, sequential headings, header/main landmarks, and a working skip link; content pages add the footer landmark. Language is set to English (Philippines) on the document.

Forms: every control has a visible label, never a placeholder-only label; hints and errors are linked with aria-describedby; errors use text and icon, not colour alone; the summary receives focus on failure and links to each field; paste is allowed in password fields; no cognitive tests.

Keyboard: tab order follows visual order; skip link, header, main, footer; no traps. Dialogs move focus in, close on Escape, and return focus to the trigger. The sticky header never covers the focused control (2.4.11).

Live updates: queue position uses aria-live="polite" and updates at most once per change; the board announces "Now serving B-012 at Window 2" only when the ticket changes; "It is your turn" may use assertive once. Announcements never repeat the whole page.

Contrast and targets: body text at least 4.5:1, large text at least 3:1, control boundaries at least 3:1, focus indicator at least 3:1 against both the control and the page. Targets are 44 by 44 px where possible and never below 24 by 24 px (2.5.8); spacing keeps adjacent targets apart.

Status and state: every status has a word plus a dot; error fields have an icon plus a message; the current page and current filter use aria-current or aria-pressed. Do not use colour as the only signal anywhere.

Content: link text names its destination; buttons name the action; page titles are unique; the table has a caption and scoped headers. Do not ask for the student ID twice (3.3.7); keep the help link in the same place on every page (3.2.6).

Reflow and zoom: usable at 320 px and 200% zoom with no horizontal scroll; text spacing overrides do not clip labels; the board remains readable at 1920 by 1080 from 3 m. Test with keyboard only and with a screen reader on the queue update.

## 9. Icon inventory

Source: Lucide (ISC licence), copied as inline SVG from the official set at lucide.dev. Path data, stroke width, and viewBox come from Lucide; nothing is hand-drawn. Sizes 16, 20, or 24 px; stroke 2; currentColor; decorative icons are aria-hidden, meaningful ones have a title or adjacent text.

| Icon | Where it is used |
| --- | --- |
| Ticket | Ticket card label, join queue heading, ticket detail |
| Clock | Estimated wait, issued time, board elapsed time |
| Users | Queue length, staff console waiting stat |
| ArrowRight | Join queue primary button, row link, next step |
| Check | Success flash, completed state, confirmation |
| CircleAlert | Error summary, inline field errors, 500 page |
| LogIn | Student sign in |
| LogOut | Sign out in the header |
| Monitor | Now-serving board link and board empty state |
| RefreshCw | Board refresh label and manual refresh |
| ChevronLeft | Previous page in pagination |
| ChevronRight | Next page and forward links |

## 10. Anti-slop checklist

1. No purple or blue SaaS gradients, gradient meshes, or glowing blobs. Paper and ink only, with signal and calm as accents.
2. No glassmorphism, backdrop blur, or translucent floating cards. Surfaces are opaque; depth comes from rules and one shadow.
3. No rounded-card grid where every element floats. Radii are 0, 4, 8, or a pill; cards need a reason to exist.
4. No generic hero with three feature cards, stock illustration, or emoji. The landing uses a headline, a live strip, and three numbered steps.
5. No invented icons, icon fonts, or hand-drawn SVG. Lucide only, copied from the official set.
6. No placeholder-only labels, icon-only buttons without names, or colour-only status. Every control is named and every state is written.
7. No theme toggle, dark mode switch, or decorative animation. The only dark surface is the public board, and it is a deliberate signage choice.
8. No fake data, dead links, or "coming soon" in the demo. Every button either works or is absent.
