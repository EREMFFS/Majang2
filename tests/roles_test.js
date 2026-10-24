// Per-role positive/negative checks for all non-standard roles + standard yaku shapes. node tests/roles_test.js
const MJ2 = require('./load');
const { T, Roles, Yaku } = MJ2;
let pass = 0, fail = 0; const failures = []; const covered = new Set();
function ok(c, name, info) { if (c) pass++; else { fail++; failures.push(name + (info ? ' :: ' + JSON.stringify(info) : '')); } }
function ids(kinds, used) { used = used || new Set(); return kinds.map((k) => { const i = T.idx(k); for (let j = 0; j < 4; j++) { const id = i * 4 + j; if (!used.has(id)) { used.add(id); return id; } } throw new Error('5th ' + k); }); }
let uniq = 0;
function view(o) {
  const used = new Set();
  const owned = ids(o.owned || [], used);
  let seq = 0;
  const evs = (o.events || []).map((e) => {
    const x = Object.assign({ seat: 0 }, e);
    x.seq = ++seq; x.id = 'e' + x.seq;
    if (x.kind && x.tileId == null) { // allocate a distinct physical tile per event unless "same" given
      const i = T.idx(x.kind); x.tileId = x.same != null ? x.same : i * 4 + ((uniq++) % 4);
    }
    return x;
  });
  const r = { jackpotTargets: (o.targets || []).map(T.idx), players: [{}, {}, {}, {}] };
  const win = evs.find((e) => (e.type === 'WIN_RON' || e.type === 'WIN_TSUMO') && e.seat === 0) || null;
  return { m: {}, r, seat: 0, p: r.players[0], isWinner: !!o.isWinner, winEvent: win, events: evs, own: evs.filter((e) => e.seat === 0),
    ownedIds: owned, concealedIds: owned.slice(), melds: o.melds || [], counts: T.countsOfIds(owned), initialHandIds: o.initial ? ids(o.initial) : [],
    riichiEvent: evs.find((e) => e.seat === 0 && e.type === 'RIICHI_DECLARED') || null, endEvent: o.ended === false ? null : { type: 'ROUND_END' } };
}
function has(roleId, v) { covered.add(roleId); const r = MJ2.DATA.roleById[roleId]; return !!Roles.J[r.conditionId](v, r.params || {}, r); }
function both(roleId, pos, neg) { ok(has(roleId, view(pos)), roleId + ' positive'); if (neg) ok(!has(roleId, view(neg)), roleId + ' negative'); }

const D = (k) => ({ type: 'DISCARD', kind: k });
const DR = (k) => ({ type: 'DRAW', kind: k, source: 'live' });
const TS = (tenpai, waits) => ({ type: 'TENPAI_STATE', tenpai, waitSetAfter: waits || [] });

// --- tile-count roles ---
both('sp_123', { owned: ['s1', 's2', 's3'] }, { owned: ['s1', 'p2', 's3'] });
both('sp_193', { owned: ['p1', 'p9', 'p3'] }, { owned: ['p1', 'p9', 'm3'] });
both('sp_794', { owned: ['m7', 'm9', 'm4'] }, { owned: ['m7', 'm9', 's4'] });
both('sp_3745', { owned: ['s3', 's3', 's3', 'm7', 'm7', 'm7', 'p4', 'p4', 'p4', 's5', 's5', 's5', 'z1', 'z1'] }, { owned: ['s3', 's7', 's4', 's5', 's3', 's7', 's4', 's5'], isWinner: true });
both('sp_3745', { owned: ['s3', 's3', 'm7', 'm7', 'p4', 'p4', 's5', 's5', 'z1', 'z1', 'm9', 'm9', 'p1', 'p1'], isWinner: true }, { owned: ['s3', 's3', 's3', 'm7', 'm7', 'm7', 'p4', 'p4', 'p4', 's5', 's5', 'z1', 'z1', 'z2'], isWinner: true });
ok(!has('sp_3745', view({ owned: ['s3', 's3', 'm7', 'm7', 'p4', 'p4', 's5', 's5'], melds: [{ type: 'pon', tileIds: [] }] })), 'sp_3745 pairs form needs no melds');
both('idea_009', { owned: ['m6', 'm4'] }, { owned: ['m6', 'p4'] });
both('idea_010', { owned: ['p1', 'p5'] }, { owned: ['p1'] });
both('idea_011', { owned: ['s2', 's6'] }, { owned: ['s2'] });
both('idea_012', { owned: ['m2', 'm9'] }, { owned: ['m2', 'p9'] });
both('idea_013', { owned: ['m3', 'm9'] }, { owned: ['m3'] });
both('idea_014', { owned: ['p4', 'p6', 'p9'] }, { owned: ['p4', 'p6', 'm9'] });
both('tiny_337', { owned: ['m3', 'm3', 'm7'] }, { owned: ['m3', 'm7'] });
both('tiny_19', { owned: ['s1', 's9'] }, { owned: ['s1', 'm9'] });
both('tiny_4649', { owned: ['p4', 'p4', 'p6', 'p9'] }, { owned: ['p4', 'p6', 'p9'] });
both('tiny_315', { owned: ['m3', 'm1', 'm5'] }, { owned: ['m3', 'm1'] });
both('tiny_428', { owned: ['s4', 's2', 's8'] }, { owned: ['s4', 's2'] });
both('tiny_753', { owned: ['m7', 'm5', 'm3'] }, { owned: ['m7', 'm5'] });
both('tiny_831', { owned: ['p8', 'p3', 'p1'] }, { owned: ['p8', 'p3'] });
both('tiny_1122', { owned: ['m1', 'm1', 'm2', 'm2'] }, { owned: ['m1', 'm2', 'm2'] });
both('tiny_118', { owned: ['s1', 's1', 's8'] }, { owned: ['s1', 's8'] });
both('tiny_418', { owned: ['p4', 'p1', 'p8'] }, { owned: ['p4', 'p1'] });
both('sp_tozai', { owned: ['z1', 'z1', 'z1', 'z3', 'z3', 'z3'], melds: [{ type: 'pon', tileIds: [] }] }, { owned: ['z1', 'z1', 'z1', 'z3', 'z3', 'z2'] });
both('sp_nanboku', { owned: ['z2', 'z2', 'z2', 'z2', 'z4', 'z4', 'z4'] }, { owned: ['z2', 'z2', 'z4', 'z4', 'z4', 'z1'] });
both('sp_namusan', { owned: ['m7', 'm7', 'm7', 'p6', 'p6', 'p6', 's3', 's3', 's3', 'z1', 'z1'], melds: [{ type: 'pon', tileIds: [] }] }, { owned: ['m7', 'm7', 'm7', 'p6', 'p6', 'p6', 's3', 's3', 'm3', 'z1', 'z1'] });
ok(!has('sp_namusan', view({ owned: ['m7', 'm7', 'p6', 'p6', 's3', 's3', 'z1', 'z1', 'z2', 'z2', 'z3', 'z3', 'z4', 'z4'], isWinner: true })), 'sp_namusan no chiitoi form');
both('sp_nakanishi', { owned: ['z7', 'z7', 'z7', 'z3', 'z3', 'z3'] }, { owned: ['z7', 'z7', 'z7', 'z3', 'z3'] });
both('sp_777', { owned: ['m7', 'm7', 'm7', 'p7', 'p7', 'p7', 's7', 's7', 's7'] }, { owned: ['m7', 'm7', 'm7', 'p7', 'p7', 'p7', 's7', 's7'] });
both('idea_003', { owned: ['z1', 'z3'] }, { owned: ['z1'] });
both('idea_004', { owned: ['z2', 'z4'] }, { owned: ['z4'] });
both('idea_005', { owned: ['z5', 'z6', 'z7'] }, { owned: ['z5', 'z6'] });
both('idea_006', { owned: ['z1', 'z2', 'z3', 'z4'] }, { owned: ['z1', 'z2', 'z3'] });
both('idea_007', { owned: ['m5', 'p5', 's5'] }, { owned: ['m5', 'p5'] });
both('idea_001', { owned: ['z7', 'm1'] }, { owned: ['z7', 'z7'] });
both('idea_002', { owned: ['z6'] }, { owned: [] });
both('idea_017', { owned: ['z5', 'm1'] }, { owned: ['z5', 'z6'] });
both('sp_odd', { owned: ['m1', 'm3', 'p5', 's7', 's9'] }, { owned: ['m1', 'm3', 'p5', 's7', 'z1'] });
ok(!has('sp_odd', view({ owned: ['m1', 'm2'] })), 'sp_odd negative even');
both('sp_even', { owned: ['m2', 'p4', 's8'] }, { owned: ['m2', 'p4', 's9'] });
both('idea_015', { owned: ['m1', 'm2', 'z1'] }, { owned: ['m1', 'm3'] });
ok(!has('idea_015', view({ owned: ['z1'] })), 'idea_015 needs a number tile');
both('idea_016', { owned: ['m1', 'p9'] }, { owned: ['m1', 'p5'] });
both('idea_008', { owned: ['m9', 'p9', 'z1'] }, { owned: ['m9', 'p9', 's9'] });
both('tiny_2525', { owned: ['m2', 'm2', 'p2', 'p2'] }, { owned: ['m2', 'm2', 'p2'] });
both('tiny_pair3', { owned: ['m1', 'm1', 'p2', 'p2', 's3', 's3'] }, { owned: ['m1', 'm1', 'p2', 'p2', 's3', 's3', 's3'] });
both('tiny_pair4', { owned: ['m1', 'm1', 'p2', 'p2', 's3', 's3', 'z1', 'z1'] }, { owned: ['m1', 'm1', 'p2', 'p2', 's3', 's3'] });
both('tiny_pair5', { owned: ['m1', 'm1', 'p2', 'p2', 's3', 's3', 'z1', 'z1', 'z2', 'z2'] }, { owned: ['m1', 'm1', 'p2', 'p2'] });
{ // exclusive pair group: 5 pairs -> only pair5
  const v = view({ owned: ['m1', 'm1', 'p2', 'p2', 's3', 's3', 'z1', 'z1', 'z2', 'z2'] });
  const got = Roles.evaluateRoles({}, 0, v).awards.map((a) => a.roleId);
  ok(got.includes('tiny_pair5') && !got.includes('tiny_pair4') && !got.includes('tiny_pair3'), 'pair_count exclusive', got);
}
both('tiny_lonely', { owned: ['z1', 'm1'] }, { owned: ['z1', 'z2'] });
both('idea_018', { owned: ['m1', 'p1', 'p2', 's1', 's2', 's3'] }, { owned: ['m1', 'p1', 's1', 's2'] });
both('idea_019', { owned: ['m1', 'm2', 'm3', 'p1', 'z1'] }, { owned: ['m1', 'm2', 'p1', 'p2'] });
both('idea_020', { owned: ['z1', 'z1', 'z2'] }, { owned: ['z1', 'z2', 'z3'] });
both('sp_monopoly', { owned: ['m5', 'm5', 'm5', 'm5', 'p5', 'p5', 'p5', 'p5', 's5', 's5', 's5', 's5'] }, { owned: ['m5', 'm5', 'm5', 'm5', 'p5', 'p5', 'p5', 'p5', 's5', 's5', 's5'] });
{
  const tk = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p1', 'p2', 'p3', 's1', 'z1'];
  both('sp_jackpot', { owned: tk, targets: tk, isWinner: true }, { owned: tk, targets: tk.slice(0, 13).concat(['z2']), isWinner: true });
}
// --- calls ---
const C = (t, extra) => Object.assign({ type: t, meldId: 'M' + (uniq++) }, extra || {});
both('sp_naki', { events: [C('PON')] }, { events: [C('ANKAN')] });
both('sp_naki2', { events: [C('PON'), C('CHI')] }, { events: [C('PON')] });
both('sp_naki3', { events: [C('PON'), C('CHI'), C('CHI')] }, { events: [C('PON'), C('CHI'), C('CHI'), C('PON')] });
both('sp_naki_joe', { events: [C('PON'), C('CHI'), C('CHI'), C('PON')] }, { events: [C('PON'), C('CHI'), C('CHI')] });
both('sp_suupontsu', { events: [C('PON'), C('PON'), C('PON'), C('PON')] }, { events: [C('PON'), C('PON'), C('PON'), C('CHI')] });
{ const got = Roles.evaluateRoles({}, 0, view({ events: [C('PON'), C('PON'), C('PON'), C('PON')] })).awards.map((a) => a.roleId); ok(got.includes('sp_naki_joe') && got.includes('sp_suupontsu'), 'joe + suupontsu coexist', got); }
both('tiny_ponkotsu', { events: [C('PON')] }, { events: [C('PON')], isWinner: true });
both('tiny_chittomo', { events: [C('CHI')] }, { events: [C('PON')] });
both('tiny_kanpai', { events: [C('ANKAN')] }, { events: [C('PON')] });
both('idea_034', { events: [C('CHI'), C('CHI'), C('CHI')] }, { events: [C('CHI'), C('CHI'), C('CHI'), C('PON')] });
both('idea_030', { events: [C('PON'), D('m1')] }, { events: [D('m1'), C('PON')] });
both('idea_032', { events: [C('PON', { fromSeat: 1 }), C('PON', { fromSeat: 2 }), C('PON', { fromSeat: 3 })] }, { events: [C('PON', { fromSeat: 1 }), C('PON', { fromSeat: 2 }), C('PON', { fromSeat: 2 })] });
both('idea_033', { events: [C('PON', { fromSeat: 2 }), C('PON', { fromSeat: 2 }), C('PON', { fromSeat: 2 })] }, { events: [C('PON', { fromSeat: 1 }), C('PON', { fromSeat: 2 }), C('PON', { fromSeat: 2 })] });
both('idea_024', { events: [C('CHI'), Object.assign(C('PON'), { seat: 2 })] }, { events: [Object.assign(C('PON'), { seat: 2 }), C('CHI')] });
// discards called by others
{
  const mk = (callers) => { const evs = []; callers.forEach((c, i) => { evs.push({ type: 'DISCARD', kind: 'm' + (i + 1), id: 'd' + i }); if (c != null) evs.push({ type: 'PON', seat: c, discardEventId: '__D' + i }); }); return evs; };
  // build with explicit linkage after view creation
  const v = view({ events: [D('m1'), { type: 'PON', seat: 1 }, D('m2'), { type: 'CHI', seat: 2 }, D('m3'), { type: 'PON', seat: 3 }] });
  v.events[1].discardEventId = v.events[0].id; v.events[3].discardEventId = v.events[2].id; v.events[5].discardEventId = v.events[4].id;
  ok(has('idea_041', v), 'idea_041 positive'); ok(has('idea_042', v), 'idea_042 positive');
  const v2 = view({ events: [D('m1'), { type: 'PON', seat: 1 }, D('m2'), D('m3'), { type: 'PON', seat: 1 }, D('m4'), { type: 'CHI', seat: 1 }] });
  v2.events[1].discardEventId = v2.events[0].id; v2.events[4].discardEventId = v2.events[3].id; v2.events[6].discardEventId = v2.events[5].id;
  ok(!has('idea_041', v2), 'idea_041 negative (one caller)'); ok(!has('idea_042', v2), 'idea_042 negative (break)');
}
{ // ron after pon from same seat
  const v = view({ events: [C('PON', { fromSeat: 2 }), D('p5'), { type: 'WIN_RON', seat: 2, sourceSeat: 0 }] });
  v.events[2].tileId = v.events[1].tileId;
  ok(has('idea_035', v), 'idea_035 positive');
  const v2 = view({ events: [C('PON', { fromSeat: 2 }), D('p5'), { type: 'WIN_RON', seat: 1, sourceSeat: 0 }] });
  v2.events[2].tileId = v2.events[1].tileId;
  ok(!has('idea_035', v2), 'idea_035 negative');
}
// --- discards ---
both('idea_027', { events: [D('m1'), D('p1'), D('s1')] }, { events: [D('m1'), D('p1'), D('z1')] });
both('idea_028', { events: [D('z1'), D('z2'), D('z3'), D('z4')] }, { events: [D('z1'), D('z2'), D('z3')] });
both('idea_029', { events: [D('z5'), D('z6'), D('z7')] }, { events: [D('z5'), D('z6')] });
both('idea_050', { events: ['s1', 's1', 's1', 's4', 's4', 's4', 's7', 's7', 's7'].map(D) }, { events: ['s1', 's1', 's1', 's4', 's4', 's4', 's7', 's7', 'm7'].map(D) });
ok(!has('idea_021', view({ events: [D('m1')] })), 'idea_021 negative');
{ const v = view({ initial: ['z1'], events: [D('z1')] }); v.initialHandIds = [v.events[0].tileId]; ok(has('idea_021', v), 'idea_021 from initial hand'); }
{ const v = view({ events: [D('m4')] }); v.initialHandIds = [v.events[0].tileId, (v.events[0].tileId ^ 1)]; ok(has('idea_022', v), 'idea_022 positive'); v.initialHandIds = [v.events[0].tileId]; ok(!has('idea_022', v), 'idea_022 negative'); }
both('idea_023', { events: [D('p5')] }, { events: [D('p4'), D('p5')] });
// --- timelines ---
both('sp_okaeri', { events: [D('m3'), DR('m3')] }, { events: [D('m3'), DR('m4')] });
both('sp_aho', { events: [D('z2'), DR('z2'), D('z2'), DR('z2'), D('z2'), DR('z2')] }, { events: [D('z2'), DR('z2'), D('z2'), DR('z2'), D('m1'), DR('z2')] });
both('idea_046', { events: [D('m3'), DR('m4'), D('m6'), DR('m5'), D('m8'), DR('m9')] }, { events: [D('m3'), DR('m4'), D('m6'), DR('p5'), D('m8'), DR('m9')] });
{
  const evs = []; for (let i = 0; i < 10; i++) { evs.push({ type: 'DRAW', kind: 'm' + (1 + (i % 9)), source: 'live' }); evs.push({ type: 'DISCARD', kind: 'm' + (1 + (i % 9)) }); }
  const v = view({ events: evs }); for (let i = 0; i < 20; i += 2) v.events[i + 1].tileId = v.events[i].tileId;
  ok(has('idea_040', v), 'idea_040 positive');
  v.events[19].tileId = 999; ok(!has('idea_040', v), 'idea_040 negative');
}
{ const v = view({ events: [{ type: 'RIICHI_DECLARED', kind: 'p3' }, D('p3'), DR('p3')] }); ok(has('idea_031', v), 'idea_031 positive'); ok(has('std_riichi', v) === false, 'standard handled elsewhere'); }
ok(!has('idea_031', view({ events: [{ type: 'RIICHI_DECLARED', kind: 'p3' }, D('p3'), DR('p4')] })), 'idea_031 negative');
both('idea_038', { events: [{ type: 'DRAW', kind: 'm1', source: 'live', lastLive: true }, { type: 'RIICHI_DECLARED', kind: 'm2' }] }, { events: [{ type: 'DRAW', kind: 'm1', source: 'live' }, { type: 'RIICHI_DECLARED', kind: 'm2' }] });
both('idea_036', { events: [DR('m1'), { type: 'RIICHI_DECLARED', kind: 'm2' }, D('m2')] }, { events: [{ type: 'RIICHI_DECLARED', kind: 'm2' }, D('m2'), DR('m5')] });
both('idea_026', { events: [D('m1')] }, { events: [C('CHI')] });
ok(!has('idea_026', view({ events: [{ type: 'RIICHI_DECLARED', kind: 'm1' }] })), 'idea_026 negative riichi');
// --- ron / tsumo declines ---
both('idea_043', { events: [{ type: 'DECLINE_RON', kind: 'm1' }] }, { events: [{ type: 'DECLINE_RON', kind: 'm1' }], isWinner: true });
both('idea_045', { isWinner: true, events: [{ type: 'DECLINE_RON', kind: 'p7' }, { type: 'WIN_TSUMO', kind: 'p7' }] }, { isWinner: true, events: [{ type: 'DECLINE_RON', kind: 'p7' }, { type: 'WIN_TSUMO', kind: 'p8' }] });
both('idea_044', { isWinner: true, events: [{ type: 'DECLINE_TSUMO', kind: 'p7' }, { type: 'WIN_RON', kind: 'p8' }] }, { isWinner: true, events: [{ type: 'DECLINE_TSUMO', kind: 'p7' }, { type: 'WIN_TSUMO', kind: 'p8' }] });
// --- tenpai states ---
both('sp_noten', { events: [TS(false)] }, { events: [TS(true, [1])] });
both('idea_047', { events: [TS(true, [1]), TS(true, [2]), TS(true, [3]), TS(true, [1, 4])] }, { events: [TS(true, [1]), TS(true, [2]), TS(false), TS(true, [3])] });
ok(!has('idea_047', view({ events: [TS(true, [1, 2]), TS(true, [2, 1]), TS(true, [1, 2]), TS(true, [2, 1])] })), 'idea_047 set order is not a change');
both('idea_049', { events: [TS(false), TS(true, [1, 4]), TS(true, [2]), TS(true, [4, 1])] }, { events: [TS(true, [1, 4]), TS(true, [2]), TS(false), TS(true, [1, 4])] });
both('idea_037', { events: [TS(false), { type: 'DRAW', kind: 'm1', source: 'live', lastLive: true }, TS(true, [3])] }, { events: [TS(true, [2]), { type: 'DRAW', kind: 'm1', source: 'live', lastLive: true }, TS(true, [3])] });
const W3 = [{ type: 'WIN_RON', seat: 1 }, { type: 'WIN_TSUMO', seat: 2 }, { type: 'WIN_RON', seat: 3 }];
both('idea_025', { events: W3 }, { events: W3.slice(0, 2) });
both('idea_039', { events: [TS(false)].concat(W3) }, { events: [TS(true, [1])].concat(W3) });
ok(has('idea_039', view({ events: [TS(false)].concat(W3, [TS(true, [3])]) })), 'idea_039 tenpai after others won still counts');
{ const v = view({ owned: ['m1'], events: [] }); v.initialHandIds = ids(['z1', 'z2', 'z3', 'z4', 'z5']); ok(has('idea_048', v), 'idea_048 positive'); const v2 = view({ owned: ['z1'] }); v2.initialHandIds = ids(['z1', 'z2', 'z3', 'z4', 'z5']); ok(!has('idea_048', v2), 'idea_048 negative'); }
// furikomi via shared tile id
{ const v = view({ events: [D('m5'), { type: 'WIN_RON', seat: 1, sourceSeat: 0 }] }); v.events[1].tileId = v.events[0].tileId; ok(has('sp_furikomi', v), 'sp_furikomi positive'); ok(!has('sp_furikomi_master', v), 'master negative'); }

// coverage check
const nonStd = MJ2.DATA.roles.filter((r) => r.conditionId !== 'standard_yaku').map((r) => r.id);
const notCovered = nonStd.filter((id) => !covered.has(id));
ok(notCovered.length === 0, 'all non-standard roles covered by tests', notCovered);

// --- standard yaku (winner) ---
function win(kinds, winKind, o = {}) {
  const used = new Set();
  const melds = (o.melds || []).map((md, i) => ({ id: 'M' + i, type: md[0], tileIds: ids(md[1], used), calledTileId: null }));
  for (const md of melds) if (md.type !== 'ankan') md.calledTileId = md.tileIds[0];
  const concealedIds = ids(kinds, used);
  const winTileId = concealedIds[kinds.lastIndexOf(winKind)];
  const info = Object.assign({ concealedIds, melds, winTileId, winType: o.tsumo ? 'tsumo' : 'ron', seatWind: o.seatWind ?? 1, roundWind: o.roundWind ?? 0, dealer: !!o.dealer, riichi: o.riichi || null, ippatsu: false }, o.flags || {});
  return Yaku.evaluateWinStandard(info, 0);
}
const yids = (r) => r.awards.map((a) => a.roleId).sort();
const stdCovered = new Set();
function expectYaku(res, list, name) { list.forEach((y) => stdCovered.add(y)); const got = yids(res); ok(list.every((y) => got.includes(y)), name, got); }
expectYaku(win(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'm7', 'm8', 'm9', 'z1', 'z1'], 'm9'), ['std_sanshoku_doujun', 'std_chanta'], 'sanshoku+chanta');
expectYaku(win(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p1', 'p1', 'p1', 's9', 's9'], 's9'), ['std_ittsuu'], 'ittsuu');
expectYaku(win(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'm9', 'm9', 'm9', 'p9', 'p9'], 'p9'), ['std_junchan', 'std_sanshoku_doujun'], 'junchan');
expectYaku(win(['m1', 'm1', 'm1', 'p9', 'p9', 'p9', 'z1', 'z1', 'z1', 'z5', 'z5', 'z5', 's9', 's9'], 's9', { tsumo: true }), ['std_suuankou'], 'suuankou tsumo');
ok(!yids(win(['m1', 'm1', 'm1', 'p9', 'p9', 'p9', 'z1', 'z1', 'z1', 'z5', 'z5', 's9', 's9', 'z5'], 'z5')).includes('std_suuankou'), 'shanpon ron is not suuankou');
expectYaku(win(['m1', 'm1', 'm1', 'p9', 'p9', 'p9', 'z2', 'z2', 'z2', 's2', 's3', 's4', 's9', 's9'], 's4'), ['std_sanankou'], 'sanankou');
expectYaku(win(['m2', 'm2', 'p2', 'p2', 's2', 's2', 'm5', 'm6', 'm7', 'z1', 'z1', 'm2', 'p2', 's2'], 's2', { tsumo: true }), ['std_sanshoku_doukou', 'std_sanankou'], 'sanshoku doukou');
expectYaku(win(['z5', 'z5', 'z5', 'z6', 'z6', 'z6', 'z7', 'z7', 'm1', 'm2', 'm3', 'p4', 'p5', 'p6'], 'p6'), ['std_shousangen', 'std_haku', 'std_hatsu'], 'shousangen');
expectYaku(win(['m1', 'm1', 'm9', 'm9', 'p1', 'p1', 'z1', 'z1', 'z2', 'z2', 'z5', 'z5', 's9', 's9'], 's9'), ['std_chiitoitsu', 'std_honroutou'], 'chiitoi honroutou');
expectYaku(win(['m1', 'm1', 'm2', 'm2', 'm3', 'm3', 'm4', 'm4', 'm5', 'm5', 'm6', 'm6', 'm9', 'm9'], 'm9'), ['std_chinitsu'], 'chinitsu');
ok(!yids(win(['m1', 'm1', 'm2', 'm2', 'm3', 'm3', 'm4', 'm4', 'm5', 'm5', 'm6', 'm6', 'm9', 'm9'], 'm9')).includes('std_honitsu'), 'chinitsu excludes honitsu');
expectYaku(win(['m2', 'm3', 'm4', 'm2', 'm3', 'm4', 'p6', 'p7', 'p8', 'p6', 'p7', 'p8', 's5', 's5'], 's5'), ['std_ryanpeikou'], 'ryanpeikou');
expectYaku(win(['m2', 'm3', 'm4', 'm2', 'm3', 'm4', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5', 's5'], 's4'), ['std_iipeikou', 'std_pinfu', 'std_tanyao'], 'iipeikou pinfu tanyao');
expectYaku(win(['z1', 'z1', 'z1', 'z2', 'z2', 'z2', 'z3', 'z3', 'z3', 'z4', 'z4', 'm1', 'm1', 'm1'], 'm1'), ['std_shousuushii'], 'shousuushii');
expectYaku(win(['z1', 'z1', 'z1', 'z2', 'z2', 'z2', 'z3', 'z3', 'z3', 'z4', 'z4', 'z4', 'm1', 'm1'], 'm1'), ['std_daisuushii'], 'daisuushii');
expectYaku(win(['z5', 'z5', 'z5', 'z6', 'z6', 'z6', 'z7', 'z7', 'z7', 'm1', 'm1', 'm2', 'm3', 'm4'], 'm4'), ['std_daisangen'], 'daisangen');
expectYaku(win(['z1', 'z1', 'z1', 'z2', 'z2', 'z2', 'z5', 'z5', 'z5', 'z7', 'z7', 'z7', 'z3', 'z3'], 'z3'), ['std_tsuuiisou'], 'tsuuiisou');
expectYaku(win(['m1', 'm1', 'm1', 'm9', 'm9', 'm9', 'p1', 'p1', 'p1', 's9', 's9', 's9', 'p9', 'p9'], 'p9'), ['std_chinroutou'], 'chinroutou');
expectYaku(win(['s2', 's3', 's4', 's2', 's3', 's4', 's6', 's6', 's6', 'z6', 'z6', 'z6', 's8', 's8'], 's8'), ['std_ryuuiisou'], 'ryuuiisou');
expectYaku(win(['m1', 'm1', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm9', 'm9', 'm5'], 'm5'), ['std_chuuren'], 'chuuren');
expectYaku(win(['m1', 'm9', 'p1', 'p9', 's1', 's9', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z7'], 'z7'), ['std_kokushi'], 'kokushi');
expectYaku(win(['m2', 'm3', 'm4', 's6', 's7', 's8', 'p5', 'p5'], 'p5', { melds: [['minkan', ['z5', 'z5', 'z5', 'z5']], ['ankan', ['m9', 'm9', 'm9', 'm9']]] }), ['std_haku'], 'kan meld');
expectYaku(win(['p5', 'p5'], 'p5', { melds: [['minkan', ['z5', 'z5', 'z5', 'z5']], ['ankan', ['m9', 'm9', 'm9', 'm9']], ['minkan', ['s1', 's1', 's1', 's1']], ['pon', ['p2', 'p2', 'p2']]] }), ['std_sankantsu', 'std_toitoi'], 'sankantsu toitoi');
expectYaku(win(['p5', 'p5'], 'p5', { tsumo: true, melds: [['minkan', ['z5', 'z5', 'z5', 'z5']], ['ankan', ['m9', 'm9', 'm9', 'm9']], ['minkan', ['s1', 's1', 's1', 's1']], ['minkan', ['p2', 'p2', 'p2', 'p2']]] }), ['std_suukantsu'], 'suukantsu');
expectYaku(win(['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5', 's6', 's7', 'p5', 'p5'], 's7', { tsumo: true, riichi: { eventId: 'x', double: true }, flags: { ippatsu: true, rinshan: false, haitei: true, winEventId: 'w' } }), ['std_double_riichi', 'std_ippatsu', 'std_menzen_tsumo', 'std_haitei', 'std_pinfu', 'std_tanyao'], 'situational tsumo');
expectYaku(win(['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5', 's6', 's7', 'p5', 'p5'], 's7', { riichi: { eventId: 'x' }, flags: { houtei: true, chankan: true } }), ['std_riichi', 'std_houtei', 'std_chankan'], 'situational ron');
expectYaku(win(['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5', 's6', 's7', 'p5', 'p5'], 's7', { tsumo: true, flags: { rinshan: true } }), ['std_rinshan'], 'rinshan');
expectYaku(win(['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5', 's6', 's7', 'p5', 'p5'], 's7', { tsumo: true, dealer: true, flags: { firstDraw: true } }), ['std_tenhou'], 'tenhou');
expectYaku(win(['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 's2', 's3', 's4', 's5', 's6', 's7', 'p5', 'p5'], 's7', { tsumo: true, dealer: false, flags: { firstDraw: true } }), ['std_chiihou'], 'chiihou');
expectYaku(win(['z1', 'z1', 'z1', 'z2', 'z2', 'z2', 'm1', 'm2', 'm3', 'm5', 'm6', 'm7', 'm9', 'm9'], 'm9', { seatWind: 1, roundWind: 0 }), ['std_seat_wind', 'std_round_wind', 'std_honitsu'], 'winds honitsu');
expectYaku(win(['z6', 'z6', 'z6', 'z7', 'z7', 'z7', 'm1', 'm2', 'm3', 'm5', 'm6', 'm7', 'm9', 'm9'], 'm9'), ['std_hatsu', 'std_chun'], 'hatsu chun');
{ // dealer points / yakuman points
  const r = win(['z5', 'z5', 'z5', 'z6', 'z6', 'z6', 'z7', 'z7', 'z7', 'm1', 'm1', 'm2', 'm3', 'm4'], 'm4', { dealer: true });
  ok(r.points === 48000, 'dealer yakuman 48000', r.points);
}
const allStd = MJ2.DATA.roles.filter((r) => r.conditionId === 'standard_yaku').map((r) => r.id);
const stdMiss = allStd.filter((id) => !stdCovered.has(id));
ok(stdMiss.length === 0, 'all standard yaku exercised (winner)', stdMiss);

// --- standard yaku (non-winner, MJ2 補完) ---
function nonwin(kinds, melds) {
  const used = new Set();
  const md = (melds || []).map((x, i) => ({ id: 'N' + i, type: x[0], tileIds: ids(x[1], used), fromSeat: 1, calledTileId: null }));
  const hand = ids(kinds, used);
  const m = { round: { roundWind: 0, dealer: 0, players: [{ seat: 0, hand, melds: md, riichi: null }] } };
  return MJ2.Yaku.evaluateNonWinStandard(m, 0).map((a) => a.roleId).sort();
}
const nw = (kinds, melds, want, name) => { const got = nonwin(kinds, melds); ok(want.every((w) => got.includes(w)), 'nonwin ' + name, got); return got; };
nw(['m2', 'm2', 'm2', 'p5', 'p5', 'p5', 's7', 's7', 's7', 'm4', 'm4', 'm4', 'z1'], [], ['std_toitoi', 'std_sanankou'], 'toitoi single wait');
nw(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z3', 'z4', 'z5'], [], ['std_sanshoku_doujun'], 'sanshoku');
ok(!nonwin(['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'z1', 'z3', 'z4', 'z5']).includes('std_chanta'), 'nonwin chanta needs 4 sets + single');
nw(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p2', 'p4', 's6', 'z1'], [], ['std_ittsuu'], 'ittsuu');
nw(['m2', 'm3', 'm4', 'm2', 'm3', 'm4', 'p6', 'p7', 'p8', 'p6', 'p7', 'p8', 's5'], [], ['std_ryanpeikou', 'std_tanyao'], 'ryanpeikou');
ok(!nonwin(['m2', 'm3', 'm4', 'm2', 'm3', 'm4', 'p6', 'p7', 'p8', 'p6', 'p7', 'p8', 's5']).includes('std_iipeikou'), 'nonwin ryanpeikou excludes iipeikou');
ok(!nonwin(['m2', 'm3', 'm4', 'm2', 'm3', 'm4', 's5', 'p6', 'p7'], [['chi', ['s1', 's2', 's3']]]).includes('std_iipeikou'), 'nonwin iipeikou needs menzen');
nw(['z5', 'z5', 'z5', 'z6', 'z6', 'z6', 'z7', 'z7', 'm1', 'm5', 'p3', 'p6', 's9'], [], ['std_shousangen', 'std_haku', 'std_hatsu'], 'shousangen');
nw(['m1', 'm1', 'm3', 'm5', 'm6', 'm8', 'm9', 'z1', 'z2', 'z2', 'm2', 'm4', 'm7'], [], ['std_honitsu'], 'honitsu');
const opn = nonwin(['m1', 'm3', 'm5', 'm6', 'm8', 'm9', 'm2', 'm4', 'm7', 'z2'], [['pon', ['z1', 'z1', 'z1']]]);
ok(opn.includes('std_honitsu') && opn.includes('std_round_wind') && opn.includes('std_seat_wind'), 'nonwin open honitsu + double east', opn);
nw(['m2', 'm2', 'm2', 'p2', 'p2', 'p2', 's2', 's2', 's2', 'm5', 'm6', 'p8', 's4'], [], ['std_sanshoku_doukou', 'std_sanankou', 'std_tanyao'], 'sanshoku doukou');
nw(['m5', 'p6'], [['minkan', ['z5', 'z5', 'z5', 'z5']], ['ankan', ['m9', 'm9', 'm9', 'm9']], ['minkan', ['s1', 's1', 's1', 's1']], ['pon', ['p2', 'p2', 'p2']]].map((x) => x), ['std_sankantsu', 'std_toitoi', 'std_haku'], 'sankantsu');
ok(!nonwin(['m1', 'm1', 'm9', 'm9', 'p1', 'p1', 'z1', 'z1', 'z2', 'z2', 'z5', 'z5', 's9']).includes('std_chiitoitsu'), 'nonwin 6 pairs is not chiitoi');
nw(['m1', 'm2', 'm3', 'p7', 'p8', 'p9', 's1', 's2', 's3', 's9', 's9', 's9', 'p1'], [], ['std_junchan'], 'junchan');

console.log('pass', pass, 'fail', fail);
if (fail) { console.log(failures.join('\n')); process.exit(1); }
