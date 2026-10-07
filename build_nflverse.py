#!/usr/bin/env python3
"""
Builds nflverse.json for sleepa (index.html).

Why this exists: nflverse publishes its data as GitHub release files, and browsers can't fetch those
directly (GitHub doesn't send CORS headers for release downloads). So this script downloads them,
joins everything to Sleeper player IDs, keeps only the current season and the columns the app uses,
and writes one small JSON file that sits next to the HTML.

Usage:   python build_nflverse.py                 (season defaults to the current NFL season)
         python build_nflverse.py --season 2026
Re-run it whenever you want fresher data (nflverse updates daily in season). Standard library only.
"""
import argparse, csv, datetime, gzip, hashlib, html, io, json, os, re, sys, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

REL = 'https://github.com/nflverse/nflverse-data/releases/download'
SOURCES = {
    'schedule':        REL + '/schedules/games.csv.gz',
    'stats':           REL + '/stats_player/stats_player_week_{season}.csv.gz',   # target_share, air_yards_share (keyed by gsis_id)
    'snaps':           REL + '/snap_counts/snap_counts_{season}.csv.gz',          # offense_pct (keyed by pfr_player_id)
    'depth':           REL + '/depth_charts/depth_charts_{season}.csv.gz',        # pos_abb + pos_rank (keyed by gsis_id), many daily snapshots
    'injuries':        REL + '/injuries/injuries_{season}.csv',                   # official weekly report: one row per player-week, latest status
    'injuries_meta':   'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/injuries',  # when that file was last updated
    'nfl_players':     REL + '/players/players.csv.gz',                           # gsis_id <-> pfr_id, names, teams
    'id_map':          'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv',  # sleeper_id <-> gsis_id
    'sleeper_players': 'https://api.sleeper.app/v1/players/nfl',
    'espn_injuries':   'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries',   # unofficial; ~8.7 MB, trimmed to espn.json
}
ESPN_TEAM_FIX = {'WSH': 'WAS'}     # ESPN abbreviation -> Sleeper abbreviation
ESPN_SKIP_POS = {'C', 'G', 'T', 'OT', 'OG', 'OL', 'LS', 'P'}   # offensive line, long snapper, punter: never on a fantasy roster
TEAM_FIX = {'LA': 'LAR'}           # nflverse abbreviation -> Sleeper abbreviation
SKILL = ('QB', 'RB', 'WR', 'TE')   # positions that get snap / share / depth data
INJURY_POS = SKILL + ('K',)        # positions that get injury / practice data
# players.json: the Sleeper player fields the app uses (keep in sync with PLAYER_FIELDS in index.html). About 260 KB
# gzipped instead of the 2.6 MB / 14.7 MB raw /players/nfl, so the app can re-check it on every open.
PLAYER_FIELDS = ['full_name', 'first_name', 'last_name', 'position', 'fantasy_positions', 'team', 'injury_status',
                 'injury_body_part', 'injury_notes', 'injury_start_date', 'practice_participation', 'practice_description', 'espn_id', 'rotowire_id']
# Sleeper stat/projection keys that never score (the app scores with the league's own settings).
NON_SCORING = re.compile(r'^(pts_(std|ppr|half_ppr|idp)$|pos_rank|rank_|adp_|pos_adp|gp$|gs$|gms_active$|tm_|off_snp$|def_snp$|st_snp$|cmp_pct$|.*_(ypa|ypc|ypr|ypt|pct|rtg|lng|avg)$)')
DVP_POS = ('QB', 'RB', 'WR', 'TE', 'K')
IDP_POS = ('DL', 'LB', 'DB')    # Sleeper's IDP slot groups (players are DE / DT / CB / S / …; fantasy_positions carries the group)


def pos_group(player):
    """The position a player counts as: his own for offense / K / DEF, else his IDP group from fantasy_positions."""
    pos = (player or {}).get('position')
    if pos in DVP_POS or pos == 'DEF':
        return pos
    if pos in IDP_POS:
        return pos                 # an LB who is also DL-eligible counts as an LB
    for g in IDP_POS:
        if g in ((player or {}).get('fantasy_positions') or []):
            return g
    return pos
# weekly.json keeps every stat the app can show or score: counts, bonus buckets and "long" plays. Dropped: Sleeper's own
# points/ranks, games flags, team snap counts and per-attempt rates (the app works rates out from the counts).
WEEKLY_DROP = re.compile(r'^(pts_(std|ppr|half_ppr|idp)$|pos_rank|rank_|adp_|pos_adp|gp$|gs$|gms_active$|tm_|off_snp$|def_snp$|st_snp$|cmp_pct$|fan_pts_allow|.*_(ypa|ypc|ypr|ypt|pct|rtg|avg)$)')
ROS_POS = ('QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB')
LAST_FANTASY_WEEK = 17   # rest-of-season sums run through the usual fantasy championship week
PRACTICE = {'Did Not Participate In Practice': 'DNP', 'Limited Participation in Practice': 'LP', 'Full Participation in Practice': 'FP'}


def default_season():
    now = datetime.date.today()
    return now.year - 1 if now.month <= 2 else now.year


def get(url):
    headers = {'User-Agent': 'sleepa build_nflverse.py'}
    if 'wikipedia.org' in url:   # Wikimedia asks for a contactable agent
        headers['User-Agent'] = 'sleepa/1.0 (+https://github.com/adambar-io/sleepa) build_nflverse.py'
    if 'espn.com' in url:   # ESPN answers 403 to the custom agent string above (checked Sept 2026)
        headers['User-Agent'] = 'Mozilla/5.0 (compatible; sleepa/1.0; +https://github.com/adambar-io/sleepa)'
    if url.startswith('https://api.github.com/') and os.environ.get('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']   # in the Action: avoids the anonymous rate limit
    req = urllib.request.Request(url, headers=headers)
    # GitHub release downloads and Sleeper occasionally answer 5xx or time out; retry a few times before failing.
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            break
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            code = getattr(e, 'code', None)
            if attempt == 3 or (code is not None and code < 500 and code != 429):
                raise
            wait = 2 ** attempt * 3
            print(f'  retrying {url.rsplit("/", 1)[-1]} in {wait}s ({e})', file=sys.stderr)
            time.sleep(wait)
    return gzip.decompress(data) if url.endswith('.gz') else data


def csv_rows(url):
    print('  downloading', url.rsplit('/', 1)[-1], file=sys.stderr)
    return csv.DictReader(io.StringIO(get(url).decode('utf-8')))


def num(v):
    try:
        x = float(v)
        return None if x != x else x  # NaN -> None
    except (TypeError, ValueError):
        return None


def team(t):
    return TEAM_FIX.get(t, t)


def norm_name(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'\-]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def us_eastern(dt_utc):
    """UTC datetime -> naive US Eastern (DST: 2nd Sunday of March to 1st Sunday of November). No tzdata needed."""
    y = dt_utc.year
    def nth_sunday(month, n):
        d = datetime.date(y, month, 1)
        return d + datetime.timedelta(days=(6 - d.weekday()) % 7 + 7 * (n - 1))
    start = datetime.datetime.combine(nth_sunday(3, 2), datetime.time(7))   # 2am EST = 07:00 UTC
    end = datetime.datetime.combine(nth_sunday(11, 1), datetime.time(6))    # 2am EDT = 06:00 UTC
    naive = dt_utc.replace(tzinfo=None)
    return naive - datetime.timedelta(hours=4 if start <= naive < end else 5)


def eastern_to_utc(naive_et):
    """Naive US Eastern datetime -> UTC string 'YYYY-MM-DDTHH:MM:00Z' (DST from 2am on the 2nd Sunday of March
    to 2am on the 1st Sunday of November, local time)."""
    y = naive_et.year
    def nth_sunday(month, n):
        d = datetime.date(y, month, 1)
        return d + datetime.timedelta(days=(6 - d.weekday()) % 7 + 7 * (n - 1))
    dst = datetime.datetime.combine(nth_sunday(3, 2), datetime.time(2)) <= naive_et < datetime.datetime.combine(nth_sunday(11, 1), datetime.time(2))
    return (naive_et + datetime.timedelta(hours=4 if dst else 5)).strftime('%Y-%m-%dT%H:%M:00Z')


def practice_days(game_date):
    """The three practice-report days before a game: Wed/Thu/Fri for Sunday, Thu/Fri/Sat for Monday,
    Mon/Tue/Wed for Thursday (short week), Wed/Thu/Fri for Saturday. Mirrored in index.html (practiceDays)."""
    back = (3, 2, 1) if game_date.weekday() in (3, 5) else (4, 3, 2)   # Thu / Sat games
    return [game_date - datetime.timedelta(days=b) for b in back]


def sleeper_weekly(kind, season, week, positions):
    """Sleeper's weekly stats or projections (unofficial endpoint the app already uses): a list of
    {player_id, team, opponent, player: {position}, stats}."""
    q = '&'.join('position[]=' + x for x in positions)
    return json.loads(get(f'https://api.sleeper.app/{kind}/nfl/{season}/{week}?season_type=regular&{q}'))


def scoring_stats(stats):
    return {k: v for k, v in (stats or {}).items() if isinstance(v, (int, float)) and v and not NON_SCORING.match(k)}


def compact_num(v):
    return int(v) if float(v).is_integer() else round(v, 2)


def build_dvp(season, through_week, weekly=None):
    """Raw stats each defense has allowed to each position, summed over completed weeks, plus games played.
    Scoring is linear (stat x weight), so the app can score these sums with any league's settings.
    If weekly is given, it is filled with each player's own games: {pid: {week: {t: team, o: opponent, s: stats}}}. Only weeks the player
    actually played (Sleeper's gp > 0): Sleeper also lists active players who never got on the field, with no stats,
    and counting those as 0-point games dragged season averages down."""
    dvp = {}
    for week in range(1, through_week + 1):
        print(f'  sleeper stats week {week} (defense vs position, weekly actuals)', file=sys.stderr)
        for e in sleeper_weekly('stats', season, week, DVP_POS + ('DEF',) + IDP_POS):
            # IDP: "opponent" is the offense the defender faced, so dvp[offense][DB] = what DBs score against that offense
            pos, opp = pos_group(e.get('player')), team(e.get('opponent') or '')
            raw = e.get('stats') or {}
            st = scoring_stats(raw)
            if weekly is not None and (raw.get('gp') or 0) > 0:
                keep = {k: compact_num(v) for k, v in raw.items() if isinstance(v, (int, float)) and v and not WEEKLY_DROP.match(k)}
                if pos in IDP_POS:   # defenders: snaps / team snaps -> snap share in the app (the IDP "is he on the field")
                    for k in ('def_snp', 'tm_def_snp'):
                        if raw.get(k):
                            keep[k] = compact_num(raw[k])
                g = {'t': team(e.get('team') or ''), 'o': opp, 's': keep}   # home/away comes from the schedule in the app
                weekly.setdefault(str(e['player_id']), {})[str(week)] = g
            if not st:
                continue
            if (pos not in DVP_POS and pos not in IDP_POS) or not opp:
                continue
            d = dvp.setdefault(opp, {}).setdefault(pos, {'g': [], 's': {}})
            if week not in d['g']:
                d['g'].append(week)
            for k, v in st.items():
                d['s'][k] = round(d['s'].get(k, 0) + v, 3)
    for opp in dvp.values():
        for d in opp.values():
            d['g'] = len(d['g'])
    return dvp


def last_completed_week(kick, now=None):
    """Highest week whose every game has ended (its last kickoff + 4.5 h), from the nflverse kickoffs in nflverse.json.
    Sleeper's state/nfl only moves to the next week a day or two after Monday night, so without this a finished week's
    stats would wait for that. Weeks are played in order, so the highest finished week means all earlier ones are too."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    last = {}
    for wk in (kick or {}).values():
        for w, iso in wk.items():
            ts = datetime.datetime.fromisoformat(iso.replace('Z', '+00:00'))
            last[int(w)] = max(last.get(int(w), ts), ts)
    done = [w for w, ts in last.items() if ts + datetime.timedelta(hours=4, minutes=30) < now]
    return max(done) if done else 0


def build_ros(season, from_week, last_week=LAST_FANTASY_WEEK):
    """Each player's projected raw stats summed from from_week through last_week. Bye weeks have empty
    projections, so they add nothing. 'w' = weeks with a projection, 'k' = those weeks (for the trade helper)."""
    ros = {}
    for week in range(from_week, last_week + 1):
        print(f'  sleeper projections week {week} (rest of season)', file=sys.stderr)
        for e in sleeper_weekly('projections', season, week, ROS_POS):
            st = scoring_stats(e.get('stats'))
            if not st:
                continue
            r = ros.setdefault(str(e['player_id']), {'w': 0, 'k': [], 's': {}})
            r['w'] += 1
            r['k'].append(week)   # which weeks have a projection (byes and injury weeks don't)
            for k, v in st.items():
                r['s'][k] = round(r['s'].get(k, 0) + v, 2)
    # keep fantasy-relevant players only (more than a token projection)
    return {pid: r for pid, r in ros.items() if r['s'].get('rec', 0) + r['s'].get('rush_yd', 0) + r['s'].get('pass_yd', 0) + r['s'].get('fgm', 0) + r['s'].get('xpm', 0) + r['w'] * (1 if pid.isalpha() else 0) > 1
            or r['s'].get('idp_tkl', 0) + r['s'].get('idp_sack', 0) * 3 > 10}   # IDP: more than a token role


def build_espn(sleeper):
    """ESPN's unofficial injury list, trimmed to what the app shows and keyed by Sleeper ID.
    Matching: Sleeper's espn_id when present (only ~1/3 of ESPN's entries), otherwise a unique normalized
    name + team match (checked Sept 2026: all fantasy-position entries matched, no disagreements where both apply).
    Anything unmatched is listed, not dropped."""
    d = json.loads(get(SOURCES['espn_injuries']))
    by_espn = {str(p['espn_id']): sid for sid, p in sleeper.items() if p.get('espn_id')}
    by_nt = {}
    for sid, p in sleeper.items():
        if p.get('team'):
            by_nt.setdefault((norm_name(p.get('full_name')), p['team']), []).append(sid)
    players, unmatched = {}, []
    for t in d.get('injuries', []):
        for e in t.get('injuries', []):
            a = e.get('athlete') or {}
            pos = (a.get('position') or {}).get('abbreviation')
            if pos in ESPN_SKIP_POS:
                continue
            href = ((a.get('links') or [{}])[0] or {}).get('href', '')
            m = re.search(r'/id/(\d+)', href)
            eid = m.group(1) if m else None
            tm = ESPN_TEAM_FIX.get((a.get('team') or {}).get('abbreviation'), (a.get('team') or {}).get('abbreviation'))
            sid = by_espn.get(eid) if eid else None
            how = 'espn_id'
            if not sid:
                cands = by_nt.get((norm_name(a.get('displayName')), tm), [])
                sid, how = (cands[0], 'name+team') if len(cands) == 1 else (None, None)
            det = e.get('details') or {}
            rec = {k: v for k, v in {
                'st': e.get('status'), 'date': e.get('date'), 'short': e.get('shortComment'), 'long': e.get('longComment'),
                'type': det.get('type'), 'loc': det.get('location'), 'side': det.get('side'), 'detail': det.get('detail'),
                'ret': det.get('returnDate'), 'fant': (det.get('fantasyStatus') or {}).get('description'),
            }.items() if v and v != 'Not Specified'}
            if sid:
                rec['m'] = how
                players[sid] = rec
            else:   # listed, not dropped
                unmatched.append({'n': a.get('displayName'), 't': tm, 'pos': pos, 'st': e.get('status'), 'espn': eid})
    return {'espn_timestamp': d.get('timestamp'), 'players': players, 'unmatched': unmatched}


# ---------- outbound links on the player page ----------
# NFL.com: https://www.nfl.com/players/<slug>/stats/ . The slug is name-based but NOT predictable (Ja'Marr Chase is
# ja-marr-chase, De'Von Achane is devon-achane, DK Metcalf is d-k-metcalf, Travis Etienne Jr. is travis-etienne) and
# names collide (josh-allen = the Bills QB), and the pages carry no player ID. So each slug is verified: the page's
# name and position must match, plus the team or the birth date (profile page JSON-LD). Verified slugs are kept between builds.
NFL_TEAM_SLUGS = {
    'ARI': 'arizona-cardinals', 'ATL': 'atlanta-falcons', 'BAL': 'baltimore-ravens', 'BUF': 'buffalo-bills',
    'CAR': 'carolina-panthers', 'CHI': 'chicago-bears', 'CIN': 'cincinnati-bengals', 'CLE': 'cleveland-browns',
    'DAL': 'dallas-cowboys', 'DEN': 'denver-broncos', 'DET': 'detroit-lions', 'GB': 'green-bay-packers',
    'HOU': 'houston-texans', 'IND': 'indianapolis-colts', 'JAX': 'jacksonville-jaguars', 'KC': 'kansas-city-chiefs',
    'LV': 'las-vegas-raiders', 'LAC': 'los-angeles-chargers', 'LAR': 'los-angeles-rams', 'MIA': 'miami-dolphins',
    'MIN': 'minnesota-vikings', 'NE': 'new-england-patriots', 'NO': 'new-orleans-saints', 'NYG': 'new-york-giants',
    'NYJ': 'new-york-jets', 'PHI': 'philadelphia-eagles', 'PIT': 'pittsburgh-steelers', 'SF': 'san-francisco-49ers',
    'SEA': 'seattle-seahawks', 'TB': 'tampa-bay-buccaneers', 'TEN': 'tennessee-titans', 'WAS': 'washington-commanders',
}
NFL_UA = 'Mozilla/5.0 (compatible; sleepa/1.0; +https://github.com/adambar-io/sleepa)'
SUFFIX_RE = re.compile(r'\s+(jr|sr|ii|iii|iv|v)\.?$', re.I)


def stathead_key(gsis):
    """stathead.app's player key: 'sh_' + blake2b-80 of 'NFL:<gsis_id>' (their scripts/build-player-crosswalk.py).
    Verified Sept 2026: reproduces all 12,257 keys in their published player-crosswalk.json."""
    return 'sh_' + hashlib.blake2b(('NFL:' + gsis).encode('utf-8'), digest_size=5).hexdigest()


def fetch_once(url):
    """One try, no retry (unknown NFL.com slugs answer 500; retrying those would only waste time)."""
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': NFL_UA}), timeout=40) as r:
            return r.read().decode('utf-8', 'ignore')
    except Exception:
        return None


def slugify(text):
    t = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def nfl_slug_guesses(name):
    out = []
    names = [name, SUFFIX_RE.sub('', name or '')]
    m = re.match(r'^([A-Z])\.?([A-Z])\.?\s+(.*)$', name or '')   # initials: DK Metcalf -> d-k-metcalf, A.J. Brown -> a-j-brown
    if m:
        names.append(m.group(1) + ' ' + m.group(2) + ' ' + m.group(3))
    for n in names:
        for x in (re.sub(r"[.']", '', n), re.sub(r"[.']", '-', n)):
            sl = slugify(x)
            if sl and sl not in out:
                out.append(sl)
    return out


def resolve_nfl_slug(player, budget):
    """Return a verified NFL.com slug for a Sleeper player dict, or None. budget() -> False when out of fetches."""
    want_name, want_team, want_pos = norm_name(player.get('full_name')), NFL_TEAM_SLUGS.get(player.get('team')), player.get('position')
    want_born = player.get('birth_date')

    def stats_header(slug):
        # older check, for profile pages that render without JSON-LD (e.g. michael-pittman-jr, a broken template):
        # the stats page's title name, header team and position
        if not budget():
            return None
        page = fetch_once(f'https://www.nfl.com/players/{slug}/stats/')
        if not page:
            return False
        t = re.search(r'<title>([^<]*?) Stats Summary \| NFL\.com', page)
        tm = re.search(r'nfl-c-player-header__team[^>]*>\s*<a[^>]*href="/teams/([a-z0-9-]+)/', page)
        ps = re.search(r'nfl-c-player-header__position">\s*([A-Z]+)\s*<', page)
        name_ok = t and norm_name(html.unescape(t.group(1))) == want_name
        pos_ok = ps and (ps.group(1) == want_pos or (want_pos == 'K' and ps.group(1) in ('K', 'PK')))
        return bool(name_ok and tm and tm.group(1) == want_team and pos_ok)

    def matches(slug):
        # The profile page's schema.org JSON-LD carries name, current team, position (not always) and birth date; the
        # stats page's header often has no team (e.g. Josh Jacobs). Name must match, plus two of team / birth date /
        # position, and a listed position must never disagree.
        if not budget():
            return None
        page = fetch_once(f'https://www.nfl.com/players/{slug}/')
        if not page:
            return False                                   # unknown slug (NFL.com answers 500)
        m = re.search(r'<script type="application/ld\+json">(\{"@type":"SportsTeam".*?)</script>', page, re.S)
        try:
            d = json.loads(m.group(1)) if m else None
        except Exception:
            d = None
        if not d:
            return stats_header(slug)
        role = d.get('member') or {}
        person = role.get('member') or {}
        pos = role.get('roleName')
        if norm_name(html.unescape(person.get('name') or '')) != want_name:
            return False
        if pos and not (pos == want_pos or (want_pos == 'K' and pos in ('K', 'PK'))):
            return False
        team_ok = slugify(d.get('name')) == want_team
        born_ok = bool(want_born) and person.get('birthDate') == want_born
        return (team_ok + born_ok + bool(pos)) >= 2

    for slug in nfl_slug_guesses(player.get('full_name')):
        ok = matches(slug)
        if ok is None:
            return None
        if ok:
            return slug
    # Sleeper often drops suffixes NFL.com keeps (Marvin Harrison -> marvin-harrison-jr, Kenneth Walker -> kenneth-walker-iii).
    # (NFL.com's directory ?query= only filters in the browser via JavaScript; fetched server-side it returns a cached,
    # unrelated list, so it can't be used here.)
    if not SUFFIX_RE.search(player.get('full_name') or ''):
        base = slugify(re.sub(r"[.']", '', player.get('full_name') or ''))
        for suffix in ('jr', 'iii', 'ii', 'sr', 'iv', '2', '3'):   # -2/-3: NFL.com's de-dup of shared names (michael-pittman-2)
            ok = matches(base + '-' + suffix)
            if ok is None:
                return None
            if ok:
                return base + '-' + suffix
    return None


def add_player_links(players, sleeper, gsis_of, previous, max_fetches):
    """Adds 'sh' (stathead key) and, when verified, 'nfl' (+ 'nflt' = team it was verified for) to players[sid].
    Unverified players are listed in the returned dict so the app can fall back to NFL.com's search."""
    prev_players = previous.get('players', {}) if previous else {}
    for sid, g in gsis_of.items():
        players.setdefault(sid, {})['sh'] = stathead_key(g)
    todo = []
    for sid in gsis_of:
        p = sleeper.get(sid) or {}
        old = prev_players.get(sid, {})
        if old.get('nfl') and old.get('nflt') == p.get('team'):
            players[sid]['nfl'], players[sid]['nflt'] = old['nfl'], old['nflt']    # verified before, same team
        elif p.get('team') in NFL_TEAM_SLUGS and p.get('full_name'):
            todo.append(sid)
    lock, used = threading.Lock(), [0]

    def budget():
        with lock:
            if used[0] >= max_fetches:
                return False
            used[0] += 1
            return True

    def work(sid):
        return sid, resolve_nfl_slug(sleeper[sid], budget)

    with ThreadPoolExecutor(max_workers=6) as ex:
        for sid, slug in ex.map(work, todo):
            if slug:
                players[sid]['nfl'], players[sid]['nflt'] = slug, sleeper[sid]['team']
    unresolved = [sid for sid in gsis_of if not players.get(sid, {}).get('nfl')]
    print(f'  NFL.com links: {len(gsis_of) - len(unresolved)} verified, {len(unresolved)} not yet ({used[0]} page fetches this run, cap {max_fetches})', file=sys.stderr)
    return unresolved


def load_previous(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def build(season, previous=None):
    print(f'Building nflverse.json for {season}', file=sys.stderr)

    # --- schedule: opponent per team per regular-season week (a missing week = bye) ---
    sched, max_week, game_dates, kick = {}, 0, {}, {}
    for r in schedule_rows():
        if r['season'] != str(season) or r['game_type'] != 'REG':
            continue
        w, home, away = r['week'], team(r['home_team']), team(r['away_team'])
        sched.setdefault(home, {})[w] = 'vs ' + away
        sched.setdefault(away, {})[w] = '@ ' + home
        if r.get('gameday'):
            gd = datetime.date.fromisoformat(r['gameday'])
            game_dates.setdefault(home, {})[int(w)] = gd
            game_dates.setdefault(away, {})[int(w)] = gd
            if r.get('gametime'):   # kickoff, ET -> UTC; the app treats a player as locked once his team has kicked off
                hh, mm = (int(x) for x in r['gametime'].split(':')[:2])
                k = eastern_to_utc(datetime.datetime.combine(gd, datetime.time(hh, mm)))
                kick.setdefault(home, {})[w] = k
                kick.setdefault(away, {})[w] = k
        max_week = max(max_week, int(w))
    if not sched:
        sys.exit(f'No {season} regular-season games in the schedule — is the season right?')

    # --- ID mapping: Sleeper -> gsis (dynastyprocess map, then Sleeper's own gsis_id, then unique name+team) ---
    print('  downloading Sleeper players', file=sys.stderr)
    sleeper = json.loads(get(SOURCES['sleeper_players']))
    dp_sleeper_gsis, pfr_gsis = {}, {}
    for r in csv_rows(SOURCES['id_map']):
        sid, gsis, pfr = r.get('sleeper_id', ''), r.get('gsis_id', ''), r.get('pfr_id', '')
        if gsis in ('', 'NA'):
            continue
        if sid not in ('', 'NA'):
            dp_sleeper_gsis[sid] = gsis
        if pfr not in ('', 'NA'):
            pfr_gsis[pfr] = gsis
    by_name_team = {}
    for r in csv_rows(SOURCES['nfl_players']):
        gsis = r.get('gsis_id', '')
        if not gsis:
            continue
        if r.get('pfr_id'):
            pfr_gsis.setdefault(r['pfr_id'], gsis)
        key = (norm_name(r.get('display_name')), team(r.get('latest_team', '')))
        by_name_team.setdefault(key, set()).add(gsis)

    relevant = {sid: p for sid, p in sleeper.items() if p.get('position') in INJURY_POS and p.get('team')}
    gsis_of, method = {}, {'id_map': 0, 'sleeper_gsis': 0, 'name_team': 0, 'unmatched': 0}
    for sid, p in relevant.items():
        g = dp_sleeper_gsis.get(sid)
        if g:
            method['id_map'] += 1
        else:
            g = (p.get('gsis_id') or '').strip()   # Sleeper's own field: sparse, sometimes has stray spaces
            if g:
                method['sleeper_gsis'] += 1
            else:
                cands = by_name_team.get((norm_name(p.get('full_name')), p.get('team')), set())
                g = next(iter(cands)) if len(cands) == 1 else None
                method['name_team' if g else 'unmatched'] += 1
        if g:
            gsis_of[sid] = g

    weekly = {}  # gsis -> week -> {s, t, a}
    def put(gsis, week, k, v):
        if v is not None:
            weekly.setdefault(gsis, {}).setdefault(str(int(week)), {})[k] = round(v, 3)

    # Target/air share, snap share and depth charts are each optional: if one nflverse file can't be downloaded
    # (it happens: GitHub answered 500 for snap counts for a whole morning), keep that part from the previous
    # nflverse.json instead of failing the whole build. `stale` lists what was carried forward.
    stale = []

    # --- target share / air yards share (weekly player stats) ---
    try:
        for r in csv_rows(SOURCES['stats'].format(season=season)):
            if r.get('season_type') != 'REG':
                continue
            put(r['player_id'], r['week'], 't', num(r.get('target_share')))
            put(r['player_id'], r['week'], 'a', num(r.get('air_yards_share')))
    except Exception as e:
        print('  (weekly player stats unavailable, keeping previous target/air share:', e, ')', file=sys.stderr)
        stale.append('shares')
    stats_through = max((int(w) for d in weekly.values() for w in d), default=0)

    # --- offensive snap share (keyed by PFR id, mapped to gsis) ---
    snap_unmapped = 0
    try:
        for r in csv_rows(SOURCES['snaps'].format(season=season)):
            if r.get('game_type') != 'REG' or r.get('position') not in SKILL:
                continue
            g = pfr_gsis.get(r.get('pfr_player_id'))
            if not g:
                snap_unmapped += 1
                continue
            put(g, r['week'], 's', num(r.get('offense_pct')))
    except Exception as e:
        print('  (snap counts unavailable, keeping previous snap share:', e, ')', file=sys.stderr)
        stale.append('snaps')

    # --- depth chart: latest snapshot per team, offense skill positions, label = pos_abb + pos_rank ---
    latest = {}  # team -> (dt, rows)
    try:
        for r in csv_rows(SOURCES['depth'].format(season=season)):
            if r.get('pos_abb') not in SKILL or not r.get('gsis_id'):
                continue
            t, dt = team(r['team']), r['dt']
            cur = latest.get(t)
            if cur is None or dt > cur[0]:
                latest[t] = (dt, [r])
            elif dt == cur[0]:
                cur[1].append(r)
    except Exception as e:
        print('  (depth charts unavailable, keeping previous depth chart:', e, ')', file=sys.stderr)
        stale.append('depth')
    depth, depth_as_of = {}, ''
    for t, (dt, rows) in latest.items():
        depth_as_of = max(depth_as_of, dt)
        for r in rows:
            rank = int(num(r['pos_rank']) or 99)
            prev = depth.get(r['gsis_id'])
            if prev is None or rank < prev[1]:
                depth[r['gsis_id']] = (r['pos_abb'], rank)

    # --- injuries: official report for each team's upcoming game, plus a by-day practice log ---
    # nflverse keeps one row per player-week holding the *latest* practice status, with no dates. To show
    # DNP / Limited / Full by day, each build records the current status under the practice day it belongs to
    # and keeps the days recorded by earlier builds (read back from the previous nflverse.json).
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today_et = us_eastern(now_utc).date()
    try:
        meta = json.loads(get(SOURCES['injuries_meta']))
        asset = next(a for a in meta.get('assets', []) if a.get('name') == f'injuries_{season}.csv')
        inj_updated = datetime.datetime.fromisoformat(asset['updated_at'].replace('Z', '+00:00'))
    except Exception as e:  # rate limit, network: fall back to "now"
        print('  (could not read injuries update time:', e, ')', file=sys.stderr)
        inj_updated = now_utc
    inj_updated_et = us_eastern(inj_updated)
    upcoming = {}  # team -> (week, game date): the next game on or after today
    for t, weeks in game_dates.items():
        nxt = [(w, d) for w, d in weeks.items() if d >= today_et]
        if nxt:
            upcoming[t] = min(nxt, key=lambda x: x[1])
    sid_of = {g: sid for sid, g in gsis_of.items()}
    prev = previous or {}
    prev_inj = prev.get('inj', {}) if prev.get('season') == season else {}
    inj = {}
    try:
        inj_rows = list(csv_rows(SOURCES['injuries'].format(season=season)))
    except Exception as e:
        print('  (injuries unavailable:', e, ')', file=sys.stderr)
        inj_rows = []
    inj_unmatched = []
    for r in inj_rows:
        sid, t = sid_of.get(r.get('gsis_id')), team(r.get('team', ''))
        if t not in upcoming or r.get('season_type') != 'REG' or int(r['week']) != upcoming[t][0]:
            continue
        if not sid:
            # on this week's report but not matched to a Sleeper QB/RB/WR/TE/K: flag fantasy positions instead of dropping silently
            if r.get('position') in INJURY_POS:
                inj_unmatched.append({'n': r.get('full_name'), 't': t, 'pos': r.get('position'), 'gsis': r.get('gsis_id')})
            continue
        week, gd = upcoming[t]
        days = practice_days(gd)
        # the practice day this status belongs to: the latest one whose report (~4pm ET) was out before
        # nflverse last updated the file; before the first report of the week, the first day
        reported = [d for d in days if datetime.datetime.combine(d, datetime.time(16)) <= inj_updated_et]
        day = (reported[-1] if reported else days[0]).isoformat()
        old = prev_inj.get(sid, {})
        log = dict(old.get('p', {})) if old.get('w') == week else {}
        code = PRACTICE.get(r.get('practice_status', ''))
        if code:
            log[day] = code
        e = {'w': week, 'g': gd.isoformat()}
        if r.get('report_status'):
            e['st'] = r['report_status']
        # the raw columns, unmerged: reported injury, practice injury, latest practice status
        for key, col in (('ri', 'report_primary_injury'), ('ri2', 'report_secondary_injury'), ('pi', 'practice_primary_injury'),
                         ('pi2', 'practice_secondary_injury'), ('ps', 'practice_status')):
            if r.get(col):
                e[key] = r[col]
        body = r.get('report_primary_injury') or r.get('practice_primary_injury')
        body2 = r.get('report_secondary_injury') or r.get('practice_secondary_injury')
        if body:
            e['b'] = body + (', ' + body2 if body2 and body2 != body else '')
        if log:
            e['p'] = dict(sorted(log.items()))
        inj[sid] = e

    # --- output keyed by Sleeper ID. Every matched player gets an entry (even if empty),
    #     so the app can tell "no ID match" (missing key) from "matched but no data yet". ---
    players = {}
    for sid, g in gsis_of.items():
        e = {}
        if g in depth:
            e['d'] = depth[g][0] + str(depth[g][1])
        if g in weekly:
            e['w'] = weekly[g]
        players[sid] = e
    # carry forward whatever couldn't be downloaded this time
    prev_players = prev.get('players', {}) if prev.get('season') == season else {}
    keys = [k for k, part in (('t', 'shares'), ('a', 'shares'), ('s', 'snaps')) if part in stale]
    for sid, old in prev_players.items():
        e = players.setdefault(sid, {})
        if 'depth' in stale and 'd' in old:
            e['d'] = old['d']
        for wk, vals in (old.get('w') or {}).items():
            for k in keys:
                if k in vals:
                    e.setdefault('w', {}).setdefault(wk, {})[k] = vals[k]
    if 'shares' in stale:
        stats_through = prev.get('stats_through_week', stats_through)
    if 'depth' in stale:
        depth_as_of = prev.get('depth_as_of', depth_as_of)

    # outbound links for the player page (stathead.app key for everyone matched; NFL.com slug when verified)
    nfl_unresolved = add_player_links(players, sleeper, gsis_of, prev, int(os.environ.get('NFL_LINK_BUDGET', '200')))

    out = {
        'season': season,
        'generated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
        'stats_through_week': stats_through,
        'depth_as_of': depth_as_of,
        'sched_weeks': max_week,
        'sched': sched,
        'kick': kick,
        'players': players,
        'inj': inj,
        'inj_unmatched': inj_unmatched,
        'nfl_team_slugs': NFL_TEAM_SLUGS,
        'nfl_unresolved': nfl_unresolved,
        'inj_as_of': inj_updated.strftime('%Y-%m-%dT%H:%MZ'),
        'stale': stale,
        'coverage': dict(method, relevant=len(relevant), snap_rows_unmapped=snap_unmapped),
    }
    slim = {sid: {f: p[f] for f in PLAYER_FIELDS if p.get(f) is not None} for sid, p in sleeper.items()}
    return out, slim

# ---------- Sleepa Intel: the game environment (lines, venue, rest, records, home-field edge) for this week's games ----------
# Source: the same nflverse schedule file (games.csv). Facts about venues (location for weather, altitude, roof, time zone,
# international) live in intel_venues.json, keyed by stadium_id (ids survive renames). Line movement: line_history.json
# gets a snapshot whenever this week's spread / total change. Weather is fetched by the app (Open-Meteo), not here.
# Gotchas in the data: spread_line is positive when the HOME team is favored; roof is blank for retractable roofs on
# future games; a London game can be listed under the home team's stadium_id with location "Home" (2026 PHI @ JAX:
# JAX00, "Tottenham Hotspur Stadium"), so venues are also matched by name; two teams share SoFi (LAX01) and MetLife
# (NYC01), so the home-field edge is keyed by stadium AND home team; "Neutral" also marks relocated games at a team's
# own stadium, so history uses location == "Home" at a non-international venue.
INTEL_EDGE_SEASONS = 6          # home-field edge sample: the last 6 completed seasons (2020-25 for 2026)
INTEL_HISTORY_MAX = 60          # line snapshots kept per game
_SCHED_ROWS = None


def schedule_rows():
    global _SCHED_ROWS
    if _SCHED_ROWS is None:
        _SCHED_ROWS = list(csv_rows(SOURCES['schedule']))
    return _SCHED_ROWS


def load_venues():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'intel_venues.json')
    with open(path, encoding='utf-8') as f:
        venues = json.load(f)['venues']
    by_name = {}
    for vid, v in venues.items():
        for n in [v['name']] + v.get('names', []):
            by_name[n.lower()] = vid
    return venues, by_name


def resolve_venue(r, venues, by_name):
    """stadium_id for a game row; an international stadium named on the row wins over the listed id."""
    named = by_name.get((r.get('stadium') or '').strip().lower())
    if named and venues[named].get('intl'):
        return named
    return r.get('stadium_id') or named


ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'


def wiki_photo(name):
    """A free-licensed (Wikimedia Commons) thumbnail for a coach, only when the Wikipedia article title is exactly the name
    (optionally with a disambiguation) and describes an American football person; otherwise None."""
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'search', 'gsrsearch': 'intitle:"' + name + '" American football coach',
                                'gsrlimit': 5, 'prop': 'pageimages|description', 'piprop': 'thumbnail', 'pithumbsize': 200, 'pilicense': 'free'})
    try:
        pages = (json.loads(get('https://en.wikipedia.org/w/api.php?' + q)).get('query') or {}).get('pages') or {}
    except Exception:
        return None
    for p in sorted(pages.values(), key=lambda x: x.get('index', 99)):
        if p.get('title', '').split(' (')[0] == name and 'football' in (p.get('description') or '').lower() and p.get('thumbnail'):
            return p['thumbnail']['source'].split('?')[0]
    return None


def espn_coaches(season, previous):
    """Head coach per team from ESPN's public API: { team: { name, img, exp } }. Reused for a week (coaches rarely change)."""
    old = previous or {}
    if old.get('season') == season and old.get('coaches') and old.get('coaches_at'):
        try:
            age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.strptime(old['coaches_at'], '%Y-%m-%dT%H:%MZ').replace(tzinfo=datetime.timezone.utc)
            if age < datetime.timedelta(days=7):
                return old['coaches'], old['coaches_at']
        except ValueError:
            pass
    teams = json.loads(get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams'))['sports'][0]['leagues'][0]['teams']

    def one(t):
        tid, abbr = t['team']['id'], t['team']['abbreviation']
        try:
            refs = json.loads(get(f'{ESPN_CORE}/seasons/{season}/teams/{tid}/coaches')).get('items') or []
            if not refs:
                return None
            c = json.loads(get(refs[0]['$ref'].replace('http://', 'https://')))
            name = (c.get('firstName', '') + ' ' + c.get('lastName', '')).strip()
            img, src = (c.get('headshot') or {}).get('href'), 'espn'
            if not img:
                img, src = wiki_photo(name), 'wikimedia'
            return ESPN_TEAM_FIX.get(abbr, abbr), {'name': name, 'img': img, 'src': src if img else None, 'exp': c.get('experience')}
        except Exception as e:
            print('  (coach unavailable for', abbr, e, ')', file=sys.stderr)
            return None

    with ThreadPoolExecutor(max_workers=8) as ex:
        got = [x for x in ex.map(one, teams) if x]
    return {k: v for k, v in got}, datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')


def record_str(w, l, t):
    return f'{w}-{l}' + (f'-{t}' if t else '')


def build_intel(season, week, venues, by_name, history, previous=None):
    every = schedule_rows()
    rows = [r for r in every if r['game_type'] == 'REG']
    cur = [r for r in rows if r['season'] == str(season) and r['week'] == str(week)]
    if not cur:
        return None, history

    # each team's home stadium (this season's most common home venue): for time zones crossed
    home_count = {}
    for r in rows:
        if r['season'] == str(season) and r['location'] == 'Home':
            vid = resolve_venue(r, venues, by_name)
            if vid in venues and not venues[vid].get('intl'):
                c = home_count.setdefault(team(r['home_team']), {})
                c[vid] = c.get(vid, 0) + 1
    home_venue = {t: max(c, key=c.get) for t, c in home_count.items()}

    # this season so far: straight-up and against-the-spread records, points for / against, games over the total
    rec, ats, pts, ou = {}, {}, {}, {}
    for r in rows:
        if r['season'] != str(season) or r['result'] in ('', 'NA') or int(r['week']) >= week:
            continue
        res = float(r['result'])   # home score - away score
        sp = num(r['spread_line'])
        hs, as_, tl = num(r['home_score']), num(r['away_score']), num(r['total_line'])
        for side, mine, theirs in ((team(r['home_team']), hs, as_), (team(r['away_team']), as_, hs)):
            if mine is not None and theirs is not None:
                p = pts.setdefault(side, [0.0, 0.0, 0])
                p[0] += mine; p[1] += theirs; p[2] += 1
                if tl is not None:
                    o = ou.setdefault(side, [0, 0, 0])
                    o[0 if hs + as_ > tl else 1 if hs + as_ < tl else 2] += 1
        for side, sign in ((team(r['home_team']), 1), (team(r['away_team']), -1)):
            m = res * sign
            a = rec.setdefault(side, [0, 0, 0])
            a[0 if m > 0 else 1 if m < 0 else 2] += 1
            if sp is not None:
                cover = (res - sp) * sign   # the home line is -sp: home covers when result > sp
                b = ats.setdefault(side, [0, 0, 0])
                b[0 if cover > 0 else 1 if cover < 0 else 2] += 1

    # home-field edge by (stadium, home team), last INTEL_EDGE_SEASONS seasons, plus the league baseline
    first = season - INTEL_EDGE_SEASONS
    edge, base = {}, [0.0, 0]
    for r in rows:
        if not (first <= int(r['season']) < season) or r['location'] != 'Home' or r['result'] in ('', 'NA'):
            continue
        vid = resolve_venue(r, venues, by_name)
        if vid in venues and venues[vid].get('intl'):
            continue
        res = float(r['result'])
        sp = num(r['spread_line'])
        win = 1.0 if res > 0 else 0.5 if res == 0 else 0.0
        base[0] += win; base[1] += 1
        e = edge.setdefault((vid, team(r['home_team'])), {'w': 0.0, 'n': 0, 'm': 0.0, 'ats': [0, 0, 0]})
        e['w'] += win; e['n'] += 1; e['m'] += res
        if sp is not None:
            e['ats'][0 if res > sp else 1 if res < sp else 2] += 1

    # last meetings between each pair (any season, playoffs included), newest first
    meet = {}
    for r in every:
        if r['result'] in ('', 'NA') or (int(r['season']) == season and int(r['week']) >= week):
            continue
        key = tuple(sorted((team(r['home_team']), team(r['away_team']))))
        meet.setdefault(key, []).append({'season': int(r['season']), 'week': r['week'], 'type': r['game_type'], 'away': team(r['away_team']), 'home': team(r['home_team']),
                                          'as': num(r['away_score']), 'hs': num(r['home_score'])})
    try:
        coaches, coaches_at = espn_coaches(season, previous)
    except Exception as e:
        print('  (coaches unavailable:', e, ')', file=sys.stderr)
        coaches, coaches_at = (previous or {}).get('coaches') or {}, (previous or {}).get('coaches_at')
    games, snap_at = {}, datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    if history.get('season') != season or history.get('week') != week:
        history = {'season': season, 'week': week, 'games': {}}
    for r in cur:
        away, home = team(r['away_team']), team(r['home_team'])
        vid = resolve_venue(r, venues, by_name)
        v = venues.get(vid) or {}
        intl = bool(v.get('intl'))
        g = {'id': r['game_id'], 'away': away, 'home': home, 'day': r['weekday'][:3].upper(),
             'venue': vid, 'vname': v.get('name') or r.get('stadium'), 'surface': (r.get('surface') or '').strip() or None,
             'roof': (r.get('roof') or '').strip() or None,   # nflverse's: dome / closed / open / outdoors, blank = not known yet
             'div': r.get('div_game') == '1', 'intl': intl, 'neutral': intl or r['location'] == 'Neutral',
             'rest': {'away': num(r['away_rest']), 'home': num(r['home_rest'])}}
        if r.get('gameday') and r.get('gametime'):
            hh, mm = (int(x) for x in r['gametime'].split(':')[:2])
            g['kick'] = eastern_to_utc(datetime.datetime.combine(datetime.date.fromisoformat(r['gameday']), datetime.time(hh, mm)))
        sp, tot = num(r['spread_line']), num(r['total_line'])
        if sp is not None or tot is not None:
            g['lines'] = {'spread': sp, 'total': tot, 'ml': {'away': num(r['away_moneyline']), 'home': num(r['home_moneyline'])}}
            h = history['games'].setdefault(r['game_id'], [])
            if not h or h[-1][1] != sp or h[-1][2] != tot:
                h.append([snap_at, sp, tot])
                del h[:-INTEL_HISTORY_MAX]
        for side in ('away', 'home'):
            t = away if side == 'away' else home
            g.setdefault('rec', {})[side] = record_str(*rec.get(t, [0, 0, 0]))
            g.setdefault('ats', {})[side] = record_str(*ats.get(t, [0, 0, 0]))
            hv = venues.get(home_venue.get(t)) or {}
            if hv.get('tz') and v.get('tz'):
                g.setdefault('tz', {})[side] = [hv['tz'], v['tz']]
            p, o = pts.get(t), ou.get(t)
            g.setdefault('form', {})[side] = {'gp': p[2] if p else 0, 'pf': round(p[0] / p[2], 1) if p and p[2] else None, 'pa': round(p[1] / p[2], 1) if p and p[2] else None,
                                              'ou': record_str(*o) if o else None}
        g['qb'] = {'away': r.get('away_qb_name') or None, 'home': r.get('home_qb_name') or None}
        g['coach'] = {'away': r.get('away_coach') or None, 'home': r.get('home_coach') or None}
        h2h = sorted(meet.get(tuple(sorted((away, home))), []), key=lambda m: (m['season'], m['type'] != 'REG', int(m['week']) if str(m['week']).isdigit() else 0), reverse=True)[:5]
        if h2h:
            g['h2h'] = h2h
        e = edge.get((vid, home))
        if e and not g['neutral']:
            g['edge'] = {'win': round(e['w'] / e['n'], 3), 'n': e['n'], 'margin': round(e['m'] / e['n'], 1), 'ats': record_str(*e['ats'])}
        games[r['game_id']] = g
    intel = {'week': week, 'generated': snap_at, 'edge_seasons': [first, season - 1], 'season': season,
             'home_base': round(base[0] / base[1], 3) if base[1] else None, 'games': games, 'coaches': coaches, 'coaches_at': coaches_at}
    return intel, history


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--season', type=int, default=default_season())
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nflverse.json'))
    args = ap.parse_args()

    old = load_previous(args.out)
    out, slim = build(args.season, old)

    # Defense vs position (completed weeks) goes in nflverse.json; rest-of-season projections in their own file,
    # which the app only loads for the waiver screen and the trade helper.
    state = json.loads(get('https://api.sleeper.app/v1/state/nfl'))
    cur_week = int(state.get('week') or 1) if str(state.get('season')) == str(args.season) else LAST_FANTASY_WEEK + 1
    # completed weeks: Sleeper's week - 1, or later if the schedule says the current week's games are all over
    through = min(max(cur_week - 1, last_completed_week(out.get('kick'))), 18)
    print(f'  completed weeks: 1-{through} (Sleeper week {cur_week})', file=sys.stderr)
    weekly = {}
    try:
        out['dvp'] = build_dvp(args.season, through, weekly)
        out['dvp_through'] = through
    except Exception as e:
        print('  (defense vs position unavailable:', e, ')', file=sys.stderr)
    # Sleepa Intel: this week's game environment + line history (its own file, appended each run)
    hist_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'line_history.json')
    try:
        venues, by_name = load_venues()
        intel, history = build_intel(args.season, cur_week, venues, by_name, load_previous(hist_path), old.get('intel'))
        if intel:
            out['intel'] = intel
            with open(hist_path, 'w', encoding='utf-8') as f:
                json.dump(history, f, separators=(',', ':'))
            print(f"  intel: {len(intel['games'])} games in week {cur_week}", file=sys.stderr)
        elif old.get('intel'):
            out['intel'] = old['intel']
    except Exception as e:
        print('  (intel unavailable:', e, ')', file=sys.stderr)
        if old.get('intel'):
            out['intel'] = old['intel']
    # Sleeper's projections for the last 3 completed weeks, for players who played them: the app compares actual with
    # projected points (league scoring) to find players beating expectations ("Rising", incl. IDP, where Sleeper's
    # trending list has almost no defenders).
    proj_recent = {}
    try:
        for w in range(max(1, through - 2), through + 1):
            wk = {}
            for e in sleeper_weekly('projections', args.season, w, DVP_POS + ('DEF',) + IDP_POS):
                sid = str(e.get('player_id'))
                st = scoring_stats(e.get('stats'))
                if st and str(w) in weekly.get(sid, {}):
                    wk[sid] = {k: compact_num(v) for k, v in st.items()}
            proj_recent[str(w)] = wk
    except Exception as e:
        print('  (past projections unavailable:', e, ')', file=sys.stderr)
    # weekly.json: every fantasy player's stats for each completed game (QB/RB/WR/TE/K/DEF + IDP), so the app can show last
    # game / season / recent form for anyone (free agents, other teams, defenses) and score it with the league's settings.
    weekly_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'weekly.json')
    old_weekly = load_previous(weekly_path)
    # recent_proj.json (own file, loaded by the app only for the Players tab's "Rising" view / sort, so weekly.json stays small)
    rp_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'recent_proj.json')
    if proj_recent and load_previous(rp_path).get('weeks') != proj_recent:
        with open(rp_path, 'w', encoding='utf-8') as f:
            json.dump({'season': args.season, 'generated': out['generated'], 'weeks': proj_recent}, f, separators=(',', ':'))
        print(f'Wrote {rp_path} ({os.path.getsize(rp_path):,} bytes).', file=sys.stderr)
    if weekly and (old_weekly.get('players') != weekly or old_weekly.get('through_week') != through or 'proj' in old_weekly):
        with open(weekly_path, 'w', encoding='utf-8') as f:
            json.dump({'season': args.season, 'generated': out['generated'], 'through_week': through, 'players': weekly}, f, separators=(',', ':'))
        print(f'Wrote {weekly_path} ({os.path.getsize(weekly_path):,} bytes, {len(weekly):,} players).', file=sys.stderr)
    # espn.json: ESPN injuries (unofficial). On failure the previous file stays, so the app shows the last good copy.
    espn_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'espn.json')
    try:
        sleeper_full = json.loads(get(SOURCES['sleeper_players']))
        espn = build_espn(sleeper_full)
        old_espn = load_previous(espn_path)
        if old_espn.get('players') != espn['players'] or old_espn.get('unmatched') != espn['unmatched']:
            espn['fetched'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
            with open(espn_path, 'w', encoding='utf-8') as f:
                json.dump(espn, f, separators=(',', ':'))
            print(f"Wrote {espn_path} ({os.path.getsize(espn_path):,} bytes, {len(espn['players'])} matched, {len(espn['unmatched'])} unmatched).", file=sys.stderr)
        else:
            print('No ESPN injury changes; espn.json left as is.', file=sys.stderr)
    except Exception as e:
        print('  (ESPN injuries unavailable, keeping the previous espn.json:', e, ')', file=sys.stderr)

    # rankings.json: FantasyPros consensus rankings (DynastyProcess mirror), Boris Chen tiers, ESPN projections. Each
    # source keeps its own date; the file is only rewritten when the data changed (not just the fetch time).
    rankings_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'rankings.json')
    try:
        from build_rankings import build_rankings
        if 'sleeper_full' not in locals():
            sleeper_full = json.loads(get(SOURCES['sleeper_players']))
        rk = build_rankings(sleeper_full, out.get('kick') or {}, args.season, cur_week)
        old_rk = load_previous(rankings_path)
        def strip(d):   # everything but the fetch times
            d = json.loads(json.dumps(d or {}))
            d.pop('generated', None)
            d.get('sources', {}).get('espn', {}).pop('fetched', None)
            return d
        same = bool(old_rk) and strip(old_rk) == strip(rk)
        if not same:
            with open(rankings_path, 'w', encoding='utf-8') as f:
                json.dump(rk, f, separators=(',', ':'))
            print(f'Wrote {rankings_path} ({os.path.getsize(rankings_path):,} bytes).', file=sys.stderr)
        else:
            print('No rankings changes; rankings.json left as is.', file=sys.stderr)
    except Exception as e:
        print('  (rankings unavailable, keeping the previous rankings.json:', e, ')', file=sys.stderr)

    ros_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'ros.json')
    try:
        ros = build_ros(args.season, cur_week) if cur_week <= LAST_FANTASY_WEEK else {}
        old_ros = load_previous(ros_path)
        if old_ros.get('players') != ros or old_ros.get('from_week') != cur_week:
            with open(ros_path, 'w', encoding='utf-8') as f:
                json.dump({'season': args.season, 'generated': out['generated'], 'from_week': cur_week, 'through_week': LAST_FANTASY_WEEK, 'players': ros}, f, separators=(',', ':'))
            print(f'Wrote {ros_path} ({os.path.getsize(ros_path):,} bytes, {len(ros):,} players, weeks {cur_week}-{LAST_FANTASY_WEEK}).', file=sys.stderr)
        else:
            print('No projection changes; ros.json left as is.', file=sys.stderr)
    except Exception as e:
        print('  (rest-of-season projections unavailable:', e, ')', file=sys.stderr)

    # players.json (Sleeper player database, trimmed): rewritten only when a player's fields changed.
    players_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), 'players.json')
    old_players = load_previous(players_path)
    if old_players.get('players') != slim:
        with open(players_path, 'w', encoding='utf-8') as f:
            json.dump({'generated': out['generated'], 'players': slim}, f, separators=(',', ':'))
        print(f'Wrote {players_path} ({os.path.getsize(players_path):,} bytes, {len(slim):,} players).', file=sys.stderr)
    else:
        print('No player changes; players.json left as is.', file=sys.stderr)

    # Skip rewriting when only the timestamp would change (keeps scheduled commits quiet).
    if old and {k: v for k, v in old.items() if k != 'generated'} == {k: v for k, v in out.items() if k != 'generated'}:
        print('No data changes; nflverse.json left as is.', file=sys.stderr)
        return

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    c = out['coverage']
    print(f"Wrote {args.out} ({os.path.getsize(args.out):,} bytes). Stats through week {out['stats_through_week']}, "
          f"depth chart as of {out['depth_as_of']}, {len(out['inj'])} players on this week's injury reports.", file=sys.stderr)
    print(f"ID matches for {c['relevant']} Sleeper QB/RB/WR/TE on a team: {c['id_map']} via ID map, "
          f"{c['sleeper_gsis']} via Sleeper gsis_id, {c['name_team']} via name+team, {c['unmatched']} unmatched.", file=sys.stderr)


if __name__ == '__main__':
    main()
