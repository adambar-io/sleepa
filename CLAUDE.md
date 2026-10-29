# sleepa

Read `PROJECT_CONTEXT.md` first: it explains the app, its architecture and its gotchas. `index.html` is the app.

## Security rules (public repo, hardened Oct 29 2026)

Anyone can read this repo and its Actions logs. Keep it that way safely:

- **No secrets in files, ever.** Keys live only in GitHub repository secrets (today: `FANTASYPROS_API_KEY`) and reach
  scripts through `env:`. Scripts never print them. Secret scanning and push protection are on.
- **Actions are pinned to full commit SHAs** with the version in a comment
  (`actions/checkout@<sha> # v5.1.0`). Pin any new action the same way; Dependabot (`.github/dependabot.yml`)
  proposes updates weekly. Only GitHub-made actions are allowed in the repo settings: a third-party action will
  fail until it is added under Settings → Actions → General.
- **Workflows:** triggers stay `schedule` / `workflow_dispatch` (no `pull_request_target`); `permissions:` as narrow
  as the job needs (`contents: read` unless it commits). Python scripts use the standard library only, so the
  Actions install nothing from PyPI.
- **Branch ruleset on `main`** blocks force pushes and deletion. Don't rewrite pushed history.
- **index.html loads no third-party JavaScript** (only Google Fonts CSS). Keep it that way: no CDN scripts.
- **Escape everything other people control** before it goes into HTML: Sleeper team names, display names, league
  names, news text. Use `escapeHTML()`; avatar URLs must be `https://` (see `teamAvHTML`, `zUserAvatar`).
- **Local-only files stay out of git** (`.gitignore`: `.claude/`, `reports/`, `research_notes/`, decks). Add files
  by name rather than `git add -A`.
- Commit as `adambar-io@users.noreply.github.com`, never a personal email.
