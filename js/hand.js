/* 麻雀2 hand analysis: complete-shape decomposition, waits, shanten. Works on counts[34]. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;

  // ---------- complete decomposition (head + sets) ----------
  // returns array of {head:i, sets:[{t:'seq'|'trip', i}]}
  function decomposeComplete(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total % 3 !== 2) return [];
    const res = [];
    const c = counts.slice();
    for (let h = 0; h < 34; h++) {
      if (c[h] < 2) continue;
      c[h] -= 2;
      const sets = [];
      extractSets(c, 0, sets, res, h);
      c[h] += 2;
    }
    return res;
  }
  function extractSets(c, start, sets, res, head) {
    let i = start;
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) { res.push({ head, sets: sets.slice() }); return; }
    // triplet
    if (c[i] >= 3) {
      c[i] -= 3; sets.push({ t: 'trip', i });
      extractSets(c, i, sets, res, head);
      sets.pop(); c[i] += 3;
    }
    // sequence
    if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ t: 'seq', i });
      extractSets(c, i, sets, res, head);
      sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
    }
  }
  function isStandardComplete(counts) { return decomposeComplete(counts).length > 0; }
  function isChiitoi(counts) {
    let pairs = 0;
    for (let i = 0; i < 34; i++) { if (counts[i] === 2) pairs++; else if (counts[i] !== 0) return false; }
    return pairs === 7;
  }
  const YAOCHU = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  function isKokushi(counts) {
    let pair = false;
    let total = 0;
    for (let i = 0; i < 34; i++) total += counts[i];
    if (total !== 14) return false;
    for (const i of YAOCHU) { if (counts[i] === 0) return false; if (counts[i] === 2) pair = true; }
    for (let i = 0; i < 34; i++) if (!YAOCHU.includes(i) && counts[i] > 0) return false;
    return pair;
  }
  // meldCount: number of open/kan melds already fixed
  function isAgari(counts, meldCount) {
    if (isStandardComplete(counts)) return true;
    if (meldCount === 0 && (isChiitoi(counts) || isKokushi(counts))) return true;
    return false;
  }
  // waits for 13-effective concealed counts. excludes kinds where player holds all 4 (incl. melds via ownCounts)
  function waits(counts, meldCount, ownAll) {
    const out = [];
    for (let k = 0; k < 34; k++) {
      if ((ownAll ? ownAll[k] : counts[k]) >= 4) continue;
      counts[k]++;
      if (isAgari(counts, meldCount)) out.push(k);
      counts[k]--;
    }
    return out;
  }

  // ---------- shanten ----------
  const groupMemo = new Map();
  // options list of [m,t] pareto for a group; isHonor => no sequences/taatsu except pairs
  function groupOptions(arr, honor) {
    const key = (honor ? 'z' : 'n') + arr.join('');
    const hit = groupMemo.get(key);
    if (hit) return hit;
    const found = new Set();
    const c = arr.slice();
    const n = c.length;
    (function rec(i, m, t) {
      while (i < n && c[i] === 0) i++;
      if (i >= n) { found.add(m * 16 + t); return; }
      // trip
      if (c[i] >= 3) { c[i] -= 3; rec(i, m + 1, t); c[i] += 3; }
      if (!honor && i + 2 < n && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; rec(i, m + 1, t); c[i]++; c[i + 1]++; c[i + 2]++; }
      if (c[i] >= 2) { c[i] -= 2; rec(i, m, t + 1); c[i] += 2; }
      if (!honor && i + 1 < n && c[i + 1] > 0) { c[i]--; c[i + 1]--; rec(i, m, t + 1); c[i]++; c[i + 1]++; }
      if (!honor && i + 2 < n && c[i + 2] > 0) { c[i]--; c[i + 2]--; rec(i, m, t + 1); c[i]++; c[i + 2]++; }
      // drop one tile as isolated
      c[i]--; rec(i, m, t); c[i]++;
    })(0, 0, 0);
    // pareto filter
    const list = [...found].map((v) => [v >> 4, v & 15]);
    const pareto = list.filter(([m, t]) => !list.some(([m2, t2]) => m2 >= m && t2 >= t && (m2 > m || t2 > t)));
    groupMemo.set(key, pareto);
    return pareto;
  }
  function groupsOf(counts) {
    return [counts.slice(0, 9), counts.slice(9, 18), counts.slice(18, 27), counts.slice(27, 34)];
  }
  function shantenStandard(counts, meldCount) {
    const N = 4 - meldCount;
    const groups = groupsOf(counts);
    let best = 8;
    // options per group without head, and with head (head removed)
    const noHead = groups.map((g, gi) => groupOptions(g, gi === 3));
    const withHead = groups.map((g, gi) => {
      const opts = [];
      for (let i = 0; i < g.length; i++) {
        if (g[i] >= 2) { const h = g.slice(); h[i] -= 2; for (const o of groupOptions(h, gi === 3)) opts.push(o); }
      }
      return opts;
    });
    function evalCombo(m, t, head) {
      let mm = Math.min(m, N);
      let tt = Math.min(t, N - mm);
      return 2 * N - 2 * mm - tt - (head ? 1 : 0);
    }
    // no head
    function combine(gi, m, t, headGroup) {
      if (gi === 4) { const s = evalCombo(m, t, headGroup >= 0); if (s < best) best = s; return; }
      const opts = gi === headGroup ? withHead[gi] : noHead[gi];
      if (opts.length === 0) return;
      for (const [om, ot] of opts) combine(gi + 1, m + om, t + ot, headGroup);
    }
    combine(0, 0, 0, -1);
    for (let hg = 0; hg < 4; hg++) if (withHead[hg].length) combine(0, 0, 0, hg);
    return best;
  }
  function shantenChiitoi(counts) {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < 34; i++) { if (counts[i] >= 1) kinds++; if (counts[i] >= 2) pairs++; }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }
  function shantenKokushi(counts) {
    let k = 0, pair = 0;
    for (const i of YAOCHU) { if (counts[i] > 0) k++; if (counts[i] >= 2) pair = 1; }
    return 13 - k - pair;
  }
  function shanten(counts, meldCount) {
    let s = shantenStandard(counts, meldCount);
    if (meldCount === 0) { s = Math.min(s, shantenChiitoi(counts), shantenKokushi(counts)); }
    return s;
  }

  MJ2.Hand = { decomposeComplete, isStandardComplete, isChiitoi, isKokushi, isAgari, waits, shanten, shantenStandard, shantenChiitoi, shantenKokushi, YAOCHU };
})(typeof window !== 'undefined' ? window : globalThis);
