// The creaky spots (shared/maps/mansion_stealth.js), no server needed: on both Mansion maps every spot is on a wooden
// floor (the footsteps' surface there), flat at its height y (the collision under all its corners), inside a room of the
// house; and on the stairs only the middle of a tread creaks: a body walking up each flight (at the game's step-up, the
// collision's step heights) along the middle steps on every creaky step, along the wall or the open side on none.
// node dev/test-scripts/stealth/creaks.mjs   (exit code 1 on any failure)
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { stealthOf, creakAt } from '../../../shared/stealth.js';
import { SurfaceGrid } from '../../../public/js/surfaces.js';
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); };

for (const id of ['cs_mansion', 'cs_mansion_night']) {
  const map = MAPS[id], S = stealthOf(map), world = new CollisionWorld(map), surf = new SurfaceGrid(map);
  console.log(`-- ${id}: ${S.creaks.length} creaky spots`);
  ok(S.creaks.length >= 12, `at least 12 spots (${S.creaks.length})`);
  const top = (x, z, y) => { const h = world.raycast([x, y + 0.5, z], [0, -1, 0], 1.5, 'solid'); return h ? y + 0.5 - h.t : null; };
  for (const c of S.creaks) {
    const [x1, z1, x2, z2] = c.box, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const corners = [[x1 + 0.02, z1 + 0.02], [x2 - 0.02, z1 + 0.02], [x1 + 0.02, z2 - 0.02], [x2 - 0.02, z2 - 0.02], [cx, cz]];
    const flat = corners.every(([x, z]) => Math.abs(top(x, z, c.y) - c.y) < 0.005);
    const wood = surf.at(cx, c.y + 0.01, cz) === 'wood';
    const room = map.rooms.some(r => cx > r.min[0] && cx < r.max[0] && cz > r.min[2] && cz < r.max[2] && c.y > r.min[1] - 0.1 && c.y < r.max[1]);
    ok(flat && wood && room && (c.k === 'step' || c.k === 'board'), `${c.name}: ${flat ? 'flat at ' + c.y : 'NOT flat'}, ${wood ? 'wood' : surf.at(cx, c.y + 0.01, cz)}, ${room ? 'in a room' : 'NOT in a room'}`);
  }
  // walking up the stairs: the hall's two flights and the cellar's (feet on the collision's steps)
  const walkUp = (x, z0, z1, y0) => {
    const hits = [];
    let y = y0, last = -1;
    for (let k = 0; k <= 400; k++) {
      const z = z0 + ((z1 - z0) * k) / 400;
      const t = top(x, z, y + 0.45); // (at most a step's height up, as movePlayer climbs)
      if (t != null && t <= y + 0.5) y = t;
      const i = creakAt(S.creaks, [x, y, z]);
      if (i >= 0 && i !== last) hits.push(S.creaks[i].name);
      last = i;
    }
    return hits;
  };
  const flights = [
    { name: 'hall stairs, north flight', z0: -3.2, z1: -8.6, y0: 0.813, wall: -12.5, open: -11.7, mid: -12.18, want: 2 },
    { name: 'hall stairs, south flight', z0: 0.0, z1: 5.4, y0: 0.813, wall: -12.5, open: -11.7, mid: -12.18, want: 3 },
    { name: 'cellar stairs (down)', z0: -9.9, z1: -5.3, y0: 0.813, wall: -15.15, open: -13.7, mid: -14.42, want: 3 },
  ];
  for (const f of flights) {
    const mid = walkUp(f.mid, f.z0, f.z1, f.y0), wall = walkUp(f.wall, f.z0, f.z1, f.y0), open = walkUp(f.open, f.z0, f.z1, f.y0);
    ok(mid.length === f.want && !wall.length && !open.length, `${f.name}: up the middle ${mid.length} creaks (${f.want}), along the wall ${wall.length}, along the other side ${open.length}`);
  }
}
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
