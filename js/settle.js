/* 麻雀2 settlement presentation. Reads the already-applied settlement; never computes or adds points itself.
   v002: すべての見せ場はクリックで進む（自動送りなし）。
   和了者 … 通常の麻雀ゲームのように役を１つずつ積み上げて表示 → 符・翻・点数と「満貫！」等で称える → 小役 → 獲得点。
   未和了者 … 翻役と子役を１枚にまとめて表示（行クリックで根拠の牌を点灯）→ 獲得点。 */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const { el, wait } = MJ2.dom;
  // 精算の画像は画面ごとに作り直すので、読み込み済みの画像を同期で描いて一瞬空白になる（チラつく）のを防ぐ
  function img(src, cls, parent, style) { const i = el('img', cls, parent, style); i.decoding = 'sync'; i.src = src; i.draggable = false; return i; }
  const UI = MJ2.UI, T = MJ2.T;

  const Settle = {};
  MJ2.Settle = Settle;

  // winner's yaku list (majors + dora rows); counted=false when superseded by yakuman / jackpot
  function winnerList(res) {
    const list = [];
    const stdYakuman = res.majors.some((x) => x.yakuman && x.roleId.startsWith('std_'));
    for (const it of res.majors) {
      let counted = true;
      if (res.baseKind === 'jackpot' && it.roleId !== 'sp_jackpot') counted = false;
      else if (stdYakuman && !it.yakuman) counted = false;
      list.push(Object.assign({}, it, { counted }));
    }
    if (res.baseKind === 'win' && res.dora) {
      if (res.dora.dora) list.push({ roleId: '_dora', name: 'ドラ', han: res.dora.dora, counted: true, evidence: { kind: 'tiles', tiles: res.dora.doraIds, steps: [] }, isDora: true });
      if (res.dora.ura) list.push({ roleId: '_ura', name: '裏ドラ', han: res.dora.ura, counted: true, evidence: { kind: 'tiles', tiles: res.dora.uraIds, steps: [] }, isDora: true });
      if (res.dora.gold) list.push({ roleId: '_gold', name: (MJ2.DATA.config.goldDora || {}).name || '黄金ドラ', reading: (MJ2.DATA.config.goldDora || {}).reading, han: res.dora.gold, counted: true, evidence: { kind: 'tiles', tiles: res.dora.goldIds, steps: [] }, isDora: true, isGold: true });
    }
    return list;
  }
  // summary table lines, paged so tiles can be shown large enough to read
  const LIST_LINES = 9999; // v025: 頁送りをやめ、一覧の中でスクロール（見えるのは約5行）
  function listSections(res, type) {
    const sections = [];
    if (type === 'n_list') sections.push({ title: '翻役', items: res.majors, v: (it) => (it.yakuman ? '役満' : it.han + '翻'), sub: res.baseKind === 'yakuman' ? ['未和了の役報酬（役満）', MJ2.util.pts(res.basePoints)] : [`計${res.hanTotal}翻 → 未和了の役報酬`, MJ2.util.pts(res.basePoints)] });
    const mc = res.minorCount != null ? res.minorCount : res.minors.filter((x) => x.cls === 'minor').length;
    const mh = res.minorBundleHan != null ? res.minorBundleHan : 0;
    const bn = MJ2.Settlement.bundleRoleFor(mc);
    sections.push({ title: `子役 ${mc}個 → ${bn ? bn.name + ' ' : ''}${mh}翻`, items: res.minors, v: (it) => (it.cls === 'fixed' ? MJ2.util.pts(it.points) + '(固定)' : ''), sub: res.fixedTotal ? ['固定点', MJ2.util.pts(res.fixedTotal)] : [`子役 ${mc}個 → ${bn ? bn.name + ' ' : ''}${mh}翻`, mh ? '（翻役に合算）' : ''] });
    return sections;
  }
  function listPages(res, type) {
    const lines = [];
    for (const sc of listSections(res, type)) {
      lines.push({ k: 'title', sc });
      if (!sc.items.length) lines.push({ k: 'none', sc });
      for (const it of sc.items) lines.push({ k: 'item', it, sc });
      lines.push({ k: 'sum', sc });
    }
    const pages = [];
    let cur = [];
    for (let li = 0; li < lines.length; li++) {
      const ln = lines[li];
      const onlySumLeft = ln.k === 'sum' && li === lines.length - 1;
      if (cur.length >= LIST_LINES && !onlySumLeft) { pages.push(cur); cur = ln.k === 'title' ? [] : [{ k: 'title', sc: ln.sc, cont: true }]; }
      cur.push(ln);
    }
    if (cur.length) pages.push(cur);
    return pages;
  }
  function buildSteps(s) {
    const steps = [{ t: 'results' }];
    s.order.forEach((seat) => {
      const res = s.results[seat];
      if (res.isWinner) {
        steps.push({ t: 'w_intro', seat });
        const list = winnerList(res);
        list.forEach((_, i) => steps.push({ t: 'w_yaku', seat, i }));
        steps.push({ t: 'w_rank', seat });
        if (res.minors.length) listPages(res, 'w_minor').forEach((_, p, a) => steps.push({ t: 'w_minor', seat, page: p, pages: a.length }));
      } else {
        res.majors.forEach((it, i) => { if (it.yakuman) steps.push({ t: 'n_yakuman', seat, i }); });
        listPages(res, 'n_list').forEach((_, p, a) => steps.push({ t: 'n_list', seat, page: p, pages: a.length }));
      }
    });
    // ４人の役が出そろってから、お金の受け渡しをまとめて大きく
    payPages(s).forEach((_, p, a) => steps.push({ t: 'pay', page: p, pages: a.length }));
    steps.push({ t: 'summary' });
    return steps;
  }
  Settle.buildSteps = buildSteps;

  // 支払いの行: 和了ごとに１行（ロン=放銃者→和了者、ツモ=３人→和了者）、最後に未和了の役報酬（自分への加算）
  function payRows(s) {
    const rows = [];
    for (const w of s.order) {
      const res = s.results[w];
      if (!res.isWinner) continue;
      const inc = (s.transfers || []).filter((p) => p.to === w);
      if (!inc.length) continue;
      const k = s.yenPerPoint || 1;
      rows.push({ k: res.winType === 'ron' ? 'ron' : 'tsumo', to: w, from: inc.map((p) => ({ seat: p.from, points: p.amount, amount: p.yen != null ? p.yen : p.amount * k })), points: inc.reduce((a, p) => a + p.amount, 0), total: inc.reduce((a, p) => a + (p.yen != null ? p.yen : p.amount * k), 0) });
    }
    const self = s.order.filter((x) => s.results[x].selfGain > 0).map((x) => ({ seat: x, points: s.results[x].selfGain, amount: s.results[x].yen ? s.results[x].yen.selfGain : s.results[x].selfGain * (s.yenPerPoint || 1) }));
    if (self.length) rows.push({ k: 'self', from: self });
    return rows;
  }
  const PAY_PER_PAGE = 4;
  function payPages(s) {
    const rows = payRows(s);
    if (!rows.length) return [[]];
    const pages = [];
    for (let i = 0; i < rows.length; i += PAY_PER_PAGE) pages.push(rows.slice(i, i + PAY_PER_PAGE));
    return pages;
  }
  Settle.payRows = payRows;

  // ---- animation bookkeeping for "tap = complete current" ----
  // only animations that are still running are kept, so a click on a finished screen advances at once
  let finishers = new Set();
  function track(anim) {
    const f = () => { try { anim.finish(); } catch (e) { /* done */ } };
    finishers.add(f);
    anim.finished.then(() => finishers.delete(f), () => finishers.delete(f));
    return anim;
  }
  function finishAll() { const f = [...finishers]; finishers = new Set(); f.forEach((fn) => fn()); }
  function animate(node, kf, opt) { return track(node.animate(kf, Object.assign({ fill: 'forwards' }, opt))); }
  function countUp(node, from, to, ms, signed) {
    let done = false;
    const t0 = performance.now();
    const fmtY = (v) => (signed ? MJ2.util.ptsSigned(v) : MJ2.util.pts(v));
    const fin = () => { done = true; finishers.delete(fin); node.textContent = fmtY(to); };
    finishers.add(fin);
    (function tick(now) {
      if (done) return;
      const p = Math.min(1, (now - t0) / ms);
      node.textContent = fmtY(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick); else fin();
    })(t0);
  }

  function seatLabel(m, seat) { return seat === 0 ? 'あなた' : ''; }
  // 見出し（v025）: 額入りの顔・名前／所属／状況・黒い見出し札・集計行・最終手牌のトレー
  const STEP_TITLE = { w_intro: (res) => (res.winType === 'ron' ? 'ロン和了' : 'ツモ和了'), w_yaku: () => '成立役を精算', w_rank: () => '和了の点数', w_minor: () => '子役まとめ', n_list: () => '未和了の役まとめ', n_yakuman: () => '未和了の役満' };
  function header(box, m, s, seat, st) {
    const res = s.results[seat];
    const pf = el('div', 'uw-portrait face-fr' + (seat === 0 ? ' me' : ''), box); img(UI.faceSrc(res.faceId), 'face', pf);
    if (seat === 0) el('div', 'youmark big', box).textContent = 'YOU';
    const who = el('div', 'who' + (seat === 0 ? ' me' : ''), box);
    MJ2.dom.fit(Object.assign(el('div', 'nm', who), { textContent: UI.charName(res.faceId) }), 12);
    const ch = MJ2.DATA.charById[res.faceId] || {};
    const org = (MJ2.DATA.stages.find((x) => (x.characterIds || []).includes(res.faceId)) || {}).label;
    el('div', 'org', who).textContent = seat === 0 ? '（あなた）' : (org || ch.role || '');
    const oi = s.order.indexOf(seat);
    const sw = (seat - s.dealer + 4) % 4;
    el('div', 'chip', who).textContent = (res.isWinner ? '和了 ' + res.winOrder + '番' : '未和了') + '　' + T.WIND_JA[sw] + '家';
    const pl = el('div', 'uw-plaque st-plaque', box);
    MJ2.dom.fit(Object.assign(el('div', 'pt', pl), { textContent: (STEP_TITLE[st.t] || (() => ''))(res) }), 14);
    const sm = el('div', 'st-sum', box);
    sm.textContent = st.t === 'w_minor' || st.t === 'n_list' ? '' : (res.isWinner ? (res.winType === 'ron' ? 'ロン和了' : 'ツモ和了') : '最終手牌で判定') + `　精算 ${oi + 1}/4`;
    const tray = el('div', 'uw-panel tray', box);
    el('div', 'tl', tray).textContent = res.isWinner ? '和了手' : '最終手牌';
    return sm;
  }
  function handRow(box, res, lit, dimOthers, tags) {
    const H = el('div', 'handrow', box);
    const concealed = res.handIds.slice();
    let winTile = null;
    if (res.isWinner && res.winTileId != null) { winTile = res.winTileId; concealed.splice(concealed.indexOf(winTile), 1); }
    const n = concealed.length + (winTile != null ? 1 : 0) + res.melds.reduce((a, md) => a + md.tileIds.length, 0);
    const w = n > 15 ? Math.max(28, Math.floor(600 / n)) : 38;
    const h = Math.round(w * 1.36);
    const goldIds = UI.goldIdsFor(concealed.concat(winTile != null ? [winTile] : []), res.melds.length > 0);
    const put = (id, tag) => {
      const tw = el('span', 'tw', H);
      img(UI.tileSrcIdHd(id, goldIds.has(id)), '', tw, { width: w + 'px', height: h + 'px' });
      if (lit.has(id)) tw.classList.add('lit'); else if (dimOthers) tw.classList.add('dimt');
      if (tag) el('span', 'tag', tw).textContent = tag;
      return tw;
    };
    T.sortIds(concealed).forEach((id) => put(id));
    if (winTile != null) { el('span', 'gap', H); put(winTile, res.winType === 'ron' ? 'ロン' : 'ツモ'); }
    for (const md of res.melds) {
      el('span', 'gap', H);
      const label = { chi: 'チー', pon: 'ポン', minkan: 'カン', kakan: 'カン', ankan: '暗槓' }[md.type];
      md.tileIds.forEach((id, i) => put(id, i === 1 ? label : null));
    }
    return H;
  }
  function litSet(res, ev) {
    const s = new Set();
    if (!ev) return s;
    const handAll = new Set(res.handIds.concat(res.melds.flatMap((x) => x.tileIds)));
    if (ev.kind === 'whole_hand') { handAll.forEach((id) => s.add(id)); return s; }
    for (const id of ev.tiles || []) if (handAll.has(id)) s.add(id);
    for (const g of ev.groups || []) for (const id of g) if (handAll.has(id)) s.add(id);
    for (const mid of ev.meldIds || []) { const md = res.melds.find((x) => x.id === mid); if (md) md.tileIds.forEach((id) => s.add(id)); }
    return s;
  }
  function evidenceLine(box, m, ev, res) {
    const L = el('div', 'evline', box);
    if (!ev) return L;
    const handAll = new Set(res.handIds.concat(res.melds.flatMap((x) => x.tileIds)));
    const chip = (tileId, label, face) => {
      const c = el('span', 'chip', L);
      if (face) img(UI.faceSrc(face), 'face-s', c, { width: '20px', height: '20px' });
      if (label && label !== '打') el('span', '', c).textContent = label;
      if (tileId != null) img(UI.tileSrcId(tileId), '', c);
      if (label === '打') el('span', '', c).textContent = '打';
      return c;
    };
    const arrow = () => { el('span', 'arrow', L).textContent = '→'; };
    if (ev.targets && ev.targets.length) {
      const lab = el('span', '', L, { marginRight: '6px' }); lab.textContent = ev.kind === 'targets' ? '対象' : '相手';
      for (const sseat of ev.targets) img(UI.faceSrc(m.roster[sseat]), 'face-s', L, { marginRight: '4px' });
      el('br', '', L);
    }
    if (ev.steps && ev.steps.length) {
      const steps = ev.steps.length > 12 ? ev.steps.slice(0, 11) : ev.steps;
      steps.forEach((st, i) => {
        if (i) arrow();
        const face = (st.type === 'WIN_RON' && st.seat !== res.seat) ? m.roster[st.seat] : (st.type === 'CHI' || st.type === 'PON' || st.type === 'MINKAN') && st.seat !== res.seat ? m.roster[st.seat] : null;
        chip(st.tileId, st.label, face);
      });
      if (ev.steps.length > 12) el('span', '', L).textContent = ' …他' + (ev.steps.length - 11) + '件';
    } else if (ev.tiles && ev.tiles.some((id) => !handAll.has(id))) {
      ev.tiles.filter((id) => !handAll.has(id)).forEach((id) => chip(id, null));
    } else if (ev.kind === 'whole_hand') {
      el('span', '', L).textContent = '手牌全体が条件を満たす';
    } else if (ev.kind === 'tiles' || ev.kind === 'groups') {
      el('span', '', L).textContent = '光っている牌で成立';
    }
    return L;
  }
  let curS = null; // 表示中の精算（レート参照用）
  function valueText(item) {
    if (item.roleId === 'sp_jackpot') return MJ2.util.pts(MJ2.DATA.config.superJackpotPoints);
    if (item.yakuman) return '役満';
    if (item.han) return item.han + '翻';
    return '';
  }
  const isNew = (s, seat, id) => seat === 0 && (s.newRoleIds || []).includes(id);
  // 和了ランクと役名の読み上げ（assets/audio/voice/an）
  const RANK_VOICE = { 'スーパージャックポット': 'an_role_sp_jackpot', '役満': 'an_rank_yakuman', '数え役満': 'an_rank_yakuman', '三倍満': 'an_rank_sanbaiman', '倍満': 'an_rank_baiman', '跳満': 'an_rank_haneman', '満貫': 'an_rank_mangan' };
  function yakuVoiceId(it) {
    const A = MJ2.Audio;
    if (it.synthetic) return it.voiceEvent || null;
    if (it.isGold) return 'an_gold_dora';
    if (it.isDora) return 'an_dora'; // 裏ドラも「ドラ」
    return A.event('an_role_' + it.roleId) ? 'an_role_' + it.roleId : null;
  }
  function yakuVoice(it) { const id = yakuVoiceId(it); if (id) MJ2.Audio.playRaw(id); }
  // 和了の点数の画面: 成立役を１つずつ順に読み上げ、最後にランク（満貫など）。次の画面へ進んだら止める
  let voiceToken = 0;
  function readAll(ids, startMs) {
    const tok = ++voiceToken, A = MJ2.Audio;
    let t = startMs || 0;
    for (const id of ids) {
      if (!id) continue;
      setTimeout(() => { if (tok === voiceToken) A.playRaw(id); }, t);
      const ev = A.event(id), b = ev && ev.clip && A.buffers[ev.clip];
      t += (b && !b.then ? b.duration * 1000 : 900) + 120;
    }
  }
  function rankLabel(res) {
    if (res.baseKind === 'jackpot') return 'スーパージャックポット';
    if (res.baseKind === 'yakuman') return res.majors.some((x) => x.yakuman) ? '役満' : '役満';
    const h = res.hanTotal, fu = res.fu || 30;
    if (h >= 13) return '数え役満';
    if (h >= 11) return '三倍満';
    if (h >= 8) return '倍満';
    if (h >= 6) return '跳満';
    if (h >= 5 || fu * Math.pow(2, h + 2) >= 2000) return '満貫';
    return '';
  }
  const PRAISE = { 'スーパージャックポット': '前代未聞！！', '役満': '大物手！！', '数え役満': '圧巻の数え役満！', '三倍満': '見事な大物手！', '倍満': 'お見事！', '跳満': 'ナイス和了！', '満貫': 'いい手です！', '': '和了！' };
  function doraBadge(box, res) {
    if (!res.isWinner || !res.dora) return;
    const D = el('div', 'dorab', box);
    el('span', '', D).textContent = 'ドラ表示 ';
    for (const id of res.dora.indicators) img(UI.tileSrcId(id), '', D, { width: '13px', height: '18px', verticalAlign: 'middle', marginLeft: '1px' });
    if (res.dora.uraIndicators && res.dora.uraIndicators.length) {
      el('span', '', D, { marginLeft: '10px' }).textContent = '裏ドラ ';
      for (const id of res.dora.uraIndicators) img(UI.tileSrcId(id), '', D, { width: '13px', height: '18px', verticalAlign: 'middle', marginLeft: '1px' });
    }
  }
  function nextHint(box, label) {
    const n = el('div', 'nexthint', box);
    el('span', 'lb', n).textContent = label || '次へ';
    el('span', 'arw', n).textContent = '›';
    const t = el('div', 'tapnote', box); t.textContent = 'クリックで次へ　長押しでこの局の精算を飛ばす';
  }

  // winner yaku table: rows 0..upto shown, row "cur" emphasized
  function yakuTable(area, s, seat, list, upto, cur, compact, side) {
    const n = upto + 1;
    const twoCol = !side && n > 8;
    const W = el('div', 'yaku-table' + (twoCol ? ' two' : '') + (side ? ' side' : '') + (side && list.length > 9 ? ' dense' : ''), area);
    list.slice(0, n).forEach((it, i) => {
      const row = el('div', 'yrow' + (i === cur ? ' cur' : '') + (it.counted === false ? ' void' : '') + (it.yakuman ? ' ym' : ''), W);
      const nm = el('span', 'yn', row); nm.textContent = it.name;
      if (isNew(s, seat, it.roleId)) el('span', 'newtag', nm).textContent = 'NEW';
      const v = el('span', 'yv', row); v.textContent = it.counted === false ? '（加算なし）' : valueText(it);
      if (i === cur && !compact) {
        animate(row, [{ opacity: 0, transform: 'scale(1.9)', filter: 'brightness(2.2)' }, { opacity: 1, transform: 'scale(.96)', offset: .65 }, { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 260 });
      }
    });
    return W;
  }

  async function renderStep(box, m, s, st) {
    voiceToken++; // 前の画面の読み上げを止める
    // 背景と外枠は画面をまたいで残す（毎回作り直すと一瞬消えてチラつくため）。中身だけ入れ替える
    for (const c of [...box.children]) if (!c.classList.contains('uw-bg') && !c.classList.contains('uw-outer')) c.remove();
    if (!box.querySelector(':scope > .uw-bg')) box.prepend(img('assets/ui/screen_background.webp', 'uw-bg'));
    if (!box.querySelector(':scope > .uw-outer')) el('div', 'uw-outer', box);
    const k = UI.speedFactor();
    if (st.t === 'results') {
      const t = img(MJ2.DATA.effects.textAssets.results.file, 'abs', box, { left: '223px', top: '200px', width: '274px', height: '93px' });
      animate(t, [{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260 });
      const sub = el('div', 'abs', box, { left: '0', right: '0', top: '320px', textAlign: 'center', font: '13px MJ2Heavy', color: '#f0c98a' });
      const nw = s.order.filter((x) => s.results[x].isWinner).length;
      sub.textContent = labelOf(s) + '　' + (s.endReason === 'all_won' ? '全員和了' : s.endReason === 'three_won' ? '３人和了で終了' : '山が尽きました') + `　和了 ${nw}人`;
      MJ2.Audio.play('minor_summary');
      nextHint(box);
      return;
    }
    if (st.t === 'summary') {
      const ttl = el('div', 'title-text', box, { top: '12px', fontSize: '24px' }); ttl.textContent = labelOf(s) + '終了　現在の順位';
      el('div', 'abs', box, { right: '30px', top: '30px', font: '11px MJ2Heavy', color: '#f0c98a' }).textContent = `レート 1点＝${(s.rate || 1).toLocaleString('en-US')}円` + ((s.mult || 1) > 1 ? ` ×${s.mult}` : '');
      const tb = el('div', 'sumtable big', box);
      // 並びは所持金（ここまでの合計）の現在順位。同額は同順位。
      // 並び・順位は持ち点（麻雀の結果）。お金（所持金）は併記
      const P = (res) => res.cumulativeAfter;
      const Y = (res) => (res.yenAfter != null ? res.yenAfter : res.cumulativeAfter);
      const seats = [0, 1, 2, 3].slice().sort((x, y) => P(s.results[y]) - P(s.results[x]) || x - y);
      for (const seat of seats) {
        const res = s.results[seat];
        const rank = 1 + seats.filter((x) => P(s.results[x]) > P(res)).length;
        const r = el('div', 'r' + (seat === 0 ? ' me' : '') + (rank === 1 ? ' top' : ''), tb);
        el('div', 'mk', r).textContent = seat === 0 ? '▶' : '';
        el('div', 'rk', r).textContent = rank + '位';
        img(UI.faceSrc(res.faceId), '', r);
        const c1 = el('div', 'c1', r);
        el('div', 'nm', c1).textContent = UI.charName(res.faceId);
        el('div', 'st', c1).textContent = (res.isWinner ? '和了 ' + res.winOrder + '番' : '未和了') + (seat === 0 ? '　あなた' : '');
        r.appendChild(MJ2.Cash.pile(r, Y(res), UI.charName(res.faceId)));
        const ty = res.yen ? res.yen.total : res.total;
        const c2 = el('div', 'c2' + (res.total < 0 ? ' neg' : ''), r); c2.innerHTML = MJ2.util.ptsSigned(res.total) + `<span class="pp">${MJ2.util.yenSigned(ty)}</span>`;
        const c3 = el('div', 'c3' + (P(res) < 0 ? ' neg' : ''), r); c3.innerHTML = '<span>持ち点</span>' + MJ2.util.pts(P(res)) + `<span class="pp">${Y(res) < 0 ? '借金' : '所持金'} ${MJ2.util.yen(Math.abs(Y(res)))}</span>`;
      }
      return 'summary';
    }
    if (st.t === 'pay') { payStep(box, m, s, st); return; }
    const res = s.results[st.seat];
    const sumLine = header(box, m, s, st.seat, st);
    doraBadge(box, res);
    const area = el('div', 'stage-area', box, { top: '100px', height: '290px' });

    if (st.t === 'w_intro') {
      const t = el('div', 'abs f-brush', area, { left: '0', right: '0', top: '40px', textAlign: 'center', fontSize: '60px', color: '#ffe39a', textShadow: '0 3px 0 #5a3000, 0 0 12px #000' });
      t.textContent = res.winType === 'ron' ? 'ロン和了' : 'ツモ和了';
      animate(t, [{ opacity: 0, transform: 'scale(2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260 });
      setTimeout(() => MJ2.dom.shake(box, 4, 200), 200);
      MJ2.Audio.cue('role_impact', 200); // ドン！（ロン和了・ツモ和了）
      if (res.fromSeat != null) {
        const f = el('div', 'abs', area, { left: '0', right: '0', top: '150px', textAlign: 'center', font: '12px MJ2Heavy', color: '#e8d8bc' });
        f.textContent = '放銃 ';
        img(UI.faceSrc(m.roster[res.fromSeat]), 'face-s', f, { width: '34px', height: '34px', border: '1px solid #d8b35a', verticalAlign: 'middle' });
      }
      const n = el('div', 'abs', area, { left: '0', right: '0', top: '200px', textAlign: 'center', font: '12px MJ2Heavy', color: '#f0c98a' });
      n.textContent = '和了手を確認してください';
      handRow(box, res, new Set(), false);
      nextHint(box, '役を見る');
      return;
    }
    if (st.t === 'w_yaku') {
      // 「この役はこれ！」: accumulated list on the left, the current role large on the right,
      // its tiles lit and the rest greyed out. Advances by itself (voice can set the length later).
      const list = winnerList(res);
      const it = list[st.i];
      yakuTable(area, s, st.seat, list, st.i, st.i, false, true);
      const lit = litSet(res, it.evidence);
      if (it.roleId === 'sp_jackpot') { handRow(box, res, lit, true); await MJ2.FX.jackpot(s.jackpotTargets, box); }
      const F = el('div', 'feature', box);
      el('div', 'feat-lead', F).textContent = it.isGold ? '黄金の牌を持っている！' : it.isDora ? 'ドラ' : it.synthetic ? '子役がそろった！' : it.yakuman ? '役満成立！' : 'この役はこれ！';
      const nm = el('div', 'dyn-name feat-name', F, { fontSize: (it.name.length > 8 ? 30 : it.name.length > 5 ? 38 : 46) + 'px' }); nm.textContent = it.name;
      animate(nm, [{ opacity: 0, transform: 'scale(2.6)' }, { opacity: 1, transform: 'scale(.94)', offset: .7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 260 });
      { const rr = (it.synthetic || it.isGold) ? it.reading : (MJ2.DATA.roleById[it.roleId] && MJ2.DATA.roleById[it.roleId].reading); if (rr) { const rd = el('div', 'feat-reading-in', F); rd.textContent = rr; } }
      const hv = el('div', 'feat-han', F); hv.textContent = it.counted === false ? '（役満のため加算なし）' : valueText(it);
      if (isNew(s, st.seat, it.roleId)) el('span', 'newtag', hv).textContent = 'NEW';
      if (it.yakuman) { MJ2.Audio.play('yakuman_win'); const y = img(MJ2.DATA.effects.textAssets.yakuman.file, 'abs', F, { left: '140px', top: '-34px', width: '110px', height: '62px' }); animate(y, [{ opacity: 0, transform: 'scale(2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 240 }); }
      if (!it.isDora && !it.synthetic && !it.roleId.startsWith('std_')) { const c = el('div', 'feat-cond', F); c.textContent = MJ2.DATA.roleById[it.roleId].condition; }
      if (it.isGold) { const gc = MJ2.DATA.config.goldDora || {}; const c = el('div', 'feat-cond', F); c.textContent = `ジャックポットの金色の牌を1種類持つごとに${gc.hanPerTile || 1}翻（最大${gc.maxHan ?? 3}翻）。ドラと同じく、これだけでは和了できない。鳴いていると数えない。`; }
      MJ2.Audio.cue('role_impact', 90);
      setTimeout(() => yakuVoice(it), 140 * k); // 役名のコール
      setTimeout(() => MJ2.dom.shake(box, it.yakuman ? 5 : 3, 160), 180);
      const ev = evidenceLine(box, m, it.evidence, res);
      ev.classList.add('evbottom');
      if (it.synthetic) {
        ev.innerHTML = '';
        el('span', '', ev, { marginRight: '6px' }).textContent = `子役 ${it.minorCount}個：`;
        res.minors.filter((x) => x.cls === 'minor').slice(0, 10).forEach((x) => { const c = el('span', 'chip', ev); c.textContent = x.name; });
        if (it.minorCount > 10) el('span', '', ev).textContent = ' …';
        el('div', 'feat-cond', box, { position: 'absolute', left: '290px', right: '20px', top: '300px', textAlign: 'center' }).textContent = '子役4個ごとに1翻（四子安・八子安・十二子安・十六子安）。各子役は後でまとめて表示します。';
      }
      // light the role's tiles, grey out everything else (event-only roles grey the whole hand and show the history chips)
      const H = handRow(box, res, lit, !it.synthetic);
      H.classList.add('spot');
      MJ2.Audio.cue('evidence_light', 300);
      if (lit.size) [...H.querySelectorAll('.tw.lit')].forEach((t) => animate(t, [{ transform: 'translateY(0)', filter: 'brightness(2.2)' }, { transform: 'translateY(-8px)', filter: 'brightness(1)' }], { duration: 380, delay: 140 }));
      const cfg = MJ2.DATA.config;
      // 役名の読み上げが終わるまで進まない（クリックでは飛ばせない。長押しの「この局の精算を飛ばす」は有効）
      const vid = yakuVoiceId(it), vev = vid && MJ2.Audio.event(vid), vb = vev && vev.clip && MJ2.Audio.buffers[vev.clip];
      const vMs = vb && !vb.then ? vb.duration * 1000 : (vid ? 1300 : 0);
      // 読み上げが終わったらすぐ次の役へ（声の無い役だけ設定の時間）
      return { auto: vid ? 140 * k + vMs + 60 : ((it.yakuman ? cfg.settlementYakumanMs : cfg.settlementYakuMs) || 1800) * k, noTap: true };
    }
    if (st.t === 'w_rank') {
      const list = winnerList(res);
      yakuTable(area, s, st.seat, list, list.length - 1, -1, true).classList.add('faded');
      const label = rankLabel(res);
      const glow = el('div', 'abs', box, { left: '60px', right: '60px', top: '150px', height: '200px', background: 'radial-gradient(ellipse, rgba(255,214,110,.55), rgba(255,180,60,0) 70%)', pointerEvents: 'none' });
      animate(glow, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.1)' }, { opacity: .8, transform: 'scale(1)' }], { duration: 600 });
      const big = el('div', 'dyn-name rank-big', box); big.textContent = label || (res.hanTotal + '翻');
      readAll([RANK_VOICE[label] || null], 380); // 役名は「成立役を精算」で1つずつ読んだので、ここではランクだけ
      MJ2.Audio.play(res.baseKind === 'win' || res.baseKind === 'yakuman' || res.baseKind === 'jackpot' ? (/役満|ジャックポット/.test(label) ? 'result_yakuman' : /倍満/.test(label) ? 'result_big' : 'result_other') : 'role_impact');
      animate(big, [{ opacity: 0, transform: 'scale(3)' }, { opacity: 1, transform: 'scale(.95)', offset: .7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 320 });
      setTimeout(() => MJ2.dom.shake(box, 5, 260), 240);
      const pts = el('div', 'rank-pts', box);
      const detail = res.baseKind === 'win' ? `${res.fu}符 ${res.hanTotal}翻　` : '';
      pts.innerHTML = `${detail}<b></b>`;
      countUp(pts.querySelector('b'), 0, res.received || res.basePoints, 700 * k);
      { const P = res.received || res.basePoints; const yy = el('div', 'rank-yen', box); yy.innerHTML = `＝ <b>${MJ2.util.yen(P * (s.yenPerPoint || 1))}</b>　<span>1点＝${(s.rate || 1).toLocaleString('en-US')}円${(s.mult || 1) > 1 ? ' ×' + s.mult : ''}</span>`; animate(yy, [{ opacity: 0, transform: 'scale(1.4)' }, { opacity: 0, offset: .55 }, { opacity: 1, transform: 'none' }], { duration: 900 }); }
      const pr = el('div', 'rank-praise f-brush', box); pr.textContent = PRAISE[label] || PRAISE[''];
      animate(pr, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 0, offset: .5 }, { opacity: 1, transform: 'none' }], { duration: 700 });
      if (res.baseKind === 'win') MJ2.Audio.play('score_confirm');
      handRow(box, res, new Set(), false);
      nextHint(box, res.minors.length ? '子役へ' : '次へ');
      return;
    }
    if (st.t === 'w_minor' || st.t === 'n_list') {
      // one compact table: 役名 | 点・翻 | 条件. Clicking a row shows its evidence on the hand.
      let selected = null;
      const H0 = { el: null };
      const drawHand = () => { if (H0.el) H0.el.remove(); H0.el = handRow(box, res, selected ? litSet(res, selected.evidence) : new Set(), !!selected); H0.el.classList.add('ox'); };
      const evBox = el('div', 'evbottom-wrap', box);
      const showEv = () => { evBox.innerHTML = ''; let e; if (selected) e = evidenceLine(evBox, m, selected.evidence, res); else { e = el('div', 'evline dim-text', evBox); e.textContent = '行をクリックすると根拠の牌・行動を表示'; } e.classList.add('evbottom', 'evlist'); };
      const cond = (it) => (it.synthetic ? `子役${it.minorCount}個で成立（${it.reading}）。4〜7個=四子安1翻／8〜11個=八子安2翻／12〜15個=十二子安3翻／16個以上=十六子安4翻` : it.roleId.startsWith('std_') ? '通常の麻雀の役' : MJ2.DATA.roleById[it.roleId].condition);
      const pages = listPages(res, st.t);
      const page = pages[Math.min(st.page || 0, pages.length - 1)];
      { const secs = listSections(res, st.t); sumLine.textContent = secs.map((x) => x.title).join('　／　'); }
      // 役一覧（v025）: 内枠の中に 役名 | 成立牌 | 成立条件。約5行見えて、それ以上は一覧の中でスクロール
      const th = 30, tw = Math.round(th / 1.36);
      const LP = el('div', 'uw-panel rlist', box);
      const hd = el('div', 'rt-head', LP); ['役名', '成立牌', '成立条件'].forEach((x, i) => { el('span', ['c-name', 'c-tiles', 'c-cond'][i], hd).textContent = x; });
      const TB = el('div', 'rtable', LP);
      const rowsAll = [];
      let n = 0;
      const H = {};
      for (const ln of page) {
        const sc = ln.sc;
        if (ln.k === 'title') { if (listSections(res, st.t).length > 1) el('div', 'rt-title', TB).textContent = sc.title; continue; }
        if (ln.k === 'none') { el('div', 'rt-row dim-text', TB, H).textContent = '　なし'; continue; }
        if (ln.k === 'sum') {
          const sm = el('div', 'rt-row rt-sum', TB, H);
          el('span', 'c-name', sm).textContent = sc.sub[0]; el('span', 'c-sumv', sm).textContent = sc.sub[1];
          continue;
        }
        const it = ln.it;
        const r = el('div', 'rt-row', TB, H);
        const nm = el('span', 'c-name', r); el('span', 'n', nm).textContent = it.name;
        const vv = sc.v(it); if (vv || isNew(s, st.seat, it.roleId)) { const sub = el('span', 'v', nm); sub.textContent = vv; if (isNew(s, st.seat, it.roleId)) el('span', 'newtag', sub).textContent = 'NEW'; }
        // the tiles that made the role, shown before the description (roles without tiles show none)
        const tl = el('span', 'c-tiles', r);
        const ev = it.evidence || {};
        if (ev.kind === 'whole_hand') { el('span', 'c-whole', tl).textContent = '手牌全体'; }
        else {
          let ids = (ev.tiles || []).slice();
          if (!ids.length && ev.groups) ids = ev.groups.flat();
          if (!ids.length && ev.steps) ids = ev.steps.filter((x) => x.tileId != null).map((x) => x.tileId);
          ids = [...new Set(ids)];
          if (ev.kind === 'tiles' || ev.kind === 'groups') ids = T.sortIds(ids);
          const max = 7;
          ids.slice(0, max).forEach((id) => img(UI.tileSrcIdHd(id), '', tl, { width: tw + 'px', height: th + 'px' }));
          if (ids.length > max) el('span', 'c-more', tl).textContent = '…';
        }
        const cd = el('span', 'c-cond', r); cd.textContent = cond(it); cd.title = cond(it);
        r.addEventListener('pointerup', (e) => { e.stopPropagation(); selected = selected === it ? null : it; rowsAll.forEach((q) => q.classList.toggle('sel', q.item === selected)); drawHand(); showEv(); });
        r.addEventListener('pointerdown', (e) => e.stopPropagation());
        r.item = it; rowsAll.push(r);
        animate(r, [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 150, delay: 30 * n++ });
      }
      MJ2.Audio.play('minor_summary');
      drawHand(); showEv();
      nextHint(box, '次へ');
      return;
    }
    if (st.t === 'n_yakuman') {
      const it = res.majors[st.i];
      const card = el('div', 'rolecard', area);
      const y = img(MJ2.DATA.effects.textAssets.yakuman.file, 'abs', card, { left: '296px', top: '-6px', width: '128px', height: '72px' });
      animate(y, [{ opacity: 0, transform: 'scale(2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220 });
      const nm = el('div', 'rolename dyn-name', card, { fontSize: (it.name.length > 6 ? 44 : 56) + 'px', top: '70px' }); nm.textContent = it.name;
      animate(nm, [{ opacity: 0, transform: 'scale(2.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260 });
      setTimeout(() => MJ2.dom.shake(box, 5, 220), 200);
      MJ2.Audio.play('yakuman_win');
      const hn = el('div', 'rolehan', card, { top: '140px' }); hn.textContent = '未和了でも役満 ' + MJ2.util.pts(MJ2.DATA.config.ordinaryCustomYakumanPoints);
      if (isNew(s, st.seat, it.roleId)) el('span', 'newtag', hn).textContent = 'NEW';
      const ev = evidenceLine(card, m, it.evidence, res); ev.style.top = '180px';
      const lit = litSet(res, it.evidence);
      handRow(box, res, lit, lit.size > 0);
      nextHint(box);
      return;
    }
    if (st.t === 'pay') return 'handled';
  }
  // ---- お金の受け渡し（４人の役のあと、まとめて大きく） ----
  function payStep(box, m, s, st) {
    const k = UI.speedFactor();
    const yen = MJ2.util.yen;
    const ttl = el('div', 'title-text', box, { top: '12px', fontSize: '24px' }); ttl.textContent = labelOf(s) + '　お金の受け渡し';
    el('div', 'abs', box, { right: '30px', top: '30px', font: '11px MJ2Heavy', color: '#f0c98a' }).textContent = `レート 1点＝${(s.rate || 1).toLocaleString('en-US')}円` + ((s.mult || 1) > 1 ? ` ×${s.mult}（1点＝${(s.yenPerPoint || 1).toLocaleString('en-US')}円）` : '');
    const pages = payPages(s);
    const rows = pages[st.page || 0] || [];
    // 残り所持金（左の列）: 局の前の所持金＋前の頁までの受け渡し。お札が出るたびに減り、着くたびに増える
    const flowsOf = (row) => (row.k === 'self' ? row.from.map((f) => ({ from: null, to: f.seat, amount: f.amount })) : row.from.map((f) => ({ from: f.seat, to: row.to, amount: f.amount })));
    const bal = [0, 1, 2, 3].map((seat) => { const r = s.results[seat]; return r && r.yenBefore != null ? r.yenBefore : null; });
    for (let p = 0; p < (st.page || 0); p++) for (const row of pages[p]) for (const fl of flowsOf(row)) { if (fl.from != null && bal[fl.from] != null) bal[fl.from] -= fl.amount; if (bal[fl.to] != null) bal[fl.to] += fl.amount; }
    const side = el('div', 'uw-panel paybal', box);
    el('div', 'pbt f-brush', side).textContent = '残り所持金';
    const balEl = [];
    for (let seat = 0; seat < 4; seat++) {
      const r = el('div', 'pbr' + (seat === 0 ? ' me' : ''), side);
      img(UI.faceSrc(m.roster[seat]), '', r);
      const t = el('div', 'pbx', r);
      el('div', 'pbn', t).textContent = UI.charName(m.roster[seat]);
      const v = el('div', 'pbv', t); balEl[seat] = v;
    }
    const showBal = (seat, flash) => {
      const v = balEl[seat]; if (!v || bal[seat] == null) return;
      v.textContent = (bal[seat] < 0 ? '借金 ' : '') + yen(Math.abs(bal[seat]));
      v.classList.toggle('neg', bal[seat] < 0);
      if (flash) { v.classList.remove('dn', 'up'); void v.offsetWidth; v.classList.add(flash); }
    };
    for (let seat = 0; seat < 4; seat++) showBal(seat);
    const W = el('div', 'paylist', box);
    const who = (seat, cls) => {
      const d = el('div', 'pw' + (seat === 0 ? ' me' : '') + (cls ? ' ' + cls : ''));
      img(UI.faceSrc(m.roster[seat]), '', d);
      const n = el('div', 'pn', d); n.textContent = UI.charName(m.roster[seat]);
      if (seat === 0) el('div', 'youmark', d).textContent = 'YOU';
      return d;
    };
    if (!rows.length) { el('div', 'paynone', W).textContent = 'お金の移動はありません'; }
    // 行を作る（金額は0から）。現金が出るたびに払う側が減り、着くたびに受け取る側が増える。
    const plans = rows.map((row) => {
      const r = el('div', 'payrow ' + row.k + ' waiting', W);
      const legs = [];
      if (row.k === 'self') {
        const bank = el('div', 'pk', r); bank.textContent = '役報酬';
        const lst = el('div', 'pselfs', r);
        for (const f of row.from) { const c = el('div', 'pself', lst); const w = who(f.seat, 'sm'); c.appendChild(w); const lab = el('div', 'pa plus', c); lab.textContent = '＋0円'; el('div', 'pp', c).textContent = MJ2.util.pts(f.points); legs.push({ amount: f.amount, fromNode: bank, toNode: w.querySelector('img'), recvLab: lab, pileDx: 0, pileDy: 0, absorb: true, fromSeat: null, toSeat: f.seat }); }
        el('div', 'pnote', r).textContent = '和了れなかった人の役の分（賞金から自分に加算）';
      } else {
        const L = el('div', 'pfrom', r);
        const R0 = [];
        for (const f of row.from) { const c = el('div', 'pfc', L); const w = who(f.seat, row.from.length > 1 ? 'sm' : ''); c.appendChild(w); el('div', 'pp', c).textContent = MJ2.util.pts(f.points) + ' →'; const lab = el('div', 'pa minus', c); lab.textContent = '−0円'; R0.push({ f, w, lab }); }
        const mid = el('div', 'parrow', r);
        el('div', 'pk', mid).textContent = row.k === 'ron' ? 'ロン' : 'ツモ';
        el('div', 'arr', mid).textContent = '▶';
        const R = el('div', 'pto', r);
        const rw = who(row.to); R.appendChild(rw);
        const tw = el('div', 'ptot', R);
        el('div', 'pp', tw).textContent = MJ2.util.pts(row.points) + ' ＝';
        const tot = el('div', 'pa big plus', tw); tot.textContent = '＋0円';
        for (const x of R0) legs.push({ amount: x.f.amount, fromNode: x.w.querySelector('img'), toNode: rw.querySelector('img'), pileNode: tot, payLab: x.lab, recvLab: tot, shared: true, pileDx: -10, pileDy: 30, fromSeat: x.f.seat, toSeat: row.to });
      }
      return { row, r, legs, total: row.k === 'self' ? null : row.total };
    });
    // 再生（行ごとに順番。ツモ・複数の支払いは少しずらして同時に）
    let stopped = false;
    const flights = [];
    const playRow = async (pl, instant) => {
      pl.r.classList.remove('waiting'); pl.r.classList.add('playing');
      let recvSum = 0;
      const fl = pl.legs.map((lg, j) => {
        const from = MJ2.FX.logicalCenter(lg.fromNode), to = MJ2.FX.logicalCenter(lg.toNode);
        const pa = lg.pileNode ? MJ2.FX.logicalCenter(lg.pileNode) : to;
        let mine = 0;
        const f = MJ2.Cash.fly(box, {
          amount: lg.amount, from, to, pile: { x: pa.x + lg.pileDx, y: pa.y + lg.pileDy }, delay: j * 170 * k, absorb: lg.absorb,
          onDepart: (y, cum) => { if (lg.payLab) lg.payLab.textContent = '−' + yen(cum); const d = cum - (lg._dep || 0); lg._dep = cum; if (lg.fromSeat != null && bal[lg.fromSeat] != null && d) { bal[lg.fromSeat] -= d; showBal(lg.fromSeat, 'dn'); } },
          onLand: (y, cum) => { recvSum += cum - mine; const d = cum - mine; mine = cum; lg.recvLab.textContent = '＋' + yen(lg.shared ? recvSum : cum); if (bal[lg.toSeat] != null && d) { bal[lg.toSeat] += d; showBal(lg.toSeat, 'up'); } }
        });
        flights.push(f);
        if (instant) f.finish();
        return f.done.then(() => { if (lg.payLab) lg.payLab.textContent = '−' + yen(lg.amount); if (!lg.shared) lg.recvLab.textContent = '＋' + yen(lg.amount); });
      });
      await Promise.all(fl);
      if (pl.total != null) pl.legs[0].recvLab.textContent = '＋' + yen(pl.total);
      pl.r.classList.remove('playing');
      if (!instant) MJ2.Audio.play('score_confirm');
    };
    let idx = 0;
    (async () => {
      await wait(250 * k);
      for (; idx < plans.length; idx++) {
        if (stopped) return;
        await playRow(plans[idx], false);
        await wait(160 * k);
      }
      finishers.delete(fin); // 全部終わったら次のクリックでそのまま次へ
    })();
    const fin = () => {
      stopped = true; finishers.delete(fin);
      flights.forEach((f) => f.finish());
      for (let j = idx + 1; j < plans.length; j++) if (plans[j].r.classList.contains('waiting')) playRow(plans[j], true);
      if (plans[idx] && plans[idx].r.classList.contains('waiting')) playRow(plans[idx], true);
    };
    finishers.add(fin);
    if ((st.pages || 1) > 1) el('div', 'abs', box, { right: '28px', top: '50px', font: '11px MJ2Heavy', color: '#f0c98a' }).textContent = `${(st.page || 0) + 1} / ${st.pages}`;
    nextHint(box, (st.page || 0) + 1 < (st.pages || 1) ? '次の頁' : '精算結果へ');
  }

  function labelOf(s) { const l = s.label; return T.WIND_JA[l[0] === 'E' ? 0 : 1] + ['一', '二', '三', '四'][+l[1] - 1] + '局'; }

  Settle.present = function (m, alive) {
    return new Promise(async (resolve) => {
      const s = m.settlements.find((x) => x.id === m.pendingSettlement) || m.settlements[m.settlements.length - 1];
      const steps = buildSteps(s);
      curS = s;
      UI.setGoldTargets(s.jackpotTargets); // その局の対象集合で金色表示
      if (!m.presentationCursor || m.presentationCursor.settlementId !== s.id || m.presentationCursor.v !== 4) m.presentationCursor = { settlementId: s.id, step: 0, v: 4 };
      const g = document.getElementById('game');
      const box = el('div', 'settle', g);
      let tapResolve = null, longTimer = null, skipAll = false, longFired = false;
      box.addEventListener('pointerdown', () => { longFired = false; clearTimeout(longTimer); longTimer = setTimeout(() => { longFired = true; skipAll = true; finishAll(); if (tapResolve) tapResolve('skip'); }, 900); });
      box.addEventListener('pointerup', () => { clearTimeout(longTimer); if (!longFired && tapResolve) { if (box.querySelector('.nexthint')) MJ2.Audio.play('ui_button'); tapResolve('tap'); } });
      box.addEventListener('pointerleave', () => clearTimeout(longTimer));
      let i = Math.min(m.presentationCursor.step, steps.length - 1);
      while (i < steps.length) {
        if (!alive()) { box.remove(); return resolve(); }
        if (skipAll && steps[i].t !== 'summary') i = steps.length - 1;
        m.presentationCursor.step = i;
        MJ2.SaveStore.saveMatch(m);
        finishers = new Set();
        const st = steps[i];
        const r0 = await renderStep(box, m, s, st);
        if (!alive()) { box.remove(); return resolve(); }
        if (r0 === 'summary') {
          const last = m.roundIndex + 1 >= m.rounds.length;
          const done = () => resolve(box); // 消すのは呼んだ側（対局終了の画面を先に出してから消す）
          if (last) UI.txtBtn('最終結果へ', box, 270, 474, 180, done, 'primary').style.height = '40px';
          else UI.imgBtn('next', box, 278, 474, 164, 40, done);
          return;
        }
        // click to advance (first click finishes running animations). Steps returning {auto} advance by themselves.
        const auto = r0 && r0.auto;
        const t0 = performance.now();
        while (true) {
          const r = await new Promise((res) => { tapResolve = res; if (auto) setTimeout(() => res('timer'), Math.max(0, auto - (performance.now() - t0))); });
          if (r === 'timer') break;
          tapResolve = null;
          if (r === 'skip') break;
          if (r0 && r0.noTap) { finishAll(); continue; } // 役を数えている間はクリックで進めない
          if (finishers.size) { finishAll(); continue; }
          break;
        }
        finishAll();
        i++;
      }
      box.remove();
      resolve();
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
