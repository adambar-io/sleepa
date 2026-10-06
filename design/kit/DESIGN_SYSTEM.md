# Sleepa design system

For anyone (or any tool, e.g. Claude Design) designing new Sleepa views. The aim is that a new screen looks like it
was always part of the app.

| File | What it is |
|---|---|
| `TOKENS.css` | Every color / shadow / radius / motion value, both themes, exact. Generated from `index.html`. |
| `kit.html` | Real components (markup from the app's own renderers + the app's real stylesheet), dark and light side by side, at phone (375px) and desktop (1280px) widths. Open it in a browser. |
| `DESIGN_SYSTEM.md` | This file: the rules, and each component's anatomy. |
| `../cards/handoff/CARDS.md` | Trading-card spec (geometry, foils, tiers, inserts, back, motion). |
| `../start-sit/START-SIT.md` | Start / Sit redesign spec (desktop rail + grid, phone cards + sheet). |

Keeping it in sync: after any style change run `node design/kit/build-kit.js` (rebuilds `TOKENS.css` and `kit.html`
from `index.html`). If a component's markup changes, re-capture it into `design/kit/captures/` (see the header of
`build-kit.js`).

---

## 1. Principles

- **Desktop-first, phone-complete.** Desktop is at least as important as the phone; use the width (tables, side-by-side
  cards). Every screen must still work at 375px with one thumb.
- **Names first.** A player's name is never truncated by chips or columns: chips wrap under the name, the name may
  wrap to a 2nd line, lower-value columns shrink first.
- **Numbers are the content.** Big, bold, tabular. Labels small, uppercase, muted.
- **Quiet chrome, loud state.** Surfaces are low contrast; color is reserved for meaning (position, matchup tone,
  win / lose, live, free agent).
- **Two themes, same design.** Light is warm "stone and paper" (no pure white); dark is near-black. Design with tokens
  only; never hard-code a color except inside the always-dark trading cards.

## 2. Color

All values in `TOKENS.css`. Usage:

| Token | Use |
|---|---|
| `--bg` | Page background. |
| `--surface` | Cards, sheets, popovers, rows' container. |
| `--surface-2` | Inputs, chips, segmented controls, hover, inner panels. |
| `--surface-3` | Selected segment / tab thumb, pressed. |
| `--hair` | 1px borders and dividers (usually `box-shadow: inset 0 0 0 1px var(--hair)`). |
| `--text` / `--text-2` / `--text-3` | Primary / secondary (meta, values) / tertiary (eyebrows, captions, disabled). |
| `--accent` (+ `-soft`, `--on-accent`) | Positive: gains, "Start", free agent, favorable matchup, primary action in green contexts, links ("Compare lineups ›"). |
| `--warn` (+ `-soft`) | Questionable, neutral matchup, caution. |
| `--danger` (+ `-soft`) | Out / IR, losing, tough matchup, bye, errors. |
| `--pos-*` | Position identity only: slot tag text + border, 1.5px photo ring, left 3px row stripe, chart bars. |
| `--mt-fav / --mt-neu / --mt-tough` | Matchup tone (= accent / warn / danger). |
| `--impact-*` | Sleepa Zone feed: a play's effect on your matchup. |
| `--scrim` | Behind sheets / dialogs (with `backdrop-filter: blur(6px)`). |

Tints are made with `color-mix(in srgb, var(--x) 12-16%, transparent)` rather than new tokens.
The primary button is an ink pill: `background: var(--text); color: var(--bg)`.

## 3. Typography

- **Inter** 400 / 500 / 600 / 700 (800 for card and hero numbers). **Poppins 700** only for the `sleepa` wordmark
  (`.wordmark`, letter-spacing -0.035em).
- Body: 14px / 1.4. Headings 700, letter-spacing -0.02em.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`, class `.num`) for every stat, score, projection, rank.

| Role | Size / weight | Notes |
|---|---|---|
| Page title (`.page-head h1`) | 30 / 700, -0.025em, lh 1.1 | 28 on narrow |
| Section / card title | 15-17 / 700 | `.pf-sec h3` 15 |
| Player name (`.player-name`) | 15 / 600 (14.5 phone) | never truncated |
| Meta line | 12.5-13 / 400-500, `--text-2` | "WR · CIN · vs PIT" |
| Eyebrow (`.eyebrow`) | 11 / 600, +0.08em, uppercase, `--text-3` | section labels, column heads (10.5 / 700 in tables) |
| Chips | 10.5-11.5 / 600-800 | uppercase for status chips |
| Big score (matchup) | 28-34 / 700, -0.02em | tabular |
| Stat tile value (`.pf-stat .v`) | 24 / 600 | label 10.5 / 600 caps |
| Trading card proj | 46 / 800, -0.03em | see CARDS.md |

## 4. Space, radius, elevation

- **Spacing** (px): 2 4 6 8 10 12 14 16 18 20 24 28 36. Gutter 16 (phone) / 36 (desktop main). Card padding 16-20.
  Row padding 10 × 14. Gaps between cards 12-18.
- **Radius**: `--radius-sm` 10 (inputs, small panels), 12 (rows, inputs), `--radius` 14 (cards in lists, popovers),
  16 (Huddle cards, rails, Zone tiles), `--radius-lg` 20 (page cards), 24 (sheets), 999px (pills, buttons, tab bar,
  chips that are pills). Status chips 5-6.
- **Elevation**: light theme uses `--shadow` (soft, warm) on cards; dark theme has `--shadow: none` and relies on
  surface steps + `--hair`. Floating layers (sheets, popovers, focus lift) use `--shadow-lg`. Selection = 2px ring in
  the relevant color (accent, position, or `--pr-c` in the Huddle), not a heavier shadow.

## 5. Iconography

Inline SVG only (no icon font, no images): `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
`stroke-width` 1.8 (nav) to 2-2.2 (small action icons), `stroke-linecap="round"`, `stroke-linejoin="round"`. Sizes
16-22px. Icons inherit text color; active state changes the text color, not the icon. Arrows in text are characters:
`›` for "go", `▲ ▼` for change, `−` (U+2212) for minus.

## 6. Motion

- Easing: `--ease` = cubic-bezier(.2,.8,.2,1) for everything that moves; `--spring` = cubic-bezier(.34,1.4,.5,1) for
  things that "land" (tab thumb, selection, card flip, sheet pop).
- Durations: hovers / color 150-200ms; view enter `viewIn` .45s (8px rise + fade), lists stagger 35ms per item
  (`.stagger > *`, `--i`); overlay fade .25s + panel `focusIn` .35s spring; tab thumb .4s spring; Zone ring .65s
  (flat phone ring .38s); card flip .56s spring; Huddle place / land ~.3s with sparks; theme switch uses the View
  Transitions API crossfade.
- **countTo**: totals count from the old to the new value over 650ms, always ending on the exact 2-decimal number;
  skipped (number set instantly) when the tab is hidden or Reduce Motion is on.
- **Reduced motion** (`prefers-reduced-motion: reduce`): no entrance animations, no flips / ring transitions / sparks /
  live pulses, no smooth scroll; state changes still happen instantly. Every new animation needs this fallback.

## 7. Layout

- **Phone-first 375px.** Content gutter 16px + safe areas: `padding: calc(20px + env(safe-area-inset-top))
  calc(16px + env(safe-area-inset-right)) calc(110px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))`.
- **Bottom tab bar (phone)**: floating pill, 64px tall, 12px from the edges (+ safe areas), max 560px wide, blurred
  translucent surface. Primary actions live in the bottom half (thumb reach); sticky footers sit above it.
- **Desktop ≥1024px**: sidebar 248px + main (`.shell` grid); the tab bar is replaced by the sidebar. Lineup / Players
  have a list + side panel; League / Compare / Settings are single column (`.panes.solo`).
- **Targets**: 44px minimum for anything tappable on phones (tab buttons 64 tall, buttons min-height 36-44, rows ≥56).
- **Container queries** decide density (not just viewport): list table mode at ≥600px (`list` container), more
  columns ≥740; player page Rankings + League ownership side by side ≥820 (`pfduo`); Start / Sit grid (`.ssd-main`);
  Zone (`zn`) and Huddle (`pr`) full-screen containers. Zone desktop layout ≥900px wide.
- Full-screen layers (Huddle, Zone, full player view `.max`) cover the app; z-index layers are listed in `TOKENS.css`.

## 8. Numbers and text

- Fantasy points: **always 2 decimals** (`108.18`, `0.00`). Deltas signed: `+2.40`, `−3.21` (U+2212), colored
  accent / danger.
- Percentages whole (`53%`), except where precision matters (snap share trends).
- Ranks: `QB12`, `wk RB4`, tiers `T3`. Records `3–1` (en dash).
- Sentence case everywhere; uppercase only for eyebrows and status chips. Use `·` (middle dot) to join meta.
- Copy is short and specific ("You're projected behind by 10.92"), never jargon without a number.

---

## 9. Components

Class names are the app's; the kit shows each one live.

### Header + bottom bar (phone) / sidebar (desktop)
- Phone header: `.m-brand` (logo mark + `.wordmark`, chevron opens the league popover) and `.ph-search` (40px round
  icon, top-right, opens universal search).
- `.page-head`: `.eyebrow#page-eyebrow` ("WEEK 5 · THE LEAGUE" + `.fmt-badge` PPR / IDP), `h1`, `.page-sub`, `.fresh`
  (refresh status, red when live).
- `.tabbar` > `.tab-thumb` (sliding `--surface-3` pill) + `.tab-btn` (icon 22 + label 10.5/600; `aria-current="page"`
  = `--text`; `.nav-badge` count bubble).
- Desktop `aside.side`: `.brand`, `.side-search` (Search + `/` kbd), `.side-zone` (Sleepa Zone entry), league card,
  `.nav` with `.nav-btn` and a sliding `.nav-thumb`, `.theme-seg` (Auto / Light / Dark), `.data-status`.

### Chips and pills
- Status: `.status-chip.st-warn` (Questionable), `.st-doubt`, `.st-out` (Out / IR / PUP / Sus), `.new-tag`,
  `.lock-tag`, `.bye-tag`. Has `.chip-full` / `.chip-short` (Q, O, IR) variants.
- Matchup tone: `.dvp-chip.easy` (accent-soft), plain (neutral), `.hard` (danger-soft), `.early` (outline, early season).
- Position: `.slot-tag` (40px, position color text + 1px border); in rows the photo gets a 1.5px `--pc` ring.
- Rank: `.ecr-chip` (`<s>wk</s>WR12<i>T4</i>`), depth `.depth-chip` (WR2).
- Start / Sit: `.ss-tag2.start` / `.sit`. Free agent: `.own-badge` (solid accent pill). Live red zone: `.zn-rz`.
- Trade tags: `.tf-tag` (+ `.spare`, `.theirneed`, `.myneed`, `.cons`).

### Player rows
- `.slot-row` = `.slot-tag` + `img.avatar` (position ring) + `.player-info` (`.player-name` with chips, `.player-meta`,
  `.key-stats`, `.sig` signals) + columns (`.col-opp`, `.col-snap`, `.col-tgt`, `.stat-col` proj / actual, `.col-vs`)
  + `.row-vs` (`.vs-btn`, round "VS" toggle, `.on` = accent).
- Phone: info stacks; desktop (container ≥600): `.list-head` + table columns; the name column keeps ≥150px.
- States: hover `--surface-2`; keyboard highlight `.kb-hl` (2px accent outline); "New" starter `.new-tag`; locked =
  muted + lock chip; live points in accent with a pulsing dot.
- **Zone rows**: rich `.zg-r` (slot label, 40px photo, name + game line + stat line, value right with "proj") vs
  condensed (single line, no stat line); left 3px `--pc` stripe; `.s-bye` / `.out` / `.empty` at 55% opacity.

### Matchup card (`.mu-card`)
Button card: eyebrow ("WEEK 5 MATCHUP · PROJECTED" / live) + "Compare lineups ›" link; two sides with team avatar
(`.t-av`, initials fallback), name, big score (yours colored by winning / losing), caption ("Your Sleeper lineup");
win-probability bar `.mu-wp` (accent vs `--surface-3`, live shimmer); verdict line ("projected behind by 10.92").

### Sleepa Zone (every league at once)
- `.zn` full screen: `.zn-top` (back, title + week, week stepper, Cards / List toggle `[data-zn-mode]`, photos,
  refresh status), body, `.zn-bot`.
- **Ring carousel** (`.zn-car.ring`): desktop = 3D, perspective 2000px; each `.zn-card` is placed by `--o` (offset from
  center) and `--ao` (|offset|): `translateX(-50% + o·88%) translateZ(-ao·200px) rotateY(-o·32deg)`, opacity
  `1 - ao·.62`, .65s. Phone (`.flat`, <900px) = flat swipe, `translateX(o·100%)`, .38s. ←/→ and swipe / drag.
- **Indicators**: `.zn-dots` > `.zn-dot` league pills (name, active = surface-3 + text); hidden in List mode.
- **List view** (`.zn.alt`): `.zn-tiles` grid of `.zn-tile` (auto-fit 320px+) with "Detailed / Condensed" segmented
  control.
- **Focus lift** (desktop list): clicking a league header lifts that tile (`.zn-tile.focus`, fixed, `--shadow-lg`,
  bigger score 46px) over the dimmed grid with both teams side by side; FLIP-animated from and back to its spot; Esc
  or a click outside returns it.
- Points breakdown popover `.zbd` (300px, radius 16, `--shadow-lg`).
- Live feed `.zf-ev` (impact colored left edge / points `▲ +4.30`, `BIG` tag for big plays).

### Sleepa Huddle (set the lineup position by position)
- `.pr` full screen (container `pr`): top bar, position step chips (`.pr-tab`, `--c`), slots `.pr-slot` (label +
  `.pr-card`), player pool `.pr-pool` rows of `.pr-card`. Selection ring `--pr-c` (position color); matchup strip 3px
  at the card bottom (`.mt-easy / .mt-mid / .mt-hard`); `.landed` animation + sparks on place; Undo toast `.pr-toast`.
- **Trading card** `.cd` (5:7, always Dark Chrome): `--cdw` sets width; inside, `--u = 100cqw / 300` so every
  dimension is written in 300px-card units (`calc(var(--u) * 26)` = 26px on a 300px card). Frame = conic foil
  `--foil-*` via `--stops`, tiers `.t-base / .t-silver / .t-gold / .t-holo` (gold and holo add glows). Front: slot
  pill, number, photo window with matchup glow, name 26/800 (auto-shrink), meta, proj 46/800, L3, set label + rarity
  mark, matchup bar. Back (`.flipped`): matchup block, stats grid, range bar, injury line, "Full stats ›".
  Full spec: CARDS.md. (Moonlit is specified there and `--foil-moon` exists, but the app doesn't render it yet.)
- **Deck summary card** `.cd.sum.t-silver`: projected total `b` 50u/800 with Sleeper comparison pill (`.up / .down /
  .warn`), "Breakdown ›", and the **kickoff windows** list `.cd-sch` (panel `--surface-2`): one `.cd-w` row per window
  (day + kickoff time, e.g. "SUN 1:00p", "MON 8:15p", then BYE) with colored position dots for your starters in it; tap opens
  the window (`.open`). Then "Save lineup" (accent pill).

### Start / Sit (see START-SIT.md)
- Desktop `.ssd`: 290px sticky rail `.ssd-rail` (search, Your team / Available / All, position chips, `.ssr` checkbox
  rows with photo + proj) + main: verdict banner, `.ssg` grid (`--n` columns: head `.ssg-h` with photo, name, proj,
  START / SIT tag, "Details ▾"; rows for chance to score most, adds to lineup, projection, floor, ceiling, L3, opp vs
  position, usage, status, last-5 bars; best value per row in accent). Details panel `.ssd-detail`.
- Phone `.ssp`: stacked `.ssp-card`s (tap expands), sticky footer `.ssp-foot` (above the tab bar) and picker sheet
  `.ssp-sheet` over `.ssp-scrim`.

### Sleepa Intel (see design/intel/INTEL.md)
- **Tiles** `.it-tile` (Slate on phone, List on desktop, grouped by kickoff window `.it-win`): overlapped team marks `.it-pair` > `.it-tm` (Sleeper logo inside a 2.5px team-color ring, abbreviation fallback), title, O/U badge `.it-ou` + spread + temp, env number `.it-env` (tones: `t-fav` green, `t-neu` plain text, `t-tough` red), my-player dots and flags `.it-flag.warn / .neutral`.
- **Game page** `.it-page` (phone carousel card) / `.it-detail` (desktop two-column grid): hero `.it-hero` (logos, records, projected QBs `.it-qb`, kickoff + countdown `.it-cd`, O/U badge), env ring card `.it-envc` (92px ring), implied score (`.it-imp` + 14px tug bar `.it-tug` + script meter `.it-meter`), My players `.it-pr` (slot tag, ringed photo, weather lean chip `.it-lean.up/.down`, 2-decimal projection), rooting guide, Players to watch `.it-wr` (Free agent / Yours tags), Injuries `.it-injr` (status chips), Weather `.it-wx` (temp, feels-like, avg wind + gusts, rain, 4 game hours, sunset, Open-Meteo credit; `.in` frosted when indoors), Venue, Home-field edge (`.it-bar` with the league-average tick + "within the normal range" note), Rest & travel `.it-rt`, Defense vs position `.it-dv.good/.bad`, Betting (`.it-bets`, line-movement sparkline `.it-move`), Form `.it-fr`, Head to head `.it-h2h`, Sidelines `.it-coach` (photo in team ring, initials fallback, photo credit). Every card is a `.card.it-card` (radius 14, `--shadow` + hairline).
- **Carousel** `.it-ov` (z-index 105, above full views): header (44px back, title + scope label, n / N), 3 rendered pages that slide (.38s `--ease`), floating pill bar of game pills (`.zn-dot.it-pill`, active = surface-3); centered at 760px on wide screens.
- **Desktop Cards**: `.it-rc` ring cards (600 × 340, the Zone ring recipe with --o / --ao), pills, then the detail grid. **Focus lift** `.it-lift` (scrim + 6px blur, 680px panel with a 2px accent ring, FLIP from the tile, .35s spring).
- **Chips elsewhere** `.it-chip` ("ENV 49" + first warn flag; `.pf` larger with the matchup, `.zn` tiny in Zone rows) and Huddle window game lines `.cd-gl` (Dark Chrome, --u units). States: no lines ("—", "Lines not posted yet"), stale (warn chip "Lines · updated n h ago"), forecast unavailable, indoors, roof TBD, neutral site.
- Motion: tug bar grows .9s from the left; env score and projections count up 650 ms once per game; all off under reduced motion.

### Toasts
- `.h2h-tray`: fixed, bottom 24px, centered, max 480px, surface + `--shadow-lg`, "Added **Name**" + action
  ("Start / Sit (3) ›"), auto-hides after ~5s.
- `.pr-toast` (Huddle): same shape, bottom 100px, with an Undo button. One toast at a time; `role="status"`.

### Sheets
- Phone player sheet: `.overlay.open` (scrim + blur, fade .25s) > `.focus-panel` (radius 24, `--shadow-lg`,
  `focusIn` .35s spring, top tint from the team color `--team`). Desktop shows the same content in the side pane.
- Start / Sit picker: `.ssp-sheet` from the bottom, height min(600px, 86vh), radius top, grab handle.
- Full-screen view `.max` (player page, roster, trade): slides / clips in from the element that opened it, "Back to …"
  bar.

### Popovers
- League menu `.brand-menu` / `.league-menu`: 300px, max 60vh, radius 14, `--surface`, `--shadow-lg`; rows
  `.league-item` (avatar, name, meta, check on current). Opens under its trigger; Esc / outside tap closes.
- `.zbd`, `.cb-pop`, `.cd-legend`: same recipe (radius 16, `--shadow-lg`, inset hairline).
- Universal search `.ck` and shortcut sheet `.kb-help`: centered dialogs over a blurred scrim.

### Keyboard
Every list has a highlight (`.kb-hl`): ↑/↓ move, Enter goes deeper, Space toggles, Esc backs out; letters jump
between pages (L P E C Z H, `/` search, `?` help). New views must expose their rows to this (see PROJECT_CONTEXT.md
"Keyboard").
