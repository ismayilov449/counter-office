// Floodgate (cs_mansion, cs_mansion_night): a big valve wheel in the storm drain floods the underground. Hold E for
// 3 s to open it (anyone): the water rises over about 40 s, first in the drain, then up through the cellar's grate
// into the cellar, its stairwell and the smugglers' tunnel — one water level for all of it, nearly to the cellar's
// ceiling. Hold E 3 s again to close it, and the water drains away slowly. Players swim in it (the usual water) and
// drown when their head stays under too long. If the water reaches the fuse box while the power is on, everyone in
// the water is electrocuted and the fuse blows (power off). Drained every round.
// Used by the server (lib/flood.js), the browser (public/js/flood.js) and the map (shared/maps/mansion_flood.js).

export const FLOOD = {
  // the wheel's centre (it faces +z, out of the drain's north wall at z -2.6), how close you must stand to turn it
  // (to the wheel, along the floor) and the drain's floor under it
  valve: { p: [23.8, -3.9, -2.2], reach: 1.3, floor: -5.0 },
  // the outlet the water gushes out of (a pipe's mouth, pointing down), next to the valve
  outlet: [22.7, -4.0, -2.45],
  hold: 3, // seconds of E to open or close it
  fill: 40, // seconds from dry to full (open)
  drain: 90, // seconds from full to dry (closed)
  base: -4.88, // the drain's own trickle of water (drawn by the map): "empty"
  max: -0.45, // full: the cellar nearly to its ceiling (0.61); a thin pocket of air under the tunnel's (-0.2)
  fuse: -1.35, // the fuse box's bottom (it hangs at y -0.95, 0.8 m tall)
  breath: 10, // seconds a player can hold their breath
  drown: 10, // damage per second after that
  recover: 2, // seconds of breath back per second above the water
  downed: { breath: 3, drown: 2 }, // a downed player (p.downed) runs out of breath 3x faster and drowns 2x faster
  zap: { min: 50, max: 160 }, // electrocution damage: ankle-deep .. a metre or more under
  nade: 7, // an HE grenade under water hurts only those in the water, within this radius
};

// The water level as the fill (0 dry .. 1 full) rises: the drain (2 m deep, the biggest part) first, then the shaft
// up to the cellar's grate, then the cellar, its stairwell and the tunnel together. [fill, level]
const STAGES = [[0, FLOOD.base], [0.35, -3.0], [0.45, -2.2], [1, FLOOD.max]];
export function floodLevel(f) {
  if (f <= 0) return FLOOD.base;
  for (let i = 1; i < STAGES.length; i++) {
    const [f1, y1] = STAGES[i], [f0, y0] = STAGES[i - 1];
    if (f <= f1) return y0 + ((f - f0) / (f1 - f0)) * (y1 - y0);
  }
  return FLOOD.max;
}

// The spaces the water fills: [x1, z1, x2, z2, floor, ceiling]. Footprints of the same height don't overlap, so
// each surface is drawn once (see mansion2.js for the rooms themselves).
export const FLOOD_AREAS = [
  // the storm drain: the street leg, the jog, the leg west to under the cellar
  [3.4, -2.6, 26.9, -1.4, -5.0, -3.0],
  [3.4, -1.4, 4.6, -0.2, -5.0, -3.0],
  [-19.6, -0.2, 4.6, 1.0, -5.0, -3.0],
  // the shafts up from it: to the street grate, to the cellar's grate
  [25.9, -2.6, 26.9, -1.4, -3.0, 0],
  [-19.6, -0.2, -18.6, 1.0, -3.0, -2.2],
  // the cellar and its stairwell
  [-22.9, -5.49, -13.31, 4.5, -2.2, 0.61],
  [-15.54, -9.75, -13.31, -5.49, -2.2, 0.81],
  // the smugglers' tunnel: out of the cellar, east under the lawn, south to the shed
  [-14.8, 4.5, -13.5, 5.0, -2.2, -0.2],
  [-14.8, 5.0, 14.8, 6.3, -2.2, -0.2],
  [13.5, 6.3, 14.8, 16.8, -2.2, -0.2],
];

// Is the flood on this map? (both Mansions: the night map is the same map object spread)
export const floodMap = map => !!map?.mansion2;

// The water's top at (x, z) for a point at height y: the area holding the point decides (a drain under the cellar
// is full while the cellar's water is lower). -Infinity where there's no water.
export function waterTop(level, p) {
  if (level <= FLOOD.base + 0.02) return -Infinity;
  for (const [x1, z1, x2, z2, floor, ceil] of FLOOD_AREAS) {
    if (p[0] <= x1 || p[0] >= x2 || p[2] <= z1 || p[2] >= z2 || p[1] <= floor - 0.3 || p[1] >= ceil + 0.05 || level <= floor) continue;
    return level >= ceil ? ceil + 0.05 : level;
  }
  return -Infinity;
}
// A point under the water (a head, a grenade, a fire).
export const underWater = (level, p) => p[1] < waterTop(level, p);

// The water boxes for the usual swimming (map.water, see inWater in physics.js): one per area, kept up to date
// with the level. Like the pool's, the top is 0.1 m over the surface, so a swimmer holding Space floats with their
// head out (and can climb out over an edge).
export function makeFloodBoxes() {
  return FLOOD_AREAS.map(([x1, z1, x2, z2, floor]) => ({ min: [x1, floor - 0.3, z1], max: [x2, -1e9, z2], flood: true }));
}
export function setFloodBoxes(boxes, level) {
  FLOOD_AREAS.forEach(([, , , , floor, ceil], i) => {
    boxes[i].max[1] = level <= FLOOD.base + 0.02 || level <= floor ? -1e9 : level >= ceil ? ceil + 0.05 : level + 0.1;
  });
}

// Standing at the valve: by the wheel, on the drain's floor (or swimming just above it).
export function atValve(p) {
  const v = FLOOD.valve;
  return Math.hypot(p[0] - v.p[0], p[2] - v.p[2]) < v.reach && p[1] > v.floor - 0.5 && p[1] < v.floor + 1.2;
}
