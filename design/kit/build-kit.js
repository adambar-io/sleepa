// Rebuilds design/kit/TOKENS.css and design/kit/kit.html from index.html (+ captured markup in design/kit/captures/).
// Run after any style change:  node design/kit/build-kit.js
// Captures are real markup from the app's own renderers (photos replaced by a placeholder, managers' names by fictional
// ones). Re-capture them only when a component's markup changes; CSS changes need just this script.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), KIT = __dirname, CAP = path.join(KIT, 'captures');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\r\n').join('\n');
const css = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));

// ---------- TOKENS.css ----------
function block(startToken, from){
  const i = css.indexOf(startToken, from || 0); if(i < 0) throw new Error('missing ' + startToken);
  const a = css.indexOf('{', i), b = css.indexOf('}', a);
  return css.slice(a + 1, b);
}
function vars(text){
  const out = []; const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g; let m;
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  while((m = re.exec(clean))) out.push([m[1], m[2].trim().replace(/\s+/g, ' ')]);
  return out;
}
const light = vars(block(':root{'));
const dark = vars(block(':root[data-theme="dark"], .cd{'));
const shared = vars(block(':root{', css.lastIndexOf(':root{', css.indexOf('/* Sleepa Series cards'))));
const impact = vars(block(':root{ --impact-pos'));
const GROUPS = [
  ['Surfaces', /^--(bg|surface|surface-2|surface-3|hair|scrim)$/],
  ['Text', /^--(text|text-2|text-3)$/],
  ['Accent / warn / danger', /^--(accent|accent-soft|on-accent|danger|danger-soft|warn|warn-soft)$/],
  ['Elevation (shadows)', /^--(shadow|shadow-lg)$/],
  ['Position colors (slot tags, rings, chart bars)', /^--pos-/],
  ['Logo mark', /^--mark-/],
];
function themeBlock(sel, list, note){
  let s = sel + '{   /* ' + note + ' */\n';
  GROUPS.forEach(function(g){
    const xs = list.filter(function(v){ return g[1].test(v[0]); });
    if(xs.length) s += '  /* ' + g[0] + ' */\n' + xs.map(function(v){ return '  ' + v[0] + ': ' + v[1] + ';'; }).join('\n') + '\n';
  });
  return s + '  color-scheme: ' + (note.indexOf('dark') === 0 ? 'dark' : 'light') + ';\n}\n';
}
const pick = function(list, re){ return list.filter(function(v){ return re.test(v[0]); }).map(function(v){ return '  ' + v[0] + ': ' + v[1] + ';'; }).join('\n'); };
const tokens = `/* Sleepa design tokens: generated from index.html by design/kit/build-kit.js. Do not edit by hand.
   Light ("stone and paper") is the base. Dark applies when the OS is dark (unless the user picked Light) or when
   html[data-theme="dark"]. Trading cards (.cd) are always Dark Chrome. */

${themeBlock(':root', light, 'light: warm stone and paper; no pure white; accents a shade deeper for contrast')}
${themeBlock(':root[data-theme="dark"]', dark, 'dark: near-black surfaces, bright accents')}
:root{
  /* Matchup tone (difficulty strips, chips, Start / Sit "mt" colors): always resolved from the theme */
  --mt-fav: var(--accent);      /* favorable / easy */
  --mt-neu: var(--warn);        /* neutral / mid */
  --mt-tough: var(--danger);    /* tough / hard */

  /* Impact colors (Sleepa Zone live feed: a play's effect on your matchup) */
${impact.map(function(v){ return '  ' + v[0] + ': ' + v[1] + ';'; }).join('\n')}

  /* Foil stops for the Huddle trading cards: conic-gradient(from var(--fa, 220deg), var(--foil-*)) */
${pick(shared, /^--foil-/)}

  /* Card shadow / glow */
${pick(shared, /^--card-/)}

  /* Radii */
${pick(shared, /^--radius/)}
  /* also used directly: 999px pills, 16px Huddle cards / rails, 12px rows & inputs, 6px chips, 5px status chips */

  /* Motion */
${pick(shared, /^--(ease|spring)$/)}

  /* Aliases */
${pick(shared, /^--(muted|pos-FLEX)$/)}

  /* Spacing: no tokens in the app. Scale in use: 2 4 6 8 10 12 14 16 18 20 24 28 36 px.
     Page gutter 16px (phone) / 20px (narrow) / 36px (desktop main); cards pad 16-20px; list rows 10-12px. */
}

/* z-index layers (fixed / overlay stacking, low to high) */
:root{
  --z-popover: 30;     /* league menu, Zone breakdown, card legend, chalkboard popover */
  --z-tabbar: 40;      /* phone bottom bar, Start / Sit sticky footer */
  --z-safe-shield: 45; /* status-bar shield (safe-area top) */
  --z-brand-menu: 46;
  --z-huddle: 47;      /* Sleepa Huddle full screen */
  --z-zone: 48;        /* Sleepa Zone full screen */
  --z-sheet: 50;       /* phone player sheet (.overlay) */
  --z-toast: 60;       /* VS / Start-Sit toast */
  --z-ss-sheet: 71;    /* Start / Sit picker sheet (scrim 70) */
  --z-drag: 90;        /* Huddle drag ghost */
  --z-fullview: 100;   /* full-screen player / roster view (.max) */
  --z-zone-back: 120;
  --z-shortcuts: 400;  /* keyboard cheat sheet */
  --z-search: 410;     /* universal search */
  /* The app uses these as literal numbers; the variables here are documentation. */
}
`;
fs.writeFileSync(path.join(KIT, 'TOKENS.css'), tokens);

// ---------- kit.html ----------
const PH_RE = /data:image\/svg\+xml,%3Csvg[^"]*/g;
function cap(name){
  let h = fs.readFileSync(path.join(CAP, name + '.html'), 'utf8');
  const m = h.match(/^<!--kit (.*?)-->\n/); const meta = m ? JSON.parse(m[1]) : {};
  h = h.replace(/^<!--kit .*?-->\n/, '');
  h = h.replace(PH_RE, '__PH__');
  h = h.replace(/background-image:\s*url\(&quot;https?:[^)]*\)/g, 'background-image: none');
  // the Zone feed: a few plays are enough to show the style
  let n = 0; h = h.replace(/<div class="zf-ev[^"]*"[^>]*><div class="zf-top">.*?<\/div><div class="zf-d">.*?<\/div><\/div>/g, function(x){ return ++n <= 8 ? x : ''; });
  return { html: h, meta: meta };
}
const D = 1280, P = 375;
const SECTIONS = [
  ['Foundations', [
    ['tokens', 'Tokens: surfaces, text, accents, positions, foils', null, 1100, 0],
    ['chips', 'Chips & pills: injury, matchup tone, position tags, status, trade tags', 'chips', 520, 0],
  ]],
  ['Shell', [
    ['p-shell', 'Phone: header (logo + search), page head, matchup + Huddle cards, rows, bottom tab bar', 'p-shell', P, 812],
    ['d-sidebar', 'Desktop sidebar', 'd-sidebar', D, 860],
  ]],
  ['Player rows & matchup', [
    ['d-rows', 'Lineup rows, desktop table (list head, pos tag, photo, columns, VS)', 'd-rows', D, 0],
    ['d-matchup', 'Matchup card', 'd-matchup', 900, 0],
    ['d-huddlecard', 'Huddle entry card', 'd-huddlecard', 900, 0],
  ]],
  ['Sleepa Huddle', [
    ['cards-front', 'Trading cards, front: holo / gold / silver / base, and the deck summary card (kickoff windows)', 'cards-front', D, 0, 'cards'],
    ['cards-back', 'Card back (flipped)', 'cards-back', 420, 0, 'cards'],
    ['d-huddle-review', 'Review deck, desktop', 'd-huddle-review', D, 860],
    ['p-huddle-review', 'Review deck, phone', 'p-huddle-review', P, 812],
    ['d-huddle-slot', 'Position step: slots + player pool, desktop', 'd-huddle-slot', D, 860],
    ['p-huddle-slot', 'Position step, phone', 'p-huddle-slot', P, 812],
  ]],
  ['Start / Sit', [
    ['d-startsit', 'Desktop: rail + verdict + grid', 'd-startsit', D, 0],
    ['d-startsit-open', 'Desktop: details open', 'd-startsit-open', D, 0],
    ['p-startsit', 'Phone: cards + sticky footer', 'p-startsit', P, 812],
    ['p-startsit-open', 'Phone: card expanded', 'p-startsit-open', P, 812],
  ]],
  ['Sleepa Zone', [
    ['d-zone-ring', 'Ring carousel, desktop (3D), indicators, Cards / List toggle', 'd-zone-ring', D, 860],
    ['p-zone-ring', 'Ring carousel, phone (flat)', 'p-zone-ring', P, 812],
    ['d-zone-grid-rich', 'List (grid) view, rich rows', 'd-zone-grid-rich', D, 860],
    ['d-zone-grid-condensed', 'List (grid) view, condensed rows', 'd-zone-grid-condensed', D, 860],
    ['d-zone-focus', 'Focus lift: a league lifted over the grid', 'd-zone-focus', D, 860],
    ['p-zone-list', 'List view, phone', 'p-zone-list', P, 812],
  ]],
  ['Overlays', [
    ['p-toast-vs', 'Toast (VS / Start-Sit)', 'p-toast-vs', P, 180],
    ['p-toast-undo', 'Toast with Undo (Huddle)', 'p-toast-undo', P, 260],
    ['p-sheet-player', 'Bottom sheet: player (phone)', 'p-sheet-player', P, 812],
    ['p-sheet-startsit', 'Bottom sheet: Start / Sit picker (phone)', 'p-sheet-startsit', P, 812],
    ['p-popover-leagues', 'Popover: league menu under the logo', 'p-popover-leagues', P, 480],
    ['d-zone-breakdown', 'Popover: Zone points breakdown', 'd-zone-breakdown', D, 860],
  ]],
];
const TOKENS_DEMO = `<div class="kit-tokens">
<h4>Surfaces &amp; text</h4><div class="sw">${['bg','surface','surface-2','surface-3','hair','text','text-2','text-3'].map(function(k){ return '<div><i style="background:var(--' + k + ')"></i><b>--' + k + '</b></div>'; }).join('')}</div>
<h4>Accent / warn / danger</h4><div class="sw">${['accent','accent-soft','on-accent','warn','warn-soft','danger','danger-soft'].map(function(k){ return '<div><i style="background:var(--' + k + ')"></i><b>--' + k + '</b></div>'; }).join('')}</div>
<h4>Positions</h4><div class="sw">${['QB','RB','WR','TE','K','DEF','DL','LB','DB','IDP_FLEX','FLEX'].map(function(k){ return '<div><i style="background:var(--pos-' + k + ')"></i><b>--pos-' + k + '</b></div>'; }).join('')}</div>
<h4>Foils</h4><div class="sw foil">${['base','silver','gold','holo','moon'].map(function(k){ return '<div><i style="background:conic-gradient(from 220deg, var(--foil-' + k + '))"></i><b>--foil-' + k + '</b></div>'; }).join('')}</div>
<h4>Type</h4><div class="ty"><div style="font:700 30px/1.1 Inter;letter-spacing:-.025em">Lineup 30/700</div><div style="font:700 17px Inter">Card title 17/700</div><div style="font:600 15px Inter">Player name 15/600</div><div style="font:400 13px Inter;color:var(--text-2)">Meta 13/400 text-2</div><div style="font:700 10.5px Inter;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)">Eyebrow 10.5/700 caps</div><div style="font:600 24px Inter;font-variant-numeric:tabular-nums">108.18 tabular</div><div class="wordmark" style="font-size:28px">sleepa</div></div>
<h4>Radii &amp; elevation</h4><div class="rd"><div style="border-radius:var(--radius-sm)">10 sm</div><div style="border-radius:var(--radius)">14</div><div style="border-radius:var(--radius-lg)">20 lg</div><div style="border-radius:999px">pill</div><div style="border-radius:var(--radius);box-shadow:var(--shadow-lg)">shadow-lg</div></div>
</div>`;
const KIT_FRAME_CSS = `
  body.kit-pad{ padding: 16px; }
  .shell{ min-height: 0 !important; }   /* captures stack several pieces, each with its own shell */
  .shell + .shell .main{ padding-top: 0 !important; } .shell:has(+ .shell) .main{ padding-bottom: 0 !important; }
  .shell:not(:has(> aside)){ grid-template-columns: minmax(0, 1fr) !important; }   /* no sidebar captured: main takes the width */
  .kit-cards{ display: flex; flex-wrap: wrap; gap: 28px; padding: 28px; align-items: flex-start; }
  .kit-cards .cd{ --cdw: 260px !important; }
  .kit-chips{ padding: 4px 16px 16px; } .kit-chips h4, .kit-tokens h4{ margin: 16px 0 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-3); }
  .kit-chips p{ display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0; }
  .kit-tokens{ padding: 4px 20px 20px; }
  .kit-tokens .sw{ display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
  .kit-tokens .sw div{ display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: var(--text-2); }
  .kit-tokens .sw i{ display: block; height: 44px; border-radius: 10px; box-shadow: inset 0 0 0 1px var(--hair); }
  .kit-tokens .sw.foil i{ height: 70px; }
  .kit-tokens .ty{ display: grid; gap: 10px; }
  .kit-tokens .rd{ display: flex; flex-wrap: wrap; gap: 14px; }
  .kit-tokens .rd div{ width: 110px; height: 64px; display: grid; place-items: center; background: var(--surface); box-shadow: inset 0 0 0 1px var(--hair); font-size: 12px; color: var(--text-2); }
`;
const PH = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#2a2a30"/><circle cx="48" cy="36" r="17" fill="#76767f"/><path d="M14 96c3-22 17-34 34-34s31 12 34 34z" fill="#76767f"/></svg>');
const demos = [];
let toc = '', body = '';
SECTIONS.forEach(function(sec){
  toc += '<a href="#' + sec[0].toLowerCase().replace(/\W+/g, '-') + '">' + sec[0] + '</a>';
  body += '<h2 id="' + sec[0].toLowerCase().replace(/\W+/g, '-') + '">' + sec[0] + '</h2>';
  sec[1].forEach(function(d){
    const c = d[2] ? cap(d[2]) : { html: TOKENS_DEMO, meta: {} };
    let html = c.html;
    if(d[5] === 'cards') html = '<div class="kit-cards">' + html + '</div>';
    const pad = !d[4] && d[5] !== 'cards';
    demos.push({ id: d[0], w: d[3], h: d[4], html: html, htmlClass: c.meta.html || '', bodyClass: ((c.meta.body || '') + (pad ? ' kit-pad' : '')).trim() });
    body += '<section class="demo" id="' + d[0] + '"><h3>' + d[1] + ' <code>' + d[0] + ' · ' + d[3] + 'px</code></h3>' +
      '<div class="pair"><figure data-demo="' + d[0] + '" data-theme="dark"><figcaption>Dark</figcaption><div class="vp"></div></figure>' +
      '<figure data-demo="' + d[0] + '" data-theme="light"><figcaption>Light · stone &amp; paper</figcaption><div class="vp"></div></figure></div></section>';
  });
});
const kit = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sleepa Design Kit</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@700&display=swap" rel="stylesheet">
<style>
  :root{ --k-bg:#E8E5DE; --k-surface:#F4F2EC; --k-text:#23221F; --k-text-2:#5C5950; --k-hair:rgba(60,50,30,.12); color-scheme: light; }
  @media (prefers-color-scheme: dark){ :root{ --k-bg:#0B0B0D; --k-surface:#151518; --k-text:#F5F5F7; --k-text-2:#A1A1AA; --k-hair:rgba(255,255,255,.08); color-scheme: dark; } }
  body{ margin: 0; background: var(--k-bg); color: var(--k-text); font: 14px/1.5 Inter, system-ui, sans-serif; }
  header{ position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 14px 20px; background: color-mix(in srgb, var(--k-bg) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--k-hair); }
  header h1{ font-size: 18px; margin: 0 8px 0 0; letter-spacing: -.02em; }
  header nav{ display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; }
  header a{ color: var(--k-text-2); text-decoration: none; } header a:hover{ color: var(--k-text); }
  main{ padding: 8px 20px 60px; max-width: 1500px; margin: 0 auto; }
  .intro{ color: var(--k-text-2); max-width: 780px; }
  h2{ margin: 40px 0 6px; font-size: 22px; letter-spacing: -.02em; }
  h3{ margin: 22px 0 10px; font-size: 14px; font-weight: 600; }
  h3 code{ margin-left: 6px; font-size: 11px; font-weight: 500; color: var(--k-text-2); }
  .pair{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 760px){ .pair{ grid-template-columns: 1fr; } main{ padding: 8px 16px 60px; } }
  figure{ margin: 0; min-width: 0; }
  figcaption{ font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--k-text-2); margin-bottom: 6px; }
  .vp{ position: relative; overflow: hidden; border-radius: 14px; box-shadow: 0 0 0 1px var(--k-hair); background: var(--k-surface); }
  .vp iframe{ position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; }
</style>
</head>
<body>
<header><h1>Sleepa Design Kit</h1><nav>${toc}</nav></header>
<main>
<p class="intro">Every component below is real markup from Sleepa's own renderers, styled by the real stylesheet copied from <code>index.html</code>,
shown in dark and light side by side at its real width (phone 375px or desktop 1280px, scaled to fit). Photos are placeholders and managers' names
are fictional. Values: <code>TOKENS.css</code>. Rules and component anatomy: <code>DESIGN_SYSTEM.md</code>. Trading cards: <code>../cards/handoff/CARDS.md</code>.
Start / Sit: <code>../start-sit/START-SIT.md</code>. Static: no data fetching, no storage; fonts load from Google Fonts (falls back to system UI offline).</p>
${body}
</main>
<template id="app-css"><style>${css.replace(/<\/style>/g, '')}${KIT_FRAME_CSS}</style></template>
<script>
const DEMOS = ${JSON.stringify(demos).replace(/<\//g, '<\\/')};
const PH = ${JSON.stringify(PH)};
const APP_CSS = document.getElementById('app-css').innerHTML;
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@700&display=swap" rel="stylesheet">';
function doc(d, theme){
  return '<!doctype html><html lang="en" data-theme="' + theme + '" class="' + d.htmlClass + '"><head><meta charset="utf-8"><meta name="viewport" content="width=' + d.w + '">' + FONTS + APP_CSS +
    '</head><body class="' + d.bodyClass + '">' + d.html.split('__PH__').join(PH) + '</body></html>';
}
function fit(fig){
  const f = fig.querySelector('iframe'); if(!f) return;
  const d = DEMOS.find(function(x){ return x.id === fig.getAttribute('data-demo'); });
  const box = fig.querySelector('.vp'), s = Math.min(1, box.clientWidth / d.w);
  let h = d.h;
  if(!h){ try{ h = f.contentDocument.documentElement.scrollHeight; }catch(e){ h = 600; } }
  f.style.width = d.w + 'px'; f.style.height = h + 'px'; f.style.transform = 'scale(' + s + ')'; f.style.left = Math.max(0, (box.clientWidth - d.w * s) / 2) + 'px';
  box.style.height = Math.ceil(h * s) + 'px';
}
function mount(fig){
  if(fig.querySelector('iframe')) return;
  const d = DEMOS.find(function(x){ return x.id === fig.getAttribute('data-demo'); });
  const f = document.createElement('iframe');
  f.title = d.id + ' (' + fig.getAttribute('data-theme') + ')';
  f.setAttribute('sandbox', 'allow-same-origin');   // no scripts in the demos: static markup only
  f.srcdoc = doc(d, fig.getAttribute('data-theme'));
  f.addEventListener('load', function(){ fit(fig); setTimeout(function(){ fit(fig); }, 700); });
  fig.querySelector('.vp').appendChild(f); fit(fig);
}
const io = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ mount(e.target); io.unobserve(e.target); } }); }, { rootMargin: '600px' });
document.querySelectorAll('figure[data-demo]').forEach(function(f){ io.observe(f); });
addEventListener('resize', function(){ document.querySelectorAll('figure[data-demo]').forEach(fit); });
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(KIT, 'kit.html'), kit);
console.log('TOKENS.css', tokens.length, 'kit.html', kit.length, 'demos', demos.length);
