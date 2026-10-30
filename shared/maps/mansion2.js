// Mansion 2.0: what cs_mansion has beyond the original level. It is added the way the converted level is made:
// solid boxes plus the faces drawn on them (in the level's own textures, or a few painted ones below), so the new
// parts break, burn, cover the sky (mortar shells), show on the radar and sound like the rest. Openings are carved
// out of the level's solids and faces first. Everything is in metres, y up; the house's ground floor is at 0.81.
//   - a back door from the kitchen (the north-west room) to the back of the house, weak, slow and loud
import { clip } from './breakables.js';

const IN = 0.0254; // a texel, in metres

// Painted textures for the new parts: name -> [painter (see world.js), texture size in texels]
export const NEW_TEX = {
  x_concrete: ['concrete', 64], x_wood: ['wood', 40], x_shelf: ['shelf', 64], x_metal: ['metal', 40],
  x_gravel: ['gravel', 80], x_deck: ['deck', 80], x_trim: ['trim', 40], x_stone: ['stone', 80],
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

  return { solids, faces, tex, doors, decor, ladders, rooms, switches };
}
