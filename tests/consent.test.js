// Optional cookie categories and an optional (marketing) consent, switched on in a copy of the registry.
const L = require('./lib');
(async () => {
  const s = L.suite(), browser = await L.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.claude = { use: async () => null }; });
  let hits = 0;
  await ctx.route('https://analytics.example/**', r => { hits++; r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__an = (window.__an || 0) + 1;' }); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  s.watch(page, 'opt');
  const url = 'file://' + L.path.join(L.BUILD, 'page-opt.html');
  const has = sel => page.$(sel).then(Boolean);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('sadran.consent')));
  const an = () => page.evaluate(() => window.__an || 0);
  const tags = () => page.$$eval('script[src*="analytics.example"]', x => x.length);
  await page.goto(url); await L.enterStore(page);
  // --- real prompt
  s.check('prompt offers accept, reject and customise', await has('#ckAll') && await has('#ckNone') && await has('#ckMore'));
  s.check('prompt names the optional category', /ניתוח שימוש/.test(await L.txt(page, '.ck-t')) && !/שיווק/.test(await L.txt(page, '.ck-t')), await L.txt(page, '.ck-t'));
  const cls = await page.$$eval('#ckAll, #ckNone', b => b.map(x => x.className + '|' + Math.round(x.getBoundingClientRect().height)));
  s.check('accept and reject look the same', cls[0] === cls[1], cls);
  s.check('nothing optional loads before a choice', hits === 0 && (await an()) === 0 && (await tags()) === 0, hits);
  await page.waitForTimeout(400);
  s.check('still nothing after waiting', hits === 0);
  // --- reject
  await page.click('#ckNone');
  s.check('reject: nothing loads, choice stored', hits === 0 && (await an()) === 0 && JSON.stringify((await stored()).choices) === '{}' && !(await has('.ck')), await stored());
  await page.reload(); await page.waitForSelector('#signForm');
  s.check('reject is remembered', hits === 0 && !(await has('.ck')));
  // --- change later: allow
  await page.click('#ckPrefs'); await page.waitForSelector('#sheetRoot .sheet');
  s.check('category offered, unticked', await page.$eval('#ck-analytics', e => !e.checked && !e.disabled));
  s.check('empty category not offered', !(await has('#ck-marketing')));
  await page.check('#ck-analytics'); await page.click('#ckSave');
  await page.waitForFunction(() => window.__an === 1);
  const st = await stored();
  s.check('allow: script loads once, choice stored', hits === 1 && st.choices.analytics === true && st.source === 'preferences' && (await tags()) === 1, st);
  s.check('script carries its attributes', (await page.getAttribute('script[src*="analytics.example"]', 'data-site')) === 'sadran');
  await page.reload(); await page.waitForSelector('#signForm'); await page.waitForFunction(() => window.__an === 1);
  s.check('allow is remembered', hits === 2 && !(await has('.ck')));
  // --- change later: withdraw
  await page.click('#ckPrefs'); await page.waitForSelector('#sheetRoot .sheet');
  s.check('settings show the current choice', await page.isChecked('#ck-analytics'));
  await page.uncheck('#ck-analytics');
  await Promise.all([page.waitForEvent('load'), page.click('#ckSave')]);
  await page.waitForSelector('#signForm');
  s.check('withdraw: page reloads without the script', (await an()) === 0 && hits === 2 && (await stored()).choices.analytics === false, [await an(), hits, await stored()]);
  // --- accept all from the prompt
  await page.evaluate(() => localStorage.removeItem('sadran.consent'));
  await page.reload(); await page.waitForSelector('#ckAll');
  s.check('prompt returns when there is no stored choice', hits === 2);
  await page.click('#ckAll'); await page.waitForFunction(() => window.__an === 1);
  s.check('accept all loads the script', hits === 3 && (await stored()).choices.analytics === true && (await stored()).source === 'banner');
  // --- expiry and version
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('sadran.consent')); c.at = Date.now() - 366 * 864e5; localStorage.setItem('sadran.consent', JSON.stringify(c)); });
  await page.reload(); await page.waitForSelector('#ckAll');
  s.check('a choice older than a year is asked again, nothing loads', hits === 3 && (await an()) === 0);
  await page.click('#ckAll'); await page.waitForFunction(() => window.__an === 1);
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('sadran.consent')); c.v = '0.9'; localStorage.setItem('sadran.consent', JSON.stringify(c)); });
  await page.reload(); await page.waitForSelector('#ckAll');
  s.check('a new cookie list version asks again', (await an()) === 0);
  await page.evaluate(() => localStorage.setItem('sadran.consent', '"garbage"'));
  await page.reload(); await page.waitForSelector('#ckAll');
  s.check('a damaged stored choice counts as no choice', (await an()) === 0);
  // customise straight from the prompt
  await page.click('#ckMore'); await page.waitForSelector('#sheetRoot .sheet');
  s.check('customise starts with optional categories off', !(await page.isChecked('#ck-analytics')));
  await page.click('#ckSave'); await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  s.check('saving without ticking refuses optional', (await stored()).choices.analytics !== true && (await an()) === 0 && !(await has('.ck')));
  // cookies page lists the optional item under its category
  await page.click('#foot a[href="#cookies"]'); await page.waitForSelector('article.legal');
  s.check('cookies page lists both categories', (await page.$$eval('article.legal h3', h => h.map(x => x.textContent))).join(',') === 'הכרחי,ניתוח שימוש');
  await page.click('#legalBack'); await page.waitForSelector('#signForm');

  // --- optional consent (marketing)
  await page.click('#demoMgr'); await page.waitForSelector('#agreeForm');
  const boxes = await page.$$eval('#agreeForm input[type=checkbox]', b => b.map(x => [x.id, x.checked, x.required]));
  s.check('two separate unticked boxes; only the terms are required', JSON.stringify(boxes) === JSON.stringify([['ag-terms', false, true], ['ag-marketing', false, false]]), boxes);
  s.check('optional box is marked optional and names the business', /לא חובה/.test(await L.txt(page, 'label[for="ag-marketing"]')) && /מרכול השכונה בע״מ/.test(await L.txt(page, 'label[for="ag-marketing"]')), await L.txt(page, 'label[for="ag-marketing"]'));
  s.check('no email field until opted in', !(await has('#ag-marketing-email')));
  await page.check('#ag-terms'); await page.click('#btnAgree'); await page.waitForSelector('#btnOut');
  let log = await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.v1')).consentLog.manager);
  s.check('agreeing to the terms does not opt in to marketing', log.terms.granted === true && !log.marketing, log);
  await page.click('#ckPrefs'); await page.waitForSelector('#sheetRoot .sheet');
  s.check('marketing offered in settings, unticked', !(await page.isChecked('#pf-marketing')));
  await page.check('#pf-marketing'); await page.waitForSelector('#pf-marketing-email');
  await page.click('#ckSave');
  s.check('opt-in needs the address', /חסר: דוא״ל לקבלת העדכונים/.test(await L.txt(page, '#sheetRoot .err')), await L.txt(page, '#sheetRoot .err'));
  await page.fill('#pf-marketing-email', 'not-an-address'); await page.click('#ckSave');
  s.check('address is checked', /אינה תקינה/.test(await L.txt(page, '#sheetRoot .err')));
  s.check('typed value survives the error', (await page.inputValue('#pf-marketing-email')) === 'not-an-address');
  await page.fill('#pf-marketing-email', 'owner@example.com'); await page.click('#ckSave');
  await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  log = await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.v1')).consentLog.manager);
  const t1 = log.marketing.at;
  s.check('opt-in recorded with time, source, version and address', log.marketing.granted === true && t1 > 0 && log.marketing.source === 'preferences' && log.marketing.version === '1.0' && log.marketing.details.email === 'owner@example.com', log.marketing);
  await page.waitForTimeout(30);
  await page.click('#ckPrefs'); await page.waitForSelector('#sheetRoot .sheet');
  s.check('settings show the opt-in and address', await page.isChecked('#pf-marketing') && (await page.inputValue('#pf-marketing-email')) === 'owner@example.com');
  await page.uncheck('#pf-marketing'); await page.click('#ckSave');
  await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  log = await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.v1')).consentLog.manager);
  s.check('withdrawal recorded with its own time', log.marketing.granted === false && log.marketing.at > t1 && log.marketing.source === 'preferences' && !log.marketing.details.email, log.marketing);
  // at the gate, for someone new
  await page.click('#btnOut'); await page.waitForSelector('#signForm');
  await page.click('#demoEmp'); await page.waitForSelector('#agreeForm');
  s.check('next person starts with both boxes unticked', !(await page.isChecked('#ag-terms')) && !(await page.isChecked('#ag-marketing')));
  await page.check('#ag-marketing'); await page.waitForSelector('#ag-marketing-email');
  await page.click('#btnAgree');
  s.check('optional alone is not enough', /צריך לסמן את האישור/.test(await L.txt(page, '#agreeForm .err')));
  await page.check('#ag-terms'); await page.fill('#ag-marketing-email', 'shadi@example.com'); await page.click('#btnAgree');
  await page.waitForSelector('#btnOut');
  log = await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.v1')).consentLog.e_shadi);
  s.check('both recorded from the gate, separately', log.terms.granted && log.terms.source === 'sign-in' && log.marketing.granted && log.marketing.source === 'sign-in' && log.marketing.details.email === 'shadi@example.com', log);
  await browser.close();
  process.exit(s.report() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
