// The end-of-match summary gets a "Best gambler" award. Server:  up.ps1 BOTS=0 START_MONEY=5000 ROUNDS_TO_WIN=1
// Rufat (T) bets $1000 on surviving, kills Carl (CT): the match is over; matchEnd's awards name Rufat, +$1000.
process.env.GAME_PORT ||= '4080';
const { player, sleep } = await import('../mansion/client.mjs');
let fails = 0;
const ok = (what, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
const waitFor = async (c, pred, ms = 15000) => { for (let i = 0; i < ms / 50; i++) { const m = c.log.find(pred); if (m) return m; await sleep(50); } return null; };
const rufat = await player('Rufat', 'T'), carl = await player('Carl', 'CT');
ok('round 1', !!(await waitFor(rufat, m => m.t === 'round' && m.n === 1, 20000)));
await sleep(300);
rufat.send({ t: 'betPlace', target: 'live', stake: 1000 });
ok('bet placed', !!(await waitFor(rufat, m => m.t === 'betOk', 3000)));
rufat.send({ t: 'buy', item: 'deagle' });
await sleep(3300);
rufat.at([0, 0, 40], 0); carl.at([0, 0, 37], Math.PI);
await sleep(400);
for (let i = 0; i < 4 && carl.alive; i++) { rufat.send({ t: 'shoot', o: [0, 1.62, 40], d: [0, 0, -1], w: 'deagle' }); await sleep(700); }
const end = await waitFor(carl, m => m.t === 'betEnd', 4000);
ok('won $2000', end?.list[0]?.won && end.list[0].pay === 2000, JSON.stringify(end?.list));
const me = await waitFor(carl, m => m.t === 'matchEnd', 6000);
const aw = me?.awards?.find(a => a.title === 'Best gambler');
ok('matchEnd: Best gambler is Rufat, +$1000', aw?.name === 'Rufat' && aw.team === 'T' && /^\+\$1000 · 1 of 1 bet won$/.test(aw.value), JSON.stringify(me?.awards));
rufat.close(); carl.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
