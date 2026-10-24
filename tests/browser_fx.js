// Effect snapshots + an evidence chip in settlement. node tests/browser_fx.js <outdir>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/shots';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('.screen-boot', { timeout: 25000 });
  await page.mouse.click(360, 270); await page.waitForTimeout(1100);
  await page.evaluate(() => { MJ2.UI.startNewMatch('mj2_org03', 'fx-1'); });
  await page.waitForTimeout(6500);
  const shots = [
    ['riichi', 'MJ2.FX.riichi()', 380], ['ron', 'MJ2.FX.ron({face: MJ2.UI.faceSrc(MJ2.UI.match.roster[1]), cutX: 470, cutY: 300})', 420],
    ['tsumo', 'MJ2.FX.tsumo({face: MJ2.UI.faceSrc(MJ2.UI.match.roster[2]), cutX: 470, cutY: 96})', 420], ['pon', "MJ2.FX.call('pon', {x: 560, y: 330})", 150],
    ['yakuman', "MJ2.FX.yakumanReady(['三家献宝'], {face: MJ2.UI.faceSrc(MJ2.UI.match.roster[3])})", 700],
    ['jackpot', 'MJ2.FX.jackpot(MJ2.UI.match.round.jackpotTargets)', 2100], ['open', "MJ2.FX.banner('round_open', {label: '南二局'})", 600],
    ['matchend', "MJ2.FX.banner('match_end')", 900]
  ];
  for (const [n, code, at] of shots) {
    await page.evaluate((c) => { window.__p = eval(c); }, code);
    await page.waitForTimeout(at);
    await page.screenshot({ path: `${OUT}/f_${n}.png` });
    await page.evaluate(() => window.__p);
  }
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
