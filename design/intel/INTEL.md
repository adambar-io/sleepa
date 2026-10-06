# Sleepa Intel: handoff (v2, on the Sleepa design system)

Mockups: `Sleepa Intel v2.dc.html` (canvas). Components: `Intel Phone.dc.html` (props: theme, view = entry | game | slate | lineup | zone, game 0-4, hero A | B, lines live | stale | none, scroll, scope) and `Intel Desktop.dc.html` (props: theme, view = ring | list, game, focus). Tokens: `TOKENS.css`, rules: `DESIGN_SYSTEM.md`. Everything is styled with token variables only. All data below is mock; field names are proposals.

## Where Intel lives
Intel is its own destination and also opens from other screens.
- **Own space:** phone tab bar item "Intel" (opens the Slate list, My / All toggle). Desktop sidebar item "Intel" (opens the ring carousel, Cards / List toggle).
- **Entry points** (all open the game carousel on that game, back returns to the origin):

| Entry | Trigger | Scope label |
|---|---|---|
| Huddle deck summary | game line inside a kickoff window | Week 5 · My games |
| Lineup | game chip on a player row ("PIT@CIN · ENV 49") | Week 5 · My games |
| Zone | game chip on a player row | My leagues' matchups |
| Player page | game line | Week 5 · My games |
| Start / Sit | GAME ENVIRONMENT rows | Comparing n players |
| Intel tab / sidebar | Slate tile, ring card | Week 5 · My games |

## Reused from the system (unchanged)
Dark Chrome summary card with `.cd-sch` kickoff windows; `.slot-tag`, position-ringed photo and `.player-info` row anatomy; status-chip recipe for flags; dvp chips (accent-soft / danger-soft / surface-2) for defense vs position; `.zn-dot` pill style for game pills; Zone ring recipe (perspective 2000px, translateX(-50% + o·88%), translateZ(-ao·200px), rotateY(-o·32deg), opacity 1 − ao·.62, .65s); `.zn-tile` list with focus lift; floating tab bar (64px pill); desktop sidebar; page-head; eyebrows; surface cards with `--shadow` and inset hairline; `--ease` / `--spring`.

## Added (not in the kit)
1. **Game Environment score**, 0-100. Tone via --mt-fav (≥60), --mt-neu (≥40), --mt-tough. Formula below is a guess to tune.
2. **Team monogram**: 60px (phone hero) / 40px circle, `--surface-2` fill, 2.5px ring in the team color, abbreviation inside. Claude Code: replace with the Sleeper team logo (`img[src*="/team_logos/"]`) and keep the ring.
3. **Implied-score tug bar** (14px, away share in `--text`, home `--surface-3`, midpoint tick) and **game-script meter** (8px track, 18px dot at (total − 34) / 26, tick at avg 45).
4. **Flag chips**: status-chip recipe, text only. Weather flags `--warn-soft`/`--warn`; neutral flags `--surface-2`/`--text-2`. Never position or impact colors.
5. **Game pills** in the phone bottom bar: 3 around the active game, active = `--surface-3` + `--text`.
6. **Intel nav item** (phone tab + desktop sidebar), icon: sun/target glyph, stroke 1.8.
7. **ENV + flag chips** on Huddle window game lines and on Lineup / Zone row game chips.

## Phone game page (375, vertical scroll)
Header: back (44), "Intel" + scope label, "n / N". Layers: (1) hero: monograms, kickoff `DAY time`, countdown in `--accent`, venue; implied-score card (tug bar + script meter); variant B adds the 96px ring card. (2) decision strip: "My players in this game" rows (slot tag, photo, name, `TM · vs OPP`, proj 2 decimals, FOR / AGAINST chip), Mine / Against sums, rooting guide, weather impact chip + flags. (3) depth cards: Weather, Venue, Home-field edge, Rest & travel, Defense vs position, Betting.

## Desktop
Main = page-head (eyebrow, h1, Cards / List and My / All segmented controls). **Cards**: 460px game cards on the Zone ring, game pills below, then detail: My players table (Slot, Player, Matchup chip, Proj, Side), rooting guide, Rest & travel, Home-field edge; right column Implied score + script, Weather, Defense vs position, Betting. **List**: 3-column tile grid by kickoff window, Detailed / Condensed toggle; click lifts the tile (680px, `--shadow-lg`, 2px `--accent` ring, env 46px) over the scrim + 6px blur; `focusIn` .35s spring; Esc or outside click returns it (FLIP).

## Derived values (guesses, tune with real data)
- Implied: favorite (total + spread) / 2, underdog (total − spread) / 2.
- Script: total ≥ 50 Shootout, ≤ 42 Slog, else Balanced.
- Weather penalty: wind ≥ 15 → 10 (≥ 10 → 4); precip ≥ 50 → 10 (≥ 30 → 3); temp ≤ 32 → 6; indoor 0. Impact ≥ 10 High, ≥ 4 Med, else Low.
- Environment: `50 + (total − 45) × 2.2 + (indoor ? 6 : 0) − penalty`, clamp 0-100.
- DvP chip: rank ≤ 8 ▲ accent-soft, ≥ 25 ▼ danger-soft, else ● neutral. Kickers have none.
- Rest ≤ 5 days = short week (warn). Time zones crossed noted.
- FOR = my starter; AGAINST = my opponent's player in the same game. Sums use 2-decimal projections.

## Flags
Wind ≥ 15 mph, Rain ≥ 50%, Cold ≤ 32°F, Roof TBD (warn); Dome, Short week, Shootout ≥ 50 (neutral). Shown only when notable. Huddle cards: max 2 then "+n". Start / Sit grid "GAME ENVIRONMENT" group: game total, team implied, weather impact, home / away, days rest; best value accent + bold; each row opens Intel.

## States
Clear outdoor, rain and wind (warn values), dome (frosted wash), retractable roof TBD, closed roof (treated as indoor), international (neutral site, no home-field edge), short week, no lines (dashes, "Lines not posted yet"), stale ("Lines · updated 6h ago" warn chip).

## Motion
Tug bar `sl-bar` .9s scaleX from left. Rain streaks 1.4s linear loop at 70% opacity. Ring turn .65s `--ease`. Focus lift `focusIn` .35s `--spring`. Count-up of the env score and projections, 650ms to the exact value (not in mocks). Reduced motion: no drift, no count-up, bar and lift appear instantly.

## Data fields (proposed)
game.away / home (Sleeper team ids → logo + color), game.kickoff, venue {name, city, roof, surface, altitude}, lines {spread, total, favorite, moneyline, history[], updatedAt}, weather {temp, windMph, windDirDeg, precipPct, hourly[], updatedAt, roofStatus}, venue.homeWinPct / atsRecord / avgMargin / sampleN, team.restDays / tzCrossed, defense.rankAllowed[QB RB WR TE], roster players {id, pos, team, opp, league, projection, side}.

## Not designed
Live-score handoff, loading skeletons, a wider desktop game layout beyond the detail grid, All-games Slate data.

---

## Build decisions (Oct 6 2026, with the owner) — these override the mock where they differ
- **Navigation:** phone tab bar: Intel replaces Resources (Resources moves into Settings as a row). Desktop: Intel in the sidebar, under the Sleepa Zone entry. Letter key **I**.
- **Whose players:** inside a league (Intel tab, Lineup, Huddle, player page, Start / Sit) "My games" = games with a **starter in the current league's lineup** (bench doesn't count); scope label "Week 5 · My games · <league>". Opened from **Sleepa Zone**: every starter across all leagues, one row per player with league tags; scope "Week 5 · All my leagues". "All games" stays as the other side of My / All.
- **My players only:** no AGAINST rows, no Mine vs Against sums. The strip is "My players in this game" with a total; the rooting guide only says what helps my players.
- **Current week only** for v1 (no week switch).
- **No pink header wash:** it was a design-tool artifact; normal surfaces.
- **Sportsbook numbers:** "CIN −3 · O/U 46.5" (−3, not −3.0), moneylines "+130 / −155", "PK".
- **Tuning:** wind >= 15 mph penalty 6 (not 10); dome bonus +6; everything else as above, all in `INTEL_TUNE` in index.html.

## Data, as built (phase 1)
- `nflverse.json` → `intel` (build_nflverse.py `build_intel`): `{ week, generated, edge_seasons, home_base, games: { <game_id>: { id, away, home, day, kick, venue, vname, surface, roof, div, intl, neutral, rest {away, home}, lines {spread, total, ml {away, home}}, rec, ats, tz {away: [homeTz, venueTz], home}, edge {win, n, margin, ats} } } }`. spread is nflverse's: positive = HOME favored.
- `intel_venues.json` (static, hand-maintained): per stadium_id name, city, lat / lon, alt (ft), roof (outdoor | dome | retractable), tz, intl, aliases.
- `line_history.json` (Action): `{ season, week, games: { <game_id>: [[iso, spread, total], ...] } }`, a snapshot whenever the line changes.
- Weather: Open-Meteo hourly forecast from the browser at the venue, kickoff hour to +4 h (temp at kickoff, max wind / rain over the game), cached 30 min; skipped indoors; attribution "Weather data by Open-Meteo.com" (CC BY 4.0).
