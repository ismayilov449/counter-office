// (debug) what's under a few points: the floor below, the nav nodes near.  usage: node probe.mjs map x,y,z ...
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav } from '../../../lib/nav.js';
const [mapId, ...pts] = process.argv.slice(2);
const map = MAPS[mapId], world = new CollisionWorld(map), nav = buildNav(map, world);
for (const s of pts) {
  const p = s.split(',').map(Number);
  const hit = world.raycast([p[0], p[1] + 0.15, p[2]], [0, -1, 0], 6, 'solid');
  const n = nav.nodeAt(p, 1);
  console.log(s, 'floor below at', hit ? (p[1] + 0.15 - hit.t).toFixed(2) : 'none', hit?.box ? JSON.stringify([hit.box.min, hit.box.max]) : '', 'node', n, n >= 0 ? nav.pos(n) : '');
}
