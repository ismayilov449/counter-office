// No server needed: the bots' standing paths (lib/nav.js) from each hostage to the rescue zone, and their ladders.
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav, smoothPath } from '../../../lib/nav.js';
for (const id of (process.env.MAPS || 'cs_mansion,cs_assault').split(',')) {
  const M = MAPS[id], world = new CollisionWorld(M), nav = buildNav(M, world);
  const R = M.zones.rescue, goal = [(R.min[0] + R.max[0]) / 2, M.spawns.CT[0].p[1], (R.min[1] + R.max[1]) / 2];
  for (const [hi, h] of M.hostages.entries()) {
    const from = nav.nodeAt(h.p), to = nav.nodeAt(goal, 6);
    for (const standing of [true, false]) {
      const nodes = from >= 0 && to >= 0 ? nav.path(from, to, standing) : null;
      const pts = nodes ? smoothPath(nav, nodes, world) : [];
      console.log(id, hi, 'standing', standing, 'from', from, 'to', to, nodes ? `${pts.length} pts, ladders at ${pts.map((w, i) => (w.ladder ? i + ':' + w.p.map(v => v.toFixed(1)).join(',') : null)).filter(Boolean).join(' ') || '-'}` : 'no path');
    }
  }
}
