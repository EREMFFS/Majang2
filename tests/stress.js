const { runMatch, MJ2 } = require('./sim');
const N = +process.argv[2] || 20;
const freq = {}; let rounds = 0, seatsEval = 0, jackpots = 0, err = 0;
const t0 = Date.now();
let winTypes = {}, zeroHanWins = 0, crowns = 0, bankrupts = 0;
for (let i = 0; i < N; i++) {
  try {
    const out = runMatch(1000 + i, MJ2.DATA.stages[i % MJ2.DATA.stages.length].id, {
      onRoundEnd(m) {
        rounds++;
        const s = m.settlements[m.settlements.length - 1];
        if (s.results.reduce((a, x) => a + x.received - x.paid, 0) !== 0) throw new Error('transfers do not sum to zero');
        for (const r of s.results) {
          seatsEval++;
          for (const a of r.majors.concat(r.minors)) freq[a.roleId] = (freq[a.roleId] || 0) + 1;
          if (r.baseKind === 'jackpot') jackpots++;
          if (r.isWinner) { winTypes[r.winType] = (winTypes[r.winType] || 0) + 1; if (r.basePoints <= 0) zeroHanWins++; }
          if (r.total !== r.received - r.paid + r.selfGain) throw new Error('total mismatch');
        }
      }
    });
    const m = out.m;
    if (!m.tripleCrown && !m.bankrupt) throw new Error('no triple crown at match end');
    if (m.bankrupt) { bankrupts++; continue; }
    const start = MJ2.DATA.config.startingScore || 0;
    for (let seat = 0; seat < 4; seat++) {
      const sum = m.settlements.reduce((a, s) => a + s.results[seat].total, 0);
      if (m.cumulativeScores[seat] !== start + sum + m.tripleCrown.award[seat]) throw new Error('cumulative != rounds + crown');
    }
    crowns += m.tripleCrown.award.filter((x) => x > 0).length;
  } catch (e) { err++; console.error('match', i, e.stack); }
}
const sorted = MJ2.DATA.roles.map((r) => [r.id, r.name, freq[r.id] || 0]);
console.log('matches', N, 'rounds', rounds, 'errors', err, 'jackpots', jackpots, 'winTypes', JSON.stringify(winTypes), 'zeroWins', zeroHanWins, 'crownSeats', crowns, 'bankrupts', bankrupts, 'ms', Date.now() - t0);
console.log(sorted.map((x) => x[0] + ':' + x[2]).join(' '));
console.log('never:', sorted.filter((x) => !x[2]).map((x) => x[0] + x[1]).join(' '));
