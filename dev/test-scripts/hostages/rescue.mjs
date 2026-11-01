// Hostage rescue by a scripted CT, against the GAME_PORT test server (its MAP, default cs_mansion; BOTS=0 and
// ROUND_TIME=900 so the round outlasts the walks). Adapted from dev/test-scripts/body/hostage.mjs (feature/body branch),
// without its "downed CT" part.
// A Terrorist first opens every hinged door (from inside first; DOOR_SIDE=+ for the other side), then the CT stands
// next to each hostage in turn (HOSTAGES=0,2 for some of them), presses E and walks to the rescue zone at WALK m/s
// (default 2.5) along the bots' path on a grid where the open door leaves are walls and there are no ladders, jumps or
// drops (DROPS=1 allows drops: cs_assault's office has no other way out): through the doorways, down the stairs, out of
// the front door and into the street. Each one should follow and be rescued; when one loses track of him, the test
// says where it got stuck. TRACE=1 prints the hostage's position every second.
// Result on main (ed6374b), 2026-10-31: none rescued on cs_mansion — the downstairs ones caught on the front door's
// jamb, the upstairs ones on the corner of the upstairs doorway at x -13 (lib/hostages.js dropped a breadcrumb as soon
// as it was within 0.7 m, so it cut corners). With the fix: all 4 rescued (see docs/features/hostages.md).
import { player, sleep } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { doorCenter } from '../../../shared/doors.js';
import { routeNav, rescueGoal, standBy } from './sim.mjs';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };
const MAP = MAPS[process.env.MAP || 'cs_mansion'], world = new CollisionWorld(MAP);
const WALK = +(process.env.WALK || 2.5);
const C = await player('Rescuer', 'CT'), T = await player('Guard', 'T');
// (the slow parts of the snapshot only come when they change: start from the last ones already received)
for (const c of [C, T]) { c.slow = { hs: c.log.filter(m => m.t === 's' && m.hs).pop()?.hs }; c.on.s = m => { c.snap = m; if ('hs' in m) c.slow.hs = m.hs; }; }
const hs = i => C.slow.hs?.find(h => h[0] === i);
const r1 = v => v.toFixed(1);
ok('round starts', await until(() => C.got('round').length > 0, 30000));
await until(() => C.snap?.ph === 'live', 15000);
await sleep(300);
const spawnT = i => MAP.spawns.T[i].p.slice();
T.at(spawnT(0), 0);
const floorAt = (x, z, top, range = 3) => { const h = world.raycast([x, top, z], [0, -1, 0], range, 'solid'); return h ? top - h.t : null; };

// First the Guard opens every closed door (the scripted CT walks through closed doors, which the server allows for a
// test player; a hostage can't, and E next to a hostage would tell it to wait, so a player opens them first).
let doors = T.log.filter(m => m.t === 'welcome' || m.t === 'world').map(m => m.doors).filter(Boolean).pop()?.slice() || [];
T.on.doors = m => { doors = m.doors.slice(); };
T.on.world = m => { if (m.doors) doors = m.doors.slice(); };
for (const [i, d] of (MAP.doors || []).entries()) {
  if (d.hatch || d.roller || doors[i] !== 0) continue;
  const c = doorCenter(d), y = d.hinge[1];
  for (const s of (process.env.DOOR_SIDE === '+' ? [0.9, -0.9] : [-0.9, 0.9])) {
    if (doors[i] !== 0) break;
    T.at(d.axis === 'z' ? [c[0] + s, y, c[2]] : [c[0], y, c[2] + s], 0); await sleep(250);
    T.use(true); await sleep(80); T.use(false); await sleep(300);
  }
}
await sleep(1500); // (slow doors take a moment to swing open)
const shut = (MAP.doors || []).map((d, i) => (d.hatch || d.roller || doors[i] !== 0 ? null : i)).filter(i => i != null);
ok(`the hinged doors are open (${shut.length ? 'still shut: ' + shut.join(', ') : 'all'})`, !shut.length);
T.at(spawnT(0), 0);
// the walking route: the doors as they are now
world.setDoors(doors);
const nav = routeNav(MAP, doors);
const goal = rescueGoal(MAP, world, nav);
const list = (process.env.HOSTAGES || '').split(',').filter(Boolean).map(Number);
const ids = list.length ? list : C.slow.hs.map(h => h[0]);
let rescuedCount = 0;
for (const id of ids) {
  const h0 = hs(id);
  if (!h0 || h0[5] !== 0) { ok(`hostage ${id} waiting (state ${h0?.[5]})`, false); continue; }
  const hp = [h0[1], h0[2], h0[3]];
  // stand next to it (on the side the route leaves from) and press E
  const first = nav.route(nav.nodeAt(hp), goal);
  const stand = first && standBy(world, hp, first.find(q => Math.hypot(q[0] - hp[0], q[2] - hp[2]) > 0.5) || first[0]);
  const pts = stand && nav.route(nav.nodeAt(stand), goal);
  if (!pts) { ok(`hostage ${id}: a route to the rescue zone`, false); continue; }
  C.clear();
  let p = stand.slice();
  C.at(p, 0); await sleep(400);
  C.use(true); await sleep(300); C.use(false);
  if (!C.got('msg').some(m => /following you/.test(m.text))) { ok(`hostage ${id} follows`, false); continue; }
  // walk the route at WALK m/s, on the floor (stairs included); stop if it loses track
  let lostAt = null, lastTrace = Date.now();
  const t0 = Date.now();
  for (const w of pts) {
    while (Math.hypot(w[0] - p[0], w[2] - p[2]) > 0.15 && !lostAt) {
      const dx = w[0] - p[0], dz = w[2] - p[2], l = Math.hypot(dx, dz), s = Math.min(l, WALK * 0.05);
      const x = p[0] + (dx / l) * s, z = p[2] + (dz / l) * s, top = Math.max(p[1], w[1]) + 0.6;
      const fl = floorAt(x, z, top);
      p = [x, fl ?? w[1], z];
      C.at(p, Math.atan2(-dx, -dz)); await sleep(50);
      if (process.env.TRACE && Date.now() - lastTrace > 1000) { lastTrace = Date.now(); const h = hs(id); console.log(`    t ${((Date.now() - t0) / 1000).toFixed(0)} CT ${p.map(r1)} hostage ${[h[1], h[2], h[3]].map(r1)} state ${h[5]}`); }
      if (C.got('sfx').some(m => m.s === 'rescue')) break;
      if (C.got('msg').some(m => /lost track/.test(m.text))) { const h = hs(id); lostAt = { h: [h[1], h[2], h[3]], me: p.slice() }; }
    }
    if (lostAt || C.got('sfx').some(m => m.s === 'rescue')) break;
  }
  const rescued = lostAt ? false : await until(() => C.got('sfx').some(m => m.s === 'rescue'), 8000);
  if (rescued) rescuedCount++;
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const where = lostAt ? `lost track at ${lostAt.h.map(r1)} (the CT at ${lostAt.me.map(r1)})` : rescued ? `rescued in ${secs} s` : `not rescued, hostage at ${[1, 2, 3].map(k => r1(hs(id)[k]))}`;
  ok(`hostage ${id} from ${hp.map(r1)} (${pts.length} waypoints at ${WALK} m/s): ${where}`, rescued);
}
console.log(`${rescuedCount}/${ids.length} rescued on ${MAP.id}`);
for (const c of [C, T]) c.close();
process.exit();
