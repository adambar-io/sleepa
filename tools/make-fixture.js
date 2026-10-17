// Freezes one real week into tests/fixtures/ so tests/check.html can check the app's math against real data that never
// changes under it (live data drifts every week). Usage: node tools/make-fixture.js [week] [season]
// Leagues: the three Sleepa is developed against (edit LEAGUES to add more). Keeps only what the tests need: each league's
// settings, the week's matchups (every team), and for every starter his raw stats (scoring keys only), his Sleeper
// projection and his player record.
const fs = require('fs'), path = require('path');
const LEAGUES = ['1377495895150440448', '1388763667239034880', '1399047939065700352'], USER = 'adambarone';
const week = Number(process.argv[2] || 4), season = String(process.argv[3] || 2026);
const API = 'https://api.sleeper.app/v1';
const get = async function(u){ const r = await fetch(u); if(!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };

(async function(){
  const leagues = [], starters = new Set(), keys = new Set(), keep = new Set(), defTeams = new Set();
  const me = await get(API + '/user/' + USER);
  for(const id of LEAGUES){
    const [L, mu, rosters] = await Promise.all([get(API + '/league/' + id), get(API + '/league/' + id + '/matchups/' + week), get(API + '/league/' + id + '/rosters')]);
    const mine = (rosters.find(function(r){ return r.owner_id === me.user_id || (r.co_owners || []).indexOf(me.user_id) !== -1; }) || {}).roster_id;
    const myE = mu.find(function(e){ return e.roster_id === mine; }), oppE = myE && mu.find(function(e){ return e.matchup_id === myE.matchup_id && e.roster_id !== mine; });
    [myE, oppE].forEach(function(e){ ((e && e.starters) || []).forEach(function(pid){ if(!pid || pid === '0') return; keep.add(pid); if(/^[A-Z]{2,3}$/.test(pid)) defTeams.add(pid); }); });
    Object.keys(L.scoring_settings || {}).forEach(function(k){ keys.add(k); });
    mu.forEach(function(e){ (e.starters || []).forEach(function(pid){ if(pid && pid !== '0') starters.add(pid); }); });
    leagues.push({ league_id: id, name: L.name, mine: mine, scoring_settings: L.scoring_settings, roster_positions: L.roster_positions,
      settings: { league_average_match: (L.settings || {}).league_average_match || 0, playoff_week_start: (L.settings || {}).playoff_week_start },
      matchups: mu.map(function(e){ return { roster_id: e.roster_id, matchup_id: e.matchup_id, points: e.points, starters: e.starters, starters_points: e.starters_points, players_points: e.players_points }; }) });
  }
  const [statsRaw, projRaw, playersAll] = await Promise.all([
    get(API + '/stats/nfl/regular/' + season + '/' + week), get(API + '/projections/nfl/regular/' + season + '/' + week),
    Promise.resolve(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'players.json'), 'utf8')).players)]);
  const pick = function(o){ const out = {}; Object.keys(o || {}).forEach(function(k){ if(keys.has(k) && typeof o[k] === 'number' && o[k] !== 0) out[k] = o[k]; }); return out; };
  const stats = {}, proj = {}, players = {};
  starters.forEach(function(pid){
    if(statsRaw[pid]) stats[pid] = pick(statsRaw[pid]);
    if(projRaw[pid]) proj[pid] = pick(projRaw[pid]);
    const p = playersAll[pid];
    if(p) players[pid] = { full_name: p.full_name, position: p.position, fantasy_positions: p.fantasy_positions, team: p.team };
  });
  // the play-by-play (Sleeper GraphQL) for my matchup in each league: every play of the games those starters play in (for the clock),
  // stats only for those starters and for the players of their team defenses (a defense scores from its players' lines)
  const gq = await fetch('https://sleeper.com/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'query { plays(sport: "nfl", season: "' + season + '", season_type: "regular", week: ' + week + ') { play_id game_id sequence time updated_at metadata play_stats { player_id stats } } }' }) }).then(function(r){ return r.json(); });
  const teamOf = function(pid){ const p = playersAll[pid]; return p ? p.team : (/^[A-Z]{2,3}$/.test(pid) ? pid : null); };
  const relTeams = new Set(Array.from(keep).map(teamOf).filter(Boolean)), relGames = new Set();
  (gq.data.plays || []).forEach(function(x){ const m = x.metadata || {}; if(relTeams.has(m.team) || relTeams.has(m.opponent)) relGames.add(x.game_id); });
  const plays = (gq.data.plays || []).filter(function(x){ return relGames.has(x.game_id); }).map(function(x){
    const m = x.metadata || {}, st = {};
    (x.play_stats || []).forEach(function(s){ if(s && s.player_id && s.stats && (keep.has(s.player_id) || defTeams.has(teamOf(s.player_id)))){ st[s.player_id] = s.stats; if(!players[s.player_id] && playersAll[s.player_id]) players[s.player_id] = { full_name: playersAll[s.player_id].full_name, position: playersAll[s.player_id].position, team: playersAll[s.player_id].team }; } });
    const any = Object.keys(st).length > 0;
    return { id: x.play_id, g: x.game_id, q: Number(x.sequence) || 0, t: Number(x.time) || 0, u: Number(x.updated_at) || 0, qn: m.quarter_name || '', mm: m.time_remaining_minutes, ss: m.time_remaining_seconds, d: any ? m.fantasy_description || m.description || '' : '', s: m.is_scoring_play ? 1 : 0, tm: m.team || '', hp: m.home_points, ap: m.away_points, st: st };
  }).sort(function(a, b){ return a.t - b.t || a.q - b.q; });
  const out = { made: new Date().toISOString().slice(0, 10), season: season, week: week, leagues: leagues, stats: stats, proj: proj, players: players, plays: plays };
  const file = path.join(__dirname, '..', 'tests', 'fixtures', 'week' + week + '.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(plays.length + ' plays');
  console.log('wrote', file, Math.round(fs.statSync(file).size / 1024) + ' KB', leagues.length + ' leagues', starters.size + ' starters');
})().catch(function(e){ console.error(e); process.exit(1); });
