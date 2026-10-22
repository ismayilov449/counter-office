// Destructible walls and furniture, for maps converted from a GoldSrc level (cs_mansion).
// Each chosen solid is cut into chunks of about a metre; every chunk is its own collision box (hidden, with `brk`
// = its piece id) and gets the slices of the level's faces lying on its surface. Explosions (and a few heavy guns)
// wear chunks down until they break, which punches holes in walls and smashes furniture; see damageMap in server.js.
//
// Faces are clipped to the chunks with Sutherland-Hodgman (they are convex and axis-aligned where it matters);
// what is left over stays in the static faces. A polygon is a flat array [x, y, z, u, v, ...].

const EPS = 0.006;

// Keep the part of a polygon on one side of the plane pos[k] = val.
function clip(poly, k, val, keepAbove) {
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

// solids: the level's collision boxes; pick(b, i) -> null (static) or { kind: 'wall' | 'prop', from? } where `from`
// is the height the breakable part starts at (below it the solid stays, e.g. a wall's foundation).
// Returns { statics: solids that stay, pieces, faces: the static faces, pieceFaces: id -> { tex: [polys] } }.
export function breakUp(solids, faces, pick) {
  const statics = [], pieces = [];
  for (const [i, s] of solids.entries()) {
    const b = { min: [s[0], s[1], s[2]], max: [s[3], s[4], s[5]] };
    const p = pick(b, i);
    if (!p) { statics.push(b); continue; }
    if (p.from != null && p.from > b.min[1] + EPS) {
      statics.push({ min: b.min, max: [b.max[0], p.from, b.max[2]] });
      b.min = [b.min[0], p.from, b.min[2]];
    }
    const dims = [0, 1, 2].map(k => b.max[k] - b.min[k]);
    const thick = Math.min(dims[0], dims[2]);
    const size = p.kind === 'wall' ? [1.0, 1.25, 1.0] : [1.0, 1.2, 1.0];
    // a wall stays whole through its thickness
    const keep = p.kind === 'wall' ? [dims[0] === thick ? Infinity : 1.3, 1.6, dims[2] === thick ? Infinity : 1.3] : [1.6, 1.6, 1.6];
    const hp = p.kind === 'wall' ? 150 + 250 * Math.min(thick, 0.6) : 70 + 60 * Math.min(thick, 1);
    for (const c of chunksOf(b.min, b.max, size, keep)) pieces.push({ id: pieces.length, kind: p.kind, hp, min: c.min, max: c.max, src: i });
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

  // Caps: where a chunk sits against something that stays (a floor, a ceiling, the roof), the level has no face
  // there; once the chunk is gone, a cap of rubble fills that hole. [axis, sign, lo, hi]: the cap faces into the
  // chunk and covers just where the two touch.
  const near = (a, b) => Math.abs(a - b) < EPS;
  for (const pc of pieces) {
    pc.caps = [];
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
  return { statics, pieces, faces: staticFaces, pieceFaces };
}
