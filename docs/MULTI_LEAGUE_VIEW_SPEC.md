# Sleepa Zone: Spec and Context

**Sleepa Zone** is the name of this view: Sleepa's own take on RedZone, built around following all my leagues at once. Use "Sleepa Zone" as the user-facing name (entry button, view header, settings guide). Keep it in a single constant so it is a one-line change if it ever moves.

Read this whole file before doing anything. It covers the full goal, but the work ships in two phases. **Phase 1 (core view) is built first. Phase 2 (live feed) comes later.** Build Phase 1 so Phase 2 can plug in without a rewrite.

Also read `PROJECT_CONTEXT.md` for how Sleepa is built. If anything here conflicts with existing code, tell me before changing existing behavior.

---

## 1. Goal

While NFL games are on, I want one place to follow **my team in every one of my Sleeper leagues** against each opponent: actual points, projections, who has yet to play, which of my players are in the red zone, and (Phase 2) what just happened. I mostly use Sleepa on my iPhone, so mobile is the primary experience. The app is hosted on GitHub, so assume it is a static client-side app unless the repo shows otherwise. No secret keys can live in the page.

This is **additive**. Do not replace or change existing views.

### Non-goals
- **No push notifications** (not now).
- No paid data sources.
- (Correction: a league-wide NFL play feed is possible. The undocumented Sleeper `plays` query returns every game's plays for the week. It is a Phase 2 feature, see section 7. Phase 1 does not include any feed.)
- No lineup editing.

---

## 2. Phases

### Phase 1: Core view (build first)
- Entry point, carousel, compact list, desktop grid, week navigation, refresh.
- Actual vs projected display, expandable starters list (per-player actual, projected, game status).
- Red zone badge, animated score counters, lead-change flash, live-first sorting.
- The settings guide (section 6.3), covering the rules that exist in Phase 1.
- **No event feed yet.**

### Phase 2: Live feed (build after Phase 1 is working)
- Play-by-play scoring feed for starters in my matchups, with for/against tagging and the impact color system.
- Local storage of the week's events with incremental updates and a weekly reset.
- Add the for/against and feed sections to the settings guide.
- See section 7. Do not build this in Phase 1, but leave a clearly marked place for it in the layout and data layer.

---

## 3. Entry and navigation

- Add a "Sleepa Zone" button to the areas where I already switch leagues (the logo dropdown and settings) that opens the view **full screen**.
- Leaving the view returns me to the league I came from, and the view opens on that league's card by default.
- One carousel card = one of my leagues (my team vs my opponent). I do not want every matchup in the league.

---

## 4. Phase 1 requirements

### 4.1 Mobile (primary)
- **Carousel is the default view.** Full-screen, horizontal, one league per card. Swipe left/right snaps to the next league and never rests between cards.
- Use native CSS scroll-snap (`scroll-snap-type: x mandatory`) rather than a JS gesture library. iOS Safari's edge-swipe back gesture can fight custom gesture code.
- **Carousel order stays stable** (my league order) so swiping is predictable. Show a small live dot on a league's indicator when one of its games is live.
- League name shown at the bottom as the indicator. A small number is fine too. Tapping the indicator jumps to that league.
- Each card shows: my team vs opponent (team name, avatar if Sleepa already loads them), team totals, and week status.
- **Expandable/collapsible starters section** per card: my starters and my opponent's starters, each with actual points, projected points, game status (not started / live with quarter and clock / final), a red zone badge when applicable, and injury or out status where available. Collapsed by default.
- **Compact list view** reachable from the carousel: small tiles, one per league, scrollable vertically. Each tile shows the **actual** score, me vs opponent, large. Below it, much smaller, gray, clearly labeled "PROJ", the projected scores for both. Tapping a tile opens the carousel on that league.
- **Live-first sorting:** in the compact list, leagues with live games float to the top. Within each group (live, then upcoming, then final), keep a stable order. Re-sort smoothly, without jumpy layout shifts (animate position changes gently).

### 4.2 Desktop
- **Carousel is still the primary view.** Same horizontal model: click, swipe/trackpad, or left/right arrow keys. Give it a modern "lazy Susan" feel: cards rotate with depth (CSS perspective/transform) and smooth easing. Keep it refined rather than flashy. Honor `prefers-reduced-motion` by falling back to a simple slide or fade.
- A toggle button switches to **Grid view**: a responsive grid of bordered matchup cards for all leagues (quad-box style, scales with screen size and league count), with the same live-first sorting as the compact list. Clicking a card opens the carousel on that league.
- The grid's full player-score feed is Phase 2. In Phase 1, reserve the space (a labeled placeholder is fine).

### 4.3 Week logic
- Default to the current NFL week and stay on it until the week ends. **Roll to the next week on Wednesday.**
- A control lets me move to future weeks (and back). Future weeks may have no actuals and possibly no matchups or projections. Handle that cleanly.
- Use Sleeper's `state/nfl` for the week, then apply the Wednesday rollover rule.

### 4.4 Refresh
- A refresh button that updates only what matters live: my and my opponents' points, projections, and player status (out/injured/game status/red zone). **Do not re-pull heavy data** (the full players file, rosters, users) on every refresh. Cache those and refresh them rarely (players about once or twice a day).
- Show a "last updated" time next to the button.
- Auto-refresh every 30 to 60 seconds **only while at least one relevant game is live**, pause when the tab is hidden, stop when all games are final. The manual button always works.
- Sleeper's matchups endpoint is already polled during games elsewhere in Sleepa. Reuse that logic.

### 4.5 Actual vs projected (important)
Make it **visually unmistakable** which numbers are actuals and which are projections.

| State | Primary number | Secondary |
|---|---|---|
| No relevant game started | Projection, labeled "PROJ" | none |
| Games in progress | **Actual** (large, bold) | Projected final, small, gray, labeled |
| All my starters' games final | Actual only | none |

- **Projected final** = for each starter: final game → actual; game not started → projection; game live → actual plus a share of projection based on time remaining (an estimate; a simple approach is fine, document it). Sum across starters. Label it as an estimate.
- Show "N yet to play" per side when game status is known.
- **All scores and projections display to two decimal places (###.##)** to match Sleeper.

### 4.6 Red zone badge
- When a starter's team is currently in the red zone, show a small, tasteful red zone badge next to that player (and optionally a subtle indicator on the card header showing how many of my players are in the red zone).
- Source: Sleeper's `scores` endpoint exposes red zone status alongside down and distance (undocumented; verify the exact field). If ESPN's scoreboard is easier to use for this, that is fine.
- Design it as a small pill with a soft red tint, not a loud alert. At most a slow, gentle pulse. It disappears when the drive ends.

### 4.7 Edge states (each needs an explicit design)
Bye week, eliminated from playoffs, no opponent, median-score leagues, future weeks with no data, league with no matchup yet, network failure, stale data. None should break the carousel.

---

## 5. Data sources (verified in a research spike; no games were live so update speed is unverified)

Use these, in this order of preference. **Verify anything marked (undocumented) still works before relying on it.**

| Need | Source | Notes |
|---|---|---|
| Leagues, rosters, users, week | Sleeper official API (`user`, `leagues`, `rosters`, `users`, `state/nfl`) | Public, read-only, CORS open. Stay under 1000 calls/min (personal use is far below). |
| Actual points, live | `v1/league/{id}/matchups/{week}` | Returns `points`, `starters`, `starters_points`, `players_points`, already scored with each league's settings, IDP included. 60s CDN cache. One call per league per refresh. |
| Game status, clock, red zone | ESPN scoreboard (already used in Sleepa), or Sleeper `scores/nfl/regular/{season}/{week}` (undocumented) | Sleeper `scores` gives `is_in_progress`, `is_over`, quarter, `time_remaining`, down/distance, red zone. Needs no ID mapping. |
| Projections | `projections/nfl/{season}/{week}` (undocumented) | Raw projected stats, including IDP. Score them with each league's `scoring_settings`. Sleepa's Power Rank feature already does this; reuse it. |
| Raw stats | `stats/nfl/{season}/{week}` (undocumented) | Multiplying raw stats by `scoring_settings` matched Sleeper's own `players_points` for 436 of 436 players across my IDP and PPR leagues. |
| Play-by-play (Phase 2) | Sleeper GraphQL `sleeper.com/graphql`, `plays` query (undocumented) | See section 7. |
| Injury status | ESPN injuries (already in Sleepa) plus Sleeper player data | Cache. |

Player ID mapping: Sleeper IDs are native in all Sleeper endpoints. ESPN mapping goes through the dynastyprocess ID map already used in Sleepa (about 90% offense, 82% IDP; unmatched are mostly 2026 rookies, use name + team fallback).

Undocumented endpoints are fine for a personal app but can change without notice. Wrap them so a failure degrades gracefully instead of breaking the view. Do not add any paid data source.

---

## 6. Design language

### 6.1 Feel
**Clean, subtle, and satisfying.** Alive, but not sporty. Think Apple-style restraint: generous spacing, quiet typography, soft borders and shadows, gentle spring easing. **Match Sleepa's existing look and tokens; do not introduce a new visual language.** Motion should be something you notice only when it is missing. Keep the two-decimal formatting everywhere. When in doubt, make it quieter.

### 6.2 Motion (all subtle, all skipped under `prefers-reduced-motion`)
- **Animated score counters:** when a score changes between refreshes, the number rolls or ticks to the new value over roughly 300 to 500 ms with a soft ease. No animation on first load, only on changes.
- **Lead-change flash:** when the lead flips between me and my opponent, the card's border or score softly highlights and fades over about a second, with a small "Lead change" label that fades in and out. No shaking, no confetti, no sound.
- **Red zone badge:** static, or at most a very slow gentle pulse.
- **Live dot:** a small dot on live leagues and games.
- **Live-first re-sorting:** gentle position animation.
- Carousel (mobile snap, desktop lazy Susan): smooth and refined.

### 6.3 Settings guide: "How Sleepa Zone reads the game"
Add a small info icon in Settings (and optionally in the Sleepa Zone header) that opens a **condensed, collapsible guide** explaining the rules and logic used throughout Sleepa. Use accordion sections, collapsed by default, short and plain-language. It should be easy to extend as features ship.

Phase 1 sections: actual vs projected (and what PROJ and "projected final" mean), game status and "yet to play", the red zone badge, live dot and live-first sorting, lead change, refresh behavior and update timing, and week rollover.
Phase 2 sections (add later): the impact color system, MINE/OPP/multi-league chips, and how the live feed works.

### 6.4 Impact color system (used mainly in Phase 2, but define the tokens now)
**Color always means the effect on ME. Ownership is shown separately (position and a chip), never by color.**

| Color | Meaning |
|---|---|
| Green | Helps me (my player scores, or an opponent player loses points) |
| Red | Hurts me (an opponent player scores, or my player loses points) |
| Amber | Mixed: the player is for me in one league and against me in another |
| Gray | Neutral or zero |

- Negative points flip the color: my player's fumble lost is red; my opponent's lost fumble is green.
- Ownership: my players appear under my team name (left/my side); opponent players appear under the opponent's name (right side). In a combined feed, use a chip: `MINE`, `OPP`, or a multi-league chip like `3 for · 1 against`.
- Magnitude: bigger swings get stronger intensity (a touchdown is louder than a 2-yard run), still within the subtle feel above.
- Not color-only: also use ▲/▼ and explicit signs so it works for color-blind users.
- Multi-league math: for each play, impact per league is `+points` if the player is my starter, `-points` if the player is my opponent's starter. The combined feed shows the net impact and colors amber when the player is on both sides across leagues.
- Keep the green/red/amber tokens soft and consistent with the rest of Sleepa's palette, not neon.

---

## 7. Phase 2: Live feed (do not build yet; design Phase 1 so this fits)

**Scope:** two feed modes, switchable with a simple toggle.
- **My players (default):** events for starters in my matchups (mine and my opponents'), across all my leagues, with for/against tags and the impact colors. Each carousel card shows that matchup's events inside the expandable starters section, with opponent events under the opponent's name and mine under mine.
- **All NFL:** a league-wide feed of scoring plays across every game (the `plays` payload already contains them, so no extra request is needed). Events involving my players or my opponents' players keep their for/against tag and impact color. Everything else is shown neutral (gray) with no fantasy points, because points depend on a league's scoring settings. Where possible, mark players as "not on any of my teams".
- The desktop grid view gets the full combined feed with the mode toggle. Whether the All NFL mode also appears on mobile is my call after seeing it on desktop.
- Storage note: keep every play involving my or my opponents' starters, but for All NFL store only scoring plays (`is_scoring_play`) to keep local storage small.

**Source:** Sleeper GraphQL `plays` query. Returns play `description`, `fantasy_description`, `is_scoring_play`, clock, and per-play stats keyed by **Sleeper player IDs**. Summing per-play stats reproduced weekly totals exactly in testing.

**Known caveats:**
- The query ignores the per-game filter and returns the whole week. About 3,000 plays and roughly 440 KB compressed on a heavy Sunday. A date filter alone returned only about 20 plays. Investigate whether a date/cursor filter can fetch only new plays.
- Per-play fantasy points: plain stats score correctly per play, but threshold bonuses (100+ yards) and defensive points-allowed bands do not split by play. Fix: rescore each player's **running total** after every play and show the change.
- Fallback if the GraphQL feed breaks or is locked down: diff each player's `players_points` between refreshes and show "Player +6.20" without play text.

**Storage and incremental strategy (required):**
- Store feed events locally per season and week (IndexedDB or localStorage), each keyed by play ID so duplicates are impossible.
- On opening the view, **backfill**: fetch the week's plays once, keep only starters from my matchups, merge with what is stored. This means opening the app mid-Sunday still shows the earlier events.
- After that, poll only while games are live, and merge only new plays (use a cursor or date filter if the live test shows it works).
- **Reset at week rollover** (same Wednesday rule): clear the old week and start fresh.
- Storage is per device. That is fine.

**Extras that fit the feed:** lead-change events in the feed, and red zone entries if simple.

**Open live-testing questions (to be checked on a game day):** how fast `plays` updates during a live game, whether it updates per play or in batches, real payload size on a Sunday afternoon, whether a date/cursor filter shrinks each request, and how fast matchups and `scores` refresh.

---

## 8. Working agreement for Claude Code

1. **Explore first.** Read `PROJECT_CONTEXT.md` and the existing code (league switching, matchups polling, Power Rank projection scoring, ESPN scoreboard usage, caching, design tokens). Summarize what you will reuse.
2. **Plan before coding.** Write a short plan for Phase 1, including file structure and how Phase 2 will plug in, and ask me any questions that block a good build.
3. **Do not break existing views.** This is additive.
4. **Reuse** existing data, scoring, and styling utilities. Do not duplicate them.
5. **Test with real data.** If no games are live, use last week's finished games and say what could not be tested live.
6. Mobile first, then desktop. Verify on an iPhone-sized viewport.
7. Two decimals everywhere for points.
8. Keep motion subtle and respect `prefers-reduced-motion`.
9. Update `PROJECT_CONTEXT.md` when each phase ships.
10. Report what you built, what you verified, and what remains, at the end of each phase.
