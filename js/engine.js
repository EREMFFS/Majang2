/* 麻雀2 RuleEngine: physical tiles, wall, legal moves, winners, active seats, event log.
   Pure state machine on a JSON-serializable match object. No DOM, no timers. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const T = MJ2.T, H = MJ2.Hand;

  const SCHEMA = 1;
  const CALL_TYPES = ['CHI', 'PON', 'MINKAN', 'ANKAN', 'KAKAN'];

  function cfg() { return MJ2.DATA.config; }

  // ---------------- match ----------------
  function newMatch(opts) {
    const seed = opts.seed != null ? String(opts.seed) : String(Date.now()) + ':' + Math.floor(Math.random() * 1e9);
    const rng = MJ2.RNG.newRngState(seed);
    const matchId = opts.matchId || ('m' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36));
    const m = {
      schemaVersion: SCHEMA,
      saveId: 'mj2-save',
      matchId,
      seed,
      rngState: rng,
      stageId: opts.stageId,
      playerFaceId: opts.playerFaceId,
      roster: opts.roster.slice(), // seat -> faceId; seat0 = human
      seatOrder: [0, 1, 2, 3],
      humanSeats: opts.humanSeats || [0],
      roundIndex: 0,
      rounds: (opts.rounds || cfg().rounds).slice(),
      cumulativeScores: [0, 0, 0, 0].map(() => cfg().startingScore || 0),
      cumulativeYen: null, // 所持金（円）: 初期＝持ち点×レート、精算ごとに 点×レート×倍率（下で設定）
      round: null,
      settlements: [],
      phase: 'vs',
      pendingSettlement: null,
      presentationCursor: null,
      matchEndApplied: false,
      scoringPolicyVersion: cfg().scoringPolicyVersion || 'transfer_v1',
      // 組織のレート（1点＝何円）。所持金はこのレート×局の倍率で円に換算して積み上げる
      rate: opts.rate != null ? opts.rate : ((MJ2.DATA.stageById && MJ2.DATA.stageById[opts.stageId] && MJ2.DATA.stageById[opts.stageId].rateYenPerPoint) || (cfg().rate && cfg().rate.defaultYenPerPoint) || 1),
      created: Date.now()
    };
    m.initialYen = m.cumulativeScores.map((p) => p * (m.rate || 1));
    m.cumulativeYen = m.initialYen.slice();
    return m;
  }
  function rng(m) { return MJ2.RNG.useRng(m.rngState); }

  // ---- 役満の半分揃い配牌（双鳥羽佐助など yakuman_tenpai_start 特性） ----
  const YT_DEFAULT = [
    { id: 'kokushi', name: '国士無双', weight: 1 }, { id: 'ryuuiisou', name: '緑一色', weight: 1 },
    { id: 'daisangen', name: '大三元', weight: 1 }, { id: 'tsuuiisou', name: '字一色', weight: 1 },
    { id: 'chinroutou', name: '清老頭', weight: 1 }, { id: 'suuankou', name: '四暗刻', weight: 1 },
    { id: 'suushii', name: '四喜和', weight: 1 }, { id: 'chuuren', name: '九蓮宝燈', weight: 1 }
  ];
  function pickYakumanTemplate(R) {
    const list = (cfg().yakumanStartTemplates || YT_DEFAULT).filter((x) => (x.weight ?? 1) > 0);
    const tot = list.reduce((a, x) => a + (x.weight ?? 1), 0);
    let v = R.next() * tot;
    for (const x of list) { v -= (x.weight ?? 1); if (v < 0) return x; }
    return list[list.length - 1];
  }
  // returns tile kinds (index 0..33) to reserve — about half of the yakuman (7 tiles)
  function buildTemplateKinds(id, R) {
    const I = T.idx, pick = (arr) => arr[R.int(arr.length)], shuf = (a) => R.shuffle(a.slice());
    const n = Math.max(1, Math.min(13, cfg().yakumanStartTemplateKinds ?? 7));
    const rep = (k, c) => new Array(c).fill(k);
    switch (id) {
      case 'ryuuiisou': { // 緑一色: 2・3・4索の順子＋發などの対子（役満以外でも和了れる形）
        const g = ['s2', 's3', 's4', 's6', 's8', 'z6'].map(I);
        const pairK = pick(g), extra = pick(g.filter((x) => x !== pairK));
        return [I('s2'), I('s3'), I('s4')].concat(rep(pairK, 2), rep(extra, 2)).slice(0, n);
      }
      case 'daisangen': return [I('z5'), I('z5'), I('z6'), I('z6'), I('z7'), I('z7'), pick([I('z5'), I('z6'), I('z7')])].slice(0, n);
      case 'tsuuiisou': { const h = shuf([1, 2, 3, 4, 5, 6, 7].map((x) => I('z' + x))); return rep(h[0], 3).concat(rep(h[1], 2), rep(h[2], 2)).slice(0, n); }
      case 'chinroutou': { const t = shuf(['m1', 'm9', 'p1', 'p9', 's1', 's9'].map(I)); return rep(t[0], 3).concat(rep(t[1], 2), rep(t[2], 2)).slice(0, n); }
      case 'suuankou': { const k = shuf([...Array(34).keys()]); return rep(k[0], 3).concat(rep(k[1], 3), [k[2]]).slice(0, n); }
      case 'suushii': { const w = shuf(['z1', 'z2', 'z3', 'z4'].map(I)); return rep(w[0], 2).concat(rep(w[1], 2), rep(w[2], 2), [w[3]]).slice(0, n); }
      case 'chuuren': { const su = pick(['m', 'p', 's']); const mid = shuf([2, 3, 4, 5, 6, 7, 8]); return [1, 1, 1, 9, 9, mid[0], mid[1]].map((x) => I(su + x)).slice(0, n); }
      default: return shuf(H.YAOCHU.slice()).slice(0, n); // 国士無双: 么九牌の異なる種類
    }
  }
  function isHuman(m, seat) { return m.humanSeats.includes(seat); }

  // ---------------- round start ----------------
  function startRound(m) {
    const label = m.rounds[m.roundIndex];
    const roundWind = label[0] === 'E' ? 0 : label[0] === 'S' ? 1 : label[0] === 'W' ? 2 : 3;
    const dealer = (parseInt(label.slice(1), 10) - 1) % 4; // no renchan: dealer moves each round
    const r = rng(m);
    const roundId = m.matchId + '-' + label;
    // jackpot targets: 14 distinct of 34
    const kinds = []; for (let i = 0; i < 34; i++) kinds.push(i);
    r.shuffle(kinds);
    const jackpotTargets = kinds.slice(0, 14).sort((a, b) => a - b);

    // physical tiles 0..135
    let pool = []; for (let i = 0; i < 136; i++) pool.push(i);
    const templates = {};
    const traitSeats = [];
    for (let s = 0; s < 4; s++) {
      const ch = MJ2.DATA.charById[m.roster[s]];
      if (!ch || isHuman(m, s)) continue;
      if ((ch.traits || []).includes('yakuman_tenpai_start') && r.next() < (cfg().yakumanTenpaiStartChance ?? 1)) traitSeats.push(s);
    }
    const tmplInfo = {};
    for (const s of traitSeats) {
      // 役満の「半分揃い」配牌: いろいろな役満の材料を約半分（7枚）持って始まる。残りは普通に配る。
      const def = pickYakumanTemplate(r);
      const kinds = buildTemplateKinds(def.id, r);
      const ids = [];
      for (const k of kinds) {
        const cand = pool.filter((id) => (id >> 2) === k);
        if (!cand.length) continue; // 足りない牌は普通の配牌で埋める
        const pickId = cand[r.int(cand.length)];
        ids.push(pickId);
        pool.splice(pool.indexOf(pickId), 1);
      }
      templates[s] = ids;
      tmplInfo[s] = { id: def.id, name: def.name, kinds: ids.map((id) => id >> 2) };
    }
    r.shuffle(pool);
    const hands = [[], [], [], []];
    for (let s = 0; s < 4; s++) {
      if (templates[s]) hands[s] = templates[s].concat(pool.splice(0, 13 - templates[s].length));
      else hands[s] = pool.splice(0, 13);
    }
    const dead = pool.splice(pool.length - 14, 14);
    const live = pool; // remaining 70
    const players = [];
    for (let s = 0; s < 4; s++) {
      players.push({
        yakumanTemplate: tmplInfo[s] || null,
        seat: s,
        hand: T.sortIds(hands[s]),
        melds: [],
        discards: [],
        winSnapshot: null,
        riichi: null,
        furitenTemp: false,
        furitenPermanent: false,
        active: true,
        initialHandIds: T.sortIds(hands[s]),
        drawCount: 0,
        normalDrawCount: 0,
        discardCount: 0,
        lastDrawId: null,
        lastDrawSource: null,
        waits: [],
        everTenpai: false,
        everNoten: false,
        firstTenpaiWaits: null,
        mustDiscard: false,
        kuikaeKinds: [],
        yakumanNotices: [],
        winOrder: null,
        traitDeal: !!templates[s]
      });
    }
    const round = {
      roundId,
      label,
      index: m.roundIndex,
      roundWind,
      dealer,
      live,
      livePtr: 0,
      liveEnd: live.length,
      dead,
      rinshanUsed: 0,
      doraCount: 1,
      players,
      turnSeat: dealer,
      phase: 'draw',
      callWindow: null,
      events: [],
      seq: 0,
      winOrder: [],
      jackpotTargets,
      kanCount: 0,
      anyCall: false,
      pending: null,
      ended: false,
      endReason: null,
      lastDiscard: null
    };
    m.round = round;
    m.phase = 'round';
    m.pendingSettlement = null;
    m.presentationCursor = null;
    pushEvent(m, { type: 'ROUND_START', seat: dealer, dealer, roundWind, jackpotTargets: jackpotTargets.slice() });
    for (let s = 0; s < 4; s++) {
      pushEvent(m, { type: 'DEAL', seat: s, tileIds: players[s].hand.slice(), trait: players[s].traitDeal || undefined });
    }
    for (let s = 0; s < 4; s++) recordTenpai(m, s, 'deal');
    assertTileInvariant(m);
    return round;
  }

  function pushEvent(m, ev) {
    const r = m.round;
    r.seq++;
    ev.id = r.roundId + '#' + r.seq;
    ev.roundId = r.roundId;
    ev.seq = r.seq;
    ev.live = liveRemaining(r);
    if (ev.tileId != null && ev.kind == null) ev.kind = T.kindOfId(ev.tileId);
    r.events.push(ev);
    return ev;
  }
  function liveRemaining(r) { return r.liveEnd - r.livePtr; }
  function activeSeats(r) { return r.players.filter((p) => p.active).map((p) => p.seat); }
  function nextActive(r, seat) {
    for (let k = 1; k <= 4; k++) { const s = (seat + k) % 4; if (r.players[s].active) return s; }
    return -1;
  }
  function prevActive(r, seat) {
    for (let k = 1; k <= 4; k++) { const s = (seat + 4 - k) % 4; if (r.players[s].active) return s; }
    return -1;
  }
  function seatWind(r, seat) { return (seat - r.dealer + 4) % 4; }
  function doraIndicators(r) { return r.dead.slice(4, 4 + r.doraCount); }
  function uraIndicators(r) { return r.dead.slice(9, 9 + r.doraCount); }

  // ---------------- tile accounting ----------------
  function ownedIds(p) { const ids = p.hand.slice(); for (const md of p.melds) ids.push(...md.tileIds); return ids; }
  function openMeldCount(p) { return p.melds.filter((x) => x.type !== 'ankan').length; }
  function isMenzen(p) { return openMeldCount(p) === 0; }
  function assertTileInvariant(m) {
    const r = m.round;
    const seen = new Array(136).fill(0);
    for (let i = r.livePtr; i < r.liveEnd; i++) seen[r.live[i]]++;
    // tiles of live wall beyond liveEnd were moved to dead wall (kan replenish); they are never drawn
    for (let i = r.liveEnd; i < r.live.length; i++) seen[r.live[i]]++;
    for (let i = r.rinshanUsed; i < 14; i++) seen[r.dead[i]]++;
    for (const p of r.players) {
      for (const id of p.hand) seen[id]++;
      for (const md of p.melds) for (const id of md.tileIds) seen[id]++;
      for (const d of p.discards) if (d.calledBy == null) seen[d.tileId]++;
    }
    const bad = seen.findIndex((c) => c !== 1);
    if (bad >= 0) {
      const err = new Error('tile invariant broken at id ' + bad + ' count ' + seen[bad]);
      err.tileCounts = seen;
      throw err;
    }
    return true;
  }

  // ---------------- tenpai / waits ----------------
  function standardWaits(p) {
    const c = T.countsOfIds(p.hand);
    const own = T.countsOfIds(ownedIds(p));
    return H.waits(c, p.melds.length, own);
  }
  function jackpotWait(r, p) {
    if (p.melds.length) return null;
    if (p.hand.length !== 13) return null;
    const c = T.countsOfIds(p.hand);
    const tset = new Set(r.jackpotTargets);
    for (let i = 0; i < 34; i++) { if (c[i] > 1) return null; if (c[i] === 1 && !tset.has(i)) return null; }
    const missing = r.jackpotTargets.filter((k) => c[k] === 0);
    return missing.length === 1 ? missing[0] : null;
  }
  function furitenWaitSet(r, p) {
    const w = new Set(standardWaits(p));
    const jw = jackpotWait(r, p);
    if (jw != null) w.add(jw);
    return w;
  }
  function recordTenpai(m, seat, boundary) {
    const r = m.round, p = r.players[seat];
    const before = p.waits.slice();
    const w = standardWaits(p);
    p.waits = w;
    const tenpai = w.length > 0;
    if (tenpai) { p.everTenpai = true; if (!p.firstTenpaiWaits) p.firstTenpaiWaits = w.slice(); }
    else p.everNoten = true;
    pushEvent(m, { type: 'TENPAI_STATE', seat, tenpai, waitSetBefore: before, waitSetAfter: w.slice(), boundary, discardNo: p.discardCount });
    checkYakumanNotice(m, seat);
  }

  // 役満リーチ: リーチを宣言した人の待ちに役満（またはジャックポット）がある時だけ、役名を出す。
  // （v015: 振り込みの役満「三家献宝」の一歩手前や、テンパイでない「あと1枚」はリーチではないので出さない）
  function checkYakumanNotice(m, seat) {
    const r = m.round, p = r.players[seat];
    if (!p.active || !p.riichi) return;
    const names = [];
    if (jackpotWait(r, p) != null) names.push(MJ2.DATA.roleById.sp_jackpot.name);
    if (p.waits.length) {
      for (const nm of MJ2.Yaku.yakumanNamesForWaits(m, seat, p.waits)) if (!names.includes(nm)) names.push(nm);
    }
    const fresh = names.filter((n) => !p.yakumanNotices.includes(n));
    if (fresh.length) {
      p.yakumanNotices.push(...fresh);
      pushEvent(m, { type: 'YAKUMAN_READY', seat, names: fresh });
    }
  }
  function ronRecipients(r, seat) {
    const s = new Set();
    for (const d of r.players[seat].discards) for (const w of d.ronBy || []) s.add(w);
    return s;
  }

  // ---------------- win checks ----------------
  function isJackpotShape(r, p, ids14) {
    if (p.melds.length) return false;
    if (ids14.length !== 14) return false;
    const c = T.countsOfIds(ids14);
    for (const k of r.jackpotTargets) if (c[k] !== 1) return false;
    return true;
  }
  function winShapeOk(r, p, ids14) {
    const c = T.countsOfIds(ids14);
    if (H.isAgari(c, p.melds.length)) return true;
    return isJackpotShape(r, p, ids14);
  }
  function isFuriten(r, p) {
    if (p.furitenTemp || p.furitenPermanent) return true;
    const w = furitenWaitSet(r, p);
    for (const d of p.discards) if (w.has(d.tileId >> 2)) return true;
    return false;
  }
  // win context for yaku evaluation
  function makeWinContext(m, seat, winType, tileId, extra) {
    const r = m.round, p = r.players[seat];
    const handIds = winType === 'tsumo' ? p.hand.slice() : p.hand.concat([tileId]);
    return Object.assign({
      seat, winType, winTileId: tileId, handIds, melds: p.melds,
      live: liveRemaining(r)
    }, extra || {});
  }
  function canWin(m, seat, winType, tileId, extra) {
    const r = m.round, p = r.players[seat];
    const ctx = makeWinContext(m, seat, winType, tileId, extra);
    if (!winShapeOk(r, p, ctx.handIds)) return null;
    if (winType === 'ron' && isFuriten(r, p)) return null;
    const ev = MJ2.Yaku.evaluateWinLegality(m, seat, ctx);
    if (!ev || !ev.legal) return null;
    return ev;
  }

  // ---------------- options ----------------
  function actionOptions(m, seat) {
    const r = m.round, p = r.players[seat];
    const opts = { type: 'action', seat, discards: [], riichi: [], ankan: [], kakan: [], tsumo: false, mustDiscard: p.mustDiscard };
    const live = liveRemaining(r);
    if (!p.mustDiscard) {
      const tsumoCtx = tsumoExtra(m, seat);
      opts.tsumo = !!canWin(m, seat, 'tsumo', p.lastDrawId, tsumoCtx);
    }
    // discards
    if (p.riichi) {
      opts.discards = p.mustDiscard ? p.hand.slice() : [p.lastDrawId];
    } else {
      opts.discards = p.hand.filter((id) => !p.kuikaeKinds.includes(id >> 2));
      if (opts.discards.length === 0) opts.discards = p.hand.slice();
    }
    // riichi
    if (!p.riichi && !p.mustDiscard && isMenzen(p)) {
      const seenKinds = new Set();
      for (const id of p.hand) {
        const k = id >> 2;
        const rest = p.hand.filter((x) => x !== id);
        const ok = seenKinds.has(k) ? opts.riichi.some((x) => (x >> 2) === k) : (() => {
          const c = T.countsOfIds(rest);
          const own = T.countsOfIds(rest.concat(p.melds.flatMap((x) => x.tileIds)));
          if (H.waits(c, p.melds.length, own).length > 0) return true;
          return jackpotWait(r, { melds: p.melds, hand: rest }) != null; // ジャックポットあと1枚でもリーチ可
        })();
        seenKinds.add(k);
        if (ok) opts.riichi.push(id);
      }
    }
    // kans
    const canKan = !p.mustDiscard && r.kanCount < 4 && live >= 1 && r.rinshanUsed < 4;
    if (canKan) {
      const c = T.countsOfIds(p.hand);
      for (let k = 0; k < 34; k++) {
        if (c[k] !== 4) continue;
        if (p.riichi) {
          if ((p.lastDrawId >> 2) !== k) continue;
          const rest = p.hand.filter((id) => (id >> 2) !== k);
          const rc = T.countsOfIds(rest);
          const w = H.waits(rc, p.melds.length + 1, T.countsOfIds(ownedIds(p)));
          if (w.join(',') !== p.waits.join(',')) continue;
          // must still decompose: keep simple
        }
        opts.ankan.push(k);
      }
      if (!p.riichi) {
        for (const md of p.melds) {
          if (md.type !== 'pon') continue;
          const k = md.tileIds[0] >> 2;
          const id = p.hand.find((x) => (x >> 2) === k);
          if (id != null) opts.kakan.push(id);
        }
      }
    }
    return opts;
  }
  function tsumoExtra(m, seat) {
    const r = m.round, p = r.players[seat];
    return {
      rinshan: p.lastDrawSource === 'rinshan',
      haitei: p.lastDrawSource === 'live' && liveRemaining(r) === 0,
      firstDraw: p.normalDrawCount === 1 && p.discardCount === 0 && !r.anyCall && p.melds.length === 0
    };
  }

  function callOptionsFor(m, seat, discarder, tileId, isChankan) {
    const r = m.round, p = r.players[seat];
    if (!p.active || seat === discarder) return null;
    const o = { type: 'call', seat, ron: false, pon: false, minkan: false, chi: [], tileId, discarder, isChankan: !!isChankan };
    const k = tileId >> 2;
    const extra = { houtei: liveRemaining(r) === 0 && !isChankan, chankan: !!isChankan, fromSeat: discarder };
    o.ronShape = winShapeOk(r, p, p.hand.concat([tileId]));
    o.ron = !!canWin(m, seat, 'ron', tileId, extra);
    if (!isChankan && liveRemaining(r) > 0 && !p.riichi) {
      const same = p.hand.filter((id) => (id >> 2) === k);
      if (same.length >= 2) o.pon = true;
      if (same.length >= 3 && r.kanCount < 4 && r.rinshanUsed < 4) o.minkan = true;
      if (seat === nextActive(r, discarder) && k < 27) {
        const n = k % 9;
        const has = (kk) => p.hand.find((id) => (id >> 2) === kk);
        const pairs = [];
        if (n >= 2) pairs.push([k - 2, k - 1]);
        if (n >= 1 && n <= 7) pairs.push([k - 1, k + 1]);
        if (n <= 6) pairs.push([k + 1, k + 2]);
        for (const [a, b] of pairs) {
          const ia = has(a), ib = has(b);
          if (ia != null && ib != null) {
            // kuikae: must have another legal discard afterwards
            const rest = p.hand.filter((x) => x !== ia && x !== ib);
            const ban = chiKuikae(k, a, b);
            if (rest.some((x) => !ban.includes(x >> 2))) o.chi.push([ia, ib]);
          }
        }
      }
      if (o.pon) {
        const rest = p.hand.filter((x) => (x >> 2) !== k);
        if (rest.length === 0) o.pon = false;
      }
    }
    if (!o.ron && !o.pon && !o.minkan && o.chi.length === 0) {
      return o.ronShape ? o : null; // shape-only (no yaku / furiten) still needs pass for furiten handling
    }
    return o;
  }
  function chiKuikae(k, a, b) {
    const lo = Math.min(k, a, b), hi = Math.max(k, a, b);
    const ban = [k];
    if (k === lo && hi % 9 <= 7 && hi + 1 < 27 && Math.floor((hi + 1) / 9) === Math.floor(k / 9)) ban.push(hi + 1);
    if (k === hi && lo % 9 >= 1) ban.push(lo - 1);
    return ban;
  }

  // ---------------- advancing ----------------
  // runs automatic steps; stops when a decision is pending or round ended
  function advance(m) {
    const r = m.round;
    let guard = 0;
    while (!r.ended && !r.pending) {
      if (++guard > 1000) throw new Error('advance loop guard');
      if (r.phase === 'draw') {
        if (activeSeats(r).length === 0) { endRound(m, 'all_won'); break; }
        // 最後の一人は和了できない: 和了が上限（初期3人）に達したらその局は終了
        if (r.winOrder.length >= (cfg().maxWinnersPerRound ?? 3)) { endRound(m, 'three_won'); break; }
        if (!r.players[r.turnSeat].active) r.turnSeat = nextActive(r, r.turnSeat);
        if (liveRemaining(r) <= 0) { endRound(m, 'exhausted'); break; }
        drawTile(m, r.turnSeat, 'live');
        r.phase = 'action';
      } else if (r.phase === 'action') {
        r.pending = actionOptions(m, r.turnSeat);
        if (r.pending.tsumo) pushEvent(m, { type: 'LEGAL_TSUMO_OFFER', seat: r.turnSeat, tileId: r.players[r.turnSeat].lastDrawId });
      } else if (r.phase === 'call') {
        const cw = r.callWindow;
        const nextSeat = cw.order.find((s) => !(s in cw.responses));
        if (nextSeat == null) { resolveCalls(m); continue; }
        r.pending = cw.options[nextSeat];
      } else {
        throw new Error('bad phase ' + r.phase);
      }
    }
    return r.pending;
  }

  function drawTile(m, seat, source) {
    const r = m.round, p = r.players[seat];
    let id;
    if (source === 'live') { id = r.live[r.livePtr++]; p.normalDrawCount++; }
    else { id = r.dead[r.rinshanUsed++]; }
    p.hand.push(id);
    p.hand = T.sortIds(p.hand);
    p.drawCount++;
    p.lastDrawId = id;
    p.lastDrawSource = source;
    p.mustDiscard = false;
    p.kuikaeKinds = [];
    if (!p.riichi) p.furitenTemp = false; // temporary furiten lasts until own next turn
    pushEvent(m, { type: 'DRAW', seat, tileId: id, source, drawNo: p.drawCount, normalDrawNo: source === 'live' ? p.normalDrawCount : null, lastLive: source === 'live' && liveRemaining(r) === 0 });
  }

  function apply(m, decision) {
    const r = m.round;
    const pend = r.pending;
    if (!pend) throw new Error('no pending decision');
    if (decision.seat != null && decision.seat !== pend.seat) throw new Error('decision seat mismatch');
    r.pending = null;
    if (pend.type === 'action') applyAction(m, pend, decision);
    else applyCallResponse(m, pend, decision);
    advance(m);
    return r.pending;
  }

  function applyAction(m, pend, d) {
    const r = m.round, seat = pend.seat, p = r.players[seat];
    if (d.type === 'tsumo') {
      if (!pend.tsumo) throw new Error('illegal tsumo');
      doWin(m, seat, 'tsumo', p.lastDrawId, tsumoExtra(m, seat));
      r.phase = 'draw';
      r.turnSeat = nextActive(r, seat);
      return;
    }
    if (pend.tsumo) pushEvent(m, { type: 'DECLINE_TSUMO', seat, tileId: p.lastDrawId });
    if (d.type === 'ankan') {
      if (!pend.ankan.includes(d.kind)) throw new Error('illegal ankan');
      const ids = p.hand.filter((id) => (id >> 2) === d.kind);
      p.hand = p.hand.filter((id) => (id >> 2) !== d.kind);
      const md = { id: r.roundId + ':M' + seat + '-' + p.melds.length, type: 'ankan', tileIds: ids, fromSeat: seat, calledTileId: null, turn: p.drawCount };
      p.melds.push(md);
      kanCommon(m, seat, md, 'ANKAN');
      return;
    }
    if (d.type === 'kakan') {
      if (!pend.kakan.includes(d.tileId)) throw new Error('illegal kakan');
      const k = d.tileId >> 2;
      const md = p.melds.find((x) => x.type === 'pon' && (x.tileIds[0] >> 2) === k);
      p.hand = p.hand.filter((x) => x !== d.tileId);
      const ev = pushEvent(m, { type: 'KAKAN_DECLARE', seat, tileId: d.tileId, meldId: md.id });
      // chankan window
      openCallWindow(m, seat, d.tileId, true, { meldId: md.id, declareEventId: ev.id });
      return;
    }
    if (d.type === 'discard') {
      const id = d.tileId;
      if (d.riichi) { if (!pend.riichi.includes(id)) throw new Error('illegal riichi discard'); }
      else if (!pend.discards.includes(id)) throw new Error('illegal discard');
      doDiscard(m, seat, id, !!d.riichi);
      return;
    }
    throw new Error('unknown action ' + d.type);
  }

  function kanCommon(m, seat, md, evType) {
    const r = m.round, p = r.players[seat];
    r.kanCount++;
    r.anyCall = true;
    for (const q of r.players) if (q.riichi) q.riichi.ippatsu = false;
    pushEvent(m, { type: evType, seat, tileIds: md.tileIds.slice(), meldId: md.id, fromSeat: md.fromSeat, calledTileId: md.calledTileId, tileId: md.tileIds[0] });
    // replenish dead wall from live wall end; reveal new dora
    r.liveEnd--;
    r.doraCount = Math.min(5, r.doraCount + 1);
    drawTile(m, seat, 'rinshan');
    r.turnSeat = seat;
    r.phase = 'action';
  }

  function doDiscard(m, seat, id, riichi) {
    const r = m.round, p = r.players[seat];
    const tsumogiri = id === p.lastDrawId && !p.mustDiscard;
    const wasFirst = p.discardCount === 0;
    p.hand = p.hand.filter((x) => x !== id);
    if (p.riichi && p.riichi.ippatsu && p.riichi.declaredDiscardNo !== p.discardCount + 1) p.riichi.ippatsu = false;
    p.discardCount++;
    p.mustDiscard = false;
    p.kuikaeKinds = [];
    if (riichi) {
      const dbl = wasFirst && !r.anyCall;
      const rev = pushEvent(m, { type: 'RIICHI_DECLARED', seat, tileId: id, double: dbl, lastLiveTurn: p.lastDrawSource === 'live' && liveRemaining(r) === 0 && r.live[r.livePtr - 1] === p.lastDrawId });
      p.riichi = { eventId: rev.id, double: dbl, ippatsu: true, declaredDiscardNo: p.discardCount, tileId: id, turnDraw: p.drawCount };
    }
    const ev = pushEvent(m, { type: 'DISCARD', seat, tileId: id, tsumogiri, discardNo: p.discardCount, riichi: !!riichi });
    p.discards.push({ tileId: id, eventId: ev.id, calledBy: null, ronBy: [], riichi: !!riichi, tsumogiri });
    r.lastDiscard = { seat, tileId: id, eventId: ev.id };
    recordTenpai(m, seat, 'discard');
    openCallWindow(m, seat, id, false, null);
  }

  function openCallWindow(m, discarder, tileId, isChankan, chankanInfo) {
    const r = m.round;
    const options = {};
    const order = [];
    for (let k = 1; k < 4; k++) {
      const s = (discarder + k) % 4;
      const o = callOptionsFor(m, s, discarder, tileId, isChankan);
      if (o) { options[s] = o; order.push(s); if (o.ron) pushEvent(m, { type: 'LEGAL_RON_OFFER', seat: s, tileId, sourceSeat: discarder }); }
    }
    r.callWindow = { discarder, tileId, isChankan, chankanInfo, options, order, responses: {} };
    r.phase = 'call';
  }

  function applyCallResponse(m, pend, d) {
    const r = m.round, cw = r.callWindow;
    const o = cw.options[pend.seat];
    const t = d.type;
    if (t === 'ron' && !o.ron) throw new Error('illegal ron');
    if (t === 'pon' && !o.pon) throw new Error('illegal pon');
    if (t === 'minkan' && !o.minkan) throw new Error('illegal minkan');
    if (t === 'chi') {
      if (!o.chi.some((pair) => pair[0] === d.tileIds[0] && pair[1] === d.tileIds[1])) throw new Error('illegal chi');
    }
    cw.responses[pend.seat] = d;
  }

  function resolveCalls(m) {
    const r = m.round, cw = r.callWindow;
    r.callWindow = null;
    const discarder = cw.discarder;
    const dp = r.players[discarder];
    const rons = cw.order.filter((s) => cw.responses[s] && cw.responses[s].type === 'ron');
    // furiten from passing a winning tile
    for (const s of cw.order) {
      const o = cw.options[s];
      const resp = cw.responses[s];
      if (o.ronShape && (!resp || resp.type !== 'ron')) {
        const p = r.players[s];
        if (o.ron) pushEvent(m, { type: 'DECLINE_RON', seat: s, tileId: cw.tileId, sourceSeat: discarder });
        if (p.riichi) p.furitenPermanent = true; else p.furitenTemp = true;
      }
    }
    if (rons.length) {
      const entry = cw.isChankan ? null : dp.discards[dp.discards.length - 1];
      for (const s of rons) {
        const extra = { houtei: liveRemaining(r) === 0 && !cw.isChankan, chankan: cw.isChankan, fromSeat: discarder };
        doWin(m, s, 'ron', cw.tileId, extra);
        if (entry) entry.ronBy.push(s);
      }
      if (cw.isChankan) {
        // robbed kakan tile: kan is not formed; the tile goes to the declarer's discard history
        const ev = pushEvent(m, { type: 'CHANKAN_ROBBED', seat: discarder, tileId: cw.tileId, targetSeats: rons.slice() });
        dp.discards.push({ tileId: cw.tileId, eventId: ev.id, calledBy: null, ronBy: rons.slice(), riichi: false, tsumogiri: false, chankan: true });
        dp.discardCount++;
        recordTenpai(m, discarder, 'discard');
      }
      r.phase = 'draw';
      r.turnSeat = nextActive(r, discarder);
      if (r.turnSeat < 0) r.turnSeat = discarder;
      return;
    }
    if (cw.isChankan) {
      // complete the kakan
      const p = dp;
      const md = p.melds.find((x) => x.id === cw.chankanInfo.meldId);
      md.type = 'kakan';
      md.tileIds.push(cw.tileId);
      md.addedTileId = cw.tileId;
      kanCommon(m, discarder, md, 'KAKAN');
      return;
    }
    // pon / minkan priority over chi
    let caller = null, resp = null;
    for (const s of cw.order) {
      const rr = cw.responses[s];
      if (rr && (rr.type === 'pon' || rr.type === 'minkan')) { caller = s; resp = rr; break; }
    }
    if (caller == null) {
      for (const s of cw.order) { const rr = cw.responses[s]; if (rr && rr.type === 'chi') { caller = s; resp = rr; break; } }
    }
    if (caller == null) {
      r.phase = 'draw';
      r.turnSeat = nextActive(r, discarder);
      return;
    }
    const p = r.players[caller];
    const tileId = cw.tileId, k = tileId >> 2;
    const entry = dp.discards[dp.discards.length - 1];
    entry.calledBy = caller;
    r.anyCall = true;
    for (const q of r.players) if (q.riichi) q.riichi.ippatsu = false;
    let used;
    if (resp.type === 'chi') used = resp.tileIds.slice();
    else used = p.hand.filter((id) => (id >> 2) === k).slice(0, resp.type === 'pon' ? 2 : 3);
    p.hand = p.hand.filter((id) => !used.includes(id));
    const type = resp.type === 'minkan' ? 'minkan' : resp.type;
    const md = { id: r.roundId + ':M' + caller + '-' + p.melds.length, type, tileIds: T.sortIds(used.concat([tileId])), fromSeat: discarder, calledTileId: tileId, turn: p.drawCount, discardEventId: entry.eventId };
    p.melds.push(md);
    if (type === 'minkan') {
      kanCommon(m, caller, md, 'MINKAN');
      return;
    }
    pushEvent(m, { type: type.toUpperCase(), seat: caller, tileId, tileIds: md.tileIds.slice(), meldId: md.id, fromSeat: discarder, calledTileId: tileId, discardEventId: entry.eventId });
    p.mustDiscard = true;
    p.kuikaeKinds = type === 'chi' ? chiKuikae(k, used[0] >> 2, used[1] >> 2) : [k];
    r.turnSeat = caller;
    r.phase = 'action';
  }

  function doWin(m, seat, winType, tileId, extra) {
    const r = m.round, p = r.players[seat];
    const ctx = makeWinContext(m, seat, winType, tileId, extra);
    const ev = pushEvent(m, {
      type: winType === 'ron' ? 'WIN_RON' : 'WIN_TSUMO', seat, tileId,
      sourceSeat: winType === 'ron' ? extra.fromSeat : seat,
      rinshan: !!extra.rinshan, haitei: !!extra.haitei, houtei: !!extra.houtei, chankan: !!extra.chankan,
      winOrder: r.winOrder.length + 1
    });
    r.winOrder.push(seat);
    p.winOrder = r.winOrder.length;
    p.active = false;
    p.winSnapshot = {
      snapshotId: ev.id,
      handIds: T.sortIds(ctx.handIds),
      concealedIds: T.sortIds(ctx.handIds),
      melds: JSON.parse(JSON.stringify(p.melds)),
      winTileId: tileId,
      winType,
      fromSeat: winType === 'ron' ? extra.fromSeat : null,
      eventId: ev.id,
      eventSeq: ev.seq,
      rinshan: !!extra.rinshan, haitei: !!extra.haitei, houtei: !!extra.houtei, chankan: !!extra.chankan,
      firstDraw: !!extra.firstDraw,
      ippatsu: !!(p.riichi && p.riichi.ippatsu),
      doraIndicators: doraIndicators(r),
      uraIndicators: p.riichi ? uraIndicators(r) : [],
      live: liveRemaining(r),
      winOrder: p.winOrder
    };
    if (winType === 'tsumo') {
      // winner keeps the drawn tile physically
    }
  }

  function endRound(m, reason) {
    const r = m.round;
    r.ended = true;
    r.phase = 'ended';
    r.endReason = reason;
    r.pending = null;
    pushEvent(m, { type: 'ROUND_END', seat: null, reason, winOrder: r.winOrder.slice() });
    assertTileInvariant(m);
    // settle once
    const settlement = MJ2.Settlement.computeRound(m);
    MJ2.Settlement.applyRound(m, settlement);
    m.phase = 'settlement';
    m.pendingSettlement = settlement.id;
    m.presentationCursor = { settlementId: settlement.id, playerIdx: 0, step: 0 };
  }

  // 破産: 東場終了時（東四局の精算後）に主人公の所持金が0円以下ならゲームオーバー
  function checkBankrupt(m) {
    const b = cfg().bankruptcy;
    if (!b || !b.enabled || !m.cumulativeYen) return false;
    const lab = m.rounds[m.roundIndex];
    if (lab !== (b.checkAfterRound || 'E4')) return false;
    const seat = m.humanSeats[0];
    if (m.cumulativeYen[seat] > (b.threshold ?? 0)) return false;
    m.bankrupt = { seat, at: lab, money: m.cumulativeYen[seat], points: m.cumulativeScores[seat] };
    return true;
  }
  function nextRoundOrEnd(m) {
    if (checkBankrupt(m)) {
      m.phase = 'match_end';
      m.round = null;
      m.pendingSettlement = null;
      m.presentationCursor = null;
      return 'bankrupt';
    }
    if (m.roundIndex + 1 >= m.rounds.length) {
      MJ2.Settlement.applyTripleCrown(m); // 三冠王は最終順位の前に１回だけ加算
      m.phase = 'match_end';
      m.round = null;
      m.pendingSettlement = null;
      m.presentationCursor = null;
      return 'match_end';
    }
    m.roundIndex++;
    startRound(m);
    m.phase = 'round';
    return 'round';
  }

  // events for one seat, optionally up to seq
  function seatEvents(r, seat, uptoSeq) {
    return r.events.filter((e) => e.seat === seat && (uptoSeq == null || e.seq <= uptoSeq));
  }

  MJ2.Engine = {
    SCHEMA, CALL_TYPES,
    newMatch, startRound, advance, apply, nextRoundOrEnd, endRound,
    liveRemaining, activeSeats, nextActive, prevActive, seatWind, doraIndicators, uraIndicators,
    ownedIds, isMenzen, openMeldCount, assertTileInvariant, standardWaits, jackpotWait, isJackpotShape,
    seatEvents, ronRecipients, isHuman, actionOptions, isFuriten
  };
})(typeof window !== 'undefined' ? window : globalThis);
