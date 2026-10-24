/* 麻雀2 core: namespace, RNG, tile helpers. No DOM. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2 || (root.MJ2 = {});

  // ---- seedable RNG (sfc32). state = [a,b,c,d] uint32, serializable ----
  function seedState(seed) {
    // splitmix-ish expansion of a string/number seed
    let h = 1779033703 ^ String(seed).length;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    const out = [];
    for (let i = 0; i < 4; i++) {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      out.push(h >>> 0);
    }
    return out;
  }
  function rngNext(st) {
    let [a, b, c, d] = st;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    st[0] = a >>> 0; st[1] = b >>> 0; st[2] = c >>> 0; st[3] = d >>> 0;
    return (t >>> 0) / 4294967296;
  }
  function makeRng(state) {
    const st = state;
    const api = {
      state: st,
      next: () => rngNext(st),
      int: (n) => Math.floor(rngNext(st) * n),
      pick: (arr) => arr[Math.floor(rngNext(st) * arr.length)],
      shuffle: (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rngNext(st) * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
    for (let i = 0; i < 8; i++) rngNext(st);
    return api;
  }
  // wrap existing state without warmup
  function useRng(state) {
    return {
      state,
      next: () => rngNext(state),
      int: (n) => Math.floor(rngNext(state) * n),
      pick: (arr) => arr[Math.floor(rngNext(state) * arr.length)],
      shuffle: (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rngNext(state) * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  }
  function newRngState(seed) { const st = seedState(seed); makeRng(st); return st; }

  // ---- tiles ----
  const KINDS = [];
  for (const s of ['m', 'p', 's']) for (let n = 1; n <= 9; n++) KINDS.push(s + n);
  for (let n = 1; n <= 7; n++) KINDS.push('z' + n);
  const KIND_INDEX = {};
  KINDS.forEach((k, i) => (KIND_INDEX[k] = i));
  const T = {
    KINDS, KIND_INDEX,
    kindOfId: (id) => KINDS[id >> 2],
    idxOfId: (id) => id >> 2,
    idx: (kind) => KIND_INDEX[kind],
    suit: (kind) => kind[0],
    num: (kind) => (kind[0] === 'z' ? 0 : +kind[1]),
    isHonor: (kind) => kind[0] === 'z',
    isNumber: (kind) => kind[0] !== 'z',
    isTerminal: (kind) => kind[0] !== 'z' && (kind[1] === '1' || kind[1] === '9'),
    isYaochu: (kind) => kind[0] === 'z' || kind[1] === '1' || kind[1] === '9',
    isDragon: (kind) => kind === 'z5' || kind === 'z6' || kind === 'z7',
    isWind: (kind) => kind === 'z1' || kind === 'z2' || kind === 'z3' || kind === 'z4',
    // index helpers
    iSuit: (i) => (i < 27 ? 'mps'[Math.floor(i / 9)] : 'z'),
    iNum: (i) => (i < 27 ? (i % 9) + 1 : 0),
    iHonor: (i) => i >= 27,
    iYaochu: (i) => i >= 27 || i % 9 === 0 || i % 9 === 8,
    sortIds: (ids) => ids.slice().sort((a, b) => a - b),
    countsOfIds: (ids) => { const c = new Array(34).fill(0); for (const id of ids) c[id >> 2]++; return c; },
    countsOfKinds: (kinds) => { const c = new Array(34).fill(0); for (const k of kinds) c[KIND_INDEX[k]]++; return c; },
    // dora indicator -> dora kind index
    doraFromIndicator: (i) => {
      if (i < 27) return Math.floor(i / 9) * 9 + ((i % 9) + 1) % 9;
      if (i <= 30) return 27 + ((i - 27 + 1) % 4);
      return 31 + ((i - 31 + 1) % 3);
    },
    NAMES_JA: {}
  };
  const numJa = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  for (let n = 1; n <= 9; n++) { T.NAMES_JA['m' + n] = numJa[n] + '萬'; T.NAMES_JA['p' + n] = numJa[n] + '筒'; T.NAMES_JA['s' + n] = numJa[n] + '索'; }
  ['東', '南', '西', '北', '白', '發', '中'].forEach((x, i) => (T.NAMES_JA['z' + (i + 1)] = x));
  T.WIND_JA = ['東', '南', '西', '北'];

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function sum(a) { let s = 0; for (const x of a) s += x; return s; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  // 金額表示（裏社会編）。内部の整数値はそのまま、表示だけ「円」。
  // 1万円以上は「82万4,500円」「1億2,000万円」のように万・億で表す。負数は全角マイナス。
  function yenAbs(a, prize) {
    if (a >= 10000) { // 1万円以上は「万」「億」で（例: 82万4,500円 / 1億2,000万円）
      const oku = Math.floor(a / 1e8), man = Math.floor((a % 1e8) / 10000), rest = a % 10000;
      return (oku ? oku.toLocaleString('en-US') + '億' : '') + (man ? man.toLocaleString('en-US') + '万' : '') + (rest ? rest.toLocaleString('en-US') : '') + '円';
    }
    return a.toLocaleString('en-US') + '円';
  }
  function yen(n, opt) { n = Math.round(Number(n) || 0); const s = yenAbs(Math.abs(n), opt && opt.prize); return n < 0 ? '−' + s : s; }
  function yenSigned(n, opt) { n = Math.round(Number(n) || 0); return (n < 0 ? '−' : '＋') + yenAbs(Math.abs(n), opt && opt.prize); }

  // 点表記（通常の表示）
  function pts(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US') + '点'; }
  function ptsSigned(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '−' : '＋') + Math.abs(n).toLocaleString('en-US') + '点'; }
  // 所持金: マイナスは「借金」
  function money(n) { n = Math.round(Number(n) || 0); return n < 0 ? '借金 ' + yenAbs(-n) : yenAbs(n); }

  MJ2.RNG = { seedState, newRngState, makeRng, useRng, rngNext };
  MJ2.T = T;
  MJ2.util = { deepClone, sum, fmt, yen, yenSigned, money, pts, ptsSigned };
  if (typeof module !== 'undefined') module.exports = MJ2;
})(typeof window !== 'undefined' ? window : globalThis);
