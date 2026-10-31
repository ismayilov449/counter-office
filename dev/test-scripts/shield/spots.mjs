// No server needed: for every hostage on the hostage maps, the directions (k × 45°, yaw as in the game) from which a
// Terrorist standing 1 m away can face it (a body fits there; '+': 3 m beyond the hostage is open too, for a shooter).
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { overlapsAny, PLAYER } from '../../../shared/physics.js';
const fits = (w, p) => !overlapsAny(w.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height - 0.05);
for (const id of ['cs_mansion', 'cs_assault']) {
  const M = MAPS[id], w = new CollisionWorld(M);
  M.hostages.forEach((h, i) => {
    const out = [];
    for (let a = 0; a < 8; a++) {
      const yaw = (a * Math.PI) / 4, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const p = [h.p[0] - fx, h.p[1], h.p[2] - fz], q = [h.p[0] + fx * 3, h.p[1], h.p[2] + fz * 3];
      if (fits(w, p)) out.push(`${a}${fits(w, q) ? '+' : ''}`);
    }
    console.log(id, i, h.p.map(v => v.toFixed(2)).join(','), 'free:', out.join(' '));
  });
}
