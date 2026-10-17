# Sleepa as an installable app: plan

Status: planning (Oct 17 2026). Nothing in this doc is built yet.

**Goal:** Sleepa installs to the phone home screen and the desktop dock. It opens full-screen like an app, starts instantly, works with a bad connection, and can send real alerts when the phone is locked: starter ruled out, injury downgrades, waiver results. All of this happens without app stores and without paid services.

**Approach:** a Progressive Web App (PWA) on top of the current single file. There's no rewrite and no build step.

## What an installable web app can and can't do (iPhone vs Android vs desktop)

| Capability | Android (Chrome) | iPhone / iPad (Safari) | Desktop (Chrome / Edge) |
|---|---|---|---|
| Install to home screen | Yes. The browser can offer an install prompt, and Sleepa can show its own Install button. | Yes, but only manually: Share › Add to Home Screen. Sleepa can't trigger it, only explain it. | Yes, via an install icon in the address bar or Sleepa's own button. |
| Full-screen, own icon, own app switcher entry | Yes | Yes | Yes (own window) |
| Works offline / bad signal (with a service worker) | Yes | Yes | Yes |
| Push notifications when Sleepa is closed | Yes | Yes, but **only once installed to the Home Screen** (iOS 16.4+), and only after the person taps an "allow" button inside the installed app. | Yes |
| Number badge on the icon | Yes | Yes (installed app, needs notification permission) | Yes |
| Long-press shortcuts on the icon (Lineup, Scoreboard…) | Yes | No | Yes (right-click on the dock icon) |
| Background refresh while closed | Very limited; can't rely on it | No | Very limited |
| Lock-screen live scores / widgets | No | No (Live Activities are native only) | No |
| Change a lineup in Sleeper | No (Sleeper has no public write API; this is unchanged by installing) | No | No |

**Takeaways:**
1. Anything that must happen while the app is closed comes from **push sent by a small server**, not from the phone.
2. On iPhone, notifications require installing first. The install flow and the alerts flow have to be designed as one journey.

## Phase 1: installable and fast (no server, about one session)

**1. Web app manifest (`manifest.webmanifest`)**
- name "Sleepa"
- short_name "Sleepa"
- id `/sleepa/`
- start_url `/sleepa/?app=1#/lineup`
- scope `/sleepa/`
- display `standalone`
- background_color / theme_color matching the dark theme (`#0B0B0D`)
- icons:
  - 192 and 512 "any"
  - 192 and 512 **maskable** (Android crops icons into circles/squircles, so the mark needs safe padding)
  - the existing 180 apple-touch-icon
- shortcuts, generated from the action registry (`ACTIONS`): Lineup, Scoreboard, Injuries, FAAB bids. Each opens its deep link.
- screenshots: 2 phone and 1 desktop. They give Android and desktop the richer install sheet.
- categories: sports

**2. Icons:** render from `brand/sleepa-mark.svg` (robot bunny) on the brand background.
- 192, 512, maskable 192/512 (mark at 80% of the safe zone), monochrome 96 for Android notification badges
- tool: `tools/make-icons.js` (headless render or sharp), checked into `brand/app/`

**3. Service worker (`sw.js` at `/sleepa/sw.js`)**

The rule is simple, because the app already caches its own data in IndexedDB.

- **The page itself (`index.html`):** network first, with a 3-second timeout, then the cached copy. Online you always get the newest Sleepa; offline or on bad signal it opens instantly from cache.
- **Static brand files and fonts:** cache first.
- **Data files** (`nflverse.json`, `players.json`, `weekly.json`, …): network first, falling back to cache only when offline. The app's own freshness logic (and Data health) stays in charge.
- **Never touched:**
  - Sleeper API and GraphQL calls
  - POST requests
  - `tests/`, `design/`, `research_notes/`

  These pass straight through.
- **Versioning:** one `SW_VERSION` constant in `sw.js`. A new worker cleans up old caches on activate.
- **Precaching:** only the shell (index.html, icons, manifest), about 400 KB compressed. No 6 MB of data on install.

**4. Updates**
- When a new Sleepa is deployed and the installed app is open, show a quiet line: "New version · Reload". Tapping it activates the waiting worker and reloads.
- Never reload under the user mid-action (Huddle, trade builder).

**5. Install entry points (never pushy)**
- **Settings › "Install Sleepa"** card, always there until installed:
  - Android / desktop: an Install button (`beforeinstallprompt`).
  - iPhone: a 3-step sheet with the real Share icon ("Share › Add to Home Screen › Add"), plus a note that alerts need this on iPhone.
- **One subtle hint** after the 3rd visit on a phone, at most once a week, dismissible forever. It goes in the same slim-line style as the new injury line, not a banner.
- **Hidden** when already running installed (`display-mode: standalone` / `navigator.standalone`).

**6. Standalone polish:** there's no browser bar, so the app has to cover what the browser did.
- **Refresh:** pull-to-refresh on Lineup / Scoreboard. The existing "Updated · refresh" control stays.
- **Back:** every full-screen view already has Back. Check Esc, swipe-back and the Android back button (history entries for overlays).
- **External links** (News ↗, Resources) open in the system browser: `target=_blank` already, verify on iOS.
- **Safe areas:** recheck notch and home-indicator spacing for the tab bar, sheets and Zone (`env(safe-area-inset-*)`).
- **Status bar:** colors follow the theme (theme-color already switches).
- **Sign in once:** an installed iPhone app has **separate storage from Safari**, so the first open asks for the Sleeper username again. The copy should say so ("One-time: enter your Sleeper username").

**7. Durability**
- Call `navigator.storage.persist()` once installed, so the browser doesn't evict saved lineups, the injury feed or win-probability plays.
- Data health gets a row: "App: installed · version · storage persisted".

**8. Offline experience**
- An "Offline · showing data from 2:41 PM" line on Lineup.
- Actions that need the network (refresh, Scoreboard live, FAAB history) say so instead of spinning.

**9. Badge:** the app icon shows the count of starters ruled out / unread notifications (`navigator.setAppBadge`), cleared when read.

**Phase 1 checks**
- Chrome DevTools › Application: manifest valid, worker active, installable.
- Real devices:
  - iPhone: install, open offline, sign in, deep links, safe areas, update flow.
  - Android: install prompt, maskable icon, shortcuts.
  - Desktop Chrome window.
- tests/check.html gains manifest checks (fields, icons exist, shortcuts map to real `ACTIONS` hashes) and a `sw.js` routing table test (which URLs are cached, which pass through).

## Phase 2: real alerts with the app closed (Web Push, small free server)

**Why a server:** a phone won't run Sleepa's checks in the background. Something has to watch Sleeper and send the push.

**Choice: Cloudflare Workers (free tier)**
- A scheduled Worker (cron) plus D1 (SQLite) or KV for subscriptions.
- Free limits are far above what Sleepa needs: about 100k requests a day and cron triggers.
- No server to maintain. Secrets are stored in Cloudflare.
- Alternatives:
  - GitHub Actions cron: its 5-minute schedule routinely runs 10–30 minutes late, too slow for "ruled out 90 minutes before kickoff".
  - Firebase Cloud Messaging: adds Google SDKs, and iOS web push still goes through Apple anyway.

**Pieces**
1. **VAPID keys** (a public/private key pair).
   - The public key goes in index.html.
   - The private key is a Worker secret.
2. **Subscribe flow in Sleepa** (Settings › Alerts, and the bell popover). On iPhone it's only shown in the installed app.
   - The person picks alert types and taps "Turn on alerts" (this must be a tap: iOS requirement).
   - `pushManager.subscribe` runs, then POST `/subscribe` with `{ endpoint, keys, sleeper_user_id, leagues, prefs, tz }`.
3. **Worker endpoints:** `/subscribe`, `/unsubscribe`, `/prefs`, `/test`. Each one:
   - validates the Sleeper user id exists
   - rate-limits per IP
   - stores nothing beyond what's listed below
4. **Watcher (cron)**
   - **Every 5 minutes in game windows** (Thu evening, Sun, Mon evening, plus international morning games):
     - For each subscribed user: their rosters (cached 1 h), their starters kicking off within 3 hours.
     - Re-check those players' statuses (Sleeper's per-player endpoint, the same one the Lineup's inactive check uses).
     - Diff against the last stored status, then send pushes.
   - **Every 60 minutes otherwise:** injury status diffs for rostered players (Wed–Sat practice reports).
   - **Waiver results (Wednesday morning, after the league's waiver run):** read that league's transactions for the leg, then push "You won Josh Jacobs ($7) · Lost Malik Washington to Nacua Matata ($9)".
5. **Sending:** Web Push protocol (aes128gcm encryption) from the Worker, using a Workers-compatible web-push library.
   - Expired endpoints (HTTP 404/410) are deleted.
   - Each notification carries a deep link (`#/intel/injuries`, `#/players/faab`, `#/matchup`). Tapping it opens Sleepa right there, through the existing `ACTIONS` links.
6. **Dedupe and quiet**
   - One push per player per status change.
   - Grouped when several land at once ("3 injury updates on your teams").
   - Quiet hours, default 11 pm–8 am in the person's time zone, except game-day "ruled out" alerts within 3 hours of kickoff.
   - Per-type toggles.
7. **Alert types, first set**
   - Starter ruled out / downgraded before kickoff, with the suggested swap from the Lineup logic.
   - Injury downgrade on any rostered player (same rules as the bell; each league named).
   - Inactives confirmed: "Olave is active."
   - Waiver results (FAAB leagues: what you won, lost, and the winning bid).
   - Later candidates: close game in the 4th quarter, matchup final, trade offer (needs a Sleeper auth token, not planned).

**Data kept on the server:** push endpoint + keys, Sleeper user id (public), league ids, alert prefs, time zone, last-seen statuses for watched players. No passwords, no email, no names beyond what Sleeper already makes public. Deleting the app or turning alerts off removes the row (`/unsubscribe`).

**Cost:** $0 on Cloudflare's free tier at Sleepa's size. A Cloudflare account is needed; the owner creates it, and Claude can't create accounts.

**Phase 2 checks**
- Worker unit tests: diff logic, quiet hours, dedupe, waiver-result parsing on the frozen week-4 fixture.
- A `/test` push button in Settings.
- Real-device checks on an installed iPhone and an Android phone, during a game window.

## Phase 3: nice-to-haves after alerts work

- iPhone splash screens (`apple-touch-startup-image` per device size), generated by `tools/make-icons.js`.
- "Sleepa · Today" shortcuts expanded (Intel, Huddle).
- Notification actions on Android ("Open lineup", "Snooze until Sunday").
- Share target: share a player link into Sleepa (low value).

## Risks and decisions to make before Phase 1

1. **The web address is part of the install.** An installed app, its storage and its alert subscriptions belong to `adambar-io.github.io/sleepa`.
   - Moving later (custom domain, or the private Cloudflare Pages + Access idea from Sept 30) means everyone reinstalls and re-enables alerts.
   - Cloudflare Access login in front of a PWA also complicates offline start and push. **Decide the long-term address first.**
2. **Public repo:** the service worker, manifest and Worker code are public; no secrets in them (the VAPID private key lives only in Cloudflare).
3. **iPhone storage split:** the first open of the installed app needs the username again. This is expected, and the copy must say so.
4. **Sleeper's unofficial endpoints** (GraphQL plays, per-player status) can change. Server-side failures need their own Data health style status: the Worker stores its last successful run, and Settings shows it.
5. **Push fatigue:** defaults matter. Only "starter ruled out" and "waiver results" are on by default; the rest are opt-in.

## Security

Sleepa handles no passwords or payment details, only public Sleeper data, and it stays read-only toward Sleeper. Installing adds no device permissions (contacts, location, files).

**Phase 1 (install + service worker)**
- **A bad deploy is stickier:** an installed service worker keeps serving what it cached.
  - Mitigations: network-first HTML (online always loads the newest page), a tiny , and a kill switch (a release whose worker unregisters itself and clears caches).
  - Check on every deploy: open the installed app online and confirm the version in Data health.
- **Repo access = control of every installed copy.** GitHub two-factor login on the owner account is required.
- **Shared origin:** every GitHub Pages project of  shares , so its localStorage / IndexedDB is readable by any page published there. Today that is low-sensitivity (username, saved plans, notes, cached public data). A custom domain isolates it (see decision 1).
- **On-device data:** cached rosters, injuries and plays are public data. The exposure is limited to someone with the unlocked phone.

**Phase 2 (push server)**
- **Anyone can subscribe with any Sleeper user id.** The rosters are public anyway. Validate that the id exists, rate-limit per IP, and cap subscriptions per user id.
- **Abuse of the free tier:** the worst case is alerts stopping, not a bill (no paid plan attached). Rate limits and request size caps cover it.
- **The VAPID private key** is a Cloudflare secret only, never in the repo. If it leaked, someone could send fake Sleepa notifications. Notifications only deep-link inside Sleepa, and rotating the key (and re-subscribing) is documented.
- **Cloudflare account:** two-factor login required.
- **Dependencies:** pin exact versions of the web-push library; keep the Worker small and reviewed.
- **Data minimization:** store only the push endpoint + keys, the Sleeper user id, league ids, prefs, time zone and last-seen statuses.  and turning alerts off delete the row.

## Suggested order

1. Decide the address (stay on GitHub Pages vs move).
2. Phase 1 (one session), shipped and checked on real phones.
3. Owner creates a Cloudflare account; then Phase 2 (one or two sessions).
4. Phase 3 items as wanted.
