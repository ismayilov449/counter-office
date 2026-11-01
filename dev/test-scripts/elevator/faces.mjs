// node faces.mjs x1 y1 z1 x2 y2 z2 — the drawn faces of cs_mansion touching a region: texture, plane, extent
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = (await import('node:url')).fileURLToPath(new URL('../../../', import.meta.url));
const MAP = (await import(pathToFileURL(path.join(repo, 'shared/maps/mansion.js')).href)).default;
const [x1, y1, z1, x2, y2, z2] = process.argv.slice(2).map(Number);
const r = v => v.toFixed(2);
for (const [t, polys] of Object.entries(MAP.faces)) for (const f of polys) {
  const lo = [0, 1, 2].map(k => Math.min(...f.filter((_, i) => i % 5 === k)));
  const hi = [0, 1, 2].map(k => Math.max(...f.filter((_, i) => i % 5 === k)));
  if (hi[0] < x1 || lo[0] > x2 || hi[1] < y1 || lo[1] > y2 || hi[2] < z1 || lo[2] > z2) continue;
  // normal from the first three corners
  const a = [f[0], f[1], f[2]], b = [f[5], f[6], f[7]], c = [f[10], f[11], f[12]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(n[i]) > Math.abs(n[m]) ? i : m), 0);
  console.log(t.padEnd(16), ('xyz'[k] + (n[k] > 0 ? '+' : '-')).padEnd(3), 'x', r(lo[0]), r(hi[0]), ' y', r(lo[1]), r(hi[1]), ' z', r(lo[2]), r(hi[2]));
}
