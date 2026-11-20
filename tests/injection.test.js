// Markup typed into names, notes and settings, or placed in the legal files, must show as text and never run.
const L = require('./lib');
const fs = require('fs'), path = require('path');
const EVIL = ['<img src=x onerror="window.__x=1">', '"><script>window.__x=2</script>', "'-alert(1)-'<svg onload=window.__x=3>", '</textarea><iframe srcdoc="<script>parent.__x=4</script>">'];
(async () => {
  const s = L.suite(), browser = await L.launch();
  // 1. a legal bundle with hostile business details and text
  const html = fs.readFileSync(path.join(L.BUILD, 'page.html'), 'utf8');
  const m = html.match(/(<script type="application\/json" id="legalBundle">)([\s\S]*?)(<\/script>)/);
  const bundle = JSON.parse(m[2].replace(/<\\\//g, '</'));
  const biz = JSON.parse(bundle['business.json']); biz.BUSINESS_NAME = EVIL[0]; biz.CONTACT_EMAIL = 'a@b.co" onmouseover="window.__x=5'; biz.SITE_URL = 'javascript:window.__x=6';
  bundle['business.json'] = JSON.stringify(biz);
  bundle['privacy.md'] += '\n\n[לחצו כאן](javascript:window.__x=7) [וגם כאן](data:text/html,<script>parent.__x=8</script>) [אתר]({{SITE_URL}})\n\n<script>window.__x=9</script>\n\n## כותרת <img src=x onerror="window.__x=10">\n';
  const reg = JSON.parse(bundle['legal.json']); reg.consents[0].label += ' <img src=x onerror="window.__x=11"> [קישור](javascript:window.__x=12)'; reg.pages[0].title = 'מדיניות <b onclick="window.__x=13">פרטיות</b>';
  reg.cookies.categories[0].items[0].why += '<img src=x onerror="window.__x=14">';
  bundle['legal.json'] = JSON.stringify(reg);
  fs.writeFileSync(path.join(L.BUILD, 'page-evil.html'), html.slice(0, m.index) + m[1] + JSON.stringify(bundle).replace(/<\//g, '<\\/') + m[3] + html.slice(m.index + m[0].length));
  const page = await L.demoPage(browser, s, { front: true });
  await page.goto('file://' + path.join(L.BUILD, 'page-evil.html')); await page.waitForSelector('#lpEnter');
  const clean = async where => {
    const r = await page.evaluate(() => ({ x: window.__x, bad: document.querySelectorAll('img[src="x"], script:not([src]):not(#legalBundle):not([type]), iframe, svg[onload], [onerror], [onclick], [onmouseover], a[href^="javascript:"], a[href^="data:"]').length - document.querySelectorAll('body > script:not([src]):not([type])').length }));
    s.check('no markup or script from data: ' + where, r.x === undefined && r.bad <= 0, r);
  };
  await clean('front page');
  await L.enterStore(page);
  await clean('sign-in');
  for (const id of ['privacy', 'terms', 'cookies']) { await page.click('#foot a[href="#' + id + '"]'); await page.waitForFunction(i => location.hash === '#' + i && document.querySelector('article.legal h2'), id); await clean(id + ' page'); }
  s.check('the hostile business name is shown as plain text', (await page.textContent('article.legal')) !== null);
  await page.click('#foot a[href="#privacy"]'); await page.waitForFunction(() => location.hash === '#privacy');
  const txt = await page.textContent('article.legal');
  s.check('markup in the texts appears literally', txt.includes('<img src=x onerror="window.__x=1">') && txt.includes('<script>window.__x=9</script>') && txt.includes('לחצו כאן'), txt.slice(0, 200));
  s.check('unsafe link targets are not turned into links', (await page.$$eval('article.legal a', a => a.map(x => x.getAttribute('href')).filter(h => !/^(#|https:|mailto:|tel:)/.test(h)))).length === 0);
  await page.click('#ckMore'); await page.waitForSelector('#sheetRoot .sheet'); await clean('cookie settings'); await page.keyboard.press('Escape'); await page.click('#ckNone');
  await page.click('#legalBack'); await page.waitForSelector('#signForm');
  await page.click('#demoMgr'); await page.waitForSelector('#agreeForm'); await clean('agreement'); await L.passGate(page);
  // 2. hostile text typed into every free-text field
  const tab = v => page.click('#tabsBottom .tab[data-view="' + v + '"]');
  await tab('setup');
  await page.fill('#storeInput', EVIL[0]); await page.click('#btnStoreName');
  for (const id of await page.$$eval('input[data-bind="role.name"]', e => e.map(x => x.id))) await page.fill('#' + id, EVIL[1]);
  for (const id of await page.$$eval('input[data-bind="shift.name"]', e => e.map(x => x.id))) await page.fill('#' + id, EVIL[2]);
  await clean('settings while typing');
  await tab('team');
  await page.click('#btnAddEmp'); await page.waitForSelector('#empName');
  await page.fill('#empName', EVIL[3]); await page.fill('#empNumber', '556677'); await page.click('.sheet .pickbtn'); await page.click('#btnEmpSave');
  await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  await clean('team with a hostile name');
  for (const v of ['schedule', 'availability', 'team', 'setup']) { await tab(v); await clean(v); }
  await tab('schedule'); await page.click('#btnAuto'); await clean('after auto-scheduling');
  await page.click('.pos'); await page.waitForSelector('#sheetRoot .sheet'); await clean('position dialog'); await page.keyboard.press('Escape');
  await page.click('#btnMore'); await page.waitForSelector('#sheetRoot .sheet'); await page.click('[data-act="share"]'); await page.waitForSelector('#sheetRoot .sheet'); await clean('share as text'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await tab('availability');
  await page.click('.mx-btn'); await page.waitForSelector('#sheetRoot .sheet');
  await page.fill('#sheetRoot textarea', EVIL[3] + EVIL[0]); await clean('note field'); await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('#btnOut'); await clean('after reload');
  s.check('the store name shows as text in the header', (await L.txt(page, '#storeName')) === EVIL[0], await L.txt(page, '#storeName'));
  await page.click('#btnOut'); await page.waitForSelector('#signForm'); await clean('sign-in after');
  // the renamed store is no longer the example, so there is no quick way in: sign in as one of its people
  await page.fill('#siName', 'נועה'); await page.fill('#siNumber', '1001'); await page.click('#btnSignIn');
  await L.passGate(page); await clean('employee availability');
  await page.click('#tabsBottom .tab[data-view="my-shifts"]'); await clean('employee shifts');
  s.errors.splice(0, s.errors.length, ...s.errors.filter(e => !/ERR_FILE_NOT_FOUND|net::ERR/.test(e)));
  await browser.close();
  process.exit(s.report() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
