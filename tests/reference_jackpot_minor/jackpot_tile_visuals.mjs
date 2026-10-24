const KINDS = new Set([
  ...['m','p','s'].flatMap(s => Array.from({length:9},(_,i) => s+(i+1))),
  ...Array.from({length:7},(_,i) => 'z'+(i+1))
]);

// Only affects presentation: never mutate kind, IDs, target draw, score or deck.
export function isJackpotTarget(kind, targets) {
  return new Set(targets).has(kind);
}

export function selectTileAsset({kind, targets, faceUp = true, size = 'normal', orientation = 'south'}) {
  // Check face-down first. Hidden tile kinds MUST NOT affect the selected image.
  if (!faceUp) return {path:'assets/common/tiles/back.png', gold:false};
  if (!KINDS.has(kind)) throw new TypeError('unknown tile kind');
  if (!['normal','hd','master'].includes(size)) throw new TypeError('unknown size');
  if (!['south','east','north','west'].includes(orientation)) throw new TypeError('unknown orientation');
  const gold = isJackpotTarget(kind,targets);
  const root = gold ? 'assets/jackpot' : 'assets/common';
  if (orientation !== 'south') return {path:`${root}/tiles_rotated/${kind}_${orientation}.png`,gold};
  const dir = {normal:'tiles',hd:'tiles_hd',master:'tiles_master'}[size];
  return {path:`${root}/${dir}/${kind}.png`,gold};
}

export function jackpotPanelItems(targets,ownConcealedHandKinds) {
  if (targets.length !== 14 || new Set(targets).size !== 14 || targets.some(k=>!KINDS.has(k))) {
    throw new TypeError('jackpot targets must be 14 distinct standard kinds');
  }
  const held = new Set(ownConcealedHandKinds);
  return targets.map(kind => ({kind, path:`assets/jackpot/tiles/${kind}.png`, gold:true, held:held.has(kind)}));
}
