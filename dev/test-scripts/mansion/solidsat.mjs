// The collision boxes (after breakables) containing a point (x, z) at any height: node solidsat.mjs x z [map]
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const [x, z] = process.argv.slice(2, 4).map(Number);
const world = new CollisionWorld(MAPS[process.argv[4] || 'cs_mansion']);
for (const b of world.solids) if (x > b.min[0] - 0.13 && x < b.max[0] + 0.13 && z > b.min[2] - 0.13 && z < b.max[2] + 0.13) console.log(b.min.map(v => v.toFixed(2)).join(' '), '|', b.max.map(v => v.toFixed(2)).join(' '), b.brk != null ? 'piece ' + b.brk : '', b.mat || '');
