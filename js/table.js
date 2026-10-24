/* 麻雀2 Table: view-model rebuilt from the event log, rendering, game driver, human input. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const { el, img, wait } = MJ2.dom;
  const T = MJ2.T, E = MJ2.Engine;
  const UI = MJ2.UI;

  const FRAMES = [{ x: 2, y: 294 }, { x: 597, y: 294 }, { x: 597, y: 90 }, { x: 2, y: 90 }]; // pos0 bottom-left (you), pos1 right, pos2 top, pos3 left
  const ROT = [0, -90, 180, 90];
  const CALL_XY = [[200, 380], [560, 330], [560, 160], [170, 160]];
  const CUT_XY = [[130, 300], [470, 300], [470, 96], [130, 96]];

  const Table = { token: 0, vm: null, seq: 0, root: null };
  MJ2.Table = Table;
  function pos(seat) { return (seat - 0 + 4) % 4; } // human sits at seat 0

  // ---------------- view model ----------------
  function newVM(r) {
    return { seats: [0, 1, 2, 3].map(() => ({ hand: [], melds: [], river: [], won: false, winType: null, riichi: false, drawn: null, winTile: null })), live: 70, doraCount: 1, turn: r.dealer, last: null, kakan: {} };
  }
  function vmApply(vm, e) {
    const S = e.seat != null ? vm.seats[e.seat] : null;
    if (e.live != null) vm.live = e.live;
    switch (e.type) {
      case 'DEAL': S.hand = e.tileIds.slice(); break;
      case 'DRAW': S.hand.push(e.tileId); S.drawn = e.tileId; vm.turn = e.seat; break;
      case 'DISCARD': S.hand = S.hand.filter((x) => x !== e.tileId); S.drawn = null; S.river.push({ id: e.tileId, riichi: !!e.riichi }); vm.last = { seat: e.seat, id: e.tileId }; break;
      case 'RIICHI_DECLARED': S.riichi = true; break;
      case 'CHI': case 'PON': case 'MINKAN': {
        S.hand = S.hand.filter((x) => !e.tileIds.includes(x));
        S.melds.push({ type: e.type.toLowerCase(), tileIds: e.tileIds.slice(), calledTileId: e.calledTileId, fromSeat: e.fromSeat });
        const R = vm.seats[e.fromSeat].river; const it = R.find((x) => x.id === e.calledTileId); if (it) it.called = true;
        vm.turn = e.seat; S.drawn = null;
        if (e.type === 'MINKAN') vm.doraCount = Math.min(5, vm.doraCount + 1);
        break;
      }
      case 'ANKAN': S.hand = S.hand.filter((x) => !e.tileIds.includes(x)); S.melds.push({ type: 'ankan', tileIds: e.tileIds.slice(), fromSeat: e.seat }); vm.doraCount = Math.min(5, vm.doraCount + 1); S.drawn = null; break;
      case 'KAKAN_DECLARE': S.hand = S.hand.filter((x) => x !== e.tileId); S.drawn = null; break;
      case 'KAKAN': { const md = S.melds.find((x) => x.type === 'pon' && (x.tileIds[0] >> 2) === (e.tileIds[0] >> 2)); if (md) { md.type = 'kakan'; md.tileIds = e.tileIds.slice(); md.added = e.tileIds.find((x) => !md.tileIds.includes(x)); } vm.doraCount = Math.min(5, vm.doraCount + 1); break; }
      case 'CHANKAN_ROBBED': S.river.push({ id: e.tileId, ronned: true }); break;
      case 'WIN_RON': {
        S.won = true; S.winType = 'ron'; S.winTile = e.tileId;
        const it = vm.seats[e.sourceSeat].river.find((x) => x.id === e.tileId); if (it) it.ronned = true;
        break;
      }
      case 'WIN_TSUMO': S.won = true; S.winType = 'tsumo'; S.winTile = e.tileId; break;
      default: break;
    }
  }
  function buildVM(m) {
    const r = m.round; const vm = newVM(r);
    for (const e of r.events) vmApply(vm, e);
    return vm;
  }

  // ---------------- rendering ----------------
  const W = { back: 12, backH: 17, meld: 15, meldH: 20 };
  // pinwheel layout (like a real table): each river starts at the left edge of the center box, so rivers never overlap
  const RIVER = { width: 144, depth: 99, offset: 45, left: -42 };
  function tileEl(id, parent, x, y, w, h, extraCls) {
    const i = img(id === -1 ? UI.backSrc() : UI.tileSrcId(id), extraCls || '', parent, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    return i;
  }
  function renderStatic(s, m) {
    img(MJ2.DATA.common.background.file, 'tbl-bg', s);
    const r = m.round;
    Table.top = {
      round: el('div', 'topcell f-brush', s, { left: '6px', width: '118px', fontSize: '15px' }),
      live: el('div', 'topcell', s, { left: '140px', width: '140px' }),
      dora: el('div', 'topcell', s, { left: '305px', width: '275px', textAlign: 'left', paddingLeft: '10px' }),
    };
    const menuBtn = el('div', 'topcell', s, { left: '595px', width: '115px', cursor: 'pointer', color: '#f6d77e' });
    menuBtn.textContent = '≡ メニュー';
    menuBtn.addEventListener('click', openMenu);
    const band = el('div', 'jp-band', s);
    const lab = el('div', 'jp-label', band);
    Table.jpLab = lab;
    Table.jpTiles = el('div', 'jp-tiles', band);
    Table.frames = [0, 1, 2, 3].map((seat) => {
      const f = FRAMES[pos(seat)];
      const fr = el('div', 'seat-frame', s, { left: f.x + 'px', top: f.y + 'px' });
      img(UI.faceSrc(m.roster[seat]), 'face', fr);
      const nm = el('div', 'nameplate', fr); nm.textContent = UI.charName(m.roster[seat]);
      if (nm.textContent.length > 9) nm.style.fontSize = '8px';
      fr.strip = el('div', 'strip', fr);
      if (E.isHuman(m, seat)) { fr.classList.add('me'); el('div', 'youmark', fr).textContent = 'YOU'; } // 対局中も自分の席に YOU
      return fr;
    });
    Table.felt = el('div', 'felt', s);
    Table.areas = [0, 1, 2, 3].map((seat) => el('div', 'seat-area', Table.felt, { transform: `rotate(${ROT[pos(seat)]}deg)` }));
    Table.center = el('div', 'center-box', Table.felt);
    Table.handEl = el('div', 'hand', s);
    Table.hint = el('div', 'hint', s);
    Table.actions = el('div', 'actions', s);
    Table.waitBox = el('div', 'waitbox hidden', s);
    Table.waitKey = null;
  }
  function render() {
    const m = UI.match, r = m.round, vm = Table.vm;
    if (!r || !vm) return;
    try { renderWaits(); } catch (e) { /* display only */ }
    UI.setGoldTargets(r.jackpotTargets);
    const winds = T.WIND_JA;
    const RT = MJ2.Settlement.currentRate(m);
    Table.top.round.innerHTML = winds[r.roundWind] + ['一', '二', '三', '四'][r.dealer] + '局' + (RT.mult > 1 ? `<span class="mult">×${RT.mult}</span>` : '');
    if (Table.jpLab) { const t = 'SUPER JACKPOT<b>' + MJ2.util.pts(MJ2.DATA.config.superJackpotPoints) + '</b>'; if (Table.jpLab.innerHTML !== t) Table.jpLab.innerHTML = t; }
    Table.top.live.textContent = '残り ' + vm.live + '枚';
    // dora indicators
    const D = Table.top.dora; D.innerHTML = '';
    el('span', '', D, { marginRight: '6px' }).textContent = 'ドラ表示';
    const inds = r.dead.slice(4, 4 + vm.doraCount);
    for (const id of inds) img(UI.tileSrcId(id), '', D, { width: '14px', height: '19px', verticalAlign: 'middle', marginRight: '2px' });
    // jackpot band
    // all 14 targets in gold; kinds I hold (concealed hand) glow, others sit in a slightly darker slot
    const held = new Set(vm.seats[0].hand.map((id) => id >> 2));
    const key = r.roundId + ':' + [...held].sort().join(',');
    if (Table.jpDrawn !== key) {
      Table.jpTiles.innerHTML = '';
      for (const k of r.jackpotTargets) { const w = el('span', 'jp-slot' + (held.has(k) ? ' held' : ''), Table.jpTiles); img(UI.goldSrc(k, true), '', w); }
      Table.jpDrawn = key;
    }
    // frames
    // 局が終わってから精算画面が出るまでは、局の前の持ち点のまま（点数は精算で動かす）
    const pendS = m.pendingSettlement && (m.settlements || []).find((x) => x.id === m.pendingSettlement);
    for (let seat = 0; seat < 4; seat++) {
      const fr = Table.frames[seat], S = vm.seats[seat];
      const sw = E.seatWind(r, seat);
      const shown = pendS && pendS.results[seat] && pendS.results[seat].cumulativeBefore != null ? pendS.results[seat].cumulativeBefore : m.cumulativeScores[seat];
      fr.strip.innerHTML = `<span class="w">${winds[sw]}</span><span class="sc${shown < 0 ? ' neg' : ''}">${MJ2.util.pts(shown)}</span>`;
      let wb = fr.querySelector('.wind-badge');
      if (!wb) wb = el('div', 'wind-badge', fr);
      wb.textContent = winds[sw];
      wb.classList.toggle('me', seat === 0);
      fr.classList.toggle('turn', !S.won && vm.turn === seat && !r.ended);
      fr.classList.toggle('is-won', S.won);
      let won = fr.querySelector('.won');
      if (S.won && !won) { won = el('div', 'won', fr); won.textContent = '和了'; }
      if (!S.won && won) won.remove();
      let st = fr.querySelector('.riichi-stick');
      if (S.riichi && !st && !S.won) el('div', 'riichi-stick', fr);
      if ((!S.riichi || S.won) && st) st.remove();
      let dl = fr.querySelector('.dealer');
      if (seat === r.dealer && !dl) { dl = el('div', 'dealer', fr); dl.textContent = '親'; }
      if (seat !== r.dealer && dl) dl.remove();
    }
    // center compass
    const C = Table.center; C.innerHTML = '';
    const cpos = [[31, 62], [62, 31], [31, 0], [0, 31]];
    for (let seat = 0; seat < 4; seat++) {
      const p = cpos[pos(seat)];
      const w = el('div', 'w' + (vm.turn === seat && !vm.seats[seat].won ? ' cur' : '') + (vm.seats[seat].won ? ' out' : ''), C, { left: p[0] + 'px', top: p[1] + 'px', transform: `rotate(${ROT[pos(seat)]}deg)` });
      w.textContent = winds[E.seatWind(r, seat)];
    }
    el('div', 'cnt', C).textContent = vm.live;
    el('div', 'cntl', C).textContent = '残り';
    // seat areas
    for (let seat = 0; seat < 4; seat++) renderArea(seat);
    renderHand();
  }
  function riverLayout(n) {
    for (let rl = 6; rl <= 16; rl++) {
      const w = RIVER.width / rl, h = w * 1.36;
      if (Math.ceil(Math.max(1, n) / rl) * h <= RIVER.depth) return { rl, w, h };
    }
    return { rl: 16, w: RIVER.width / 16, h: RIVER.width / 16 * 1.36 };
  }
  function renderArea(seat) {
    const A = Table.areas[seat], S = Table.vm.seats[seat];
    A.innerHTML = '';
    const Rv = el('div', 'river', A, { left: RIVER.left + 'px', top: RIVER.offset + 'px' });
    const L = riverLayout(S.river.length);
    let x = 0, row = 0;
    S.river.forEach((d, i) => {
      if (i > 0 && i % L.rl === 0) { row++; x = 0; }
      const y = row * L.h;
      let t;
      if (d.riichi) { t = img(UI.tileRotSrc(d.id >> 2, 'east'), 'riichi-tile', Rv, { left: x + 'px', top: (y + (L.h - L.w)) + 'px', width: L.h + 'px', height: L.w + 'px' }); x += L.h; }
      else { t = tileEl(d.id, Rv, x, y, L.w, L.h); x += L.w; }
      t.dataset.rid = d.id;
      if (d.called) t.classList.add('called');
      if (d.ronned) t.classList.add('ronned');
      const last = Table.vm.last;
      if (last && last.id === d.id && i === S.river.length - 1) t.classList.add('last');
      if (Table.focusTileId === d.id) {
        t.classList.add('callfocus');
        const ar = el('div', 'focus-arrow', Rv, { left: (x - L.w / 2 - 7) + 'px', top: (y - 18) + 'px' }); ar.textContent = '▼';
      }
    });
    if (seat === 0) return; // human hand rendered separately
    // opponents: hidden hand (backs) + open melds (bigger, called tile sideways + caller-source face)
    const row2 = el('div', 'meldrow', A, { left: '0', top: (RIVER.offset + RIVER.depth + 3) + 'px' });
    const meldW = (md) => md.tileIds.length * W.meld + (md.calledTileId != null ? W.meldH - W.meld : 0) + 6;
    const total = S.hand.length * W.back + 8 + S.melds.reduce((a, md) => a + meldW(md), 0);
    let xx = -total / 2;
    for (let i = 0; i < S.hand.length; i++) { tileEl(-1, row2, xx, W.meldH - W.backH, W.back, W.backH); xx += W.back; }
    xx += 8;
    for (const md of S.melds) xx = drawMeld(row2, md, seat, xx, 0, W.meld, W.meldH, true) + 6;
  }
  // draws a meld at x, returns new x. Called tile is laid sideways at the position that shows the source
  // (left = 上家, middle = 対面, right = 下家), with the source's face above it.
  function drawMeld(parent, md, seat, x, yTop, w, h, small) {
    const called = md.calledTileId;
    const rel = called != null ? (md.fromSeat - seat + 4) % 4 : 0; // 1=下家 2=対面 3=上家
    const ids = md.tileIds.slice();
    if (md.type === 'ankan') {
      ids.forEach((id, i) => { tileEl(i === 0 || i === 3 ? -1 : id, parent, x, yTop, w, h); x += w; });
      return x;
    }
    let order = ids.filter((id) => id !== called);
    if (called != null) {
      const at = rel === 3 ? 0 : rel === 2 ? 1 : order.length;
      order.splice(at, 0, called);
    }
    for (const id of order) {
      if (id === called) {
        img(UI.tileRotSrc(id >> 2, 'east'), 'called-side', parent, { left: x + 'px', top: (yTop + h - w) + 'px', width: h + 'px', height: w + 'px' });
        const fs = small ? 12 : 16;
        const f = img(UI.faceSrc(UI.match.roster[md.fromSeat]), 'srcface', parent, { left: (x + (h - fs) / 2) + 'px', top: (yTop + h - w - fs - 1) + 'px', width: fs + 'px', height: fs + 'px' });
        f.title = '鳴いた相手';
        x += h;
      } else { tileEl(id, parent, x, yTop, w, h); x += w; }
    }
    return x;
  }

  // ---------------- human hand ----------------
  let input = null; // {pend, resolve, sel, mode:'discard'|'riichi'}
  function renderHand() {
    const H = Table.handEl, S = Table.vm.seats[0];
    H.innerHTML = '';
    const r = UI.match.round;
    let hand = T.sortIds(S.hand);
    let drawn = null;
    if (S.drawn != null && S.hand.includes(S.drawn) && S.hand.length % 3 === 2) { drawn = S.drawn; hand = hand.filter((x) => x !== drawn); }
    if (S.won && S.winType === 'ron' && S.winTile != null) drawn = S.winTile;
    const meldTiles = S.melds.reduce((a, md) => a + md.tileIds.length, 0);
    let w = 42;
    const need = (ww) => (hand.length + (drawn != null ? 1 : 0)) * ww + 10 + meldTiles * ww * 0.82 + S.melds.length * (8 + ww * 0.36);
    while (need(w) > 650 && w > 22) w -= 1;
    const h = Math.round(w * 1.36);
    let x = 0;
    const legal = input && input.pend.type === 'action' ? new Set(input.mode === 'riichi' ? input.pend.riichi : input.pend.discards) : null;
    const goldIds = UI.goldIdsFor(hand.concat(drawn != null ? [drawn] : []), S.melds.length > 0);
    const mk = (id, isDrawn) => {
      const t = img(UI.tileSrcIdHd(id, goldIds.has(id)), 't', H, { left: x + 'px', width: w + 'px', height: h + 'px' });
      t.dataset.id = id;
      if (legal) {
        if (!legal.has(id)) t.classList.add('dis');
        else if (input.mode === 'riichi') t.classList.add('lit');
        if (input.sel === id) t.classList.add('sel');
        t.addEventListener('click', () => onTileClick(id));
      }
      if (Table.usableIds && Table.usableIds.has(id)) t.classList.add('usable');
      if (S.won) t.style.filter = 'brightness(.9)';
      x += w;
    };
    hand.forEach((id) => mk(id));
    if (drawn != null) { x += 8; mk(drawn, true); }
    // melds on the right
    let mx = 660;
    const mw = Math.round(w * 0.82), mh = Math.round(mw * 1.36);
    for (let i = S.melds.length - 1; i >= 0; i--) {
      const md = S.melds[i];
      const width = md.tileIds.length * mw + (md.calledTileId != null ? (mh - mw) : 0);
      mx -= width;
      const g = el('div', 'meld', H, { position: 'absolute', left: '0', top: '0' });
      drawMeld(g, md, 0, mx, 70 - 4 - mh, mw, mh);
      mx -= 8;
    }
  }
  // after a chance (ツモ/ロン/リーチ) appears, ignore clicks for a moment so rapid clicking can't skip it
  function locked() {
    if (!input || !input.lockUntil) return false;
    if (performance.now() < input.lockUntil) {
      const b = Table.root && Table.root.querySelector('.chance-badge');
      if (b) { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); }
      return true;
    }
    return false;
  }
  function legalFor(id) {
    const pd = input && input.pend;
    if (!pd || pd.type !== 'action') return false;
    return (input.mode === 'riichi' ? pd.riichi : pd.discards).includes(id);
  }
  function onTileClick(id) {
    if (!input || locked()) return;
    if (!legalFor(id)) { // 鳴いた直後の食い替え牌など、捨てられない牌は選ばない
      const kui = input.mode !== 'riichi' && UI.match.round.players[0].kuikaeKinds.includes(id >> 2);
      MJ2.FX.toast(kui ? '鳴いた直後は、その牌（食い替え）は捨てられません' : 'この牌は捨てられません');
      return;
    }
    const mode = UI.settings.discardMode;
    if (mode === 'double') {
      if (input.sel === id) return submitDiscard(id);
      input.sel = id; renderHand(); renderActions();
    } else {
      input.sel = id; renderHand(); renderActions();
    }
  }
  function submitDiscard(id) {
    if (!input || locked()) return;
    if (!legalFor(id)) return;
    const riichi = input.mode === 'riichi';
    const d = { type: 'discard', seat: 0, tileId: id, riichi };
    finishInput(d);
  }
  function finishInput(d) {
    if (!input || locked()) return;
    const res = input.resolve; input = null;
    clearCallFocus();
    Table.hint.textContent = '';
    Table.actions.innerHTML = '';
    renderHand();
    res(d);
  }
  // ---------------- 待ち牌（テンパイ）／イーシャンテン表示（下の枠の右） ----------------
  // 13枚の時に計算して保持し、ツモ後（14枚）は直前の表示を残す。待ちが多い時は2つずつ自動で切り替える。
  function waitState(m) {
    const r = m.round, p = r.players[0];
    if (!r || r.ended || p.winSnapshot) return { mode: 'none' };
    if (p.hand.length % 3 !== 1) return null; // keep the previous display
    const pv = MJ2.Yaku.waitPreview(m, 0);
    if (pv && pv.waits.length) return { mode: 'tenpai', pv };
    const H = MJ2.Hand, c = T.countsOfIds(p.hand);
    const mc = p.melds.length;
    if (H.shanten(c, mc) !== 1) return { mode: 'none' };
    // 受け入れ（シャンテンが下がる牌）の種類と見えていない枚数
    const seen = new Array(34).fill(0);
    p.hand.forEach((id) => seen[id >> 2]++);
    for (const q of r.players) { for (const md of q.melds) md.tileIds.forEach((id) => seen[id >> 2]++); for (const d of q.discards) if (d.calledBy == null) seen[d.tileId >> 2]++; }
    E.doraIndicators(r).forEach((id) => seen[id >> 2]++);
    let kinds = 0, tiles = 0;
    for (let k = 0; k < 34; k++) { if (c[k] >= 4) continue; c[k]++; if (H.shanten(c, mc) < 1) { kinds++; tiles += Math.max(0, 4 - seen[k]); } c[k]--; }
    return { mode: 'iishanten', kinds, tiles };
  }
  function renderWaits() {
    const m = UI.match, r = m.round, B = Table.waitBox;
    if (!B || !r) return;
    const p = r.players[0];
    const key = r.roundId + ':' + p.hand.slice().sort((a, b) => a - b).join(',') + ':' + p.melds.length + ':' + (r.ended ? 1 : 0) + ':' + (p.winSnapshot ? 1 : 0) + ':' + r.doraCount;
    if (Table.waitKey === key) return;
    Table.waitKey = key;
    const st = waitState(m);
    if (!st) return; // 14枚: 直前の表示のまま
    clearInterval(Table.waitTimer);
    B.innerHTML = '';
    if (st.mode === 'none') { B.classList.add('hidden'); return; }
    B.classList.remove('hidden');
    if (st.mode === 'iishanten') {
      B.className = 'waitbox iishan';
      el('div', 'wl', B).textContent = 'イーシャンテン';
      el('div', 'ws', B).textContent = `受け入れ ${st.kinds}種 残り${st.tiles}枚`;
      return;
    }
    B.className = 'waitbox tenpai' + (st.pv.furiten ? ' furiten' : '');
    const head = el('div', 'wh', B);
    head.innerHTML = (p.riichi ? 'リーチ' : 'テンパイ') + '<br>待ち' + (st.pv.furiten ? '<br><b>フリテン</b>' : '');
    const body = el('div', 'wb', B);
    const per = 1, pages = Math.ceil(st.pv.waits.length / per);
    const K = MJ2.Settlement.currentRate(m).yen; // 点→円
    let page = 0;
    const draw = () => {
      body.innerHTML = '';
      for (const w of st.pv.waits.slice(page * per, page * per + per)) {
        const c = el('div', 'wc' + (w.remain === 0 ? ' dead' : ''), body);
        const t = el('div', 'wt', c); img(UI.tileSrcHd(w.kind), '', t); el('div', 'wr', t).textContent = '残' + w.remain;
        const d = el('div', 'wd', c);
        if (w.jackpot) { el('div', 'w1 jp', d).textContent = 'ジャックポット'; el('div', 'w2', d).textContent = MJ2.util.pts(w.points); }
        else if (w.yakuman) { el('div', 'w1 ym', d).textContent = '役満 ' + MJ2.util.pts(w.points); el('div', 'w2', d).textContent = w.names.join('・'); }
        else if (w.legal) { el('div', 'w1', d).textContent = w.han + '翻 ' + MJ2.util.pts(w.points); el('div', 'w2', d).textContent = w.names.concat(w.dora ? ['ドラ' + w.dora] : [], w.gold ? ['黄金ドラ' + w.gold] : []).join('・'); }
        else { el('div', 'w1 none', d).textContent = '役なし'; el('div', 'w2', d).textContent = 'ロンできない'; }
        d.querySelectorAll('.w1').forEach((x) => MJ2.dom.fit(x, 9));
      }
      if (pages > 1) el('div', 'wp', body).textContent = `${page + 1}/${pages}`;
    };
    draw();
    if (pages > 1) Table.waitTimer = setInterval(() => { if (!B.isConnected) { clearInterval(Table.waitTimer); return; } page = (page + 1) % pages; draw(); }, 2200);
  }
  // 鳴き・ロンの選択などでボタンが多い時は、重ならないよう待ち表示を一時的に隠す
  function fitWaitBox() {
    const B = Table.waitBox, A = Table.actions;
    if (!B || !A) return;
    let right = 0;
    for (const b of A.children) right = Math.max(right, b.offsetLeft + b.offsetWidth);
    B.classList.toggle('crowded', A.offsetLeft + right > 460); // 待ち表示の左端(462px)
  }

  function renderActions() {
    const A = Table.actions; A.innerHTML = '';
    if (!input) { fitWaitBox(); return; }
    const p = input.pend;
    const B = (name, enabled, fn, glow) => { const b = UI.imgBtn(name, A, 0, 0, 100, 32, () => { if (!locked()) fn(); }); b.setDisabled(!enabled); if (enabled && glow) b.classList.add('glow'); return b; };
    if (p.type === 'action') {
      B('tsumo', p.tsumo, () => finishInput({ type: 'tsumo', seat: 0 }), true);
      B('riichi', p.riichi.length > 0 && input.mode !== 'riichi', () => { input.mode = 'riichi'; input.sel = null; Table.hint.textContent = 'リーチ：宣言する牌を選んでください'; renderHand(); renderActions(); }, false);
      const kanOpts = p.ankan.map((k) => ({ type: 'ankan', kind: k, show: [k, k, k, k] })).concat(p.kakan.map((id) => ({ type: 'kakan', tileId: id, show: [id >> 2, id >> 2, id >> 2, id >> 2] })));
      B('kan', kanOpts.length > 0, () => pick(kanOpts, (o) => finishInput(o.type === 'ankan' ? { type: 'ankan', seat: 0, kind: o.kind } : { type: 'kakan', seat: 0, tileId: o.tileId })));
      if (input.mode === 'riichi') UI.txtBtn('取消', A, 0, 0, 84, () => { input.mode = 'discard'; input.sel = null; Table.hint.textContent = hintText(); renderHand(); renderActions(); });
      const db = UI.txtBtn('打牌', A, 0, 0, 84, () => { if (input.sel != null) submitDiscard(input.sel); });
      db.disabled = input.sel == null;
    } else {
      B('chi', p.chi.length > 0, () => pick(p.chi.map((pair) => ({ pair, show: [pair[0] >> 2, p.tileId >> 2, pair[1] >> 2].sort((a, b) => a - b) })), (o) => finishInput({ type: 'chi', seat: 0, tileIds: o.pair })));
      B('pon', p.pon, () => finishInput({ type: 'pon', seat: 0 }));
      B('kan', p.minkan, () => finishInput({ type: 'minkan', seat: 0 }));
      B('ron', p.ron, () => finishInput({ type: 'ron', seat: 0 }), true);
      B('pass', true, () => finishInput({ type: 'pass', seat: 0 }));
    }
    fitWaitBox();
  }
  function pick(opts, cb) {
    if (opts.length === 1) return cb(opts[0]);
    const P = el('div', 'panel picker', UI.newScreen ? document.getElementById('game') : null);
    el('div', '', P, { font: '11px MJ2Heavy', marginBottom: '4px' }).textContent = '組み合わせを選んでください';
    for (const o of opts) {
      const d = el('div', 'opt', P);
      for (const k of o.show) img(UI.tileSrc(k), '', d);
      d.addEventListener('click', () => { P.remove(); cb(o); });
    }
    const c = el('div', 'opt', P, { font: '11px MJ2Heavy', padding: '8px' }); c.textContent = 'やめる';
    c.addEventListener('click', () => P.remove());
  }
  function hintText() {
    if (!input) return '';
    if (input.pend.type === 'call') return '';
    return UI.settings.discardMode === 'double' ? '捨てる牌を２回クリック' : '牌を選んで「打牌」';
  }
  const REL = { 1: '下家（右）', 2: '対面（上）', 3: '上家（左）' };
  function clearCallFocus() {
    Table.focusTileId = null; Table.usableIds = null;
    if (Table.root) Table.root.querySelectorAll('.callprompt, .chance-badge').forEach((x) => x.remove());
    if (UI.match && UI.match.round) render();
  }
  function showCallPrompt(pend) {
    const m = UI.match, k = pend.tileId >> 2;
    const rel = (pend.discarder - 0 + 4) % 4;
    Table.focusTileId = pend.tileId;
    const hand = m.round.players[0].hand;
    const use = new Set();
    if (pend.pon || pend.minkan) hand.filter((id) => (id >> 2) === k).forEach((id) => use.add(id));
    for (const pair of pend.chi) pair.forEach((id) => use.add(id));
    Table.usableIds = use;
    const P = el('div', 'callprompt', Table.root);
    img(UI.faceSrc(m.roster[pend.discarder]), 'cp-face', P);
    const t = el('div', 'cp-text', P);
    el('div', 'cp-who', t).textContent = REL[rel] + ' の捨て牌';
    const acts = [pend.ron && 'ロン', pend.pon && 'ポン', pend.chi.length && 'チー', pend.minkan && 'カン'].filter(Boolean);
    el('div', 'cp-act', t).textContent = acts.join('・') + ' できます';
    img(UI.tileSrcIdHd(pend.tileId), 'cp-tile', P);
    P.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 180 });
    render();
  }
  function showChance(kind) {
    // kind: ron | tsumo | riichi. Text images from the effect pack; no extra asset needed.
    const big = kind !== 'riichi';
    const L = el('div', 'chance-fx', Table.root);
    el('div', 'chance-ray', L);
    const ta = MJ2.DATA.effects.textAssets[kind];
    const sc = big ? 0.42 : 0.3;
    const im = img(ta.file, 'chance-text', L, { width: ta.size[0] * sc + 'px', height: ta.size[1] * sc + 'px' });
    const lab = el('div', 'dyn-name chance-label', L); lab.textContent = big ? 'チャンス！' : 'リーチできます';
    const k = UI.speedFactor() < 1 ? 0.8 : 1;
    im.animate([{ opacity: 0, transform: 'scale(2.2)' }, { opacity: 1, transform: 'scale(.95)', offset: .5 }, { opacity: 1, transform: 'scale(1)' }], { duration: 380 * k, fill: 'forwards' });
    L.animate([{ opacity: 1 }, { opacity: 1, offset: .75 }, { opacity: 0 }], { duration: (big ? 1100 : 800) * k, fill: 'forwards' });
    setTimeout(() => L.remove(), (big ? 1150 : 850) * k);
    if (big) MJ2.dom.shake(Table.root, 3, 180);
    // persistent badge above the action bar until the player decides
    const b = el('div', 'chance-badge ' + kind, Table.root);
    b.textContent = kind === 'ron' ? 'ロンのチャンス！' : kind === 'tsumo' ? 'ツモのチャンス！' : 'リーチできます';
  }
  function humanDecide(pend) {
    return new Promise((resolve) => {
      input = { pend, resolve, sel: null, mode: 'discard' };
      Table.hint.textContent = hintText();
      const cfg = MJ2.DATA.config;
      let chance = null;
      if (pend.type === 'call') {
        Table.hint.textContent = '';
        showCallPrompt(pend);
        if (pend.ron) chance = 'ron';
      } else if (pend.tsumo) chance = 'tsumo';
      else if (pend.riichi.length) {
        const key = UI.match.round.roundId;
        if (Table.riichiChanceRound !== key) { Table.riichiChanceRound = key; chance = 'riichi'; }
      }
      if (chance === 'ron' || chance === 'tsumo') MJ2.Audio.play('signal_agari');
      else if (chance || pend.type === 'call' || (pend.type === 'action' && ((pend.ankan || []).length || (pend.kakan || []).length))) MJ2.Audio.play('signal_call');
      if (chance) {
        input.lockUntil = performance.now() + (chance === 'riichi' ? (cfg.riichiChanceLockMs ?? 500) : (cfg.chanceLockMs ?? 900));
        showChance(chance);
      }
      renderHand(); renderActions();
    });
  }

  // ---------------- menu ----------------
  function openMenu() {
    const g = document.getElementById('game');
    if (g.querySelector('.tbl-menu')) return;
    const back = el('div', 'modal-back tbl-menu', g);
    const P = el('div', 'panel modal tbl-menu', g, { top: '120px' });
    el('div', 'f-brush', P, { fontSize: '20px', marginBottom: '10px' }).textContent = 'メニュー';
    const close = () => { back.remove(); P.remove(); };
    const row = (label, fn) => { const b = UI.txtBtn(label, P, 0, 0, 240, () => { fn(); }); b.style.position = 'relative'; b.style.display = 'block'; b.style.margin = '8px auto'; return b; };
    const sp = row('対局速度：' + (UI.settings.speed === 'fast' ? '早送り' : '標準'), () => { UI.settings.speed = UI.settings.speed === 'fast' ? 'normal' : 'fast'; MJ2.SaveStore.saveSettings(UI.settings); sp.textContent = '対局速度：' + (UI.settings.speed === 'fast' ? '早送り' : '標準'); });
    const dm = row('打牌方式：' + (UI.settings.discardMode === 'double' ? '２回クリック' : '選択＋打牌'), () => { UI.settings.discardMode = UI.settings.discardMode === 'double' ? 'button' : 'double'; MJ2.SaveStore.saveSettings(UI.settings); dm.textContent = '打牌方式：' + (UI.settings.discardMode === 'double' ? '２回クリック' : '選択＋打牌'); if (input) { Table.hint.textContent = hintText(); renderActions(); } });
    const snd = () => '音：' + (UI.settings.muted ? 'ミュート中' : 'あり');
    const mu = row(snd(), () => { UI.settings.muted = !UI.settings.muted; MJ2.SaveStore.saveSettings(UI.settings); MJ2.Audio.applySettings(UI.settings); mu.textContent = snd(); });
    if (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen) {
      row('全画面表示 切替', () => {
        const d = document;
        if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        else { const e = d.documentElement; (e.requestFullscreen || e.webkitRequestFullscreen).call(e); }
        setTimeout(UI.fit, 300);
      });
    }
    row('中断してタイトルへ（自動保存済み）', () => { close(); Table.leave(); MJ2.Audio.stopBgm(600); MJ2.SaveStore.saveMatch(UI.match); UI.showTitle(); });
    row('対局に戻る', close);
  }

  // ---------------- event playback ----------------
  async function playEvents() {
    const m = UI.match, r = m.round;
    const k = () => UI.speedFactor();
    while (Table.seq < r.events.length) {
      const e = r.events[Table.seq++];
      vmApply(Table.vm, e);
      const seat = e.seat;
      // 鳴き・リーチ・和了の掛け声はその人の声で
      if (['RIICHI_DECLARED', 'CHI', 'PON', 'MINKAN', 'ANKAN', 'KAKAN', 'WIN_RON', 'WIN_TSUMO'].includes(e.type)) MJ2.Audio.speaker = m.roster[seat];
      switch (e.type) {
        case 'DRAW': render(); if (seat === 0) MJ2.Audio.play('tile_draw'); if (seat !== 0) await wait(40 * k()); break;
        case 'DISCARD': render(); MJ2.Audio.play('tile_discard'); await wait((seat === 0 ? 120 : 220) * k()); break;
        case 'RIICHI_DECLARED': render(); await MJ2.FX.riichi(); break;
        case 'CHI': case 'PON': case 'MINKAN': {
          render();
          const src = { face: UI.faceSrc(m.roster[e.fromSeat]), tile: UI.tileSrcIdHd(e.calledTileId), label: seat === 0 ? REL[(e.fromSeat + 4) % 4] + 'から' : 'から' };
          MJ2.Audio.cue('tile_meld', 260 * k());
          await MJ2.FX.call(e.type === 'CHI' ? 'chi' : e.type === 'PON' ? 'pon' : 'kan', { x: CALL_XY[pos(seat)][0], y: CALL_XY[pos(seat)][1], src });
          break;
        }
        case 'ANKAN': case 'KAKAN': render(); MJ2.Audio.cue('tile_meld', 260 * k()); await MJ2.FX.call('kan', { x: CALL_XY[pos(seat)][0], y: CALL_XY[pos(seat)][1] }); break;
        case 'KAKAN_DECLARE': render(); break;
        case 'WIN_RON': case 'WIN_TSUMO': {
          render();
          const opt = { face: UI.faceSrc(m.roster[seat]), cutX: CUT_XY[pos(seat)][0], cutY: CUT_XY[pos(seat)][1] };
          // 稲妻の着弾点＝和了牌（ロンは河の牌、ツモは手牌）。色: 自分の和了＝金、自分の振り込み＝赤、他家どうし＝青白
          let node = null;
          if (e.type === 'WIN_RON') node = Table.areas[e.sourceSeat].querySelector(`[data-rid="${e.tileId}"]`);
          else if (seat === 0) node = Table.handEl.querySelector(`[data-id="${e.tileId}"]`);
          else node = Table.areas[seat].querySelector('.meldrow') || Table.frames[seat];
          const pt = MJ2.FX.logicalCenter(node);
          if (pt) { opt.x = pt.x; opt.y = pt.y; }
          opt.tone = seat === 0 ? 'mine' : (e.type === 'WIN_RON' && e.sourceSeat === 0 ? 'hit' : 'other');
          MJ2.Audio.cue('tile_win', 420 * k()); // 手牌を倒す音
          await (e.type === 'WIN_RON' ? MJ2.FX.ron(opt) : MJ2.FX.tsumo(opt));
          const p = r.players[seat];
          if (p.winSnapshot && E.isJackpotShape(r, { melds: p.winSnapshot.melds }, p.winSnapshot.handIds)) await MJ2.FX.jackpot(r.jackpotTargets);
          if (seat === 0) UI.autoFast = true;
          render();
          break;
        }
        case 'YAKUMAN_READY': if (!E.isHuman(m, seat)) break; render(); await MJ2.FX.yakumanReady(e.names, { face: UI.faceSrc(m.roster[seat]) }); break; // 相手の役満リーチは見せない（通常のリーチ演出のみ）
        case 'ROUND_END': {
          render();
          // 山が尽きた時、自分が未和了ならテンパイ／ノーテンを告げる
          const me = r.players[0];
          if (e.reason === 'exhausted' && !me.winSnapshot) {
            const tp = E.standardWaits(me).length > 0 || E.jackpotWait(r, me) != null;
            MJ2.Audio.cue(tp ? 'draw_tenpai' : 'draw_noten', 380 * k());
          }
          await MJ2.FX.banner(r.winOrder.length ? 'round_end' : 'round_draw');
          break;
        }
        default: break;
      }
    }
    render();
  }

  // ---------------- audio: BGM per wind + round call ----------------
  // 東場=BGM01、南場=BGM02（同じ場の間は途切れずループ）。開局で「東一局」等、南四局は続けて「オーラス」。
  // 東場: 奇数ステージ=bgm_east_odd / 偶数ステージ=bgm_east_even、南場: bgm_south
  Table.bgmFor = function (m, lab) {
    const list = MJ2.DATA.audio.bgm || [];
    const idx = MJ2.DATA.stages.findIndex((x) => x.id === m.stageId);
    const parity = idx >= 0 && (idx + 1) % 2 === 0 ? 'even' : 'odd';
    // 組織ごとの専用曲（stageIds）を先に。無ければ奇数／偶数ステージの曲
    return list.find((b) => lab && lab[0] === b.rounds && b.stageIds && b.stageIds.includes(m.stageId))
      || list.find((b) => lab && lab[0] === b.rounds && !b.stageIds && (!b.stages || b.stages === parity)) || null;
  };
  Table.roundAudio = function (m, announce) {
    const r = m.round; if (!r) return;
    const A = MJ2.Audio;
    const lab = r.label || m.rounds[m.roundIndex];
    const def = Table.bgmFor(m, lab);
    if (def) A.bgm(def.id);
    // 東場のうちに南場の曲を先読み
    const south = (MJ2.DATA.audio.bgm || []).find((b) => b.rounds === 'S');
    if (south && lab && lab[0] === 'E' && m.roundIndex >= 2) A.prefetchBgm(south.id);
    if (!announce) return;
    const last = m.roundIndex === m.rounds.length - 1;
    const mode = MJ2.DATA.audio.roundCallLastMode || 'after';
    const ids = last && mode === 'replace' ? ['round_call_last'] : ['round_call_' + lab];
    if (last && mode === 'after') ids.push('round_call_last');
    if (m.roundIndex > 0) ids.push('an_start_round'); // 「局開始！」（最初の局は「対局開始！」）
    setTimeout(() => A.seq(ids, 80), 150 * UI.speedFactor());
  };

  // ---------------- driver ----------------
  Table.leave = function () { Table.token++; input = null; };
  Table.begin = async function (m, opts) {
    UI.match = m;
    MJ2.Audio.preloadVoices(m.roster);
    const token = ++Table.token;
    if (m.phase === 'round' && !m.round) { E.startRound(m); E.advance(m); MJ2.SaveStore.saveMatch(m); }
    else if (m.phase === 'round' && m.round && !m.round.pending && !m.round.ended) { E.advance(m); }
    const s = UI.newScreen('table');
    Table.root = s;
    renderStatic(s, m);
    UI.autoFast = false;
    if (!m.round && m.settlements.length) { const last = m.settlements[m.settlements.length - 1]; const def = Table.bgmFor(m, last.label); if (def) MJ2.Audio.bgm(def.id); }
    if (m.round) {
      if (opts.fresh || (m.phase === 'round' && m.round.events.filter((e) => e.type === 'DRAW').length === 0)) {
        Table.vm = newVM(m.round); Table.seq = 0;
        // deal visuals: fast-forward DEAL / TENPAI events so the opening banner sits on a dealt table
        while (Table.seq < m.round.events.length && m.round.events[Table.seq].type !== 'DRAW') vmApply(Table.vm, m.round.events[Table.seq++]);
        render();
        if (opts.fresh && m.roundIndex === 0) await MJ2.FX.banner('match_start');
        if (token !== Table.token) return;
        await roundOpen(m);
      } else {
        Table.vm = buildVM(m); Table.seq = m.round.events.length;
        if (m.round.players[0].winSnapshot) UI.autoFast = true;
        // yakuman notices etc. already played before the save: do not replay
        render();
        Table.roundAudio(m, false);
      }
    }
    loop(token);
  };
  async function roundOpen(m) {
    const r = m.round;
    const label = T.WIND_JA[r.roundWind] + ['一', '二', '三', '四'][r.dealer] + '局';
    // deal animation: tiles appear left to right
    const tiles = [...Table.handEl.querySelectorAll('.t')];
    tiles.forEach((t) => (t.style.opacity = 0));
    const bannerP = MJ2.FX.banner('round_open', { label });
    Table.roundAudio(m, true);
    tiles.forEach((t, i) => setTimeout(() => { t.style.opacity = 1; t.animate([{ transform: 'translateY(-14px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 120 }); }, 200 * UI.speedFactor() + i * 60 * UI.speedFactor()));
    await bannerP;
    // レート倍プッシュ（倍率が上がった局の最初に）
    const RT = MJ2.Settlement.currentRate(m);
    const prevLab = m.roundIndex > 0 ? m.rounds[m.roundIndex - 1] : null;
    const prevMult = prevLab ? MJ2.Settlement.rateFor(m, prevLab).mult : 1;
    if (RT.mult > prevMult) await MJ2.FX.ratePush(RT, m.roundIndex === m.rounds.length - 1);
  }
  async function loop(token) {
    const alive = () => token === Table.token;
    try {
      while (alive()) {
        const m = UI.match;
        if (m.round) { await playEvents(); if (!alive()) return; }
        if (m.phase === 'settlement') {
          const sbox = await MJ2.Settle.present(m, alive);
          if (!alive()) { if (sbox && sbox.remove) sbox.remove(); return; }
          const nx = E.nextRoundOrEnd(m);
          if (nx !== 'match_end' && sbox && sbox.remove) sbox.remove();
          if (nx === 'bankrupt') {
            MJ2.SaveStore.saveMatch(m);
            UI.showMatchResult(m);
            return;
          }
          if (nx === 'match_end') {
            MJ2.SaveStore.saveMatch(m);
            // 対局終了: 卓へは戻さず、黒漆の画面に「対局終了」の文字だけ。開始と同じ銅鑼の音
            const g = document.getElementById('game');
            const E2 = MJ2.dom.el('div', 'match-end', g);
            UI.chrome(E2);
            MJ2.dom.el('div', 'me-t f-brush', E2).textContent = '対局終了';
            if (sbox && sbox.remove) sbox.remove(); // 精算画面は終了画面を出してから消す（卓が一瞬見えないように）
            MJ2.Audio.play('match_start');
            await MJ2.dom.wait(2600 * UI.speedFactor());
            if (!alive()) { E2.remove(); return; }
            UI.showMatchResult(m);
            return;
          }
          E.advance(m);
          MJ2.SaveStore.saveMatch(m);
          const s = UI.newScreen('table'); Table.root = s; renderStatic(s, m);
          UI.autoFast = false;
          Table.vm = newVM(m.round); Table.seq = 0;
          while (Table.seq < m.round.events.length && m.round.events[Table.seq].type !== 'DRAW') vmApply(Table.vm, m.round.events[Table.seq++]);
          render();
          await roundOpen(m);
          continue;
        }
        if (m.phase === 'match_end') { UI.showMatchResult(m); return; }
        const r = m.round;
        const pend = r.pending;
        if (!pend) { await wait(30); continue; }
        let d;
        if (E.isHuman(m, pend.seat)) {
          const p = r.players[pend.seat];
          if (pend.type === 'call' && !pend.ron && !pend.pon && !pend.minkan && pend.chi.length === 0) d = { type: 'pass', seat: pend.seat };
          else if (pend.type === 'action' && p.riichi && !pend.tsumo && pend.ankan.length === 0) { await wait(380 * UI.speedFactor()); d = { type: 'discard', seat: pend.seat, tileId: pend.discards[0] }; }
          else if (root.MJ2_AUTOPLAY) { await wait(20); d = MJ2.CPU.decide(m, pend); } // test hook: CPU plays the human seat
          else d = await humanDecide(pend);
        } else {
          await wait((pend.type === 'action' ? MJ2.DATA.config.cpuThinkMs : 60) * UI.speedFactor());
          d = (root.MJ2_SCRIPT && root.MJ2_SCRIPT(m, pend)) || MJ2.CPU.decide(m, pend); // MJ2_SCRIPT: test hook only
        }
        if (!alive()) return;
        try { E.apply(m, d); } catch (e) {
          // 操作側の打牌が不正だった時は止めずに選び直してもらう（打牌の検査は盤面を変える前に行われる）
          if (E.isHuman(m, pend.seat) && /^illegal (riichi )?discard/.test(e.message) && r.pending === pend) { console.warn(e); MJ2.FX.toast('その牌は捨てられません。選び直してください'); continue; }
          throw e;
        }
        MJ2.SaveStore.saveMatch(m);
      }
    } catch (err) {
      console.error(err);
      MJ2.FX.toast('エラー: ' + err.message, 6000);
      root.__mj2LastError = err;
    }
  }
  Table.inputLocked = () => !!(input && input.lockUntil && performance.now() < input.lockUntil);
  Table._internals = { showChance, buildVM, vmApply, render, playEvents, renderWaits };
})(typeof window !== 'undefined' ? window : globalThis);
