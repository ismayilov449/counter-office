// Turn the BSP's solid leaves into convex polytopes (vertex lists), in GoldSrc units.
import { bsp } from './parse.mjs';
export function polytopes(head, want) {
  const W = { min: bsp.models[0].min.map(v => v - 64), max: bsp.models[0].max.map(v => v + 64) };
  const regs = bsp.regions(head, want);
  const out = [];
  for (const r of regs) {
    // half-spaces a.p <= b
    const hs = [];
    for (let k = 0; k < 3; k++) { const e = [0, 0, 0]; e[k] = 1; hs.push([e, W.max[k]]); hs.push([e.map(v => -v), -W.min[k]]); }
    for (const s of r.path) hs.push(s.front ? [s.P.n.map(v => -v), -s.P.d] : [s.P.n, s.P.d]);
    const verts = [];
    const n = hs.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const [a, b, c] = [hs[i][0], hs[j][0], hs[k][0]];
      const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      if (Math.abs(det) < 1e-6) continue;
      const d = [hs[i][1], hs[j][1], hs[k][1]];
      // Cramer
      const x = (d[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (d[1] * c[2] - b[2] * d[2]) + a[2] * (d[1] * c[1] - b[1] * d[2])) / det;
      const y = (a[0] * (d[1] * c[2] - b[2] * d[2]) - d[0] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * d[2] - d[1] * c[0])) / det;
      const z = (a[0] * (b[1] * d[2] - d[1] * c[1]) - a[1] * (b[0] * d[2] - d[1] * c[0]) + d[0] * (b[0] * c[1] - b[1] * c[0])) / det;
      const p = [x, y, z];
      if (hs.every(([nn, dd]) => nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2] <= dd + 0.05)) {
        if (!verts.some(v => Math.abs(v[0] - x) + Math.abs(v[1] - y) + Math.abs(v[2] - z) < 0.1)) verts.push(p);
      }
    }
    if (verts.length < 4) continue;
    const min = [0, 1, 2].map(k => Math.min(...verts.map(v => v[k]))), max = [0, 1, 2].map(k => Math.max(...verts.map(v => v[k])));
    const isBox = verts.length === 8 && verts.every(v => [0, 1, 2].every(k => Math.abs(v[k] - min[k]) < 0.1 || Math.abs(v[k] - max[k]) < 0.1));
    out.push({ c: r.c, verts, min, max, isBox, hs: hs.slice(6) });
  }
  return out;
}
