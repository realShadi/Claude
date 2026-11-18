// Shared helpers for the browser tests. They drive the single-file demo (example data, one device),
// so they need no database and change nothing outside this folder.
const { chromium } = require('playwright');
const path = require('path');
// The single-file demo, built by run.sh from the site/ folder.
const BUILD = path.join(__dirname, '.build');
const SITE = path.join(__dirname, '..', 'site');
function suite() {
  const results = [], errors = [];
  return {
    results, errors,
    check(label, cond, got) { results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '  -> ' + JSON.stringify(got))); return cond; },
    watch(page, name) {
      page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
      page.on('console', m => { if ((m.type() === 'error' || /Content Security Policy/i.test(m.text())) && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(name + ' console: ' + m.text().slice(0, 300)); });
    },
    report() {
      console.log(results.join('\n'));
      console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
      const f = results.filter(r => r.startsWith('FAIL')).length;
      console.log(f + ' failed of ' + results.length);
      return f + errors.length;
    },
  };
}
// The Claude viewer, as far as the page can tell: no outside connections, saves go through the viewer.
function viewerStub() {
  window.claude = { use: async n => n === 'downloads' ? { save: async ({ filename, data }) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); return { status: 'saved' }; } } : null };
}
async function demoPage(browser, s, opts, init) {
  const o = Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true }, opts || {});
  delete o.file;
  const ctx = await browser.newContext(o);
  await ctx.addInitScript(viewerStub);
  if (init) await ctx.addInitScript(init);
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: path.join(SITE, 'vendor', 'exceljs.min.js'), contentType: 'application/javascript' }));
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  s.watch(page, 'demo');
  await page.goto('file://' + path.join(BUILD, (opts && opts.file) || 'page.html'));
  await page.waitForSelector('#signForm, #btnOut', { timeout: 15000 });
  return page;
}
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').trim().replace(/\s+/g, ' ');
const idle = page => page.waitForFunction(() => { const el = document.getElementById('syncState'); return el && !/is-busy|is-bad/.test(el.className); }, null, { timeout: 20000 }).catch(() => {});
async function overflow(page, s, name) { const r = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (r[0] > r[1]) s.errors.push(`overflow ${name}: ${r[0]} > ${r[1]}`); }
// The agreement screen that follows a first sign-in: tick every required box and continue.
async function passGate(page) {
  await page.waitForSelector('#agreeForm, #btnOut', { timeout: 20000 });
  if (!(await page.$('#agreeForm'))) return false;
  for (const id of await page.$$eval('#agreeForm input[type=checkbox][required]', b => b.map(x => x.id))) await page.check('#' + id);
  await page.click('#btnAgree');
  await page.waitForSelector('#btnOut', { timeout: 20000 });
  return true;
}
async function demoSignIn(page, role) {
  await page.click(role === 'manager' ? '#demoMgr' : '#demoEmp');
  await passGate(page);
}
const launch = () => chromium.launch({ channel: 'chromium' });
module.exports = { launch, suite, demoPage, txt, idle, overflow, passGate, demoSignIn, path, BUILD, SITE };
