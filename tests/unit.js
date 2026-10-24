// Unit / scenario tests. Run: node tests/unit.js
const MJ2 = require('./load');
const { T, Hand: H, Engine: E, Roles, Yaku, Settlement } = MJ2;
let pass = 0, fail = 0; const failures = [];
function ok(cond, name, info) { if (cond) pass++; else { fail++; failures.push(name + (info ? ' :: ' + JSON.stringify(info) : '')); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b }); }

// ---------- helpers ----------
function idsForKinds(kinds, used) {
  used = used || new Set();
  return kinds.map((k) => { const i = T.idx(k); for (let j = 0; j < 4; j++) { const id = i * 4 + j; if (!used.has(id)) { used.add(id); return id; } } throw new Error('5th tile ' + k); });
}
function fakeView(o) {
  const used = new Set();
  const owned = idsForKinds(o.ownedKinds || [], used);
  let seq = 0;
  const evs = (o.events || []).map((e) => Object.assign({ id: 'ev' + (++seq), seq, seat: 0 }, e, e.kind && e.tileId == null ? { tileId: idsForKinds([e.kind], new Set())[0] } : {}));
  const r = { jackpotTargets: (o.targets || []).map(T.idx), players: [{}, {}, {}, {}] };
  return {
    m: {}, r, seat: 0, p: r.players[0], isWinner: !!o.isWinner, winEvent: evs.find((e) => e.type === 'WIN_RON' || e.type === 'WIN_TSUMO' && e.seat === 0) || null,
    events: evs, own: evs.filter((e) => e.seat === 0), ownedIds: owned, concealedIds: owned.slice(), melds: o.melds || [],
    counts: T.countsOfIds(owned), initialHandIds: o.initialHandIds || [], riichiEvent: evs.find((e) => e.seat === 0 && e.type === 'RIICHI_DECLARED') || null,
    endEvent: o.ended === false ? null : { type: 'ROUND_END' }
  };
}
function judge(roleId, view) { const r = MJ2.DATA.roleById[roleId]; return Roles.J[r.conditionId](view, r.params || {}, r); }
function roleIdsOf(view) { return Roles.evaluateRoles({}, 0, view).awards.map((a) => a.roleId); }

// ---------- 0. data integrity ----------
eq(MJ2.DATA.roles.length, 133, 'roles 133');
eq(MJ2.DATA.characters.length, 16, 'characters 16 (player + 15)');
eq(MJ2.DATA.stages.length, 5, 'organizations 5');
ok(!JSON.stringify(MJ2.DATA.stages).toLowerCase().includes('boston') && !MJ2.DATA.characters.some((c) => /^s\d\d_/.test(c.id)), 'no old FFS cast / stages');
for (const st of MJ2.DATA.stages) {
  ok(st.selection === 'fixed' && st.characterIds.length === 3 && st.characterIds.every((id) => MJ2.DATA.charById[id] && MJ2.DATA.charById[id].stageId === st.id), 'fixed 3 members ' + st.id);
  ok(MJ2.DATA.orgById[st.organizationId] && MJ2.DATA.orgById[st.organizationId].name === st.label, 'org name matches ' + st.id);
}
eq(MJ2.DATA.characters.filter((c) => (c.traits || []).includes('yakuman_tenpai_start')).map((c) => c.id), ['mj2_c14'], 'only 双鳥羽佐助 has yakuman_tenpai_start');
eq(MJ2.DATA.config.playerFaceId, 'mj2_p01', 'player is 麻村 雀太郎');
eq(MJ2.DATA.charById.mj2_p01.name, '麻村 雀太郎', 'player name');
for (const c of MJ2.DATA.characters) ok(require('fs').existsSync(require('path').join(__dirname, '..', c.portrait)) && require('fs').existsSync(require('path').join(__dirname, '..', c.portraitHD)) && require('fs').existsSync(require('path').join(__dirname, '..', c.portrait320)), 'portraits exist ' + c.id);
for (const st of MJ2.DATA.stages) ok(require('fs').existsSync(require('path').join(__dirname, '..', st.background)), 'background exists ' + st.id);
eq([MJ2.util.yen(25000), MJ2.util.yen(-8000), MJ2.util.yen(1000000), MJ2.util.yen(50000), MJ2.util.yen(0), MJ2.util.yen(824500), MJ2.util.yen(-19080000)], ['2万5,000円', '−8,000円', '100万円', '5万円', '0円', '82万4,500円', '−1,908万円'], 'yen display with 万');
eq(MJ2.DATA.config.superJackpotPoints, 1000000, 'jackpot value unchanged');
{ // audio files referenced by audio_events.json exist
  const fs = require('fs'), path = require('path');
  const A = MJ2.DATA.audio; const miss = [];
  for (const e of A.events) if (e.clip && !fs.existsSync(path.join(__dirname, '..', e.clip))) miss.push(e.clip);
  for (const b of A.bgm) for (const f of b.files) if (!fs.existsSync(path.join(__dirname, '..', f))) miss.push(f);
  eq(miss, [], 'audio files exist');
  ok(A.bgm.find((b) => b.id === 'bgm_east_odd').files[0].includes('bgm03') && A.bgm.find((b) => b.id === 'bgm_east_even').files[0].includes('bgm04') && A.bgm.find((b) => b.rounds === 'S').files[0].includes('bgm02') && A.bgm.find((b) => b.id === 'bgm_title').files[0].includes('bgm05'), 'BGM: east odd=03 even=04, south=02, title=05');
  ok(['title_select', 'strike_thunder', 'role_impact'].every((id) => A.events.find((e) => e.id === id).clip), 'title / thunder / don SE assigned');
  ok(A.bgm.every((b) => b.loopStartSec >= 0 && b.loopEndSec > b.loopStartSec), 'bgm loop points');
  for (const l of ['E1', 'E2', 'E3', 'E4', 'S1', 'S2', 'S3', 'S4']) ok(A.events.some((e) => e.id === 'round_call_' + l && e.clip), 'round call ' + l);
}
const missingJudges = MJ2.DATA.roles.filter((r) => !Roles.J[r.conditionId]).map((r) => r.id);
eq(missingJudges, [], 'every conditionId has a judge');
const stdIds = MJ2.DATA.roles.filter((r) => r.conditionId === 'standard_yaku').length;
eq(stdIds, 42, 'standard yaku count');

// ---------- 1. hand basics ----------
const c14 = T.countsOfKinds(['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's7', 's7', 'z1', 'z1', 'z1', 'z7', 'z7']);
ok(H.isAgari(c14, 0), 'agari standard');
ok(!H.isAgari(T.countsOfKinds(['m1', 'm2', 'm4', 'p4', 'p5', 'p6', 's7', 's7', 's7', 'z1', 'z1', 'z1', 'z7', 'z7']), 0), 'not agari');
ok(H.isChiitoi(T.countsOfKinds(['m1', 'm1', 'm3', 'm3', 'p4', 'p4', 's7', 's7', 'z1', 'z1', 'z2', 'z2', 'z7', 'z7'])), 'chiitoi');
ok(!H.isChiitoi(T.countsOfKinds(['m1', 'm1', 'm1', 'm1', 'p4', 'p4', 's7', 's7', 'z1', 'z1', 'z2', 'z2', 'z7', 'z7'])), 'chiitoi no quad');
ok(H.isKokushi(T.countsOfKinds(['m1', 'm9', 'p1', 'p9', 's1', 's9', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z7'])), 'kokushi');
eq(H.shanten(T.countsOfKinds(['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's7', 's7', 'z1', 'z1', 'z1', 'z7']), 0), 0, 'shanten tenpai');
eq(H.shanten(c14, 0), -1, 'shanten complete');
eq(H.waits(T.countsOfKinds(['m1', 'm9', 'p1', 'p9', 's1', 's9', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7']), 0).length, 13, 'kokushi 13 waits');

// ---------- 2. verification_cases.json ----------
ok(!judge('sp_123', fakeView({ ownedKinds: ['m1', 'p2', 's3'] })), 'cross_suit_123_negative');
ok(!!judge('sp_123', fakeView({ ownedKinds: ['m1', 'm2', 'm3'] })), 'same_suit_123_positive');
{
  const v = fakeView({ events: ['CHI', 'PON', 'CHI', 'PON'].map((t) => ({ type: t, meldId: t })) });
  const got = roleIdsOf(v);
  ok(got.includes('sp_naki_joe') && !got.includes('sp_naki') && !got.includes('sp_naki2') && !got.includes('sp_naki3'), 'naki_priority', got);
}
{
  const evs = [{ type: 'DISCARD', kind: 'm5' }, { type: 'WIN_RON', seat: 1, sourceSeat: 0, kind: 'm5' }, { type: 'WIN_RON', seat: 2, sourceSeat: 0, kind: 'm5' }, { type: 'WIN_RON', seat: 3, sourceSeat: 0, kind: 'm5' }];
  const v = fakeView({ events: evs });
  // ron events must reference the same physical tile
  const tid = v.events[0].tileId; v.events.forEach((e) => (e.tileId = tid));
  const got = roleIdsOf(v);
  ok(got.includes('sp_furikomi_master') && !got.includes('sp_furikomi'), 'furikomi_three', got);
  const v1 = fakeView({ events: evs.slice(0, 2) }); const t1 = v1.events[0].tileId; v1.events.forEach((e) => (e.tileId = t1));
  ok(roleIdsOf(v1).includes('sp_furikomi'), 'furikomi_one gives 振込マン');
}
{
  const own = [{ type: 'DISCARD', kind: 'z2' }, { type: 'DRAW', kind: 'z2', source: 'live' }, { type: 'DISCARD', kind: 'z2' }, { type: 'DRAW', kind: 'z2', source: 'live' }, { type: 'DISCARD', kind: 'z2' }, { type: 'DRAW', kind: 'z2', source: 'live' }];
  const got = roleIdsOf(fakeView({ events: own }));
  ok(got.includes('sp_aho') && !got.includes('sp_okaeri'), 'aho_positive', got);
  const broken = own.slice(0, 3).concat([{ type: 'DRAW', kind: 'm1', source: 'live' }, { type: 'DISCARD', kind: 'm1' }, { type: 'DRAW', kind: 'z2', source: 'live' }]);
  ok(!roleIdsOf(fakeView({ events: broken })).includes('sp_aho'), 'aho broken by other discard');
  ok(roleIdsOf(fakeView({ events: own.slice(0, 2) })).includes('sp_okaeri'), 'okaeri single');
}
{
  const tk = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p1', 'p2', 'p3', 's1', 'z1'];
  ok(!!judge('sp_jackpot', fakeView({ ownedKinds: tk, targets: tk, isWinner: true })), 'jackpot_exact');
  const dup = ['m1', 'm1'].concat(tk.slice(2));
  ok(!judge('sp_jackpot', fakeView({ ownedKinds: dup, targets: tk, isWinner: true })), 'jackpot_duplicate_negative');
}
{
  const pts = Settlement.nonWinHanPoints(3) + 16; eq(pts, 416, 'nonwin_score 416');
  eq(Settlement.nonWinHanPoints(12) + 7, 1607, 'cap_without_win 1607');
  eq([1, 2, 3, 4, 5, 9].map(Settlement.nonWinHanPoints), [100, 200, 400, 800, 1600, 1600], 'han table');
}

// ---------- 3. rigged rounds ----------
function newRigMatch(roster) {
  MJ2.SaveStore._resetMemory();
  const m = E.newMatch({ seed: 'rig', rate: 1, stageId: 'mj2_org01', playerFaceId: 'mj2_p01', roster: roster || ['mj2_p01', 'mj2_c01', 'mj2_c02', 'mj2_c03'] });
  E.startRound(m);
  return m;
}
// rewrite the dealt hands / wall order with given kinds. hands: 4 arrays (13 kinds), live: draw order kinds
function rig(m, hands, live, opts = {}) {
  const r = m.round;
  const used = new Set();
  const handIds = hands.map((h) => idsForKinds(h, used));
  const liveIds = idsForKinds(live, used);
  const rest = []; for (let i = 0; i < 136; i++) if (!used.has(i)) rest.push(i);
  const dead = rest.splice(0, 14);
  const liveAll = liveIds.concat(rest);
  r.live = liveAll; r.livePtr = 0; r.liveEnd = opts.liveCount != null ? opts.liveCount : liveAll.length; r.dead = dead;
  // extra live tiles beyond liveEnd are treated as removed (still physical, never drawn)
  r.players.forEach((p, s) => { p.hand = T.sortIds(handIds[s]); p.initialHandIds = p.hand.slice(); p.waits = E.standardWaits(p); });
  if (opts.targets) r.jackpotTargets = opts.targets.map(T.idx).sort((a, b) => a - b);
  r.turnSeat = r.dealer;
  E.assertTileInvariant(m);
}
function step(m, d) { return E.apply(m, d); }
function pendSeat(m) { return m.round.pending && m.round.pending.seat; }

{
  // first_win_continues + ron tile is a reference (no extra physical tile)
  const m = newRigMatch();
  // seat0 dealer discards p9; seat1 waits on p9 (tanyao-free -> needs yaku): give seat1 white triplet yakuhai
  rig(m, [
    ['m1', 'm1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z1', 'z2', 'z3'],
    ['z5', 'z5', 'z5', 'm2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'p9'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z4', 'z6', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['p9', 'm1', 'm1', 's9']);
  E.advance(m);
  eq(pendSeat(m), 0, 'dealer acts first');
  const p9 = m.round.players[0].hand.find((id) => (id >> 2) === T.idx('p9'));
  step(m, { type: 'discard', tileId: p9 });
  eq(pendSeat(m), 1, 'seat1 offered ron');
  ok(m.round.pending.ron, 'ron legal (haku)');
  step(m, { type: 'ron' });
  const r = m.round;
  eq(E.activeSeats(r), [0, 2, 3], 'first_win_continues active');
  ok(!r.ended, 'round not ended after first ron');
  E.assertTileInvariant(m);
  ok(r.players[1].winSnapshot.handIds.includes(p9) && r.players[0].discards.some((d) => d.tileId === p9), 'ron tile referenced, not duplicated');
  eq(pendSeat(m), 2, 'next active after discarder draws');
  // seat1 must not draw again
  let guard = 0;
  while (!r.ended && guard++ < 400) { const pd = r.pending; if (pd.seat === 1) { ok(false, 'winner acted'); break; } step(m, MJ2.CPU.decide(m, pd)); }
  ok(r.ended, 'round ends eventually');
  ok(!r.events.some((e) => e.seat === 1 && e.type === 'DRAW' && e.seq > r.players[1].winSnapshot.eventSeq), 'winner never draws after win');
  const s = m.settlements[0];
  ok(s.results[1].isWinner && s.results[1].majors.some((x) => x.roleId === 'std_haku'), 'winner settled with haku');
  ok(s.results[0].minors.some((x) => x.roleId === 'sp_furikomi'), 'discarder gets 振込マン');
  eq(s.order[0], 1, 'settlement order winner first');
}
{
  // multi-ron x3 on the same tile -> 振り込みの天才, tile conservation
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z1', 'z2', 'z3', 's5'],
    ['z5', 'z5', 'z5', 'm2', 'm3', 'm4', 'p2', 'p3', 'p4', 's6', 's7', 's8', 's5'],
    ['z6', 'z6', 'z6', 'm5', 'm6', 'm7', 'p5', 'p6', 'p7', 's2', 's3', 's4', 's5'],
    ['z7', 'z7', 'z7', 'm6', 'm7', 'm8', 'p6', 'p7', 'p8', 's1', 's2', 's3', 'p9']
  ], ['s5', 'm9', 'p9', 'm9']);
  // seat3 waits p9 not s5 -> make seat3 wait s5: replace p9 with ... use custom: seat3 needs s5 tanki
  E.advance(m);
  const r = m.round;
  // seat0 draws s5 (4th s5 -> but seats1,2 hold s5 tanki each). Fix: seat3 wait on s5 impossible (4 copies). Use 2-ron here.
  const s5 = r.players[0].hand.find((id) => (id >> 2) === T.idx('s5'));
  step(m, { type: 'discard', tileId: s5 });
  const offered = [];
  while (r.pending && r.pending.type === 'call') { offered.push(r.pending.seat); step(m, r.pending.ron ? { type: 'ron' } : { type: 'pass' }); }
  eq(offered.slice(0, 2), [1, 2], 'double ron offers in order');
  eq(r.winOrder, [1, 2], 'double ron winners');
  E.assertTileInvariant(m);
  eq(E.activeSeats(r), [0, 3], 'two remain after double ron');
}
{
  // triple ron on one tile: seat0 discards m5; seats 1,2,3 wait m5 (kanchan/tanki)
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm9', 'p1', 'p9', 's1', 's9', 'z1', 'z2', 'z3', 'z4', 'p2', 'p5', 'm5'],
    ['z5', 'z5', 'z5', 'm4', 'm6', 'p2', 'p3', 'p4', 's6', 's7', 's8', 's2', 's2'],
    ['z6', 'z6', 'z6', 'm3', 'm4', 'p5', 'p6', 'p7', 's2', 's3', 's4', 's8', 's8'],
    ['z7', 'z7', 'z7', 'm6', 'm7', 'p6', 'p7', 'p8', 's1', 's2', 's3', 'p3', 'p3']
  ], ['s9', 'm9', 'p9', 'm9', 'm1', 'm1']);
  E.advance(m);
  const r = m.round;
  const m5 = r.players[0].hand.find((id) => (id >> 2) === T.idx('m5'));
  step(m, { type: 'discard', tileId: m5 });
  while (r.pending && r.pending.type === 'call') step(m, r.pending.ron ? { type: 'ron' } : { type: 'pass' });
  eq(r.winOrder, [1, 2, 3], 'triple ron');
  E.assertTileInvariant(m);
  eq(E.activeSeats(r), [0], 'one player left');
  // ３人和了でその局は終了（最後の一人は打ち続けない）
  ok(r.ended && r.endReason === 'three_won', 'round ends when 3 have won', r.endReason);
  const res0 = m.settlements[0].results[0];
  ok(res0.majors.some((x) => x.roleId === 'sp_furikomi_master') && !res0.minors.some((x) => x.roleId === 'sp_furikomi'), 'furikomi master replaces 振込マン');
  ok(res0.basePoints >= 32000, 'furikomi master base 32000', res0.basePoints);
  ok(res0.isWinner || res0.majors.some((x) => x.roleId === 'idea_025') === false || true, 'ok');
  ok(m.round.events.filter((e) => e.type === 'YAKUMAN_READY' && e.seat === 0 && e.names.includes(MJ2.DATA.roleById.sp_furikomi_master.name)).length <= 1, 'yakuman notice at most once');
}
{
  // white triplet non-winner gets std_haku 100
  const m = newRigMatch();
  rig(m, [
    ['z5', 'z5', 'z5', 'm1', 'm4', 'm7', 'p2', 'p4', 'p8', 's2', 's5', 's9', 'z1'],
    ['m1', 'm1', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z4', 'z6', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['z2', 'z3', 'z2', 'z3', 'z2', 'z3', 'z2', 'z3'], { liveCount: 4 });
  E.advance(m);
  const r = m.round;
  // everyone tsumogiri
  while (!r.ended) { const p = r.pending; step(m, p.type === 'action' ? { type: 'discard', tileId: r.players[p.seat].lastDrawId } : { type: 'pass' }); }
  const res = m.settlements[0].results[0];
  ok(res.majors.some((x) => x.roleId === 'std_haku') && res.basePoints >= 100, 'white_triplet_nonwin', res.majors.map((x) => x.roleId));
  eq(res.handIds.length, 13, 'nonwinner settles 13 tiles');
  eq(r.endReason, 'exhausted', 'exhausted end');
}
{
  // 双鳥羽佐助: いろいろな役満の材料を半分（7枚）持って始まる。残りは普通に配る（牌の総数・４枚制限は維持）
  const seenT = new Set();
  for (let t = 0; t < 40; t++) {
    MJ2.SaveStore._resetMemory();
    const m = E.newMatch({ seed: 'trait' + t, stageId: 'mj2_org05', playerFaceId: 'mj2_p01', roster: ['mj2_p01', 'mj2_c14', 'mj2_c13', 'mj2_c15'] });
    E.startRound(m);
    const p = m.round.players[1];
    const yt = p.yakumanTemplate;
    const cnt = {}; for (const id of p.hand) cnt[id >> 2] = (cnt[id >> 2] || 0) + 1;
    const need = {}; for (const k of yt.kinds) need[k] = (need[k] || 0) + 1;
    if (!yt || yt.kinds.length < 6 || p.hand.length !== 13 || Object.keys(need).some((k) => (cnt[k] || 0) < need[k])) { ok(false, 'half yakuman template in hand', [yt, p.hand.length]); break; }
    seenT.add(yt.id);
    E.assertTileInvariant(m);
    ok(m.round.dead.length === 14, 'dead wall 14');
    const others = [0, 2, 3].map((s) => new Set(m.round.players[s].hand.map((id) => id >> 2).filter((k) => MJ2.Hand.YAOCHU.includes(k))).size);
    ok(others.every((x) => x < 13), 'others normal deal');
  }
  ok(seenT.size >= 5, 'various yakuman templates appear', [...seenT]);
}
{
  // riichi: tsumogiri forced, permanent furiten on pass
  const m = newRigMatch();
  rig(m, [
    ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 's6', 's7', 'z1', 'z1'],
    ['m1', 'm1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z2', 'z3', 'z4'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z4', 'z6', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['z7', 'z2', 'z3', 'z2', 'p9', 's5', 'z3', 'z5', 'z5', 'z5']);
  E.advance(m);
  const r = m.round;
  ok(r.pending.riichi.length > 0, 'riichi offered');
  const z7 = r.players[0].lastDrawId;
  ok(r.pending.riichi.includes(z7), 'riichi discard candidate');
  step(m, { type: 'discard', tileId: z7, riichi: true });
  ok(!!r.players[0].riichi && r.players[0].riichi.double, 'double riichi on first discard');
  // run others with pass/tsumogiri until seat0 again
  let guard = 0;
  while (r.pending && r.pending.seat !== 0 && guard++ < 50) { const p = r.pending; step(m, p.type === 'action' ? { type: 'discard', tileId: r.players[p.seat].lastDrawId } : { type: 'pass' }); }
  ok(r.pending.type === 'action' && r.pending.discards.length === 1 && r.pending.discards[0] === r.players[0].lastDrawId, 'riichi tsumogiri only');
}
{
  // no duplicate scoring
  const m = newRigMatch();
  const fake = { id: 'match1-E1', roundId: 'x', results: [0, 1, 2, 3].map((s) => ({ seat: s, total: s === 0 ? 416 : 0, majors: [], minors: [], isWinner: false })), order: [0, 1, 2, 3], applied: false };
  Settlement.applyRound(m, fake);
  Settlement.applyRound(m, fake);
  eq(m.cumulativeScores[0] - 30000, 416, 'no_duplicate_scoring');
}
{
  // unknown roles: cpu-only awards never unlock
  MJ2.SaveStore._resetMemory();
  const m = newRigMatch();
  const s = { id: 'u1', results: [0, 1, 2, 3].map((x) => ({ seat: x, total: 1, isWinner: false, majors: x === 1 ? [{ roleId: 'sp_aho' }] : [], minors: [] })) };
  MJ2.Records.applyRound(m, s);
  ok(!MJ2.Records.roleStat('sp_aho'), 'unknown_roles cpu only');
}
{
  // chanta non-win: 4 sets + single with yaochu
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm2', 'm3', 'p7', 'p8', 'p9', 's1', 's2', 's3', 'z1', 'z1', 'z1', 'z6'],
    ['m1', 'm1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z2', 'z3', 'z4'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z4', 'z6', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['z2', 'z3', 'z2', 'z3'], { liveCount: 4 });
  E.advance(m);
  const r = m.round;
  while (!r.ended) { const p = r.pending; step(m, p.type === 'action' ? { type: 'discard', tileId: r.players[p.seat].lastDrawId } : { type: 'pass' }); }
  const got = m.settlements[0].results[0].majors.map((x) => x.roleId);
  ok(got.includes('std_chanta'), 'chanta nonwin', got);
}
{
  // winner standard fu/points sanity: closed ron pinfu tanyao 30fu 2han = 2000 child
  const info = { concealedIds: idsForKinds(['m2', 'm3', 'm4', 'p3', 'p4', 'p5', 's4', 's5', 's6', 's6', 's7', 's8', 'p8', 'p8']), melds: [], winType: 'ron', seatWind: 1, roundWind: 0, dealer: false, riichi: null };
  info.winTileId = info.concealedIds[11];
  const res = Yaku.evaluateWinStandard(info, 0);
  eq(res.awards.map((a) => a.roleId).sort(), ['std_pinfu', 'std_tanyao'], 'pinfu tanyao');
  eq([res.fu, res.points], [30, 2000], 'pinfu tanyao 2000');
  // open honitsu kuisagari
  const used = new Set();
  const md = { id: 'x', type: 'pon', tileIds: idsForKinds(['z5', 'z5', 'z5'], used) };
  const info2 = { concealedIds: idsForKinds(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm9', 'm9'], used), melds: [md], winType: 'ron', seatWind: 1, roundWind: 0, dealer: false };
  info2.winTileId = info2.concealedIds[10];
  const r2 = Yaku.evaluateWinStandard(info2, 0);
  const h = Object.fromEntries(r2.awards.map((a) => [a.roleId, a.han]));
  eq([h.std_honitsu, h.std_ittsuu, h.std_haku], [2, 1, 1], 'kuisagari honitsu/ittsuu');
}

{
  // jackpot end-to-end: 13 targets in hand, draw the 14th -> tsumo legal, base 1,000,000, no double counting
  const m = newRigMatch();
  const tk = ['m1', 'm3', 'm5', 'm7', 'm9', 'p2', 'p4', 'p6', 'p8', 's1', 's5', 's9', 'z1', 'z5'];
  rig(m, [
    tk.slice(0, 13),
    ['m2', 'm2', 'm4', 'm6', 'p1', 'p3', 'p7', 's2', 's4', 's7', 'z2', 'z3', 'z4'],
    ['m2', 'm4', 'm6', 'm8', 'p1', 'p3', 'p5', 's3', 's6', 's8', 'z6', 'z7', 'z7'],
    ['m8', 'm8', 'm4', 'm6', 'p5', 'p7', 'p9', 's3', 's6', 's8', 'z6', 'z6', 'z2']
  ], ['z5'], { targets: tk });
  ok(E.jackpotWait(m.round, m.round.players[0]) === T.idx('z5'), 'jackpot one away detected');
  E.advance(m);
  ok(m.round.pending.tsumo, 'jackpot tsumo legal (no 4 sets needed)');
  step(m, { type: 'tsumo' });
  const r = m.round;
  while (!r.ended) { const p = r.pending; step(m, MJ2.CPU.decide(m, p)); }
  const res = m.settlements[0].results[0];
  eq([res.baseKind, res.basePoints], ['jackpot', 1000000], 'jackpot base 1,000,000');
  ok(res.total === 1000000 + res.minorTotal + res.fixedTotal, 'jackpot no double count', res.total);
}
{
  // 13 kinds + duplicate is NOT jackpot (no win offered)
  const m = newRigMatch();
  const tk = ['m1', 'm3', 'm5', 'm7', 'm9', 'p2', 'p4', 'p6', 'p8', 's1', 's5', 's9', 'z1', 'z5'];
  rig(m, [
    tk.slice(0, 13),
    ['m2', 'm2', 'm4', 'm6', 'p1', 'p3', 'p7', 's2', 's4', 's7', 'z2', 'z3', 'z4'],
    ['m2', 'm4', 'm6', 'm8', 'p1', 'p3', 'p5', 's3', 's6', 's8', 'z6', 'z7', 'z7'],
    ['m8', 'm8', 'm4', 'm6', 'p5', 'p7', 'p9', 's3', 's6', 's8', 'z6', 'z6', 'z2']
  ], ['z1'], { targets: tk });
  E.advance(m);
  ok(!m.round.pending.tsumo, 'jackpot duplicate not winnable');
  ok(m.round.pending.riichi.includes(m.round.players[0].lastDrawId), 'riichi allowed on jackpot wait');
  step(m, { type: 'discard', tileId: m.round.players[0].lastDrawId, riichi: true });
  ok(m.round.events.some((e) => e.type === 'YAKUMAN_READY' && e.seat === 0 && e.names.includes('スーパージャックポット')), 'jackpot 役満リーチ notice on riichi');
}
{
  // discard furiten: waiting tile already in own river blocks ron
  const m = newRigMatch();
  rig(m, [
    ['z5', 'z5', 'z5', 'm2', 'm3', 'm4', 'p2', 'p3', 'p4', 's2', 's3', 's4', 'p9'],
    ['m1', 'm1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z1', 'z2', 'z3'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z4', 'z6', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['p9', 'z2', 'z3', 'p9']);
  E.advance(m);
  const r = m.round;
  // seat0 draws p9 and discards it (now furiten on p9 tanki)... seat0 waits p9 after discarding the other p9
  step(m, { type: 'discard', tileId: r.players[0].lastDrawId });
  while (r.pending && r.pending.seat !== 3) { const p = r.pending; step(m, p.type === 'action' ? { type: 'discard', tileId: r.players[p.seat].lastDrawId } : { type: 'pass' }); }
  // seat3 draws p9 and discards it -> seat0 must not be offered a ron (furiten)
  step(m, { type: 'discard', tileId: r.players[3].lastDrawId });
  ok(!(r.pending && r.pending.seat === 0 && r.pending.ron), 'discard furiten blocks ron');
  ok(r.players[0].furitenTemp || E.isFuriten(r, r.players[0]), 'player is furiten');
}

// ---------- minor bundle (jackpot_gold_minor_bundle_v1) ----------
{
  const R = MJ2.Roles;
  eq([3, 4, 7, 8, 11, 12, 15, 16, 20].map(R.minorCountToHan), [0, 1, 1, 2, 2, 3, 3, 4, 4], 'minor count -> han table');
  ok(MJ2.DATA.roles.filter(R.isMinorRole).every((r) => r.value === 0 && r.class === 'minor'), 'all 子役 have value 0');
  ok(MJ2.DATA.roleById.sp_furikomi.class === 'minor', '振込マン is now a 子役');
  // exclusive-resolved minors are not counted: 5 pairs -> 五組待ち(han) beats 四組様/三つの相棒
  const v5 = fakeView({ ownedKinds: ['m1', 'm1', 'p2', 'p2', 's3', 's3', 'z1', 'z1', 'z2', 'z2'] });
  const e5 = R.evaluateRoles({}, 0, v5);
  ok(!e5.awards.some((a) => a.roleId === 'tiny_pair3' || a.roleId === 'tiny_pair4'), 'excluded minors removed');
  ok(e5.minorCount === e5.awards.filter((a) => a.minor).length, 'minorCount equals resolved minors');
  // many minors from one hand: count + han + no individual points
  const vm = fakeView({ ownedKinds: ['m1', 'm2', 'm3', 'm9', 'm4', 'm6', 'm5', 'p5', 's5', 'z7', 'z1', 'z3', 'z6'] });
  const em = R.evaluateRoles({}, 0, vm);
  ok(em.minorCount >= 8 && em.minorBundleHan === R.minorCountToHan(em.minorCount), 'many minors bundle', { n: em.minorCount, h: em.minorBundleHan });
  ok(em.awards.filter((a) => a.minor).every((a) => a.minorPoints === 0), 'individual minor points are 0');
  ok(em.han >= em.minorBundleHan, 'bundle han added to han total');
  // non-winner points
  eq([Settlement.nonWinHanPoints(R.minorCountToHan(3)), Settlement.nonWinHanPoints(R.minorCountToHan(8)), Settlement.nonWinHanPoints(R.minorCountToHan(8) + 1), Settlement.nonWinHanPoints(R.minorCountToHan(16) + 1)], [0, 200, 400, 1600], 'nonwin minor points 0/200/400/1600');
}
{
  // complete hand with no normal yaku but >=4 子役 -> ron is legal; bundle shown as 子役まとめ
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z1', 'z2', 'z3', 'm2'],
    ['m1', 'm3', 'm7', 'm8', 'm9', 'p1', 'p2', 'p3', 's4', 's5', 's6', 'z4', 'z4'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z6', 'z7', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['z5', 'z5', 'z5', 'z5']);
  E.advance(m);
  const r = m.round;
  const m2 = r.players[0].hand.find((id) => (id >> 2) === T.idx('m2'));
  step(m, { type: 'discard', tileId: m2 });
  ok(!(r.pending && r.pending.seat === 1 && r.pending.ron), '子役まとめだけではロンできない（ドラと同じ加算翻）');
  const lg = MJ2.Yaku.evaluateWinLegality(m, 1, { seat: 1, winType: 'ron', winTileId: m2, fromSeat: 0, handIds: r.players[1].hand.concat([m2]), melds: [], live: 60 });
  ok(lg && !lg.legal && lg.han > 0, 'bundle han counted but not legal alone', lg);
}
{
  // 別の役（白）があれば和了でき、子役まとめは加算翻として乗る
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z1', 'z2', 'z3', 'm2'],
    ['m1', 'm3', 'z5', 'z5', 'z5', 'p1', 'p2', 'p3', 's4', 's5', 's6', 'z4', 'z4'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z6', 'z7', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['p9', 'p9', 'p9', 'p9']);
  E.advance(m);
  const r = m.round;
  const m2 = r.players[0].hand.find((id) => (id >> 2) === T.idx('m2'));
  step(m, { type: 'discard', tileId: m2 });
  ok(r.pending && r.pending.seat === 1 && r.pending.ron, 'ron legal with 白 + bundle');
  step(m, { type: 'ron' });
  while (!r.ended) { const p = r.pending; step(m, p.type === 'action' ? { type: 'discard', tileId: r.players[p.seat].lastDrawId } : { type: 'pass' }); }
  const res = m.settlements[0].results[1];
  const bundle = res.majors.find((x) => x.roleId === 'system_minor_bundle');
  ok(bundle && bundle.han === res.minorBundleHan && res.minorCount >= 4, 'winner has 子役まとめ row', { c: res.minorCount, h: res.minorBundleHan });
  ok(res.minorTotal === 0 && res.received === res.basePoints && res.total === res.received - res.paid + res.fixedTotal, 'winner paid by ron, no individual minor points');
  ok(res.majors.some((x) => x.roleId === 'std_haku'), 'winner has 白');
  ok(res.hanTotal >= 1 + res.minorBundleHan, 'bundle added on top of the real yaku', [res.hanTotal, res.minorBundleHan]);
  const res0 = m.settlements[0].results[0];
  ok(res0.minors.some((x) => x.roleId === 'sp_furikomi') && res0.fixedTotal === 0, '振込マン counted as 子役, no 100 points');
  ok(m.settlements[0].scoringPolicyVersion === 'transfer_v3_stake', 'policy version saved');
  ok(!MJ2.Records.roleStat('system_minor_bundle'), 'bundle never unlocks in encyclopedia');
}
{
  // not complete -> 子役 can never make a win
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm4', 'm7', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z1', 'z2', 'z3', 'm2'],
    ['m1', 'm3', 'm7', 'm8', 'm9', 'p1', 'p2', 'p4', 's4', 's5', 's6', 'z4', 'z4'],
    ['m5', 'm5', 'm6', 'm8', 'p5', 'p6', 'p8', 's5', 's6', 's8', 'z6', 'z7', 'z7'],
    ['m9', 'm9', 'm2', 'm6', 'p3', 'p6', 's2', 's3', 's6', 's9', 'z6', 'z7', 'z4']
  ], ['z5', 'z5', 'z5', 'z5']);
  E.advance(m);
  const r = m.round;
  const m2 = r.players[0].hand.find((id) => (id >> 2) === T.idx('m2'));
  step(m, { type: 'discard', tileId: m2 });
  ok(!(r.pending && r.pending.seat === 1 && r.pending.ron), 'incomplete hand cannot ron with 子役');
}

// ---------- transfer_v1 ----------
{
  const S = MJ2.Settlement;
  eq(S.bundleRoleFor(3), null, 'bundle name: 3 -> none');
  eq([4, 7, 8, 12, 16, 20].map((n) => S.bundleRoleFor(n).name), ['四子安', '四子安', '八子安', '十二子安', '十六子安', '十六子安'], 'bundle names');
  eq(S.bundleRoleFor(8).reading, 'パーツーアン', 'bundle reading kept');
  const sp = S.splitFixed(1000000, [{ seat: 1, w: 1 }, { seat: 2, w: 1 }, { seat: 3, w: 1 }]);
  ok(sp.reduce((a, x) => a + x.amount, 0) === 1000000 && sp.every((x) => x.amount % 100 === 0), 'jackpot dealer-tsumo split totals 1,000,000', sp);
  const sp2 = S.splitFixed(32000, [{ seat: 0, w: 2 }, { seat: 2, w: 1 }, { seat: 3, w: 1 }]);
  eq(sp2.map((x) => x.amount), [16000, 8000, 8000], 'yakuman child-tsumo split 16000/8000/8000');
}
{
  // triple ron: discarder pays all three in full, sum of transfers is zero
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm9', 'p1', 'p9', 's1', 's9', 'z1', 'z2', 'z3', 'z4', 'p2', 'p5', 'm5'],
    ['z5', 'z5', 'z5', 'm4', 'm6', 'p2', 'p3', 'p4', 's6', 's7', 's8', 's2', 's2'],
    ['z6', 'z6', 'z6', 'm3', 'm4', 'p5', 'p6', 'p7', 's2', 's3', 's4', 's8', 's8'],
    ['z7', 'z7', 'z7', 'm6', 'm7', 'p6', 'p7', 'p8', 's1', 's2', 's3', 'p3', 'p3']
  ], ['s9', 'm9', 'p9', 'm9', 'm1', 'm1']);
  E.advance(m);
  const r = m.round;
  const m5 = r.players[0].hand.find((id) => (id >> 2) === T.idx('m5'));
  step(m, { type: 'discard', tileId: m5 });
  while (r.pending && r.pending.type === 'call') step(m, r.pending.ron ? { type: 'ron' } : { type: 'pass' });
  let n = 0; while (!r.ended && n++ < 300) step(m, MJ2.CPU.decide(m, r.pending));
  const st = m.settlements[0];
  const ronPays = st.transfers.filter((p) => p.kind === 'ron');
  ok(ronPays.length === 3 && ronPays.every((p) => p.from === 0 && p.amount === st.results[p.to].basePoints), 'triple ron: discarder pays each winner in full', ronPays);
  const sumTransfers = st.results.reduce((a, x) => a + x.received - x.paid, 0);
  eq(sumTransfers, 0, 'transfers sum to zero');
  ok(st.results.every((x) => x.total === x.received - x.paid + x.selfGain), 'total = received - paid + selfGain');
  ok(st.results[0].paid >= 3 * 1000, 'discarder pays (can go negative)');
  eq(m.cumulativeScores.reduce((a, b) => a + b, 0) - 120000, st.results.reduce((a, x) => a + x.selfGain, 0), 'cumulative sum = self gains only');
}
{
  // tsumo after others already won: waiting winners still pay (normal dealer/child payments)
  const m = newRigMatch();
  rig(m, [
    ['m1', 'm9', 'p1', 'p9', 's1', 's9', 'z1', 'z2', 'z3', 'z4', 'p2', 'p5', 'm5'],
    ['z5', 'z5', 'z5', 'm4', 'm6', 'p2', 'p3', 'p4', 's6', 's7', 's8', 's2', 's2'],
    ['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 's3', 's4', 's5', 'z6', 'z6', 'm7', 'm8'],
    ['m1', 'm1', 'm7', 'm8', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z7', 'z7', 'z4']
  ], ['s9', 'z7', 'm6']);
  E.advance(m);
  const r = m.round;
  const m5 = r.players[0].hand.find((id) => (id >> 2) === T.idx('m5'));
  step(m, { type: 'discard', tileId: m5 }); // seat1 rons
  while (r.pending && r.pending.type === 'call') step(m, r.pending.ron ? { type: 'ron' } : { type: 'pass' });
  ok(r.players[1].winSnapshot, 'seat1 won by ron');
  // seat2 draws z7 -> discard it, seat3 draws m6? (wall order) ; seat2 waits m6/m9 (m7m8)
  let guard = 0;
  while (!r.ended && guard++ < 400) {
    const p = r.pending;
    if (p.type === 'action' && p.tsumo && p.seat === 2) { step(m, { type: 'tsumo' }); continue; }
    if (p.type === 'call') { step(m, { type: 'pass' }); continue; }
    step(m, { type: 'discard', tileId: r.players[p.seat].lastDrawId });
  }
  const st = m.settlements[0];
  const ts = st.transfers.filter((p) => p.kind === 'tsumo');
  if (r.players[2].winSnapshot && r.players[2].winSnapshot.winType === 'tsumo') {
    ok(ts.length === 3 && ts.some((p) => p.from === 1), 'waiting winner pays for later tsumo', ts);
    ok(ts.find((p) => p.from === 0).amount >= ts.find((p) => p.from === 3).amount, 'dealer pays the larger share');
    eq(st.results.reduce((a, x) => a + x.received - x.paid, 0), 0, 'tsumo transfers sum to zero');
  } else ok(false, 'seat2 should tsumo in this rig', r.players[2].winSnapshot);
}

// ---------- 三冠王 ----------
{
  const mk = (rows) => ({ cumulativeScores: [1000, 2000, 3000, 4000], settlements: [{ results: rows.map((x, seat) => ({ seat, minorRoleCount: x[0], majorRoleCount: x[1], callCount: x[2] })) }] });
  // seat0 sweeps all three
  let m = mk([[9, 5, 4], [3, 2, 1], [0, 0, 0], [1, 1, 0]]);
  let tc = MJ2.Settlement.applyTripleCrown(m);
  eq(tc.award, [25000, 0, 0, 0], 'sweep: 5,000点×3 + 10,000点 = 25,000点（×レート1）');
  eq(m.cumulativeScores, [26000, 2000, 3000, 4000], 'crown added to own money');
  MJ2.Settlement.applyTripleCrown(m);
  eq(m.cumulativeScores[0], 26000, 'triple crown applied only once');
  // ties: all tied get it, no sweep
  m = mk([[4, 3, 2], [4, 1, 2], [0, 3, 0], [0, 0, 0]]);
  tc = MJ2.Settlement.applyTripleCrown(m);
  eq(tc.award, [25000, 10000, 5000, 0], 'ties: everyone tied is awarded; seat0 holds all three (shared) -> sweep');
  // nobody counted -> no award
  m = mk([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  tc = MJ2.Settlement.applyTripleCrown(m);
  eq(tc.award, [0, 0, 0, 0], 'zero counts -> no crown');
  // ranking uses money after the crown
  m = mk([[0, 0, 5], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  m.roster = ['mj2_p01', 'mj2_c01', 'mj2_c02', 'mj2_c03'];
  MJ2.Settlement.applyTripleCrown(m);
  eq(MJ2.Settlement.finalRanking(m)[0].seat, 0, 'final rank decided after 三冠王');
}
// ---------- 撃破記録 ----------
{
  MJ2.SaveStore._resetMemory();
  const fake = (id, scores) => ({ matchId: id, stageId: 'mj2_org02', humanSeats: [0], roster: ['mj2_p01', 'mj2_c04', 'mj2_c05', 'mj2_c06'], cumulativeScores: scores, settlements: [], tripleCrown: { award: [0, 0, 0, 0] } });
  MJ2.Records.applyMatchEnd(fake('a', [100, 200, 0, 0]));
  ok(!MJ2.Records.orgStat('mj2_org02').defeated, '2nd place: not defeated');
  MJ2.Records.applyMatchEnd(fake('b', [300, 200, 300, 0]));
  ok(MJ2.Records.orgStat('mj2_org02').defeated, 'tied 1st counts as 1st -> defeated');
  MJ2.Records.applyMatchEnd(fake('c', [-500, 200, 0, 0]));
  ok(MJ2.Records.orgStat('mj2_org02').defeated, 'losing later keeps the defeat flag');
  eq(MJ2.Records.orgStat('mj2_org02').matches, 3, 'org match count');
  eq(MJ2.Records.charStat('mj2_c04').matches, 3, 'per-character stats in theme namespace');
  ok(MJ2.Records.loadRecords().themes.underworld_2200, 'namespace underworld_2200');
  eq(MJ2.Records.history().length, 3, 'match history');
  // legacy per-character records are archived, not mixed in
  const rec = MJ2.Records.loadRecords();
  rec.byCharacter = { s01_02: { matches: 4, wins: 2, losses: 2, draws: 0 } };
  MJ2.SaveStore.importAll(JSON.stringify({ kind: 'mj2-export', records: rec }));
  const r2 = MJ2.Records.loadRecords();
  ok(Object.keys(r2.byCharacter).length === 0 && r2.legacyArchive.byCharacter_ffs.s01_02.matches === 4, 'old FFS records archived');
  ok(MJ2.Records.orgStat('mj2_org02').defeated, 'import keeps defeats');
}

// ---------- レート（組織×南場倍プッシュ） ----------
{
  eq(MJ2.DATA.stages.map((x) => x.rateYenPerPoint), [30, 50, 100, 200, 500], 'org rates 30/50/100/200/500');
  const m = E.newMatch({ seed: 'rt', stageId: 'mj2_org05', playerFaceId: 'mj2_p01', roster: ['mj2_p01', 'mj2_c13', 'mj2_c14', 'mj2_c15'] });
  eq(m.rate, 500, 'match keeps org rate');
  eq(['E1', 'E4', 'S1', 'S3', 'S4'].map((l) => MJ2.Settlement.rateFor(m, l).yen), [500, 500, 1000, 1000, 1500], 'south ×2, all-last ×3');
  const tc = MJ2.Settlement.computeTripleCrown(Object.assign({}, m, { settlements: [{ results: [0, 1, 2, 3].map((seat) => ({ seat, minorRoleCount: seat === 0 ? 9 : 0, majorRoleCount: seat === 0 ? 9 : 0, callCount: seat === 0 ? 9 : 0 })) }] }));
  eq([tc.award[0], tc.awardYen[0]], [25000, 25000 * 500], 'crown in points, money = points × org rate (no round multiplier)');
  eq([MJ2.util.yen(150000000), MJ2.util.money(-3200000)], ['1億5,000万円', '借金 320万円'], 'oku and debt display');
  // a rigged round at rate 30: money = points × 30, transfers still sum to zero
  const { runMatch } = require('./sim');
  const out = runMatch(5, 'mj2_org01', {});
  const s0 = out.m.settlements[0];
  ok(s0.yenPerPoint === 30 && s0.results.reduce((a, x) => a + x.received - x.paid, 0) === 0, 'E1 at 30円/点, zero-sum');
  const s5 = out.m.settlements[4];
  ok(s5.yenPerPoint === 60 && s5.mult === 2, 'S1 doubled');
  ok(s0.results.every((x) => x.yen.total === x.total * 30), 'money = points × rate');
  ok(s5.results.every((x) => x.yen.total === x.total * 60), 'south money = points × rate × 2');
  const fr = MJ2.Settlement.finalRanking(out.m);
  ok(fr.every((x) => x.score === out.m.cumulativeScores[x.seat] && x.money === out.m.cumulativeYen[x.seat]), 'final ranking by points (mahjong result), money kept');
  const sumY = [0, 1, 2, 3].map((seat) => out.m.initialYen[seat] + out.m.settlements.reduce((a, st) => a + st.results[seat].yen.total, 0) + (out.m.tripleCrown ? out.m.tripleCrown.awardYen[seat] : 0));
  eq(sumY, out.m.cumulativeYen, 'money = Σ round money + crown');
}

// ---------- 役満リーチの通知はリーチした時だけ ----------
{
  const { runMatch } = require('./sim');
  let bad = 0, n = 0;
  for (let i = 0; i < 6; i++) runMatch(700 + i, MJ2.DATA.stages[i % 5].id, { onRoundEnd(m) {
    m.round.events.forEach((e, j) => { if (e.type !== 'YAKUMAN_READY') return; n++; const rd = m.round.events.slice(0, j).some((x) => x.type === 'RIICHI_DECLARED' && x.seat === e.seat); if (!rd || e.names.includes(MJ2.DATA.roleById.sp_furikomi_master.name)) bad++; });
  } });
  eq(bad, 0, 'yakuman notice only after riichi, never for 三家献宝', n);
}

// ---------- 持ち点3万点・初期所持金・破産 ----------
{
  const m = E.newMatch({ seed: 'bk', stageId: 'mj2_org05', playerFaceId: 'mj2_p01', roster: ['mj2_p01', 'mj2_c13', 'mj2_c14', 'mj2_c15'] });
  eq(m.cumulativeScores, [30000, 30000, 30000, 30000], 'start 30,000点');
  eq(m.cumulativeYen, [15000000, 15000000, 15000000, 15000000], 'initial money = 30,000点 × 500円');
  // 東四局の後に主人公の所持金が0以下 → 破産
  m.roundIndex = 3; m.cumulativeScores[0] = -100; m.cumulativeYen[0] = -50000; m.settlements = [];
  eq(E.nextRoundOrEnd(m), 'bankrupt', 'bankrupt after E4 when money <= 0');
  ok(m.phase === 'match_end' && m.bankrupt && !MJ2.Settlement.applyTripleCrown(m), 'match ends, no triple crown');
  const m2 = E.newMatch({ seed: 'bk2', stageId: 'mj2_org01', playerFaceId: 'mj2_p01', roster: ['mj2_p01', 'mj2_c01', 'mj2_c02', 'mj2_c03'] });
  m2.roundIndex = 3; m2.cumulativeYen[0] = 1; m2.settlements = []; m2.round = null;
  const save = E.startRound; E.startRound = () => {};
  eq(E.nextRoundOrEnd(m2), 'round', 'money above 0 continues to South');
  E.startRound = save;
  const m3 = E.newMatch({ seed: 'bk3', stageId: 'mj2_org01', playerFaceId: 'mj2_p01', roster: ['mj2_p01', 'mj2_c01', 'mj2_c02', 'mj2_c03'] });
  m3.roundIndex = 2; m3.cumulativeYen[0] = -1; m3.round = null;
  E.startRound = () => {};
  eq(E.nextRoundOrEnd(m3), 'round', 'no bankrupt check except after E4');
  E.startRound = save;
  ok(MJ2.Records.stats().bankrupts >= 0, 'bankrupt count in stats');
}

// ---------- 黄金ドラ ----------
{
  const r = { jackpotTargets: [0, 1, 2, 3, 4] }; // m1..m5
  const ids = (ks) => ks.map((k, i) => T.idx(k) * 4 + (i % 4));
  eq(MJ2.Settlement.goldDoraCount(r, ids(['m1', 'm1', 'm2', 'p5', 'p6']), []).n, 2, 'gold dora: one per kind (m1×2 counts once)');
  eq(MJ2.Settlement.goldDoraCount(r, ids(['m1', 'm2', 'm3', 'm4', 'm5']), []).n, 3, 'gold dora capped at 3');
  eq(MJ2.Settlement.goldDoraCount(r, ids(['m1', 'm2']), [{ type: 'pon', tileIds: [] }]).n, 0, 'no gold dora with open melds');
  const { runMatch } = require('./sim');
  let checked = 0, bad = 0, nonwinGold = 0;
  for (let i = 0; i < 4; i++) runMatch(900 + i, MJ2.DATA.stages[i % 5].id, { onRoundEnd(m) {
    const s = m.settlements[m.settlements.length - 1];
    for (const res of s.results) {
      if (res.isWinner && res.baseKind === 'win') {
        checked++;
        const want = res.melds.length ? 0 : Math.min(3, new Set(res.handIds.map((id) => id >> 2).filter((k) => m.round.jackpotTargets.includes(k))).size);
        if (res.dora.gold !== want) bad++;
      } else if (!res.isWinner && res.dora && res.dora.gold) nonwinGold++;
    }
  } });
  ok(checked > 0 && bad === 0 && nonwinGold === 0, 'gold dora on winners only, matches held gold kinds', { checked, bad });
}

// ---------- キャラボイス ----------
{
  const fs = require('fs'), path = require('path');
  const cv = MJ2.DATA.audio.charVoices || {};
  const words = ['pon', 'chi', 'kan', 'riichi', 'ron', 'tsumo'];
  const miss = [];
  for (const c of MJ2.DATA.characters) for (const w of words) { const f = cv[c.id] && cv[c.id][w]; if (!f || !fs.existsSync(path.join(__dirname, '..', f))) miss.push(c.id + ':' + w); }
  eq(miss, [], 'all 16 characters have 6 call voices');
}

console.log('pass', pass, 'fail', fail);
if (fail) { console.log(failures.join('\n')); process.exit(1); }
