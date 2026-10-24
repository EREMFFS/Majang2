/* 麻雀2 CPU: legal-only, deterministic from match RNG state. Skill/tendency from cpu_profiles.json. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const T = MJ2.T, H = MJ2.Hand, E = () => MJ2.Engine;

  function profile(m, seat) {
    const id = m.roster[seat];
    return MJ2.DATA.cpuById[id] || { skill: 3, tendency: 'standard', traits: [] };
  }
  function rng(m) { return MJ2.RNG.useRng(m.rngState); }

  // visible tile counts for ukeire (own hand + all discards + all melds + dora indicators)
  function visibleCounts(m, seat) {
    const r = m.round;
    const c = new Array(34).fill(0);
    for (const id of r.players[seat].hand) c[id >> 2]++;
    for (const p of r.players) {
      for (const d of p.discards) if (d.calledBy == null) c[d.tileId >> 2]++;
      for (const md of p.melds) for (const id of md.tileIds) c[id >> 2]++;
    }
    for (const id of E().doraIndicators(r)) c[id >> 2]++;
    return c;
  }
  function ukeire(counts, meldCount, base, vis) {
    let n = 0;
    for (let k = 0; k < 34; k++) {
      const left = 4 - vis[k];
      if (left <= 0) continue;
      counts[k]++;
      if (H.shanten(counts, meldCount) < base) n += left;
      counts[k]--;
    }
    return n;
  }
  function tileValue(k, m, seat) {
    // keep yakuhai pairs, dislike isolated honors / terminals
    const r = m.round;
    if (k >= 27) {
      const yak = k >= 31 || k === 27 + r.roundWind || k === 27 + E().seatWind(r, seat);
      return yak ? 2 : 0;
    }
    const n = k % 9;
    return n === 0 || n === 8 ? 1 : n === 1 || n === 7 ? 2 : 3;
  }
  // evaluate discard candidates; returns sorted list [{id, sh, uk, val}]
  function rankDiscards(m, seat, candidateIds) {
    const r = m.round, p = r.players[seat];
    const vis = visibleCounts(m, seat);
    const counts = T.countsOfIds(p.hand);
    const mc = p.melds.length;
    const seen = {};
    const out = [];
    for (const id of candidateIds) {
      const k = id >> 2;
      if (seen[k]) { out.push(Object.assign({}, seen[k], { id })); continue; }
      counts[k]--;
      const sh = H.shanten(counts, mc);
      const uk = sh <= 3 ? ukeire(counts, mc, sh, vis) : 0;
      counts[k]++;
      const res = { id, k, sh, uk, val: tileValue(k, m, seat) };
      seen[k] = res;
      out.push(res);
    }
    out.sort((a, b) => a.sh - b.sh || b.uk - a.uk || a.val - b.val || a.k - b.k);
    return out;
  }
  function dangerOf(m, seat, k) {
    // simple: tiles not discarded by any riichi player are "dangerous"
    const r = m.round;
    let danger = 0;
    for (const q of r.players) {
      if (q.seat === seat || !q.active || !q.riichi) continue;
      if (q.discards.some((d) => (d.tileId >> 2) === k)) continue;
      danger += k >= 27 ? 1 : (k % 9 === 0 || k % 9 === 8) ? 2 : 3;
    }
    return danger;
  }

  function decideAction(m, pend) {
    const r = m.round, seat = pend.seat, p = r.players[seat];
    const pr = profile(m, seat);
    const R = rng(m);
    if (pend.tsumo) return { type: 'tsumo', seat };
    // ankan when it does not hurt
    if (pend.ankan.length) {
      const k = pend.ankan[0];
      const c = T.countsOfIds(p.hand);
      const before = H.shanten(c, p.melds.length);
      c[k] -= 4;
      const after = H.shanten(c.map((x) => x), p.melds.length + 1);
      if (p.riichi || after <= before) return { type: 'ankan', seat, kind: k };
    }
    if (pend.kakan.length && R.next() < 0.6) return { type: 'kakan', seat, tileId: pend.kakan[0] };
    // riichi
    if (pend.riichi.length) {
      const ranked = rankDiscards(m, seat, pend.riichi);
      const t = pr.tendency;
      const prob = t === 'calling' ? 0.7 : t === 'big_hand' ? 0.8 : 0.95;
      if (R.next() < prob) return { type: 'discard', seat, tileId: ranked[0].id, riichi: true };
    }
    if (pend.discards.length === 1) return { type: 'discard', seat, tileId: pend.discards[0] };
    let ranked = rankDiscards(m, seat, pend.discards);
    // defense
    const someoneRiichi = r.players.some((q) => q.seat !== seat && q.active && q.riichi);
    if (someoneRiichi && ranked[0].sh >= 2 && (pr.tendency === 'defensive' || pr.skill >= 4)) {
      ranked = ranked.slice().sort((a, b) => dangerOf(m, seat, a.k) - dangerOf(m, seat, b.k) || a.sh - b.sh || b.uk - a.uk);
    }
    // skill noise: weaker CPUs sometimes pick a worse tile
    const noise = Math.max(0.03, (5 - pr.skill) * 0.08);
    if (R.next() < noise && ranked.length > 2) {
      const pool = ranked.slice(0, Math.min(ranked.length, 2 + Math.round((5 - pr.skill) * 1.5)));
      return { type: 'discard', seat, tileId: R.pick(pool).id };
    }
    return { type: 'discard', seat, tileId: ranked[0].id };
  }

  function bestAfterCall(m, seat, removeIds) {
    const p = m.round.players[seat];
    const rest = p.hand.filter((id) => !removeIds.includes(id));
    const c = T.countsOfIds(rest);
    let best = 99;
    for (let k = 0; k < 34; k++) {
      if (!c[k]) continue;
      c[k]--; const s = H.shanten(c, p.melds.length + 1); c[k]++;
      if (s < best) best = s;
    }
    return best;
  }
  function yakuPlausible(m, seat, removeIds, calledKind) {
    const r = m.round, p = r.players[seat];
    const tiles = p.hand.filter((id) => !removeIds.includes(id)).concat(p.melds.flatMap((x) => x.tileIds)).map((id) => id >> 2).concat(removeIds.map((id) => id >> 2), [calledKind]);
    if (tiles.every((k) => !T.iYaochu(k))) return true; // kuitan
    const yak = (k) => k >= 31 || k === 27 + r.roundWind || k === 27 + E().seatWind(r, seat);
    if (p.melds.some((md) => md.type !== 'chi' && yak(md.tileIds[0] >> 2))) return true;
    const c = new Array(34).fill(0); for (const k of tiles) c[k]++;
    for (let k = 27; k < 34; k++) if (yak(k) && c[k] >= 3) return true;
    if (p.melds.length + 1 >= 3) return true; // 三度の飯より鳴き (1翻)
    const suitN = [0, 1, 2].map((s) => tiles.filter((k) => k < 27 && Math.floor(k / 9) === s).length);
    const honors = tiles.filter((k) => k >= 27).length;
    if (Math.max(...suitN) + honors >= tiles.length - 1) return true; // honitsu-ish
    return false;
  }

  function decideCall(m, pend) {
    const r = m.round, seat = pend.seat, p = r.players[seat];
    const pr = profile(m, seat);
    const R = rng(m);
    if (pend.ron) return { type: 'ron', seat };
    const k = pend.tileId >> 2;
    if (pend.pon || pend.chi.length || pend.minkan) {
      const c = T.countsOfIds(p.hand);
      const cur = H.shanten(c, p.melds.length);
      const t = pr.tendency;
      const yakuhai = k >= 31 || k === 27 + r.roundWind || k === 27 + E().seatWind(r, seat);
      const callMood = t === 'calling' ? 0.9 : t === 'fast' ? 0.75 : t === 'closed' ? 0.05 : t === 'big_hand' ? 0.35 : t === 'defensive' ? 0.3 : 0.5;
      if (pend.pon) {
        const used = p.hand.filter((id) => (id >> 2) === k).slice(0, 2);
        const after = bestAfterCall(m, seat, used);
        if (yakuhai && after <= cur && R.next() < Math.max(0.6, callMood)) return { type: 'pon', seat };
        if (after < cur && yakuPlausible(m, seat, used, k) && R.next() < callMood) return { type: 'pon', seat };
      }
      if (pend.minkan && R.next() < callMood * 0.4) {
        const used = p.hand.filter((id) => (id >> 2) === k);
        const rest = T.countsOfIds(p.hand.filter((id) => !used.includes(id)));
        if (H.shanten(rest, p.melds.length + 1) <= cur) return { type: 'minkan', seat };
      }
      for (const pair of pend.chi) {
        const after = bestAfterCall(m, seat, pair);
        if (after < cur && yakuPlausible(m, seat, pair, k) && R.next() < callMood) return { type: 'chi', seat, tileIds: pair };
      }
    }
    return { type: 'pass', seat };
  }

  function decide(m, pend) {
    return pend.type === 'action' ? decideAction(m, pend) : decideCall(m, pend);
  }

  MJ2.CPU = { decide, rankDiscards };
})(typeof window !== 'undefined' ? window : globalThis);
