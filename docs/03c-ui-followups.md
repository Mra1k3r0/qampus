# 03c UI Follow-ups

Status: open. Do not change the landing layout without a fresh visual review at 1440 and 1920.

## Current landing state

- Hero is one column below 1024px. The live strip ("Today at the office") sits inline below the call to action.
- From 1024px up, the hero is a 7/5 grid. The live strip is the right column, aligned with the top of the hero content.
- Type scale and section rhythm are back to the original values: display type maxes at 4.5rem and section rhythm at 96px.
- A compact pass (smaller type, 64px rhythm, tighter cards) was rejected. It made sections feel cramped and lost the intended vertical rhythm.

## Open issue

The desktop home still needs a final pass. Check the hero, service section, steps, closing band, and footer at 1440 by 900 and 1920 by 1010. Confirm section heights look intentional and the page does not feel sparse on the right side of the hero.

## Decisions to keep

- Below 1024px, the live strip stays inline below the hero actions.
- From 1024px up, the existing live strip is the right hero column. It is not a separate floating card.
- Keep one h1 and a left-aligned editorial hero.
- Section rhythm stays at the documented scale unless the team explicitly approves a global density change.
- No ad hoc density edits per page. Change tokens only when the whole system moves together.

## Approved radius decision

- Approved 20 October 2026: 4 px controls, 8 px isolated panels, 0 structural surfaces, 999 px status pills.
- `--radius-sm` is a temporary alias for `--radius-control`; it has no remaining uses and can be retired in the next pass.
- The live strip uses a 1 px full border and an inset 4 px signal marker so the accent follows the 8 px corner.
- Tables, queue rows, service grids, full-bleed bands, and the board overlay stay square.
- No shadows, gradients, or new colors were added.

## Related work landed in the same pass

- Queue and staff routes now read seeded tickets and services instead of hardcoded empty arrays.
- Staff login lands on `/staff/queue`; student login lands on `/queue`.
- Staff table uses per-service positions, estimated wait, and a status pill.
- Student dashboard shows ticket position, estimated wait, and status.

## Mobile landing and menu

- Below 768px, the hero, service section, and steps fill the viewport with `100svh`. They use safe centering and 48px block padding, so content taller than the viewport grows instead of overlapping the section above.
- From 768px up, the steps section also fills the viewport, subtracting the header height. It centers its content and drops the section gap, so the previous section is not visible when the section is aligned. The service section keeps the normal 96px rhythm.
- Direct links to `#how-it-works` use the header height as the top offset, so the full-height section starts under the header instead of showing the extra 24px of the section above.
- The closing band is content-sized. It is not full height and its copy is not centered. It uses 32px block padding and sits flush against the footer, with no page padding below it.
- Long descriptions use justified text from 360px up: hero lede, section ledes, and empty-state copy. Service-card blurbs and step text stay left aligned because their narrow columns create rivers and one-word lines when justified. Below 360px all body copy stays left aligned.
- Days and hours are separate blocks everywhere: hero strip, drawer note, and footer. The hours never render inline after the days.
- The menu is a full-height right drawer over a dimmed overlay. The close button sits in the burger slot, and the CSPC seal plus a named office note fill the panel.
- Open and close use a short slide and fade. Reduced motion closes immediately. Focus returns to the menu button, and the page does not scroll while the drawer is open.
- Verified at 320 by 568 and 390 by 844: no horizontal scroll, close button aligned to the burger, note visible at the panel foot.

## Round 1 flows now implemented

Join, leave, call next, start, serve, no-show, recall, public display, and admin service windows are built and covered by integration tests (`queue`, `staff`, `display`, `admin` suites). The staff console reads live tickets and drives every transition; the student dashboard joins, tracks, and leaves; the board polls `/api/display` every 5 seconds. Filters (FR-12) are the only queue feature still read-only.

## Latest design pass

- The closing band has exactly one role-aware CTA (Create an account / Go to my queue / Open staff queue). All "see the live display" links were removed from home and footer.
- The login page has three demo quick-fill buttons (Student, Staff, Office head) that fill the email and password fields and focus the password. They never auto-submit.
- The error summary no longer paints a focus outline on programmatic focus; the danger rule and role="alert" carry the emphasis.
- The active ticket panel uses an inset box-shadow marker instead of a border-left so grid alignment is unaffected; the live card adds 16 px inline padding so the gold marker clears the text.
- Hero content staggers in at 70/140/210 ms; called and serving pill dots soft-pulse at 2.4 s. Reduced motion covers all of it.
- Dashboard, staff, and ticket pages had redundant "live" notes trimmed; the dashboard lede is one line.
- Login keeps the "Keep me signed in" checkbox and the "Forgot password?" link on one wrapping row; the row splits below 390px.
- `/forgot-password` is self-serve: one email field, a generic sent page, an 8-digit code, and a new-password form; all four screens use the narrow `auth--single` column with no card or steps.

## Verify before closing

1. Open `/` at 1440 by 900 and 1920 by 1010.
2. Open `/queue` as `student1@my.cspc.edu.ph`.
3. Open `/staff/queue` as `staff@my.cspc.edu.ph`.
4. Check 320, 390, and 768 widths for stacking and no horizontal scroll.

## Auth chrome and guest nav

- Login and register render no site header bar and no footer. The seal, Qampus wordmark, and CCIT Service Desk line sit at the top left of the page, aligned with the form's page margin.
- Guest nav: "Sign in" is text only, no icon. "Get started" is the primary blue button with the arrow-right icon after the text, on desktop and in the drawer foot.
- The register and login forms carry no website field. Email acceptance is left to the schema and seed data.

## Footer and release surface

- The footer opens with the seal, the Qampus wordmark, and a short description, then office hours, location, and help. The base line reads `© 2026 qampus.dpdns.org`; the theme toggle sits in the same block, and Terms and Policy sit at the right edge. Five clicks on the toggle within two seconds reveals the midnight theme; the reveal holds for a moment so continued clicking does not undo it.
- Terms of Use live at `/rules`. The old `/policy` path returns a 301 to `/rules`, and the sitemap plus `llms.txt` point to `/rules`.
- The Privacy Policy is a standalone page at `/privacy`, linked from the register consent line and the footer.
- Discovery files are self-hosted: `robots.txt`, `sitemap.xml`, `llms.txt`, and `site.webmanifest`, with canonical, Open Graph, and JSON-LD tags in the layout head.

## Called-ticket alert

- Call sound starts off. The queue pages show an inline "Enable sound" prompt until the student enables it; the stored choice survives a reload, so the prompt does not return. After a reload, the first pointer or key press resumes the audio context without asking again.
- The in-page call banner uses the navy fill, a gold signal rule, and a bell icon, so a called ticket reads as an alert rather than a quiet note.
- The call dialog is a native `alertdialog` with a gold top rule, an 8 px panel radius, and a bell badge. It opens when the page loads with a called ticket, and again only when the call count rises. It does not reopen for the same count.
- Without JavaScript the banner still carries the call; the sound prompt and dialog stay hidden.

## Profile photo crop

- The upload button reads "Save photo". The field label stays "Upload a photo", and the hint explains that the photo is cropped to a square before saving.
- The photo panel shows a square preview of the saved photo on load. It swaps to the cropped photo after "Use photo", and the server-rendered photo fills it again after Save photo and reload.
- Choosing a PNG, JPEG, or WebP opens a native dialog with a 1:1 stage. Drag to reposition, use arrow keys to nudge, and set zoom from 1 to 3. Escape, Cancel, or a backdrop click close it; Cancel restores the previous selection.
- "Use photo" writes a 512 by 512 JPEG at quality 0.9 into the file input and updates the preview without submitting. "Save photo" still posts the form with the CSRF token.
- Without JavaScript the dialog stays closed, the picker posts the original file, and the preview shows the saved avatar.
- The 120 px round identity avatar and the preset grid are unchanged. Checked at 320, 390, 768, and 1440.
