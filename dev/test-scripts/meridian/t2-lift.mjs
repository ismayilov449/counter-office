// cs_meridian's lift, live. Fresh test server: GAME_PORT=3995 MAP=cs_meridian BOTS=0 FREEZE_TIME=1 (no browser).
// The cabin waits in the lobby with every door shut (five door sets: the cabin's and four landings'); the lobby's call
// button opens it; inside, the penthouse button takes it up 11.9 m with the rider; at the top only the penthouse's
// landing opens. Then a call from the 3rd floor brings it down there, and the lobby button takes it back to the lobby.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, sleep } from '../mansion/client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { motionAt, doorAt } = await G('shared/elevator.js');
const E = MAPS.cs_meridian.elevator, S = E.stops;
let fails = 0;
const ok = (what, c) => { console.log((c ? 'OK   ' : 'FAIL ') + what); if (!c) fails++; };
const doorX = (E.door.x1 + E.door.x2) / 2, mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1], LZ = E.out.z2 + 0.8;
const a = await player('Rider', 'CT'), b = await player('Other', 'T');
for (const c of [a, b]) { c.off = 0; c.on.s = m => { c.off = m.time - Date.now(); }; c.on.elevState = m => { c.el = m; }; c.on.elevTo = m => { c.p = m.p.slice(); c.ride = null; }; }
const sNow = () => Date.now() + a.off, mo = () => ({ y0: a.el.m[0], y1: a.el.m[1], t0: a.el.m[2], tb: a.el.m[3] });
const cabY = () => motionAt(mo(), sNow()).y, moving = () => motionAt(mo(), sNow()).moving, door = k => doorAt(a.el.d[k], sNow());
const press = async aim => { a.send({ t: 'elevAim', a: aim }); await sleep(40); a.use(true); await sleep(80); a.use(false); await sleep(60); };
const until = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(50); return cond(); };
setInterval(() => { if (a.ride && a.el && a.alive) a.at([a.ride.x, cabY(), a.ride.z], a.yaw, 0, 0); }, 30);
for (let i = 0; i < 150 && !a.el; i++) await sleep(100);
await sleep(2500);
ok(`${a.el?.d?.length} door sets (the cabin's + 4 landings)`, a.el?.d?.length === 5);
ok(`the cabin waits in the lobby, doors shut (y ${cabY().toFixed(2)})`, Math.abs(cabY() - S[0]) < 1e-6 && a.el.d.every((_, k) => door(k) === 0));
a.at([doorX + 0.2, S[0], LZ], 0); await sleep(300);
await press('c0'); await sleep(1200);
ok(`the lobby's call button opens the lobby's doors and the cabin's (${door(0)}, ${door(1)})`, door(0) === 1 && door(1) === 1 && door(4) === 0);
a.at([mid[0], S[0], mid[1]], 0); a.ride = { x: mid[0], z: mid[1] }; await sleep(300);
await press('b3');
ok('the penthouse button is queued', a.el.q.includes(3));

ok('it sets off', await until(() => moving(), 6000));
ok(`it reaches the penthouse (y ${cabY().toFixed(2)})`, await until(() => !moving() && Math.abs(cabY() - S[3]) < 0.01, 25000));
await sleep(1300);
ok(`only the penthouse's landing opens (${a.el.d.map((_, k) => door(k).toFixed(0)).join(' ')})`, door(0) === 1 && door(4) === 1 && door(1) === 0 && door(2) === 0 && door(3) === 0);
await sleep(500);
ok(`the rider went up with it (y ${a.p?.[1]?.toFixed(2)})`, Math.abs((a.p?.[1] ?? 0) - S[3]) < 0.3);
// step out onto the penthouse, then call it from the 3rd floor and ride it down to the lobby
a.ride = null; a.at([doorX, S[3], LZ], 0); await sleep(3500);
a.at([doorX + 0.2, S[2], LZ], 0); await sleep(300);
await press('c2');
ok(`a call from the 3rd floor brings it down there (y ${cabY().toFixed(2)})`, await until(() => !moving() && Math.abs(cabY() - S[2]) < 0.01 && door(3) === 1, 15000));
a.at([mid[0], S[2], mid[1]], 0); a.ride = { x: mid[0], z: mid[1] }; await sleep(300);
await press('b0');
ok(`and the lobby button takes it back down (y ${cabY().toFixed(2)})`, await until(() => !moving() && Math.abs(cabY() - S[0]) < 0.01 && door(1) === 1, 25000));
console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
