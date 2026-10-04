# Sleepa Zone: live test (run during a live NFL game)

**Status:** run Sunday Oct 4 2026 (see "Results" at the bottom; matchup-points delay only partly measured, rerun wanted). Sleepa Zone Phase 1 (all-leagues view) and Phase 2 (live play feed, built Sept 30 2026) are both done. This test measures real live timing so the feed's polling can be tuned. There is no Phase 3 in the spec.

**When:** while an NFL game is live (first chance: Thursday night, Oct 1 2026).

## Prompt to give Claude Code

> This is a live test during an NFL game. Do not change app code. Read section 7 of docs/MULTI_LEAGUE_VIEW_SPEC.md, then measure and report: how often the Sleeper GraphQL plays query returns new plays during a live game and whether they arrive per play or in batches; the real payload size; whether a date or cursor filter shrinks each request; how quickly league matchups points and the Sleeper scores endpoint change after a scoring play; and whether the scores endpoint's red zone field is present and accurate (note the exact field name). Log timestamps so I can see the delays. Summarize with concrete numbers.

## Notes for whoever runs it

- Read-only: poll from a scratch script with timestamps; don't edit index.html during the test.
- What's already known (Sept 29, no live games): `plays(sport, season, season_type, week)` works without login (CORS `*`); with `week` it returns the whole week (~440 KB gzipped, 2.5–12 s) and ignores `game_id` / `date`. `plays(game_id)` **without** `week` returns that game's newest 20 plays (~18 KB, ~70 ms): the app polls that while live. Matchup points: measured Oct 4, CDN cache up to ~17 s, values move in batches every ~20-60 s (see Results).
- Unverified until a live game: red zone fields (Sleeper `scores` `red_zone` / `possession`, ESPN `situation.isRedZone`), real play arrival cadence, feed latency.
- Afterwards: tune the 30 s live poll and the 8-minute backfill threshold in the Sleepa Zone feed code (`zoneSources`, `zFeedLoad`), and record the numbers in PROJECT_CONTEXT.md.

## Results

### Run 1: Sunday Oct 4 2026, 19:39-19:51 UTC (3:39-3:51 pm ET), week 4, 8 games live, all in the 4th quarter
Read-only Node poller (15 s ticks), no app code changed.

- **Plays arrive one at a time, not in batches.** `plays(game_id)` (newest 20): of 107 polls that returned new plays, 97 had exactly 1 new play, 2 had 2, 0 gaps. A 15 s poll never missed a play.
- **Payload:** 19-22 KB raw per game, ~100 ms typical, 295 ms worst. About 160 KB raw per poll for 8 games. Whole-week query (`week: 4`): 1.7 MB raw, 1,614 plays, 2.3 s. `game_id` combined with `week` is still ignored (returns the whole week). A date or cursor filter was not tested; not needed, since newest-20 already works.
- **Delay:** median age of the newest play when first seen ~30 s (best 7 s, worst 148 s), which includes up to 15 s of poll interval. Sleeper's `updated_at` was only ~1.6 s old at detection (max 6 s), so a poll sees a play almost as soon as Sleeper has it. `time` and `updated_at` are in **milliseconds**.
- **Sleeper `scores` endpoint** (`api.sleeper.app/scores/nfl/regular/{season}/{week}`): 200-700 ms, CDN cache age never above 12 s. Red zone field is **`metadata.red_zone`**: the offense's team code (`"PHI"`) while in the red zone, empty string otherwise. Seen in 5 of 8 games, always matched the ball position (PHI at LAR 2, GB at TB 20, BUF at NE 15, LAR at PHI 1). It is true at exactly the 20-yard line, which agrees with the app's fallback in `zoneFetchScores`. Other useful fields: `possession`, `down`, `yard_line`, `yard_line_territory`, `down_and_distance`, `quarter`, `time_remaining`.
- **League matchup points** (`/v1/league/{id}/matchups/{week}`, 3 leagues polled every 10 s for 12 min): 208 player-point changes landed in only 18 of ~72 polls, in bursts of 3-20 players, gaps between bursts mostly 20-60 s, CDN cache age up to 17 s. So matchup points move in batches every ~20-60 s, not per play. The play feed runs ahead of them.
- **Not measured:** the exact delay from a scoring play to matchup points moving (the scoring-play logger caught none in the window); whether a play's stats are revised after first appearing; behavior during the early-Sunday kickoff surge. 5 transient `fetch failed` errors in 12 min; the poller recovered.
