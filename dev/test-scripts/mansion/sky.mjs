// Sky checks at points: open?, where a shell lands (ground), and roof pieces over it. node sky.mjs '[[x,y,z],...]' [map]
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { skyOf } = await import(G + 'shared/maps/sky.js');
const map = MAPS[process.argv[3] || 'cs_mansion'];
const world = new CollisionWorld(map);
const sky = skyOf(map, world);
for (const p of JSON.parse(process.argv[2])) {
  console.log(p.join(','), 'open:', sky.open(p), 'shell lands at y =', sky.ground(p[0], p[2], 'none')?.toFixed?.(2), 'roofOver:', JSON.stringify(sky.roofOver(p)));
}
