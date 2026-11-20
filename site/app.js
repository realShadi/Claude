(() => {
'use strict';
// Sign-in tokens must never travel over plain HTTP; only local development is exempt.
if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  location.replace('https://' + location.host + location.pathname + location.search + location.hash);
  return;
}
const rootEl = document.documentElement;
rootEl.lang = 'he';
rootEl.dir = 'rtl';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const STORE_KEY = 'sadran.v1';        // demo: the first store's data (the only key the single-store versions used)
const STORES_KEY = 'sadran.stores';   // demo: which stores are kept in this browser
const STORE_ID_KEY = 'sadran.store';  // hosted site: the store this device last used
const SEED_NAME = 'מרכול השכונה';
const SEED_IDS = ['e_noa', 'e_yosi', 'e_michal', 'e_shadi', 'e_dana', 'e_tamar', 'e_linoy', 'e_omer', 'e_ron', 'e_ahmad', 'e_ella'];
const DEMO_CODE = '2468';
const APP_VERSION = '2.1.0';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// The shared database. The key is the project's publishable key, which is meant to sit in a web page:
// it only lets the page call the sadran_* functions, and each of those checks who is signed in.
// Inside the Claude viewer outside connections are blocked, so there the page runs as a one-device demo.
const BACKEND = { url: 'https://xdjeijflnutqoxzzodqh.supabase.co', key: 'sb_publishable_3hoq5cJtZL-UnY7WrO6kuw_I9OnWsAT' };
const REMOTE = !!(BACKEND.url && BACKEND.key) && !(window.claude && typeof window.claude.use === 'function');
const TOKEN_KEY = 'sadran.token';
const LOGO_KEY = 'sadran.logo';
const APPEAR_KEY = 'sadran.appearance';
// Public half of the key the reminder function signs notifications with (the private half is a project secret).
const VAPID_PUBLIC = 'BO1mbfBRHP_eNcndbge5CAk3rojb2AL73woQdBZ0QwAbhu5dKIxD56rvwurUhhcM5t1HGYyHTrgl6QRZRZJEsFs';
const inViewer = !!(window.claude && typeof window.claude.use === 'function');
// The Excel library is served from this site. Only the Claude demo, which has no files of its own, uses the CDN copy.
const EXCEL_SRC = inViewer ? 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js' : 'vendor/exceljs.min.js';
const DEF_DEADLINE = () => ({ on: false, day: 4, time: '18:00', tz: '' });
const tzNow = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };

/* ---------- helpers ---------- */
const $ = (s, el) => (el || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const sk = (d, sh) => d + '|' + sh;
const unsk = k => { const i = k.indexOf('|'); return [+k.slice(0, i), k.slice(i + 1)]; };
const pad = n => String(n).padStart(2, '0');
const mins = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const many = (n, one, plural) => (n === 1 ? one : n + ' ' + plural);
const ltr = s => '<bdi class="t" dir="ltr">' + esc(s) + '</bdi>';
const dayTitle = d => (d === 6 ? 'שבת' : 'יום ' + DAYS[d]);
const normName = s => String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
const normNum = s => String(s == null ? '' : s).replace(/[\s\-().+]/g, '');

function startOfWeek(dt) { const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); d.setDate(d.getDate() - d.getDay()); return d; }
function addDays(dt, n) { const d = new Date(dt); d.setDate(d.getDate() + n); return d; }
const toKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const dm = d => d.getDate() + '.' + (d.getMonth() + 1);
function weekLabel(wk) { const a = fromKey(wk), b = addDays(a, 6); return (a.getMonth() === b.getMonth() ? a.getDate() : dm(a)) + '–' + dm(b); }
function relWeek(wk) {
  const diff = Math.round((fromKey(wk) - startOfWeek(new Date())) / 6048e5);
  if (diff === 0) return 'השבוע הנוכחי';
  if (diff === 1) return 'השבוע הבא';
  if (diff === -1) return 'השבוע שעבר';
  return diff > 1 ? 'בעוד ' + diff + ' שבועות' : 'לפני ' + -diff + ' שבועות';
}
const defaultWeek = () => toKey(addDays(startOfWeek(new Date()), 7));
function stamp(ts) { const d = new Date(ts); return 'ביום ' + DAY_SHORT[d.getDay()] + ' ' + ltr(dm(d)) + ' בשעה ' + ltr(pad(d.getHours()) + ':' + pad(d.getMinutes())); }

const ICONS = {
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.8c1.9.6 3.1 2.2 3.5 4.7"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  wand: '<path d="M5 19 15.5 8.5M14 7l3 3"/><path d="M18.5 3.5v3M17 5h3M7 4v2M6 5h2M19 13v2M18 14h2"/>',
  send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  alert: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17v.3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  star: '<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  undo: '<path d="M8 5 4 9l4 4"/><path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5"/>',
  up: '<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  down: '<path d="M12 4v11.5M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16M9.9 5.8A9.3 9.3 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.3 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  share: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.8 6.6-3.9M8.7 13.2l6.6 3.9"/>',
};
const icon = n => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>';

/* ---------- themes ----------
   The manager picks a store theme (a preset or any colour); everything else is derived from it:
   tinted neutrals and an accent that keeps its contrast in both light and dark. */
const HL = [   // role highlight colours, [light, dark]
  ['#FFE55C', '#5E5108'], ['#FFB6D3', '#6C2446'], ['#B7EDA3', '#24562B'], ['#A8DDFA', '#154A67'],
  ['#FFCB8F', '#6C4412'], ['#D6C8FF', '#44367C'], ['#9EEBDD', '#145247'], ['#FFB3A7', '#6E2620'],
  ['#DDF58A', '#48560F'], ['#BFC8FF', '#2C3878'], ['#E8D9B5', '#5A4A26'], ['#D5DBE3', '#3A4552'],
];
const HL_NAMES = ['צהוב', 'ורוד', 'ירוק', 'תכלת', 'כתום', 'סגול', 'טורקיז', 'אדום', 'ליים', 'כחול', 'חול', 'אפור'];
const COLORS = HL.length;
const PRESETS = [
  { id: 'blue', name: 'כחול', accent: '#2343D0', dark: '#8AA5FF', hue: 214 },
  { id: 'forest', name: 'יער', accent: '#17734A', dark: '#6CD49E', hue: 152 },
  { id: 'wine', name: 'בורדו', accent: '#A11D45', dark: '#FF8FAE', hue: 346 },
  { id: 'amber', name: 'ענבר', accent: '#B4410B', dark: '#FDB27A', hue: 28 },
  { id: 'violet', name: 'סגול', accent: '#6A2BD1', dark: '#C6B3FF', hue: 262 },
  { id: 'teal', name: 'טורקיז', accent: '#0B6F80', dark: '#5FD8EA', hue: 190 },
  { id: 'graphite', name: 'גרפיט', accent: '#273142', dark: '#D9DFE8', hue: 218, mono: true },
];
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); };
const luminance = h => hexRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return rgbHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
function hueSat(hex) {
  const [r, g, b] = hexRgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (!d) return [0, 0];
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, d / (1 - Math.abs(2 * l - 1)) * 100];
}
// Move a colour towards black or white until it has the contrast it needs on every background it is used on.
function fit(c, grounds, need, to) {
  for (let i = 0; i < 60 && grounds.some(g => contrast(c, g) < need); i++) c = mix(c, to, .05);
  return c;
}
// Text needs 4.5:1 and the outline of a field 3:1 (WCAG 1.4.3, 1.4.11); a little is added for rounding.
const TEXT_MIN = 4.6, EDGE_MIN = 3.1;
function themeTokens(t) {
  t = t || {};
  let p = PRESETS.find(x => x.id === t.preset) || PRESETS[0];
  if (t.preset === 'custom' && /^#[0-9a-f]{6}$/i.test(t.custom || '')) {
    const [h, sat] = hueSat(t.custom), mono = sat < 12;
    p = { accent: t.custom.toUpperCase(), dark: mix(t.custom, '#FFFFFF', .3), hue: h, mono };
  }
  const k = p.mono ? .3 : 1, h = p.hue;
  const light = { bg: hsl(h, 22 * k, 94), surface: '#FFFFFF', 'surface-2': hsl(h, 30 * k, 96.5), line: hsl(h, 20 * k, 88), 'line-2': hsl(h, 16 * k, 78) };
  const dark = { bg: hsl(h, 28 * k, 8), surface: hsl(h, 26 * k, 13), 'surface-2': hsl(h, 24 * k, 16), line: hsl(h, 22 * k, 21), 'line-2': hsl(h, 18 * k, 30) };
  const finish = (o, accent, inks, to, softMix) => {
    const grounds = [o.bg, o.surface, o['surface-2']];
    // The tint behind selected items follows the accent, and the accent must read on it too.
    for (let i = 0; i < 4; i++) {
      o['accent-soft'] = softMix(accent);
      const next = fit(accent, grounds.concat(o['accent-soft']), TEXT_MIN, to);
      if (next === accent) break;
      accent = next;
    }
    o.accent = accent;
    const all = grounds.concat(o['accent-soft']);
    o.ink = inks[0];
    o['ink-2'] = fit(inks[1], all, TEXT_MIN, to);
    o['ink-3'] = fit(inks[2], all, TEXT_MIN, to);
    o.field = fit(o['line-2'], grounds, EDGE_MIN, to);
    return o;
  };
  finish(light, p.accent, [hsl(h, 37 * k, 12), hsl(h, 18 * k, 33), hsl(h, 13 * k, 44)], '#000000', a => mix(a, '#FFFFFF', .87));
  finish(dark, p.dark, [hsl(h, 30 * k, 93), hsl(h, 18 * k, 76), hsl(h, 13 * k, 61)], '#FFFFFF', a => mix(a, dark.bg, .78));
  light['accent-ink'] = contrast(light.accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : light.ink;
  dark['accent-ink'] = fit(mix(dark.accent, '#000000', .85), [dark.accent], TEXT_MIN, '#000000');
  HL.forEach((c, i) => { light['hl-' + (i + 1)] = c[0]; dark['hl-' + (i + 1)] = c[1]; });
  return { light, dark };
}
let themeCss = '';
function applyTheme(neutral) {
  const tk = themeTokens(neutral ? null : state.theme), v = o => Object.keys(o).map(k => '--' + k + ':' + o[k]).join(';');
  const css = ':root{' + v(tk.light) + '}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + v(tk.dark) + ';color-scheme:dark}}' +
    ':root[data-theme="dark"]{' + v(tk.dark) + ';color-scheme:dark}';
  if (css === themeCss) return;
  themeCss = css;
  let el = document.getElementById('themeVars');
  // After the page's own styles, so the theme wins over the defaults there.
  if (!el) { el = document.createElement('style'); el.id = 'themeVars'; document.body.appendChild(el); }
  el.textContent = css;
}
// Light or dark on this device only. Inside the Claude viewer the viewer decides.
const APPEAR = { system: ['auto', 'לפי המכשיר'], light: ['sun', 'בהיר'], dark: ['moon', 'כהה'] };
function getAppearance() { try { const a = localStorage.getItem(APPEAR_KEY); return APPEAR[a] ? a : 'system'; } catch (e) { return 'system'; } }
function applyAppearance() {
  if (inViewer) return;
  const a = getAppearance(), b = document.getElementById('appearBtn');
  if (a === 'system') rootEl.removeAttribute('data-theme'); else rootEl.setAttribute('data-theme', a);
  if (b) {
    b.hidden = false;
    b.innerHTML = icon(APPEAR[a][0]);
    b.title = 'מראה: ' + APPEAR[a][1];
    b.setAttribute('aria-label', 'מראה במכשיר הזה: ' + APPEAR[a][1] + '. הקשה מחליפה.');
  }
}

/* ---------- example data ---------- */
function seed() {
  const wk = defaultWeek();
  const now = Date.now();
  const s = {
    v: 2,
    app: APP_VERSION,
    example: true,
    managerCode: DEMO_CODE,
    store: { name: SEED_NAME },
    roles: [
      { id: 'r_lead', name: 'אחראי/ת משמרת', color: 1 },
      { id: 'r_cash', name: 'קופאי/ת', color: 4 },
      { id: 'r_stock', name: 'מחסנאי/ת', color: 3 },
      { id: 'r_recv', name: 'קבלת סחורה', color: 5 },
    ],
    shifts: [
      { id: 's_am', name: 'בוקר', start: '07:00', end: '15:00' },
      { id: 's_pm', name: 'ערב', start: '15:00', end: '23:00' },
    ],
    req: { s_am: { r_lead: 1, r_cash: 2, r_recv: 1 }, s_pm: { r_lead: 1, r_cash: 2, r_stock: 1 } },
    closed: { '5|s_pm': true, '6|s_am': true, '6|s_pm': true },
    rules: { minRest: 10, deadline: { on: true, day: 4, time: '18:00', tz: '' } },
    theme: { preset: 'blue' },
    exportStyle: 'color',
    logo: null,
    employees: [
      { id: 'e_noa', name: 'נועה', number: '1001', roles: ['r_lead', 'r_cash'], max: 5 },
      { id: 'e_yosi', name: 'יוסי', number: '1002', roles: ['r_lead', 'r_recv'], max: 5 },
      { id: 'e_michal', name: 'מיכל', number: '1003', roles: ['r_lead', 'r_cash'], max: 4 },
      { id: 'e_shadi', name: 'שאדי', number: '1004', roles: ['r_cash', 'r_stock'], max: 5 },
      { id: 'e_dana', name: 'דנה', number: '1005', roles: ['r_cash'], max: 4 },
      { id: 'e_tamar', name: 'תמר', number: '1006', roles: ['r_cash'], max: 4 },
      { id: 'e_linoy', name: 'לינוי', number: '1007', roles: ['r_lead', 'r_cash'], max: 3 },
      { id: 'e_omer', name: 'עומר', number: '1008', roles: ['r_cash', 'r_stock'], max: 4 },
      { id: 'e_ron', name: 'רון', number: '1009', roles: ['r_recv', 'r_stock'], max: 5 },
      { id: 'e_ahmad', name: 'אחמד', number: '1010', roles: ['r_recv', 'r_stock'], max: 5 },
      { id: 'e_ella', name: 'אלה', number: '1011', roles: ['r_cash'], max: 4 },
    ],
    avail: {},
    weeks: {},
    prefs: { session: null, demoNote: true },
    consentLog: {},
  };
  // am / pm: days the person can work; amP / pmP: days they prefer.
  const A = (id, hoursAgo, o) => {
    const slots = {};
    (o.am || []).forEach(d => { slots[sk(d, 's_am')] = 1; });
    (o.pm || []).forEach(d => { slots[sk(d, 's_pm')] = 1; });
    (o.amP || []).forEach(d => { slots[sk(d, 's_am')] = 2; });
    (o.pmP || []).forEach(d => { slots[sk(d, 's_pm')] = 2; });
    return [id, { submittedAt: now - hoursAgo * 36e5, note: o.note || '', slots }];
  };
  s.avail[wk] = Object.fromEntries([
    A('e_noa', 30, { am: [1, 3, 4, 5], amP: [0, 2], pm: [1, 3] }),
    A('e_yosi', 28, { am: [0, 2, 4], amP: [1, 3, 5], pm: [2] }),
    A('e_michal', 26, { am: [5], pm: [0, 1], pmP: [2, 3], note: 'ביום חמישי יש לי לימודים עד מאוחר.' }),
    A('e_shadi', 20, { am: [0], pm: [0, 1, 2, 3, 4], note: 'בבוקר אפשר רק ביום ראשון, בשאר הימים רק ערב.' }),
    A('e_dana', 19, { am: [1, 3], amP: [5], pm: [0, 2, 4] }),
    A('e_tamar', 17, { am: [0, 2, 3], amP: [1, 4] }),
    A('e_omer', 12, { pm: [0, 1, 2], pmP: [3, 4] }),
    A('e_ron', 9, { am: [0, 1, 2, 3, 4, 5], pm: [1, 3] }),
    A('e_ahmad', 6, { am: [0, 2, 4], amP: [5], pm: [1, 2, 3, 4] }),
    A('e_ella', 3, { am: [1, 2, 3, 4], pm: [0] }),
  ]);
  return s;
}

/* ---------- state ----------
   Without a database (the demo) everything is kept in this browser. That data is someone's work, so
   a copy is set aside before anything could replace it: a newer version of the page, a reset to the
   example data, or loading a backup. Data this version cannot read is never overwritten unseen. */
const KEEP_KEY = 'sadran.keep.';
// A copy set aside belongs to a store. The first store keeps the names used before there were several.
const keepName = (why, id) => KEEP_KEY + why + (id && id !== 'main' ? '.' + id : '');
function keep(why, raw, id) {
  try { if (raw) localStorage.setItem(keepName(why, id === undefined ? shop.id : id), JSON.stringify({ at: Date.now(), app: APP_VERSION, data: raw })); }
  catch (e) { /* no room for a copy; the data itself is untouched */ }
}
function kept(why, id) {
  try { const c = JSON.parse(localStorage.getItem(keepName(why, id === undefined ? shop.id : id)) || 'null'); return c && typeof c.data === 'string' && c.at ? c : null; }
  catch (e) { return null; }
}

/* ---------- stores ----------
   The service holds many stores. On the hosted site they live in the database, and this device only
   remembers which one it last used. In the demo they are all kept in this browser: a list, and each
   store's data under its own key. The first store keeps the key the single-store versions used, so
   whatever was entered then simply is the first store. */
const shop = { id: null, list: [] };   // the store in use; demo: every store here, as { id, key, name }
const shopRec = id => shop.list.find(x => x.id === id) || null;
function shopsWrite() {
  try { localStorage.setItem(STORES_KEY, JSON.stringify({ active: shop.id, list: shop.list })); } catch (e) { /* the list lasts for this visit */ }
}
// One store's saved data. Null when there is none, or when this version cannot read it (a copy is then set aside).
function load(rec) {
  let raw = null;
  try { raw = localStorage.getItem(rec.key); } catch (e) { return null; }   // no storage here
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (s && (s.v === 1 || s.v === 2) && Array.isArray(s.employees)) {
      if (s.app !== APP_VERSION) keep('update', raw, rec.id);
      return migrate(s);
    }
  } catch (e) { /* not readable */ }
  keep('unreadable', raw, rec.id);
  return null;
}
// The example store is an example only while it has the example's name and people. Renamed, or with a
// team of its own, it is someone's store: it is no longer offered a reset to the example data.
const stillExample = s => !!s.store && s.store.name === SEED_NAME && s.employees.length === SEED_IDS.length && s.employees.every(e => SEED_IDS.indexOf(e.id) >= 0);
// Bring data saved by the first version up to date: sign-in numbers, a manager code, a session.
function migrate(s) {
  if (s.v === 1) { s.example = true; s.v = 2; }
  s.app = APP_VERSION;
  s.employees.forEach(e => { delete e.double; });   // a per-person option that no longer exists: two shifts a day are normal
  if (s.example && !stillExample(s)) s.example = false;
  s.prefs = s.prefs || { demoNote: true };
  delete s.prefs.mode;
  delete s.prefs.me;
  if (!s.prefs.session) s.prefs.session = null;
  if (!s.theme) s.theme = { preset: 'blue' };
  if (!s.exportStyle) s.exportStyle = 'color';
  s.rules = Object.assign({ minRest: 10 }, s.rules);
  if (!s.rules.deadline) s.rules.deadline = DEF_DEADLINE();
  if (!s.managerCode) s.managerCode = DEMO_CODE;
  const used = new Set(s.employees.map(e => e.number).filter(Boolean));
  let next = 1001;
  for (const e of s.employees) {
    if (e.number) continue;
    while (used.has(String(next)) || String(next) === s.managerCode) next++;
    e.number = String(next);
    used.add(e.number);
  }
  return s;
}
function save() {
  if (REMOTE) { queueChanges(); return; }
  const rec = shopRec(shop.id);
  if (!rec) return;   // no store is open: there is nothing to keep
  try { localStorage.setItem(rec.key, JSON.stringify(state)); } catch (e) { /* ignore */ }
  if (rec.name !== state.store.name) { rec.name = state.store.name; shopsWrite(); }
}
// Settings and lists before anything arrives from the shared database.
function blankState() {
  const s = seed();
  s.example = false;
  s.managerCode = null;
  s.store = { name: '' };
  s.employees = [];
  s.avail = {};
  s.weeks = {};
  s.prefs = { session: null, demoNote: false };
  s.rules = { minRest: 10, deadline: DEF_DEADLINE() };
  s.logo = null;
  s.logoVer = null;
  s.consents = {};
  return s;
}

// Until a store is opened or chosen, an empty one stands in.
let state = blankState();
// Demo: find the stores kept in this browser. True when the front page should be shown once.
function demoStart() {
  let idx = null;
  try { idx = JSON.parse(localStorage.getItem(STORES_KEY) || 'null'); } catch (e) { idx = null; }
  if (idx && Array.isArray(idx.list) && idx.list.length) {
    shop.list = idx.list.filter(x => x && /^[A-Za-z0-9_-]{1,48}$/.test(x.id) && typeof x.key === 'string' && x.key.indexOf('sadran.') === 0)
      .map(x => ({ id: x.id, key: x.key, name: typeof x.name === 'string' ? x.name : '' }));
    const rec = shopRec(idx.active), st = rec && load(rec);
    if (st) { shop.id = rec.id; state = st; }
    return false;
  }
  // The first visit since stores came in. Data an earlier version saved becomes the first store, with
  // its sign-in kept. With nothing saved, the example store is created and waits to be chosen.
  const first = { id: 'main', key: STORE_KEY, name: '' };
  shop.list = [first];
  const mine = load(first);
  shop.id = 'main';
  if (mine) state = mine;
  else {
    state = seed();
    autoSchedule(ui.week, false);   // the example opens on a proposed roster rather than an empty sheet
  }
  first.name = state.store.name;
  save();
  if (!mine) { shop.id = null; state = blankState(); }
  shopsWrite();
  return !!mine;
}

const ui = {
  view: 'schedule', week: defaultWeek(), sheet: null, confirm: null, undo: null, fresh: false, open: {},
  signin: { tab: 'employee', name: '', number: '', code: '', err: '' },
  entry: null,   // a front screen asked for by name: 'landing', 'stores' or 'open'
  stores: { q: '', list: null, more: false, err: '', seq: 0 },
  newStore: { name: '', code: '', code2: '', err: '', bad: '' },
  storeDraft: null, storeErr: '',
  agree: { checked: {}, fields: {}, err: '', busy: false }, agreeFor: '',
  legal: null, lastHash: '', unsub: null,
  codeDraft: null, codeErr: '',
  xprev: { key: '', url: '' }, logoBusy: false,
  shown: {},
};

const roleById = id => state.roles.find(r => r.id === id);
const shiftById = id => state.shifts.find(s => s.id === id);
const empById = id => state.employees.find(e => e.id === id);
function availRec(wk, empId, create) {
  let a = state.avail[wk];
  if (!a) { if (!create) return null; a = state.avail[wk] = {}; }
  if (!a[empId] && create) a[empId] = { submittedAt: null, note: '', slots: {} };
  return a[empId] || null;
}
const isSubmitted = (wk, empId) => { const r = availRec(wk, empId); return !!(r && r.submittedAt); };
const submittedCount = wk => state.employees.filter(e => isSubmitted(wk, e.id)).length;
function currentMe() {
  const s = state.prefs.session;
  return (s && s.role === 'employee' && empById(s.id)) || null;
}
// A personal number to suggest for a new employee: random, so one person's number says nothing
// about anyone else's.
function suggestNumber() {
  const a = new Uint32Array(1);
  for (let i = 0; i < 20; i++) {
    crypto.getRandomValues(a);
    const n = String(100000 + a[0] % 900000);
    if (n !== state.managerCode) return n;
  }
  return '';
}

/* ---------- shared database ----------
   Everything the signed-in person may see is loaded in one call. Each change is then sent on its
   own (settings, one week's roster, one person's availability, one employee), shortly after the
   last edit, and the page reloads from the server every 30 seconds while nothing is being saved. */
const net = { phase: REMOTE ? 'loading' : 'ready', token: null, busy: false, base: null, timers: {}, sending: {}, failures: 0, refreshing: false };
const NET_ERR = 'אין חיבור לשרת. כדאי לבדוק את האינטרנט ולנסות שוב.';
// A device holds one sign-in. It is kept with the store it belongs to, as "<store>:<token>", so a visit
// knows where it leads without asking. (A sign-in saved before there were several stores has no store part.)
function tokenRead() {
  let v = null;
  try { v = localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  const m = /^(?:([a-z0-9]{6,16}):)?([^:]+)$/.exec(v || '');
  return m ? { store: m[1] || null, token: m[2] } : null;
}
function tokenSet(t, store) {
  net.token = t || null;
  try { if (t) localStorage.setItem(TOKEN_KEY, (store ? store + ':' : '') + t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* then the sign-in lasts for this tab only */ }
}
// JSON with object keys in a fixed order, so two copies of the same data compare equal.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return v === undefined ? 'null' : JSON.stringify(v);
}
async function rpc(fn, args, keepalive) {
  let res, text = '', data = null;
  try {
    res = await fetch(BACKEND.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', cache: 'no-store', keepalive: !!keepalive,
      headers: { apikey: BACKEND.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    text = await res.text();
  } catch (e) { throw { code: 'network' }; }
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!res.ok) {
    const m = (data && data.message) || '';
    throw { code: m === 'auth' || m === 'forbidden' ? m : res.status >= 500 ? 'server' : 'bad', message: m };
  }
  return data;
}
const cfgOf = () => ({ store: state.store, roles: state.roles, shifts: state.shifts, req: state.req, closed: state.closed, rules: state.rules, theme: state.theme, exportStyle: state.exportStyle });
const weekOf = w => ({ slots: w.slots || {}, over: w.over || {}, published: w.published || null });
const availOf = r => ({ slots: r.slots || {}, note: r.note || '', submitted: !!r.submittedAt });
const empOf = e => ({ id: e.id, name: e.name, roles: e.roles, max: e.max });
function weekHasContent(w) {
  if (w.published || Object.keys(w.over || {}).length) return true;
  for (const k in w.slots) if (w.slots[k].some(p => p.emp)) return true;
  return false;
}
const availHasContent = r => !!(r.submittedAt || r.note || Object.keys(r.slots || {}).length);
// Remember what the server holds, to send only what changes afterwards.
function takeBase() {
  const b = { config: canon(cfgOf()), weeks: {}, avail: {}, emps: {} };
  for (const wk in state.weeks) b.weeks[wk] = canon(weekOf(state.weeks[wk]));
  for (const wk in state.avail) for (const id in state.avail[wk]) b.avail[wk + '|' + id] = canon(availOf(state.avail[wk][id]));
  for (const e of state.employees) b.emps[e.id] = canon(empOf(e));
  net.base = b;
}
function applyServer(d) {
  const c = d.config || {};
  state.store = c.store || { name: '' };
  state.roles = c.roles || [];
  state.shifts = c.shifts || [];
  state.req = c.req || {};
  state.closed = c.closed || {};
  state.rules = Object.assign({ minRest: 10, deadline: DEF_DEADLINE() }, c.rules || {});
  state.theme = c.theme || { preset: 'blue' };
  state.exportStyle = c.exportStyle || 'color';
  state.employees = d.employees || [];
  state.avail = d.avail || {};
  state.weeks = {};
  const ws = d.weeks || {};
  for (const wk in ws) state.weeks[wk] = { slots: ws[wk].slots || {}, over: ws[wk].over || {}, published: ws[wk].published || null };
  state.prefs.session = d.role === 'manager' ? { role: 'manager' } : { role: 'employee', id: d.me };
  if (d.store) shop.id = d.store;
  state.consents = d.consents || {};
  takeBase();
}
const pending = () => Object.keys(net.timers).length + Object.keys(net.sending).length;
const isTyping = () => { const a = document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type !== 'checkbox')); };
function queue(key, delay) {
  clearTimeout(net.timers[key]);
  net.timers[key] = setTimeout(() => flushKey(key), net.failures ? Math.min(30000, 2000 * Math.pow(2, net.failures - 1)) : delay);
}
function queueChanges() {
  const s = state.prefs.session;
  if (net.phase !== 'ready' || !net.base || !s) return;
  const mgr = s.role === 'manager', b = net.base;
  if (mgr) {
    if (canon(cfgOf()) !== b.config) queue('c', 900);
    for (const wk in state.weeks) {
      const w = state.weeks[wk];
      if (canon(weekOf(w)) === b.weeks[wk] || (!(wk in b.weeks) && !weekHasContent(w))) continue;
      queue('w:' + wk, 700);
    }
    for (const e of state.employees) if (e.id in b.emps && canon(empOf(e)) !== b.emps[e.id]) queue('e:' + e.id, 900);
  }
  for (const wk in state.avail) for (const id in state.avail[wk]) {
    if (!mgr && id !== s.id) continue;
    const key = wk + '|' + id, r = state.avail[wk][id];
    if (canon(availOf(r)) === b.avail[key] || (!(key in b.avail) && !availHasContent(r))) continue;
    queue('a:' + key, 700);
  }
  paintSync();
}
// The request that saves one queued change, and what to remember once it is saved.
function job(key) {
  const t = { p_token: net.token }, kind = key[0], rest = key.slice(2);
  if (kind === 'c') {
    const v = cfgOf(), sig = canon(v);
    return { fn: 'sadran_save_config', args: Object.assign(t, { p_config: v }), done: () => { net.base.config = sig; } };
  }
  if (kind === 'w') {
    const w = state.weeks[rest];
    if (!w) return null;
    const v = weekOf(w), sig = canon(v);
    return { fn: 'sadran_save_week', args: Object.assign(t, { p_week: rest, p_slots: v.slots, p_over: v.over, p_published: v.published }), done: () => { net.base.weeks[rest] = sig; } };
  }
  if (kind === 'e') {
    const e = empById(rest);
    if (!e) return null;
    const v = empOf(e), sig = canon(v);
    return { fn: 'sadran_save_employee', args: Object.assign(t, { p_employee: v }), done: out => { if (out && out.ok) net.base.emps[rest] = sig; else throw { code: 'bad' }; } };
  }
  const i = rest.indexOf('|'), wk = rest.slice(0, i), id = rest.slice(i + 1), r = (state.avail[wk] || {})[id];
  if (!r) return null;
  const v = availOf(r), sig = canon(v);
  return {
    fn: 'sadran_save_availability',
    args: Object.assign(t, { p_week: wk, p_employee: id, p_slots: v.slots, p_note: v.note, p_submitted: v.submitted }),
    done: out => { net.base.avail[rest] = sig; if (out && out.submittedAt && r.submittedAt) r.submittedAt = out.submittedAt; },
  };
}
async function flushKey(key, keepalive) {
  clearTimeout(net.timers[key]);
  delete net.timers[key];
  if (net.sending[key] || !net.token) return false;
  const j = job(key);
  if (!j) return true;
  net.sending[key] = true;
  paintSync();
  let ok = false;
  try {
    j.done(await rpc(j.fn, j.args, keepalive));
    net.failures = 0;
    ok = true;
  } catch (err) {
    delete net.sending[key];
    if (err.code === 'auth') { endSession('expired'); return false; }
    if (err.code !== 'network' && err.code !== 'server') {
      net.failures = 0;
      toast('שינוי אחד לא נשמר, ולכן הנתונים נטענו מחדש מהשרת.');
      refresh(true);
      return false;
    }
    net.failures = Math.min(net.failures + 1, 6);
  }
  delete net.sending[key];
  queueChanges();
  paintSync();
  return ok;
}
function flushAll(keepalive) { Object.keys(net.timers).forEach(k => flushKey(k, keepalive)); }
const waitIdle = ms => new Promise(done => { const t0 = Date.now(); (function tick() { if (!pending() || Date.now() - t0 > ms) done(); else setTimeout(tick, 100); })(); });
async function refresh(force) {
  if (!REMOTE || net.phase !== 'ready' || !net.token || net.refreshing) return;
  if (!force && (pending() || ui.sheet || isTyping())) return;
  net.refreshing = true;
  try {
    const d = await rpc('sadran_load', { p_token: net.token });
    if (!force && (pending() || ui.sheet || isTyping())) return;
    const view = () => canon({ c: cfgOf(), e: state.employees, a: state.avail, w: state.weeks, s: state.prefs.session, k: state.consents });
    const before = view();
    applyServer(d);
    const logoChanged = await syncLogo(d.logoVer);
    syncWeek(ui.week);
    if (logoChanged || view() !== before) render();
  } catch (err) {
    if (err.code === 'auth') endSession('expired');
  } finally {
    net.refreshing = false;
  }
}
function paintSync() {
  const el = document.getElementById('syncState');
  if (!el) return;
  const busy = pending() > 0, bad = net.failures > 0;
  el.className = 'sync' + (bad ? ' is-bad' : busy ? ' is-busy' : '');
  el.title = bad ? 'אין חיבור לשרת. השינויים יישמרו כשהחיבור יחזור.' : busy ? 'שומר את השינויים' : 'כל השינויים נשמרו';
  el.innerHTML = '<span class="sync-t">' + (bad ? 'לא נשמר' : busy ? 'שומר…' : 'נשמר') + '</span>';
}
// Close the open store on this screen, and forget the sign-in unless it is kept for the way back.
// The store's name and look stay, for its sign-in screen.
function dropSession(keep) {
  Object.keys(net.timers).forEach(k => clearTimeout(net.timers[k]));
  net.timers = {};
  net.sending = {};
  net.failures = 0;
  net.base = null;
  if (keep) net.token = null; else tokenSet(null);
  const keepIt = { store: state.store, theme: state.theme, logo: state.logo, logoVer: state.logoVer };
  state = blankState();
  Object.assign(state, keepIt);
  ui.sheet = null;
  ui.undo = null;
  net.phase = 'signin';
}
// Tell the server the sign-in is over, after sending what is still waiting to be saved.
async function closeSession() {
  const t = net.token;
  if (pending()) { flushAll(false); await waitIdle(4000); }
  await dropPushSub(t);
  push.state = 'unknown';
  rpc('sadran_logout', { p_token: t }).catch(() => { /* the session expires on its own */ });
}
// Step out of the open store to look at another one. Nothing is signed out: what is waiting to be
// saved is sent, and the sign-in stays on the device for the way back.
async function stepOut() {
  if (pending()) { flushAll(false); await waitIdle(4000); }
  push.state = 'unknown';
  dropSession(true);
}
// One sign-in per device: before a new one starts, the one this device holds is ended properly.
async function endOther() {
  if (net.token) { await closeSession(); dropSession(); return; }
  const kept = tokenRead();
  if (!kept) return;
  await dropPushSub(kept.token);
  rpc('sadran_logout', { p_token: kept.token }).catch(() => { /* the session expires on its own */ });
  tokenSet(null);
}
function endSession(reason) {
  dropSession();
  clearRoute();
  render();
  window.scrollTo(0, 0);
  if (reason === 'expired') toast('הכניסה הסתיימה. צריך להיכנס שוב.');
  if (reason === 'removed') toast('העובד/ת הזה/זו כבר לא ברשימת הצוות.');
}
function storeRecall() { try { const v = localStorage.getItem(STORE_ID_KEY); return /^[a-z0-9]{6,16}$/.test(v || '') ? v : null; } catch (e) { return null; } }
function storeRemember(id) { try { if (id) localStorage.setItem(STORE_ID_KEY, id); else localStorage.removeItem(STORE_ID_KEY); } catch (e) { /* asked again next visit */ } }
// A link to a store's sign-in screen carries ?store=<id>. It is used once and then taken out of the address.
function storeFromLink() {
  let id = null;
  try { id = new URLSearchParams(location.search).get('store'); } catch (e) { return null; }
  if (!/^[a-z0-9]{6,16}$/.test(id || '')) return null;
  try { const u = new URL(location.href); u.searchParams.delete('store'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* the link stays in the address */ }
  return id;
}
// Show a store's sign-in screen: its name, colours and logo.
async function useStore(st) {
  shop.id = st.id;
  storeRemember(st.id);
  state.store = { name: st.store || '' };
  state.theme = st.theme || { preset: 'blue' };
  state.logo = null; state.logoVer = null;
  await syncLogo(st.logoVer);
  ui.signin = { tab: ui.signin.tab, name: '', number: '', code: '', err: '' };
}
// Load everything for the signed-in person and open their first screen. False: the sign-in was not
// used, because it is no longer valid, or because it belongs to another store than the one asked for
// (`only`). In that case it stays on the device.
async function enter(only) {
  net.phase = 'loading';
  render();
  let loaded;
  try {
    loaded = await rpc('sadran_load', { p_token: net.token });
    if (only && loaded.store && loaded.store !== only) { tokenSet(net.token, loaded.store); net.token = null; net.phase = 'signin'; return false; }
    applyServer(loaded);
  } catch (err) {
    if (err.code === 'auth') { tokenSet(null); return false; }
    net.phase = 'down';
    render();
    return true;
  }
  tokenSet(net.token, shop.id);
  await syncLogo(loaded.logoVer);
  net.phase = 'ready';
  net.failures = 0;
  const s = state.prefs.session, h = location.hash.slice(1);
  ui.view = VIEWS[h] && VIEWS[h].mode === s.role ? h : (s.role === 'manager' ? 'schedule' : 'my-availability');
  ui.week = defaultWeek();
  ui.signin = { tab: ui.signin.tab, name: '', number: '', code: '', err: '' };
  ui.newStore = { name: '', code: '', code2: '', err: '', bad: '' };
  storeRemember(shop.id);
  ui.entry = null;
  if (FRONT[h]) { try { location.hash = ui.view; } catch (e) { /* hash routing is optional */ } }
  render();
  window.scrollTo(0, 0);
  refreshPush(true);
  return true;
}
let linked;   // the store a link asked for, until this visit has shown it (kept through a "try again")
async function remoteStart() {
  net.phase = 'loading';
  render();
  const link = unsubToken();
  if (link && !ui.unsub) {
    ui.unsub = { state: 'busy' };
    render();
    try { const out = await rpc('sadran_unsubscribe', { p_token: link }); ui.unsub = { state: out && out.ok ? 'ok' : 'bad' }; }
    catch (err) { ui.unsub = { state: 'net' }; }
    render();
    return;
  }
  if (linked === undefined) linked = storeFromLink();
  const want = linked, last = storeRecall(), kept = tokenRead();
  // A sign-in kept on this device opens its store, unless a link asks for another one.
  if (kept && !(want && kept.store && want !== kept.store)) {
    net.token = kept.token;
    if (await enter(want)) { if (net.phase !== 'down') linked = null; return; }
  }
  const id = want || last;
  net.phase = 'signin';
  if (id) {
    try {
      const st = await rpc('sadran_status', { p_store: id });
      if (st && st.found) await useStore(st);
      else { shop.id = null; if (id === last) storeRemember(null); if (want) toast('החנות שבקישור לא נמצאה.'); }
      linked = null;
    } catch (err) { net.phase = 'down'; }
  }
  render();
}

/* ---------- store logo ----------
   Resized in the page, kept in the database as a data URL and cached on each device by version. */
function logoCacheGet(ver) { try { const c = JSON.parse(localStorage.getItem(LOGO_KEY) || 'null'); return c && c.ver === ver && c.store === shop.id ? c.data : null; } catch (e) { return null; } }
function logoCacheSet(ver, data) { try { if (data) localStorage.setItem(LOGO_KEY, JSON.stringify({ store: shop.id, ver, data })); else localStorage.removeItem(LOGO_KEY); } catch (e) { /* the logo is then fetched each visit */ } }
// Bring the logo up to date with the version the server reports. True when it changed.
async function syncLogo(ver) {
  if (!REMOTE) return false;
  if (!ver) {
    const had = !!state.logo;
    state.logo = null; state.logoVer = null; logoCacheSet(null, null);
    return had;
  }
  if (ver === state.logoVer && state.logo) return false;
  const cached = logoCacheGet(ver);
  if (cached) { state.logo = cached; state.logoVer = ver; return true; }
  try {
    const d = await rpc('sadran_logo', { p_store: shop.id });
    if (d && d.logo) { state.logo = d.logo; state.logoVer = d.logoVer; logoCacheSet(d.logoVer, d.logo); return true; }
  } catch (e) { /* keep what is shown */ }
  return false;
}
// Shrink an uploaded image to at most 360 px a side and encode it compactly.
async function logoFromFile(file) {
  if (!/^image\//.test(file.type)) throw { code: 'type' };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const nw = img.naturalWidth || 360, nh = img.naturalHeight || 360;
    for (let max = 360; max >= 120; max = Math.round(max * .75)) {
      const sc = Math.min(1, max / Math.max(nw, nh)), w = Math.max(1, Math.round(nw * sc)), h = Math.max(1, Math.round(nh * sc));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      let data = c.toDataURL('image/png');
      const webp = c.toDataURL('image/webp', .9);
      if (webp.indexOf('data:image/webp') === 0 && webp.length < data.length) data = webp;
      if (data.length <= 160000) return data;
    }
    throw { code: 'size' };
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- availability deadline ----------
   The availability for a week is due on a day and time in the week before it. */
function deadlineOf(wk) {
  const dl = state.rules.deadline;
  if (!dl || !dl.on) return null;
  const d = addDays(fromKey(wk), -7 + (+dl.day || 0)), t = mins(dl.time || '18:00');
  d.setHours(Math.floor(t / 60), t % 60, 0, 0);
  return d;
}
const deadlineText = d => dayTitle(d.getDay()) + ' ' + ltr(dm(d)) + ' בשעה ' + ltr(pad(d.getHours()) + ':' + pad(d.getMinutes()));

/* ---------- notifications ----------
   This browser subscribes with the browser's push service; the subscription is kept in the
   database, and the sadran-remind function sends the reminders. */
const push = { state: 'unknown', busy: false };
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => REMOTE && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let swReg = null;
// The service worker exists only for notifications. It is installed when they are switched on,
// and removed when they are switched off; until then this only looks for one installed earlier.
async function swRegistration(install) {
  if (!REMOTE || !window.isSecureContext || !('serviceWorker' in navigator)) return null;
  if (!swReg) swReg = install ? await navigator.serviceWorker.register('sw.js') : (await navigator.serviceWorker.getRegistration()) || null;
  return swReg;
}
function b64uBytes(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function currentSub() {
  try { const r = await swRegistration(); return r ? await r.pushManager.getSubscription() : null; } catch (e) { return null; }
}
async function readPushState() {
  if (!pushSupported()) return isIOS && !standalone() ? 'ios' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSub();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}
function savePushSub(sub) {
  const j = sub.toJSON();
  return rpc('sadran_push_subscribe', { p_token: net.token, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
}
// Read the state again; after sign-in, also tie an existing subscription to whoever is signed in now.
async function refreshPush(resend) {
  if (!REMOTE) return;
  const st = await readPushState();
  if (st === 'on' && resend) { const sub = await currentSub(); if (sub) savePushSub(sub).catch(() => { /* tried again next sign-in */ }); }
  if (st !== push.state) { push.state = st; if (net.phase === 'ready') render(); }
}
async function dropPushSub(token) {
  const sub = await currentSub();
  if (sub) {
    try { await rpc('sadran_push_unsubscribe', { p_token: token, p_endpoint: sub.endpoint }); } catch (e) { /* the server drops it when it bounces */ }
    try { await sub.unsubscribe(); } catch (e) { /* already gone */ }
  }
  try { const reg = swReg; swReg = null; if (reg) await reg.unregister(); } catch (e) { /* it stays installed, with nothing to do */ }
}
function pushCard(who) {
  if (!REMOTE) return '';
  const st = push.state, mgr = who === 'manager';
  const text = {
    on: mgr ? 'ההתראות פועלות במכשיר הזה: כשהמועד עובר תגיע רשימה של מי שלא הגיש/ה.' : 'ההתראות פועלות במכשיר הזה. אם המועד להגשה יעבור לפני שהגשת, תגיע תזכורת.',
    off: mgr ? 'אפשר לקבל במכשיר הזה התראה עם רשימת מי שלא הגיש/ה בזמן.' : 'אפשר לקבל תזכורת בטלפון אם המועד להגשה עובר ועוד לא הגשת.',
    denied: 'ההתראות חסומות בדפדפן הזה. אפשר לאשר אותן בהגדרות האתר בדפדפן, ואז לחזור לכאן.',
    ios: 'באייפון ההתראות עובדות רק מהאתר שנוסף למסך הבית: בספארי מקישים על "שיתוף", בוחרים "הוספה למסך הבית", ופותחים את האתר משם.',
    unsupported: 'הדפדפן הזה לא תומך בהתראות. אפשר לנסות בכרום או בספארי עדכני.',
    unknown: 'בודק אם הדפדפן תומך בהתראות…',
  }[st];
  const btn = st === 'on' ? '<button type="button" class="btn" id="pushOff" data-act="pushOff"' + (push.busy ? ' disabled' : '') + '>כיבוי ההתראות</button>'
    : st === 'off' ? '<button type="button" class="btn btn-primary" id="pushOn" data-act="pushOn"' + (push.busy ? ' disabled' : '') + '>' + icon('bell') + (push.busy ? 'מפעיל…' : 'הפעלת התראות') + '</button>' : '';
  return '<div class="push-row"><span class="push-st is-' + st + '">' + icon('bell') + '</span><p class="sub">' + text + '</p>' + btn + '</div>' +
    (st === 'off' || st === 'on' ? legalNote('הפעלת ההתראות שומרת מזהה של הדפדפן הזה, כדי לשלוח אליו תזכורות.', 'lnPush') : '');
}
async function callRemind(week) {
  let res, d = null;
  try {
    res = await fetch(BACKEND.url + '/functions/v1/sadran-remind', {
      method: 'POST', headers: { apikey: BACKEND.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: net.token, week }),
    });
    d = await res.json().catch(() => null);
  } catch (e) { throw { code: 'network' }; }
  if (res.status === 401) throw { code: 'auth' };
  if (!res.ok || !d) throw { code: 'server' };
  return d;
}

/* ---------- staffing model ---------- */
function required(wk, d, shId) {
  const out = {}, k = sk(d, shId);
  if (state.closed[k]) return out;
  const base = state.req[shId] || {};
  const over = ((state.weeks[wk] || {}).over || {})[k] || {};
  for (const r of state.roles) {
    const n = over[r.id] != null ? over[r.id] : (base[r.id] || 0);
    if (n > 0) out[r.id] = n;
  }
  return out;
}
// Rebuild a week's positions from the staffing rules, keeping the people already placed.
function syncWeek(wk) {
  const w = state.weeks[wk] || (state.weeks[wk] = { slots: {}, over: {}, published: null });
  w.over = w.over || {};
  const ids = new Set(state.employees.map(e => e.id));
  const next = {};
  for (let d = 0; d < 7; d++) for (const sh of state.shifts) {
    const k = sk(d, sh.id), req = required(wk, d, sh.id), cur = w.slots[k] || [], list = [];
    for (const r of state.roles) {
      const n = req[r.id] || 0;
      const have = cur.filter(p => p.role === r.id && p.emp && ids.has(p.emp));
      for (let i = 0; i < n; i++) list.push(have[i] ? { role: r.id, emp: have[i].emp, lock: !!have[i].lock } : { role: r.id, emp: null, lock: false });
    }
    next[k] = list;
  }
  w.slots = next;
  return w;
}
function empShifts(w, empId, except) {
  const out = [];
  for (const k in w.slots) {
    const list = w.slots[k];
    for (let i = 0; i < list.length; i++) {
      if (list[i].emp !== empId) continue;
      if (except && except.k === k && except.i === i) continue;
      const u = unsk(k);
      out.push({ k, i, d: u[0], sh: u[1] });
    }
  }
  return out;
}
function span(d, shId) {
  const s = shiftById(shId);
  if (!s) return null;
  const a = mins(s.start), b = mins(s.end);
  return [d * 1440 + a, d * 1440 + (b > a ? b : b + 1440)];
}
// What stands between a shift on day d and the shifts the person already has: 'overlap' when two run
// at the same time, 'rest' when the break between them is shorter than the manager allows.
// Two shifts on the same day are normal and need no break between them; the rest rule is about
// different days (an evening, then the next morning), and about a third shift on one day.
function clash(mine, d, shId) {
  const B = span(d, shId);
  if (!B) return null;
  const today = mine.filter(m => m.d === d).length;
  let out = null;
  for (const m of mine) {
    const A = span(m.d, m.sh);
    if (!A) continue;
    const gap = Math.max(B[0] - A[1], A[0] - B[1]);
    if (gap < 0) return 'overlap';
    if (!(m.d === d && today < 2) && gap < state.rules.minRest * 60) out = 'rest';
  }
  return out;
}
// The most shifts one person can be given in a week: every shift there is.
const maxCap = () => Math.max(7, 7 * state.shifts.length);
/* ---------- availability values ----------
   A shift is 1 (can), 2 (prefers), or { v: 1|2, t: [[from, to], ...] } for part of it (up to two
   ranges). A null end of a range means the start or end of the shift, so it follows shift changes. */
const slotV = x => (x && typeof x === 'object' ? (x.v === 2 ? 2 : 1) : x === 2 ? 2 : x ? 1 : 0);
const slotT = x => (x && typeof x === 'object' && Array.isArray(x.t) && x.t.length ? x.t : null);
function slotRanges(x, sh) { const t = slotT(x); return t && sh ? t.map(r => [r[0] || sh.start, r[1] || sh.end]) : null; }
function rangesText(x, sh) { const r = slotRanges(x, sh); return r ? r.map(q => q[0] + '–' + q[1]).join(', ') : ''; }
const hmOf = m => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
// Hours for a whole day (for example 12:00–18:00) fall into the day's shifts: each open shift they
// touch gets the part inside it. Returns null when the hours are not usable.
function dayParts(d, from, to) {
  if (!from || !to) return null;
  const a = mins(from), b = mins(to);
  if (b <= a) return null;
  const out = [];
  for (const sh of state.shifts) {
    const k = sk(d, sh.id);
    if (state.closed[k]) continue;
    const s0 = mins(sh.start), e0 = mins(sh.end) > s0 ? mins(sh.end) : mins(sh.end) + 1440;
    const lo = Math.max(a, s0), hi = Math.min(b, e0);
    if (hi > lo) out.push({ sh, k, lo, hi, full: lo === s0 && hi === e0, t: [lo === s0 ? null : hmOf(lo), hi === e0 ? null : hmOf(hi)] });
  }
  return out;
}
// A role's order of priority: who is placed first in it. Once the manager sets an order, everyone
// who can fill the role is in it; someone who gets the role later joins at the end.
function rankOrder(r) {
  if (!r || !Array.isArray(r.rank) || !r.rank.length) return [];
  const holders = state.employees.filter(e => e.roles.includes(r.id));
  const ids = new Set(holders.map(e => e.id));
  const top = r.rank.filter((id, i, a) => ids.has(id) && a.indexOf(id) === i);
  return top.concat(holders.map(e => e.id).filter(id => top.indexOf(id) < 0));
}
// 0 when the role has no order; otherwise higher for someone nearer the top.
function rankWeight(roleId, empId) {
  const list = rankOrder(roleById(roleId)), i = list.indexOf(empId);
  return i < 0 ? 0 : list.length - i;
}
function hoursOf(wk, empId, k) {
  const rec = availRec(wk, empId);
  return rec ? rangesText(rec.slots[k], shiftById(unsk(k)[1])) : '';
}

// Everything that stands in the way of placing `emp` in a position. Empty list = a clean fit.
function issues(wk, d, shId, roleId, emp, self) {
  const w = state.weeks[wk], out = [], k = sk(d, shId);
  if (!emp.roles.includes(roleId)) out.push('norole');
  const av = availRec(wk, emp.id);
  if (!av || !av.submittedAt) out.push('nosubmit');
  else if (!slotV(av.slots[k])) out.push('unavail');   // marked for part of the shift counts as available; the hours are shown
  const mine = empShifts(w, emp.id, self);
  if (mine.some(m => m.k === k)) out.push('inslot');
  else { const c = clash(mine, d, shId); if (c) out.push(c); }
  if (mine.length + 1 > emp.max) out.push('max');
  return out;
}
const ISSUE_SHORT = { norole: 'לא בתפקיד', nosubmit: 'לא הוגשה זמינות', unavail: 'לא זמין/ה', rest: 'מנוחה קצרה', overlap: 'חופף למשמרת אחרת', inslot: 'כפול במשמרת' };
function issueText(z, e) {
  if (z === 'norole') return 'לא מוגדר/ת לתפקיד הזה';
  if (z === 'nosubmit') return 'טרם הגיש/ה זמינות';
  if (z === 'unavail') return 'לא זמין/ה במשמרת הזו';
  if (z === 'inslot') return 'כבר משובץ/ת במשמרת הזו';
  if (z === 'overlap') return 'חופף למשמרת אחרת שלו/ה';
  if (z === 'rest') return 'פחות מ־' + state.rules.minRest + ' שעות מנוחה ממשמרת סמוכה';
  return 'מעבר למקסימום (' + e.max + ' משמרות)';
}

// The split of a day's hours between its shifts, as a sentence.
function dayPreview(d, from, to) {
  if (!from || !to) return 'בוחרים שעת התחלה ושעת סיום.';
  const parts = dayParts(d, from, to);
  if (!parts) return 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.';
  if (!parts.length) return 'השעות האלה לא נופלות באף משמרת של היום.';
  return 'יסומן: ' + parts.map(q => esc(q.sh.name) + ' ' + ltr(hmOf(q.lo) + '–' + hmOf(q.hi)) + (q.full ? ' (כל המשמרת)' : '')).join(' · ');
}
/* ---------- automatic scheduling ----------
   Each attempt is greedy, most-constrained position first; a pick favours people who asked for
   the shift and people with the lightest load, and a short swap search then tries to close the
   leftover gaps. Several randomized attempts run and the best roster is kept. */
function autoSchedule(wk, fillOnly) {
  const w = syncWeek(wk);
  if (!fillOnly) for (const k in w.slots) for (const p of w.slots[k]) if (!p.lock) p.emp = null;
  const base = JSON.stringify(w.slots);
  const fits = (e, p) => issues(wk, p.d, p.sh, p.role, e, p).length === 0;
  const cands = p => state.employees.filter(e => fits(e, p));
  // The role's order of priority comes first: someone higher in it is placed whenever they can be.
  // Then those who asked for the shift, and the lightest load. Someone there for part of the shift
  // (12:00–18:00 across a morning and an evening shift) is placed like anyone else.
  const score = (e, p) => {
    const load = empShifts(w, e.id).length;
    const slot = state.avail[wk][e.id].slots[p.k], pref = slotV(slot) === 2 ? 2 : 0, rank = rankWeight(p.role, e.id);
    return (rank ? 100 + rank * 10 : 0) + pref + (1 - load / e.max) * 3 - (e.roles.length - 1) * 0.6 + Math.random() * 0.8;
  };
  const pick = (p, list) => list.map(e => [score(e, p), e]).sort((a, b) => b[0] - a[0])[0][1];
  const put = (p, id) => { w.slots[p.k][p.i].emp = id; };
  const id = p => p.k + '#' + p.i;
  function tryFill(p, depth, chain) {
    const c = cands(p);
    if (c.length) { put(p, pick(p, c).id); return true; }
    if (depth <= 0) return false;
    chain.add(id(p));
    for (const e of state.employees) {
      const is = issues(wk, p.d, p.sh, p.role, e, p);
      if (!is.length || is.some(z => z !== 'max' && z !== 'rest' && z !== 'overlap')) continue;
      for (const q of empShifts(w, e.id)) {
        const qp = w.slots[q.k][q.i];
        if (qp.lock || chain.has(id(q))) continue;
        qp.emp = null;
        if (fits(e, p)) {
          put(p, e.id);
          if (tryFill({ k: q.k, i: q.i, d: q.d, sh: q.sh, role: qp.role }, depth - 1, chain)) { chain.delete(id(p)); return true; }
          put(p, null);
        }
        qp.emp = e.id;
      }
    }
    chain.delete(id(p));
    return false;
  }
  function attempt() {
    const open = [], unfilled = [];
    for (const k in w.slots) w.slots[k].forEach((p, i) => { if (!p.emp) { const u = unsk(k); open.push({ k, i, d: u[0], sh: u[1], role: p.role }); } });
    while (open.length) {
      let bi = 0, bc = null;
      for (let i = 0; i < open.length; i++) {
        const c = cands(open[i]);
        if (!bc || c.length < bc.length || (c.length === bc.length && Math.random() < 0.25)) { bi = i; bc = c; }
        if (!c.length) break;
      }
      const p = open.splice(bi, 1)[0];
      if (bc.length) put(p, pick(p, bc).id); else unfilled.push(p);
    }
    if (!fillOnly) for (const p of unfilled) tryFill(p, 2, new Set());
  }
  // Coverage first, then the roles' order of priority, then granted preferences, then an even spread of the load.
  function quality() {
    let filled = 0, prefs = 0, ranked = 0;
    const load = {};
    for (const k in w.slots) for (const p of w.slots[k]) {
      if (!p.emp) continue;
      filled++;
      load[p.emp] = (load[p.emp] || 0) + 1;
      const av = availRec(wk, p.emp), rank = rankWeight(p.role, p.emp);
      if (av && slotV(av.slots[k]) === 2) prefs++;
      if (rank) ranked += 30 + rank * 5;
    }
    let spread = 0;
    for (const e of state.employees) spread += Math.pow((load[e.id] || 0) / e.max, 2);
    return filled * 1000 + ranked + prefs * 2 - spread * 10;
  }
  let best = base, bestQ = -Infinity;
  for (let t = 0; t < (fillOnly ? 8 : 20); t++) {
    w.slots = JSON.parse(base);
    attempt();
    const q = quality();
    if (q > bestQ) { bestQ = q; best = JSON.stringify(w.slots); }
  }
  w.slots = JSON.parse(best);
}

function weekStats(wk, slots) {
  let total = 0, filled = 0, warns = 0;
  const count = {};
  for (const k in slots) {
    const u = unsk(k);
    slots[k].forEach((p, i) => {
      total++;
      if (!p.emp) return;
      filled++;
      count[p.emp] = (count[p.emp] || 0) + 1;
      const e = empById(p.emp);
      if (e && issues(wk, u[0], u[1], p.role, e, { k, i }).some(z => z !== 'max')) warns++;
    });
  }
  for (const e of state.employees) if ((count[e.id] || 0) > e.max) warns++;
  return { total, filled, missing: total - filled, warns, count };
}
const sig = slots => JSON.stringify(Object.keys(slots).sort().map(k => [k, slots[k].map(p => [p.role, p.emp])]));

/* ---------- shared pieces ---------- */
function roleChip(id) {
  const r = roleById(id);
  return r ? '<span class="role hl-' + r.color + '" data-rn="' + r.id + '">' + esc(r.name || 'ללא שם') + '</span>' : '<span class="role">תפקיד שנמחק</span>';
}
const shiftTime = sh => '<bdi class="t shift-t" dir="ltr" data-st="' + sh.id + '">' + esc(sh.start + '–' + sh.end) + '</bdi>';
function weekNav() {
  return '<div class="weeknav">' +
    '<button type="button" class="btn btn-icon btn-quiet" id="wkPrev" data-act="week" data-dir="-1" aria-label="שבוע קודם">' + icon('right') + '</button>' +
    '<button type="button" class="weeknav-l" id="wkHome" data-act="weekHome" title="חזרה לשבוע הבא"><span class="weeknav-k">' + relWeek(ui.week) + '</span><bdi class="t weeknav-d" dir="ltr">' + weekLabel(ui.week) + '</bdi></button>' +
    '<button type="button" class="btn btn-icon btn-quiet" id="wkNext" data-act="week" data-dir="1" aria-label="שבוע הבא">' + icon('left') + '</button>' +
    '</div>';
}
// `what` names the number for screen readers, e.g. "קופאי/ת במשמרת בוקר". The buttons also say the
// value now, so it is heard again after each press.
function stepper(id, val, act, attrs, min, max, what) {
  const w = esc(what);
  return '<span class="stepper" role="group" aria-label="' + w + '">' +
    '<button type="button" id="' + id + '-m" data-act="' + act + '" data-d="-1" ' + attrs + (val <= min ? ' disabled' : '') + ' aria-label="פחות, ' + w + ' (' + val + ')">−</button>' +
    '<output id="' + id + '-o">' + val + '</output>' +
    '<button type="button" id="' + id + '-p" data-act="' + act + '" data-d="1" ' + attrs + (val >= max ? ' disabled' : '') + ' aria-label="יותר, ' + w + ' (' + val + ')">+</button></span>';
}
function confirmBtn(key, label, act, attrs, cls) {
  if (ui.confirm === key) {
    return '<span class="confirm"><button type="button" class="btn btn-danger-solid" id="cf-' + key + '" data-act="' + act + '" ' + attrs + '>כן, למחוק</button>' +
      '<button type="button" class="btn" data-act="confirmNo">ביטול</button></span>';
  }
  return '<button type="button" class="' + cls + '" id="cf-' + key + '" data-act="confirmAsk" data-key="' + key + '">' + label + '</button>';
}

// The roster for one week. `opt.edit` makes positions tappable; `opt.me` highlights one person.
function weekGrid(wk, slots, opt) {
  const start = fromKey(wk), todayKey = toKey(new Date());
  let n = 0, strip = '', days = '';
  for (let d = 0; d < 7; d++) {
    const date = addDays(start, d);
    let total = 0, miss = 0;
    const cards = state.shifts.map(sh => {
      const k = sk(d, sh.id), list = slots[k] || [];
      const closed = !!state.closed[k];
      if (!list.length && (closed || !opt.edit)) {
        return '<div class="shift is-closed"><span class="shift-n" data-sn="' + sh.id + '">' + esc(sh.name) + '</span><span>' + (closed ? 'סגור' : 'ללא עמדות') + '</span></div>';
      }
      const empty = list.filter(p => !p.emp).length;
      total += list.length; miss += empty;
      const rows = list.map((p, i) => {
        const e = p.emp ? empById(p.emp) : null;
        let cls = 'pos', who, x = '';
        if (!p.emp) {
          cls += ' is-empty';
          who = '<span class="pos-n">חסר שיבוץ</span>';
          if (opt.edit) x = icon('plus');
        } else {
          const is = opt.edit && e ? issues(wk, d, sh.id, p.role, e, { k, i }).filter(z => z !== 'max') : [];
          const hrs = e ? hoursOf(wk, p.emp, k) : '';
          if (opt.me && p.emp === opt.me) cls += ' is-me';
          who = '<span class="pos-n">' + esc(e ? e.name : 'עובד/ת שנמחק/ה') + '</span>' +
            (hrs ? '<span class="pos-h"><span class="vh">בשעות </span>' + ltr(hrs) + '</span>' : '') +
            (is.length ? '<span class="pos-w">' + icon('alert') + is.map(z => ISSUE_SHORT[z]).join(' · ') + '</span>' : '');
          if (opt.edit && p.lock) x = icon('lock');
        }
        const inner = roleChip(p.role) + '<span class="pos-who">' + who + '</span><span class="pos-x">' + x + '</span>';
        return opt.edit
          ? '<button type="button" class="' + cls + '" id="pos-' + k + '-' + i + '" data-act="pos" data-k="' + k + '" data-i="' + i + '" style="--i:' + (n++) + '">' + inner + '</button>'
          : '<div class="' + cls + '">' + inner + '</div>';
      }).join('');
      return '<div class="shift">' +
        '<div class="shift-h"><span class="shift-n" data-sn="' + sh.id + '">' + esc(sh.name) + '</span>' + shiftTime(sh) +
        '<span class="shift-c t' + (empty ? ' is-miss' : '') + '">' + (list.length - empty) + '/' + list.length + '</span></div>' +
        rows +
        (opt.edit ? '<button type="button" class="add-pos" id="add-' + k + '" data-act="addpos" data-k="' + k + '">+ עמדה</button>' : '') +
        '</div>';
    }).join('');
    const state3 = !total ? 'off' : miss ? 'miss' : 'ok';
    const label = !total ? 'סגור' : miss ? many(miss, 'חסרה אחת', 'חסרות') : 'מלא';
    days += '<section class="day is-' + state3 + (toKey(date) === todayKey ? ' is-today' : '') + '" id="day-' + d + '">' +
      '<div class="day-h"><h2 class="day-n">' + DAYS[d] + '</h2><span class="day-d t">' + dm(date) + '</span><span class="day-s is-' + state3 + '">' + label + '</span></div>' +
      cards + '</section>';
    strip += '<button type="button" class="dchip is-' + state3 + '" data-act="jump" data-d="' + d + '">' + DAY_SHORT[d] + '<small class="t">' + date.getDate() + '</small><span class="vh">, ' + dayTitle(d) + ', ' + label + '</span><i></i></button>';
  }
  return (opt.strip ? '<nav class="daystrip" aria-label="קפיצה ליום">' + strip + '</nav>' : '') +
    '<div class="week' + (opt.fresh ? ' is-fresh' : '') + '" style="--rows:' + (state.shifts.length + 1) + '">' + days + '</div>';
}

function availEditor(wk, empId) {
  const rec = availRec(wk, empId) || { slots: {}, note: '', submittedAt: null };
  const start = fromKey(wk);
  const prev = availRec(toKey(addDays(start, -7)), empId);
  let grid = '<span></span>' + state.shifts.map(sh => '<span class="av-hd"><span data-sn="' + sh.id + '">' + esc(sh.name) + '</span><bdi class="t" dir="ltr" data-st="' + sh.id + '">' + esc(sh.start + '–' + sh.end) + '</bdi></span>').join('');
  for (let d = 0; d < 7; d++) {
    const open = state.shifts.some(sh => !state.closed[sk(d, sh.id)]);
    grid += '<span class="av-day"><strong>' + DAYS[d] + '</strong>' + ltr(dm(addDays(start, d))) +
      (open ? '<button type="button" class="av-dayt" id="avd-' + empId + '-' + d + '" data-act="avDay" data-emp="' + empId + '" data-d="' + d + '" aria-label="שעות ב' + dayTitle(d) + '">' + icon('clock') + 'שעות</button>' : '') + '</span>';
    for (const sh of state.shifts) {
      const k = sk(d, sh.id);
      if (state.closed[k]) { grid += '<span class="av-cell is-closed">סגור</span>'; continue; }
      const x = rec.slots[k], v = slotV(x), part = slotRanges(x, sh), hours = part ? part.map(q => q[0] + '–' + q[1]).join(', ') : '';
      grid += '<span class="av-wrap" data-v="' + v + '">' +
        '<button type="button" class="av-cell' + (part ? ' is-part' : '') + '" id="av-' + empId + '-' + k + '" data-v="' + v + '" data-act="av" data-emp="' + empId + '" data-k="' + k + '" aria-label="' + dayTitle(d) + ' ' + esc(sh.name) + ': ' + ['לא אפשרי', 'אפשר', 'מועדף'][v] + (hours ? ', בשעות ' + esc(hours) : '') + '">' +
        '<span class="av-l">' + (v === 2 ? icon('star') + 'מועדף' : v === 1 ? icon('check') + 'אפשר' : '—') + '</span>' +
        (part ? part.map(q => '<span class="av-h">' + esc(q[0] + '–' + q[1]) + '</span>').join('') : '') + '</button>' +
        '<button type="button" class="av-time" id="avt-' + empId + '-' + k + '" data-act="avTime" data-emp="' + empId + '" data-k="' + k + '" title="שעות מסוימות" aria-label="שעות מסוימות ב' + dayTitle(d) + ', ' + esc(sh.name) + '">' + icon('clock') + '</button></span>';
    }
  }
  const quick = state.shifts.map(sh => '<button type="button" class="chipbtn" data-act="avFill" data-emp="' + empId + '" data-sh="' + sh.id + '">כל משמרות ה' + esc(sh.name) + '</button>').join('') +
    (prev && Object.keys(prev.slots).length ? '<button type="button" class="chipbtn" data-act="avPrev" data-emp="' + empId + '">כמו בשבוע שעבר</button>' : '') +
    '<button type="button" class="chipbtn" data-act="avClear" data-emp="' + empId + '">ניקוי</button>';
  return '<div class="quick"><span class="sub">סימון מהיר</span>' + quick + '</div>' +
    '<div class="av" style="--n:' + state.shifts.length + '">' + grid + '</div>' +
    '<div class="field"><label class="label" for="note-' + empId + '">הערה למנהל/ת</label>' +
    '<textarea class="input" id="note-' + empId + '" data-bind="note" data-id="' + empId + '" aria-describedby="noteHelp-' + empId + '" placeholder="למשל: ביום שלישי יש לי מבחן, אפשר רק עד 13:00">' + esc(rec.note) + '</textarea>' +
    '<p class="sub legal-note" id="noteHelp-' + empId + '">ההערה מוצגת למנהל/ת. לא לכתוב בה מידע רגיש, כמו מידע רפואי.' + (legalPage('privacy') ? ' <a href="#privacy" id="lnNote-' + empId + '">מדיניות הפרטיות</a>' : '') + '</p></div>';
}

/* ---------- manager views ---------- */
function viewSchedule() {
  const wk = ui.week, w = state.weeks[wk];
  const st = weekStats(wk, w.slots);
  const pub = w.published, dirty = pub && sig(pub.slots) !== sig(w.slots);
  const status = !pub ? '<span class="chip">טיוטה, עוד לא פורסם</span>'
    : dirty ? '<span class="chip chip-warn">' + icon('alert') + 'פורסם, ויש שינויים שלא פורסמו</span>'
    : '<span class="chip chip-ok">' + icon('check') + '<span>פורסם ' + stamp(pub.at) + '</span></span>';
  const pct = st.total ? Math.round(st.filled / st.total * 100) : 0;
  const note = state.prefs.demoNote
    ? '<p class="banner">' + icon('star') + '<span>זהו אב־טיפוס עם נתוני דוגמה: העובדים, התפקידים והזמינות מומצאים. אפשר לערוך הכול, ולאפס בלשונית ההגדרות.</span>' +
      '<button type="button" class="banner-x" data-act="dismissDemo" aria-label="סגירת ההודעה">' + icon('x') + '</button></p>'
    : '';
  const load = state.employees.map(e => {
    const c = st.count[e.id] || 0, sub = isSubmitted(wk, e.id);
    return '<div class="load-i' + (c > e.max ? ' is-over' : '') + (sub ? '' : ' is-ns') + '"><span class="load-n">' + esc(e.name) + (sub ? '' : ' · טרם הגיש/ה') + '</span>' +
      '<span class="load-c t">' + c + '/' + e.max + '</span><span class="load-bar"><i style="width:' + Math.min(100, c / e.max * 100) + '%"></i></span></div>';
  }).join('');
  const wide = window.matchMedia('(min-width: 1000px)').matches;
  const loadOpen = ui.open.load != null ? ui.open.load : wide;
  return '<h1 class="vh">סידור העבודה לשבוע</h1>' + note +
    '<section class="wk-head">' + weekNav() +
    '<div class="wk-actions">' +
    '<button type="button" class="btn btn-primary" id="btnAuto" data-act="auto">' + icon('wand') + 'שיבוץ אוטומטי</button>' +
    '<button type="button" class="btn" id="btnPublish" data-act="publish"' + (pub && !dirty ? ' disabled' : '') + '>' + icon('send') + (pub ? (dirty ? 'פרסום עדכון' : 'פורסם') : 'פרסום') + '</button>' +
    '<button type="button" class="btn btn-icon" id="btnMore" data-act="more" aria-label="פעולות נוספות">' + icon('more') + '</button>' +
    '</div></section>' +
    '<section class="card sum" aria-label="מצב הסידור">' +
    '<div class="sum-top"><div class="sum-num"><span class="num t">' + st.filled + '/' + st.total + '</span><span class="sub">עמדות מאוישות</span></div>' +
    '<div class="meter" role="img" aria-label="' + pct + '% מהעמדות מאוישות"><i style="width:' + pct + '%"></i></div></div>' +
    '<div class="chips">' +
    (st.missing ? '<span class="chip chip-bad">' + many(st.missing, 'עמדה אחת חסרה', 'עמדות חסרות') + '</span>' : (st.total ? '<span class="chip chip-ok">' + icon('check') + 'כל העמדות מאוישות</span>' : '')) +
    (st.warns ? '<span class="chip chip-warn">' + icon('alert') + many(st.warns, 'אזהרה אחת', 'אזהרות') + '</span>' : '') +
    status + '</div>' +
    '<details class="fold" data-fold="load"' + (loadOpen ? ' open' : '') + '><summary>עומס לפי עובד/ת (משמרות מתוך המקסימום)</summary><div class="load-grid">' + load + '</div></details>' +
    '</section>' +
    weekGrid(wk, w.slots, { edit: true, strip: true, fresh: ui.fresh });
}

function coverageRisks(wk) {
  const out = [];
  for (let d = 0; d < 7; d++) for (const sh of state.shifts) {
    const k = sk(d, sh.id), req = required(wk, d, sh.id);
    for (const roleId in req) {
      const have = state.employees.filter(e => e.roles.includes(roleId) && isSubmitted(wk, e.id) && slotV(availRec(wk, e.id).slots[k])).length;
      if (have < req[roleId]) out.push({ d, sh, roleId, have, need: req[roleId] });
    }
  }
  return out;
}
function viewAvailability() {
  const wk = ui.week, start = fromKey(wk), emps = state.employees;
  const pending = emps.filter(e => !isSubmitted(wk, e.id));
  const days = [0, 1, 2, 3, 4, 5, 6];
  const sq = (cls, text, inner) => '<i class="' + cls + '" role="img" aria-label="' + text + '" title="' + text + '">' + (inner || '') + '</i>';
  const head = '<tr><th class="mx-name" scope="col"><span class="vh">עובד/ת</span></th>' + days.map(d => '<th scope="col"><span aria-hidden="true">' + DAY_SHORT[d] + '</span><span class="vh">' + dayTitle(d) + '</span><small class="t">' + addDays(start, d).getDate() + '</small></th>').join('') + '</tr>' +
    '<tr aria-hidden="true"><td class="mx-name"></td>' + days.map(() => '<td><span class="cells">' + state.shifts.map(sh => '<i class="cl">' + esc((sh.name || '').slice(0, 1)) + '</i>').join('') + '</span></td>').join('') + '</tr>';
  const rows = emps.map(e => {
    const rec = availRec(wk, e.id), sub = rec && rec.submittedAt;
    return '<tr class="' + (sub ? '' : 'is-ns') + '"><th class="mx-name" scope="row"><button type="button" class="mx-btn" id="mx-' + e.id + '" data-act="editAvail" data-emp="' + e.id + '">' + esc(e.name) + (sub ? '' : '<span class="vh">, טרם הגיש/ה</span>') + '</button></th>' +
      days.map(d => '<td><span class="cells">' + state.shifts.map(sh => {
        const k = sk(d, sh.id), name = esc(sh.name || '');
        if (state.closed[k]) return sq('c cx', name + ': סגור');
        if (!sub) return sq('c cq', name + ': טרם הוגש');
        const x = rec.slots[k], v = slotV(x), part = slotT(x);
        return sq('c c' + v + (part ? ' cp' : ''), name + ': ' + (part ? 'חלק מהמשמרת, ' + esc(rangesText(x, sh)) : ['לא', 'אפשר', 'מועדף'][v]));
      }).join('') + '</span></td>').join('') + '</tr>';
  }).join('');
  const foot = '<tr><th class="mx-name" scope="row">זמינים</th>' + days.map(d => '<td><span class="cells">' + state.shifts.map(sh => {
    const k = sk(d, sh.id), req = required(wk, d, sh.id), name = esc(sh.name || '');
    const need = Object.values(req).reduce((a, b) => a + b, 0);
    if (!need) return sq('cn is-off', name + ': אין עמדות', '·');
    const have = emps.filter(e => isSubmitted(wk, e.id) && slotV(availRec(wk, e.id).slots[k])).length;
    return sq('cn' + (have < need ? ' is-bad' : ''), name + ': ' + have + ' זמינים, ' + need + ' נדרשים', have);
  }).join('') + '</span></td>').join('') + '</tr>';
  const risks = coverageRisks(wk);
  const order = state.shifts.map(sh => esc(sh.name)).join(', ');
  return '<h1 class="vh">זמינות הצוות לשבוע</h1><section class="wk-head">' + weekNav() + '</section>' +
    '<section class="card stack">' +
    '<div class="sum-top"><div class="sum-num"><span class="num t">' + (emps.length - pending.length) + '/' + emps.length + '</span><span class="sub">עובדים הגישו זמינות</span></div>' +
    (pending.length ? '<div class="acts">' + (REMOTE ? '<button type="button" class="btn btn-primary" id="btnRemindNow" data-act="remindNow"' + (net.busy ? ' disabled' : '') + '>' + icon('bell') + 'שליחת התראה</button>' : '') +
      '<button type="button" class="btn" id="btnRemind" data-act="remind">' + icon('copy') + 'הודעת תזכורת</button></div>' : '') + '</div>' +
    (deadlineOf(wk) ? '<p class="sub">מועד אחרון להגשה: ' + deadlineText(deadlineOf(wk)) + (Date.now() > deadlineOf(wk).getTime() ? ' (עבר)' : '') + '</p>' : '') +
    (pending.length ? '<p class="banner banner-warn">' + icon('alert') + '<span>טרם הגישו: ' + pending.map(e => esc(e.name)).join(', ') + '. אפשר להקיש על שם בטבלה ולמלא בשמם.</span></p>'
      : (emps.length ? '<p class="banner banner-ok">' + icon('check') + '<span>כל הצוות הגיש זמינות לשבוע הזה.</span></p>' : '')) +
    '</section>' +
    '<section class="card stack"><div><h2 class="h2">מי זמין מתי</h2><p class="sub">בכל יום, מימין לשמאל: ' + order + '. הקשה על שם פותחת את הזמינות לעריכה.</p></div>' +
    '<div class="legend" aria-hidden="true"><span><i class="c c1"></i>אפשר</span><span><i class="c c2"></i>מועדף</span><span><i class="c c1 cp"></i>חלק מהמשמרת</span><span><i class="c c0"></i>לא</span><span><i class="c cq"></i>טרם הוגש</span><span><i class="c cx"></i>סגור</span></div>' +
    (emps.length ? '<div class="scroll-x"><table class="mx"><caption class="vh">זמינות הצוות לפי יום ומשמרת</caption><thead>' + head + '</thead><tbody>' + rows + '</tbody><tfoot>' + foot + '</tfoot></table></div>' : '<p class="sub">עוד אין עובדים. מוסיפים אותם בלשונית הצוות.</p>') +
    '</section>' +
    '<section class="card stack"><div><h2 class="h2">איפה צפוי מחסור</h2><p class="sub">משמרות שבהן מספר הזמינים לתפקיד קטן מהנדרש, עוד לפני השיבוץ.</p></div>' +
    (risks.length
      ? '<ul class="risk">' + risks.map(r => '<li><b>' + DAYS[r.d] + ' ' + esc(r.sh.name) + '</b>' + roleChip(r.roleId) + '<em>' + (r.have ? r.have + ' זמינים' : 'אין זמינים') + ' מתוך ' + r.need + ' נדרשים</em></li>').join('') + '</ul>'
      : '<p class="banner banner-ok">' + icon('check') + '<span>לכל תפקיד בכל משמרת יש מספיק זמינים.</span></p>') +
    '</section>';
}

function viewTeam() {
  const wk = ui.week, n = state.employees.length;
  return '<section class="pagehead"><div><h1 class="h1">הצוות</h1><p class="sub">' + many(n, 'עובד/ת אחד/ת', 'עובדים') + ' · מצב הזמינות לשבוע ' + ltr(weekLabel(wk)) + '</p></div>' +
    '<button type="button" class="btn btn-primary" id="btnAddEmp" data-act="emp">' + icon('plus') + 'עובד/ת</button></section>' +
    '<section class="acts"><button type="button" class="btn" id="btnImport" data-act="importPick">' + icon('up') + 'ייבוא מאקסל</button>' +
    (n ? '<button type="button" class="btn" id="btnExport" data-act="exportXlsx">' + icon('down') + 'ייצוא לאקסל</button>' : '') + '</section>' +
    (n ? '<section class="list">' + state.employees.map(e =>
      '<button type="button" class="item" id="emp-' + e.id + '" data-act="emp" data-id="' + e.id + '"><span class="item-main"><span class="item-n">' + esc(e.name) + '</span>' +
      '<span class="item-roles">' + (e.roles.map(roleChip).join('') || '<span class="tag tag-warn">בלי תפקיד, לא ישובץ/תשובץ אוטומטית</span>') + '</span></span>' +
      '<span class="item-meta"><span>עד ' + e.max + ' משמרות</span>' + (isSubmitted(wk, e.id) ? '<span class="tag tag-ok">הוגשה זמינות</span>' : '<span class="tag tag-warn">טרם הוגשה</span>') + '</span>' +
      icon('left') + '</button>').join('') + '</section>'
      : '<section class="card empty"><h2 class="h2">עוד אין עובדים</h2><p class="sub">מוסיפים עובד/ת עם שם ומספר אישי, או מייבאים את כל הרשימה מקובץ אקסל.</p></section>');
}

// Under each role in the settings: its order of priority, and the button that sets it.
function rankLine(r) {
  const order = rankOrder(r), n = order.length;
  const text = n ? 'עדיפות: ' + order.slice(0, 3).map((id, i) => (i + 1) + '. ' + esc(empById(id).name)).join(' · ') + (n > 3 ? ' ועוד ' + (n - 3) : '') : 'ללא סדר עדיפות';
  return '<div class="rank-row"><span class="sub rank-sum" id="rks-' + r.id + '">' + text + '</span>' +
    '<button type="button" class="btn btn-quiet rank-btn" id="rkb-' + r.id + '" data-act="rankOpen" data-id="' + r.id + '" aria-describedby="rks-' + r.id + '" aria-label="סדר עדיפות בתפקיד ' + esc(r.name || 'ללא שם') + '">' + icon('up') + 'סדר עדיפות</button></div>';
}
function viewSetup() {
  const roles = state.roles.map(r =>
    '<div class="set-row"><button type="button" class="swatch hl-' + r.color + '" id="sw-' + r.id + '" data-act="roleColor" data-id="' + r.id + '" aria-label="צבע התפקיד: ' + (HL_NAMES[r.color - 1] || '') + '. הקשה לבחירת צבע אחר"></button>' +
    '<input class="input" id="role-' + r.id + '" data-bind="role.name" data-id="' + r.id + '" value="' + esc(r.name) + '" aria-label="שם התפקיד" autocomplete="off">' +
    (state.roles.length > 1 ? confirmBtn('role-' + r.id, icon('trash'), 'roleDel', 'data-id="' + r.id + '"', 'btn btn-icon btn-quiet btn-danger" aria-label="מחיקת התפקיד') : '') + '</div>' +
    rankLine(r)).join('');
  const shifts = state.shifts.map(sh => {
    const total = state.roles.reduce((a, r) => a + ((state.req[sh.id] || {})[r.id] || 0), 0);
    return '<div class="setcard">' +
      '<div class="set-row"><input class="input" id="shn-' + sh.id + '" data-bind="shift.name" data-id="' + sh.id + '" value="' + esc(sh.name) + '" aria-label="שם המשמרת" autocomplete="off">' +
      (state.shifts.length > 1 ? confirmBtn('shift-' + sh.id, icon('trash'), 'shiftDel', 'data-id="' + sh.id + '"', 'btn btn-icon btn-quiet btn-danger" aria-label="מחיקת המשמרת') : '') + '</div>' +
      '<div class="set-times"><div class="field"><label class="label" for="shs-' + sh.id + '">משעה</label><input type="time" class="input" id="shs-' + sh.id + '" data-bind="shift.start" data-id="' + sh.id + '" value="' + esc(sh.start) + '"></div>' +
      '<div class="field"><label class="label" for="she-' + sh.id + '">עד שעה</label><input type="time" class="input" id="she-' + sh.id + '" data-bind="shift.end" data-id="' + sh.id + '" value="' + esc(sh.end) + '"></div></div>' +
      '<div class="set-sub">עמדות נדרשות במשמרת (' + total + ')</div>' +
      state.roles.map(r => '<div class="set-req"><span>' + roleChip(r.id) + '</span>' + stepper('rq-' + sh.id + '-' + r.id, (state.req[sh.id] || {})[r.id] || 0, 'req', 'data-sh="' + sh.id + '" data-role="' + r.id + '"', 0, 9, (r.name || 'ללא שם') + ' במשמרת ' + (sh.name || '')) + '</div>').join('') +
      '<div class="set-sub">ימים פעילים</div>' +
      '<div class="daytog">' + DAY_SHORT.map((n, d) => '<button type="button" class="daybtn" id="dt-' + sh.id + '-' + d + '" data-act="dayToggle" data-k="' + sk(d, sh.id) + '" aria-pressed="' + !state.closed[sk(d, sh.id)] + '">' + n + '<span class="vh"> (' + dayTitle(d) + ')</span></button>').join('') + '</div>' +
      '</div>';
  }).join('');
  return '<section class="pagehead"><div><h1 class="h1">הגדרות</h1><p class="sub">התפקידים, המשמרות והכללים שלפיהם נבנה הסידור.</p></div></section>' +
    '<section class="card stack"><h2 class="h2">החנות</h2>' +
    '<form class="code-row" id="storeForm" data-form="storeRename" novalidate><div class="field"><label class="label" for="storeInput">שם החנות או הסניף</label>' +
    '<input class="input" id="storeInput" data-bind="store.draft" value="' + esc(ui.storeDraft != null ? ui.storeDraft : state.store.name) + '" autocomplete="off" maxlength="60"' + fieldErr(ui.storeErr, 'storeErr', 'storeHelp') + '></div>' +
    '<button type="submit" class="btn" id="btnStoreName"' + (net.busy ? ' disabled' : '') + '>שמירת השם</button></form>' +
    (ui.storeErr ? '<p class="err" role="alert" id="storeErr">' + ui.storeErr + '</p>' : '<p class="sub" id="storeHelp">בשם הזה בוחרים את החנות במסך הכניסה, ולכן אין שתי חנויות עם אותו שם.</p>') +
    (REMOTE && shop.id ? '<div class="field"><label class="label" for="storeLink">קישור לכניסת העובדים</label><div class="code-row"><div class="field">' +
      '<input class="input" id="storeLink" readonly dir="ltr" value="' + esc(storeLink()) + '" aria-describedby="storeLinkHelp"></div>' +
      '<button type="button" class="btn" id="btnCopyLink" data-act="copyLink">' + icon('copy') + 'העתקה</button></div>' +
      '<p class="sub" id="storeLinkHelp">הקישור נפתח ישר במסך הכניסה של החנות הזו. אפשר לשלוח אותו לצוות.</p></div>' : '') +
    '<div class="field"><span class="label">לוגו</span><div class="logo-row"><span class="logo-box">' + (state.logo ? '<img src="' + esc(state.logo) + '" alt="הלוגו של החנות">' : 'אין לוגו') + '</span>' +
    '<button type="button" class="btn" id="btnLogo" data-act="logoPick"' + (ui.logoBusy ? ' disabled' : '') + '>' + icon('image') + (ui.logoBusy ? 'שומר…' : state.logo ? 'החלפת הלוגו' : 'העלאת לוגו') + '</button>' +
    (state.logo ? '<button type="button" class="btn btn-quiet btn-danger" id="btnLogoDel" data-act="logoDel"' + (ui.logoBusy ? ' disabled' : '') + '>הסרה</button>' : '') + '</div>' +
    '<p class="sub">PNG, JPEG, WebP או SVG. הלוגו מופיע בראש האתר, במסך הכניסה ובקבצים שמייצאים מהסידור.</p></div></section>' +
    themeCard() + exportCard() + deadlineCard() + legalCard() +
    (REMOTE
      ? '<section class="card stack"><div><h2 class="h2">כניסה למערכת</h2><p class="sub">עובדים נכנסים עם השם והמספר האישי שלהם, שמנוהלים בלשונית הצוות. מנהל/ת נכנס/ת עם קוד המנהל/ת. החלפת הקוד מנתקת מכשירים אחרים שנכנסו כמנהל/ת.</p></div>' +
        '<form class="code-row" data-form="codeSave" novalidate><div class="field"><label class="label" for="mgrCode">קוד מנהל/ת חדש (6 עד 12 ספרות)</label>' +
        '<input class="input" id="mgrCode" data-bind="code.draft" value="' + esc(ui.codeDraft || '') + '" inputmode="numeric" autocomplete="off"' + fieldErr(ui.codeErr, 'codeErr') + '></div>' +
        '<button type="submit" class="btn" id="btnCodeSave"' + (net.busy ? ' disabled' : '') + '>החלפת הקוד</button></form>'
      : '<section class="card stack"><div><h2 class="h2">כניסה למערכת</h2><p class="sub">עובדים נכנסים עם השם והמספר האישי שלהם, שמנוהלים בלשונית הצוות. מנהל/ת נכנס/ת עם הקוד הזה.</p></div>' +
        '<form class="code-row" data-form="codeSave" novalidate><div class="field"><label class="label" for="mgrCode">קוד מנהל/ת (4 עד 12 ספרות)</label>' +
        '<input class="input" id="mgrCode" data-bind="code.draft" value="' + esc(ui.codeDraft != null ? ui.codeDraft : state.managerCode) + '" inputmode="numeric" autocomplete="off"' + fieldErr(ui.codeErr, 'codeErr') + '></div>' +
        '<button type="submit" class="btn" id="btnCodeSave">שמירת הקוד</button></form>') +
    (ui.codeErr ? '<p class="err" role="alert" id="codeErr">' + ui.codeErr + '</p>' : '') + '</section>' +
    '<section class="card stack"><div><h2 class="h2">תפקידים</h2><p class="sub">למשל קופאי/ת, אחראי/ת משמרת, או אחריות על משימה מסוימת. הקשה על הצבע פותחת ' + COLORS + ' צבעים לבחירה.</p></div>' + roles +
    '<div><button type="button" class="btn" id="btnAddRole" data-act="roleAdd">' + icon('plus') + 'תפקיד</button></div></section>' +
    '<section class="card stack"><div><h2 class="h2">משמרות ותקן איוש</h2><p class="sub">לכל משמרת: שעות, כמה עובדים נדרשים מכל תפקיד, ובאילו ימים היא פעילה.</p></div>' +
    '<div class="set-grid">' + shifts + '</div>' +
    '<div><button type="button" class="btn" id="btnAddShift" data-act="shiftAdd">' + icon('plus') + 'משמרת</button></div></section>' +
    '<section class="card stack"><h2 class="h2">כללי שיבוץ</h2>' +
    '<div class="set-line"><div><strong>מנוחה מינימלית בין משמרות</strong><p class="sub">בשעות, בין משמרת ביום אחד למשמרת ביום אחר. החוק דורש 8 לפחות; ערך גבוה יותר מונע למשל בוקר מיד אחרי ערב. שתי משמרות באותו יום הן דבר רגיל ואינן מוגבלות בכלל הזה; כדאי לוודא שסך שעות העבודה ביום עומד בדרישות החוק.</p></div>' +
    stepper('rest', state.rules.minRest, 'rest', '', 0, 16, 'שעות מנוחה בין משמרות') + '</div>' +
    '<p class="sub">השיבוץ האוטומטי משבץ רק מי שהגיש/ה זמינות, מוגדר/ת לתפקיד ולא עבר/ה את מקסימום המשמרות. הוא נותן עדיפות למשמרות מועדפות ומשתדל לחלק את העומס באופן שווה. שיבוץ שנעשה ידנית ננעל ולא משתנה. מי שסימן/ה שעות מסוימות בתוך משמרת יכול/ה להשתבץ בה, והשעות מופיעות ליד השם; מי שזמין/ה לכל המשמרת מקבל/ת עדיפות.</p></section>' +
    (REMOTE
      ? '<section class="card stack"><h2 class="h2">שמירת הנתונים</h2>' +
        '<p class="sub">כל שינוי נשמר אוטומטית במסד הנתונים של החנות ומגיע לשאר המכשירים תוך כחצי דקה. עובדים רואים רק את הזמינות שלהם, את שמות הצוות ואת הסידורים שפורסמו.</p></section>'
      : backupCard() + '<section class="card stack"><h2 class="h2">על האב־טיפוס</h2>' +
        '<p class="sub">הנתונים נשמרים בדפדפן של המכשיר הזה בלבד, והכניסה בשם ובמספר היא הדמיה שלא מגינה עליהם. בגרסה שמחוברת למסד הנתונים כל עובד/ת מגיש/ה זמינות מהטלפון האישי והמנהל/ת רואה הכול במקום אחד.</p>' +
        (state.example ? '<div>' + resetBtn() + '</div>' : '') + '</section>');
}

function themeCard() {
  const t = state.theme || {}, cur = t.preset || 'blue', custom = cur === 'custom' && t.custom;
  const sw = PRESETS.map(p => '<button type="button" class="tsw" id="th-' + p.id + '" data-act="themeSet" data-p="' + p.id + '" aria-pressed="' + (cur === p.id) + '" style="--c:' + p.accent + '"><span class="tsw-dot"></span>' + p.name + '</button>').join('') +
    '<label class="tsw tsw-custom' + (cur === 'custom' ? ' is-on' : '') + (custom ? ' is-set' : '') + '" for="themeCustom"' + (custom ? ' style="--c:' + esc(t.custom) + '"' : '') + '><span class="tsw-dot"></span>צבע משלך' +
    '<input type="color" id="themeCustom" data-bind="theme.custom" value="' + esc(t.custom || '#2343D0') + '" aria-label="בחירת צבע משלך לאתר"></label>';
  return '<section class="card stack"><div><h2 class="h2">עיצוב</h2><p class="sub">הצבע של האתר לכל הצוות. בנוסף, כל אחד/ת בוחר/ת מראה בהיר או כהה במכשיר שלו/ה, בכפתור שבראש המסך.</p></div>' +
    '<div class="themes" role="group" aria-label="ערכת צבעים">' + sw + '</div></section>';
}
function exportCard() {
  const cur = state.exportStyle || 'color';
  const opts = EXPORT_STYLES.map(x => {
    const C = exportColors(x.id);
    return '<button type="button" class="xopt" id="xs-' + x.id + '" data-act="xStyle" data-s="' + x.id + '" aria-pressed="' + (x.id === cur) + '">' +
      '<span class="xopt-sw" aria-hidden="true"><i style="background:' + C.band + '"></i><i style="background:' + C.dayBg + '"></i><i style="background:' + C.panel + '"></i><i style="background:' + C.ink + '"></i><i style="background:' + C.accent + '"></i></span>' + x.name + '</button>';
  }).join('');
  return '<section class="card stack"><div><h2 class="h2">ייצוא הסידור</h2><p class="sub">העיצוב של קובצי ה־PDF והתמונה שיוצאים מהסידור, אצל המנהל/ת ואצל העובדים. בקובץ מופיעים השמות בלבד, בלי התפקידים. התצוגה למטה היא של השבוע שנבחר בסידור.</p></div>' +
    '<div class="xopts" role="group" aria-label="עיצוב הקובץ">' + opts + '</div>' +
    (ui.xprev.url ? '<img class="xprev" id="xPrev" alt="תצוגה מקדימה של הסידור בעיצוב שנבחר" src="' + ui.xprev.url + '">' : '<div class="xprev" id="xPrev">מכין תצוגה מקדימה…</div>') + '</section>';
}
function deadlineCard() {
  const dl = state.rules.deadline || DEF_DEADLINE(), ex = defaultWeek();
  return '<section class="card stack"><div><h2 class="h2">מועד אחרון להגשת זמינות</h2><p class="sub">הזמינות לכל שבוע מוגשת עד יום ושעה בשבוע שלפניו. העובדים רואים את המועד במסך הזמינות שלהם.</p></div>' +
    '<label class="check" for="dlOn"><input type="checkbox" id="dlOn" data-bind="dl.on"' + (dl.on ? ' checked' : '') + '><span>יש מועד אחרון להגשה</span></label>' +
    (dl.on
      ? '<div class="set-times"><div class="field"><label class="label" for="dlDay">יום (בשבוע שלפני)</label><select class="input" id="dlDay" data-bind="dl.day">' +
        DAYS.map((n, i) => '<option value="' + i + '"' + (+dl.day === i ? ' selected' : '') + '>' + dayTitle(i) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label class="label" for="dlTime">שעה</label><input type="time" class="input" id="dlTime" data-bind="dl.time" value="' + esc(dl.time || '18:00') + '"></div></div>' +
        '<p class="sub">לדוגמה, הזמינות לשבוע ' + ltr(weekLabel(ex)) + ' צריכה להגיע עד ' + deadlineText(deadlineOf(ex)) + '.</p>' +
        (REMOTE
          ? '<p class="banner">' + icon('bell') + '<span>כשהמועד עובר, מי שעוד לא הגיש/ה מקבל/ת התראה בטלפון, אם הפעיל/ה התראות במסך הזמינות. המנהל/ת מקבל/ת רשימה של מי שלא הגיש/ה.</span></p>' + pushCard('manager')
          : '<p class="banner">' + icon('bell') + '<span>באתר המחובר, מי שלא הגיש/ה בזמן מקבל/ת התראה בטלפון. בהדגמה הזו ההתראות לא פעילות.</span></p>')
      : '') +
    '</section>';
}

/* ---------- sign-in ---------- */
// A field for a secret: hidden as it is typed, with a button to show it.
function secretField(id, label, bind, value, autocomplete) {
  const shown = !!ui.shown[id];
  return '<div class="field"><label class="label" for="' + id + '">' + label + '</label><div class="pw">' +
    '<input class="input" id="' + id + '" type="' + (shown ? 'text' : 'password') + '" data-bind="' + bind + '" value="' + esc(value) + '" inputmode="numeric" autocomplete="' + autocomplete + '">' +
    '<button type="button" class="pw-t" id="' + id + 'Show" data-act="secretShow" data-for="' + id + '" aria-pressed="' + shown + '" aria-label="הצגת ' + label.replace(/ \(.*$/, '') + '">' + icon(shown ? 'eyeOff' : 'eye') + '</button></div></div>';
}
/* ---------- backup (demo) ----------
   A backup file holds everything: settings, team, availability and rosters. Loading one replaces
   what is here, after setting the current data aside. */
function backupCard() {
  const last = ['reset', 'restore'].map(w => ({ w, c: kept(w) })).filter(x => x.c).sort((a, b) => b.c.at - a.c.at)[0];
  return '<section class="card stack"><div><h2 class="h2">גיבוי הנתונים</h2>' +
    '<p class="sub">כל מה שהוזן כאן נשמר רק בדפדפן של המכשיר הזה. קובץ גיבוי שומר עותק של הכול: ההגדרות, הצוות, הזמינות והסידורים. הקובץ כולל את פרטי העובדים, ולכן כדאי לשמור אותו במקום מוגן.</p></div>' +
    '<div class="acts"><button type="button" class="btn btn-primary" id="btnBackup" data-act="backupSave">' + icon('down') + 'שמירת גיבוי לקובץ</button>' +
    '<button type="button" class="btn" id="btnRestore" data-act="backupPick">' + icon('up') + 'שחזור מקובץ גיבוי</button></div>' +
    (last ? '<p class="banner">' + icon('undo') + '<span>נשמר בצד עותק של הנתונים שהיו כאן לפני ' + (last.w === 'reset' ? 'האיפוס' : 'השחזור') + ', ' + stamp(last.c.at) + '.</span></p>' +
      '<div><button type="button" class="btn" id="btnKeptBack" data-act="keptBack" data-why="' + last.w + '">החזרת הנתונים האלה</button></div>' : '') +
    '</section>';
}
/* Nothing in a backup file is trusted: it may have been edited, or not be a backup at all. Every
   value is rebuilt here by type and anything else is dropped. Ids matter most, because they end up
   inside the page's markup. Returns null when the file is not usable. */
function cleanState(src) {
  const ID = /^[A-Za-z0-9_-]{1,48}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/, WK = /^\d{4}-\d{2}-\d{2}$/;
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  if (!src || typeof src !== 'object' || !Array.isArray(src.employees) || !Array.isArray(src.roles) || !Array.isArray(src.shifts)) return null;
  const uniq = (list, make) => {
    const seen = new Set(), out = [];
    for (const x of list) { if (!x || typeof x !== 'object' || !ID.test(x.id) || seen.has(x.id)) continue; seen.add(x.id); out.push(make(x)); }
    return out;
  };
  const pick = (o, ok, make) => {
    const out = {};
    for (const k of Object.keys(obj(o))) { if (!ok(k)) continue; const v = make(o[k]); if (v !== undefined) out[k] = v; }
    return out;
  };
  const roles = uniq(src.roles, r => ({ id: r.id, name: str(r.name, 120), color: int(r.color, 1, COLORS, 1), rank: Array.isArray(r.rank) ? r.rank.slice(0, 500) : [] }));
  const shifts = uniq(src.shifts.filter(x => x && HM.test(x.start) && HM.test(x.end)), x => ({ id: x.id, name: str(x.name, 120), start: x.start, end: x.end }));
  if (!shifts.length) return null;
  const roleIds = new Set(roles.map(r => r.id)), shiftIds = new Set(shifts.map(x => x.id));
  const employees = uniq(src.employees, e => ({
    id: e.id, name: str(e.name, 120).replace(/\s+/g, ' ').trim(), number: /^\d{3,12}$/.test(e.number) ? e.number : '',
    roles: (Array.isArray(e.roles) ? e.roles : []).filter(id => roleIds.has(id)), max: int(e.max, 1, 99, 5),
  })).filter(e => e.name);
  const empIds = new Set(employees.map(e => e.id));
  roles.forEach(r => { r.rank = r.rank.filter((id, i, a) => typeof id === 'string' && empIds.has(id) && a.indexOf(id) === i); if (!r.rank.length) delete r.rank; });
  const slotKey = k => k.length > 2 && k[1] === '|' && k[0] >= '0' && k[0] <= '6' && shiftIds.has(k.slice(2));
  const counts = o => pick(o, k => roleIds.has(k), v => int(v, 0, 60, undefined));
  const hm = v => (v == null ? null : HM.test(v) ? v : undefined);
  const hours = x => {
    if (x === 1 || x === 2) return x;
    if (!x || typeof x !== 'object') return undefined;
    const t = (Array.isArray(x.t) ? x.t : []).slice(0, 2).map(r => (Array.isArray(r) ? [hm(r[0]), hm(r[1])] : [undefined])).filter(r => r[0] !== undefined && r[1] !== undefined);
    return t.length ? { v: x.v === 2 ? 2 : 1, t } : (x.v === 2 ? 2 : 1);
  };
  const positions = list => (Array.isArray(list) ? list.slice(0, 80) : []).filter(q => q && typeof q === 'object' && ID.test(q.role))
    .map(q => ({ role: q.role, emp: empIds.has(q.emp) ? q.emp : null, lock: q.lock === true }));
  const slots = o => pick(o, slotKey, positions);
  const rules = obj(src.rules), dl = obj(rules.deadline), theme = obj(src.theme);
  return {
    v: 2, app: APP_VERSION, example: src.example === true,
    managerCode: /^\d{4,12}$/.test(src.managerCode) ? src.managerCode : DEMO_CODE,
    store: { name: str(obj(src.store).name, 120) },
    roles, shifts, employees,
    req: pick(src.req, k => shiftIds.has(k), counts),
    closed: pick(src.closed, slotKey, v => (v === true ? true : undefined)),
    rules: { minRest: int(rules.minRest, 0, 16, 10), deadline: { on: dl.on === true, day: int(dl.day, 0, 6, 4), time: HM.test(dl.time) ? dl.time : '18:00', tz: /^[A-Za-z0-9_+\/-]{0,60}$/.test(dl.tz) ? dl.tz : '' } },
    theme: theme.preset === 'custom' && /^#[0-9a-f]{6}$/i.test(theme.custom) ? { preset: 'custom', custom: theme.custom } : { preset: PRESETS.some(q => q.id === theme.preset) ? theme.preset : 'blue' },
    exportStyle: EXPORT_STYLES.some(x => x.id === src.exportStyle) ? src.exportStyle : 'color',
    logo: typeof src.logo === 'string' && src.logo.length < 600000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(src.logo) ? src.logo : null,
    avail: pick(src.avail, k => WK.test(k), wk => pick(wk, k => empIds.has(k), r => ({
      slots: pick(obj(r).slots, slotKey, hours), note: str(obj(r).note, 4000), submittedAt: Number.isFinite(obj(r).submittedAt) ? obj(r).submittedAt : null,
    }))),
    weeks: pick(src.weeks, k => WK.test(k), w => {
      const pub = obj(obj(w).published);
      return { slots: slots(obj(w).slots), over: pick(obj(w).over, slotKey, counts), published: Number.isFinite(pub.at) ? { at: pub.at, slots: slots(pub.slots) } : null };
    }),
    prefs: { session: null, demoNote: false },
    consentLog: {},
  };
}
async function restoreFile(file) {
  let data = null, saved = null;
  try {
    if (file.size > 20e6) throw new Error('size');
    const j = JSON.parse(await file.text());
    data = cleanState(j && j.app === 'sadran' && j.data ? j.data : j);
    saved = j && typeof j.saved === 'string' ? Date.parse(j.saved) || null : null;
  } catch (e) { data = null; }
  if (!data) { toast('הקובץ הזה אינו גיבוי של סדרן, או שהוא פגום.'); return; }
  openSheet({ type: 'restore', data, saved }, 'btnRestore');
}
// Put other data in place of what is here. What was here is set aside first, so it can be brought back.
function replaceData(data, msg) {
  keep('restore', JSON.stringify(state));
  const agreed = (state.consentLog || {}).manager, was = state.store.name;
  state = migrate(data);
  // The store takes the name in the data when it can: a usable one that no other store here has.
  const name = state.store.name.trim().replace(/\s+/g, ' ');
  state.store.name = name.length >= 2 && name.length <= 60 && !shop.list.some(x => x.id !== shop.id && normName(x.name) === normName(name)) ? name : was;
  state.prefs = { session: { role: 'manager' }, demoNote: false };
  state.consentLog = agreed ? { manager: agreed } : {};
  ui.week = defaultWeek();
  ui.undo = null; ui.sheet = null; ui.codeDraft = null; ui.codeErr = '';
  render();
  window.scrollTo(0, 0);
  toast(msg);
}
const storeLink = () => location.origin + location.pathname + '?store=' + shop.id;
function resetBtn() {
  return ui.confirm === 'reset'
    ? '<span class="confirm"><button type="button" class="btn btn-danger-solid" id="cf-reset" data-act="reset">כן, לאפס הכול</button><button type="button" class="btn" data-act="confirmNo">ביטול</button></span>'
    : '<button type="button" class="btn btn-danger" id="cf-reset" data-act="confirmAsk" data-key="reset">' + icon('undo') + 'איפוס לנתוני הדוגמה</button>';
}
function viewSignin() {
  const f = ui.signin, asEmp = f.tab === 'employee';
  const demoEmp = state.example ? empById('e_shadi') : null;
  // Demo: while a store still has the example manager code, the screen says so, so nobody is locked out.
  const hint = !REMOTE && state.managerCode === DEMO_CODE;
  const fields = asEmp
    ? '<div class="field"><label class="label" for="siName">שם</label><input class="input" id="siName" data-bind="si.name" value="' + esc(f.name) + '" autocomplete="username" autocapitalize="off" spellcheck="false"></div>' +
      secretField('siNumber', 'מספר אישי', 'si.number', f.number, 'current-password')
    : secretField('siCode', 'קוד מנהל/ת', 'si.code', f.code, 'current-password');
  return '<section class="signin">' +
    (state.logo ? '<img class="signin-logo" src="' + esc(state.logo) + '" alt="' + esc(state.store.name || 'לוגו החנות') + '">' : '') +
    '<div class="signin-h"><h1 class="h1">כניסה לסידור העבודה</h1><p class="sub">' + esc(state.store.name) + '</p></div>' +
    '<div class="seg" role="group" aria-label="סוג הכניסה">' +
    '<button type="button" class="seg-b" id="segEmp" data-act="signTab" data-tab="employee" aria-pressed="' + asEmp + '">עובד/ת</button>' +
    '<button type="button" class="seg-b" id="segMgr" data-act="signTab" data-tab="manager" aria-pressed="' + !asEmp + '">מנהל/ת</button></div>' +
    '<form class="card form" id="signForm" data-form="signIn" novalidate>' + fields +
    (f.err ? '<p class="err" role="alert">' + f.err + '</p>' : '') +
    '<button type="submit" class="btn btn-primary btn-block" id="btnSignIn"' + (net.busy ? ' disabled' : '') + '>' + (net.busy ? 'נכנס…' : 'כניסה') + '</button>' +
    (legalPage('terms') && legalPage('privacy') ? '<p class="sub legal-note">השימוש באתר כפוף ל<a href="#terms" id="siTerms">תנאי השימוש</a> ול<a href="#privacy" id="siPrivacy">מדיניות הפרטיות</a>.</p>' : '') + '</form>' +
    (hint ? '<div class="demo"><strong>' + (state.example ? 'נתוני דוגמה לכניסה' : 'קוד המנהל/ת של החנות הזו') + '</strong><span>מנהל/ת: קוד ' + ltr(DEMO_CODE) +
      (demoEmp && demoEmp.number === '1004' ? ' · עובד/ת: ' + esc(demoEmp.name) + ', מספר אישי ' + ltr('1004') : '') + '</span>' +
      '<div class="demo-row"><button type="button" class="btn" id="demoMgr" data-act="demoIn" data-role="manager">כניסה כמנהל/ת</button>' +
      (demoEmp ? '<button type="button" class="btn" id="demoEmp" data-act="demoIn" data-role="employee">כניסה בתור ' + esc(demoEmp.name) + '</button>' : '') + '</div></div>' : '') +
    '<div class="signin-foot"><p class="sub">לא החנות שלך? <a href="#stores" id="siSwitch">החלפת חנות</a></p>' +
    (REMOTE
      ? '<p class="sub">שכחת את המספר האישי? המנהל/ת יכול/ה לקבוע לך מספר חדש בלשונית הצוות.</p>'
      : '<p class="sub">אב־טיפוס: הנתונים נשמרים במכשיר הזה בלבד.</p>' + (state.example ? resetBtn() : '')) + '</div>' +
    '</section>';
}
/* ---------- front screens: the product's page, choosing a store, opening one ---------- */
const backHome = () => '<p class="legal-back"><a href="#home" id="frontBack">' + icon('right') + 'חזרה</a></p>';
// A sample day, drawn with the same pieces as the real roster.
function lpDemo() {
  const row = (color, role, name, hours) => '<div class="pos"><span class="role hl-' + color + '">' + role + '</span><span class="pos-who"><span class="pos-n">' + name + '</span>' +
    (hours ? '<span class="pos-h">' + ltr(hours) + '</span>' : '') + '</span><span class="pos-x"></span></div>';
  return '<div class="lp-demo" role="img" aria-label="דוגמה לסידור של יום ראשון: משמרת בוקר ומשמרת ערב, ולכל עמדה תפקיד ושם"><div aria-hidden="true">' +
    '<div class="day is-ok"><div class="day-h"><span class="day-n">ראשון</span><span class="day-d t">' + dm(fromKey(defaultWeek())) + '</span><span class="day-s is-ok">מלא</span></div>' +
    '<div class="shift"><div class="shift-h"><span class="shift-n">בוקר</span>' + ltr('07:00–15:00') + '<span class="shift-c t">3/3</span></div>' +
    row(1, 'אחראי/ת משמרת', 'יוסי') + row(4, 'קופאי/ת', 'תמר') + row(4, 'קופאי/ת', 'שאדי', '11:30–13:50') + '</div>' +
    '<div class="shift"><div class="shift-h"><span class="shift-n">ערב</span>' + ltr('15:00–23:00') + '<span class="shift-c t">3/3</span></div>' +
    row(1, 'אחראי/ת משמרת', 'מיכל') + row(4, 'קופאי/ת', 'דנה') + row(3, 'מחסנאי/ת', 'עומר') + '</div></div></div></div>';
}
function viewLanding() {
  const s = state.prefs.session, signedIn = shop.id && (REMOTE ? net.phase === 'ready' : !!s);
  const cta = id => (signedIn ? '<button type="button" class="btn btn-primary btn-lg" id="' + id + 'Go" data-act="continueStore">המשך אל ' + esc(state.store.name || 'החנות') + '</button>' : '') +
    '<a class="btn btn-lg' + (signedIn ? '' : ' btn-primary') + '" id="' + id + 'Enter" href="#stores">' + (signedIn ? 'חנות אחרת' : 'כניסה לחנות') + '</a>' +
    '<a class="btn btn-lg" id="' + id + 'Open" href="#open">פתיחת חנות חדשה</a>';
  const steps = [
    ['פותחים חנות', 'בוחרים שם וקוד מנהל/ת, מגדירים את התפקידים והמשמרות, ומוסיפים את הצוות ביד או מקובץ אקסל.'],
    ['העובדים מגישים זמינות', 'כל עובד/ת נכנס/ת מהטלפון עם שם ומספר אישי, ומסמן/ת מתי אפשר, מה מועדף, ואפילו שעות מסוימות בתוך משמרת.'],
    ['משבצים ומפרסמים', 'שיבוץ אוטומטי בלחיצה, תיקונים ביד, ופרסום לצוות. הסידור יוצא גם כתמונה או כקובץ PDF לשליחה.'],
  ];
  const feats = [
    ['wand', 'שיבוץ אוטומטי הוגן', 'לפי הזמינות, התפקידים ומקסימום המשמרות של כל עובד/ת, עם חלוקה שווה של העומס.'],
    ['clock', 'זמינות מהטלפון', 'אפשר, מועדף, או שעות מסוימות בלבד. עם מועד אחרון להגשה.'],
    ['bell', 'תזכורות', 'מי שלא הגיש/ה בזמן מקבל/ת התראה, והמנהל/ת רואה מי חסר.'],
    ['down', 'קובץ לשליחה', 'הסידור כתמונה או PDF בעיצוב של החנות, או כהודעת טקסט לקבוצה.'],
    ['image', 'המראה של החנות', 'לוגו, צבעים משלכם, ותצוגה בהירה או כהה.'],
    ['lock', 'פרטיות', 'בלי פרסומות ובלי מעקב. הקודים נשמרים מוצפנים, וכל חנות רואה רק את הנתונים שלה.'],
  ];
  return '<section class="lp-hero"><div class="lp-copy"><p class="lp-kicker">סידור עבודה שבועי לחנויות</p>' +
    '<h1 class="lp-h1">הסידור של השבוע, <span class="lp-mark">מוכן בכמה דקות</span></h1>' +
    '<p class="lp-lead">העובדים מגישים זמינות מהטלפון. סדרן מציע סידור לפי התפקידים והמשמרות של החנות, והמנהל/ת מתקן/ת, מפרסם/ת ושולח/ת לצוות.</p>' +
    '<div class="lp-cta">' + cta('lp') + '</div>' +
    (shop.id && !signedIn && state.store.name ? '<p class="sub">במכשיר הזה נכנסו לאחרונה אל ' + esc(state.store.name) + '. <a href="#" id="lpLast">כניסה אליה</a></p>' : '') +
    '</div>' + lpDemo() + '</section>' +
    '<section class="lp-sec"><h2 class="lp-h2">איך זה עובד</h2><ol class="lp-steps">' +
    steps.map((x, i) => '<li class="card"><span class="lp-num" aria-hidden="true">' + (i + 1) + '</span><h3 class="lp-h3">' + x[0] + '</h3><p class="sub">' + x[1] + '</p></li>').join('') + '</ol></section>' +
    '<section class="lp-sec"><h2 class="lp-h2">מה יש בסדרן</h2><ul class="lp-feats">' +
    feats.map(x => '<li class="card"><span class="lp-ic" aria-hidden="true">' + icon(x[0]) + '</span><h3 class="lp-h3">' + x[1] + '</h3><p class="sub">' + x[2] + '</p></li>').join('') + '</ul></section>' +
    '<section class="lp-end card"><h2 class="lp-h2">מתחילים?</h2><p class="sub">פתיחת חנות לוקחת דקה: שם וקוד מנהל/ת. אחר כך מוסיפים את הצוות ושולחים לו את הקישור.</p><div class="lp-cta">' + cta('lp2') + '</div></section>';
}
function storesHtml() {
  const st = ui.stores;
  if (st.err) return '<p class="err" role="alert">' + st.err + '</p><div><button type="button" class="btn" id="storesRetry" data-act="storesRetry">ניסיון חוזר</button></div>';
  if (st.list === null) return '<p class="sub" aria-busy="true">טוען…</p>';
  if (!st.list.length) return '<p class="sub">' + (st.q.trim() ? 'לא נמצאה חנות בשם הזה.' : 'עדיין אין חנויות.') + '</p>';
  return '<ul class="shops">' + st.list.map(x => '<li><button type="button" class="shop" data-act="pickStore" data-id="' + esc(x.id) + '"><span class="shop-n">' + esc(x.name || 'חנות בלי שם') + '</span>' + icon('left') + '</button></li>').join('') + '</ul>' +
    (st.more ? '<p class="sub">מוצגות 30 החנויות הראשונות. אפשר לצמצם בחיפוש.</p>' : '');
}
function paintStores() { const el = $('#storeList'); if (el) el.innerHTML = storesHtml(); }
function viewStores() {
  return '<section class="signin">' + backHome() +
    '<div class="signin-h"><h1 class="h1">באיזו חנות?</h1><p class="sub">בוחרים את החנות, ואז נכנסים עם השם והמספר האישי, או עם קוד המנהל/ת.</p></div>' +
    '<div class="card form"><div class="field"><label class="label" for="storeQ">חיפוש לפי שם החנות</label>' +
    '<input class="input" id="storeQ" type="search" data-bind="stores.q" value="' + esc(ui.stores.q) + '" autocomplete="off" enterkeyhint="search"></div>' +
    '<div class="stack" id="storeList" aria-live="polite">' + storesHtml() + '</div></div>' +
    '<p class="sub">החנות עוד לא כאן? <a href="#open" id="stOpen">פתיחת חנות חדשה</a></p></section>';
}
// Open a new store: its name and the manager code, with the agreement to the terms.
function viewOpen() {
  const f = ui.newStore;
  return '<section class="signin">' + backHome() +
    '<div class="signin-h"><h1 class="h1">פתיחת חנות חדשה</h1><p class="sub">בוחרים שם לחנות וקוד מנהל/ת. עם הקוד נכנסים לניהול הסידור, הצוות וההגדרות.</p></div>' +
    '<form class="card form" id="openForm" data-form="openGo" novalidate>' +
    '<div class="field"><label class="label" for="opName">שם החנות או הסניף</label><input class="input" id="opName" data-bind="op.name" value="' + esc(f.name) + '" autocomplete="organization" maxlength="60" placeholder="למשל: מכולת הפינה, סניף רמת גן"></div>' +
    secretField('opCode', 'קוד מנהל/ת (6 עד 12 ספרות)', 'op.code', f.code, 'new-password') +
    secretField('opCode2', 'שוב, לאישור', 'op.code2', f.code2, 'new-password') +
    consentBoxes('ag', consentsFor('manager'), ui.agree) +
    (f.err ? '<p class="err" role="alert">' + f.err + '</p>' : '') +
    '<button type="submit" class="btn btn-primary btn-block" id="btnOpen"' + (net.busy ? ' disabled' : '') + '>' + (net.busy ? 'פותח…' : 'פתיחת החנות') + '</button></form>' +
    '<p class="sub">כדאי לבחור קוד שקשה לנחש, ולא לשתף אותו עם העובדים. אפשר להחליף אותו אחר כך בהגדרות.</p>' +
    '<p class="sub">כבר יש לך חנות? <a href="#stores" id="opEnter">כניסה לחנות</a></p></section>';
}
const viewLoading = () => '<section class="gate" aria-busy="true"><p>טוען…</p></section>';
const viewDown = () => '<section class="signin"><div class="card empty"><h1 class="h2">אין חיבור לשרת</h1>' +
  '<p class="sub">לא הצלחתי להגיע למסד הנתונים. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.</p>' +
  '<button type="button" class="btn btn-primary" id="btnRetry" data-act="retryBoot">ניסיון חוזר</button></div></section>';

/* ---------- employee views ---------- */
function viewMyAvail() {
  const me = currentMe();
  const wk = ui.week, rec = availRec(wk, me.id), sub = rec && rec.submittedAt, pub = state.weeks[wk].published;
  const due = deadlineOf(wk), late = due && Date.now() > due.getTime();
  return '<section class="wk-head">' + weekNav() + '</section>' +
    (pub ? '<p class="banner">' + icon('calendar') + '<span>הסידור לשבוע הזה כבר פורסם. שינוי בזמינות לא יעדכן אותו מעצמו, כדאי לדבר עם המנהל/ת.</span></p>' : '') +
    (sub ? '<p class="banner banner-ok">' + icon('check') + '<span>הזמינות הוגשה ' + stamp(sub) + '. שינויים נשמרים מיד.</span></p>'
      : '<p class="banner banner-warn">' + icon('alert') + '<span>עוד לא הגשת זמינות לשבוע הזה.' +
        (due ? (late ? ' המועד להגשה, ' + deadlineText(due) + ', עבר. כדאי להגיש עכשיו.' : ' יש להגיש עד ' + deadlineText(due) + '.') : '') + '</span></p>') +
    '<section class="card stack"><div><h1 class="h2">מתי אפשר לשבץ אותך?</h1><p class="sub">הקשה על משמרת מסמנת אותה: אפשר, אחר כך מועדף, ואז חזרה ללא. כפתור השעון שבכל משמרת מאפשר לבחור שעות מסוימות, עד שני טווחים.</p></div>' +
    availEditor(wk, me.id) +
    (sub ? '' : '<button type="button" class="btn btn-primary btn-block" id="btnSubmit" data-act="avSubmit" data-emp="' + me.id + '">' + icon('send') + 'שליחת הזמינות</button>') +
    '</section>' +
    (REMOTE ? '<section class="card stack"><h2 class="h2">התראות</h2>' + pushCard('employee') + '</section>' : '');
}

function viewMyShifts() {
  const me = currentMe();
  const wk = ui.week, pub = state.weeks[wk].published;
  const head = '<section class="wk-head">' + weekNav() + '</section>';
  if (!pub) {
    return head + '<section class="card empty"><h1 class="h2">הסידור לשבוע הזה עוד לא פורסם</h1>' +
      '<p class="sub">כשהמנהל/ת יפרסם את הסידור, המשמרות שלך יופיעו כאן.</p>' +
      '<button type="button" class="btn" data-act="nav" data-view="my-availability">' + icon('clock') + 'עדכון הזמינות שלי</button></section>';
  }
  const start = fromKey(wk), mine = [];
  let minutes = 0;
  for (let d = 0; d < 7; d++) for (const sh of state.shifts) {
    const list = pub.slots[sk(d, sh.id)] || [];
    list.forEach(p => {
      if (p.emp !== me.id) return;
      const sp = span(d, sh.id);
      minutes += sp[1] - sp[0];
      mine.push({ d, sh, role: p.role, hours: hoursOf(wk, me.id, sk(d, sh.id)), mates: list.filter(q => q.emp && q.emp !== me.id).map(q => (empById(q.emp) || {}).name).filter(Boolean) });
    });
  }
  const hours = Math.round(minutes / 6) / 10;
  return head +
    '<section class="pagehead"><div><h1 class="h1">המשמרות של ' + esc(me.name) + '</h1><p class="sub">' +
    (mine.length ? many(mine.length, 'משמרת אחת', 'משמרות') + ' · ' + hours + ' שעות · פורסם ' + stamp(pub.at) : 'פורסם ' + stamp(pub.at)) + '</p></div>' +
    '<button type="button" class="btn" id="btnExportMine" data-act="exportMine">' + icon('down') + 'שמירת הסידור</button></section>' +
    (mine.length
      ? '<section class="list">' + mine.map(m =>
        '<article class="myshift"><div class="myshift-d"><span class="myshift-dn">' + DAYS[m.d] + '</span>' + ltr(dm(addDays(start, m.d))) + '</div>' +
        '<div class="myshift-b"><div class="myshift-t"><strong data-sn="' + m.sh.id + '">' + esc(m.sh.name) + '</strong>' + shiftTime(m.sh) + roleChip(m.role) + '</div>' +
        (m.hours ? '<span class="sub">בשעות שסימנת: ' + ltr(m.hours) + '</span>' : '') +
        (m.mates.length ? '<span class="sub">איתך במשמרת: ' + m.mates.map(esc).join(', ') + '</span>' : '') + '</div></article>').join('') + '</section>'
      : '<section class="card empty"><h2 class="h2">לא שובצת השבוע</h2><p class="sub">אין לך משמרות בסידור שפורסם לשבוע הזה.</p></section>') +
    '<details class="fold" data-fold="full"' + (ui.open.full ? ' open' : '') + '><summary>הסידור המלא של הצוות</summary><div class="stack" style="padding-top:10px">' +
    weekGrid(wk, pub.slots, { me: me.id }) + '</div></details>';
}

const VIEWS = {
  schedule: { mode: 'manager', label: 'סידור', icon: 'calendar', wide: true, html: viewSchedule },
  availability: { mode: 'manager', label: 'זמינות', icon: 'clock', html: viewAvailability },
  team: { mode: 'manager', label: 'צוות', icon: 'users', html: viewTeam },
  setup: { mode: 'manager', label: 'הגדרות', icon: 'sliders', html: viewSetup },
  'my-availability': { mode: 'employee', label: 'הזמינות שלי', icon: 'clock', html: viewMyAvail },
  'my-shifts': { mode: 'employee', label: 'המשמרות שלי', icon: 'calendar', wide: true, html: viewMyShifts },
};

/* ---------- sheets ---------- */
function shareText(wk) {
  const w = state.weeks[wk], start = fromKey(wk);
  const lines = ['*סידור עבודה – ' + state.store.name + '*', 'שבוע ' + weekLabel(wk).replace('–', '-'), ''];
  for (let d = 0; d < 7; d++) {
    const part = [];
    for (const sh of state.shifts) {
      const list = w.slots[sk(d, sh.id)] || [];
      if (!list.length) continue;
      part.push(sh.name + ' (' + sh.start + '-' + sh.end + '):');
      list.forEach(p => {
        const e = p.emp && empById(p.emp), r = roleById(p.role), h = p.emp ? hoursOf(wk, p.emp, sk(d, sh.id)) : '';
        part.push('• ' + (r ? r.name : '') + ': ' + (e ? e.name : '— חסר —') + (h ? ' (' + h.replace(/–/g, '-') + ')' : ''));
      });
    }
    if (part.length) lines.push('*' + dayTitle(d) + ' ' + dm(addDays(start, d)) + '*', ...part, '');
  }
  return lines.join('\n').trim();
}
function remindText(wk) {
  return 'היי, תזכורת: עוד לא הגשתם זמינות לשבוע ' + weekLabel(wk).replace('–', '-') + ' (' + state.store.name + ').\nבבקשה להגיש בהקדם כדי שנוכל לסגור את הסידור. תודה!';
}

const SHEETS = {
  restore(s) {
    const d = s.data;
    return {
      title: 'שחזור מגיבוי',
      body: '<p class="sub">' + (s.saved ? 'הגיבוי נשמר ' + stamp(s.saved) + '. ' : '') + 'יש בו: ' +
        [esc(d.store.name || 'חנות בלי שם'), many(d.employees.length, 'עובד/ת אחד/ת', 'עובדים'), many(d.shifts.length, 'משמרת אחת', 'משמרות'),
          many(Object.keys(d.weeks).length, 'שבוע אחד של סידורים', 'שבועות של סידורים')].join(' · ') + '.</p>' +
        '<p class="banner banner-warn">' + icon('alert') + '<span>השחזור יחליף את כל הנתונים שבמכשיר הזה. עותק של הנתונים הנוכחיים יישמר בצד, ואפשר יהיה להחזיר אותו מההגדרות.</span></p>',
      foot: '<button type="button" class="btn btn-primary" id="btnRestoreGo" data-act="restoreGo">שחזור</button><button type="button" class="btn" data-act="close">ביטול</button>',
    };
  },
  privacy(s) {
    if (!legal.ready) return null;
    const opt = optionalCats();
    const cats = legal.reg.cookies.categories.map(c => {
      if (!c.required && opt.indexOf(c) < 0) return '';
      const on = c.required || !!s.choices[c.id];
      return '<div class="ck-cat"><label class="check" for="ck-' + esc(c.id) + '"><input type="checkbox" id="ck-' + esc(c.id) + '" data-bind="ck.' + esc(c.id) + '"' + (on ? ' checked' : '') + (c.required ? ' disabled' : '') + '>' +
        '<span><strong>' + esc(c.title) + '</strong>' + (c.required ? ' <span class="sub">(תמיד פעיל)</span>' : '') + '<br><span class="sub">' + esc(c.description || '') + '</span></span></label>' +
        ((c.items || []).length ? '<ul class="ck-items">' + c.items.map(it => '<li><strong>' + esc(it.what) + '</strong>: ' + esc(it.why) + '. ' + esc(it.kept) + '.</li>').join('') + '</ul>' : '') + '</div>';
    }).join('');
    const role = myRole(), mine = role ? myConsents() : {};
    const given = role ? consentsFor(role).filter(c => c.required && mine[c.id] && mine[c.id].granted) : [];
    const optional = role && !needsAgreement().length ? consentsFor(role).filter(c => !c.required) : [];
    return {
      title: 'עוגיות ופרטיות',
      body: '<p class="sub">מה האתר שומר בדפדפן שלך' + (optional.length ? ', ולמה הסכמת' : '') + '. ' + (legalPage('cookies') ? '<a href="#cookies" id="ckFull">הסבר מלא</a>' : '') + '</p>' + cats +
        (opt.length ? '' : '<p class="banner">' + icon('check') + '<span>כרגע אין באתר כלי ניתוח, פרסום או מעקב, ולכן אין מה לבחור.</span></p>') +
        (given.length ? '<p class="sub">' + given.map(c => 'אישרת את ' + esc(c.title || c.id) + ' ' + stamp(mine[c.id].at) + ' (גרסה ' + ltr(mine[c.id].version) + ').').join(' ') + '</p>' : '') +
        (optional.length ? '<div class="ck-cat" role="group" aria-label="הסכמות נוספות"><strong>הסכמות נוספות</strong>' + consentBoxes('pf', optional, s.consent) + '</div>' : '') +
        (s.err ? '<p class="err" role="alert">' + s.err + '</p>' : ''),
      foot: '<button type="button" class="btn btn-primary" id="ckSave" data-act="ckSave"' + (s.busy ? ' disabled' : '') + '>' + (opt.length || optional.length ? 'שמירת הבחירה' : 'הבנתי') + '</button>' +
        '<button type="button" class="btn" data-act="close">סגירה</button>',
    };
  },
  color(s) {
    const r = roleById(s.id);
    if (!r) return null;
    return {
      title: 'צבע לתפקיד', sub: esc(r.name),
      body: '<div class="palette" role="group" aria-label="צבעים">' + HL.map((c, i) =>
        '<button type="button" class="pal hl-' + (i + 1) + '" id="pal-' + (i + 1) + '" data-act="roleColorSet" data-c="' + (i + 1) + '" aria-pressed="' + (r.color === i + 1) + '" aria-label="' + HL_NAMES[i] + '" title="' + HL_NAMES[i] + '">' + (r.color === i + 1 ? icon('check') : '') + '</button>').join('') + '</div>' +
        '<p class="sub">הצבע מסמן את התפקיד בסידור, בזמינות ובקבצים שמייצאים.</p>',
    };
  },
  dayHours(s) {
    const d = s.d;
    const field = (i, label) => '<label class="dh-f"><span class="label">' + label + '</span><input type="time" class="input" id="dh-' + i + '" data-bind="dh.' + i + '" value="' + esc(s.t[i]) + '"></label>';
    return {
      title: 'שעות ב' + dayTitle(d),
      sub: 'מאיזו שעה ועד איזו שעה אפשר לעבוד ביום הזה',
      body: '<p class="sub">השעות מתחלקות בין המשמרות של היום. למשל 12:00–18:00, כשהבוקר עד 15:00 והערב מ־15:00: אפשר לשבץ אותך בבוקר מ־12:00 ובערב עד 18:00, והשעות יופיעו בסידור ליד השם.</p>' +
        '<div class="dh">' + field(0, 'משעה') + field(1, 'עד שעה') + '</div>' +
        '<p class="sub dh-prev" id="dhPrev" aria-live="polite">' + dayPreview(d, s.t[0], s.t[1]) + '</p>' +
        '<div class="seg" role="group" aria-label="סוג הזמינות"><button type="button" class="seg-b" id="dhV1" data-act="dhV" data-v="1" aria-pressed="' + (s.v !== 2) + '">אפשר</button>' +
        '<button type="button" class="seg-b" id="dhV2" data-act="dhV" data-v="2" aria-pressed="' + (s.v === 2) + '">מועדף</button></div>' +
        (s.err ? '<p class="err" role="alert">' + s.err + '</p>' : ''),
      foot: '<button type="button" class="btn btn-primary" id="dhSave" data-act="dhSave">שמירה</button>' +
        (s.had ? '<button type="button" class="btn" id="dhClear" data-act="dhClear">לא אפשרי ביום הזה</button>' : '') +
        '<button type="button" class="btn" data-act="close">ביטול</button>',
    };
  },
  rank(s) {
    const r = roleById(s.id);
    if (!r) return null;
    const order = rankOrder(r), holders = state.employees.filter(e => e.roles.includes(r.id));
    let body = '<p class="sub">מי שלמעלה ישובץ ראשון בתפקיד הזה בשיבוץ האוטומטי, בכל משמרת שבה הוא זמין ולא הגיע למקסימום המשמרות שלו. רק המנהל/ת רואה את הסדר.</p>';
    if (!holders.length) body += '<p class="banner">' + icon('users') + '<span>עוד אין עובדים בתפקיד הזה. מסמנים תפקידים לכל עובד/ת בלשונית הצוות.</span></p>';
    else if (!order.length) {
      body += '<p class="banner">' + icon('users') + '<span>כרגע אין סדר עדיפות: כל ' + holders.length + ' העובדים בתפקיד שווים, והשיבוץ מתחלק לפי הזמינות והעומס.</span></p>' +
        '<div><button type="button" class="btn btn-primary" id="rankOn" data-act="rankOn">' + icon('up') + 'קביעת סדר עדיפות</button></div>';
    } else {
      const n = order.length;
      body += '<ol class="rank">' + order.map((id, i) => {
        const e = empById(id), nm = esc(e.name);
        return '<li class="rank-i"><span class="rank-n t" aria-hidden="true">' + (i + 1) + '</span><span class="rank-name">' + nm + '</span>' +
          '<button type="button" class="btn btn-icon btn-quiet" id="rk-up-' + id + '" data-act="rankMove" data-emp="' + id + '" data-dir="-1"' + (i ? '' : ' disabled') + ' aria-label="להעלות את ' + nm + ' (מקום ' + (i + 1) + ' מתוך ' + n + ')">' + icon('up') + '</button>' +
          '<button type="button" class="btn btn-icon btn-quiet" id="rk-down-' + id + '" data-act="rankMove" data-emp="' + id + '" data-dir="1"' + (i < n - 1 ? '' : ' disabled') + ' aria-label="להוריד את ' + nm + ' (מקום ' + (i + 1) + ' מתוך ' + n + ')">' + icon('down') + '</button></li>';
      }).join('') + '</ol>';
    }
    return {
      title: 'סדר עדיפות: ' + esc(r.name || 'ללא שם'),
      body,
      foot: '<button type="button" class="btn btn-primary" data-act="close">סיום</button>' +
        (order.length ? '<button type="button" class="btn" id="rankOff" data-act="rankOff">ביטול הסדר</button>' : ''),
    };
  },
  times(s) {
    const u = unsk(s.k), sh = shiftById(u[1]);
    if (!sh) return null;
    const rows = s.ranges.map((r, i) => '<div class="trow"><span class="trow-l"><span>' + (i ? 'טווח שני' : 'טווח ראשון') + '</span>' +
      (i ? '<button type="button" class="btn btn-quiet btn-danger" id="trDel" data-act="trDel" data-i="' + i + '">הסרה</button>' : '') + '</span>' +
      '<input type="time" class="input" id="tr-' + i + '-0" data-bind="tr.' + i + '.0" value="' + esc(r[0]) + '" aria-label="' + (i ? 'טווח שני' : 'טווח ראשון') + ', משעה">' +
      '<span aria-hidden="true">–</span>' +
      '<input type="time" class="input" id="tr-' + i + '-1" data-bind="tr.' + i + '.1" value="' + esc(r[1]) + '" aria-label="' + (i ? 'טווח שני' : 'טווח ראשון') + ', עד שעה"></div>').join('');
    return {
      title: 'שעות מסוימות',
      sub: dayTitle(u[0]) + ' · ' + esc(sh.name) + ' ' + ltr(sh.start + '–' + sh.end),
      body: '<p class="sub">אפשר לבחור עד שני טווחי שעות בתוך המשמרת. טווח שמסתיים בסוף המשמרת יתעדכן אם שעות המשמרת ישתנו.</p>' + rows +
        (s.ranges.length < 2 ? '<div><button type="button" class="btn btn-quiet" id="trAdd" data-act="trAdd">' + icon('plus') + 'טווח שני</button></div>' : '') +
        '<div class="seg" role="group" aria-label="סוג הזמינות"><button type="button" class="seg-b" id="trV1" data-act="trV" data-v="1" aria-pressed="' + (s.v !== 2) + '">אפשר</button>' +
        '<button type="button" class="seg-b" id="trV2" data-act="trV" data-v="2" aria-pressed="' + (s.v === 2) + '">מועדף</button></div>' +
        (s.err ? '<p class="err" role="alert">' + s.err + '</p>' : ''),
      foot: '<button type="button" class="btn btn-primary" id="trSave" data-act="trSave">שמירה</button>' +
        (s.had ? '<button type="button" class="btn" id="trFull" data-act="trFull">כל המשמרת</button>' : '') +
        '<button type="button" class="btn" data-act="close">ביטול</button>',
    };
  },
  export(s) {
    return {
      title: 'ייצוא הסידור',
      sub: 'שבוע ' + ltr(weekLabel(s.wk)) + ' · עיצוב ' + (EXPORT_STYLES.find(x => x.id === s.style) || EXPORT_STYLES[0]).name,
      body: (s.url ? '<img class="xprev" id="exportImg" src="' + s.url + '" alt="הסידור כפי שיופיע בקובץ">' : '<div class="xprev">' + (s.fail ? 'לא הצלחתי להכין את הקובץ.' : 'מכין…') + '</div>') +
        '<div class="seg" role="group" aria-label="סוג הקובץ"><button type="button" class="seg-b" id="xPdf" data-act="xFmt" data-f="pdf" aria-pressed="' + (s.fmt === 'pdf') + '">PDF</button>' +
        '<button type="button" class="seg-b" id="xJpg" data-act="xFmt" data-f="jpg" aria-pressed="' + (s.fmt === 'jpg') + '">תמונה (JPEG)</button></div>' +
        (s.draft ? '<p class="banner banner-warn">' + icon('alert') + '<span>הסידור הזה עוד לא פורסם כפי שהוא, ולכן הקובץ מסומן "טיוטה".</span></p>' : '') +
        (s.mgr ? '<p class="sub">את העיצוב של הקובץ בוחרים בהגדרות, בכרטיס "ייצוא הסידור".</p>' : ''),
      foot: '<button type="button" class="btn btn-primary" id="xSave" data-act="xSave"' + (s.blobs ? '' : ' disabled') + '>' + icon('down') + 'הורדה</button>' +
        (s.canShare ? '<button type="button" class="btn" id="xShare" data-act="xShare"' + (s.blobs ? '' : ' disabled') + '>' + icon('share') + 'שיתוף</button>' : '') +
        '<button type="button" class="btn" data-act="close">סגירה</button>',
    };
  },
  pos(s) {
    const wk = ui.week, w = state.weeks[wk], p = (w.slots[s.k] || [])[s.i];
    if (!p) return null;
    const u = unsk(s.k), d = u[0], sh = shiftById(u[1]);
    const rows = state.employees.map(e => {
      const is = issues(wk, d, sh.id, p.role, e, s);
      const av = availRec(wk, e.id);
      return { e, is, pref: !!(av && av.submittedAt && slotV(av.slots[s.k]) === 2), hours: hoursOf(wk, e.id, s.k), load: empShifts(w, e.id).length };
    });
    const cur = rows.find(r => r.e.id === p.emp);
    const rest = rows.filter(r => r.e.id !== p.emp);
    const fit = rest.filter(r => !r.is.length).sort((a, b) => (!!a.hours - !!b.hours) || (b.pref - a.pref) || (a.load / a.e.max - b.load / b.e.max));
    const stretch = rest.filter(r => r.is.length && !r.is.includes('norole') && !r.is.includes('inslot')).sort((a, b) => a.is.length - b.is.length);
    const busy = rest.filter(r => r.is.includes('inslot') && !r.is.includes('norole'));
    const norole = rest.filter(r => r.is.includes('norole'));
    const loadTxt = r => '<bdi class="t" dir="ltr">' + r.load + '/' + r.e.max + '</bdi> משמרות';
    const row = (r, kind) => {
      const sub = kind === 'fit'
        ? '<span class="cand-s' + (r.pref ? ' is-good' : '') + '">' + (r.pref ? 'מעדיף/ה את המשמרת' : 'זמין/ה') + (r.hours ? ' בשעות ' + ltr(r.hours) : '') + ' · ' + loadTxt(r) + '</span>'
        : '<span class="cand-s is-warn">' + r.is.map(z => issueText(z, r.e)).join(' · ') + '</span>';
      return kind === 'busy'
        ? '<div class="cand"><span class="cand-n">' + esc(r.e.name) + '</span>' + sub + '</div>'
        : '<button type="button" class="cand" data-act="assign" data-emp="' + r.e.id + '"><span class="cand-n">' + esc(r.e.name) + '</span>' + sub + '<span class="cand-go">שיבוץ</span></button>';
    };
    const group = (title, list, kind) => (list.length ? '<div class="grp"><div class="grp-h">' + title + ' (' + list.length + ')</div><div class="cands">' + list.map(r => row(r, kind)).join('') + '</div></div>' : '');
    let body = '';
    if (cur) {
      const is = cur.is.filter(z => z !== 'inslot');
      body += '<div class="grp"><div class="grp-h">משובץ/ת כעת</div><div class="cands"><div class="cand is-cur"><span class="cand-n">' + esc(cur.e.name) + '</span>' +
        '<span class="cand-s' + (is.length ? ' is-warn' : '') + '">' + (is.length ? is.map(z => issueText(z, cur.e)).join(' · ') : (cur.hours ? 'בשעות ' + ltr(cur.hours) + ' · ' : '') + loadTxt(cur)) + '</span></div></div>' +
        '<div class="quick"><button type="button" class="chipbtn" id="posLock" data-act="lock">' + (p.lock ? 'שחרור הנעילה' : 'נעילת השיבוץ') + '</button>' +
        '<button type="button" class="chipbtn" id="posClear" data-act="unassign">הסרת השיבוץ</button>' +
        '<span class="sub">' + (p.lock ? 'נעול: שיבוץ אוטומטי לא ישנה אותו.' : 'לא נעול: שיבוץ אוטומטי עשוי לשנות אותו.') + '</span></div></div>';
    }
    if (!fit.length) body += '<p class="banner banner-warn">' + icon('alert') + '<span>אין כרגע עובד/ת זמין/ה ופנוי/ה עם התפקיד הזה. אפשר לשבץ בחריגה, או לבקש מהצוות לעדכן זמינות.</span></p>';
    body += group('מתאימים למשמרת', fit, 'fit') + group('אפשר לשבץ בחריגה', stretch, 'warn') + group('כבר במשמרת הזו', busy, 'busy');
    if (norole.length) {
      body += '<details class="fold" data-fold="norole"' + (ui.open.norole ? ' open' : '') + '><summary>עובדים שלא מוגדרים לתפקיד (' + norole.length + ')</summary><div class="cands" style="margin-top:6px">' + norole.map(r => row(r, 'warn')).join('') + '</div></details>';
    }
    body += '<div><button type="button" class="btn btn-quiet btn-danger" data-act="rmpos">' + icon('trash') + 'הסרת העמדה מהמשמרת הזו</button></div>';
    return { title: (roleById(p.role) || {}).name || 'עמדה', sub: dayTitle(d) + ' ' + ltr(dm(addDays(fromKey(wk), d))) + ' · ' + esc(sh.name) + ' ' + ltr(sh.start + '–' + sh.end), body };
  },
  addpos(s) {
    const wk = ui.week, w = state.weeks[wk], u = unsk(s.k), sh = shiftById(u[1]);
    const body = '<p class="sub">העמדה תתווסף רק למשמרת הזו, בשבוע הזה. את התקן הקבוע משנים בהגדרות.</p>' +
      '<div class="menu">' + state.roles.map(r => '<button type="button" class="menu-i" data-act="addposGo" data-role="' + r.id + '">' + icon('plus') + '<span>' + roleChip(r.id) + '</span></button>').join('') + '</div>' +
      (w.over[s.k] ? '<div><button type="button" class="btn btn-quiet" data-act="resetOver">' + icon('undo') + 'חזרה לתקן הרגיל במשמרת הזו</button></div>' : '');
    return { title: 'הוספת עמדה', sub: dayTitle(u[0]) + ' · ' + esc(sh.name), body };
  },
  more() {
    const w = state.weeks[ui.week];
    return {
      title: 'פעולות נוספות', sub: 'שבוע ' + ltr(weekLabel(ui.week)),
      body: '<div class="menu">' +
        (ui.undo && ui.undo.wk === ui.week ? '<button type="button" class="menu-i" data-act="undoMenu">' + icon('undo') + '<span><strong>ביטול הפעולה האחרונה</strong><small>מחזיר את הסידור למצב שלפני השינוי האחרון</small></span></button>' : '') +
        '<button type="button" class="menu-i" data-act="exportRoster">' + icon('down') + '<span><strong>ייצוא PDF או תמונה</strong><small>הסידור כקובץ להדפסה או לשליחה, בעיצוב שנבחר בהגדרות</small></span></button>' +
        '<button type="button" class="menu-i" data-act="fill">' + icon('plus') + '<span><strong>השלמת חסרים בלבד</strong><small>משבץ לעמדות הריקות בלי לגעת בשיבוצים קיימים</small></span></button>' +
        '<button type="button" class="menu-i" data-act="share">' + icon('copy') + '<span><strong>שיתוף כטקסט</strong><small>הסידור כהודעה מוכנה לקבוצת הצוות</small></span></button>' +
        (w.published ? '<button type="button" class="menu-i" data-act="unpublish">' + icon('undo') + '<span><strong>ביטול הפרסום</strong><small>העובדים יפסיקו לראות את הסידור לשבוע הזה</small></span></button>' : '') +
        '<button type="button" class="menu-i is-danger" data-act="clear">' + icon('trash') + '<span><strong>ניקוי הסידור</strong><small>מסיר את כל השיבוצים בשבוע הזה</small></span></button></div>',
    };
  },
  publish() {
    const wk = ui.week, st = weekStats(wk, state.weeks[wk].slots);
    return {
      title: 'פרסום הסידור לצוות', sub: 'שבוע ' + ltr(weekLabel(wk)),
      body: '<p>אחרי הפרסום כל עובד/ת יראה את המשמרות שלו/ה בלשונית "המשמרות שלי".</p>' +
        (st.missing ? '<p class="banner banner-warn">' + icon('alert') + '<span>' + many(st.missing, 'עמדה אחת עדיין', 'עמדות עדיין') + ' בלי שיבוץ. אפשר לפרסם עכשיו ולהשלים אחר כך.</span></p>'
          : '<p class="banner banner-ok">' + icon('check') + '<span>כל ' + st.total + ' העמדות מאוישות.</span></p>') +
        (st.warns ? '<p class="banner banner-warn">' + icon('alert') + '<span>' + many(st.warns, 'אזהרה אחת פתוחה', 'אזהרות פתוחות') + ' בסידור.</span></p>' : ''),
      foot: '<button type="button" class="btn btn-primary" id="btnPublishGo" data-act="publishGo">' + icon('send') + 'פרסום לצוות</button><button type="button" class="btn" data-act="close">עוד לא</button>',
    };
  },
  share(s) {
    return {
      title: s.title, sub: s.sub,
      body: '<textarea class="input share" id="shareText" readonly aria-label="' + esc(s.title) + '">' + esc(s.text) + '</textarea>',
      foot: '<button type="button" class="btn btn-primary" id="btnCopy" data-act="copy">' + icon('copy') + 'העתקה</button><button type="button" class="btn" data-act="close">סגירה</button>',
    };
  },
  avail(s) {
    const e = empById(s.emp);
    if (!e) return null;
    const wk = ui.week, sub = isSubmitted(wk, e.id);
    return {
      title: 'הזמינות של ' + e.name, sub: 'שבוע ' + ltr(weekLabel(wk)) + (sub ? ' · הוגשה ' + stamp(availRec(wk, e.id).submittedAt) : ' · טרם הוגשה'),
      body: availEditor(wk, e.id),
      foot: (sub ? '' : '<button type="button" class="btn btn-primary" id="btnSubmitFor" data-act="avSubmit" data-emp="' + e.id + '">' + icon('check') + 'הגשה בשם ' + esc(e.name) + '</button>') +
        '<button type="button" class="btn" data-act="close">' + (sub ? 'סיום' : 'סגירה') + '</button>',
    };
  },
  emp(s) {
    const d = s.draft;
    return {
      title: d.id ? 'עריכת עובד/ת' : 'עובד/ת חדש/ה',
      body: '<div class="field"><label class="label" for="empName">שם</label><input class="input" id="empName" data-bind="draft.name" value="' + esc(d.name) + '" autocomplete="off" placeholder="למשל: נועה"></div>' +
        '<div class="field"><label class="label" for="empNumber">' + (d.id ? 'מספר אישי חדש (לא חובה)' : 'מספר אישי לכניסה') + '</label>' +
        '<input class="input" id="empNumber" data-bind="draft.number" value="' + esc(d.number || '') + '" inputmode="numeric" autocomplete="off" placeholder="4 עד 12 ספרות" aria-describedby="empNumberHelp">' +
        '<p class="sub" id="empNumberHelp">' + (d.id
          ? 'המספר הקיים שמור באופן מוצפן ואי אפשר להציג אותו. מספר חדש יחליף אותו וינתק את העובד/ת מכל המכשירים.'
          : 'זה המספר שהעובד/ת יקליד/ה בכניסה. כדאי לרשום אותו עכשיו: אחרי השמירה אי אפשר להציג אותו שוב, רק להחליף.') + '</p></div>' +
        '<div class="field"><span class="label">תפקידים שהעובד/ת יכול/ה למלא</span><div class="pick">' +
        state.roles.map(r => '<button type="button" class="pickbtn" id="er-' + r.id + '" aria-pressed="' + d.roles.includes(r.id) + '" data-act="empRole" data-id="' + r.id + '">' + icon('check') + roleChip(r.id) + '</button>').join('') + '</div></div>' +
        '<div class="field field-row"><span class="label">מקסימום משמרות בשבוע</span>' + stepper('emax', d.max, 'empMax', '', 1, maxCap(), 'מקסימום משמרות בשבוע') + '</div>' +
        legalNote('הפרטים נשמרים כדי לבנות את הסידור. לפני שמוסיפים עובד/ת יש ליידע אותו/ה על כך.', 'lnEmp') +
        (s.err ? '<p class="err" role="alert">' + s.err + '</p>' : ''),
      foot: '<button type="button" class="btn btn-primary" id="btnEmpSave" data-act="empSave"' + (s.busy ? ' disabled' : '') + '>' + (s.busy ? 'שומר…' : 'שמירה') + '</button>' +
        (d.id ? confirmBtn('emp-' + d.id, 'מחיקה', 'empDel', '', 'btn btn-danger') : '<button type="button" class="btn" data-act="close">ביטול</button>'),
    };
  },
  import(s) {
    const plan = importPlan(s.rows);
    const n = k => plan.filter(p => p.kind === k).length;
    const taken = new Set(plan.filter(p => p.emp).map(p => p.emp.id));
    const gone = state.employees.filter(e => !taken.has(e.id));
    const unknown = Array.from(new Set(plan.reduce((a, p) => a.concat(p.unknown), [])));
    const label = { new: 'חדש/ה', upd: 'עדכון', same: 'ללא שינוי', err: 'לא ייובא' };
    const rows = plan.map(p => {
      const roles = p.roles ? p.roles.map(id => roleById(id).name).join(', ') : '';
      const sub = p.kind === 'err' ? 'שורה ' + p.row + ': ' + p.err
        : [p.number ? (p.emp ? 'מספר אישי חדש' : 'עם מספר אישי') : '', esc(roles), p.max ? 'עד ' + p.max + ' משמרות' : ''].filter(Boolean).join(' · ') || 'בלי שינוי בפרטים';
      return '<div class="cand"><span class="cand-n">' + esc(p.name || '(ללא שם)') + '</span><span class="cand-s' + (p.kind === 'err' ? ' is-warn' : '') + '">' + sub + '</span>' +
        '<span class="cand-go st-' + p.kind + '">' + label[p.kind] + '</span></div>';
    }).join('');
    const todo = n('new') + n('upd') + (s.remove ? gone.length : 0);
    return {
      title: 'ייבוא עובדים מאקסל', sub: esc(s.file),
      body: '<div class="chips">' +
        (n('new') ? '<span class="chip chip-ok">' + many(n('new'), 'עובד/ת חדש/ה', 'חדשים') + '</span>' : '') +
        (n('upd') ? '<span class="chip">' + many(n('upd'), 'עדכון אחד', 'עדכונים') + '</span>' : '') +
        (n('same') ? '<span class="chip">' + n('same') + ' ללא שינוי</span>' : '') +
        (n('err') ? '<span class="chip chip-bad">' + many(n('err'), 'שורה אחת לא תיובא', 'שורות לא ייובאו') + '</span>' : '') + '</div>' +
        (unknown.length ? '<p class="banner banner-warn">' + icon('alert') + '<span>תפקידים שלא קיימים בהגדרות ולכן דולגו: ' + unknown.map(esc).join(', ') + '.</span></p>' : '') +
        '<div class="cands">' + rows + '</div>' +
        (gone.length ? '<label class="check" for="impRemove"><input type="checkbox" id="impRemove" data-bind="imp.remove"' + (s.remove ? ' checked' : '') + '>' +
          '<span>להסיר מהצוות ' + many(gone.length, 'עובד/ת אחד/ת שלא מופיע/ה', 'עובדים שלא מופיעים') + ' בקובץ: ' + gone.map(e => esc(e.name)).join(', ') + '</span></label>' : '') +
        legalNote('פרטי העובדים נשמרים כדי לבנות את הסידור. לפני הייבוא יש ליידע את העובדים על כך.', 'lnImport') +
        (s.err ? '<p class="err" role="alert">' + s.err + '</p>' : ''),
      foot: '<button type="button" class="btn btn-primary" id="btnImportGo" data-act="importGo"' + (todo && !s.busy ? '' : ' disabled') + '>' + (s.busy ? 'מייבא…' : todo ? 'ייבוא לצוות' : 'אין מה לעדכן') + '</button>' +
        '<button type="button" class="btn" data-act="close">ביטול</button>',
    };
  },
};

/* ---------- Excel (employee list in and out) ---------- */
let excelLoading = null;
function loadExcel() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelLoading) {
    excelLoading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = EXCEL_SRC;
      el.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject({ code: 'lib' }));
      el.onerror = () => { excelLoading = null; reject({ code: 'lib' }); };
      document.head.appendChild(el);
    });
  }
  return excelLoading;
}
const cellText = c => { try { return String(c.text == null ? '' : c.text).trim(); } catch (e) { return ''; } };
// Read employee rows from a workbook: find the header row by its column titles, then one row per person.
function parseEmployees(wb) {
  const RE = { name: /שם|name/i, number: /מספר|קוד|טלפון|נייד|number|phone|code/i, roles: /תפקיד|role/i, max: /מקס|max/i };
  let found = null;
  wb.eachSheet(ws => {
    if (found) return;
    for (let r = 1; r <= Math.min(ws.rowCount, 15) && !found; r++) {
      const cols = {};
      ws.getRow(r).eachCell((c, i) => {
        const t = cellText(c);
        for (const k in RE) if (!cols[k] && RE[k].test(t) && Object.keys(cols).every(q => cols[q] !== i)) { cols[k] = i; break; }
      });
      if (cols.name && cols.number) found = { ws, head: r, cols };
    }
  });
  if (!found) { const ws = wb.worksheets[0]; if (!ws) return []; found = { ws, head: 0, cols: { name: 1, number: 2, roles: 3, max: 4 } }; }
  const ws = found.ws, cols = found.cols, out = [], seen = new Set();
  const known = new Set(state.employees.map(e => normName(e.name)));
  for (let r = found.head + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row.getCell(cols.name)).replace(/\s+/g, ' ');
    const number = normNum(cellText(row.getCell(cols.number)));
    if (!name && !number) continue;
    if (/דוגמה/.test(name)) continue;
    const item = { row: r, name, number, roles: null, unknown: [], max: null, err: '' };
    if (!name) item.err = 'חסר שם';
    else if (name.length > 80) item.err = 'השם ארוך מדי';
    else if (seen.has(normName(name))) item.err = 'השם מופיע פעמיים בקובץ';
    else if (!number && !known.has(normName(name))) item.err = 'לעובד/ת חדש/ה צריך מספר אישי';
    else if (number && !/^\d{4,12}$/.test(number)) item.err = 'המספר האישי צריך להיות 4 עד 12 ספרות';
    else if (number && number === state.managerCode) item.err = 'המספר שמור לקוד המנהל/ת';
    if (name) seen.add(normName(name));
    if (cols.roles) {
      const t = cellText(row.getCell(cols.roles));
      if (t) {
        item.roles = [];
        t.split(/[,;،|\n]+/).map(x => x.trim()).filter(Boolean).forEach(x => {
          const role = state.roles.find(q => normName(q.name) === normName(x));
          if (!role) item.unknown.push(x); else if (!item.roles.includes(role.id)) item.roles.push(role.id);
        });
      }
    }
    if (cols.max) { const m = parseInt(cellText(row.getCell(cols.max)), 10); if (m >= 1) item.max = Math.min(m, maxCap()); }
    out.push(item);
  }
  return out;
}
// Match file rows to the current team by name. Personal numbers cannot be compared, because only
// their hashes are stored: a number in the file simply becomes that person's new number.
function importPlan(rows) {
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  return rows.map(r => {
    if (r.err) return Object.assign({ kind: 'err', emp: null }, r);
    const emp = state.employees.find(e => normName(e.name) === normName(r.name)) || null;
    let kind = 'new';
    if (emp) kind = !r.number && emp.name === r.name && (!r.roles || sameSet(r.roles, emp.roles)) && (!r.max || r.max === emp.max) ? 'same' : 'upd';
    return Object.assign({ kind, emp }, r);
  });
}
async function importFile(file) {
  toast('קורא את הקובץ…');
  let rows;
  try {
    const XL = await loadExcel();
    const wb = new XL.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    rows = parseEmployees(wb);
  } catch (err) {
    toast(err && err.code === 'lib' ? 'לא הצלחתי לטעון את רכיב האקסל. כדאי לבדוק את החיבור לרשת ולנסות שוב.' : 'לא הצלחתי לקרוא את הקובץ. צריך קובץ xlsx במבנה של התבנית.');
    return;
  }
  clearToast();
  if (!rows.length) { toast('לא נמצאו בקובץ שורות של עובדים.'); return; }
  openSheet({ type: 'import', file: file.name, rows, remove: false }, 'btnImport');
}
async function buildWorkbook() {
  const XL = await loadExcel();
  const wb = new XL.Workbook();
  const ws = wb.addWorksheet('עובדים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'שם', key: 'name', width: 22 },
    { header: 'מספר אישי', key: 'number', width: 16 },
    { header: 'תפקידים', key: 'roles', width: 38 },
    { header: 'מקסימום משמרות בשבוע', key: 'max', width: 26 },
  ];
  // Personal numbers are stored only as hashes, so the column is left empty. On import, an empty
  // number keeps a person's current one.
  state.employees.forEach(e => ws.addRow({
    name: e.name, number: '', max: e.max,
    roles: e.roles.map(id => (roleById(id) || {}).name).filter(Boolean).join(', '),
  }));
  ws.eachRow(row => row.eachCell(c => { c.font = { name: 'Arial', size: 11 }; }));
  ws.getRow(1).eachCell(c => {
    c.font = { name: 'Arial', size: 11, bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE55C' } };
  });
  ws.getColumn(2).numFmt = '@';   // keep the numbers as text so a leading zero survives
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_MIME });
}
async function uploadLogo(file) {
  ui.logoBusy = true;
  render();
  let data = null;
  try { data = await logoFromFile(file); }
  catch (err) { toast(err && err.code === 'size' ? 'התמונה גדולה מדי גם אחרי הקטנה. אפשר לנסות קובץ פשוט יותר.' : 'הקובץ הזה לא נפתח כתמונה. אפשר לנסות PNG או JPEG.'); }
  ui.logoBusy = false;
  if (data) await setLogo(data); else render();
}
async function setLogo(data) {
  if (REMOTE) {
    ui.logoBusy = true;
    render();
    let out = null;
    try { out = await rpc('sadran_save_logo', { p_token: net.token, p_logo: data }); }
    catch (err) { ui.logoBusy = false; if (err.code === 'auth') { endSession('expired'); return; } render(); toast(NET_ERR); return; }
    ui.logoBusy = false;
    if (!out || !out.ok) { render(); toast('לא הצלחתי לשמור את הלוגו. אפשר לנסות קובץ PNG או JPEG אחר.'); return; }
    state.logoVer = out.logoVer;
    logoCacheSet(out.logoVer, data);
  }
  state.logo = data;
  render();
  toast(data ? 'הלוגו נשמר.' : 'הלוגו הוסר.');
}
// Inside the Claude viewer a page cannot start a download itself, so it asks the viewer to save.
async function saveFile(filename, blob) {
  if (window.claude && window.claude.use) {
    let dl = null;
    try { dl = await window.claude.use('downloads'); } catch (e) { /* treated as unavailable */ }
    if (!dl) { toast('אי אפשר לשמור קובץ בתצוגה הזו.'); return; }
    try { await dl.save({ filename, data: blob }); toast('הקובץ נשמר.'); }
    catch (err) {
      const code = err && err.code;
      if (code === 'declined') clearToast();
      else toast(code === 'rate_limited' ? 'יש כבר בקשת שמירה פתוחה. אפשר לנסות שוב בעוד רגע.' : 'אי אפשר לשמור קובץ בתצוגה הזו.');
    }
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('הקובץ ירד למכשיר.');
}

/* ---------- roster export ----------
   The week is drawn on a canvas in the export style the manager chose, then saved as a JPEG, or
   wrapped in a one-page PDF (built here, so no library is needed and Hebrew text stays exact). */
const EXPORT_STYLES = [
  { id: 'color', name: 'צבעוני' },
  { id: 'light', name: 'בהיר' },
  { id: 'dark', name: 'כהה' },
  { id: 'print', name: 'להדפסה' },
];
function exportColors(style) {
  const tk = themeTokens(state.theme), L = tk.light, D = tk.dark;
  const base = { miss: '#BE2A1E', missBg: '#FBE3E0', draft: '#8A5000', draftBg: '#FCECC8' };
  if (style === 'dark') return Object.assign(base, { bg: D.bg, panel: D.surface, ink: D.ink, ink3: D['ink-3'], line: D.line, band: D.surface, bandInk: D.ink, title: D.ink, dayBg: D['surface-2'], dayInk: D.ink, accent: D.accent, miss: '#FF8E82', missBg: '#471A1B', draft: '#F2BA5C', draftBg: '#3D2D0C', plate: true });
  if (style === 'print') return Object.assign(base, { bg: '#FFFFFF', panel: '#FFFFFF', ink: '#000000', ink3: '#4A4A4A', line: '#8C8C8C', band: '#FFFFFF', bandInk: '#000000', title: '#000000', dayBg: '#E9E9E9', dayInk: '#000000', accent: '#000000', miss: '#000000', missBg: '#FFFFFF', draft: '#000000', draftBg: '#E9E9E9', rule: true, print: true });
  if (style === 'light') return Object.assign(base, { bg: '#FFFFFF', panel: '#FFFFFF', ink: L.ink, ink3: L['ink-3'], line: L.line, band: '#FFFFFF', bandInk: L['ink-3'], title: L.accent, dayBg: L['accent-soft'], dayInk: L.ink, accent: L.accent, rule: true });
  return Object.assign(base, { bg: L.bg, panel: '#FFFFFF', ink: L.ink, ink3: L['ink-3'], line: L.line, band: L.accent, bandInk: L['accent-ink'], title: L['accent-ink'], dayBg: L.accent, dayInk: L['accent-ink'], accent: L.accent, plate: true });
}
const F_BODY = '"IBM Plex Sans Hebrew", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif';
const F_DISP = '"Secular One", "IBM Plex Sans Hebrew", "Arial Hebrew", Arial, sans-serif';
async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  const want = Promise.all(['400 40px "Secular One"', '600 28px "IBM Plex Sans Hebrew"', '700 28px "IBM Plex Sans Hebrew"'].map(f => document.fonts.load(f, 'אבג'))).catch(() => {});
  await Promise.race([want, new Promise(r => setTimeout(r, 2500))]);
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function fitText(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.measureText(text.slice(0, m) + '…').width <= max) lo = m; else hi = m - 1; }
  return text.slice(0, lo) + '…';
}
// Draw runs of text right to left; runs marked ltr (dates, times) keep their own order.
function drawRuns(g, runs, xRight, y) {
  let x = xRight;
  for (const r of runs) {
    g.font = r.font; g.fillStyle = r.color; g.direction = r.ltr ? 'ltr' : 'rtl'; g.textAlign = 'right';
    g.fillText(r.text, x, y);
    x -= g.measureText(r.text).width + (r.gap == null ? 12 : r.gap);
  }
  g.direction = 'rtl';
  return x;
}
function runsWidth(g, runs) { return runs.reduce((a, r) => { g.font = r.font; return a + g.measureText(r.text).width + (r.gap == null ? 12 : r.gap); }, 0); }
async function drawRoster(wk, slots, styleId, opt) {
  opt = opt || {};
  await fontsReady();
  const C = exportColors(styleId), print = !!C.print;
  const W = 2000, M = 56, LW = 200, DW = (W - 2 * M - LW) / 7, start = fromKey(wk), end = addDays(start, 6);
  const POS = 54, HRS = 30, PADV = 18, HEAD = 200, DAYH = 92, FOOT = 70;   // one line per person: the name, without the role
  const hoursFor = (p, k) => (p.emp ? hoursOf(wk, p.emp, k) : '');
  const rowH = state.shifts.map(sh => {
    let tallest = 0;
    for (let d = 0; d < 7; d++) {
      const k = sk(d, sh.id), list = slots[k] || [];
      tallest = Math.max(tallest, list.reduce((a, p) => a + POS + (hoursFor(p, k) ? HRS : 0), 0));
    }
    return Math.max(tallest, 70) + PADV * 2;
  });
  let logo = null;
  if (state.logo) { logo = new Image(); logo.src = state.logo; try { await logo.decode(); } catch (e) { logo = null; } }
  const H = Math.round(M + HEAD + DAYH + rowH.reduce((a, b) => a + b, 0) + FOOT + M / 2);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.direction = 'rtl'; g.textBaseline = 'middle';
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);

  // header: logo, store, week, status
  const hy = M, hh = HEAD - 28, cy = hy + hh / 2;
  if (C.rule) { g.fillStyle = C.accent; g.fillRect(M, hy + hh - 4, W - 2 * M, 4); }
  else { g.fillStyle = C.band; rrect(g, M, hy, W - 2 * M, hh, 28); g.fill(); }
  let xr = W - M - 36;
  if (logo && logo.naturalWidth) {
    const lh = 104, lw = Math.min(280, logo.naturalWidth * lh / logo.naturalHeight);
    if (C.plate) { g.fillStyle = '#FFFFFF'; rrect(g, xr - lw - 14, cy - lh / 2 - 12, lw + 28, lh + 24, 18); g.fill(); xr -= 14; }
    g.drawImage(logo, xr - lw, cy - lh / 2, lw, lh);
    xr -= lw + (C.plate ? 50 : 36);
  }
  const status = opt.draft ? [{ text: 'טיוטה', font: '700 30px ' + F_BODY, color: C.draft, gap: 0 }]
    : opt.published ? [{ text: 'פורסם', font: '600 26px ' + F_BODY, color: C.bandInk }, { text: dm(new Date(opt.published)), ltr: true, font: '600 26px ' + F_BODY, color: C.bandInk, gap: 0 }] : [];
  const sw = status.length ? runsWidth(g, status) + 44 : 0;
  g.font = '400 66px ' + F_DISP; g.fillStyle = C.title; g.textAlign = 'right';
  g.fillText(fitText(g, state.store.name || 'סידור עבודה', xr - M - 60 - sw), xr, cy - 26);
  drawRuns(g, [{ text: 'סידור עבודה · שבוע', font: '600 30px ' + F_BODY, color: C.bandInk },
    { text: weekLabel(wk) + '.' + end.getFullYear(), ltr: true, font: '600 30px ' + F_BODY, color: C.bandInk }], xr, cy + 40);
  if (status.length) {
    const bx = M + 30, bw = sw;
    if (opt.draft) { g.fillStyle = C.draftBg; rrect(g, bx, cy - 30, bw, 60, 30); g.fill(); }
    drawRuns(g, status, bx + bw - 22, cy);
  }

  // day header row
  const y0 = M + HEAD, gx = M, gw = W - 2 * M;
  g.fillStyle = C.dayBg; rrect(g, gx, y0, gw - LW - 8, DAYH - 10, 18); g.fill();
  for (let d = 0; d < 7; d++) {
    const xR = W - M - LW - d * DW - 20, date = addDays(start, d);
    drawRuns(g, [{ text: DAYS[d], font: '400 36px ' + F_DISP, color: C.dayInk }, { text: dm(date), ltr: true, font: '600 26px ' + F_BODY, color: C.dayInk }], xR, y0 + (DAYH - 10) / 2);
  }

  // shift rows
  let y = y0 + DAYH;
  state.shifts.forEach((sh, si) => {
    const h = rowH[si];
    g.fillStyle = C.panel; g.fillRect(gx, y, gw, h);
    g.strokeStyle = C.line; g.lineWidth = 2;
    g.beginPath(); g.moveTo(gx, y + h); g.lineTo(gx + gw, y + h); g.stroke();
    g.font = '400 34px ' + F_DISP; g.fillStyle = C.ink; g.textAlign = 'right';
    g.fillText(fitText(g, sh.name, LW - 30), W - M - 16, y + PADV + 22);
    g.direction = 'ltr'; g.font = '600 24px ' + F_BODY; g.fillStyle = C.ink3;
    g.fillText(sh.start + '–' + sh.end, W - M - 16, y + PADV + 62);
    g.direction = 'rtl';
    for (let d = 0; d < 7; d++) {
      const xR = W - M - LW - d * DW, k = sk(d, sh.id), list = slots[k] || [];
      g.strokeStyle = C.line; g.lineWidth = 2;
      g.beginPath(); g.moveTo(xR, y); g.lineTo(xR, y + h); g.stroke();
      if (!list.length) {
        g.font = '600 26px ' + F_BODY; g.fillStyle = C.ink3; g.textAlign = 'right';
        g.fillText(state.closed[k] ? 'סגור' : '—', xR - 18, y + PADV + 26);
        continue;
      }
      let py = y + PADV;
      for (const p of list) {
        const e = p.emp ? empById(p.emp) : null, hrs = hoursFor(p, k), me = opt.me && p.emp === opt.me;
        g.textAlign = 'right';
        if (!p.emp) {
          if (!print) { g.fillStyle = C.missBg; rrect(g, xR - DW + 12, py + 7, DW - 30, 40, 8); g.fill(); }
          g.font = '700 26px ' + F_BODY; g.fillStyle = C.miss; g.fillText('חסר שיבוץ', xR - 22, py + 28);
        } else {
          g.font = (me ? '700 ' : '600 ') + '30px ' + F_BODY; g.fillStyle = me ? C.accent : C.ink;
          g.fillText(fitText(g, e ? e.name : 'עובד/ת שנמחק/ה', DW - 40), xR - 18, py + 28);
          if (me) { g.fillStyle = C.accent; g.fillRect(xR - 8, py + 9, 4, 38); }
        }
        if (hrs) { g.direction = 'ltr'; g.font = '600 22px ' + F_BODY; g.fillStyle = C.ink3; g.fillText(fitText(g, hrs, DW - 40), xR - 18, py + 64); g.direction = 'rtl'; }
        py += POS + (hrs ? HRS : 0);
      }
    }
    y += h;
  });
  g.strokeStyle = C.line; g.lineWidth = 2; g.strokeRect(gx, y0 + DAYH, gw, y - y0 - DAYH);

  // footer
  const now = new Date();
  g.textAlign = 'left'; g.direction = 'ltr'; g.font = '600 22px ' + F_BODY; g.fillStyle = C.ink3;
  g.fillText(dm(now) + '.' + now.getFullYear(), M, y + FOOT / 2 + 6);
  g.textAlign = 'right'; g.direction = 'rtl';
  g.fillText('הופק בסדרן', W - M, y + FOOT / 2 + 6);
  return cv;
}
// A one-page PDF around a JPEG, fitted to A4 in the image's orientation.
function pdfFromJpeg(jpeg, w, h, title) {
  const land = w >= h, PW = land ? 842 : 595, PH = land ? 595 : 842, m = 24;
  const sc = Math.min((PW - 2 * m) / w, (PH - 2 * m) / h), dw = w * sc, dh = h * sc;
  const te = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const add = x => { const b = typeof x === 'string' ? te.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, dict, stream) => {
    offs[n] = len;
    add(n + ' 0 obj\n' + dict);
    if (stream) { add('\nstream\n'); add(stream); add('\nendstream'); }
    add('\nendobj\n');
  };
  const utf16 = str => '<FEFF' + Array.from(str).map(ch => {
    const cp = ch.codePointAt(0);
    if (cp < 0x10000) return cp.toString(16).padStart(4, '0');
    const v = cp - 0x10000;
    return (0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16);
  }).join('').toUpperCase() + '>';
  const draw = te.encode('q ' + [dw, 0, 0, dh, (PW - dw) / 2, (PH - dh) / 2].map(v => +v.toFixed(2)).join(' ') + ' cm /Im0 Do Q');
  add(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  obj(4, '<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>', jpeg);
  obj(5, '<< /Length ' + draw.length + ' >>', draw);
  obj(6, '<< /Title ' + utf16(title) + ' /Creator (Sadran) /Producer (Sadran) >>');
  const xref = len;
  add('xref\n0 7\n0000000000 65535 f \n' + [1, 2, 3, 4, 5, 6].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join(''));
  add('trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  const out = new Uint8Array(len);
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}
const canShareFiles = (() => {
  try { return !inViewer && !!navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' })] }); } catch (e) { return false; }
})();
async function openExport(wk, slots, opt, from) {
  const s = { type: 'export', wk, fmt: 'pdf', style: state.exportStyle || 'color', mgr: !!opt.mgr, draft: !!opt.draft, url: '', blobs: null, fail: false, canShare: canShareFiles };
  openSheet(s, from);
  try {
    const cv = await drawRoster(wk, slots, s.style, opt);
    const jpg = await new Promise((ok, bad) => cv.toBlob(b => (b ? ok(b) : bad(new Error('jpeg'))), 'image/jpeg', .92));
    const title = (state.store.name ? state.store.name + ' · ' : '') + 'סידור עבודה ' + weekLabel(wk);
    const pdf = new Blob([pdfFromJpeg(new Uint8Array(await jpg.arrayBuffer()), cv.width, cv.height, title)], { type: 'application/pdf' });
    s.blobs = { jpg, pdf };
    s.url = cv.toDataURL('image/jpeg', .8);
  } catch (e) { s.fail = true; }
  if (ui.sheet === s) renderSheet(false);
}
// The small preview in the settings, redrawn only when something it shows has changed.
let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    if (ui.view !== 'setup' || !document.getElementById('xPrev')) return;
    const wk = ui.week, w = syncWeek(wk);
    const key = canon({ s: state.exportStyle, t: state.theme, l: state.logoVer || (state.logo || '').length, n: state.store.name, sh: state.shifts, r: state.roles, c: state.closed, w: w.slots, wk });
    if (key === ui.xprev.key) return;
    try {
      const cv = await drawRoster(wk, w.slots, state.exportStyle || 'color', { published: w.published && w.published.at });
      const sm = document.createElement('canvas');
      sm.width = 800; sm.height = Math.round(cv.height * 800 / cv.width);
      sm.getContext('2d').drawImage(cv, 0, 0, sm.width, sm.height);
      ui.xprev = { key, url: sm.toDataURL('image/jpeg', .85) };
      const el = document.getElementById('xPrev');
      if (el && el.tagName === 'IMG') el.src = ui.xprev.url;
      else if (el) el.outerHTML = '<img class="xprev" id="xPrev" alt="תצוגה מקדימה של הסידור בעיצוב שנבחר" src="' + ui.xprev.url + '">';
    } catch (e) { /* the preview stays as it was */ }
  }, 250);
}

/* ---------- legal pages and consents ----------
   Everything legal is in content/legal/: the texts (Markdown), the business details that fill their
   {{PLACEHOLDERS}} (business.json), and the registry of pages, consent types and cookie categories
   (legal.json). Adding a page or a consent type is an entry there; nothing here needs to change. */
const CONSENT_KEY = 'sadran.consent';
const legal = { ready: false, failed: false, reg: null, biz: {}, docs: {}, bundle: null };
function legalFile(name) {
  const el = document.getElementById('legalBundle');   // the single-file demo carries the texts inside the page
  if (el) {
    try { if (!legal.bundle) legal.bundle = JSON.parse(el.textContent); } catch (e) { return Promise.reject(e); }
    return name in legal.bundle ? Promise.resolve(legal.bundle[name]) : Promise.reject(new Error(name));
  }
  return fetch('content/legal/' + name, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(name); return r.text(); });
}
async function loadLegal() {
  try {
    const got = await Promise.all([legalFile('legal.json'), legalFile('business.json')]);
    const reg = JSON.parse(got[0]);
    if (!Array.isArray(reg.pages) || !Array.isArray(reg.consents) || !reg.cookies || !Array.isArray(reg.cookies.categories)) throw new Error('shape');
    legal.reg = reg;
    legal.biz = JSON.parse(got[1]) || {};
    legal.ready = true;
    legal.failed = false;
  } catch (e) { legal.failed = true; }
  return legal.ready;
}
const legalPage = id => (legal.ready && legal.reg.pages.find(p => p.id === id)) || null;
const bizValue = k => String(legal.biz[k] == null ? '' : legal.biz[k]).trim();
const missingDetails = () => (legal.ready ? Object.keys(legal.reg.placeholders || {}).filter(k => !bizValue(k)) : []);
const dateHe = iso => { const q = String(iso || '').split('-'); return q.length === 3 ? +q[2] + '.' + +q[1] + '.' + q[0] : String(iso || ''); };
function legalNote(text, id) {
  return legalPage('privacy') ? '<p class="sub legal-note">' + text + ' <a href="#privacy" id="' + id + '">מדיניות הפרטיות</a></p>' : '';
}

/* A small, strict Markdown reader for the legal texts: headings, paragraphs, lists, bold and links.
   All text is escaped first, so a legal text or a business detail can never inject markup. */
const SAFE_URL = /^(#[a-z][a-z0-9-]*|https:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+0-9-]+)$/i;
// {{KEY}} becomes the business detail of that name. One that is still empty is shown highlighted,
// so a missing detail is never mistaken for finished text.
function fillDetails(escaped) {
  return escaped.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    const v = bizValue(k);
    return v ? esc(v) : '<mark class="ph">[להשלים: ' + esc((legal.reg.placeholders || {})[k] || k) + ']</mark>';
  });
}
const mdText = t => fillDetails(esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
function mdLink(text, href) {
  let missing = false;
  const url = href.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => { const v = bizValue(k); if (!v) missing = true; return v; });
  if (missing || !SAFE_URL.test(url)) return mdText(text);
  const out = /^https:/i.test(url);
  return '<a href="' + esc(url) + '"' + (out ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + mdText(text) +
    (out ? '<span class="vh"> (נפתח בלשונית חדשה)</span>' : '') + '</a>';
}
function mdInline(raw) {
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(raw))) { out += mdText(raw.slice(last, m.index)) + mdLink(m[1], m[2]); last = re.lastIndex; }
  return out + mdText(raw.slice(last));
}
function mdToHtml(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const BLOCK = /^(#{1,4}\s|\s*[-*]\s+|\s*\d+[.)]\s+|>\s?|---+\s*$|\{\{COOKIE_TABLE\}\}\s*$)/;
  let html = '', i = 0, m;
  const list = (tag, re) => {
    html += '<' + tag + '>';
    while (i < lines.length && re.test(lines[i])) { html += '<li>' + mdInline(lines[i].replace(re, '').trim()) + '</li>'; i++; }
    html += '</' + tag + '>';
  };
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { html += '<h' + m[1].length + '>' + mdInline(m[2].trim()) + '</h' + m[1].length + '>'; i++; continue; }
    if (/^\{\{COOKIE_TABLE\}\}\s*$/.test(l)) { html += cookieTable(); i++; continue; }
    if (/^---+\s*$/.test(l)) { html += '<hr>'; i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) { list('ul', /^\s*[-*]\s+/); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { list('ol', /^\s*\d+[.)]\s+/); continue; }
    if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '').trim()); i++; }
      html += '<blockquote><p>' + mdInline(q.join(' ')) + '</p></blockquote>';
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !BLOCK.test(lines[i])) { para.push(lines[i].trim()); i++; }
    html += '<p>' + mdInline(para.join(' ')) + '</p>';
  }
  return html;
}
// What the site keeps in the browser, built from the cookie categories in legal.json.
function cookieTable() {
  return legal.reg.cookies.categories.filter(cat => (cat.items || []).length).map(cat =>
    '<h3>' + esc(cat.title) + '</h3>' + (cat.description ? '<p>' + esc(cat.description) + '</p>' : '') +
    '<ul class="stored">' + cat.items.map(it => '<li><strong>' + esc(it.what) + '</strong> <code dir="ltr">' + esc(it.name) + '</code>' +
      '<span>' + esc(it.why) + '.</span><span class="stored-k">נשמר: ' + esc(it.kept) + '.</span></li>').join('') + '</ul>').join('');
}
function loadDoc(pg) {
  if (pg.file in legal.docs) return;
  legal.docs[pg.file] = null;   // loading
  legalFile(pg.file).then(t => { legal.docs[pg.file] = t; }, () => { legal.docs[pg.file] = false; }).then(() => { if (ui.legal === pg.id) render(); });
}
function viewLegal(id) {
  const pg = legalPage(id);
  const back = '<p class="legal-back"><a href="#' + esc(ui.lastHash || '') + '" id="legalBack">' + icon('right') + 'חזרה</a></p>';
  if (!pg) return back;
  loadDoc(pg);
  const doc = legal.docs[pg.file];
  if (doc === false) {
    return back + '<section class="card empty"><h1 class="h2">' + esc(pg.title) + '</h1><p class="sub">לא הצלחתי לטעון את המסמך. כדאי לבדוק את החיבור ולנסות שוב.</p>' +
      '<button type="button" class="btn" id="legalRetry" data-act="legalRetry">ניסיון חוזר</button></section>';
  }
  if (doc == null) return back + '<section class="gate" aria-busy="true"><p>טוען…</p></section>';
  const meta = '<p class="sub legal-meta">עודכן לאחרונה: ' + ltr(dateHe(pg.updated)) + ' · גרסה ' + ltr(pg.version) + '</p>';
  let html = mdToHtml(doc);
  html = html.indexOf('</h1>') >= 0 ? html.replace('</h1>', '</h1>' + meta) : '<h1>' + esc(pg.title) + '</h1>' + meta + html;
  return back + '<article class="legal card">' + html + '</article>' +
    (id === 'cookies' ? '<div><button type="button" class="btn" id="ckOpen" data-act="cookiePrefs">הגדרות עוגיות</button></div>' : '');
}
function footHtml() {
  if (!legal.ready) return legal.failed ? '<span>המסמכים המשפטיים לא נטענו.</span><button type="button" class="linklike" id="legalRetry2" data-act="legalRetry">ניסיון חוזר</button>' : '';
  return '<nav class="foot-in" aria-label="מידע משפטי">' +
    legal.reg.pages.filter(pg => pg.footer).map(pg => '<a href="#' + esc(pg.id) + '"' + (ui.legal === pg.id ? ' aria-current="page"' : '') + '>' + esc(pg.title) + '</a>').join('') +
    '<button type="button" class="linklike" id="ckPrefs" data-act="cookiePrefs">הגדרות עוגיות</button></nav>' +
    '<span class="foot-v">סדרן ' + ltr(APP_VERSION) + '</span>';
}
// What the manager sees in the settings: the documents, and which business details are still missing.
function legalCard() {
  if (!legal.ready) return '';
  const miss = missingDetails();
  return '<section class="card stack"><div><h2 class="h2">מסמכים משפטיים</h2><p class="sub">הדפים שמקושרים בתחתית האתר. את הנוסח ואת פרטי העסק עורכים בקבצים שבתיקייה ' + ltr('content/legal') + ' באתר.</p></div>' +
    '<ul class="doclist">' + legal.reg.pages.map(pg => '<li><a href="#' + esc(pg.id) + '">' + esc(pg.title) + '</a><span class="sub">גרסה ' + ltr(pg.version) + ' · ' + ltr(dateHe(pg.updated)) +
      (pg.reviewed ? '' : ' · טרם אושר על ידי עורך/ת דין') + '</span></li>').join('') + '</ul>' +
    (miss.length
      ? '<p class="banner banner-warn">' + icon('alert') + '<span>' + many(miss.length, 'פרט אחד של העסק חסר במסמכים, ומסומן בהם בצהוב', 'פרטים של העסק חסרים במסמכים, ומסומנים בהם בצהוב') +
        '. ממלאים אותם בקובץ ' + ltr('content/legal/business.json') + '.</span></p>' +
        '<details class="fold" data-fold="legalMissing"' + (ui.open.legalMissing ? ' open' : '') + '><summary>מה חסר (' + miss.length + ')</summary><ul class="miss">' +
        miss.map(k => '<li>' + esc(legal.reg.placeholders[k]) + '</li>').join('') + '</ul></details>'
      : '<p class="banner banner-ok">' + icon('check') + '<span>כל פרטי העסק מולאו.</span></p>') + '</section>';
}

/* ---------- consents ----------
   The consent types come from legal.json. A required one (the terms) blocks the app until it is
   given for the current version of its text; an optional one is always a separate, unticked box.
   Each decision is recorded with its version, time and the screen it was made on. */
const myRole = () => (state.prefs.session ? state.prefs.session.role : null);
const subjectKey = () => { const q = state.prefs.session; return !q ? null : q.role === 'manager' ? 'manager' : q.id; };
function myConsents() {
  if (REMOTE) return state.consents || {};
  const log = state.consentLog || (state.consentLog = {});
  return log[subjectKey()] || {};
}
const consentsFor = role => (legal.ready ? legal.reg.consents.filter(c => c.enabled && (!c.audience || c.audience.indexOf(role) >= 0)) : []);
// Required consents the signed-in person has not given for the current version of the text.
function needsAgreement() {
  const role = myRole();
  if (!role) return [];
  const mine = myConsents();
  return consentsFor(role).filter(c => c.required && !(mine[c.id] && mine[c.id].granted && mine[c.id].version === c.version));
}
// What the agreement screen asks: the missing required consents, and optional ones never answered.
function agreeList() {
  const mine = myConsents();
  return needsAgreement().concat(consentsFor(myRole()).filter(c => !c.required && !mine[c.id]));
}
async function setConsent(c, granted, source, details) {
  if (REMOTE) {
    state.consents = await rpc('sadran_consent_set', { p_token: net.token, p_consent: c.id, p_version: c.version, p_granted: granted, p_source: source, p_details: details || {} });
    return;
  }
  const log = state.consentLog || (state.consentLog = {}), k = subjectKey();
  (log[k] || (log[k] = {}))[c.id] = { version: c.version, granted, at: Date.now(), source, details: details || {} };
}
// One unticked box per consent, never merged: agreeing to the terms and opting in to anything
// optional stay separate choices. An optional consent shows its fields once it is ticked.
function consentBoxes(scope, list, st) {
  return list.map(c => {
    const id = scope + '-' + c.id, on = !!st.checked[c.id];
    const fields = !c.required && on ? (c.fields || []).map(f => {
      const kind = f.type === 'email' || f.type === 'tel' ? f.type : 'text';
      return '<div class="field"><label class="label" for="' + id + '-' + esc(f.id) + '">' + esc(f.label) + '</label><input class="input" id="' + id + '-' + esc(f.id) + '" type="' + kind + '" data-bind="cf.' + scope + '.' + esc(c.id) + '.' + esc(f.id) +
        '" value="' + esc((st.fields[c.id] || {})[f.id] || '') + '" autocomplete="' + (kind === 'text' ? 'off' : kind) + '"' + (kind === 'text' ? '' : ' dir="ltr"') + '></div>';
    }).join('') : '';
    return '<label class="check" for="' + id + '"><input type="checkbox" id="' + id + '" data-bind="cc.' + scope + '.' + esc(c.id) + '"' + (on ? ' checked' : '') + (c.required ? ' required' : '') + '>' +
      '<span>' + mdInline(c.label) + (c.required ? '' : ' <span class="sub">(לא חובה)</span>') + '</span></label>' + fields;
  }).join('');
}
// Check a form's boxes against the consents it shows. Returns an error text, or ''.
function consentError(list, st, scope) {
  st.bad = '';
  for (const c of list) {
    if (c.required && !st.checked[c.id]) { st.bad = scope + '-' + c.id; return 'כדי להמשיך צריך לסמן את האישור.'; }
    if (!c.required && st.checked[c.id]) for (const f of c.fields || []) {
      const v = String((st.fields[c.id] || {})[f.id] || '').trim();
      st.bad = scope + '-' + c.id + '-' + f.id;
      if (f.required && !v) return 'חסר: ' + esc(f.label) + '.';
      if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'כתובת הדוא״ל אינה תקינה.';
      st.bad = '';
    }
  }
  return '';
}
async function recordConsents(list, st, source) {
  for (const c of list) {
    if (c.required) await setConsent(c, true, source);
    else if (st.checked[c.id]) await setConsent(c, true, source, st.fields[c.id] || {});
  }
}
const consentState = scope => (scope === 'pf' ? ui.sheet && ui.sheet.consent : ui.agree);
function viewAgree() {
  const st = ui.agree, mine = myConsents(), again = needsAgreement().some(c => mine[c.id]);
  return '<section class="signin">' +
    '<div class="signin-h"><h1 class="h1">' + (again ? 'התנאים התעדכנו' : 'לפני שממשיכים') + '</h1><p class="sub">' +
    (again ? 'תנאי השימוש או מדיניות הפרטיות השתנו. כדי להמשיך צריך לאשר את הנוסח החדש.' : 'כדי להשתמש באתר צריך לאשר את תנאי השימוש ואת מדיניות הפרטיות.') + '</p></div>' +
    '<form class="card form" id="agreeForm" data-form="agreeGo" novalidate>' + consentBoxes('ag', agreeList(), st) +
    (st.err ? '<p class="err" role="alert">' + st.err + '</p>' : '') +
    '<button type="submit" class="btn btn-primary btn-block" id="btnAgree"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'שומר…' : 'המשך') + '</button></form>' +
    '<div class="signin-foot"><button type="button" class="btn btn-quiet" id="btnAgreeOut" data-act="signOut">יציאה בלי לאשר</button></div></section>';
}
// A link in a message that withdraws a consent: ?unsubscribe=<token>
function unsubToken() { try { return new URLSearchParams(location.search).get('unsubscribe'); } catch (e) { return null; } }
function viewUnsub() {
  const st = (ui.unsub || {}).state;
  const text = st === 'ok' ? 'ההסכמה בוטלה, ולא יישלחו אליך עוד הודעות מהסוג הזה.'
    : st === 'bad' ? 'הקישור אינו תקף. ייתכן שההסכמה כבר בוטלה. אפשר לבדוק זאת ב"הגדרות עוגיות" שבתחתית האתר, אחרי כניסה.'
    : st === 'net' ? NET_ERR : 'מבטל את ההסכמה…';
  return '<section class="signin"><div class="card empty"><h1 class="h2">' + (st === 'ok' ? 'ההסכמה בוטלה' : 'ביטול הסכמה') + '</h1><p class="sub"' + (st === 'busy' ? ' aria-busy="true"' : '') + '>' + text + '</p>' +
    (st === 'busy' ? '' : '<button type="button" class="btn btn-primary" id="btnUnsubDone" data-act="unsubDone">' + (st === 'net' ? 'ניסיון חוזר' : 'המשך לאתר') + '</button>') + '</div></section>';
}

/* ---------- cookies and storage ----------
   Only what the site needs in order to work is kept without asking. Anything in an optional category
   of legal.json (analytics, marketing) loads only after the visitor allows that category. */
let cookieMem = null;   // the choice for this visit, if the browser refuses to store it
function cookieChoice() {
  if (!legal.ready) return null;
  const cfg = legal.reg.cookies;
  let c = cookieMem;
  if (!c) { try { c = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); } catch (e) { c = null; } }
  if (!c || c.v !== cfg.version || !c.at || Date.now() - c.at > (cfg.renewAfterDays || 365) * 864e5) return null;
  return c;
}
const optionalCats = () => (legal.ready ? legal.reg.cookies.categories.filter(c => !c.required && ((c.items || []).length || (c.scripts || []).length)) : []);
const catAllowed = id => { const c = cookieChoice(); return !!(c && c.choices && c.choices[id] === true); };
const loadedScripts = {};
// Load the scripts of every optional category the visitor has allowed. Nothing else ever loads them.
function applyCookieChoice() {
  for (const cat of optionalCats()) {
    if (!catAllowed(cat.id)) continue;
    for (const sc of cat.scripts || []) {
      if (!sc || !sc.src || loadedScripts[sc.src]) continue;
      loadedScripts[sc.src] = true;
      const el = document.createElement('script');
      el.src = sc.src;
      el.async = true;
      for (const k in sc.attrs || {}) el.setAttribute(k, sc.attrs[k]);
      document.head.appendChild(el);
    }
  }
}
// Store the choice. True when something that was allowed is now refused, which needs a reload to stop it.
function saveCookieChoice(choices, source) {
  const before = cookieChoice();
  const refused = optionalCats().filter(c => before && before.choices && before.choices[c.id] && !choices[c.id]);
  cookieMem = { v: legal.reg.cookies.version, at: Date.now(), choices, source };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(cookieMem)); } catch (e) { /* kept for this visit only */ }
  for (const cat of refused) for (const it of cat.items || []) {
    if (it.cookie) document.cookie = it.name + '=; Max-Age=0; path=/';
  }
  applyCookieChoice();
  return refused.length > 0;
}
// Draw the notice, and keep room for it below the page so it never covers what is being read.
function paintCookie() {
  const root = $('#cookieRoot');
  root.innerHTML = cookieBanner();
  const el = root.firstElementChild;
  document.documentElement.style.setProperty('--ck-h', (el ? Math.ceil(el.getBoundingClientRect().height) : 0) + 'px');
}
function cookieBanner() {
  if (!legal.ready || cookieChoice() || (ui.sheet && ui.sheet.type === 'privacy')) return '';
  const opt = optionalCats();
  return '<section class="ck" role="region" aria-label="עוגיות ופרטיות"><div class="ck-in"><p class="ck-t">' +
    (opt.length
      ? 'האתר שומר במכשיר מידע שנחוץ להפעלתו. רק באישורך יופעלו גם: ' + opt.map(c => esc(c.title)).join(', ') + '.'
      : 'האתר שומר במכשיר רק מידע שנחוץ להפעלתו, כמו הכניסה שלך. אין בו כלי ניתוח, פרסום או מעקב.') +
    (legalPage('cookies') ? ' <a href="#cookies">פירוט מלא</a>' : '') + '</p><div class="ck-b">' +
    (opt.length
      ? '<button type="button" class="btn" id="ckAll" data-act="ckAll">אישור הכול</button><button type="button" class="btn" id="ckNone" data-act="ckNone">רק מה שהכרחי</button>' +
        '<button type="button" class="btn btn-quiet" id="ckMore" data-act="cookiePrefs">התאמה אישית</button>'
      : '<button type="button" class="btn btn-primary" id="ckNone" data-act="ckNone">הבנתי</button><button type="button" class="btn btn-quiet" id="ckMore" data-act="cookiePrefs">פרטים</button>') +
    '</div></div></section>';
}

/* ---------- rendering ---------- */
function tabsHtml() {
  const pending = state.employees.filter(e => !isSubmitted(ui.week, e.id)).length;
  return Object.keys(VIEWS).filter(id => VIEWS[id].mode === state.prefs.session.role).map(id => {
    const v = VIEWS[id];
    return '<button type="button" class="tab" data-act="nav" data-view="' + id + '"' + (!ui.legal && ui.view === id ? ' aria-current="page"' : '') + '>' + icon(v.icon) + '<span>' + v.label + '</span>' +
      (id === 'availability' && pending ? '<i class="badge" aria-label="' + pending + ' טרם הגישו">' + pending + '</i>' : '') + '</button>';
  }).join('');
}
// An error message is tied to the fields of its form, so it is read again on returning to fix them;
// the field at fault (when known) is marked invalid.
function linkErrors(root, prefix, st) {
  root.querySelectorAll('.err[role="alert"]').forEach((msg, i) => {
    const box = msg.closest('form, .sheet');
    if (!box) return;
    if (!msg.id) msg.id = prefix + 'Err' + i;
    box.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea').forEach(f => {
      const d = f.getAttribute('aria-describedby');
      f.setAttribute('aria-describedby', d ? d + ' ' + msg.id : msg.id);
    });
  });
  const bad = st && st.err && st.bad ? document.getElementById(st.bad) : null;
  if (bad && root.contains(bad)) bad.setAttribute('aria-invalid', 'true');
}
// For a field whose message is shown outside its form: mark the field and point it at the message.
const fieldErr = (err, id, help) => (err ? ' aria-invalid="true" aria-describedby="' + id + '"' : help ? ' aria-describedby="' + help + '"' : '');
function renderSheet(opening) {
  const root = $('#sheetRoot'), s = ui.sheet;
  const def = s ? SHEETS[s.type](s) : null;
  if (!def) { ui.sheet = null; root.innerHTML = ''; document.body.classList.remove('has-sheet'); setBackgroundInert(false); return; }
  setBackgroundInert(true);
  const old = $('.sheet-b', root), top = old ? old.scrollTop : 0;
  root.innerHTML = '<div class="sheet-wrap" data-act="backdrop"><div class="sheet' + (opening ? ' is-in' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(def.title) + '" tabindex="-1">' +
    '<div class="sheet-h"><div><h2 class="h2">' + esc(def.title) + '</h2>' + (def.sub ? '<p class="sub">' + def.sub + '</p>' : '') + '</div>' +
    '<button type="button" class="btn btn-icon btn-quiet" id="sheetClose" data-act="close" aria-label="סגירה">' + icon('x') + '</button></div>' +
    '<div class="sheet-b">' + def.body + '</div>' + (def.foot ? '<div class="sheet-f">' + def.foot + '</div>' : '') + '</div></div>';
  $('.sheet-b', root).scrollTop = top;
  linkErrors(root, 'sheet', s.consent && s.consent.bad ? { err: s.err, bad: s.consent.bad } : s);
  document.body.classList.add('has-sheet');
  if (opening) $('.sheet', root).focus({ preventScroll: true });
}
const GATES = {
  landing: { title: 'סידור עבודה שבועי לחנויות', html: () => viewLanding(), wide: true },
  stores: { title: 'בחירת חנות', html: () => viewStores() },
  open: { title: 'פתיחת חנות חדשה', html: () => viewOpen() },
  signin: { title: 'כניסה', html: () => viewSignin() },
  loading: { title: 'טוען', html: () => viewLoading() },
  down: { title: 'אין חיבור לשרת', html: () => viewDown() },
  agree: { title: 'אישור התנאים', html: () => viewAgree() },
  unsub: { title: 'ביטול הסכמה', html: () => viewUnsub() },
};
let lastRoute;
function render() {
  const key = focusKey(document.activeElement), hadSheet = !!$('#sheetRoot .sheet');
  if (state.example && !stillExample(state)) state.example = false;
  let s = state.prefs.session;
  if (s && s.role === 'employee' && !empById(s.id)) {
    if (REMOTE && net.phase === 'ready') { endSession('removed'); return; }
    s = state.prefs.session = null;
  }
  const who = subjectKey() || '';
  if (ui.agreeFor !== who) { ui.agreeFor = who; ui.agree = { checked: {}, fields: {}, err: '', busy: false }; }
  // A front screen asked for by name comes first; otherwise a signed-in person gets the app, and
  // anyone else the sign-in screen of the store this device knows, or the product's front page.
  const signedIn = !!shop.id && (REMOTE ? net.phase === 'ready' : !!s);
  let gate = ui.unsub ? 'unsub'
    : REMOTE && (net.phase === 'loading' || net.phase === 'down') ? net.phase
    : ui.entry ? ui.entry
    : signedIn ? null : shop.id ? 'signin' : 'landing';
  if (!gate && needsAgreement().length) gate = 'agree';
  if (gate && ui.sheet && ui.sheet.type !== 'privacy') ui.sheet = null;
  // The front screens belong to the product, not to a store: its own colours, and no store name.
  const neutral = !shop.id || !!ui.entry;
  const main = $('#view'), logoEl = $('#brandLogo');
  applyTheme(neutral);
  $('#storeName').textContent = neutral ? '' : state.store.name;
  if (state.logo && !neutral) {
    if (logoEl.getAttribute('src') !== state.logo) logoEl.src = state.logo;
    logoEl.alt = 'לוגו';   // the store's name follows it as text
    logoEl.hidden = false;
    $('#brandMark').hidden = true;
  } else { logoEl.hidden = true; logoEl.removeAttribute('src'); $('#brandMark').hidden = false; }
  $('#app').classList.toggle('has-tabs', !gate);
  $('#tabsBottom').hidden = !!gate;
  if (gate) {
    $('#sess').innerHTML = '';
    $('#tabsTop').innerHTML = '';
    $('#tabsBottom').innerHTML = '';
  } else {
    if (!VIEWS[ui.view] || VIEWS[ui.view].mode !== s.role) ui.view = s.role === 'manager' ? 'schedule' : 'my-availability';
    syncWeek(ui.week);
    $('#sess').innerHTML = (REMOTE ? '<span class="sync" id="syncState"></span>' : '') + '<span class="sess-who"><span class="sess-n">' + (s.role === 'manager' ? 'מנהל/ת' : esc(empById(s.id).name)) + '</span>' +
      (s.role === 'employee' ? '<span class="sess-r">עובד/ת</span>' : '') + '</span>' +
      '<button type="button" class="sess-out" id="btnOut" data-act="signOut">יציאה</button>';
    const tabs = tabsHtml();
    $('#tabsTop').innerHTML = tabs;
    $('#tabsBottom').innerHTML = tabs;
  }
  let html, title, wide = false;
  if (ui.legal) { html = viewLegal(ui.legal); title = (legalPage(ui.legal) || {}).title || 'מסמך'; }
  else if (gate) { const g = GATES[gate] || GATES.signin; html = g.html(); title = g.title; wide = !!g.wide; }
  else { const v = VIEWS[ui.view]; html = v.html(); title = v.label; wide = !!v.wide; }
  main.className = 'main' + (wide ? '' : ' is-narrow');
  main.innerHTML = html;
  linkErrors(main, 'view', ui.legal ? null : gate === 'open' ? ui.newStore : gate === 'agree' ? ui.agree : null);
  $('#foot').innerHTML = footHtml();
  paintCookie();
  renderSheet(false);
  save();
  paintSync();
  document.title = title + ' · סדרן';
  const route = ui.legal || gate || ui.view, moved = lastRoute !== undefined && route !== lastRoute;
  if (moved) $('#routeStatus').textContent = title;
  lastRoute = route;
  if (!gate && !ui.legal && ui.view === 'setup') schedulePreview();
  if (hadSheet && !ui.sheet) focusBack(); else restoreFocus(key);
  // After moving to another screen, keyboard and screen-reader users continue from its start.
  if (moved && (!document.activeElement || document.activeElement === document.body)) main.focus({ preventScroll: true });
}
/* Keyboard focus survives a redraw: by id where the control has one, otherwise by what it does. */
let sheetFrom = null;
// A dialog and a place on the page wait here while a legal page opened from them is read.
let parked = null;
const isShown = el => !!(el && el.getClientRects().length);
const linksTo = href => Array.from(document.querySelectorAll('a[href]')).filter(a => a.getAttribute('href') === href);
function focusKey(el) {
  if (!el || el === document.body || !el.dataset) return null;
  let key = null;
  if (el.id) key = { id: el.id };
  else if (el.dataset.act) key = { act: el.dataset.act, ds: JSON.stringify(el.dataset) };
  else if (el.tagName === 'A' && el.hasAttribute('href')) { const href = el.getAttribute('href'); key = { href, n: linksTo(href).indexOf(el) }; }
  try { if (key && typeof el.selectionStart === 'number') key.caret = [el.selectionStart, el.selectionEnd]; } catch (e) { /* this kind of field has no caret to keep */ }
  return key;
}
function restoreFocus(key) {
  if (!key) return false;
  const el = key.id ? document.getElementById(key.id)
    : key.act ? Array.from(document.querySelectorAll('[data-act="' + key.act + '"]')).find(n => isShown(n) && JSON.stringify(n.dataset) === key.ds)
    : linksTo(key.href)[key.n];
  if (!el || el.disabled || !isShown(el) || el.closest('[inert]')) return false;
  if (el !== document.activeElement) {
    el.focus({ preventScroll: true });
    try { if (key.caret) el.setSelectionRange(key.caret[0], key.caret[1]); } catch (e) { /* no caret */ }
  }
  return true;
}
// When a dialog closes, focus returns to the control that opened it.
function focusBack() { if (!restoreFocus(sheetFrom)) $('#view').focus({ preventScroll: true }); }
// While a dialog is open, the page behind it cannot be reached by keyboard or screen reader.
function setBackgroundInert(on) {
  ['.skip', '#cookieRoot', '.bar', '#view', '#foot', '#tabsBottom'].forEach(sel => { const el = $(sel); if (el) el.inert = on; });
}
function openSheet(s, from) {
  if (!(ui.sheet && s.back === ui.sheet)) sheetFrom = from ? { id: from } : focusKey(document.activeElement);
  clearToast();
  ui.sheet = s;
  renderSheet(true);
}
function closeSheet() {
  if (ui.sheet && ui.sheet.back) { ui.sheet = ui.sheet.back; renderSheet(false); return; }
  ui.sheet = null;
  renderSheet(false);
  paintCookie();
  focusBack();
}
let toastTimer;
function clearToast() { clearTimeout(toastTimer); $('#toastRoot').innerHTML = ''; }
function toast(html, undo) {
  const r = $('#toastRoot');
  r.innerHTML = '<div class="toast" role="status"><span>' + html + '</span>' + (undo ? '<button type="button" class="toast-b" data-act="undo">' + icon('undo') + 'ביטול</button>' : '') + '</div>';
  clearTimeout(toastTimer);
  const words = String(html).replace(/<[^>]*>/g, '').length;
  toastTimer = setTimeout(() => { r.innerHTML = ''; }, undo ? 8000 : Math.min(9000, Math.max(3400, words * 70)));
}
// Which screen the address asks for: a legal page (open to everyone), or one of the app's views.
// `forced` names the screen directly, for a host that does not let the page change its address.
const FRONT = { home: 'landing', stores: 'stores', open: 'open' };
function applyRoute(forced) {
  let h = '';
  try { h = forced != null ? forced : decodeURIComponent(location.hash.slice(1)); } catch (e) { h = ''; }
  const s = state.prefs.session;
  ui.legal = legalPage(h) ? h : null;
  if (ui.legal) return;
  ui.lastHash = VIEWS[h] || FRONT[h] ? h : '';
  const was = ui.entry;
  ui.entry = FRONT[h] || null;
  if (ui.entry === 'stores' && was !== 'stores') storesFetch(0);
  if (s && VIEWS[h] && VIEWS[h].mode === s.role) ui.view = h;
}
// The list on the "which store" screen: in the demo the stores kept in this browser, on the hosted
// site whatever the database finds for what was typed.
let storesTimer;
function storesFetch(delay) {
  const st = ui.stores;
  clearTimeout(storesTimer);
  if (!REMOTE) {
    const q = normName(st.q);
    st.list = shop.list.filter(x => !q || normName(x.name).indexOf(q) >= 0).map(x => ({ id: x.id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    st.more = false;
    st.err = '';
    paintStores();
    return;
  }
  const seq = ++st.seq;
  if (!delay) { st.list = null; st.err = ''; paintStores(); }
  storesTimer = setTimeout(async () => {
    let out = null, failed = false;
    try { out = await rpc('sadran_stores', { p_query: st.q }); } catch (err) { failed = true; }
    if (seq !== st.seq) return;   // a newer search is on its way
    st.list = failed ? [] : (out && out.stores) || [];
    st.more = !failed && !!(out && out.more);
    st.err = failed ? NET_ERR : '';
    paintStores();
  }, delay);
}
// Signing out: back to the plain address, unless a legal page is open, which stays.
function clearRoute() {
  ui.lastHash = '';
  ui.entry = null;
  parked = null;
  try { if (location.hash && !ui.legal) location.hash = ''; } catch (e) { /* hash routing is optional */ }
}
function go(view) {
  ui.view = view;
  ui.entry = null;
  ui.legal = null;
  ui.lastHash = view;
  parked = null;
  ui.sheet = null;
  ui.codeDraft = null;
  ui.codeErr = '';
  clearToast();
  try { if (location.hash.slice(1) !== view) location.hash = view; } catch (e) { /* hash routing is optional */ }
  render();
  window.scrollTo(0, 0);
}
function startSession(session) {
  state.prefs.session = session;
  ui.signin = { tab: ui.signin.tab, name: '', number: '', code: '', err: '' };
  go(session.role === 'manager' ? 'schedule' : 'my-availability');
}
const snapshot = wk => { ui.undo = { wk, data: JSON.stringify(state.weeks[wk]) }; };
function resultToast(wk, lead) {
  const st = weekStats(wk, state.weeks[wk].slots);
  toast(lead + (st.missing
    ? 'שובצו ' + st.filled + ' מתוך ' + st.total + ' עמדות, ' + many(st.missing, 'עמדה אחת נשארה', 'עמדות נשארו') + ' בלי שיבוץ.'
    : 'כל ' + st.total + ' העמדות שובצו.'), true);
}

/* ---------- actions ---------- */
const actions = {
  secretShow(ds) { ui.shown[ds.for] = !ui.shown[ds.for]; render(); const el = document.getElementById(ds.for); if (el) el.focus(); },
  signTab(ds, el, e) {
    ui.signin.tab = ds.tab; ui.signin.err = '';
    render();
    // A tap or click continues in the first field. From the keyboard, focus stays on the button just pressed.
    const inp = $(ds.tab === 'manager' ? '#siCode' : '#siName');
    if (inp && e && e.detail) inp.focus();
  },
  async signIn() {
    const f = ui.signin;
    if (REMOTE) {
      if (net.busy) return;
      const asMgr = f.tab === 'manager';
      f.err = asMgr ? (normNum(f.code) ? '' : 'צריך למלא את הקוד.') : (normName(f.name) && normNum(f.number) ? '' : 'צריך למלא שם ומספר אישי.');
      if (f.err) { render(); return; }
      net.busy = true;
      render();
      let out = null;
      try {
        out = asMgr ? await rpc('sadran_login_manager', { p_store: shop.id, p_code: f.code })
          : await rpc('sadran_login_employee', { p_store: shop.id, p_name: f.name, p_number: f.number });
      } catch (err) { f.err = NET_ERR; }
      if (out && out.ok) { await endOther(); net.busy = false; tokenSet(out.token, shop.id); if (!(await enter())) remoteStart(); return; }
      net.busy = false;
      if (out) {
        f.err = out.error === 'locked' ? 'היו יותר מדי ניסיונות שגויים. אפשר לנסות שוב בעוד 15 דקות.'
          : out.error === 'no_store' ? 'החנות הזו כבר לא קיימת. אפשר לבחור חנות אחרת.'
          : asMgr ? 'הקוד שגוי.' : 'השם והמספר לא תואמים לאף עובד/ת ברשימה. אפשר לבדוק אותם מול המנהל/ת.';
      }
      render();
      return;
    }
    if (f.tab === 'manager') {
      if (normNum(f.code) === state.managerCode) { startSession({ role: 'manager' }); return; }
      f.err = 'הקוד שגוי.';
    } else {
      const name = normName(f.name), number = normNum(f.number);
      const e = name && number && state.employees.find(x => normName(x.name) === name && x.number === number);
      if (e) { startSession({ role: 'employee', id: e.id }); return; }
      f.err = name && number ? 'השם והמספר לא תואמים לאף עובד/ת ברשימה. אפשר לבדוק אותם מול המנהל/ת.' : 'צריך למלא שם ומספר אישי.';
    }
    render();
  },
  demoIn(ds) { startSession(ds.role === 'manager' ? { role: 'manager' } : { role: 'employee', id: 'e_shadi' }); },
  // Open a new store, and enter it as its manager.
  async openGo() {
    const f = ui.newStore, name = f.name.trim().replace(/\s+/g, ' '), c = normNum(f.code);
    if (net.busy) return;
    const asked = consentsFor('manager'), fresh = () => ({ checked: {}, fields: {}, err: '', busy: false });
    const badName = name.length < 2 || name.length > 60 ? 'שם החנות צריך להיות 2 עד 60 תווים.'
      : !REMOTE && shop.list.some(x => normName(x.name) === normName(name)) ? 'כבר יש חנות בשם הזה. אפשר להוסיף את שם הסניף או העיר.' : '';
    f.err = badName || (!/^\d{6,12}$/.test(c) ? 'הקוד צריך להיות 6 עד 12 ספרות.' : c !== normNum(f.code2) ? 'שני הקודים לא זהים.'
      : !legal.ready ? 'לא הצלחתי לטעון את תנאי השימוש. כדאי לטעון את הדף מחדש ולנסות שוב.' : consentError(asked, ui.agree, 'ag'));
    f.bad = badName ? 'opName' : !/^\d{6,12}$/.test(c) ? 'opCode' : c !== normNum(f.code2) ? 'opCode2' : ui.agree.bad;
    if (f.err) { render(); return; }
    const opened = 'החנות נפתחה. עכשיו מוסיפים את הצוות בלשונית "צוות".';
    if (!REMOTE) {
      const id = uid('s'), st = blankState();
      st.store = { name };
      st.managerCode = c;
      st.prefs = { session: { role: 'manager' }, demoNote: false };
      shop.list.push({ id, key: 'sadran.s.' + id, name });
      shop.id = id;
      state = st;
      await recordConsents(asked, ui.agree, 'open-store');
      ui.agree = fresh();
      ui.newStore = { name: '', code: '', code2: '', err: '', bad: '' };
      ui.week = defaultWeek();
      ui.undo = null;
      shopsWrite();
      go('schedule');
      toast(opened);
      return;
    }
    net.busy = true;
    render();
    let out = null;
    try { out = await rpc('sadran_open_store', { p_name: name, p_code: c }); } catch (err) { f.err = NET_ERR; }
    if (out && out.ok) {
      await endOther();   // this device was signed in to another store
      tokenSet(out.token, out.store);
      shop.id = out.store;
      // The agreement given on this form. If saving it fails, the agreement screen asks again after sign-in.
      try { await recordConsents(asked, ui.agree, 'open-store'); } catch (err) { /* asked again below */ }
      ui.agree = fresh();
      net.busy = false;
      if (!(await enter())) { remoteStart(); return; }
      toast(opened);
      return;
    }
    net.busy = false;
    if (out) {
      f.err = out.error === 'name_taken' ? 'כבר יש חנות בשם הזה. אפשר להוסיף את שם הסניף או העיר.'
        : out.error === 'busy' ? 'נפתחו הרבה חנויות בזמן קצר. אפשר לנסות שוב בעוד רבע שעה.'
        : out.error === 'name' ? 'שם החנות צריך להיות 2 עד 60 תווים.' : 'הקוד צריך להיות 6 עד 12 ספרות.';
      f.bad = out.error === 'name_taken' || out.error === 'name' ? 'opName' : out.error === 'busy' ? '' : 'opCode';
    }
    render();
  },
  // Choose a store from the list: its sign-in screen, or straight in when this device is signed in to it.
  async pickStore(ds) {
    const id = ds.id, view = () => (state.prefs.session.role === 'manager' ? 'schedule' : 'my-availability');
    if (!REMOTE) {
      const rec = shopRec(id);
      if (!rec) return;
      let st = load(rec);
      if (!st && id === 'main') {   // the first store's data could not be read (a copy was set aside): the example takes its place
        shop.id = id; state = seed(); autoSchedule(defaultWeek(), false); save(); st = state;
      }
      if (!st) { toast('אי אפשר לקרוא את הנתונים של החנות הזו במכשיר הזה.'); return; }
      shop.id = id;
      state = st;
      shopsWrite();
      ui.signin = { tab: 'employee', name: '', number: '', code: '', err: '' };
      ui.week = defaultWeek();
      ui.undo = null;
      ui.storeDraft = null; ui.storeErr = '';
      if (st.prefs.session) go(view()); else routeTo('');
      return;
    }
    if (net.busy) return;
    if (net.phase === 'ready' && shop.id === id) { go(view()); return; }
    // The sign-in this device holds is for this store: straight in.
    const kept = tokenRead();
    if (net.phase !== 'ready' && kept && kept.store === id) { net.token = kept.token; if (await enter(id)) return; }
    net.busy = true;
    let st = null, failed = false;
    try { st = await rpc('sadran_status', { p_store: id }); } catch (err) { failed = true; }
    if (failed) { net.busy = false; ui.stores.err = NET_ERR; paintStores(); return; }
    if (!st || !st.found) { net.busy = false; toast('החנות הזו כבר לא קיימת.'); storesFetch(0); return; }
    if (net.phase === 'ready') await stepOut();   // looking at another store does not sign out of this one
    await useStore(st);
    net.busy = false;
    routeTo('');
    render();
  },
  storesRetry() { storesFetch(0); },
  // From the front page, back into the store this device is signed in to.
  continueStore() { const s = state.prefs.session; if (s) go(s.role === 'manager' ? 'schedule' : 'my-availability'); },
  async storeRename() {
    const name = (ui.storeDraft != null ? ui.storeDraft : state.store.name).trim().replace(/\s+/g, ' ');
    if (net.busy) return;
    if (name === state.store.name) { ui.storeDraft = null; ui.storeErr = ''; render(); return; }
    const taken = 'כבר יש חנות בשם הזה. אפשר להוסיף את שם הסניף או העיר.', length = 'שם החנות צריך להיות 2 עד 60 תווים.';
    ui.storeErr = name.length < 2 || name.length > 60 ? length : !REMOTE && shop.list.some(x => x.id !== shop.id && normName(x.name) === normName(name)) ? taken : '';
    if (ui.storeErr) { render(); return; }
    if (REMOTE) {
      net.busy = true;
      render();
      let out = null;
      try { out = await rpc('sadran_rename_store', { p_token: net.token, p_name: name }); }
      catch (err) { net.busy = false; if (err && err.code === 'auth') { endSession('expired'); return; } ui.storeErr = NET_ERR; render(); return; }
      net.busy = false;
      if (!out || !out.ok) { ui.storeErr = out && out.error === 'name_taken' ? taken : length; render(); return; }
      state.store.name = out.name;
    } else state.store.name = name;
    ui.storeDraft = null;
    ui.storeErr = '';
    render();
    toast('שם החנות עודכן.');
  },
  async copyLink() {
    const inp = $('#storeLink');
    if (!inp) return;
    let ok = false;
    try { await navigator.clipboard.writeText(inp.value); ok = true; }
    catch (e) { try { inp.select(); ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
    toast(ok ? 'הקישור הועתק.' : 'אפשר לסמן את הקישור ולהעתיק אותו.');
  },
  retryBoot() { remoteStart(); },
  skip(ds, el, e) { e.preventDefault(); const m = $('#view'); m.focus(); m.scrollIntoView(); },
  // The name in the header leads to the person's first screen; from a legal page, back to where they were.
  home(ds, el, e) {
    e.preventDefault();
    const s = state.prefs.session, signedIn = !!shop.id && !!s && (!REMOTE || net.phase === 'ready');
    if (signedIn && !ui.entry && !needsAgreement().length) go(s.role === 'manager' ? 'schedule' : 'my-availability');
    else routeTo('home');
  },
  async agreeGo() {
    const st = ui.agree, list = agreeList();
    if (st.busy) return;
    st.err = consentError(list, st, 'ag');
    if (st.err) { render(); return; }
    st.busy = true;
    render();
    try { await recordConsents(list, st, 'sign-in'); }
    catch (err) {
      st.busy = false;
      if (err && err.code === 'auth') { endSession('expired'); return; }
      st.err = NET_ERR;
      render();
      return;
    }
    ui.agree = { checked: {}, fields: {}, err: '', busy: false };
    render();
    window.scrollTo(0, 0);
  },
  unsubDone() {
    const retry = ui.unsub && ui.unsub.state === 'net';
    ui.unsub = null;
    if (!retry) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* the link stays in the address */ } }
    remoteStart();
  },
  async legalRetry() {
    if (!legal.ready) { if (await loadLegal()) { legalArrived(); return; } }
    else if (ui.legal) { const pg = legalPage(ui.legal); if (pg) delete legal.docs[pg.file]; }
    render();
  },
  cookiePrefs(ds, el) {
    if (!legal.ready) return;
    const cur = cookieChoice(), mine = myRole() ? myConsents() : {}, consent = { checked: {}, fields: {} };
    for (const id in mine) { consent.checked[id] = !!mine[id].granted; consent.fields[id] = Object.assign({}, mine[id].details || {}); }
    openSheet({ type: 'privacy', choices: Object.assign({}, cur ? cur.choices : {}), consent, err: '', busy: false }, el.id);
    paintCookie();
  },
  ckAll() { const all = {}; optionalCats().forEach(c => { all[c.id] = true; }); saveCookieChoice(all, 'banner'); render(); $('#view').focus({ preventScroll: true }); },
  ckNone() {
    const reload = saveCookieChoice({}, 'banner');
    render();
    $('#view').focus({ preventScroll: true });
    if (reload) location.reload();
  },
  async ckSave() {
    const s = ui.sheet;
    if (!s || s.busy) return;
    const role = myRole(), optional = role && !needsAgreement().length ? consentsFor(role).filter(c => !c.required) : [];
    s.err = consentError(optional, s.consent, 'pf');
    if (s.err) { render(); return; }
    s.busy = true;
    render();
    try {
      const mine = myConsents();
      for (const c of optional) {
        const want = !!s.consent.checked[c.id], has = !!(mine[c.id] && mine[c.id].granted), det = want ? (s.consent.fields[c.id] || {}) : {};
        if (want !== has || (want && canon(det) !== canon(mine[c.id].details || {}))) await setConsent(c, want, 'preferences', det);
      }
    } catch (err) {
      s.busy = false;
      if (err && err.code === 'auth') { endSession('expired'); return; }
      s.err = NET_ERR;
      render();
      return;
    }
    const reload = saveCookieChoice(s.choices, 'preferences');
    ui.sheet = null;
    render();
    if (optionalCats().length || optional.length) toast('הבחירה נשמרה.');
    if (reload) setTimeout(() => location.reload(), 700);
  },
  async signOut() {
    if (REMOTE) { await closeSession(); endSession(); return; }
    state.prefs.session = null;
    ui.sheet = null;
    clearToast();
    clearRoute();
    render();
    window.scrollTo(0, 0);
  },
  async codeSave() {
    if (REMOTE) {
      if (net.busy) return;
      const c = normNum(ui.codeDraft || '');
      ui.codeErr = !/^\d{6,12}$/.test(c) ? 'הקוד צריך להיות 6 עד 12 ספרות.'
        : state.employees.some(e => e.number === c) ? 'הקוד הזה כבר משמש כמספר אישי של עובד/ת.' : '';
      if (ui.codeErr) { render(); return; }
      net.busy = true;
      render();
      let out = null;
      try { out = await rpc('sadran_set_code', { p_token: net.token, p_code: c }); }
      catch (err) { net.busy = false; if (err.code === 'auth') { endSession('expired'); return; } ui.codeErr = NET_ERR; }
      net.busy = false;
      if (out && out.ok) {
        ui.codeDraft = null;
        ui.codeErr = '';
        render();
        toast('קוד המנהל/ת הוחלף. מכשירים אחרים שנכנסו כמנהל/ת יצטרכו להיכנס שוב.');
        return;
      }
      if (out) ui.codeErr = out.error === 'code_is_number' ? 'הקוד הזה כבר משמש כמספר אישי של עובד/ת.' : 'הקוד צריך להיות 6 עד 12 ספרות.';
      render();
      return;
    }
    const code = normNum(ui.codeDraft != null ? ui.codeDraft : state.managerCode);
    ui.codeErr = !/^\d{4,12}$/.test(code) ? 'הקוד צריך להיות 4 עד 12 ספרות.'
      : state.employees.some(e => e.number === code) ? 'הקוד הזה כבר משמש כמספר אישי של עובד/ת.' : '';
    if (ui.codeErr) { render(); return; }
    state.managerCode = code;
    ui.codeDraft = null;
    render();
    toast('קוד המנהל/ת עודכן.');
  },
  importPick() { const inp = $('#xlsxFile'); inp.value = ''; inp.click(); },
  async importGo() {
    const s = ui.sheet, plan = importPlan(s.rows);
    if (s.busy) return;
    const ordered = ids => state.roles.map(r => r.id).filter(id => ids.includes(id));
    const taken = new Set(), ups = [], dels = [];
    let added = 0, updated = 0;
    for (const p of plan) {
      if (p.kind === 'err') continue;
      if (p.emp) {
        taken.add(p.emp.id);
        if (p.kind === 'same') continue;
        const u = { id: p.emp.id, name: p.name, roles: p.roles ? ordered(p.roles) : p.emp.roles, max: p.max || p.emp.max };
        if (p.number) u.number = p.number;
        ups.push(u);
        updated++;
      } else {
        const id = uid('e_');
        ups.push({ id, name: p.name, number: p.number, roles: p.roles ? ordered(p.roles) : [], max: p.max || 5 });
        taken.add(id);
        added++;
      }
    }
    if (s.remove) state.employees.forEach(e => { if (!taken.has(e.id)) dels.push(e.id); });
    const summary = [added && 'נוספו ' + added, updated && 'עודכנו ' + updated, dels.length && 'הוסרו ' + dels.length].filter(Boolean).join(', ') + '.';
    if (REMOTE) {
      s.busy = true;
      s.err = '';
      render();
      let out = null;
      try { out = await rpc('sadran_import_employees', { p_token: net.token, p_upserts: ups, p_deletes: dels }); }
      catch (err) { s.busy = false; if (err.code === 'auth') { endSession('expired'); return; } s.err = NET_ERR; }
      s.busy = false;
      if (out && out.ok) {
        ups.forEach(u => { delete u.number; });
        if (ui.sheet === s) ui.sheet = null;
        await refresh(true);
        render();
        toast(summary);
        return;
      }
      if (out) {
        s.err = out.error === 'number_is_code' ? 'המספר האישי של ' + esc(out.name || '') + ' זהה לקוד המנהל/ת. צריך לבחור מספר אחר ולייבא שוב.'
          : out.error === 'name_taken' ? 'אותו שם מופיע אצל שני עובדים. צריך לתקן בקובץ ולייבא שוב.'
          : out.error === 'number_required' ? 'ל' + esc(out.name || 'עובד/ת חדש/ה') + ' חסר מספר אישי בקובץ.'
          : out.error === 'too_many' ? 'אפשר לייבא עד 500 עובדים בקובץ אחד.'
          : 'שורה בקובץ לא תקינה' + (out.name ? ': ' + esc(out.name) : '') + '.';
      }
      if (ui.sheet === s) render();
      return;
    }
    for (const u of ups) { const e = empById(u.id); if (e) Object.assign(e, u); else state.employees.push(u); }   // demo: the number stays in this browser
    if (dels.length) {
      state.employees = state.employees.filter(e => !dels.includes(e.id));
      for (const wk in state.avail) for (const id of dels) delete state.avail[wk][id];
    }
    state.example = false;
    ui.sheet = null;
    render();
    toast(summary);
  },
  exportXlsx() {
    toast('מכין את הקובץ…');
    buildWorkbook().then(blob => saveFile('sadran-employees.xlsx', blob),
      () => toast('לא הצלחתי לטעון את רכיב האקסל. כדאי לבדוק את החיבור לרשת ולנסות שוב.'));
  },
  nav(ds) { go(ds.view); },
  week(ds) { ui.week = toKey(addDays(fromKey(ui.week), 7 * +ds.dir)); render(); },
  weekHome() { ui.week = defaultWeek(); render(); },
  jump(ds) {
    const el = document.getElementById('day-' + ds.d);
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  },
  dismissDemo() { state.prefs.demoNote = false; render(); },
  confirmAsk(ds) { ui.confirm = ds.key; render(); },
  confirmNo() { render(); },
  close() { closeSheet(); },
  backdrop() { closeSheet(); },

  auto() {
    const wk = ui.week;
    if (!submittedCount(wk)) { toast('אף אחד עוד לא הגיש זמינות לשבוע הזה, אז אין את מי לשבץ.'); return; }
    snapshot(wk);
    autoSchedule(wk, false);
    ui.fresh = true; render(); ui.fresh = false;
    resultToast(wk, '');
  },
  fill() {
    const wk = ui.week;
    ui.sheet = null;
    if (!submittedCount(wk)) { render(); toast('אף אחד עוד לא הגיש זמינות לשבוע הזה, אז אין את מי לשבץ.'); return; }
    snapshot(wk);
    autoSchedule(wk, true);
    render();
    resultToast(wk, '');
  },
  clear() {
    const wk = ui.week, w = state.weeks[wk];
    snapshot(wk);
    for (const k in w.slots) for (const p of w.slots[k]) { p.emp = null; p.lock = false; }
    ui.sheet = null;
    render();
    toast('הסידור נוקה.', true);
  },
  undo() {
    if (!ui.undo) return;
    state.weeks[ui.undo.wk] = JSON.parse(ui.undo.data);
    ui.undo = null;
    clearToast();
    render();
  },
  undoMenu() { ui.sheet = null; actions.undo(); toast('הפעולה האחרונה בוטלה.'); },
  more() { openSheet({ type: 'more' }); },
  publish() { openSheet({ type: 'publish' }); },
  publishGo() {
    const w = state.weeks[ui.week];
    w.published = { at: Date.now(), slots: clone(w.slots) };
    ui.sheet = null;
    render();
    if (REMOTE) flushKey('w:' + ui.week);
    toast('הסידור פורסם. העובדים רואים אותו בלשונית "המשמרות שלי".');
  },
  unpublish() { state.weeks[ui.week].published = null; ui.sheet = null; render(); toast('הפרסום בוטל.'); },
  share() { openSheet({ type: 'share', title: 'הסידור כטקסט', sub: 'להדבקה בקבוצת הצוות', text: shareText(ui.week) }, 'btnMore'); },
  remind() { openSheet({ type: 'share', title: 'הודעת תזכורת', sub: 'למי שטרם הגיש/ה זמינות', text: remindText(ui.week) }); },
  copy() {
    const ta = $('#shareText');
    const fallback = () => { ta.focus(); ta.select(); toast('הטקסט מסומן. אפשר להעתיק אותו ידנית.'); };
    try { navigator.clipboard.writeText(ta.value).then(() => toast('הועתק.'), fallback); } catch (e) { fallback(); }
  },

  pos(ds, el) { openSheet({ type: 'pos', k: ds.k, i: +ds.i }, el.id); },
  assign(ds) {
    const s = ui.sheet, p = state.weeks[ui.week].slots[s.k][s.i];
    p.emp = ds.emp; p.lock = true;
    ui.sheet = null;
    render();
  },
  unassign() {
    const s = ui.sheet, p = state.weeks[ui.week].slots[s.k][s.i];
    p.emp = null; p.lock = false;
    ui.sheet = null;
    render();
  },
  lock() { const s = ui.sheet, p = state.weeks[ui.week].slots[s.k][s.i]; p.lock = !p.lock; render(); },
  rmpos() {
    const s = ui.sheet, wk = ui.week, w = state.weeks[wk], list = w.slots[s.k], p = list[s.i];
    const u = unsk(s.k), cur = required(wk, u[0], u[1])[p.role] || 0;
    list.splice(s.i, 1);
    (w.over[s.k] = w.over[s.k] || {})[p.role] = Math.max(0, cur - 1);
    ui.sheet = null;
    render();
    toast('העמדה הוסרה מהמשמרת הזו.');
  },
  addpos(ds, el) { openSheet({ type: 'addpos', k: ds.k }, el.id); },
  addposGo(ds) {
    const s = ui.sheet, wk = ui.week, w = state.weeks[wk], u = unsk(s.k);
    const cur = required(wk, u[0], u[1])[ds.role] || 0;
    (w.over[s.k] = w.over[s.k] || {})[ds.role] = cur + 1;
    ui.sheet = null;
    render();
  },
  resetOver() { const s = ui.sheet; delete state.weeks[ui.week].over[s.k]; ui.sheet = null; render(); },

  av(ds) {
    const rec = availRec(ui.week, ds.emp, true), x = rec.slots[ds.k], t = slotT(x), v = (slotV(x) + 1) % 3;
    if (!v) delete rec.slots[ds.k];
    else rec.slots[ds.k] = t ? { v, t } : v;
    render();
  },
  avTime(ds, el) {
    const rec = availRec(ui.week, ds.emp), x = rec && rec.slots[ds.k], sh = shiftById(unsk(ds.k)[1]);
    if (!sh) return;
    const r = slotRanges(x, sh), back = ui.sheet && ui.sheet.type === 'avail' ? ui.sheet : null;
    openSheet({ type: 'times', emp: ds.emp, k: ds.k, v: slotV(x) === 2 ? 2 : 1, had: !!r, ranges: r ? r.map(q => q.slice()) : [[sh.start, sh.end]], err: '', back }, el.id);
  },
  avDay(ds, el) {
    const d = +ds.d, rec = availRec(ui.week, ds.emp), slots = rec ? rec.slots : {};
    // Start from what the day already has, when it is one stretch of hours.
    const marks = [];
    for (const sh of state.shifts) {
      const k = sk(d, sh.id), x = slots[k];
      if (state.closed[k] || !slotV(x)) continue;
      const s0 = mins(sh.start), e0 = mins(sh.end) > s0 ? mins(sh.end) : mins(sh.end) + 1440;
      const r = slotRanges(x, sh) || [[sh.start, sh.end]];
      r.forEach(q => { const a = q[0] === sh.start ? s0 : mins(q[0]), b = q[1] === sh.end ? e0 : mins(q[1]); marks.push([a < s0 ? a + 1440 : a, b < s0 ? b + 1440 : b, slotV(x)]); });
    }
    marks.sort((a, b) => a[0] - b[0]);
    const one = marks.length && marks.every((m, i) => !i || m[0] <= marks[i - 1][1]) && marks[marks.length - 1][1] < 1440;
    const t = one ? [hmOf(marks[0][0]), hmOf(Math.max.apply(null, marks.map(m => m[1])))] : ['', ''];
    const back = ui.sheet && ui.sheet.type === 'avail' ? ui.sheet : null;   // the manager filling in for someone returns there
    openSheet({ type: 'dayHours', emp: ds.emp, d, t, v: marks.length && marks.every(m => m[2] === 2) ? 2 : 1, had: marks.length > 0, err: '', back }, el.id);
  },
  dhV(ds) { ui.sheet.v = +ds.v; render(); },
  dhSave() {
    const s = ui.sheet, parts = dayParts(s.d, s.t[0], s.t[1]);
    s.err = !s.t[0] || !s.t[1] ? 'צריך למלא שעת התחלה ושעת סיום.'
      : !parts ? 'שעת הסיום צריכה להיות אחרי שעת ההתחלה, באותו יום.'
      : !parts.length ? 'השעות האלה לא נופלות באף משמרת של היום.' : '';
    if (s.err) { render(); return; }
    const rec = availRec(ui.week, s.emp, true), on = new Set(parts.map(q => q.k));
    for (const sh of state.shifts) { const k = sk(s.d, sh.id); if (!state.closed[k] && !on.has(k)) delete rec.slots[k]; }
    for (const q of parts) rec.slots[q.k] = q.full ? s.v : { v: s.v, t: [q.t] };
    ui.sheet = s.back || null;
    render();
  },
  dhClear() {
    const s = ui.sheet, rec = availRec(ui.week, s.emp, true);
    for (const sh of state.shifts) delete rec.slots[sk(s.d, sh.id)];
    ui.sheet = s.back || null;
    render();
  },
  rankOpen(ds, el) { openSheet({ type: 'rank', id: ds.id }, el.id); },
  rankOn() {
    const r = roleById(ui.sheet.id);
    r.rank = state.employees.filter(e => e.roles.includes(r.id)).map(e => e.id);
    render();
    const b = document.querySelector('.rank .btn:not([disabled])');
    if (b) b.focus();
  },
  rankOff() { const r = roleById(ui.sheet.id); delete r.rank; render(); const b = $('#rankOn'); if (b) b.focus(); },
  rankMove(ds) {
    const r = roleById(ui.sheet.id), list = rankOrder(r), i = list.indexOf(ds.emp), j = i + +ds.dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    list[i] = list[j]; list[j] = ds.emp;
    r.rank = list;
    render();
    // Keep the focus on the person who moved, even when they reached the top or the bottom.
    const same = document.getElementById('rk-' + (+ds.dir < 0 ? 'up' : 'down') + '-' + ds.emp), other = document.getElementById('rk-' + (+ds.dir < 0 ? 'down' : 'up') + '-' + ds.emp);
    const to = same && !same.disabled ? same : other;
    if (to) to.focus();
  },
  trAdd() { const s = ui.sheet; s.ranges.push(['', shiftById(unsk(s.k)[1]).end]); render(); const el = document.getElementById('tr-1-0'); if (el) el.focus(); },
  trDel(ds) { ui.sheet.ranges.splice(+ds.i, 1); render(); },
  trV(ds) { ui.sheet.v = +ds.v; render(); },
  trFull() {
    const s = ui.sheet, rec = availRec(ui.week, s.emp, true);
    rec.slots[s.k] = s.v;
    ui.sheet = s.back || null;
    render();
  },
  trSave() {
    const s = ui.sheet, sh = shiftById(unsk(s.k)[1]);
    const s0 = mins(sh.start), e0 = mins(sh.end) > s0 ? mins(sh.end) : mins(sh.end) + 1440;
    const at = t => { const v = mins(t); return v < s0 ? v + 1440 : v; };
    const list = [];
    s.err = '';
    for (const r of s.ranges) {
      if (!r[0] || !r[1]) { s.err = 'צריך למלא שעת התחלה ושעת סיום.'; break; }
      const a = at(r[0]), b = r[1] === sh.end ? e0 : at(r[1]);
      if (a < s0 || b > e0 || a >= b) { s.err = 'השעות צריכות להיות בתוך המשמרת (' + ltr(sh.start + '–' + sh.end) + '), וההתחלה לפני הסיום.'; break; }
      list.push({ a, b, r });
    }
    list.sort((x, y) => x.a - y.a);
    if (!s.err && list.length === 2 && list[1].a < list[0].b) s.err = 'שני הטווחים חופפים. אפשר לאחד אותם לטווח אחד.';
    if (s.err) { render(); return; }
    const rec = availRec(ui.week, s.emp, true);
    rec.slots[s.k] = list.length === 1 && list[0].a === s0 && list[0].b === e0 ? s.v
      : { v: s.v, t: list.map(q => [q.a === s0 ? null : q.r[0], q.b === e0 ? null : q.r[1]]) };
    ui.sheet = s.back || null;
    render();
  },
  avFill(ds) {
    const rec = availRec(ui.week, ds.emp, true);
    for (let d = 0; d < 7; d++) { const k = sk(d, ds.sh); if (!state.closed[k] && !rec.slots[k]) rec.slots[k] = 1; }
    render();
  },
  avClear(ds) { availRec(ui.week, ds.emp, true).slots = {}; render(); },
  avPrev(ds) {
    const prev = availRec(toKey(addDays(fromKey(ui.week), -7)), ds.emp);
    if (prev) availRec(ui.week, ds.emp, true).slots = clone(prev.slots);
    render();
  },
  avSubmit(ds) {
    availRec(ui.week, ds.emp, true).submittedAt = Date.now();
    const done = ui.sheet ? 'הזמינות הוגשה.' : 'הזמינות נשלחה למנהל/ת.';
    render();
    if (!REMOTE) { toast(done); return; }
    flushKey('a:' + ui.week + '|' + ds.emp).then(ok => toast(ok ? done : 'אין חיבור כרגע. הזמינות תישלח כשהחיבור יחזור.'));
  },
  editAvail(ds, el) { openSheet({ type: 'avail', emp: ds.emp }, el.id); },

  emp(ds, el) {
    const e = ds.id && empById(ds.id);
    openSheet({ type: 'emp', draft: e ? Object.assign(clone(e), { number: '' }) : { id: null, name: '', number: suggestNumber(), roles: [], max: 5 }, err: '' }, el.id);
    if (!e) { const inp = $('#empName'); if (inp) inp.focus(); }
  },
  empRole(ds) { const r = ui.sheet.draft.roles, i = r.indexOf(ds.id); if (i < 0) r.push(ds.id); else r.splice(i, 1); render(); },
  empMax(ds) { const d = ui.sheet.draft; d.max = Math.min(Math.max(maxCap(), d.max), Math.max(1, d.max + +ds.d)); render(); },
  async empSave() {
    const s = ui.sheet, d = s.draft, name = d.name.trim().replace(/\s+/g, ' '), number = normNum(d.number);
    const twin = state.employees.find(e => e.id !== d.id && normName(e.name) === normName(name));
    s.err = !name ? 'צריך למלא שם.'
      : twin ? 'כבר יש בצוות ' + esc(twin.name) + '. אפשר להוסיף אות משם המשפחה כדי להבדיל.'
      : !number && !d.id ? 'צריך למלא מספר אישי.'
      : number && !/^\d{4,12}$/.test(number) ? 'המספר האישי צריך להיות 4 עד 12 ספרות.'
      : number && number === state.managerCode ? 'המספר הזה שמור לקוד המנהל/ת.'
      : !d.roles.length ? 'צריך לבחור לפחות תפקיד אחד.' : '';
    s.bad = !name || twin ? 'empName' : s.err && d.roles.length ? 'empNumber' : '';
    if (s.err) { render(); return; }
    const roles = state.roles.map(r => r.id).filter(id => d.roles.includes(id));
    const rec = { id: d.id || uid('e_'), name, roles, max: d.max };
    if (REMOTE) {
      if (s.busy) return;
      s.busy = true;
      render();
      let out = null;
      try { out = await rpc('sadran_save_employee', { p_token: net.token, p_employee: number ? Object.assign({ number }, rec) : rec }); }
      catch (err) { s.busy = false; if (err.code === 'auth') { endSession('expired'); return; } s.err = NET_ERR; }
      s.busy = false;
      if (!out || !out.ok) {
        if (out) {
          s.err = out.error === 'name_taken' ? 'כבר יש בצוות עובד/ת בשם הזה. אפשר להוסיף אות משם המשפחה כדי להבדיל.'
            : out.error === 'number_is_code' ? 'המספר הזה שמור לקוד המנהל/ת.'
            : out.error === 'number_required' ? 'צריך למלא מספר אישי.'
            : out.error === 'name' ? 'צריך למלא שם.' : 'המספר האישי צריך להיות 4 עד 12 ספרות.';
          s.bad = out.error === 'name_taken' || out.error === 'name' ? 'empName' : 'empNumber';
        }
        if (ui.sheet === s) render();
        return;
      }
      net.base.emps[rec.id] = canon(empOf(rec));
    } else if (number) rec.number = number;   // demo: checked in this browser at sign-in
    if (d.id) Object.assign(empById(d.id), rec);
    else state.employees.push(rec);
    ui.sheet = null;
    render();
    toast(!d.id ? esc(name) + ' נוסף/ה לצוות. המספר האישי: ' + ltr(number) + '. כדאי למסור אותו עכשיו.'
      : number ? 'הפרטים נשמרו. המספר האישי החדש של ' + esc(name) + ': ' + ltr(number) + '.' : 'הפרטים נשמרו.');
  },
  async empDel() {
    const s = ui.sheet, id = s.draft.id;
    if (REMOTE) {
      if (s.busy) return;
      s.busy = true;
      try { await rpc('sadran_delete_employee', { p_token: net.token, p_id: id }); }
      catch (err) { s.busy = false; if (err.code === 'auth') { endSession('expired'); return; } s.err = NET_ERR; if (ui.sheet === s) render(); return; }
      delete net.base.emps[id];
    }
    state.employees = state.employees.filter(e => e.id !== id);
    for (const wk in state.avail) delete state.avail[wk][id];
    state.roles.forEach(r => { if (r.rank) { r.rank = r.rank.filter(x => x !== id); if (!r.rank.length) delete r.rank; } });
    ui.sheet = null;
    render();
    toast('העובד/ת נמחק/ה.');
  },

  roleAdd() {
    const used = new Set(state.roles.map(r => r.color));
    let color = 1;
    for (let c = 1; c <= COLORS; c++) if (!used.has(c)) { color = c; break; }
    const r = { id: uid('r_'), name: 'תפקיד חדש', color };
    state.roles.push(r);
    render();
    const inp = document.getElementById('role-' + r.id);
    if (inp) { inp.focus(); inp.select(); }
  },
  roleColor(ds, el) { openSheet({ type: 'color', id: ds.id }, el.id); },
  roleColorSet(ds) { const r = roleById(ui.sheet.id); if (r) r.color = +ds.c; closeSheet(); render(); },
  themeSet(ds) { state.theme = { preset: ds.p, custom: (state.theme || {}).custom }; render(); },
  appearance() {
    const order = ['system', 'light', 'dark'], next = order[(order.indexOf(getAppearance()) + 1) % 3];
    try { localStorage.setItem(APPEAR_KEY, next); } catch (e) { /* lasts until the page reloads */ }
    applyAppearance();
    toast('מראה במכשיר הזה: ' + APPEAR[next][1] + '.');
  },
  logoPick() { const inp = $('#logoFile'); inp.value = ''; inp.click(); },
  logoDel() { setLogo(null); },
  xStyle(ds) { state.exportStyle = ds.s; render(); },
  exportRoster() {
    const wk = ui.week, w = state.weeks[wk], pub = w.published, dirty = !pub || sig(pub.slots) !== sig(w.slots);
    openExport(wk, w.slots, { mgr: true, draft: dirty, published: !dirty && pub.at }, 'btnMore');
  },
  exportMine() {
    const wk = ui.week, pub = state.weeks[wk].published, me = currentMe();
    if (pub && me) openExport(wk, pub.slots, { me: me.id, published: pub.at }, 'btnExportMine');
  },
  xFmt(ds) { ui.sheet.fmt = ds.f; render(); },
  xSave() {
    const s = ui.sheet;
    if (!s || !s.blobs) return;
    saveFile('sadran-' + s.wk + '.' + s.fmt, s.blobs[s.fmt]);
  },
  xShare() {
    const s = ui.sheet;
    if (!s || !s.blobs) return;
    const name = 'sadran-' + s.wk + '.' + s.fmt, file = new File([s.blobs[s.fmt]], name, { type: s.fmt === 'pdf' ? 'application/pdf' : 'image/jpeg' });
    navigator.share({ files: [file], title: 'סידור עבודה ' + weekLabel(s.wk) }).catch(err => {
      if (!err || err.name !== 'AbortError') toast('השיתוף לא הצליח. אפשר להוריד את הקובץ ולשלוח אותו.');
    });
  },
  async pushOn() {
    if (push.busy || !pushSupported()) return;
    push.busy = true;
    const ask = Notification.requestPermission();
    render();
    let msg = '';
    try {
      const perm = await ask;
      if (perm === 'granted') {
        const reg = await swRegistration(true);
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(VAPID_PUBLIC) });
        const out = await savePushSub(sub);
        msg = out && out.ok ? 'ההתראות הופעלו במכשיר הזה.' : 'הדפדפן הזה לא נתמך לתזכורות.';
      } else if (perm === 'denied') msg = 'ההתראות נחסמו. אפשר לאשר אותן בהגדרות האתר בדפדפן.';
    } catch (err) {
      if (err && err.code === 'auth') { push.busy = false; endSession('expired'); return; }
      msg = err && err.code === 'network' ? NET_ERR : 'לא הצלחתי להפעיל התראות בדפדפן הזה.';
    }
    push.busy = false;
    push.state = await readPushState();
    render();
    if (msg) toast(msg);
  },
  async pushOff() {
    if (push.busy) return;
    push.busy = true;
    render();
    await dropPushSub(net.token);
    push.busy = false;
    push.state = await readPushState();
    render();
    toast('ההתראות כובו במכשיר הזה.');
  },
  async remindNow() {
    if (net.busy) return;
    net.busy = true;
    render();
    let d = null, msg = '';
    try { d = await callRemind(ui.week); }
    catch (err) {
      net.busy = false;
      if (err.code === 'auth') { endSession('expired'); return; }
      msg = err.code === 'network' ? NET_ERR : 'שליחת ההתראה לא הצליחה. אפשר לנסות שוב בעוד רגע.';
    }
    net.busy = false;
    render();
    if (d) {
      if (!d.pending) msg = 'כל הצוות כבר הגיש זמינות לשבוע הזה.';
      else {
        const names = a => a.map(esc).join(', ');
        msg = (d.reached.length ? (d.sent ? 'נשלחה התראה ל' + names(d.reached) + '.' : 'לא הצלחתי להגיע למכשירים של ' + names(d.reached) + '.') : '') +
          (d.unreachable.length ? ' ' + names(d.unreachable) + (d.unreachable.length === 1 ? ' לא הפעיל/ה התראות' : ' לא הפעילו התראות') + ', אפשר לשלוח להם את הודעת התזכורת.' : '');
      }
    }
    toast(msg.trim());
  },
  roleDel(ds) {
    state.roles = state.roles.filter(r => r.id !== ds.id);
    state.employees.forEach(e => { e.roles = e.roles.filter(r => r !== ds.id); });
    for (const sh in state.req) delete state.req[sh][ds.id];
    render();
  },
  shiftAdd() {
    const sh = { id: uid('s_'), name: 'משמרת חדשה', start: '11:00', end: '19:00' };
    state.shifts.push(sh);
    state.req[sh.id] = {};
    render();
    const inp = document.getElementById('shn-' + sh.id);
    if (inp) { inp.focus(); inp.select(); }
  },
  shiftDel(ds) {
    state.shifts = state.shifts.filter(s => s.id !== ds.id);
    delete state.req[ds.id];
    for (const k in state.closed) if (unsk(k)[1] === ds.id) delete state.closed[k];
    render();
  },
  req(ds) {
    const r = state.req[ds.sh] || (state.req[ds.sh] = {});
    r[ds.role] = Math.min(9, Math.max(0, (r[ds.role] || 0) + +ds.d));
    render();
  },
  dayToggle(ds) { if (state.closed[ds.k]) delete state.closed[ds.k]; else state.closed[ds.k] = true; render(); },
  rest(ds) { state.rules.minRest = Math.min(16, Math.max(0, state.rules.minRest + +ds.d)); render(); },
  backupSave() {
    const data = clone(state);
    data.prefs = { session: null, demoNote: false };
    data.consentLog = {};
    const file = { app: 'sadran', backup: 1, version: APP_VERSION, saved: new Date().toISOString(), data };
    saveFile('sadran-backup-' + toKey(new Date()) + '.json', new Blob([JSON.stringify(file)], { type: 'application/json' }));
  },
  backupPick() { const inp = $('#backupFile'); inp.value = ''; inp.click(); },
  restoreGo() { const s = ui.sheet; if (s && s.data) replaceData(s.data, 'הנתונים שוחזרו מהגיבוי.'); },
  keptBack(ds) {
    const c = kept(ds.why);
    let data = null;
    try { data = c && cleanState(JSON.parse(c.data)); } catch (e) { data = null; }
    if (!data) { toast('העותק הזה כבר לא זמין.'); render(); return; }
    if (ds.why !== 'restore') { try { localStorage.removeItem(keepName(ds.why, shop.id)); } catch (e) { /* it is simply offered again */ } }
    replaceData(data, 'הנתונים הקודמים הוחזרו.');
  },
  reset() {
    const manager = state.prefs.session && state.prefs.session.role === 'manager';
    const agreed = (state.consentLog || {}).manager;
    keep('reset', JSON.stringify(state));
    state = seed();
    // The manager who pressed reset stays signed in, and is not asked to agree to the terms again.
    if (manager) { state.prefs.session = { role: 'manager' }; if (agreed) state.consentLog = { manager: agreed }; }
    ui.signin = { tab: 'employee', name: '', number: '', code: '', err: '' };
    ui.codeDraft = null;
    ui.codeErr = '';
    ui.week = defaultWeek();
    autoSchedule(ui.week, false);
    ui.undo = null;
    render();
    window.scrollTo(0, 0);
    toast('נתוני הדוגמה שוחזרו. הנתונים שהיו כאן נשמרו בצד, ואפשר להחזיר אותם בהגדרות.');
  },
};

// Forms are sent from here, not by the browser's own submission, so they also work where the page
// is embedded with form submission switched off.
function sendForm(form, e) {
  const f = form && form.dataset && form.dataset.form;
  if (!f) return false;
  e.preventDefault();
  ui.confirm = null;
  if (actions[f]) actions[f](form.dataset, form, e);
  return true;
}
document.addEventListener('click', e => {
  const send = e.target.closest('button[type="submit"]');
  if (send && !send.disabled && sendForm(send.form, e)) return;
  // Links to another screen of the site are followed here, so they work the same wherever the page
  // is hosted or embedded. This comes first: a link inside a dialog is still a link.
  const link = e.target.closest('a[href]');
  if (link && !link.dataset.act) {
    const href = link.getAttribute('href');
    if (href.charAt(0) === '#' && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      routeTo(href.slice(1));
    }
    return;
  }
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.disabled) return;
  const act = t.dataset.act;
  if (act === 'backdrop' && e.target !== t) return;
  if (act !== 'confirmAsk') ui.confirm = null;
  if (actions[act]) actions[act](t.dataset, t, e);
});
document.addEventListener('submit', e => { sendForm(e.target, e); });
// Enter in a field sends its form.
document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key !== 'Enter' || e.isComposing || !t || t.tagName !== 'INPUT' || /^(file|button|submit|reset)$/.test(t.type)) return;
  sendForm(t.form, e);
});
document.addEventListener('input', e => {
  const t = e.target, b = t.dataset && t.dataset.bind;
  if (!b || b === 'imp.remove' || b.slice(0, 3) === 'cc.' || b.slice(0, 3) === 'ck.') return;
  const v = t.value, id = t.dataset.id;
  const paint = (attr, text) => document.querySelectorAll('[' + attr + '="' + id + '"]').forEach(n => { n.textContent = text; });
  if (b.slice(0, 3) === 'si.') { ui.signin[b.slice(3)] = v; return; }
  if (b.slice(0, 3) === 'op.') { ui.newStore[b.slice(3)] = v; return; }
  if (b === 'stores.q') { ui.stores.q = v; storesFetch(REMOTE ? 250 : 0); return; }
  if (b === 'store.draft') { ui.storeDraft = v; return; }
  if (b.slice(0, 3) === 'cf.') { const q = b.split('.'), st = consentState(q[1]); if (st) (st.fields[q[2]] || (st.fields[q[2]] = {}))[q[3]] = v; return; }
  if (b === 'code.draft') { ui.codeDraft = v; return; }
  if (b === 'theme.custom') { state.theme = { preset: 'custom', custom: v }; applyTheme(); save(); return; }
  if (b.slice(0, 3) === 'dh.') {
    const sh = ui.sheet;
    if (sh && sh.type === 'dayHours') { sh.t[+b.slice(3)] = v; const pv = $('#dhPrev'); if (pv) pv.innerHTML = dayPreview(sh.d, sh.t[0], sh.t[1]); }
    return;
  }
  if (b.slice(0, 3) === 'tr.') { const q = b.split('.'); if (ui.sheet && ui.sheet.ranges) ui.sheet.ranges[+q[1]][+q[2]] = v; return; }
  if (b.slice(0, 3) === 'dl.') return;
  if (b === 'draft.name' || b === 'draft.number') { if (ui.sheet && ui.sheet.draft) ui.sheet.draft[b.slice(6)] = v; return; }
  if (b === 'role.name') { roleById(id).name = v; paint('data-rn', v || 'ללא שם'); }
  else if (b === 'shift.name') { shiftById(id).name = v; paint('data-sn', v); }
  else if (b === 'shift.start' || b === 'shift.end') { if (!v) return; const sh = shiftById(id); sh[b.slice(6)] = v; paint('data-st', sh.start + '–' + sh.end); }
  else if (b === 'note') availRec(ui.week, id, true).note = v;
  save();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'xlsxFile') { if (t.files && t.files[0]) importFile(t.files[0]); return; }
  if (t.id === 'logoFile') { if (t.files && t.files[0]) uploadLogo(t.files[0]); return; }
  if (t.id === 'backupFile') {   // emptied once read, so choosing the same file again is noticed
    const f = t.files && t.files[0];
    t.value = '';
    if (f) restoreFile(f);
    return;
  }
  const b = t.dataset && t.dataset.bind;
  if (b === 'imp.remove' && ui.sheet) { ui.sheet.remove = t.checked; render(); return; }
  if (b && b.slice(0, 3) === 'cc.') {
    const q = b.split('.'), st = consentState(q[1]), c = legal.ready && legal.reg.consents.find(x => x.id === q[2]);
    if (!st) return;
    st.checked[q[2]] = t.checked;
    // Redraw only when ticking changes what is shown: the fields of an optional consent, or an error to clear.
    if (st.err || (c && (c.fields || []).length)) { st.err = ''; render(); }
    return;
  }
  if (b && b.slice(0, 3) === 'ck.') { if (ui.sheet && ui.sheet.choices) ui.sheet.choices[b.slice(3)] = t.checked; return; }
  if (b === 'theme.custom') { render(); return; }
  if (b && b.slice(0, 3) === 'dl.') {
    const dl = state.rules.deadline || (state.rules.deadline = DEF_DEADLINE());
    if (b === 'dl.on') dl.on = t.checked;
    else if (b === 'dl.day') dl.day = +t.value;
    else if (b === 'dl.time' && t.value) dl.time = t.value;
    dl.tz = tzNow();
    render();
  }
});
document.addEventListener('toggle', e => {
  const f = e.target.dataset && e.target.dataset.fold;
  if (f) ui.open[f] = e.target.open;
}, true);
document.addEventListener('keydown', e => {
  if (!ui.sheet) return;
  if (e.key === 'Escape') { closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const box = $('#sheetRoot .sheet');
  if (!box) return;
  const stops = Array.from(box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter(isShown);
  if (!stops.length) { e.preventDefault(); box.focus(); return; }
  const first = stops[0], last = stops[stops.length - 1], at = document.activeElement;
  if (e.shiftKey && (at === first || at === box || !box.contains(at))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (at === last || !box.contains(at))) { e.preventDefault(); first.focus(); }
});
function onRoute(forced) {
  const was = ui.legal, place = (ui.entry || '') + '|' + ui.view, key = focusKey(document.activeElement);
  applyRoute(forced);
  const now = (ui.entry || '') + '|' + ui.view;
  if (ui.legal === was && (ui.legal || now === place)) return;
  let back = null;
  if (ui.legal && !was) parked = { sheet: ui.sheet, from: sheetFrom, place, y: window.scrollY, key };
  else if (!ui.legal && was) { back = parked; parked = null; }
  else if (!ui.legal) parked = null;
  const same = !!back && back.place === now;
  ui.sheet = same ? back.sheet : null;
  if (ui.sheet) sheetFrom = back.from;
  render();
  if (ui.legal) { window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); return; }
  // Back from a legal page: the same place, and the same dialog if one was open.
  window.scrollTo(0, same ? back.y : 0);
  if (!(same && restoreFocus(back.key))) { const box = $('#sheetRoot .sheet') || $('#view'); box.focus({ preventScroll: true }); }
}
window.addEventListener('hashchange', () => onRoute());
// Go to a screen by its address. Where the address cannot change (some embeddings), go there directly.
function routeTo(h) {
  let before = '', now = '';
  try { before = location.hash.slice(1); if (before !== h) location.hash = h; now = location.hash.slice(1); } catch (err) { now = before; }
  if (now === before) onRoute(h);
}
window.addEventListener('resize', () => { if ($('#cookieRoot .ck')) paintCookie(); });

/* ---------- boot ---------- */
async function boot() {
  applyAppearance();
  if (REMOTE) {
    setInterval(() => { if (document.visibilityState === 'visible') refresh(false); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(false); else flushAll(true); });
    window.addEventListener('pagehide', () => flushAll(true));
    window.addEventListener('online', () => { if (net.failures) { net.failures = 0; queueChanges(); } });
    net.phase = 'loading';
    render();
  }
  // The legal texts come first, so the agreement screen is ready before anyone gets past sign-in.
  const texts = loadLegal();
  await Promise.race([texts, new Promise(done => setTimeout(done, 4000))]);
  const onTime = legal.ready;
  const showFront = !REMOTE && demoStart();
  applyRoute();
  // Data from before there were several stores: the new front page is shown once, with a way straight back in.
  if (showFront && !ui.legal && !ui.entry && !location.hash) ui.entry = 'landing';
  applyCookieChoice();
  if (REMOTE) await remoteStart();
  else {
    const h = location.hash.slice(1), sess = state.prefs.session;
    ui.view = sess && VIEWS[h] && VIEWS[h].mode === sess.role ? h : (sess && sess.role === 'employee' ? 'my-availability' : 'schedule');
    render();
  }
  if (!onTime) texts.then(ok => { if (ok) legalArrived(); else legalLater(0); });
}
function legalArrived() { applyRoute(); applyCookieChoice(); render(); }
// Without the legal texts nobody is asked to agree to them, so a failed load is tried again.
function legalLater(n) {
  if (legal.ready || n > 6) return;
  setTimeout(async () => { if (legal.ready) return; if (await loadLegal()) legalArrived(); else legalLater(n + 1); }, Math.min(60000, 3000 * Math.pow(2, n)));
}
boot();
})();
