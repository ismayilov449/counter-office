// cs_meridian, offline (no server): every spawn and hostage stands on a floor in free space; the bots' nav grid
// reaches every hostage from the CT spawn and the T spawn from the CT spawn, by walking (stairs) and, separately, a
// standing route a hostage can follow out to the rescue zone. node dev/test-scripts/meridian/check.mjs
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { overlapsAny, PLAYER } from '../../../shared/physics.js';
import { buildNav, smoothPath } from '../../../lib/nav.js';
const M = MAPS.cs_meridian, w = new CollisionWorld(M);
let fails = 0;
const ok = (what, c) => { console.log((c ? 'OK   ' : 'FAIL ') + what); if (!c) fails++; };
const floorUnder = p => { const h = w.raycast([p[0], p[1] + 0.5, p[2]], [0, -1, 0], 1.5, 'solid'); return h ? p[1] + 0.5 - h.t : null; };
const free = p => !overlapsAny(w.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height - 0.05);
for (const [team, list] of Object.entries(M.spawns)) list.forEach((s, i) => {
  const f = floorUnder(s.p);
  ok(`${team} spawn ${i} on a floor (${f?.toFixed(2)} vs ${s.p[1]}) and free`, f != null && Math.abs(f - s.p[1]) < 0.15 && free([s.p[0], f, s.p[2]]));
});
M.hostages.forEach((h, i) => { const f = floorUnder(h.p); ok(`hostage ${i} on a floor (${f?.toFixed(2)}) and free`, f != null && Math.abs(f - h.p[1]) < 0.15 && free([h.p[0], f, h.p[2]])); });
const t0 = performance.now(), nav = buildNav(M, w);
console.log(`nav: ${(performance.now() - t0).toFixed(0)} ms`);
const route = (a, b, standing) => { const f = nav.nodeAt(a, 4), t = nav.nodeAt(b, 4); const n = f >= 0 && t >= 0 ? nav.path(f, t, standing) : null; return n ? smoothPath(nav, n, w) : null; };
const ct = M.spawns.CT[0].p, tsp = M.spawns.T[0].p, street = [0, 0, 18];
M.hostages.forEach((h, i) => {
  const r = route(ct, h.p, false);
  ok(`CT spawn -> hostage ${i} (${r ? r.length + ' points, ends y ' + r.at(-1).p[1].toFixed(1) : 'none'})`, !!r && Math.abs(r.at(-1).p[1] - h.p[1]) < 0.6);
  const back = route(h.p, street, true);
  ok(`hostage ${i} -> the street, a route it can follow (${back ? back.length + ' points' : 'none'})`, !!back && back.at(-1).p[2] > 12);
});
const tr = route(ct, tsp, false);
ok(`CT spawn -> T spawn in the penthouse (${tr ? tr.length + ' points' : 'none'})`, !!tr && Math.abs(tr.at(-1).p[1] - tsp[1]) < 0.6);
const ladderUsed = route([-26, 0, 0], [-20, 8, 0], false);
ok(`the fire escape: side street -> 3rd-floor corridor (${ladderUsed ? ladderUsed.some(p => p.ladder) ? 'by the ladder' : 'another way' : 'none'})`, !!ladderUsed);
console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
