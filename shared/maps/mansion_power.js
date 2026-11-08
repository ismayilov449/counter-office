// Mansion 2.0: power & machinery (ROADMAP group 3; the rules are in shared/power.js, the server's part lib/power.js,
// the browser's public/js/power.js). Called once from remodel() in mansion2.js; POWER (the numbers the game uses) goes
// on the map as map.power (mansion.js).
//   - the breaker panel on the cellar's north wall, east of the fuse box (drawn by the browsers; no solid)
//   - the generator against the garage's south wall (drawn by the browsers; a solid here)
//   - the lift's machine room on the roof, straight over the shaft: cut into the west slope of the house's roof, its
//     floor level with the slope at its east wall, an open doorway there; inside, the winch (drawn by the browsers; a
//     solid here) and a control cabinet. You get there from the roof terrace: a steel ladder up the eave of the house's
//     front wall, then over the ridge (the roof is walkable: its collision is fine steps).
//   - two buffers in the lift's pit, where a falling cabin lands (drawn only)
// Everything here is `keep` (never breaks).

const F = 9.92; // the machine room's floor (2 cm over the roof's slope at its east wall, 9.90)
const ROOM = { x1: -22.2, x2: -19.2, z1: -5.75, z2: -3.2, floor: F, ceil: F + 2.5, top: F + 2.65, wall: 0.15 };
const DOORWAY = { z1: -4.95, z2: -4.0, h: 2.35 }; // (tall: you come in from the slope outside, up to 0.35 m over the floor)

export const POWER = {
  // the panel's box on the wall (its face at max z), the floor you use it from
  panel: { min: [-17.3, -1.3, -5.49], max: [-16.6, -0.4, -5.37], floor: -2.2 },
  // the generator's body (a solid), its exhaust's mouth
  gen: { min: [-20.25, 0, -15.3], max: [-18.95, 0.85, -14.5], floor: 0, exhaust: [-18.8, 0.72, -14.72] },
  room: { ...ROOM, door: { ...DOORWAY } },
  // the winch (a solid), where its ropes leave the sheave and go down through the floor into the shaft
  winch: { min: [-21.85, F, -5.0], max: [-20.45, F + 1.1, -3.95], floor: F, rope: [-20.62, F + 1.0, -4.475] },
  // the terrace's ladder (face x, z, normal, from, to, width)
  ladder: [-6.198, -3.9, [1, 0], 4.27, 7.95, 0.6],
  // the pit's buffers (the cabin's floor lands at CABLE.land, shared/power.js)
  buffers: [[-21.2, -20.95], [-20.15, -19.9]].map(([x1, x2]) => ({ min: [x1, -3.4, -4.6], max: [x2, -3.15, -4.35] })),
};

// The helpers are remodel()'s (mansion2.js): carve, face, brush, ladders, keep, solid(...boxes).
export function addPower({ carve, brush, ladders, keep, solid }) {
  const R = ROOM, D = DOORWAY, w = R.wall, ext = 'out_wall4a', int = 'x_concrete';

  // ---- the machine room: the roof (and the attic's solid) out of its footprint, down to the top floor's ceiling slab
  carve(R.x1, 6.91, R.z1, R.x2, 13.5, R.z2);
  // the plinth it stands on (the west side shows above the slope), its top the room's floor
  brush(R.x1, 6.91, R.z1, R.x2, R.floor, R.z2, { top: int, side: ext }, ['bottom']);
  // the walls: west, north, south; the east one round the doorway (its sides and lintel show the inside's concrete)
  brush(R.x1, R.floor, R.z1, R.x1 + w, R.ceil, R.z2, { '+x': int, side: ext }, ['top', 'bottom']);
  brush(R.x1 + w, R.floor, R.z1, R.x2 - w, R.ceil, R.z1 + w, { '+z': int, side: ext }, ['top', 'bottom', '-x', '+x']);
  brush(R.x1 + w, R.floor, R.z2 - w, R.x2 - w, R.ceil, R.z2, { '-z': int, side: ext }, ['top', 'bottom', '-x', '+x']);
  brush(R.x2 - w, R.floor, R.z1, R.x2, R.ceil, D.z1, { '-x': int, '+z': int, side: ext }, ['top', 'bottom']);
  brush(R.x2 - w, R.floor, D.z2, R.x2, R.ceil, R.z2, { '-x': int, '-z': int, side: ext }, ['top', 'bottom']);
  brush(R.x2 - w, R.floor + D.h, D.z1, R.x2, R.ceil, D.z2, { '-x': int, bottom: int, side: ext }, ['top', '-z', '+z']);
  // the flat roof (gravel on top, a trim round its edge)
  brush(R.x1, R.ceil, R.z1, R.x2, R.top, R.z2, { top: 'x_gravel', bottom: int, side: 'x_trim' });
  // the winch's solid (the browsers draw it) and a control cabinet against the north wall
  const W = POWER.winch;
  solid([W.min[0], W.min[1], W.min[2], W.max[0], W.max[1], W.max[2]]);
  brush(-21.0, R.floor, R.z1 + w, -20.25, R.floor + 1.7, R.z1 + w + 0.3, 'x_metal', ['bottom', '-z']);
  keep.push([R.x1 - 0.01, 6.9, R.z1 - 0.01, R.x2 + 0.01, R.top + 0.01, R.z2 + 0.01]);

  // ---- the ladder from the roof terrace up to the eave, held off the wall by two brackets (drawn only)
  ladders.push(POWER.ladder.slice());
  const [lx, lz, , , , lw] = POWER.ladder;
  for (const y of [5.3, 6.5]) for (const dz of [-lw / 2 + 0.03, lw / 2 - 0.03]) brush(-6.401, y, lz + dz - 0.03, lx + 0.13, y + 0.05, lz + dz + 0.03, 'x_metal', [], false);

  // ---- the generator's solid (the browsers draw it)
  const G = POWER.gen;
  solid([G.min[0], G.min[1], G.min[2], G.max[0], G.max[1], G.max[2]]);
  keep.push([G.min[0] - 0.01, G.min[1] - 0.01, G.min[2] - 0.01, G.max[0] + 0.01, G.max[1] + 0.01, G.max[2] + 0.01]);

  // ---- the pit's buffers: steel blocks on the pit's floor (not solid: the lift's own safety rules keep the pit free)
  for (const b of POWER.buffers) brush(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], 'x_metal', ['bottom'], false);
}
