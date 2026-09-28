#!/usr/bin/env python3
"""FantasyPros API probe for sleepa: checks what the key actually returns before anything is built on it.

Personal, non-commercial use; data (c) FantasyPros (https://www.fantasypros.com/api-data/).

Reads the key from the FANTASYPROS_API_KEY environment variable (a GitHub Actions secret) and never prints it.
Writes nothing to the repo. Prints, per call: the request (without the key), HTTP status, response size, the
response's own metadata (type / week / count / experts / last updated), the fields a player row carries, and
the rows for a few named test players, so they can be checked against fantasypros.com by hand.

Limits from the API terms of use (PDF at https://api.fantasypros.com/public/v2/terms-of-use, read Sept 2026):
1 call per second and 100 calls per day. This probe makes at most MAX_CALLS calls, 1.2 s apart, and stops on the
first 401 / 403 / 429.
"""
import csv, io, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

BASE = 'https://api.fantasypros.com/public/v2/json'
MAX_CALLS = 10
TEST_NAMES = ['Jahmyr Gibbs', 'Bijan Robinson', 'Breece Hall', 'Matthew Stafford', 'Jaylen Warren', 'Tyler Shough',
              'Kyren Williams', 'Mike Evans']
calls = [0]
last_call = [0.0]


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[.'\-]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def fp(path, params):
    key = os.environ.get('FANTASYPROS_API_KEY')
    if not key:
        sys.exit('FANTASYPROS_API_KEY is not set (add it as a repository secret).')
    if calls[0] >= MAX_CALLS:
        print(f'  (skipped {path}: call budget {MAX_CALLS} reached)')
        return None
    wait = 1.2 - (time.time() - last_call[0])
    if wait > 0:
        time.sleep(wait)
    calls[0] += 1
    last_call[0] = time.time()
    shown = path + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(BASE + path + ('?' + urllib.parse.urlencode(params) if params else ''),
                                 headers={'x-api-key': key, 'User-Agent': 'sleepa-probe/1.0 (personal use)'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
            hdr = {k: v for k, v in r.headers.items() if re.search(r'rate|limit|quota|remaining|retry', k, re.I)}
            print(f'\n### GET {shown} -> {r.status}, {len(body):,} bytes' + (f', headers {hdr}' if hdr else ''))
            return json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read()[:300].decode('utf-8', 'ignore')
        print(f'\n### GET {shown} -> HTTP {e.code}: {body}')
        if e.code in (401, 403, 429):
            print('Stopping: key rejected or rate-limited.')
            calls[0] = MAX_CALLS
        return None
    except Exception as e:
        print(f'\n### GET {shown} -> error {e}')
        return None


def meta(d, skip=('players', 'player', 'injuries', 'items', 'expert_pub', 'expert_name', 'expert_twitter', 'experts', 'filters')):
    return {k: v for k, v in d.items() if k not in skip}


def rows_for(players, name_key):
    want = {norm(n) for n in TEST_NAMES}
    return [p for p in players if norm(p.get(name_key) or '') in want]


def main():
    state = json.loads(urllib.request.urlopen('https://api.sleeper.app/v1/state/nfl', timeout=30).read())
    season, week = int(state['season']), int(state['week'])
    print(f'Sleeper says season {season}, week {week}. Call budget {MAX_CALLS}.')

    # 1. weekly consensus rankings, one position, PPR (the league is full PPR)
    d = fp(f'/nfl/{season}/consensus-rankings', {'position': 'RB', 'scoring': 'PPR', 'week': week})
    if d:
        print('meta:', meta(d))
        pl = d.get('players') or []
        print('player fields:', sorted(pl[0].keys()) if pl else None)
        for p in rows_for(pl, 'player_name'):
            print('  test:', {k: p.get(k) for k in ('player_id', 'player_name', 'player_team_id', 'sportsdata_id', 'player_yahoo_id',
                                                   'rank_ecr', 'pos_rank', 'tier', 'rank_min', 'rank_max', 'rank_ave', 'rank_std')})
        for i in (0, 29, 59):
            if i < len(pl):
                p = pl[i]
                print(f'  row {i + 1}:', p.get('player_name'), p.get('player_team_id'), p.get('rank_ecr'), p.get('pos_rank'), 'tier', p.get('tier'))

    # 2. all positions in one call?
    d = fp(f'/nfl/{season}/consensus-rankings', {'position': 'ALL', 'scoring': 'PPR', 'week': week})
    if d:
        pl = d.get('players') or []
        print('meta:', meta(d))
        pos = {}
        for p in pl:
            pos[p.get('player_position_id')] = pos.get(p.get('player_position_id'), 0) + 1
        print('players by position:', pos)

    # 3. rest-of-season consensus rankings
    d = fp(f'/nfl/{season}/consensus-rankings', {'position': 'RB', 'scoring': 'PPR', 'type': 'ROS'})
    if d:
        print('meta:', meta(d))
        for p in rows_for(d.get('players') or [], 'player_name'):
            print('  test:', {k: p.get(k) for k in ('player_name', 'rank_ecr', 'pos_rank', 'tier', 'rank_min', 'rank_max', 'rank_std')})

    # 4. rankings with the spread (min / max / average / std-dev)
    d = fp(f'/nfl/{season}/rankings', {'week': week, 'range': 'true', 'rankstats': 'true'})
    if d:
        print('meta:', meta(d, skip=('players', 'experts', 'ecr_experts')))
        pl = d.get('players') or []
        print('player fields:', sorted(pl[0].keys()) if pl else None)
        for p in rows_for(pl, 'player_name')[:3]:
            print('  test:', json.dumps({k: p.get(k) for k in ('id', 'player_name', 'team_id', 'rank')})[:1500])

    # 5. weekly projections, one position (raw stat lines; the app would score them with the league's settings)
    d = fp(f'/nfl/{season}/projections', {'position': 'RB', 'week': week})
    if d:
        print('meta:', meta(d))
        pl = d.get('players') or []
        print('player fields:', sorted(pl[0].keys()) if pl else None)
        for p in rows_for(pl, 'name')[:3]:
            print('  test:', json.dumps(p)[:900])

    # 6. several positions in one projections call?
    d = fp(f'/nfl/{season}/projections', {'position': 'ALL', 'positions': 'QB:RB:WR:TE:K:DST', 'week': week})
    if d:
        pl = d.get('players') or []
        pos = {}
        for p in pl:
            pos[p.get('position_id')] = pos.get(p.get('position_id'), 0) + 1
        print('meta:', meta(d), 'players by position:', pos)

    # 7. players with external IDs (for the crosswalk)
    d = fp('/nfl/players', {'external_ids': 'yahoo:espn:rotowire:nfl'})
    if d:
        pl = d.get('players') or []
        print('meta:', meta(d), '| players:', len(pl))
        print('player fields:', sorted(pl[0].keys()) if pl else None)
        for p in rows_for(pl, 'player_name')[:3]:
            print('  test:', json.dumps(p)[:900])
        # crosswalk dry run: FantasyPros sportsdata id -> Sleeper sportradar_id, checked against DynastyProcess
        sl = json.loads(urllib.request.urlopen('https://api.sleeper.app/v1/players/nfl', timeout=120).read())
        by_sr = {v['sportradar_id']: k for k, v in sl.items() if v.get('sportradar_id')}
        dp = list(csv.DictReader(io.StringIO(urllib.request.urlopen(
            'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv', timeout=60).read().decode('utf-8'))))
        dp_fp = {r['fantasypros_id']: r['sleeper_id'] for r in dp if r.get('fantasypros_id') not in (None, '', 'NA') and r.get('sleeper_id') not in (None, '', 'NA')}
        fant = [p for p in pl if p.get('position_id') in ('QB', 'RB', 'WR', 'TE', 'K') and p.get('team_id') not in (None, '', 'FA')]
        by_id = agree = disagree = 0
        for p in fant:
            sid = by_sr.get(p.get('sportsdata_player_id') or '')
            if sid:
                by_id += 1
                d2 = dp_fp.get(str(p.get('player_id')))
                if d2 == sid:
                    agree += 1
                elif d2:
                    disagree += 1
        print(f'crosswalk dry run: {len(fant)} FantasyPros QB/RB/WR/TE/K on a team; {by_id} matched by sportsdata id = Sleeper sportradar_id; '
              f'DynastyProcess agrees on {agree}, disagrees on {disagree}')

    # 8. injuries (evaluation only)
    d = fp('/nfl/injuries', {'year': season, 'week': week, 'include_probabilities': 'true'})
    if d:
        inj = d.get('injuries') or []
        print('meta:', meta(d), '| rows:', len(inj))
        print('row fields:', sorted(inj[0].keys()) if inj else None)
        for r in inj:
            if norm(r.get('name') or '') in {norm(n) for n in TEST_NAMES + ['Justin Jefferson', 'Christian McCaffrey']}:
                print('  test:', {k: r.get(k) for k in ('name', 'status', 'injury_type', 'injury_update_date', 'practice_1', 'practice_2', 'practice_3')})

    print(f'\nDone: {calls[0]} API calls used.')


if __name__ == '__main__':
    main()
