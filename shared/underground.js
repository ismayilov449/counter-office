// Underground & vents (cs_mansion, cs_mansion_night). Used by the server (lib/underground.js), the browser
// (public/js/underground.js) and the gas (lib/gas.js adds the vents to its graph).
//   1. No radar underground: in the cellar, the smugglers' tunnel, the storm drain and the old water tunnel your radar
//      has no signal (static, both teams), you can't ping or call in targets, and nobody down there is spotted onto a
//      radar (nor spots anyone onto one).
//   2. Echo: a gunshot or a blast underground booms through the whole house: everyone above ground hears a muffled,
//      reverberating boom from below, whatever the distance; down there it rings along the tunnels.
//   3. Air vents: three short ducts, each with a grille at both ends. At a grille you hear the room at the other end
//      (closer to it, louder and clearer); a grenade that goes into a grille rattles through the duct and drops out of
//      the other one; gas spreads through them.

export const UG = {
  // the echo of a shot underground, for those above ground: gain of the boom from below (any distance), of a
  // suppressed shot's, and at most one every `gap` seconds (a spraying rifle makes one rolling rumble)
  echo: { gain: 0.5, suppressed: 0.15, gap: 0.07, blast: 1.0 },
  // the vents
  listen: 2.2, // m from a grille (your ears: the camera) that you hear the room behind it
  via: 0.35, // a sound through a duct counts its way (duct + the far grille to the sound) this much: ducts carry sound well
  outside: 14, // m round an outside grille that it hears (it has no room)
  // m in front of a grille a grenade goes in: deeper than a thrown grenade moves in one step (21 m/s: 0.35 m in 1/60 s;
  // it bounces off the wall from the step before, so a thinner mouth would miss it), and 5 cm wider than the plate
  mouth: 0.5, mouthPad: 0.05,
  ductSpeed: 5, // m/s a grenade rattles through a duct
  ductMin: 0.3, // s at least
  pop: { wall: 2.4, floor: 3.2, ceiling: 0.8 }, // m/s a grenade comes out of a grille (out of a wall, up out of a floor, down from a ceiling)
};

// ---- 1. the underground: boxes [x1, y1, z1, x2, y2, z2]. A point (feet or eyes) inside one is underground. The tops
// are where a point is clearly under the ground: the cellar's ceiling (the living room's floor is 0.2 m higher, so
// nobody above it is ever inside), the tunnel's ceiling, a ladder shaft about half way up. The cellar stairs count
// from the ground (0) down: about the lower three quarters for the feet.
const AREAS = [
  [-22.9, -6.5, -5.49, -13.31, 0.61, 4.5], // the cellar (and the lift's pit, and the drain's grate shaft under it)
  [-15.54, -6.5, -9.75, -13.31, 0.0, -5.49], // its stairwell, below the ground
  [-14.8, -6.5, 4.4, -13.5, -0.2, 6.3], // the smugglers' tunnel: out of the cellar,
  [-14.8, -6.5, 5.0, 14.8, -0.2, 6.3], //   east under the lawn,
  [13.5, -6.5, 5.0, 14.8, -0.2, 16.8], //   south to under the shed (its ladder: until your head is in the shed)
  [3.4, -6.5, -2.6, 26.9, -3.0, -1.4], // the storm drain: the street leg,
  [3.4, -6.5, -1.4, 4.6, -3.0, 1.0], //   the jog,
  [-19.6, -6.5, -0.2, 4.6, -3.0, 1.0], //   west to under the cellar
  [25.9, -6.5, -2.6, 26.9, -1.0, -1.4], //   and the street grate's shaft, half way up
  [-24.4, -6.5, -21.2, 26.3, -1.0, -17.8], // the old water tunnel under the north lawn (its manholes half way up)
];

export const undergroundMap = map => !!map?.mansion2;
export const ugAreas = map => (undergroundMap(map) ? AREAS : []);
export function isUnderground(map, p) {
  if (!p || !undergroundMap(map)) return false;
  for (const a of AREAS) if (p[0] > a[0] && p[0] < a[3] && p[1] > a[1] && p[1] < a[4] && p[2] > a[2] && p[2] < a[5]) return true;
  return false;
}

// ---- 3. the air vents. A grille is a flat plate: `axis` (0 x, 1 y, 2 z) it faces along, `n` (+1/-1) the way it faces
// (into its room), `at` the plane, `lo`/`hi` its corners ([x, y, z], equal along `axis`). `kind`: 'wall', 'floor' (you
// can drop a grenade into it, it pops up out of it) or 'ceiling'. All of them sit where nothing ever breaks: the
// cellar's walls, the house's foundation and the slab between the storeys. Names are what the HUD says.
const GRILLES = [
  // 0, 1: the cellar's air vent: high in the cellar's west wall (over the gap between two wine racks, z 1.1-2.0), out
  // through the foundation to a grille at the foot of the house's west wall on the back lawn (under the living room's
  // south window; the crates by the wall stand further north, z -2.5 to -0.4)
  { name: 'the cellar', kind: 'wall', axis: 0, n: 1, lo: [-22.9, 0.04, 1.2], hi: [-22.9, 0.4, 1.8] },
  { name: 'the back lawn', kind: 'wall', axis: 0, n: -1, lo: [-23.67, 0.04, 1.2], hi: [-23.67, 0.4, 1.8], outside: true },
  // 2, 3: the kitchen's ceiling (west of its lamp) and the floor of the bedroom above it (the north-west room upstairs)
  { name: 'the kitchen', kind: 'ceiling', axis: 1, n: -1, lo: [-20.3, 4.06, -11.0], hi: [-19.8, 4.06, -10.5] },
  { name: 'the bedroom upstairs', kind: 'floor', axis: 1, n: 1, lo: [-18.6, 4.27, -11.0], hi: [-18.1, 4.27, -10.5] },
  // 4, 5: the ceiling of the ground floor's north-east room and the floor of the security room (CCTV) above it
  { name: 'the room downstairs', kind: 'ceiling', axis: 1, n: -1, lo: [-9.6, 4.06, -11.3], hi: [-9.1, 4.06, -10.8] },
  { name: 'the security room', kind: 'floor', axis: 1, n: 1, lo: [-8.0, 4.27, -11.3], hi: [-7.5, 4.27, -10.8] },
];
// [grille a, grille b, the duct's length in m, its area for the gas in m² (a grille's own area is about 0.25-0.3;
// gas is lighter than air and the ceiling grilles catch what gathers under the ceiling, so more)]
const DUCTS = [[0, 1, 1.0, 0.4], [2, 3, 1.9, 0.9], [4, 5, 1.9, 0.9]];

const center = g => [0, 1, 2].map(k => (g.lo[k] + g.hi[k]) / 2);
const BUILT = GRILLES.map((g, i) => {
  const c = center(g), nv = [0, 0, 0];
  nv[g.axis] = g.n;
  // the mouth: the box in front of the plate a grenade goes in through
  const mlo = g.lo.map((v, k) => (k === g.axis ? v : v - UG.mouthPad)), mhi = g.hi.map((v, k) => (k === g.axis ? v : v + UG.mouthPad));
  if (g.n > 0) mhi[g.axis] += UG.mouth; else mlo[g.axis] -= UG.mouth;
  return { i, ...g, c, nv, mouth: { min: mlo, max: mhi }, links: [] };
});
for (const [a, b, len, area] of DUCTS) {
  BUILT[a].links.push({ to: b, len, area });
  BUILT[b].links.push({ to: a, len, area });
}
const VENTS = { grilles: BUILT, ducts: DUCTS.map(([a, b, len, area]) => ({ a, b, len, area })) };

// The vents of a map (null: none). The same object every time.
export const ventsOf = map => (undergroundMap(map) ? VENTS : null);

// The point of a grille's plate nearest to p, and how far it is.
export function grilleDist(g, p) {
  const q = [0, 1, 2].map(k => Math.max(g.lo[k], Math.min(g.hi[k], p[k])));
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// The room (index into map.rooms) a grille opens into, -1 outside (a little in front of it, so a grille on a room's
// edge counts for that room).
export function grilleRoom(rooms, g) {
  const p = g.c.map((v, k) => v + g.nv[k] * 0.3);
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (p[0] > r.min[0] && p[0] < r.max[0] && p[1] > r.min[1] && p[1] < r.max[1] && p[2] > r.min[2] && p[2] < r.max[2]) return i;
  }
  return -1;
}

// The vent graph between rooms, for anything that spreads through the air (gas; group 10's fire smoke):
// [{ a, b, area, duct }] with a/b room indices into map.rooms (-1 = outside; a is never -1), area in m².
export function ventLinks(map) {
  const v = ventsOf(map), rooms = map?.rooms || [];
  if (!v) return [];
  const out = [];
  v.ducts.forEach((d, duct) => {
    let a = grilleRoom(rooms, v.grilles[d.a]), b = grilleRoom(rooms, v.grilles[d.b]);
    if (a < 0) [a, b] = [b, a];
    if (a < 0 || a === b) return;
    out.push({ a, b, area: d.area, duct });
  });
  return out;
}

// Is the point p (a sound's source) in the space a grille hears: its room, or round an outside grille, outdoors?
export function inGrilleSpace(rooms, g, room, p, outdoors) {
  if (room >= 0) {
    const r = rooms[room];
    return p[0] > r.min[0] && p[0] < r.max[0] && p[1] > r.min[1] && p[1] < r.max[1] && p[2] > r.min[2] && p[2] < r.max[2];
  }
  return outdoors(p) && Math.hypot(p[0] - g.c[0], p[1] - g.c[1], p[2] - g.c[2]) < UG.outside;
}

// The first point of a grenade's path inside a grille's mouth: { i (path index), g (grille) } or null.
export function nadeIntoVent(vents, path) {
  if (!vents) return null;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    for (const g of vents.grilles) {
      const m = g.mouth;
      if (p[0] > m.min[0] && p[0] < m.max[0] && p[1] > m.min[1] && p[1] < m.max[1] && p[2] > m.min[2] && p[2] < m.max[2]) return { i, g };
    }
  }
  return null;
}

// How a grenade comes out of grille g: where (just in front of it) and with what velocity (jitter: 2 random numbers
// -1..1, so both sides can use the same ones).
export function ventExit(g, jitter = [0, 0]) {
  const o = g.c.map((v, k) => v + g.nv[k] * 0.12);
  const [j1, j2] = jitter;
  let v;
  if (g.kind === 'floor') v = [j1 * 0.5, UG.pop.floor, j2 * 0.5];
  else if (g.kind === 'ceiling') v = [j1 * 0.4, -UG.pop.ceiling, j2 * 0.4];
  else {
    v = g.nv.map(c => c * UG.pop.wall);
    v[1] = 0.6;
    v[g.axis === 0 ? 2 : 0] = j1 * 0.4;
  }
  return { o, v };
}

// Seconds a grenade takes through a duct of this length.
export const ductTime = len => Math.max(UG.ductMin, len / UG.ductSpeed);
