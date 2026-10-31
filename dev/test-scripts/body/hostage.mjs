// Hostage rescue still works with "Downed, not dead" (cs_assault, GAME_PORT test server with BOTS=0): a scripted CT
// (with a Terrorist on the other side so the round runs) presses E on a hostage, which follows him; he walks the bots'
// path to the rescue zone and the hostage is rescued. First a downed CT presses E next to it: nothing happens.
import { player, sleep } from '../mansion/client.mjs';
import { MAPS, inRescueZone } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav, smoothPath } from '../../../lib/nav.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };
const MAP = MAPS.cs_assault, world = new CollisionWorld(MAP);
const nav = buildNav(MAP, world);
const C = await player('Rescuer', 'CT'), T = await player('Guard', 'T'), C2 = await player('Medic', 'CT'), T2 = await player('Shooter', 'T');
// (the slow parts of the snapshot only come when they change: start from the last ones already received)
for (const c of [C, T, C2, T2]) { c.slow = { hs: c.log.filter(m => m.t === 's' && m.hs).pop()?.hs }; c.on.s = m => { c.snap = m; if ('hs' in m) c.slow.hs = m.hs; }; }
T2.w = 'glock';
ok('round starts', await until(() => C.got('round').length > 0, 30000));
await sleep(3400);
const h0 = C.slow.hs[0], hp = [h0[1], h0[2], h0[3]];
ok(`hostage 0 at ${hp.map(v => v.toFixed(1))}`, !!h0);
// park the Terrorists out of the way (T2 shoots C2 down next to the hostage first)
T.at([MAP.spawns.T[0].p[0], MAP.spawns.T[0].p[1], MAP.spawns.T[0].p[2]], 0);
const near = [hp[0] + 0.8, hp[1], hp[2]];
C2.at(near, 0); await sleep(300);
const gunAt = [hp[0] + 0.8, hp[1], hp[2] + 4];
T2.at(gunAt, 0); await sleep(600);
for (let i = 0; i < 12 && !C2.got('bodyDown').length && !C2.got('kill').length; i++) {
  const o = [gunAt[0], gunAt[1] + 1.62, gunAt[2]], to = [near[0], near[1] + 1.2, near[2]], d = to.map((v, j) => v - o[j]), l = Math.hypot(...d);
  T2.send({ t: 'shoot', o, d: d.map(v => v / l), w: 'glock', rt: 0 }); await sleep(380);
}
ok('a CT is down next to the hostage', C2.got('bodyDown').length === 1);
C2.use(true); await sleep(500); C2.use(false);
ok(`a downed CT can't lead the hostage (state ${C.slow.hs[0][5]})`, C.slow.hs[0][5] === 0 && !C2.got('msg').some(m => /following you/.test(m.text)));
T2.at([MAP.spawns.T[1].p[0], MAP.spawns.T[1].p[1], MAP.spawns.T[1].p[2]], 0);
// the path from the hostage to the rescue zone (standing height: hostages can't crawl)
let goal = null;
for (let x = MAP.zones.rescue.min[0] + 2; x < MAP.zones.rescue.max[0] && goal == null; x += 3) {
  for (let z = MAP.zones.rescue.min[1] + 2; z < MAP.zones.rescue.max[1] && goal == null; z += 3) {
    const h = world.raycast([x, 12, z], [0, -1, 0], 30, 'solid');
    if (h && inRescueZone(MAP, [x, 12 - h.t, z])) { const n = nav.nodeAt([x, 12 - h.t, z]); if (n >= 0) goal = n; }
  }
}
const from = nav.nodeAt(hp), nodes = goal != null && from >= 0 ? nav.path(from, goal, true) : null;
const pts = nodes ? smoothPath(nav, nodes, world).map(w => w.p) : null;
ok(`a path to the rescue zone (${pts?.length} waypoints)`, !!pts);
C.at([hp[0] - 0.8, hp[1], hp[2]], 0); await sleep(400);
C.use(true); await sleep(300); C.use(false);
ok('the hostage follows', C.got('msg').some(m => /following you/.test(m.text)));
// walk the path at 2.5 m/s, on the floor (stairs included)
let p = [hp[0] - 0.8, hp[1], hp[2]];
for (const w of pts) {
  while (Math.hypot(w[0] - p[0], w[2] - p[2]) > 0.15) {
    const dx = w[0] - p[0], dz = w[2] - p[2], l = Math.hypot(dx, dz), s = Math.min(l, 2.5 * 0.05);
    const x = p[0] + (dx / l) * s, z = p[2] + (dz / l) * s, top = Math.max(p[1], w[1]) + 0.6;
    const fl = world.raycast([x, top, z], [0, -1, 0], 3, 'solid');
    p = [x, fl ? top - fl.t : w[1], z];
    C.at(p, Math.atan2(-dx, -dz)); await sleep(50);
    if (C.got('sfx').some(m => m.s === 'rescue')) break;
  }
  if (C.got('sfx').some(m => m.s === 'rescue')) break;
}
ok(`rescued (${C.got('msg').filter(m => /rescued|lost/.test(m.text)).map(m => m.text).join(' | ')})`, await until(() => C.got('sfx').some(m => m.s === 'rescue'), 8000));
for (const c of [C, T, C2, T2]) c.close();
process.exit();
