// The helicopter stolen (the Terrorists' way out), the server's part. Fresh test server: GAME_PORT=3995 MAP=cs_mansion
// BOTS=0 FREEZE_TIME=1 (no browser). Bob (T) steals it, Alice (CT) tries to stop him.
// Bob gets in: everyone is told; Alice can't get in (the Terrorists have it). Bob flies it up past the escape height:
// the clock runs; Alice's bullets hurt it now (CTs' bullets didn't while it was theirs); Bob drops below it: the clock
// stops; back up and kept there: the Terrorists win the round.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { HELI } from '../../../shared/heli.js';
const ok = checker();
const H = MAPS.cs_mansion.heli, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const told = { a: [], b: [] };
alice.on.msg = m => told.a.push(m.text);
bob.on.msg = m => told.b.push(m.text);
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
await sleep(300);
const use = async (p, ms = 100) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(200); };
const hl = () => alice.snap?.hl;
bob.at([H.p[0], 0, H.p[2] + 2.2], 0, 0);
await sleep(200);
await use(bob);
ok('Bob gets in, the pilot', got(bob, 'heliIn').at(-1)?.seat === 0);
ok('everyone is told it is being stolen', told.a.some(t => /stealing the helicopter/.test(t)));
await sleep(200);
ok(`the snapshot says the Terrorists have it (${hl()?.[10]})`, hl()?.[10] === 1);
alice.at([H.p[0], 0, H.p[2] - 2.2], 0, 0);
await sleep(200);
await use(alice);
ok('Alice can\'t get in', told.a.some(t => /Terrorists have it/.test(t)) && !got(alice, 'heliIn').length);
let at = H.p.slice(), yaw = H.yaw;
const fly = async (y, secs) => { const y0 = at[1], n = Math.round(secs * 20); for (let i = 1; i <= n; i++) { at = [at[0], y0 + ((y - y0) * i) / n, at[2]]; bob.send({ t: 'heli', p: at, yaw, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }); await sleep(50); } };
await fly(HELI.escape + 0.5, 3);
await fly(HELI.escape + 0.5, 2.5);
ok(`up high the clock runs (${hl()?.[11]} s left)`, hl()?.[11] > 0 && hl()?.[11] < HELI.escapeTime);
ok('everyone sees the countdown', told.a.some(t => /GETTING AWAY: \d/.test(t)));
// Alice shoots it
alice.w = alice.me?.inv?.secondary?.id || 'usp';
alice.at([H.p[0], 0, H.p[2] - 6], 0, 0);
await sleep(200);
const hp0 = hl()[7];
for (let i = 0; i < 6; i++) { const o = alice.eye(), aim = [H.p[0], at[1] + 0.6, H.p[2] - 1.45], d = aim.map((v, k) => v - o[k]), l = Math.hypot(...d); alice.send({ t: 'shoot', o, d: d.map(v => v / l), w: alice.w, rt: 0 }); bob.send({ t: 'heli', p: at, yaw: 0, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }); await sleep(250); }
ok(`now the CTs' bullets hurt it (${hp0}% -> ${hl()[7]}%)`, hl()[7] < hp0);
// down below the escape height: the clock stops
await fly(HELI.escape - 2, 1);
await sleep(200);
ok('dropped below it: the clock stops', told.a.some(t => /didn't get away/.test(t)) && !hl()[11]);
ok('the round goes on', alice.snap?.ph === 'live');
// back up and kept there
await fly(HELI.escape + 0.5, 1);
const hold = setInterval(() => bob.send({ t: 'heli', p: at, yaw: 0, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }), 50);
ok('kept up there: the Terrorists get away and win', await until(() => got(alice, 'roundEnd').some(m => m.winner === 'T' && /helicopter/.test(m.reason)), (HELI.escapeTime + 2) * 1000));
clearInterval(hold);
process.exit();
