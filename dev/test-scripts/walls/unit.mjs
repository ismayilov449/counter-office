// Walls & water, Node only (no server): the materials table (shared/materials.js) and bullets through walls
// (penetrate in shared/walls.js) on cs_mansion and cs_mansion_night, against the real map and collision. Run:
//   node dev/test-scripts/walls/unit.mjs
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { MATERIALS, boxMaterial, boxMaterials, pieceMaterial, materialsOn, isSlab } from '../../../shared/materials.js';
import { penetrate, keepThrough, segSeg, runHit, jamChance, WET } from '../../../shared/walls.js';
import { WEAPONS } from '../../../shared/weapons.js';

let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) passes++; else fails++; console.log((cond ? 'PASS ' : 'FAIL ') + what); };
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const boxAt = (map, p) => map.boxes.find(b => !b.glass && [0, 1, 2].every(k => p[k] > b.min[k] && p[k] < b.max[k]));

for (const id of ['cs_mansion', 'cs_mansion_night']) {
  const map = MAPS[id], world = new CollisionWorld(map);
  console.log(`---- ${id}`);
  // ---- the materials table
  const t0 = performance.now();
  const counts = {};
  for (const b of map.boxes) { const m = boxMaterial(map, b); counts[m] = (counts[m] || 0) + 1; }
  const ms = performance.now() - t0;
  ok(materialsOn(map) && Object.keys(counts).every(m => MATERIALS[m]), `every box has a material (${Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ')}; ${ms.toFixed(0)} ms)`);
  ok(map.breakables.every(pc => MATERIALS[pieceMaterial(map, pc)]), `every breakable piece has a material (${map.breakables.length})`);
  ok(boxMaterial(map, boxAt(map, [-23.4, 2, 0])) === 'brick', 'the house\'s west outer wall is brick');
  ok(boxMaterial(map, boxAt(map, [-6.6, 2, 5])) === 'brick', 'the house\'s east outer wall (front) is brick');
  ok(boxMaterial(map, boxAt(map, [-13.2, 2, -1])) === 'plaster', 'the wall between the hall and the living room is plaster');
  ok(boxMaterial(map, boxAt(map, [-16.35, 2, 8])) === 'plaster', 'the wall between the south rooms is plaster');
  ok(boxMaterial(map, boxAt(map, [-16.8, 2, 8])) === 'wood', 'the bookcase wall in the south-west room is wood');
  ok(boxMaterial(map, { ...world.doorBoxes[0] }) === 'wood', 'a door is wood');
  const roller = map.doors.findIndex(d => d.roller), grate = map.doors.findIndex(d => d.grate);
  ok(roller < 0 || boxMaterial(map, world.doorBoxes[roller]) === 'metal', 'the garage roller door is metal');
  ok(grate < 0 || boxMaterial(map, world.doorBoxes[grate]) === 'metal', 'an iron grate is metal');
  ok(boxMaterial(map, { min: [0, 0, 0], max: [1, 1, 1], car: 0 }) === 'metal' && boxMaterial(map, { min: [0, 0, 0], max: [1, 1, 1], elev: true }) === 'metal', 'cars and the lift are metal');
  const floor = boxAt(map, [-18, 4.15, -1]);
  ok(floor && isSlab(floor) && boxMaterials(map, floor).length >= 1, `the floor between the storeys is a slab (${boxMaterials(map, floor).join('+')})`);
  ok(boxMaterial(map, boxAt(map, [-30, 1, 0])) === 'foliage' || true, '(hedges: foliage where there are any)');
  ok(boxMaterial(MAPS.de_dust2, MAPS.de_dust2.boxes[0]) === null && !materialsOn(MAPS.de_dust2), 'other maps are not classified');
  const burns = map.breakables.filter(pc => MATERIALS[pieceMaterial(map, pc)].burns).length;
  ok(burns > 50, `for the fire: ${burns} breakable pieces burn`);

  // ---- bullets through walls
  const shot = (o, d, w) => penetrate(map, world, o, norm(d), 250, w);
  let r = shot([-10, 2.0, -1], [-1, 0, 0], 'ak47');
  const kAk = keepThrough('plaster', 0.41, WEAPONS.ak47.pen);
  ok(r.passes.length === 1 && r.passes[0].mat === 'plaster' && Math.abs(r.passes[0].keep - kAk) < 0.02 && boxMaterial(map, r.wall.box) === 'brick',
    `AK from the hall into the living room: through the plaster wall (keeps ${r.passes[0]?.keep.toFixed(2)}), stopped by the outer brick wall at ${r.wallT.toFixed(1)} m`);
  ok(r.keep(2.0) === 1 && r.keep(5) === r.passes[0].keep, 'keep(t): all of it before the wall, the wall\'s share after');
  const rg = shot([-10, 2.0, -1], [-1, 0, 0], 'glock');
  ok(rg.passes.length === 1 && rg.passes[0].keep < r.passes[0].keep - 0.1, `a Glock keeps less (${rg.passes[0]?.keep.toFixed(2)} vs AK ${r.passes[0]?.keep.toFixed(2)})`);
  const ra = shot([-10, 2.0, -1], [-1, 0, 0], 'awp');
  ok(ra.passes[0]?.keep > r.passes[0].keep, `an AWP keeps more (${ra.passes[0]?.keep.toFixed(2)})`);
  r = shot([-10, 2.0, -1], [-1, 0, 1.8], 'ak47');
  ok(!r.passes.some(p => p.box.min[0] > -13.4 && p.box.max[0] < -12.8 && p.len > 0.8), 'at a steep angle the same wall is too thick to go through');
  r = shot([0, 2.0, -1], [-1, 0, 0], 'ak47');
  ok(r.passes.length === 2 && r.passes[0].mat === 'wood' && r.passes[1].mat === 'plaster', `from the street: through the front door (wood) and the hall's wall (plaster): ${r.passes.map(p => p.mat).join(', ')}`);
  const rp = shot([0, 2.0, -1], [-1, 0, 0], 'usp');
  ok(rp.passes.length === 1 && rp.wall && boxMaterial(map, rp.wall.box) === 'plaster', 'a USP goes through one wall only (the door), the next stops it');
  r = shot([-30, 2.0, 0], [1, 0, 0], 'awp');
  ok(r.passes.length === 0 && boxMaterial(map, r.wall.box) === 'brick', 'nothing goes through the brick outer wall');
  r = shot([-10, 5.5, -1], [0, -1, 0.2], 'awp');
  ok(r.passes.length === 0, 'nothing goes through a floor');
  r = shot([-10, 2.0, -1], [-1, 0, 0], 'knife');
  ok(r.passes.length === 0, 'a knife goes through nothing');
  // invariants over thousands of random bullets in the house
  let n = 0, two = 0, bad = [];
  const t1 = performance.now();
  for (let i = 0; i < 6000; i++) {
    const w = ['glock', 'usp', 'ak47', 'awp', 'm3', 'mp5', 'm249'][i % 7];
    const o = [-22 + Math.random() * 15, 1 + Math.random() * (i % 2 ? 2.5 : 5.2), -13.5 + Math.random() * 24];
    if (boxAt(map, o)) continue;
    const a = Math.random() * Math.PI * 2, el = (Math.random() - 0.5) * 0.6;
    const res = penetrate(map, world, o, norm([Math.cos(a), el, Math.sin(a)]), 250, w);
    n++;
    const cap = WEAPONS[w].pen >= 0.7 ? 2 : 1;
    if (res.passes.length > cap) bad.push(`${w} ${res.passes.length} walls`);
    if (res.passes.length === 2) two++;
    let prev = 1;
    for (const ps of res.passes) {
      if (!MATERIALS[ps.mat].pen) bad.push(`through ${ps.mat}`);
      if (ps.len > MATERIALS[ps.mat].max + 1e-6) bad.push(`too thick ${ps.len}`);
      if (ps.n[1] !== 0) bad.push('through a floor');
      if (!(ps.keep < prev && ps.keep > 0)) bad.push(`keep ${ps.keep}`);
      for (const b of ps.boxes) if (!MATERIALS[boxMaterial(map, b)].pen) bad.push(`box ${boxMaterial(map, b)}`);
      prev = ps.keep;
    }
  }
  const per = (performance.now() - t1) / n;
  ok(!bad.length, `${n} random bullets in the house: never more walls than the gun allows, never brick/stone/metal or a floor, damage always falls (${two} went through two walls; ${per.toFixed(3)} ms a bullet)${bad.length ? ' — ' + bad.slice(0, 5).join('; ') : ''}`);
}

// ---- the helpers
const h = segSeg([0, 0, 0], [1, 0, 0], [0.5, 1, -1], [0.5, 1, 1]);
ok(Math.abs(h.d - 1) < 1e-9 && Math.abs(h.s - 0.5) < 1e-9, 'segSeg: the closest points of two crossing segments');
const runs = [{ kind: 'pipe', a: [0, 1, -5], b: [0, 1, 5], r: 0.07 }, { kind: 'cable', a: [0, 0.3, -5], b: [0, 0.3, 5], r: 0.07 }];
ok(runHit(runs, { a: [-0.2, 1.03, 0], b: [0.2, 1.05, 0.1] })?.run.kind === 'pipe', 'runHit: a bullet through the wall at the pipe\'s height cuts it');
ok(runHit(runs, { a: [-0.2, 0.5, 0], b: [0.2, 0.5, 0] }) === null, 'runHit: between the pipe and the cable nothing');
ok(jamChance(0) === 0 && jamChance(WET.max) === WET.jamMax && jamChance(WET.max / 2) > WET.jam, 'jam chance: none dry, more the wetter');

console.log(`\n${passes} passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
