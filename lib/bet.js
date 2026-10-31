// "Bet on yourself" on the server. During freeze and buy time of a classic round a player (never a bot) bets part of
// their money on their own round: 1 kill, 2 kills, 3+ kills or surviving (shared/bet.js has the odds). The stake is
// taken at once; when the round is decided the bet pays stake × odds (up to the $16000 cap) or is lost. Everyone
// sees the bet and its result in the chat; the bettor's HUD tracks it. server.js calls the hooks below.
//
// Messages: in  betPlace { target, stake }
//           out betOk { target, stake, pay } / betNo { why }   (to the bettor)
//               betNew { id, name, team, target, stake }       (to everyone)
//               betTrack { k, alive }                          (to the bettor: kills so far, alive)
//               betEnd { list: [{ id, name, team, target, stake, kills, won, pay, paid, void }], cap } (to everyone)
//               betRound {}                                    (to everyone, a new round: no bets yet)
import { BET, betTarget, betPayout } from '../shared/bet.js';

// d: players (Map), game, cfg (server CFG), now(), send(p, m), broadcast(m), sendMe(p), mates(a, b), inTeam(p)
export function createBets(d) {
  const bets = new Map(); // player id -> { stake, target, team, kills }

  // Why this bet can't be placed, or '' (the page checks the same before sending, see public/js/bet.js).
  function refuse(p, m) {
    const g = d.game, t = betTarget(m?.target), stake = m?.stake;
    if (!p.joined || !d.inTeam(p)) return 'Join a team to bet.';
    if (d.cfg.gameMode !== 'classic') return 'Bets are only in classic rounds (not Deathmatch, Gun Game, Zombie or Hide and Seek).';
    if (g.phase === 'warmup') return 'No bets during warmup — they open with the first round.';
    if (g.phase !== 'freeze' && g.phase !== 'live') return 'Bets open when the next round starts.';
    if (d.now() - g.roundStartAt > (d.cfg.freezeTime + d.cfg.buyTime) * 1000) return 'Bets close with the buy time — try next round.';
    if (!p.alive) return 'You must be alive to bet.';
    if (bets.has(p.id)) return 'You already bet this round — a bet can\'t be changed.';
    if (!t) return 'Pick what you bet on.';
    if (!Number.isInteger(stake) || stake < BET.minStake || stake > BET.maxStake || stake % BET.step) return `Bet between $${BET.minStake} and $${BET.maxStake}, in hundreds.`;
    if (stake > p.money) return `You only have $${p.money}.`;
    return '';
  }

  function place(p, m) {
    if (p.bot) return; // bots don't bet
    const why = refuse(p, m);
    if (why) { d.send(p, { t: 'betNo', why }); return; }
    const { target, stake } = m;
    p.money -= stake;
    bets.set(p.id, { stake, target, team: p.team, kills: 0 });
    d.sendMe(p);
    d.send(p, { t: 'betOk', target, stake, pay: betPayout(stake, target) });
    d.broadcast({ t: 'betNew', id: p.id, name: p.name, team: p.team, target, stake });
  }

  // Every death (killPlayer). Counts: an enemy killed by the bettor while the round is live (bots count; team kills,
  // suicides, the world and kills after the round is decided don't). A fake death (playing dead) never reaches
  // killPlayer, so it counts neither as a kill nor as a death here.
  function onKill(killer, v) {
    const vb = bets.get(v.id);
    if (vb) d.send(v, { t: 'betTrack', k: vb.kills, alive: false });
    if (!killer || killer === v || d.mates(killer, v) || !d.inTeam(v) || d.game.phase !== 'live') return;
    const b = bets.get(killer.id);
    if (!b) return;
    b.kills++;
    d.send(killer, { t: 'betTrack', k: b.kills, alive: !!killer.alive });
  }

  // The round is decided (endRound). Settled a moment later, once the rest of what decided it has happened: the
  // bomb's blast (explodeBomb ends the round, then the blast kills) still costs a "survive" bet. A round decided in
  // freeze time (a team left before it went live) calls the bets off and gives the stakes back.
  function onRoundEnd() {
    const calledOff = d.now() - d.game.roundStartAt < d.cfg.freezeTime * 1000;
    setImmediate(() => settle(calledOff));
  }

  // Money in, up to the cap; returns what fit.
  function give(p, n) {
    const paid = Math.max(0, Math.min(n, d.cfg.maxMoney - p.money));
    p.money += paid;
    return paid;
  }

  function settle(calledOff) {
    const list = [];
    for (const [id, b] of bets) {
      const p = d.players.get(id);
      if (!p) continue; // left the game: the stake is gone
      const t = betTarget(b.target);
      const r = { id, name: p.name, team: b.team, target: b.target, stake: b.stake, kills: b.kills };
      if (calledOff) {
        r.void = true;
        r.paid = give(p, b.stake);
      } else {
        // Survive: alive when the round was decided. A downed player (see p.downed) is still alive; one who bled
        // out or switched teams isn't.
        r.won = p.team === b.team && (t.kills ? b.kills >= t.kills : !!p.alive);
        r.pay = r.won ? betPayout(b.stake, b.target) : 0;
        r.paid = r.won ? give(p, r.pay) : 0;
        const rec = (p.betRec ||= { n: 0, wins: 0, net: 0 });
        rec.n++;
        if (r.won) rec.wins++;
        rec.net += r.paid - b.stake;
      }
      d.sendMe(p);
      list.push(r);
    }
    bets.clear();
    if (list.length) d.broadcast({ t: 'betEnd', list, cap: d.cfg.maxMoney });
  }

  // A new round (startRound): bets left over from a round that never ended (map or mode change) are dropped.
  function onRoundStart() {
    bets.clear();
    d.broadcast({ t: 'betRound' });
  }

  // A new match (startMatch): everyone's gambling record starts again.
  function onMatchStart() {
    for (const p of d.players.values()) p.betRec = null;
  }

  // End-of-match award: the biggest net winner of the match, if anyone came out ahead.
  function award() {
    let best = null;
    for (const p of d.players.values()) {
      const r = p.betRec;
      if (r && d.inTeam(p) && r.net > 0 && (!best || r.net > best.betRec.net)) best = p;
    }
    if (!best) return null;
    const r = best.betRec;
    return { title: 'Best gambler', name: best.name, team: best.team, value: `+$${r.net} · ${r.wins} of ${r.n} bet${r.n === 1 ? '' : 's'} won` };
  }

  return { place, onKill, onRoundEnd, onRoundStart, onMatchStart, award, bets };
}
