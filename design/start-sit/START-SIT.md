# Sleepa Start / Sit redesign: handoff

Source: `Sleepa Start-Sit Redesign.dc.html` (open in a browser; it is a Design Component rendered by `support.js`). Placeholder data throughout. Player photos are in `assets/`. Card design system for reference: `handoff/CARDS.md`, `Sleepa Cards Set.dc.html`.

## Problem
Current Start/Sit page: tall left picker column (avatar grid, 3 per row) and a mostly empty right pane. Space is wasted and the answer is hidden until players are picked.

## File layout
Canvas of artboards, newest turn on top.
- **Turn 2 (chosen direction, build this):** 2a, 2b, 2c, 2d.
- **Turn 1 (explorations, reference only):** 1a Tray + Arena, 1b Verdict + Roster Rail, 1c Slot-first Board, 1d Stacked verdict (phone), 1e Swipe compare + picker sheet (phone).

## Chosen design (Turn 2)
Combines 1a (verdict banner + side-by-side columns with shared stat grid) and 1b (compact checklist on left), plus 1d (large stacked player cards on phone) and 1e (bottom-sheet picker).

### 2a Desktop (1200 wide artboard; fluid in app)
Grid: `290px` checklist rail | main.
- **Checklist rail:** header "COMPARING · n OF 4"; segmented Your team / Available / All; search; position chips (All, QB, RB, WR, TE, K, DEF, tinted with position color); rows = checkbox, 32px avatar ringed in position color, name, pos · team, projection. Selected row gets `rgba(61,214,140,.08)` bg and green checkbox. Min 2, max 4 selected.
- **Main:** tab pills (Start / Sit, Trades, Team needs, Lineup changes) and "Week · Updated" text; then:
  1. **Verdict banner** (green tint, 1px `rgba(61,214,140,.35)` ring): "START", top player name, "+delta over next · n% chance to score most", CTA "Set X in lineup".
  2. **Detail panel** (only when a player is open): 150px photo, "#rank OF n · tag MATCHUP", name 40/800, proj 44/800, win% 30/800 green, stacked odds bar for all compared players (position colors), "WHY" list (4 generated reasons), Close.
  3. **Comparison grid:** `grid-template-columns: 150px repeat(N, minmax(0,1fr))`, N = selected count. Column header card: 72px photo with matchup-color glow, name, pos · team · opp, proj 30/800, "Details ▾ / Hide details ▴" button. Rows (label column + cell per player; best value in each row is green, weight 800): Chance to score most, Projection, Floor, Ceiling, L3 average, Opp. rank vs pos, Usage, Status (Questionable in amber). Footer cell per player: LAST 5 mini bars in the position color.
  - Top-ranked column gets a 2px green inset ring; the open column gets a 2px white ring.
- **2c:** the same screen with a player's detail panel open (Olave). Open state is toggled per column via Details.

### 2b iPhone (390×844)
Header "Start / Sit" with "n of 4" pill, scrollable tab pills, then a scroll area:
- Verdict card (green gradient): 72px photo, "START", short name, "n% to score most", big `+delta`.
- One large card per compared player: 64px photo, name, pos · team · opp, proj 32/800, floor–ceiling range bar with median tick, RANGE / L3 / MATCHUP stats. **Tap a card to expand:** win % (green 28/800), odds bar, 4 reasons, "Hide details" hint.
- Sticky footer: "+ Add player" (opens sheet) and "Start X" (green).
- **2d:** same screen with the picker sheet open: 600px bottom sheet, 28px top radius, drag handle, "Add players n of 4" + green Compare button (closes sheet), segmented tabs, search, position chips, roster rows with 40px avatar, proj, round check toggle. Dimmed backdrop closes the sheet.

## Behavior (implemented in the prototype)
- Selection state: array of player ids; toggle adds/removes (2 to 4).
- `open` = id of the player whose detail is expanded (one at a time).
- Derived per render from selection:
  - **Top** = highest projection; delta = top proj minus second.
  - **Win odds**: `w = exp(proj / 3.2)` normalised to 100%, rounded, last item absorbs rounding. Replace with real model output.
  - **Row best** = max of the row (rank row uses the numeric rank; Usage and Status have no best).
  - **Range bar** scale: 5 to 32 pts; floor-to-ceiling fill, median tick at projection.
  - **Reasons** (templated): matchup tag + opponent rank vs position; projection and range; L3 vs projection; health or usage.
- The prototype keeps two independent state sets (A for 2a/2b, B for 2c/2d). Real app needs one.

## Tokens (from the card system)
- Surfaces: bg `#0B0B0D`, surface `#151518`, surface-2 `#1E1E22`, surface-3 `#29292F`, hair `rgba(255,255,255,.07)`.
- Text `#F5F5F7` / `#A1A1AA` / `#6E6E78`.
- Accent/win green `#3DD68C`; matchup: favorable `#3DD68C`, neutral `#FFB340`, tough `#FF5A4F`.
- Position: QB `#6EA1FF`, RB `#3DD68C`, WR `#FFB340`, TE `#C58BFF`, K `#A1A1AA`, DEF `#5AD2F4`.
- Type: Inter 400-800; big numerals 800 with -0.03em tracking and tabular-nums; labels 10-11px 700 uppercase, 0.1-0.14em tracking.
- Radii: cards 16-20, pills 999, buttons 10-14, phone sheet 28.

## Data needed per player
`id, name, short, pos, team, opp, proj, floor, ceil, l3, opp rank vs pos, matchup tag (Favorable/Neutral/Tough), last-5 scores[5], usage string (target share / snaps), status (Healthy/Questionable), headshot`, plus win probability among the selected set.

## Not designed yet
Empty state (0 or 1 selected), loading, Available/All list data, search and position filtering behavior (chips are static in the mock), "Set in lineup" confirmation, light theme, tablet widths, more than 4 selected feedback.
