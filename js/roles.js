/* 麻雀2 RoleEvaluator: conditionId -> shared judge functions. Reads roles.json (conditionId + params).
   Each judge returns null (not awarded) or an evidence object {kind, tileInstanceIds?, meldIds?, eventIds?, targetSeats?, turns?}. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const T = MJ2.T;

  const CALL_EV = { CHI: 'chi', PON: 'pon', MINKAN: 'minkan', ANKAN: 'ankan', KAKAN: 'kakan' };

  // ---------------- views ----------------
  function baseView(m, seat, events, ownedIds, concealedIds, melds, isWinner, winEvent) {
    const r = m.round, p = r.players[seat];
    const own = events.filter((e) => e.seat === seat);
    return {
      m, r, seat, p, isWinner, winEvent,
      events, own,
      ownedIds, concealedIds, melds,
      counts: T.countsOfIds(ownedIds),
      initialHandIds: p.initialHandIds,
      riichiEvent: own.find((e) => e.type === 'RIICHI_DECLARED') || null,
      endEvent: events.find((e) => e.type === 'ROUND_END') || null
    };
  }
  function finalView(m, seat) {
    const r = m.round, p = r.players[seat];
    if (p.winSnapshot) {
      const s = p.winSnapshot;
      const evs = r.events.filter((e) => e.seq <= s.eventSeq);
      const win = r.events.find((e) => e.id === s.eventId);
      const owned = s.handIds.concat(s.melds.flatMap((x) => x.tileIds));
      return baseView(m, seat, evs, owned, s.handIds.slice(), s.melds, true, win);
    }
    const owned = MJ2.Engine.ownedIds(p);
    return baseView(m, seat, r.events.slice(), owned, p.hand.slice(), p.melds, false, null);
  }
  function hypotheticalWinView(m, seat, ctx) {
    const r = m.round, p = r.players[seat];
    const win = { id: r.roundId + '#H', seq: r.seq + 1, type: ctx.winType === 'ron' ? 'WIN_RON' : 'WIN_TSUMO', seat, tileId: ctx.winTileId, kind: T.kindOfId(ctx.winTileId), sourceSeat: ctx.winType === 'ron' ? ctx.fromSeat : seat, hypothetical: true };
    const evs = r.events.concat([win]);
    const owned = ctx.handIds.concat(p.melds.flatMap((x) => x.tileIds));
    return baseView(m, seat, evs, owned, ctx.handIds.slice(), p.melds, true, win);
  }

  // ---------------- shared helpers ----------------
  const ids = (v, pred) => v.ownedIds.filter((id) => pred(id >> 2));
  const kindIds = (v, k) => v.ownedIds.filter((id) => (id >> 2) === k);
  const numberIdx = (suit, n) => suit * 9 + n - 1;
  function callEvents(v, types) { return v.own.filter((e) => CALL_EV[e.type] && types.includes(CALL_EV[e.type])); }
  function ownDiscards(v) { return v.own.filter((e) => e.type === 'DISCARD' || e.type === 'CHANKAN_ROBBED'); }
  function calledOn(v, discardEv) { return v.events.find((e) => (e.type === 'CHI' || e.type === 'PON' || e.type === 'MINKAN') && e.discardEventId === discardEv.id) || null; }
  function ronsOn(v, discardEv) {
    // a physical tile is discarded at most once, so (source seat, tile id) identifies the deal-in
    return v.events.filter((e) => e.type === 'WIN_RON' && e.sourceSeat === v.seat && e.tileId === discardEv.tileId);
  }
  function tenpaiStates(v) { return v.own.filter((e) => e.type === 'TENPAI_STATE'); }
  function setKey(a) { return (a || []).slice().sort((x, y) => x - y).join(','); }
  function normalDraws(v) { return v.own.filter((e) => e.type === 'DRAW' && e.source === 'live'); }
  function evIds(list) { return list.map((e) => e.id); }

  // ---------------- judges ----------------
  const J = {};

  // 三七四孤（ミナシゴ）: 3・7・4・5 をそれぞれ刻子（4面子1雀頭）、または 3・7・4・5 の対子を含む七対子。
  // 萬子・筒子・索子は混在OK。各刻子・対子は同じ牌（同じ種類）でそろえる。副露の刻子・槓子も刻子として数える。
  J.numbers_triplets_or_pairs = (v, prm) => {
    const nums = prm.numbers || [3, 7, 4, 5];
    const c = v.counts;
    const best = (n, min) => { let k = -1; for (let su = 0; su < 3; su++) { const kk = numberIdx(su, n); if (c[kk] >= min && (k < 0 || c[kk] > c[k])) k = kk; } return k; };
    const trip = nums.map((n) => best(n, 3));
    if (trip.every((k) => k >= 0)) return { kind: 'tiles', tileInstanceIds: trip.flatMap((k) => kindIds(v, k).slice(0, 3)) };
    if (prm.allowPairs === false) return null; // 南無三: 刻子のみ
    if (v.melds && v.melds.length) return null;
    const pr = nums.map((n) => best(n, 2));
    if (!pr.every((k) => k >= 0)) return null;
    if (v.isWinner && !(MJ2.Hand.isChiitoi(c))) return null;
    return { kind: 'tiles', tileInstanceIds: pr.flatMap((k) => kindIds(v, k).slice(0, 2)) };
  };

  J.contains_same_suit_numbers = (v, prm) => {
    const need = {}; for (const n of prm.numbers) need[n] = (need[n] || 0) + 1;
    for (let su = 0; su < 3; su++) {
      let ok = true; const pick = [];
      for (const n in need) {
        const have = kindIds(v, numberIdx(su, +n));
        if (have.length < need[n]) { ok = false; break; }
        pick.push(...have.slice(0, need[n]));
      }
      if (ok) return { kind: 'tiles', tileInstanceIds: pick };
    }
    return null;
  };
  J.tile_min_counts = (v, prm) => {
    const pick = [];
    for (const k in prm.counts) {
      const have = kindIds(v, T.idx(k));
      if (have.length < prm.counts[k]) return null;
      pick.push(...have);
    }
    return { kind: 'tiles', tileInstanceIds: pick };
  };
  J.tile_exact_count = (v, prm) => {
    const have = kindIds(v, T.idx(prm.tile));
    return have.length === prm.count ? { kind: 'tiles', tileInstanceIds: have } : null;
  };
  J.tile_presence_absence = (v, prm) => {
    const pick = [];
    for (const k of prm.present) { const h = kindIds(v, T.idx(k)); if (!h.length) return null; pick.push(...h); }
    for (const k of prm.absent) if (kindIds(v, T.idx(k)).length) return null;
    return { kind: 'tiles', tileInstanceIds: pick };
  };
  J.all_numbers_parity = (v, prm) => {
    const nums = ids(v, (k) => k < 27);
    if (!nums.length) return null;
    if (prm.noHonors && ids(v, (k) => k >= 27).length) return null;
    const want = prm.parity === 'odd' ? 1 : 0;
    if (!nums.every((id) => T.iNum(id >> 2) % 2 === want)) return null;
    return { kind: 'whole_hand', tileInstanceIds: v.ownedIds.slice() };
  };
  J.numbers_absent = (v, prm) => {
    const nums = ids(v, (k) => k < 27);
    if (prm.requireNumberTile && !nums.length) return null;
    if (nums.some((id) => prm.numbers.includes(T.iNum(id >> 2)))) return null;
    return { kind: 'whole_hand', tileInstanceIds: v.ownedIds.slice() };
  };
  J.number_total = (v, prm) => {
    const h = ids(v, (k) => k < 27 && T.iNum(k) === prm.number);
    return h.length === prm.exact ? { kind: 'tiles', tileInstanceIds: h } : null;
  };
  J.number_pair_kinds = (v, prm) => {
    const pick = []; let n = 0;
    for (let su = 0; su < 3; su++) { const h = kindIds(v, numberIdx(su, prm.number)); if (h.length === 2) { n++; pick.push(...h); } }
    return n >= prm.min ? { kind: 'tiles', tileInstanceIds: pick } : null;
  };
  J.exact_pair_kinds = (v, prm) => {
    const pick = []; let n = 0;
    for (let k = 0; k < 34; k++) if (v.counts[k] === 2) { n++; pick.push(...kindIds(v, k)); }
    return n >= prm.min ? { kind: 'tiles', tileInstanceIds: pick } : null;
  };
  J.honor_total = (v, prm) => {
    const h = ids(v, (k) => k >= 27);
    return h.length === prm.exact ? { kind: 'tiles', tileInstanceIds: h } : null;
  };
  J.distinct_suit_counts = (v) => {
    const c = [0, 1, 2].map((su) => ids(v, (k) => k < 27 && Math.floor(k / 9) === su).length);
    if (c.some((x) => x < 1)) return null;
    if (c[0] === c[1] || c[1] === c[2] || c[0] === c[2]) return null;
    return { kind: 'whole_hand', tileInstanceIds: ids(v, (k) => k < 27) };
  };
  J.two_suits_one_singleton = (v) => {
    const c = [0, 1, 2].map((su) => ids(v, (k) => k < 27 && Math.floor(k / 9) === su));
    const present = c.filter((x) => x.length > 0);
    if (present.length !== 2) return null;
    const single = present.find((x) => x.length === 1);
    return single ? { kind: 'tiles', tileInstanceIds: single } : null;
  };
  J.two_honors_one_singleton = (v) => {
    const kinds = []; for (let k = 27; k < 34; k++) if (v.counts[k]) kinds.push(k);
    if (kinds.length !== 2) return null;
    const single = kinds.find((k) => v.counts[k] === 1);
    return single != null ? { kind: 'tiles', tileInstanceIds: kindIds(v, single) } : null;
  };
  J.same_number_all_twelve = (v) => {
    for (let n = 1; n <= 9; n++) {
      if ([0, 1, 2].every((su) => v.counts[numberIdx(su, n)] === 4)) return { kind: 'tiles', tileInstanceIds: ids(v, (k) => k < 27 && T.iNum(k) === n) };
    }
    return null;
  };
  J.jackpot_exact_set = (v) => {
    if (!v.isWinner || v.melds.length || v.concealedIds.length !== 14) return null;
    const c = T.countsOfIds(v.concealedIds);
    for (const k of v.r.jackpotTargets) if (c[k] !== 1) return null;
    return { kind: 'tiles', tileInstanceIds: v.concealedIds.slice(), eventIds: v.winEvent ? [v.winEvent.id] : [] };
  };

  // --- calls ---
  J.call_count = (v, prm) => {
    const ev = callEvents(v, prm.types);
    const n = ev.length;
    if (prm.exact != null ? n !== prm.exact : n < prm.min) return null;
    return { kind: 'events', eventIds: evIds(ev), meldIds: ev.map((e) => e.meldId) };
  };
  J.call_and_no_win = (v, prm) => {
    if (v.isWinner) return null;
    const ev = callEvents(v, prm.types);
    return ev.length >= prm.min ? { kind: 'events', eventIds: evIds(ev), meldIds: ev.map((e) => e.meldId) } : null;
  };
  J.only_chi = (v, prm) => {
    const chi = callEvents(v, ['chi']);
    if (chi.length < prm.min) return null;
    if (callEvents(v, ['pon', 'minkan', 'ankan', 'kakan']).length) return null;
    return { kind: 'events', eventIds: evIds(chi), meldIds: chi.map((e) => e.meldId) };
  };
  J.pon_before_first_discard = (v) => {
    const pon = v.own.find((e) => e.type === 'PON');
    if (!pon) return null;
    const firstDisc = v.own.find((e) => e.type === 'DISCARD');
    if (firstDisc && firstDisc.seq < pon.seq) return null;
    return { kind: 'events', eventIds: [pon.id], meldIds: [pon.meldId] };
  };
  J.pon_distinct_sources = (v, prm) => {
    const pons = v.own.filter((e) => e.type === 'PON');
    const src = new Set(pons.map((e) => e.fromSeat));
    return src.size >= prm.min ? { kind: 'events', eventIds: evIds(pons), targetSeats: [...src], meldIds: pons.map((e) => e.meldId) } : null;
  };
  J.pon_same_source = (v, prm) => {
    const pons = v.own.filter((e) => e.type === 'PON');
    for (let s = 0; s < 4; s++) {
      const f = pons.filter((e) => e.fromSeat === s);
      if (f.length >= prm.min) return { kind: 'events', eventIds: evIds(f), targetSeats: [s], meldIds: f.map((e) => e.meldId) };
    }
    return null;
  };
  J.first_caller = (v) => {
    const first = v.events.find((e) => e.type === 'CHI' || e.type === 'PON' || e.type === 'MINKAN');
    return first && first.seat === v.seat ? { kind: 'events', eventIds: [first.id], meldIds: [first.meldId] } : null;
  };
  J.distinct_call_recipients = (v, prm) => {
    const calls = [];
    for (const d of ownDiscards(v)) { const c = calledOn(v, d); if (c) calls.push(c); }
    const who = new Set(calls.map((e) => e.seat));
    return who.size >= prm.min ? { kind: 'targets', targetSeats: [...who], eventIds: evIds(calls) } : null;
  };
  J.consecutive_discards_called = (v, prm) => {
    let run = [];
    for (const d of ownDiscards(v)) {
      const c = calledOn(v, d);
      if (c && prm.types.includes(CALL_EV[c.type])) { run.push(d, c); if (run.length / 2 >= prm.count) return { kind: 'timeline', eventIds: evIds(run) }; }
      else run = [];
    }
    return null;
  };
  J.ron_after_pon_from_same = (v) => {
    const own = v.own;
    for (let i = 0; i < own.length; i++) {
      const e = own[i];
      if (e.type !== 'PON') continue;
      const d = own.slice(i + 1).find((x) => x.type === 'DISCARD');
      if (!d) continue;
      const rons = ronsOn(v, d).filter((w) => w.seat === e.fromSeat);
      if (rons.length) return { kind: 'events', eventIds: [e.id, d.id, rons[0].id], targetSeats: [e.fromSeat], tileInstanceIds: [d.tileId] };
    }
    return null;
  };
  J.distinct_ron_recipients = (v, prm) => {
    const wins = [];
    for (const d of ownDiscards(v)) wins.push(...ronsOn(v, d));
    const who = [...new Set(wins.map((w) => w.seat))];
    if (who.length < prm.min) return null;
    return { kind: 'targets', targetSeats: who, eventIds: evIds(wins), tileInstanceIds: [...new Set(wins.map((w) => w.tileId))] };
  };

  // --- discards ---
  J.discard_contains = (v, prm) => {
    const ds = ownDiscards(v); const pick = [];
    for (const k of prm.tiles) { const d = ds.find((e) => e.kind === k); if (!d) return null; pick.push(d); }
    return { kind: 'events', eventIds: evIds(pick), tileInstanceIds: pick.map((e) => e.tileId) };
  };
  J.discard_suits_all = (v) => {
    const ds = ownDiscards(v); const pick = [];
    for (const su of ['m', 'p', 's']) { const d = ds.find((e) => e.kind[0] === su); if (!d) return null; pick.push(d); }
    return { kind: 'events', eventIds: evIds(pick), tileInstanceIds: pick.map((e) => e.tileId) };
  };
  J.discard_same_suit_number_counts = (v, prm) => {
    const ds = ownDiscards(v);
    for (const su of ['m', 'p', 's']) {
      const pick = []; let ok = true;
      for (const n in prm.counts) { const f = ds.filter((e) => e.kind === su + n); if (f.length < prm.counts[n]) { ok = false; break; } pick.push(...f.slice(0, prm.counts[n])); }
      if (ok) return { kind: 'events', eventIds: evIds(pick), tileInstanceIds: pick.map((e) => e.tileId) };
    }
    return null;
  };
  J.first_discard = (v, prm) => {
    const d = v.own.find((e) => e.type === 'DISCARD');
    if (!d) return null;
    const k = d.kind;
    const fromInit = v.initialHandIds.includes(d.tileId);
    if (prm.fromInitialHand && !fromInit) return null;
    if (prm.honor && !T.isHonor(k)) return null;
    if (prm.initialTileCountMin) {
      if (!fromInit) return null;
      const c = v.initialHandIds.filter((id) => (id >> 2) === (d.tileId >> 2)).length;
      if (c < prm.initialTileCountMin) return null;
    }
    if (prm.number != null && (T.isHonor(k) || T.num(k) !== prm.number)) return null;
    return { kind: 'events', eventIds: [d.id], tileInstanceIds: [d.tileId] };
  };

  // --- timelines on own normal draws ---
  J.repeat_last_discard_draw = (v, prm) => {
    let lastDisc = null, streak = 0, streakKind = null, chain = [], best = null;
    for (const e of v.own) {
      if (e.type === 'DISCARD') {
        if (streak > 0 && e.kind !== streakKind) { streak = 0; chain = []; }
        lastDisc = e;
        if (streak > 0) chain.push(e);
      } else if (e.type === 'DRAW' && e.source === 'live') {
        if (lastDisc && e.kind === lastDisc.kind) {
          if (streak > 0 && streakKind === e.kind) { streak++; chain.push(e); }
          else { streak = 1; streakKind = e.kind; chain = [lastDisc, e]; }
          if (streak >= prm.consecutive && !best) best = chain.slice();
        } else { streak = 0; chain = []; }
      }
    }
    return best ? { kind: 'timeline', eventIds: evIds(best), tileInstanceIds: best.map((e) => e.tileId) } : null;
  };
  J.adjacent_discard_draw_streak = (v, prm) => {
    let lastDisc = null, streak = 0, chain = [];
    for (const e of v.own) {
      if (e.type === 'DISCARD') lastDisc = e;
      else if (e.type === 'DRAW' && e.source === 'live') {
        if (lastDisc) {
          const a = lastDisc.kind, b = e.kind;
          const hit = T.isNumber(a) && T.isNumber(b) && a[0] === b[0] && Math.abs(T.num(a) - T.num(b)) === 1;
          if (hit) { streak++; chain.push(lastDisc, e); if (streak >= prm.count) return { kind: 'timeline', eventIds: evIds(chain), tileInstanceIds: chain.map((x) => x.tileId) }; }
          else { streak = 0; chain = []; }
        }
        lastDisc = null;
      }
    }
    return null;
  };
  J.all_draws_tsumogiri_no_win = (v, prm) => {
    if (v.isWinner) return null;
    const draws = normalDraws(v);
    if (draws.length < prm.minDraws) return null;
    for (const d of draws) {
      const next = v.own.find((e) => e.seq > d.seq && (e.type === 'DISCARD' || e.type === 'ANKAN' || e.type === 'KAKAN_DECLARE' || e.type === 'DRAW'));
      if (!next || next.type !== 'DISCARD' || next.tileId !== d.tileId) return null;
    }
    return { kind: 'timeline', eventIds: evIds(draws) };
  };
  J.draw_after_riichi_discard_same = (v) => {
    const rd = v.riichiEvent;
    if (!rd) return null;
    const next = v.own.find((e) => e.type === 'DRAW' && e.seq > rd.seq);
    return next && next.kind === rd.kind ? { kind: 'timeline', eventIds: [rd.id, next.id], tileInstanceIds: [rd.tileId, next.tileId] } : null;
  };
  J.riichi_last_live_draw = (v) => {
    const rd = v.riichiEvent;
    if (!rd) return null;
    const draw = v.own.filter((e) => e.type === 'DRAW' && e.seq < rd.seq).pop();
    return draw && draw.source === 'live' && draw.lastLive ? { kind: 'events', eventIds: [draw.id, rd.id] } : null;
  };
  J.riichi_no_later_draw = (v) => {
    const rd = v.riichiEvent;
    if (!rd) return null;
    if (!v.isWinner && !v.endEvent) return null;
    if (v.own.some((e) => e.type === 'DRAW' && e.seq > rd.seq)) return null;
    return { kind: 'events', eventIds: [rd.id] };
  };
  J.no_call_no_riichi = (v) => {
    if (!v.isWinner && !v.endEvent) return null;
    if (v.riichiEvent) return null;
    if (callEvents(v, ['chi', 'pon', 'minkan', 'kakan']).length) return null;
    return { kind: 'state', eventIds: [] };
  };

  // --- ron / tsumo declines ---
  J.decline_ron_no_win = (v) => {
    if (v.isWinner) return null;
    const d = v.own.filter((e) => e.type === 'DECLINE_RON');
    return d.length ? { kind: 'events', eventIds: evIds(d), tileInstanceIds: d.map((e) => e.tileId) } : null;
  };
  J.decline_ron_then_same_tsumo = (v) => {
    if (!v.isWinner || !v.winEvent || v.winEvent.type !== 'WIN_TSUMO') return null;
    const d = v.own.find((e) => e.type === 'DECLINE_RON' && e.kind === v.winEvent.kind && e.seq < v.winEvent.seq);
    return d ? { kind: 'timeline', eventIds: [d.id, v.winEvent.id], tileInstanceIds: [d.tileId, v.winEvent.tileId] } : null;
  };
  J.decline_tsumo_then_ron = (v) => {
    if (!v.isWinner || !v.winEvent || v.winEvent.type !== 'WIN_RON') return null;
    const d = v.own.find((e) => e.type === 'DECLINE_TSUMO' && e.seq < v.winEvent.seq);
    return d ? { kind: 'timeline', eventIds: [d.id, v.winEvent.id], tileInstanceIds: [d.tileId, v.winEvent.tileId] } : null;
  };

  // --- tenpai states ---
  J.ever_noten = (v) => {
    const n = tenpaiStates(v).filter((e) => !e.tenpai);
    return n.length ? { kind: 'state', eventIds: evIds(n), turns: n.map((e) => e.boundary === 'deal' ? 0 : (e.discardNo || 0)) } : null;
  };
  J.wait_set_changes = (v, prm) => {
    const st = tenpaiStates(v);
    let prev = null, n = 0; const ch = [];
    for (const e of st) {
      if (prev && prev.tenpai && e.tenpai && setKey(prev.waitSetAfter) !== setKey(e.waitSetAfter)) { n++; ch.push(e); }
      prev = e;
    }
    return n >= prm.min ? { kind: 'state', eventIds: evIds(ch) } : null;
  };
  J.return_to_first_wait_set = (v) => {
    const st = tenpaiStates(v);
    const i0 = st.findIndex((e) => e.tenpai);
    if (i0 < 0) return null;
    const first = setKey(st[i0].waitSetAfter);
    let changed = false; const used = [st[i0]];
    for (let i = i0 + 1; i < st.length; i++) {
      const e = st[i];
      if (!e.tenpai) return null;
      const k = setKey(e.waitSetAfter);
      if (k !== first) { if (!changed) used.push(e); changed = true; }
      else if (changed) { used.push(e); return { kind: 'state', eventIds: evIds(used) }; }
    }
    return null;
  };
  J.first_tenpai_last_live_draw = (v) => {
    const lastDraw = v.own.find((e) => e.type === 'DRAW' && e.lastLive);
    if (!lastDraw) return null;
    const before = tenpaiStates(v).filter((e) => e.seq < lastDraw.seq);
    if (before.some((e) => e.tenpai)) return null;
    if (v.isWinner && v.winEvent && v.winEvent.type === 'WIN_TSUMO' && v.winEvent.tileId === lastDraw.tileId) return { kind: 'events', eventIds: [lastDraw.id, v.winEvent.id] };
    const after = tenpaiStates(v).find((e) => e.seq > lastDraw.seq);
    return after && after.tenpai ? { kind: 'events', eventIds: [lastDraw.id, after.id] } : null;
  };
  function othersAllWonSeq(v) {
    const wins = v.events.filter((e) => (e.type === 'WIN_RON' || e.type === 'WIN_TSUMO') && e.seat !== v.seat && !e.hypothetical);
    const seats = new Set(wins.map((e) => e.seat));
    if (seats.size < 3) return null;
    return wins[wins.length - 1];
  }
  J.last_nonwinner = (v) => {
    if (v.isWinner) return null;
    const last = othersAllWonSeq(v);
    return last ? { kind: 'targets', targetSeats: [0, 1, 2, 3].filter((s) => s !== v.seat) } : null;
  };
  J.never_tenpai_last_nonwinner = (v) => {
    if (v.isWinner) return null;
    const last = othersAllWonSeq(v);
    if (!last) return null;
    if (tenpaiStates(v).some((e) => e.seq <= last.seq && e.tenpai)) return null;
    return { kind: 'state', targetSeats: [0, 1, 2, 3].filter((s) => s !== v.seat) };
  };
  J.remove_initial_honors = (v, prm) => {
    const init = v.initialHandIds.filter((id) => (id >> 2) >= 27);
    if (init.length < prm.minInitialHonors) return null;
    if (ids(v, (k) => k >= 27).length) return null;
    return { kind: 'tiles', tileInstanceIds: init, note: 'initial' };
  };

  J.standard_yaku = () => null; // handled by MJ2.Yaku (decomposition-aware)

  // ---------------- evaluator ----------------
  function rolesList() { return MJ2.DATA.roles; }
  function scopeOk(role, isWinner) {
    if (role.scope === 'win_only') return isWinner;
    if (role.scope === 'nonwin_only') return !isWinner;
    return true;
  }
  // returns { awards:[RoleAward], han, yakuman, jackpot, fixed, minor }
  // 子役（class=minor／表示分類 小役・子役）: 個別点なし。排他解決後の件数4個ごとに1翻、最大4翻（minor_bundle_v1）
  function isMinorRole(role) { return !!role && (role.class === 'minor' || role.displayCategory === '小役' || role.displayCategory === '子役'); }
  function minorCountToHan(n) {
    const ms = (MJ2.DATA.config && MJ2.DATA.config.minorScoring) || { groupSize: 4, maxHan: 4 };
    return Math.min(ms.maxHan ?? 4, Math.floor(n / (ms.groupSize || 4)));
  }
  function evaluateRoles(m, seat, view, opts) {
    opts = opts || {};
    const awards = [];
    for (const role of rolesList()) {
      if (role.conditionId === 'standard_yaku') continue;
      if (!scopeOk(role, view.isWinner)) continue;
      // legality: han roles, yakuman, jackpot, and 子役 (bundle can be the winning yaku)
      if (opts.forLegality && !(role.class === 'han' || role.class === 'yakuman' || role.id === 'sp_jackpot' || isMinorRole(role))) continue;
      const fn = J[role.conditionId];
      if (!fn) continue;
      const ev = fn(view, role.params || {}, role);
      if (!ev) continue;
      const a = { roleId: role.id, evidence: ev, sourceSnapshotId: view.winEvent ? view.winEvent.id : 'final:' + seat };
      if (isMinorRole(role)) { a.minor = true; a.minorPoints = 0; }
      else if (role.class === 'han') a.han = role.value;
      else if (role.class === 'fixed') a.fixedPoints = role.value;
      else if (role.class === 'yakuman') a.yakuman = 1;
      awards.push(a);
    }
    const resolved = resolveExclusive(awards);
    const out = { awards: resolved, han: 0, yakuman: 0, jackpot: false, fixed: 0, minor: 0, minorCount: 0, minorBundleHan: 0 };
    const minorIds = new Set();
    for (const a of resolved) {
      if (a.roleId === 'sp_jackpot') out.jackpot = true;
      else if (a.minor) minorIds.add(a.roleId);
      else if (a.han) out.han += a.han;
      else if (a.yakuman) out.yakuman += 1;
      else if (a.fixedPoints) out.fixed += a.fixedPoints;
    }
    out.minorCount = minorIds.size;
    out.minorBundleHan = minorCountToHan(out.minorCount);
    out.han += out.minorBundleHan;
    return out;
  }
  // priority table per exclusiveGroup (roles.json exclusivePriority), highest wins
  function resolveExclusive(awards) {
    const best = {};
    for (const a of awards) {
      const r = MJ2.DATA.roleById[a.roleId];
      if (!r.exclusiveGroup) continue;
      const cur = best[r.exclusiveGroup];
      if (!cur || MJ2.DATA.roleById[cur.roleId].exclusivePriority < r.exclusivePriority) best[r.exclusiveGroup] = a;
    }
    return awards.filter((a) => { const r = MJ2.DATA.roleById[a.roleId]; return !r.exclusiveGroup || best[r.exclusiveGroup] === a; });
  }

  function featureYakumanNear(own) {
    const names = [];
    const r777 = MJ2.DATA.roleById.sp_777;
    const sevens = [6, 15, 24].map((k) => own[k]);
    const missing777 = sevens.reduce((a, c) => a + Math.max(0, 3 - c), 0);
    if (missing777 === 1) names.push(r777.name);
    for (let n = 0; n < 9; n++) {
      const c = [n, 9 + n, 18 + n].map((k) => own[k]);
      if (c.reduce((a, b) => a + b, 0) === 11) { names.push(MJ2.DATA.roleById.sp_monopoly.name); break; }
    }
    return names;
  }

  function implementedConditionIds() { return Object.keys(J); }

  MJ2.Roles = { J, evaluateRoles, isMinorRole, minorCountToHan, resolveExclusive, finalView, hypotheticalWinView, baseView, featureYakumanNear, implementedConditionIds };
})(typeof window !== 'undefined' ? window : globalThis);
