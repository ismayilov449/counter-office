// cs_meridian — Hotel Meridian on a stormy night (stage 1: the playable blockout; the lift, the laundry chute and the
// storm come later, see docs/features/meridian.md). Hostage rescue: the Terrorists hold the hostages in the
// penthouse, a guest room and the kitchen's freezer; the CTs start on the street in front of the hotel and lead the
// hostages back out there.
//   - four floors 4 m apart: the lobby (y 0: reception, the bar, the kitchen and its walk-in freezer), guest floors
//     2 and 3 (y 4, 8: a corridor down the middle, eight rooms each with a bathroom, each room joined to the next by a
//     connecting door) and the penthouse (y 12: the suite and the roof terrace with its pool)
//   - the main stairs in the east stairwell: two lanes side by side, each flight going up a floor, so they stack
//   - the fire escape on the west wall: a ladder from the side street past a balcony on each floor, a door from each
//     balcony into the corridor's west end
//   - the street (south: CT spawn, rescue zone) and the alley behind the kitchen (north)
import { createBuilder, cutRect } from './builder.js';

const m = createBuilder();
const { box } = m;
const FL = [0, 4, 8, 12]; // the floors' tops: lobby, 2nd, 3rd, penthouse
const H = 3.7; // walls from a floor to the ceiling (the slab above is 0.3 m)
const X1 = -22, X2 = 22, Z1 = -10, Z2 = 10; // the building
const RX = [-19, -11, -3, 5, 13]; // guest rooms between these x (four a side)
const CZ = 1.2; // the corridor: z -1.2 .. 1.2
const STAIR = { x1: 14.5, x2: 20.5, a: [-10, -8.5], b: [-8.5, -7] }; // the flights' run and their two lanes (z)
// the lift's shaft in the north-west corner (map.elevator; the cabin and its doors are shared/elevator.js), its doors
// facing south: onto the guest floors' corridors, the lobby and the suite's bedroom. Its west wall is the building's.
const LIFT = { out: { x1: -21.85, x2: -19.6, z1: -3.8, z2: -1.1 }, in: { x1: -21.85, x2: -19.75, z1: -3.65, z2: -1.25 }, door: { x1: -21.2, x2: -20.3, h: 2.05 } };
const STOPS = [0.12, 4, 8, 12], LIFT_TOP = 15.7;
// the laundry chute (outside its walls): a steel tube in the linen rooms' corner, from the terrace down to the lobby's
// laundry, a hatch at waist height on each floor
const CHUTE = { x1: 20.1, x2: 21.7, z1: 8.1, z2: 9.7 };
const liftHole = [LIFT.out.x1, LIFT.out.z1, LIFT.out.x2, LIFT.in.z2], chuteHole = [CHUTE.x1, CHUTE.z1, CHUTE.x2, CHUTE.z2];

// ---- doors: { id, hinge, axis, dir, len, h } (shared/doors.js); every doorway in a wall gets one
const doors = [];
const door = (x, y, z, axis, dir, len = 1, tex = 'door1') => doors.push({ id: doors.length, hinge: [x, y, z], axis, dir, len, h: 2.25, tex });

// A wall along x (at z) or along z (at x), from `from` to `to`, standing on y0, with openings
// [{ from, to, height, bottom, glass }] (a doorway starts at the floor; a window has a sill and gets a breakable pane).
let glassId = 0;
function wall(axis, at, from, to, y0, mat, openings = [], thick = 0.2, h = H) {
  const t = thick / 2;
  const seg = (a, b, ya, yb) => {
    if (b - a <= 0.001 || yb - ya <= 0.001) return;
    if (axis === 'x') box(a, at - t, b, at + t, yb - ya, mat, y0 + ya);
    else box(at - t, a, at + t, b, yb - ya, mat, y0 + ya);
  };
  const cuts = [...new Set([from, to, ...openings.flatMap(o => [o.from, o.to])])].sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    const holes = openings.filter(o => o.from <= a && o.to >= b).map(o => [o.bottom || 0, Math.min(h, o.height)]).sort((p, q) => p[0] - q[0]);
    let y = 0;
    for (const [ya, yb] of holes) { seg(a, b, y, ya); y = Math.max(y, yb); }
    seg(a, b, y, h);
  }
  for (const o of openings) {
    if (!o.glass) continue;
    const g = 0.03, extra = { glass: true, id: glassId++, group: null };
    if (axis === 'x') box(o.from, at - g, o.to, at + g, o.height - o.bottom, 'glass', y0 + o.bottom, extra);
    else box(at - g, o.from, at + g, o.to, o.height - o.bottom, 'glass', y0 + o.bottom, extra);
  }
}
const doorway = (from, w = 1) => ({ from, to: from + w, height: 2.3 });
const win = (from, to, bottom = 0.9, height = 2.5) => ({ from, to, bottom, height, glass: true });

// A floor slab whose top is at `top` (a thin layer of `mat` over the ceiling's tiles), with holes [x1, z1, x2, z2].
function slab(x1, z1, x2, z2, top, mat, holes = []) {
  for (const [a, b, c, d] of cutRect(x1, z1, x2, z2, holes)) {
    box(a, b, c, d, 0.05, mat, top - 0.05, { floor: true });
    if (top > 0.5) box(a, b, c, d, 0.25, 'ceiltile', top - 0.3);
  }
}

// ---- ground: the street, the side street, the alley; the neighbours' walls all round
m.floor(-30, -18, 30, 28, 'asphalt');
box(-30, 10, 30, 13, 0.12, 'paving', 0, { floor: true }); // the pavement in front
box(-31, -19, 31, -18, 18, 'brick'); box(-31, 28, 31, 29, 18, 'brick');
box(-31, -18, -30, 28, 18, 'brick'); box(30, -18, 31, 28, 18, 'brick');
for (const [x, z, r, c] of [[-14, 19, Math.PI / 2, '#6a2a24'], [-3, 19.4, Math.PI / 2, '#2a3a5a'], [16, 19, Math.PI / 2, '#3a4a3a'], [25, -14, 0, '#5a5a5e']]) m.car(x, z, r, c);
for (const [x, z] of [[-26, -15], [-24.6, -15.4], [20, -16], [26, 24]]) { m.solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 1.1); m.add({ type: 'barrel', p: [x, 0, z] }); }
box(10, -17.5, 16, -16, 1.6, 'metal'); // a skip in the alley

// ---- the floors
slab(X1, Z1, X2, Z2, FL[0] + 0.12, 'marble', [liftHole]);
for (let k = 1; k < 4; k++) {
  const hole = k === 2 ? [STAIR.x1, STAIR.b[0], STAIR.x2, STAIR.b[1]] : [STAIR.x1, STAIR.a[0], STAIR.x2, STAIR.a[1]]; // over the flight coming up
  slab(X1, Z1, X2, Z2, FL[k], k === 3 ? 'parquet' : 'carpet', [hole, liftHole, chuteHole]);
}
slab(X1, Z1, 4, Z2, FL[3] + 4, 'roof'); // the suite's roof
slab(13, -10, 22, -5, FL[3] + 3.4, 'roof'); // the stair hut's roof

// ---- the stairs: lane a goes up +x on the lobby and the 3rd floor, lane b up -x on the 2nd; a wall between the lanes
// and a rail across the drop at each hole's low end
m.ramp(STAIR.x1, STAIR.a[0], STAIR.x2, STAIR.a[1], FL[0] + 0.12, FL[1], '+x', 'wood');
m.ramp(STAIR.x1, STAIR.b[0], STAIR.x2, STAIR.b[1], FL[1], FL[2], '-x', 'wood');
m.ramp(STAIR.x1, STAIR.a[0], STAIR.x2, STAIR.a[1], FL[2], FL[3], '+x', 'wood');
for (let k = 0; k < 3; k++) wall('x', -8.5, STAIR.x1, STAIR.x2, FL[k], 'plaster', [], 0.15);
wall('x', -8.5, STAIR.x1, STAIR.x2, FL[3], 'plaster', [], 0.15, 3.4);
box(STAIR.x1 - 0.1, STAIR.a[0], STAIR.x1, STAIR.a[1], 1.05, 'wood', FL[1]); // rails: the 2nd floor and the penthouse over lane a,
box(STAIR.x1 - 0.1, STAIR.a[0], STAIR.x1, STAIR.a[1], 1.05, 'wood', FL[3]);
box(STAIR.x2, STAIR.b[0], STAIR.x2 + 0.1, STAIR.b[1], 1.05, 'wood', FL[2]); //        the 3rd over lane b

// ---- the outer walls (the lobby's front: the entrance and big windows; every guest room a window)
const roomWins = (side) => RX.slice(0, 4).map(x => win(x + 4.5, x + 7)).concat(side === 'n' ? [] : [win(15, 20)]);
// lobby
wall('x', Z2, X1, X2, FL[0], 'tanbrick', [{ from: -2, to: 2, height: 2.6 }, win(-18, -6, 0.8, 3.2), win(6, 18, 0.8, 3.2)], 0.3);
door(-2, FL[0], Z2, 'x', 1, 2, 'door1'); door(2, FL[0], Z2, 'x', -1, 2, 'door1');
wall('x', Z1, X1, X2, FL[0], 'tanbrick', [doorway(-16), win(-8, -2, 1.2, 2.6)], 0.3);
door(-16, FL[0], Z1, 'x', 1);
wall('z', X1, Z1, Z2, FL[0], 'tanbrick', [], 0.3); wall('z', X2, Z1, Z2, FL[0], 'tanbrick', [win(-4, 6, 1, 3)], 0.3);
// guest floors and the penthouse level
for (let k = 1; k < 4; k++) {
  const y = FL[k], ph = k === 3;
  wall('x', Z2, ph ? 4 : X1, X2, y, 'tanbrick', ph ? [] : roomWins('s'), 0.3, ph ? 1.1 : H); // (the penthouse: the terrace's parapet; the suite's walls below)
  wall('x', Z1, ph ? 4 : X1, X2, y, 'tanbrick', ph ? [] : roomWins('n'), 0.3, ph ? 1.1 : H);
  wall('z', X2, Z1, Z2, y, 'tanbrick', [], 0.3, ph ? 1.1 : H);
  wall('z', X1, Z1, Z2, y, 'tanbrick', [doorway(-0.5)], 0.3); // to the fire escape's balcony
  door(X1, y, -0.5, 'z', 1);
}
// the penthouse suite's own walls (the parapet above stands for the terrace's): full height round the suite
wall('x', Z2, X1, 4, FL[3], 'tanbrick', [win(-18, -12), win(-8, -2)], 0.3);
wall('x', Z1, X1, 4, FL[3], 'tanbrick', [win(-18, -12), win(-8, -2)], 0.3);

// ---- the lobby: reception, lounge, the bar, the kitchen (with the freezer) behind a wall on the west
const L = FL[0] + 0.12;
wall('z', -11, Z1, -1, L, 'mwall', [doorway(-4.5, 1.2)]); door(-11, L, -4.5, 'z', 1, 1.2);
wall('x', -1, LIFT.out.x2, -11, L, 'mwall'); // (the lift's shaft stands in the kitchen's corner, its doors onto the lobby)
wall('z', -18, Z1, -6.5, L, 'metal'); wall('x', -6.5, X1, -18, L, 'metal', [doorway(-19.6)]); door(-19.6, L, -6.5, 'x', 1); // the walk-in freezer
box(-17, -9.6, -12, -8.8, 0.95, 'metal', L); box(-17, -4, -13, -2.6, 0.95, 'metal', L); // kitchen counters
box(2, -5.2, 9, -4.2, 1.1, 'wood', L); box(2, -8, 9, -7.6, 2.4, 'shelf', L); // reception desk, the key board behind it
box(15, 3, 21.2, 3.9, 1.1, 'wood', L); box(15, 3.9, 15.9, 8.5, 1.1, 'wood', L); // the bar
for (const [x, z] of [[-6, -1], [6, -1], [-6, 5], [6, 5]]) box(x - 0.35, z - 0.35, x + 0.35, z + 0.35, H - 0.12, 'marble', L); // columns
for (const [x1, z1, x2, z2] of [[-9, 6, -5.5, 7], [-9, 3.4, -8, 6], [-3, 6, 0.5, 7]]) box(x1, z1, x2, z2, 0.75, 'fabric', L); // sofas
m.add({ type: 'chandelier', p: [0, L + 3.1, 2] });

// ---- guest floors 2 and 3
for (const y of [FL[1], FL[2]]) {
  // the corridor's walls: a door into every room, the housekeeping closet at the west end, the linen room at the east
  const north = [], south = [];
  RX.slice(0, 4).forEach(x => { north.push(doorway(x + 3.2)); south.push(doorway(x + 3.2)); door(x + 3.2, y, -CZ, 'x', 1); door(x + 3.2, y, CZ, 'x', 1); });
  south.push(doorway(-21)); door(-21, y, CZ, 'x', 1); // the housekeeping closet
  south.push(doorway(14)); door(14, y, CZ, 'x', 1); // the linen room (the laundry chute)
  wall('x', -CZ, LIFT.out.x2, 13, y, 'mwall', north); // (west of it: the lift's doors)
  wall('x', CZ, X1, X2, y, 'mwall', south);
  // between the rooms: a connecting door near the window side; the ends close the closet and the stairwell off
  for (const x of RX.slice(1, 4)) {
    wall('z', x, Z1, -CZ, y, 'plaster', [doorway(-7)]); door(x, y, -7, 'z', 1);
    wall('z', x, CZ, Z2, y, 'plaster', [doorway(6)]); door(x, y, 6, 'z', 1);
  }
  wall('z', RX[0], Z1, -CZ, y, 'plaster'); wall('z', RX[0], CZ, Z2, y, 'plaster');
  wall('z', RX[4], CZ, Z2, y, 'plaster'); wall('z', RX[4], Z1, -CZ, y, 'plaster');
  box(X1, Z1, RX[0], LIFT.out.z1, H, 'block', y); // (the service duct behind the lift)
  box(X1 + 0.3, 7.5, X1 + 1.2, 9.6, 2, 'shelf', y); // the closet's shelves
  // each room: a bed by the window, a bathroom in the corner by its door (its walls make one more corner to clear)
  RX.slice(0, 4).forEach(x => {
    for (const s of [-1, 1]) {
      const zc = s * CZ, zo = s * 10, zb = s * (CZ + 2.6);
      box(x + 4.8, s < 0 ? zo + 0.3 : zo - 2.5, x + 6.8, s < 0 ? zo + 2.5 : zo - 0.3, 0.6, 'fabric', y); // bed
      wall('z', x + 2.6, Math.min(zc, zb), Math.max(zc, zb), y, 'plaster');
      wall('x', zb, x, x + 2.6, y, 'plaster', [doorway(x + 0.8, 0.9)]);
      box(x + 6.6, s < 0 ? -2.2 : 1.4, x + 7.8, s < 0 ? -1.4 : 2.2, 0.8, 'wood', y); // a desk by the door
    }
  });
  // lights down the corridor
  for (const x of [-15, -3, 9]) { m.add({ type: 'ceilinglamp', p: [x, y + H, 0] }); m.add({ type: 'light', p: [x, y + H - 0.3, 0], color: '#ffd6a0', intensity: 10, distance: 9, group: `corridor${y === FL[1] ? 2 : 3}` }); } // (group: the storm's power cuts put it out)
}

// ---- the penthouse: the suite (living room, bedroom with two hostages, bathroom), a glass door out to the terrace;
// the terrace: a pool, the stair hut round the top of the stairs
const P = FL[3];
wall('z', 4, Z1, Z2, P, 'tanbrick', [{ from: -1, to: 1, height: 2.4 }, win(-8, -4), win(4, 8)], 0.3);
door(4, P, -1, 'z', 1, 2);
wall('z', -8, Z1, Z2, P, 'mwall', [doorway(-2)]); door(-8, P, -2, 'z', 1);
wall('x', 4, X1, -8, P, 'mwall', [doorway(-12)]); door(-12, P, 4, 'x', 1); // the bathroom
box(-20, -9.2, -16, -6.8, 0.65, 'fabric', P); box(-2, 6, 3, 7.2, 0.8, 'fabric', P); box(-5, -8.5, 1, -8, 1.6, 'shelf', P);
wall('x', -5, 13, X2, P, 'tanbrick', [doorway(16)], 0.2, 3.4); door(16, P, -5, 'x', 1); // the stair hut
wall('z', 13, Z1, -5, P, 'tanbrick', [], 0.2, 3.4);
wall('x', Z1, 13, X2, P, 'tanbrick', [], 0.3, 3.4); wall('z', X2, Z1, -5, P, 'tanbrick', [], 0.3, 3.4); // (its outer sides, over the parapet)
box(8, 0, 18.6, 0.4, 0.5, 'pooltile', P); box(8, 7, 18.6, 7.4, 0.5, 'pooltile', P); box(8, 0.4, 8.4, 7, 0.5, 'pooltile', P); box(18.2, 0.4, 18.6, 7, 0.5, 'pooltile', P);
m.add({ type: 'water', min: [8.4, 0.4], max: [18.2, 7], y: P + 0.35, color: '#1f6e9a' });
m.add({ type: 'light', p: [-14, P + 3.2, 0], color: '#ffcf96', intensity: 18, distance: 12, group: 'suite' });
m.add({ type: 'light', p: [-1, P + 3.2, 0], color: '#ffcf96', intensity: 14, distance: 10, group: 'suite' });
m.add({ type: 'chandelier', p: [-2, P + 3.4, 0] });

// ---- the fire escape: balconies on the west wall, a ladder from the side street to the roof
for (let k = 1; k < 4; k++) {
  box(-24.2, -1.8, X1 - 0.15, 0.4, 0.15, 'metal', FL[k] - 0.15, { floor: true }); // (the ladder's gap at z 0.4 .. 1.4)
  box(-24.2, 1.4, X1 - 0.15, 1.8, 0.15, 'metal', FL[k] - 0.15, { floor: true });
  box(-24.3, -1.8, -24.2, 1.8, 1.05, 'metal', FL[k]); box(-24.3, -1.9, X1 - 0.15, -1.8, 1.05, 'metal', FL[k]); box(-24.3, 1.8, -23, 1.9, 1.05, 'metal', FL[k]); // (rails; the south one stops short of the ladder)
}
m.ladder(X1 - 0.15, 0.9, [-1, 0], 0, FL[3] + 1.2, 0.9);

// ---- lights: the lobby, the kitchen, the street lamps
for (const [x, z] of [[-4, 2], [6, -6], [16, 6], [-16, -5]]) m.add({ type: 'light', p: [x, L + 3.2, z], color: '#ffd8a8', intensity: 18, distance: 13, group: 'lobby' });
for (const x of [-20, 0, 20]) { m.add({ type: 'streetlight', p: [x, 0, 13.4], rot: Math.PI, h: 4.5 }); m.add({ type: 'light', p: [x, 4.3, 14.6], color: '#ffc07a', intensity: 30, distance: 16 }); }
m.add({ type: 'streetlight', p: [-5, 0, -11], wall: true, rot: Math.PI }); m.add({ type: 'light', p: [-5, 3, -11.6], color: '#ffc07a', intensity: 14, distance: 10 });

// ---- the lift's shaft: its east and north walls the whole way up, the front wall round the doorway on every floor
const LO = LIFT.out, LI = LIFT.in;
box(LI.x2, LO.z1, LO.x2, LI.z2, LIFT_TOP, 'plaster');
box(LO.x1, LO.z1, LI.x2, LI.z1, LIFT_TOP, 'plaster');
for (const y of STOPS) wall('x', (LI.z2 + LO.z2) / 2, LO.x1, LO.x2, y, 'plaster', [{ from: LIFT.door.x1, to: LIFT.door.x2, height: LIFT.door.h }], LO.z2 - LI.z2, 4 - (y - Math.floor(y))); // (up through the slab above)

// ---- the laundry chute: the tube's four walls, a hatch on its west side on each floor (crouch-jump in), open at the
// bottom over a cart of laundry in the lobby's laundry room (a soft landing; everyone near hears you come down)
const C = CHUTE, T = 0.1;
const tube = (y0, h, hatch) => {
  wall('z', C.x1 + T / 2, C.z1, C.z2, y0, 'metal', hatch ? [{ from: 8.4, to: 9.4, bottom: 0.5, height: 1.6 }] : [], T, h);
  wall('z', C.x2 - T / 2, C.z1, C.z2, y0, 'metal', [], T, h);
  wall('x', C.z1 + T / 2, C.x1, C.x2, y0, 'metal', [], T, h);
  wall('x', C.z2 - T / 2, C.x1, C.x2, y0, 'metal', [], T, h);
};
tube(2.6, 1.4, false); tube(FL[1], 4, true); tube(FL[2], 4, true); tube(FL[3], 1.2, true);
box(C.x1, C.z1, C.x2, C.z2, 0.08, 'metal', FL[3] + 1.2); // its lid on the terrace
wall('z', 19, 7, Z2, L, 'plaster', [doorway(7.5)]); door(19, L, 7.5, 'z', 1); // the laundry room
wall('x', 7, 19, X2, L, 'plaster');
box(20.3, 8.3, 21.5, 9.5, 0.7, 'fabric', L); // the laundry cart under the chute
box(19.3, 9.2, 19.9, 9.8, 1.3, 'metal', L); box(21.2, 7.2, 21.8, 7.9, 1.0, 'metal', L); // a washer, a dryer

// ---- furniture and dressing (stage 2)
// guest rooms: a wardrobe, a TV on the desk, a bedside table, a painting over the bed, a rug
for (const y of [FL[1], FL[2]]) RX.slice(0, 4).forEach((x, i) => {
  for (const s of [-1, 1]) {
    const zo = s * 10, zw = s < 0 ? zo + 0.25 : zo - 0.25;
    box(x + 0.25, s < 0 ? -9.6 : 7.6, x + 1.0, s < 0 ? -7.6 : 9.6, 2.1, 'cabinet', y); // wardrobe by the window wall
    box(x + 6.9, s < 0 ? -2.0 : 1.6, x + 7.5, s < 0 ? -1.94 : 1.66, 0.4, 'black', y + 0.8); // TV
    box(x + 7.0, s < 0 ? zo + 0.3 : zo - 0.8, x + 7.5, s < 0 ? zo + 0.8 : zo - 0.3, 0.5, 'wood', y); // bedside table
    box(x + 3.2, s < 0 ? -8.6 : 4.4, x + 7.2, s < 0 ? -4.4 : 8.6, 0.06, 'fabric', y); // rug
    m.add({ type: 'painting', p: [x + 5.8, y + 1.7, s < 0 ? zo + 0.17 : zo - 0.17], w: 1.4, h: 0.9, seed: i * 7 + (s < 0 ? 1 : 2) + y, rot: s < 0 ? 0 : Math.PI });
    m.add({ type: 'ceilinglamp', p: [x + 5, y + H, s * 5.5] });
  }
});
// (rugs are 6 cm thick: the bots' grid takes a floor less than 5 cm over another for the same one, and loses both)
// guest corridors: a red runner, paintings between the doors, a plant at each end
for (const y of [FL[1], FL[2]]) {
  box(-19.4, -0.7, 12.6, 0.7, 0.06, 'fabric', y);
  for (const x of [-12.8, -4.8, 3.2, 11.2]) { m.add({ type: 'painting', p: [x, y + 1.6, -CZ + 0.12], w: 0.9, h: 0.7, seed: x + y, rot: 0 }); m.add({ type: 'painting', p: [x - 1.5, y + 1.6, CZ - 0.12], w: 0.9, h: 0.7, seed: x - y, rot: Math.PI }); }
  m.tree(12.3, 0.6, 'palm', 0.35);
}
// the lobby: a big rug, plants, luggage, stools at the bar, shelves of bottles, the kitchen's stoves and fridge
box(-10, -0.4, 10, 8.6, 0.06, 'fabric', L);
for (const [x, z] of [[-9.5, -0.5], [9.5, 8.5], [-1.5, 9], [12.5, -1]]) m.tree(x, z, 'palm', 0.45);
box(10.5, -9.2, 11.3, -8.4, 0.7, 'cardboard', L); box(11.4, -9.3, 12.1, -8.6, 0.55, 'cardboard', L); // suitcases by the desk
for (const x of [16.8, 18.2, 19.6]) box(x - 0.2, 2.3, x + 0.2, 2.7, 0.75, 'metal', L); // bar stools
box(16.4, 6.2, 18.6, 6.6, 2.4, 'winerack', L); // bottles behind the bar
box(-17, -9.9, -13, -9.6, 2.2, 'shelf', L); box(-12.8, -9.6, -11.4, -8.6, 1.9, 'metal', L); // shelves, the fridge
box(-17, -2.6, -13, -2.2, 0.08, 'metal', L + 0.95); // (the stove's hob)
box(-21.8, -9.8, -18.3, -9.3, 1.9, 'shelf', L); box(-21.8, -9.2, -21.3, -7.2, 1.9, 'shelf', L); // the freezer's racks (clear of its door)
m.add({ type: 'awning', p: [0, 3.1, 11.2], w: 6, d: 2.2, rot: 0, color: '#7a1c22' }); // over the entrance
// the penthouse: a headboard, a rug, a TV wall, a bar; loungers and an umbrella on the terrace
box(-20.2, -9.5, -15.8, -9.3, 1.3, 'wood', P); box(-19, -6.5, -12, 0.5, 0.06, 'fabric', P);
box(-7.6, -6, -7.4, -2.8, 1.6, 'black', P + 0.5); box(-1, -9.2, 3.2, -8.7, 1.05, 'wood', P);
for (const z of [-3.5, -1.5]) box(19, z, 21, z + 0.9, 0.35, 'wood', P);
m.add({ type: 'umbrella', p: [19.5, P, 1], color: '#c8a050' });
m.add({ type: 'painting', p: [-14, P + 1.8, -9.82], w: 2, h: 1.1, seed: 99, rot: 0 });

// ---- the phone tracker's cell towers (as Mansion's, shared/maps/mansion_phonetracker.js): a mast and its cabinet
// (box: shot, blown up, repaired) on the roof terrace, on the street (CT side) and in the alley behind the kitchen
const TOWERS = [
  { name: 'roof', box: { min: [20.9, P, -4.4], max: [21.6, P + 1.3, -3.8] }, mast: [21.25, P, -3.35, 5] },
  { name: 'street', box: { min: [25.6, 0, 14.7], max: [26.4, 1.3, 15.3] }, mast: [26, 0, 15.75, 8] },
  { name: 'alley', box: { min: [2, 0, -15.6], max: [2.8, 1.3, -15] }, mast: [2.4, 0, -16.05, 8] },
];
for (const { box: b, mast: [x, y, z, h] } of TOWERS) {
  m.solid(b.min[0], b.min[2], b.max[0], b.max[2], b.max[1] - b.min[1], b.min[1]);
  m.solid(x - 0.12, z - 0.12, x + 0.12, z + 0.12, h, y);
}

// ---- rooms (indoors, for the lighting and the phone tracker's "outdoors")
const room = (group, x1, y, z1, x2, z2, h = H) => ({ group, min: [x1, y - 0.05, z1], max: [x2, y + h, z2] });
const ROOMS = [room('lobby', X1, 0, Z1, X2, Z2, H + 0.1)];
for (const [k, y] of [[2, FL[1]], [3, FL[2]]]) {
  ROOMS.push(room(`corridor${k}`, X1, y, -CZ, X2, CZ));
  RX.slice(0, 4).forEach((x, i) => { ROOMS.push(room(`room${k}${i + 1}n`, x, y, Z1, RX[i + 1], -CZ)); ROOMS.push(room(`room${k}${i + 1}s`, x, y, CZ, RX[i + 1], Z2)); });
  ROOMS.push(room(`east${k}`, 13, y, Z1, X2, Z2)); // the stairwell and the linen room (the browsers light 24 rooms at most; the closets stay dark)
}
ROOMS.push(room('suite', X1, P, Z1, 4, Z2, 4), room('stairhut', 13, P, Z1, X2, -5, 3.4));

export default {
  id: 'cs_meridian',
  title: 'Hotel Meridian',
  mode: 'hostage',
  night: true,
  storm: true, // lightning, thunder, rain, power cuts (lib/storm.js, public/js/storm.js)
  towers: TOWERS, // the phone tracker's cell towers (ROADMAP 14.5)
  hostages: [
    { p: [-13, P, -8], yaw: Math.PI / 2 }, // the suite's bedroom (off its rug)
    { p: [-14, P, -6.5], yaw: 0 },
    { p: [-20, L, -8.3], yaw: Math.PI / 2 }, // the kitchen's freezer
    // a guest room, a different one every round (any of the 16: by the bathroom, off the rug)
    { p: [2, FL[2], -3.2], yaw: Math.PI, anyOf: [FL[1], FL[2]].flatMap(y => RX.slice(0, 4).flatMap(x => [-1, 1].map(s => [x + 5.5, y, s * 3.2]))) },
  ],
  boxes: m.boxes,
  decor: [...m.decor, { type: 'skyline', seed: 33, night: true }],
  bounds: { min: -31, max: 31 },
  radar: { floors: true, maxY: 16 },
  zones: {
    rescue: { min: [-26, 14], max: [26, 26] },
    buyCT: { min: [-26, 14], max: [26, 26] },
    buyT: { min: [X1, Z1], max: [4, Z2] },
  },
  spawns: {
    CT: [-8, -4, 0, 4, 8].flatMap(x => [{ p: [x, 0, 22], yaw: 0 }, { p: [x + 2, 0, 24.5], yaw: 0 }]),
    T: [[-14, 1.5], [-10, 2], [-4, -4], [-2, 2], [-16, 6], [-12, -8], [0, -2], [-6, 7]].map(([x, z]) => ({ p: [x, P, z], yaw: Math.PI / 2 })),
  },
  labels: {},
  ladders: m.ladders,
  water: [],
  doors,
  rooms: ROOMS,
  // the lift (shared/elevator.js reads it as it does the Mansion's): stops at the four floors, the cabin waits in the lobby
  elevator: {
    shaft: { ...LIFT.in }, out: { ...LIFT.out }, pit: 0, top: LIFT_TOP, stops: STOPS.slice(), home: 0,
    names: ['the lobby', 'the 2nd floor', 'the 3rd floor', 'the penthouse'],
    door: { ...LIFT.door },
    cabin: { x1: -21.68, x2: -19.8, z1: -3.6, z2: -1.27, wall: 0.05, ceil: 2.2, roof: 0.08, floor: 0.1 },
    hatch: { x1: -21.1, x2: -20.35, z1: -3.3, z2: -2.55 },
    panel: { x: -19.845, z: -1.7, ys: [1.0, 1.12, 1.24, 1.36] },
    call: STOPS.map(s => [-19.81, s + 1.1, LIFT.out.z2 + 0.005]),
    ladder: { x: LIFT.in.x1, z1: -3.4, z2: -2.8, top: LIFT_TOP - 0.1 },
  },
  // the laundry chute: drop in from any floor's hatch (or the terrace), land on the cart in the lobby's laundry
  chute: { min: [CHUTE.x1 + 0.1, CHUTE.z1 + 0.1], max: [CHUTE.x2 - 0.1, CHUTE.z2 - 0.1], bottom: L + 0.7 },
  theme: {
    skyTop: '#05070f', skyHorizon: '#141a2a', fog: ['#0c1220', 50, 260],
    sun: { color: '#9aaad4', intensity: 0.8, dir: [-30, 62, 45] }, // the moon behind the clouds
    hemi: { sky: '#3a4a78', ground: '#1a1a22', intensity: 1.0 },
    exposure: 1.25, clouds: 0.6, cloudColor: '#1e2436',
    roomGlow: 1.0, glowRooms: ROOMS.map(r => r.group), litGlass: '#a87430', viewmodel: 0.45,
  },
};
