// Runs the cat's AI (lib/cat.js) without a server, on the real map, nav grid and collision world, with a virtual
// clock: minutes of wandering in a second or two. Checks every tick that it stands on a floor, inside the map, never
// inside a wall; lists the spots it reached and how long its thinking takes.
// usage: node dev/test-scripts/cat/sim.mjs [minutes=10] [map=cs_mansion] [doors=open|closed] [seed]
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav } from '../../../lib/nav.js';
import { createCat } from '../../../lib/cat.js';
import { CAT, CAT_STATE } from '../../../shared/cat.js';
import { overlapsAny } from '../../../shared/physics.js';

const [minutes = 10, mapId = 'cs_mansion', doors = 'open'] = process.argv.slice(2);
const map = MAPS[mapId];
const world = new CollisionWorld(map);
const t0 = Date.now();
const nav = buildNav(map, world);
console.log(`nav: ${nav.count} nodes in ${Date.now() - t0} ms`);
if (doors === 'open') world.setDoors(map.doors.map((d, i) => (d.hatch || d.roller ? 0 : 1)));
world.cars = (map.vehicles || []).map((v, id) => ({ id, p: [v.p[0], v.y ? 0 : 0, v.p[1]], yaw: v.yaw, riders: [] }));

let clock = 0;
const players = new Map(), game = { lights: {}, mines: [] };
const sounds = [];
const cat = createCat({
  map: () => map, world: () => world, nav: () => nav, players: () => players, game: () => game, now: () => clock,
  broadcast: m => sounds.push({ t: clock, ...m }), detonateMine: m => { game.mines.splice(game.mines.indexOf(m), 1); sounds.push({ t: clock, t2: 'mine' }); },
});
cat.reset();
for (const s of cat.spots()) console.log(`  spot ${s.id.padEnd(10)} floor ${s.at.map(v => v.toFixed(2)).join(', ')}${s.perch ? '  perch ' + s.perch.join(', ') : ''}`);
const missing = CAT.spots.filter(s => !cat.spots().some(x => x.id === s.id) || (s.perch && !cat.spots().find(x => x.id === s.id).perch));
if (missing.length) console.log('  SPOTS OR PERCHES MISSING:', missing.map(s => s.id).join(', '));

const STATE = Object.fromEntries(Object.entries(CAT_STATE).map(([k, v]) => [v, k]));
const visits = new Map(), inState = new Map();
let grazes = 0, bad = 0, thinkMax = 0, thinkSum = 0, ticks = 0, lastSpot = null, lastMove = 0, lastP = null, stuckMax = 0;
const dt = 1000 / 32;
const bounds = map.bounds;
for (clock = 0; clock < minutes * 60000; clock += dt) {
  const a = performance.now();
  cat.tick(clock);
  const ms = performance.now() - a;
  thinkMax = Math.max(thinkMax, ms); thinkSum += ms; ticks++;
  const d = cat.debug();
  if (ms > 4 && process.env.VERBOSE) console.log(`  slow tick ${ms.toFixed(1)} ms at ${(clock / 1000).toFixed(1)} s: ${JSON.stringify(d)}`);
  inState.set(STATE[d.state], (inState.get(STATE[d.state]) || 0) + dt);
  if (d.spot && d.spot !== lastSpot && !d.path) { visits.set(d.spot, (visits.get(d.spot) || 0) + 1); lastSpot = d.spot; }
  const p = d.p;
  // checks
  const problems = [];
  if (p[0] < bounds.min || p[0] > bounds.max || p[2] < bounds.min || p[2] > bounds.max || p[1] < -10) problems.push('outside the map');
  if (!d.air) {
    // (hopping up a step or onto the sofa it's above the lower floor for a moment: only a long way up counts)
    const floor = world.raycast([p[0], p[1] + 0.15, p[2]], [0, -1, 0], 1.6, 'solid');
    if (!floor) problems.push('no floor under it');
    // its middle inside something is wrong; its side brushing an edge (the nav grid has spots a few mm from a step's
    // riser) only counts as a graze
    const inside = overlapsAny(world.near(p, 1), p[0], p[1] + 0.06, p[2], 0.001, 0.16);
    if (inside) problems.push(`inside a wall ${JSON.stringify(inside.min)}..${JSON.stringify(inside.max)}`);
    else if (overlapsAny(world.near(p, 1), p[0], p[1] + 0.06, p[2], 0.03, 0.16)) grazes++;
  }
  if (problems.length) { if (bad < 12) console.log(`  ${(clock / 1000).toFixed(1)} s at ${p.map(v => v.toFixed(2))} (${STATE[d.state]}, ${d.then}): ${problems.join(', ')}`); bad++; }
  if (!d.path || !lastP || Math.hypot(p[0] - lastP[0], p[2] - lastP[2]) > 0.05) { lastMove = clock; lastP = p.slice(); }
  else if (d.path) {
    if (clock - lastMove > 5000 && stuckMax <= 5000) console.log(`  not moving for 5 s with a path at ${(clock / 1000).toFixed(1)} s: ${JSON.stringify(d)}`);
    stuckMax = Math.max(stuckMax, clock - lastMove);
  }
}
console.log(`${minutes} min on ${mapId}, doors ${doors}: ${bad} bad ticks, ${grazes} grazing an edge; longest stop while it had a path: ${(stuckMax / 1000).toFixed(1)} s`);
console.log('tick: avg', (thinkSum / ticks).toFixed(3), 'ms, max', thinkMax.toFixed(1), 'ms');
console.log('spots reached:', JSON.stringify(Object.fromEntries(visits)));
console.log('time in each state (s):', JSON.stringify(Object.fromEntries([...inState].map(([k, v]) => [k, Math.round(v / 1000)]))));
console.log('sounds:', sounds.length);
const st = cat.debug().stats;
console.log(`setup ${st.setup.toFixed(1)} ms; ${st.plans} paths (${st.fails} failed), avg ${(st.planMs / Math.max(1, st.plans)).toFixed(2)} ms, max ${st.planMax.toFixed(1)} ms; stopped by a door ${st.blocks.length} times ${JSON.stringify(st.blocks.slice(0, 5))}`);
process.exit(bad ? 1 : 0);
