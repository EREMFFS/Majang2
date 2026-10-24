/* 麻雀2 SaveStore + Records (戦歴・役図鑑). IDs only, no asset paths. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;

  const KEYS = { records: 'mj2.records.v1', match: 'mj2.match.v1', settings: 'mj2.settings.v1' };
  const mem = {};
  const store = {
    get(k) { try { if (root.localStorage) return root.localStorage.getItem(k); } catch (e) { /* ignore */ } return mem[k] ?? null; },
    set(k, v) { try { if (root.localStorage) { root.localStorage.setItem(k, v); return true; } } catch (e) { /* quota */ } mem[k] = v; return true; },
    del(k) { try { if (root.localStorage) root.localStorage.removeItem(k); } catch (e) { /* ignore */ } delete mem[k]; }
  };

  function emptyRecords() {
    return {
      schemaVersion: 1,
      overall: { matches: 0, ranks: [0, 0, 0, 0], totalPoints: 0, bestMatchScore: null, rounds: 0, winRounds: 0, scoringRounds: 0, bestRoundScore: null },
      byCharacter: {},
      byRole: {},
      appliedSettlementIds: [],
      appliedMatchIds: [],
      themes: {},
      legacyArchive: null
    };
  }
  function themeId() { const t = MJ2.DATA && MJ2.DATA.theme; return (t && (t.clearSaveNamespace || t.themeId)) || 'underworld_2200'; }
  // 新テーマの対戦・撃破記録はテーマ名前空間へ。旧キャラ別記録はアーカイブして混ぜない。
  function ns() {
    const rec = loadRecords();
    const id = themeId();
    const t = rec.themes[id] || (rec.themes[id] = { byCharacter: {}, orgs: {}, history: [] });
    if (!t.history) t.history = [];
    return t;
  }
  function migrate(rec) {
    const legacy = Object.keys(rec.byCharacter || {});
    if (legacy.length) {
      rec.legacyArchive = rec.legacyArchive || {};
      rec.legacyArchive.byCharacter_ffs = Object.assign({}, rec.legacyArchive.byCharacter_ffs || {}, rec.byCharacter);
      rec.legacyArchive.archivedAt = rec.legacyArchive.archivedAt || Date.now();
      rec.byCharacter = {};
    }
    return rec;
  }
  let records = null;
  function loadRecords() {
    if (records) return records;
    try { const raw = store.get(KEYS.records); records = raw ? JSON.parse(raw) : emptyRecords(); } catch (e) { records = emptyRecords(); }
    const base = emptyRecords();
    for (const k in base) if (records[k] == null) records[k] = base[k];
    migrate(records);
    return records;
  }
  function saveRecords() { store.set(KEYS.records, JSON.stringify(records)); }

  // ---- per-round (spec: completed rounds keep discovery even if match is abandoned) ----
  function applyRound(m, s) {
    const rec = loadRecords();
    if (rec.appliedSettlementIds.includes(s.id)) return s.newRoleIds || [];
    const newIds = [];
    for (const seat of m.humanSeats) {
      const res = s.results[seat];
      rec.overall.rounds++;
      if (res.isWinner) rec.overall.winRounds++;
      if (res.total > 0) rec.overall.scoringRounds++;
      if (rec.overall.bestRoundScore == null || res.total > rec.overall.bestRoundScore) rec.overall.bestRoundScore = res.total;
      const ids = res.majors.concat(res.minors).map((x) => x.roleId);
      for (const id of new Set(ids)) {
        const role = MJ2.DATA.roleById[id];
        if (!role) continue;
        let br = rec.byRole[id];
        if (!br) { br = rec.byRole[id] = { count: 0, winCount: 0, nonwinCount: 0, firstAt: Date.now(), firstMatchId: m.matchId }; newIds.push(id); }
        br.count++;
        if (res.isWinner) br.winCount++; else br.nonwinCount++;
      }
    }
    rec.appliedSettlementIds.push(s.id);
    if (rec.appliedSettlementIds.length > 400) rec.appliedSettlementIds.splice(0, rec.appliedSettlementIds.length - 400);
    saveRecords();
    return newIds;
  }

  // ---- once per finished match ----
  function applyMatchEnd(m) {
    const rec = loadRecords();
    if (rec.appliedMatchIds.includes(m.matchId)) return false;
    MJ2.Settlement.applyTripleCrown(m);
    const ranking = MJ2.Settlement.finalRanking(m);
    const human = m.humanSeats[0];
    const me = ranking.find((x) => x.seat === human);
    rec.overall.matches++;
    rec.overall.ranks[me.rank - 1]++;
    rec.overall.totalPoints += me.money - ((m.initialYen && m.initialYen[human]) || 0); // 累計の収支（円）
    if (rec.overall.bestMatchScore == null || me.money > rec.overall.bestMatchScore) rec.overall.bestMatchScore = me.money;
    const T = ns();
    for (const x of ranking) {
      if (x.seat === human) continue;
      const c = T.byCharacter[x.faceId] || (T.byCharacter[x.faceId] = { matches: 0, wins: 0, losses: 0, draws: 0 });
      c.matches++;
      if (me.score > x.score) c.wins++; else if (me.score < x.score) c.losses++; else c.draws++;
    }
    // 組織撃破: 三冠王まで含めた最終順位が１位（同点１位を含む）のときだけ立てる。負けても消さない。
    const o = T.orgs[m.stageId] || (T.orgs[m.stageId] = { matches: 0, firsts: 0, defeated: false, firstDefeatedAt: null });
    o.matches++;
    if (me.rank === 1 && !m.bankrupt) { o.firsts++; if (!o.defeated) { o.defeated = true; o.firstDefeatedAt = Date.now(); } m.orgDefeatedNow = true; }
    if (m.bankrupt) { o.bankrupts = (o.bankrupts || 0) + 1; rec.overall.bankrupts = (rec.overall.bankrupts || 0) + 1; }
    T.history.unshift({ at: Date.now(), matchId: m.matchId, orgId: m.stageId, rank: me.rank, score: me.money, points: me.points, bankrupt: !!m.bankrupt,
      opponents: ranking.filter((x) => x.seat !== human).map((x) => ({ id: x.faceId, rank: x.rank, score: x.money, points: x.points })) });
    if (T.history.length > 50) T.history.length = 50;
    rec.appliedMatchIds.push(m.matchId);
    if (rec.appliedMatchIds.length > 400) rec.appliedMatchIds.splice(0, rec.appliedMatchIds.length - 400);
    m.matchEndApplied = true;
    saveRecords();
    return true;
  }

  function stats() {
    const o = loadRecords().overall;
    const avgRank = o.matches ? (o.ranks.reduce((s, c, i) => s + c * (i + 1), 0) / o.matches) : null;
    return {
      matches: o.matches, ranks: o.ranks.slice(),
      firstRate: o.matches ? o.ranks[0] / o.matches : null,
      avgRank, totalPoints: o.totalPoints, bestMatchScore: o.bestMatchScore,
      rounds: o.rounds, winRate: o.rounds ? o.winRounds / o.rounds : null,
      scoringRate: o.rounds ? o.scoringRounds / o.rounds : null, bestRoundScore: o.bestRoundScore, bankrupts: o.bankrupts || 0
    };
  }
  function orgStat(id) { return ns().orgs[id] || { matches: 0, firsts: 0, defeated: false, firstDefeatedAt: null }; }
  function history() { return ns().history.slice(); }
  function charStat(id) {
    const c = ns().byCharacter[id];
    if (!c) return { matches: 0, wins: 0, losses: 0, draws: 0, winRate: null };
    const d = c.wins + c.losses;
    return Object.assign({}, c, { winRate: d ? c.wins / d : null });
  }
  function roleStat(id) {
    const rec = loadRecords();
    const r = rec.byRole[id];
    if (!r) return null;
    return Object.assign({}, r, { rate: rec.overall.rounds ? r.count / rec.overall.rounds : null });
  }

  // ---- suspended match ----
  function saveMatch(m) {
    if (!m) return;
    const data = { schemaVersion: MJ2.Engine.SCHEMA, savedAt: Date.now(), match: m };
    store.set(KEYS.match, JSON.stringify(data));
  }
  function loadMatch() {
    try { const raw = store.get(KEYS.match); if (!raw) return null; const d = JSON.parse(raw); if (d.schemaVersion !== MJ2.Engine.SCHEMA) return null; return d.match; } catch (e) { return null; }
  }
  function hasMatch() { return !!loadMatch(); }
  function clearMatch() { store.del(KEYS.match); }

  function loadSettings() {
    const def = { discardMode: 'double', speed: 'normal', volume: 0.8, volBgm: 0.55, volVoice: 0.9, volSe: 0.8, muted: false, autoPassNoYaku: true, portraitMode: 'rotate' };
    try { const raw = store.get(KEYS.settings); return Object.assign(def, raw ? JSON.parse(raw) : {}); } catch (e) { return def; }
  }
  function saveSettings(s) { store.set(KEYS.settings, JSON.stringify(s)); }

  function exportAll() {
    return JSON.stringify({ kind: 'mj2-export', version: 1, exportedAt: new Date().toISOString(), records: loadRecords(), match: loadMatch(), settings: loadSettings() }, null, 1);
  }
  function importAll(text) {
    const d = JSON.parse(text);
    if (d.kind !== 'mj2-export') throw new Error('麻雀2の書き出しファイルではありません');
    records = migrate(Object.assign(emptyRecords(), d.records || {}));
    saveRecords();
    if (d.match) store.set(KEYS.match, JSON.stringify({ schemaVersion: MJ2.Engine.SCHEMA, savedAt: Date.now(), match: d.match }));
    if (d.settings) saveSettings(d.settings);
  }
  function resetRecords() { records = emptyRecords(); saveRecords(); }
  function _resetMemory() { records = null; for (const k in mem) delete mem[k]; }

  MJ2.Records = { applyRound, applyMatchEnd, stats, charStat, orgStat, history, roleStat, loadRecords, resetRecords, themeNamespace: ns };
  MJ2.SaveStore = { saveMatch, loadMatch, hasMatch, clearMatch, loadSettings, saveSettings, exportAll, importAll, KEYS, _resetMemory };
})(typeof window !== 'undefined' ? window : globalThis);
