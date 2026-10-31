// The lift, server side (Mansion; test server on GAME_PORT with BOTS=0 START_MONEY=16000, see server.sh). A CT ("Rider")
// and a T ("Cutter"), round 1. The scripted players ride it the way a browser does (their height follows the cabin's,
// worked out from the 'elevState' message and the server's clock).
//   - it starts on the ground floor, doors shut; the call button opens them; a button inside sends it upstairs; the
//     doors shut first, it rides at 1 m/s, dings and opens at the top; the snapshot shows the rider going up with it
//   - someone in the doorway keeps the doors open
//   - the blackout stops it between floors; no buttons; the doors can't be pried that far from a floor; the roof hatch
//     puts the rider on the roof; from there he pries the upper landing's doors and climbs out; power back: it carries
//     on to the cellar
//   - a dropped pistol, a mine and a satchel stuck to its wall ride along; the satchel goes off in it: no harm to the lift
//   - nobody in the shaft is crushed: it won't go down onto someone below it, nor up with someone on its roof
//   - a restart puts it back on the ground floor with the doors shut
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, sleep, admin } from '../mansion/client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { motionAt, doorAt, roofAt, inCabin, ELEV } = await G('shared/elevator.js');
const MAP = MAPS[process.env.MAP || 'cs_mansion'], E = MAP.elevator, S = E.stops;
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const doorX = (E.door.x1 + E.door.x2) / 2, mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];
const LANDING_Z = E.out.z2 + 0.8, landingY = s => (s === 1 ? 0.91 : S[s]); // (the living room's floor is 0.91 to walk on)

const a = await player('Rider', 'CT'), b = await player('Cutter', 'T');
const AID = a.log.find(m => m.t === 'welcome')?.id;
for (const c of [a, b]) {
  c.off = 0;
  c.on.s = m => { c.off = m.time - Date.now(); c.snap = m; if (m.dr) c.dr = m.dr; };
  c.on.elevState = m => { c.el = m; };
  c.on.elevTo = m => { c.p = m.p.slice(); c.ride = null; };
}
const sNow = c => Date.now() + c.off;
const motion = c => ({ y0: c.el.m[0], y1: c.el.m[1], t0: c.el.m[2], tb: c.el.m[3] });
const cabY = (c = a) => motionAt(motion(c), sNow(c)).y;
const moving = (c = a) => motionAt(motion(c), sNow(c)).moving;
const door = (k, c = a) => doorAt(c.el.d[k], sNow(c));
// E on something: what the browser would say it aims at, then the key
const press = async (c, aim, hold = 80) => { c.send({ t: 'elevAim', a: aim }); await sleep(40); c.use(true); await sleep(hold); c.use(false); await sleep(60); };
// riding: every 30 ms, stand on the cabin's floor (or roof) where it is now, like a browser
setInterval(() => {
  for (const c of [a, b]) {
    if (!c.ride || !c.el || !c.alive) continue;
    const y = cabY(c) + (c.ride.roof ? E.cabin.ceil + E.cabin.roof : 0);
    c.at([c.ride.x, y, c.ride.z], c.yaw, 0, c.ride.roof ? 1 : 0);
  }
}, 30);
const until = async (cond, ms = 15000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(50); return cond(); };

for (let i = 0; i < 150 && !b.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
ok('round 1 started', b.got('msg').some(m => /Guard the hostages/.test(m.text)));
a.send({ t: 'buy', item: 'pmn' });
b.send({ t: 'buy', item: 'satchel' });
await sleep(3400); // the freeze time

// ---- the start: ground floor, shut; call it, in, upstairs
ok(`the cabin starts on the ground floor, doors shut (y ${cabY().toFixed(3)})`, Math.abs(cabY() - S[1]) < 1e-6 && [0, 1, 2, 3].every(k => door(k) === 0));
a.yaw = 0;
a.at([doorX + 0.2, landingY(1), LANDING_Z], 0); await sleep(200);
a.clear();
await press(a, 'c1');
await sleep(1100);
ok(`the call button opens its doors and the cabin's (${door(0).toFixed(2)}, ${door(2).toFixed(2)})`, door(0) === 1 && door(2) === 1 && door(1) === 0 && door(3) === 0);
ok('the doors\' sound', a.got('elevSfx').some(m => m.s === 'doors'));
a.at([mid[0], S[1], mid[1]], 0); a.ride = { x: mid[0], z: mid[1] };
await sleep(300);
let rows = [];
b.on.s = m => { b.off = m.time - Date.now(); if (m.dr) b.dr = m.dr; const r = m.pl.find(q => q[0] === AID); if (r) rows.push({ y: r[2], cab: cabY(b) }); };
a.clear();
const t0 = Date.now();
await press(a, 'b2');
ok('the button inside lights up (it\'s queued)', a.el.q.includes(2));
await until(() => moving(), 6000);
const startedAfter = (Date.now() - t0) / 1000;
ok(`the doors shut first, then it sets off (${startedAfter.toFixed(1)} s)`, door(0) === 0 && door(2) === 0 && startedAfter > 2 && startedAfter < 3.5);
await sleep(2000);
const mid1 = cabY();
ok(`half way up after 2 s (y ${mid1.toFixed(2)})`, mid1 > S[1] + 1.2 && mid1 < S[1] + 1.8);
await until(() => !moving(), 6000);
const rideSecs = (Date.now() - t0) / 1000 - startedAfter;
ok(`upstairs in ${rideSecs.toFixed(1)} s (3.45 m at 1 m/s + speeding up and slowing down)`, Math.abs(cabY() - S[2]) < 1e-3 && rideSecs > 4 && rideSecs < 5.2);
await sleep(300);
ok('a ding, and the doors open at the top', a.got('elevSfx').some(m => m.s === 'ding') && a.el.d[0][1] === 1 && a.el.d[3][1] === 1);
const riding = rows.filter(r => r.cab > S[1] + 0.3 && r.cab < S[2] - 0.3);
ok(`the snapshot shows the rider going up with it (${riding.length} rows, off by ${Math.max(...riding.map(r => Math.abs(r.y - r.cab))).toFixed(2)} m at most)`, riding.length > 50 && riding.every(r => Math.abs(r.y - r.cab) < 0.15));
b.on.s = m => { b.off = m.time - Date.now(); b.snap = m; if (m.dr) b.dr = m.dr; };

// ---- someone in the doorway keeps the doors open
a.ride = null;
a.at([doorX, S[2], E.cabin.z2 + 0.03], 0);
await sleep(6500);
ok(`standing in the doorway keeps them open (${door(0).toFixed(2)})`, door(0) === 1 && door(3) === 1);
a.at([mid[0], S[2], mid[1]], 0); a.ride = { x: mid[0], z: mid[1] };
await until(() => door(0) === 0, 3500);
ok('stepping in, they shut', door(0) === 0 && door(3) === 0);

// ---- the blackout half way down: stuck between floors, the hatch, out through the upper landing; power back
b.at([-18.3, S[0], -4.6], 0); await sleep(150);
b.clear();
b.use(true);
await sleep(600);
a.clear();
await press(a, 'b0');
await until(() => b.got('lights').some(m => m.power === 'off'), 4500);
b.use(false);
ok('the T cut the power', b.got('lights').some(m => m.power === 'off'));
await sleep(200);
ok('the cabin brakes (with a screech)', !!a.el.m[3] && a.got('elevSfx').some(m => m.s === 'brake'));
await until(() => !moving(), 2000);
const stuckY = cabY();
ok(`stuck between floors at ${stuckY.toFixed(2)}`, stuckY > S[1] + 1 && stuckY < S[2] - 1);
a.clear();
await press(a, 'b1');
ok('no buttons without power', a.got('msg').some(m => /No power/.test(m.text)) && Math.abs(cabY() - stuckY) < 1e-6);
a.clear();
await press(a, 'f', 300);
ok('the doors can\'t be pried that far from a floor', a.got('msg').some(m => /Too far from a floor/.test(m.text)) && !a.snap?.me);
a.clear();
await press(a, 'h');
await sleep(200);
ok(`the hatch: on the roof (${a.p.map(v => v.toFixed(2))})`, a.el.h === 1 && Math.abs(a.p[1] - roofAt(E, stuckY)) < 0.01 && a.got('elevSfx').some(m => m.s === 'hatch'));
a.ride = { x: a.p[0], z: a.p[2], roof: true };
await sleep(200);
a.clear();
a.send({ t: 'elevAim', a: 'l2' }); await sleep(40);
a.use(true);
await sleep(400);
ok('prying the upper landing\'s doors from the roof: a loud grind, a progress bar', a.got('elevSfx').some(m => m.s === 'pry') && a.snap?.me?.a === 'elevforce');
await sleep(ELEV.force * 1000);
a.use(false);
await sleep(ELEV.forced * 1000 + 200);
ok(`they give (${door(3).toFixed(2)})`, a.got('elevSfx').some(m => m.s === 'forced') && door(3) === 1 && door(0) === 0);
await press(a, 'l2');
await sleep(200);
ok(`E again climbs out onto the upper floor (${a.p.map(v => v.toFixed(2))})`, a.ride === null && a.p[2] > E.out.z2 && Math.abs(a.p[1] - S[2]) < 0.05);
// the CT brings the power back: the pried doors shut, the cabin goes on down to the cellar
a.at([-18.3, S[0], -4.6], 0); await sleep(150);
a.clear();
a.use(true);
await until(() => a.got('lights').some(m => m.power === 'on'), 6500);
a.use(false);
ok('the CT brought the power back', a.got('lights').some(m => m.power === 'on'));
await until(() => door(3) === 0, 4000);
ok('the pried doors shut again', door(3) === 0);
await until(() => moving(), 3000);
await until(() => !moving() && Math.abs(cabY() - S[0]) < 1e-3, 8000);
ok(`power back: it carries on to the cellar (${cabY().toFixed(2)})`, Math.abs(cabY() - S[0]) < 1e-3);
await sleep(1200);
ok('and opens there', door(0) === 1 && door(1) === 1);

// ---- things ride along: a pistol thrown in, a mine laid in it, a satchel stuck to its back wall
a.at([mid[0], S[0], mid[1]], 0); a.ride = { x: mid[0], z: mid[1] };
await sleep(200);
a.send({ t: 'mine', k: 'pmn', p: [mid[0] + 0.3, S[0] + 0.05, mid[1] + 0.3], yaw: 0 });
await sleep(300);
b.at([doorX, S[0], LANDING_Z - 0.3], 0); await sleep(150);
b.send({ t: 'drop', w: 'glock' }); // (thrown in from the landing: the CT in there has a pistol, so he won't pick it up)
await sleep(150);
const eye = [doorX, S[0] + 1.62, LANDING_Z - 0.3], wall = [mid[0] - 0.3, S[0] + 1.2, E.cabin.z1 + E.cabin.wall], dv = wall.map((v, k) => v - eye[k]), dl = Math.hypot(...dv);
b.clear();
b.send({ t: 'satchel', o: eye, v: dv.map(v => (v / dl) * 9) });
await sleep(800);
const drop = () => (b.dr || []).find(d => d[1] === 'glock');
const mineRow = () => (a.got('mines').at(-1)?.list || [])[0];
const sat = () => (b.got('satchels').at(-1)?.list || [])[0];
const satBefore = sat()?.[5];
ok(`in the cabin: the pistol (y ${drop()?.[3]}), the mine (y ${mineRow()?.[4]}), the satchel (y ${sat()?.[5]})`, drop() && Math.abs(drop()[3] - S[0]) < 0.05 && mineRow() && Math.abs(mineRow()[4] - S[0]) < 0.1 && sat());
ok(`the mine and the satchel are listed as riding (${JSON.stringify([a.el.rm, a.el.rs])})`, a.el.rm.length === 1 && a.el.rs.length === 1);
a.clear();
await press(a, 'b1');
await until(() => moving(), 4000);
await until(() => !moving(), 8000);
await sleep(400);
ok(`at the ground floor (${cabY().toFixed(3)}) the pistol (y ${drop()?.[3]}), the mine (y ${mineRow()?.[4]}) and the satchel (y ${sat()?.[5]}) are there too`,
  Math.abs(cabY() - S[1]) < 1e-3 && Math.abs(drop()?.[3] - S[1]) < 0.05 && Math.abs(mineRow()?.[4] - S[1]) < 0.1 && Math.abs(sat()?.[5] - satBefore - (S[1] - S[0])) < 0.02);
// the satchel goes off in the cabin (the CT steps out first): the lift is unharmed and still works
a.ride = null;
a.at([doorX + 3, landingY(1), LANDING_Z + 5], 0);
await sleep(300);
b.send({ t: 'satchel', det: 1 });
await sleep(400);
ok('the satchel went off', b.got('boom').some(m => m.k === 'satchel'));
a.clear();
a.at([doorX + 0.2, landingY(1), LANDING_Z], 0); await sleep(150);
await sleep(4500); // (the doors shut by themselves first)
await press(a, 'c1');
await sleep(1200);
ok('the lift still works after the blast (it opens to the call)', door(0) === 1);

// ---- nobody in the shaft is crushed
// someone on the ladder under the cabin: it won't go down to the cellar
b.at([E.ladder.x + 0.5, -1.0, (E.ladder.z1 + E.ladder.z2) / 2], 0); await sleep(200);
a.at([mid[0], S[1], mid[1]], 0); a.ride = { x: mid[0], z: mid[1] };
await sleep(200);
await press(a, 'b0');
await sleep(4500);
ok(`someone in the shaft below: it stays put (y ${cabY().toFixed(2)}, ${moving() ? 'moving' : 'still'})`, Math.abs(cabY() - S[1]) < 1e-3 && !moving());
b.at([doorX, S[0], LANDING_Z], 0); // he climbs down and out
await until(() => moving(), 4000);
await until(() => !moving(), 8000);
ok(`once he's out of the way it goes down (${cabY().toFixed(2)})`, Math.abs(cabY() - S[0]) < 1e-3);
// someone on its roof: it won't go upstairs (no room at the top)
await sleep(5000);
a.ride = null;
a.at([doorX, landingY(1), LANDING_Z + 1.5], 0);
b.ride = { x: E.ladder.x + 0.9, z: -4.0, roof: true };
await sleep(300);
a.at([doorX + 0.2, S[2], LANDING_Z], 0); await sleep(150);
await press(a, 'c2');
await sleep(5000);
ok(`someone on the roof: it won't go up to the top floor (y ${cabY().toFixed(2)})`, cabY() < S[2] - 0.5);
b.ride = null;
b.at([doorX, S[0], LANDING_Z], 0);
await until(() => Math.abs(cabY() - S[2]) < 1e-3, 15000);
ok(`off the roof: it goes up (${cabY().toFixed(2)})`, Math.abs(cabY() - S[2]) < 1e-3);

// ---- a restart: back on the ground floor, shut
a.clear();
await admin({ action: 'restart' });
await until(() => a.got('elevState').length && Math.abs(cabY() - S[1]) < 1e-6, 6000);
ok(`after a restart: ground floor, doors shut, hatch shut, no calls`, Math.abs(cabY() - S[1]) < 1e-6 && [0, 1, 2, 3].every(k => door(k) === 0) && a.el.h === 0 && a.el.q.length === 0);

a.close(); b.close();
process.exit(process.exitCode || 0);
