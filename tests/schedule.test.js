// The weekly limit, two shifts a day, exports without roles, and the safety of data kept in the browser.
const L = require('./lib');
const fs = require('fs'), path = require('path');
const DATA = ['example', 'managerCode', 'store', 'roles', 'shifts', 'req', 'closed', 'rules', 'theme', 'exportStyle', 'logo', 'employees', 'avail', 'weeks'];
const canon = v => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v));
const dataOf = st => canon(Object.fromEntries(DATA.map(k => [k, st[k]])));
// Record every piece of text drawn on a canvas, to see what an exported roster contains.
const spy = () => {
  window.__drawn = [];
  const ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t) { window.__drawn.push(String(t)); return ft.apply(this, arguments); };
};
(async () => {
  const s = L.suite(), browser = await L.launch();
  const page = await L.demoPage(browser, s, null, spy);
  const raw = () => page.evaluate(() => localStorage.getItem('sadran.v1'));
  const stored = async () => JSON.parse(await raw());
  const tab = v => page.click('#tabsBottom .tab[data-view="' + v + '"]');
  const patch = fn => page.evaluate(f => { const st = JSON.parse(localStorage.getItem('sadran.v1')); new Function('st', 'return (' + f + ')(st)')(st); localStorage.setItem('sadran.v1', JSON.stringify(st)); }, fn.toString());
  const reload = async () => { await page.reload(); await page.waitForSelector('#btnOut'); };
  await page.click('#ckNone');
  await L.demoSignIn(page, 'manager');

  // ---------- data typed in under the previous version of the page is still there after the update
  await patch(st => {
    delete st.app;
    st.example = false;
    st.store.name = 'המכולת של סבתא';
    st.employees.forEach(e => { delete e.double; });
    st.employees.push({ id: 'e_mine', name: 'העובד שלי', number: '4321', roles: ['r_cash'], max: 7 });
    st.avail[Object.keys(st.avail)[0]].e_noa.slots['0|s_am'] = { v: 2, t: [['08:00', null]] };
  });
  await page.evaluate(() => localStorage.removeItem('sadran.keep.update'));
  const old = await raw();
  await reload();
  let now = await stored();
  s.check('the store name, team and availability from the previous version are intact', now.store.name === 'המכולת של סבתא' && now.employees.length === 12 && now.employees.some(e => e.id === 'e_mine' && e.name === 'העובד שלי' && e.max === 7) && canon(now.avail[Object.keys(now.avail)[0]].e_noa.slots['0|s_am']) === canon({ v: 2, t: [['08:00', null]] }), now.store);
  s.check('the sign-in and the agreement are kept: no second agreement screen', !(await page.$('#agreeForm')) && (await L.txt(page, '#storeName')) === 'המכולת של סבתא');
  const copy = await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.keep.update') || 'null'));
  s.check('a copy of the data as it was before the update is set aside', !!copy && copy.data === old && copy.at > 0, copy && copy.data.length);
  s.check('the data is now marked with the new version', now.app === '1.1.0' && (await L.txt(page, '.foot-v')) === 'סדרן 1.1.0', [now.app, await L.txt(page, '.foot-v')]);
  await reload();
  s.check('the copy is made once, not on every visit', (await page.evaluate(() => JSON.parse(localStorage.getItem('sadran.keep.update')).data)) === old);

  // ---------- the weekly limit goes up to every shift in the week
  await tab('team');
  await page.click('#emp-e_mine'); await page.waitForSelector('#emax-p');
  s.check('the option for two shifts a day is off unless chosen', !(await page.isChecked('#empDouble')));
  let presses = 0;
  while (!(await page.isDisabled('#emax-p')) && presses++ < 40) await page.click('#emax-p');
  s.check('the weekly maximum goes past 7, up to all 14 shifts of the week', (await L.txt(page, '#emax-o')) === '14', await L.txt(page, '#emax-o'));
  await page.click('#btnEmpSave'); await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  s.check('the team list shows the new maximum', /עד 14 משמרות/.test(await L.txt(page, '#emp-e_mine')) && !/שתיים ביום/.test(await L.txt(page, '#emp-e_mine')), await L.txt(page, '#emp-e_mine'));
  s.check('saved', (await stored()).employees.find(e => e.id === 'e_mine').max === 14);

  // ---------- two shifts a day: one person, two shifts every day, 8 hours of rest required
  await patch(st => {
    const wk = Object.keys(st.avail)[0], slots = {};
    for (let d = 0; d < 7; d++) { slots[d + '|s_am'] = 1; slots[d + '|s_pm'] = 1; }
    st.roles = [{ id: 'r_a', name: 'תפקידון', color: 2 }];
    st.req = { s_am: { r_a: 1 }, s_pm: { r_a: 1 } };
    st.closed = {};
    st.rules.minRest = 8;
    st.employees = [{ id: 'e_one', name: 'דאבלית', number: '5555', roles: ['r_a'], max: 14 }];
    st.avail = { [wk]: { e_one: { slots, note: '', submittedAt: Date.now() - 1000 } } };
    st.weeks = {};
  });
  await reload();
  await tab('schedule');
  await page.click('#btnAuto');
  s.check('without the option, one shift a day: 7 of 14', (await L.txt(page, '.sum-num .num')) === '7/14', await L.txt(page, '.sum-num .num'));
  await page.click('.pos.is-empty'); await page.waitForSelector('#sheetRoot .sheet');
  s.check('a second shift that day is offered only as an exception, with the reason', /אפשר לשבץ בחריגה/.test(await L.txt(page, '#sheetRoot .sheet-b')) && /פחות מ־8 שעות מנוחה/.test(await L.txt(page, '#sheetRoot .sheet-b')), await L.txt(page, '#sheetRoot .sheet-b'));
  await page.keyboard.press('Escape');
  await tab('team');
  await page.click('#emp-e_one'); await page.waitForSelector('#empDouble');
  await page.check('#empDouble');
  s.check('the option is explained', /פעמיים ביום/.test(await L.txt(page, '#empDoubleHelp')));
  await page.click('#btnEmpSave'); await page.waitForFunction(() => !document.querySelector('#sheetRoot .sheet'));
  s.check('the team list marks who can work twice a day', /עד 14 משמרות, אפשר שתיים ביום/.test(await L.txt(page, '#emp-e_one')), await L.txt(page, '#emp-e_one'));
  await tab('schedule');
  await page.click('#btnAuto');
  s.check('with the option, both shifts every day: 14 of 14', (await L.txt(page, '.sum-num .num')) === '14/14', await L.txt(page, '.sum-num .num'));
  s.check('and nothing is flagged as a short rest', !(await page.$('.chip-warn')) && !(await page.$('.pos-w')), await L.txt(page, '.chips'));
  now = await stored();
  s.check('the option is saved with the employee', now.employees[0].double === true && now.employees[0].max === 14);
  // someone without the option is still protected by the rest rule
  await patch(st => { st.employees[0].double = false; });
  await reload();
  s.check('switching the option off flags the doubles again', (await page.$$('.pos-w')).length === 14, (await page.$$('.pos-w')).length);
  await patch(st => { st.employees[0].double = true; });
  await reload();

  // ---------- the exported image and PDF show names only
  await page.evaluate(() => { window.__drawn = []; });
  await page.click('#btnMore'); await page.waitForSelector('#sheetRoot .sheet');
  await page.click('[data-act="exportRoster"]');
  await page.waitForFunction(() => { const b = document.getElementById('xSave'); return b && !b.disabled; }, null, { timeout: 20000 });
  let drawn = await page.evaluate(() => window.__drawn);
  s.check('the export has the names', drawn.filter(t => t === 'דאבלית').length === 14, drawn.filter(t => t === 'דאבלית').length);
  s.check('the export has no roles', !drawn.some(t => /תפקידון/.test(t)), drawn.filter(t => /תפקידון/.test(t)));
  s.check('the export still has the store, the days and the shift hours', drawn.includes('המכולת של סבתא') && drawn.includes('ראשון') && drawn.includes('07:00–15:00'), drawn.slice(0, 12));
  const img = await page.getAttribute('#sheetRoot img', 'src');
  fs.writeFileSync(path.join(L.BUILD, 'export-no-roles.jpg'), Buffer.from(img.split(',')[1], 'base64'));
  await page.keyboard.press('Escape');
  for (const style of ['light', 'dark', 'print']) {
    await tab('setup');
    await page.evaluate(() => { window.__drawn = []; });
    await page.click('#xs-' + style);
    await page.waitForFunction(() => window.__drawn.length > 20, null, { timeout: 20000 });
    drawn = await page.evaluate(() => window.__drawn);
    s.check('no roles in the "' + style + '" style either', !drawn.some(t => /תפקידון/.test(t)) && drawn.includes('דאבלית'));
  }
  s.check('the settings say so', /בלי התפקידים/.test(await page.textContent('#view')));
  // a position nobody fills is still shown, without a role
  await tab('schedule');
  await page.click('.pos'); await page.waitForSelector('#posClear'); await page.click('#posClear');
  await page.evaluate(() => { window.__drawn = []; });
  await page.click('#btnMore'); await page.waitForSelector('#sheetRoot .sheet'); await page.click('[data-act="exportRoster"]');
  await page.waitForFunction(() => { const b = document.getElementById('xSave'); return b && !b.disabled; }, null, { timeout: 20000 });
  drawn = await page.evaluate(() => window.__drawn);
  s.check('an unfilled position is marked, without a role', drawn.includes('חסר שיבוץ') && !drawn.some(t => /תפקידון/.test(t)));
  await page.keyboard.press('Escape');

  // ---------- backup to a file, and back
  await patch(st => {
    const wk = Object.keys(st.weeks)[0];
    st.theme = { preset: 'custom', custom: '#8c66ff' };
    st.logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    st.rules.deadline = { on: true, day: 2, time: '12:30', tz: 'Asia/Jerusalem' };
    st.avail[wk].e_one.slots['2|s_pm'] = { v: 1, t: [['16:30', null], ['20:00', '22:15']] };
    st.avail[wk].e_one.note = 'הערה "עם" <סימנים> & עוד';
    st.weeks[wk].over = { '1|s_pm': { r_a: 2 } };
    st.weeks[wk].slots['0|s_am'][0].lock = true;
    st.weeks[wk].published = { at: 1763900000000, slots: JSON.parse(JSON.stringify(st.weeks[wk].slots)) };
    st.closed = { '6|s_pm': true };
  });
  await reload();
  const mine = await stored();
  await tab('setup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnBackup')]);
  const file = path.join(L.BUILD, 'backup.json');
  await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  s.check('the backup is a dated file with everything in it', /^sadran-backup-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()) && bk.app === 'sadran' && bk.version === '1.1.0' && dataOf(bk.data) === dataOf(mine), dl.suggestedFilename());
  s.check('the backup does not carry a sign-in', bk.data.prefs.session === null);
  // reset by mistake, then bring the data back from the copy set aside
  await page.click('#cf-reset'); await page.click('#cf-reset');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sadran.v1')).employees.length === 11);
  s.check('a reset says the data was set aside', /נשמרו בצד/.test(await L.txt(page, '.toast')), await L.txt(page, '.toast'));
  await page.waitForSelector('#btnKeptBack');
  s.check('the settings offer the data from before the reset', /לפני האיפוס/.test(await L.txt(page, '#view')));
  await page.click('#btnKeptBack');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sadran.v1')).employees.length === 1);
  s.check('the data from before the reset is back, all of it', dataOf(await stored()) === dataOf(mine));
  s.check('still signed in as the manager, with no new agreement screen', !!(await page.$('#btnOut')) && !(await page.$('#agreeForm')));
  // reset again, and this time restore from the file
  await tab('setup');
  await page.click('#cf-reset'); await page.click('#cf-reset');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sadran.v1')).employees.length === 11);
  await page.setInputFiles('#backupFile', file);
  await page.waitForSelector('#btnRestoreGo');
  const sum = await L.txt(page, '#sheetRoot .sheet-b');
  s.check('the restore dialog says what the file holds and that it replaces the data', /המכולת של סבתא/.test(sum) && /עובד\/ת אחד\/ת/.test(sum) && /2 משמרות/.test(sum) && /יחליף את כל הנתונים/.test(sum), sum);
  await page.click('#btnRestoreGo');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sadran.v1')).employees.length === 1);
  s.check('restoring the file brings back exactly what was saved', dataOf(await stored()) === dataOf(mine));
  s.check('the roster and the theme are shown again', (await L.txt(page, '#storeName')) === 'המכולת של סבתא' && (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().length)) === 7);
  // files that are not backups, and a hostile one
  const bad = path.join(L.BUILD, 'not-a-backup.json');
  fs.writeFileSync(bad, 'שלום, אני לא גיבוי');
  await tab('setup');
  await page.evaluate(() => { document.getElementById('toastRoot').innerHTML = ''; });
  await page.setInputFiles('#backupFile', bad);
  await page.waitForSelector('.toast');
  s.check('a file that is not a backup is refused and nothing changes', /אינו גיבוי/.test(await L.txt(page, '.toast')) && dataOf(await stored()) === dataOf(mine));
  const X = '"><img src=x onerror="window.__x=1">';
  const evil = JSON.parse(JSON.stringify(bk));
  evil.data.roles.push({ id: 'r' + X, name: X, color: '1" onmouseover="window.__x=2' });
  evil.data.roles[0].color = '2"><script>window.__x=3</script>';
  evil.data.shifts.push({ id: 's' + X, name: 'x', start: '07:00', end: '08:00' }, { id: 's_ok', name: X, start: '09:00"><i>', end: '10:00' });
  evil.data.employees.push({ id: 'e' + X, name: 'x', roles: [], max: 5 }, { id: 'e_two', name: X, number: X, roles: ['r' + X, 'r_a'], max: '9"', double: 'yes' });
  evil.data.theme = { preset: 'x" onclick="window.__x=4', custom: X };
  evil.data.exportStyle = X;
  evil.data.logo = 'javascript:window.__x=5';
  evil.data.managerCode = X;
  evil.data.rules = { minRest: X, deadline: { on: X, day: X, time: X, tz: X } };
  evil.data.avail[X] = { e_one: { slots: {}, note: '', submittedAt: null } };
  evil.data.weeks[Object.keys(evil.data.weeks)[0]].slots['0|s_am'].push({ role: 'r' + X, emp: 'e' + X, lock: X });
  evil.data.closed[X] = true;
  const evilFile = path.join(L.BUILD, 'evil-backup.json');
  fs.writeFileSync(evilFile, JSON.stringify(evil));
  await page.setInputFiles('#backupFile', evilFile);
  await page.waitForSelector('#btnRestoreGo'); await page.click('#btnRestoreGo');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sadran.v1')).employees.length === 2);
  const got = await stored();
  const ids = [].concat(got.roles.map(r => r.id), got.shifts.map(x => x.id), got.employees.map(e => e.id), Object.keys(got.avail), Object.keys(got.weeks), Object.keys(got.closed));
  s.check('a hostile backup is cleaned: only plain ids, numbers and known values remain', ids.every(i => /^[A-Za-z0-9_|-]+$/.test(i)) && got.roles.every(r => Number.isInteger(r.color)) && got.theme.preset === 'blue' && got.exportStyle === 'color' && got.logo === null && /^\d+$/.test(got.managerCode) && got.rules.minRest === 10 && got.employees[1].max === 5 && got.employees[1].double === false && canon(got.employees[1].roles) === canon(['r_a']), [ids, got.theme, got.employees[1]]);
  for (const v of ['schedule', 'availability', 'team', 'setup']) {
    await tab(v);
    const r = await page.evaluate(() => ({ x: window.__x, bad: document.querySelectorAll('img[src="x"], [onerror], [onmouseover], [onclick]').length }));
    s.check('nothing from the hostile backup runs or lands in the page: ' + v, r.x === undefined && r.bad === 0, r);
  }
  await page.context().close();

  // ---------- stored data this version cannot read is set aside, not overwritten
  const odd = await L.demoPage(browser, s);
  await odd.evaluate(() => localStorage.setItem('sadran.v1', '{"v":41,"employees":"from the future"}'));
  await odd.reload(); await odd.waitForSelector('#signForm');
  const un = await odd.evaluate(() => JSON.parse(localStorage.getItem('sadran.keep.unreadable') || 'null'));
  s.check('unreadable stored data is kept aside before the example data replaces it', !!un && un.data === '{"v":41,"employees":"from the future"}', un);
  await odd.context().close();

  // ---------- someone available for part of a shift can be placed in it
  const pp = await L.demoPage(browser, s);
  await pp.click('#ckNone');
  await L.demoSignIn(pp, 'manager');
  await pp.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('sadran.v1')), wk = Object.keys(st.avail)[0];
    st.roles = [{ id: 'r_a', name: 'כללי', color: 3 }];
    st.shifts = [{ id: 's_pm', name: 'ערב', start: '15:00', end: '20:00' }];
    st.req = { s_pm: { r_a: 1 } };
    st.closed = { '3|s_pm': true, '4|s_pm': true, '5|s_pm': true, '6|s_pm': true };
    st.employees = [{ id: 'e_part', name: 'חלקי', number: '7001', roles: ['r_a'], max: 5 }, { id: 'e_full', name: 'מלאה', number: '7002', roles: ['r_a'], max: 5 }];
    st.avail = { [wk]: {
      e_part: { slots: { '0|s_pm': { v: 1, t: [['16:00', '19:00']] }, '2|s_pm': { v: 2, t: [['16:00', '19:00']] } }, note: '', submittedAt: Date.now() - 5000 },
      e_full: { slots: { '1|s_pm': 1, '2|s_pm': 1 }, note: '', submittedAt: Date.now() - 4000 },
    } };
    st.weeks = {};
    localStorage.setItem('sadran.v1', JSON.stringify(st));
  });
  await pp.reload(); await pp.waitForSelector('#btnOut');
  for (let i = 0; i < 4; i++) await pp.click('#btnAuto');
  const names = await pp.$$eval('.day', days => days.slice(0, 3).map(d => (d.querySelector('.pos-n') || {}).textContent));
  s.check('available 16:00–19:00 in a 15:00–20:00 shift: scheduled automatically', names[0] === 'חלקי', names);
  s.check('all three positions are filled', (await L.txt(pp, '.sum-num .num')) === '3/3', await L.txt(pp, '.sum-num .num'));
  s.check('when someone is free for the whole shift, they come first', names[1] === 'מלאה' && names[2] === 'מלאה', names);
  s.check('the roster shows the hours next to the name, not as a warning', (await L.txt(pp, '#day-0 .pos-h')) === 'בשעות 16:00–19:00' && !(await pp.$('.pos-w')) && !(await pp.$('.chip-warn')), await L.txt(pp, '#day-0 .pos'));
  await pp.click('#day-2 .pos'); await pp.waitForSelector('#sheetRoot .sheet');
  const fitText = await L.txt(pp, '#sheetRoot .grp:nth-of-type(2), #sheetRoot .sheet-b');
  s.check('the position dialog offers the part-shift person as a fit, with the hours', /מתאימים למשמרת \(1\)/.test(await L.txt(pp, '#sheetRoot .sheet-b')) && /חלקי.*מעדיף\/ה את המשמרת בשעות 16:00–19:00/.test(fitText), fitText);
  await pp.click('#sheetRoot button.cand[data-emp="e_part"]');
  await pp.waitForFunction(() => document.querySelector('#day-2 .pos-n').textContent === 'חלקי');
  if (await pp.$('#sheetRoot .sheet')) await pp.keyboard.press('Escape');
  s.check('assigning them by hand raises no warning either', !(await pp.$('.pos-w')) && (await L.txt(pp, '#day-2 .pos-h')) === 'בשעות 16:00–19:00', await L.txt(pp, '#day-2 .pos'));
  await pp.click('#tabsBottom .tab[data-view="availability"]');
  s.check('the shift is not listed as an expected shortage', /לכל תפקיד בכל משמרת יש מספיק זמינים/.test(await pp.textContent('#view')));
  await browser.close();
  process.exit(s.report() ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
