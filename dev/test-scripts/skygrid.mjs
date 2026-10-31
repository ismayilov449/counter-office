// Mansion: where the mortar's "open sky" check passes, on a 1 m grid at ground level, and at each spawn.
const G = new URL('../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { skyOf } = await import(G + 'shared/maps/sky.js');
const map = MAPS[process.argv[2] || 'cs_mansion'];
const world = new CollisionWorld(map);
const sky = skyOf(map, world);
const FROM = +(process.argv[3] || 3.5); const floorAt = (x, z) => { const h = world.raycast([x, FROM, z], [0, -1, 0], 3, 'solid'); return h ? FROM - h.t : null; };
for (const team of ['T', 'CT']) for (const s of map.spawns[team]) console.log(team, s.p.map(v => v.toFixed(1)).join(','), 'open:', sky.open(s.p));
const { min, max } = map.bounds;
let rows = [];
for (let z = min; z <= max; z += 1) {
  let r = '';
  for (let x = min; x <= max; x += 1) {
    const y = floorAt(x, z);
    if (y == null) { r += ' '; continue; }
    r += Math.abs(x-(-17.8))<0.6&&Math.abs(z-6.7)<0.6 ? 'T' : sky.open([x, y, z]) ? '.' : '#';
  }
  rows.push(r);
}
console.log(rows.join('\n'));
// what covers a spawn
const s = map.spawns.T[0];
console.log('ground under T spawn 0 via sky.ground:', sky.ground(s.p[0], s.p[2], -99));
