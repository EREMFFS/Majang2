/* 麻雀2 data loader. Over http(s) the JSON files in data/ are fetched (edit them and reload).
   On file:// the generated js/data_bundle.js (tools/build_bundle.py) is used as a fallback. */
(function (root) {
  'use strict';
  const MJ2 = root.MJ2;
  const FILES = {
    config: 'data/game_config.json',
    roles: 'data/roles.json',
    characters: 'data/characters.json',
    stages: 'data/stage_tables.json',
    common: 'data/common_assets.json',
    effects: 'data/effects_manifest.json',
    cpu: 'data/cpu_profiles.json',
    audio: 'data/audio_events.json',
    gold: 'data/gold_manifest.json',
    orgs: 'data/organizations.json',
    theme: 'data/theme_patch.json'
  };
  const DEFAULTS = {
    yakumanTenpaiStartChance: 1.0,
    cpuThinkMs: 260,
    settlementYakuMs: 1800,
    settlementYakumanMs: 2600,
    humanSeatFace: null
  };

  function initData(raw) {
    const D = {};
    D.config = Object.assign({}, DEFAULTS, raw.config);
    D.roles = raw.roles.roles;
    D.roleById = {}; for (const r of D.roles) D.roleById[r.id] = r;
    D.characters = raw.characters.characters;
    D.charById = {}; for (const c of D.characters) D.charById[c.id] = c;
    D.stages = raw.stages.stages;
    D.stageById = {}; for (const s of D.stages) D.stageById[s.id] = s;
    D.common = raw.common;
    D.effects = raw.effects;
    D.cpuById = {}; for (const p of raw.cpu.profiles) D.cpuById[p.characterId] = p;
    D.audio = raw.audio;
    D.orgs = (raw.orgs && raw.orgs.organizations) || [];
    D.orgById = {}; for (const o of D.orgs) D.orgById[o.id] = o;
    D.theme = Object.assign({}, raw.theme || {}, D.config.theme || {});
    D.gold = raw.gold || null; // ジャックポット対象牌の金色素材（表示専用）
    MJ2.DATA = D;
    return D;
  }

  async function loadData() {
    const useFetch = typeof location !== 'undefined' && /^https?:/.test(location.protocol);
    const raw = {};
    if (useFetch) {
      try {
        await Promise.all(Object.entries(FILES).map(async ([k, path]) => {
          const res = await fetch(path, { cache: 'no-cache' });
          if (!res.ok) throw new Error(path + ' ' + res.status);
          raw[k] = await res.json();
        }));
        return initData(raw);
      } catch (e) {
        console.warn('[MJ2] fetch failed, using bundle', e);
      }
    }
    if (!root.MJ2_BUNDLE) throw new Error('データを読み込めません（js/data_bundle.js がありません）');
    return initData(root.MJ2_BUNDLE);
  }

  MJ2.Data = { FILES, initData, loadData };
})(typeof window !== 'undefined' ? window : globalThis);
