// Swims with the game's physics (as the browser does it: in water you're slower, Space rises at 3.2 m/s):
// node swim.mjs '[start]' '[[vx, vz, secs, space(0/1)], ...]' [map]
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { movePlayer, inWater } = await import(G + 'shared/physics.js');
const map = MAPS[process.argv[4] || 'cs_mansion'];
const world = new CollisionWorld(map);
const s = { p: JSON.parse(process.argv[2]), v: [0, 0, 0], onGround: false, crouch: false };
const dt = 1 / 60;
for (const [vx, vz, secs, space = 0] of JSON.parse(process.argv[3])) {
  let wetTime = 0;
  for (let t = 0; t < secs; t += dt) {
    const wet = inWater(map.water, s.p);
    if (wet) wetTime += dt;
    s.v[0] = vx * (wet ? 0.7 : 1); s.v[2] = vz * (wet ? 0.7 : 1);
    if (wet && space) { s.v[1] = Math.max(s.v[1], 3.2); s.onGround = false; }
    movePlayer(s, dt, world.move(null, s.p, 3));
  }
  console.log('after leg', vx, vz, space ? 'space' : '', '->', s.p.map(v => v.toFixed(2)).join(','), s.onGround ? 'ground' : 'air', inWater(map.water, s.p) ? 'in water' : 'dry', 'wet for', wetTime.toFixed(1), 's');
}
