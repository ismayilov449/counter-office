// Floodgate: swimming in the flood with the game's own physics and collision (as the browser does it: in water you're
// slower, Space rises at 3.2 m/s), no server or browser needed: node swim.mjs
// The flood's boxes are added to map.water at a fixed level, as public/js/flood.js does it.
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { movePlayer, inWater, PLAYER } = await import(G + 'shared/physics.js');
const { makeFloodBoxes, setFloodBoxes, underWater } = await import(G + 'shared/flood.js');
const map = MAPS.cs_mansion;
const world = new CollisionWorld(map);
const boxes = makeFloodBoxes();
map.water.push(...boxes);
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const dt = 1 / 60;

// legs: [vx, vz, seconds, space]; returns the state, logs each leg
function swim(level, start, legs) {
  setFloodBoxes(boxes, level);
  const s = { p: start.slice(), v: [0, 0, 0], onGround: false, crouch: false };
  let breath = 0, under = 0;
  for (const [vx, vz, secs, space = 0] of legs) {
    for (let t = 0; t < secs; t += dt) {
      const wet = inWater(map.water, s.p);
      s.v[0] = vx * (wet ? 0.7 : 1); s.v[2] = vz * (wet ? 0.7 : 1);
      if (wet && space) { s.v[1] = Math.max(s.v[1], 3.2); s.onGround = false; }
      movePlayer(s, dt, world.move(null, s.p, 3));
      const eye = [s.p[0], s.p[1] + PLAYER.eye, s.p[2]];
      if (underWater(level, eye)) under += dt; else breath += dt;
    }
  }
  s.head = underWater(level, [s.p[0], s.p[1] + PLAYER.eye, s.p[2]]) ? 'under' : 'out';
  s.where = s.p.map(v => v.toFixed(2)).join(', ');
  s.under = under; s.breath = breath;
  return s;
}

// the full cellar (-0.45): standing on the floor the head is under; Space brings it out (against the ceiling)
let s = swim(-0.45, [-15.5, -2.2, 1.5], [[0, 0, 1]]);
check(s.head === 'under' && s.p[1] < -2.1, `full cellar, standing on the floor: head ${s.head} (feet ${s.where})`);
s = swim(-0.45, [-15.5, -2.2, 1.5], [[0, 0, 1], [0, 0, 2, 1]]);
check(s.head === 'out', `holding Space: head ${s.head} (feet ${s.where})`);
// and out: swim north-east to the stairs (under the closet's wall) and walk up them
const dir = (dx, dz, v = 4) => { const l = Math.hypot(dx, dz); return [(dx / l) * v, (dz / l) * v]; };
s = swim(-0.45, [-15.5, -2.2, 1.5], [[0, 0, 0.5], [0, 0, 1.5, 1], [...dir(1.1, -8), 3, 1], [...dir(0, -1), 3, 1], [...dir(0, -1), 2]]);
check(s.p[1] > -0.45 && s.p[2] < -5.6 && !inWater(map.water, s.p), `swam to the stairs and walked out: ${s.where}`);
// the drain full (level -2.2): no air under its ceiling; swim to the street shaft and up it with Space: head out
s = swim(-2.2, [12, -5.0, -2.0], [[0, 0, 0.5], [0, 0, 1, 1]]);
check(s.head === 'under', `the drain full: head ${s.head} even against the ceiling (${s.where})`);
s = swim(-2.2, [12, -5.0, -2.0], [[0, 0, 0.3], [4, 0, 3.5, 0], [4, 0, 2, 1], [0, 0, 1.5, 1]]);
check(s.head === 'out' && s.p[0] > 25.9, `swam along the drain (${s.under.toFixed(1)} s under) and up the street shaft: head ${s.head} (${s.where})`);
// the tunnel at full (-0.45): a thin pocket of air under its ceiling
s = swim(-0.45, [0, -2.2, 5.65], [[0, 0, 0.3], [0, 0, 1.5, 1]]);
check(s.head === 'out', `the tunnel full, Space: head ${s.head} in the air pocket (feet ${s.where})`);
// the pool still works (its own water box)
setFloodBoxes(boxes, -4.88);
s = swim(-4.88, [-40, -2.0, -12], [[0, 0, 0.3], [0, 0, 2, 1]]);
check(s.p[1] > -0.4, `the pool, untouched: swims up to its surface (bobbing: ${s.where})`);
console.log(`\n${checks.filter(Boolean).length}/${checks.length} passed`);
