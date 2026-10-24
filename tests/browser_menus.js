// After one autoplay match: records / encyclopedia / settings screens, two matches in a row. node tests/browser_menus.js <outdir>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/shots';
const results = []; const check = (c, n, i) => results.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' ' + JSON.stringify(i) : ''));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { window.MJ2_AUTOPLAY = true; window.MJ2_SPEED = 0.04; });
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('.screen-boot', { timeout: 20000 });
  await page.waitForTimeout(200);
  await page.mouse.click(360, 270);
  // encyclopedia before any play: all unknown
  await page.click('.title-menu .item >> nth=3');
  await page.waitForTimeout(300);
  await page.click('.enc-item >> nth=0');
  await page.waitForTimeout(200);
  const unk = await page.evaluate(() => [...document.querySelectorAll('.enc-item')].every((e) => e.textContent === '？？？？'));
  check(unk, 'encyclopedia all ？？？？ before play');
  await page.screenshot({ path: OUT + '/m01_enc_empty.png' });
  await page.click('[data-btn=back]');
  async function playMatch(stage, seed) {
    await page.evaluate(([st, sd]) => MJ2.UI.startNewMatch(st, sd), [stage, seed]);
    for (let i = 0; i < 3000; i++) {
      await page.waitForTimeout(200);
      const st = await page.evaluate(() => ({ screen: MJ2.UI.screen, next: !!document.querySelector('.settle [data-btn=next], .settle .txtbtn'), err: window.__mj2LastError ? String(window.__mj2LastError) : null }));
      if (st.err) { errors.push(st.err); return false; }
      if (st.screen === 'result') return true;
      if (st.next) await page.click('.settle [data-btn=next], .settle .txtbtn'); else if (await page.$('.settle .nexthint')) await page.click('.settle .nexthint');
    }
    return false;
  }
  async function passCrown(tag) {
    await page.waitForSelector('.tc-panel, .bk-title', { timeout: 20000 });
    if (await page.$('.bk-title')) { check(true, 'bankrupt after E4 ' + tag); await page.waitForTimeout(2600); await page.screenshot({ path: OUT + '/m_bankrupt_' + tag + '.png' }); return; }
    await page.waitForTimeout(2200);
    await page.screenshot({ path: OUT + '/m_crown_' + tag + '.png' });
    const tc = await page.evaluate(() => { const m = MJ2.UI.match; return { award: m.tripleCrown.award, txt: document.querySelector('.tc-panel').innerText }; });
    check(/三冠王/.test(tc.txt) && /子役王/.test(tc.txt) && /多数王/.test(tc.txt) && /鳴きの王/.test(tc.txt), 'triple crown panel ' + tag, tc.award);
    await page.mouse.click(360, 270);
    await page.waitForSelector('.rank-card', { timeout: 8000 });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: OUT + '/m_result_' + tag + '.png' });
    const t = await page.evaluate(() => document.querySelector('.screen-result').innerText);
    check(/点/.test(t), 'result ranks by points ' + tag);
    await page.mouse.click(360, 270);
    await page.waitForSelector('.reck-verdict', { timeout: 15000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: OUT + '/m_reckon_' + tag + '.png' });
    const t2 = await page.evaluate(() => document.querySelector('.screen-result').innerText);
    check(/円/.test(t2) && /生き残/.test(t2), 'reckoning shows money and verdict ' + tag);
  }
  check(await playMatch('mj2_org04', 'menus-1'), 'match 1 completes');
  await passCrown('1');
  const rec1 = await page.evaluate(() => MJ2.Records.stats());
  check(rec1.matches === 1 && rec1.rounds === 8, 'records after match 1', rec1);
  // rematch from result screen (two matches in a row without deleting data)
  await page.click('.txtbtn:has-text("再戦")');
  await page.waitForTimeout(300);
  const roster2 = await page.evaluate(() => MJ2.UI.match.roster);
  check(JSON.stringify(roster2) === JSON.stringify(['mj2_p01', 'mj2_c10', 'mj2_c11', 'mj2_c12']), 'rematch: same fixed roster of 難波大場組', roster2);
  for (let i = 0; i < 3000; i++) {
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ screen: MJ2.UI.screen, next: !!document.querySelector('.settle [data-btn=next], .settle .txtbtn') }));
    if (st.screen === 'result') { await passCrown('2'); break; }
    if (st.next) await page.click('.settle [data-btn=next], .settle .txtbtn'); else if (await page.$('.settle .nexthint')) await page.click('.settle .nexthint');
  }
  const rec2 = await page.evaluate(() => MJ2.Records.stats());
  check(rec2.matches === 2 && rec2.rounds === 16, 'records after match 2', rec2);
  // records screen
  await page.click('.txtbtn:has-text("タイトル")');
  await page.waitForTimeout(300);
  await page.click('.title-menu .item >> nth=2');
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/m02_records.png' });
  const nan = await page.evaluate(() => document.body.innerText.includes('NaN'));
  check(!nan, 'no NaN on records');
  await page.click('.txtbtn:has-text("役図鑑")');
  await page.waitForTimeout(300);
  const found = await page.evaluate(() => { const items = [...document.querySelectorAll('.enc-item')]; const k = items.findIndex((e) => e.textContent !== '？？？？'); if (k >= 0) items[k].click(); return k; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/m03_enc_found.png' });
  check(found >= 0, 'encyclopedia shows a discovered role');
  await page.click('.tab:has-text("子役")');
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/m04_enc_minor.png' });
  // CPU-only roles stay hidden: compare with records
  const leak = await page.evaluate(() => MJ2.DATA.roles.filter((r) => !MJ2.Records.roleStat(r.id) && MJ2.UI.encyclopediaName(r.id) !== '？？？？').length);
  check(leak === 0, 'undiscovered roles hidden');
  await page.click('[data-btn=back]');
  await page.click('.title-menu .item >> nth=4');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/m05_settings.png' });
  console.log(results.join('\n'));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
