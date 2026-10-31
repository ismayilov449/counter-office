// Hostage rescue with "Downed, not dead" (MAP=cs_mansion by default, the same as the GAME_PORT test server's, BOTS=0).
// Part 1 (skipped with SKIP_DOWN=1, e.g. against a server without the feature): a CT downed next to a hostage presses
// E on it: nothing happens. Part 2: a scripted CT presses E on each hostage in turn (HOSTAGES=0,2 for some of them),
// and walks the bots' path from it to the rescue zone at WALK m/s (default 2.5; no ladders, jumps or drops), after a
// Terrorist has opened every hinged door (from inside first; DOOR_SIDE=+ for the other side); each one should follow
// and be rescued. When one loses track of him, the test says where it got stuck. Two Terrorists stay parked.
// Result on 2026-10-31, the same on this branch and on main's code: none rescued on cs_mansion — every hostage gets
// caught on a door jamb or a doorway's corner (the front door, an upstairs doorway at x -13): lib/hostages.js drops a
// breadcrumb as soon as it's within 0.7 m, so it cuts corners (see docs/features/body.md).
import { player, sleep } from '../mansion/client.mjs';
import { MAPS, inRescueZone } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav, smoothPath } from '../../../lib/nav.js';
import { doorCenter } from '../../../shared/doors.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };
const MAP = MAPS[process.env.MAP || 'cs_mansion'], world = new CollisionWorld(MAP);
const WALK = +(process.env.WALK || 2.5);
const nav = buildNav(MAP, world);
// A hostage's path: no ladders, no jumps up, no drops (the bots' grid has drops through the Mansion's roofs, and a
// bot's path to the street can go over the roof by the attic ladder)
nav.extra.clear();
for (let i = 0; i < nav.link.length; i++) if (nav.how[i]) nav.link[i] = -1;
const C = await player('Rescuer', 'CT'), T = await player('Guard', 'T'), C2 = await player('Medic', 'CT'), T2 = await player('Shooter', 'T');
// (the slow parts of the snapshot only come when they change: start from the last ones already received)
for (const c of [C, T, C2, T2]) { c.slow = { hs: c.log.filter(m => m.t === 's' && m.hs).pop()?.hs }; c.on.s = m => { c.snap = m; if ('hs' in m) c.slow.hs = m.hs; }; }
const hs = i => C.slow.hs?.find(h => h[0] === i);
const r1 = v => v.toFixed(1);
T2.w = 'glock';
ok('round starts', await until(() => C.got('round').length > 0, 30000));
await until(() => C.snap?.ph === 'live', 15000);
await sleep(300);
const spawnT = i => MAP.spawns.T[i].p.slice();
T.at(spawnT(0), 0); T2.at(spawnT(1), 0);
const floorAt = (x, z, top, range = 3) => { const h = world.raycast([x, top, z], [0, -1, 0], range, 'solid'); return h ? top - h.t : null; };
const clear = (a, b) => { const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d); return !world.raycast(a, d.map(v => v / l), l); };

// ---------------------------------------------------------------- 1: a downed CT can't lead a hostage
if (!process.env.SKIP_DOWN) {
  const h0 = hs(2) || hs(0), hp = [h0[1], h0[2], h0[3]];
  const near = [hp[0] + 0.8, hp[1], hp[2]];
  // somewhere 3-5 m away on the same floor with a clear shot at him
  let gunAt = null;
  for (let r = 3; r <= 5 && !gunAt; r += 1) for (let a = 0; a < 16 && !gunAt; a++) {
    const x = near[0] + Math.sin(a * Math.PI / 8) * r, z = near[2] + Math.cos(a * Math.PI / 8) * r, y = floorAt(x, z, near[1] + 1);
    if (y != null && Math.abs(y - near[1]) < 0.15 && clear([x, y + 1.62, z], [near[0], near[1] + 1.2, near[2]])) gunAt = [x, y, z];
  }
  C2.at(near, 0); await sleep(300);
  T2.at(gunAt, 0); await sleep(600);
  for (let i = 0; i < 12 && !C2.got('bodyDown').length && !C2.got('kill').length; i++) {
    const o = [gunAt[0], gunAt[1] + 1.62, gunAt[2]], to = [near[0], near[1] + 1.2, near[2]], d = to.map((v, j) => v - o[j]), l = Math.hypot(...d);
    T2.send({ t: 'shoot', o, d: d.map(v => v / l), w: 'glock' }); await sleep(380);
  }
  ok('a CT is down next to the hostage', C2.got('bodyDown').length === 1);
  C2.use(true); await sleep(500); C2.use(false);
  ok(`a downed CT can't lead the hostage (state ${hs(h0[0])[5]})`, hs(h0[0])[5] === 0 && !C2.got('msg').some(m => /following you/.test(m.text)));
  T2.at(spawnT(1), 0);
}

// ---------------------------------------------------------------- 2: lead each hostage to the rescue zone
// First the Guard opens every closed door (the scripted CT walks through closed doors, which the server allows for a
// test player; a hostage can't, and E next to a hostage would tell it to wait, so a player opens them first).
let doors = T.log.find(m => m.t === 'welcome')?.doors?.slice() || [];
T.on.doors = m => { doors = m.doors.slice(); };
for (const [i, d] of (MAP.doors || []).entries()) {
  if (d.hatch || d.roller || doors[i] !== 0) continue;
  const c = doorCenter(d), y = d.hinge[1];
  for (const s of (process.env.DOOR_SIDE === "+" ? [0.9, -0.9] : [-0.9, 0.9])) {
    if (doors[i] !== 0) break;
    T.at(d.axis === 'z' ? [c[0] + s, y, c[2]] : [c[0], y, c[2] + s], 0); await sleep(250);
    T.use(true); await sleep(80); T.use(false); await sleep(300);
  }
}
const shut = (MAP.doors || []).map((d, i) => (d.hatch || d.roller || doors[i] !== 0 ? null : i)).filter(i => i != null);
ok(`the hinged doors are open (${shut.length ? 'still shut: ' + shut.join(', ') : 'all'})`, !shut.length);
T.at(spawnT(0), 0);
let goal = null;
const Rz = MAP.zones.rescue;
for (let x = (Rz.min[0] + Rz.max[0]) / 2, z = Rz.min[1] + 2; z < Rz.max[1] && goal == null; z += 1.5) {
  const y = floorAt(x, z, 12, 20);
  if (y != null && inRescueZone(MAP, [x, y, z])) { const n = nav.nodeAt([x, y, z]); if (n >= 0) goal = n; }
}
const list = (process.env.HOSTAGES || '').split(',').filter(Boolean).map(Number);
const ids = list.length ? list : C.slow.hs.map(h => h[0]);
for (const id of ids) {
  const h0 = hs(id);
  if (!h0 || h0[5] !== 0) { ok(`hostage ${id} waiting (state ${h0?.[5]})`, false); continue; }
  const hp = [h0[1], h0[2], h0[3]];
  const from = nav.nodeAt(hp), nodes = goal != null && from >= 0 ? nav.path(from, goal, true) : null;
  const pts = nodes ? smoothPath(nav, nodes, world).map(w => w.p) : null;
  if (!pts) { ok(`hostage ${id}: a path to the rescue zone`, false); continue; }
  C.clear();
  // stand next to it (on the side the path leaves from) and press E
  const d0 = [pts[0][0] - hp[0], pts[0][2] - hp[2]], l0 = Math.hypot(...d0) || 1;
  let p = [hp[0] + (d0[0] / l0) * 0.9, hp[1], hp[2] + (d0[1] / l0) * 0.9];
  C.at(p, 0); await sleep(400);
  C.use(true); await sleep(300); C.use(false);
  if (!C.got('msg').some(m => /following you/.test(m.text))) { ok(`hostage ${id} follows`, false); continue; }
  // walk the path at WALK m/s, on the floor (stairs included); stop if it loses track
  let lostAt = null;
  for (const w of pts) {
    while (Math.hypot(w[0] - p[0], w[2] - p[2]) > 0.15 && !lostAt) {
      const dx = w[0] - p[0], dz = w[2] - p[2], l = Math.hypot(dx, dz), s = Math.min(l, WALK * 0.05);
      const x = p[0] + (dx / l) * s, z = p[2] + (dz / l) * s, top = Math.max(p[1], w[1]) + 0.6;
      const fl = floorAt(x, z, top);
      p = [x, fl ?? w[1], z];
      C.at(p, Math.atan2(-dx, -dz)); await sleep(50);
      if (C.got('sfx').some(m => m.s === 'rescue')) break;
      if (C.got('msg').some(m => /lost track/.test(m.text))) { const h = hs(id); lostAt = { h: [h[1], h[2], h[3]], me: p.slice() }; }
    }
    if (lostAt || C.got('sfx').some(m => m.s === 'rescue')) break;
  }
  const rescued = lostAt ? false : await until(() => C.got('sfx').some(m => m.s === 'rescue'), 8000);
  const where = lostAt ? `lost track at ${lostAt.h.map(r1)} (the CT at ${lostAt.me.map(r1)})` : rescued ? 'rescued' : `not rescued, hostage at ${[1, 2, 3].map(k => r1(hs(id)[k]))}`;
  ok(`hostage ${id} from ${hp.map(r1)} (${pts.length} waypoints at ${WALK} m/s): ${where}`, rescued);
}
for (const c of [C, T, C2, T2]) c.close();
process.exit();
