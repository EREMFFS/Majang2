/* 麻雀2 UI shell & menu screens (boot logo, title, stage select, VS, final result, records, encyclopedia, settings). */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const { el, img, wait } = MJ2.dom;
  const T = MJ2.T;

  const UI = {
    settings: null,
    match: null,
    screen: null,
    autoFast: false
  };
  MJ2.UI = UI;

  // ---------------- basics ----------------
  function game() { return document.getElementById('game'); }
  // 720x540 を画面に等比で合わせる。スマホ縦持ちでは90°回転して横長で表示（設定で切替可）。
  function fit() {
    const g = game();
    const vw = root.innerWidth, vh = root.innerHeight;
    const pref = (UI.settings && UI.settings.portraitMode) || 'rotate';
    const portrait = vh > vw * 1.05;
    const rotate = portrait && pref === 'rotate';
    let s;
    if (rotate) {
      s = Math.min(vh / 720, vw / 540);
      const w = 540 * s, h = 720 * s;
      const left = Math.round((vw - w) / 2), top = Math.round((vh - h) / 2);
      // rotate 90deg clockwise around the top-left corner, then shift into place
      g.style.transform = `translate(${left + w}px, ${top}px) rotate(90deg) scale(${s})`;
      g.style.left = '0px'; g.style.top = '0px';
    } else {
      s = Math.min(vw / 720, vh / 540);
      g.style.transform = `scale(${s})`;
      g.style.left = Math.round((vw - 720 * s) / 2) + 'px';
      g.style.top = Math.round((vh - 540 * s) / 2) + 'px';
    }
    UI.scale = s;
    UI.rotated = rotate;
    g.classList.toggle('upscale', s >= 2);
    document.body.classList.toggle('touch', UI.isTouch);
  }
  UI.isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
  UI.fit = fit;
  UI.speedFactor = function () {
    if (root.MJ2_SPEED != null) return root.MJ2_SPEED; // test hook
    let k = UI.settings && UI.settings.speed === 'fast' ? 0.55 : 1;
    if (UI.autoFast) k *= 0.45;
    return k;
  };
  const tv = () => (MJ2.DATA.common.tileVersion ? '?v=' + MJ2.DATA.common.tileVersion : '');
  const kindOf = (k) => (typeof k === 'number' ? T.KINDS[k] : k);
  // ジャックポット対象牌は表示だけ金色素材に差し替える（牌ID・判定・点数は不変）。伏せ牌は backSrc なので漏れない。
  UI.goldSet = new Set();
  UI.setGoldTargets = (targets) => { UI.goldSet = new Set((targets || []).map((k) => (typeof k === 'number' ? T.KINDS[k] : k))); };
  const useGold = (kind) => {
    const ap = MJ2.DATA.config.jackpotTileAppearance;
    return !!(MJ2.DATA.gold && (!ap || ap.mode === 'gold_asset') && UI.goldSet.has(kind) && MJ2.DATA.gold.tiles[kind]);
  };
  // 金色は「ジャックポットに関係する牌」だけ: 手牌の対象牌を種類ごとに１枚（gold=true を渡した所だけ）。捨て牌・副露・その他は白。
  const tileDef = (kind, gold) => (gold && useGold(kind) ? MJ2.DATA.gold.tiles[kind] : MJ2.DATA.common.tiles[kind]);
  UI.isGold = (k) => useGold(kindOf(k));
  UI.tileSrc = (k, gold) => tileDef(kindOf(k), gold).file + tv();
  UI.tileSrcHd = (k, gold) => { const t = tileDef(kindOf(k), gold); return (t.hd || t.file) + tv(); };
  UI.tileSrcId = (id, gold) => UI.tileSrc(id >> 2, gold);
  UI.tileSrcIdHd = (id, gold) => UI.tileSrcHd(id >> 2, gold);
  UI.tileRotSrc = (kind, dir) => tileDef(kindOf(kind), false).rotated[dir] + tv();
  // 手牌（副露なし）のうち、ジャックポット対象の各種類の最初の１枚だけを金色にするIDの集合
  UI.goldIdsFor = (ids, hasMelds) => {
    const out = new Set(); if (hasMelds) return out;
    const seen = new Set();
    for (const id of ids) { const k = T.KINDS[id >> 2]; if (UI.goldSet.has(k) && !seen.has(k)) { seen.add(k); out.add(id); } }
    return out;
  };
  UI.goldSrc = (k, hd) => { const t = MJ2.DATA.gold && MJ2.DATA.gold.tiles[kindOf(k)]; return t ? (hd ? t.hd : t.file) + tv() : (hd ? UI.tileSrcHd(k) : UI.tileSrc(k)); };
  UI.backSrc = () => MJ2.DATA.common.tiles.back.file + tv();
  const charOf = (id) => MJ2.DATA.charById[id] || null;
  UI.faceSrc = (id) => { const c = charOf(id); return c ? c.portrait : ''; };
  UI.faceSmall = (id) => { const c = charOf(id); return c ? (c.portrait320 || c.portrait) : ''; };
  UI.faceHd = (id) => { const c = charOf(id); return c ? (c.portraitHD || c.portrait) : ''; };
  UI.charName = (id) => { const c = charOf(id); return c ? c.name : ''; };
  UI.stageBg = (id) => MJ2.DATA.stageById[id].background;

  function clearScreen() {
    const g = game();
    g.classList.remove('lonka-on');
    for (const c of [...g.children]) if (!c.classList.contains('fx-layer')) c.remove();
    const l = g.querySelector('.fx-layer'); if (l) l.innerHTML = '';
  }
  function newScreen(name) {
    clearScreen();
    UI.screen = name;
    return el('div', 'screen screen-' + name, game());
  }
  UI.newScreen = newScreen;
  // 黒漆の背景＋真鍮の外枠（v025 裏社会UI）。精算・順位・三冠王・清算・破産・戦歴・図鑑・設定で共通
  function chrome(s, opts) {
    img('assets/ui/screen_background.webp', 'uw-bg', s);
    if (!opts || opts.outer !== false) el('div', 'uw-outer', s);
    return s;
  }
  UI.chrome = chrome;

  // 共通ボタン（v025）: 文字なしのボタン素材に、文字と矢印をプログラムで載せる。状態は CSS（hover/active/disabled）
  const BTN_LABEL = { chi: 'チー', pon: 'ポン', kan: 'カン', riichi: 'リーチ', ron: 'ロン', tsumo: 'ツモ', pass: '見送り', confirm: '決定', back: '戻る', next: '次へ' };
  function imgBtn(name, parent, x, y, w, h, onClick) {
    const b = el('button', 'imgbtn ' + name, parent, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    b.dataset.btn = name;
    el('span', 'lb', b).textContent = BTN_LABEL[name] || name;
    if (name === 'next' || name === 'confirm') el('span', 'arw', b).textContent = '›';
    b.setDisabled = (d) => { b.disabled = d; };
    b.addEventListener('click', (ev) => { if (b.disabled) return; MJ2.Audio.play('ui_confirm'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); onClick && onClick(ev); });
    return b;
  }
  function txtBtn(label, parent, x, y, w, onClick, cls) {
    const b = el('button', 'txtbtn' + (cls ? ' ' + cls : ''), parent, { left: x + 'px', top: y + 'px', width: w ? w + 'px' : undefined });
    b.textContent = label;
    if (/(へ|次の頁|開始)$/.test(label)) { el('span', 'arw', b).textContent = '›'; }
    b.addEventListener('click', (ev) => { if (b.disabled) return; MJ2.Audio.play('ui_confirm'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); onClick && onClick(ev); });
    return b;
  }
  UI.imgBtn = imgBtn; UI.txtBtn = txtBtn;

  function confirmDialog(msg, okLabel) {
    return new Promise((res) => {
      const back = el('div', 'modal-back', game());
      const m = el('div', 'panel modal', game());
      el('div', '', m).innerHTML = msg;
      const row = el('div', '', m, { marginTop: '16px', position: 'relative', height: '30px' });
      const close = (v) => { back.remove(); m.remove(); res(v); };
      txtBtn('やめる', row, 60, 0, 120, () => close(false));
      txtBtn(okLabel || 'OK', row, 210, 0, 120, () => close(true));
    });
  }
  UI.confirm = confirmDialog;

  // ---------------- LONKA ロゴ（読み込み＋音を起こす） ----------------
  // 黒地に「LONKA CORPORATE PRESENTS」。読み込み中は右下に NOW LOADING…、終わると PRESS ANY KEY。
  // 押した１回で音を起こし（ブラウザの自動再生制限対策）→「ピッピッ」→ 社名が0.8秒で消えてタイトル。押した入力はタイトルに持ち越さない。
  function lonkaEl() {
    game().classList.add('lonka-on'); // ロゴの間はフィルム粒子を掛けない（真っ黒に白文字）
    let s = document.getElementById('lonka');
    if (!s) {
      s = el('div', 'screen screen-lonka', game()); s.id = 'lonka';
      s.innerHTML = '<div class="lk-name">LONKA CORPORATE PRESENTS</div><div class="lk-press"></div><div class="lk-loading">NOW LOADING...</div>';
    }
    return s;
  }
  UI.showBoot = function () {
    const s = lonkaEl();
    UI.screen = 'boot';
    s.classList.add('screen-boot', 'ready');
    s.querySelector('.lk-loading').style.display = 'none';
    s.querySelector('.lk-press').textContent = 'PRESS ANY KEY';
    let done = false;
    const go = (ev) => {
      if (done) return;
      if (ev && ev.type === 'keydown' && (ev.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key))) return;
      done = true;
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      root.removeEventListener('keydown', go, true);
      s.removeEventListener('click', go); s.removeEventListener('touchend', go);
      MJ2.Audio.unlock();
      if (MJ2.Audio.kick) MJ2.Audio.kick(); // スマホ: 指を離した操作の中で音を起こす
      MJ2.Audio.warmUp();
      MJ2.Audio.beep();
      s.querySelector('.lk-press').classList.add('hit');
      s.querySelector('.lk-press').style.visibility = 'hidden';
      s.style.pointerEvents = 'none'; // 押した入力をタイトルに渡さない（消えるまで全面で受け止める）
      const veil = el('div', 'abs', game(), { inset: '0', zIndex: '150' });
      s.querySelector('.lk-name').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800, delay: 180, fill: 'forwards' });
      setTimeout(() => { veil.remove(); if (MJ2.Opening && MJ2.Opening.enabled()) MJ2.Opening.play(() => UI.showTitle()); else UI.showTitle(); }, 1000); // 起動ロゴ → オープニング → タイトル
    };
    s.style.cursor = 'pointer';
    MJ2.Audio.installGestureUnlock();
    // スマホは「指を離した時」でないと音が許可されないので、pointerdown ではなく touchend / click で進む
    s.addEventListener('touchend', go);
    s.addEventListener('click', go);
    root.addEventListener('keydown', go, true);
  };

  // ---------------- title ----------------
  UI.showTitle = function () {
    UI.setGoldTargets([]);
    UI.autoFast = false;
    MJ2.Audio.bgm('bgm_title'); // タイトル〜組織選択のBGM（同じ曲なら途切れず続く）
    const s = newScreen('title');
    const stages = MJ2.DATA.stages;
    img('assets/backgrounds/title_bg.webp', 'bg grade', s); // タイトルの背景（v029）
    el('div', 'shade', s, { background: 'linear-gradient(90deg, rgba(10,2,2,.78), rgba(10,2,2,.15) 72%)' });
    img(MJ2.DATA.common.branding.logo, 'title-logo', s);
    const yr = el('div', 'title-year', s); yr.textContent = 'A.D. ' + ((MJ2.DATA.theme && MJ2.DATA.theme.year) || 2200);
    const menu = el('div', 'title-menu uw-panel', s);
    const has = MJ2.SaveStore.hasMatch();
    const items = [
      ['対局開始', () => UI.showStageSelect(), true],
      ['つづき', () => UI.resumeMatch(), has],
      ['戦績', () => UI.showRecords(), true],
      ['役図鑑', () => UI.showEncyclopedia(), true],
      ['設定', () => UI.showSettings(), true]
    ];
    let sel = 0;
    const nodes = items.map(([label, fn, en], i) => {
      const d = el('div', 'item' + (en ? '' : ' disabled'), menu);
      d.textContent = label;
      d.addEventListener('pointerenter', () => { if (en) setSel(i); });
      d.addEventListener('click', () => { if (!en) return; MJ2.Audio.play('title_select'); d.classList.add('flash'); setTimeout(fn, 160); });
      return d;
    });
    function setSel(i) { sel = i; nodes.forEach((n, j) => n.classList.toggle('sel', j === i)); }
    setSel(0);
    // 撃破状況
    const dn = stages.filter((st) => MJ2.Records.orgStat(st.id).defeated).length;
    const prog = el('div', 'abs', s, { left: '110px', top: '440px', width: '260px', textAlign: 'center', font: '13px MJ2Heavy', color: '#d9b77a', textShadow: '0 1px 2px #000' });
    prog.textContent = `組織撃破 ${dn} / ${stages.length}`;
    const ver = el('div', 'abs', s, { right: '10px', bottom: '6px', font: '9px MJ2Heavy', color: '#8d7a64' });
    ver.textContent = '裏社会編 v032';
  };

  // ---------------- organization select（対戦組織選択） ----------------
  UI.orgOf = (stageId) => { const st = MJ2.DATA.stageById[stageId]; return (st && MJ2.DATA.orgById[st.organizationId]) || null; };
  UI.orgName = (stageId) => { const st = MJ2.DATA.stageById[stageId]; return st ? st.label : ''; };
  UI.showStageSelect = function () {
    MJ2.Audio.bgm('bgm_title'); // タイトル〜組織選択のBGM（同じ曲なら途切れず続く）
    const s = newScreen('stage');
    const stages = MJ2.DATA.stages;
    let sel = Math.max(0, stages.findIndex((st) => !MJ2.Records.orgStat(st.id).defeated));
    if (UI.lastStageId) { const j = stages.findIndex((st) => st.id === UI.lastStageId); if (j >= 0) sel = j; }
    const bg = img(UI.stageBg(stages[sel].id), 'bg grade', s);
    el('div', 'shade', s, { background: 'linear-gradient(rgba(12,2,2,.72), rgba(12,2,2,.45) 40%, rgba(12,2,2,.86))' });
    const ttl = el('div', 'title-text', s, { top: '4px', fontSize: '22px' }); ttl.textContent = (MJ2.DATA.theme && MJ2.DATA.theme.selectTitle) || '対戦組織選択';
    const W = 130, GAP = 8, X0 = Math.round((720 - (W * stages.length + GAP * (stages.length - 1))) / 2);
    const cards = stages.map((st, i) => {
      const c = el('div', 'org-card', s, { left: (X0 + i * (W + GAP)) + 'px', top: '62px', width: W + 'px' });
      img(st.background, 'thumb', c);
      MJ2.dom.fit(Object.assign(el('div', 'oname f-brush', c), { textContent: st.label }), 12);
      MJ2.dom.fit(Object.assign(el('div', 'oloc', c), { textContent: st.location || '' }), 7);
      el('div', 'orate', c).textContent = `1点＝${(st.rateYenPerPoint || 1).toLocaleString('en-US')}円`;
      const mem = el('div', 'omem', c);
      for (const id of st.characterIds) {
        const r = el('div', 'm', mem);
        img(UI.faceSmall(id), '', r);
        const n = el('div', 'nm', r);
        const parts = UI.charName(id).split('・'); // 「クラック・アンダーソン」は・で２行に
        parts.forEach((x, j) => { el('div', '', n).textContent = x + (j < parts.length - 1 ? '・' : ''); });
        MJ2.dom.fit(n, 7);
      }
      if (MJ2.Records.orgStat(st.id).defeated) { const k = el('div', 'gekiha', c); k.textContent = (MJ2.DATA.theme && MJ2.DATA.theme.winLabel) || '撃破'; }
      c.addEventListener('click', () => { if (sel === i) go(); else setSel(i); });
      return c;
    });
    const info = el('div', 'org-info uw-panel', s);
    function setSel(i) {
      sel = i; MJ2.Audio.play('ui_move');
      cards.forEach((c, j) => c.classList.toggle('sel', j === i));
      bg.src = UI.stageBg(stages[i].id);
      const st = stages[i], os = MJ2.Records.orgStat(st.id);
      info.innerHTML = '';
      const hd = el('div', 'hd', info, { whiteSpace: 'nowrap', overflow: 'hidden' });
      el('div', 'big f-brush', hd).textContent = st.label;
      el('div', 'loc', hd).textContent = '拠点：' + (st.location || '') + `　レート 1点＝${(st.rateYenPerPoint || 1).toLocaleString('en-US')}円（南場×2・オーラス×3）`;
      el('div', 'desc', info).textContent = st.description || '';
      el('div', 'rec', info).innerHTML = (os.defeated ? '<b class="ok">撃破済み</b>　' : '<b>未撃破</b>　') + `対戦 ${os.matches}回／1位 ${os.firsts}回`;
    }
    function go() {
      const st = stages[sel];
      UI.lastStageId = st.id;
      MJ2.Audio.play('stage_confirm');
      MJ2.Audio.cue('an_org_' + st.id, 150); // 相手決定: ナレーションが組織名を読む
      const wash = el('div', 'abs', s, { inset: '0', background: 'radial-gradient(circle, rgba(255,90,60,.85), rgba(120,0,0,.0) 70%)', opacity: 0 });
      wash.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.6)' }], { duration: 380, fill: 'forwards' });
      setTimeout(() => UI.startNewMatch(st.id), 380);
    }
    setSel(sel);
    imgBtn('back', s, 22, 494, 118, 30, () => UI.showTitle());
    imgBtn('confirm', s, 580, 494, 118, 30, go);
  };

  // 対戦相手は組織の掲載順３人で固定（抽選しない）
  function drawRoster(stageId) {
    const st = MJ2.DATA.stageById[stageId];
    const me = MJ2.DATA.config.playerFaceId;
    const ids = (st.characterIds || st.characterIdsByStrength).filter((id) => id !== me);
    return ids.slice(0, st.opponentCount || 3);
  }
  UI.drawRoster = drawRoster;

  UI.startNewMatch = function (stageId, seedOverride) {
    const seed = seedOverride || (Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36));
    const opp = drawRoster(stageId);
    const me = MJ2.DATA.config.playerFaceId;
    const m = MJ2.Engine.newMatch({ seed, stageId, playerFaceId: me, roster: [me].concat(opp), humanSeats: [0] });
    m.themeId = (MJ2.DATA.theme && MJ2.DATA.theme.themeId) || null;
    MJ2.Audio.preloadVoices(m.roster);
    UI.match = m;
    MJ2.SaveStore.saveMatch(m);
    UI.showVS(m);
  };

  // ---------------- VS ----------------
  UI.showVS = async function (m) {
    MJ2.Audio.stopBgm(700);
    { const d = MJ2.Table.bgmFor && MJ2.Table.bgmFor(m, 'E1'); if (d) MJ2.Audio.prefetchBgm(d.id); }
    const s = newScreen('vs');
    img(UI.stageBg(m.stageId), 'bg grade', s, { filter: 'brightness(.5) saturate(.9)' });
    el('div', 'shade', s, { background: 'linear-gradient(rgba(0,0,0,.55), rgba(40,0,0,.25) 45%, rgba(0,0,0,.75))' });
    const st = MJ2.DATA.stageById[m.stageId];
    const tpl = (MJ2.DATA.theme && MJ2.DATA.theme.vsTitleTemplate) || 'VS {organizationName}';
    const head = el('div', 'vs-title', s);
    { const txt = tpl.replace('{organizationName}', st.label); const mm = /^(VS)\s*(.*)$/.exec(txt); if (mm) { el('span', 'vs', head).textContent = mm[1]; head.appendChild(document.createTextNode(mm[2])); } else head.textContent = txt; }
    const loc = el('div', 'vs-loc', s); loc.innerHTML = '― ' + (st.location || '') + ' ―' + `<br><span class="vs-rate">レート 1点＝${((m.rate || st.rateYenPerPoint) || 1).toLocaleString('en-US')}円　南場×2　オーラス×3</span>`;
    head.style.opacity = 0; loc.style.opacity = 0;
    const me = el('div', 'vs-face hero', s, { left: '22px', top: '186px', width: '210px', height: '210px' }); img(UI.faceHd(m.roster[0]), '', me);
    const myName = el('div', 'vs-name', s, { left: '22px', top: '402px', width: '210px' }); myName.textContent = UI.charName(m.roster[0]);
    me.animate([{ transform: 'translateX(-260px)' }, { transform: 'translateX(0)' }], { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    MJ2.Audio.cue('vs_face_stop', 280);
    head.animate([{ opacity: 0, transform: 'scale(2.2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, delay: 260, fill: 'forwards', easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    loc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 560, fill: 'forwards' });
    setTimeout(() => MJ2.dom.shake(s, 5, 200), 560);
    const xs = [262, 412, 562];
    for (let i = 1; i <= 3; i++) {
      const f = el('div', 'vs-face', s, { left: xs[i - 1] + 'px', top: '226px', width: '140px', height: '140px', opacity: 0 });
      img(UI.faceHd(m.roster[i]), '', f);
      const nm = el('div', 'vs-name', s, { left: (xs[i - 1] - 6) + 'px', top: '372px', width: '152px', opacity: 0 }); nm.textContent = UI.charName(m.roster[i]);
      const ch = MJ2.DATA.charById[m.roster[i]];
      const rl = el('div', 'vs-role', s, { left: (xs[i - 1] - 6) + 'px', top: '394px', width: '152px', opacity: 0 }); rl.textContent = (ch.role || '') + (ch.age ? '　' + ch.age + '歳' : '');
      const t0 = 520 + (i - 1) * 300;
      f.animate([{ opacity: 0, transform: 'translateX(220px) skewX(-10deg)' }, { opacity: 1, transform: 'translateX(0) skewX(0)' }], { duration: 240, delay: t0, fill: 'forwards', easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      nm.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: t0 + 200, fill: 'forwards' });
      rl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: t0 + 260, fill: 'forwards' });
      setTimeout(() => { MJ2.Audio.play('vs_face_stop'); MJ2.dom.shake(s, 3, 140); }, t0 + 240);
    }
    const sub = el('div', 'abs', s, { left: '0', right: '0', top: '448px', textAlign: 'center', font: '13px MJ2Heavy', color: '#e8cf9a', textShadow: '0 1px 3px #000' }); sub.textContent = '東南戦';
    await wait(2600);
    if (UI.screen !== 'vs') return;
    m.phase = 'round';
    MJ2.Table.begin(m, { fresh: true });
  };

  UI.resumeMatch = function () {
    const m = MJ2.SaveStore.loadMatch();
    if (!m) { MJ2.FX.toast('中断データがありません'); return; }
    const pol = MJ2.DATA.config.scoringPolicyVersion || 'transfer_v1';
    const rosterOk = (m.roster || []).every((id) => MJ2.DATA.charById[id]) && MJ2.DATA.stageById[m.stageId];
    if ((m.scoringPolicyVersion || 'legacy') !== pol || !rosterOk) {
      const why = rosterOk ? '旧ルールで始めた東南戦です。<br>点数の授受など新ルールでは続きから遊べません。' : '以前の世界観（旧キャラクター）で始めた東南戦です。<br>裏社会編では続きから遊べません。';
      UI.confirm('この中断データは' + why + '<br>中断データを破棄して、新しく始めてください。<br><span style="font-size:11px;color:#b8a48a">戦績・役図鑑は消えません</span>', '破棄する').then((ok) => { if (ok) { MJ2.SaveStore.clearMatch(); UI.showTitle(); } });
      return;
    }
    UI.match = m;
    if (m.phase === 'vs') { UI.showVS(m); return; }
    if (m.phase === 'match_end') { UI.showMatchResult(m); return; }
    MJ2.Table.begin(m, { fresh: false });
  };

  // ---------------- 三冠王 → final result → 組織撃破 ----------------
  function waitClick(s, label) {
    return new Promise((res) => {
      const h = el('div', 'abs blink', s, { right: '26px', bottom: '16px', font: '12px MJ2Heavy', color: '#f2d99a', textShadow: '0 1px 2px #000' });
      h.textContent = (label || '次へ') + ' ▶';
      const f = () => { s.removeEventListener('click', f); h.remove(); MJ2.Audio.play('ui_button'); res(); };
      setTimeout(() => s.addEventListener('click', f), 250);
    });
  }
  async function showTripleCrown(s, m) {
    const tc = m.tripleCrown;
    if (!tc) return;
    const L = el('div', 'tc-panel panel', s);
    el('div', 'tc-title dyn-name', L).textContent = '三冠王';
    MJ2.Audio.cue('an_title_crown', 200);
    const TV = { '子役王': 'an_title_minor', '多数王': 'an_title_majority', '鳴きの王': 'an_title_naki' };
    const yen = MJ2.util.yen;
    tc.titles.forEach((t, i) => {
      const row = el('div', 'tc-row', L, { opacity: 0 });
      el('div', 'tn f-brush', row).textContent = t.name;
      const faces = el('div', 'tf', row);
      for (let seat = 0; seat < 4; seat++) {
        const w = el('div', 'fc' + (t.winners.includes(seat) ? ' win' : ''), faces);
        img(UI.faceSmall(m.roster[seat]), '', w);
        el('span', '', w).textContent = t.values[seat] + (t.count === 'calls_total' ? '回' : '個');
      }
      el('div', 'tp', row).innerHTML = t.winners.length ? `${t.winners.map((x) => UI.charName(m.roster[x])).join('・')}<br>${MJ2.util.pts(t.prize)}＝<b>＋${yen(t.prizeYen, { prize: true })}</b>` : '該当なし';
      row.animate([{ opacity: 0, transform: 'translateX(-30px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 300 + i * 900, fill: 'forwards' });
      if (TV[t.name]) MJ2.Audio.cue(TV[t.name], 300 + i * 900 + 700);
      setTimeout(() => {
        if (!t.winners.length || !s.isConnected) return;
        MJ2.Audio.play('role_impact');
        // 賞金エリア（三冠王の文字）から受賞者へお札が飛ぶ（他家から奪う見せ方にしない）
        const from = MJ2.FX.logicalCenter(L.querySelector('.tc-title'));
        t.winners.forEach((seat, j) => {
          const to = MJ2.FX.logicalCenter(faces.children[seat].querySelector('img'));
          if (from && to) MJ2.Cash.fly(s, { amount: t.prizeYen, from, to, pile: { x: to.x, y: to.y }, delay: j * 140, max: 10, absorb: true });
        });
      }, 300 + i * 900 + 220);
    });
    const sw = el('div', 'tc-sweep', L, { opacity: 0 });
    if (tc.sweep.length) {
      sw.innerHTML = `三冠独占！ ${tc.sweep.map((x) => UI.charName(m.roster[x])).join('・')}　<b>追加 ${MJ2.util.pts(tc.sweepBonus)}＝＋${yen(tc.sweepBonusYen, { prize: true })}</b>`;
      sw.animate([{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 320, delay: 300 + tc.titles.length * 900 + 200, fill: 'forwards' });
      setTimeout(() => { MJ2.dom.shake(s, 5, 240); const from = MJ2.FX.logicalCenter(sw); tc.sweep.forEach((seat) => { const rows = L.querySelectorAll('.tc-row'); const to = MJ2.FX.logicalCenter(rows[rows.length - 1].querySelector('.tf').children[seat].querySelector('img')); if (from && to) MJ2.Cash.fly(s, { amount: tc.sweepBonusYen, from, to, pile: { x: to.x, y: to.y }, max: 12, absorb: true }); }); }, 300 + tc.titles.length * 900 + 400);
    } else {
      sw.textContent = '三冠独占ならさらに ' + MJ2.util.pts(tc.sweepBonus) + '＝＋' + yen(tc.sweepBonusYen, { prize: true });
      sw.classList.add('dim');
      sw.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 300 + tc.titles.length * 900, fill: 'forwards' });
    }
    el('div', 'tc-note', L).textContent = '賞金は各自の所持金に加算（同着は全員）';
    await waitClick(s, '最終順位へ');
    L.remove();
  }
  // ---- 清算: 全員の残り金額 → 君は生き残れたか？ ----
  async function showReckoning(s, m, ranking) {
    [...s.children].forEach((c) => { if (!c.classList.contains('bg') && !c.classList.contains('uw-bg') && !c.classList.contains('uw-outer')) c.remove(); });
    const bg = s.querySelector('.bg, .uw-bg'); if (bg) bg.style.filter = 'brightness(.6) saturate(.7)';
    const yen = MJ2.util.yen;
    const ttl = el('div', 'reck-title f-brush', s); ttl.textContent = '清算';
    const sub = el('div', 'reck-sub', s); sub.textContent = 'ここからは、現実の話だ。';
    ttl.animate([{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'none' }], { duration: 500, fill: 'forwards' });
    sub.animate([{ opacity: 0 }, { opacity: 0, offset: .4 }, { opacity: 1 }], { duration: 1200, fill: 'forwards' });
    await wait(1300);
    const list = el('div', 'reck-list', s);
    // 自分は最後に明かす
    const order = ranking.filter((x) => x.seat !== 0).concat(ranking.filter((x) => x.seat === 0));
    const rows = {};
    for (const x of ranking) {
      const r = el('div', 'reck-row' + (x.seat === 0 ? ' me' : ''), list, { opacity: 0 });
      el('div', 'rk', r).textContent = x.rank + '位';
      img(UI.faceSrc(x.faceId), 'fc', r);
      const t = el('div', 't', r);
      el('div', 'nm', t).textContent = UI.charName(x.faceId) + (x.seat === 0 ? '（あなた）' : '');
      el('div', 'pt', t).textContent = '持ち点 ' + MJ2.util.pts(x.points);
      const pileBox = el('div', 'pl', r);
      const mo = el('div', 'mo', r); mo.textContent = '…';
      rows[x.seat] = { r, mo, pileBox };
    }
    for (const x of order) {
      if (UI.screen !== 'result') return;
      const R = rows[x.seat];
      R.r.animate([{ opacity: 0, transform: 'translateX(-30px)' }, { opacity: 1, transform: 'none' }], { duration: 260, fill: 'forwards' });
      await wait(x.seat === 0 ? 900 : 380);
      const neg = x.money <= 0;
      R.mo.className = 'mo' + (neg ? ' neg' : '');
      const prof = x.money - ((m.initialYen && m.initialYen[x.seat]) || 0);
      R.mo.innerHTML = `<span>${neg ? '借金' : '所持金'}</span>${yen(Math.abs(x.money)).replace(/(億|万|円)/g, '<small>$1</small>')}<em class="${prof < 0 ? 'm' : 'p'}">収支 ${MJ2.util.yenSigned(prof)}</em>`;
      R.pileBox.appendChild(MJ2.Cash.pile(R.pileBox, x.money, UI.charName(x.faceId)));
      R.mo.animate([{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'none' }], { duration: 240, fill: 'forwards' });
      MJ2.Audio.play(neg ? 'role_impact' : 'score_confirm');
      if (neg) MJ2.dom.shake(R.r, 4, 220);
      await wait(x.seat === 0 ? 700 : 520);
    }
    const me = ranking.find((x) => x.seat === 0);
    const alive = me.money > 0;
    const line = me.rank === 1 ? (alive ? '勝った。そして、生き残った。' : '勝負には勝った。……だが、借金が残った。') : (alive ? '負けた。だが、生き残った。' : '君は、生き残れなかった。');
    const v = el('div', 'reck-verdict ' + (alive ? 'alive' : 'dead'), s);
    el('div', 'q', v).textContent = '君は生き残れたか？';
    el('div', 'a', v).textContent = line;
    v.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
    v.querySelector('.a').animate([{ opacity: 0, transform: 'scale(2.2)', letterSpacing: '16px' }, { opacity: 0, offset: .45 }, { opacity: 1, transform: 'none', letterSpacing: '4px' }], { duration: 1300, fill: 'forwards' });
    setTimeout(() => { MJ2.dom.shake(s, alive ? 3 : 8, alive ? 200 : 420); MJ2.Audio.play(alive ? 'victory' : 'yakuman_win'); }, 900);
    await wait(1500);
  }

  // ---- 破産（東場終了時に所持金0円以下）: ゲームオーバー ----
  async function showBankrupt(m) {
    const s = newScreen('result');
    chrome(s);
    const firstApply = MJ2.Records.applyMatchEnd(m);
    MJ2.SaveStore.clearMatch();
    MJ2.Audio.stopBgm(300);
    const seat = m.humanSeats[0];
    const b = m.bankrupt;
    const iou = el('div', 'bk-iou', s, { opacity: 0 });
    img(MJ2.Cash.SRC.iou, '', iou);
    const t = el('div', 'bk-iou-t', iou);
    el('div', 'n', t).textContent = UI.charName(m.roster[seat]);
    el('div', 'a', t).textContent = '負債 ' + MJ2.util.yen(Math.max(0, -b.money));
    const big = el('div', 'bk-title f-brush', s, { opacity: 0 }); big.textContent = '破産';
    const go = el('div', 'bk-go', s, { opacity: 0 }); go.textContent = 'GAME OVER';
    const sub = el('div', 'bk-sub', s, { opacity: 0 });
    sub.innerHTML = `東場を終えた時点で、所持金が尽きた。<br>持ち点 ${MJ2.util.pts(b.points)}　所持金 ${MJ2.util.yen(b.money)}`;
    MJ2.Audio.play('game_over'); // 破産の音
    big.animate([{ opacity: 0, transform: 'scale(3) rotate(-6deg)' }, { opacity: 1, transform: 'scale(1) rotate(-6deg)' }], { duration: 380, fill: 'forwards', easing: 'cubic-bezier(.3,1.4,.5,1)' });
    setTimeout(() => MJ2.dom.shake(s, 9, 480), 340);
    iou.animate([{ opacity: 0, transform: 'translateY(-40px) rotate(8deg)' }, { opacity: 1, transform: 'rotate(-4deg)' }], { duration: 500, delay: 700, fill: 'forwards' });
    go.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 1300, fill: 'forwards' });
    sub.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 1700, fill: 'forwards' });
    await wait(2300);
    if (UI.screen !== 'result') return;
    const note = el('div', 'abs', s, { left: '0', right: '0', top: '476px', textAlign: 'center', font: '10px MJ2Heavy', color: '#a8957a' });
    note.textContent = firstApply ? '戦績に記録しました' : '';
    txtBtn('再戦', s, 28, 494, 120, () => UI.startNewMatch(m.stageId));
    txtBtn('組織選択', s, 300, 494, 120, () => { UI.lastStageId = m.stageId; UI.showStageSelect(); });
    txtBtn('タイトル', s, 572, 494, 120, () => UI.showTitle());
  }

  UI.showMatchResult = async function (m) {
    if (m.bankrupt) return showBankrupt(m);
    UI.autoFast = false;
    MJ2.Settlement.applyTripleCrown(m);
    const s = newScreen('result');
    chrome(s);
    const ttl = el('div', 'title-text', s, { top: '18px', fontSize: '28px', fontFamily: 'MJ2Sharp' }); ttl.textContent = '東南戦 結果発表';
    const firstApply = MJ2.Records.applyMatchEnd(m);
    MJ2.SaveStore.clearMatch();
    MJ2.Audio.stopBgm(1500);
    if (!UI.skipCrown) await showTripleCrown(s, m);
    if (UI.screen !== 'result') return;
    const ranking = MJ2.Settlement.finalRanking(m);
    const cards = ranking.map((x, i) => {
      const c = el('div', 'rank-card' + (x.rank === 1 ? ' first' : ''), s, { left: (22 + i * 172) + 'px', top: '74px', opacity: 0 });
      el('div', 'rk', c).textContent = x.rank + '位';
      const fc = el('div', 'fc', c); img(UI.faceSrc(x.faceId), '', fc);
      el('div', 'nm', c).textContent = UI.charName(x.faceId);
      el('div', 'sc' + (x.points < 0 ? ' neg' : ''), c).textContent = MJ2.util.pts(x.points);
      el('div', 'you', c).textContent = x.seat === 0 ? 'あなた' : '';
      return c;
    });
    MJ2.Audio.play('rank_reveal');
    for (let i = cards.length - 1; i >= 0; i--) {
      const first = ranking[i].rank === 1;
      cards[i].animate([{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: first ? 520 : 300, fill: 'forwards' });
      if (first) {
        MJ2.Audio.play('victory');
        const g = el('div', 'abs', s, { left: (22 + i * 172 - 40) + 'px', top: '50px', width: '192px', height: '240px', background: 'radial-gradient(circle, rgba(255,200,110,.5), transparent 65%)', pointerEvents: 'none' });
        g.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.2)' }, { opacity: .6, transform: 'scale(1)' }], { duration: 1600, fill: 'forwards' });
        MJ2.dom.shake(s, 4, 260);
      }
      await wait(first ? 600 : 380);
    }
    const me = ranking.find((x) => x.seat === 0);
    if (!(me && me.rank === 1)) MJ2.Audio.play('role_impact'); // 撃破できなかった時は役と同じ「ドーン」
    if (me && me.rank === 1) {
      const st = MJ2.DATA.stageById[m.stageId];
      const stamp = el('div', 'gekiha-big', s);
      stamp.innerHTML = `<span class="o">${st.label}</span><span class="k">${(MJ2.DATA.theme && MJ2.DATA.theme.winLabel) || '撃破'}</span>`;
      stamp.animate([{ opacity: 0, transform: 'rotate(-8deg) scale(3)' }, { opacity: 1, transform: 'rotate(-8deg) scale(1)' }], { duration: 280, fill: 'forwards', easing: 'cubic-bezier(.3,1.4,.5,1)' });
      setTimeout(() => MJ2.dom.shake(s, 7, 300), 260);
      MJ2.Audio.play('result_yakuman'); // 撃破: 役満と同じ銅鑼の音
      const all = MJ2.DATA.stages.every((x) => MJ2.Records.orgStat(x.id).defeated);
      if (all) { const a = el('div', 'abs', s, { left: '0', right: '0', top: '448px', textAlign: 'center', font: '13px MJ2Heavy', color: '#ffd98a', textShadow: '0 1px 3px #000' }); a.textContent = '全組織を撃破した！　裏社会の頂点だ'; }
    }
    if (firstApply) MJ2.Audio.play('save_complete');
    // 麻雀の結果のあとに、お金の現実
    await waitClick(s, '清算へ');
    if (UI.screen !== 'result') return;
    await showReckoning(s, m, ranking);
    if (UI.screen !== 'result') return;
    const note = el('div', 'abs', s, { left: '0', right: '0', top: '476px', textAlign: 'center', font: '10px MJ2Heavy', color: '#a8957a' });
    note.textContent = firstApply ? '戦績に記録しました' : '';
    txtBtn('再戦', s, 28, 494, 120, () => UI.startNewMatch(m.stageId));
    txtBtn('組織選択', s, 300, 494, 120, () => { UI.lastStageId = m.stageId; UI.showStageSelect(); });
    txtBtn('タイトル', s, 572, 494, 120, () => UI.showTitle());
  };

  // ---------------- records ----------------
  UI.showRecords = function () {
    MJ2.Audio.bgm('bgm_title');
    const s = newScreen('records');
    chrome(s);
    const ttl = el('div', 'title-text', s, { top: '8px', fontSize: '28px' }); ttl.textContent = '戦歴';
    const st = MJ2.Records.stats();
    const L = el('div', 'panel', s, { left: '20px', top: '80px', width: '300px', height: '386px', padding: '14px 18px' });
    el('div', 'f-brush', L, { textAlign: 'center', fontSize: '20px', marginBottom: '6px' }).textContent = '総合戦績';
    const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');
    const rows = [
      ['対戦回数', st.matches],
      ['1位〜4位', st.ranks.join(' / ')],
      ['1位率', pct(st.firstRate)],
      ['平均順位', st.avgRank == null ? '—' : st.avgRank.toFixed(2)],
      ['累計の収支', MJ2.util.yenSigned(st.totalPoints)],
      ['破産', st.bankrupts + '回'],
      ['最高所持金(東南戦)', st.bestMatchScore == null ? '—' : MJ2.util.yen(st.bestMatchScore)],
      ['局数', st.rounds],
      ['和了率', pct(st.winRate)],
      ['稼いだ局の割合', pct(st.scoringRate)]
    ];
    for (const [k, v] of rows) { const r = el('div', 'stat-row', L); el('span', '', r).textContent = k; el('span', 'v', r).textContent = v; }
    const R = el('div', 'panel', s, { left: '334px', top: '80px', width: '366px', height: '386px', padding: '10px 14px' });
    const tabs = el('div', 'tabs', s, { right: '24px', top: '54px' });
    const TABS = ['組織', '対戦相手別', '対戦履歴'];
    let tab = '組織', page = 0;
    const tabEls = TABS.map((t) => { const x = el('span', 'tab', tabs); x.textContent = t; x.addEventListener('click', (ev) => { ev.stopPropagation(); tab = t; page = 0; draw(); }); return x; });
    const list = el('div', '', R);
    const pager = el('div', 'abs', R, { left: '0', right: '0', bottom: '6px', textAlign: 'center', font: '10px MJ2Heavy', color: '#b8a48a' });
    const chars = MJ2.DATA.characters.filter((c) => c.id !== MJ2.DATA.config.playerFaceId).map((c) => c.id);
    function pages() { return tab === '組織' ? 1 : tab === '対戦相手別' ? Math.ceil(chars.length / 5) : Math.max(1, Math.ceil(MJ2.Records.history().length / 6)); }
    function draw() {
      tabEls.forEach((t, i) => t.classList.toggle('on', TABS[i] === tab));
      list.innerHTML = '';
      if (tab === '組織') {
        for (const o of MJ2.DATA.stages) {
          const os = MJ2.Records.orgStat(o.id);
          const row = el('div', 'org-row', list);
          img(o.background, 'ot', row);
          const t = el('div', 't', row);
          t.innerHTML = `<span class="f-brush on">${o.label}</span>　<span class="dim-text" style="font-size:10px">${o.location || ''}</span><br><span class="dim-text">対戦 ${os.matches}回　1位 ${os.firsts}回</span>`;
          if (os.defeated) el('div', 'gekiha s', row).textContent = '撃破';
        }
      } else if (tab === '対戦相手別') {
        for (const id of chars.slice(page * 5, page * 5 + 5)) {
          const c = MJ2.Records.charStat(id);
          const row = el('div', 'char-row', list, { height: '68px' });
          img(UI.faceSmall(id), '', row, { width: '58px', height: '58px' });
          const t = el('div', 't', row, { lineHeight: '19px', marginLeft: '12px' });
          t.innerHTML = `<span class="on">${UI.charName(id)}</span>　<span class="dim-text" style="font-size:10px">${UI.orgName(MJ2.DATA.charById[id].stageId)}</span><br><span class="gold-text">${c.wins}勝 ${c.losses}敗 ${c.draws}分</span>　<span class="dim-text">勝率 ${c.winRate == null ? '—' : (c.winRate * 100).toFixed(1) + '%'}</span><br><span class="dim-text" style="font-size:10px">同卓 ${c.matches}試合</span>`;
        }
      } else {
        const h = MJ2.Records.history();
        if (!h.length) el('div', '', list, { textAlign: 'center', marginTop: '140px', color: '#b8a48a', fontSize: '12px' }).textContent = 'まだ対戦履歴がありません';
        for (const x of h.slice(page * 6, page * 6 + 6)) {
          const row = el('div', 'hist-row', list);
          const d = new Date(x.at);
          el('div', 'd', row).textContent = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          el('div', 'o f-brush', row).textContent = UI.orgName(x.orgId);
          el('div', 'r' + (x.rank === 1 && !x.bankrupt ? ' first' : '') + (x.bankrupt ? ' bk' : ''), row).textContent = x.bankrupt ? '破産' : x.rank + '位';
          el('div', 's' + (x.score < 0 ? ' neg' : ''), row).textContent = MJ2.util.money(x.score);
        }
      }
      const np = pages();
      if (page >= np) page = 0;
      pager.textContent = np > 1 ? `${page + 1} / ${np}　（クリックで次へ）` : '';
    }
    R.addEventListener('click', () => { const np = pages(); if (np > 1) { page = (page + 1) % np; draw(); } });
    draw();
    imgBtn('back', s, 22, 494, 118, 30, () => UI.showTitle());
    txtBtn('役図鑑', s, 580, 494, 118, () => UI.showEncyclopedia());
  };

  // ---------------- encyclopedia ----------------
  function roleValueText(r) {
    if (r.class === 'han') return r.value + '翻' + (MJ2.Yaku.KUISAGARI.includes(r.id) ? '（鳴き' + (r.value - 1) + '翻）' : '');
    if (r.class === 'minor') return '子役（獲得4個ごとに1翻・最大4翻）';
    if (r.class === 'fixed') return MJ2.util.fmt(r.value) + '点（固定）';
    if (r.id === 'sp_jackpot') return MJ2.util.fmt(r.value) + '点';
    if (r.class === 'yakuman') return r.id.startsWith('std_') ? '役満（子32,000点/親48,000点）' : '役満 ' + MJ2.util.fmt(MJ2.DATA.config.ordinaryCustomYakumanPoints) + '点';
    return '';
  }
  UI.encyclopediaName = function (id) { return MJ2.Records.roleStat(id) ? MJ2.DATA.roleById[id].name : '？？？？'; };
  UI.showEncyclopedia = function () {
    MJ2.Audio.bgm('bgm_title');
    const s = newScreen('encyclopedia');
    chrome(s);
    const ttl = el('div', 'title-text', s, { top: '18px', fontSize: '28px' }); ttl.textContent = '役図鑑';
    const all = MJ2.DATA.roles;
    const found = all.filter((r) => MJ2.Records.roleStat(r.id));
    const cnt = el('div', 'abs', s, { right: '24px', top: '54px', font: '11px MJ2Heavy' }); cnt.textContent = `発見 ${found.length}/${all.length}`;
    const cats = ['全て', '通常役', '新役', '子役', '役満'];
    let cat = '全て', page = 0, selId = null;
    const tabs = el('div', 'tabs', s, { left: '24px', top: '54px' });
    const tabEls = cats.map((c) => { const t = el('span', 'tab', tabs); t.textContent = c; t.addEventListener('click', () => { cat = c; page = 0; draw(); }); return t; });
    const L = el('div', 'panel', s, { left: '20px', top: '78px', width: '262px', height: '398px', padding: '4px 0' });
    const R = el('div', 'panel', s, { left: '296px', top: '78px', width: '404px', height: '398px', padding: '22px 26px' });
    const per = 12;
    function list() { return all.filter((r) => cat === '全て' || r.displayCategory === cat || (cat === '子役' && r.displayCategory === '小役')); }
    function draw() {
      tabEls.forEach((t, i) => t.classList.toggle('on', cats[i] === cat));
      const arr = list();
      const pages = Math.max(1, Math.ceil(arr.length / per));
      if (page >= pages) page = 0;
      L.innerHTML = '';
      const fc = arr.filter((r) => MJ2.Records.roleStat(r.id)).length;
      el('div', '', L, { font: '10px MJ2Heavy', color: '#b8a48a', textAlign: 'center', height: '16px' }).textContent = `${cat}　${fc}/${arr.length}　p.${page + 1}/${pages}`;
      for (const r of arr.slice(page * per, page * per + per)) {
        const known = !!MJ2.Records.roleStat(r.id);
        const it = el('div', 'enc-item' + (known ? '' : ' unk') + (selId === r.id ? ' sel' : ''), L, { height: '26px', margin: '3px 6px', lineHeight: '22px' });
        it.textContent = known ? r.name : '？？？？';
        it.addEventListener('click', () => { selId = r.id; draw(); });
      }
      detail();
      nextBtn.textContent = pages > 1 ? '次の頁' : '次の頁';
    }
    function detail() {
      R.innerHTML = '';
      if (!selId) { el('div', '', R, { textAlign: 'center', marginTop: '140px', color: '#b8a48a', font: '12px MJ2Heavy' }).textContent = '左の一覧から選んでください'; return; }
      const r = MJ2.DATA.roleById[selId];
      const st = MJ2.Records.roleStat(selId);
      if (!st) {
        el('div', 'f-sharp', R, { textAlign: 'center', fontSize: '34px', marginTop: '40px' }).textContent = '？？？？';
        el('div', '', R, { textAlign: 'center', marginTop: '40px', font: '12px MJ2Heavy' }).textContent = 'まだ獲得していない役';
        el('div', '', R, { textAlign: 'center', marginTop: '18px', font: '10px MJ2Heavy', color: '#b8a48a' }).textContent = '対局で獲得すると解禁';
        el('div', '', R, { textAlign: 'center', marginTop: '18px', font: '10px MJ2Heavy', color: '#b8a48a' }).textContent = '条件・点数：？？？？';
        return;
      }
      el('div', 'dyn-name', R, { textAlign: 'center', fontSize: r.name.length > 8 ? '26px' : '34px', position: 'relative', marginTop: '6px' }).textContent = r.name;
      el('div', '', R, { textAlign: 'center', font: '10px MJ2Heavy', color: '#b8a48a', marginTop: '6px' }).textContent = (r.displayCategory === '小役' ? '子役' : r.displayCategory) + (r.balanceProvisional && r.class !== 'minor' ? '（翻数は初期案）' : '');
      el('div', '', R, { marginTop: '16px', font: '12px MJ2Heavy', lineHeight: '20px', minHeight: '64px' }).textContent = r.condition;
      const rows = [
        ['点数', roleValueText(r)], ['獲得回数', st.count + '回'],
        ['出現率', st.rate == null ? '—' : (st.rate * 100).toFixed(1) + '%（参加局あたり）'],
        ['和了での獲得', st.winCount + '回'], ['未和了での獲得', st.nonwinCount + '回']
      ];
      for (const [k, v] of rows) { const rr = el('div', 'stat-row', R, { height: '30px' }); el('span', '', rr).textContent = k; el('span', 'v', rr, { fontSize: '12px' }).textContent = v; }
    }
    imgBtn('back', s, 22, 494, 118, 30, () => UI.showTitle());
    const nextBtn = txtBtn('次の頁', s, 580, 494, 118, () => { page++; draw(); });
    draw();
  };

  // ---------------- settings ----------------
  UI.showSettings = function () {
    MJ2.Audio.bgm('bgm_title');
    const s = newScreen('settings');
    chrome(s);
    const ttl = el('div', 'title-text', s, { top: '20px', fontSize: '30px' }); ttl.textContent = '設定';
    const P = el('div', 'panel', s, { left: '90px', top: '70px', width: '540px', height: '410px', padding: '8px 24px' });
    const st = UI.settings;
    function seg(label, key, opts) {
      const r = el('div', 'setting-row', P); el('span', '', r).textContent = label;
      const g = el('div', 'seg', r);
      const sp = opts.map(([v, t]) => { const x = el('span', st[key] === v ? 'on' : '', g); x.textContent = t; x.addEventListener('click', () => { st[key] = v; MJ2.SaveStore.saveSettings(st); sp.forEach((y, i) => y.classList.toggle('on', opts[i][0] === v)); }); return x; });
    }
    seg('打牌方式', 'discardMode', [['double', '２回クリック'], ['button', '選択＋打牌ボタン']]);
    seg('対局速度', 'speed', [['normal', '標準'], ['fast', '早送り']]);
    seg('スマホ縦持ち', 'portraitMode', [['rotate', '横向きに回転'], ['fit', 'そのまま縮小']]);
    P.querySelectorAll('.seg span').forEach((x) => x.addEventListener('click', fit));
    const LV = [[0, 'オフ'], [0.25, '小'], [0.5, '中'], [0.75, '大'], [1, '最大']];
    const near = (v) => LV.reduce((a, b) => (Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a))[0];
    function vol(label, key, sample) {
      const r = el('div', 'setting-row', P); el('span', '', r).textContent = label;
      const g = el('div', 'seg', r);
      const cur = () => near(st[key] ?? 0.8);
      const sp = LV.map(([v, t]) => { const x = el('span', cur() === v ? 'on' : '', g); x.textContent = t; x.addEventListener('click', () => {
        st[key] = v; st.muted = false; MJ2.SaveStore.saveSettings(st); MJ2.Audio.unlock(); MJ2.Audio.applySettings(st);
        sp.forEach((y, i) => y.classList.toggle('on', LV[i][0] === v)); if (sample) MJ2.Audio.play(sample);
      }); return x; });
    }
    vol('BGM', 'volBgm', null);
    vol('音声（実況）', 'volVoice', 'call_ron');
    vol('効果音（牌）', 'volSe', 'tile_discard');
    const r1 = el('div', 'setting-row', P); el('span', '', r1).textContent = 'データ書き出し / 読み込み';
    const io = el('div', 'seg', r1);
    const ex = el('span', '', io); ex.textContent = '書き出し(JSON)';
    ex.addEventListener('click', () => {
      const blob = new Blob([MJ2.SaveStore.exportAll()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mahjong2_save.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    const im = el('span', '', io); im.textContent = '読み込み';
    const file = el('input', '', P); file.type = 'file'; file.accept = '.json,application/json'; file.style.display = 'none';
    im.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try { MJ2.SaveStore.importAll(await f.text()); MJ2.FX.toast('読み込みました'); } catch (e) { MJ2.FX.toast('読み込み失敗: ' + e.message, 2600); }
    });
    const r2 = el('div', 'setting-row', P); el('span', '', r2).textContent = '中断中の東南戦を削除';
    const d1 = el('div', 'seg', r2); const b1 = el('span', '', d1); b1.textContent = MJ2.SaveStore.hasMatch() ? '削除する' : '（なし）';
    b1.addEventListener('click', async () => { if (!MJ2.SaveStore.hasMatch()) return; if (await UI.confirm('中断中の東南戦だけを削除します。<br>戦績・役図鑑は残ります。', '削除')) { MJ2.SaveStore.clearMatch(); b1.textContent = '（なし）'; MJ2.FX.toast('削除しました'); } });
    const r3 = el('div', 'setting-row', P); el('span', '', r3).textContent = '戦績・役図鑑をリセット';
    const d2 = el('div', 'seg', r3); const b2 = el('span', '', d2); b2.textContent = 'リセット';
    b2.addEventListener('click', async () => { if (await UI.confirm('総合戦績・対戦相手別・組織撃破・役図鑑をすべて消去します。<br>中断中の東南戦は消えません。元に戻せません。', '消去')) { MJ2.Records.resetRecords(); MJ2.FX.toast('リセットしました'); } });
    const info = el('div', '', P, { marginTop: '8px', font: '9px MJ2Heavy', color: '#b8a48a', lineHeight: '14px' });
    info.innerHTML = 'ルールの初期案は data/game_config.json と data/roles.json で調整できます。対局中は「≡ メニュー」でミュートできます。';
    imgBtn('back', s, 22, 494, 118, 30, () => UI.showTitle());
  };

  // ---------------- boot ----------------
  UI.boot = async function () {
    UI.settings = MJ2.SaveStore.loadSettings();
    fit();
    root.addEventListener('resize', fit);
    root.addEventListener('orientationchange', () => setTimeout(fit, 250));
    document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#game')) e.preventDefault(); });
    lonkaEl();
    const loadingMsg = (t) => { const x = document.querySelector('#lonka .lk-loading'); if (x) x.dataset.sub = t || ''; };
    try {
      await MJ2.Data.loadData();
    } catch (e) { const x = document.querySelector('#lonka .lk-loading'); if (x) x.textContent = 'データ読み込みエラー: ' + e.message; throw e; }
    MJ2.Audio.applySettings(UI.settings);
    // 読み込みが20秒で終わらなくても先へ進める（閉じ込め防止）
    const all = (async () => {
      // wait for the bundled web fonts before any effect text
      try {
        await Promise.all(['MJ2Brush', 'MJ2Sharp', 'MJ2Heavy'].map((f) => document.fonts.load(`20px "${f}"`, '麻雀局ロンツモ役満1')).concat([document.fonts.load('16px "PressStart2P"', 'LONKA')]));
        UI.fontsOk = ['MJ2Brush', 'MJ2Sharp', 'MJ2Heavy'].every((f) => document.fonts.check(`20px "${f}"`, '麻雀'));
      } catch (e) { UI.fontsOk = false; }
      // preload tile images (normal + HD + sideways) so the deal never shows half-loaded tiles
      try {
        const urls = [];
        for (const k of T.KINDS.concat(['back'])) { urls.push(UI.tileSrc(k), UI.tileSrcHd(k)); if (k !== 'back') urls.push(UI.tileRotSrc(k, 'east')); }
        if (MJ2.DATA.gold) for (const k of T.KINDS) { const gd = MJ2.DATA.gold.tiles[k]; if (gd) urls.push(gd.file + tv(), gd.hd + tv()); }
        for (const st of MJ2.DATA.stages) urls.push(st.background);
        urls.push(MJ2.DATA.common.background.file, MJ2.DATA.common.branding.logo);
        if (MJ2.Cash) urls.push(...Object.values(MJ2.Cash.SRC));
        await Promise.all(urls.map((u) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = u; })));
      } catch (e) { /* continue */ }
      // 音声・効果音・東場BGMを先にデコード（押す前でも停止中のAudioContextでデコードできる）
      try { await MJ2.Audio.preloadAll(); } catch (e) { /* silent */ }
    })();
    await Promise.race([all, wait(root.MJ2_LOAD_TIMEOUT_MS || 20000)]);
    loadingMsg('');
    if (!UI.screen) UI.showBoot(); // テスト等で先に画面が進んでいたらロゴは出さない
    if (!UI.fontsOk) MJ2.FX.toast('フォントを読み込めませんでした（start.command / start.bat で起動してください）', 5000);
  };
})(typeof window !== 'undefined' ? window : globalThis);
