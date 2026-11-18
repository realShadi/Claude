// Legal pages, footer, agreement screen and cookie notice in the single-file demo.
const L = require('./lib');
(async () => {
  const s = L.suite(), browser = await L.launch();
  const page = await L.demoPage(browser, s);
  const has = sel => page.$(sel).then(Boolean);
  // --- signed out
  s.check('sign-in shown', await has('#signForm'));
  s.check('title is per screen', (await page.title()) === 'כניסה · סדרן', await page.title());
  s.check('lang/dir on html', await page.evaluate(() => document.documentElement.lang + '|' + document.documentElement.dir) !== null);
  const foot = await page.$$eval('#foot a', a => a.map(x => x.getAttribute('href') + '=' + x.textContent.trim()));
  s.check('footer links to the four pages', foot.join(',') === '#privacy=מדיניות פרטיות,#terms=תנאי שימוש,#accessibility=הצהרת נגישות,#cookies=עוגיות', foot);
  s.check('footer has cookie settings', await has('#ckPrefs'));
  s.check('sign-in form links to terms and privacy', await has('#signForm #siTerms') && await has('#signForm #siPrivacy'));
  // --- cookie notice
  s.check('cookie notice shown on first visit', await has('#cookieRoot .ck'));
  s.check('notice is informational (no optional categories)', (await L.txt(page, '#ckNone')) === 'הבנתי' && !(await has('#ckAll')));
  const room = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ck-h'));
  s.check('room is kept for the notice', parseInt(room) > 40, room);
  // --- legal page from the sign-in form
  await page.fill('#siName', 'שדי');
  await page.click('#siPrivacy');
  await page.waitForSelector('article.legal');
  s.check('privacy page opens', (await L.txt(page, 'article.legal h1')) === 'מדיניות פרטיות');
  s.check('legal title', (await page.title()) === 'מדיניות פרטיות · סדרן', await page.title());
  s.check('one h1', (await page.$$('h1')).length === 1);
  s.check('focus moved to main', await page.evaluate(() => document.activeElement.id) === 'view');
  s.check('scrolled to top', await page.evaluate(() => window.scrollY) === 0);
  const marks = await page.$$eval('article.legal mark.ph', m => m.map(x => x.textContent));
  s.check('missing details are marked', marks.length > 5 && marks.every(t => /^\[להשלים: .+\]$/.test(t)), marks.slice(0, 3));
  s.check('no raw placeholders left', !/\{\{/.test(await page.textContent('article.legal')));
  s.check('filled detail is plain text', /יפן \(טוקיו\)/.test(await page.textContent('article.legal')));
  s.check('meta line', /עודכן לאחרונה: 18\.11\.2026 · גרסה 1\.0/.test(await L.txt(page, '.legal-meta')), await L.txt(page, '.legal-meta'));
  s.check('current page marked in footer', (await page.getAttribute('#foot a[href="#privacy"]', 'aria-current')) === 'page');
  s.check('mailto with missing address is not a link', (await page.$$('article.legal a[href^="mailto:"]')).length === 0);
  await page.click('article.legal a[href="#cookies"]');
  await page.waitForFunction(() => document.querySelector('article.legal h1').textContent === 'עוגיות ואחסון במכשיר');
  const rows = await page.$$eval('.stored li', r => r.map(x => x.querySelector('code').textContent));
  s.check('cookies page lists what is stored', rows.join(',') === 'sadran.token,sadran.appearance,sadran.logo,sadran.consent,Service Worker, Push', rows);
  s.check('each item says why and for how long', (await page.$$eval('.stored li', r => r.every(x => x.querySelectorAll('span').length === 2 && /^נשמר: /.test(x.querySelector('.stored-k').textContent)))));
  s.check('cookies page has settings button', await has('#ckOpen'));
  await page.click('#legalBack');
  await page.waitForSelector('#signForm');
  s.check('back returns to sign-in with typed name kept', (await page.inputValue('#siName')) === 'שדי');
  s.check('focus returns to the link used', await page.evaluate(() => document.activeElement.id) === 'siPrivacy', await page.evaluate(() => document.activeElement.id));
  for (const id of ['terms', 'accessibility']) {
    await page.click('#foot a[href="#' + id + '"]');
    await page.waitForFunction(i => location.hash === '#' + i && document.querySelector('article.legal h1'), id);
    s.check(id + ' page renders', (await page.$$('article.legal h2')).length >= 5);
    await L.overflow(page, s, id);
  }
  await page.goBack();
  await page.goBack();
  await page.waitForSelector('#signForm');
  s.check('browser back leaves the legal pages', await has('#signForm'));
  // --- cookie preferences
  await page.click('#ckMore');
  await page.waitForSelector('#sheetRoot .sheet');
  s.check('preferences dialog opens', (await L.txt(page, '#sheetRoot h2')) === 'עוגיות ופרטיות');
  s.check('notice hidden while dialog is open', !(await has('#cookieRoot .ck')));
  s.check('necessary is on and locked', await page.$eval('#ck-necessary', e => e.checked && e.disabled));
  s.check('no empty optional categories offered', !(await has('#ck-analytics')) && !(await has('#ck-marketing')));
  s.check('page behind is inert', await page.$eval('#view', e => e.inert) && await page.$eval('#foot', e => e.inert));
  // Tab stays inside the dialog
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  s.check('Tab is kept inside the dialog', await page.evaluate(() => !!document.activeElement.closest('#sheetRoot')));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  s.check('Escape closes; notice returns', await has('#cookieRoot .ck'));
  s.check('focus returns to the opener', await page.evaluate(() => document.activeElement.id) === 'ckMore', await page.evaluate(() => document.activeElement.id));
  await page.click('#ckNone');
  s.check('notice dismissed', !(await has('#cookieRoot .ck')));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.consent')));
  s.check('choice stored with version, time and source', stored && stored.v === '1.0' && stored.at > 0 && stored.source === 'banner' && typeof stored.choices === 'object', stored);
  s.check('room released', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ck-h')) === '0px');
  await page.reload();
  await page.waitForSelector('#signForm');
  s.check('choice remembered after reload', !(await has('#cookieRoot .ck')));
  await page.click('#ckPrefs');
  await page.waitForSelector('#sheetRoot .sheet');
  s.check('can reopen settings from the footer', await has('#ckSave'));
  await page.click('#ckSave');
  await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  // --- agreement after sign-in (manager)
  await page.click('#demoMgr');
  await page.waitForSelector('#agreeForm');
  s.check('agreement screen after first sign-in', (await L.txt(page, '#view h1')) === 'לפני שממשיכים');
  s.check('no tabs before agreeing', await page.$eval('#tabsBottom', e => e.hidden));
  const boxes = await page.$$eval('#agreeForm input[type=checkbox]', b => b.map(x => [x.id, x.checked, x.required]));
  s.check('one unticked required box', boxes.length === 1 && boxes[0][1] === false && boxes[0][2] === true, boxes);
  const links = await page.$$eval('#agreeForm label a', a => a.map(x => x.getAttribute('href')));
  s.check('box links to both documents', links.join(',') === '#terms,#privacy', links);
  await page.click('#btnAgree');
  s.check('cannot continue without ticking', (await L.txt(page, '#agreeForm .err')) === 'כדי להמשיך צריך לסמן את האישור.' && await has('#agreeForm'));
  await page.goto(page.url().split('#')[0] + '#schedule');
  await page.waitForSelector('#agreeForm');
  s.check('address cannot skip the agreement', await has('#agreeForm') && !(await has('.tab')));
  // read the terms from the box, come back: box state kept
  await page.check('#ag-terms');
  await page.click('#agreeForm label a[href="#terms"]');
  await page.waitForSelector('article.legal');
  s.check('ticking is not triggered by the link; terms open', (await L.txt(page, 'article.legal h1')) === 'תנאי שימוש');
  await page.click('#legalBack');
  await page.waitForSelector('#agreeForm');
  s.check('tick kept after reading', await page.isChecked('#ag-terms'));
  // sign out without agreeing, sign in as someone else: box must be unticked again
  await page.click('#btnAgreeOut');
  await page.waitForSelector('#signForm');
  await page.click('#demoEmp');
  await page.waitForSelector('#agreeForm');
  s.check('box is unticked for the next person', !(await page.isChecked('#ag-terms')));
  await page.check('#ag-terms');
  await page.click('#btnAgree');
  await page.waitForSelector('#btnOut');
  s.check('employee enters after agreeing', await has('.tab'));
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.v1')).consentLog);
  const rec = log && log.e_shadi && log.e_shadi.terms;
  s.check('consent recorded with version, time and source', rec && rec.granted === true && rec.version === '1.0' && rec.at > 0 && rec.source === 'sign-in', log);
  s.check('manager has no record (did not agree)', !log.manager);
  await page.reload();
  await page.waitForSelector('#btnOut');
  s.check('not asked again', !(await has('#agreeForm')));
  // note field carries the privacy hint
  s.check('note field explains and links', /לא לכתוב בה מידע רגיש/.test(await L.txt(page, '[id^="noteHelp-"]')) && await has('[id^="lnNote-"]'));
  // preferences show when the terms were accepted
  await page.click('#ckPrefs');
  await page.waitForSelector('#sheetRoot .sheet');
  s.check('settings show the acceptance', /אישרת את תנאי השימוש ומדיניות הפרטיות .*גרסה 1\.0/.test(await L.txt(page, '#sheetRoot .sheet-b')), await L.txt(page, '#sheetRoot .sheet-b'));
  await page.keyboard.press('Escape');
  // legal page while signed in keeps the tabs, back restores scroll
  await page.evaluate(() => window.scrollTo(0, 400));
  const y0 = await page.evaluate(() => window.scrollY);
  await page.click('#foot a[href="#accessibility"]');
  await page.waitForSelector('article.legal');
  s.check('tabs stay, none current', (await page.$$('.tab[aria-current]')).length === 0 && (await page.$$('.tab')).length > 0);
  await page.click('#legalBack');
  await page.waitForFunction(() => !document.querySelector('article.legal'));
  s.check('back restores the place on the page', Math.abs((await page.evaluate(() => window.scrollY)) - y0) < 3, [y0, await page.evaluate(() => window.scrollY)]);
  // --- version change asks again
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('sadran.v1')); st.consentLog.e_shadi.terms.version = '0.9'; localStorage.setItem('sadran.v1', JSON.stringify(st)); });
  await page.reload();
  await page.waitForSelector('#agreeForm');
  s.check('a new version asks again', (await L.txt(page, '#view h1')) === 'התנאים התעדכנו' && !(await page.isChecked('#ag-terms')));
  await L.passGate(page);
  // --- manager: dialog survives reading the policy
  await page.click('#btnOut');
  await page.waitForSelector('#signForm');
  await L.demoSignIn(page, 'manager');
  await page.click('#tabsBottom .tab[data-view="team"]');
  await page.click('#btnAddEmp');
  await page.waitForSelector('#sheetRoot .sheet');
  await page.fill('#empName', 'בדיקה זמנית');
  await page.click('#lnEmp');
  await page.waitForSelector('article.legal');
  s.check('dialog steps aside for the policy', !(await has('#sheetRoot .sheet')));
  await page.click('#legalBack');
  await page.waitForSelector('#sheetRoot .sheet');
  s.check('dialog returns with what was typed', (await page.inputValue('#empName')) === 'בדיקה זמנית');
  s.check('focus returns to the link inside the dialog', await page.evaluate(() => document.activeElement.id) === 'lnEmp', await page.evaluate(() => document.activeElement.id));
  await page.keyboard.press('Escape');
  // settings card
  await page.click('#tabsBottom .tab[data-view="setup"]');
  const card = await L.txt(page, '.doclist');
  s.check('settings list the documents as not yet reviewed', (card.match(/טרם אושר על ידי עורך\/ת דין/g) || []).length === 4, card);
  s.check('settings count the missing details', /17 פרטים של העסק חסרים במסמכים/.test(await page.textContent('#view')));
  await page.click('details[data-fold="legalMissing"] summary');
  s.check('and list them', (await page.$$('.miss li')).length === 17 && (await L.txt(page, '.miss li')) === 'שם העסק המלא', await L.txt(page, '.miss li'));
  await L.overflow(page, s, 'setup');
  await browser.close();
  process.exit(s.report() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
