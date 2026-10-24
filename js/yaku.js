/* 麻雀2 standard yaku (通常役) evaluation for winners (decomposition + fu) and non-winners (MJ2 補完規則). */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const T = MJ2.T, H = MJ2.Hand;

  const KUISAGARI = ['std_sanshoku_doujun', 'std_ittsuu', 'std_chanta', 'std_junchan', 'std_honitsu', 'std_chinitsu'];
  const GREEN = new Set([19, 20, 21, 23, 25, 32]); // s2 s3 s4 s6 s8 z6
  function roleVal(id) { return MJ2.DATA.roleById[id].value; }

  // ---------- id allocator ----------
  function makeAlloc(ids) {
    const byKind = {};
    for (const id of ids) (byKind[id >> 2] = byKind[id >> 2] || []).push(id);
    return {
      take(kind, n) { const arr = byKind[kind] || []; return arr.splice(0, n); },
      takeKinds(kinds) { const out = []; for (const k of kinds) { const a = byKind[k] || []; if (a.length) out.push(a.shift()); } return out; }
    };
  }
  function setKinds(s) { return s.t === 'seq' ? [s.i, s.i + 1, s.i + 2] : s.t === 'kan' ? [s.i, s.i, s.i, s.i] : s.t === 'pair' ? [s.i, s.i] : [s.i, s.i, s.i]; }
  function hasYaochu(s) { return setKinds(s).some((k) => T.iYaochu(k)); }

  function meldToSet(md) {
    const k = md.tileIds[0] >> 2;
    if (md.type === 'chi') { const ks = md.tileIds.map((x) => x >> 2).sort((a, b) => a - b); return { t: 'seq', i: ks[0], open: true, meld: md }; }
    if (md.type === 'pon') return { t: 'trip', i: k, open: true, meld: md };
    return { t: 'kan', i: k, open: md.type !== 'ankan', meld: md };
  }

  function yakuhaiKinds(seatWindIdx, roundWindIdx) {
    return { dragons: [31, 32, 33], seat: 27 + seatWindIdx, round: 27 + roundWindIdx };
  }

  // ---------- points ----------
  function basePoints(han, fu) {
    if (han >= 13) return 8000;
    if (han >= 11) return 6000;
    if (han >= 8) return 4000;
    if (han >= 6) return 3000;
    if (han >= 5) return 2000;
    const b = fu * Math.pow(2, han + 2);
    return Math.min(b, 2000);
  }
  function ronPoints(han, fu, dealer) {
    if (han <= 0) return 0;
    const b = basePoints(han, fu);
    return Math.ceil((b * (dealer ? 6 : 4)) / 100) * 100;
  }
  function yakumanPoints(dealer) { return dealer ? 48000 : 32000; }

  // ---------- winner evaluation ----------
  // info: {concealedIds(14-3k incl win tile), melds, winTileId, winType, seatWind, roundWind, dealer, riichi, ippatsu, rinshan, chankan, haitei, houtei, firstDraw}
  function evaluateWinStandard(info, extraHan) {
    extraHan = extraHan || 0;
    const counts = T.countsOfIds(info.concealedIds);
    const meldSets = info.melds.map(meldToSet);
    const menzen = info.melds.every((md) => md.type === 'ankan');
    const allIds = info.concealedIds.concat(info.melds.flatMap((x) => x.tileIds));
    const allCounts = T.countsOfIds(allIds);
    const winK = info.winTileId >> 2;
    const yh = yakuhaiKinds(info.seatWind, info.roundWind);
    const candidates = [];

    const commonSituational = () => {
      const ys = [];
      if (info.riichi) {
        if (info.riichi.double) ys.push({ id: 'std_double_riichi', ev: { kind: 'events', eventIds: [info.riichi.eventId] } });
        else ys.push({ id: 'std_riichi', ev: { kind: 'events', eventIds: [info.riichi.eventId] } });
        if (info.ippatsu) ys.push({ id: 'std_ippatsu', ev: { kind: 'events', eventIds: [info.riichi.eventId, info.winEventId] } });
      }
      if (menzen && info.winType === 'tsumo') ys.push({ id: 'std_menzen_tsumo', ev: { kind: 'events', eventIds: [info.winEventId], tileInstanceIds: [info.winTileId] } });
      if (info.rinshan) ys.push({ id: 'std_rinshan', ev: { kind: 'events', eventIds: [info.winEventId], tileInstanceIds: [info.winTileId] } });
      if (info.chankan) ys.push({ id: 'std_chankan', ev: { kind: 'events', eventIds: [info.winEventId], tileInstanceIds: [info.winTileId] } });
      if (info.haitei && info.winType === 'tsumo') ys.push({ id: 'std_haitei', ev: { kind: 'events', eventIds: [info.winEventId], tileInstanceIds: [info.winTileId] } });
      if (info.houtei && info.winType === 'ron') ys.push({ id: 'std_houtei', ev: { kind: 'events', eventIds: [info.winEventId], tileInstanceIds: [info.winTileId] } });
      return ys;
    };
    const wholeHand = { kind: 'whole_hand', tileInstanceIds: allIds.slice() };
    const colorYaku = (ys) => {
      const suits = new Set(); let honors = 0, nums = 0;
      for (let k = 0; k < 34; k++) if (allCounts[k]) { if (k >= 27) honors++; else { suits.add(Math.floor(k / 9)); nums++; } }
      if (suits.size === 1 && honors === 0) ys.push({ id: 'std_chinitsu', ev: wholeHand });
      else if (suits.size === 1 && honors > 0) ys.push({ id: 'std_honitsu', ev: wholeHand });
      if (allIds.every((id) => !T.iYaochu(id >> 2))) ys.push({ id: 'std_tanyao', ev: wholeHand });
      const allY = allIds.every((id) => T.iYaochu(id >> 2));
      const hasT = allIds.some((id) => (id >> 2) < 27), hasHn = allIds.some((id) => (id >> 2) >= 27);
      if (allY && hasT && hasHn) ys.push({ id: 'std_honroutou', ev: wholeHand });
    };
    const yakumanCommon = (ys) => {
      if (allIds.every((id) => (id >> 2) >= 27)) ys.push({ id: 'std_tsuuiisou', ev: wholeHand });
      if (allIds.every((id) => (id >> 2) < 27 && T.iYaochu(id >> 2))) ys.push({ id: 'std_chinroutou', ev: wholeHand });
      if (allIds.every((id) => GREEN.has(id >> 2))) ys.push({ id: 'std_ryuuiisou', ev: wholeHand });
      if (info.firstDraw && info.winType === 'tsumo') ys.push({ id: info.dealer ? 'std_tenhou' : 'std_chiihou', ev: { kind: 'events', eventIds: [info.winEventId], tileInstanceIds: [info.winTileId] } });
    };

    // --- kokushi ---
    if (menzen && info.melds.length === 0 && H.isKokushi(counts)) {
      const ys = [{ id: 'std_kokushi', ev: wholeHand }];
      yakumanCommon(ys);
      candidates.push(finish(ys, 0, true, 'kokushi'));
    }
    // --- chiitoitsu ---
    if (menzen && info.melds.length === 0 && H.isChiitoi(counts)) {
      const ys = commonSituational();
      ys.push({ id: 'std_chiitoitsu', ev: { kind: 'groups', tileInstanceIds: allIds.slice(), groups: groupsFromCounts(info.concealedIds) } });
      colorYaku(ys);
      const ym = []; yakumanCommon(ym);
      candidates.push(finish(ym.length ? ym : ys, 25, ym.length > 0, 'chiitoi'));
    }
    // --- standard decompositions ---
    for (const dec of H.decomposeComplete(counts)) {
      // possible positions of win tile
      const places = [];
      if (dec.head === winK) places.push({ where: 'pair' });
      dec.sets.forEach((s, idx) => { if (setKinds(s).includes(winK)) places.push({ where: 'set', idx }); });
      const seenPlace = new Set();
      for (const pl of places) {
        const key = pl.where + ':' + (pl.where === 'set' ? dec.sets[pl.idx].t + dec.sets[pl.idx].i + (dec.sets[pl.idx].t === 'seq' ? '@' + (winK - dec.sets[pl.idx].i) : '') : '');
        if (seenPlace.has(key)) continue;
        seenPlace.add(key);
        candidates.push(evalDecomp(dec, pl));
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];

    function groupsFromCounts(ids) {
      const a = makeAlloc(ids); const g = [];
      for (let k = 0; k < 34; k++) if (counts[k] === 2) g.push(a.take(k, 2));
      return g;
    }

    function evalDecomp(dec, pl) {
      const csets = dec.sets.map((s, idx) => ({ t: s.t, i: s.i, open: false, concealedSet: true, idx }));
      // ron on a triplet makes it open (minkou) for ankou/fu purposes
      let waitType = 'ryanmen';
      if (pl.where === 'pair') waitType = 'tanki';
      else {
        const s = csets[pl.idx];
        if (s.t === 'trip') { waitType = 'shanpon'; if (info.winType === 'ron') s.ronOpened = true; }
        else {
          const pos = winK - s.i;
          if (pos === 1) waitType = 'kanchan';
          else if ((pos === 2 && s.i % 9 === 0) || (pos === 0 && s.i % 9 === 6)) waitType = 'penchan';
          else waitType = 'ryanmen';
        }
      }
      const sets = csets.concat(meldSets);
      const ys = commonSituational();
      // assign instance ids to groups (for evidence)
      const alloc = makeAlloc(info.concealedIds);
      const headIds = alloc.take(dec.head, 2);
      for (const s of csets) s.ids = s.t === 'seq' ? alloc.takeKinds([s.i, s.i + 1, s.i + 2]) : alloc.take(s.i, 3);
      for (const s of meldSets) s.ids = s.meld.tileIds.slice();
      const grp = (arr) => ({ kind: 'groups', groups: arr.map((s) => s.ids), tileInstanceIds: arr.flatMap((s) => s.ids), meldIds: arr.filter((s) => s.meld).map((s) => s.meld.id) });

      const seqs = sets.filter((s) => s.t === 'seq');
      const trips = sets.filter((s) => s.t === 'trip' || s.t === 'kan');
      const kans = sets.filter((s) => s.t === 'kan');
      const closedTrips = trips.filter((s) => (s.concealedSet && !s.ronOpened) || (s.t === 'kan' && !s.open));
      const isYakuhaiPair = dec.head >= 31 || dec.head === yh.seat || dec.head === yh.round;

      // yakuman checks
      const ym = [];
      if (closedTrips.length === 4) ym.push({ id: 'std_suuankou', ev: grp(closedTrips) });
      const dragonTrips = trips.filter((s) => s.i >= 31);
      if (dragonTrips.length === 3) ym.push({ id: 'std_daisangen', ev: grp(dragonTrips) });
      const windTrips = trips.filter((s) => s.i >= 27 && s.i <= 30);
      if (windTrips.length === 4) ym.push({ id: 'std_daisuushii', ev: grp(windTrips) });
      else if (windTrips.length === 3 && dec.head >= 27 && dec.head <= 30) ym.push({ id: 'std_shousuushii', ev: grp(windTrips) });
      if (kans.length === 4) ym.push({ id: 'std_suukantsu', ev: grp(kans) });
      if (menzen && info.melds.length === 0) {
        // chuuren
        const suits = new Set(info.concealedIds.map((id) => ((id >> 2) < 27 ? Math.floor((id >> 2) / 9) : 9)));
        if (suits.size === 1 && !suits.has(9)) {
          const b = [...suits][0] * 9;
          const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
          if (need.every((n, j) => counts[b + j] >= n)) ym.push({ id: 'std_chuuren', ev: wholeHand });
        }
      }
      yakumanCommon(ym);
      if (ym.length) return finish(ym, 0, true, 'std');

      // pinfu
      const pinfu = menzen && seqs.length === 4 && !isYakuhaiPair && waitType === 'ryanmen';
      if (pinfu) ys.push({ id: 'std_pinfu', ev: grp(sets) });
      // peikou
      if (menzen) {
        const sk = {}; for (const s of csets.filter((x) => x.t === 'seq')) (sk[s.i] = sk[s.i] || []).push(s);
        const pairs = []; for (const k in sk) { const a = sk[k]; for (let j = 0; j + 1 < a.length; j += 2) pairs.push([a[j], a[j + 1]]); }
        if (pairs.length >= 2) ys.push({ id: 'std_ryanpeikou', ev: grp(pairs[0].concat(pairs[1])) });
        else if (pairs.length === 1) ys.push({ id: 'std_iipeikou', ev: grp(pairs[0]) });
      }
      // yakuhai
      for (const s of trips) {
        if (s.i === 31) ys.push({ id: 'std_haku', ev: grp([s]) });
        if (s.i === 32) ys.push({ id: 'std_hatsu', ev: grp([s]) });
        if (s.i === 33) ys.push({ id: 'std_chun', ev: grp([s]) });
        if (s.i === yh.seat) ys.push({ id: 'std_seat_wind', ev: grp([s]) });
        if (s.i === yh.round) ys.push({ id: 'std_round_wind', ev: grp([s]) });
      }
      // sanshoku doujun
      for (let n = 0; n < 7; n++) {
        const a = seqs.find((s) => s.i === n), b = seqs.find((s) => s.i === 9 + n), c = seqs.find((s) => s.i === 18 + n);
        if (a && b && c) { ys.push({ id: 'std_sanshoku_doujun', ev: grp([a, b, c]) }); break; }
      }
      // ittsuu
      for (let su = 0; su < 3; su++) {
        const a = seqs.find((s) => s.i === su * 9), b = seqs.find((s) => s.i === su * 9 + 3), c = seqs.find((s) => s.i === su * 9 + 6);
        if (a && b && c) { ys.push({ id: 'std_ittsuu', ev: grp([a, b, c]) }); break; }
      }
      // chanta / junchan
      const allSetsY = sets.every(hasYaochu) && T.iYaochu(dec.head);
      if (allSetsY && seqs.length > 0) {
        const anyHonor = sets.some((s) => s.i >= 27) || dec.head >= 27;
        ys.push({ id: anyHonor ? 'std_chanta' : 'std_junchan', ev: wholeHand });
      }
      if (trips.length === 4) ys.push({ id: 'std_toitoi', ev: grp(trips) });
      if (closedTrips.length === 3) ys.push({ id: 'std_sanankou', ev: grp(closedTrips) });
      if (kans.length === 3) ys.push({ id: 'std_sankantsu', ev: grp(kans) });
      for (let n = 0; n < 9; n++) {
        const a = trips.find((s) => s.i === n), b = trips.find((s) => s.i === 9 + n), c = trips.find((s) => s.i === 18 + n);
        if (a && b && c) { ys.push({ id: 'std_sanshoku_doukou', ev: grp([a, b, c]) }); break; }
      }
      if (dragonTrips.length === 2 && dec.head >= 31) {
        const pairSet = { t: 'pair', i: dec.head, ids: headIds };
        ys.push({ id: 'std_shousangen', ev: { kind: 'groups', groups: dragonTrips.map((s) => s.ids).concat([headIds]), tileInstanceIds: dragonTrips.flatMap((s) => s.ids).concat(headIds) } });
      }
      colorYaku(ys);

      // fu
      let fu = 20;
      if (pinfu) fu = info.winType === 'tsumo' ? 20 : 30;
      else {
        if (menzen && info.winType === 'ron') fu += 10;
        if (info.winType === 'tsumo') fu += 2;
        if (dec.head >= 31) fu += 2;
        if (dec.head === yh.seat) fu += 2;
        if (dec.head === yh.round) fu += 2;
        if (waitType === 'kanchan' || waitType === 'penchan' || waitType === 'tanki') fu += 2;
        for (const s of trips) {
          let f = 2;
          const closed = (s.concealedSet && !s.ronOpened) || (s.t === 'kan' && !s.open);
          if (closed) f *= 2;
          if (T.iYaochu(s.i)) f *= 2;
          if (s.t === 'kan') f *= 4;
          fu += f;
        }
        fu = Math.ceil(fu / 10) * 10;
        if (fu === 20 && !menzen) fu = 30;
      }
      return finish(ys, fu, false, 'std', { waitType });
    }

    function finish(ys, fu, isYakuman, shape, extra) {
      // exclusive standard groups inside a single candidate
      const ids = new Set(ys.map((y) => y.id));
      let list = ys.filter((y) => {
        if (y.id === 'std_riichi' && ids.has('std_double_riichi')) return false;
        if (y.id === 'std_iipeikou' && ids.has('std_ryanpeikou')) return false;
        if (y.id === 'std_honitsu' && ids.has('std_chinitsu')) return false;
        if (y.id === 'std_chanta' && ids.has('std_junchan')) return false;
        return true;
      });
      // dedupe
      const seen = new Set(); list = list.filter((y) => (seen.has(y.id) ? false : (seen.add(y.id), true)));
      let han = 0;
      const out = list.map((y) => {
        const r = MJ2.DATA.roleById[y.id];
        if (r.class === 'yakuman') return { roleId: y.id, yakuman: 1, evidence: y.ev };
        let h = r.value;
        if (!menzen && KUISAGARI.includes(y.id)) h -= 1;
        han += h;
        return { roleId: y.id, han: h, evidence: y.ev };
      }).filter((a) => a.yakuman || a.han > 0);
      const yakumanCount = out.filter((a) => a.yakuman).length;
      const totalHan = han + extraHan;
      const points = yakumanCount ? yakumanPoints(info.dealer) : ronPoints(totalHan, fu, info.dealer);
      return Object.assign({ awards: out, han, fu, yakumanCount, points, score: points * 1000 + han * 10 + fu / 100, shape }, extra || {});
    }
  }

  // ---------- context builders ----------
  function winInfoFromContext(m, seat, ctx, winEventId) {
    const r = m.round, p = r.players[seat];
    return {
      concealedIds: ctx.handIds.slice(),
      melds: ctx.melds || p.melds,
      winTileId: ctx.winTileId,
      winType: ctx.winType,
      seatWind: MJ2.Engine.seatWind(r, seat),
      roundWind: r.roundWind,
      dealer: seat === r.dealer,
      riichi: p.riichi,
      ippatsu: !!(p.riichi && p.riichi.ippatsu),
      rinshan: !!ctx.rinshan, chankan: !!ctx.chankan, haitei: !!ctx.haitei, houtei: !!ctx.houtei,
      firstDraw: !!ctx.firstDraw,
      winEventId: winEventId || null
    };
  }
  function winInfoFromSnapshot(m, seat) {
    const r = m.round, p = r.players[seat], s = p.winSnapshot;
    return {
      concealedIds: s.handIds.slice(), melds: s.melds, winTileId: s.winTileId, winType: s.winType,
      seatWind: MJ2.Engine.seatWind(r, seat), roundWind: r.roundWind, dealer: seat === r.dealer,
      riichi: p.riichi, ippatsu: s.ippatsu, rinshan: s.rinshan, chankan: s.chankan, haitei: s.haitei, houtei: s.houtei,
      firstDraw: s.firstDraw, winEventId: s.eventId
    };
  }

  // legality: shape already checked. Need >=1 han from yaku (std + new han roles), or yakuman, or jackpot
  function evaluateWinLegality(m, seat, ctx) {
    const r = m.round, p = r.players[seat];
    const view = MJ2.Roles.hypotheticalWinView(m, seat, ctx);
    const roleRes = MJ2.Roles.evaluateRoles(m, seat, view, { forLegality: true });
    if (roleRes.jackpot) return { legal: true, jackpot: true };
    const std = evaluateWinStandard(winInfoFromContext(m, seat, ctx), roleRes.han);
    const stdHan = std ? std.han : 0;
    const stdYm = std ? std.yakumanCount : 0;
    if (!std && !MJ2.Engine.isJackpotShape(r, p, ctx.handIds)) return { legal: false };
    // 子役まとめ（四子安〜十六子安）はドラと同じ加算翻: これだけでは和了できない（minorDoesNotEnableWin）
    const bundle = MJ2.DATA.config.minorDoesNotEnableWin ? (roleRes.minorBundleHan || 0) : 0;
    const legal = stdHan + roleRes.han - bundle > 0 || stdYm > 0 || roleRes.yakuman > 0;
    return { legal, han: stdHan + roleRes.han, yakuman: stdYm + roleRes.yakuman };
  }

  // names of standard yakuman reachable from current tenpai (for 役満リーチ)
  function yakumanNamesForWaits(m, seat, waits) {
    const r = m.round, p = r.players[seat];
    const names = new Set();
    const handSet = new Set(MJ2.Engine.ownedIds(p));
    for (const w of waits) {
      let fake = null;
      for (let j = 0; j < 4; j++) if (!handSet.has(w * 4 + j)) { fake = w * 4 + j; break; }
      if (fake == null) continue;
      const info = {
        concealedIds: p.hand.concat([fake]), melds: p.melds, winTileId: fake, winType: 'tsumo',
        seatWind: MJ2.Engine.seatWind(r, seat), roundWind: r.roundWind, dealer: seat === r.dealer,
        riichi: null, ippatsu: false
      };
      const res = evaluateWinStandard(info, 0);
      if (res && res.yakumanCount) for (const a of res.awards) if (a.yakuman) names.add(MJ2.DATA.roleById[a.roleId].name);
    }
    return [...names];
  }

  // ---------- non-winner standard evaluation (MJ2 補完) ----------
  function evaluateNonWinStandard(m, seat) {
    const r = m.round, p = r.players[seat];
    const awards = [];
    const conceal = p.hand.slice();
    const cc = T.countsOfIds(conceal);
    const meldSets = p.melds.map(meldToSet);
    for (const s of meldSets) s.ids = s.meld.tileIds.slice();
    const allIds = MJ2.Engine.ownedIds(p);
    const all = T.countsOfIds(allIds);
    const menzen = MJ2.Engine.isMenzen(p);
    const add = (id, ev) => {
      const role = MJ2.DATA.roleById[id];
      let h = role.value;
      if (!menzen && KUISAGARI.includes(id)) h -= 1;
      if (h > 0) awards.push({ roleId: id, han: h, evidence: ev });
    };
    const whole = { kind: 'whole_hand', tileInstanceIds: allIds.slice() };
    const idsOfKind = (k) => allIds.filter((id) => (id >> 2) === k);
    if (p.riichi) add(p.riichi.double ? 'std_double_riichi' : 'std_riichi', { kind: 'events', eventIds: [p.riichi.eventId] });
    // yakuhai
    const sw = 27 + MJ2.Engine.seatWind(r, seat), rw = 27 + r.roundWind;
    const yk = [[31, 'std_haku'], [32, 'std_hatsu'], [33, 'std_chun'], [sw, 'std_seat_wind'], [rw, 'std_round_wind']];
    for (const [k, id] of yk) if (all[k] >= 3) add(id, { kind: 'tiles', tileInstanceIds: idsOfKind(k) });
    // whole-hand types
    if (allIds.length && allIds.every((id) => !T.iYaochu(id >> 2))) add('std_tanyao', whole);
    const suits = new Set(); let honors = 0;
    for (let k = 0; k < 34; k++) if (all[k]) { if (k >= 27) honors++; else suits.add(Math.floor(k / 9)); }
    if (suits.size === 1 && honors === 0) add('std_chinitsu', whole);
    else if (suits.size === 1 && honors > 0) add('std_honitsu', whole);
    if (allIds.every((id) => T.iYaochu(id >> 2)) && allIds.some((id) => (id >> 2) < 27) && allIds.some((id) => (id >> 2) >= 27)) add('std_honroutou', whole);
    // sequences available: chi melds + concealed
    const chiSeqs = meldSets.filter((s) => s.t === 'seq');
    const seqAvail = (start) => {
      const md = chiSeqs.find((s) => s.i === start);
      if (md) return md.ids;
      if (cc[start] && cc[start + 1] && cc[start + 2]) return makeAlloc(conceal).takeKinds([start, start + 1, start + 2]);
      return null;
    };
    for (let n = 0; n < 7; n++) {
      const a = seqAvail(n), b = seqAvail(9 + n), c = seqAvail(18 + n);
      if (a && b && c) { add('std_sanshoku_doujun', { kind: 'groups', groups: [a, b, c], tileInstanceIds: a.concat(b, c) }); break; }
    }
    for (let su = 0; su < 3; su++) {
      const a = seqAvail(su * 9), b = seqAvail(su * 9 + 3), c = seqAvail(su * 9 + 6);
      if (a && b && c) { add('std_ittsuu', { kind: 'groups', groups: [a, b, c], tileInstanceIds: a.concat(b, c) }); break; }
    }
    // peikou (menzen)
    if (menzen) {
      const pk = findPeikou(cc, conceal);
      if (pk.length >= 2) add('std_ryanpeikou', { kind: 'groups', groups: pk[0].concat(pk[1]), tileInstanceIds: pk[0].flat().concat(pk[1].flat()) });
      else if (pk.length === 1) add('std_iipeikou', { kind: 'groups', groups: pk[0], tileInstanceIds: pk[0].flat() });
    }
    // triplets
    const tripGroups = [];
    for (let k = 0; k < 34; k++) if (cc[k] >= 3) tripGroups.push({ i: k, ids: conceal.filter((id) => (id >> 2) === k).slice(0, 3), concealed: true });
    for (const s of meldSets) if (s.t === 'trip' || s.t === 'kan') tripGroups.push({ i: s.i, ids: s.ids, concealed: !s.open, kan: s.t === 'kan' });
    const G = (arr) => ({ kind: 'groups', groups: arr.map((x) => x.ids), tileInstanceIds: arr.flatMap((x) => x.ids) });
    if (tripGroups.length >= 4) add('std_toitoi', G(tripGroups.slice(0, 4)));
    const ank = tripGroups.filter((x) => x.concealed);
    if (ank.length >= 3) add('std_sanankou', G(ank.slice(0, 3)));
    const kn = tripGroups.filter((x) => x.kan);
    if (kn.length >= 3) add('std_sankantsu', G(kn.slice(0, 3)));
    for (let n = 0; n < 9; n++) {
      const a = tripGroups.find((x) => x.i === n), b = tripGroups.find((x) => x.i === 9 + n), c = tripGroups.find((x) => x.i === 18 + n);
      if (a && b && c) { add('std_sanshoku_doukou', G([a, b, c])); break; }
    }
    const dT = tripGroups.filter((x) => x.i >= 31);
    if (dT.length === 2) {
      const third = [31, 32, 33].find((k) => !dT.some((x) => x.i === k));
      if (all[third] === 2) { const pr = idsOfKind(third); add('std_shousangen', { kind: 'groups', groups: dT.map((x) => x.ids).concat([pr]), tileInstanceIds: dT.flatMap((x) => x.ids).concat(pr) }); }
    }
    // chanta / junchan: 4 complete sets (incl. melds) + 1 single, each with yaochu, at least one sequence
    const need = 4 - p.melds.length;
    if (meldSets.every(hasYaochu) && conceal.length === need * 3 + 1) {
      const res = chantaDecomp(cc.slice(), need);
      if (res) {
        const hasSeq = res.hasSeq || meldSets.some((s) => s.t === 'seq');
        const honor = allIds.some((id) => (id >> 2) >= 27);
        if (hasSeq) add(honor ? 'std_chanta' : 'std_junchan', whole);
      }
    }
    // exclusives
    const ids = new Set(awards.map((a) => a.roleId));
    return awards.filter((a) => !(a.roleId === 'std_riichi' && ids.has('std_double_riichi')) &&
      !(a.roleId === 'std_iipeikou' && ids.has('std_ryanpeikou')) &&
      !(a.roleId === 'std_honitsu' && ids.has('std_chinitsu')) &&
      !(a.roleId === 'std_chanta' && ids.has('std_junchan')));
  }
  function findPeikou(cc, conceal) {
    // returns up to 2 disjoint identical-sequence pairs, as [[ids],[ids]] groups
    const c = cc.slice();
    const out = [];
    for (let i = 0; i < 27 && out.length < 2; i++) {
      if (i % 9 > 6) continue;
      while (out.length < 2 && c[i] >= 2 && c[i + 1] >= 2 && c[i + 2] >= 2) {
        c[i] -= 2; c[i + 1] -= 2; c[i + 2] -= 2;
        out.push(i);
      }
    }
    const alloc = makeAlloc(conceal);
    return out.map((i) => [alloc.takeKinds([i, i + 1, i + 2]), alloc.takeKinds([i, i + 1, i + 2])]);
  }
  function chantaDecomp(c, need) {
    let found = null;
    (function rec(start, sets, single, hasSeq) {
      if (found) return;
      let i = start; while (i < 34 && c[i] === 0) i++;
      if (i >= 34) { if (sets === need && single) found = { hasSeq }; return; }
      if (sets < need) {
        if (c[i] >= 3 && T.iYaochu(i)) { c[i] -= 3; rec(i, sets + 1, single, hasSeq); c[i] += 3; }
        if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2] && (i % 9 === 0 || i % 9 === 6)) {
          c[i]--; c[i + 1]--; c[i + 2]--; rec(i, sets + 1, single, true); c[i]++; c[i + 1]++; c[i + 2]++;
        }
      }
      if (!single && T.iYaochu(i)) { c[i]--; rec(i, sets, true, hasSeq); c[i]++; }
    })(0, 0, false, false);
    return found;
  }

  // 待ち牌ごとの見込み（テンパイ表示用）。13枚の手で、各待ち牌をロンした場合の役・翻・金額と、見えていない残り枚数。
  function waitPreview(m, seat) {
    const E = MJ2.Engine, r = m.round, p = r.players[seat];
    if (!r || p.winSnapshot || (p.hand.length % 3) !== 1) return null;
    const waits = E.standardWaits(p).slice();
    const jw = E.jackpotWait(r, p);
    if (jw != null && !waits.includes(jw)) waits.push(jw);
    if (!waits.length) return { waits: [], furiten: false };
    // visible tiles for the remaining count
    const seen = new Array(34).fill(0);
    const mark = (id) => { seen[id >> 2]++; };
    p.hand.forEach(mark);
    for (const q of r.players) { for (const md of q.melds) md.tileIds.forEach(mark); for (const d of q.discards) if (d.calledBy == null) mark(d.tileId); }
    E.doraIndicators(r).forEach(mark);
    const owned = new Set(E.ownedIds(p));
    const dealer = seat === r.dealer;
    const out = [];
    for (const k of waits.sort((a, b) => a - b)) {
      let fake = null;
      for (let j = 0; j < 4; j++) if (!owned.has(k * 4 + j)) { fake = k * 4 + j; break; }
      const item = { kind: k, remain: Math.max(0, 4 - seen[k]), han: 0, yakuman: 0, jackpot: false, names: [], legal: false, points: 0 };
      if (fake == null) { out.push(item); continue; }
      const ctx = { seat, winType: 'ron', winTileId: fake, fromSeat: (seat + 3) % 4, handIds: p.hand.concat([fake]), melds: p.melds, live: E.liveRemaining(r) };
      try {
        const view = MJ2.Roles.hypotheticalWinView(m, seat, ctx);
        const roleRes = MJ2.Roles.evaluateRoles(m, seat, view, { forLegality: true });
        const info = winInfoFromContext(m, seat, ctx);
        const std = evaluateWinStandard(info, roleRes.han);
        if (roleRes.jackpot) { item.jackpot = true; item.legal = true; item.names.push(MJ2.DATA.roleById.sp_jackpot.name); item.points = MJ2.DATA.config.superJackpotPoints; out.push(item); continue; }
        if (std) for (const a of std.awards) item.names.push(MJ2.DATA.roleById[a.roleId].name);
        for (const a of roleRes.awards) if (!a.minor && (a.han || a.yakuman)) item.names.push(MJ2.DATA.roleById[a.roleId].name);
        if (roleRes.minorBundleHan) { const b = MJ2.Settlement.bundleRoleFor(roleRes.minorCount); item.names.push(b ? b.name : '子役まとめ'); }
        // dora (indicators currently open)
        let dn = 0; const ids = E.ownedIds(p).concat([fake]);
        for (const ind of E.doraIndicators(r)) { const dk = MJ2.T.doraFromIndicator(ind >> 2); dn += ids.filter((id) => (id >> 2) === dk).length; }
        item.dora = dn;
        const gd = MJ2.Settlement.goldDoraCount(r, p.hand.concat([fake]), p.melds);
        item.gold = gd.n;
        item.yakuman = (std ? std.yakumanCount : 0) + roleRes.yakuman;
        item.han = (std ? std.han : 0) + roleRes.han;
        item.legal = item.han - (MJ2.DATA.config.minorDoesNotEnableWin ? (roleRes.minorBundleHan || 0) : 0) > 0 || item.yakuman > 0;
        if (item.yakuman) item.points = Math.max(yakumanPoints(dealer), roleRes.yakuman ? MJ2.DATA.config.ordinaryCustomYakumanPoints : 0);
        else if (item.legal) { item.han += dn + gd.n; item.points = ronPoints(item.han, (std && std.fu) || 30, dealer); }
      } catch (e) { /* preview only */ }
      out.push(item);
    }
    return { waits: out, furiten: E.isFuriten(r, p) };
  }

  MJ2.Yaku = {
    waitPreview,
    evaluateWinStandard, evaluateWinLegality, yakumanNamesForWaits, evaluateNonWinStandard,
    winInfoFromContext, winInfoFromSnapshot, ronPoints, yakumanPoints, basePoints, KUISAGARI
  };
})(typeof window !== 'undefined' ? window : globalThis);
