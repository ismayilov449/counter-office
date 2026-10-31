// lib/bet.js on its own (no server): every refusal, kill counting, payouts, the cap, called-off rounds, a team switch,
// a player who left, bots, and the Best gambler award.   node dev/test-scripts/bet/unit.mjs
import { createBets } from '../../../lib/bet.js';
import { BET, betPayout } from '../../../shared/bet.js';

let fails = 0;
const ok = (what, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
const tick = () => new Promise(r => setImmediate(r));

const players = new Map(), sent = [], bc = [];
const game = { phase: 'freeze', roundStartAt: 0, round: 1 };
const cfg = { gameMode: 'classic', freezeTime: 3, buyTime: 25, maxMoney: 16000 };
let T = 1000;
const bets = createBets({
  players, game, cfg, now: () => T,
  send: (p, m) => sent.push({ to: p.id, ...m }), broadcast: m => bc.push(m), sendMe: () => {},
  mates: (a, b) => !!a && !!b && a.team === b.team, inTeam: p => p.team === 'T' || p.team === 'CT',
});
const mk = (id, team, money, extra = {}) => { const p = { id, name: `P${id}`, team, money, alive: true, joined: true, ...extra }; players.set(id, p); return p; };
const last = id => sent.filter(m => m.to === id).at(-1);
const refusal = (p, m) => { sent.length = 0; bets.place(p, m); const r = last(p.id); return r?.t === 'betNo' ? r.why : r ? `(${r.t})` : '(nothing)'; };

const a = mk(1, 'T', 10000), b = mk(2, 'T', 10000), c = mk(3, 'CT', 10000), e = mk(4, 'CT', 300), spec = mk(5, 'SPEC', 5000);
const bot = mk(6, 'CT', 10000, { bot: {} });

// ---- refusals
cfg.gameMode = 'deathmatch'; ok('wrong mode refused', /classic rounds/.test(refusal(a, { target: 'k1', stake: 500 })), refusal(a, { target: 'k1', stake: 500 }));
cfg.gameMode = 'zombie'; ok('zombie refused', /classic rounds/.test(refusal(a, { target: 'k1', stake: 500 })));
cfg.gameMode = 'classic';
game.phase = 'warmup'; ok('warmup refused', /warmup/.test(refusal(a, { target: 'k1', stake: 500 })));
game.phase = 'end'; ok('round over refused', /next round/.test(refusal(a, { target: 'k1', stake: 500 })));
game.phase = 'live'; T = 28001; ok('after buy time (28 s) refused', /buy time/.test(refusal(a, { target: 'k1', stake: 500 })));
T = 27999; game.phase = 'live';
ok('spectator refused', /Join a team/.test(refusal(spec, { target: 'k1', stake: 500 })));
a.alive = false; ok('dead refused', /alive/.test(refusal(a, { target: 'k1', stake: 500 }))); a.alive = true;
ok('unknown target refused', /Pick/.test(refusal(a, { target: 'k9', stake: 500 })));
for (const s of [100, 150, 2100, 250, '500', 500.5, null]) ok(`stake ${JSON.stringify(s)} refused`, /between/.test(refusal(a, { target: 'k1', stake: s })));
ok('too much money refused ($300, stake $500)', /only have \$300/.test(refusal(e, { target: 'k1', stake: 500 })));
sent.length = 0; bets.place(bot, { target: 'k1', stake: 500 });
ok('a bot can\'t bet (no answer, no bet)', !sent.length && !bets.bets.has(bot.id));

// ---- placing (freeze time, round 1)
game.phase = 'freeze'; T = 1500; bc.length = 0;
sent.length = 0; bets.place(a, { target: 'k3', stake: 2000 });
ok('placed: stake taken', a.money === 8000, `$${a.money}`);
ok('placed: betOk with the payout', last(1)?.t === 'betOk' && last(1).pay === 10000, JSON.stringify(last(1)));
ok('placed: betNew to everyone', bc.some(m => m.t === 'betNew' && m.id === 1 && m.stake === 2000 && m.target === 'k3' && m.name === 'P1'));
ok('twice refused', /already bet/.test(refusal(a, { target: 'k1', stake: 200 })));
ok('…and the money is untouched', a.money === 8000);
bets.place(b, { target: 'live', stake: 500 });
bets.place(c, { target: 'k1', stake: 200 });
const f = mk(7, 'CT', 10000); bets.place(f, { target: 'live', stake: 300 });
const g = mk(8, 'T', 10000); bets.place(g, { target: 'k2', stake: 1000 });
const h = mk(9, 'T', 10000); bets.place(h, { target: 'k1', stake: 400 });
const gone = mk(10, 'CT', 10000); bets.place(gone, { target: 'k1', stake: 500 });
ok('7 bets open', bets.bets.size === 7, String(bets.bets.size));

// ---- kills (live)
game.phase = 'live'; T = 5000; sent.length = 0;
bets.onKill(a, c); c.alive = false; // enemy
bets.onKill(a, f); f.alive = false; // enemy (f bet on surviving: now dead)
bets.onKill(a, b); // a teammate: doesn't count (b stays alive in this test)
bets.onKill(a, a); // himself: doesn't count
bets.onKill(null, e); // the world
bets.onKill(a, bot); bot.alive = false; // a bot: counts
ok('a: 3 kills counted (2 players + a bot; not the teammate, himself or the world)', bets.bets.get(1).kills === 3, String(bets.bets.get(1).kills));
ok('a: betTrack 1, 2, 3 (and "dead" when he killed himself)', sent.filter(m => m.to === 1 && m.t === 'betTrack').map(m => m.k + (m.alive ? '' : 'x')).join() === '1,2,2x,3');
ok('c (killed): betTrack alive false', sent.some(m => m.to === 3 && m.t === 'betTrack' && m.alive === false));
bets.onKill(g, mk(11, 'CT', 0)); // g: 1 of 2
g.team = 'CT'; // g switches teams: his bet is lost
bets.onKill(h, mk(12, 'CT', 0)); // h: 1 kill
players.delete(gone.id); // left the game
game.phase = 'end';
bets.onKill(h, mk(13, 'CT', 0)); // after the round is decided: doesn't count
ok('a kill after the round is decided doesn\'t count', bets.bets.get(9).kills === 1);

// ---- the round is decided; settled a moment later
a.money = 12150; b.money = 12750; c.money = 11200; f.money = 11100; h.money = 15900; // (round bonuses etc.)
bc.length = 0;
bets.onRoundEnd();
ok('not settled at once (the bomb blast first)', bets.bets.size === 7);
await tick();
const end = bc.find(m => m.t === 'betEnd'), r = id => end?.list.find(x => x.id === id);
ok('betEnd broadcast, 6 results (the one who left is skipped)', end && end.list.length === 6, String(end?.list.length));
ok('a: 3 kills won, pays $10000 but only $3850 fits under the cap', r(1)?.won && r(1).pay === 10000 && r(1).paid === 3850 && a.money === 16000, JSON.stringify(r(1)));
ok('b: survived, won $1000', r(2)?.won && r(2).pay === 1000 && b.money === 13750, JSON.stringify(r(2)));
ok('c: 1 kill, had 0: lost', r(3) && !r(3).won && r(3).paid === 0 && c.money === 11200);
ok('f: survive, died: lost', r(7) && !r(7).won && f.money === 11100);
ok('g: switched teams: lost', r(8) && !r(8).won);
ok('h: 1 kill won, $600 → capped at $100', r(9)?.won && r(9).pay === 600 && r(9).paid === 100 && h.money === 16000, JSON.stringify(r(9)));
ok('cap sent with betEnd', end.cap === 16000);
ok('bets cleared after settling', bets.bets.size === 0);

// ---- records and the award
ok('a\'s record: +$1850 (paid 3850 − 2000)', a.betRec?.net === 1850 && a.betRec.wins === 1 && a.betRec.n === 1, JSON.stringify(a.betRec));
ok('b\'s record: +$500', b.betRec?.net === 500);
ok('c\'s record: −$200', c.betRec?.net === -200);
let aw = bets.award();
ok('Best gambler: P1 +$1850', aw?.title === 'Best gambler' && aw.name === 'P1' && /\+\$1850/.test(aw.value), JSON.stringify(aw));

// ---- a new round; a round decided in freeze time calls the bets off
bets.onRoundStart();
ok('betRound broadcast', bc.at(-1)?.t === 'betRound');
game.phase = 'freeze'; game.roundStartAt = 100000; T = 101000;
c.alive = true; c.money = 5000;
bets.place(c, { target: 'k2', stake: 1500 });
ok('round 2: c bets $1500', c.money === 3500);
game.phase = 'end'; bc.length = 0;
bets.onRoundEnd(); await tick();
const v = bc.find(m => m.t === 'betEnd')?.list[0];
ok('decided in freeze time: called off, $1500 back', v?.void && v.paid === 1500 && c.money === 5000, JSON.stringify(v));
ok('…and it isn\'t in the record', c.betRec.n === 1);

// a leftover bet (the round never ended: map change) is dropped at the next round start, no refund
bets.onRoundStart(); game.phase = 'freeze'; game.roundStartAt = 200000; T = 200500;
bets.place(c, { target: 'k1', stake: 200 });
bets.onRoundStart();
ok('a leftover bet is dropped at the next round start', bets.bets.size === 0);

// a new match: records start again
bets.onMatchStart();
ok('new match: no records, no award', !a.betRec && bets.award() === null);

// the odds table
ok('odds: 1 kill ×1.5, 2 kills ×3, 3+ kills ×5, survive ×2', BET.targets.map(t => t.odds).join() === '1.5,3,5,2');
ok('payout rounding', betPayout(300, 'k1') === 450 && betPayout(1100, 'k1') === 1650);

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
