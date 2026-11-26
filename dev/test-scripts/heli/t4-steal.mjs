// The helicopter stolen, the server's part. Fresh test server: GAME_PORT=3995 MAP=cs_mansion BOTS=0 FREEZE_TIME=1
// (no browser). Bob (T) steals it: everyone is told; Alice (CT) can't get in; Bob flies it up high for a long time and
// the round goes on (the helicopter never wins a round); the CTs' bullets hurt it while the Terrorists have it.
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
ok('everyone is told it was stolen', told.a.some(t => /stole the helicopter/.test(t)));
await sleep(200);
ok(`the snapshot says the Terrorists have it (${hl()?.[10]})`, hl()?.[10] === 1);
alice.at([H.p[0], 0, H.p[2] - 2.2], 0, 0);
await sleep(200);
await use(alice);
ok('Alice can\'t get in', told.a.some(t => /Terrorists have it/.test(t)) && !got(alice, 'heliIn').length);
let at = H.p.slice(), yaw = H.yaw;
const fly = async (y, secs) => { const y0 = at[1], n = Math.round(secs * 20); for (let i = 1; i <= n; i++) { at = [at[0], y0 + ((y - y0) * i) / n, at[2]]; bob.send({ t: 'heli', p: at, yaw, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }); await sleep(50); } };
await fly(11.5, 3);
// up high for a long time: nothing ends the round (the helicopter never wins it)
const hold = setInterval(() => bob.send({ t: 'heli', p: at, yaw, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }), 50);
await sleep(12000);
ok('kept up high for 12 s: the round goes on', alice.snap?.ph === 'live' && !got(alice, 'roundEnd').length);
// Alice shoots it
alice.w = alice.me?.inv?.secondary?.id || 'usp';
alice.at([H.p[0], 0, H.p[2] - 6], 0, 0);
await sleep(200);
const hp0 = hl()[7];
for (let i = 0; i < 6; i++) { const o = alice.eye(), aim = [H.p[0] + 0.9, at[1] + 0.6, H.p[2]], d = aim.map((v, k) => v - o[k]), l = Math.hypot(...d); alice.send({ t: 'shoot', o, d: d.map(v => v / l), w: alice.w, rt: 0 }); await sleep(250); }
ok(`the CTs' bullets hurt the stolen helicopter (${hp0}% -> ${hl()[7]}%)`, hl()[7] < hp0);
clearInterval(hold);
process.exit();
