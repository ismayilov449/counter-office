// Bets against the real server, over WebSocket (scripted players, no browser). Needs the test server on GAME_PORT
// (default 4080) on the Mansion with:  up.ps1 BOTS=0 START_MONEY=10000 FRIENDLY_FIRE=1 BUY_TIME=8 MAP=cs_mansion
// (the fight in the street east of the house; whoever isn't in it waits in the garden or on the lawn)
//   warmup: refused. Round 1 (freeze): Rufat (T) bets $2000 on 3 kills, Tina (T) $500 on surviving, Carl (CT) $200
//   on 1 kill, Cora (CT) $300 on surviving; refusals: twice, a bad stake, a bad target. Rufat kills the 3 CTs with a
//   Desert Eagle: his tracker goes 1, 2, 3; Cora's says dead; the round ends: Rufat wins $10000 (capped), Tina $1000,
//   Carl and Cora lose. Round 2: Rufat bets on 2 kills and kills his teammate Tina (doesn't count); after buy time a
//   bet is refused; Carl (1 kill) kills Rufat; CTs win: Rufat loses, Carl wins $600, Cora (survive) wins $600.
//   Then Deathmatch: refused.      GAME_PORT=4080 node dev/test-scripts/bet/tws.mjs
process.env.GAME_PORT ||= '4080';
const { player, admin, sleep } = await import('../mansion/client.mjs');
let fails = 0;
const ok = (what, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
const waitFor = async (c, pred, ms = 15000) => { for (let i = 0; i < ms / 50; i++) { const m = c.log.find(pred); if (m) return m; await sleep(50); } return null; };
const answer = async (c, m) => { c.clear(); c.send({ t: 'betPlace', ...m }); return waitFor(c, x => x.t === 'betOk' || x.t === 'betNo', 3000); };
const money = c => c.me?.money;
const EYE = 1.62;
const shoot = (c, target, w) => {
  const o = [c.p[0], c.p[1] + EYE, c.p[2]], aim = [target.p[0], target.p[1] + EYE, target.p[2]];
  const d = aim.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w });
};

const rufat = await player('Rufat', 'T');
await sleep(500);
let r = await answer(rufat, { target: 'k1', stake: 500 });
ok('warmup: refused', r?.t === 'betNo' && /warmup/.test(r.why), r?.why);

// (joined in turns: auto team balance won't let a team get two ahead)
const carl = await player('Carl', 'CT'), tina = await player('Tina', 'T'), cora = await player('Cora', 'CT'), cid = await player('Cid', 'CT');
const all = [rufat, tina, carl, cora, cid];
ok('teams: Rufat, Tina T; Carl, Cora, Cid CT', all.map(c => c.me?.team).join() === 'T,T,CT,CT,CT', all.map(c => c.me?.team).join());
all.forEach(c => { c.clear(); c.news = []; c.on.betNew = m => c.news.push(m); });
const round = async n => { for (const c of all) if (!(await waitFor(c, m => m.t === 'round' && m.n === n, 20000))) return false; return true; };
ok('round 1 starts', await round(1));
await sleep(300);

// ---- round 1, freeze time: the bets
r = await answer(rufat, { target: 'k3', stake: 2000 });
ok('Rufat: $2000 on 3 kills accepted, pays $10000', r?.t === 'betOk' && r.pay === 10000, JSON.stringify(r));
await sleep(200);
ok('Rufat: the stake is taken ($8000)', money(rufat) === 8000, `$${money(rufat)}`);
r = await answer(rufat, { target: 'k1', stake: 200 });
ok('Rufat again: refused', r?.t === 'betNo' && /already/.test(r.why), r?.why);
ok('Tina: $500 on surviving', (await answer(tina, { target: 'live', stake: 500 }))?.t === 'betOk');
ok('Carl: $200 on 1 kill', (await answer(carl, { target: 'k1', stake: 200 }))?.t === 'betOk');
ok('Cora: $300 on surviving', (await answer(cora, { target: 'live', stake: 300 }))?.t === 'betOk');
r = await answer(cid, { target: 'k2', stake: 99999 });
ok('Cid: $99999 refused', r?.t === 'betNo' && /between/.test(r.why), r?.why);
r = await answer(cid, { target: 'jackpot', stake: 500 });
ok('Cid: a made-up target refused', r?.t === 'betNo', r?.why);
await sleep(300);
ok('everyone sees the 4 bets', all.every(c => c.news.length === 4), all.map(c => c.news.length).join());
const n0 = rufat.news[0];
ok('betNew: "Rufat bets $2000 on 3 kills"', n0?.name === 'Rufat' && n0.team === 'T' && n0.stake === 2000 && n0.target === 'k3', JSON.stringify(n0));
rufat.send({ t: 'buy', item: 'deagle' }); await sleep(300);
ok('Rufat bought a Desert Eagle', rufat.me?.inv?.secondary?.id === 'deagle', JSON.stringify(rufat.me?.inv?.secondary));

// ---- live: Rufat kills the three CTs, 3 m in front of him
await sleep(3200); // freeze time (3 s) runs out
rufat.at([19, 0, -8], 0); for (const c of [carl, cora, cid]) c.at([19, 0, -11], Math.PI);
tina.at([2, 0, 9], 0);
await sleep(400);
rufat.clear(); cora.clear();
for (const target of [carl, cora, cid]) {
  for (let i = 0; i < 4 && target.alive; i++) { shoot(rufat, target, 'deagle'); await sleep(700); }
}
ok('the three CTs are dead', !carl.alive && !cora.alive && !cid.alive, [carl, cora, cid].map(c => c.alive).join());
if (process.env.DEBUG) console.log(tina.log.filter(m => m.t === 'kill' || m.t === 'roundEnd').map(m => JSON.stringify({ t: m.t, k: m.k, v: m.v, w: m.w, reason: m.reason })).join('\n'), all.map(c => c.me?.team + c.p).join(' | '));
const tracks = rufat.got('betTrack').map(m => m.k);
ok('Rufat\'s tracker: 1, 2, 3', tracks.join() === '1,2,3', tracks.join());
ok('Cora\'s tracker: dead', cora.got('betTrack').some(m => m.alive === false));
const end1 = await waitFor(cid, m => m.t === 'betEnd', 4000);
const res = name => end1?.list.find(x => x.name === name);
ok('betEnd: 4 results', end1?.list.length === 4, JSON.stringify(end1?.list));
await sleep(300);
const rr = res('Rufat');
ok(`Rufat won $10000, $${rr?.paid} of it fit under the cap, money $${money(rufat)}`, rr?.won && rr.pay === 10000 && money(rufat) === 16000 && rr.paid < 10000);
ok('Tina won $1000', res('Tina')?.won && res('Tina').paid === 1000);
ok('Carl lost (0 kills)', res('Carl') && !res('Carl').won);
ok('Cora lost (killed)', res('Cora') && !res('Cora').won);
const roundEnd = cid.log.findIndex(m => m.t === 'roundEnd'), betEnd = cid.log.findIndex(m => m.t === 'betEnd');
ok('betEnd comes after roundEnd', roundEnd >= 0 && betEnd > roundEnd);

// ---- round 2
all.forEach(c => c.clear());
ok('round 2 starts', await round(2));
ok('betRound sent', rufat.log.some(m => m.t === 'betRound'));
ok('Rufat: $1000 on 2 kills', (await answer(rufat, { target: 'k2', stake: 1000 }))?.t === 'betOk');
ok('Carl: $400 on 1 kill', (await answer(carl, { target: 'k1', stake: 400 }))?.t === 'betOk');
ok('Cora: $300 on surviving', (await answer(cora, { target: 'live', stake: 300 }))?.t === 'betOk');
carl.send({ t: 'buy', item: 'deagle' }); await sleep(300);
ok('Carl bought a Desert Eagle', carl.me?.inv?.secondary?.id === 'deagle');
const rnd2 = Date.now();
await sleep(3300);
rufat.at([19, 0, -8], 0); tina.at([17, 0, -8], 0); carl.at([19, 0, -11], Math.PI); cora.at([-37.5, 0, 4], 0); cid.at([-37.5, 0, -2], 0);
await sleep(400);
rufat.clear();
for (let i = 0; i < 4 && tina.alive; i++) { shoot(rufat, tina, 'deagle'); await sleep(700); }
ok('Rufat killed his teammate Tina', !tina.alive);
ok('…which doesn\'t count for his bet (no tracker update)', !rufat.got('betTrack').length, JSON.stringify(rufat.got('betTrack')));
// buy time is 8 s after the 3 s freeze
await sleep(Math.max(0, 11500 - (Date.now() - rnd2)));
r = await answer(cid, { target: 'k1', stake: 200 });
ok('after buy time: refused', r?.t === 'betNo' && /buy time/.test(r.why), r?.why);
carl.clear();
for (let i = 0; i < 4 && rufat.alive; i++) { shoot(carl, rufat, 'deagle'); await sleep(700); }
ok('Carl killed Rufat', !rufat.alive);
ok('Carl\'s tracker: 1', carl.got('betTrack').map(m => m.k).join() === '1');
const end2 = await waitFor(cid, m => m.t === 'betEnd', 4000);
const res2 = name => end2?.list.find(x => x.name === name);
await sleep(300);
ok('round 2: Rufat lost $1000', res2('Rufat') && !res2('Rufat').won && res2('Rufat').stake === 1000);
ok('round 2: Carl won $600', res2('Carl')?.won && res2('Carl').pay === 600);
ok('round 2: Cora survived and won $600', res2('Cora')?.won && res2('Cora').pay === 600);

// ---- Deathmatch: no bets
await admin({ action: 'settings', settings: { gameMode: 'deathmatch' } });
await sleep(1500);
r = await answer(rufat, { target: 'k1', stake: 200 });
ok('Deathmatch: refused', r?.t === 'betNo' && /classic/.test(r.why), r?.why);
await admin({ action: 'settings', settings: { gameMode: 'classic' } });

all.forEach(c => c.close());
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
