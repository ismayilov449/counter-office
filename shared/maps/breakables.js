// Destructible walls and furniture, for maps converted from a GoldSrc level (cs_mansion).
// Each chosen solid is cut into chunks of about a metre; every chunk is its own collision box (hidden, with `brk`
// = its piece id) and gets the slices of the level's faces lying on its surface. Explosions (and a few heavy guns)
// wear chunks down until they break, which punches holes in walls and smashes furniture; see damageMap in server.js.
//
// Faces are clipped to the chunks with Sutherland-Hodgman (they are convex and axis-aligned where it matters);
// what is left over stays in the static faces. A polygon is a flat array [x, y, z, u, v, ...].

const EPS = 0.006;

// Keep the part of a polygon on one side of the plane pos[k] = val.
export function clip(poly, k, val, keepAbove) {
  const n = poly.length / 5, out = [];
  const side = i => (poly[i * 5 + k] - val) * (keepAbove ? 1 : -1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = side(i), b = side(j);
    if (a >= 0) for (let c = 0; c < 5; c++) out.push(poly[i * 5 + c]);
    if ((a >= 0) !== (b >= 0)) {
      const t = a / (a - b);
      for (let c = 0; c < 5; c++) out.push(poly[i * 5 + c] + (poly[j * 5 + c] - poly[i * 5 + c]) * t);
    }
  }
  return out.length >= 15 && area(out) > 1e-5 ? out : null;
}

function area(poly) {
  const n = poly.length / 5;
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, p = i * 5, q = j * 5;
    x += (poly[p + 1] - poly[q + 1]) * (poly[p + 2] + poly[q + 2]);
    y += (poly[p + 2] - poly[q + 2]) * (poly[p] + poly[q]);
    z += (poly[p] - poly[q]) * (poly[p + 1] + poly[q + 1]);
  }
  return Math.hypot(x, y, z) / 2;
}

// Newell normal: its dominant axis and sign, or null for a sloped face.
function planeOf(poly) {
  const n = poly.length / 5, nn = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p = i * 5, q = ((i + 1) % n) * 5;
    nn[0] += (poly[p + 1] - poly[q + 1]) * (poly[p + 2] + poly[q + 2]);
    nn[1] += (poly[p + 2] - poly[q + 2]) * (poly[p] + poly[q]);
    nn[2] += (poly[p] - poly[q]) * (poly[p + 1] + poly[q + 1]);
  }
  const len = Math.hypot(...nn);
  if (!len) return null;
  const axis = [0, 1, 2].find(k => Math.abs(nn[k]) / len > 0.999);
  return axis == null ? null : { axis, sign: Math.sign(nn[axis]), at: poly[axis] };
}

// Split a solid [x1, y1, z1, x2, y2, z2] into chunks about `size` metres along each axis (an axis shorter than
// `keep` stays whole).
function chunksOf(min, max, size, keep) {
  const cuts = k => {
    const len = max[k] - min[k], n = len < keep[k] ? 1 : Math.max(1, Math.round(len / size[k]));
    return Array.from({ length: n + 1 }, (_, i) => min[k] + (len * i) / n);
  };
  const [xs, ys, zs] = [cuts(0), cuts(1), cuts(2)], out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      for (let k = 0; k < zs.length - 1; k++) out.push({ min: [xs[i], ys[j], zs[k]], max: [xs[i + 1], ys[j + 1], zs[k + 1]] });
    }
  }
  return out;
}

// A fixed pseudo-random number in [0, 1) for a piece, so the server and every browser agree.
const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// solids: the level's collision boxes; pick(b, i) -> null (static), { kind: 'wall' | 'prop', from? } where `from`
// is the height the breakable part starts at (below it the solid stays, e.g. a wall's foundation), or
// { kind: 'roof' }: a roof is cut into columns (roofCell metres square, every roof box in that square together)
// that take its faces with them (roofFace(poly): a face of the roof, sloped ones too).
// Returns { statics: solids that stay, pieces (each with its collision `boxes`), faces: the static faces,
// pieceFaces: id -> { tex: [polys] } }.
export function breakUp(solids, faces, pick, { roofFace = () => false, roofCell = 0.75 } = {}) {
  const statics = [], pieces = [], roofBoxes = [];
  for (const [i, s] of solids.entries()) {
    const b = { min: [s[0], s[1], s[2]], max: [s[3], s[4], s[5]] };
    const p = pick(b, i);
    if (!p) { statics.push(b); continue; }
    if (p.kind === 'roof') { roofBoxes.push(b); continue; }
    if (p.from != null && p.from > b.min[1] + EPS) {
      statics.push({ min: b.min, max: [b.max[0], p.from, b.max[2]] });
      b.min = [b.min[0], p.from, b.min[2]];
    }
    const dims = [0, 1, 2].map(k => b.max[k] - b.min[k]);
    const thick = Math.min(dims[0], dims[2]);
    // small chunks of wall (holes come out ragged); a wall stays whole through its thickness
    const size = p.kind === 'wall' ? [0.5, 0.5, 0.5] : [1.0, 1.2, 1.0];
    const keep = p.kind === 'wall' ? [dims[0] === thick ? Infinity : 0.7, 0.7, dims[2] === thick ? Infinity : 0.7] : [1.6, 1.6, 1.6];
    const hp = p.kind === 'wall' ? 150 + 250 * Math.min(thick, 0.6) : 70 + 60 * Math.min(thick, 1);
    for (const c of chunksOf(b.min, b.max, size, keep)) {
      const id = pieces.length;
      pieces.push({ id, kind: p.kind, hp: Math.round(hp * (0.7 + 0.6 * hash(id))), min: c.min, max: c.max, boxes: [c] });
    }
  }

  // The roof in columns: every roof box cut along the grid; the parts in one square make one piece.
  const ox = -0.013, oz = -0.017; // so the grid lines miss the level's planes
  const cellKey = (i, k) => i * 100000 + k;
  const column = new Map();
  for (const b of roofBoxes) {
    for (let i = Math.floor((b.min[0] - ox) / roofCell); i * roofCell + ox < b.max[0] - EPS; i++) {
      for (let k = Math.floor((b.min[2] - oz) / roofCell); k * roofCell + oz < b.max[2] - EPS; k++) {
        const x0 = Math.max(b.min[0], i * roofCell + ox), x1 = Math.min(b.max[0], (i + 1) * roofCell + ox);
        const z0 = Math.max(b.min[2], k * roofCell + oz), z1 = Math.min(b.max[2], (k + 1) * roofCell + oz);
        if (x1 - x0 < EPS || z1 - z0 < EPS) continue;
        const key = cellKey(i, k);
        if (!column.has(key)) column.set(key, { i, k, boxes: [] });
        column.get(key).boxes.push({ min: [x0, b.min[1], z0], max: [x1, b.max[1], z1] });
      }
    }
  }
  for (const c of column.values()) {
    const id = pieces.length;
    const min = [0, 1, 2].map(n => Math.min(...c.boxes.map(b => b.min[n]))), max = [0, 1, 2].map(n => Math.max(...c.boxes.map(b => b.max[n])));
    c.id = id;
    pieces.push({ id, kind: 'roof', hp: Math.round(220 * (0.7 + 0.6 * hash(id))), min, max, boxes: c.boxes, cell: [c.i, c.k] });
  }

  // Faces: index the chunk sides by plane, then hand each face's slices to the chunks it lies on.
  const byPlane = new Map();
  const key = (axis, sign, at) => `${axis}${sign}${Math.round(at * 100)}`;
  for (const pc of pieces) {
    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        const at = sign > 0 ? pc.max[axis] : pc.min[axis];
        for (const r of [-1, 0, 1]) {
          const k = key(axis, sign, at + r / 100);
          if (!byPlane.has(k)) byPlane.set(k, []);
          byPlane.get(k).push({ pc, at });
        }
      }
    }
  }
  const staticFaces = {}, pieceFaces = {};
  for (const [tex, polys] of Object.entries(faces)) {
    const keepList = (staticFaces[tex] = []);
    for (const f of polys) {
      const pl = planeOf(f);
      const cands = pl ? (byPlane.get(key(pl.axis, pl.sign, pl.at)) || []).filter(c => Math.abs(c.at - pl.at) < EPS) : [];
      if (!cands.length) { keepList.push(f); continue; }
      const [u, v] = [0, 1, 2].filter(k => k !== pl.axis);
      let rest = [f];
      const seen = new Set();
      for (const { pc } of cands) {
        if (seen.has(pc)) continue;
        seen.add(pc);
        const next = [];
        for (const poly of rest) {
          // the part inside the chunk's side
          let inside = poly;
          for (const [k, val, above] of [[u, pc.min[u], true], [u, pc.max[u], false], [v, pc.min[v], true], [v, pc.max[v], false]]) {
            inside = inside && clip(inside, k, val, above);
          }
          if (!inside) { next.push(poly); continue; }
          ((pieceFaces[pc.id] ||= {})[tex] ||= []).push(inside);
          // and the rest of it: left, right, then below and above within the middle band
          const left = clip(poly, u, pc.min[u], false), right = clip(poly, u, pc.max[u], true);
          let mid = clip(poly, u, pc.min[u], true);
          mid = mid && clip(mid, u, pc.max[u], false);
          const below = mid && clip(mid, v, pc.min[v], false), above = mid && clip(mid, v, pc.max[v], true);
          for (const q of [left, right, below, above]) if (q) next.push(q);
        }
        rest = next;
        if (!rest.length) break;
      }
      keepList.push(...rest);
    }
  }

  // Roof faces go to the columns under them (cut along the grid; sloped ones too).
  for (const [tex, polys] of Object.entries(staticFaces)) {
    const keepList = (staticFaces[tex] = []);
    for (const f of polys) {
      if (!roofFace(f)) { keepList.push(f); continue; }
      const xs = [], zs = [];
      for (let n = 0; n < f.length; n += 5) { xs.push(f[n]); zs.push(f[n + 2]); }
      for (let i = Math.floor((Math.min(...xs) - ox) / roofCell); i * roofCell + ox < Math.max(...xs); i++) {
        for (let k = Math.floor((Math.min(...zs) - oz) / roofCell); k * roofCell + oz < Math.max(...zs); k++) {
          let part = f;
          for (const [axis, val, above] of [[0, i * roofCell + ox, true], [0, (i + 1) * roofCell + ox, false], [2, k * roofCell + oz, true], [2, (k + 1) * roofCell + oz, false]]) {
            part = part && clip(part, axis, val, above);
          }
          if (!part) continue;
          const c = column.get(cellKey(i, k));
          if (c) ((pieceFaces[c.id] ||= {})[tex] ||= []).push(part);
          else keepList.push(part);
        }
      }
    }
  }

  // Caps: where a chunk sits against something that stays (a floor, a ceiling, the roof), the level has no face
  // there; once the chunk is gone, a cap of rubble fills that hole. [axis, sign, lo, hi]: the cap faces into the
  // chunk and covers just where the two touch.
  const near = (a, b) => Math.abs(a - b) < EPS;
  for (const pc of pieces) {
    pc.caps = [];
    if (pc.kind === 'roof') {
      // [axis, sign, lo, hi, neighbour]: a side of the hole, shown while the neighbouring column still stands
      const [i, k] = pc.cell;
      for (const [axis, sign, nb] of [[0, -1, [i - 1, k]], [0, 1, [i + 1, k]], [2, -1, [i, k - 1]], [2, 1, [i, k + 1]]]) {
        const other = column.get(cellKey(...nb));
        if (!other) continue;
        const at = sign > 0 ? pc.max[axis] : pc.min[axis], u = axis === 0 ? 2 : 0;
        for (const b of pc.boxes) {
          if (!near(sign > 0 ? b.max[axis] : b.min[axis], at)) continue;
          const lo = [0, 0, 0], hi = [0, 0, 0];
          lo[axis] = hi[axis] = at;
          lo[u] = b.min[u]; hi[u] = b.max[u]; lo[1] = b.min[1]; hi[1] = b.max[1];
          pc.caps.push([axis, -sign, lo, hi, other.id]);
        }
      }
      continue;
    }
    for (let axis = 0; axis < 3; axis++) {
      const [u, v] = [0, 1, 2].filter(k => k !== axis);
      for (const sign of [-1, 1]) {
        const at = sign > 0 ? pc.max[axis] : pc.min[axis];
        for (const s of statics) {
          if (!near(sign > 0 ? s.min[axis] : s.max[axis], at)) continue;
          const lo = [0, 0, 0], hi = [0, 0, 0];
          lo[axis] = hi[axis] = at;
          for (const k of [u, v]) { lo[k] = Math.max(s.min[k], pc.min[k]); hi[k] = Math.min(s.max[k], pc.max[k]); }
          if (hi[u] - lo[u] > EPS && hi[v] - lo[v] > EPS) pc.caps.push([axis, -sign, lo, hi]);
        }
      }
    }
  }
  linkUp(pieces, statics);
  return { statics, pieces, faces: staticFaces, pieceFaces };
}

// What holds what: pc.links are the pieces touching it face to face; pc.anchor is set when it rests on something
// that never breaks (a floor, a foundation, the stairs). A piece with no way through the links to an anchor falls
// (see collapse in server.js). Pieces that hang free in the level as built count as anchored.
function linkUp(pieces, statics) {
  const CELL = 1, E = 0.012, grid = new Map();
  const keys = (min, max) => {
    const out = [];
    for (let x = Math.floor((min[0] - E) / CELL); x <= Math.floor((max[0] + E) / CELL); x++) {
      for (let y = Math.floor((min[1] - E) / CELL); y <= Math.floor((max[1] + E) / CELL); y++) {
        for (let z = Math.floor((min[2] - E) / CELL); z <= Math.floor((max[2] + E) / CELL); z++) out.push(`${x},${y},${z}`);
      }
    }
    return out;
  };
  const touch = (a, b) => {
    let overlap = 0;
    for (let k = 0; k < 3; k++) {
      if (a.min[k] > b.max[k] + E || b.min[k] > a.max[k] + E) return false;
      if (Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > E) overlap++;
    }
    return overlap >= 2;
  };
  for (const pc of pieces) {
    pc.links = [];
    pc.anchor = false;
    for (const k of keys(pc.min, pc.max)) (grid.get(k) || grid.set(k, []).get(k)).push(pc);
  }
  for (const pc of pieces) {
    const seen = new Set();
    for (const k of keys(pc.min, pc.max)) {
      for (const o of grid.get(k)) {
        if (o.id <= pc.id || seen.has(o)) continue;
        seen.add(o);
        if (pc.boxes.some(a => o.boxes.some(b => touch(a, b)))) { pc.links.push(o.id); o.links.push(pc.id); }
      }
    }
  }
  const lo = [0, 1, 2].map(k => Math.min(...pieces.map(p => p.min[k])) - 1), hi = [0, 1, 2].map(k => Math.max(...pieces.map(p => p.max[k])) + 1);
  for (const s of statics) {
    if ([0, 1, 2].some(k => s.max[k] < lo[k] || s.min[k] > hi[k])) continue;
    const near = new Set();
    const cmin = s.min.map((v, k) => Math.max(v, lo[k])), cmax = s.max.map((v, k) => Math.min(v, hi[k]));
    for (const k of keys(cmin, cmax)) for (const pc of grid.get(k) || []) near.add(pc);
    for (const pc of near) if (!pc.anchor && pc.boxes.some(b => touch(b, s))) pc.anchor = true;
  }
  // as built, everything stands
  const held = new Uint8Array(pieces.length), queue = pieces.filter(p => p.anchor).map(p => p.id);
  for (const id of queue) held[id] = 1;
  while (queue.length) for (const n of pieces[queue.pop()].links) if (!held[n]) { held[n] = 1; queue.push(n); }
  for (const pc of pieces) if (!held[pc.id]) pc.anchor = true;
}
