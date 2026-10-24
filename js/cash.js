/* 麻雀2 現金演出（お札・硬貨・札束が飛ぶ）。確定済みの精算を見せるだけで、残高は一切変更しない。
   素材: assets/cash/*.png（MAHJONG2_CASH_AND_YAKU_NAMES_v001。架空の MAHJONG 2 BANK 紙幣）。 */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const { el, img, wait } = MJ2.dom;
  const SRC = {
    bundle: 'assets/cash/bundle_100man.png', b10k: 'assets/cash/bill_10000.png', b10kBack: 'assets/cash/bill_10000_back.png',
    b1k: 'assets/cash/bill_1000.png', coin: 'assets/cash/coin_100.png', side: 'assets/cash/bundle_side.png',
    caseClosed: 'assets/cash/case_closed.png', caseOpen: 'assets/cash/case_open.png', iou: 'assets/cash/iou.png'
  };
  const UNIT = { bundle: 1000000, b10k: 10000, b1k: 1000, coin: 100 };
  const SIZE = { bundle: [58, 26], b10k: [58, 25], b1k: [58, 25], coin: [16, 16] };
  const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

  // 金額 → 飛ばすスプライトの並び。100万円以上は札束、以下は１万円札・千円札・百円玉。
  // 枚数が多い時は「×10」などの倍率付きの代表スプライトにまとめる（代表額×枚数＝実額）。百円未満は数字だけ。
  function breakdown(amount, maxSprites) {
    amount = Math.abs(Math.round(amount || 0));
    const max = maxSprites || 24;
    let rest = amount;
    const counts = {};
    for (const t of ['bundle', 'b10k', 'b1k', 'coin']) { counts[t] = Math.floor(rest / UNIT[t]); rest -= counts[t] * UNIT[t]; }
    const types = ['bundle', 'b10k', 'b1k', 'coin'].filter((t) => counts[t] > 0);
    const per = Math.max(3, Math.floor(max / Math.max(1, types.length)));
    const out = [];
    for (const t of types) {
      const n = counts[t];
      let g = 1;
      for (const x of NICE) { g = x; if (Math.ceil(n / x) <= per) break; }
      const full = Math.floor(n / g), rem = n % g;
      for (let i = 0; i < full; i++) out.push({ type: t, mult: g, yen: UNIT[t] * g });
      if (rem) out.push({ type: t, mult: rem, yen: UNIT[t] * rem });
    }
    return { sprites: out, remainder: rest };
  }

  // a single sprite (with the stack look + ×N label for grouped sprites)
  function makeSprite(parent, sp) {
    const [w, h] = SIZE[sp.type];
    const d = el('div', 'cash-sp ' + sp.type, parent, { width: w + 'px', height: h + 'px' });
    if (sp.mult > 1 && sp.type !== 'coin') { img(SRC[sp.type], 'under u2', d); img(SRC[sp.type], 'under u1', d); }
    const face = img(SRC[sp.type], 'cimg', d);
    if (sp.type === 'b10k') { d._back = img(SRC.b10kBack, 'cimg back', d); d._back.style.visibility = 'hidden'; }
    if (sp.mult > 1) el('div', 'mul', d).textContent = '×' + sp.mult;
    d._face = face;
    return d;
  }

  // flies `amount` from `from` to `to` (logical px). onDepart(yen) / onLand(yen) let the caller tick the numbers.
  // returns { done: Promise, finish() } — finish() completes everything instantly (skip).
  function fly(parent, opts) {
    const k = MJ2.UI.speedFactor ? MJ2.UI.speedFactor() : 1;
    const { sprites } = breakdown(opts.amount, opts.max || 24);
    const from = opts.from, to = opts.to;
    const timers = [], anims = [];
    let departed = 0, landed = 0, finished = false, yenSnd = false;
    const pile = opts.pile || { x: to.x, y: to.y };
    const stagger = (sprites.length > 14 ? 42 : 66) * k;
    let resolveDone;
    const done = new Promise((r) => (resolveDone = r));
    const landAt = (i) => ({ x: pile.x + ((i * 7) % 15) - 7, y: pile.y - Math.min(i, 14) * 1.6 });
    const settle = (d, i) => { const p = landAt(i); d.style.left = (p.x - d.offsetWidth / 2) + 'px'; d.style.top = (p.y - d.offsetHeight / 2) + 'px'; d.style.transform = `rotate(${((i * 37) % 13) - 6}deg)`; };
    const nodes = sprites.map((sp, i) => {
      const d = makeSprite(parent, sp);
      d.style.left = (from.x - d.offsetWidth / 2) + 'px'; d.style.top = (from.y - d.offsetHeight / 2) + 'px';
      d.style.opacity = '0';
      return d;
    });
    const departOne = (i) => {
      if (finished) return;
      const sp = sprites[i], d = nodes[i];
      d.style.opacity = '1';
      departed += sp.yen; opts.onDepart && opts.onDepart(sp.yen, departed);
      const snd = sp.type === 'coin' ? 'SE_COIN' : sp.type === 'bundle' ? null : 'SE_BILL_FLIP';
      if (snd) MJ2.Audio.play(snd);
      const dur = (350 + ((i * 53) % 150)) * k;
      const p = landAt(i);
      const dx = p.x - from.x, dy = p.y - from.y;
      const lift = 50 + ((i * 29) % 40) + Math.abs(dx) * 0.12;
      const spin = (sp.type === 'coin' ? 540 : 200) * (i % 2 ? 1 : -1) + ((i * 41) % 60);
      const kf = [];
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        const x = dx * t, y = dy * t - lift * 4 * t * (1 - t);
        const flip = sp.type === 'b10k' || sp.type === 'b1k' || sp.type === 'coin' ? Math.cos(t * Math.PI * 2) : 1;
        kf.push({ transform: `translate(${x}px, ${y}px) rotate(${spin * t}deg) scaleX(${Math.max(0.12, Math.abs(flip)).toFixed(3)})`, offset: t });
      }
      const a = d.animate(kf, { duration: dur, easing: 'cubic-bezier(.3,.1,.5,1)' });
      anims.push(a);
      // 表↔裏（scaleX が細くなった所で差し替え）
      if (d._back) { const show = (v) => { d._back.style.visibility = v ? 'visible' : 'hidden'; }; timers.push(setTimeout(() => show(true), dur * 0.25)); timers.push(setTimeout(() => show(false), dur * 0.75)); }
      a.onfinish = () => landOne(i);
    };
    const landOne = (i) => {
      const sp = sprites[i], d = nodes[i];
      if (d._landed) return;
      d._landed = true;
      settle(d, i);
      if (d._back) d._back.style.visibility = 'hidden';
      if (!finished) {
        d.animate([{ transform: d.style.transform + ' translateY(-3px) scaleY(1.06)' }, { transform: d.style.transform + ' translateY(1px) scaleY(.94)' }, { transform: d.style.transform }], { duration: 110 });
        MJ2.Audio.play(sp.type === 'bundle' ? 'SE_BUNDLE_DROP' : sp.type === 'coin' ? 'SE_COIN' : 'SE_BILL_LAND');
      }
      if (!finished && !yenSnd) { yenSnd = true; MJ2.Audio.play('SE_YEN_GET'); } // 受け渡し１件につき１回
      landed += sp.yen; opts.onLand && opts.onLand(sp.yen, landed);
      if (nodes.every((n) => n._landed)) { resolveDone(); if (opts.absorb) absorb(); }
    };
    if (!sprites.length) resolveDone();
    sprites.forEach((_, i) => timers.push(setTimeout(() => departOne(i), (opts.delay || 0) + i * stagger)));
    // 受け取った札が本人に吸い込まれて消える（狭い所で顔や数字を隠さないため）
    let absorbed = false;
    function absorb() {
      if (absorbed) return; absorbed = true;
      nodes.forEach((d, i) => {
        const a = d.animate([{ opacity: 1 }, { opacity: 1, offset: .4 }, { opacity: 0, transform: d.style.transform + ` translate(${to.x - pile.x}px, ${to.y - pile.y}px) scale(.3)` }], { duration: 420, delay: (finished ? 0 : 260) + i * 12, fill: 'forwards' });
        a.onfinish = () => d.remove();
      });
    }
    function finish() {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      anims.forEach((a) => { try { a.cancel(); } catch (e) { /* ignore */ } });
      nodes.forEach((d, i) => { d.style.opacity = '1'; if (!d._landed) { if (!nodes[i]._departed) { /* count it */ } } });
      // final numbers: exact totals
      opts.onDepart && opts.onDepart(0, opts.amount, true);
      nodes.forEach((d, i) => landOne(i));
      opts.onLand && opts.onLand(0, opts.amount, true);
      resolveDone();
    }
    return { done, finish, count: sprites.length };
  }

  // 所持金の山（上限あり、数字は別に併記）。マイナスは借用書（名前と負債額）。
  function pile(parent, money, name) {
    const box = el('div', 'cash-pile', parent);
    if (money < 0) {
      const w = el('div', 'iou', box);
      img(SRC.iou, '', w);
      const t = el('div', 'iou-t', w);
      MJ2.dom.fit(Object.assign(el('div', 'n', t), { textContent: name || '' }), 4);
      MJ2.dom.fit(Object.assign(el('div', 'a', t), { textContent: '負債 ' + MJ2.util.yen(-money) }), 4);
      return box;
    }
    if (money <= 0) return box;
    const n = Math.max(1, Math.min(9, Math.round((Math.log10(money) - 3) * 1.6)));
    for (let i = 0; i < n; i++) img(SRC.side, 'side', box, { bottom: (i * 6) + 'px' });
    if (money >= 1000000) img(SRC.bundle, 'top', box, { bottom: (n * 6 + 2) + 'px' });
    return box;
  }

  MJ2.Cash = { SRC, UNIT, breakdown, fly, pile };
})(typeof window !== 'undefined' ? window : globalThis);
