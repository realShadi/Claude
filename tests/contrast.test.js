// Contrast audit of the colour tokens: every preset theme and a sweep of custom colours, light and dark.
// Text pairs need 4.5:1; boundaries of controls need 3:1 (WCAG 1.4.3 and 1.4.11).
const fs = require('fs');
const js = fs.readFileSync(__dirname + '/../site/app.js', 'utf8');
const css = fs.readFileSync(__dirname + '/../site/app.css', 'utf8');
const src = js.slice(js.indexOf('const HL = ['), js.indexOf("let themeCss = '';"));
const T = new Function(src + '; return { themeTokens, PRESETS, contrast, hsl, HL };')();
// static tokens from the stylesheet: the first :root block is light, the :root[data-theme="dark"] block is dark
const block = from => { const a = css.indexOf(from), b = css.indexOf('}', a); const o = {}; css.slice(a, b).replace(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g, (m, k, v) => { o[k] = v; }); return o; };
const STATIC = { light: block(':root {\n  --bg'), dark: block(':root[data-theme="dark"] {') };
if (!STATIC.light.ok || !STATIC.dark.ok) throw new Error('could not read the static tokens');
const TEXT = [
  ['ink', ['bg', 'surface', 'surface-2', 'accent-soft', 'ok-soft', 'warn-soft', 'bad-soft']],
  ['ink-2', ['bg', 'surface', 'surface-2', 'accent-soft']],
  ['ink-3', ['bg', 'surface', 'surface-2']],
  ['accent', ['bg', 'surface', 'surface-2', 'accent-soft']],
  ['accent-ink', ['accent']],
  ['ok', ['bg', 'surface', 'surface-2', 'ok-soft']],
  ['warn', ['bg', 'surface', 'surface-2', 'warn-soft']],
  ['bad', ['bg', 'surface', 'surface-2', 'bad-soft']],
  ['surface', ['ink', 'ok', 'bad']],
];
const EDGE = [['field', ['bg', 'surface', 'surface-2']], ['accent', ['bg', 'surface']]];
const themes = T.PRESETS.map(p => ({ name: p.id, t: { preset: p.id } }));
const sweep = [];
for (let h = 0; h < 360; h += 15) for (const [s, l] of [[90, 50], [70, 35], [100, 70], [40, 55], [8, 50], [95, 88], [100, 12]]) sweep.push(T.hsl(h, s, l));
sweep.push('#FFFFFF', '#000000', '#FFFF00', '#00FF00', '#808080');
for (const c of sweep) themes.push({ name: 'custom ' + c, t: { preset: 'custom', custom: c } });
const fails = {}, mins = {};
for (const th of themes) {
  const tk = T.themeTokens(th.t);
  for (const mode of ['light', 'dark']) {
    const v = Object.assign({}, STATIC[mode], tk[mode]);
    const one = (fg, bg, need, kind) => {
      if (!v[fg] || !v[bg]) { if (fg !== 'field') (fails['MISSING ' + fg + '/' + bg] = fails['MISSING ' + fg + '/' + bg] || []).push(th.name); return; }
      const c = T.contrast(v[fg], v[bg]), key = mode + ' ' + kind + ' ' + fg + ' on ' + bg;
      if (!mins[key] || c < mins[key][0]) mins[key] = [c, th.name, v[fg], v[bg]];
      if (c < need) (fails[key] = fails[key] || []).push(th.name + ' ' + c.toFixed(2));
    };
    for (const [fg, bgs] of TEXT) for (const bg of bgs) one(fg, bg, 4.5, 'text');
    for (const [fg, bgs] of EDGE) for (const bg of bgs) one(fg, bg, 3, 'edge');
    for (let i = 1; i <= T.HL.length; i++) one('ink', 'hl-' + i, 4.5, 'text');
  }
}
const all = process.argv[2] === 'all';
const keys = Object.keys(fails).sort();
for (const k of keys) console.log('FAIL', k, '×' + fails[k].length, '| presets:', fails[k].filter(x => !/^custom/.test(x)).join(', ') || '-', '| worst:', mins[k] ? mins[k][0].toFixed(2) + ' ' + mins[k][1] + ' ' + mins[k][2] + '/' + mins[k][3] : '');
if (all) for (const k of Object.keys(mins).sort()) console.log(mins[k][0].toFixed(2).padStart(6), k, '(' + mins[k][1] + ')');
console.log(keys.length ? keys.length + ' failing pairs over ' + themes.length + ' themes' : 'all pairs pass over ' + themes.length + ' themes');
process.exit(keys.length ? 1 : 0);
