// Headless full-match simulation with 4 CPU seats.
const MJ2 = require('./load');
function runMatch(seed, stageId, opts = {}) {
  const st = MJ2.DATA.stageById[stageId || MJ2.DATA.stages[0].id];
  const me = MJ2.DATA.config.playerFaceId;
  const roster = [me].concat(st.characterIds.slice(0, 3)); // 組織の３人で固定
  if (opts.roster) roster.splice(0, 4, ...opts.roster);
  const m = MJ2.Engine.newMatch({ seed: 'sim' + seed, stageId: st.id, playerFaceId: me, roster, humanSeats: opts.humanSeats || [0] });
  const stats = { rounds: 0, wins: 0, maxWinners: 0, events: 0, decisions: 0 };
  for (let ri = 0; ri < m.rounds.length; ri++) {
    if (ri === 0) MJ2.Engine.startRound(m);
    MJ2.Engine.advance(m);
    while (!m.round.ended) {
      const pend = m.round.pending;
      const d = MJ2.CPU.decide(m, pend);
      MJ2.Engine.apply(m, d);
      stats.decisions++;
      if (opts.everyStep) opts.everyStep(m);
    }
    stats.rounds++;
    stats.wins += m.round.winOrder.length;
    stats.maxWinners = Math.max(stats.maxWinners, m.round.winOrder.length);
    stats.events += m.round.events.length;
    if (opts.onRoundEnd) opts.onRoundEnd(m);
    if (MJ2.Engine.nextRoundOrEnd(m) === 'bankrupt') break;
  }
  return { m, stats };
}
module.exports = { runMatch, MJ2 };
if (require.main === module) {
  const n = +process.argv[2] || 3;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const { m, stats } = runMatch(i, MJ2.DATA.stages[i % 8].id);
    console.log('match', i, JSON.stringify(stats), 'scores', m.cumulativeScores.join(','));
  }
  console.log('ms', Date.now() - t0);
}
