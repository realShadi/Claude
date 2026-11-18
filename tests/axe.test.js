// Automated accessibility audit (axe-core) of every screen and dialog of the demo, in light and dark.
// Usage: node axe.test.js [light|dark|both] [mobile|desktop|both] ['{"preset":"forest"}']
const L = require('./lib');
const fs = require('fs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const schemes = process.argv[2] && process.argv[2] !== 'both' ? [process.argv[2]] : ['light', 'dark'];
const sizes = process.argv[3] && process.argv[3] !== 'both' ? [process.argv[3]] : ['mobile', 'desktop'];
const found = {};
async function audit(page, where) {
  await page.waitForTimeout(260);   // let the dialog animation finish, so colours are final
  await page.evaluate(AXE + '; void 0');
  const res = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'incomplete'] });
    const pick = list => list.map(v => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter(t => /^wcag|best/.test(t)).join(','), nodes: v.nodes.map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 160), sum: (n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 260), data: n.any.concat(n.all, n.none).map(c => c.data && c.data.contrastRatio ? `${c.data.fgColor} on ${c.data.bgColor} = ${c.data.contrastRatio} (need ${c.data.expectedContrastRatio})` : (c.data && c.data.messageKey) || '').filter(Boolean).join('; ') })) }));
    return { v: pick(r.violations), i: pick(r.incomplete) };
  });
  for (const kind of ['v', 'i']) for (const v of res[kind]) for (const n of v.nodes) {
    const key = (kind === 'v' ? 'VIOLATION ' : 'review    ') + v.id + ' [' + (v.impact || '-') + '] ' + v.help;
    const sig = n.target + ' ' + n.data;
    found[key] = found[key] || {};
    (found[key][sig] = found[key][sig] || { html: n.html, sum: n.sum, where: [] }).where.push(where);
  }
}
async function run(browser, scheme, size) {
  const s = L.suite();
  const tag = scheme + '/' + size;
  const vp = size === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 860 };
  const page = await L.demoPage(browser, s, { viewport: vp, colorScheme: scheme });
  if (process.argv[4]) {   // a store theme, e.g. '{"preset":"forest"}'
    await page.evaluate(t => { const st = JSON.parse(localStorage.getItem('sadran.v1')); st.theme = JSON.parse(t); localStorage.setItem('sadran.v1', JSON.stringify(st)); }, process.argv[4]);
    await page.reload(); await page.waitForSelector('#signForm');
  }
  const tab = v => page.click((size === 'mobile' ? '#tabsBottom' : '#tabsTop') + ' .tab[data-view="' + v + '"]');
  const shut = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet')); };
  const at = name => audit(page, tag + ' ' + name);
  await at('sign-in + cookie notice');
  await page.click('#ckMore'); await page.waitForSelector('#sheetRoot .sheet'); await at('cookie preferences'); await shut();
  await page.click('#ckNone');
  await page.click('#segMgr'); await page.click('#btnSignIn'); await at('sign-in manager, error');
  await page.click('#siTerms').catch(() => {}); 
  await page.click('#foot a[href="#privacy"]'); await page.waitForSelector('article.legal h2'); await at('privacy page');
  await page.click('#foot a[href="#cookies"]'); await page.waitForFunction(() => document.querySelector('.stored')); await at('cookies page');
  await page.click('#foot a[href="#accessibility"]'); await page.waitForFunction(() => /נגישות/.test(document.querySelector('article.legal h1').textContent)); await at('accessibility page');
  await page.click('#legalBack'); await page.waitForSelector('#signForm');
  await page.click('#demoMgr'); await page.waitForSelector('#agreeForm'); await page.click('#btnAgree'); await at('agreement, error');
  await page.check('#ag-terms'); await page.click('#btnAgree'); await page.waitForSelector('#btnOut');
  await at('schedule');
  await page.click('.pos'); await page.waitForSelector('#sheetRoot .sheet'); await at('position dialog'); await shut();
  await page.click('#btnMore'); await page.waitForSelector('#sheetRoot .sheet'); await at('more menu'); await shut();
  await page.click('#btnPublish'); await page.waitForSelector('#sheetRoot .sheet'); await at('publish dialog'); await shut();
  await page.click('#btnAuto'); await page.waitForSelector('.toast'); await at('schedule + toast');
  await tab('availability'); await at('availability');
  const row = await page.$('[data-act="avOpen"], .mx tbody th button, .mx button');
  if (row) { await row.click(); await page.waitForSelector('#sheetRoot .sheet'); await at('availability dialog'); await shut(); }
  await tab('team'); await at('team');
  await page.click('#btnAddEmp'); await page.waitForSelector('#sheetRoot .sheet'); await page.click('#btnEmpSave'); await at('employee dialog, error'); await shut();
  await page.setInputFiles('#xlsxFile', __dirname + '/fixtures/employees.xlsx'); await page.waitForSelector('#btnImportGo', { timeout: 20000 }); await at('import dialog'); await shut();
  await tab('setup'); await at('settings');
  await page.click('[data-act="roleColor"]'); await page.waitForSelector('#sheetRoot .sheet'); await at('colour dialog'); await shut();
  await page.click('#btnOut'); await page.waitForSelector('#signForm');
  await page.click('#demoEmp'); await L.passGate(page);
  await at('my availability');
  await page.click('.av-time'); await page.waitForSelector('#sheetRoot .sheet'); await at('hours dialog'); await shut();
  await tab('my-shifts'); await at('my shifts');
  if (s.errors.length) console.log('PAGE ERRORS', tag, s.errors);
  await page.context().close();
}
(async () => {
  const browser = await L.launch();
  for (const sc of schemes) for (const sz of sizes) await run(browser, sc, sz);
  await browser.close();
  const keys = Object.keys(found).sort();
  for (const k of keys) {
    const sigs = Object.keys(found[k]);
    console.log('\n' + k + '  (' + sigs.length + ' distinct)');
    if (k.startsWith('review')) {   // grouped: why the tool could not decide, and on what kind of element
      const groups = {};
      for (const sig of sigs) { const f = found[k][sig], why = sig.split(' ').pop(), cls = (f.html.match(/class="([^"]*)"/) || [0, f.html.slice(0, 30)])[1]; const g = why + ' | ' + cls.replace(/hl-\d+/, 'hl-N'); groups[g] = (groups[g] || 0) + 1; }
      for (const g of Object.keys(groups).sort()) console.log('  ' + String(groups[g]).padStart(3) + ' × ' + g);
      continue;
    }
    for (const sig of sigs.slice(0, 14)) { const f = found[k][sig]; console.log('  - ' + sig + '\n      ' + f.html + '\n      ' + f.sum.slice(0, 200) + '\n      @ ' + Array.from(new Set(f.where)).slice(0, 5).join(' | ') + (f.where.length > 5 ? ' …+' + (f.where.length - 5) : '')); }
    if (sigs.length > 14) console.log('  … ' + (sigs.length - 14) + ' more');
  }
  const bad = keys.filter(k => k.startsWith('VIOLATION')).length;
  console.log('\n' + bad + ' violation rules, ' + keys.filter(k => k.startsWith('review')).length + ' to review');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
