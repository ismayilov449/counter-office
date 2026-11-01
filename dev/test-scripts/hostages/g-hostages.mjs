// Hostages in the browser: the real game (headless Edge on CDP_PORT, see dev/test-scripts/mansion/game.mjs) as a CT
// leading Mansion's hostages out, against the GAME_PORT test server (its MAP: cs_mansion or cs_mansion_night; start it
// with BOTS=0 ROUND_TIME=900). Screenshots in OUT (prefix PREFIX, default ghost), the hostages' tracks from the
// snapshots, the hints, the server's messages and page errors printed; exit 1 if a hostage isn't rescued.
//   0. a scripted T joins (the game starts), then opens every hinged door from inside (the front door swings out).
//   1. hostage 1 (upstairs): through the upstairs doorway at x -13, down the stairs, out of the front door, to the street.
//   2. the T swings the front door the other way (shut, then opened from outside: it swings in); hostage 0 (upstairs):
//      the same way out.
//   3. hostage 3 (ground floor): down the closet stairs into the cellar, back up and out (the old 9 m jump was there).
//   4. hostage 2 (ground floor): straight out.
// The browser CT walks the bots' routes (rescue.mjs's: the open door leaves are walls, no ladders or drops) at WALK m/s
// (default 2.5) facing back at the hostage (or, out of sight, the way it came 3 m back), so the screenshots show it
// following: every few seconds, and more often near the corners it used to catch on (the upstairs doorway's, the
// front door's jamb). The page runs at 640x360 so headless Edge draws ~10 frames a second and sends its position about
// every 25 cm (at 1280x720 it draws 2: positions 1.25 m apart, harder than the real game).
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { doorCenter } from '../../../shared/doors.js';
import { routeNav, rescueGoal, standBy } from './sim.mjs';

const P = process.env.PREFIX || 'ghost', WALK = +(process.env.WALK || 2.5);
const fails = [];
const check = (what, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const r1 = v => v.toFixed(1), r2 = v => v.toFixed(2);
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };

const g = await open('CT', 'Rescuer', ['msg']);
const { ev, shot, key, errors, cmd } = g;
await cmd('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
// (on a cold page the team buttons may not take the first click: click again until the join goes through)
for (let i = 0; i < 8 && !(await ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await new Promise(r => setTimeout(r, 1500));
}
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
const msgs = async () => JSON.parse(await ev('JSON.stringify(__in.splice(0))'));
// the browser CT at p looking along yaw (a 'spawn' message to the page: the server takes the position it then sends)
const put = (p, yaw) => ev(`__onmsg({ data: JSON.stringify({ t: 'spawn', p: ${JSON.stringify(p.map(v => +v.toFixed(3)))}, yaw: ${+yaw.toFixed(3)}, sq: __sq }) }), 1`);

// ---- 0. the T joins: the game starts; he watches the snapshots for the test (the hostages, the doors)
const T = await player('Guard', 'T');
// (the slow parts of the snapshot only come when they change: start from the last ones already received)
T.slow = { hs: T.log.filter(m => m.t === 's' && m.hs).pop()?.hs }; T.on.s = m => { T.snap = m; if ('hs' in m) T.slow.hs = m.hs; };
const MAP = MAPS[T.log.find(m => m.t === 'welcome')?.map] || MAPS.cs_mansion;
const world = new CollisionWorld(MAP);
const hs = i => T.slow.hs?.find(h => h[0] === i);
const floorAt = (x, z, top, range = 3) => { const h = world.raycast([x, top, z], [0, -1, 0], range, 'solid'); return h ? top - h.t : null; };
check('the round starts', await until(() => T.got('round').length > 0 || T.snap?.ph === 'live', 30000));
if (T.snap?.ph !== 'live' && !T.got('round').length) console.log('  (the T got: ' + [...new Set(T.log.map(m => m.t))].join(' ') + '; ' + T.got('msg').map(m => m.text).join(' | ') + ')');
await until(() => T.snap?.ph === 'live', 15000);
await sleep(500);
console.log('map', MAP.id, 'hostages', (T.slow.hs || []).map(h => `${h[0]}: ${[h[1], h[2], h[3]].map(r1)}`).join(' | '));
let doors = T.log.filter(m => m.t === 'welcome' || m.t === 'world').map(m => m.doors).filter(Boolean).pop()?.slice() || [];
T.on.doors = m => { doors = m.doors.slice(); };
const useDoorFrom = async (i, side) => {
  const d = MAP.doors[i], c = doorCenter(d), y = d.hinge[1];
  T.at(d.axis === 'z' ? [c[0] + side, y, c[2]] : [c[0], y, c[2] + side], 0); await sleep(250);
  T.use(true); await sleep(80); T.use(false); await sleep(400);
};
for (const [i, d] of (MAP.doors || []).entries()) {
  if (d.hatch || d.roller) continue;
  for (const s of [-0.9, 0.9]) { if (doors[i] !== 0) break; await useDoorFrom(i, s); }
}
await sleep(1500);
const shut = (MAP.doors || []).map((d, i) => (d.hatch || d.roller || doors[i] !== 0 ? null : i)).filter(i => i != null);
check(`the hinged doors are open (${shut.length ? 'still shut: ' + shut.join(', ') : 'all'})`, !shut.length);
const park = () => T.at(MAP.spawns.T[0].p.slice(), 0);
park();
// the front door: the hinged door nearest the jamb the downstairs hostages used to catch on
const FRONT = (MAP.doors || []).map((d, i) => [i, Math.hypot(doorCenter(d)[0] + 6.8, doorCenter(d)[2] + 2.3)]).filter(([i]) => !MAP.doors[i].hatch && !MAP.doors[i].roller).sort((a, b) => a[1] - b[1])[0][0];
// the corners hostages used to catch on (shots are taken more often while it's near one)
const CORNERS = [['updoor', [-13.7, 4.3, 8.2]], ['frontjamb', [-6.8, 0.8, -2.3]]];

// ---- leading one hostage along `legs` (spots to walk to in turn, each 'rescue' or a list of candidate spots: the
// first on the walking grid is taken)
async function lead(id, label, legs) {
  console.log(`hostage ${id} (${label})`);
  const h0 = hs(id);
  if (!h0 || h0[5] !== 0) { check(`hostage ${id} waiting (state ${h0?.[5]})`, false); return; }
  const hp = [h0[1], h0[2], h0[3]];
  world.setDoors(doors);
  const nav = routeNav(MAP, doors), goal = rescueGoal(MAP, world, nav);
  const ends = legs.map(e => (e === 'rescue' ? goal : e.map(q => nav.nodeAt(q)).find(n => n >= 0) ?? -1));
  const first = nav.route(nav.nodeAt(hp), ends[0]);
  const stand = first && standBy(world, hp, first.find(q => Math.hypot(q[0] - hp[0], q[2] - hp[2]) > 0.5) || first[0]);
  let pts = [], from = stand && nav.nodeAt(stand);
  for (const e of ends) { const r = from >= 0 && e >= 0 ? nav.route(from, e) : null; if (!r) { pts = null; break; } pts.push(...r); from = e; }
  if (!pts) { check(`hostage ${id}: a route`, false); return; }
  // stand by it, look at it, E
  const face = (p, q) => Math.atan2(-(q[0] - p[0]), -(q[2] - p[2]));
  let p = stand.slice();
  await put(p, face(p, hp)); await sleep(1200);
  const h1 = await hint();
  check(`hint by it: ${h1}`, /lead the hostage/.test(h1));
  await shot(`${P}_h${id}_start.png`);
  await msgs(); T.clear();
  await key('KeyE'); await sleep(600);
  const m1 = await msgs();
  check('it follows', m1.some(m => /following you/.test(m.text || '')) && hs(id)?.[5] === 1);
  // walk the route backwards, facing it; its track from the snapshots
  const track = [], shots = [], near = {}, walked = [p];
  let lost = null, n = 0, lastShot = 0;
  const t0 = Date.now();
  const onS = T.on.s;
  T.on.s = m => { onS(m); const h = m.hs?.find(x => x[0] === id) || hs(id); if (h && (!track.length || m.time > track.at(-1)[5])) track.push([Date.now() - t0, h[1], h[2], h[3], h[5], m.time]); };
  const rescued = () => T.got('sfx').some(m => m.s === 'rescue') || hs(id)?.[5] === 2;
  outer: for (const w of pts) {
    while (Math.hypot(w[0] - p[0], w[2] - p[2]) > 0.15) {
      const dx = w[0] - p[0], dz = w[2] - p[2], l = Math.hypot(dx, dz), s = Math.min(l, WALK * 0.05);
      const x = p[0] + (dx / l) * s, z = p[2] + (dz / l) * s, fl = floorAt(x, z, Math.max(p[1], w[1]) + 0.6);
      p = [x, fl ?? w[1], z];
      walked.push(p);
      const h = hs(id), hpos = h ? [h[1], h[2], h[3]] : hp;
      // face it if it's in sight, else the way we came 3 m back (the doorway it's about to come through)
      const eye = [p[0], p[1] + 1.62, p[2]], to = [hpos[0] - eye[0], hpos[1] + 1.2 - eye[1], hpos[2] - eye[2]], dist = Math.hypot(...to);
      const seen = !world.raycast(eye, to.map(v => v / dist), dist - 0.4, 'solid');
      let back = walked[0];
      for (let i = walked.length - 1, d = 0; i > 0; i--) { d += Math.hypot(walked[i][0] - walked[i - 1][0], walked[i][2] - walked[i - 1][2]); if (d >= 3) { back = walked[i - 1]; break; } }
      await put(p, face(p, seen || Math.hypot(back[0] - p[0], back[2] - p[2]) < 0.5 ? hpos : back));
      await sleep(50);
      // screenshots: every 3 s, every 0.6 s near a corner it used to catch on (up to 6 there)
      const t = Date.now() - t0, c = CORNERS.find(([, q]) => Math.hypot(hpos[0] - q[0], hpos[1] - q[1], hpos[2] - q[2]) < 2.2);
      if ((c && (near[c[0]] || 0) < 6 && t - lastShot > 600) || t - lastShot > 3000) {
        lastShot = t;
        const name = `${P}_h${id}_${String(++n).padStart(2, '0')}${c ? '_' + c[0] : ''}.png`;
        if (c) near[c[0]] = (near[c[0]] || 0) + 1;
        shots.push(shot(name).then(() => `${name} (${(t / 1000).toFixed(1)} s, hostage ${hpos.map(r1)})`));
      }
      if (rescued()) break outer;
      if (h && h[5] === 0) { lost = hpos; break outer; } // (it lost track of us: waiting again)
      if (t > 150000) break outer;
    }
  }
  const ok = !lost && await until(rescued, 10000);
  T.on.s = onS;
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('  shots:\n    ' + (await Promise.all(shots)).join('\n    '));
  // the track: its biggest jump between snapshots, how long it was within 1.5 m of each corner, its time stopped
  let jump = 0, stops = 0;
  for (let i = 1; i < track.length; i++) {
    const d = Math.hypot(track[i][1] - track[i - 1][1], track[i][3] - track[i - 1][3]), dt = (track[i][5] - track[i - 1][5]) / 1000; // (across the floor, by the server's clock)
    if (dt > 0) jump = Math.max(jump, d / dt);
  }
  for (const [name, q] of CORNERS) {
    const by = track.filter(s => Math.hypot(s[1] - q[0], s[2] - q[1], s[3] - q[2]) < 1.5);
    if (by.length) console.log(`  by the ${name} corner: ${((by.at(-1)[0] - by[0][0]) / 1000).toFixed(1)} s, nearest ${r2(Math.min(...by.map(s => Math.hypot(s[1] - q[0], s[3] - q[2]))))} m from where it used to get stuck`);
  }
  const ys = track.map(s => s[2]);
  console.log(`  track: ${track.length} snapshots, fastest ${r1(jump)} m/s, lowest y ${r2(Math.min(...ys))}, highest ${r2(Math.max(...ys))}`);
  check(`hostage ${id} from ${hp.map(r1)} (${pts.length} waypoints at ${WALK} m/s): ${lost ? 'lost track at ' + lost.map(r1) : ok ? 'rescued in ' + secs + ' s' : 'not rescued (at ' + [1, 2, 3].map(k => r1(hs(id)?.[k] ?? NaN)).join(',') + ')'}`, ok);
  check(`  never faster across the floor than it can run (${r1(jump)} m/s; top speed 5.8)`, jump < 6.5);
  await shot(`${P}_h${id}_end.png`);
}

// ---- 1. hostage 1: out of the front door swung out (opened from inside)
console.log('front door', FRONT, 'state', doors[FRONT]);
await lead(1, 'upstairs, front door swung out', ['rescue']);
// ---- 2. the front door swung the other way; hostage 0
await useDoorFrom(FRONT, -0.9); // (shut it)
await useDoorFrom(FRONT, 0.9); // (open from outside: it swings in)
await sleep(800);
park();
console.log('front door now', doors[FRONT]);
check('the front door swung the other way', doors[FRONT] !== 0);
await lead(0, 'upstairs, front door swung in', ['rescue']);
// ---- 3. hostage 3 through the cellar
await lead(3, 'through the cellar', [[[-17.5, -2.2, -2.5], [-18.5, -2.2, -6.0], [-16.5, -2.2, 0.5], [-20.0, -2.2, 2.0]], 'rescue']);
// ---- 4. hostage 2 straight out
await lead(2, 'ground floor', ['rescue']);

T.close();
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
console.log(fails.length ? `FAILED: ${fails.length}\n  ` + fails.join('\n  ') : 'all checks passed');
process.exit(fails.length || errors.length ? 1 : 0);
