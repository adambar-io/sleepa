  // ============ Huddle every league (preview: tools/huddle-all, built into huddle.html) ============
  // Every league's lineup in one pass, in the order Sleepa lists your leagues. Each step loads that league the normal
  // way (loadEverything, quiet), so projections, scoring, matchup steps, typical weeks and the win chance are that
  // league's own. The suggested lineup is Optimal Lineup's (optimalStarters: locks, flex calibration, tie-breakers).
  // A close call = a bench player within HX_CLOSE points of the pick for a slot; it is compared like the terminal's
  // start/sit duel (cards, verdict, outcome curves, reasons you can drop, the numbers). Locking saves the lineup as that
  // league's Huddle lineup (the latest save wins over the per-league Huddle), keeps a summary for the overview, and moves
  // on. Closing goes back to the league you started from.
  const HX_CLOSE = 1.5, HX_MAX = 4, HX_COLORS = ['var(--pos-QB)', 'var(--pos-WR)', 'var(--pos-TE)', 'var(--pos-RB)'];   // the terminal's validated compare order
  const HX_LENS = { floor: 'Play it safe', ceil: 'Need a big week', proj: 'Just projection' };
  const HX_BAD_WX = { rain: 1, snow: 1, wind: 1, storm: 1 };
  const HX_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17.5l2 2 4-4"/></svg>';
  const HX = { el: null, open: false, i: 0, n: 0, leagues: [], origId: null, busy: false, err: '', m: null, plan: null, dec: {}, openRow: null, lens: {}, off: {},
    touched: false, swap: null, slotFor: null, cmp: [], cmpOpen: false };   // swap: slot whose picker is open; slotFor: bench player choosing a slot; cmp: players picked to compare
  function hxReal(pid){ return !!(pid && pid !== '0' && ctx.players && ctx.players[pid]); }
  function hxKey(){ return 'rv-hx:' + ctx.season + ':' + ctx.week; }
  function hxStore(){ try{ const s = JSON.parse(localStorage.getItem(hxKey()) || 'null'); return s && s.leagues ? s : { leagues: {} }; }catch(e){ return { leagues: {} }; } }
  function hxWrite(st){ try{ lsSet(hxKey(), JSON.stringify(st)); }catch(e){ console.warn('Could not keep your all-leagues Huddle', e); } }
  function hxProj(pid){ return (ctx.projections && ctx.projections[pid]) || 0; }
  function hxPlays(pid){ return hxReal(pid) && !isOnBye(pid) && !cantPlay(effectiveStatus(pid)); }
  function hxTotal(arr){ return (arr || []).reduce(function(a, pid){ return a + (hxPlays(pid) ? hxProj(pid) : 0); }, 0); }
  function hxWin(starters){ const mu = myMatchup(); return mu ? winProb(wpTeam(starters), wpTeam(mu.starters)) : null; }
  function hxAutoLens(wp){ return wp === null || wp === undefined ? 'proj' : wp < WP_UNDERDOG ? 'ceil' : wp > WP_FAVORITE ? 'floor' : 'proj'; }
  function hxSlotColor(label){ return FLEX_GROUPS[label] && FLEX_GROUPS[label].length > 1 ? 'var(--pos-FLEX)' : posColor(label); }
  function hxSlotNames(slots){
    const tot = {}, seen = {};
    slots.forEach(function(sl){ const k = slotShort(sl); tot[k] = (tot[k] || 0) + 1; });
    return slots.map(function(sl){ const k = slotShort(sl); seen[k] = (seen[k] || 0) + 1; return tot[k] > 1 ? k + seen[k] : k; });
  }
  function hxFmt(){
    const lg = ctx.league || {}, rec = (lg.scoring_settings || {}).rec || 0;
    return [rec >= 1 ? 'PPR' : rec >= 0.5 ? 'Half PPR' : 'Standard', isIdpLeague() ? 'IDP' : '', lg.total_rosters ? lg.total_rosters + ' teams' : ''].filter(Boolean).join(' · ');
  }

  // ---- open, step, close ----
  function hxOpen(){
    if(!ctx.myRoster || !ctx.league) return;
    const list = ctx.pendingLeagues && ctx.pendingLeagues.length ? ctx.pendingLeagues : [ctx.league];
    HX.leagues = list.map(function(l){ return { id: l.league_id, name: l.name || 'League' }; });
    HX.n = HX.leagues.length; HX.origId = ctx.league.league_id; HX.open = true;
    if(!HX.el) hxMount();
    HX.el.hidden = false;
    document.documentElement.classList.add('hx-open');
    const st = hxStore();
    const cur = HX.leagues.findIndex(function(L){ return L.id === ctx.league.league_id; });
    const first = HX.leagues.findIndex(function(L){ return !st.leagues[L.id]; });
    // start where you are when that league isn't set yet, else at the first one that isn't; all set: the overview
    hxGo(cur !== -1 && !st.leagues[HX.leagues[cur].id] ? cur : first === -1 ? HX.n : first);
  }
  async function hxGo(i){
    if(HX.busy) return;
    HX.i = i; HX.openRow = null; HX.err = ''; HX.swap = null; HX.slotFor = null; HX.cmp = []; HX.cmpOpen = false;
    if(i >= HX.n){ HX.m = null; hxRender(true); return; }
    const L = HX.leagues[i];
    if(!ctx.league || ctx.league.league_id !== L.id){
      HX.busy = true; HX.m = null; hxRender(true);
      try{ await loadEverything(L.id, null, { quiet: true }); }catch(e){ console.warn('Huddle every league: load failed', e); }
      HX.busy = false;
      if(HX.origId) rememberLogin(HX.origId);   // the app still opens to your own league next time
      if(!HX.open || HX.i !== i) return;
      if(!ctx.league || ctx.league.league_id !== L.id || !ctx.myRoster){ HX.err = 'Couldn’t load ' + L.name + '.'; hxRender(true); return; }
    }
    hxBuild();
    hxRender(true);
  }
  function hxClose(){
    if(!HX.open) return;
    HX.open = false; HX.openRow = null;
    HX.el.hidden = true;
    document.documentElement.classList.remove('hx-open');
    if(ctx.league && HX.origId && ctx.league.league_id !== HX.origId){
      const inApp = els.rosterScreen.style.display !== 'none';
      loadEverything(HX.origId, null, inApp ? { quiet: true } : null);
    }else renderAll();
  }

  // ---- the model for the league on screen ----
  function hxBuild(){
    const slots = ctx.rosterPositions, sl = ctx.originalStarters.slice(), names = hxSlotNames(slots);
    const opt = optimalStarters(), rec = opt.starters.slice();
    const parked = new Set([].concat(ctx.myRoster.reserve || [], ctx.myRoster.taxi || []));
    const ok = function(pid){ return hxReal(pid) && !parked.has(pid) && !isLocked(pid) && hxPlays(pid) && typeof ctx.projections[pid] === 'number'; };
    const inRec = new Set(rec.filter(hxReal)), inSl = new Set(sl.filter(hxReal));
    const bench = rosterActive(ctx.myRoster).filter(function(pid){ return !inRec.has(pid) && ok(pid); });
    const rows = slots.map(function(label, i){
      const cur = sl[i], r = rec[i], row = { i: i, label: label, name: names[i], cur: cur, rec: r, cands: [] };
      if(hxReal(cur) && isLocked(cur)){ row.kind = 'locked'; return row; }
      if(ok(r)){
        const floor = hxProj(r) - HX_CLOSE;
        row.cands = [r].concat(bench.filter(function(b){ return canFill(b, label) && hxProj(b) >= floor; })
          .sort(function(a, b){ return hxProj(b) - hxProj(a); })).slice(0, HX_MAX);
      }
      // same starters, another slot (Optimal Lineup puts the latest kickoff in a flex): a move, not a decision
      const shuffle = r !== cur && hxReal(r) && inSl.has(r) && (!hxReal(cur) || inRec.has(cur));
      row.kind = row.cands.length > 1 ? 'call' : !hxReal(r) ? 'empty' : shuffle ? 'move' : r !== cur ? 'sure' : 'keep';
      row.note = opt.notes.find(function(x){ return x.slot === label && x.pick && x.pick.pid === r; }) || null;
      if(row.kind === 'sure') row.why = hxSureWhy(cur, r, sl, rec, names, parked);
      if(row.kind === 'move'){
        const lf = (opt.lateFlex || []).find(function(x){ return x.late === r || x.early === r; });
        row.why = lf && lf.late === r ? 'Later game (' + zKickShort(lf.lateT) + ') in ' + names[i] + ': room to swap if news breaks'
          : lf ? 'Swapped with ' + lastName(lf.late) + ' so the later game sits in the flex' : 'Same starters, moved from ' + names[sl.indexOf(r)];
      }
      return row;
    });
    let plan = rec.slice(), touched = false;
    const dec = {};
    const saved = hxStore().leagues[ctx.league.league_id];
    const fromSaved = saved && Array.isArray(saved.plan) && saved.plan.length === plan.length && JSON.stringify(saved.sleeper) === JSON.stringify(sl) ? hxValidPlan(saved.plan, rows, parked) : null;
    if(fromSaved){
      // locked here before (same Sleeper lineup): the whole lineup comes back, your own moves included
      plan = fromSaved; touched = JSON.stringify(plan) !== JSON.stringify(rec);
      rows.forEach(function(row){ if(row.kind === 'call') dec[row.i] = 'saved'; });
    }else if(ctx.handEdited && JSON.stringify(ctx.draftStarters) !== JSON.stringify(sl)){
      // a lineup you saved in the league's own Huddle: its close-call choices carry over
      rows.forEach(function(row){ const p = ctx.draftStarters[row.i]; if(row.kind === 'call' && row.cands.indexOf(p) !== -1 && p !== plan[row.i]){ plan = hxSwap(plan, slots, row.i, p, ok); dec[row.i] = 'plan'; } });
    }
    const mu = myMatchup();
    HX.m = { id: ctx.league.league_id, slots: slots, names: names, sl: sl, rec: rec, rows: rows, ok: ok, parked: parked,
      wp0: hxWin(rec), opp: mu ? mu.name : '', team: (els.teamName && els.teamName.textContent) || 'Your team', locks: opt.locked.length, lateFlex: opt.lateFlex || [] };
    HX.plan = plan; HX.dec = dec; HX.lens = {}; HX.off = {}; HX.touched = touched;
  }
  // A lineup from before (saved, or the one on screen before new data): still yours? Everyone on the roster and out of
  // IR / taxi, nobody twice, players whose game started where Sleeper has them. null = no longer valid.
  function hxValidPlan(p, rows, parked){
    const on = new Set(ctx.myRoster.players || []), seen = new Set();
    for(let i = 0; i < p.length; i++){
      const pid = p[i], row = rows[i];
      if(row && row.kind === 'locked' && pid !== row.cur) return null;
      if(!hxReal(pid)) continue;
      if(!on.has(pid) || parked.has(pid) || seen.has(pid) || !canFill(pid, row.label)) return null;
      if(isLocked(pid) && pid !== row.cur) return null;
      seen.add(pid);
    }
    return p.slice();
  }
  // can this player be put in (or taken out of) a slot here? Sleeper won't move a player whose game has started.
  function hxMovable(pid){ return !hxReal(pid) || !isLocked(pid); }
  function hxNoStart(pid){
    if(!hxReal(pid)) return 'Not on your roster';
    if(HX.m && HX.m.parked.has(pid)) return (ctx.myRoster.taxi || []).indexOf(pid) !== -1 ? 'Taxi squad' : 'IR spot';
    if(isLocked(pid)) return 'Game started';
    return '';
  }
  function hxSureWhy(cur, r, sl, rec, names, parked){
    if(!hxReal(cur)) return 'Fills an empty slot';
    const st = statusInfo(effectiveStatus(cur));
    if(isOnBye(cur)) return lastName(cur) + ' is on bye';
    if(st && st.out) return lastName(cur) + ' is ' + st.label;
    if(parked.has(cur)) return lastName(cur) + ' is in an IR spot';
    const from = sl.indexOf(r), to = rec.indexOf(cur);
    if(to !== -1) return lastName(cur) + ' moves to ' + names[to] + (from !== -1 ? ', ' + lastName(r) + ' from ' + names[from] : '');
    if(from !== -1) return lastName(r) + ' moves over from ' + names[from];
    return '+' + (hxProj(r) - hxProj(cur)).toFixed(1) + ' over ' + lastName(cur);
  }
  // Start pid in slot i. If he's already starting elsewhere, the player he replaces takes that slot when he fits it;
  // otherwise that slot gets the best player left who fits.
  function hxSwap(plan, slots, i, pid, ok){
    plan = plan.slice();
    const prev = plan[i], j = plan.indexOf(pid);
    plan[i] = pid;
    if(j !== -1 && j !== i){
      if(hxReal(prev) && canFill(prev, slots[j])) plan[j] = prev;
      else{
        const used = new Set(plan.filter(hxReal));
        const best = rosterActive(ctx.myRoster).filter(function(x){ return !used.has(x) && ok(x) && canFill(x, slots[j]); })
          .sort(function(a, b){ return hxProj(b) - hxProj(a); })[0];
        plan[j] = best || '0';
      }
    }
    return plan;
  }
  // Any move on your roster: start pid in slot i (a close call, the swap picker, a bench player's Start, a comparison).
  function hxPick(i, pid){
    const m = HX.m;
    if(!m || !m.slots[i]) return;
    HX.swap = null; HX.slotFor = null;
    if(HX.plan[i] === pid){ HX.dec[i] = HX.dec[i] || 'you'; hxRender(); return; }
    if(hxNoStart(pid) || !hxMovable(HX.plan[i]) || !canFill(pid, m.slots[i])) return;
    const j = HX.plan.indexOf(pid);
    if(j !== -1 && !hxMovable(pid)) return;
    HX.plan = hxSwap(HX.plan, m.slots, i, pid, m.ok);
    HX.dec[i] = 'you'; HX.touched = true;
    hxRender();
  }
  function hxBench(){
    const m = HX.m, inPlan = new Set(HX.plan.filter(hxReal));
    const res = new Set(ctx.myRoster.reserve || []), taxi = new Set(ctx.myRoster.taxi || []);
    return (ctx.myRoster.players || []).filter(function(pid){ return hxReal(pid) && !inPlan.has(pid); }).map(function(pid){
      const st = statusInfo(effectiveStatus(pid));
      const lost = m.rows.find(function(r){ return r.kind === 'call' && r.cands.indexOf(pid) !== -1 && HX.plan[r.i] !== pid && hxReal(HX.plan[r.i]); });
      const why = res.has(pid) ? 'IR spot' : taxi.has(pid) ? 'Taxi' : isOnBye(pid) ? 'Bye' : st && st.out ? st.label
        : isLocked(pid) ? 'Game started' : m.rec.indexOf(pid) !== -1 && !lost ? 'Benched by you (Sleepa starts him)' : lost ? 'Close call: ' + lastName(HX.plan[lost.i]) + ' at ' + lost.name
        : typeof ctx.projections[pid] !== 'number' ? 'No projection' : 'Lower projection';
      return { pid: pid, why: why, park: res.has(pid) || taxi.has(pid) };
    }).sort(function(a, b){ return a.park - b.park || hxProj(b.pid) - hxProj(a.pid); });
  }

  // ---- one candidate's numbers (the Start / Sit data) and the reasons for a two-player call ----
  function hxData(pid, k){ return Object.assign(ssData(pid, null), { c: HX_COLORS[k % HX_COLORS.length], k: k }); }
  function hxToneIdx(pid){ const t = oppTone(pid); return t ? OPP_STEPS.indexOf(t.tone) : null; }
  function hxWx(d){ const g = d.p && d.p.team ? intelGameFor(d.p.team) : null, x = g ? wxKind(g) : null; return x && HX_BAD_WX[x.k] ? x : null; }
  function hxReasons(a, b, lens){
    const R = [], side = function(x){ return x === a ? 0 : 1; }, other = function(x){ return x === a ? b : a; };
    const gap = a.proj - b.proj, ag = Math.abs(gap);
    if(ag >= 0.1) R.push({ k: 'proj', s: gap > 0 ? 0 : 1, w: ag >= 1 ? 3 : ag >= 0.4 ? 2 : 1, t: 'Projects ' + ag.toFixed(1) + ' more' });
    if(a.floor !== null && b.floor !== null && Math.abs(a.floor - b.floor) >= 0.5){
      const s = a.floor > b.floor ? a : b;
      R.push({ k: 'floor', s: side(s), w: lens === 'floor' ? 3 : 1, t: 'Safer: his bad week is ' + s.floor.toFixed(1) + ' vs ' + other(s).floor.toFixed(1) });
    }
    if(a.ceil !== null && b.ceil !== null && Math.abs(a.ceil - b.ceil) >= 0.5){
      const s = a.ceil > b.ceil ? a : b;
      R.push({ k: 'ceil', s: side(s), w: lens === 'ceil' ? 3 : 1, t: 'More upside: his good week is ' + s.ceil.toFixed(1) + ' vs ' + other(s).ceil.toFixed(1) });
    }
    const ta = hxToneIdx(a.pid), tb = hxToneIdx(b.pid);
    if(ta !== null && tb !== null && ta !== tb){
      const s = ta < tb ? a : b;   // projections already price the matchup in: a tie-breaker, not a second vote
      R.push({ k: 'mu', s: side(s), w: 1, t: 'Easier matchup: ' + s.opp + (s.dvp ? ' gives up the ' + dvpLabel(s.dvp) : '') });
    }
    const hot = function(d){ return d.l3 !== null && d.l3 - d.proj >= 2; };
    if(hot(a) !== hot(b)){ const s = hot(a) ? a : b; R.push({ k: 'form', s: side(s), w: 1, t: 'Hot lately: ' + s.l3.toFixed(1) + ' a game over his last 3' }); }
    const ga = posGroup(a.pid), gb = posGroup(b.pid);
    if(ga === gb && (ga === 'RB' || ga === 'WR' || ga === 'TE')){
      const x = seasonShare(a.pid, 't'), y = seasonShare(b.pid, 't');
      if(typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) >= 0.04){ const s = x > y ? a : b; R.push({ k: 'role', s: side(s), w: 1, t: 'Bigger role: ' + Math.round(Math.max(x, y) * 100) + '% of targets vs ' + Math.round(Math.min(x, y) * 100) + '%' }); }
    }else{
      const x = seasonShare(a.pid, 's'), y = seasonShare(b.pid, 's');
      if(typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) >= 0.08){ const s = x > y ? a : b; R.push({ k: 'role', s: side(s), w: 1, t: 'Plays more: ' + Math.round(Math.max(x, y) * 100) + '% of snaps vs ' + Math.round(Math.min(x, y) * 100) + '%' }); }
    }
    if(!!a.st !== !!b.st){ const hurt = a.st ? a : b; R.push({ k: 'st', s: side(other(hurt)), w: 2, t: 'Healthy, while ' + hurt.last + ' is ' + hurt.st.label }); }
    const wa = hxWx(a), wb = hxWx(b);
    if(!!wa !== !!wb){ const bad = wa ? a : b, x = wa || wb; R.push({ k: 'wx', s: side(other(bad)), w: 1, t: 'Weather: ' + bad.last + '’s game is ' + x.t.split(' · ')[0].toLowerCase() }); }
    if(a.kick && b.kick && Math.abs(a.kick - b.kick) >= 2 * HOUR){ const s = a.kick > b.kick ? a : b; R.push({ k: 'late', s: side(s), w: 1, t: 'Later game: room to swap if news breaks' }); }
    return R;
  }
  function hxTug(row, ds, lens){
    const off = HX.off[row.i] || {}, R = hxReasons(ds[0], ds[1], lens);
    const t = [0, 0];
    R.forEach(function(r){ if(!off[r.k]) t[r.s] += r.w; });
    return { R: R, t: t, lean: t[0] === t[1] ? null : t[0] > t[1] ? 0 : 1, off: off };
  }

  // ---- render ----
  function hxMount(){
    const el = document.createElement('div');
    el.id = 'hx'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Huddle every league');
    el.innerHTML = '<div class="hx-top"><div class="hx-title"><small>Huddle every league</small><span id="hx-wk"></span></div><div class="hx-steps" id="hx-steps"></div>' +
      '<button type="button" class="hx-x" data-hx-x aria-label="Close">×</button></div><div class="hx-body" id="hx-body"></div>';
    document.body.appendChild(el);
    HX.el = el;
    el.addEventListener('click', hxClick);
  }
  function hxRender(top){
    if(!HX.el || !HX.open) return;
    const st = hxStore();
    document.getElementById('hx-wk').textContent = 'Week ' + ctx.week;
    document.getElementById('hx-steps').innerHTML = HX.leagues.map(function(L, i){
      return '<button type="button" class="hx-step" data-hx-step="' + i + '"' + (i === HX.i ? ' aria-current="step"' : '') + (HX.busy ? ' disabled' : '') + '>' +
        (st.leagues[L.id] ? '<span class="hx-ck" aria-label="set">✓</span>' : '') + escapeHTML(L.name) + '</button>';
    }).join('') + '<button type="button" class="hx-step" data-hx-step="' + HX.n + '"' + (HX.i >= HX.n ? ' aria-current="step"' : '') + (HX.busy ? ' disabled' : '') + '>Overview</button>';
    const body = document.getElementById('hx-body'), y = body.scrollTop;
    body.innerHTML = safeHTML('Huddle every league', function(){
      if(HX.busy) return '<div class="hx-wrap"><div class="hx-card hx-load"><div class="hx-spin"></div>Loading ' + escapeHTML(HX.leagues[HX.i].name) + '…</div></div>';
      if(HX.err) return '<div class="hx-wrap"><div class="hx-card hx-load">' + escapeHTML(HX.err) + '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center"><button type="button" class="hx-btn pri" data-hx-retry>Try again</button><button type="button" class="hx-btn" data-hx-step="' + (HX.i + 1) + '">Skip</button></div></div></div>';
      return HX.i >= HX.n ? hxOverviewHTML(st) : hxLeagueHTML();
    });
    body.scrollTop = top ? 0 : y;
    const cur = HX.el.querySelector('.hx-step[aria-current]');
    if(cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function hxPosChip(pid){ const g = posGroup(pid); return '<span class="hx-pos" style="--pc:' + posColor(g) + '">' + escapeHTML(eligLabel(pid) || g) + '</span>'; }
  function hxOppHTML(pid){
    const p = ctx.players[pid] || {}, m = matchup(p.team, ctx.week);
    if(!m) return '';
    return m.bye ? '<span class="opp bye">BYE</span>' : oppToneHTML(pid, m.text);
  }
  function hxSubHTML(pid, opts){
    const p = ctx.players[pid] || {}, r = weekRange(pid), k = kickoff(p.team, ctx.week);
    return '<div class="hx-sub">' + hxPosChip(pid) + '<span>' + escapeHTML(p.team || 'FA') + '</span>' + hxOppHTML(pid) +
      (k && !(opts && opts.noKick) ? '<span class="hx-rng">' + escapeHTML(zKickShort(k)) + '</span>' : '') + injuryChip(effectiveStatus(pid)) +
      (r && r.ok && !(opts && opts.noRange) ? '<span class="hx-rng" title="Typical week: ' + escapeHTML(rangeBasis(r)) + '">' + r.floor.toFixed(1) + '–' + r.ceil.toFixed(1) + '</span>' : '') + '</div>';
  }
  function hxLeagueHTML(){
    const m = HX.m, plan = HX.plan;
    if(!m) return '';
    const wp = hxWin(plan), was = hxTotal(m.sl), now = hxTotal(plan), d = now - was;
    const calls = m.rows.filter(function(r){ return r.kind === 'call'; }), open = calls.filter(function(r){ return !HX.dec[r.i]; }).length;
    const sure = m.rows.filter(function(r){ return r.kind === 'sure'; }).length, moves = m.rows.filter(function(r){ return r.kind === 'move'; }).length;
    const lensWord = HX_LENS[hxAutoLens(m.wp0)].toLowerCase();
    let h = '<div class="hx-wrap">';
    h += '<div class="hx-card hx-lh"><div class="hx-lh-main"><div class="hx-eb">League ' + (HX.i + 1) + ' of ' + HX.n + ' · ' + escapeHTML(hxFmt()) + '</div><h2>' + escapeHTML(ctx.league.name) + '</h2>' +
      '<div class="hx-lh-mu"><b>' + escapeHTML(m.team) + '</b>' + (m.opp ? ' vs <b>' + escapeHTML(m.opp) + '</b>' : ' · no opponent this week') + '</div></div>' +
      (wp !== null ? '<div class="hx-wp"><b>' + Math.round(wp * 100) + '%</b><span>to win with this lineup</span><span>' + (m.wp0 < WP_UNDERDOG ? 'Underdog' : m.wp0 > WP_FAVORITE ? 'Favorite' : 'Toss-up') + ': close calls start on “' + lensWord + '”</span></div>' : '') +
      '<div class="hx-sum"><span><b>' + calls.length + '</b> close call' + (calls.length === 1 ? '' : 's') + (calls.length ? ' (' + (open ? open + ' to look at' : 'all decided') + ')' : '') + '</span>' +
      '<span><b>' + sure + '</b> swap' + (sure === 1 ? '' : 's') + ' Sleepa made</span>' + (moves ? '<span><b>' + moves + '</b> slot move' + (moves === 1 ? '' : 's') + '</span>' : '') + (m.locks ? '<span><b>' + m.locks + '</b> locked (game started)</span>' : '') +
      '<span>Projected <b>' + was.toFixed(1) + '</b> in Sleeper → <b>' + now.toFixed(1) + '</b>' + (Math.abs(d) >= 0.05 ? ' <span class="hx-up">' + (d > 0 ? '+' : '') + d.toFixed(1) + '</span>' : '') + '</span></div></div>';
    h += hxCmpPanelHTML();
    h += '<div class="hx-card"><div class="hx-eb">Your lineup · Swap any slot, compare any two</div><div class="hx-list">' + m.rows.map(function(r){ return hxRowHTML(r) + (HX.swap === r.i ? hxSwapHTML(r.i) : ''); }).join('') + '</div></div>';
    const bench = hxBench();
    h += '<div class="hx-card"><div class="hx-eb">Bench · ' + bench.length + '</div><div class="hx-bench">' + bench.map(function(b){
      const no = hxNoStart(b.pid);
      return '<div class="hx-brow">' + photoHTML(b.pid, 'hx-sav') + '<div><div class="hx-bn">' + escapeHTML(playerName(ctx.players[b.pid])) + '</div>' + hxSubHTML(b.pid, { noRange: true, noKick: true }) +
          '<div class="hx-acts">' + (no ? '' : '<button type="button" class="hx-mini" data-hx-slotfor="' + escapeHTML(b.pid) + '" aria-expanded="' + (HX.slotFor === b.pid) + '">Start ▾</button>') + hxCmpBtn(b.pid) + '</div></div>' +
        '<span class="hx-bw">' + escapeHTML(b.why) + '</span><span class="hx-bp">' + (typeof ctx.projections[b.pid] === 'number' ? hxProj(b.pid).toFixed(1) : '—') + '</span></div>' +
        (HX.slotFor === b.pid ? hxSlotChooserHTML(b.pid) : '');
    }).join('') + '</div></div>';
    h += '</div>';
    const next = HX.i + 1 < HX.n ? 'Lock · next: ' + escapeHTML(HX.leagues[HX.i + 1].name) : 'Lock · see overview';
    h += '<div class="hx-foot">' + hxTrayHTML() + '<div class="hx-foot-in"><div class="hx-foot-t">Projected <b>' + now.toFixed(1) + '</b>' + (wp !== null ? ' · <b>' + Math.round(wp * 100) + '%</b> to win' : '') +
      (open ? '<small>' + open + ' close call' + (open === 1 ? '' : 's') + ' left: locking keeps Sleepa’s lean' + (open === 1 ? '' : 's') + '.</small>' : '<small>Locking saves this as your Huddle lineup for ' + escapeHTML(ctx.league.name) + '.</small>') + '</div>' +
      (HX.i > 0 ? '<button type="button" class="hx-btn" data-hx-step="' + (HX.i - 1) + '">‹ Back</button>' : '') +
      '<button type="button" class="hx-btn pri" data-hx-lock>' + next + ' ›</button></div></div>';
    return h;
  }
  function hxRowHTML(row){
    const pid = HX.plan[row.i], sc = hxSlotColor(row.label);
    const slot = '<span class="hx-slot" style="--sc:' + sc + '">' + escapeHTML(row.name) + '</span>';
    if(row.kind === 'call') return hxCallHTML(row, slot);
    if(!hxReal(pid)) return '<div class="hx-row k-empty">' + slot + '<span></span><div class="hx-who"><div class="hx-nm">Empty</div><div class="hx-sub">No one on your roster can play here this week.</div></div><span></span><span class="hx-tag t-empty">Empty</span></div>';
    const pc = posColor(posGroup(pid)), cur = row.cur;
    const moved = pid !== row.rec;   // a pick elsewhere pushed someone into this slot
    const tag = row.kind === 'locked' ? '<span class="hx-tag t-lock">Locked</span>'
      : row.kind === 'move' && !moved ? '<span class="hx-tag t-keep">Moved</span>'
      : row.kind === 'sure' && !moved ? '<span class="hx-tag t-sure">Swap made</span>'
      : pid !== cur ? '<span class="hx-tag t-sure">Change</span>' : '<span class="hx-tag t-keep">Keep</span>';
    const why = row.kind === 'sure' && !moved ? '<div class="hx-why">' + (hxReal(cur) ? 'For ' + escapeHTML(lastName(cur)) + ' · ' : '') + escapeHTML(row.why) + '</div>'
      : row.kind === 'move' && !moved ? '<div class="hx-why hx-muted">' + escapeHTML(row.why) + '</div>'
      : moved ? '<div class="hx-why">' + (pid === cur ? 'Kept, your call' : HX.touched ? 'Your change' : 'Moved here by a close call') + (hxReal(row.rec) ? ' · Sleepa had ' + escapeHTML(lastName(row.rec)) : '') + '</div>' : '';
    const undo = row.kind === 'sure' && !moved && hxReal(cur) && HX.m.ok(cur) ? '<button type="button" class="hx-undo" data-hx-undo="' + row.i + '">Keep ' + escapeHTML(lastName(cur)) + '</button>' : tag;
    const back = moved && hxReal(row.rec) && !hxNoStart(row.rec) && row.kind !== 'locked' ? '<button type="button" class="hx-mini" data-hx-pick="' + row.i + '|' + escapeHTML(row.rec) + '">Use ' + escapeHTML(lastName(row.rec)) + '</button>' : '';
    const acts = '<div class="hx-acts">' + (row.kind !== 'locked' ? '<button type="button" class="hx-mini" data-hx-swap="' + row.i + '" aria-expanded="' + (HX.swap === row.i) + '">Swap ▾</button>' : '') + back + hxCmpBtn(pid) + '</div>';
    return '<div class="hx-row k-' + row.kind + '" style="--pc:' + pc + '">' + slot + photoBadgeHTML(pid, 'hx-av') +
      '<div class="hx-who"><div class="hx-nm">' + escapeHTML(playerName(ctx.players[pid])) + '</div>' + hxSubHTML(pid) + why + acts + '</div>' +
      '<div class="hx-pts">' + hxProj(pid).toFixed(1) + '<small>proj</small></div>' + (row.kind === 'sure' && !moved ? undo : tag) + '</div>';
  }
  // ---- any move, any comparison ----
  function hxCmpBtn(pid){
    if(!hxReal(pid)) return '';
    const on = HX.cmp.indexOf(pid) !== -1;
    return '<button type="button" class="hx-mini' + (on ? ' on' : '') + '" data-hx-cmpadd="' + escapeHTML(pid) + '" aria-pressed="' + on + '">' + (on ? '✓ Comparing' : '+ Compare') + '</button>';
  }
  function hxWhere(pid){ const j = HX.plan.indexOf(pid); return j !== -1 ? 'Starting at ' + HX.m.names[j] : 'Bench'; }
  // Swap ▾ on a slot: everyone on your roster who can play it, from your bench or another slot
  function hxSwapHTML(i){
    const m = HX.m, label = m.slots[i], cur = HX.plan[i];
    const list = (ctx.myRoster.players || []).filter(function(pid){ return hxReal(pid) && pid !== cur && canFill(pid, label); })
      .sort(function(a, b){ return !!hxNoStart(a) - !!hxNoStart(b) || hxProj(b) - hxProj(a); });
    return '<div class="hx-pick"><div class="hx-pick-h"><b>Swap ' + escapeHTML(m.names[i]) + '</b><span>Everyone on your roster who can play ' + escapeHTML(slotShort(label)) + (hxReal(cur) ? ', in for ' + escapeHTML(playerName(ctx.players[cur])) : '') + '</span>' +
      '<button type="button" class="hx-undo" data-hx-swap="' + i + '">Close</button></div>' + (list.map(function(pid){
        const no = hxNoStart(pid), j = HX.plan.indexOf(pid);
        return '<div class="hx-prow">' + photoHTML(pid, 'hx-sav') + '<div class="hx-who"><div class="hx-bn">' + escapeHTML(playerName(ctx.players[pid])) + ' <span class="hx-where">' + escapeHTML(hxWhere(pid)) + '</span></div>' + hxSubHTML(pid, { noRange: true }) + '</div>' +
          '<span class="hx-bp">' + (typeof ctx.projections[pid] === 'number' ? hxProj(pid).toFixed(1) : '—') + '</span>' +
          '<span class="hx-acts">' + hxCmpBtn(pid) + (no ? '<span class="hx-no">' + escapeHTML(no) + '</span>' : '<button type="button" class="hx-mini pri" data-hx-pick="' + i + '|' + escapeHTML(pid) + '">' + (j !== -1 ? 'Switch slots' : 'Start') + '</button>') + '</span></div>';
      }).join('') || '<div class="hx-muted" style="font-size:13px;padding:6px 0">No one else on your roster can play this slot.</div>') + '</div>';
  }
  // Start ▾ on a bench player: the slots he can play and who he'd replace
  function hxSlotChooserHTML(pid){
    const m = HX.m, js = m.slots.map(function(l, j){ return j; }).filter(function(j){ return canFill(pid, m.slots[j]) && hxMovable(HX.plan[j]); });
    return '<div class="hx-pick"><div class="hx-pick-h"><b>Start ' + escapeHTML(playerName(ctx.players[pid])) + '</b><span>Pick the slot</span><button type="button" class="hx-undo" data-hx-slotfor="' + escapeHTML(pid) + '">Close</button></div><div class="hx-slots">' +
      (js.map(function(j){
        const o = HX.plan[j];
        return '<button type="button" class="hx-slotb" data-hx-pick="' + j + '|' + escapeHTML(pid) + '"><span class="hx-slot" style="--sc:' + hxSlotColor(m.slots[j]) + '">' + escapeHTML(m.names[j]) + '</span>' +
          '<span>' + (hxReal(o) ? 'for ' + escapeHTML(playerName(ctx.players[o])) + ' <span class="hx-op">' + hxProj(o).toFixed(1) + '</span>' : 'empty slot') + '</span></button>';
      }).join('') || '<span class="hx-muted" style="font-size:13px">No open slot he can play (the ones he fits are locked).</span>') + '</div></div>';
  }
  function hxTrayHTML(){
    if(!HX.cmp.length) return '';
    const n = HX.cmp.length;
    return '<div class="hx-tray"><span class="hx-eb">Compare</span>' + HX.cmp.map(function(pid){
      return '<span class="hx-tchip">' + photoHTML(pid, 'hx-sav') + escapeHTML(playerName(ctx.players[pid])) + '<button type="button" data-hx-cmpadd="' + escapeHTML(pid) + '" aria-label="Remove ' + escapeHTML(playerName(ctx.players[pid])) + '">×</button></span>';
    }).join('') + (n >= 2 ? '<button type="button" class="hx-btn sm pri" data-hx-cmpgo>' + (HX.cmpOpen ? 'Showing above' : 'Compare ' + n + ' ›') + '</button>' : '<span class="hx-muted" style="font-size:12.5px">Pick one more (up to ' + HX_MAX + ')</span>') +
      '<button type="button" class="hx-undo" data-hx-cmpclear>Clear</button></div>';
  }
  // your own comparison: any 2–4 players on your roster, the same duel as a close call
  function hxCmpPanelHTML(){
    if(!HX.cmpOpen || HX.cmp.length < 2) return '';
    const ds = HX.cmp.map(hxData), lens = HX.lens.c || hxAutoLens(HX.m.wp0), row = { i: 'c', custom: true, name: '', rec: null, cur: null, note: null };
    const tug = ds.length === 2 ? hxTug(row, ds, lens) : null;
    return '<div class="hx-card hx-cmpp"><div class="hx-cmpp-h"><div><div class="hx-eb">Your comparison</div><h3>' + ds.map(function(d){ return escapeHTML(playerName(d.p)); }).join(' vs ') + '</h3></div>' +
      '<button type="button" class="hx-btn sm" data-hx-cmpclose>Close</button></div>' + hxDuelHTML(row, ds, lens, tug) + '</div>';
  }
  // Start buttons in your own comparison: a player not starting can take a compared starter's slot he fits, else any open slot he fits
  function hxCmpStartHTML(d){
    const m = HX.m, at = HX.plan.indexOf(d.pid);
    if(at !== -1) return '<div class="hx-start on">✓ Starting at ' + escapeHTML(m.names[at]) + '</div>';
    const no = hxNoStart(d.pid);
    if(no) return '<div class="hx-start dis">' + escapeHTML(no) + '</div>';
    const fits = function(j){ return canFill(d.pid, m.slots[j]) && hxMovable(HX.plan[j]); };
    let js = HX.cmp.map(function(pid){ return HX.plan.indexOf(pid); }).filter(function(j){ return j !== -1 && fits(j); });
    if(!js.length) js = m.slots.map(function(l, j){ return j; }).filter(fits).slice(0, 4);
    if(!js.length) return '<div class="hx-start dis">No slot he can play is open</div>';
    return js.map(function(j){ const o = HX.plan[j];
      return '<button type="button" class="hx-start" data-hx-pick="' + j + '|' + escapeHTML(d.pid) + '">Start at ' + escapeHTML(m.names[j]) + (hxReal(o) ? ' for ' + escapeHTML(lastName(o)) : '') + '</button>'; }).join('');
  }
  function hxCallHTML(row, slot){
    const pick = HX.plan[row.i], own = hxReal(pick) && row.cands.indexOf(pick) === -1;   // you started someone else here
    const ds = (own ? row.cands.concat([pick]) : row.cands).map(hxData), lens = HX.lens[row.i] || hxAutoLens(HX.m.wp0);
    const tug = ds.length === 2 ? hxTug(row, ds, lens) : null;
    // Sleepa's lean is Optimal Lineup's pick; once you drop a reason, it follows what's left of the reasons
    const dropped = tug && Object.keys(tug.off).some(function(k){ return tug.off[k]; });
    const leanPid = dropped && tug.lean !== null ? ds[tug.lean].pid : row.rec;
    const edge = function(d){
      if(tug){ const top = tug.R.filter(function(r){ return r.s === d.k && !tug.off[r.k]; }).sort(function(a, b){ return b.w - a.w; })[0]; return top ? top.t : ''; }
      return d.floor !== null ? 'Typical week ' + d.floor.toFixed(1) + '–' + d.ceil.toFixed(1) : '';
    };
    const isOpen = HX.openRow === row.i, dec = HX.dec[row.i];
    const head = '<div class="hx-call-h"><b>Close call</b><span>' + ds.length + ' players within ' + (ds[0].proj - ds[ds.length - 1].proj).toFixed(1) + ' points.</span>' +
      (own ? '<span>You started ' + escapeHTML(playerName(ctx.players[pick])) + ' here.</span>' : dec === 'plan' ? '<span>From the lineup you saved in this league’s Huddle.</span>' : dec === 'saved' ? '<span>Your pick from last time.</span>' : dec ? '' : '<span>Tap one to start him.</span>') + '</div>';
    const tiles = '<div class="hx-split">' + ds.map(function(d){
      const on = d.pid === pick;
      return '<button type="button" class="hx-half' + (on ? ' on' : '') + '" style="--cc:' + d.c + '" data-hx-pick="' + row.i + '|' + escapeHTML(d.pid) + '" aria-pressed="' + on + '">' +
        photoBadgeHTML(d.pid, 'hx-av') + '<span class="hx-who"><span class="hx-nm">' + escapeHTML(playerName(d.p)) + (d.pid === leanPid ? '<span class="hx-lean">Lean</span>' : '') + '</span>' +
        hxSubHTML(d.pid, { noRange: true }) + '<span class="hx-edge">' + escapeHTML(edge(d)) + '</span></span><span class="hx-pts">' + d.proj.toFixed(1) + '<small>proj</small></span></button>';
    }).join('') + '</div>';
    const cmp = '<div class="hx-acts"><button type="button" class="hx-cmp" data-hx-cmp="' + row.i + '" aria-expanded="' + isOpen + '">' + (isOpen ? 'Hide comparison' : 'Compare them ›') + '</button>' +
      '<button type="button" class="hx-mini" data-hx-swap="' + row.i + '" aria-expanded="' + (HX.swap === row.i) + '">Someone else ▾</button></div>';
    return '<div class="hx-row k-call">' + slot + '<div class="hx-call">' + head + tiles + cmp + '</div>' + (isOpen ? hxDuelHTML(row, ds, lens, tug) : '') + '</div>';
  }
  // The duel: who wins it, what kind of week each gives you, the reasons, and the numbers.
  function hxDuelHTML(row, ds, lens, tug){
    const odds = ssOdds(ds), two = ds.length === 2, custom = !!row.custom, pick = custom ? null : HX.plan[row.i];
    ds.forEach(function(d, k){ d.win = odds[k]; });
    const top = function(key){ const v = ds.filter(function(d){ return d[key] !== null; }); return v.length === ds.length ? v.reduce(function(a, b){ return b[key] > a[key] ? b : a; }) : null; };
    const safer = top('floor'), upside = top('ceil'), leader = ds.reduce(function(a, b){ return b.win > a.win ? b : a; });
    const lensBest = lens === 'proj' ? ds.reduce(function(a, b){ return b.proj > a.proj ? b : a; }) : (lens === 'floor' ? safer : upside) || leader;
    const nm = function(d){ return '<b>' + escapeHTML(playerName(d.p)) + '</b>'; };
    let h = '<div class="hx-duel">';
    // cards
    h += '<div class="hx-dcards">' + ds.map(function(d, k){
      const on = custom ? HX.plan.indexOf(d.pid) !== -1 : d.pid === pick, l5 = d.last5 || [], mx = Math.max.apply(null, l5.concat([d.proj, 1]));
      return (k ? '<div class="hx-vs" aria-hidden="true">vs</div>' : '') + '<div class="hx-dc' + (on ? ' on' : '') + '" style="--cc:' + d.c + '">' +
        '<div class="hx-dp">' + photoBadgeHTML(d.pid, 'hx-dav') + '<div class="hx-who"><div class="hx-nm">' + escapeHTML(playerName(d.p)) + '</div>' + hxSubHTML(d.pid, { noRange: true }) + '</div></div>' +
        '<div class="hx-stats"><div class="hx-stat"><div class="v">' + d.proj.toFixed(1) + '</div><div class="l hx-eb">Projected</div></div>' +
          '<div class="hx-stat"><div class="v">' + d.win + '%</div><div class="l hx-eb">' + (two ? 'Wins the duel' : 'Scores the most') + '</div></div></div>' +
        '<div class="hx-chips">' + (custom ? (HX.m.rec.indexOf(d.pid) !== -1 ? '<span class="hx-chip cc">In Sleepa’s lineup</span>' : '') : d.pid === row.rec ? '<span class="hx-chip cc">Optimal pick</span>' : '') +
          (d === safer ? '<span class="hx-chip">Safer</span>' : '') + (d === upside ? '<span class="hx-chip good">More upside</span>' : '') +
          ((custom ? HX.m.sl.indexOf(d.pid) !== -1 : d.pid === row.cur) ? '<span class="hx-chip">In Sleeper now</span>' : '') + '</div>' +
        (l5.length ? '<div><div class="hx-l5" title="Last ' + l5.length + ' games">' + l5.map(function(v){ return '<i style="height:' + Math.max(4, Math.round(v / mx * 100)) + '%" title="' + v.toFixed(1) + '"></i>'; }).join('') + '</div><div class="hx-l5-l"><span>Last ' + l5.length + '</span><span>' + l5.map(function(v){ return v.toFixed(0); }).join(' · ') + '</span></div></div>' : '') +
        (custom ? hxCmpStartHTML(d) : '<button type="button" class="hx-start' + (on ? ' on' : '') + '" data-hx-pick="' + row.i + '|' + escapeHTML(d.pid) + '">' + (on ? '✓ Starting at ' + escapeHTML(row.name) : 'Start ' + escapeHTML(d.last)) + '</button>') + '</div>';
    }).join('') + '</div>';
    // verdict
    let v;
    if(two){
      const a = ds[0], b = ds[1], w = a.win >= b.win ? a : b, l = w === a ? b : a;
      if(w.win < 56){
        v = '<h3>Coin flip</h3><p>' + nm(w) + ' outscores ' + escapeHTML(playerName(l.p)) + ' in only <b>' + w.win + '%</b> of simulated weeks. ' +
          (lens === 'proj' || !lensBest ? (safer && upside && safer !== upside ? 'Pick by what you need: ' + nm(safer) + ' is safer (bad week ' + safer.floor.toFixed(1) + '), ' + nm(upside) + ' has more upside (good week ' + upside.ceil.toFixed(1) + ').' : 'Projection decides it.')
            : lens === 'ceil' ? 'You need a big week, so take the upside: ' + nm(lensBest) + (upside ? ' (good week ' + upside.ceil.toFixed(1) + ').' : '.')
            : 'You’re favored, so take the safer floor: ' + nm(lensBest) + (safer ? ' (bad week ' + safer.floor.toFixed(1) + ').' : '.')) + '</p>';
      }else{
        v = '<h3>Start ' + escapeHTML(playerName(w.p)) + '</h3><p>He outscores ' + escapeHTML(playerName(l.p)) + ' in <b>' + w.win + '%</b> of simulated weeks (projected ' + w.proj.toFixed(1) + ' vs ' + l.proj.toFixed(1) + ').' +
          (upside === l ? ' ' + nm(l) + ' has the higher ceiling (' + l.ceil.toFixed(1) + ') if you need a big week.' : '') + '</p>';
      }
    }else{
      const second = ds.slice().sort(function(x, y){ return y.win - x.win; })[1];
      v = '<h3>' + escapeHTML(playerName(leader.p)) + ' has the best shot</h3><p>He scores the most in <b>' + leader.win + '%</b> of simulated weeks; next is ' + escapeHTML(playerName(second.p)) + ' at ' + second.win + '%.' +
        (lens !== 'proj' && lensBest && lensBest !== leader ? ' For ' + (lens === 'ceil' ? 'a big week' : 'a safe floor') + ', ' + nm(lensBest) + '.' : '') + '</p>';
    }
    if(row.note && row.note.why) v += '<p>Optimal Lineup used its tie-breaker here: ' + escapeHTML(row.note.why === 'tie-ceiling' ? 'near tie, you are the underdog, so the higher ceiling' : row.note.why === 'tie-floor' ? 'near tie, you are favored, so the higher floor' : 'near tie, so the tight end with steady targets') + '.</p>';
    h += '<div class="hx-card hx-verdict">' + v +
      '<div class="hx-winbar" role="img" aria-label="' + escapeHTML(ds.map(function(d){ return playerName(d.p) + ' ' + d.win + '%'; }).join(', ')) + '">' + ds.map(function(d){ return '<span style="width:' + d.win + '%;background:' + d.c + '"></span>'; }).join('') + '</div>' +
      '<div class="hx-wbl">' + ds.map(function(d){ return '<span style="--cc:' + d.c + '"><i class="hx-dot"></i>' + escapeHTML(playerName(d.p)) + ' <b>' + d.win + '%</b></span>'; }).join('') + '</div></div>';
    // what kind of week + outcome curves
    const wp = HX.m.wp0;
    h += '<div class="hx-card"><div class="hx-lens"><span class="hx-lens-q">What kind of week do you need?</span>' + Object.keys(HX_LENS).map(function(k){
      return '<button type="button" data-hx-lens="' + row.i + '|' + k + '" aria-pressed="' + (k === lens) + '">' + HX_LENS[k] + '</button>';
    }).join('') + '<small>' + (wp !== null ? 'Sleepa starts on “' + HX_LENS[hxAutoLens(wp)].toLowerCase() + '”: your Sleepa lineup is ' + Math.round(wp * 100) + '% to win.' : 'No matchup this week, so projection decides.') + '</small></div>' +
      '<div class="hx-chart">' + hxCurvesSVG(ds, lensBest) + '</div><p class="hx-chart-n">Taller curve = more likely. Lines under the chart: his typical week this season (bad week to good week); dot = projection. The thicker line is the best fit for the kind of week you picked.</p></div>';
    // reasons (two players) + the numbers
    h += '<div class="hx-2">';
    if(tug){
      const a = ds[0], b = ds[1], tot = tug.t[0] + tug.t[1], pos = tot ? 50 + (tug.t[1] - tug.t[0]) / tot * 46 : 50;
      h += '<div class="hx-card"><div class="hx-eb">Why · tap a reason you don’t buy</div><div class="hx-tug-names" style="margin-top:10px"><span>' + escapeHTML(a.last) + '</span><span>' + escapeHTML(b.last) + '</span></div>' +
        '<div class="hx-meter" style="--ca:' + a.c + ';--cb:' + b.c + '"><div class="hx-needle" style="left:' + pos.toFixed(1) + '%"></div></div>' +
        '<div class="hx-tug-v">' + (tug.lean === null ? '<b>Dead even</b>' : 'Leans <b>' + escapeHTML(ds[tug.lean].last) + '</b>, ' + Math.max(tug.t[0], tug.t[1]) + ' to ' + Math.min(tug.t[0], tug.t[1])) + '</div>' +
        '<div class="hx-rs">' + [0, 1].map(function(s){
          const list = tug.R.filter(function(r){ return r.s === s; });
          return '<div class="hx-rcol" style="--cc:' + ds[s].c + '">' + (list.map(function(r){
            return '<button type="button" class="hx-r' + (tug.off[r.k] ? ' off' : '') + '" data-hx-r="' + row.i + '|' + r.k + '" aria-pressed="' + !tug.off[r.k] + '"><b>' + '+'.repeat(r.w) + '</b>' + escapeHTML(r.t) + '</button>';
          }).join('') || '<span class="hx-muted" style="font-size:12.5px">Nothing clearly in his favor.</span>') + '</div>';
        }).join('') + '</div></div>';
    }
    h += '<div class="hx-card"><div class="hx-eb">The numbers</div>' + hxTableHTML(ds, two) + '</div></div>';
    return h + '</div>';
  }
  function hxTableHTML(ds, two){
    const rows = [
      ['Projected', function(d){ return d.proj; }, function(v){ return v.toFixed(1); }],
      [two ? 'Wins the duel' : 'Scores the most', function(d){ return d.win; }, function(v){ return v + '%'; }],
      ['Bad week', function(d){ return d.floor; }, function(v){ return v.toFixed(1); }],
      ['Good week', function(d){ return d.ceil; }, function(v){ return v.toFixed(1); }],
      ['Last 3 average', function(d){ return d.l3; }, function(v){ return v.toFixed(1); }],
      ['Role', function(d){ return d.usage; }, null],
      ['Matchup', function(d){ return d.dvp ? d.tag + ': ' + dvpLabel(d.dvp) : d.opp; }, null],
      ['Kickoff', function(d){ return d.kick ? zKickShort(d.kick) : null; }, null],
      ['Status', function(d){ return d.st ? d.st.label : 'Healthy'; }, null],
    ];
    return '<table class="hx-tbl"><thead><tr><th></th>' + ds.map(function(d){ return '<th style="--cc:' + d.c + '"><i class="hx-dot"></i>' + escapeHTML(d.last) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function(r){
        const vals = ds.map(r[1]), nums = vals.filter(function(v){ return typeof v === 'number'; }), best = r[2] && nums.length === ds.length ? Math.max.apply(null, nums) : null;
        return '<tr><th>' + r[0] + '</th>' + vals.map(function(v){
          return '<td' + (best !== null && v === best ? ' class="best"' : '') + '>' + (v === null || v === undefined ? '—' : escapeHTML(r[2] ? r[2](v) : String(v))) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  // Outcome curves: each player's week as a bell around his projection with the win-probability spread (wpSd), the
  // same model ssOdds simulates. Under it, his typical week from this season (weekRange) and the projection dot.
  function hxCurvesSVG(ds, best){
    const W = 640, top = 12, ih = 120, base = top + ih, H = base + 30 + ds.length * 13 + 8;
    const sd = ds.map(function(d){ return wpSd(d.pid, d.proj); });
    let xmax = 10;
    ds.forEach(function(d, k){ xmax = Math.max(xmax, d.proj + 2.6 * sd[k], d.ceil || 0); });
    xmax = Math.ceil(xmax / 5) * 5;
    const x = function(v){ return 16 + v / xmax * (W - 32); };
    const N = 90;
    let ymax = 0;
    const curves = ds.map(function(d, k){
      const pts = [];
      for(let j = 0; j <= N; j++){ const v = j / N * xmax, z = (v - d.proj) / sd[k], y = Math.exp(-0.5 * z * z) / sd[k]; ymax = Math.max(ymax, y); pts.push([v, y]); }
      return pts;
    });
    const y = function(v){ return base - v / (ymax * 1.12) * ih; };
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Range of outcomes for ' + escapeHTML(ds.map(function(d){ return d.last; }).join(', ')) + '">';
    const step = xmax <= 20 ? 5 : xmax <= 50 ? 10 : 20;
    for(let t = 0; t <= xmax; t += step){
      s += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + top + '" y2="' + base + '" style="stroke:var(--hair);stroke-width:1"/>' +
        '<text x="' + x(t) + '" y="' + (base + 15) + '" text-anchor="middle" style="fill:var(--text-3);font-size:11px">' + t + '</text>';
    }
    curves.forEach(function(pts, k){
      const c = ds[k].c, line = pts.map(function(p){ return x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); });
      s += '<path d="M' + x(0) + ',' + base + 'L' + line.join('L') + 'L' + x(xmax) + ',' + base + 'Z" style="fill:' + c + ';opacity:.13"/>' +
        '<path d="M' + line.join('L') + '" style="fill:none;stroke:' + c + ';stroke-width:2;stroke-linejoin:round"/>';
    });
    const used = [];
    ds.forEach(function(d, k){   // name at each peak, nudged up when two peaks sit close together
      const px = x(d.proj);
      let py = y(1 / sd[k]) - 6;
      used.forEach(function(u){ if(Math.abs(u[0] - px) < 70 && Math.abs(u[1] - py) < 14) py = u[1] - 14; });
      used.push([px, py]);
      s += '<text x="' + px.toFixed(1) + '" y="' + Math.max(11, py).toFixed(1) + '" text-anchor="middle" style="fill:' + d.c + ';font-size:12px;font-weight:700">' + escapeHTML(d.last) + '</text>';
    });
    ds.forEach(function(d, k){
      const cy = base + 30 + k * 13, lo = d.floor !== null ? d.floor : Math.max(0, d.proj - 1.28 * sd[k]), hi = d.ceil !== null ? d.ceil : d.proj + 1.28 * sd[k];
      s += '<line x1="' + x(lo) + '" x2="' + x(hi) + '" y1="' + cy + '" y2="' + cy + '" style="stroke:' + d.c + ';stroke-width:' + (d === best ? 6 : 3) + ';stroke-linecap:round;opacity:' + (d === best ? 0.9 : 0.5) + (d.floor === null ? ';stroke-dasharray:3 4' : '') + '"><title>' + escapeHTML(d.last) + ': ' + (d.floor === null ? 'not enough games yet; model range ' : 'typical week ') + lo.toFixed(1) + '–' + hi.toFixed(1) + '</title></line>' +
        '<circle cx="' + x(d.proj) + '" cy="' + cy + '" r="4.5" style="fill:' + d.c + ';stroke:var(--surface);stroke-width:2"/>';
    });
    s += '<text x="' + (W / 2) + '" y="' + (H - 1) + '" text-anchor="middle" style="fill:var(--text-3);font-size:11px">Fantasy points this week, this league’s scoring</text>';
    return s + '</svg>';
  }

  // ---- lock + overview ----
  function hxWho(pid){
    if(!hxReal(pid)) return null;
    const p = ctx.players[pid], st = statusInfo(effectiveStatus(pid));
    return { pid: pid, name: playerName(p), pos: posGroup(pid), team: p.team || '', proj: Math.round(hxProj(pid) * 10) / 10,
      st: st ? st.label : '', q: !!(st && !st.out), kick: kickoff(p.team, ctx.week) || null, bye: isOnBye(pid) };
  }
  function hxSnap(){
    const m = HX.m, plan = HX.plan, inPlan = new Set(plan.filter(hxReal)), inSl = new Set(m.sl.filter(hxReal));
    const moves = [];
    plan.forEach(function(pid, i){
      if(!hxReal(pid) || pid === m.sl[i]) return;
      const was = m.sl.indexOf(pid);
      moves.push(was === -1 ? { k: 'in', p: hxWho(pid), slot: m.names[i] } : { k: 'mv', p: hxWho(pid), slot: m.names[i], from: m.names[was] });
    });
    m.sl.forEach(function(pid){ if(hxReal(pid) && !inPlan.has(pid)) moves.push({ k: 'out', p: hxWho(pid) }); });
    return { ts: Date.now(), id: m.id, name: ctx.league.name, fmt: hxFmt(), team: m.team, opp: m.opp, sleeper: m.sl, plan: plan,
      wp: hxWin(plan), total: hxTotal(plan), was: hxTotal(m.sl), moves: moves,
      starters: m.slots.map(function(label, i){ return { slot: m.names[i], label: label, p: hxWho(plan[i]), chg: plan[i] !== m.sl[i] }; }),
      bench: hxBench().filter(function(b){ return !b.park; }).map(function(b){ return Object.assign(hxWho(b.pid), { why: b.why }); }) };
  }
  function hxLock(){
    const m = HX.m;
    if(!m || HX.busy) return;
    // the lineup becomes this league's saved Huddle lineup and Lineup plan (latest save wins)
    ctx.draftStarters = HX.plan.map(function(pid){ return pid || '0'; });
    ctx.handEdited = true; ctx.optUndo = null;
    prWrite({ saved: true, work: null, base: null });
    saveDraft();
    const st = hxStore();
    st.leagues[m.id] = hxSnap();
    hxWrite(st);
    hxGo(HX.i + 1);
  }
  function hxOverviewHTML(st){
    const set = HX.leagues.filter(function(L){ return st.leagues[L.id]; }).length;
    const nMoves = HX.leagues.reduce(function(a, L){ const s = st.leagues[L.id]; return a + (s ? s.moves.filter(function(x){ return x.k !== 'out'; }).length : 0); }, 0);
    let h = '<div class="hx-wrap"><div class="hx-ov-h"><div><div class="hx-eb">Week ' + ctx.week + ' · overview</div><h2>' + (set === HX.n ? 'Every lineup is set' : set + ' of ' + HX.n + ' lineups set') + '</h2>' +
      '<div class="hx-muted" style="font-size:14px;margin-top:4px">' + (nMoves ? nMoves + ' change' + (nMoves === 1 ? '' : 's') + ' to make in Sleeper. Sleepa can’t change Sleeper for you: open each league and match this.' : 'Nothing to change in Sleeper.') + '</div></div>' +
      '<button type="button" class="hx-btn pri" data-hx-x>Done</button></div><div class="hx-ov">';
    HX.leagues.forEach(function(L, i){
      const s = st.leagues[L.id];
      if(!s){ h += '<div class="hx-card hx-oc"><div class="hx-oc-h"><div><div class="hx-eb">League ' + (i + 1) + '</div><h3>' + escapeHTML(L.name) + '</h3></div></div><div class="hx-todo">Not set yet.<button type="button" class="hx-btn pri sm" data-hx-step="' + i + '">Set this lineup ›</button></div></div>'; return; }
      const ins = s.moves.filter(function(x){ return x.k === 'in'; }), outs = s.moves.filter(function(x){ return x.k === 'out'; }), mvs = s.moves.filter(function(x){ return x.k === 'mv'; });
      const mv = function(x, label, cls, where){ return '<div class="hx-mv"><span class="hx-mv-k ' + cls + '">' + label + '</span>' + photoHTML(x.p.pid, 'hx-sav') + '<span class="hx-mv-n">' + escapeHTML(x.p.name) + (where ? ' <span class="hx-op">' + where + '</span>' : '') + '</span></div>'; };
      const q = s.starters.filter(function(x){ return x.p && x.p.q; });
      const qFlag = q.length ? '<div class="hx-flag"><b>Re-check at inactives</b> (about 90 minutes before kickoff): ' + q.map(function(x){ return escapeHTML(x.p.name) + ' <span style="white-space:nowrap">(' + escapeHTML(x.p.st) + (x.p.kick ? ', ' + escapeHTML(zKickShort(x.p.kick)) : '') + ')</span>'; }).join(', ') + '.</div>' : '';
      h += '<div class="hx-card hx-oc"><div class="hx-oc-h"><div><div class="hx-eb">' + escapeHTML(s.fmt || '') + '</div><h3>' + escapeHTML(s.name) + '</h3>' +
          '<div class="hx-oc-n">' + escapeHTML(s.team) + (s.opp ? ' vs ' + escapeHTML(s.opp) : '') + '</div></div>' +
          '<div class="hx-wp">' + (typeof s.wp === 'number' ? '<b style="font-size:24px">' + Math.round(s.wp * 100) + '%</b><span>to win</span>' : '') + '<span>' + s.total.toFixed(1) + ' proj' + (s.total - s.was >= 0.05 ? ' <span class="hx-up">+' + (s.total - s.was).toFixed(1) + '</span>' : '') + '</span></div></div>' +
        (s.moves.length ? '<div class="hx-moves"><div class="hx-eb">In Sleeper</div>' + ins.map(function(x){ return mv(x, 'Start', 'in', escapeHTML(x.slot)); }).join('') +
            mvs.map(function(x){ return mv(x, 'Move', 'mv', escapeHTML(x.from) + ' → ' + escapeHTML(x.slot)); }).join('') + outs.map(function(x){ return mv(x, 'Bench', 'out', ''); }).join('') + '</div>'
          : '<div class="hx-ok">✓ Matches your Sleeper lineup. Nothing to change.</div>') +
        qFlag +
        '<div><div class="hx-eb" style="margin-bottom:4px">Starting</div><div class="hx-ol">' + s.starters.map(function(x){
          return '<div class="hx-orow' + (x.chg ? ' chg' : '') + '"><span class="hx-slot" style="--sc:' + hxSlotColor(x.label) + '">' + escapeHTML(x.slot) + '</span>' +
            (x.p ? photoHTML(x.p.pid, 'hx-sav') + '<span class="hx-on">' + escapeHTML(x.p.name) + '</span><span class="hx-op">' + x.p.proj.toFixed(1) + '</span>' : '<span></span><span class="hx-on">Empty</span><span></span>') + '</div>';
        }).join('') + '</div></div>' +
        '<div><div class="hx-eb" style="margin-bottom:4px">Bench</div><div class="hx-ob">' + (s.bench.map(function(b){ return '<span>' + escapeHTML(b.name) + ' <i>(' + escapeHTML(b.why) + ')</i></span>'; }).join(', ') || 'No one') + '</div></div>' +
        '<div class="hx-oc-a"><a class="hx-btn sm pri" href="https://sleeper.com/leagues/' + encodeURIComponent(L.id) + '" target="_blank" rel="noopener">Open in Sleeper ↗</a><button type="button" class="hx-btn sm" data-hx-step="' + i + '">Edit</button></div></div>';
    });
    return h + '</div></div>';
  }

  // ---- input ----
  function hxClick(e){
    const t = e.target.closest('button, a');
    if(!t || !HX.el.contains(t)) return;
    const a = function(n){ return t.getAttribute(n); };
    if(t.hasAttribute('data-hx-x')){ hxClose(); return; }
    if(t.hasAttribute('data-hx-step')){ hxGo(Number(a('data-hx-step'))); return; }
    if(t.hasAttribute('data-hx-retry')){ hxGo(HX.i); return; }
    if(t.hasAttribute('data-hx-lock')){ hxLock(); return; }
    if(t.hasAttribute('data-hx-cmp')){ const i = Number(a('data-hx-cmp')); HX.openRow = HX.openRow === i ? null : i; hxRender(); return; }
    if(t.hasAttribute('data-hx-pick')){ const v = a('data-hx-pick').split('|'); hxPick(Number(v[0]), v[1]); return; }
    if(t.hasAttribute('data-hx-undo')){ const i = Number(a('data-hx-undo')), row = HX.m.rows[i]; if(row) hxPick(i, row.cur); return; }
    if(t.hasAttribute('data-hx-lens')){ const v = a('data-hx-lens').split('|'); HX.lens[v[0]] = v[1]; hxRender(); return; }
    if(t.hasAttribute('data-hx-swap')){ const i = Number(a('data-hx-swap')); HX.swap = HX.swap === i ? null : i; HX.slotFor = null; hxRender(); return; }
    if(t.hasAttribute('data-hx-slotfor')){ const p = a('data-hx-slotfor'); HX.slotFor = HX.slotFor === p ? null : p; HX.swap = null; hxRender(); return; }
    if(t.hasAttribute('data-hx-cmpadd')){
      const p = a('data-hx-cmpadd'), k = HX.cmp.indexOf(p);
      if(k !== -1) HX.cmp.splice(k, 1);
      else{ if(HX.cmp.length >= HX_MAX) HX.cmp.shift(); HX.cmp.push(p); }
      if(HX.cmp.length < 2) HX.cmpOpen = false;
      HX.off.c = {};   // the reasons change with the players
      hxRender(); return;
    }
    if(t.hasAttribute('data-hx-cmpgo')){ HX.cmpOpen = true; hxRender(true); return; }
    if(t.hasAttribute('data-hx-cmpclose')){ HX.cmpOpen = false; hxRender(); return; }
    if(t.hasAttribute('data-hx-cmpclear')){ HX.cmp = []; HX.cmpOpen = false; hxRender(); return; }
    if(t.hasAttribute('data-hx-r')){ const v = a('data-hx-r').split('|'), o = HX.off[v[0]] = HX.off[v[0]] || {}; o[v[1]] = !o[v[1]]; hxRender(); return; }
  }
  // While open it owns the keyboard: Esc closes the comparison, then the Huddle; app shortcuts wait.
  window.addEventListener('keydown', function(e){
    if(!HX.open) return;
    if(e.key === 'Escape'){
      e.preventDefault();
      if(HX.swap !== null || HX.slotFor !== null){ HX.swap = null; HX.slotFor = null; hxRender(); }
      else if(HX.cmpOpen){ HX.cmpOpen = false; hxRender(); }
      else if(HX.openRow !== null){ HX.openRow = null; hxRender(); }
      else hxClose();
    }
    e.stopImmediatePropagation();
  }, true);
  document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('[data-hx-open]')){ e.preventDefault(); hxOpen(); } });

  // the way in: a row under the Huddle card on Lineup (only with 2+ leagues)
  function hxEntryHTML(){
    const n = (ctx.pendingLeagues || []).length;
    if(n < 2 || !ctx.league) return '';
    const st = hxStore(), set = ctx.pendingLeagues.filter(function(l){ return st.leagues[l.league_id]; }).length;
    return '<button type="button" class="hx-entry" data-hx-open><span class="hx-entry-ic">' + HX_ICON + '</span><span class="hx-entry-t"><b>Huddle every league<span class="hx-pv">Preview</span></b>' +
      '<small>' + (set ? set + ' of ' + n + ' lineups set this week' : 'Set all ' + n + ' lineups in one pass, close calls side by side') + '</small></span><span class="hx-entry-go">' + (set ? (set === n ? 'Review' : 'Continue') : 'Start') + ' ›</span></button>';
  }
  // Data that lands after the league opened (schedule and kickoffs, weekly stats, rankings, a background refresh) rebuilds
  // the model; your picks, week type and dropped reasons stay.
  function hxRefresh(){
    const keep = { plan: HX.plan, dec: HX.dec, touched: HX.touched, lens: HX.lens, off: HX.off, openRow: HX.openRow, swap: HX.swap, slotFor: HX.slotFor, cmp: HX.cmp, cmpOpen: HX.cmpOpen };
    hxBuild();
    const still = keep.touched && keep.plan && keep.plan.length === HX.plan.length ? hxValidPlan(keep.plan, HX.m.rows, HX.m.parked) : null;
    if(still){ HX.plan = still; HX.dec = keep.dec; HX.touched = true; }
    const on = new Set(ctx.myRoster.players || []);
    HX.lens = keep.lens; HX.off = keep.off; HX.openRow = keep.openRow; HX.swap = keep.swap; HX.slotFor = keep.slotFor;
    HX.cmp = keep.cmp.filter(function(pid){ return on.has(pid); }); HX.cmpOpen = keep.cmpOpen && HX.cmp.length >= 2;
    hxRender();
  }
  const hxBaseRerender = rerenderEverything;
  rerenderEverything = function(){
    hxBaseRerender.apply(this, arguments);
    if(HX.open && !HX.busy && HX.m && HX.i < HX.n && ctx.league && ctx.league.league_id === HX.m.id) safeRun('Huddle every league', hxRefresh);
  };
  // and in the sidebar, under Sleepa Zone (the other every-league view)
  (function(){
    const z = document.querySelector('.side-zone');
    if(z) z.insertAdjacentHTML('afterend', '<button type="button" class="zn-entry side-zone hx-side" data-hx-open title="Set every league’s lineup in one pass">' + HX_ICON + '<span>Huddle every league</span><small>preview</small></button>');
  })();
  const hxBaseHuddleCard = renderHuddleCard;
  renderHuddleCard = function(){
    hxBaseHuddleCard();
    const slot = document.getElementById('huddle-slot');
    if(slot && !HX.open) slot.insertAdjacentHTML('beforeend', hxEntryHTML());
  };
