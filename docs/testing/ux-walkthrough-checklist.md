# Tsumugi workspace: walkthrough checklist (for a person)

> **Why this exists:** the checks below need a human with real tools. An automated script cannot judge whether a screen reader announces the right thing, whether focus is where a person expects, or whether the motion feels right. Everything an assistant could check automatically (overflow, text size, contrast, control names, target size) has already been run; see `LOG.md`.
> **How to use it:** work through one section at a time with the demo running (`npm run dev` in `client/`, then open the address it prints). Write **Pass**, **Fail**, or **Unsure** beside each step. For every failure, write down exactly what you saw or heard.
> **Source plan:** `docs/plan/frontend/PLAN-A-05.md` (sections 8 and 9). Results go in `LOG.md`: date, tool and version, what passed, the top three problems.

## 0. Before you start

- Use a fresh page load for each section (changes made in the demo reset on reload).
- Start in **Follow my device** theme. Repeat the visual steps once in Dark (Account > Appearance > Theme).
- Note your browser, operating system, and screen reader with version.
- Sample date in the demo is fixed at 12 November 2026; do not expect it to match your clock.

## 1. Keyboard only (no mouse)

Put the mouse out of reach. Use Tab, Shift+Tab, Enter, Space, arrow keys, Escape.

| # | Step | Expect | Result |
|---|---|---|---|
| 1.1 | Load `/home`. Press Tab once | A "Skip to workspace content" link appears; Enter moves past the navigation | |
| 1.2 | Tab through the rail and top bar | Every item shows a clear focus ring; the order is brand, Quick add, five destinations, account, search | |
| 1.3 | Press Ctrl+K (Cmd+K) | The palette opens with focus in its field; arrows move the highlight; Enter opens; Esc closes and focus returns | |
| 1.4 | Press `?` | The shortcut list opens; the field has focus; Esc closes | |
| 1.5 | Press `Q`, type "Check slides tomorrow !", press Enter | A confirmation is announced and the field clears; Esc closes | |
| 1.6 | In Tasks, Tab to a task's circle and press Space | The task is marked done; the toast appears; focus does not jump to the top | |
| 1.7 | Press Ctrl+Z (Cmd+Z) | The task is restored; a "Change undone" message appears | |
| 1.8 | Open a task with Enter; Tab inside the panel | Narrow window (below 1280px): focus stays inside the panel and the page behind is not reachable. Wide window: the panel is beside the list and the page is reachable | |
| 1.9 | In the panel press Escape | The panel closes and focus returns to the task you opened | |
| 1.10 | Go to Tasks > Calendar. Tab into the month | One Tab stop for the month; arrows move by day and week; Home/End jump to the week edges; Page Up/Down change month; focus is never lost | |
| 1.11 | Tab to the bottom of a long list | The focused row is never hidden under the top bar or (narrow window) the bottom bar | |
| 1.12 | Use the filter button and the account menu with the keyboard | Both open with Enter or Space, close with Escape, and keep focus sensible | |
| 1.13 | Account > Keyboard: turn off single-key shortcuts; press `Q` and `?` | Nothing happens; Ctrl+K and Ctrl+Z still work | |

## 2. Screen reader

Suggested: NVDA with Firefox or Chrome on Windows; VoiceOver with Safari on macOS if you have it. Close your eyes for the first pass.

| # | Step | Expect | Result |
|---|---|---|---|
| 2.1 | Open `/home` and list headings and landmarks | One page title; landmarks for navigation and main; the headline reads as the title | |
| 2.2 | Move through the Today list | Each task reads title, status, project, High or Blocked if set, due date. The circle button reads "Mark … as done" | |
| 2.3 | Mark a task done | The message ("Marked done: …") is announced without moving focus; the Undo button is reachable | |
| 2.4 | Open Quick add; add a task | The confirmation is announced; chips are read | |
| 2.5 | Open the palette and type | Results are announced as options with the highlighted one; no "unlabelled" items | |
| 2.6 | Open Tasks > Calendar | The month title is announced; each day reads date and item count; the hint is read when you enter the grid. **Note whether row and column positions are announced** (they should not be yet; record what you hear) | |
| 2.7 | Open a task panel (narrow window) | Announced as a dialog with the task name; the background is not readable | |
| 2.8 | Open Library > a document | The outline is a navigation list; Preview/Source buttons say which is pressed | |
| 2.9 | Open Insights | The three cards read as headings with values; "Not enough data yet" reads sensibly when you select an empty project | |
| 2.10 | Open the Help page and search | Results narrow; headings are navigable | |

## 3. Zoom, text size, and reflow

| # | Step | Expect | Result |
|---|---|---|---|
| 3.1 | Browser zoom 200% on Home, Tasks, Projects, Library | Nothing is cut off or overlaps; the layout switches to the phone version | |
| 3.2 | Browser zoom 400% (equivalent to a 320px-wide window) | No sideways page scroll except inside tables and the Calendar's own scrolling tabs; all functions still work | |
| 3.3 | Set the browser's minimum or default font size larger | Text grows or stays readable; no clipped buttons | |
| 3.4 | Open the New project dialog and the shortcut list at 200% | The dialog scrolls inside itself; the action buttons stay reachable | |
| 3.5 | Windows High Contrast or forced colours | Buttons, fields, and focus rings remain visible | |

## 4. Motion and theme

| # | Step | Expect | Result |
|---|---|---|---|
| 4.1 | Turn on "Reduce motion" in your operating system; reload | No sliding or springing; changes still show (short fades); nothing loops | |
| 4.2 | Complete a task on Today | A "Done this visit" group appears with a short rise; the toast fades in; nothing feels slow | |
| 4.3 | Change months in the Calendar | A short cross-fade, no jump | |
| 4.4 | Switch to Dark in Account | The whole workspace changes at once; text is readable; badges, borders, and the toast look right | |
| 4.5 | From the dark workspace choose "Back to landing page" | The landing page is light (the dark theme does not leak out) | |
| 4.6 | On a phone-sized window, use each page in Dark | Nothing is unreadable; the bottom bar and toast do not overlap content badly | |

## 5. First impressions (give to someone who has not seen it)

Use the ten tasks in `PLAN-A-05.md` section 8.2. Do not coach. Note where they hesitate, what they say, and what they click first. Ask afterwards: what was easy, what was confusing, what would you change first?

## 6. Recording results

Add one entry to `LOG.md` per sitting:

```text
- Walkthrough <date>: <keyboard | screen reader (name, version) | zoom | motion | first impressions>.
  Passed: <n>. Failed: <n>. Top problems: 1) ... 2) ... 3) ...
```

Then tell the assistant which steps failed (and exactly what you saw or heard), and they will become fixes in `PLAN-A-05.md`.
