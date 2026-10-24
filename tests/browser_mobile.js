// Smartphone emulation: portrait (rotated) and landscape, touch taps. node tests/browser_mobile.js <outdir>
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/shots';
const results = []; const check = (c, n, i) => results.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' ' + JSON.stringify(i) : ''));
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13'], { viewport: vp }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { window.MJ2_SPEED = 0.3; });
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForSelector('.screen-boot', { timeout: 20000 });
    const box = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, rot: MJ2.UI.rotated }; });
    check(box.x >= -1 && box.y >= -1 && box.x + box.w <= innerW(vp) + 1 && box.y + box.h <= vp.height + 1, name + ' game fits screen', box);
    await page.tap('#game');
    await page.waitForSelector('.title-menu .item', { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/mob_${name}_title.png` });
    const item = await page.$('.title-menu .item');
    await item.tap();
    await page.waitForTimeout(500);
    await page.tap('.org-card >> nth=1'); await page.waitForTimeout(200); await page.tap('.org-card >> nth=1');
    await page.waitForTimeout(6500);
    // wait for my action
    let ok = false;
    for (let i = 0; i < 150; i++) {
      const st = await page.evaluate(() => { const r = MJ2.UI.match.round; return r && r.pending && r.pending.seat === 0 ? r.pending.type : null; });
      if (st === 'call') { await page.tap('.actions [data-btn=pass]'); }
      else if (st === 'action' && await page.$('.actions button') && !(await page.evaluate(() => MJ2.Table.inputLocked()))) { ok = true; break; }
      await page.waitForTimeout(150);
    }
    check(ok, name + ' human turn reached', await page.evaluate(() => MJ2.UI.screen));
    if (!ok) { console.log('ERR', errors, await page.evaluate(() => [String(window.__mj2LastError), MJ2.UI.match && MJ2.UI.match.phase])); await page.screenshot({ path: `${OUT}/mob_${name}_fail.png` }); console.log(results.join('\n')); process.exit(1); }
    await page.screenshot({ path: `${OUT}/mob_${name}_table.png` });
    const sz = await page.evaluate(() => { const t = document.querySelector('.hand .t').getBoundingClientRect(); const b = document.querySelector('.actions button').getBoundingClientRect(); return { tile: [Math.round(Math.min(t.width, t.height)), Math.round(Math.max(t.width, t.height))], btn: [Math.round(Math.max(b.width, b.height)), Math.round(Math.min(b.width, b.height))] }; });
    const before = await page.evaluate(() => MJ2.UI.match.round.players[0].discards.length);
    const t = await page.$('.hand .t:not(.dis)');
    await t.tap(); await page.waitForTimeout(120);
    const t2 = await page.$('.hand .t.sel'); await t2.tap(); await page.waitForTimeout(500);
    const after = await page.evaluate(() => MJ2.UI.match.round.players[0].discards.length);
    check(after === before + 1, name + ' tap-tap discard works', [before, after]);
    check(true, name + ' on-screen sizes (css px)', sz);
    check(errors.length === 0, name + ' no page errors', errors);
    await ctx.close();
  }
  console.log(results.join('\n'));
  await browser.close();
  function innerW(vp) { return vp.width; }
})();
