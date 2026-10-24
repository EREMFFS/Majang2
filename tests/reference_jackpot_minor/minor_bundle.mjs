// Reference adapter: call AFTER the game's existing exclusivity resolver.
export const MINOR_BUNDLE_ROLE_ID = 'system_minor_bundle';
export const SCORING_POLICY_VERSION = 'minor_bundle_v1';

export function isMinorDefinition(role) {
  return role?.class === 'minor' || ['小役','子役'].includes(role?.displayCategory);
}

export function minorCountToHan(count) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('minor count must be a nonnegative safe integer');
  return Math.min(4, Math.floor(count / 4));
}

export function migrateMinorDefinitions(definitions) {
  return definitions.map(role => isMinorDefinition(role)
    ? {...role, class: 'minor', value: 0, unit: 'count', individualPointsEnabled: false}
    : {...role});
}

export function summarizeResolvedAwards(resolvedAwards, definitions) {
  const byId = new Map(definitions.map(role => [role.id, role]));
  const minor = new Map();
  const scoringAwards = [];
  for (const award of resolvedAwards) {
    if (!award.roleId) throw new TypeError('roleId is required');
    // Rebuilding this summary is idempotent, even if a prior summary was supplied.
    if (award.roleId === MINOR_BUNDLE_ROLE_ID) continue;
    const definition = byId.get(award.roleId);
    const category = definition?.class ?? award.roleClass ?? award.class;
    if (isMinorDefinition(definition) || category === 'minor' || ['小役','子役'].includes(award.displayCategory)) {
      if (!minor.has(award.roleId)) {
        const clean = {...award, class: 'minor', roleClass: 'minor', minorPoints: 0};
        delete clean.fixedPoints;
        delete clean.points;
        minor.set(award.roleId, clean);
      }
    } else {
      // Genuine non-minor fixed rewards remain; legacy fixed '振込マン' does not.
      scoringAwards.push({...award});
    }
  }
  const minorAwards = [...minor.values()];
  const minorCount = minorAwards.length;
  const minorBundleHan = minorCountToHan(minorCount);
  const bundleAward = minorBundleHan > 0 ? {
    roleId: MINOR_BUNDLE_ROLE_ID,
    class: 'han',
    han: minorBundleHan,
    origin: 'minor_bundle',
    countsForRoleBook: false,
    countsForMinorKing: false,
    evidence: {kind: 'minor_bundle', roleIds: minorAwards.map(a => a.roleId)}
  } : null;
  return {
    minorCount,
    minorBundleHan,
    individualMinorPoints: 0,
    minorAwards,
    bundleAward,
    // Feed this array to the han/normal scoring branch exactly once.
    // Yakuman/jackpot fixed-score branches must not add a separate han payout.
    scoringAwards: bundleAward ? [...scoringAwards, bundleAward] : scoringAwards,
    scoringPolicyVersion: SCORING_POLICY_VERSION
  };
}

export function nonWinnerHanPoints(totalHan) {
  if (!Number.isSafeInteger(totalHan) || totalHan < 0) throw new RangeError('totalHan must be a nonnegative safe integer');
  return totalHan === 0 ? 0 : [0,100,200,400,800,1600][Math.min(5,totalHan)];
}

// User-requested bundle becomes a qualifying yaku, but never an alternate hand shape.
// Caller supplies a snapshot evaluated AS a win; exclude non-win-only roles first.
export function qualifiesNormalWin({completeShape, legalAcquisition, otherYakuHan = 0, minorBundleHan = 0}) {
  if (!completeShape || !legalAcquisition) return false;
  return otherYakuHan > 0 || minorBundleHan > 0;
}
