// Human-input and save/load checks in a real browser. node tests/browser_interact.js <outdir>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/shots';
const results = [];
const check = (c, name, info) => { results.push((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 720, height: 540 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { window.MJ2_SPEED = 0.25; });
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('.screen-boot', { timeout: 25000 });
  await page.mouse.click(360, 270); await page.waitForTimeout(1100);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelectorAll('.title-menu .item.disabled').length === 1), 'つづき disabled without save');
  await page.evaluate(() => MJ2.UI.startNewMatch('mj2_org01', 'interact-1'));
  // wait for a human action
  const waitHuman = async (type) => { for (let i = 0; i < 400; i++) {
      const isCall = await page.evaluate(() => { const r = MJ2.UI.match.round; return !!(r && r.pending && r.pending.seat === 0 && r.pending.type === 'call' && document.querySelector('.actions [data-btn=pass]')); });
      if (isCall && type === 'action') { await page.click('.actions [data-btn=pass]'); await page.waitForTimeout(100); continue; } const ok = await page.evaluate((t) => { const r = MJ2.UI.match.round; return !!(r && r.pending && r.pending.seat === 0 && (!t || r.pending.type === t) && document.querySelector('.actions button') && document.querySelector('.hand .t:not(.dis)') && !MJ2.Table.inputLocked()); }, type); if (ok) return true; await page.waitForTimeout(100); } return false; };
  check(await waitHuman('action'), 'human action pending');
  const before = await page.evaluate(() => MJ2.UI.match.round.players[0].discards.length);
  // double-click discard: click a legal tile twice
  const tile = await page.$('.hand .t:not(.dis)');
  const box = await tile.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(80);
  const selected = await page.evaluate(() => !!document.querySelector('.hand .t.sel'));
  check(selected, 'first click selects (raises) tile');
  const tile2 = await page.$('.hand .t.sel'); const b2 = await tile2.boundingBox();
  await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => MJ2.UI.match.round.players[0].discards.length);
  check(after === before + 1, 'second click discards', { before, after });
  await page.screenshot({ path: OUT + '/i01_after_discard.png' });
  // button mode
  await page.evaluate(() => { MJ2.UI.settings.discardMode = 'button'; });
  check(await waitHuman('action'), 'human action pending again');
  const t3 = await page.$('.hand .t:not(.dis)'); const b3 = await t3.boundingBox();
  await page.mouse.click(b3.x + b3.width / 2, b3.y + b3.height / 2);
  const d0 = await page.evaluate(() => MJ2.UI.match.round.players[0].discards.length);
  await page.click('.actions .txtbtn:has-text("打牌")');
  await page.waitForTimeout(300);
  const d1 = await page.evaluate(() => MJ2.UI.match.round.players[0].discards.length);
  check(d1 === d0 + 1, 'select + 打牌 button discards');
  await page.evaluate(() => { MJ2.UI.settings.discardMode = 'double'; });

  // ---- save / load mid-round ----
  check(await waitHuman('action'), 'pending before reload');
  const snap1 = await page.evaluate(() => JSON.stringify(MJ2.SaveStore.loadMatch()));
  const live1 = await page.evaluate(() => MJ2.UI.match.round.livePtr);
  await page.reload();
  await page.waitForSelector('.screen-boot', { timeout: 25000 });
  await page.mouse.click(360, 270); await page.waitForTimeout(1100);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !document.querySelectorAll('.title-menu .item')[1].classList.contains('disabled')), 'つづき enabled with save');
  await page.click('.title-menu .item >> nth=1');
  await page.waitForTimeout(800);
  const snap2 = await page.evaluate(() => JSON.stringify(MJ2.UI.match));
  check(snap1 === snap2, 'state identical after load (no re-deal, same RNG)');
  check(await waitHuman('action'), 'human can act after load');
  const live2 = await page.evaluate(() => MJ2.UI.match.round.livePtr);
  check(live1 === live2, 'wall pointer unchanged by load', { live1, live2 });
  await page.screenshot({ path: OUT + '/i02_after_load.png' });

  // ---- autoplay to the first settlement, reload in the middle of it ----
  await page.evaluate(() => { window.MJ2_AUTOPLAY = true; const a = document.querySelector('.actions .imgbtn:not([disabled]), .actions .txtbtn:not([disabled])'); });
  // resolve the pending human decision via CPU
  await page.evaluate(() => { const r = MJ2.UI.match.round; const t = document.querySelector('.hand .t:not(.dis)'); t.click(); t.click(); });
  for (let i = 0; i < 1200; i++) { const st = await page.evaluate(() => !!document.querySelector('.settle .yaku-table, .settle .sum-col')); if (st) break; if (await page.$('.settle .nexthint')) await page.click('.settle .nexthint'); await page.waitForTimeout(150); }
  await page.screenshot({ path: OUT + '/i03_settle_mid.png' });
  const mid = await page.evaluate(() => ({ cur: MJ2.UI.match.presentationCursor, cum: MJ2.UI.match.cumulativeScores.slice(), rec: MJ2.Records.stats().rounds, roles: JSON.stringify(MJ2.Records.loadRecords().byRole) }));
  await page.reload();
  await page.waitForSelector('.screen-boot', { timeout: 25000 });
  await page.mouse.click(360, 270); await page.waitForTimeout(1100);
  await page.waitForTimeout(300);
  await page.click('.title-menu .item >> nth=1');
  await page.waitForTimeout(700);
  const mid2 = await page.evaluate(() => ({ cur: MJ2.UI.match.presentationCursor, cum: MJ2.UI.match.cumulativeScores.slice(), rec: MJ2.Records.stats().rounds, roles: JSON.stringify(MJ2.Records.loadRecords().byRole), settle: !!document.querySelector('.settle') }));
  check(mid2.settle, 'settlement resumes after reload');
  check(JSON.stringify(mid.cum) === JSON.stringify(mid2.cum), 'no double cumulative after reload', [mid.cum, mid2.cum]);
  check(mid.rec === mid2.rec && mid.roles === mid2.roles, 'no double records after reload');
  check(mid2.cur.step >= mid.cur.step - 0 && mid2.cur.settlementId === mid.cur.settlementId, 'presentation cursor kept', [mid.cur, mid2.cur]);
  // long press skips to summary
  await page.mouse.move(360, 200); await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
  await page.waitForTimeout(600);
  const atSummary = await page.evaluate(() => !!document.querySelector('.settle .sumtable'));
  check(atSummary, 'long press skips to summary');
  await page.screenshot({ path: OUT + '/i04_summary.png' });
  const cum3 = await page.evaluate(() => MJ2.UI.match.cumulativeScores.slice());
  check(JSON.stringify(cum3) === JSON.stringify(mid.cum), 'skip does not change points');
  await page.click('.settle [data-btn=next]');
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => MJ2.UI.match.roundIndex === 1 && MJ2.UI.match.phase === 'round'), 'next round started');
  await page.screenshot({ path: OUT + '/i05_round2.png' });
  console.log(results.join('\n'));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
