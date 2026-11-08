// Walls & water (cs_mansion, cs_mansion_night): bullets go through wood and plaster (not brick, stone or metal),
// losing damage in every wall, at most one wall (two with a powerful gun). The holes they leave are see-through in
// the browser. Hidden water pipes and electric cables run in some walls (shared/maps/mansion_walls.js): a bullet
// through one bursts the pipe (it sprays and soaks the floor) or cuts the cable (it sparks; a spark in a wet patch
// electrocutes whoever stands in it while the power is on). Wet guns jam. Used by the server (lib/walls.js), the
// browser (public/js/walls.js) and the tests; the materials come from shared/materials.js.
import { MATERIALS, boxMaterial, materialsOn, isSlab } from './materials.js';
import { WEAPONS } from './weapons.js';

export const WALLS = {
  gap: 0.03, // boxes this close along a bullet's path are one wall (a wall is several chunks, some walls two slabs)
  power2: 0.7, // a gun with this armour penetration (WEAPONS[w].pen) or more goes through two walls
  // the browser's holes: how many are kept (oldest go first), how many are cut out at once (the nearest), how close
  // holes count as a cluster (a cluster's new holes come out bigger, up to `grow` x), and the furthest one is cut
  keep: 320, cut: 24, cluster: 0.12, grow: 2.6, far: 28,
};

// The share of a bullet's damage left after `len` metres of material `mat`, for a gun of armour penetration `pen`
// (an AWP keeps more than a Glock).
export function keepThrough(mat, len, pen = 0.5) {
  const M = MATERIALS[mat];
  if (!M?.pen) return 0;
  return Math.pow(Math.max(0.05, 1 - M.loss * (1.4 - pen)), Math.max(0.1, len) / 0.4);
}

// Where a ray leaves a box (the far side), from o going d.
export function exitT(b, o, d) {
  let t = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) continue;
    const tk = ((d[k] > 0 ? b.max[k] : b.min[k]) - o[k]) / d[k];
    if (tk < t) t = tk;
  }
  return t;
}

const at = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];

// A bullet from o along d (unit) for range metres, fired from weapon w, through the walls it can pass.
//   world: a CollisionWorld (the server's or the browser's); exceptCar: the shooter's own car.
// Returns { wall, wallT, passes, keep(t) }:
//   wall / wallT: what finally stops it (a raycast hit, or null) and how far (range when nothing does), like a plain
//   raycast would for a wall it can't go through;
//   passes: the walls it went through, in order: { t0, t1 (in and out along the ray), a, b (the points), n (the
//   side it went in through), mat, box (the first box), boxes (all of that wall's boxes it crossed), len (metres of
//   material), keep (the share of damage left after it, all walls so far) };
//   keep(t): the share of damage left at distance t along the ray (1 before the first wall).
export function penetrate(map, world, o, d, range, w, exceptCar = null) {
  const first = world.raycast(o, d, range, 'bullet', exceptCar);
  const res = { wall: first, wallT: first ? first.t : range, passes: [], keep: t => keepAt(res.passes, t) };
  const def = WEAPONS[w];
  if (!first || !def || def.melee || def.rocket || !materialsOn(map)) return res;
  const pen = def.pen ?? 0.5, cap = pen >= WALLS.power2 ? 2 : 1;
  let hit = first, keep = 1;
  while (hit && res.passes.length < cap) {
    // floors and ceilings stop it (and anything hit on its top or bottom: a table from above)
    if (hit.n[1] !== 0 || isSlab(hit.box)) break;
    const mat = boxMaterial(map, hit.box), M = MATERIALS[mat];
    if (!M?.pen) break;
    // through this box and whatever touches it along the way (one wall)
    const boxes = [hit.box];
    let t1 = exitT(hit.box, o, d), len = t1 - hit.t, blocked = false, next = null;
    for (let guard = 0; guard < 12; guard++) {
      const from = t1 + 0.002;
      if (from >= range) { next = null; break; }
      const h = world.raycast(at(o, d, from), d, range - from, 'bullet', exceptCar);
      next = h ? { ...h, t: h.t + from } : null;
      if (!next || next.t - t1 > WALLS.gap) break;
      const m2 = boxMaterial(map, next.box);
      if (!MATERIALS[m2]?.pen || isSlab(next.box)) { blocked = true; break; }
      boxes.push(next.box);
      const e = exitT(next.box, o, d);
      len += Math.max(0, e - Math.max(t1, next.t));
      t1 = Math.max(t1, e);
    }
    if (blocked || len > M.max) break;
    keep *= keepThrough(mat, len, pen);
    res.passes.push({ t0: hit.t, t1, a: at(o, d, hit.t), b: at(o, d, t1), n: hit.n, mat, box: hit.box, boxes, len, keep });
    res.wall = next;
    res.wallT = next ? next.t : range;
    hit = next;
  }
  return res;
}

function keepAt(passes, t) {
  let k = 1;
  for (const p of passes) if (p.t1 <= t + 1e-6) k = p.keep;
  return k;
}

// ---- the pipes and cables in the walls (their runs: shared/maps/mansion_walls.js)

// The closest two segments come (p1-q1 and p2-q2), and the points: { d, s, t, a, b }.
export function segSeg(p1, q1, p2, q2) {
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]], d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a < 1e-12 && e < 1e-12) { s = t = 0; }
  else if (a < 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = dot(d1, r);
    if (e < 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const A = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], B = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  return { d: Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), s, t, a: A, b: B };
}

// The pipe or cable a bullet's way through a wall (a pass from penetrate) cuts, if any: { run, i (the run's index),
// p (where on the run) }. runs: [{ kind: 'pipe' | 'cable', a, b, r }] (r: how close counts).
export function runHit(runs, pass) {
  let best = null;
  (runs || []).forEach((run, i) => {
    const h = segSeg(pass.a, pass.b, run.a, run.b);
    if (h.d <= run.r && (!best || h.s < best.s)) best = { run, i, p: h.b, s: h.s };
  });
  return best;
}

// ---- wet guns (the browser's: see public/js/walls.js): seconds of wetness you get, how much a gun can hold, and the
// chance a shot jams (from `jam` damp to `jamMax` soaked); clearing a jam with R takes `clear` seconds.
export const WET = {
  swim: 30, // swimming (your head under, or deep water): soaked
  wade: 14, // wading (water round your feet: the pool's edge, the flood, a fountain)
  puddle: 6, // standing in a soaked floor (lib/wetfloor.js)
  max: 30, // a gun holds this much (dries a second a second)
  jam: 0.04, jamMax: 0.14,
  clear: 0.7,
};
export const jamChance = wet => (wet <= 0 ? 0 : WET.jam + (WET.jamMax - WET.jam) * Math.min(1, wet / WET.max));
