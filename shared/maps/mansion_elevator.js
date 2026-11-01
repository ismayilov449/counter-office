// Mansion 2.0: the lift's shaft (the moving cabin and its sliding doors are in shared/elevator.js, lib/elevator.js and
// public/js/elevator.js). A small lift between the wine cellar, the living room and the Terrorists' room upstairs, in
// the living room's north-west corner: its shaft is cut through the thick wall between the kitchen and the living room
// (upstairs: between the north corridor and the Ts' room, through the built-in bookcase) and stands out about a metre
// and a half into the rooms. Every landing door faces south. A pit under the cellar stop, a steel ladder up the shaft's
// west wall (drawn here; the browsers make it climbable above and below the cabin). The shaft's walls never break.
// Called once from remodel() in mansion2.js with its helpers; returns map.elevator (the numbers the lift uses).

// The shaft: its inside, its walls 0.15 m thick, the pit's floor and the shaft's top (the upper floor's ceiling).
const IN = { x1: -21.45, x2: -19.8, z1: -5.34, z2: -3.6 };
const OUT = { x1: -21.6, x2: -19.65, z1: -5.49, z2: -3.45 };
const PIT = -3.4, TOP = 6.706;
// The stops (the cabin's floor at the cellar, the living room, the Ts' room) and the doorway in the south wall.
const STOPS = [-2.2, 0.813, 4.267];
const DOOR = { x1: -21.015, x2: -20.115, h: 2.05 };
// The ladder on the west wall (normal +x), near the doorways so a climber can step onto a landing's sill.
const LADDER = { z: -3.95, w: 0.6, top: 6.6 };

export function addElevator({ carve, unface, face, decor, rooms, keep, solid }) {
  const conc = 'x_concrete', frame = 'x_metal';
  // the rooms' own wall textures, for the shaft's outer faces: the cellar's stone, the living room's two plasters,
  // the upstairs plaster
  // (each a centimetre into the floor and the ceiling, so no slit shows where they meet)
  const bands = [[-2.2, 0.62, 'crete3_wall01b'], [0.8, 3.048, 'fifties_wall14'], [3.048, 4.074, 'fifties_wall14a'], [4.257, TOP, 'fifties_wall14']];

  // ---- clear the way: the walls, floors, beams and slabs in the shaft's footprint; the pit below the cellar
  carve(OUT.x1, -2.2, OUT.z1, OUT.x2, TOP, OUT.z2);
  carve(IN.x1, PIT, IN.z1, IN.x2, -2.19, IN.z2); // (to -2.19: the cellar floor's face at -2.2 goes too)
  unface(OUT.x1, -2.2, OUT.z1 - 0.005, OUT.x2, 0.61, OUT.z1 + 0.005); // the cellar's north wall, now inside the shaft's
  unface(IN.x1, TOP - 0.005, IN.z1, IN.x2, TOP + 0.005, IN.z2); // the ceiling (only partly there: drawn whole below)
  // the three barrels that stood here: one just east of the shaft (where the third was: it keeps the bots' grid from
  // linking the kitchen doorway's floor down through the floor to the cellar), two onto the stack by the stairs
  const moved = [[-20.9, -4.9], [-20.2, -4.9], [-19.5, -4.9]];
  for (const [x, z] of moved) {
    carve(x - 0.3, -2.2, z - 0.3, x + 0.3, -1.15, z + 0.3);
    const i = decor.findIndex(d => d.type === 'barrel' && Math.abs(d.p[0] - x) < 1e-6 && Math.abs(d.p[2] - z) < 1e-6);
    if (i >= 0) decor.splice(i, 1);
  }
  for (const [x, z] of [[-19.3, -4.9], [-16.2, -2.2], [-16.85, -3.25]]) {
    solid([x - 0.3, -2.2, z - 0.3, x + 0.3, -1.15, z + 0.3]);
    decor.push({ type: 'barrel', p: [x, -2.2, z], color: '#6a4424' });
  }

  // ---- the shaft's walls: west and east between the north wall and the south (doorway) wall, which runs the full width
  solid([OUT.x1, -2.2, OUT.z1, IN.x1, TOP, IN.z2], [IN.x2, -2.2, OUT.z1, OUT.x2, TOP, IN.z2], [IN.x1, -2.2, OUT.z1, IN.x2, TOP, IN.z1]);
  // the south wall: either side of the doorways full height, and between the doorways
  solid([OUT.x1, -2.2, IN.z2, DOOR.x1, TOP, OUT.z2], [DOOR.x2, -2.2, IN.z2, OUT.x2, TOP, OUT.z2]);
  const gaps = []; // [y1, y2] of solid wall between the doorways
  let from = -2.2;
  for (const s of STOPS) { if (s > from) gaps.push([from, s]); from = s + DOOR.h; }
  gaps.push([from, TOP]);
  for (const [a, b] of gaps) solid([DOOR.x1, a, IN.z2, DOOR.x2, b, OUT.z2]);
  keep.push([OUT.x1 - 0.01, PIT - 0.01, OUT.z1 - 0.01, OUT.x2 + 0.01, TOP + 0.005, OUT.z2 + 0.01]);

  // ---- faces inside the shaft (bare concrete): the pit's floor, the top, the four walls from the pit up
  face(conc, 1, 1, PIT, [IN.x1, 0, IN.z1], [IN.x2, 0, IN.z2]);
  face(conc, 1, -1, TOP, [IN.x1, 0, IN.z1], [IN.x2, 0, IN.z2]);
  face(conc, 0, 1, IN.x1, [0, PIT, IN.z1], [0, TOP, IN.z2]);
  face(conc, 0, -1, IN.x2, [0, PIT, IN.z1], [0, TOP, IN.z2]);
  face(conc, 2, 1, IN.z1, [IN.x1, PIT, 0], [IN.x2, TOP, 0]);
  // the south wall's inside, around the doorways (below the cellar's doorway it's the pit's wall)
  face(conc, 2, -1, IN.z2, [IN.x1, PIT, 0], [DOOR.x1, TOP, 0]);
  face(conc, 2, -1, IN.z2, [DOOR.x2, PIT, 0], [IN.x2, TOP, 0]);
  face(conc, 2, -1, IN.z2, [DOOR.x1, PIT, 0], [DOOR.x2, STOPS[0], 0]);
  for (const [a, b] of gaps) if (a > STOPS[0]) face(conc, 2, -1, IN.z2, [DOOR.x1, a, 0], [DOOR.x2, b, 0]);

  // ---- faces outside, in each room's own wall texture: west, east, north (the kitchen's and the corridor's wall faces
  // were 4 mm inside the footprint: carved; in the cellar the north side is against the cellar's wall), the south wall
  // around the doorways. Between the storeys they'd be inside the floors: not drawn.
  for (const [a, b, t] of bands) {
    if (a > 0) face(t, 2, -1, OUT.z1, [OUT.x1, a, 0], [OUT.x2, b, 0]);
    face(t, 0, -1, OUT.x1, [0, a, OUT.z1], [0, b, OUT.z2]);
    face(t, 0, 1, OUT.x2, [0, a, OUT.z1], [0, b, OUT.z2]);
    face(t, 2, 1, OUT.z2, [OUT.x1, a, 0], [DOOR.x1, b, 0]);
    face(t, 2, 1, OUT.z2, [DOOR.x2, a, 0], [OUT.x2, b, 0]);
    for (const [g1, g2] of gaps) {
      const lo = Math.max(a, g1), hi = Math.min(b, g2);
      if (hi > lo + 1e-3) face(t, 2, 1, OUT.z2, [DOOR.x1, lo, 0], [DOOR.x2, hi, 0]);
    }
  }
  // each doorway's steel frame: its sides, its head, and a threshold plate (the cellar's is its floor)
  for (const s of STOPS) {
    face(frame, 0, 1, DOOR.x1, [0, s, IN.z2], [0, s + DOOR.h, OUT.z2]);
    face(frame, 0, -1, DOOR.x2, [0, s, IN.z2], [0, s + DOOR.h, OUT.z2]);
    face(frame, 1, -1, s + DOOR.h, [DOOR.x1, 0, IN.z2], [DOOR.x2, 0, OUT.z2]);
    if (s > STOPS[0]) face(frame, 1, 1, s, [DOOR.x1, 0, IN.z2], [DOOR.x2, 0, OUT.z2]);
  }

  // ---- the ladder (drawn; climbable only above and below the cabin: the browsers keep two ladders sized to fit)
  decor.push({ type: 'ladder', p: [IN.x1 + 0.07, PIT, LADDER.z], h: LADDER.top - PIT, w: LADDER.w, rot: Math.PI / 2 });
  // a lighting room of its own: the blackout darkens the shaft and the cabin (and no strip of daylight between storeys)
  rooms.push({ group: 'elevator', power: true, min: [IN.x1, PIT, IN.z1], max: [IN.x2, TOP, IN.z2] });

  // The cabin (inside the shaft, its floor at a stop's height y): outer x1..x2, z1..z2 (front at z2), walls `wall` thick,
  // inside `ceil` high, the roof slab `roof` thick, the floor slab `floor` thick; the roof hatch's hole; the button panel
  // on the inside of the east wall near the doors (button heights above the floor, cellar first); the landings' call
  // buttons beside each doorway (on the south face, east of it).
  return {
    shaft: { ...IN }, out: { ...OUT }, pit: PIT, top: TOP, stops: STOPS.slice(), names: ['the cellar', 'the ground floor', 'the upper floor'],
    door: { ...DOOR },
    cabin: { x1: -21.28, x2: -19.85, z1: -5.29, z2: -3.62, wall: 0.05, ceil: 2.2, roof: 0.08, floor: 0.1 },
    hatch: { x1: -20.7, x2: -19.95, z1: -5.15, z2: -4.4 },
    panel: { x: -19.895, z: -3.98, ys: [1.0, 1.15, 1.3] },
    call: STOPS.map(s => [-19.86, s + 1.1, OUT.z2 + 0.005]),
    ladder: { x: IN.x1, z1: LADDER.z - LADDER.w / 2, z2: LADDER.z + LADDER.w / 2, top: LADDER.top },
  };
}

// The living room's light switch was on the wall where the shaft now stands (called from mansion.js once its switches
// are made): it goes on the shaft's east side, by the doorway to the kitchen.
export function moveSwitches(switches, E) {
  const o = E.out;
  for (const s of switches) {
    if (s.p[0] > o.x1 - 0.05 && s.p[0] < o.x2 + 0.05 && s.p[2] > o.z1 - 0.2 && s.p[2] < o.z2 + 0.05) Object.assign(s, { p: [o.x2 + 0.01, s.p[1], o.z1 + 1.0], rot: Math.PI / 2 });
  }
}
