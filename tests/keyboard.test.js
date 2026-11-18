// Keyboard-only use, visible focus, and layout at 320 px (WCAG 2.1.1, 2.1.2, 2.4.3, 2.4.7, 1.4.10).
const L = require('./lib');
(async () => {
  const s = L.suite(), browser = await L.launch();
  const page = await L.demoPage(browser, s, { viewport: { width: 1280, height: 860 } });
  const at = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('data-act') || a.getAttribute('href') || a.tagName) : null; });
  const ring = () => page.evaluate(() => { const a = document.activeElement, c = getComputedStyle(a); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2; });
  const press = async (k, n) => { for (let i = 0; i < (n || 1); i++) await page.keyboard.press(k); };
  // Walk the whole page with Tab: every stop shows a focus ring, and focus comes back round (no trap).
  async function walk(name) {
    const seen = [], bare = [];
    let last = '', wrapped = false;
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    for (let i = 0; i < 600; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null; const c = getComputedStyle(a), r = a.getBoundingClientRect(); return { k: (a.id || '') + '|' + (a.getAttribute('data-act') || '') + '|' + (a.getAttribute('href') || '') + '|' + a.tagName + '|' + Math.round(r.x + scrollX) + ',' + Math.round(r.y + scrollY), ring: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2, shown: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight, tab: a.tabIndex }; });
      if (!info) { if (wrapped) break; wrapped = true; last = ''; continue; }   // past the last control, the browser passes through the page itself once
      if (info.k === last) continue;   // a time field has several stops of its own
      if (seen.includes(info.k)) break;
      last = info.k;
      seen.push(info.k);
      if (!info.ring) bare.push(info.k);
      if (!info.shown) bare.push('offscreen ' + info.k);
      if (info.tab > 0) bare.push('tabindex>0 ' + info.k);
    }
    const all = await page.evaluate(() => Array.from(document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')).filter(e => e.getClientRects().length && !e.closest('[inert]') && getComputedStyle(e).visibility !== 'hidden').length);
    s.check(name + ': Tab reaches every control (' + seen.length + ' of ' + all + ')', seen.length === all, [seen.length, all]);
    s.check(name + ': every stop has a visible focus ring and is on screen', bare.length === 0, bare.slice(0, 6));
    return seen;
  }
  // --- skip link
  await page.keyboard.press('Tab');
  s.check('first Tab lands on the skip link, which becomes visible', (await at()) === 'skip' && await page.evaluate(() => document.activeElement.getBoundingClientRect().top >= 0));
  await page.keyboard.press('Enter');
  s.check('the skip link moves focus to the main content', (await page.evaluate(() => document.activeElement.id)) === 'view');
  let order = await walk('sign-in');
  const first = order.findIndex(k => k.startsWith('|skip|'));
  order = order.slice(first).concat(order.slice(0, first));   // the walk starts wherever focus was; read it from the top of the page
  const pos = id => order.findIndex(k => k.startsWith(id + '|'));
  s.check('order: skip link, cookie notice, header, form, footer', first >= 0 && pos('ckNone') > 0 && pos('ckNone') < pos('brandLink') && pos('brandLink') < pos('siName') && pos('siName') < pos('btnSignIn') && pos('btnSignIn') < pos('ckPrefs'), order.map(k => k.split('|').slice(0, 2).join('|')));
  // --- sign in and agree with the keyboard only
  await page.focus('#ckNone'); await page.keyboard.press('Enter');
  s.check('notice dismissed from the keyboard; focus goes to the content', !(await page.$('.ck')) && (await page.evaluate(() => document.activeElement.id)) === 'view');
  await page.focus('#segMgr'); await page.keyboard.press('Space');
  s.check('the sign-in type is switched with Space', (await page.getAttribute('#segMgr', 'aria-pressed')) === 'true' && (await at()) === 'segMgr');
  await page.keyboard.press('Tab'); await page.keyboard.type('2468'); await page.keyboard.press('Enter');
  await page.waitForSelector('#agreeForm');
  s.check('Enter submits the sign-in form', true);
  s.check('focus moves to the new screen', (await page.evaluate(() => document.activeElement.id)) === 'view');
  await page.keyboard.press('Tab');
  let hops = 0; while ((await at()) !== 'ag-terms' && hops++ < 20) await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  s.check('the agreement box is ticked with Space', await page.isChecked('#ag-terms') && (await at()) === 'ag-terms');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#btnOut');
  s.check('Enter in the form continues', true);
  await walk('schedule');
  // --- a dialog from the keyboard
  await page.focus('.pos'); const opener = await at();
  await page.keyboard.press('Enter'); await page.waitForSelector('#sheetRoot .sheet');
  s.check('Enter opens the dialog and focus moves into it', await page.evaluate(() => !!document.activeElement.closest('#sheetRoot')));
  s.check('the dialog is announced as a dialog with a name', await page.$eval('#sheetRoot .sheet', e => e.getAttribute('role') === 'dialog' && e.getAttribute('aria-modal') === 'true' && !!e.getAttribute('aria-label')));
  let inside = true; for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('#sheetRoot')))) inside = false; }
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Shift+Tab'); if (!(await page.evaluate(() => !!document.activeElement.closest('#sheetRoot')))) inside = false; }
  s.check('Tab and Shift+Tab stay inside the dialog', inside);
  s.check('focus inside the dialog is visible', await ring());
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  s.check('Escape closes it and focus returns to the control that opened it', (await at()) === opener, [await at(), opener]);
  // --- move between screens
  await page.focus('#tabsTop .tab[data-view="setup"]'); await page.keyboard.press('Enter');
  s.check('a tab is opened with Enter and stays focused', (await page.title()) === 'הגדרות · סדרן' && (await page.evaluate(() => document.activeElement.dataset.view)) === 'setup', await page.title());
  s.check('the new screen is announced', (await L.txt(page, '#routeStatus')) === 'הגדרות');
  await walk('settings');
  // a stepper says what it changes and the value, and keeps focus
  await page.focus('#rest-p'); const before = await page.getAttribute('#rest-p', 'aria-label');
  await page.keyboard.press('Enter');
  const after = await page.getAttribute('#rest-p', 'aria-label');
  s.check('a stepper names what it changes and says the new value', /^יותר, שעות מנוחה בין משמרות \(\d+\)$/.test(before) && before !== after && (await at()) === 'rest-p', [before, after]);
  await page.focus('#tabsTop .tab[data-view="availability"]'); await page.keyboard.press('Enter');
  const cell = await page.$eval('.mx tbody td i', e => [e.getAttribute('role'), e.getAttribute('aria-label')]);
  s.check('each square in the availability table has a text alternative', cell[0] === 'img' && /: (אפשר|מועדף|לא|סגור|טרם הוגש|חלק מהמשמרת)/.test(cell[1]), cell);
  s.check('the table has a caption, column and row headers', await page.$eval('.mx', t => !!t.querySelector('caption') && t.querySelectorAll('thead th[scope="col"]').length === 8 && t.querySelectorAll('tbody th[scope="row"]').length > 3));
  await walk('availability');
  await page.focus('#tabsTop .tab[data-view="team"]'); await page.keyboard.press('Enter');
  await walk('team');
  // form errors are tied to the field at fault
  await page.focus('#btnAddEmp'); await page.keyboard.press('Enter'); await page.waitForSelector('#empName');
  await page.focus('#btnEmpSave'); await page.keyboard.press('Enter');
  const inv = await page.$eval('#empName', e => [e.getAttribute('aria-invalid'), e.getAttribute('aria-describedby')]);
  const msg = await page.$eval('#sheetRoot .err', e => [e.id, e.getAttribute('role'), e.textContent]);
  s.check('the field at fault is marked and tied to the message', inv[0] === 'true' && inv[1].split(' ').includes(msg[0]) && msg[1] === 'alert', [inv, msg]);
  await page.keyboard.press('Escape');
  await page.context().close();

  // --- 320 px wide: nothing needs sideways scrolling
  const small = await L.demoPage(browser, s, { viewport: { width: 320, height: 640 } });
  const fits = async name => { const r = await small.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); s.check('320 px: ' + name + ' fits', r[0] <= r[1], r); };
  await fits('sign-in with the cookie notice');
  await small.click('#ckMore'); await small.waitForSelector('#sheetRoot .sheet'); await fits('cookie settings'); await small.keyboard.press('Escape');
  for (const id of ['privacy', 'terms', 'accessibility', 'cookies']) { await small.click('#foot a[href="#' + id + '"]'); await small.waitForFunction(i => location.hash === '#' + i && document.querySelector('article.legal h2'), id); await fits(id + ' page'); }
  await small.click('#ckNone'); await small.click('#legalBack'); await small.waitForSelector('#signForm');
  await small.click('#demoMgr'); await small.waitForSelector('#agreeForm'); await fits('agreement'); await L.passGate(small);
  for (const v of ['schedule', 'availability', 'team', 'setup']) { await small.click('#tabsBottom .tab[data-view="' + v + '"]'); await fits(v); }
  // text spacing (1.4.12): wider lines, letters and words do not break the layout
  await small.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  for (const v of ['schedule', 'setup']) { await small.click('#tabsBottom .tab[data-view="' + v + '"]'); await fits(v + ' with wide text spacing'); }
  // a box inside a label is pressed through the whole label
  const sizes = await small.evaluate(() => Array.from(document.querySelectorAll('button, a[href], input, select, summary')).filter(e => e.getClientRects().length).map(e => { const r = (e.closest('label') || e).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), e.id || e.className]; }).filter(x => x[0] < 24 || x[1] < 24));
  s.check('every control is at least 24 px in both directions', sizes.length === 0, sizes.slice(0, 6));
  await browser.close();
  process.exit(s.report() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
