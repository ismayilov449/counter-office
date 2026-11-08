// 3.3 Cut the lift's cable, server side (Mansion; srv.sh with ROUND_TIME=600 and POWER_CATCH=0, or POWER_CATCH=1 with
// CATCH=1 here). Three CTs ("Rider", "Pit", "Spare") and two Ts ("Cutter", "Mate"), round 1. The scripted players ride the lift the
// way a browser does (their height follows the cabin's, from 'elevState' and the server's clock).
//   POWER_CATCH=0 (the brake never catches):
//     - the Rider rides up to the upper floor; the Pit stands in the shaft's pit; a CT at the winch can't cut it
//     - the Cutter climbs to the machine room and holds E on the winch (4 s): a grinder's sound, then the cable snaps
//       (everyone told); the lift says out of order (x) and falls (free fall: m[4]); the power state says cut
//     - it crashes onto the pit's buffers (-3.05) about 1.2 s later: the Rider takes the fall damage for 7.3 m, the Pit
//       is crushed (killed, credited to the Cutter); the crash sparks (gas)
//     - out of order: the call buttons say so; the lift's breaker off and on doesn't mend it
//     - a restart mends it; the Mate (a T) rides it down from the ground floor: 3.9 m, his damage, no team kill
//   POWER_CATCH=1 (it always catches): the cabin drops less than a metre and stops; nobody hurt; still out of order; the
//     Rider pries its doors open (near the upper floor) and gets out
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, sleep, admin } from '../mansion/client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { motionAt, doorAt } = await G('shared/elevator.js');
const { CABLE, crashDamage, caughtDrop } = await G('shared/power.js');
const MAP = MAPS[process.env.MAP || 'cs_mansion'], E = MAP.elevator, S = E.stops, W = MAP.power.winch;
const CATCH = !!process.env.CATCH;

const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(30); return cond(); };
const doorX = (E.door.x1 + E.door.x2) / 2, mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1], LANDING_Z = E.out.z2 + 0.8;
const WSPOT = [-19.85, W.floor, -4.47];

// (joining in turns: the server puts a newcomer on the smaller team)
const rider = await player('Rider', 'CT'), cutter = await player('Cutter', 'T'), pit = await player('Pit', 'CT'), mate = await player('Mate', 'T');
const spare = await player('Spare', 'CT'); // (stays out of it, so the round goes on)
const all = [rider, cutter, pit, mate, spare];
const idOf = c => c.log.find(m => m.t === 'welcome')?.id;
for (const c of all) {
  c.id = idOf(c);
  c.off = 0;
  c.on.s = m => { c.off = m.time - Date.now(); c.snap = m; };
  c.on.elevState = m => { c.el = m; };
  c.on.power = m => { c.pw = m; };
  c.on.elevTo = m => { c.p = m.p.slice(); c.ride = null; };
  c.pw = c.log.filter(m => m.t === 'power').pop() || null;
  c.el = c.log.filter(m => m.t === 'elevState').pop() || null;
}
const sNow = c => Date.now() + c.off;
const motion = c => ({ y0: c.el.m[0], y1: c.el.m[1], t0: c.el.m[2], tb: c.el.m[3], fall: c.el.m[4], tc: c.el.m[5] });
const cabY = (c = cutter) => motionAt(motion(c), sNow(c)).y;
const moving = (c = cutter) => motionAt(motion(c), sNow(c)).moving;
const door = (k, c = cutter) => doorAt(c.el.d[k], sNow(c));
const pressElev = async (c, aim, hold = 80) => { c.send({ t: 'elevAim', a: aim }); await sleep(40); c.use(true); await sleep(hold); c.use(false); await sleep(60); };
const pressPw = async (c, aim, hold = 120) => { c.send({ t: 'pwAim', a: aim }); await sleep(60); c.use(true); await sleep(hold); c.use(false); await sleep(120); };
// riding: every 20 ms, stand on the cabin's floor where it is now, like a browser
setInterval(() => { for (const c of all) if (c.ride && c.el && c.alive) c.at([c.ride.x, cabY(c), c.ride.z], c.yaw); }, 20);
const dmgOf = c => c.got('dmg').reduce((s, m) => s + m.d, 0);
const gone = c => all.some(o => o.got('kill').some(m => m.v === c.id)) || all.some(o => o.got('bodyDown').some(m => m.v === c.id));
const cutIt = async () => { cutter.at(WSPOT, Math.PI / 2); await sleep(200); for (const c of all) c.clear(); await pressPw(cutter, 'w', CABLE.hold * 1000 + 300); };

for (let i = 0; i < 150 && !cutter.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
ok('round 1 started', cutter.got('msg').some(m => /Guard the hostages/.test(m.text)));
await sleep(3400);
await until(() => cutter.el && cutter.pw);

// ---- up to the upper floor with the Rider in it
rider.at([doorX + 0.2, S[1], LANDING_Z], 0); await sleep(200);
await pressElev(rider, 'c1');
await until(() => door(0) > 0.99, 3000);
rider.at([mid[0], S[1], mid[1]], 0); rider.ride = { x: mid[0], z: mid[1] };
await sleep(300);
await pressElev(rider, 'b2');
await until(() => moving(), 6000);
await until(() => !moving() && Math.abs(cabY() - S[2]) < 1e-3, 9000);
ok(`the Rider rode up to the upper floor (${cabY().toFixed(3)})`, Math.abs(cabY() - S[2]) < 1e-3);
await until(() => door(0) < 0.01, 8000); // (its doors open and shut again)
pit.at([-20.6, E.pit, -4.6], 0); await sleep(300);
pit.clear();
pit.at(WSPOT, Math.PI / 2); await sleep(200);
await pressPw(pit, 'w');
ok('a CT at the winch can\'t cut it', pit.got('msg').some(m => /The Terrorists could cut its cable here/.test(m.text)) && cutter.pw.cut === 0);
pit.at([-20.6, E.pit, -4.6], 0); await sleep(300);

// ---- the cut
const y0 = cabY();
await cutIt();
ok('the grinder\'s sound when he starts', rider.got('pwSfx').some(m => m.s === 'grind'));
await until(() => cutter.pw.cut === 1, 2000);
ok('the cable snaps after 4 s (the sound, everyone told, the power state)', cutter.pw.cut === 1 && rider.got('pwSfx').some(m => m.s === 'snap') && rider.got('msg').some(m => /cut the lift's cable/.test(m.text)));
ok(`the lift: out of order, falling (${JSON.stringify(cutter.el.m)}, x ${cutter.el.x})`, cutter.el.x === 1 && cutter.el.m[4] === 1 && cutter.el.p === 0);
const t0 = Date.now();
if (!CATCH) {
  await until(() => rider.got('pwSfx').some(m => m.s === 'crash'), 4000);
  const secs = (Date.now() - t0) / 1000, h = y0 - CABLE.land, want = crashDamage(h);
  ok(`it crashes onto the buffers ${secs.toFixed(2)} s later (free fall from ${y0.toFixed(2)}: ${Math.sqrt((2 * h) / CABLE.g).toFixed(2)} s), at ${cabY().toFixed(3)}`, Math.abs(cabY() - CABLE.land) < 1e-3 && secs < 2.5);
  await sleep(400);
  ok(`the Rider takes the fall damage for ${h.toFixed(2)} m (${dmgOf(rider)}, want ${want})`, dmgOf(rider) === want && gone(rider));
  const k = cutter.got('kill').find(m => m.v === pit.id);
  ok(`the Pit is crushed, killed outright by the Cutter (${JSON.stringify(k)})`, k && k.k === cutter.id && k.w === 'crushed');
  ok('the crash\'s sound (heard by all)', mate.got('pwSfx').some(m => m.s === 'crash'));
  // ---- out of order
  mate.at([doorX + 0.2, S[1], LANDING_Z], 0); await sleep(200);
  mate.clear();
  await pressElev(mate, 'c1');
  ok('its call button: out of order', mate.got('msg').some(m => /Out of order — someone cut the lift's cable/.test(m.text)));
  mate.at([-16.95, -2.2, -4.6], 0); await sleep(200);
  await pressPw(mate, 'b4', 1300);
  await until(() => mate.pw.b[4] === 0, 2000);
  spare.at([-16.95, -2.2, -4.6], 0); await sleep(200);
  await pressPw(spare, 'b4', 1300);
  await until(() => mate.pw.b[4] === 1, 2000);
  await sleep(300);
  ok('the lift\'s breaker off and on again: still out of order', mate.pw.b[4] === 1 && mate.el.p === 0 && mate.el.x === 1);
  // ---- a restart mends it; the Mate rides it down from the ground floor
  await admin({ action: 'restart' });
  await until(() => cutter.pw.cut === 0 && cutter.el.x === 0 && Math.abs(cabY() - S[1]) < 1e-6, 8000);
  ok(`a restart mends it: the cable whole, the lift on the ground floor with power (${cutter.el.p})`, cutter.pw.cut === 0 && cutter.el.x === 0 && cutter.el.p === 1 && Math.abs(cabY() - S[1]) < 1e-6);
  await until(() => mate.alive && cutter.alive, 8000);
  await sleep(3500); // (the new round's freeze time)
  mate.at([mid[0], S[1], mid[1]], 0); mate.ride = { x: mid[0], z: mid[1] };
  await sleep(300);
  await cutIt();
  await until(() => mate.got('pwSfx').some(m => m.s === 'crash'), 5000);
  await sleep(400);
  const want2 = crashDamage(S[1] - CABLE.land);
  ok(`the Mate (a T) rode it down 3.9 m: ${dmgOf(mate)} damage (want ${want2}), from nobody (no team kill)`, dmgOf(mate) === want2 && mate.got('dmg').every(m => m.from === null) && mate.alive);
  ok('the Cutter loses no money for it', !cutter.got('msg').some(m => /teammate/i.test(m.text)));
} else {
  await until(() => rider.got('pwSfx').some(m => m.s === 'caught'), 3000);
  await until(() => !moving(), 2000);
  const drop = y0 - cabY();
  ok(`the emergency brake catches it: it drops ${drop.toFixed(2)} m (${caughtDrop().toFixed(2)}) and stops`, Math.abs(drop - caughtDrop()) < 0.02 && !moving() && rider.got('msg').some(m => /emergency brake caught/.test(m.text)));
  await sleep(300);
  ok(`nobody hurt (${dmgOf(rider)})`, dmgOf(rider) === 0 && rider.alive);
  ok('still out of order', cutter.el.x === 1 && cutter.el.p === 0);
  rider.clear();
  rider.yaw = Math.PI;
  rider.ride = { x: mid[0], z: mid[1] };
  await pressElev(rider, 'f', 3300);
  await until(() => door(0) > 0.99, 3000);
  ok(`the Rider pries the doors open near the upper floor (${door(0).toFixed(2)}, ${door(3).toFixed(2)})`, door(0) > 0.99 && door(3) > 0.99 && rider.got('elevSfx').some(m => m.s === 'forced'));
}

for (const c of all) c.close();
process.exit(process.exitCode || 0);
