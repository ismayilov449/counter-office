// Bots play for SECS seconds (default 60) around one scripted player who bets $200 on 1 kill every round he can.
// Server:  up.ps1 BOTS=4   Checks: only he ever bets (bots don't), each bet he places is settled, the server stays up.
process.env.GAME_PORT ||= '4080';
const { player, sleep } = await import('../mansion/client.mjs');
const SECS = +(process.env.SECS || 60);
let fails = 0;
const ok = (what, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
const me = await player('Rufat', 'T');
const placed = [], news = [], ends = [];
me.on.round = () => setTimeout(() => me.send({ t: 'betPlace', target: 'k1', stake: 200 }), 500);
me.on.betOk = m => placed.push(m);
me.on.betNew = m => news.push(m);
me.on.betEnd = m => ends.push(...m.list);
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) await sleep(1000);
await sleep(200);
const rounds = me.log.filter(m => m.t === 'round').length, roster = me.log.filter(m => m.t === 'roster').at(-1)?.list || [];
console.log(`${SECS} s: ${rounds} rounds, ${roster.length} on the roster (${roster.filter(p => /^BOT/.test(p.name)).length} bots), ${placed.length} bets placed, ${ends.length} settled: ${ends.map(r => r.won ? `won $${r.paid}` : 'lost').join(', ')}`);
ok('bots were playing', roster.some(p => /^BOT/.test(p.name)));
ok('only Rufat bet (no bot did)', news.length > 0 && news.every(m => m.name === 'Rufat'), news.map(m => m.name).join());
ok('every bet but the last open one was settled', ends.length >= placed.length - 1 && ends.every(r => r.name === 'Rufat'), `${placed.length} placed, ${ends.length} settled`);
me.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
