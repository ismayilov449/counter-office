// Nav links that drop through a floor: a link between nodes more than 1.5 m apart in height where a solid lies
// between them (between the two heights at the midpoint). Lists them by area.
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { buildNav } = await import(G + 'lib/nav.js');
const map = MAPS[process.argv[2] || 'cs_mansion'];
const world = new CollisionWorld(map);
const t0 = Date.now();
const nav = buildNav(map, world);
console.log('nav', nav.count, 'nodes', Date.now() - t0, 'ms');
let bad = 0;
for (let n = 0; n < nav.count; n++) for (let k = 0; k < 8; k++) {
  const m = nav.link[n * 8 + k];
  if (m < 0) continue;
  const [a, b] = nav.Y[n] > nav.Y[m] ? [n, m] : [m, n];
  if (nav.Y[a] - nav.Y[b] < 1.5) continue;
  const x = nav.X[b], z = nav.Z[b];
  const block = world.solids.find(s => x > s.min[0] && x < s.max[0] && z > s.min[2] && z < s.max[2] && s.min[1] < nav.Y[a] - 0.05 && s.max[1] > nav.Y[b] + 0.05);
  if (block && bad++ < 15) console.log('through floor:', nav.pos(a).map(v => v.toFixed(2)).join(','), '->', nav.pos(b).map(v => v.toFixed(2)).join(','), 'box', block.min.map(v => v.toFixed(2)).join(','), block.max.map(v => v.toFixed(2)).join(','));
}
console.log('links through floors:', bad);
