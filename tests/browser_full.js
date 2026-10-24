// Full-match autoplay in a real browser (CPU plays the human seat). node tests/browser_full.js <outdir> [speed]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/shots';
const SPEED = +(process.argv[3] || 0.15);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));
  await page.addInitScript((sp) => { window.MJ2_AUTOPLAY = true; window.MJ2_SPEED = sp; }, SPEED);
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('.screen-boot', { timeout: 25000 });
  await page.mouse.click(360, 270); await page.waitForTimeout(1100);
  await page.waitForTimeout(300);
  await page.evaluate(() => MJ2.UI.startNewMatch('mj2_org04', 'fullseed1'));
  const t0 = Date.now();
  let shots = 0, lastRound = -1, settleShots = 0;
  while (Date.now() - t0 < 600000) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({ screen: MJ2.UI.screen, phase: MJ2.UI.match && MJ2.UI.match.phase, ri: MJ2.UI.match && MJ2.UI.match.roundIndex, settle: !!document.querySelector('.settle'), next: !!document.querySelector('.settle [data-btn=next], .settle .txtbtn'), err: window.__mj2LastError ? String(window.__mj2LastError.stack) : null, ev: MJ2.UI.match && MJ2.UI.match.round ? MJ2.UI.match.round.events.length : 0 }));
    if (st.err) { errors.push('loop: ' + st.err); break; }
    if (st.screen === 'result') { await page.waitForSelector('.tc-panel, .bk-title', { timeout: 8000 }); if (await page.$('.bk-title')) { await page.waitForTimeout(2600); await page.screenshot({ path: OUT + '/90_bankrupt.png' }); console.log('bankrupt after E4'); break; } await page.waitForTimeout(2200); await page.screenshot({ path: OUT + '/89_crown.png' }); await page.mouse.click(360, 270); await page.waitForTimeout(3500); await page.screenshot({ path: OUT + '/90_result.png' }); await page.mouse.click(360, 270); await page.waitForSelector('.reck-verdict', { timeout: 15000 }); await page.waitForTimeout(1800); await page.screenshot({ path: OUT + '/91_reckon.png' }); break; }
    if (st.phase === 'round' && st.ri !== lastRound && st.ev > 60) { lastRound = st.ri; await page.screenshot({ path: `${OUT}/10_round${st.ri}.png` }); }
    if (st.settle && settleShots < 14 && st.ri <= 1) { await page.screenshot({ path: `${OUT}/20_settle_${st.ri}_${settleShots++}.png` }); }
    if (st.next) { await page.screenshot({ path: `${OUT}/30_summary${st.ri}.png` }); await page.click('.settle [data-btn=next], .settle .txtbtn'); } else if (await page.$('.settle .nexthint')) await page.click('.settle .nexthint');
  }
  const summary = await page.evaluate(() => ({ records: MJ2.Records.stats(), roles: Object.keys(MJ2.Records.loadRecords().byRole).length, hasMatch: MJ2.SaveStore.hasMatch() }));
  console.log(JSON.stringify(summary));
  console.log('elapsed', Math.round((Date.now() - t0) / 1000), 's');
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
