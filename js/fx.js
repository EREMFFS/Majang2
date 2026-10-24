/* 麻雀2 Presentation effects (timeline-driven; never waits for audio) + audio (BGM/voice/SE). */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;

  // ---------------- Audio (BGM / 音声 / 効果音) ----------------
  // data/audio_events.json の events[].clip と bgm[] を使う。再生を待って進行することは無い（fire-and-forget）。
  // ファイル欠落・デコード失敗・自動再生ブロックでも黙って無音で続行する。
  const Audio = {
    ctx: null, buffers: {}, gains: null, mode: null, lastAt: {}, els: {},
    vol: { bgm: 0.55, voice: 0.9, se: 0.8 }, muted: false,
    bgmCur: null, bgmWant: null, bgmNode: null, bgmEl: null, bgmToken: 0,
    cfg() { return (MJ2.DATA && MJ2.DATA.audio) || {}; },
    enabled() { return !!this.cfg().enabled; },
    // file:// ではブラウザが音声ファイルを読めないので、js/audio_embed/*.js（1音1ファイル）を必要な時に読み込んで Web Audio で鳴らす
    isFile() { return typeof location !== 'undefined' && location.protocol === 'file:'; },
    embed() { return this.isFile() ? (root.MJ2_AUDIO_EMBED || (root.MJ2_AUDIO_EMBED = {})) : null; },
    useElements() { return this.isFile() && this.noEmbed; },
    embedScript(clip) {
      if (!this._emb) this._emb = {};
      if (this._emb[clip]) return this._emb[clip];
      const em = this.embed();
      if (em[clip]) return (this._emb[clip] = Promise.resolve(em[clip]));
      this._emb[clip] = new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'js/audio_embed/' + clip.replace(/[^A-Za-z0-9_.-]/g, '_') + '.js';
        sc.onload = () => (em[clip] ? res(em[clip]) : rej(new Error('embed empty')));
        sc.onerror = () => rej(new Error('embed missing ' + clip));
        document.head.appendChild(sc);
      });
      return this._emb[clip];
    },
    applySettings(st) {
      if (!st) return;
      const d = this.cfg().defaultVolume || {};
      this.vol = { bgm: st.volBgm ?? d.bgm ?? 0.55, voice: st.volVoice ?? d.voice ?? 0.9, se: st.volSe ?? d.se ?? 0.8 };
      this.muted = !!st.muted;
      this.refreshGains();
    },
    gainFor(bus) { return this.muted ? 0 : (this.vol[bus] ?? 0.8); },
    refreshGains() {
      if (this.gains) for (const b of ['bgm', 'voice', 'se']) { try { this.gains[b].gain.value = this.gainFor(b); } catch (e) { /* ignore */ } }
      if (this.bgmEl) this.bgmEl.volume = this.gainFor('bgm');
    },
    // create the context early (suspended until the first press) so decoding can happen during the logo
    ensureCtx() {
      if (!this.enabled()) return null;
      if (this.useElements()) { this.mode = 'element'; return null; }
      if (!this.ctx) this.unlock(true);
      return this.ctx;
    },
    async preloadAll() {
      if (!this.ensureCtx()) return;
      const seen = new Set(); const ps = [];
      for (const e of this.cfg().events || []) if (e.clip && !seen.has(e.clip)) { seen.add(e.clip); ps.push(this.load(e.clip)); }
      const east = (this.cfg().bgm || [])[0];
      if (east) ps.push(this.load(this.pickFile(east)));
      await Promise.all(ps);
    },
    // 最初に音が出ないことがある対策: 押した瞬間に無音バッファと音量0の無音<audio>を一度鳴らす
    warmUp() {
      try {
        if (this.ctx) { const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); }
      } catch (e) { /* ignore */ }
      try {
        const a = new root.Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        a.volume = 0; const pr = a.play(); if (pr && pr.catch) pr.catch(() => {});
      } catch (e) { /* ignore */ }
    },
    // スマホ対策（v030）: スマホのブラウザは「指を離した時（touchend / click）」しか音を許可しない（pointerdown では不可）。
    // 画面のどこを触っても、音が止まっていたら起こし直す（ロゴ画面・途中で止まった時・タブから戻った時）。
    // iPhone のマナースイッチで Web Audio が消えないよう、音声セッションを「再生」にする（audioSession / 無音の<audio>を流し続ける）。
    installGestureUnlock() {
      if (this._gestureOn || typeof document === 'undefined') return;
      this._gestureOn = true;
      const kick = () => {
        if (!this.enabled()) return;
        try { if (root.navigator && root.navigator.audioSession && root.navigator.audioSession.type !== 'playback') root.navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
        if (!this.ctx) this.unlock();
        const c = this.ctx;
        if (c && c.state !== 'running') {
          try { const pr = c.resume(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ }
          try { const b = c.createBuffer(1, 1, 22050); const src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(0); } catch (e) { /* ignore */ }
        }
        if (!this._keepAlive) {
          try {
            // 1秒の無音を繰り返し流す（iPhone で再生カテゴリになり、マナースイッチでも鳴る）
            const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
            const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
            w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
            v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
            for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
            const a = new root.Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
            a.loop = true; a.setAttribute('playsinline', ''); a.preload = 'auto';
            const pr = a.play(); if (pr && pr.then) pr.then(() => { this._keepAlive = a; }).catch(() => {}); else this._keepAlive = a;
          } catch (e) { /* ignore */ }
        }
      };
      this.kick = kick;
      for (const t of ['touchend', 'click', 'keydown', 'pointerup']) document.addEventListener(t, kick, { capture: true, passive: true });
    },
    // 「ピッピッ」（矩形波 1320Hz → 1760Hz）
    beep() {
      if (!this.ctx || this.muted) return;
      try {
        const t0 = this.ctx.currentTime + 0.02;
        [[1320, 0], [1760, 0.13]].forEach(([f, dt]) => {
          const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
          o.type = 'square'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(0.16, t0 + dt + 0.004);
          g.gain.setValueAtTime(0.16, t0 + dt + 0.075); g.gain.linearRampToValueAtTime(0, t0 + dt + 0.09);
          o.connect(g).connect(this.gains.se); o.start(t0 + dt); o.stop(t0 + dt + 0.1);
        });
      } catch (e) { /* ignore */ }
    },
    unlock(early) {
      if (!this.enabled()) return;
      if (this.useElements()) { this.mode = 'element'; return; }
      try {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!this.ctx && AC) {
          this.ctx = new AC();
          this.gains = {};
          for (const b of ['bgm', 'voice', 'se']) { const g = this.ctx.createGain(); g.gain.value = this.gainFor(b); g.connect(this.ctx.destination); this.gains[b] = g; }
          this.mode = 'webaudio';
          if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { try { if (document.hidden) { this.ctx.suspend(); if (this._keepAlive) this._keepAlive.pause(); } else { const pr = this.ctx.resume(); if (pr && pr.catch) pr.catch(() => {}); if (this._keepAlive) this._keepAlive.play().catch(() => {}); } } catch (e) { /* ignore */ } });
          // 短い音声・効果音は先に読み込んでおく（初回の遅れを防ぐ）
          const seen = new Set();
          for (const e of this.cfg().events || []) if (e.clip && !seen.has(e.clip)) { seen.add(e.clip); this.load(e.clip); }
        }
        if (!early && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; this.mode = 'element'; }
      if (!this.ctx) this.mode = 'element';
    },
    event(id) { const e = (this.cfg().events || []).find((x) => x.id === id); return e || null; },
    clipFor(id) { const e = this.event(id); return e && e.clip; },
    fetchAb(clip) {
      if (this.isFile()) {
        return this.embedScript(clip).then((b64) => {
          const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          delete this.embed()[clip]; // 文字列はデコード後に捨てる（メモリ節約）
          if (this._emb) delete this._emb[clip];
          return u.buffer;
        });
      }
      // まとめファイル（assets/audio/pack.bin）に入っている音はそこから切り出す（通信1回）。無ければ個別に取りに行く
      return this.packIndex().then((idx) => {
        const at = idx && idx[clip];
        if (!at) return fetch(clip).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)));
        if (!this._packBuf) this._packBuf = fetch(this._packFile || 'assets/audio/pack.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)));
        return this._packBuf.then((buf) => buf.slice(at[0], at[0] + at[1]), () => fetch(clip).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))));
      });
    },
    packIndex() {
      if (!this._packIdx) this._packIdx = fetch('assets/audio/pack.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.file) this._packFile = j.file; return (j && j.clips) || null; }).catch(() => null);
      return this._packIdx;
    },
    // デコード後の先頭のずれ（AAC等のエンコーダ遅延・無音）を、元WAVの20秒地点の波形と照合して測る（秒）。ループ点をその分ずらす。
    measureOffset(buf, fp) {
      if (!fp || !fp.pcm16 || buf._mj2Offset != null) return buf._mj2Offset || 0;
      let off = 0;
      try {
        const bin = atob(fp.pcm16); const n = bin.length >> 1; const ref = new Float32Array(n);
        for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; ref[i] = v / 32768; }
        const sr = buf.sampleRate, ratio = sr / fp.sampleRate;
        const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
        const at = (t) => { const x = t * sr, i = Math.floor(x), f = x - i; if (i < 0 || i + 1 >= L.length) return 0; return ((L[i] + R[i]) * (1 - f) + (L[i + 1] + R[i + 1]) * f) / 2; };
        const N = Math.min(n, 2048);
        const score = (lagSec) => { let a = 0, b = 0, c = 0; for (let i = 0; i < N; i++) { const y = at(fp.atSec + lagSec + i / fp.sampleRate); a += y * ref[i]; b += y * y; c += ref[i] * ref[i]; } return a / Math.sqrt((b * c) || 1); };
        let best = -2, bestLag = 0;
        const step = 4 / sr;
        for (let lag = -0.15; lag <= 0.15; lag += step) { const sc = score(lag); if (sc > best) { best = sc; bestLag = lag; } }
        for (let lag = bestLag - step; lag <= bestLag + step; lag += 1 / sr) { const sc = score(lag); if (sc > best) { best = sc; bestLag = lag; } }
        off = best > 0.8 ? bestLag : 0;
        this.lastAlign = { lagMs: Math.round(bestLag * 100000) / 100, score: Math.round(best * 10000) / 10000, ratio };
      } catch (e) { off = 0; }
      buf._mj2Offset = off;
      return off;
    },
    decode(ab) {
      return new Promise((res, rej) => { try { const p = this.ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } });
    },
    load(clip) {
      if (!this.ctx) return Promise.resolve(null);
      if (this.buffers[clip] !== undefined) return Promise.resolve(this.buffers[clip] && this.buffers[clip].then ? this.buffers[clip] : this.buffers[clip]);
      const pre = this._pref && this._pref[clip];
      if (pre) delete this._pref[clip];
      const p = (pre || this.fetchAb(clip).catch((e) => { if (!this.isFile()) (this._missing || (this._missing = {}))[clip] = true; throw e; })).then((ab) => (ab ? this.decode(ab) : Promise.reject(0)))
        .then((b) => { this.buffers[clip] = b; return b; }).catch((e) => { this.buffers[clip] = null; if (this._missing && this._missing[clip]) return null; try { console.warn('[MJ2 audio] 読み込めない音（audio要素で代わりに再生）:', clip, e && e.message || e); } catch (x) { /* ignore */ } return null; });
      this.buffers[clip] = p;
      return p;
    },
    // returns the clip duration in ms when known (0 otherwise) so callers can chain voices
    // 鳴き・リーチ・和了の声は、その時に動いた人（speaker）の声で（charVoices）。無ければ実況の声
    speaker: null,
    charClip(id) {
      const W = { call_pon: 'pon', call_chi: 'chi', call_kan: 'kan', call_riichi: 'riichi', call_ron: 'ron', call_tsumo: 'tsumo' }[id];
      const c = this.cfg(); if (!W || !this.speaker || c.callVoiceMode === 'announcer') return null;
      const cv = c.charVoices && c.charVoices[this.speaker];
      return (cv && cv[W]) || null;
    },
    preloadVoices(ids) { if (!this.ctx) return; const cv = this.cfg().charVoices || {}; for (const id of ids || []) for (const f of Object.values(cv[id] || {})) this.load(f); },
    play(id, opts) {
      if (!this.enabled()) return 0;
      const cc = this.charClip(id);
      if (cc) {
        if (this.cfg().callVoiceMode === 'both') setTimeout(() => this.playRaw(id), 600);
        return this.playClip(cc, 'voice', 'cv:' + id);
      }
      return this.playRaw(id, opts);
    },
    playClip(clip, bus, key) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (this.lastAt[key] && now - this.lastAt[key] < 35) return 0;
      this.lastAt[key] = now;
      if (this.mode === 'element') { try { const a = new root.Audio(clip); a.volume = this.gainFor(bus); const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ } return 0; }
      if (!this.ctx) return 0;
      const go = (buf) => { if (!buf) return this.elPlay(clip, bus); try { const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.gains[bus] || this.gains.voice); s.start(); } catch (e) { /* ignore */ } };
      const b = this.buffers[clip];
      if (b && !b.then) { go(b); return Math.round(b.duration * 1000); }
      this.load(clip).then(go);
      return 0;
    },
    playRaw(id, opts) {
      const ev = this.event(id);
      if (!ev || !ev.clip) return 0;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (this.lastAt[id] && now - this.lastAt[id] < 35) return 0; // 同じ音の多重起動を間引く
      this.lastAt[id] = now;
      const bus = (opts && opts.bus) || ev.bus || 'se';
      if (this.mode === 'element') {
        try { const a = new root.Audio(ev.clip); a.volume = this.gainFor(bus); const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ }
        return 0;
      }
      if (!this.ctx) return 0;
      const go = (buf) => {
        if (!buf) return this.elPlay(ev.clip, bus); // Web Audio で読めない音は audio 要素で鳴らす
        try { const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.gains[bus] || this.gains.se); s.start(); } catch (e) { /* ignore */ }
      };
      const b = this.buffers[ev.clip];
      if (b && !b.then) { go(b); return Math.round(b.duration * 1000); }
      this.load(ev.clip).then(go);
      return 0;
    },
    // 終わりを待てる再生（オープニングのナレーション用）: { ok, durationMs, ended: Promise, stop() }。音が無い・読めない時は ok=false
    async playHandle(id, timeoutMs) {
      const ev = this.event(id);
      const none = { ok: false, durationMs: 0, ended: Promise.resolve(), stop() {} };
      if (!this.enabled() || !ev || !ev.clip) return none;
      const bus = ev.bus || 'voice';
      if (this.mode === 'element' || !this.ctx) {
        try {
          const a = new root.Audio(ev.clip); a.volume = this.gainFor(bus);
          let done; const ended = new Promise((r) => (done = r));
          a.addEventListener('ended', () => done()); a.addEventListener('error', () => done());
          await a.play();
          return { ok: true, durationMs: (a.duration || 0) * 1000, ended, stop() { try { a.pause(); } catch (e) { /* ignore */ } done(); }, el: a };
        } catch (e) { return none; }
      }
      const buf = await Promise.race([this.load(ev.clip), new Promise((r) => setTimeout(() => r(null), timeoutMs || 4000))]);
      if (!buf || buf.then) {
        // Web Audio で読めなかった時は audio 要素で（終わりも待てる）
        try {
          const a = this.elPlay(ev.clip, bus); if (!a) return none;
          let done; const ended = new Promise((r) => (done = r));
          a.addEventListener('ended', () => done()); a.addEventListener('error', () => done());
          await new Promise((r) => { if (a.readyState >= 1) r(); else { a.addEventListener('loadedmetadata', r, { once: true }); a.addEventListener('error', r, { once: true }); setTimeout(r, 1500); } });
          if (a.error) return none;
          return { ok: true, durationMs: (a.duration || 0) * 1000, ended, stop() { try { a.pause(); } catch (e) { /* ignore */ } done(); }, el: a };
        } catch (e) { return none; }
      }
      try {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.gains[bus] || this.gains.voice);
        let done; const ended = new Promise((r) => (done = r));
        src.onended = () => done();
        src.start();
        return { ok: true, durationMs: buf.duration * 1000, ended, stop() { try { src.onended = null; src.stop(); } catch (e) { /* ignore */ } done(); } };
      } catch (e) { return none; }
    },
    elPlay(clip, bus) {
      if ((this._missing && this._missing[clip]) || (this._elBad && this._elBad[clip])) return null; // ファイルが無い音は何度も取りに行かない
      try { const a = new root.Audio(clip); a.addEventListener('error', () => { (this._elBad || (this._elBad = {}))[clip] = true; }); a.volume = Math.min(1, this.gainFor(bus || 'se')); const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); return a; } catch (e) { return null; }
    },
    cue(id, ms) { if (!this.enabled()) return; setTimeout(() => this.play(id), ms || 0); },
    // play ids one after another (fallback gap when duration is unknown)
    seq(ids, gapMs) {
      let t = 0;
      ids.forEach((id) => {
        setTimeout(() => this.play(id), t);
        const ev = this.event(id); const b = ev && ev.clip && this.buffers[ev.clip];
        t += (b && !b.then ? b.duration * 1000 : 1300) + (gapMs || 60);
      });
    },
    // ---- BGM (sustain loop: intro once, then loopStart..loopEnd forever) ----
    bgmDef(id) { return (this.cfg().bgm || []).find((x) => x.id === id) || null; },
    // 鳴らせる順に並べた候補（Safari は m4a、それ以外は ogg を先に）。デコードに失敗したら次を試す。
    fileOrder(def) {
      const files = (def.files || []).slice();
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua);
      const score = (f) => (/\.ogg$/.test(f) ? (safari ? 1 : 0) : /\.(m4a|mp4)$/.test(f) ? (safari ? 0 : 1) : 2);
      return files.sort((a, b) => score(a) - score(b));
    },
    pickFile(def) {
      const files = this.fileOrder(def);
      if (this._badFile) { const ok = files.find((f) => !this._badFile[f]); if (ok) return ok; }
      return files[0];
    },
    _pickFileOld(def) {
      const files = def.files || [];
      try {
        const a = typeof document !== 'undefined' ? document.createElement('audio') : null;
        if (a) for (const f of files) {
          const t = /\.m4a$|\.mp4$|\.aac$/.test(f) ? 'audio/mp4; codecs="mp4a.40.2"' : /\.ogg$/.test(f) ? 'audio/ogg; codecs="opus"' : /\.mp3$/.test(f) ? 'audio/mpeg' : 'audio/wav';
          if (a.canPlayType(t)) return f;
        }
      } catch (e) { /* ignore */ }
      return files[0];
    },
    bgm(id) {
      if (!this.enabled()) return;
      this.bgmWant = id;
      if (this.bgmCur === id) return;
      const def = this.bgmDef(id);
      this.stopBgm(500);
      if (!def) return;
      this.bgmCur = id;
      const token = ++this.bgmToken;
      const file = this.pickFile(def);
      if (this.mode === 'element' || !this.ctx) {
        if (this.embed() && !this.ctx) { this.bgmCur = null; return; } // 押す前（通常は起きない）
        try {
          const a = new root.Audio(file); a.loop = true; a.volume = this.gainFor('bgm');
          let last = 0, wrapped = false;
          a.addEventListener('timeupdate', () => {
            if (a.currentTime < last - 1) wrapped = true;
            if (wrapped && a.currentTime < (def.loopStartSec || 0)) { try { a.currentTime = def.loopStartSec || 0; } catch (e) { /* ignore */ } }
            last = a.currentTime;
          });
          const pr = a.play(); if (pr && pr.catch) pr.catch(() => {});
          this.bgmEl = a;
        } catch (e) { /* ignore */ }
        return;
      }
      // keep only the current BGM decoded (each is ~50MB as PCM)
      for (const d of this.cfg().bgm || []) for (const f of d.files || []) if (f !== file && this.buffers[f] && !this.buffers[f].then) delete this.buffers[f];
      const tryLoad = (f) => this.load(f).then((buf) => {
        if (buf || token !== this.bgmToken) return { buf, f };
        (this._badFile || (this._badFile = {}))[f] = true;
        const next = this.fileOrder(def).find((x) => !this._badFile[x]);
        return next ? tryLoad(next) : { buf: null, f };
      });
      tryLoad(file).then(({ buf }) => {
        if (!buf || token !== this.bgmToken) return;
        try {
          const src = this.ctx.createBufferSource();
          src.buffer = buf; src.loop = true;
          const off = this.measureOffset(buf, def.fingerprint);
          const ls = Math.max(0, Math.min((def.loopStartSec || 0) + off, buf.duration - 0.1));
          const le = def.loopEndSec ? Math.min(def.loopEndSec + off, buf.duration) : buf.duration;
          src.loopStart = ls; src.loopEnd = le > ls ? le : buf.duration;
          const g = this.ctx.createGain(); g.gain.value = 0;
          src.connect(g).connect(this.gains.bgm);
          const t0 = this.ctx.currentTime;
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + 0.25);
          src.start();
          this.bgmNode = { src, g };
        } catch (e) { /* ignore */ }
      });
    },
    stopBgm(fadeMs) {
      this.bgmToken++;
      this.bgmCur = null;
      const n = this.bgmNode; this.bgmNode = null;
      if (n) {
        try { const t = this.ctx.currentTime; n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0, t + (fadeMs || 0) / 1000); n.src.stop(t + (fadeMs || 0) / 1000 + 0.05); } catch (e) { /* ignore */ }
      }
      const a = this.bgmEl; this.bgmEl = null;
      if (a) { try { a.pause(); } catch (e) { /* ignore */ } }
    },
    // prefetch the compressed bytes of a BGM so the switch at 南一局 is quick (not decoded until needed)
    prefetchBgm(id) {
      const def = this.bgmDef(id); if (!def || this.mode !== 'webaudio') return;
      if (this.isFile()) { this.embedScript(this.pickFile(def)).catch(() => {}); return; }
      const f = this.pickFile(def);
      if (!this._pref) this._pref = {};
      if (this._pref[f]) return;
      if (this.buffers[f] !== undefined) return;
      this._pref[f] = this.fetchAb(f).catch(() => null);
    }
  };

  // ---------------- helpers ----------------
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  function el(tag, cls, parent, style) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) Object.assign(e.style, style);
    if (parent) parent.appendChild(e);
    return e;
  }
  function img(src, cls, parent, style) { const i = el('img', cls, parent, style); i.src = src; i.draggable = false; return i; }
  function textAsset(name) { return MJ2.DATA.effects.textAssets[name]; }
  function eff(name) { return MJ2.DATA.effects.effects[name] || {}; }
  function layer() {
    const g = document.getElementById('game');
    let l = g.querySelector(':scope > .fx-layer');
    if (!l) l = el('div', 'fx-layer', g);
    return l;
  }
  function speed() { return MJ2.UI && MJ2.UI.speedFactor ? MJ2.UI.speedFactor() : 1; }
  function shake(target, maxPx, ms) {
    if (!target || !target.animate) return;
    const kf = []; const n = 8;
    for (let i = 0; i <= n; i++) { const a = maxPx * (1 - i / n); kf.push({ translate: `${(i % 2 ? -1 : 1) * a}px ${(i % 3 - 1) * a * 0.6}px` }); }
    target.animate(kf, { duration: ms, easing: 'linear' });
  }
  function sizeOf(name, scale) { const t = textAsset(name); return [t.size[0] * scale, t.size[1] * scale]; }
  function textImg(name, parent, scale, extra) {
    const [w, h] = sizeOf(name, scale);
    return img(textAsset(name).file, 'fx-text', parent, Object.assign({ width: w + 'px', height: h + 'px' }, extra || {}));
  }
  function dynName(text, parent, px, style, blue) {
    const d = el('div', 'dyn-name' + (blue ? ' dyn-blue' : ''), parent, Object.assign({ position: 'absolute', left: '0', right: '0', textAlign: 'center', fontSize: px + 'px' }, style || {}));
    d.textContent = text;
    return d;
  }
  function gameEl() { return document.getElementById('game'); }

  // ---------------- effects ----------------
  const FX = {};
  FX.wait = wait;

  FX.riichi = async function (opts) {
    const e = eff('call_riichi'); const k = speed();
    const L = el('div', '', layer(), { position: 'absolute', inset: '0' });
    const stripes = el('div', '', L, { position: 'absolute', left: '-20%', top: '190px', width: '140%', height: '150px', transform: 'rotate(-8deg)',
      background: 'repeating-linear-gradient(115deg, rgba(40,140,255,.0) 0 18px, rgba(70,170,255,.55) 18px 30px, rgba(20,80,200,.0) 30px 46px)', opacity: 0 });
    stripes.animate([{ opacity: 0, transform: 'rotate(-8deg) translateX(-120px)' }, { opacity: 1, transform: 'rotate(-8deg) translateX(0)' }, { opacity: 0, transform: 'rotate(-8deg) translateX(80px)' }], { duration: e.durationMs * k, easing: 'ease-out' });
    const t = textImg('riichi', L, 0.62);
    Audio.cue('call_riichi', e.soundCueMs * k);
    t.animate([
      { transform: 'translate(10%, -160%) scale(1.9) rotate(-14deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: e.enterMs / e.durationMs },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: (e.enterMs + e.holdMs) / e.durationMs },
      { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 0 }
    ], { duration: e.durationMs * k, fill: 'forwards' });
    setTimeout(() => shake(gameEl(), 3, 160), e.enterMs * k);
    await wait(e.durationMs * k); L.remove();
  };

  // ---- ロン／ツモ共通: 和了牌へ落ちる稲妻（ズガーン） ----
  // tone: 'mine'（自分の和了＝金）, 'hit'（自分が振り込んだ＝赤紫）, 'other'（他家どうし＝青白）
  const STRIKE_TONES = {
    mine: { core: '#fffbe6', glow: 'rgba(255,196,40,', flash: 'rgba(255,214,90,', ring: '#ffd23a' },
    hit: { core: '#fff0f4', glow: 'rgba(255,30,80,', flash: 'rgba(170,0,40,', ring: '#ff2a5a' },
    other: { core: '#f2fbff', glow: 'rgba(110,190,255,', flash: 'rgba(150,210,255,', ring: '#8fd0ff' }
  };
  function boltPath(x0, y0, x1, y1, rough, depth) {
    const pts = [[x0, y0]];
    const n = 12;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const jit = rough * (1 - Math.abs(t - 0.5) * 0.6);
      pts.push([x0 + (x1 - x0) * t + (Math.random() * 2 - 1) * jit, y0 + (y1 - y0) * t + (Math.random() * 2 - 1) * jit * 0.25]);
    }
    pts.push([x1, y1]);
    const branches = [];
    if (depth > 0) for (let i = 3; i < n - 2; i++) if (Math.random() < 0.28) {
      const [bx, by] = pts[i]; const len = 40 + Math.random() * 70; const ang = Math.atan2(y1 - y0, x1 - x0) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
      branches.push(boltPath(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len, rough * 0.45, 0).main);
    }
    return { main: pts, branches };
  }
  function drawBolt(ctx, b, tone, alpha) {
    const stroke = (pts, w, style) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineWidth = w; ctx.strokeStyle = style; ctx.stroke(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (const pts of [b.main].concat(b.branches)) {
      const main = pts === b.main;
      stroke(pts, main ? 22 : 9, tone.glow + (0.18 * alpha) + ')');
      stroke(pts, main ? 9 : 4, tone.glow + (0.55 * alpha) + ')');
      stroke(pts, main ? 3 : 1.5, tone.core);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // screen point of an element -> logical 720x540 coordinates (works with the scaled / rotated #game)
  FX.logicalCenter = function (node) {
    const g = gameEl();
    if (!node || !g) return null;
    const r = node.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    try {
      const M = new DOMMatrix(getComputedStyle(g).transform);
      const p = M.inverse().transformPoint(new DOMPoint(cx - g.offsetLeft, cy - g.offsetTop));
      return { x: p.x, y: p.y };
    } catch (e) { const gr = g.getBoundingClientRect(); return { x: (cx - gr.left) / (gr.width / 720), y: (cy - gr.top) / (gr.height / 540) }; }
  };
  FX.strike = async function (kind, opts) {
    opts = opts || {};
    const e = eff(kind === 'ron' ? 'call_ron' : 'call_tsumo'); const k = speed();
    const tone = STRIKE_TONES[opts.tone] || STRIKE_TONES.other;
    const tx = opts.x != null ? opts.x : 360, ty = opts.y != null ? opts.y : 300;
    const dur = Math.max(1100, e.durationMs || 1100) * k;
    const L = el('div', '', layer(), { position: 'absolute', inset: '0' });
    // 1) 一瞬暗く → 2) 稲妻が牌へ（3回ちらつき）→ 3) 白い閃光と着弾の輪 → 4) 文字と顔
    const dark = el('div', '', L, { position: 'absolute', inset: '0', background: 'rgba(0,0,0,.55)' });
    dark.animate([{ opacity: 0 }, { opacity: 1, offset: .08 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    const cv = el('canvas', '', L, { position: 'absolute', left: '0', top: '0', width: '720px', height: '540px' });
    cv.width = 720; cv.height = 540;
    const ctx = cv.getContext('2d');
    const x0 = Math.max(40, Math.min(680, tx + (Math.random() * 2 - 1) * 140));
    const hitAt = 0.1 * dur;
    const frames = [0.10, 0.17, 0.24, 0.31, 0.40];
    frames.forEach((f, i) => setTimeout(() => {
      ctx.clearRect(0, 0, 720, 540);
      if (i < frames.length - 1) {
        const b = boltPath(x0 + (Math.random() * 2 - 1) * 16, -10, tx, ty, 46, 1);
        drawBolt(ctx, b, tone, i === 0 ? 1 : 0.8);
        if (i === 0) drawBolt(ctx, boltPath(x0, -10, tx, ty, 30, 0), tone, 0.6);
      }
    }, f * dur));
    const flash = el('div', '', L, { position: 'absolute', inset: '0', background: tone.flash + '0.85)', mixBlendMode: 'screen' });
    flash.animate([{ opacity: 0 }, { opacity: 0, offset: .1 }, { opacity: 1, offset: .12 }, { opacity: 0, offset: .3 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    const ring = el('div', '', L, { position: 'absolute', left: (tx - 60) + 'px', top: (ty - 60) + 'px', width: '120px', height: '120px', borderRadius: '50%', border: '6px solid ' + tone.ring, boxShadow: '0 0 24px ' + tone.ring + ', inset 0 0 24px ' + tone.ring });
    ring.animate([{ opacity: 0, transform: 'scale(.1)' }, { opacity: 0, offset: .1 }, { opacity: 1, transform: 'scale(.3)', offset: .12 }, { opacity: 0, transform: 'scale(2.4)', offset: .45 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    const core = el('div', '', L, { position: 'absolute', left: (tx - 40) + 'px', top: (ty - 40) + 'px', width: '80px', height: '80px', borderRadius: '50%', background: 'radial-gradient(circle, #fff 0%, ' + tone.ring + ' 35%, transparent 70%)' });
    core.animate([{ opacity: 0, transform: 'scale(.2)' }, { opacity: 0, offset: .1 }, { opacity: 1, transform: 'scale(1.3)', offset: .13 }, { opacity: .7, transform: 'scale(1)', offset: .4 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    setTimeout(() => shake(gameEl(), e.shakeMaxLogicalPx || 6, 320 * k), hitAt);
    Audio.cue('strike_thunder', Math.max(0, hitAt - 40)); // 稲妻の音（SE_THUNDER）
    Audio.cue(kind === 'ron' ? 'call_ron' : 'call_tsumo', hitAt + 120);
    if (opts.face) {
      const c = el('div', 'cutin', L, { left: opts.cutX + 'px', top: opts.cutY + 'px', borderColor: tone.ring });
      img(opts.face, '', c);
      c.animate([{ transform: 'translateX(-60px)', opacity: 0 }, { opacity: 0, offset: .12 }, { transform: 'translateX(0)', opacity: 1, offset: .22 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    }
    const t = textImg(kind === 'ron' ? 'ron' : 'tsumo', L, 0.62);
    if (opts.tone === 'hit') t.style.filter = 'hue-rotate(-40deg) saturate(1.4) drop-shadow(0 0 10px #ff2a5a)';
    else if (opts.tone === 'mine') t.style.filter = 'drop-shadow(0 0 12px #ffc83a)';
    t.animate([
      { transform: 'translate(-50%, -50%) scale(3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(3)', opacity: 0, offset: .12 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .22 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .82 },
      { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 0 }
    ], { duration: dur, fill: 'forwards' });
    await wait(dur); L.remove();
  };
  // レート倍プッシュ（南一局 ×2、オーラス ×3）
  FX.ratePush = async function (R, last) {
    const k = speed(); const dur = 1700 * k;
    const L = el('div', '', layer(), { position: 'absolute', inset: '0', background: 'rgba(40,0,0,.55)' });
    L.animate([{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    const a = dynName(last ? 'オーラス' : 'レート倍プッシュ！', L, last ? 54 : 46, { top: '170px' });
    const b = dynName('×' + R.mult, L, 110, { top: '230px' });
    const c = el('div', '', L, { position: 'absolute', left: '0', right: '0', top: '372px', textAlign: 'center', font: '16px MJ2Heavy', color: '#ffd9b0', textShadow: '0 2px 2px #000' });
    c.textContent = `1点＝${R.yen.toLocaleString('en-US')}円`;
    a.animate([{ opacity: 0, transform: 'translateX(-120px)' }, { opacity: 1, transform: 'none', offset: .15 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    b.animate([{ opacity: 0, transform: 'scale(3)' }, { opacity: 0, offset: .12 }, { opacity: 1, transform: 'scale(1)', offset: .24 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    setTimeout(() => shake(gameEl(), 6, 260), 0.24 * dur);
    Audio.cue('role_impact', 0.24 * dur);
    await wait(dur); L.remove();
  };
  FX.ron = (opts) => FX.strike('ron', opts);
  FX.tsumo = (opts) => FX.strike('tsumo', opts);

  FX.call = async function (kind, opts) {
    // kind: pon | chi | kan. opts.src = {face, tile, label}: shows WHOSE tile was taken
    const e = eff('call_' + kind); const k = speed();
    const dur = (opts.src ? Math.max(e.durationMs, 900) : e.durationMs) * k;
    const L = el('div', '', layer(), { position: 'absolute', inset: '0' });
    const t = textImg(kind, L, 0.36, { left: opts.x + 'px', top: opts.y + 'px' });
    Audio.cue('call_' + kind, e.soundCueMs * k);
    t.animate([{ transform: 'translate(-50%, -50%) scale(1.8) skewX(-12deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .85 }, { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 }], { duration: dur, fill: 'forwards' });
    if (opts.src) {
      const S = el('div', 'call-src', L, { left: opts.x + 'px', top: (opts.y + 40) + 'px' });
      img(opts.src.face, 'cs-face', S);
      el('span', 'cs-label', S).textContent = opts.src.label;
      img(opts.src.tile, 'cs-tile', S);
      S.animate([{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: .25 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    }
    await wait(dur); L.remove();
  };

  FX.yakumanReady = async function (names, opts) {
    const e = eff('yakuman_ready'); const k = speed();
    const L = el('div', '', layer(), { position: 'absolute', inset: '0' });
    const band = el('div', '', L, { position: 'absolute', left: '0', right: '0', top: '170px', height: '200px', background: 'linear-gradient(rgba(60,30,0,0), rgba(70,40,0,.85) 20%, rgba(120,80,10,.9) 50%, rgba(70,40,0,.85) 80%, rgba(60,30,0,0))', borderTop: '0', opacity: 0 });
    band.animate([{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'scaleY(1)', offset: .12 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    const imp = img(MJ2.DATA.effects.fxLayers.ron, '', L, { position: 'absolute', left: '-40px', top: '60px', width: '800px', height: '450px', opacity: .0, filter: 'hue-rotate(20deg) saturate(1.3)' });
    imp.animate([{ opacity: 0 }, { opacity: .8, offset: .15 }, { opacity: .5, offset: .8 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    const t = textImg('yakuman_riichi', L, 0.6, { top: '220px' });
    t.animate([{ transform: 'translate(-50%, -50%) scale(2)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .12 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    const nm = dynName(names.join('・'), L, names.join('').length > 9 ? 28 : 38, { top: '272px' });
    nm.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)', offset: .22 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    if (opts && opts.face) {
      const c = el('div', 'cutin', L, { left: '30px', top: '190px' });
      img(opts.face, '', c);
    }
    Audio.cue('yakuman_ready', e.soundCueMs * k);
    await wait(e.durationMs * k); L.remove();
  };

  FX.jackpot = async function (targetKinds, parentOverride) {
    const e = eff('super_jackpot'); const k = speed();
    const L = el('div', '', parentOverride || layer(), { position: 'absolute', inset: '0', background: 'rgba(5,8,20,.82)', zIndex: 60 });
    const halo = img(MJ2.DATA.effects.fxLayers.jackpot, '', L, { position: 'absolute', left: '0', top: '45px', width: '720px', height: '405px', opacity: 0 });
    halo.animate([{ opacity: 0, transform: 'scale(.3) rotate(-10deg)' }, { opacity: 1, transform: 'scale(1.04) rotate(0)', offset: .2 }, { transform: 'scale(1)', opacity: 1, offset: .9 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    // アタッシュケース: 閉→（金色の光とフラッシュ）→開。中は10万円の束×10＝100万円の絵（金額は下の数字が正）
    const cw = el('div', 'jp-case', L);
    const cc = img('assets/cash/case_closed.png', '', cw);
    const co = img('assets/cash/case_open.png', '', cw, { opacity: 0 });
    const gl = el('div', 'jp-case-glow', cw);
    cw.animate([{ opacity: 0, transform: 'translateY(30px) scale(.8)' }, { opacity: 1, transform: 'none', offset: .12 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    cc.animate([{ opacity: 1 }, { opacity: 1, offset: .3 }, { opacity: 0, offset: .36 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    co.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 0, offset: .3 }, { opacity: 1, transform: 'translateY(-3px)', offset: .36 }, { opacity: 1, transform: 'none', offset: .42 }, { opacity: 1 }], { duration: e.durationMs * k, fill: 'forwards' });
    gl.animate([{ opacity: 0 }, { opacity: 0, offset: .3 }, { opacity: 1, offset: .35 }, { opacity: .55, offset: .6 }, { opacity: .35 }], { duration: e.durationMs * k, fill: 'forwards' });
    Audio.cue('SE_CASE_OPEN', e.durationMs * k * 0.3);
    const t = textImg('jackpot', L, 0.5, { top: '262px' });
    t.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 0, offset: .15 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .25 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    // 旧素材「1,000,000」は使わず、金額を動的に描画（裏社会編: 100万円）
    const mil = el('div', 'dyn-name fx-yen', L, { position: 'absolute', left: '50%', top: '330px', fontSize: '60px', whiteSpace: 'nowrap', lineHeight: '1.1' });
    mil.textContent = MJ2.util.pts(MJ2.DATA.config.superJackpotPoints || 1000000);
    if (parentOverride) { // 精算では金額も（点×レート）
      const yy = el('div', 'dyn-name', L, { position: 'absolute', left: '0', right: '0', top: '372px', textAlign: 'center', fontSize: '30px' });
      yy.textContent = '＝ ' + MJ2.util.yen((MJ2.DATA.config.superJackpotPoints || 1000000) * ((MJ2.UI && MJ2.UI.match && MJ2.Settlement.currentRate(MJ2.UI.match).yen) || 1));
      yy.animate([{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: 1, offset: .56 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    }
    mil.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(2.2)' }, { opacity: 0, offset: .38 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .46 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: e.durationMs * k, fill: 'forwards' });
    const row = el('div', '', L, { position: 'absolute', left: '0', right: '0', top: '420px', textAlign: 'center' });
    const tiles = (targetKinds || []).map((kd) => img(MJ2.UI.tileSrc(kd, true), '', row, { width: '30px', height: '41px', margin: '0 2px', filter: 'brightness(.35)' }));
    const cues = e.soundCueMs || [];
    ['jackpot_open', 'jackpot_halo', 'jackpot_million', 'jackpot_confirm'].forEach((id, i) => Audio.cue(id, (cues[i] || 0) * k));
    const per = (e.durationMs * 0.42 * k) / Math.max(1, tiles.length);
    tiles.forEach((ti, i) => setTimeout(() => { ti.style.filter = 'brightness(1.15) drop-shadow(0 0 5px #ffd35a)'; }, 400 * k + per * i));
    setTimeout(() => tiles.forEach((ti) => ti.animate([{ filter: 'brightness(2) drop-shadow(0 0 10px #fff3b0)' }, { filter: 'brightness(1.1) drop-shadow(0 0 4px #ffd35a)' }], { duration: 500, fill: 'forwards' })), (400 + e.durationMs * 0.45) * k);
    await wait(e.durationMs * k); L.remove();
  };

  FX.banner = async function (name, opts) {
    // round_open (with label), round_end, round_draw, match_start, match_end, results
    const map = { round_open: 'open', round_end: 'round_end', round_draw: 'draw', match_start: 'match_start', match_end: 'match_end', results: 'results' };
    const e = eff(name) || { durationMs: 1000 }; const k = speed();
    const dur = (e.durationMs || 1000) * k;
    const L = el('div', '', layer(), { position: 'absolute', inset: '0' });
    if (name === 'match_end') {
      const imp = img(MJ2.DATA.effects.fxLayers.ron, '', L, { position: 'absolute', left: '-40px', top: '60px', width: '800px', height: '450px' });
      imp.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)', offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    }
    const t = textImg(map[name], L, name === 'match_end' ? 0.85 : name === 'round_open' ? 0.5 : 0.62, { top: name === 'round_open' ? '205px' : '50%' });
    t.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .15 }, { opacity: 1, offset: .82 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' }], { duration: dur, fill: 'forwards' });
    if (opts && opts.label) {
      const d = el('div', 'dyn-name', L, { position: 'absolute', left: '0', right: '0', top: '262px', textAlign: 'center', fontSize: '64px', fontFamily: 'MJ2Brush' });
      d.textContent = opts.label;
      d.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 0, offset: .1 }, { opacity: 1, transform: 'scale(1)', offset: .25 }, { opacity: 1, offset: .82 }, { opacity: 0 }], { duration: dur, fill: 'forwards' });
    }
    const cue = { round_open: 'round_open', round_end: 'round_end', round_draw: 'round_end', match_start: 'match_start', match_end: 'match_end', results: 'minor_summary' }[name];
    Audio.cue(cue, (e.soundCueMs || 0) * k);
    if (name === 'match_start') Audio.cue('an_start_match', (e.soundCueMs || 0) * k + 120); // 「対局開始！」
    await wait(dur); L.remove();
  };

  FX.toast = function (msg, ms) {
    const t = el('div', 'toast', gameEl()); t.textContent = msg;
    setTimeout(() => t.remove(), ms || 1600);
  };

  MJ2.FX = FX;
  MJ2.Audio = Audio;
  // 文字が枠からはみ出す時だけ、フォントを少しずつ小さくする（環境によって字幅が違っても収まるように）
  function fit(node, minPx) {
    if (!node || typeof getComputedStyle === 'undefined') return node;
    const run = () => {
      if (!node.isConnected) return;
      if (node._fitBase == null) node._fitBase = parseFloat(getComputedStyle(node).fontSize) || 12;
      let fs = node._fitBase; node.style.fontSize = fs + 'px';
      let guard = 60;
      while (guard-- > 0 && fs > (minPx || 7) && (node.scrollWidth > node.clientWidth + 0.5 || node.scrollHeight > node.clientHeight + 0.5)) { fs -= 0.5; node.style.fontSize = fs + 'px'; }
    };
    run();
    if (typeof document !== 'undefined' && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(run);
    return node;
  }
  MJ2.dom = { el, img, wait, shake, fit };
})(typeof window !== 'undefined' ? window : globalThis);
