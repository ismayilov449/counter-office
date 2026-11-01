// Offline hostage-following checks, no server: lib/hostages.js runs at 32 Hz against the map's collision world with
// every hinged door open (as rescue.mjs leaves them) while a leader walks a route at WALK m/s (default 2.5). The routes
// are the bots' paths on a grid that treats the open door leaves as walls and has no ladders, jumps or drops (a
// hostage can't climb), so they go through the doorways and hug the corners (nav paths often graze a jamb).
//   node dev/test-scripts/hostages/sim.mjs [MAP]          each hostage led to the rescue zone (exit 1 if one isn't)
//   node dev/test-scripts/hostages/sim.mjs [MAP] tour     TOURS (default 60) random walks between two spots inside the
//                                                          mansion (or the map) through its tight corners; the hostage
//                                                          must end up next to the leader
// Env: HOSTAGES=0,2  WALK=3.5  TRACE=1 (the hostage every second)  DOOR_SIDE=+ (doors opened from the other side)
//      DROPS=1 (routes may drop down a ledge: cs_assault has no way out of the office without one)  SEED=7
import { MAPS, inRescueZone } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav, smoothPath } from '../../../lib/nav.js';
import { openingSide, doorCenter } from '../../../shared/doors.js';
import { overlapsAny, PLAYER } from '../../../shared/physics.js';
import { pathToFileURL } from 'url';
// HOSTAGES_LIB=path/to/hostages.js: another version of lib/hostages.js (e.g. main's, to compare)
const { createHostages, updateHostages } = await import(process.env.HOSTAGES_LIB ? pathToFileURL(process.env.HOSTAGES_LIB).href : '../../../lib/hostages.js');

const r1 = v => v.toFixed(1);
const floorAt = (world, x, z, top, range = 3) => { const h = world.raycast([x, top, z], [0, -1, 0], range, 'solid'); return h ? top - h.t : null; };

// The door states rescue.mjs ends up with (a Terrorist opens each hinged door from its - side, or + with DOOR_SIDE=+).
export function openDoors(map, side = process.env.DOOR_SIDE === '+' ? 0.9 : -0.9) {
  return (map.doors || []).map(d => {
    if (d.hatch || d.roller) return 0;
    const c = doorCenter(d);
    return openingSide(d, d.axis === 'z' ? [c[0] + side, 0, c[2]] : [c[0], 0, c[2] + side]);
  });
}

// A grid for a leader's walking route with these door states: the doors are walls, no ladders, no jumps up, and no
// drops unless `drops`.
export function routeNav(map, doors, drops = !!process.env.DROPS) {
  const w0 = new CollisionWorld(map);
  w0.setDoors(doors);
  const solid = { ...map, boxes: map.boxes.concat(w0.doorBoxes.map(b => ({ min: b.min, max: b.max }))) };
  const world = new CollisionWorld(solid), nav = buildNav(solid, world);
  nav.extra.clear();
  for (let i = 0; i < nav.link.length; i++) if (nav.how[i] === 1 || (nav.how[i] === 2 && !drops)) nav.link[i] = -1;
  nav.route = (a, b) => {
    const nodes = a >= 0 && b >= 0 ? nav.path(a, b, true, 200000) : null;
    return nodes ? smoothPath(nav, nodes, world).map(w => w.p) : null;
  };
  return nav;
}

export function rescueGoal(map, world, nav) {
  const Rz = map.zones.rescue;
  for (let x = (Rz.min[0] + Rz.max[0]) / 2, z = Rz.min[1] + 2; z < Rz.max[1]; z += 1.5) {
    const y = floorAt(world, x, z, 12, 20);
    if (y != null && inRescueZone(map, [x, y, z])) { const n = nav.nodeAt([x, y, z]); if (n >= 0) return n; }
  }
  return -1;
}

// Where a CT stands to press E on a hostage at hp: 0.9 m away, towards `toward` if that spot is free.
export function standBy(world, hp, toward) {
  const a0 = Math.atan2(toward[0] - hp[0], toward[2] - hp[2]);
  for (let i = 0; i < 12; i++) {
    const a = a0 + Math.ceil(i / 2) * (i % 2 ? 1 : -1) * (Math.PI / 6), x = hp[0] + Math.sin(a) * 0.9, z = hp[2] + Math.cos(a) * 0.9;
    const y = floorAt(world, x, z, hp[1] + 0.6);
    if (y != null && Math.abs(y - hp[1]) < 0.3 && !overlapsAny(world.move(null, [x, y, z], 2), x, y + 0.05, z, PLAYER.radius, PLAYER.height - 0.05)) return [x, y, z];
  }
  return [hp[0] + Math.sin(a0) * 0.9, hp[1], hp[2] + Math.cos(a0) * 0.9];
}

// A hostage at hp follows a leader who starts at `from` and walks `pts`; the server's update runs at 32 Hz.
// Done when it reaches the rescue zone (toRescue) or, once the leader has arrived, gets within 2.5 m of him.
export function lead(map, world, hp, from, pts, { walk = 2.5, trace = false, maxSecs = 150, toRescue = true } = {}) {
  const list = createHostages({ hostages: [{ p: hp.slice() }] }), h = list[0];
  const leader = { id: 1, alive: true, team: 'CT', driving: null, p: from.slice() };
  const players = new Map([[1, leader]]);
  h.state = 'follow'; h.leader = 1; h.trail = [leader.p.slice()]; h.checkAt = 3000; h.checkPos = h.p.slice();
  const near = p => world.move(null, p, 2);
  let t = 0, wi = 0, nextMove = 0, nextTrace = 1000;
  const DT = 1000 / 32;
  while (t < maxSecs * 1000) {
    // the leader: a 50 ms step along the route (as rescue.mjs sends it)
    while (nextMove <= t) {
      nextMove += 50;
      const w = pts[wi];
      if (!w) break;
      const dx = w[0] - leader.p[0], dz = w[2] - leader.p[2], l = Math.hypot(dx, dz);
      if (l <= 0.15) { wi++; nextMove -= 50; continue; }
      const s = Math.min(l, walk * 0.05), x = leader.p[0] + (dx / l) * s, z = leader.p[2] + (dz / l) * s;
      const fl = floorAt(world, x, z, Math.max(leader.p[1], w[1]) + 0.6);
      leader.p = [x, fl ?? w[1], z];
    }
    t += DT;
    const ev = updateHostages(list, players, DT / 1000, near, t);
    if (trace && t >= nextTrace) { nextTrace += +(process.env.TRACE_MS || 1000); console.log(`    t ${r1(t / 1000)} leader ${leader.p.map(r1)} hostage ${h.p.map(r1)} crumbs ${h.trail.length}`); }
    const res = { at: h.p.slice(), leaderAt: leader.p.slice(), secs: t / 1000 };
    if (ev.some(e => e.type === 'lost')) return { ok: false, lost: true, ...res };
    if (toRescue && inRescueZone(map, h.p)) return { ok: true, ...res };
    if (!toRescue && !pts[wi] && Math.hypot(h.p[0] - leader.p[0], h.p[1] - leader.p[1], h.p[2] - leader.p[2]) < 3) return { ok: true, ...res };
  }
  return { ok: false, lost: false, at: h.p.slice(), leaderAt: leader.p.slice(), secs: t / 1000 };
}

const failText = r => `${r.lost ? 'lost track' : 'stuck'} at ${r.at.map(r1)} after ${r1(r.secs)} s (leader at ${r.leaderAt.map(r1)})`;

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const map = MAPS[process.argv[2] || 'cs_mansion'], mode = process.argv[3] || 'rescue', walk = +(process.env.WALK || 2.5);
  const doors = openDoors(map), world = new CollisionWorld(map);
  world.setDoors(doors);
  const nav = routeNav(map, doors);
  if (mode === 'rescue') {
    const goal = rescueGoal(map, world, nav);
    const list = (process.env.HOSTAGES || '').split(',').filter(Boolean).map(Number);
    const ids = list.length ? list : map.hostages.map((_, i) => i);
    let n = 0;
    for (const id of ids) {
      const hp = map.hostages[id].p, first = nav.route(nav.nodeAt(hp), goal);
      const from = first && standBy(world, hp, first.find(q => Math.hypot(q[0] - hp[0], q[2] - hp[2]) > 0.5) || first[0]);
      const pts = from && nav.route(nav.nodeAt(from), goal);
      if (!pts) { console.log(`FAIL hostage ${id}: no route`); process.exitCode = 1; continue; }
      const r = lead(map, world, hp, from, pts, { walk, trace: !!process.env.TRACE });
      if (r.ok) n++; else process.exitCode = 1;
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} hostage ${id} (${pts.length} waypoints at ${walk} m/s): ${r.ok ? `rescued in ${r1(r.secs)} s` : failText(r)}`);
    }
    console.log(`${n}/${ids.length} rescued on ${map.id}`);
  } else if (mode === 'tour') {
    // spots inside the house (the Terrorists' buy zone covers it on cs_mansion), else anywhere on the map
    const area = map.id.startsWith('cs_mansion') ? map.zones.buyT : null;
    let seed = +(process.env.SEED || 7);
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const inside = n => { const [x, y, z] = nav.pos(n); return !nav.low[n] && y > -3 && y < 6 && (!area || (x > area.min[0] && x < area.max[0] && z > area.min[1] && z < area.max[1])); };
    const spots = [];
    for (let n = 0; n < nav.count; n++) if (inside(n) && !nav.tight[n]) spots.push(n);
    // FROM=x,y,z TO=x,y,z: just that walk
    const fixed = process.env.FROM && [process.env.FROM, process.env.TO].map(s => nav.nodeAt(s.split(',').map(Number)));
    const tours = fixed ? 1 : +(process.env.TOURS || 60);
    let n = 0, tried = 0;
    while (tried < tours) {
      const [a, b] = fixed || [spots[Math.floor(rnd() * spots.length)], spots[Math.floor(rnd() * spots.length)]];
      if (!fixed && (nav.comp[a] !== nav.comp[b] || Math.hypot(...[0, 1, 2].map(k => nav.pos(a)[k] - nav.pos(b)[k])) < 8)) continue;
      const hp = nav.pos(a), first = nav.route(a, b);
      if (!first) continue;
      const from = standBy(world, hp, first.find(q => Math.hypot(q[0] - hp[0], q[2] - hp[2]) > 0.5) || first[0]);
      const pts = nav.route(nav.nodeAt(from), b);
      if (!pts) continue;
      tried++;
      const r = lead(map, world, hp, from, pts, { walk, trace: !!process.env.TRACE, toRescue: false, maxSecs: 90 });
      if (r.ok) n++; else process.exitCode = 1;
      if (!r.ok || process.env.VERBOSE) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${hp.map(r1)} -> ${nav.pos(b).map(r1)} (${pts.length} waypoints): ${r.ok ? `in ${r1(r.secs)} s` : failText(r)}`);
    }
    console.log(`${n}/${tried} walks followed on ${map.id} at ${walk} m/s`);
  }
}
