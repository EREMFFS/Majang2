// audio enabled with missing files: progress must not stop; each missing clip requested at most once.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 720, height: 540 } });
  const fails = []; const errs = [];
  p.on('requestfailed', (r) => fails.push(r.url())); p.on('response', (r) => { if (r.status() === 404) fails.push(r.url()); });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { window.MJ2_AUTOPLAY = true; window.MJ2_SPEED = 0.15; });
  await p.goto('http://127.0.0.1:8765/index.html'); await p.waitForSelector('.screen-boot', { timeout: 25000 });
  await p.evaluate(() => { MJ2.DATA.audio.enabled = true; MJ2.DATA.audio.events.forEach((e) => (e.clip = 'assets/audio/' + e.id + '.ogg')); });
  await p.mouse.click(360, 270); await p.waitForTimeout(1400);
  await p.evaluate(() => MJ2.UI.startNewMatch('mj2_org05', 'audio-1'));
  await p.waitForTimeout(8000);
  const e1 = await p.evaluate(() => MJ2.UI.match.round.events.length);
  await p.waitForTimeout(8000);
  const e2 = await p.evaluate(() => (MJ2.UI.match.round ? MJ2.UI.match.round.events.length : 9999));
  const uniq = new Set(fails);
  console.log(JSON.stringify({ progressed: e2 > e1, e1, e2, missingRequests: fails.length, distinct: uniq.size, errs }));
  await b.close();
})();
