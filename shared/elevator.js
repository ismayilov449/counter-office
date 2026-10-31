// The lift in the Mansion, shared by the server (lib/elevator.js) and the browsers (public/js/elevator.js). The shaft is
// part of the level (shared/maps/mansion_elevator.js, map.elevator); the cabin and the sliding doors are moving boxes
// both sides work out from the same state, so they agree without the server sending positions:
//   - the cabin's motion { y0, y1, t0, tb }: from floor height y0 at server time t0 (ms) towards y1, speeding up at a
//     m/s² to v m/s and slowing down the same way into the stop; tb (if set) is when an emergency brake (the blackout,
//     or someone in the way in the shaft) stopped it, at `brake` m/s², wherever it was.
//   - each door set [o, dir, t, dur]: its opening o (0 shut .. 1 open) at time t, sliding open (dir 1) or shut (-1) or
//     not at all (0), dur seconds for a whole stroke. Door set 0 is the cabin's, 1 + s the landing's at stop s.
// Riding: whatever is inside the cabin (or stands on its roof) moves up and down with it, by the cabin's change of height
// since the last step — the server does that for bots, hostages, drops, mines and satchels, each browser for its own
// player (so it's smooth at any frame rate) and for the others it draws (who are drawn a little in the past).

// v, a: top speed (m/s) and acceleration (m/s²); brake: the emergency brake (m/s²); door: seconds for the doors to slide;
// forced: the same, pried open; hold: seconds they stay open (soon: when someone is waiting); force: seconds of holding
// E to pry them; near: how far (m) from a floor the cabin may be for prying the doors to lead out; reach: how far (m) you
// reach a button or a door; headroom: what the cabin leaves (m) between its roof and the shaft's top when someone is up
// there (a crouching body and a little); give: seconds a trip someone is in the way of waits before it's given up.
export const ELEV = { v: 1, a: 1, brake: 2.5, door: 1.0, forced: 1.6, hold: 3.0, soon: 1.5, force: 3.0, near: 0.9, reach: 1.6, headroom: 0.95, give: 10 };

// Where the cabin's floor is at time t (ms): { y, v (m/s, + up), moving }.
export function motionAt(m, t) {
  const d = Math.abs(m.y1 - m.y0), s = m.y1 > m.y0 ? 1 : -1;
  if (d < 1e-9) return { y: m.y0, v: 0, moving: false };
  const A = ELEV.a;
  let vp = ELEV.v, ta = vp / A, da = (A * ta * ta) / 2, cruise = (d - 2 * da) / vp;
  if (cruise < 0) { vp = Math.sqrt(A * d); ta = vp / A; da = d / 2; cruise = 0; } // (a short trip never gets to full speed)
  const T = 2 * ta + cruise;
  const along = tau => {
    if (tau <= 0) return [0, 0];
    if (tau < ta) return [(A * tau * tau) / 2, A * tau];
    if (tau < ta + cruise) return [da + vp * (tau - ta), vp];
    if (tau < T) { const r = T - tau; return [d - (A * r * r) / 2, A * r]; }
    return [d, 0];
  };
  const tau = (t - m.t0) / 1000;
  if (m.tb) {
    const tb = (m.tb - m.t0) / 1000;
    if (tau > tb) {
      const [sb, vb] = along(tb), B = ELEV.brake, k = Math.min(tau - tb, vb / B);
      return { y: m.y0 + s * Math.min(d, sb + vb * k - (B * k * k) / 2), v: s * (vb - B * k), moving: tau - tb < vb / B };
    }
  }
  const [x, v] = along(tau);
  return { y: m.y0 + s * x, v: s * v, moving: tau < T };
}
// How long a trip from y0 to y1 takes (s), braking aside.
export function tripTime(y0, y1) {
  const d = Math.abs(y1 - y0), A = ELEV.a, V = ELEV.v;
  return d >= (V * V) / A ? d / V + V / A : 2 * Math.sqrt(d / A);
}

// A door set's opening at time t (ms).
export const doorAt = (d, t) => Math.max(0, Math.min(1, d[0] + (d[1] * (t - d[2])) / (d[3] * 1000)));

export const ceilAt = (E, y) => y + E.cabin.ceil;
export const roofAt = (E, y) => y + E.cabin.ceil + E.cabin.roof;
// The stop the cabin is nearest, and how far from it: { s, d }.
export function nearestStop(E, y) {
  let s = 0;
  E.stops.forEach((h, i) => { if (Math.abs(h - y) < Math.abs(E.stops[s] - y)) s = i; });
  return { s, d: Math.abs(E.stops[s] - y) };
}
// Over the shaft's floor area (a body's middle), anywhere from the pit up.
export const inShaft = (E, p) => p[0] > E.shaft.x1 && p[0] < E.shaft.x2 && p[2] > E.shaft.z1 && p[2] < E.shaft.z2 && p[1] > E.pit - 0.5 && p[1] < E.top;
// In the cabin with the cabin's floor at y: feet over its floor, from `below` under it to near its ceiling.
export function inCabin(E, y, p, below = 0.1) {
  const c = E.cabin, w = c.wall - 0.03;
  return p[0] > c.x1 + w && p[0] < c.x2 - w && p[2] > c.z1 + w && p[2] < c.z2 + 0.02 && p[1] > y - below && p[1] < y + c.ceil - 0.2;
}
// Standing on the cabin's roof (within tol of it).
export const onRoof = (E, y, p, tol = 0.12) => inShaft(E, p) && Math.abs(p[1] - roofAt(E, y)) < tol;

// ---- the moving boxes: the cabin (floor, walls, the front either side of its doorway and over it, the roof round the
// hatch and the hatch's lid) and each door set's four panels (telescopic: two each side, the inner one sliding twice as
// far, so they fold away behind a narrow strip of wall). Box objects are made once and moved (they sit in the collision
// world's `elev` list). Door panels: inside the cabin's front for the cabin's; in the thickness of the shaft's wall for
// the landings'.
const box = extra => ({ min: [0, 0, 0], max: [0, 0, 0], mat: 'none', elev: true, ...extra });
const put = (b, x1, y1, z1, x2, y2, z2) => { b.min[0] = x1; b.min[1] = y1; b.min[2] = z1; b.max[0] = x2; b.max[1] = y2; b.max[2] = z2; };
const away = b => put(b, b.min[0], -1000, b.min[2], b.min[0], -1000, b.min[2]);
export function makeBoxes() {
  const cabin = Array.from({ length: 12 }, () => box());
  const doors = [0, 1, 2, 3].map(k => Array.from({ length: 4 }, (_, i) => box({ elevDoor: k, panel: i })));
  return { cabin, doors, all: [...cabin, ...doors.flat()] };
}
// The cabin's boxes for its floor at y (hatch: open or shut).
export function placeCabin(E, B, y, hatch) {
  const c = E.cabin, D = E.door, H = E.hatch, w = c.wall, top = y + c.ceil, roof = top + c.roof, [f, we, ea, no, fl, fr, li, rs, rw, re, rn, lid] = B.cabin;
  put(f, c.x1, y - c.floor, c.z1, c.x2, y, c.z2);
  put(we, c.x1, y, c.z1, c.x1 + w, top, c.z2);
  put(ea, c.x2 - w, y, c.z1, c.x2, top, c.z2);
  put(no, c.x1 + w, y, c.z1, c.x2 - w, top, c.z1 + w);
  put(fl, c.x1 + w, y, c.z2 - w, D.x1, top, c.z2);
  put(fr, D.x2, y, c.z2 - w, c.x2 - w, top, c.z2);
  put(li, D.x1, y + D.h, c.z2 - w, D.x2, top, c.z2);
  put(rs, c.x1, top, H.z2, c.x2, roof, c.z2);
  put(rw, c.x1, top, c.z1, H.x1, roof, H.z2);
  put(re, H.x2, top, c.z1, c.x2, roof, H.z2);
  put(rn, H.x1, top, c.z1, H.x2, roof, H.z1);
  if (hatch) away(lid); else put(lid, H.x1, top, H.z1, H.x2, roof, H.z2);
}
// The four panels of door set k (0 the cabin's, its floor at y; 1 + s a landing's) at opening o: [left inner, left
// outer, right inner, right outer]. Their z: [inner z1, z2, outer z1, z2].
export function panelZ(E, k) {
  if (k === 0) { const z = E.cabin.z2 - E.cabin.wall; return [z - 0.065, z - 0.035, z - 0.035, z - 0.005]; }
  const z = E.shaft.z2;
  return [z + 0.03, z + 0.06, z + 0.06, z + 0.09];
}
export function placeDoor(E, B, k, y, o) {
  const D = E.door, half = (D.x2 - D.x1) / 2, C = D.x1 + half, pw = half / 2 + 0.01, y0 = k === 0 ? y : E.stops[k - 1], y1 = y0 + D.h - 0.005;
  const [ia, ib, oa, ob] = panelZ(E, k), [la, lb, ra, rb] = B.doors[k];
  put(la, C - pw - half * o, y0, ia, C - half * o, y1, ib);
  put(lb, D.x1 - pw * o, y0, oa, D.x1 + pw - pw * o, y1, ob);
  put(ra, C + half * o, y0, ia, C + pw + half * o, y1, ib);
  put(rb, D.x2 - pw + pw * o, y0, oa, D.x2 + pw * o, y1, ob);
}
// The doorway in front of door set k (from the cabin's door panels to the landing's): whoever stands in the doors' way
// keeps them from shutting (not someone waiting just outside, or inside near them).
export function doorway(E, k, y) {
  const D = E.door, y0 = k === 0 ? y : E.stops[k - 1];
  return { min: [D.x1 - 0.02, y0, panelZ(E, 0)[0] + 0.005], max: [D.x2 + 0.02, y0 + D.h, E.out.z2 - 0.04] };
}
// The shaft's ladder (drawn the whole way up) is climbable only where the cabin isn't: under its floor and over its roof
// — two ladders that move with it. Only the browsers have them (in map.ladders); bots never go into the shaft.
export function makeLadders(E) {
  const L = E.ladder, mk = () => ({ min: [L.x, 0, L.z1], max: [L.x + 0.5, 0, L.z2], n: [1, 0], elev: true });
  return [mk(), mk()];
}
export function placeLadders(E, [lo, hi], y) {
  lo.min[1] = E.pit; lo.max[1] = Math.max(E.pit, y - E.cabin.floor - 0.05);
  hi.min[1] = Math.min(E.ladder.top, roofAt(E, y)); hi.max[1] = E.ladder.top;
}
// Where climbing out of the hatch puts you: on the roof beside it, by the doors (off the ladder).
export const roofSpot = (E, y) => [(E.door.x1 + E.door.x2) / 2 + 0.05, roofAt(E, y) + 0.001, (E.hatch.z2 + E.cabin.z2) / 2];
// And dropping back in: the middle of the cabin's floor.
export const cabinSpot = (E, y) => [(E.cabin.x1 + E.cabin.x2) / 2, y + 0.001, (E.cabin.z1 + E.cabin.z2) / 2];

// A body (feet p, radius r, height h) overlapping a box?
export const touches = (b, p, r = 0.35, h = 1.8) => p[0] + r > b.min[0] && p[0] - r < b.max[0] && p[2] + r > b.min[2] && p[2] - r < b.max[2] && p[1] + h > b.min[1] && p[1] < b.max[1];

// ---- What E does where you look (the browser works it out for the hint and tells the server, which checks it):
//   'c0'..'c2' a landing's call button (in front of the shaft; with the power off, its doors: 'l0'..'l2' to pry them)
//   'b0'..'b2' a button on the cabin's panel, 'h' the roof hatch (from inside, or from the roof back down), 'f' the
//   cabin's doors (open them; between floors or in a blackout: pry them), 'l0'..'l2' a landing's doors from the shaft.
export function aimAt(E, y, feet, eye, dir, power = true) {
  const hit = (axis, at, reach = ELEV.reach) => {
    if (Math.abs(dir[axis]) < 1e-6) return null;
    const t = (at - eye[axis]) / dir[axis];
    return t > 0 && t < reach ? [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t] : null;
  };
  const D = E.door, H = E.hatch, inDoor = (q, y0) => q && q[0] > D.x1 && q[0] < D.x2 && q[1] > y0 && q[1] < y0 + D.h;
  const inHatch = (q, m) => q && q[0] > H.x1 - m && q[0] < H.x2 + m && q[2] > H.z1 - m && q[2] < H.z2 + m;
  if (inCabin(E, y, feet, 0.3)) {
    const q = dir[0] > 0 ? hit(0, E.panel.x) : null;
    if (q && Math.abs(q[2] - E.panel.z) < 0.07) {
      let best = -1;
      E.panel.ys.forEach((h, s) => { if (Math.abs(q[1] - y - h) < 0.065 && (best < 0 || Math.abs(q[1] - y - h) < Math.abs(q[1] - y - E.panel.ys[best]))) best = s; });
      if (best >= 0) return 'b' + best;
    }
    if (dir[1] > 0 && inHatch(hit(1, ceilAt(E, y)), 0.15)) return 'h';
    if (dir[2] > 0 && inDoor(hit(2, panelZ(E, 0)[0]), y)) return 'f';
    return null;
  }
  if (inShaft(E, feet)) {
    // (the hatch is at your feet: standing, your eyes are 1.62 m over it, more than the reach)
    if (Math.abs(feet[1] - roofAt(E, y)) < 0.3 && dir[1] < 0 && inHatch(hit(1, roofAt(E, y), ELEV.reach + 0.6), 0.2)) return 'h';
    if (dir[2] > 0) { const q = hit(2, E.shaft.z2); for (let s = 0; s < E.stops.length; s++) if (inDoor(q, E.stops[s])) return 'l' + s; }
    return null;
  }
  if (dir[2] >= 0 || eye[2] < E.out.z2) return null;
  const q = hit(2, E.out.z2);
  if (!q) return null;
  for (let s = 0; s < E.stops.length; s++) {
    const b = E.call[s];
    if (Math.abs(q[0] - b[0]) < 0.12 && Math.abs(q[1] - b[1]) < 0.15) return 'c' + s;
    if (inDoor(q, E.stops[s])) return power ? 'c' + s : 'l' + s;
  }
  return null;
}
