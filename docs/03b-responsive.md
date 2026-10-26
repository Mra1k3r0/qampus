# 03b Responsive Behavior Contract

Scope: every screen of Qampus must look deliberate at every width, not merely survive. This contract is testable: each rule names a breakpoint, a size, or a check. Visual truth: 03-ui-design.md. Base unit 4 px. No horizontal scroll at any width in section 1, including 200 percent zoom and 200 percent text spacing. All widths below are CSS px; supported range is 320 to 3840, and below 320 the page may reflow but is not tested. The header is 56 px below 768 and 64 px above, sticky, and never changes height on scroll.

## 1. Viewport contract

| Viewport | Context | Required behavior |
| --- | --- | --- |
| 320 | Smallest phone portrait, 200 percent zoom and text spacing target | Single column, 16 px margins, 288 px content, buttons full width, board code 56 px, no fixed element wider than 288 px |
| 360 | Android baseline portrait | Single column, 16 px margins, 328 px content, 20 px component padding, same stacking as 320 |
| 390 | iPhone 12 to 15 portrait | Single column, 20 px margins, 350 px content, join preview collapses to one summary line |
| 414 | Large phone portrait | Single column, 20 px margins, 374 px content, auth buttons side by side at 44 px |
| 480 | First breakpoint | Single column, 20 px margins, 440 px content, stats strip becomes 3 columns, section rhythm 48 px |
| 568x320 | Phone landscape | Header 48 px, single column, bottom action bar 56 px, board code 56 px minimum, vertical scroll only |
| 768 | Tablet portrait, breakpoint | 12 columns, 16 px gutter, 736 px content, auth and join forms cap at 420 px, queue table becomes a real table |
| 820 | iPad Air portrait | 12 columns, 788 px content, staff action bar moves from fixed bottom to top bar |
| 844x390 | Large phone landscape | As 568x320, header 48 px, board code 64 px minimum, next-up beside the tile only if each column stays 380 px or wider |
| 1024 | Tablet landscape and small laptop, breakpoint | 12 columns, 24 px gutter, 976 px content, staff right rail 280 px appears, landing 7/5 |
| 1280 | Laptop, breakpoint | Content max 1200 px, 24 px gutter, page margins 40 px, full 7-column queue table |
| 1440 | Desktop | Shell max 1440 px, header 64 px, page margins 64 px, board full bleed |
| 1920 | Projector 16:9 | Content 1200 px centred, board code at least 144 px, 3 m readability check applies |
| 2560 | Large monitor | Content 1200 px centred, board content max 1600 px, code capped at 208 px |
| 3840 | 4K signage | Content 1200 px centred, board tile 1600 px centred, code 208 px cap, board labels at least 32 px |

## 2. Fluid type and spacing

- Ticket numeral: clamp(3.5rem, 10vw, 9rem) at line height 0.86. Board code: clamp(3.5rem, min(13vw, 16vh), 13rem), floor 56 px, ceiling 208 px.
- Display: clamp(2.25rem, 5vw, 4.5rem). Auth h1 1.75rem below 480. Error numeral clamp(6rem, 30vw, 12rem) below 768, clamp(6rem, 18vw, 12rem) above.
- H2 clamp(1.5rem, 2.4vw, 2.125rem), body 1.0625rem at 1.6, meta 0.875rem, eyebrow 0.75rem. Inputs and selects never below 16 px, which prevents iOS focus zoom.
- Spacing: page margin clamp(20px, 5vw, 64px), section rhythm clamp(48px, 8vw, 96px), gutter 16 px below 768 and 24 px above, component padding clamp(16px, 2vw, 24px), stack gap clamp(12px, 1.5vw, 24px).
- vw units are used only above 768. Below 768 the px minimum wins inside every clamp, so 200 percent zoom cannot shrink text below 16 px body or 56 px board code.
- Measure: body 34rem maximum, about 60 characters; display 18ch; h2 24ch; table cell 28ch; hint 50ch. No paragraph spans the full 1200 px. Fixed widths are written min(320px, 100%), min(420px, 100%), min(480px, 100%); the only fixed width above 100 percent is 0.
- Long strings: email wraps anywhere with no ellipsis and may break after the at sign (64 characters fit 288 px in 3 lines); service names take 2 lines in a row then ellipsis, full text in the ticket h1 and open select; codes are 5 to 8 characters, nowrap, never truncated, 8ch reserved (269 px at 56 px mono).
- At 200 percent text spacing (line height 1.5, paragraph 2em, letter 0.12em, word 0.16em) labels wrap to at most 3 lines, controls grow in height, nothing clips.

## 3. Grid behavior per page

- Landing. Below 480: one column, order header, kicker, h1, primary, live strip, three numbered steps; strip stays after the hero actions. 480 to 767: same order, steps become 3 rows at 64 px. 768 to 1023: one column, strip stays inline below the hero actions. 1024+: 12 columns, headline 7, live strip 5, steps 3 columns of 4 between hairlines. Above the fold at 320: header, kicker, h1, primary; at 1440: header, kicker, h1, primary, strip.
- Auth (login and register). Brand mark at the top left with no header bar at every width. Below 768: form only, editorial panel hidden, h1 1.75rem, inputs full width, summary above the first field. 768+: 5/7 grid, form max 420 px, panel left. Above the fold at 320: h1 and first field.
- Dashboard. Below 480: one column, code 3.5rem on top, position and wait in 2 columns, joined time below, sticky bottom bar. 480 to 767: status band in 3 columns. 768+: band plus ticket panel 8/4. Above the fold at 320: code, position, wait, primary action.
- Join. Below 768: one column, preview collapses to a 48 px summary line directly above the button, select and button full width. 768 to 1023: form 7 columns, preview 5 columns below it. 1024+: 7/5 side by side, preview sticky at 96 px. Above the fold at 320: h1, service select, summary line, primary.
- Ticket detail. Below 480: code 3.5rem, meta stacks to 1 column, single action full width, no shadow, no raised edge. 480 to 767: meta 2 columns. 768+: 8/4 with help in the right column, panel max 720 px. Above the fold at 320: code, status, window, leave action.
- Staff console. Below 480: stats 1 column, filters wrap to 2 lines, rows stacked. 480 to 767: stats 3 columns, rows stacked, call next fixed bottom. 768 to 1023: real table, call next in a 56 px sticky top bar. 1024+: table full width, call next in the header. Above the fold at 320: call next bar, filter tabs, first 2 rows.
- Staff ticket detail. Below 768: facts stack, action bar fixed bottom, audit after facts. 768 to 1023: 7-column header, action top bar. 1024+: 8/4, action rail 280 px sticky at 96 px. Above the fold at 320: code, status, wait, primary action.
- Board. Below 768: tile full width, next 2 tickets stacked below, join URL hidden, clock 0.75rem. 768 to 1023: tile 100 percent width, next-up right column 240 px. 1024+: 72/28 split, next-up 4 rows, clock bottom right, content max 1600 px. Above the fold at 320: label, code, station, elapsed.
- Errors (404 and 500). Below 480: numeral 30vw, copy 1rem, actions stacked full width. 480 to 767: numeral 24vw. 768+: clamp(6rem, 18vw, 12rem), content max 480 px, left aligned. Above the fold at 320: numeral, one sentence, primary.

## 4. Table strategy

At 768 and above: real table, caption "Live queue", thead, one tr per ticket, th scope="row" on the ticket code. Columns Position 48, Ticket 120, Student min 160, Service min 160, Wait 96, Status 120, Action 88. At 768 to 1023 Position folds into the ticket cell and Action shrinks to 72 px, so the minimum is 560 px inside 736 px.

Below 768: no table element is exposed. Each row is an li inside an ol, holding a dl in this visual order:

1. dt "Ticket" and dd code plus status pill on one line, code first, pill aligned right.
2. dt "Student" and dd full name, 2 lines maximum.
3. dt "Service" and dd service, 2 lines maximum, full text in the detail page.
4. dt "Position" and dd position plus estimated wait on one line.
5. dt "Window" and dd window or "Not called".
6. dd action, a 44 px full-width link or button, no dt.

Row geometry: 96 px minimum, 16 px padding, 1 px rule bottom, 0 radius, no shadow; controls inside rows use 4 px. dt is 12 px mono uppercase, 96 px wide, dd is flexible with 8 px gap. Order is fixed and must not follow desktop column order. One partial, two renderings: the html element carries data-queue-view wide or compact, set before paint from matchMedia("(min-width: 768px)"). Only the active rendering is visible and in the accessibility tree; the inactive one carries hidden. Duplicate tab stops are forbidden.

## 5. Staff action bar

- 1024 and above: right rail 280 px, sticky at 96 px from the top, 24 px gap from the table, actions stacked with 12 px gaps, primary 48 px then secondary 44 px.
- 768 to 1023: top bar directly under the header, 64 px high, sticky at 56 px, primary right aligned, secondary left, full content width, no rail.
- Below 768: fixed bottom, 64 px content height plus env(safe-area-inset-bottom), primary 48 px full width, secondary 44 px, z-index above content, page padding-bottom calc(96px + env(safe-area-inset-bottom)).
- Destructive actions sit below a 1 px rule with 24 px clearance and always open a confirmation dialog, max 480 px wide, 90 vh tall with internal scroll.
- The bar never covers the last field or row: scroll-padding-bottom 96 px, 96 px page padding, and at 568x320 landscape it stays 56 px content height with the same 96 px padding. Loading keeps button width, sets aria-busy, and changes the label; no spinner replaces the label.

## 6. Display board

- Fills 100vw and 100vh on an ink ground, 1 px paper border at 18 percent, 0 radius, no images, no translucency.
- Tile padding clamp(24px, 4vw, 64px), rows in this order: label, code, station, elapsed, gap clamp(12px, 2vh, 32px).
- Code clamp(3.5rem, min(13vw, 16vh), 13rem): 56 px at 320, 144 px at 1920, 208 px cap at 2560 and above. nowrap, no ellipsis, 8ch reserved, line height 0.86, 4vw inner padding.
- Aspect: design to a 16:9 safe area with 4vw and 6vh insets; 4:3 and 21:9 reuse the same clamps with no stretching. At 3840x2160 the tile is 1600x900, centred.
- 3 m check: tallest glyph cap height at least 25 mm on the installed screen. 25 mm at 3 m subtends 0.48 degrees, above the 0.3 degree floor. At 1920x1080 on a 2.4 m wide screen, 144 px is about 180 mm and passes. Confirm with a ruler after projection.
- Next-up: 2 tickets below 768, 4 rows at 1024 and above, each code at least 40 px, never truncated.
- Clock and refresh label 12 px below 768 and 20 px above, bottom right, never over the code. Empty state reads "No ticket called yet" at 4rem with the next opening time, same tile geometry.
- No horizontal scroll at any size. Below 480 vertical scroll is allowed only if content exceeds 100 vh, and the code still sits within the first 80 vh. The code slot accepts at most 8 characters; longer prefixes are rejected at configuration, not clipped at runtime.

## 7. Forms

- Inputs are 100 percent of their column, max min(420px, 100%) on auth and 34rem elsewhere, min-width 0; textarea max 34rem, min height 96 px. Labels sit above, wrap, never truncate, 8 px gap, at most 3 lines at 320 with 200 percent spacing.
- Error summary at the top, full width, 4 px danger left border, 24 px padding, links in page order, focused on failure. Inline errors sit below the field, wrap, icon plus text.
- Buttons side by side above 480, stacked full width below 480 with 12 px gaps, primary first, 48 px high, 44 px minimum.
- Keyboard: the focused field stays above the keyboard on visual viewport resize; scroll-padding-top 80 px and bottom 96 px; no fixed-position input; the bottom bar never overlaps the field. Autofill keeps 48 px height, paper-raised fill, ink text; autocomplete is set on name, email, and new-password.
- Date and time use native controls, 48 px high, 16 px text, full width, no custom picker, timezone written as PHT in the label.
- Select is native, full width, 48 px, min-width 0. The closed control truncates a long service name with an ellipsis; the open menu shows the full option; 20 options then scroll.
- Textarea has a 200 character hard limit stated in the label, a 12 px mono counter bottom right, warning at 20 remaining, 8 visible lines at 320.
- Every control keeps its visible label at 320 and 200 percent zoom; placeholder-only labels are forbidden at every width.

## 8. Images, icons, and SVG

- img, svg, and video: max-width 100 percent, height auto, display block. Every img has width and height attributes or an aspect ratio so cumulative layout shift is 0. No raster art is used; the only images are the favicon at 32 px and the print mark at 48 px.
- Lucide inline SVG at 16, 20, or 24 px, stroke 2, currentColor, flex-shrink 0, vertical-align -0.125em; never scaled with transform. Icon plus label keeps an 8 px gap and wraps as one unit below 360; icon-only is allowed only for pagination arrows with accessible names.
- Icons never change button height: 48 px button, 16 px icon, line height 1. An icon in a 44 px target is 20 px.

## 9. Touch and pointer

- Targets 44x44 px minimum, 48 px for primary, 8 px minimum gap. Desktop rows 64 px, stacked rows 96 px; targets in the fixed bar keep 16 px side insets.
- Hover styles only inside (hover: hover) and (pointer: fine). Touch gets active state only: colour darkens one step, control moves down 1 px.
- focus-visible is a 3 px calm ring at 2 px offset, 3 px paper on ink, never removed. Focus order matches visual order at every breakpoint.
- touch-action: manipulation on buttons, links, tabs, and rows. Never user-scalable=no; body text keeps double-tap zoom. No task needs drag, swipe, long-press, or a hover reveal; every action is one tap.

## 10. Overflow and edge cases

- 320 px with 200 percent text spacing: every control grows, no text clips, no overlap, vertical scroll only. Recheck header, filters, and the stacked row.
- iOS safe areas: env(safe-area-inset-bottom) added to the bar and page padding; 44 px left and right insets respected in landscape. Android navigation bar: 48 px gesture or 3-button area reserved through env() and the 96 px page padding; no control sits under it.
- Landscape 568x320: header 48 px, bottom bar 56 px, 216 px content height; forms scroll, no horizontal scroll, board code 56 px, dialog max 90 vh with internal scroll.
- Split screen at 50/50 on a 768 px tablet: each pane is 384 px and follows the 360 to 390 rules. Browser zoom 200 percent at 1280 gives an effective 640 px and the 480 to 767 rules; no clipped table, no overlapping header.
- Print: ticket detail only, A4 portrait, 12 mm margins, code 96 pt, black on white; hide header, footer, actions, flash, skip link; keep the dashed divider and instruction; one page.
- Print queue table if requested: A4 landscape, 20 rows maximum, caption and headers repeat, no ink-heavy fills. Long content set: 64 character email, 60 character service, 200 character note, 8 character code, each tested at 320 with 200 percent spacing.

## 11. Responsive test matrix

| Viewport | Page | Expected result | Tool |
| --- | --- | --- | --- |
| 320x568 | Landing | No horizontal scroll, strip and h1 above the fold, primary full width | Playwright screenshot and scrollWidth assertion |
| 360x640 | Join | Select and button full width, preview one line above the button | Playwright screenshot |
| 390x844 | Dashboard | Code, position, wait visible before scroll, bottom bar clear of content | Playwright screenshot and bounding box check |
| 414x896 | Auth | Form first, summary above first field, 48 px controls | Playwright and axe |
| 480x800 | Ticket detail | Meta 2 columns, 3.5rem code, single action full width | Playwright screenshot |
| 568x320 | Staff console landscape | No horizontal scroll, stacked rows, 56 px bar, 96 px page padding | Playwright screenshot and scrollWidth assertion |
| 768x1024 | Staff console | Real table, 6 columns, call next in 56 px top bar | Playwright screenshot |
| 820x1180 | Staff detail | 7-column header, top bar, audit after facts | Playwright screenshot |
| 1024x768 | Board | 72/28 split, code uncropped, next-up 4 rows | Playwright screenshot and text bounding box |
| 1280x800 | Staff detail | Right rail 280 px at 96 px, table 7 columns | Playwright screenshot |
| 1440x900 | Landing | 7/5 grid, 1200 px content, 64 px margins | Playwright screenshot |
| 1920x1080 | Board | Code at least 144 px, 3 m check, no crop | Manual projector plus screenshot |
| 2560x1440 and 3840x2160 | Board | Content 1600 px max, code 208 px cap, tile 1600x900 centred, labels 32 px | Playwright screenshot and manual signage check |

Manual devices: iPhone SE 1st gen (320), iPhone 13 mini, Pixel 5, iPhone 14 Pro Max, iPad Mini, iPad Air, Galaxy Tab A8 landscape, 24 inch 1920 monitor at 3 m, 55 inch 4K signage at 3 m. Every Playwright check also asserts document.scrollWidth is less than or equal to window.innerWidth.

## 12. Definition of done

- [ ] Every viewport in section 1 loads with zero horizontal scroll (scrollWidth less than or equal to innerWidth).
- [ ] 320 px at 200 percent zoom and 200 percent text spacing shows no clipped label, control, or code.
- [ ] Landing, auth, dashboard, join, and ticket match the section 3 order at 320, 768, and 1024.
- [ ] Staff queue table stacks below 768 with visible dt labels and no sideways scroll.
- [ ] Staff action bar is a rail at 1024, a top bar at 768, and fixed bottom below 768 with 96 px page padding.
- [ ] Board code is uncropped at 320, 1920, and 3840 and passes the 3 m ruler check.
- [ ] Forms keep 16 px text, 48 px controls, stacked buttons below 480, and a focused error summary.
- [ ] All icons are 16, 20, or 24 px Lucide SVGs and cause zero layout shift.
- [ ] All targets are 44 px or larger with 8 px gaps, and hover exists only on hover-capable devices.
- [ ] Print stylesheet produces a one-page A4 ticket with a 96 pt code.
- [ ] The Playwright matrix in section 11 passes and screenshots are reviewed on phone, tablet, laptop, and projector.
- [ ] No emoji, no truncated ticket code, and no "acceptable on mobile" note anywhere.
