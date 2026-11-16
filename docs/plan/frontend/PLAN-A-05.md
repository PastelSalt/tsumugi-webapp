# PLAN-A-05 — Tsumugi Individual Workspace: UX Plan

## Plan status

**Status:** Started 2026-11-15. **Done:** W1 to W9, W11, W12, W13, W15, W16, W19 (see section 15). **Open and needing a person:** W10 (by hand), W17 (sessions and walkthroughs, see `docs/testing/ux-walkthrough-checklist.md`), W18. **Open and waiting on W17 results:** W14. The rest of this document is the plan as written.  
**Date:** 2026-11-15  
**Scope:** The experience of the web workspace: who it is for, what they do, how well the current build supports it, how we will find out, and what to change next. Visual tokens and hierarchy work (degrees A to C of the mobile alignment) are already done; this plan covers behaviour, keyboard and assistive-technology use, feedback, honesty about the demo, and testing.  
**Related:** [PLAN-A-04](PLAN-A-04.md) (structure and pages) · [RESEARCH.md](../../../RESEARCH.md) (why the earlier UI overwhelmed) · the mobile app's `tsumugi-mobile/docs/PLAN-UX.md` and `REFERENCE-WEB-ALIGNMENT.md` (the web follows the mobile plan where the platform allows)  
**Boundary (unchanged):** frontend-only demo. No accounts, sync, analytics, notifications, or storage that outlives the page. In-session changes live in memory and reset on reload. UX work must not add any of these.

## 0. Honest starting point

- The workspace has been used by **one developer**. Nobody else has tried it. Every statement about users below is an **assumption to test** (section 2), not a finding.
- What *is* measured: automated DOM audits at six widths (overflow, text size, contrast, names, target size) are clean after the 2026-11-15 fixes; lint and build pass.
- What the research in section 3 adds: the standards the workspace should be held to, and **eight places the build falls short or has not been checked** (section 4). Several are cheap and safe.
- What is not done: user sessions, a screen-reader walkthrough, a keyboard-only walkthrough, a dark-theme review, checks at 390 and 1536px.
- "Better" in this plan means "follows a documented rule" until sessions say otherwise.

## 1. UX goals

| # | Goal | How we will know |
|---|---|---|
| G1 | A first-time visitor from the landing page understands what Tsumugi is for and reaches a useful screen within a minute, unaided | Session tasks 1 and 2 (section 8) |
| G2 | The daily loop (see what is due, do it, tick it off, move it) takes a few seconds, with mouse or keyboard | Task 3 and 4 timings; keyboard-only run |
| G3 | The "why behind the work" idea (objective, requirement, task, file, change) is discoverable without the Help page | Task 6 |
| G4 | Nothing is lost by accident, and every in-session change can be undone | No data-loss comments; Undo used successfully, including with a screen reader |
| G5 | Everyone can use it: keyboard only, screen reader, zoom to 200%, reduced motion, speech input | Walkthroughs in section 8.3 pass; section 9 criteria met |
| G6 | The demo is honest: a person always knows what is real in the session and what is only a preview | No participant believes something was saved; no dead-end buttons |

## 2. Assumptions register

Status: **U** untested, **P** partly supported, **V** verified. Nothing is V yet. Many mirror the mobile plan's A-numbers, which have the same status.

| # | Assumption | If wrong | How to check | Status |
|---|---|---|---|---|
| W-A1 | Two audiences: solo makers (freelancers, students) and evaluators (clients, teachers, reviewers judging the demo) | Tasks and copy aim at the wrong person | 5 to 8 short interviews before large redesign | U |
| W-A2 | Evaluators decide in minutes and will not read Help | The landing page and Home carry the pitch | Task 1 and 2 think-aloud | U |
| W-A3 | Solo makers mostly use a laptop, and some use a keyboard heavily (palette, shortcuts) | Shortcut and palette work matters less than assumed | Interview; usage in sessions | U |
| W-A4 | People find the quick-add syntax (`#project`, day words, `!`) from the hint line or the chips | Quick add is slower than a form | Task 5 | U |
| W-A5 | Words like task, project, milestone are known; "requirement", "specs", "final file", "lens" need explaining | Vocabulary too heavy or over-explained | Task 6 and follow-up questions | U |
| W-A6 | A visible headline ("3 tasks need you") answers "what now" better than figure boxes | Evaluators prefer a dashboard of numbers | Test both on Home with a few people (mobile plan X4) | U |
| W-A7 | Real in-session actions with Undo are clearer than "Preview only" dialogs | People expect persistence and lose trust when it resets | Task 3 and 9 | U |
| W-A8 | The individual workspace should show no team concepts | Evaluators judge the product thin without collaboration | Ask about missing features | U |
| W-A9 | Keyboard shortcuts (`Q`, `Ctrl/Cmd+K`) are used by few people at first but valued by some | Wasted effort, or conflicts with assistive technology | Session observation; section 4 item S1 is a standards issue regardless | U |
| W-A10 | The mobile app's rules (colour for exceptions, two-line rows, one headline) transfer to wider screens | Wide layouts feel empty or too sparse | Look at 1280 and 1440px in sessions; compare with the earlier layout | P |
| W-A11 | A tablet (768 to 1023px) is better served by the phone layout than a rail | Wasted space, or one-handed use is irrelevant | Observe on a tablet | U |
| W-A12 | The WCAG 2.2 AA bar is the right reference for a student or portfolio demo | Over- or under-investing | Owner decision X6 | U |

## 3. Research: standards and basics

What was read, what it says, and what it means here. **Read at the source** means the page itself was read; everything else is from search summaries and must be checked against the W3C pages before quoting. Sources are in section 14.

### 3.1 Keyboard shortcuts and the single-key `Q`

- **WCAG 2.1.4 Character Key Shortcuts (Level A), summary:** a shortcut made of a single character with no modifier (letter, number, punctuation) must meet at least one of: it can be **turned off**, it can be **remapped** to include a non-character key, or it is **active only when its component has focus**. The reason is accidental activation, especially with speech input. Failure F99 describes having none of the three.
- **For us:** `Q` opens Quick add from anywhere (outside text fields) with **no setting to turn it off**. That is a likely Level A failure. The fix is small: a preference to turn it off (and a visible way to see and use the modified shortcut). This is a standards issue regardless of how many people use the shortcut.
- **Command palette (practitioner sources, not research):** one memorable activation shortcut, grouped results, **show matching shortcuts in the results**, an empty state, OS-aware labels (Ctrl or Cmd), and do not let the palette be the only route to an action. Many sources also suggest a searchable shortcut cheat sheet on `?`. We already have Ctrl/Cmd+K, grouped results and an empty state; our palette label shows "Ctrl K" on every OS.

### 3.2 Focus, sticky bars, and keyboard order

- **WCAG 2.2, 2.4.11 Focus Not Obscured (Minimum), AA, summary:** a focused component must not be **entirely hidden** by author-created content such as a sticky header or footer. W3C technique F110 describes the failure. AAA (2.4.12) asks that no part is hidden. Interpretation of the AA wording has open questions (see Roselli); read the official Understanding page.
- **For us:** the top bar is sticky (about 65px) and the phone bar is fixed at the bottom. The workspace sets **no `scroll-padding-top` or `scroll-padding-bottom`**, so a keyboard user tabbing down a long list can have the focused row sit under the bar. Only the Help headings have a `scroll-margin-top`.
- **Focus indicator:** the shared `:focus-visible` rule covers buttons and links; inputs, selects, summaries and the calendar day buttons should be checked individually.

### 3.3 Calendars and date grids

- **W3C APG date picker example, summary:** the calendar is built on the **grid pattern**; only **one grid button is in the Tab sequence** (roving tabindex), arrow keys move by day and week, Page Up and Page Down change month, Enter or Space selects; keyboard help is placed in a live region that is announced when focus enters the grid. The full arrow-key table was not in the search result; read the current APG page.
- **For us:** our Calendar view has about 35 day buttons, **all in the Tab order**, no grid roles, no arrow-key movement, and the month heading is a live region (good). A keyboard user presses Tab up to 35 times to cross a month.

### 3.4 Tabs versus navigation links

- **APG tabs pattern, summary:** real tabs use `tablist`, `tab`, `tabpanel`, a roving tabindex, and arrow keys. Several sources say that when items go to **separate URLs**, a navigation landmark with links is the better fit and needs no arrow-key behaviour. `aria-current` was not covered by the results.
- **For us:** the view switches (Today, Upcoming, Calendar, All; Overview, Work, Specs, Files, History) change a **query parameter on the same page** and are marked with `aria-current` on buttons inside a `nav`. They behave like tabs but are announced as buttons. Decision needed (X3): keep as navigation, or implement the tabs pattern.

### 3.5 Dialogs, sheets and panels

- Native `<dialog>` opened with `showModal()` (used for Quick add, the palette, New project, and Preview) is modal: the browser makes the rest of the page inert and returns focus on close; that is the right base.
- **For us:** the **detail panel** is an `<aside>` plus a scrim. Above 1280px it is a docked column (fine). Below 1280px it covers the page as a sheet but is **not modal**: it has Escape and returns focus, but background content stays reachable by Tab and is not hidden from screen readers. Decision needed (X4).

### 3.6 Undo, status messages and feedback

- **Undo over confirmation** is practitioner consensus (Nielsen's error-prevention heuristic): confirmations work only when rare; reversible actions need none. No controlled comparison was found.
- **Toasts with actions and WCAG 2.2.1 (Timing Adjustable):** argued both ways; critics say an auto-dismissing toast with an Undo action can fail because people cannot extend the time. The mobile plan settled on: stay at least 10 seconds, persist when a screen reader is on, always have a Dismiss button.
- **WCAG 4.1.3 Status Messages (AA):** announce results without moving focus (a live region). **For us:** Quick add already confirms in a live region; nothing else in the workspace announces a result because nothing else changes.

### 3.7 Onboarding, empty states and honesty

- NN/g (read via the mobile plan's summary): walkthrough tutorials are overused and often skipped; show help at the point of need, avoid stacked coach marks. Practitioner sources agree that empty states should invite one clear action; we found **no NN/g page on empty states or checklists in this search** and treat those claims as unverified.
- **For us:** one first-run checklist on an empty Home is right-sized. A tour would go against the research. A single, dismissible, replayable tip (as on mobile) is the maximum.

### 3.8 Response time, motion and reduced motion

- **Nielsen's three limits:** about 0.1 s feels instant, 1 s keeps the train of thought, 10 s is the limit of attention. Feedback to a click should start within 100 ms; transitions should end well under 400 ms.
- **Reduced motion (WCAG 2.3.3, AAA; good practice):** honour the preference by replacing movement with a short fade and keeping state changes visible. Degree B already does this in the workspace CSS; GSAP entrances are skipped in JS under the preference.

### 3.9 Targets, text and contrast (already applied)

WCAG 2.5.8 (24px minimum targets, AA), 1.4.4 (200% text), 1.4.10 (reflow at 320px), 1.4.11 (3:1 for control edges) are covered by the audits and tokens work. **Not yet checked:** 200% text zoom and 400% browser zoom walkthroughs by hand.

## 4. The current build checked against these standards

| # | Finding | Standard | Severity | Fix |
|---|---|---|---|---|
| S1 | `Q` opens Quick add with no way to turn it off or remap it | 2.1.4 (A) | High (Level A) | W1 |
| S2 | Sticky top bar and fixed phone bar can cover the focused element; no `scroll-padding` | 2.4.11 (AA) | Medium | W2 |
| S3 | Calendar day buttons are all tab stops; no grid roles or arrow keys | APG grid; usability | Medium | W9 |
| S4 | Detail panel below 1280px is not modal; background stays reachable | Dialog practice | Medium | W8 |
| S5 | Task status icon is decorative; the only way to change a task is a Preview-only dialog | G2, G4 | High for the product's main loop | W4 |
| S6 | View switches look like tabs but are announced as buttons | APG tabs | Low | W11 |
| S7 | No shortcut cheat sheet; palette shows no shortcuts and "Ctrl K" on every OS | Practitioner guidance | Low | W5 |
| S8 | Preview-only messages are generic ("isn't connected yet") | G6 | Medium | W6 |
| S9 | Insights shows 0 and 0% when there is no data | Honesty | Low | W7 |
| S10 | Focus ring checked only for buttons and links | 2.4.7, 1.4.11 | Low | W2 |
| S11 | 11 Preview-only buttons; none says what it would do in the real product | G6 | Medium | W6 |

Things that already meet the bar (by audit): text size floor 12px, contrast on every audited screen, names on controls, target size, no horizontal overflow at 320 to 1440px, native modal dialogs, live region on Quick add, a Skip link, reduced-motion swap.

## 5. Who it is for, journeys, and heuristic review

### 5.1 Assumed groups (see W-A1)

1. **Solo makers:** open Home each day, add tasks fast, glance at progress, occasionally check requirements and files.
2. **Evaluators:** arrive from the landing page, judge in minutes, click around, try the main actions.
3. **Keyboard and assistive-technology users:** must be able to do everything above without a pointer.

### 5.2 Principles for decisions

1. Recognition over recall: every action reachable by a visible control; shortcuts are accelerators only.
2. Act, then offer Undo. Confirm only before discarding typed text.
3. State what is real: in-session changes are labelled; previews say what the real product would do.
4. One focal point per screen; colour only for exceptions (already applied).
5. Everything reachable and operable with a keyboard, in a sensible order, with a visible focus.
6. Short, purposeful motion; never the only way a change is shown.

### 5.3 Key journeys and where the build stands

| Journey | Today | Gap |
|---|---|---|
| First visit: land, "Explore the demo", reach Home | Works; the headline states what needs attention | No one-line explanation of what the demo is on first arrival |
| See what is due today | Strong (headline, Today list, top-bar chips) | None known |
| Add a task fast | Good (Q, palette, inline add, chips) | Single-key shortcut issue (S1); syntax discoverability untested |
| Complete a task | **Cannot**: the status icon does nothing; Edit/Change status are previews | S5: the core loop is not testable |
| Move a task to tomorrow or change its date | **Cannot** | S5 |
| Plan the week in the Calendar | Reads well | Keyboard crossing of the grid (S3); cannot move a task between days |
| Check what is behind a requirement | Possible through the lens and chips | Vocabulary (W-A5); untested |
| Find a document and read it | Works | None known |
| Understand what is saved | Banner in Account; "Session only" tags; sample line in the menu | Not stated on first arrival (W6) |

### 5.4 Heuristic review (Nielsen)

Strengths: consistent vocabulary and patterns; recognition over recall in the palette; aesthetic and minimalist design after the hierarchy work. Weak points: **visibility of system status** (nothing confirms or undoes because nothing changes), **user control and freedom** (no Undo anywhere but Quick add has no remove), **error prevention** (n/a until actions exist), **help and documentation** (good guide, but reached only via the account menu; no contextual hints).

## 6. Backlog

Effort: **S** under a day, **M** a few days, **L** a week or more. **Gate:** *Now* = safe and independent of user research; *After R1* = wait for round 1 of sessions. Files named are where the change is likely to land.

| # | Item | Why | Effort | Gate | Likely files |
|---|---|---|---|---|---|
| **W1** | **Shortcut policy:** add Account preference "Keyboard shortcuts" (on by default, off turns `Q` off); keep Ctrl/Cmd+K (modifier shortcuts are exempt); show the shortcut and OS-correct label | S1 (Level A) | S | Now | `WorkspaceProvider.jsx`, `AccountPage.jsx`, `WorkspaceShell.jsx` |
| **W2** | **Focus visibility:** `scroll-padding-top` for the sticky top bar and `scroll-padding-bottom` for the phone bar; `:focus-visible` for inputs, selects, summaries and calendar days; verify with Tab on long lists | S2, S10 | S | Now | `workspace.css`, `base.css` |
| **W3** | Skip link also jumps past the rail and top bar to the page title; check `main` landmark label | Keyboard efficiency | S | Now | `WorkspaceShell.jsx` |
| **W4** | **In-place task actions with Undo** (session-only): complete or reopen from the status icon, change status, move to tomorrow, pick a date, mark blocked, set high priority; a toast with Undo (stays at least 10 s, persists with a screen reader, has Dismiss, 20 steps); the Task panel buttons do the same things | S5, G2, G4 | L | Now (decision X1) | `data/store.js`, `components/records.jsx`, new `Toast`, `TasksPage`, `HomePage` |
| **W5** | **Shortcuts help:** `?` opens a searchable cheat sheet; palette results show matching shortcuts; OS-aware key labels | S7 | S | Now | `quickadd/CommandPalette.jsx`, new dialog |
| **W6** | **Honest, specific previews:** rewrite each of the 11 Preview-only messages to say what the real product would do and what works in the demo; one line on first arrival that says this is a demo and nothing is saved (dismissible) | S8, S11, G6 | S | Now | `PreviewAction` callers, `WorkspaceProvider.jsx` |
| **W7** | **Zero-data states:** Insights shows "Not enough data yet" instead of 0%; coverage with no requirements says so; Calendar empty month hint | S9 | S | Now | `InsightsPage.jsx`, `CalendarView.jsx` |
| **W8** | **Panel as dialog below 1280px:** `role="dialog"` plus `aria-modal`, focus trap, inert background; docked above 1280px stays a complementary region | S4 | M | Now | `components/layout.jsx` |
| **W9** | **Calendar as a grid:** roving tabindex, arrow keys by day and week, Page Up/Down by month, Home/End, grid roles, a short keyboard hint in a live region | S3 | M | Now | `CalendarView.jsx` |
| **W10** | Reduced-motion and zoom sweep by hand: 200% text, 400% zoom (320px reflow), reduced-motion on; fix what breaks | 1.4.4, 1.4.10 | S | Now | CSS |
| **W11** | Decide and implement view switches: keep as navigation (add `aria-current` consistently and a visible current state) or implement the tabs pattern with roving tabindex | S6 | S to M | Now (decision X3) | `layout.jsx` |
| **W12** | Dark theme switch (System / Light / Dark, applies immediately) and landing-art dark variants or a workspace-only scope | Tokens exist; opt-in only | M | After decision X5 | `AccountPage.jsx`, tokens, art |
| **W13** | Settings that apply at once (week start affects the Calendar, density, text size); remove "Edited chip" pattern where an immediate effect exists | Honest and immediate | M | Now | `AccountPage.jsx`, `CalendarView.jsx` |
| **W14** | One contextual tip, once per session, replayable from Account (for example the Quick add syntax on first Tasks visit) | NN/g: help at the point of need | S | After R1 (only if W-A4 fails) | `TasksPage.jsx` |
| **W15** | Workspace motion pass: task completion (check, then collapse), toast fade, count and bar animation, calendar month cross-fade; reduced motion swaps to a 100 ms fade; measure on a low-end laptop | Feedback and orientation | M | After W4 | `useWorkspaceMotion.js`, CSS |
| **W16** | Tablet layout: show the rail from 768px (icon rail) instead of the phone bar | W-A11 | S | After R1 | `workspace.css` |
| **W17** | Run round 1 sessions, a keyboard-only walkthrough, and a screen-reader walkthrough (section 8) | Everything else is a guess without them | M | First | none |
| **W18** | Home: test headline against figure boxes; test "Today" versus "Home" as the title | W-A6, X2 | S | After R1 | `HomePage.jsx` |
| **W19** | Persistent "Recent changes" list (the undo history made visible) | Control and trust | M | After W4 and R1 | `HomePage.jsx`, new list |

### 6.1 Recommended order

1. **Quick, safe, standards-driven (do first):** W1, W2, W3, W6, W7, W10.
2. **The main loop:** W4 with W5, then W15.
3. **Structure and keyboard quality:** W8, W9, W11, W13.
4. **Research:** W17 in parallel with step 2 (it needs people, not code), then W14, W16, W18, W19 from the findings.
5. **Theme:** W12 after the owner decides (X5).

## 7. Detail for the larger items

### 7.1 In-place task actions with Undo (W4)

- **Scope:** Tasks only. Projects, files, and requirements stay preview-only until after R1.
- **Actions:** complete or reopen (status icon, 24px target inside a 40px hit area, `aria-pressed`), change status (menu or panel), move to tomorrow, pick a date, remove the date, mark blocked, set high priority. Edit and delete are not part of the first cut.
- **Feedback:** act first. A toast (bottom left on desktop, above the phone bar on phones) says what happened and offers Undo. It stays at least 10 seconds, persists while a screen reader is on, has a Dismiss button, and is a polite live region. Undo history keeps 20 steps in memory. Under reduced motion the toast fades only.
- **Data:** a session-only overlay on top of the fixtures (`data/store.js`) so selectors, Home, Insights, and the Calendar update together. Everything resets on reload and is labelled in the Task panel ("Changed in this session").
- **Keyboard:** the status icon is a button; Enter or Space toggles; a row menu opens with Shift+F10 or a visible "more" button for pointer and keyboard parity.
- **Honesty:** the account menu and Account page keep the "nothing is saved" line; the first time a change is made the toast says "This session only".
- **Constraint:** must not introduce storage, analytics, or network calls.

### 7.2 Shortcut policy (W1, W5)

- Modifier shortcuts (Ctrl/Cmd+K) stay. Single-key shortcuts (`Q`, `?`) are active only when **Keyboard shortcuts** is on (default on) and never inside a text field, dialog, or when a modifier is held.
- The cheat sheet lists every shortcut, searchable, with OS-correct labels, and opens from the palette and from `?`.
- The preference is in Account and in the cheat sheet itself, so it can be turned off without leaving the dialog.

### 7.3 Focus and keyboard map (W2, W3, W9, W11)

- Order: skip link, rail, top bar, page title, view switch, control row, content, detail panel.
- Rail and top bar are not repeated in the page tab order more than once.
- Calendar: one tab stop; arrows move by day and week; Page Up and Page Down change month; Home and End go to the start and end of the week; Enter or Space selects; the agenda below announces the chosen day.
- View switches: if kept as navigation, arrow keys are not required; if implemented as tabs, roving tabindex with automatic activation (the content change is instant).

### 7.4 Microcopy rules (W6)

- A preview says **what would happen** and **what works now**: "Marking requirements as met will update the project's coverage. In this demo you can mark tasks done instead." Not "isn't connected yet".
- First-arrival line: "This is a demo with sample data. You can add and change tasks; nothing is saved when you leave."
- Zero-data copy states the reason and the next step: "No requirements yet. Add one in Specs to see coverage."

### 7.5 Motion (W15)

Use the mobile plan's moments, adapted: M-1 complete a task (check, collapse, arrival), M-9 toast fade, M-7 count and bar, M-13 calendar month cross-fade, M-3 view switch cross-fade (exists as a stagger). All at or under 400 ms, none looping, and under reduced motion each becomes a 100 ms fade with the end state reached at once.

## 8. Research plan

### 8.1 Participants

Following NN/g (3 to 4 people per distinct group, small rounds, retest after fixes): **two rounds**.

| Round | Solo makers | Evaluators | Keyboard-only or assistive-technology user | Total |
|---|---|---|---|---|
| 1 | 3 to 4 | 3 to 4 | 1 | 7 to 9 |
| 2 (after fixes) | 3 | 3 | 1 | 7 |

Not the developer, and not people who have used the app. Include at least one person on a laptop with a small screen and one on a large monitor. Results are **qualitative**: do not report percentages as statistics (quantitative claims need about 20 people).

### 8.2 Sessions

- 30 minutes, think-aloud, one facilitator and one note-taker, on the participant's own laptop if possible (the live link), otherwise a test machine.
- Consent: nothing is stored by the app; notes by hand; recordings only with consent and deleted after analysis.
- Tasks:

| # | Task | Success | Watch for |
|---|---|---|---|
| 1 | "Open the demo. In your own words, what is it for?" | Names planning or tracking projects | Reads the landing page; first click |
| 2 | "Find what you should do first today." | Points at the headline or Today within 10 s | Top-bar chips, wrong page |
| 3 | "Mark that done. Now undo it." | Completes and undoes unaided | Which control first; whether the toast is noticed (needs W4) |
| 4 | "Move another task to tomorrow." | Uses a visible control | Discovery; fear of losing it |
| 5 | "Add three tasks: one for Project Garden tomorrow, one high priority, one with no details." | All three correct | Syntax versus typing; chips |
| 6 | "Which requirement does 'Review opening scene notes' come from? Which file?" | Finds both | Lens, chips, vocabulary |
| 7 | "Plan next week: what is already scheduled on Friday?" | Uses the Calendar | Month navigation; day selection |
| 8 | "Open the Opening brief and jump to 'Open questions'." | Uses the outline | Whether it is noticed |
| 9 | "Is anything you did saved?" | Says it resets | Wrong beliefs about saving |
| 10 | "Do task 5 again using only the keyboard." | Completes unaided | Shortcut found; focus lost; traps |

- **Measures per task:** unaided / with a hint / failed; time; errors; one quote; the single ease question (1 to 7). After: what was easy, confusing, what to change first. The SUS questionnaire is optional and not reported as a score with fewer than about 20 people.
- **Analysis:** list each problem with task, evidence, severity (H/M/L), and proposed fix; fix every H and the cheap M before round 2.

### 8.3 Assistive-technology and keyboard walkthroughs

Run by a person with the real tools; an assistant cannot do this part. Automation cannot judge label quality or flow.

1. **Keyboard only** (no mouse), including the skip link, rail, palette, Quick add, the Calendar, panels, filters, and menus. Record every trap, lost focus, and invisible focus.
2. **Screen reader** (NVDA with Firefox or Chrome on Windows; VoiceOver with Safari on macOS if available): headings and landmarks, the Home headline, a task row announcement (title, status, due, flags), toast announcements, dialogs, the Calendar grid, and the Help page.
3. **Zoom and text:** 200% text, 400% browser zoom at 320px, high-contrast mode, reduced motion on.
4. Record pass or fail per step with the exact announcement for any failure.

## 9. Accessibility acceptance

Keep green: the DOM audit (overflow, small text, contrast, names, 24px targets, one H1) at 320, 375, 768, 1024, 1280, and 1440px, including open dialogs and menus.

Add: single-key shortcuts can be turned off (2.1.4); focus never fully hidden by a sticky bar (2.4.11); the Calendar and panels follow the patterns in 7.3 and W8; status messages are announced (4.1.3); no information by colour alone (already true); the keyboard-only and screen-reader walkthroughs pass; 200% text and 400% zoom pass. Say **"checked against"** and list gaps; do not claim conformance without an audit.

## 10. Measures

Indicators for decisions, not statistics.

| Measure | Source | Reference |
|---|---|---|
| Unaided success on tasks 2, 3, 5 | Sessions | Most participants per group; any task two or more people fail is a priority |
| Single ease question per task | Sessions | About 5.5 average in the literature; look at tasks well below the rest |
| Time from first load to first useful action | Sessions | Note; compare rounds |
| Wrong beliefs about saving (task 9) | Sessions | None |
| Keyboard-only completion (task 10) | Sessions | All steps possible |
| Accessibility audit | Automated | Stays clean at six widths |
| Walkthroughs | Manual | All steps pass |
| Feedback time | Browser performance trace | Response to a click within 100 ms; transitions at most 400 ms |

Record each round in `LOG.md`: date, version, groups (no names), top three problems, what changed.

## 11. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| X1 | Allow in-session task changes (complete, move, status) with Undo, replacing Preview-only for tasks? | Yes. It makes the main loop testable and still stores nothing (W4) |
| X2 | Home title: "Home" or "Today" with the date? | Test both in round 1 |
| X3 | View switches: navigation links, or real tabs? | Keep as navigation unless sessions show confusion; make `aria-current` and the visible state consistent |
| X4 | Detail panel below 1280px: modal dialog or non-modal sheet? | Modal dialog with focus trap |
| X5 | Dark mode on the website, and for the landing art too? | Workspace first, behind a Settings switch; landing later |
| X6 | Reference bar: WCAG 2.2 AA or Level A only? | WCAG 2.2 AA as the review reference; no conformance claim without an audit |
| X7 | Who are the participants and how are they recruited? | Owner names them; classmates and fellow makers who have not seen the app |
| X8 | May sessions be screen-recorded? | Optional, with consent, deleted after analysis |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Redesigning from assumptions | The Gate column: after-R1 items wait; the register shows what is untested |
| In-session actions look like saving | Labels, the first-change toast line, and task 9 |
| Accessibility regressions while iterating | Keep the audit green; add keyboard checks to it where possible |
| Over-explaining clutters a calm UI | One tip at most; measure whether it is needed |
| Single-key shortcuts misfire for speech-input users | W1 preference; never inside fields |
| Secondary sources misquote standards | Section 3 marks what was read at the source; verify against W3C pages before quoting |
| Motion drops frames on low-end laptops | 400 ms ceiling; one list animation at a time; measure |
| Calendar grid keyboard work conflicts with screen-reader browse mode | Test with NVDA; follow the APG example |

## 13. Next steps

1. Owner answers X1, X6, X7, and X8; X3 to X5 can follow.
2. Do the quick, safe items first (W1, W2, W3, W6, W7, W10); they do not wait for research.
3. Build W4 (with W5), then W15.
4. In parallel, a person runs the keyboard-only and screen-reader walkthroughs (8.3) and schedules round 1.
5. Run round 1, write the findings table, fix H and cheap M, run round 2.
6. Update this plan with tested assumptions (move W-A numbers from U to V or disproved), findings, and the status of each journey in 5.3. Update `README.md`, `CODEMAP.md`, `CONTEXT.md`, and `LOG.md` as items land.

## 14. Sources

Read at the source in this project (through the mobile plan): [W3C Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); [NN/g: Why you only need to test with 5 users](https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/).

From search summaries (**verify against the W3C pages before quoting**):
- Character Key Shortcuts: [W3C Understanding 2.1.4](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts); [Technique G217](https://www.w3.org/WAI/WCAG21/Techniques/general/G217); [Failure F99](https://www.w3.org/WAI/WCAG22/Techniques/failures/F99).
- Focus Not Obscured: [Technique F110](https://www.w3.org/WAI/WCAG22/Techniques/failures/F110.html); [Adrian Roselli: 2.4.11 adversarial conformance](https://adrianroselli.com/2023/10/2-4-11-adversarial-conformance.html); [Tabnav: 2.4.11](https://tabnav.com/academy/wcag/success-criterion-2.4.11).
- Date picker and grid: [W3C APG date picker dialog example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog.html); [APG combobox date picker](https://www.w3.org/TR/wai-aria-practices-1.2/examples/combobox/combobox-datepicker.html).
- Tabs: [W3C APG tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/); [Helsinki: tab list pattern notes](https://saavutettavuusmalli.hel.fi/toteutus-ja-ohjelmistotestaus/tab-list-pattern-notes-on-technical-implementation/).
- Command palette and shortcuts (practitioner, not research): [Dynatrace: plan keyboard shortcuts](https://developer.dynatrace.com/develop/keyboard-shortcuts/plan-keyboard-shortcuts/); [Knock: how to design great keyboard shortcuts](https://knock.app/blog/how-to-design-great-keyboard-shortcuts); [Command palette UX patterns](https://www.saasui.design/blog/saas-search-command-palette-ux-patterns).
- Empty states and onboarding (secondary, unverified): [Appcues: user onboarding](https://www.appcues.com/blog/user-onboarding); [Userpilot: progressive disclosure](https://userpilot.com/blog/progressive-disclosure/).
- Carried over from the mobile plan (see its section 14 for the full list): Undo and toast timing ([Scott O'Hara](https://scottohara.me/blog/2019/07/08/a-toast-to-a11y-toasts.html)), reduced motion ([W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions.html)), response-time limits ([NN/g](https://www.nngroup.com/videos/3-response-time-limits-interaction-design/)).

**Not found:** an NN/g article on empty states or onboarding checklists in this search; the full arrow-key table for the APG calendar grid; the official wording of Understanding 2.4.11 (only secondary pages). Check these before quoting.

## 15. Implementation status (2026-11-15)

| Item | Result |
|---|---|
| W1 Shortcut policy | Done. `Q` and `?` work only when **Single-key shortcuts** is on (default on; toggle in Account > Keyboard and in the shortcuts dialog) and never inside fields or open dialogs. Ctrl/Cmd+K and Ctrl/Cmd+Z are modifier shortcuts and always work. Key labels are OS-aware (`lib/keys.js`). The preference is in memory only |
| W2 Focus | Done. `scroll-padding-top` 88px and `scroll-padding-bottom` 96px while the workspace is mounted; one visible 3px focus ring for every control in the workspace, dialogs, and toast |
| W3 Skip link | Partly. The skip link now lands on the focusable `main`; it does not skip past the page title |
| W4 In-place task actions | Done (first cut). Status circle toggles done; panel has status, date, Move to tomorrow, Blocked, and High priority; each change shows a toast with Undo (10 s, pauses on hover or focus, Dismiss button, Ctrl/Cmd+Z, 20 steps). Session-only (`data/store.js` edits overlay and history). **Not built:** a row menu, Edit, delete, in-place actions for projects, files, and requirements; the toast does not stay open for screen-reader users beyond the 10 s (the Ctrl+Z route covers it, but this needs a screen-reader test) |
| W5 Shortcuts help | Done. `?` opens a searchable list; palette results show `Q` and `?` hints. The palette's top-bar label is OS-aware |
| W6 Honest previews | Done. 11 specific preview messages; a dismissible one-line demo note at the top of the workspace; the Account privacy link was also corrected to `/privacy-policy` |
| W7 Zero-data states | Done. Insights shows "Not enough data yet" for Progress and Coverage; an empty Calendar month says so |
| W10 Zoom and reduced-motion sweep | Not done by hand. The DOM audit stays clean at the audited widths |

**Verified in the browser:** completing a task from its circle and from the panel, Undo by button and by Ctrl+Z, the shortcuts dialog and the toggle (Q does nothing when off), the toast on phone and desktop, no overflow at 375 and 1280px, and the DOM audit (overflow, text size, contrast, names, 24px targets) at 1280px on Home, Tasks, the task panel, Calendar, Account, Insights, Library and the shortcuts dialog and palette. **Not verified:** screen reader and keyboard-only walkthroughs, 200% zoom, 320 to 1024px after these changes.

### 15.1 Second batch (2026-11-15)

| Item | Result |
|---|---|
| W8 Panel as dialog | Done. Below 1280px the detail panel has `role="dialog"` and `aria-modal`, and the rail, top bar, phone bar, and list behind it are `inert` while it is open (restored on close; verified). At 1280px and above it stays a docked side region and the page stays live. Escape and focus return were already in place |
| W9 Calendar keyboard | Done, with a deviation. One tab stop in the month (roving tabindex); arrows move by day and week, Home and End to the week edges, Page Up and Page Down by month (the day number is kept, clamped); focus follows into the next month. A keyboard hint is shown at 1024px and up and is read by screen readers via `aria-describedby`. **Deviation:** the markup is a labelled list of day buttons, not the full ARIA `grid` with rows and cells, so a screen reader will not announce row and column positions. Check with NVDA before deciding whether full grid roles are worth it |
| W11 View switches | Decided (X3 recommendation): keep as navigation. They change the URL, so a `nav` with buttons and `aria-current` is the right fit; no code change. Revisit if sessions show confusion |
| W13 Settings that apply at once | Partly. **Week starts on** now applies at once to the Calendar (Monday or Sunday first; in memory). Density, motion, and reminders remain preview-only and still show the Edited chip |

**Verified in the browser at 1024px:** one tab stop (of 42 days); arrow, Home, End, Page Up and Page Down movement including across months; week start switching the grid and headings; the panel's dialog role and inert background, and inert removed on close; the DOM audit (overflow, small text, names, 24px targets) on Calendar, the panel, and Account. **Not verified:** screen reader, 320 and 768px for the new Calendar hint, the focus order inside the open panel with a keyboard.

### 15.2 Third batch (2026-11-15)

| Item | Result |
|---|---|
| W12 Theme switch | Done, workspace only. Account > Appearance > **Theme**: Follow my device (default), Light, Dark; applies at once. `data-theme` is set on the root only while the workspace is mounted, so landing, sign-in, and legal pages stay light (verified: attribute removed on leaving). In memory only. To make dark work the workspace and form stylesheets were moved off hard-coded colours onto tokens (text on dark buttons is `--paper`; pink-button text is `--on-accent`); native controls follow via `color-scheme`; the dotted page pattern dims in dark. Contrast audited in **light** (11 pages and the palette) and in **dark** (11 pages, Quick add, palette, shortcuts, New project, filter, account menu, toast, and a preview dialog): no failures |
| W15 Motion pass | Done, small. A completed task now appears in a **Done this visit** group on Today (it used to vanish) and arrives with a short rise; the Home headline cross-fades when its words change; the Calendar cross-fades on month change; the status circle presses in. Progress bars already animated. All are 200 to 400 ms, once, and become a 100 ms fade under reduced motion. **Not built:** a collapse of the leaving row, a toast exit fade, a count roll. Checked by computed animation names; the browser pane does not render frames, so **the motion has not been seen by eye** |
| W3 Skip link past the title | Not done (the skip link lands on the main area) |

**Not verified:** dark theme on phone widths and by eye on the landing hand-off (login after dark workspace), screen reader and keyboard-only passes, the motion by eye, 200% zoom. Dark is the default for people whose device is set to dark, so a visual review on a real dark-mode device is the next check.

### 15.3 Fourth batch (2026-11-15)

| Item | Result |
|---|---|
| W19 Changes this visit | Done. Home shows a **Changes this visit** list (latest five, with the same wording as the toast) and an **Undo last change** button whenever there is history. The undo stack holds the message with each entry |
| W16 Tablet layout | Done. From 768px the workspace shows the icon rail (with Quick add and the account menu) instead of the bottom bar; the account button leaves the top bar; the docked detail panel still starts at 1280px (below that it is the modal dialog from W8). Page padding stays 24px until 1024px. Built before round 1 because it is easily reversed; W-A11 is still untested |
| PLAN-A-04F gap: Coverage matrix | Done. Specs has a **List / Coverage** switch (`?mode=coverage`); the matrix has one row per requirement with Tasks and Final file columns; missing links are text plus a warning icon ("No work yet", "No final file") |
| PLAN-A-04H gap: comparison with no diff | Done. A comparison link for a change that has no text diff, or that no longer exists, shows "No comparison for this change" with a link back to History |
| Human-only checks | Written up as `docs/testing/ux-walkthrough-checklist.md`: keyboard only, screen reader, zoom and reflow, motion and theme, first impressions, and how to record results |

**Verified in the browser:** the Home changes list and the Undo button, the 768px layout (rail shown, bottom bar and top-bar account hidden, no overflow, dark theme on), the coverage matrix (4 requirements, 4 gaps), the comparison empty state, and a DOM audit at 768px (overflow, small text, contrast, names, 24px targets; two findings in the matrix, fixed) and at 375px. **Not verified:** the 1024 to 1279px rail with the new default, dark on phone widths by eye, everything in the checklist.
