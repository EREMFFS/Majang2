/* 麻雀2 Scorer / Settlement: computes the whole round once at round end, applies cumulative scores once per settlement id. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const T = MJ2.T;

  const EV_LABEL = {
    CHI: 'チー', PON: 'ポン', MINKAN: 'カン', ANKAN: '暗槓', KAKAN: '加槓', DISCARD: '打', DRAW: 'ツモ',
    RIICHI_DECLARED: 'リーチ', WIN_RON: 'ロン', WIN_TSUMO: 'ツモ和了', DECLINE_RON: 'ロン見送り', DECLINE_TSUMO: 'ツモ見送り',
    TENPAI_STATE: '', CHANKAN_ROBBED: '槍槓された'
  };

  function nonWinHanPoints(han) {
    const t = MJ2.DATA.config.nonWinnerHanScore;
    if (han <= 0) return 0;
    if (han >= 5) return t['5plus'];
    return t[String(han)];
  }

  // 黄金ドラ: ジャックポット対象の牌を種類ごとに1枚（金色に光る牌）＝1翻、上限あり。副露ありは0。
  function goldDoraCount(r, handIds, melds) {
    const gc = MJ2.DATA.config.goldDora;
    if (!gc || !gc.enabled || (gc.requireMenzen !== false && melds && melds.length)) return { n: 0, ids: [] };
    const tset = new Set(r.jackpotTargets || []);
    const seen = new Set(), ids = [];
    for (const id of handIds.slice().sort((a, b) => a - b)) { const k = id >> 2; if (tset.has(k) && !seen.has(k)) { seen.add(k); ids.push(id); } }
    const n = Math.min(gc.maxHan ?? 3, ids.length * (gc.hanPerTile || 1));
    return { n, ids, kinds: ids.length };
  }
  function doraCount(ownedIds, indicators) {
    let n = 0; const used = [];
    for (const ind of indicators) {
      const dk = T.doraFromIndicator(ind >> 2);
      for (const id of ownedIds) if ((id >> 2) === dk) { n++; used.push(id); }
    }
    return { n, ids: [...new Set(used)] };
  }

  function evidenceDisplay(r, ev) {
    const out = { kind: ev.kind, tiles: ev.tileInstanceIds ? ev.tileInstanceIds.slice() : [], steps: [], targets: ev.targetSeats ? ev.targetSeats.slice() : [], meldIds: ev.meldIds ? ev.meldIds.slice() : [] };
    if (ev.groups) out.groups = ev.groups.map((g) => g.slice());
    if (ev.eventIds && ev.eventIds.length) {
      for (const id of ev.eventIds) {
        const e = r.events.find((x) => x.id === id);
        if (!e) continue;
        let label = EV_LABEL[e.type] != null ? EV_LABEL[e.type] : e.type;
        if (e.type === 'TENPAI_STATE') label = (e.tenpai ? 'テンパイ' : 'ノーテン') + (e.boundary === 'deal' ? '(配牌)' : '(' + e.discardNo + '打目)');
        const step = { type: e.type, label, seat: e.seat };
        if (e.tileId != null) step.tileId = e.tileId;
        if (e.fromSeat != null) step.fromSeat = e.fromSeat;
        if (e.sourceSeat != null && e.type === 'WIN_RON') step.fromSeat = e.sourceSeat;
        out.steps.push(step);
      }
    }
    if (ev.turns) out.turns = ev.turns.slice();
    return out;
  }

  function roleCategory(roleId) { return MJ2.DATA.roleById[roleId].displayCategory; }

  function computeSeat(m, seat) {
    const r = m.round, p = r.players[seat];
    const view = MJ2.Roles.finalView(m, seat);
    const roles = MJ2.Roles.evaluateRoles(m, seat, view);
    const isWinner = !!p.winSnapshot;
    const dealer = seat === r.dealer;
    const res = {
      seat, faceId: m.roster[seat], isWinner, winOrder: p.winOrder || null,
      winType: isWinner ? p.winSnapshot.winType : null,
      fromSeat: isWinner ? p.winSnapshot.fromSeat : null,
      handIds: isWinner ? p.winSnapshot.handIds.slice() : p.hand.slice(),
      melds: (isWinner ? p.winSnapshot.melds : p.melds).map((md) => ({ id: md.id, type: md.type, tileIds: md.tileIds.slice(), fromSeat: md.fromSeat, calledTileId: md.calledTileId })),
      winTileId: isWinner ? p.winSnapshot.winTileId : null,
      majors: [], minors: [], dora: null,
      baseKind: 'nonwin', basePoints: 0, hanTotal: 0, fu: null, minorTotal: 0, fixedTotal: 0, total: 0
    };
    const majors = [];
    const minors = [];
    for (const a of roles.awards) {
      const role = MJ2.DATA.roleById[a.roleId];
      const isMinor = !!a.minor;
      const item = { roleId: a.roleId, name: role.name, han: a.han || 0, yakuman: !!a.yakuman, points: isMinor ? 0 : (a.fixedPoints || 0), cls: isMinor ? 'minor' : role.class, category: roleCategory(a.roleId), evidence: evidenceDisplay(r, a.evidence) };
      if (isMinor || role.class === 'fixed') minors.push(item); else majors.push(item);
    }
    if (isWinner) {
      const ownedIds = res.handIds.concat(res.melds.flatMap((x) => x.tileIds));
      if (roles.jackpot) {
        res.baseKind = 'jackpot';
        res.basePoints = MJ2.DATA.config.superJackpotPoints;
        // other majors are still shown/discovered but not added (no double counting)
      } else {
        const info = MJ2.Yaku.winInfoFromSnapshot(m, seat);
        const d = doraCount(ownedIds, p.winSnapshot.doraIndicators);
        const u = p.riichi ? doraCount(ownedIds, p.winSnapshot.uraIndicators) : { n: 0, ids: [] };
        const g = goldDoraCount(r, res.handIds, res.melds);
        const std = MJ2.Yaku.evaluateWinStandard(info, roles.han + d.n + u.n + g.n);
        const stdAwards = std ? std.awards : [];
        for (const a of stdAwards) {
          const role = MJ2.DATA.roleById[a.roleId];
          majors.unshift({ roleId: a.roleId, name: role.name, han: a.han || 0, yakuman: !!a.yakuman, points: 0, cls: role.class, category: roleCategory(a.roleId), evidence: evidenceDisplay(r, a.evidence) });
        }
        res.fu = std ? std.fu : null;
        res.dora = { dora: d.n, ura: u.n, gold: g.n, goldKinds: g.kinds || 0, doraIds: d.ids, uraIds: u.ids, goldIds: g.ids, indicators: p.winSnapshot.doraIndicators.slice(), uraIndicators: p.winSnapshot.uraIndicators.slice() };
        const stdYakuman = std ? std.yakumanCount : 0;
        if (stdYakuman) {
          res.baseKind = 'yakuman';
          res.basePoints = MJ2.Yaku.yakumanPoints(dealer);
          res.hanTotal = 0;
          // regular han roles are superseded by yakuman (standard practice)
        } else {
          res.hanTotal = (std ? std.han : 0) + roles.han + d.n + u.n + g.n;
          res.basePoints = MJ2.Yaku.ronPoints(res.hanTotal, res.fu || 30, dealer);
          res.baseKind = 'win';
        }
        if (roles.yakuman > 0) {
          const y = MJ2.DATA.config.ordinaryCustomYakumanPoints;
          if (res.basePoints < y) res.basePoints = y;
          res.baseKind = 'yakuman';
        }
      }
    } else {
      const std = MJ2.Yaku.evaluateNonWinStandard(m, seat);
      for (const a of std) {
        const role = MJ2.DATA.roleById[a.roleId];
        majors.unshift({ roleId: a.roleId, name: role.name, han: a.han, yakuman: false, points: 0, cls: role.class, category: roleCategory(a.roleId), evidence: evidenceDisplay(r, a.evidence) });
      }
      res.hanTotal = std.reduce((s, a) => s + a.han, 0) + roles.han;
      res.basePoints = nonWinHanPoints(res.hanTotal);
      if (roles.yakuman > 0) {
        const y = MJ2.DATA.config.ordinaryCustomYakumanPoints;
        if (res.basePoints < y) res.basePoints = y;
        res.baseKind = 'yakuman';
      }
    }
    // jackpot first, then yakuman, then by han desc keeps "ドン" order readable
    const ord = MJ2.DATA.roleOrder || (MJ2.DATA.roleOrder = Object.fromEntries(MJ2.DATA.roles.map((x, i) => [x.id, i])));
    majors.sort((a, b) => (b.roleId === 'sp_jackpot') - (a.roleId === 'sp_jackpot') || (b.yakuman - a.yakuman) || ord[a.roleId] - ord[b.roleId]);
    // 子役まとめ: system row (not a discoverable role), added once from the resolved minor count
    if (roles.minorBundleHan > 0) {
      const br = bundleRoleFor(roles.minorCount);
      majors.push({ roleId: 'system_minor_bundle', bundleId: br ? br.id : null, reading: br ? br.reading : '', voiceEvent: br ? br.voiceEvent : null, name: br ? br.name : '子役まとめ', han: roles.minorBundleHan, yakuman: false, points: 0, cls: 'han', category: 'システム', synthetic: true, minorCount: roles.minorCount,
        evidence: { kind: 'minor_bundle', tiles: [], steps: [], targets: [], meldIds: [], roleIds: minors.filter((x) => x.cls === 'minor').map((x) => x.roleId) } });
    }
    res.majors = majors;
    res.minors = minors;
    res.minorCount = roles.minorCount;
    res.minorBundleHan = roles.minorBundleHan;
    res.scoringPolicyVersion = MJ2.DATA.config.scoringPolicyVersion || 'minor_bundle_v1';
    res.minorTotal = 0; // 個別点は廃止（minor_bundle_v1）
    res.fixedTotal = minors.filter((x) => x.cls === 'fixed').reduce((s, x) => s + x.points, 0);
    res.total = res.basePoints + res.minorTotal + res.fixedTotal;
    return res;
  }

  // 子役まとめの正式名（四子安・八子安・十二子安・十六子安）
  function bundleRoleFor(count) {
    const list = ((MJ2.DATA.config.minorScoring || {}).bundleRoles || []).slice().sort((a, b) => b.minCount - a.minCount);
    return list.find((b) => count >= b.minCount) || null;
  }
  const ceil100 = (x) => Math.ceil(x / 100) * 100;
  // split a fixed total over payers by weights in 100-point units; the first payer absorbs the remainder so totals match
  function splitFixed(total, payers) {
    const wsum = payers.reduce((a, p) => a + p.w, 0);
    const out = payers.map((p) => ({ seat: p.seat, amount: Math.floor((total * p.w) / wsum / 100) * 100 }));
    const diff = total - out.reduce((a, x) => a + x.amount, 0);
    out[0].amount += diff;
    return out;
  }
  // transfer_v1: winners are paid by other players (ron: discarder pays all; tsumo: dealer/child split incl. players already waiting)
  function computeTransfers(m, results, dealer) {
    const r = m.round;
    const pays = [];
    for (const w of r.winOrder) {
      const res = results[w];
      const others = [0, 1, 2, 3].filter((x) => x !== w);
      if (res.winType === 'ron') {
        pays.push({ from: res.fromSeat, to: w, amount: res.basePoints, kind: 'ron' });
        res.winPayKind = 'ron';
        continue;
      }
      res.winPayKind = 'tsumo';
      const winnerIsDealer = w === dealer;
      let parts;
      if (res.baseKind === 'win') {
        const b = MJ2.Yaku.basePoints(res.hanTotal, res.fu || 30);
        parts = others.map((x) => ({ seat: x, amount: winnerIsDealer ? ceil100(b * 2) : ceil100(b * (x === dealer ? 2 : 1)) }));
      } else {
        // fixed-type (yakuman / jackpot): keep the existing total, split by the usual dealer/child ratio
        const order = winnerIsDealer ? others : [dealer].concat(others.filter((x) => x !== dealer));
        parts = splitFixed(res.basePoints, order.map((x) => ({ seat: x, w: winnerIsDealer ? 1 : (x === dealer ? 2 : 1) })));
      }
      for (const pt of parts) pays.push({ from: pt.seat, to: w, amount: pt.amount, kind: 'tsumo' });
    }
    return pays;
  }

  function computeRound(m) {
    const r = m.round;
    const id = r.roundId;
    const results = [0, 1, 2, 3].map((s) => computeSeat(m, s));
    const pays = computeTransfers(m, results, r.dealer);
    for (const res of results) {
      res.incoming = pays.filter((p) => p.to === res.seat);
      res.outgoing = pays.filter((p) => p.from === res.seat);
      res.received = res.incoming.reduce((a, p) => a + p.amount, 0);
      res.paid = res.outgoing.reduce((a, p) => a + p.amount, 0);
      // self-added parts: non-winner role points (and any genuine non-minor fixed points)
      res.selfGain = (res.isWinner ? 0 : res.basePoints) + res.fixedTotal;
      res.total = res.received - res.paid + res.selfGain;
      // 三冠王の集計用（東南戦終了時に合算）
      res.callCount = r.events.filter((e) => e.seat === res.seat && CALL_EV.includes(e.type)).length;
      res.majorRoleCount = res.majors.filter((x) => !x.synthetic).length + res.minors.filter((x) => x.cls === 'fixed').length;
      res.minorRoleCount = res.minors.filter((x) => x.cls === 'minor').length;
    }
    // 点はそのまま。精算で 点×組織レート×局の倍率 の円を別に持つ（所持金）
    const R = rateFor(m, r.label);
    for (const p of pays) p.yen = p.amount * R.yen;
    for (const res of results) {
      res.yen = { received: res.received * R.yen, paid: res.paid * R.yen, selfGain: res.selfGain * R.yen, total: res.total * R.yen, base: res.basePoints * R.yen };
    }
    const order = r.winOrder.slice();
    for (let s = 0; s < 4; s++) if (!order.includes(s)) order.push(s);
    return {
      id, roundId: r.roundId, label: r.label, roundIndex: r.index, dealer: r.dealer, endReason: r.endReason,
      order, results, transfers: pays, applied: false, rate: R.base, mult: R.mult, yenPerPoint: R.yen, newRoleIds: [], jackpotTargets: r.jackpotTargets.slice(), scoringPolicyVersion: MJ2.DATA.config.scoringPolicyVersion
    };
  }

  // apply exactly once per settlement id
  function applyRound(m, s) {
    if (m.settlements.some((x) => x.id === s.id && x.applied)) return false;
    const before = m.cumulativeScores.slice();
    if (!m.cumulativeYen) m.cumulativeYen = m.cumulativeScores.map((p) => p * (m.rate || 1));
    const beforeY = m.cumulativeYen.slice();
    for (const res of s.results) {
      res.cumulativeBefore = before[res.seat];
      m.cumulativeScores[res.seat] = before[res.seat] + res.total;
      res.cumulativeAfter = m.cumulativeScores[res.seat];
      const ty = res.yen ? res.yen.total : res.total;
      res.yenBefore = beforeY[res.seat];
      m.cumulativeYen[res.seat] = beforeY[res.seat] + ty;
      res.yenAfter = m.cumulativeYen[res.seat];
    }
    s.applied = true;
    if (MJ2.Records && MJ2.Records.applyRound) s.newRoleIds = MJ2.Records.applyRound(m, s) || [];
    m.settlements.push(s);
    return true;
  }

  const CALL_EV = ['CHI', 'PON', 'MINKAN', 'KAKAN'];
  // レート: 組織の1点＝何円 × 局の倍率（南場×2・オーラス×3）
  function rateFor(m, label) {
    const rc = MJ2.DATA.config.rate || {};
    const base = (rc.enabled === false ? 1 : (m && m.rate)) || 1;
    const mult = (rc.enabled === false ? 1 : (rc.roundMultipliers || {})[label]) || 1;
    return { base, mult, yen: base * mult };
  }
  function currentRate(m) { const lab = m && (m.round ? m.round.label : m.rounds[m.roundIndex]); return rateFor(m, lab); }
  // ---- 三冠王（東南戦終了時に１回だけ。自分への加算） ----
  function tripleCrownCounts(m) {
    const c = [0, 1, 2, 3].map(() => ({ minor_roles_total: 0, major_roles_total: 0, calls_total: 0 }));
    for (const s of m.settlements) for (const res of s.results) {
      const x = c[res.seat];
      x.minor_roles_total += res.minorRoleCount != null ? res.minorRoleCount : (res.minors || []).filter((y) => y.cls === 'minor').length;
      x.major_roles_total += res.majorRoleCount != null ? res.majorRoleCount : (res.majors || []).filter((y) => !y.synthetic).length;
      x.calls_total += res.callCount || 0;
    }
    return c;
  }
  function computeTripleCrown(m) {
    const cfg = MJ2.DATA.config.tripleCrown || {};
    const counts = tripleCrownCounts(m);
    const titles = (cfg.titles || []).map((t) => {
      const vals = counts.map((x) => x[t.count] || 0);
      const best = Math.max(...vals);
      const winners = best >= (cfg.minCount ?? 1) ? [0, 1, 2, 3].filter((s) => vals[s] === best) : [];
      return { id: t.id, name: t.name, count: t.count, values: vals, best, winners, prize: cfg.prizeEach || 0, prizeYen: (cfg.prizeEach || 0) * ((m && m.rate) || 1) };
    });
    const award = [0, 0, 0, 0];
    const sweep = [];
    for (const t of titles) for (const s of t.winners) award[s] += t.prize;
    const sb = cfg.sweepBonus || 0, rate = (m && m.rate) || 1;
    for (let s = 0; s < 4; s++) if (titles.length && titles.every((t) => t.winners.includes(s))) { sweep.push(s); award[s] += sb; }
    return { titles, sweep, sweepBonus: sb, sweepBonusYen: sb * rate, award, awardYen: award.map((x) => x * rate), counts };
  }
  function applyTripleCrown(m) {
    const cfg = MJ2.DATA.config.tripleCrown;
    if (!cfg || !cfg.enabled || m.tripleCrown || m.bankrupt) return m.tripleCrown || null;
    const tc = computeTripleCrown(m);
    tc.before = m.cumulativeScores.slice();
    if (!m.cumulativeYen) m.cumulativeYen = m.cumulativeScores.slice();
    tc.beforeYen = m.cumulativeYen.slice();
    for (let s = 0; s < 4; s++) { m.cumulativeScores[s] += tc.award[s]; m.cumulativeYen[s] += tc.awardYen[s]; }
    tc.after = m.cumulativeScores.slice();
    tc.afterYen = m.cumulativeYen.slice();
    m.tripleCrown = tc;
    return tc;
  }

  function finalRanking(m) {
    // 順位は麻雀の結果＝持ち点。お金（所持金）はその後に動く結果として併せて返す
    const money = m.cumulativeYen || m.cumulativeScores;
    const seats = [0, 1, 2, 3].map((s) => ({ seat: s, score: m.cumulativeScores[s], points: m.cumulativeScores[s], money: money[s], faceId: m.roster[s] }));
    const sorted = seats.slice().sort((a, b) => b.score - a.score || a.seat - b.seat);
    for (const x of sorted) x.rank = 1 + sorted.filter((y) => y.score > x.score).length;
    return sorted;
  }

  MJ2.Settlement = { goldDoraCount, rateFor, currentRate, computeTripleCrown, applyTripleCrown, tripleCrownCounts, bundleRoleFor, splitFixed, computeTransfers, computeRound, applyRound, finalRanking, nonWinHanPoints, doraCount };
})(typeof window !== 'undefined' ? window : globalThis);
