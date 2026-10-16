// Freezes one real week into tests/fixtures/ so tests/check.html can check the app's math against real data that never
// changes under it (live data drifts every week). Usage: node tools/make-fixture.js [week] [season]
// Leagues: the three Sleepa is developed against (edit LEAGUES to add more). Keeps only what the tests need: each league's
// settings, the week's matchups (every team), and for every starter his raw stats (scoring keys only), his Sleeper
// projection and his player record.
const fs = require('fs'), path = require('path');
const LEAGUES = ['1377495895150440448', '1388763667239034880', '1399047939065700352'];
const week = Number(process.argv[2] || 4), season = String(process.argv[3] || 2026);
const API = 'https://api.sleeper.app/v1';
const get = async function(u){ const r = await fetch(u); if(!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };

(async function(){
  const leagues = [], starters = new Set(), keys = new Set();
  for(const id of LEAGUES){
    const [L, mu] = await Promise.all([get(API + '/league/' + id), get(API + '/league/' + id + '/matchups/' + week)]);
    Object.keys(L.scoring_settings || {}).forEach(function(k){ keys.add(k); });
    mu.forEach(function(e){ (e.starters || []).forEach(function(pid){ if(pid && pid !== '0') starters.add(pid); }); });
    leagues.push({ league_id: id, name: L.name, scoring_settings: L.scoring_settings, roster_positions: L.roster_positions,
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
  const out = { made: new Date().toISOString().slice(0, 10), season: season, week: week, leagues: leagues, stats: stats, proj: proj, players: players };
  const file = path.join(__dirname, '..', 'tests', 'fixtures', 'week' + week + '.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  console.log('wrote', file, Math.round(fs.statSync(file).size / 1024) + ' KB', leagues.length + ' leagues', starters.size + ' starters');
})().catch(function(e){ console.error(e); process.exit(1); });
