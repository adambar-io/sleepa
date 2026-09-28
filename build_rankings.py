"""Rankings and a second projection for sleepa, from free sources (called by build_nflverse.py, writes rankings.json).

  * FantasyPros expert consensus rankings (ECR), as mirrored by DynastyProcess
    (https://github.com/dynastyprocess/data, files/fp_latest_weekly.csv ~twice a day, files/db_fpecr_latest.csv weekly).
    This week: positional pages (QB, PPR RB/WR/TE, K, DST). Rest of season: the "redraft" ROS PPR positional pages.
    Kept per player: positional rank, average rank (ecr), std-dev, best, worst. Data (c) FantasyPros.
  * Tiers by Boris Chen (clustering of the FantasyPros ECR; https://www.borischen.co), weekly text files on S3.
  * ESPN weekly projections (unofficial endpoint lm-api-reads.fantasy.espn.com; ESPN's own projections), kept as raw
    stat lines in Sleeper's stat keys so the app scores them with each league's own settings. QB/RB/WR/TE only: K and
    DEF stat mapping isn't verified, so they're left out rather than guessed.
  FantasyCalc trade values are NOT here: the app fetches them directly (browser requests allowed) with its own
  league's settings.

Every player is matched to a Sleeper ID and anything that doesn't match is listed under `unmatched`, never guessed:
  FantasyPros id -> Sleeper id via DynastyProcess db_playerids.csv (the crosswalk already used for gsis ids), accepted
  only when position agrees with Sleeper; otherwise a unique normalized name + team + position; defenses by team code.
  Boris Chen names -> the same week's FantasyPros rows (same names) -> Sleeper. ESPN id -> Sleeper via db_playerids
  espn_id, then Sleeper's own espn_id, then unique name + team + position.
"""
import csv, datetime, email.utils, io, json, re, sys, unicodedata, urllib.request

DP = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/'
BORIS = 'https://s3-us-west-1.amazonaws.com/fftiers/out/text_{}.txt'
BORIS_FILES = {'QB': 'QB', 'RB': 'RB-PPR', 'WR': 'WR-PPR', 'TE': 'TE-PPR', 'K': 'K', 'DEF': 'DST'}
ESPN = ('https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leaguedefaults/3'
        '?view=kona_player_info')
TEAM = {'JAC': 'JAX', 'LA': 'LAR', 'WSH': 'WAS', 'OAK': 'LV', 'SD': 'LAC', 'STL': 'LAR'}
WEEKLY_PAGES = {'qb': 'QB', 'ppr-rb': 'RB', 'ppr-wr': 'WR', 'ppr-te': 'TE', 'k': 'K', 'dst': 'DEF'}
ROS_PAGES = {'/nfl/rankings/ros-qb.php': 'QB', '/nfl/rankings/ros-ppr-rb.php': 'RB', '/nfl/rankings/ros-ppr-wr.php': 'WR',
             '/nfl/rankings/ros-ppr-te.php': 'TE', '/nfl/rankings/ros-k.php': 'K', '/nfl/rankings/ros-dst.php': 'DEF'}
ESPN_POS = {1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE'}
ESPN_TEAMS = {1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND',
              12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI',
              22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'}
# ESPN stat id -> Sleeper stat key (offense). Checked by re-scoring with ESPN's default PPR rules and comparing with
# ESPN's own appliedTotal (see check_espn_mapping).
ESPN_STATS = {0: 'pass_att', 1: 'pass_cmp', 3: 'pass_yd', 4: 'pass_td', 19: 'pass_2pt', 20: 'pass_int', 23: 'rush_att',
              24: 'rush_yd', 25: 'rush_td', 26: 'rush_2pt', 42: 'rec_yd', 43: 'rec_td', 44: 'rec_2pt', 53: 'rec',
              58: 'rec_tgt', 68: 'fum', 72: 'fum_lost'}
ESPN_DEFAULT_PPR = {'pass_yd': 0.04, 'pass_td': 4, 'pass_int': -2, 'pass_2pt': 2, 'rush_yd': 0.1, 'rush_td': 6, 'rush_2pt': 2,
                    'rec': 1, 'rec_yd': 0.1, 'rec_td': 6, 'rec_2pt': 2, 'fum_lost': -2}


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'\-]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def fetch(url, headers=None, timeout=90):
    req = urllib.request.Request(url, headers=dict({'User-Agent': 'Mozilla/5.0 (compatible; sleepa/1.0; +https://github.com/adambar-io/sleepa)'}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), dict(r.headers)


def csv_rows(name):
    body, _ = fetch(DP + name)
    return list(csv.DictReader(io.StringIO(body.decode('utf-8'))))


def num(v):
    try:
        f = float(v)
        return int(f) if f.is_integer() else round(f, 2)
    except (TypeError, ValueError):
        return None


class Matcher:
    """FantasyPros / ESPN player -> Sleeper id, with the reason, or None (listed as unmatched by the caller)."""

    def __init__(self, sleeper, dp_ids):
        self.sleeper = sleeper
        self.fp = {r['fantasypros_id']: r['sleeper_id'] for r in dp_ids if r.get('fantasypros_id') not in ('', 'NA', None) and r.get('sleeper_id') not in ('', 'NA', None)}
        self.espn = {r['espn_id']: r['sleeper_id'] for r in dp_ids if r.get('espn_id') not in ('', 'NA', None) and r.get('sleeper_id') not in ('', 'NA', None)}
        self.espn_sl = {str(p['espn_id']): sid for sid, p in sleeper.items() if p.get('espn_id')}
        self.by_ntp = {}
        for sid, p in sleeper.items():
            if p.get('position') in ('QB', 'RB', 'WR', 'TE', 'K'):
                self.by_ntp.setdefault((norm(p.get('full_name')), p.get('team'), p.get('position')), []).append(sid)

    def _pos_ok(self, sid, pos):
        p = self.sleeper.get(sid)
        return bool(p) and (p.get('position') == pos or pos in (p.get('fantasy_positions') or []))

    def _name(self, name, team, pos):
        c = self.by_ntp.get((norm(name), team, pos), [])
        return c[0] if len(c) == 1 else None

    def fp_player(self, fpid, name, team, pos):
        if pos == 'DEF':
            return (team, 'team') if team in self.sleeper else (None, None)
        sid = self.fp.get(str(fpid))
        if sid and self._pos_ok(sid, pos):
            return sid, 'id'
        sid = self._name(name, team, pos)
        return (sid, 'name+team') if sid else (None, None)

    def espn_player(self, eid, name, team, pos):
        for sid, how in ((self.espn.get(str(eid)), 'id'), (self.espn_sl.get(str(eid)), 'sleeper espn_id')):
            if sid and self._pos_ok(sid, pos):
                return sid, how
        sid = self._name(name, team, pos)
        return (sid, 'name+team') if sid else (None, None)


def week_of_kickoff(ts, team, kick):
    """nflverse kickoffs ({team: {week: iso}}) -> the week a FantasyPros row's game kickoff belongs to."""
    if not ts or team not in kick:
        return None
    t = datetime.datetime.fromtimestamp(int(ts), datetime.timezone.utc)
    for w, iso in kick[team].items():
        k = datetime.datetime.fromisoformat(iso.replace('Z', '+00:00'))
        if abs((k - t).total_seconds()) < 3 * 3600:
            return int(w)
    return None


def fp_weekly(m, kick):
    rows = csv_rows('fp_latest_weekly.csv')
    out, unmatched, weeks, scraped = {}, [], {}, set()
    for r in rows:
        pos = WEEKLY_PAGES.get(r.get('page'))
        if not pos:
            continue
        team = TEAM.get(r.get('team'), r.get('team'))
        scraped.add(r.get('scrape_date'))
        w = week_of_kickoff(r.get('player_game_kickoff_ts'), team, kick)
        if w:
            weeks[w] = weeks.get(w, 0) + 1
        if num(r.get('rank')) is None or num(r.get('ecr')) is None:   # listed but not ranked this week (e.g. injured): 'NA'
            continue
        sid, how = m.fp_player(r.get('fantasypros_id'), r.get('player_name'), team, pos)
        rec = {'pr': r.get('pos_rank'), 'rk': num(r.get('rank')), 'ecr': num(r.get('ecr')), 'sd': num(r.get('sd')),
               'best': num(r.get('best')), 'worst': num(r.get('worst'))}
        if sid:
            out[sid] = rec
        else:
            unmatched.append({'n': r.get('player_name'), 't': team, 'pos': pos, 'fpid': r.get('fantasypros_id'), 'pr': r.get('pos_rank')})
    week = max(weeks, key=weeks.get) if weeks else None
    return {'week': week, 'scraped': max(scraped) if scraped else None, 'players': out, 'unmatched': unmatched, 'rows': rows}


def fp_ros(m):
    rows = csv_rows('db_fpecr_latest.csv')
    out, unmatched, scraped, by_page = {}, [], set(), {}
    for r in rows:
        if ROS_PAGES.get(r.get('fp_page')) and num(r.get('ecr')) is not None:
            by_page.setdefault(r['fp_page'], []).append(r)
    for page, prs in by_page.items():
        pos = ROS_PAGES[page]
        # positional rank = order of average rank on the whole page (unmatched players included, so ranks don't shift)
        for i, r in enumerate(sorted(prs, key=lambda x: num(x.get('ecr')))):
            team = TEAM.get(r.get('team'), r.get('team'))
            scraped.add(r.get('scrape_date'))
            sid, how = m.fp_player(r.get('id'), r.get('player'), team, pos)
            rec = {'pr': pos + str(i + 1), 'ecr': num(r.get('ecr')), 'sd': num(r.get('sd')), 'best': num(r.get('best')), 'worst': num(r.get('worst'))}
            if sid:
                out[sid] = rec
            else:
                unmatched.append({'n': r.get('player'), 't': team, 'pos': pos, 'fpid': r.get('id'), 'pr': rec['pr']})
    return {'scraped': max(scraped) if scraped else None, 'players': out, 'unmatched': unmatched}


def boris_tiers(weekly_rows, m, kick):
    """Tier per player per position. Names are FantasyPros names, so they're matched to the same position's FantasyPros
    rows first. week = the first week whose last game starts after the file was written (the week it was made for)."""
    by_name = {}
    for r in weekly_rows:
        pos = WEEKLY_PAGES.get(r.get('page'))
        if pos:
            by_name[(pos, norm(r.get('player_name')))] = r
    out, unmatched, modified = {}, [], []
    for pos, f in BORIS_FILES.items():
        body, hdr = fetch(BORIS.format(f))
        lm = email.utils.parsedate_to_datetime(hdr.get('Last-Modified')) if hdr.get('Last-Modified') else None
        if lm:
            modified.append(lm)
        for line in body.decode('utf-8').splitlines():
            mt = re.match(r'Tier (\d+):\s*(.*)$', line.strip())
            if not mt:
                continue
            for name in [x.strip() for x in mt.group(2).split(',') if x.strip()]:
                r = by_name.get((pos, norm(name)))
                sid = None
                if r:
                    team = TEAM.get(r.get('team'), r.get('team'))
                    sid, _ = m.fp_player(r.get('fantasypros_id'), r.get('player_name'), team, pos)
                if sid:
                    out[sid] = int(mt.group(1))
                else:
                    unmatched.append({'n': name, 'pos': pos, 'tier': int(mt.group(1))})
    written = min(modified) if modified else None
    week = None
    if written:
        last = {}
        for wk in kick.values():
            for w, iso in wk.items():
                k = datetime.datetime.fromisoformat(iso.replace('Z', '+00:00'))
                last[int(w)] = max(last.get(int(w), k), k)
        later = [w for w, k in last.items() if k > written]
        week = min(later) if later else None
    return {'week': week, 'modified': written.strftime('%Y-%m-%dT%H:%MZ') if written else None, 'players': out, 'unmatched': unmatched}


def espn_projections(m, season, weeks, ros_weeks=()):
    """ESPN's weekly projections (statSourceId 1, split 1; record id '11' + season + week) for the given weeks, plus
    rest of season = the same weekly projection lines summed over ros_weeks (byes project nothing)."""
    body, _ = fetch(ESPN.format(season=season), {'X-Fantasy-Filter': json.dumps({'players': {
        'limit': 1500, 'filterSlotIds': {'value': [0, 2, 4, 6]}, 'sortPercOwned': {'sortPriority': 1, 'sortAsc': False}}})}, timeout=180)
    players = json.loads(body).get('players', [])
    out, unmatched, check, ros = {str(w): {} for w in weeks}, [], [], {}
    for e in players:
        p = e.get('player') or {}
        pos, team = ESPN_POS.get(p.get('defaultPositionId')), ESPN_TEAMS.get(p.get('proTeamId'))
        if not pos:
            continue
        recs = {s.get('id'): s for s in p.get('stats') or []}
        got, ros_sum = {}, {}
        for w in ros_weeks:
            s = recs.get('11' + str(season) + str(w))
            for k, v in ((s or {}).get('stats') or {}).items():
                key = ESPN_STATS.get(int(k))
                if key and v:
                    ros_sum[key] = ros_sum.get(key, 0) + v
        for w in weeks:
            s = recs.get('11' + str(season) + str(w))
            if not s or not s.get('stats'):
                continue
            st = {}
            for k, v in s['stats'].items():
                key = ESPN_STATS.get(int(k))
                if key and v:
                    st[key] = round(v, 2)
            if st.get('pass_att') is not None and st.get('pass_cmp') is not None:
                st['pass_inc'] = round(st['pass_att'] - st['pass_cmp'], 2)
            if st.get('rec') and pos in ('RB', 'WR', 'TE'):
                st['bonus_rec_' + pos.lower()] = st['rec']   # Sleeper's per-position reception bonus keys
            got[str(w)] = st
            check.append((sum(st.get(k, 0) * v for k, v in ESPN_DEFAULT_PPR.items()), s.get('appliedTotal') or 0))
        if not got and not ros_sum:
            continue
        sid, how = m.espn_player(p.get('id'), p.get('fullName'), team, pos)
        if not sid:
            unmatched.append({'n': p.get('fullName'), 't': team, 'pos': pos, 'espn': p.get('id')})
            continue
        for w, st in got.items():
            out[w][sid] = st
        if ros_sum:
            if ros_sum.get('rec') and pos in ('RB', 'WR', 'TE'):
                ros_sum['bonus_rec_' + pos.lower()] = ros_sum['rec']
            ros[sid] = {k: round(v, 1) for k, v in ros_sum.items()}
    close = sum(1 for mine, theirs in check if abs(mine - theirs) <= 0.15)
    return {'weeks': out, 'ros': ros, 'unmatched': unmatched, 'mapping_check': {'lines': len(check), 'within_0_15': close}}


def build_rankings(sleeper, kick, season, week):
    dp_ids = csv_rows('db_playerids.csv')
    m = Matcher(sleeper, dp_ids)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    out = {'season': season, 'generated': now, 'sources': {}, 'weekly': {}, 'ros': {}, 'tiers': {}, 'espn': {}, 'unmatched': {}}
    wk = fp_weekly(m, kick)
    out['weekly'] = wk['players']
    out['sources']['weekly'] = {'week': wk['week'], 'scraped': wk['scraped'], 'n': len(wk['players'])}
    out['unmatched']['weekly'] = wk['unmatched']
    try:
        ro = fp_ros(m)
        out['ros'] = ro['players']
        out['sources']['ros'] = {'scraped': ro['scraped'], 'n': len(ro['players'])}
        out['unmatched']['ros'] = ro['unmatched']
    except Exception as e:
        print('  (FantasyPros ROS mirror unavailable:', e, ')', file=sys.stderr)
    try:
        ti = boris_tiers(wk['rows'], m, kick)
        out['tiers'] = ti['players']
        out['sources']['tiers'] = {'week': ti['week'], 'modified': ti['modified'], 'n': len(ti['players'])}
        out['unmatched']['tiers'] = ti['unmatched']
    except Exception as e:
        print('  (Boris Chen tiers unavailable:', e, ')', file=sys.stderr)
    try:
        es = espn_projections(m, season, [w for w in (week, week + 1) if w <= 18], range(week, 18))   # ROS: this week .. 17
        out['espn'] = es['weeks']
        out['espn_ros'] = {'from': week, 'through': 17, 'players': es['ros']}
        out['sources']['espn'] = {'weeks': sorted(int(w) for w in es['weeks']), 'fetched': now, 'n': {w: len(v) for w, v in es['weeks'].items()},
                                  'mapping_check': es['mapping_check']}
        out['unmatched']['espn'] = es['unmatched']
    except Exception as e:
        print('  (ESPN projections unavailable:', e, ')', file=sys.stderr)
    for k, v in out['sources'].items():
        print(f"  rankings {k}: {v}; unmatched {len(out['unmatched'].get(k, []))}", file=sys.stderr)
    return out
