# Sleepa Zone: live test (run during a live NFL game)

**Status:** not run yet. Sleepa Zone Phase 1 (all-leagues view) and Phase 2 (live play feed, built Sept 30 2026) are both done. This test measures real live timing so the feed's polling can be tuned. There is no Phase 3 in the spec.

**When:** while an NFL game is live (first chance: Thursday night, Oct 1 2026).

## Prompt to give Claude Code

> This is a live test during an NFL game. Do not change app code. Read section 7 of docs/MULTI_LEAGUE_VIEW_SPEC.md, then measure and report: how often the Sleeper GraphQL plays query returns new plays during a live game and whether they arrive per play or in batches; the real payload size; whether a date or cursor filter shrinks each request; how quickly league matchups points and the Sleeper scores endpoint change after a scoring play; and whether the scores endpoint's red zone field is present and accurate (note the exact field name). Log timestamps so I can see the delays. Summarize with concrete numbers.

## Notes for whoever runs it

- Read-only: poll from a scratch script with timestamps; don't edit index.html during the test.
- What's already known (Sept 29, no live games): `plays(sport, season, season_type, week)` works without login (CORS `*`); with `week` it returns the whole week (~440 KB gzipped, 2.5–12 s) and ignores `game_id` / `date`. `plays(game_id)` **without** `week` returns that game's newest 20 plays (~18 KB, ~70 ms): the app polls that while live. Matchup points are cached ~60 s by Sleeper's CDN.
- Unverified until a live game: red zone fields (Sleeper `scores` `red_zone` / `possession`, ESPN `situation.isRedZone`), real play arrival cadence, feed latency.
- Afterwards: tune the 30 s live poll and the 8-minute backfill threshold in the Sleepa Zone feed code (`zoneSources`, `zFeedLoad`), and record the numbers in PROJECT_CONTEXT.md.
