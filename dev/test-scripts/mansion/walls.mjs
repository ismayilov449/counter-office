// Usage: node walls.mjs — samples every wall, floor and ceiling of Mansion's dug-out rooms and reports
// spots with no face drawn (you'd see emptiness) and spots drawn twice, skipping spots where another room is behind.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const MAP = (await import(pathToFileURL(path.join(repo, 'shared/maps/mansion.js')).href)).default;
const faces = MAP.faces;

// the dug-out rooms: a copy of the boxes given to hollow() in shared/maps/mansion2.js (add new ones here too)
const T1 = -2.2, T2 = -0.2, D1 = -5.0, D2 = -3.0;
const rooms = [
  { n: 'stairwell', box: [-15.54, -2.2, -9.75, -13.31, 0.81, -5.49], open: ['top'] },
  { n: 'cellar', box: [-22.9, -2.2, -5.49, -13.31, 0.61, 4.5] },
  { n: 'tunnel leg 1', box: [-14.8, T1, 4.4, -13.5, T2, 6.3] },
  { n: 'tunnel leg 2', box: [-14.8, T1, 5.0, 14.8, T2, 6.3] },
  { n: 'tunnel leg 3', box: [13.5, T1, 5.0, 14.8, T2, 16.8] },
  { n: 'hatch shaft', box: [13.6, T2 - 0.05, 15.7, 14.7, 0.2, 16.8], open: ['top', 'bottom'] },
  { n: 'drain leg A', box: [3.4, D1, -2.6, 26.9, D2, -1.4] },
  { n: 'drain leg B', box: [3.4, D1, -2.6, 4.6, D2, 1.0] },
  { n: 'drain leg C', box: [-19.6, D1, -0.2, 4.6, D2, 1.0] },
  { n: 'street shaft', box: [25.9, D2 - 0.05, -2.6, 26.9, 0, -1.4], open: ['top', 'bottom'] },
  { n: 'cellar shaft', box: [-19.6, D2 - 0.05, -0.2, -18.6, -2.2, 1.0], open: ['top', 'bottom'] },
  { n: 'pool', box: [-44.5, -2.0, -16.5, -35.5, 0.001, -7.5], open: ['top'] },
];
const inside = (p, b, e = 0) => [0, 1, 2].every(k => p[k] > b[k] + e && p[k] < b[k + 3] - e);
const AX = [[1, 2], [2, 0], [0, 1]];

// faces lying on a plane perpendicular to `axis` at `at`, as 2D polygons in the other two axes
const planeCache = new Map();
function onPlane(axis, at) {
  const key = axis + ':' + at.toFixed(4);
  if (planeCache.has(key)) return planeCache.get(key);
  const [b, c] = AX[axis], out = [];
  for (const [t, polys] of Object.entries(faces)) for (const f of polys) {
    let flat = true;
    for (let i = axis; i < f.length; i += 5) if (Math.abs(f[i] - at) > 2e-3) { flat = false; break; }
    if (!flat) continue;
    const pts = [];
    for (let i = 0; i < f.length; i += 5) pts.push([f[i + b], f[i + c]]);
    out.push({ t, pts });
  }
  planeCache.set(key, out);
  return out;
}
function inPoly(x, y, pts) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

const STEP = 0.1, E = 0.03;
let holes = 0, doubles = 0;
for (const r of rooms) {
  const lo = r.box.slice(0, 3), hi = r.box.slice(3), open = r.open || [];
  for (const [axis, sign, name] of [[1, 1, 'bottom'], [1, -1, 'top'], [0, 1, '-x'], [0, -1, '+x'], [2, 1, '-z'], [2, -1, '+z']]) {
    if (open.includes(name)) continue;
    const at = sign > 0 ? lo[axis] : hi[axis], [b, c] = AX[axis];
    const polys = onPlane(axis, at);
    const miss = [], dup = [];
    for (let u = lo[b] + E; u < hi[b] - E + 1e-9; u += STEP) for (let v = lo[c] + E; v < hi[c] - E + 1e-9; v += STEP) {
      const p = [0, 0, 0]; p[axis] = at; p[b] = u; p[c] = v;
      const behind = p.slice(); behind[axis] = at - sign * E;
      const front = p.slice(); front[axis] = at + sign * E;
      if (rooms.some(o => inside(behind, o.box))) continue; // an opening into another room
      if (rooms.some(o => o !== r && inside(front, o.box) && !inside(front, r.box))) continue;
      const n = polys.filter(q => inPoly(u, v, q.pts)).length;
      if (n === 0) miss.push([u, v]);
      if (n > 1) dup.push([u, v]);
    }
    const span = l => {
      const us = l.map(q => q[0]), vs = l.map(q => q[1]), ax = 'xyz';
      return `${ax[b]} ${Math.min(...us).toFixed(2)}..${Math.max(...us).toFixed(2)}, ${ax[c]} ${Math.min(...vs).toFixed(2)}..${Math.max(...vs).toFixed(2)}`;
    };
    const where = `${r.n} ${name} (${'xyz'[axis]}=${at})`;
    if (miss.length) { holes += miss.length; console.log(`MISSING  ${where}: ${miss.length} spots, ${span(miss)}`); }
    if (dup.length) { doubles += dup.length; console.log(`DOUBLE   ${where}: ${dup.length} spots, ${span(dup)}`); }
  }
}
console.log(`\n${holes} missing spots, ${doubles} drawn twice`);
