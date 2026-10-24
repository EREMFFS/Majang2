// Rigged rounds driven through real clicks: pon, chi picker, riichi, ron, kan. node tests/browser_calls.js <outdir>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const OUT = process.argv[2] || '/tmp/shots';
const results = [];
const check = (c, name, info) => results.push((c ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));

const RIG = `
window.__rig = function (hands, live) {
  const T = MJ2.T, E = MJ2.Engine;
  const m = E.newMatch({ seed: 'calls', stageId: 'mj2_org02', playerFaceId: 'mj2_p01', roster: ['mj2_p01', 'mj2_c04', 'mj2_c05', 'mj2_c06'], humanSeats: [0] });
  m.phase = 'round';
  E.startRound(m);
  const r = m.round;
  const used = new Set();
  const take = (k) => { const i = T.idx(k); for (let j = 0; j < 4; j++) { const id = i * 4 + j; if (!used.has(id)) { used.add(id); return id; } } throw new Error('5th ' + k); };
  const hs = hands.map((h) => h.map(take));
  const lv = live.map(take);
  const rest = []; for (let i = 0; i < 136; i++) if (!used.has(i)) rest.push(i);
  r.dead = rest.splice(0, 14);
  r.live = lv.concat(rest); r.livePtr = 0; r.liveEnd = r.live.length;
  r.events = []; r.seq = 0;
  r.players.forEach((p, s) => { p.hand = T.sortIds(hs[s]); p.initialHandIds = p.hand.slice(); p.waits = []; p.everNoten = false; p.everTenpai = false; p.firstTenpaiWaits = null; p.yakumanNotices = []; });
  // re-emit deal events for the rigged hands
  r.seq = 0;
  const push = (ev) => { r.seq++; ev.id = r.roundId + '#' + r.seq; ev.roundId = r.roundId; ev.seq = r.seq; ev.live = r.liveEnd - r.livePtr; r.events.push(ev); };
  push({ type: 'ROUND_START', seat: r.dealer, dealer: r.dealer, roundWind: r.roundWind, jackpotTargets: r.jackpotTargets.slice() });
  for (let s = 0; s < 4; s++) push({ type: 'DEAL', seat: s, tileIds: r.players[s].hand.slice() });
  E.assertTileInvariant(m);
  E.advance(m);
  MJ2.UI.match = m;
  return m;
};
window.__kind = (k) => MJ2.T.idx(k);
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { window.MJ2_SPEED = 0.2; });
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('.screen-boot', { timeout: 25000 });
  await page.mouse.click(360, 270); await page.waitForTimeout(1100);
  await page.addScriptTag({ content: RIG });
  await page.evaluate(() => { window.__played = []; const A = MJ2.Audio, o = A.playRaw.bind(A); A.playRaw = (id, op) => { window.__played.push(id); return o(id, op); }; });
  const waitFor = async (fn, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(80); } return false; };
  const clickKind = async (k, times = 2) => {
    for (let n = 0; n < times; n++) {
      const ok = await page.evaluate((kind) => { const i = MJ2.T.idx(kind); const t = [...document.querySelectorAll('.hand .t:not(.dis)')].find((x) => (+x.dataset.id >> 2) === i); if (!t) return false; t.click(); return true; }, k);
      if (!ok) return false;
      await page.waitForTimeout(60);
    }
    return true;
  };
  const humanAction = () => { const r = MJ2.UI.match.round; return r && r.pending && r.pending.seat === 0 && r.pending.type === 'action' && !!document.querySelector('.actions button') && !MJ2.Table.inputLocked(); };
  const humanCall = () => { const r = MJ2.UI.match.round; return r && r.pending && r.pending.seat === 0 && r.pending.type === 'call' && !!document.querySelector('.actions [data-btn=pass]') && !!document.querySelector('.actions [data-btn=pon]') && !MJ2.Table.inputLocked(); };

  // ---------- Scenario A: pon, chi picker ----------
  await page.evaluate(() => {
    window.__rig([
      ['z5', 'z5', 'm2', 'm3', 'm5', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'z1', 'z1'],
      ['z5', 'm9', 'p1', 'p9', 's1', 's2', 'z2', 'z3', 'z4', 'm1', 'p2', 's4', 's5'],
      ['m7', 'm8', 'p3', 'p7', 'p8', 's3', 's6', 'z6', 'z6', 'z7', 'z7', 'm1', 'p2'],
      ['m4', 'm6', 'p7', 'p8', 's3', 's6', 'z6', 'z7', 'z2', 'z3', 'z4', 'm9', 's1']
    ], ['z2', 'm1', 'm1', 'p9', 's9', 'p1', 'p1', 's1', 's2', 's2', 's3', 's4', 's5', 's6']);
    // seat1 discards z5 on its first turn; seat3 discards m4 on its first turn
    window.MJ2_SCRIPT = (m, p) => {
      const r = m.round, me = r.players[p.seat];
      if (p.type === 'action') {
        const want = { 1: 'z5', 3: 'm4' }[p.seat];
        const id = me.hand.find((x) => (x >> 2) === MJ2.T.idx(want));
        if (id != null && p.discards.includes(id)) return { type: 'discard', seat: p.seat, tileId: id };
        return { type: 'discard', seat: p.seat, tileId: me.lastDrawId != null && p.discards.includes(me.lastDrawId) ? me.lastDrawId : p.discards[0] };
      }
      return { type: 'pass', seat: p.seat };
    };
    MJ2.Table.begin(MJ2.UI.match, { fresh: false });
  });
  check(await waitFor(humanAction), 'A: human first action');
  check(await clickKind('z2'), 'A: discard z2 by double click');
  check(await waitFor(humanCall), 'A: pon offered on z5', await page.evaluate(() => ({ err: String(window.__mj2LastError), acts: document.querySelector('.actions').innerHTML.slice(0, 200), locked: MJ2.Table.inputLocked() })));
  console.log(results.join('\n'));
  const ponEnabled = await page.evaluate(() => !document.querySelector('.actions [data-btn=pon]').disabled && document.querySelector('.actions [data-btn=chi]').disabled);
  check(ponEnabled, 'A: pon enabled, chi disabled (not kamicha)');
  await page.screenshot({ path: OUT + '/c01_pon_offer.png' });
  await page.click('.actions [data-btn=pon]');
  check(await waitFor(humanAction), 'A: must discard after pon');
  const mustInfo = await page.evaluate(() => ({ melds: MJ2.UI.match.round.players[0].melds.map((x) => x.type), tsumoDisabled: document.querySelector('.actions [data-btn=tsumo]').disabled }));
  check(mustInfo.melds[0] === 'pon' && mustInfo.tsumoDisabled, 'A: pon meld formed', mustInfo);
  await page.screenshot({ path: OUT + '/c02_after_pon.png' });
  check(await clickKind('z1') || await clickKind('s9'), 'A: discard after pon');
  check(await waitFor(humanCall), 'A: chi offered on m4 from kamicha');
  await page.click('.actions [data-btn=chi]');
  await page.waitForTimeout(200);
  const pickerOpts = await page.evaluate(() => document.querySelectorAll('.picker .opt').length);
  check(pickerOpts === 3, 'A: chi picker shows 2 options + cancel', pickerOpts);
  await page.screenshot({ path: OUT + '/c03_chi_picker.png' });
  await page.click('.picker .opt >> nth=1');
  check(await waitFor(humanAction), 'A: discard after chi');
  const chiMeld = await page.evaluate(() => MJ2.UI.match.round.players[0].melds.map((x) => x.tileIds.map((i) => MJ2.T.kindOfId(i)).join('')));
  check(chiMeld[1] === 'm3m4m5', 'A: chose m3-m4-m5', chiMeld);
  const kuikae = await page.evaluate(() => MJ2.UI.match.round.pending.discards.every((id) => (id >> 2) !== MJ2.T.idx('m4')));
  check(kuikae, 'A: kuikae blocks m4');
  await page.screenshot({ path: OUT + '/c04_after_chi.png' });
  // 食い替え牌をクリックしてもエラーで止まらない（v023）。手牌の1枚を一時的に不可にしてダブルクリック
  const ban = await page.evaluate(() => { const r = MJ2.UI.match.round, pd = r.pending; const id = pd.discards[0]; window.__banSave = pd.discards.slice(); pd.discards = pd.discards.filter((x) => x !== id); return id; });
  for (let n = 0; n < 2; n++) { await page.evaluate((id) => { const t = document.querySelector('.hand .t[data-id="' + id + '"]'); t && t.click(); }, ban); await page.waitForTimeout(120); }
  const banInfo = await page.evaluate(() => ({ err: window.__mj2LastError ? String(window.__mj2LastError) : null, still: !!MJ2.UI.match.round.pending && MJ2.UI.match.round.pending.seat === 0 && MJ2.UI.match.round.pending.type === 'action' }));
  check(!banInfo.err && banInfo.still, 'A: clicking a forbidden (kuikae) tile is ignored', banInfo);
  await page.evaluate(() => { MJ2.UI.match.round.pending.discards = window.__banSave; });

  // ---------- Scenario B: riichi then ron ----------
  await page.evaluate(() => {
    MJ2.Table.leave();
    window.__rig([
      ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z1', 'm5', 'm6'],
      ['m4', 'm9', 'p9', 'p9', 's9', 's9', 'z2', 'z3', 'z4', 'm8', 'p8', 's8', 's5'],
      ['m7', 'm8', 'p4', 'p7', 'p8', 's4', 's6', 'z6', 'z6', 'z7', 'z7', 'm1', 'p2'],
      ['m2', 'm6', 'p4', 'p6', 's3', 's6', 'z6', 'z7', 'z2', 'z3', 'z4', 'm9', 's1']
    ], ['z7', 'p5', 'p5', 'p5', 's7', 's7', 's7', 'p6', 'p6', 'p6', 'm3', 'm3', 's5', 's5']);
    window.MJ2_SCRIPT = (m, p) => {
      const r = m.round, me = r.players[p.seat];
      if (p.type === 'action') {
        if (p.seat === 1 && r.players[0].riichi) { const id = me.hand.find((x) => (x >> 2) === MJ2.T.idx('m4')); if (id != null) return { type: 'discard', seat: 1, tileId: id }; }
        return { type: 'discard', seat: p.seat, tileId: p.discards.includes(me.lastDrawId) ? me.lastDrawId : p.discards[0] };
      }
      return { type: 'pass', seat: p.seat };
    };
    MJ2.Table.begin(MJ2.UI.match, { fresh: false });
  });
  check(await waitFor(humanAction), 'B: human action');
  const riichiEnabled = await page.evaluate(() => !document.querySelector('.actions [data-btn=riichi]').disabled);
  check(riichiEnabled, 'B: riichi button enabled');
  await page.click('.actions [data-btn=riichi]');
  await page.waitForTimeout(150);
  const lit = await page.evaluate(() => [...document.querySelectorAll('.hand .t:not(.dis)')].map((t) => MJ2.T.kindOfId(+t.dataset.id)));
  check(lit.length === 1 && lit[0] === 'z7', 'B: only riichi-legal tile selectable', lit);
  await page.screenshot({ path: OUT + '/c05_riichi_select.png' });
  check(await clickKind('z7'), 'B: declare riichi with z7');
  // rapid clicking right after the chance appears must not skip the ron
  check(await waitFor(() => { const r = MJ2.UI.match.round; return r && r.pending && r.pending.seat === 0 && r.pending.type === 'call' && !!document.querySelector('.actions [data-btn=pass]'); }, 20000), 'B: call window open');
  for (let i = 0; i < 4; i++) { await page.click('.actions [data-btn=pass]', { force: true }).catch(() => {}); await page.waitForTimeout(60); }
  check(await page.evaluate(() => { const r = MJ2.UI.match.round; return r.pending && r.pending.seat === 0 && r.pending.ron; }), 'B: rapid clicks during chance lock did not pass the ron');
  check(await page.evaluate(() => !!document.querySelector('.chance-badge.ron')), 'B: ron chance badge shown');
  check(await waitFor(humanCall, 20000), 'B: ron offered on m4');
  const ronOk = await page.evaluate(() => !document.querySelector('.actions [data-btn=ron]').disabled);
  check(ronOk, 'B: ron enabled');
  await page.screenshot({ path: OUT + '/c06_ron_offer.png' });
  await page.click('.actions [data-btn=ron]');
  check(await waitFor(() => MJ2.UI.match.round.players[0].winSnapshot != null), 'B: human won');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/c07_after_ron.png' });
  const riichiDouble = await page.evaluate(() => MJ2.UI.match.round.players[0].riichi.double);
  check(riichiDouble, 'B: first-discard riichi is double riichi');
  // let the round finish with the remaining 3 CPU seats
  await page.evaluate(() => { window.MJ2_SCRIPT = null; });
  check(await waitFor(() => !!document.querySelector('.settle'), 120000), 'B: round continues to settlement after human win');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/c08_settle.png' });
  const s = await page.evaluate(() => { const st = MJ2.UI.match.settlements[0]; const r0 = st.results[0]; return { order: st.order, majors: r0.majors.map((x) => x.roleId), base: r0.basePoints, total: r0.total, reason: st.endReason }; });
  check(s.order[0] === 0 && s.majors.includes('std_double_riichi'), 'B: settlement has double riichi for winner first', s);
  // click through the settlement one step at a time (click-only flow), screenshot each step
  let steps = 0, autoSeen = false;
  await page.evaluate(() => { window.MJ2_SPEED = 1; });
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => ({ settle: !!document.querySelector('.settle'), sum: !!document.querySelector('.settle .sumtable'), cur: MJ2.UI.match.presentationCursor && MJ2.UI.match.presentationCursor.step, t: (() => { const m = MJ2.UI.match; const pc = m.presentationCursor; if (!pc) return null; const st = m.settlements.find((x) => x.id === pc.settlementId); return MJ2.Settle.buildSteps(st)[pc.step].t; })() }));
    if (!st.settle || st.sum) break;
    await page.screenshot({ path: OUT + '/c09_step_' + String(i).padStart(2, '0') + '.png' });
    // without a click nothing advances
    await page.waitForTimeout(1500);
    const still = await page.evaluate(() => MJ2.UI.match.presentationCursor.step);
    if (st.t === 'w_yaku') { await page.waitForTimeout(800); const still2 = await page.evaluate(() => MJ2.UI.match.presentationCursor.step); if (still2 === st.cur) check(false, 'yaku intro should auto-advance'); else autoSeen = true; continue; }
    if (still !== st.cur) { check(false, 'settlement advanced without click', [st.cur, still, st.t]); break; }
    await page.mouse.click(650, 500); await page.waitForTimeout(700);
    const after = await page.evaluate(() => MJ2.UI.match.presentationCursor && MJ2.UI.match.presentationCursor.step);
    if (after === st.cur) { await page.mouse.click(650, 500); await page.waitForTimeout(500); }
    steps++;
  }
  check(steps > 5, 'settlement steps clicked through', steps);
  check(autoSeen, 'winner yaku intro advanced by itself');
  check(await page.evaluate(() => !!document.querySelector('.settle .sumtable')), 'reached summary by clicks');
  { const pl = await page.evaluate(() => window.__played); check(pl.includes('signal_call'), 'signal sound for pon/chi/kan/riichi'); check(pl.includes('signal_agari'), 'signal sound for ron/tsumo'); check(pl.some((x) => /^result_/.test(x)), 'result rank sound'); check(pl.includes('SE_YEN_GET'), 'yen handover sound'); }
  console.log(results.join('\n'));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
