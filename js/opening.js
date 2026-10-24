/* 麻雀2 オープニング（v026）: 起動ロゴ → 4カット＋ナレーション → タイトル。
   素材: MAHJONG2_OPENING_v002（assets/opening/*.webp、字幕フォント Yuji Mai のサブセット）、ナレーション VO_OP_01〜04。
   - 上の16:9（720x405）に実写カット（1.00→1.035倍にゆっくり寄る）、下の黒帯（135px）に字幕。字幕は画像に焼き込まず文字で描く。
   - 各カット: 黒から0.4秒で入る → ナレーション → 終わってから約0.5秒 → 0.4秒で黒へ → 次。最後は約1秒保持してタイトル。
   - ナレーションを固定秒数で切らない。ナレーションが無い／読めない時だけ durationMs（仮尺）。
   - クリック・決定キー（Enter / Z / Space / Esc）でスキップ。ナレーションも止める。二重にタイトルへ進まない。
   - タブを離れている間は時間を止め、音も止める（AudioContext を一時停止）。 */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const { el, img } = MJ2.dom;
  const Opening = {};

  function cfg() { return (MJ2.DATA.config && MJ2.DATA.config.opening) || null; }
  Opening.enabled = function () {
    const c = cfg();
    if (!c || c.openingEnabled === false) return false;
    if (root.MJ2_FORCE_OPENING) return true;
    if (root.MJ2_SKIP_OPENING || root.MJ2_AUTOPLAY) return false;
    try { if (root.navigator && root.navigator.webdriver) return false; } catch (e) { /* ignore */ } // 自動テストでは出さない
    return true;
  };

  // 見えている時間だけ進むタイマー（タブを離れたら止まる）
  function makeClock() {
    let paused = typeof document !== 'undefined' && document.hidden;
    const waits = [];
    let last = performance.now();
    function tick() {
      const now = performance.now(), dt = now - last; last = now;
      if (!paused) for (const w of waits.slice()) { w.left -= dt; if (w.left <= 0) { waits.splice(waits.indexOf(w), 1); w.res(); } }
    }
    const iv = setInterval(tick, 50);
    return {
      wait(ms) { return new Promise((res) => waits.push({ left: ms, res })); },
      pause(v) { tick(); paused = v; last = performance.now(); },
      stop() { clearInterval(iv); waits.splice(0).forEach((w) => w.res()); }
    };
  }

  // 1文字ずつ字間を空けて、ずれた暗い朱の影つきで描く（字幕は1行ずつ中央揃え）
  function subtitle(band, text, size, st) {
    band.innerHTML = '';
    const lines = text.split('\n');
    const box = el('div', 'op-sub', band, { fontSize: size + 'px', lineHeight: st.lineHeight + 'px', letterSpacing: st.tracking + 'px', color: st.fill,
      textShadow: `${st.shadowOffset[0]}px ${st.shadowOffset[1]}px 0 ${st.shadow}, ${st.shadowOffset[0] + 0.5}px ${st.shadowOffset[1] + 0.5}px 1px #32080e` });
    lines.forEach((ln) => { const d = el('div', 'op-line', box); d.textContent = ln; MJ2.dom.fit(d, 12); });
  }

  Opening.play = function (onDone) {
    const c = cfg();
    const UI = MJ2.UI, A = MJ2.Audio;
    const s = UI.newScreen('opening');
    const stage = el('div', 'op-stage', s);
    const pic = el('div', 'op-pic', stage);
    const title = img(c.titleAsset, 'op-title', stage);
    el('div', 'op-rule', s);
    const band = el('div', 'op-band', s);
    const black = el('div', 'op-black', s);
    el('div', 'op-skip', s).textContent = 'クリックでスキップ';
    const clock = makeClock();
    let finished = false, voice = null, zoomAnim = null;
    const stopVoice = () => { if (voice) { voice.stop(); voice = null; } };
    function finish(reason) {
      if (finished) return; finished = true;
      stopVoice(); clock.stop();
      document.removeEventListener('visibilitychange', vis);
      root.removeEventListener('keydown', key, true);
      if (A.ctx && A.ctx.state === 'suspended' && !document.hidden) A.ctx.resume();
      if (UI.screen !== 'opening') return; // 別の画面へ移っていたら何もしない
      onDone && onDone(reason);
    }
    function vis() {
      const h = document.hidden;
      clock.pause(h);
      if (zoomAnim) { if (h) zoomAnim.pause(); else zoomAnim.play(); }
      try { if (A.ctx) { if (h) A.ctx.suspend(); else A.ctx.resume(); } } catch (e) { /* ignore */ }
      if (voice && voice.el) { if (h) voice.el.pause(); else voice.el.play().catch(() => {}); }
    }
    function key(e) { if (e.repeat) return; if (['Enter', 'z', 'Z', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); skip(); } }
    function skip() { if (finished) return; MJ2.Audio.play('ui_button'); black.style.transition = 'opacity .25s'; black.style.opacity = '1'; finished = true; stopVoice(); clock.stop(); setTimeout(() => { finished = false; finish('skipped'); }, 260); }
    document.addEventListener('visibilitychange', vis);
    root.addEventListener('keydown', key, true);
    s.addEventListener('pointerdown', skip);
    // 先読み（画像・ナレーション）
    c.scenes.forEach((sc) => { const i = new Image(); i.src = sc.image; if (sc.voice) { const ev = A.event(sc.voice); if (ev && ev.clip) A.load(ev.clip); } });
    const fade = (to) => new Promise((res) => { black.style.transition = `opacity ${c.fadeMs}ms linear`; black.style.opacity = String(to); clock.wait(c.fadeMs).then(res); });
    (async () => {
      try { await Promise.race([document.fonts && document.fonts.load('20px MJ2OpBrush', '麻雀'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* ignore */ }
      for (let i = 0; i < c.scenes.length && !finished; i++) {
        const sc = c.scenes[i], last = i === c.scenes.length - 1;
        pic.innerHTML = '';
        const im = img(sc.image, 'op-img', pic);
        title.classList.toggle('on', !!sc.showTitle);
        subtitle(band, sc.subtitle, (c.subtitleStyle.fontSizes || [])[i] || 22, c.subtitleStyle);
        // 寄りの長さはナレーションの長さが分かってから合わせる（先に仮尺で開始）
        zoomAnim = im.animate([{ transform: `scale(${c.zoom[0]})` }, { transform: `scale(${c.zoom[1]})` }], { duration: sc.durationMs, fill: 'forwards', easing: 'linear' });
        if (document.hidden) zoomAnim.pause();
        await fade(0);
        if (finished) break;
        await clock.wait(c.voiceDelayMs || 0);
        if (finished) break;
        voice = sc.voice ? await A.playHandle(sc.voice) : null;
        if (finished) { stopVoice(); break; }
        if (voice && voice.ok) {
          const total = (c.voiceDelayMs || 0) + voice.durationMs + (last ? c.lastHoldMs : c.afterVoiceMs) + c.fadeMs * 2;
          try { zoomAnim.effect.updateTiming({ duration: Math.max(total, 1000) }); } catch (e) { /* ignore */ }
          await voice.ended; // 途中で切らない
          voice = null;
          if (finished) break;
          await clock.wait(last ? c.lastHoldMs : c.afterVoiceMs);
        } else {
          voice = null;
          await clock.wait(Math.max(0, sc.durationMs - c.fadeMs * 2 - (c.voiceDelayMs || 0)));
        }
        if (finished) break;
        await fade(1);
      }
      finish('ended');
    })();
  };

  MJ2.Opening = Opening;
})(typeof window !== 'undefined' ? window : globalThis);
