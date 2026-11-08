// Stealth & hiding (ROADMAP group 4): what the server (lib/stealth.js) and the browsers (public/js/stealth.js) both
// need. The geometry (the chimney, the creaking boards) is in shared/maps/mansion_stealth.js, found through the map's
// { type: 'stealth' } decor entry. Snapshot key `st` (only while there's something to say):
//   st: { f: 1 while the fireplace burns, s: [[player id, seconds of soot left], ...], k: [[player id, car id], ...] }
// Messages: { t: 'stTo', p, c } (the server put you somewhere: into the chimney from its top, out of a trunk),
// { t: 'stSfx', s, p } (a sound at a spot: 'trunk' (a lid), 'light' (a fire being lit)).
import { carForward } from './vehicles.js';

export const STEALTH = {
  // 4.1 the chimney
  soot: 20, // seconds of black footprints after leaving the flue
  sootFrom: 0.5, // you get sooty once your feet are this far up the flue (crawling into the firebox doesn't)
  light: 2, // seconds of holding E at the hearth to light the fire
  lightReach: 1.4, // how far from the middle of the hearth's front you can light it (m)
  burn: { tick: 0.5, fire: 20, flue: 10 }, // damage per second in the firebox's flames / higher up the flue, every tick s
  roundless: 90, // without rounds (warmup, Deathmatch, Gun Game) a fire goes out after this many seconds
  topReach: 1.3, // E within this of the flue's middle, on the roof by the stack, climbs in
  // 4.2 creaking boards: a creak each time someone steps onto a creaky spot, and every `again` metres on it
  again: 0.7,
  // 4.3 the trunk
  trunk: {
    reach: 1.5, // E within this of the middle of the rear bumper (and behind the back seats) climbs in
    behind: 1.4, // how far behind the car's middle you must be (m), so the doors' E still works from the sides
    maxSpeed: 1.5, // not into a moving car
    at: -1.6, // where the hider lies: this far along the car (m, from its middle; negative: towards the back)
    low: -0.2, // and this far above the car's base, under the bullets' line (they stop at the body below the windows)
  },
};

// The map's stealth data ({ chimney, creaks }) or null (only the Mansion maps have it).
export function stealthOf(map) {
  if (!map) return null;
  if (!('_stealth' in map)) Object.defineProperty(map, '_stealth', { value: map.decor?.find(d => d.type === 'stealth') || null, enumerable: false });
  return map._stealth;
}

// ---- the chimney
// Inside the flue (or the firebox, behind its mouth), for a body at feet p: its middle over the flue.
export function inFlue(C, p) {
  return p[0] > C.fx1 && p[0] < C.fx2 && p[2] > C.z1 - 0.05 && p[2] < C.fz2 && p[1] > C.floor - 0.3 && p[1] < C.top + 0.3;
}
// Up the flue far enough to get sooty (and burned by the heat rather than the flames).
export function upFlue(C, p) {
  return inFlue(C, p) && p[1] > C.hearth + STEALTH.sootFrom;
}
// In the firebox's flames: crouched in its mouth or standing at its back, low down.
export function inFirebox(C, p) {
  return p[0] > C.fx1 - 0.3 && p[0] < C.fx2 + 0.3 && p[2] > C.z1 - 0.3 && p[2] < C.fz2 && p[1] < C.mouth && p[1] > C.floor - 0.3;
}
// Where you stand to light it: in front of the hearth, on the living room's floor (not in the firebox).
export const hearthFront = C => [(C.fx1 + C.fx2) / 2, C.floor, C.z1 - 0.45];
export function atHearth(C, p) {
  const f = hearthFront(C);
  return Math.hypot(p[0] - f[0], p[2] - f[2]) < STEALTH.lightReach && Math.abs(p[1] - C.floor) < 0.5 && p[2] < C.z1 - 0.1;
}
// On the roof by the stack (E climbs in at the top).
export function atTop(C, p) {
  const cx = (C.fx1 + C.fx2) / 2, cz = (C.fz1 + C.fz2) / 2;
  return Math.hypot(p[0] - cx, p[2] - cz) < STEALTH.topReach + 0.5 && p[1] > C.top - 2.2 && p[1] < C.top + 0.5 && !inFlue(C, p);
}
// Where E at the top puts you: on the rungs just under the rim, against the south wall.
export function topSpot(C) {
  const [lx, lz, , , ltop] = C.ladder;
  return [lx, ltop - 0.3, Math.min(lz - 0.36, (C.fz1 + C.fz2) / 2 + 0.05)];
}
// The flue's rungs as a map ladder ({ min, max, n }, as builder.ladder makes them); `off`: taken away (a fire burns).
export function chimneyLadder(C, off = false) {
  const [x, z, n, y0, y1, w] = C.ladder, d = 0.5, hw = w / 2;
  const [x1, x2] = n[0] ? [Math.min(x, x + n[0] * d), Math.max(x, x + n[0] * d)] : [x - hw, x + hw];
  const [z1, z2] = n[1] ? [Math.min(z, z + n[1] * d), Math.max(z, z + n[1] * d)] : [z - hw, z + hw];
  return off ? { min: [x1, -1000, z1], max: [x2, -1000, z2], n, chimney: true } : { min: [x1, y0, z1], max: [x2, y1, z2], n, chimney: true };
}

// ---- creaking boards: the creaky spot under someone's feet (index into creaks), or -1
export function creakAt(creaks, p) {
  for (let i = 0; i < creaks.length; i++) {
    const c = creaks[i], [x1, z1, x2, z2] = c.box;
    if (p[0] > x1 && p[0] < x2 && p[2] > z1 && p[2] < z2 && Math.abs(p[1] - c.y) < 0.15) return i;
  }
  return -1;
}

// ---- the trunk (cars only, not the pickup)
const T = STEALTH.trunk;
export const hasTrunk = c => !!c && (c.type || 'car') === 'car';
// The middle of the rear bumper, at the car's base.
export function trunkBack(c) {
  const f = carForward(c.yaw);
  return [c.p[0] - f[0] * 2.2, c.p[1], c.p[2] - f[2] * 2.2];
}
// Where the hider is kept (the server's position for them: hidden inside the car's body).
export function trunkPos(c) {
  const f = carForward(c.yaw);
  return [c.p[0] + f[0] * T.at, c.p[1] + T.low, c.p[2] + f[2] * T.at];
}
// The eye in the trunk (the browser's camera): over the hider, under the lid, looking out the back.
export function trunkEye(c) {
  const f = carForward(c.yaw);
  return [c.p[0] - f[0] * 1.95, c.p[1] + 0.95, c.p[2] - f[2] * 1.95];
}
// Close enough behind the car to climb into its trunk.
export function atTrunk(c, p) {
  if (!hasTrunk(c)) return false;
  const f = carForward(c.yaw), b = trunkBack(c);
  const along = (p[0] - c.p[0]) * f[0] + (p[2] - c.p[2]) * f[2];
  return along < -T.behind && Math.hypot(p[0] - b[0], p[2] - b[2]) < T.reach && Math.abs(p[1] - c.p[1]) < 1.2;
}
// Where to get out: behind the car, then beside its back end, then the sides, then in front (feet at the car's base).
export function trunkExits(c) {
  const f = carForward(c.yaw), r = [-f[2], 0, f[0]];
  return [[0, -3.0], [1.4, -1.9], [-1.4, -1.9], [1.7, 0], [-1.7, 0], [0, 3.2]].map(([s, a]) => [c.p[0] + r[0] * s + f[0] * a, c.p[1], c.p[2] + r[2] * s + f[2] * a]);
}
