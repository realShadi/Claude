// Several stores: the product's front page, choosing a store, opening one, and keeping stores apart.
// Also: data saved before there were several stores becomes the first store, untouched.
const L = require('./lib');
(async () => {
  const s = L.suite(), browser = await L.launch();
  const page = await L.demoPage(browser, s, { front: true });
  const has = sel => page.$(sel).then(Boolean);
  const index = () => page.evaluate(() => JSON.parse(localStorage.getItem('sadran.stores')));
  const tab = v => page.click('#tabsBottom .tab[data-view="' + v + '"]');

  // ---------- the front page
  s.check('a new visitor lands on the product page', (await L.txt(page, 'h1')) === 'הסידור של השבוע, מוכן בכמה דקות' && (await page.title()) === 'סידור עבודה שבועי לחנויות · סדרן', [await L.txt(page, 'h1'), await page.title()]);
  s.check('it offers to enter a store and to open one', (await L.txt(page, '#lpEnter')) === 'כניסה לחנות' && (await L.txt(page, '#lpOpen')) === 'פתיחת חנות חדשה' && !(await has('#lpGo')));
  s.check('no store is named in the header, and there are no tabs', (await L.txt(page, '#storeName')) === '' && await page.$eval('#tabsBottom', e => e.hidden));
  s.check('one main heading, then sections', (await page.$$('h1')).length === 1 && (await page.$$eval('h2', h => h.map(x => x.textContent))).join('|') === 'איך זה עובד|מה יש בסדרן|מתחילים?');
  s.check('the sample roster has a text alternative', /דוגמה לסידור/.test(await page.getAttribute('.lp-demo', 'aria-label')) && (await page.getAttribute('.lp-demo', 'role')) === 'img');
  s.check('legal links and the cookie notice are there too', (await page.$$('#foot a')).length === 4 && await has('#cookieRoot .ck'));
  await L.overflow(page, s, 'front page');
  await page.click('#ckNone');

  // ---------- choosing a store
  await page.click('#lpEnter'); await page.waitForSelector('.shop');
  s.check('the list shows the example store', (await page.$$eval('.shop', e => e.map(x => x.textContent.trim()))).join('|') === 'מרכול השכונה' && (await page.title()) === 'בחירת חנות · סדרן');
  await page.fill('#storeQ', 'שכונ');
  s.check('search by part of the name', (await page.$$('.shop')).length === 1);
  await page.fill('#storeQ', 'אין כזו');
  s.check('nothing found says so', /לא נמצאה חנות בשם הזה/.test(await L.txt(page, '#storeList')) && !(await has('.shop')));
  s.check('typing keeps the cursor in the search field', (await page.evaluate(() => document.activeElement.id)) === 'storeQ');
  await page.fill('#storeQ', '');
  await page.click('#frontBack'); await page.waitForSelector('#lpEnter');
  s.check('back returns to the front page', true);
  await page.goBack(); await page.waitForSelector('.shop');
  s.check('the browser back button works between the screens', (await page.title()) === 'בחירת חנות · סדרן');
  await page.click('.shop[data-id="main"]'); await page.waitForSelector('#signForm');
  s.check('choosing a store opens its sign-in screen, with its name', (await L.txt(page, '.signin-h .sub')) === 'מרכול השכונה' && (await L.txt(page, '#storeName')) === 'מרכול השכונה');
  s.check('the example store shows its example code and a quick way in', await has('#demoMgr') && await has('#demoEmp') && /2468/.test(await L.txt(page, '.demo')));

  // ---------- opening a store
  await page.click('#siSwitch'); await page.waitForSelector('.shop');
  await page.click('#stOpen'); await page.waitForSelector('#openForm');
  const err = async () => L.txt(page, '#openForm .err');
  await page.click('#btnOpen');
  s.check('a store needs a name', /2 עד 60 תווים/.test(await err()) && (await page.getAttribute('#opName', 'aria-invalid')) === 'true', await err());
  await page.fill('#opName', '  מרכול   השכונה '); await page.click('#btnOpen');
  s.check('a name that is taken is refused', /כבר יש חנות בשם הזה/.test(await err()), await err());
  await page.fill('#opName', 'המכולת של דנה'); await page.fill('#opCode', '1357'); await page.click('#btnOpen');
  s.check('the manager code must be 6 to 12 digits', /6 עד 12 ספרות/.test(await err()) && (await page.getAttribute('#opCode', 'aria-invalid')) === 'true', await err());
  await page.fill('#opCode', '135790'); await page.fill('#opCode2', '135791'); await page.click('#btnOpen');
  s.check('the two codes must match', /לא זהים/.test(await err()), await err());
  await page.fill('#opCode2', '135790'); await page.click('#btnOpen');
  s.check('the agreement box starts unticked and is required', /צריך לסמן את האישור/.test(await err()) && !(await page.isChecked('#ag-terms')), await err());
  s.check('nothing was created yet', (await index()).list.length === 1);
  await page.check('#ag-terms'); await page.click('#btnOpen'); await page.waitForSelector('#btnOut');
  s.check('the new store opens on its manager screen', (await L.txt(page, '#storeName')) === 'המכולת של דנה' && (await page.title()) === 'סידור · סדרן' && /החנות נפתחה/.test(await L.txt(page, '.toast')), await page.title());
  let idx = await index();
  const B = idx.list[1].id;
  s.check('it is kept as a second store, under its own key', idx.list.length === 2 && idx.active === B && idx.list[1].name === 'המכולת של דנה' && idx.list[1].key === 'sadran.s.' + B && idx.list[0].key === 'sadran.v1', idx);
  const b0 = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), 'sadran.s.' + B);
  s.check('it starts empty, with the agreement recorded', b0.employees.length === 0 && b0.managerCode === '135790' && b0.example === false && b0.store.name === 'המכולת של דנה' && b0.consentLog.manager.terms.source === 'open-store' && b0.consentLog.manager.terms.version === '1.1', b0.consentLog);
  await tab('team');
  s.check('nobody is in the new store', /עוד אין עובדים/.test(await L.txt(page, '#view')));
  await page.click('#btnAddEmp'); await page.waitForSelector('#empName');
  await page.fill('#empName', 'עובדת של דנה'); await page.fill('#empNumber', '4455'); await page.click('.sheet .pickbtn'); await page.click('#btnEmpSave');
  await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  await tab('setup');
  s.check('a store someone opened has no "reset to the example" button', !(await has('#cf-reset')) && await has('#btnBackup'));

  // ---------- the stores are separate
  const ex0 = await page.evaluate(() => localStorage.getItem('sadran.v1'));
  await page.click('#btnOut'); await page.waitForSelector('#signForm');
  s.check('signing out stays at this store, with no example code shown', (await L.txt(page, '.signin-h .sub')) === 'המכולת של דנה' && !(await has('#demoMgr')) && !(await has('#cf-reset')));
  await page.fill('#siName', 'נועה'); await page.fill('#siNumber', '1001'); await page.click('#btnSignIn');
  s.check("a person from another store cannot sign in here", /לא תואמים/.test(await L.txt(page, '#signForm .err')));
  await page.click('#segMgr'); await page.fill('#siCode', '2468'); await page.click('#btnSignIn');
  s.check("another store's manager code does not open this one", /הקוד שגוי/.test(await L.txt(page, '#signForm .err')));
  await page.click('#siSwitch'); await page.waitForSelector('.shop');
  s.check('both stores are in the list, by name', (await page.$$eval('.shop', e => e.map(x => x.textContent.trim()))).join('|') === 'המכולת של דנה|מרכול השכונה');
  await page.click('.shop[data-id="main"]'); await page.waitForSelector('#signForm');
  await L.demoSignIn(page, 'manager');
  await tab('team');
  s.check("the example store has its own 11 people, and not the new store's employee", (await page.$$('.item')).length === 11 && !/עובדת של דנה/.test(await L.txt(page, '#view')));
  s.check("opening and using another store did not touch the first store's data", (await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.v1')).employees.length)) === 11 && JSON.parse(ex0).store.name === 'מרכול השכונה');
  await tab('setup');
  s.check('the example store can be reset; a renamed one could not', await has('#cf-reset'));
  // rename: must stay unique
  await page.fill('#storeInput', 'המכולת  של דנה'); await page.click('#btnStoreName');
  s.check('renaming to the name of another store is refused', /כבר יש חנות בשם הזה/.test(await L.txt(page, '#view .err')) && (await L.txt(page, '#storeName')) === 'מרכול השכונה');
  s.check('the refusal is tied to the name field', (await page.getAttribute('#storeInput', 'aria-invalid')) === 'true' && (await page.getAttribute('#storeInput', 'aria-describedby')) === 'storeErr' && !!(await page.$('#storeErr[role="alert"]')));
  await page.fill('#storeInput', 'מרכול השכונה, סניף צפון'); await page.click('#btnStoreName');
  await page.waitForFunction(() => document.getElementById('storeName').textContent === 'מרכול השכונה, סניף צפון');
  s.check('a new name is saved and shown', /שם החנות עודכן/.test(await L.txt(page, '.toast')) && (await index()).list[0].name === 'מרכול השכונה, סניף צפון');
  s.check('once renamed it is no longer an example to reset', !(await has('#cf-reset')));
  // back into the other store: it remembers nothing of this sign-in
  await page.click('#brandLink');
  s.check('the name at the top leads into the app while signed in', (await page.title()) === 'סידור · סדרן');
  await page.click('#btnOut'); await page.waitForSelector('#signForm');
  await page.click('#brandLink'); await page.waitForSelector('#lpEnter');
  s.check('signed out, the name at the top leads to the front page', /נכנסו לאחרונה אל מרכול השכונה, סניף צפון/.test(await L.txt(page, '.lp-copy')) && (await L.txt(page, '#storeName')) === '');
  await page.click('#lpLast'); await page.waitForSelector('#signForm');
  s.check('and from there straight back to the last store', (await L.txt(page, '.signin-h .sub')) === 'מרכול השכונה, סניף צפון');
  await page.click('#siSwitch'); await page.waitForSelector('.shop');
  await page.click('.shop[data-id="' + B + '"]'); await page.waitForSelector('#signForm');
  await page.click('#segMgr'); await page.fill('#siCode', '135790'); await page.click('#btnSignIn'); await page.waitForSelector('#btnOut');
  s.check('the second store is entered with its own code, and is not asked to agree again', !(await has('#agreeForm')) && (await L.txt(page, '#storeName')) === 'המכולת של דנה');
  await tab('team');
  s.check('and has its own employee', (await page.$$('.item')).length === 1 && /עובדת של דנה/.test(await L.txt(page, '.item')));
  await page.reload(); await page.waitForSelector('#btnOut');
  s.check('a reload stays in the store that was open', (await L.txt(page, '#storeName')) === 'המכולת של דנה');
  // the front page while signed in: a way straight back
  await page.goto(page.url().split('#')[0] + '#home'); await page.waitForSelector('#lpGo');
  s.check('the front page offers to continue to the open store', (await L.txt(page, '#lpGo')) === 'המשך אל המכולת של דנה' && (await L.txt(page, '#lpEnter')) === 'חנות אחרת');
  await page.click('#lpGo'); await page.waitForSelector('#btnOut');
  s.check('continue returns to the app', (await page.title()) === 'סידור · סדרן');
  await page.context().close();

  // ---------- data from before there were several stores
  const old = await L.demoPage(browser, s, { front: true });
  await old.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('sadran.v1'));
    delete st.app;
    st.store.name = 'החנות של שאדי';
    st.managerCode = '864213';
    st.employees.push({ id: 'e_mine', name: 'העובד שלי', number: '4321', roles: ['r_cash'], max: 9 });
    st.prefs.session = { role: 'manager' };
    st.consentLog = { manager: { terms: { version: '1.0', granted: true, at: 1763400000000, source: 'sign-in', details: {} } } };
    localStorage.clear();   // exactly what a browser held before this version: one store, under the old key
    localStorage.setItem('sadran.v1', JSON.stringify(st));
  });
  const before = await old.evaluate(() => localStorage.getItem('sadran.v1'));
  await old.reload(); await old.waitForSelector('#lpGo');
  s.check('the first visit after the update shows the front page once, with a way straight back in', (await L.txt(old, '#lpGo')) === 'המשך אל החנות של שאדי' && (await L.txt(old, '#storeName')) === '');
  const made = await old.evaluate(() => JSON.parse(localStorage.getItem('sadran.stores')));
  s.check('the old data became the first store, under the key it always had', made.active === 'main' && made.list.length === 1 && made.list[0].key === 'sadran.v1' && made.list[0].name === 'החנות של שאדי', made);
  s.check('a copy of it as it was is set aside', (await old.evaluate(() => JSON.parse(localStorage.getItem('sadran.keep.update')).data)) === before);
  await old.click('#lpGo'); await old.waitForSelector('#agreeForm');
  s.check('the sign-in was kept; the changed terms are put to the manager again', (await L.txt(old, '#view h1')) === 'התנאים התעדכנו' && !(await old.isChecked('#ag-terms')));
  await L.passGate(old);
  const kept = await old.evaluate(() => JSON.parse(localStorage.getItem('sadran.v1')));
  s.check('everything is still there: name, people, manager code', (await L.txt(old, '#storeName')) === 'החנות של שאדי' && kept.employees.length === 12 && kept.employees[11].name === 'העובד שלי' && kept.employees[11].max === 9 && kept.managerCode === '864213' && kept.example === false, [kept.employees.length, kept.managerCode, kept.example]);
  await old.reload(); await old.waitForSelector('#btnOut');
  s.check('later visits open the store directly', !(await old.$('#lpGo')) && (await old.title()) === 'סידור · סדרן');
  await old.click('#btnOut'); await old.waitForSelector('#signForm');
  s.check('with their own manager code, no example code is shown and nothing can be reset', !(await old.$('#demoMgr')) && !(await old.$('#cf-reset')));
  await old.context().close();

  // ---------- a store still on the example code says so, so its owner is never locked out
  const hint = await L.demoPage(browser, s, { front: true });
  await hint.evaluate(() => { const st = JSON.parse(localStorage.getItem('sadran.v1')); st.store.name = 'שלי'; st.example = false; localStorage.clear(); localStorage.setItem('sadran.v1', JSON.stringify(st)); });
  await hint.reload(); await hint.waitForSelector('#lpEnter');
  await L.enterStore(hint);
  s.check('their own store that still uses the example code shows it', /קוד המנהל\/ת של החנות הזו/.test(await L.txt(hint, '.demo')) && !!(await hint.$('#demoMgr')) && !(await hint.$('#demoEmp')) && !(await hint.$('#cf-reset')), await L.txt(hint, '.demo'));
  await hint.context().close();

  // ---------- small screens
  const small = await L.demoPage(browser, s, { front: true, viewport: { width: 320, height: 640 } });
  await L.overflow(small, s, 'front page at 320');
  await small.click('#ckNone');
  await small.click('#lpOpen'); await small.waitForSelector('#openForm'); await L.overflow(small, s, 'open a store at 320');
  await small.click('#opEnter'); await small.waitForSelector('.shop'); await L.overflow(small, s, 'store list at 320');
  s.check('the new screens fit a 320 px screen', !s.errors.some(e => /overflow/.test(e)), s.errors);
  await browser.close();
  process.exit(s.report() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
