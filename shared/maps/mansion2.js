// Mansion 2.0: what cs_mansion has beyond the original level. It is added the way the converted level is made:
// solid boxes plus the faces drawn on them (in the level's own textures, or a few painted ones below), so the new
// parts break, burn, cover the sky (mortar shells), show on the radar and sound like the rest. Openings are carved
// out of the level's solids and faces first. Everything is in metres, y up; the house's ground floor is at 0.81.
//   - a back door from the kitchen (the north-west room) to the back of the house, weak, slow and loud
//   - a wine cellar under the living room, down a stair from the kitchen through what was a walled-up closet
//   - the house's fuse box in the cellar (blackout, see the fuse box in server.js)
import { clip } from './breakables.js';

const IN = 0.0254; // a texel, in metres

// Painted textures for the new parts: name -> [painter (see world.js), texture size in texels]
export const NEW_TEX = {
  x_concrete: ['concrete', 64], x_wood: ['wood', 40], x_shelf: ['shelf', 64], x_metal: ['metal', 40],
  x_gravel: ['gravel', 80], x_wine: ['winerack', 40], x_deck: ['deck', 80], x_trim: ['trim', 40], x_stone: ['stone', 80],
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

  // Take a box out of the level: its solids and the faces inside it.
  const carve = (x1, y1, z1, x2, y2, z2) => {
    const c = [x1, y1, z1, x2, y2, z2];
    solids = solids.flatMap(s => minusBox(s, c));
    for (const t of Object.keys(faces)) faces[t] = faces[t].flatMap(f => minusFace(f, c));
  };
  const face = (t, axis, sign, at, lo, hi) => (faces[t] ||= []).push(quad(axis, sign, at, lo, hi, tex[t] || [64, 64]));
  // A solid box with its faces: `t` is one texture or { top, bottom, side, x, z } (x: the faces looking along x);
  // skip: sides not drawn ('top', 'bottom', '-x', '+x', '-z', '+z').
  const brush = (x1, y1, z1, x2, y2, z2, t, skip = []) => {
    solids.push([x1, y1, z1, x2, y2, z2]);
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
    const T = 0.3;
    for (const h of list) {
      const [x1, y1, z1, x2, y2, z2] = h.box, open = h.open || [];
      if (!open.includes('bottom')) solids.push([x1 - T, y1 - T, z1 - T, x2 + T, y1, z2 + T]);
      if (!open.includes('top')) solids.push([x1 - T, y2, z1 - T, x2 + T, y2 + T, z2 + T]);
      solids.push([x1 - T, y1, z1 - T, x1, y2, z2 + T], [x2, y1, z1 - T, x2 + T, y2, z2 + T], [x1, y1, z1 - T, x2, y2, z1], [x1, y1, z2, x2, y2, z2 + T]);
    }
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

  const fusebox = { p: [-18.3, -0.95, -5.3], floor: -2.2 };
  return { solids, faces, tex, doors, decor, ladders, rooms, switches, fusebox };
}
