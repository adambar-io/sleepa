# Parity scorecard

This file tracks what Sleeper, ESPN and FantasyPros (including Premium) do, and where Sleepa stands on each, so we can pick what to build next. Update the status when something ships or a decision is made.

- Research: Oct 1 2026, from FantasyPros plan pages, ESPN 2026 feature notes and Sleeper feature guides.
- Status last checked: Oct 16 2026 (win probability chart and FAAB bids shipped).

**Status:** ✅ done · 🟡 partial · 📋 planned / next · ⛔ won't do (and why)

**Fit:** how well the idea suits Sleepa, which is free, read-only and has no server.

## Tools

| Feature | Who has it | Sleepa | Status | Notes / next step |
|---|---|---|---|---|
| Lineup optimizer | FantasyPros, ESPN | Optimal lineup with flex rule, lock after kickoff | ✅ | |
| Live win probability | ESPN, Sleeper | Matchup tile, Zone, Scoreboard | ✅ | |
| Win probability chart over the game | ESPN | Rebuilt play by play from Sleeper's play-by-play: matchup view, every Scoreboard matchup, Lineup sparkline, 3 biggest swings | ✅ | Works without the app open during games. Sleepa advantage: it covers every matchup in every league. |
| Playoff odds / season simulator | FantasyPros League Analyzer | League tab says "No playoff odds" | 📋 **next** | Simulate the remaining schedule from projections and score spreads. Fit: high. |
| FAAB bid suggestions, ordered waiver plan | FantasyPros Waiver Planner | Bids from what your league actually paid; Conservative / Balanced / Aggressive; rival budgets; waiver plan with running total | ✅ | Priced from your own league's claim history, not a generic chart. |
| Strength of schedule (rest of season, playoff weeks, by position) | FantasyPros | Defense-vs-position per game in Intel; trade value can double playoff weeks | 🟡 | A per-position rest-of-season and playoff schedule grid. Fit: high. |
| Pre-kickoff inactive-starter alert | FantasyPros Auto-Swap, Sleeper / ESPN push | Inactive check card on Lineup, Injuries "Needs action" | ✅ | Sleepa can't swap the player itself (no write API). |
| Injury downgrade alerts | Sleeper, ESPN push | Lineup bell plus browser alerts while a Sleepa tab is open | 🟡 | True push needs an installable app (PWA) and a push server. |
| Injury center | ESPN, FantasyPros | Intel › Injuries: three sources, what changed, opportunity watch, practice trend, returning soon, feed | ✅ | |
| Multi-league dashboard | ESPN, FantasyPros Multi-League Assistant | Sleepa Zone plus Scoreboard, all leagues | ✅ | |
| Weekly to-do list ("set lineups", "waivers clear tonight") | ESPN, FantasyPros | None | 📋 | A strip on Lineup or Zone. Fit: medium. |
| Trade analyzer / finder | FantasyPros, Sleeper | Trade builder plus Trade Finder | ✅ | |
| Start / sit | FantasyPros, ESPN | Compare › Start / Sit | ✅ | Could borrow FantasyPros' confidence wording. |
| Rankings consensus | FantasyPros | FantasyPros, Sleeper and ESPN ranks, tiers, FantasyCalc | ✅ | |
| Usage and expected points | FantasyPros (partial), paid sites | xFP, Pts − xFP, Trends chart | ✅ | |
| AI coach (plain-language questions) | FantasyPros Coach AI, ESPN + watsonx | None | ⛔ for now | Needs an API key and a server. The action registry (`ACTIONS`) is the groundwork if this happens. |
| Trade block, community sentiment, chat | Sleeper | None | ⛔ | Social data Sleepa can't get. |
| Setting lineups, making claims | All three | Planner only | ⛔ | Sleeper has no public write API. |

## Data

| Feature | Who has it | Sleepa | Status | Notes / next step |
|---|---|---|---|---|
| Career and last-season stats on player cards | ESPN | This season only | 📋 **next** | nflverse has every season for free. Fit: medium-high. |
| Start % / roster % across the platform | ESPN, Sleeper | None | ⛔ | No free source. |
| Ownership across your own leagues | (none of them) | Player page, Injuries tags | ✅ | Sleepa advantage. |
| Game environment (lines, weather, venue, rest) | Partial on paid sites | Sleepa Intel | ✅ | Sleepa advantage. |
| Data freshness and coverage you can see | (none of them) | Settings › Data health | ✅ | Sleepa advantage. |

## Layout and look

| Feature | Who has it | Sleepa | Status | Notes / next step |
|---|---|---|---|---|
| Big head-to-head scoreboard | Sleeper | Matchup tile, Zone cards, Scoreboard | 🟡 | The Lineup matchup could borrow Sleeper's larger score. |
| Live play feed | Sleeper | Zone play feed, Biggest plays, game sheet | ✅ | |
| "What needs attention" home | ESPN | Inactive check, roster check, bell | 🟡 | Pair it with the weekly to-do strip above. |
| Installable app / home-screen presence | ESPN (Live Activities), Sleeper | Website only | 📋 | A PWA would also unlock real push alerts. Fit: medium. |
| Deep links into any page or player | All three apps | `#/intel/injuries`, `#/player/{id}`, … | ✅ | |
| Universal search and keyboard shortcuts | (rare) | `/` or Ctrl K, letter keys, `?` cheat sheet | ✅ | Sleepa advantage. |

## Suggested order

1. Playoff odds (season simulator)
2. Rest-of-season and playoff strength of schedule
3. Last-season stats on the player page
4. Weekly to-do strip
5. PWA

## Sources

- [FantasyPros premium plans](https://www.fantasypros.com/premium/plans/sm/)
- [FantasyPros: best fantasy football tools 2026](https://www.fantasypros.com/2026/07/best-fantasy-football-tools/)
- [ESPN 2026 press release](https://espnpressroom.com/press-release/espn-fantasy-football-celebrates-being-named-official-fantasy-game-of-the-nfl-with-new-features-games-campaigns-and-more/)
- [ESPN + IBM watsonx insights](https://betanews.com/2025/09/24/espn-fantasy-football-adds-ai-powered-weekly-insights-from-ibm-watsonx/)
- [Sleeper app features guide](https://lordskunk.com/guides/sleeper-app-features/)
