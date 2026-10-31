// Mansion 2.0: what cs_mansion has beyond the original level. It is added the way the converted level is made:
// solid boxes plus the faces drawn on them (in the level's own textures, or a few painted ones below), so the new
// parts break, burn, cover the sky (mortar shells), show on the radar and sound like the rest. Openings are carved
// out of the level's solids and faces first. Everything is in metres, y up; the house's ground floor is at 0.81.
//   - a back door from the kitchen (the north-west room) to the back of the house, weak, slow and loud
//   - a wine cellar under the living room, down a stair from the kitchen through what was a walled-up closet
//   - the house's fuse box in the cellar (blackout, see the fuse box in server.js)
//   - a smugglers' tunnel from the cellar to a hatch in the shed's floor
//   - a storm drain from a grate in the street to a grate in the cellar's floor
//   - the roof of the front porch made a terrace, with a drainpipe ladder up to it
//   - a garage against the house's north wall: a roller door to the lawn, a car inside, a side door to the kitchen
//   - the neighbour's house across the street (CT side): two storeys, its bedroom window facing the mansion
//   - a back garden west of the estate wall: a pool, a gazebo, a glass greenhouse and a hedge maze
import { clip } from './breakables.js';

const IN = 0.0254; // a texel, in metres

// Painted textures for the new parts: name -> [painter (see world.js), texture size in texels]
export const NEW_TEX = {
  x_concrete: ['concrete', 64], x_wood: ['wood', 40], x_shelf: ['shelf', 64], x_metal: ['metal', 40],
  x_gravel: ['gravel', 80], x_wine: ['winerack', 40], x_earth: ['rubble', 80], x_deck: ['deck', 80], x_trim: ['trim', 40], x_stone: ['stone', 80],
  x_tools: ['toolshelf', 64], x_tanbrick: ['tanbrick', 64], x_parquet: ['parquet', 64],
};

// ---- geometry: a solid is [x1, y1, z1, x2, y2, z2]; a face is a flat array [x, y, z, u, v, ...] whose first
// three corners turn counter-clockwise seen from the front (u, v in repeats of its texture).
const AXES = [[1, 2], [2, 0], [0, 1]];

// A rectangle on the plane pos[axis] = at, facing `sign` along that axis, over lo..hi of the other two axes.
function quad(axis, sign, at, lo, hi, size) {
  const [b, c] = AXES[axis];
  let pts = [[lo[b], lo[c]], [hi[b], lo[c]], [hi[b], hi[c]], [lo[b], hi[c]]];
  if (sign < 0) pts = pts.reverse();
  const out = [];
  for (const [pb, pc] of pts) {
    const v = [0, 0, 0];
    v[axis] = at; v[b] = pb; v[c] = pc;
    // walls: u along the wall, v down; floors and ceilings: u along x, v along z
    const [u, w] = axis === 1 ? [v[0], v[2]] : axis === 0 ? [v[2], -v[1]] : [v[0], -v[1]];
    out.push(v[0], v[1], v[2], u / (size[0] * IN), w / (size[1] * IN));
  }
  return out;
}

// What is left of solid s with box c taken out: up to six boxes.
function minusBox(s, c) {
  if (![0, 1, 2].every(k => s[k] < c[k + 3] && s[k + 3] > c[k])) return [s];
  const out = [];
  let r = s.slice();
  for (let k = 0; k < 3; k++) {
    if (r[k] < c[k]) { const a = r.slice(); a[k + 3] = c[k]; out.push(a); r[k] = c[k]; }
    if (r[k + 3] > c[k + 3]) { const a = r.slice(); a[k] = c[k + 3]; out.push(a); r[k + 3] = c[k + 3]; }
  }
  return out;
}

// What is left of a face with box c taken out (a face lying on the box's side stays).
function minusFace(f, c) {
  const lo = [0, 1, 2].map(k => { let m = Infinity; for (let i = k; i < f.length; i += 5) m = Math.min(m, f[i]); return m; });
  const hi = [0, 1, 2].map(k => { let m = -Infinity; for (let i = k; i < f.length; i += 5) m = Math.max(m, f[i]); return m; });
  if ([0, 1, 2].some(k => hi[k] <= c[k] + 1e-4 || lo[k] >= c[k + 3] - 1e-4)) return [f];
  const out = [];
  let rest = f;
  for (let k = 0; k < 3 && rest; k++) {
    const below = clip(rest, k, c[k], false), above = clip(rest, k, c[k + 3], true);
    if (below) out.push(below);
    if (above) out.push(above);
    rest = clip(rest, k, c[k], true);
    rest = rest && clip(rest, k, c[k + 3], false);
  }
  return out;
}

export function remodel(SOLIDS, FACES, TEXTURES) {
  let solids = SOLIDS.map(s => s.slice());
  const faces = {};
  for (const [t, polys] of Object.entries(FACES)) faces[t] = polys.slice();
  const tex = { ...TEXTURES };
  for (const [t, [, n]] of Object.entries(NEW_TEX)) tex[t] = [n, n];
  const doors = [], decor = [], ladders = [], rooms = [], switches = [];
  const keep = []; // boxes whose solids never break (steps, oil drums), see breakable() in mansion.js

  // Take a box out of the level: its solids and the faces inside it.
  const carve = (x1, y1, z1, x2, y2, z2) => {
    const c = [x1, y1, z1, x2, y2, z2];
    solids = solids.flatMap(s => minusBox(s, c));
    for (const t of Object.keys(faces)) faces[t] = faces[t].flatMap(f => minusFace(f, c));
  };
  // Take only the faces in a box away (the solids stay).
  const unface = (...c) => { for (const t of Object.keys(faces)) faces[t] = faces[t].flatMap(f => minusFace(f, c)); };
  const face = (t, axis, sign, at, lo, hi) => (faces[t] ||= []).push(quad(axis, sign, at, lo, hi, tex[t] || [64, 64]));
  // A solid box with its faces: `t` is one texture or { top, bottom, side, x, z } (x: the faces looking along x);
  // skip: sides not drawn ('top', 'bottom', '-x', '+x', '-z', '+z'); solid: false for something only drawn.
  const brush = (x1, y1, z1, x2, y2, z2, t, skip = [], solid = true) => {
    if (solid) solids.push([x1, y1, z1, x2, y2, z2]);
    const lo = [x1, y1, z1], hi = [x2, y2, z2];
    const pick = (name, axis) => (typeof t === 'string' ? t : t[name] || t[axis === 0 ? 'x' : axis === 2 ? 'z' : name] || t.side);
    for (const [axis, sign, name] of [[1, 1, 'top'], [1, -1, 'bottom'], [0, -1, '-x'], [0, 1, '+x'], [2, -1, '-z'], [2, 1, '+z']]) {
      if (skip.includes(name)) continue;
      const tt = axis === 1 ? pick(name, axis) : pick(name, axis);
      face(tt, axis, sign, sign > 0 ? hi[axis] : lo[axis], lo, hi);
    }
  };
  // Rooms dug out of the ground (cellar, tunnels, shafts): each is a box [x1, y1, z1, x2, y2, z2] with { floor, ceil,
  // wall } textures and `open` sides (no face, no shell). Its shell of solid stops anyone leaving, the level inside
  // it is carved away, and its faces look inwards — except where it meets another dug-out room (this call's or an
  // earlier one's), so connected rooms open into each other.
  const holes = [];
  const hollow = list => {
    const T = 0.3, shells = [];
    for (const h of list) {
      const [x1, y1, z1, x2, y2, z2] = h.box, open = h.open || [];
      if (!open.includes('bottom')) shells.push([x1 - T, y1 - T, z1 - T, x2 + T, y1, z2 + T]);
      if (!open.includes('top')) shells.push([x1 - T, y2, z1 - T, x2 + T, y2 + T, z2 + T]);
      shells.push([x1 - T, y1, z1 - T, x1, y2, z2 + T], [x2, y1, z1 - T, x2 + T, y2, z2 + T], [x1, y1, z1 - T, x2, y2, z1], [x1, y1, z2, x2, y2, z2 + T]);
    }
    // (a shell never reaches into a room dug earlier: that one may be furnished by now)
    for (let s of shells) solids.push(...holes.reduce((acc, o) => acc.flatMap(b => minusBox(b, o.box)), [s]));
    for (const h of list) carve(...h.box);
    holes.push(...list);
    for (const h of list) {
      const lo = h.box.slice(0, 3), hi = h.box.slice(3), open = h.open || [];
      for (const [axis, sign, name, t] of [[1, 1, 'bottom', h.floor], [1, -1, 'top', h.ceil], [0, 1, '-x', h.wall], [0, -1, '+x', h.wall], [2, 1, '-z', h.wall], [2, -1, '+z', h.wall]]) {
        if (open.includes(name)) continue;
        let polys = [quad(axis, sign, sign > 0 ? lo[axis] : hi[axis], lo, hi, tex[t] || [64, 64])];
        for (const o of holes) if (o !== h) polys = polys.flatMap(f => minusFace(f, o.box.map((v, k) => v + (k < 3 ? -0.01 : 0.01))));
        (faces[t] ||= []).push(...polys);
      }
    }
  };
  // The sides of a hole through a wall (x1..x2 thick along `axis`), from y1 to y2 and a..b along the wall.
  const reveal = (axis, w1, w2, a, b, y1, y2, t, sill = null) => {
    const o = axis === 0 ? 2 : 0;
    const lo = [0, 0, 0], hi = [0, 0, 0];
    lo[axis] = w1; hi[axis] = w2; lo[1] = y1; hi[1] = y2;
    lo[o] = hi[o] = a; face(t, o, 1, a, lo, hi);
    lo[o] = hi[o] = b; face(t, o, -1, b, lo, hi);
    lo[o] = a; hi[o] = b;
    face(t, 1, -1, y2, lo, hi);
    if (sill) face(sill, 1, 1, y1, lo, hi);
  };

  // ---------------------------------------------------------------- 5. the kitchen's back door
  // In the west (back) wall of the kitchen, between the window and the filing cabinet; three stone steps down to
  // the lawn behind the house. The door is old: it sticks and creaks open slowly (loud), and breaks easily.
  {
    const z1 = -9.3, z2 = -8.1, top = 3.01;
    carve(-23.7, 0.81, z1, -23.24, top, z2);
    reveal(0, -23.67, -23.27, z1, z2, 0.81, top, 'c1a1w1d', 'c1a2_flr1');
    for (const [x, h] of [[-24.89, 0.27], [-24.49, 0.54], [-24.09, 0.81]]) brush(x, 0, z1 - 0.25, -23.67, h, z2 + 0.25, 'crete3_wall02', ['bottom', '+x']);
    doors.push({ axis: 'z', dir: 1, len: z2 - z1, h: top - 0.81 - 0.02, hinge: [-23.47, 0.81, z1], tex: 'door1', slow: 1.6, weak: true });
  }

  // ---------------------------------------------------------------- 6. the wine cellar
  // The closet between the kitchen and the hall was walled up; now a doorway from the kitchen opens onto a stair
  // that goes down under the living room into a low cellar (stone walls, wooden beams, one bulb): wine racks along
  // the walls, barrels, a table. Its ceiling is the ground floor, which never breaks.
  const CELLAR = [-22.9, -2.2, -5.49, -13.31, 0.61, 4.5];
  {
    // the doorway from the kitchen, in the closet's north wall
    carve(-15.4, 0.81, -10.2, -13.9, 3.0, -9.7);
    reveal(2, -10.16, -9.75, -15.4, -13.9, 0.81, 3.0, 'c1a1w1d', 'c1a2_flr1');
    const stone = 'crete3_wall01b', beams = 'x_wood', flags = 'x_concrete';
    carve(-15.54, 0.6, -9.75, -13.31, 0.82, -5.49); // the closet's floor
    hollow([
      { box: [-15.54, -2.2, -9.75, -13.31, 0.81, -5.49], floor: flags, ceil: beams, wall: stone, open: ['top'] },
      { box: CELLAR, floor: flags, ceil: beams, wall: stone },
    ]);
    // 15 steps down, 0.2 m each, 0.33 m deep: steep enough to pass under the closet's south wall standing up
    for (let i = 0; i < 14; i++) {
      const top = 0.81 - (0.81 + 2.2) * (i + 1) / 15, z = -9.75 + 0.33 * i;
      brush(-15.54, -2.2, z, -13.31, top, z + 0.33, { top: 'x_wood', side: 'x_wood', x: stone }, ['bottom', '-z', '+x']);
    }
    // wine racks along the west and south walls, a table, beams under the ceiling
    for (const [z1, z2] of [[-5.3, -2.6], [-1.6, 1.1], [2.0, 4.3]]) brush(-22.9, -2.2, z1, -22.35, -0.1, z2, 'x_wine', ['bottom', '-x']);
    for (const [x1, x2] of [[-21.9, -19.6], [-18.6, -16.4]]) brush(x1, -2.2, 3.95, x2, -0.1, 4.5, 'x_wine', ['bottom', '+z']);
    brush(-18.2, -1.45, -1.3, -16.9, -1.38, -0.2, 'x_wood', []);
    for (const [x, z] of [[-18.1, -1.2], [-17.0, -1.2], [-18.1, -0.3], [-17.0, -0.3]]) brush(x - 0.04, -2.2, z - 0.04, x + 0.04, -1.45, z + 0.04, 'x_wood', ['bottom']);
    for (const x of [-20.6, -17.6]) brush(x, 0.36, -5.49, x + 0.25, 0.61, 4.5, 'x_wood', ['top']);
    // barrels: a stack by the stairs and a row along the north wall (each a solid under the drawn barrel)
    for (const [x, z] of [[-20.9, -4.9], [-20.2, -4.9], [-19.5, -4.9], [-16.2, -3.6], [-16.2, -2.9], [-20.0, 1.0], [-19.4, 1.5]]) {
      solids.push([x - 0.3, -2.2, z - 0.3, x + 0.3, -1.15, z + 0.3]);
      decor.push({ type: 'barrel', p: [x, -2.2, z], color: '#6a4424' });
    }
    // one bare bulb, switched at the foot of the stairs
    decor.push({ type: 'ceilinglamp', p: [-18.6, 0.61, -0.6], group: 'cellar' });
    decor.push({ type: 'light', p: [-18.6, 0.11, -0.6], color: '#ffd8a0', intensity: 14, distance: 11, group: 'cellar' });
    switches.push({ group: 'cellar', p: [-13.32, -0.9, -3.6], rot: -Math.PI / 2 });
    // the fuse box on the north wall, by the barrels: its lever cuts the power to the whole house
    decor.push({ type: 'fusebox', p: [-18.3, -0.95, -5.4], rot: 0 });
    rooms.push({ group: 'cellar', power: true, amb: 0.32, min: [-22.95, -2.3, -9.8], max: [-13.25, 0.6, 4.55] });
  }

  // ---------------------------------------------------------------- 8. the smugglers' tunnel
  // From the cellar's south-east corner: a narrow dug passage (1.3 m wide, 2 m high, shored up with timber) east
  // under the lawn, then south to under the shed, where a ladder goes up to a trapdoor in the shed's floor. The
  // trapdoor creaks loudly when it opens. About 40 m.
  {
    const y1 = -2.2, y2 = -0.2;
    const legs = [
      [-14.8, y1, 4.4, -13.5, y2, 6.3], // out of the cellar
      [-14.8, y1, 5.0, 14.8, y2, 6.3], // east under the lawn
      [13.5, y1, 5.0, 14.8, y2, 16.8], // south to the shed
    ];
    const hatchAt = [13.6, 15.7, 14.7, 16.8], floorY = 0.2; // the shed's floor
    carve(hatchAt[0], 0, hatchAt[1], hatchAt[2], floorY + 0.01, hatchAt[3]);
    hollow([
      ...legs.map(box => ({ box, floor: 'x_earth', ceil: 'x_wood', wall: 'x_earth' })),
      { box: [hatchAt[0], y2 - 0.05, hatchAt[1], hatchAt[2], floorY, hatchAt[3]], floor: 'x_earth', ceil: 'x_wood', wall: 'x_wood', open: ['top', 'bottom'] },
    ]);
    // timber frames every 4 m: two posts and a beam (the posts don't catch anyone walking along the wall)
    for (let x = -11; x < 13; x += 4) {
      brush(x, y1, 5.0, x + 0.16, y2, 5.1, 'x_wood', ['bottom', 'top', '-z'], false);
      brush(x, y1, 6.2, x + 0.16, y2, 6.3, 'x_wood', ['bottom', 'top', '+z'], false);
      brush(x, y2 - 0.14, 5.1, x + 0.16, y2, 6.2, 'x_wood', ['top']);
    }
    for (let z = 8.5; z < 15; z += 4) {
      brush(13.5, y1, z, 13.6, y2, z + 0.16, 'x_wood', ['bottom', 'top', '-x'], false);
      brush(14.7, y1, z, 14.8, y2, z + 0.16, 'x_wood', ['bottom', 'top', '+x'], false);
      brush(13.6, y2 - 0.14, z, 14.7, y2, z + 0.16, 'x_wood', ['top']);
    }
    for (const p of [[-10, 5.65], [0, 5.65], [10, 5.65]]) decor.push({ type: 'tunnel-lamp', p: [p[0], y2 - 0.2, p[1]] });
    decor.push({ type: 'tunnel-lamp', p: [14.15, y2 - 0.2, 11] });
    ladders.push([hatchAt[0], (hatchAt[1] + hatchAt[3]) / 2, [1, 0], y1, floorY + 0.95, 0.8]);
    doors.push({ hatch: { min: [hatchAt[0], hatchAt[1]], max: [hatchAt[2], hatchAt[3]], y: floorY, side: '+x' }, hinge: [hatchAt[2], floorY, (hatchAt[1] + hatchAt[3]) / 2], tex: 'wood', slow: 0.9 });
    // one lighting box for both legs (the rest of it is solid ground: nothing else is drawn there)
    rooms.push({ group: 'tunnel', amb: 0.4, min: [-14.85, -2.3, 4.45], max: [14.85, -0.15, 16.85] });
  }

  // ---------------------------------------------------------------- 9. the storm drain
  // A grate in the street in front of the gate (the CTs' side) opens onto a shaft and a ladder down into a concrete
  // drain with a trickle of dirty water; it runs west under the lawn and the fountain (with a jog half way, so it
  // isn't one long shooting gallery) to below the cellar, where a ladder goes up through a grate in the cellar's
  // floor. Both iron grates clank open slowly. With the smugglers' tunnel it makes a loop under the estate.
  {
    const y1 = -5.0, y2 = -3.0, street = [25.9, -2.6, 26.9, -1.4], cellar = [-19.6, -0.2, -18.6, 1.0];
    const legs = [[3.4, y1, -2.6, 26.9, y2, -1.4], [3.4, y1, -2.6, 4.6, y2, 1.0], [-19.6, y1, -0.2, 4.6, y2, 1.0]];
    carve(street[0], -0.5, street[1], street[2], 0.01, street[3]);
    carve(cellar[0], -2.6, cellar[1], cellar[2], -2.19, cellar[3]);
    hollow([
      ...legs.map(box => ({ box, floor: 'x_concrete', ceil: 'x_concrete', wall: 'out_w5' })),
      { box: [street[0], y2 - 0.05, street[1], street[2], 0, street[3]], floor: 'x_concrete', ceil: 'x_concrete', wall: 'x_concrete', open: ['top', 'bottom'] },
      { box: [cellar[0], y2 - 0.05, cellar[1], cellar[2], -2.2, cellar[3]], floor: 'x_concrete', ceil: 'x_concrete', wall: 'x_concrete', open: ['top', 'bottom'] },
    ]);
    for (const [x1, z1, x2, z2] of [[3.4, -2.6, 26.9, -1.4], [3.4, -1.4, 4.6, -0.2], [-19.6, -0.2, 4.6, 1.0]]) {
      decor.push({ type: 'water', min: [x1, z1], max: [x2, z2], y: y1 + 0.12, color: '#2e4a3a', murky: true });
    }
    for (const p of [[20, -2.0], [9, -2.0], [-2, 0.4], [-13, 0.4]]) decor.push({ type: 'tunnel-lamp', p: [p[0], y2 - 0.15, p[1]] });
    decor.push({ type: 'pipe', from: [26.9, y2 - 0.3, -1.55], to: [4.6, y2 - 0.3, -1.55] });
    decor.push({ type: 'pipe', from: [4.6, y2 - 0.3, 0.85], to: [-19.6, y2 - 0.3, 0.85] });
    ladders.push([street[2], (street[1] + street[3]) / 2, [-1, 0], y1, 0.95, 0.8]);
    ladders.push([cellar[0], (cellar[1] + cellar[3]) / 2, [1, 0], y1, -2.2 + 0.95, 0.8]);
    const grate = (r, y, side) => doors.push({ hatch: { min: [r[0], r[1]], max: [r[2], r[3]], y, side }, grate: true, hinge: [(r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2], tex: 'metal', slow: 0.8 });
    grate(street, 0, '-x');
    grate(cellar, -2.2, '+x');
    // one lighting box for the three legs (deep underground: nothing else is drawn in it)
    rooms.push({ group: 'tunnel', amb: 0.4, min: [-19.65, -5.1, -2.65], max: [26.95, -2.95, 1.05] });
  }

  // ---------------------------------------------------------------- 10. the roof terrace
  // The porch roof (4.27 m, the top floor's level, behind a waist-high parapet) was always there, through the opening
  // over the front door; now it's furnished — a table, a bench and two potted shrubs, cover for whoever crouches —
  // and a drainpipe with a ladder runs up the porch's north-east corner from the lawn. Open to the sky (the mortar
  // reaches it) and seen from the lawn on three sides.
  {
    const y = 4.27;
    brush(-5.6, y + 0.72, -6.0, -4.4, y + 0.78, -4.8, 'x_wood');
    brush(-5.05, y, -5.45, -4.95, y + 0.72, -5.35, 'x_wood', ['bottom']);
    brush(-6.35, y, 2.0, -5.85, y + 0.45, 4.6, 'x_wood', ['bottom', '-x']);
    for (const z of [-8.9, 5.6]) {
      brush(-4.3, y, z - 0.3, -3.7, y + 0.5, z + 0.3, 'c1a4_silo2b', ['bottom']);
      decor.push({ type: 'tree', kind: 'cypress', p: [-4.0, y + 0.5, z], s: 0.45 });
    }
    decor.push({ type: 'pipe', from: [-3.27, 0, -9.62], to: [-3.27, 5.1, -9.62] });
    ladders.push([-3.35, -9.45, [1, 0], 0, 5.3, 0.5]);
  }

  // ---------------------------------------------------------------- 11. the garage
  // Against the house's north wall, between the manhole and the ladder, its back wall the estate wall: a flat-roofed
  // garage with a steel roller door onto the north lawn (E rolls it up in 2 s, loudly; a blast tears it out) and a
  // car parked inside facing it (see vehicles in mansion.js), tool shelves, a workbench, oil drums and a strip light.
  // A side door from the kitchen opens onto three steps down (the kitchen's north window looks into the garage).
  // Its walls and roof break like the house's.
  {
    const [x1, z1, x2, z2, top] = [-22.35, -20.73, -15.85, -14.43, 3.3], T = 0.25, roof = top + 0.2;
    const d1 = -20.0, d2 = -15.8, dh = 2.7; // the roller door's opening in the east wall
    const ext = 'out_wall4a', int = 'x_concrete';
    carve(x1, -0.1, z1, x2, 0.001, z2); // (10 cm: the bots' grid takes floors within 5 cm of each other for one)
    brush(x1, -0.1, z1, x2, 0, z2, int, ['bottom', '-x', '+x', '-z', '+z']);
    // the west wall, the east wall around the door, the roof (gravel on top)
    brush(x1 - T, 0, z1, x1, top, z2, { '-x': ext, '+x': int, side: ext }, ['bottom', 'top', '-z', '+z']);
    for (const [a, b, end] of [[z1, d1, '-z'], [d2, z2, '+z']]) brush(x2, 0, a, x2 + T, top, b, { '+x': ext, '-x': int, side: int }, ['bottom', 'top', end]);
    brush(x2, dh, d1, x2 + T, top, d2, { '+x': ext, '-x': int, bottom: int }, ['top', '-z', '+z']);
    brush(x1 - T, top, z1, x2 + T, roof, z2, { top: 'x_gravel', bottom: int, side: 'x_trim' }, ['-z', '+z']);
    // the roller door, and its drum under the ceiling
    doors.push({ roller: { min: [x2 + 0.07, d1], max: [x2 + 0.18, d2], y: 0, h: dh }, tex: 'roller', slow: 2.0 });
    brush(x2 - 0.35, dh + 0.05, d1, x2, top - 0.05, d2, 'x_metal', ['+x'], false);
    // the side door from the kitchen (between the filing cabinet and the window) and three concrete steps down
    const k1 = -22.05, k2 = -21.05, ktop = 3.0, wall = [-14.43, -14.02];
    carve(k1, 0.813, wall[0] - 0.03, k2, ktop, wall[1] + 0.03); // (the kitchen floor's top is at 0.813)
    reveal(2, wall[0], wall[1], k1, k2, 0.813, ktop, 'c1a1w1d', 'c1a2_flr1');
    for (const [z, h] of [[-15.63, 0.27], [-15.23, 0.54], [-14.83, 0.81]]) {
      brush(k1 - 0.1, 0, z, k2 + 0.1, h, wall[0], 'crete3_wall02', ['bottom', '+z']);
      keep.push([k1 - 0.11, -0.01, z - 0.01, k2 + 0.11, h + 0.01, wall[0] + 0.01]);
    }
    doors.push({ axis: 'x', dir: 1, len: k2 - k1, h: ktop - 0.81 - 0.02, hinge: [k1, 0.81, (wall[0] + wall[1]) / 2], tex: 'door1' });
    // tool shelves in the north-west corner, a workbench along the estate wall, oil drums by the door
    brush(x1, 0, z1, x1 + 0.45, 2.1, -18.95, 'x_tools', ['bottom', '-x', '-z']);
    brush(x1 + 0.45, 0, z1, -20.2, 2.1, z1 + 0.45, 'x_tools', ['bottom', '-z']);
    brush(-19.9, 0, z1, -17.0, 0.92, z1 + 0.7, { top: 'x_wood', side: 'x_tools' }, ['bottom', '-z']);
    for (const [x, z, c] of [[-16.35, -15.05, '#3a5a8a'], [-17.05, -14.85, '#8a3a2a'], [-16.4, -20.2, '#3a6a3a']]) {
      solids.push([x - 0.3, 0, z - 0.3, x + 0.3, 1.05, z + 0.3]);
      keep.push([x - 0.31, -0.01, z - 0.31, x + 0.31, 1.06, z + 0.31]);
      decor.push({ type: 'barrel', p: [x, 0, z], color: c });
    }
    // a lamp under the ceiling, switched by the steps
    decor.push({ type: 'ceilinglamp', p: [-19.1, top, -17.6], group: 'garage' });
    decor.push({ type: 'light', p: [-19.1, top - 0.5, -17.6], color: '#e8eeff', intensity: 20, distance: 10, group: 'garage' });
    switches.push({ group: 'garage', p: [x1 + 0.01, 1.4, -15.2], rot: Math.PI / 2 });
    rooms.push({ group: 'garage', power: true, min: [x1, -0.1, z1], max: [x2, top, z2] });
  }

  // ---------------------------------------------------------------- 12. the neighbour's house
  // Across the street from the gate, on the CTs' side: a gap in the street's east wall leads into a small walled
  // garden and a flat-roofed, two-storey brick house — a living room below, a bedroom above, stairs along the east
  // wall. The bedroom's window faces the mansion over the street wall and the estate wall: glass you can shoot out,
  // and a view of the lawn and the front of the house. The invisible wall over the street wall is gone along the
  // garden; new ones stand over the garden walls. Its walls and roof break like the house's; it has its own lights
  // (not on the mansion's fuse box).
  const windows = [];
  {
    const [gx1, gz1, gx2, gz2] = [30.79, -12.2, 39.8, -0.8]; // the garden, inside its walls
    const [hx1, hz1, hx2, hz2] = [32.3, -10.6, 38.9, -3.4], T = 0.25; // the house, outside its walls
    const [ix1, iz1, ix2, iz2] = [hx1 + T, hz1 + T, hx2 - T, hz2 - T]; // inside
    const up = 3.2, ceil = 5.8, gw = 2.2; // the bedroom's floor, the roof's underside, the garden walls' height
    const ext = 'x_tanbrick', int = 'c1a1w1d', wall = 'c1a3wall05', gate = [-7.6, -6.4], door = [-7.5, -6.5], win = [-8.4, -5.6, 4.1, 5.4];
    // the street wall: no invisible wall over it here (nor along its top beyond), a gap in it, a face on its garden side
    carve(29.16, 3.45, gz1, 30.79, 17.3, gz2);
    solids.push([28.7, 3.45, gz1 - 0.3, 29.16, 20, gz1], [28.7, 3.45, gz2, 29.16, 20, gz2 + 0.3]);
    carve(28.7, 0, gate[0], 30.85, 2.4, gate[1]);
    reveal(0, 28.75, 30.79, gate[0], gate[1], 0, 2.4, wall, 'c2a4_flr1');
    face(wall, 0, 1, 30.79, [0, 0, gz1], [0, 3.45, gate[0]]);
    face(wall, 0, 1, 30.79, [0, 0, gate[1]], [0, 3.45, gz2]);
    face(wall, 0, 1, 30.79, [0, 2.4, gate[0]], [0, 3.45, gate[1]]);
    // its top, seen from the bedroom now: in the wall's stone all along (it was street-coloured where it showed at all)
    unface(28.7, 3.4, -21.2, 30.85, 3.5, 1.7);
    face(wall, 1, 1, 3.45, [28.75, 0, -21.13], [30.79, 0, 1.63]);
    // the ground: grass, a paved path from the gap to the front door, a wooden floor in the house
    for (const [x1, z1, x2, z2, t] of [[gx1, gz1, hx1, gate[0]], [gx1, gate[0], hx1, gate[1], 'c2a4_flr1'], [gx1, gate[1], hx1, gz2], [hx2, gz1, gx2, gz2],
      [hx1, gz1, hx2, hz1], [hx1, hz2, hx2, gz2], [hx1, hz1, hx2, hz2, 'x_parquet']]) {
      brush(x1, -0.3, z1, x2, 0, z2, t || '-0out_grss1', ['bottom', '-x', '+x', '-z', '+z']);
    }
    // the garden walls, and invisible walls over them
    brush(gx1, 0, gz1 - T, gx2 + T, gw, gz1, { '+z': wall, top: wall }, ['bottom', '-z', '-x', '+x']);
    brush(gx1, 0, gz2, gx2 + T, gw, gz2 + T, { '-z': wall, top: wall }, ['bottom', '+z', '-x', '+x']);
    brush(gx2, 0, gz1, gx2 + T, gw, gz2, { '-x': wall, top: wall }, ['bottom', '+x', '-z', '+z']);
    solids.push([gx1, gw, gz1 - T, gx2 + T, 20, gz1], [gx1, gw, gz2, gx2 + T, 20, gz2 + T], [gx2, gw, gz1, gx2 + T, 20, gz2]);
    // the walls, the flat roof (gravel) with a low parapet
    brush(hx1, 0, hz1, hx2, ceil, iz1, { '-z': ext, '+z': int, '-x': ext, '+x': ext }, ['bottom', 'top']);
    brush(hx1, 0, iz2, hx2, ceil, hz2, { '+z': ext, '-z': int, '-x': ext, '+x': ext }, ['bottom', 'top']);
    brush(hx1, 0, iz1, ix1, ceil, iz2, { '-x': ext, '+x': int }, ['bottom', 'top', '-z', '+z']);
    brush(ix2, 0, iz1, hx2, ceil, iz2, { '+x': ext, '-x': int }, ['bottom', 'top', '-z', '+z']);
    brush(hx1, ceil, hz1, hx2, ceil + 0.2, hz2, { top: 'x_gravel', bottom: 'fifties_ceil5', side: ext });
    for (const [x1, z1, x2, z2] of [[hx1, hz1, hx2, hz1 + 0.2], [hx1, hz2 - 0.2, hx2, hz2], [hx1, hz1 + 0.2, hx1 + 0.2, hz2 - 0.2], [hx2 - 0.2, hz1 + 0.2, hx2, hz2 - 0.2]]) {
      brush(x1, ceil + 0.2, z1, x2, ceil + 0.6, z2, { side: ext, top: 'x_trim' }, ['bottom']);
    }
    // the front door, and the bedroom window over it
    carve(hx1 - 0.03, 0, door[0], ix1 + 0.03, 2.2, door[1]);
    reveal(0, hx1, ix1, door[0], door[1], 0, 2.2, int, 'x_parquet');
    doors.push({ axis: 'z', dir: 1, len: door[1] - door[0], h: 2.18, hinge: [hx1 + T / 2, 0, door[0]], tex: 'door1' });
    carve(hx1 - 0.03, win[2], win[0], ix1 + 0.03, win[3], win[1]);
    reveal(0, hx1, ix1, win[0], win[1], win[2], win[3], int, 'x_trim');
    windows.push({ axis: 'z', at: [hx1, ix1], from: win[0], to: win[1], bottom: win[2], top: win[3], group: 'neighbour' });
    // the bedroom's floor, with the stairwell (railed) along the east wall; 15 steps up northwards, starting a step
    // away from the south wall (room to walk onto them), a landing at the top
    const sx = ix2 - 1.1, z0 = -4.6, o1 = z0 - 4.2, o2 = -5.1; // (o2: head room from the 6th step up)
    for (const [x1, z1, x2, z2] of [[ix1, iz1, sx, iz2], [sx, iz1, ix2, o1], [sx, o2, ix2, iz2]]) {
      brush(x1, up - 0.2, z1, x2, up, z2, { top: 'x_parquet', bottom: 'fifties_ceil5', side: 'x_trim' });
      keep.push([x1 - 0.01, up - 0.21, z1 - 0.01, x2 + 0.01, up + 0.01, z2 + 0.01]);
    }
    for (let i = 0; i < 15; i++) {
      const h = 0.2 * (i + 1), za = z0 - 0.28 * (i + 1), zb = z0 - 0.28 * i;
      brush(sx, 0, za, ix2, h, zb, 'x_wood', ['bottom', '+x']);
      keep.push([sx - 0.01, -0.01, za - 0.01, ix2 + 0.01, h + 0.01, zb + 0.01]);
    }
    for (const r of [[sx - 0.08, up, o1, sx, up + 0.95, o2], [sx, up, o2, ix2, up + 0.95, o2 + 0.08]]) {
      brush(...r, 'x_wood', ['bottom']);
      keep.push([r[0] - 0.01, r[1] - 0.01, r[2] - 0.01, r[3] + 0.01, r[4] + 0.01, r[5] + 0.01]);
    }
    // furniture: a sofa, a table and a cabinet below; a bed and a wardrobe above
    brush(33.0, 0, iz1, 35.2, 0.45, iz1 + 0.9, 'fifties_cch1', ['bottom', '-z']);
    brush(33.0, 0.45, iz1, 35.2, 0.95, iz1 + 0.25, 'fifties_cch1', ['bottom', '-z']);
    brush(34.0, 0, -7.4, 35.4, 0.75, -6.4, 'x_wood', ['bottom']);
    brush(ix1, 0, -5.4, ix1 + 0.5, 1.6, -4.0, 'fiftsfile1', ['bottom', '-x']);
    brush(33.0, up, iz1, 35.0, up + 0.5, iz1 + 2.0, { top: 'fifties_cch2', side: 'x_wood' }, ['bottom', '-z']);
    brush(33.0, up, iz2 - 0.6, 34.2, up + 2.0, iz2, 'x_wood', ['bottom', '+z']);
    // a lamp on each floor; switches by the front door and at the top of the stairs
    for (const y of [up - 0.2, ceil]) {
      decor.push({ type: 'ceilinglamp', p: [35.0, y, -7.0], group: 'neighbour' });
      decor.push({ type: 'light', p: [35.0, y - 0.5, -7.0], color: '#ffe2b0', intensity: 20, distance: 9, group: 'neighbour' });
    }
    switches.push({ group: 'neighbour', p: [ix1 + 0.01, 1.4, -8.1], rot: Math.PI / 2 });
    switches.push({ group: 'neighbour', p: [37.0, up + 1.4, iz1 + 0.01], rot: 0 });
    rooms.push({ group: 'neighbour', min: [ix1, -0.1, iz1], max: [ix2, ceil, iz2] });
  }

  // ---------------------------------------------------------------- 13. the back garden
  // Behind the house, through a gateway in the west estate wall: a walled garden 20 m deep — a swimming pool (north),
  // a gazebo at the end of the path (west), a glass greenhouse (south-east) and a hedge maze in the south-west corner.
  // Kept cheap: the hedges, paths and walls are in materials the level already draws, the greenhouse's panes share one
  // material (one mesh), the gazebo is one merged decor piece. The invisible wall west of the estate wall is gone;
  // new ones stand over the garden's walls.
  const water = [], glass = [];
  {
    const [x1, z1, x2, z2] = [-49.2, -20.73, -29.16, 21.95], W = 3.45, T = 0.25, wall = 'c1a3wall05', hedge = 'out_cac2', pave = 'c2a4_flr1';
    const gate = [-1.5, 1.5];
    // the old invisible wall beyond the estate wall (and a sliver of an invisible ledge over it)
    carve(-30.8, 0, -21.54, -29.16, 15.66, 22.76);
    carve(-30.8, 4.2, -12.5, -29.16, 4.4, -7.0);
    // the gateway, and faces on the outer side of the estate wall
    carve(-29.2, 0, gate[0], -28.3, W + 0.01, gate[1]);
    face(wall, 2, 1, gate[0], [-29.16, 0, 0], [-28.35, W, 0]);
    face(wall, 2, -1, gate[1], [-29.16, 0, 0], [-28.35, W, 0]);
    face(pave, 1, 1, 0, [-29.16, 0, gate[0]], [-28.35, 0, gate[1]]);
    face(wall, 0, -1, -29.16, [0, 0, z1], [0, W, gate[0]]);
    face(wall, 0, -1, -29.16, [0, 0, gate[1]], [0, W, z2]);
    // the ground, the garden's walls (as tall as the estate's) and invisible walls over them
    brush(x1 - T, -0.3, -21.54, -29.16, 0, 22.76, '-0out_grss1', ['bottom', '-x', '+x', '-z', '+z']);
    brush(x1 - T, 0, -21.54, x1, W, 22.76, { '+x': wall, top: wall }, ['bottom', '-x', '-z', '+z']);
    brush(x1, 0, -21.54, -29.16, W, z1, { '+z': wall, top: wall }, ['bottom', '-z', '-x', '+x']);
    brush(x1, 0, z2, -29.16, W, 22.76, { '-z': wall, top: wall }, ['bottom', '+z', '-x', '+x']);
    solids.push([x1 - T, W, -21.54, -29.16, 20, z1], [x1 - T, W, z2, -29.16, 20, 22.76], [x1 - T, W, z1, x1, 20, z2]);
    // paths: from the gateway west to the gazebo, and south to the greenhouse's door (drawn just over the grass)
    const path = (a, b, c, d) => face(pave, 1, 1, 0.01, [a, 0, b], [c, 0, d]);
    path(-42.4, -1.2, -29.16, 1.2);
    path(-34.9, 1.2, -33.6, 8.0);
    // the pool: 9 x 9 m, 2 m deep, with steps down in its south-east corner, inside a paved deck
    const [p1, q1, p2, q2] = [-44.5, -16.5, -35.5, -7.5], deep = -2.0;
    path(-46.0, -18.0, -33.5, q1); path(-46.0, q2, -33.5, -6.0); path(-46.0, q1, p1, q2); path(p2, q1, -33.5, q2);
    path(-40.6, -6.0, -39.4, -1.2);
    hollow([{ box: [p1, deep, q1, p2, 0.001, q2], floor: 'tnnl_flr4c', wall: 'tnnl_flr4c', open: ['top'] }]);
    for (const [d, top] of [[2.4, -1.6], [1.8, -1.2], [1.2, -0.8], [0.6, -0.4]]) brush(p2 - d, deep, -9.6, p2, top, q2, 'tnnl_flr4c', ['bottom', '+x', '+z']);
    water.push({ min: [p1, deep - 0.1, q1], max: [p2, 0.1, q2] }); // (to just over the edge, so a swimmer can climb out)
    decor.push({ type: 'water', min: [p1, q1], max: [p2, q2], y: -0.25, color: '#2a8ec4' });
    // the gazebo at the end of the path: eight pillars and a raised floor (the octagon from three boxes)
    const [gx, gz, gr] = [-45.2, 0, 2.6];
    decor.push({ type: 'gazebo', c: [gx, gz], r: gr, h: 2.6 });
    for (const [a, b] of [[2.4, 1.0], [1.0, 2.4], [1.7, 1.7]]) solids.push([gx - a, 0, gz - b, gx + a, 0.25, gz + b]);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8, px = gx + Math.cos(ang) * (gr - 0.2), pz = gz + Math.sin(ang) * (gr - 0.2);
      solids.push([px - 0.13, 0, pz - 0.13, px + 0.13, 2.6, pz + 0.13]);
    }
    // the greenhouse: steel posts and beams, glass panes (walls and a flat roof), a door gap facing the path, two
    // planting tables along the sides
    const [h1, k1, h2, k2, H] = [-38, 8, -32, 14, 2.5], posts = [-38, -36.5, -35, -33.5, -32], rows = [8, 9.5, 11, 12.5, 14];
    for (const x of posts) for (const z of [k1, k2]) brush(x - 0.05, 0, z - 0.05, x + 0.05, H, z + 0.05, 'x_metal', ['bottom', 'top']);
    for (const z of rows.slice(1, -1)) for (const x of [h1, h2]) brush(x - 0.05, 0, z - 0.05, x + 0.05, H, z + 0.05, 'x_metal', ['bottom', 'top']);
    brush(h1 - 0.05, H, k1 - 0.05, h2 + 0.05, H + 0.1, k1 + 0.05, 'x_metal'); brush(h1 - 0.05, H, k2 - 0.05, h2 + 0.05, H + 0.1, k2 + 0.05, 'x_metal');
    for (const x of posts) brush(x - 0.05, H, k1 + 0.05, x + 0.05, H + 0.1, k2 - 0.05, 'x_metal', ['-z', '+z']);
    const pane = (a, b, c, d, e, f) => glass.push({ min: [a, b, c], max: [d, e, f] });
    for (let i = 0; i < 4; i++) {
      const [a, b] = [posts[i] + 0.05, posts[i + 1] - 0.05];
      if (i !== 2) pane(a, 0, k1 - 0.02, b, H, k1 + 0.02); // (the third bay of the north side is the door)
      pane(a, 0, k2 - 0.02, b, H, k2 + 0.02);
      pane(h1 - 0.02, 0, rows[i] + 0.05, h1 + 0.02, H, rows[i + 1] - 0.05);
      pane(h2 - 0.02, 0, rows[i] + 0.05, h2 + 0.02, H, rows[i + 1] - 0.05);
      pane(a, H + 0.06, k1 + 0.05, b, H + 0.1, k2 - 0.05);
    }
    for (const x of [h1 + 0.2, h2 - 1.0]) brush(x, 0, k1 + 0.6, x + 0.8, 0.85, k2 - 0.6, { top: hedge, side: 'x_wood' }, ['bottom']);
    face('x_gravel', 1, 1, 0.01, [h1, 0, k1], [h2, 0, k2]);
    // the hedge maze in the south-west corner (4 x 4 cells, its way in from the north-east)
    const MX = [x1, -47.15, -45.1, -43.05, -41.0], MZ = [13.0, 15.24, 17.48, 19.71, z2], ht = 2.2, th = 0.3; // (too tall to jump onto)
    const hedgeX = (z, xa, xb) => brush(xa - th, 0, z - th, xb + th, ht, z + th, hedge, ['bottom']);
    const hedgeZ = (x, za, zb) => brush(x - th, 0, za - th, x + th, ht, zb + th, hedge, ['bottom']);
    hedgeX(MZ[0], x1 + th, MX[3]); hedgeZ(MX[4], MZ[0], z2 - th);
    hedgeX(MZ[1], MX[1], MX[4]); hedgeX(MZ[2], x1 + th, MX[3]); hedgeX(MZ[3], MX[1], MX[2]);
    hedgeZ(MX[3], MZ[2], MZ[3]); hedgeZ(MX[2], MZ[3], z2 - th);
  }

  const fusebox = { p: [-18.3, -0.95, -5.3], floor: -2.2 };
  return { solids, faces, tex, doors, decor, ladders, rooms, switches, fusebox, keep, windows, water, glass };
}
