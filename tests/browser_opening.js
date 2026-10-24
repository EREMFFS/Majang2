// Opening: boot → 4 cuts (narration end + ~0.5s → next, last +1s → title), skip stops narration. node tests/browser_opening.js <outdir> [file]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/shots';
const URL = process.argv[3] === 'file' ? 'file://' + require('path').resolve(__dirname, '..', 'index.html') : 'http://127.0.0.1:8765/index.html';
const results = []; const check = (c, n, i) => results.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? ' ' + JSON.stringify(i) : ''));
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function boot() {
    const page = await b.newPage({ viewport: { width: 720, height: 540 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { window.MJ2_FORCE_OPENING = true; });
    await page.goto(URL); await page.waitForSelector('.screen-boot', { timeout: 25000 });
    await page.evaluate(() => { window.__ev = []; const A = MJ2.Audio; const o = A.playHandle.bind(A); A.playHandle = async (id, t) => { const h = await o(id, t); window.__ev.push({ id, ok: h.ok, dur: Math.round(h.durationMs), t: Math.round(performance.now()) }); const st = h.stop; h.stop = () => { window.__ev.push({ stop: id, t: Math.round(performance.now()) }); st(); }; h.ended.then(() => window.__ev.push({ end: id, t: Math.round(performance.now()) })); return h; }; });
    await page.mouse.click(360, 270);
    await page.waitForSelector('.screen-opening', { timeout: 5000 });
    return page;
  }
  // full run
  const p1 = await boot();
  const t0 = Date.now(); let shots = 0;
  while (Date.now() - t0 < 60000) {
    await p1.waitForTimeout(1500);
    const sc = await p1.evaluate(() => MJ2.UI.screen);
    if (sc === 'title') break;
    if (shots < 30) await p1.screenshot({ path: `${OUT}/op_${String(shots++).padStart(2, '0')}.png` });
  }
  const ev = await p1.evaluate(() => ({ ev: window.__ev, now: Math.round(performance.now()), screen: MJ2.UI.screen }));
  const starts = ev.ev.filter((x) => x.id), ends = ev.ev.filter((x) => x.end);
  check(ev.screen === 'title', 'opening ends on title', ev.screen);
  check(starts.length === 4 && starts.every((x) => x.ok), 'four narration clips played', starts.map((x) => x.id + ':' + x.dur));
  // next clip starts after previous end + 0.5s hold + fade out/in (0.8s) + voice delay (0.35s)
  const gaps = starts.slice(1).map((s, i) => s.t - ends[i].t);
  check(gaps.every((g) => g > 1500 && g < 2100), 'gap between narrations ≈ 0.5s + fades', gaps);
  check(ends.length === 4 && ends.every((e, i) => e.t - starts[i].t >= starts[i].dur - 80), 'narration not cut short', ends.map((e, i) => e.t - starts[i].t));
  await p1.close();
  // skip in the middle of cut 2
  const p2 = await boot();
  await p2.waitForTimeout(8000);
  await p2.mouse.click(300, 200);
  await p2.waitForTimeout(800);
  const s2 = await p2.evaluate(() => ({ screen: MJ2.UI.screen, ev: window.__ev }));
  check(s2.screen === 'title', 'skip goes to title', s2.screen);
  check(s2.ev.some((x) => x.stop), 'skip stops the narration', s2.ev.filter((x) => x.stop));
  await p2.waitForTimeout(12000);
  check(await p2.evaluate(() => MJ2.UI.screen === 'title' && !document.querySelector('.screen-opening')), 'no double transition after skip');
  await p2.close();
  // key skip
  const p3 = await boot();
  await p3.waitForTimeout(2500); await p3.keyboard.press('Enter'); await p3.waitForTimeout(700);
  check(await p3.evaluate(() => MJ2.UI.screen === 'title'), 'Enter skips');
  await p3.close();
  console.log(results.join('\n'));
  console.log(errors.join('\n') || 'no errors');
  await b.close();
})();
