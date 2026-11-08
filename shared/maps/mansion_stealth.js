// Mansion: stealth & hiding (ROADMAP group 4; the rules both sides use are in shared/stealth.js, the server's part in
// lib/stealth.js, the browser's in public/js/stealth.js). Called once from remodel() in mansion2.js with its helpers.
//   - 4.1 a fireplace in the living room and its chimney straight up to the roof: a secret way between the living room
//     and the roof, climbed inside the flue on iron rungs (the browsers add the ladder, like the lift's, so the bots'
//     grid never takes it). It stands on the living room's south wall, between the doorway to the south-west room and
//     the bookcase partition; upstairs it rises inside the thick wall between the Terrorists' room and the bedroom
//     (standing 19 cm out into the Ts' room) and it comes out on the west slope of the main roof. It never breaks.
//   - 4.2 the floorboards and stairs that creak (the list is in CREAKS below)
// What the game needs to know goes into one decor entry { type: 'stealth', chimney, creaks } (world.js leaves decor
// types it doesn't know alone; shared/stealth.js finds it).

// The chimney: the breast and stack (x1..x2, z1..z2) from the living room's floor to the stack's top; the flue inside
// it (f*), open from the hearth to the top; the firebox's mouth in the breast's north face (fx1..fx2 wide, up to
// `mouth`); the hearth stone (in front, and the firebox's floor), the mantel shelf.
export const CHIMNEY = {
  x1: -20.15, x2: -18.45, z1: 4.28, z2: 5.283,
  fx1: -19.72, fx2: -18.88, fz1: 4.38, fz2: 5.18,
  floor: 0.813, hearth: 0.85, mouth: 2.013, top: 10.9,
  ceil: 4.064, up: 4.267, upCeil: 6.706, roof: 6.91,
  hearthStone: { x1: -20.3, x2: -18.3, z1: 3.85 },
  mantel: { y1: 2.26, y2: 2.34, z1: 4.12 },
  // the rungs on the flue's south wall: [x, z, normal, bottom, top, width] as for a map ladder; the top is half a
  // metre under the rim, so at the top you step over the south rim onto the roof
  ladder: [-19.3, 5.18, [0, -1], 0.85, 10.4, 0.6],
};

export function addStealth({ carve, unface, face, brush, decor, keep }) {
  const C = CHIMNEY;
  const brick = 'c1a4_silo2b', stone = 'x_stone', soot = 'black', plaster = 'fifties_wall14';
  const cap = 'x_concrete', wood = 'x_wood';

  // ---- clear the way: the living room's south wall, the floor and the wall upstairs, the ceiling slab and the roof
  // inside the chimney's footprint (the living room's floor, at the box's foot, stays)
  carve(C.x1, C.floor, C.z1, C.x2, C.top + 0.1, C.z2);

  // ---- the solids: the four walls round the flue, from the floor to the top (the north one above the firebox's mouth)
  const wall = (x1, y1, z1, x2, y2, z2) => brush(x1, y1, z1, x2, y2, z2, soot, ['top', 'bottom', '-x', '+x', '-z', '+z']);
  wall(C.x1, C.floor, C.z1, C.fx1, C.top, C.z2); // west
  wall(C.fx2, C.floor, C.z1, C.x2, C.top, C.z2); // east
  wall(C.fx1, C.mouth, C.z1, C.fx2, C.top, C.fz1); // north, over the mouth
  wall(C.fx1, C.floor, C.fz2, C.fx2, C.top, C.z2); // south (the back)
  // the hearth: a stone slab in front of the breast and on the firebox's floor (a step of 4 cm)
  const H = C.hearthStone;
  brush(H.x1, C.floor, H.z1, H.x2, C.hearth, C.z1, stone, ['bottom', '+z']);
  brush(C.fx1, C.floor, C.z1, C.fx2, C.hearth, C.fz2, soot, ['bottom', '-x', '+x', '-z', '+z']);
  // the mantel shelf over the mouth
  brush(H.x1, C.mantel.y1, C.mantel.z1, H.x2, C.mantel.y2, C.z1, wood, ['+z']);
  keep.push([H.x1 - 0.01, C.floor - 0.01, H.z1 - 0.01, H.x2 + 0.01, C.top + 0.11, C.z2 + 0.01]);

  // ---- the faces
  const q = (t, axis, sign, at, lo, hi) => face(t, axis, sign, at, lo, hi);
  // the breast in the living room (brick), round the mouth; its sides back to the wall
  for (const [x1, x2, y1] of [[C.x1, C.fx1, C.floor], [C.fx2, C.x2, C.floor], [C.fx1, C.fx2, C.mouth]]) {
    q(brick, 2, -1, C.z1, [x1, y1, 0], [x2, C.ceil, 0]);
  }
  q(brick, 0, -1, C.x1, [0, C.floor, C.z1], [0, C.ceil, 4.877]);
  q(brick, 0, 1, C.x2, [0, C.floor, C.z1], [0, C.ceil, 4.877]);
  // the mouth: its sides and the lintel's underside (stone), then the flue inside, black with soot, hearth to top
  q(stone, 0, 1, C.fx1, [0, C.hearth, C.z1], [0, C.mouth, C.fz1]);
  q(stone, 0, -1, C.fx2, [0, C.hearth, C.z1], [0, C.mouth, C.fz1]);
  q(stone, 1, -1, C.mouth, [C.fx1, 0, C.z1], [C.fx2, 0, C.fz1]);
  q(soot, 0, 1, C.fx1, [0, C.hearth, C.fz1], [0, C.top, C.fz2]);
  q(soot, 0, -1, C.fx2, [0, C.hearth, C.fz1], [0, C.top, C.fz2]);
  q(soot, 2, -1, C.fz2, [C.fx1, C.hearth, 0], [C.fx2, C.top, 0]);
  q(soot, 2, 1, C.fz1, [C.fx1, C.mouth, 0], [C.fx2, C.top, 0]);
  // upstairs, in the Ts' room: the breast in the room's plaster, its sides back to the wall
  q(plaster, 2, -1, C.z1, [C.x1, C.up, 0], [C.x2, C.upCeil, 0]);
  q(plaster, 0, -1, C.x1, [0, C.up, C.z1], [0, C.upCeil, 4.47]);
  q(plaster, 0, 1, C.x2, [0, C.up, C.z1], [0, C.upCeil, 4.47]);
  // (the built-in bookcase along that wall now stops either side of the breast: its open top shelf, a niche
  // x -21.84..-19.91 deep into the wall, gets an end)
  q(plaster, 0, -1, C.x1, [0, 6.096, 4.47], [0, 6.502, 4.877]); // (in the breast's plaster: a cabinet texture here would be a mesh of its own)
  // the bedroom's shelf niches on the other side: where their backs are now the chimney (which never breaks, so they
  // are drawn as the level's, not a breakable piece's), in wood (the level's own has no cabinet-textured faces)
  unface(C.x1, 5.0, C.z2 - 0.005, C.x2, 6.1, C.z2 + 0.005);
  q(wood, 2, 1, C.z2, [-19.71, 5.08, 0], [C.x2, 5.486, 0]);
  q(wood, 2, 1, C.z2, [C.x1, 5.588, 0], [-19.914, 5.994, 0]);
  // the stack over the roof (brick; below the roof's surface these are inside the roof), its rim (concrete)
  q(brick, 2, -1, C.z1, [C.x1, C.roof, 0], [C.x2, C.top, 0]);
  q(brick, 2, 1, C.z2, [C.x1, C.roof, 0], [C.x2, C.top, 0]);
  q(brick, 0, -1, C.x1, [0, C.roof, C.z1], [0, C.top, C.z2]);
  q(brick, 0, 1, C.x2, [0, C.roof, C.z1], [0, C.top, C.z2]);
  for (const [x1, z1, x2, z2] of [[C.x1, C.z1, C.fx1, C.z2], [C.fx2, C.z1, C.x2, C.z2], [C.fx1, C.z1, C.fx2, C.fz1], [C.fx1, C.fz2, C.fx2, C.z2]]) {
    q(cap, 1, 1, C.top, [x1, 0, z1], [x2, 0, z2]);
  }
  // the rungs: U-shaped step irons set in the south wall every 35 cm, drawn as part of the level (merged with its
  // other metal: no draw call of their own); the browsers make them climbable, and take them away while a fire burns
  const [lx, lz, , y0, y1, w] = C.ladder;
  for (let y = y0 + 0.3; y < y1 + 0.3; y += 0.35) {
    brush(lx - w / 2 + 0.08, y, lz - 0.07, lx + w / 2 - 0.08, y + 0.03, lz, 'x_metal', ['+z', '-x', '+x'], false);
  }

  decor.push({ type: 'stealth', chimney: { ...C }, creaks: CREAKS.map(c => ({ ...c })) });
}

// ---- 4.2 the floorboards and stairs that creak: { name, box: [x1, z1, x2, z2], y (the floor's height there) }
export const CREAKS = [];
