#!/usr/bin/env node
// Builds huddle.html: index.html plus the "Huddle every league" preview (tools/huddle-all/hx.css + hx.js), so the
// feature can be tried side by side without touching index.html. Re-run after index.html changes:
//   node tools/make-huddle-preview.js
// Moving it into the app later = the same three insertions in index.html.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let html = read('index.html');
const css = read('tools/huddle-all/hx.css');
const js = read('tools/huddle-all/hx.js');

function insertOnce(where, marker, text, before) {
  const at = html.indexOf(marker);
  if (at === -1 || html.indexOf(marker, at + 1) !== -1 && where !== 'style') throw new Error('Marker not found exactly once: ' + where);
  const pos = before ? at : at + marker.length;
  html = html.slice(0, pos) + text + html.slice(pos);
}

// 1. styles: end of the main stylesheet
insertOnce('style', '</style>', '\n' + css, true);
// 2. the action (search, #/huddle-all link): right after Sleepa Zone in ACTIONS
const zoneAction = "    { id: 'zone', title: 'Sleepa Zone',";
const zoneLineEnd = html.indexOf('\n', html.indexOf(zoneAction));
if (html.indexOf(zoneAction) === -1) throw new Error('Marker not found: ACTIONS zone entry');
html = html.slice(0, zoneLineEnd + 1) +
  "    { id: 'huddleall', title: 'Huddle every league', words: 'all leagues every league lineups set start sit huddle preview', hash: 'huddle-all', run: function(){ hxOpen(); } },\n" +
  html.slice(zoneLineEnd + 1);
// 3. the code: last thing inside the app's main closure
// the main script is the one that opens with "(function(){" on its own line; its closing "})();" is the first after it
const open = html.search(/<script>\r?\n\(function\(\)\{\r?\n/);
const close = /\r?\n\}\)\(\);\r?\n<\/script>/g;
close.lastIndex = open;
const m = open === -1 ? null : close.exec(html);
if (!m) throw new Error('Marker not found: end of main script');
const last = m.index;
html = html.slice(0, last) + '\n' + js + html.slice(last);
// 4. title, so the tab says which one this is
html = html.replace('<title>sleepa · your Sleeper lineup, sharper</title>', '<title>sleepa · preview: Huddle every league</title>');

// refuse to write a page whose main script doesn't parse
const s = html.search(/<script>\r?\n\(function\(\)\{/);
new Function(html.slice(html.indexOf('>', s) + 1, html.indexOf('</script>', s)));

fs.writeFileSync(path.join(root, 'huddle.html'), html);
console.log('huddle.html written (' + Math.round(html.length / 1024) + ' KB)');
