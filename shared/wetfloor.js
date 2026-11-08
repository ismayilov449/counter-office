// Wet floors (Walls & water; meant to be reused by the fire hose): a soaked patch of floor is a disc of water on a
// floor, cut off at a wall it lies against (so it stays on its side), growing while water feeds it. A spark near a wet
// patch electrocutes whoever stands in it while the power is on. The server owns the patches (lib/wetfloor.js) and
// sends them in the snapshot (`wa`, see lib/walls.js); the browser draws them (public/js/wetfloor.js).
//
// A patch: { p: [x, y, z] (its middle, y the floor's top), r (radius), clip: [axis, at, sign] or null (it lies on the
// side of the plane pos[axis] = at that `sign` points to), live (it was shocked a moment ago) }.
export const WETFLOOR = {
  start: 0.3, // a new patch's radius (m)
  flow: 0.32, // m² of floor a jet soaks per second at full flow
  max: 2.2, // the biggest a patch grows
  most: 14, // patches at once (the oldest dries)
  feet: 0.25, // how far over a patch's floor your feet can be and still be in it
  reach: 0.6, // how far past a patch's edge a spark still reaches its water
  above: 2.2, // and how high above its floor
  shock: 35, // damage of one shock (armour doesn't help); electrocution kills outright (no downed state)
  every: 0.6, // seconds between two shocks of the same person
};

// Is the point on the patch's side of its wall (with a little slack)?
export const sideOf = (pt, p, slack = 0.05) => !pt.clip || (p[pt.clip[0]] - pt.clip[1]) * pt.clip[2] > -slack;

// Standing in a patch: feet over it, near its floor, on its side of the wall.
export function inPatch(pt, feet) {
  if (Math.abs(feet[1] - pt.p[1]) > WETFLOOR.feet || feet[1] < pt.p[1] - 0.1) return false;
  return Math.hypot(feet[0] - pt.p[0], feet[2] - pt.p[2]) < pt.r && sideOf(pt, feet);
}

// Does a spark at `s` reach the patch's water (on its side, low enough, near enough to its edge)?
export function sparkReaches(pt, s) {
  if (s[1] < pt.p[1] - 0.3 || s[1] > pt.p[1] + WETFLOOR.above) return false;
  return Math.hypot(s[0] - pt.p[0], s[2] - pt.p[2]) < pt.r + WETFLOOR.reach && sideOf(pt, s, 0.15);
}

// The radius after `area` m² more water (the soaked area grows, not the radius).
export const grown = (r, area) => Math.min(WETFLOOR.max, Math.sqrt(r * r + Math.max(0, area) / Math.PI));

// The snapshot's form of a patch: [x, y, z, r, clip axis (-1: none), clip at, clip sign, live 1/0], and back.
const r2 = v => Math.round(v * 100) / 100;
export const packPatch = pt => [r2(pt.p[0]), r2(pt.p[1]), r2(pt.p[2]), r2(pt.r), pt.clip ? pt.clip[0] : -1, pt.clip ? r2(pt.clip[1]) : 0, pt.clip ? pt.clip[2] : 0, pt.live ? 1 : 0];
export const unpackPatch = a => ({ p: [a[0], a[1], a[2]], r: a[3], clip: a[4] >= 0 ? [a[4], a[5], a[6]] : null, live: !!a[7] });
