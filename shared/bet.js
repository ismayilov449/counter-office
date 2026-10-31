// "Bet on yourself" (F3): during freeze and buy time of a classic round, a player bets some of their money on their
// own round. Shared by the server (lib/bet.js) and the page (public/js/bet.js).
//
// Targets are "at least": 2 kills also wins a bet on 1 kill. Kills are enemies only (bots count, team kills don't),
// made before the round is decided. "Survive" means alive when the round is decided (the bomb that ends it counts).
// The odds are set so that an average player loses a little on every target (about 10–25% under fair odds, from
// rough office rates: 1+ kill ~60% of rounds, 2+ ~30%, 3+ ~15%, alive at the end ~40%), and a player who really
// is that good wins money: it's a bet on your own skill.
export const BET = {
  minStake: 200,
  maxStake: 2000,
  step: 100, // stakes are whole hundreds
  cap: 16000, // the money cap (the server's CFG.maxMoney): what a payout would bring above it is lost
  stakes: [200, 500, 1000, 1500, 2000], // the panel's chips (keys 5–9)
  targets: [
    { id: 'k1', kills: 1, odds: 1.5, label: '1 kill', on: '1 kill' },
    { id: 'k2', kills: 2, odds: 3, label: '2 kills', on: '2 kills' },
    { id: 'k3', kills: 3, odds: 5, label: '3+ kills', on: '3 kills' },
    { id: 'live', kills: 0, odds: 2, label: 'Survive', on: 'surviving the round' },
  ],
};

export const betTarget = id => BET.targets.find(t => t.id === id) || null;
// What a won bet pays back (the stake included), in whole dollars.
export const betPayout = (stake, target) => Math.round(stake * (betTarget(target)?.odds || 0));
