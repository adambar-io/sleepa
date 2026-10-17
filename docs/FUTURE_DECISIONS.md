# Parked ideas and decisions (app, domain, money)

Status: **paused by owner, Oct 17 2026.** Pick this up by saying "let's resume the app / domain plans". Details for the app build live in [APP_INSTALL_PLAN.md](APP_INSTALL_PLAN.md).

## 1. Web address (decide first; it blocks the installable app)

Installs, saved data and push alerts are tied to the address, so moving later means everyone reinstalls.

| Option | Cost | Notes |
|---|---|---|
| Stay on `adambar-io.github.io/sleepa` | $0 | Fine for personal use. Its saved data is shared with any other `adambar-io` Pages site. Stuck on GitHub's address. |
| **Custom domain on GitHub Pages (leaning this way)** | about $10–20/yr | Yours, isolated, portable to other hosting. HTTPS is free (Enforce HTTPS). |
| Private site behind a login (Cloudflare Access) | $0 | Breaks offline start and push alerts. Not recommended. |

- **Cheapest HTTPS-only-by-design endings:** `.dev` / `.page` (about $10–13/yr) and `.app` (about $14–20/yr). A `.com` (about $10–12/yr) with Enforce HTTPS is just as safe in practice.
- **Registrars:** Cloudflare Registrar or Porkbun (at-cost renewals, free contact privacy, free email forwarding).
- **Free subdomains** (`is-a.dev`, `eu.org`, `pages.dev`) aren't really yours. Avoid.
- **Name:** use a **neutral name, not "Sleepa"**. It's too close to "Sleeper", a trademark risk if this ever grows. Check the `.com`, social handles and the USPTO trademark search.
- **Setup, once bought:**
  - Owner, about 10 min: buy the domain, auto-renew on, 2FA on.
  - Claude, about 15 min: DNS to GitHub Pages, custom domain in the repo, Enforce HTTPS, old address forwards.

## 2. Installable app (PWA): build soon after the domain

- Plan: [APP_INSTALL_PLAN.md](APP_INSTALL_PLAN.md).
  - Phase 1: install, offline, updates, iPhone instructions.
  - Phase 2: real alerts via a free Cloudflare Worker.
  - Security section included.
- **No reason to wait** until features are done. It adds a few small files and barely changes ongoing work or cost.
- Owner to-dos: GitHub 2FA now; Cloudflare account + 2FA before Phase 2.

## 3. Native store apps (iPhone, Windows, Android): wait

- **When:** only after features have mostly settled and there's real demand.
- **Why wait:** every release goes through store review, the native shells need upkeep with each OS version, and there's more testing per change. That means noticeably more effort and usage per change.
- **Platforms:**
  - iPhone: Capacitor wrapper, Apple Developer $99/yr, a Mac or cloud build. It needs native features (push, widget) to pass Apple's "not just a website" rule.
  - Windows: package the PWA for the Microsoft Store (PWABuilder), about free.
  - Android: $25 once.
- **Hobby cost:** about $100–300/yr plus a few hours a month of upkeep.

## 4. Business reality check

- **Not pursuing subscriptions** (owner).
- **A real business** would cost about $10k–40k/yr before salaries: licensed data, LLC, legal, support, store fees of 15–30%. Break-even is about 300–700 subscribers at $5/mo.
- **Blockers:**
  - Sleepa relies on unlicensed sources: Sleeper's undocumented APIs, FantasyPros rankings via a mirror, ESPN's unofficial feed, Sleeper player photos.
  - Sleeper platform risk.
  - The name.
  - FantasyPros' moat is distribution and partnerships, not features.
- **Strengths worth keeping:** multi-league views, replayed win probability, FAAB prices from the league's own history, Data health.
- **If ever:** validate demand for a season first (share with leagues, a subreddit, Discord), then rename, approach Sleeper about partnership / API access, and price licensed data.

## 5. Money without a business

- **Ads: no.** Still commercial use of unlicensed data; GitHub Pages isn't for commercial sites; cookie-consent banners and trackers; tiny revenue.
- **Donations: OK** (lowest risk).
  - A quiet "Support" link (Ko-fi, Buy Me a Coffee or GitHub Sponsors) on the web app only, ideally after the domain move.
  - No donor-only features; report as income.
  - Inside a future iPhone app, Apple requires its own in-app tipping.
