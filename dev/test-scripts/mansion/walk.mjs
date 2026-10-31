// Walk a body through the world with the game's physics: node walk.mjs '[start]' '[[vx,vz,secs],...]' [crouch] [map]
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { movePlayer, ladderAt, ladderPull } = await import(G + 'shared/physics.js');
const map = MAPS[process.argv[5] || 'cs_mansion'];
const world = new CollisionWorld(map);
if (process.env.DOORS) world.setDoors(JSON.parse(process.env.DOORS));
const s = { p: JSON.parse(process.argv[2]), v: [0, 0, 0], onGround: true, crouch: process.argv[4] === '1' };
const legs = JSON.parse(process.argv[3]);
const dt = 1 / 60;
for (const [vx, vz, secs, vy = 0] of legs) {
  for (let t = 0; t < secs; t += dt) {
    s.v[0] = vx; s.v[2] = vz;
    const lad = ladderAt(map.ladders, s.p, 1.8);
    if (lad && vy) { s.v[1] = vy; movePlayer(s, dt, world.move(null, s.p, 3), 0); }
    else movePlayer(s, dt, world.move(null, s.p, 3));
    if (process.env.TRACE && Math.round(t * 60) % 15 === 0) console.log(t.toFixed(2), s.p.map(v => v.toFixed(2)).join(","), !!lad);
  }
  console.log('after leg', vx, vz, vy, '->', s.p.map(v => v.toFixed(2)).join(','), s.onGround ? 'ground' : 'air');
}
