import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = (await import('node:url')).fileURLToPath(new URL('../../../', import.meta.url));
const MAP = (await import(pathToFileURL(path.join(repo, 'shared/maps/mansion.js')).href)).default;
const [x1, y1, z1, x2, y2, z2] = process.argv.slice(2).map(Number);
const r = v => v.toFixed(2);
// merge breakable pieces by printing unique boxes overlapping region; group pieces by brk id bounding boxes
const sel = MAP.boxes.filter(b => b.min[0] < x2 && b.max[0] > x1 && b.min[1] < y2 && b.max[1] > y1 && b.min[2] < z2 && b.max[2] > z1);
const byBrk = new Map();
for (const b of sel) {
  const k = b.brk != null ? 'p' + b.brk : b.glass ? 'g' + b.id : 's' + sel.indexOf(b);
  const o = byBrk.get(k);
  if (!o) byBrk.set(k, { min: b.min.slice(), max: b.max.slice(), n: 1 });
  else { for (let i = 0; i < 3; i++) { o.min[i] = Math.min(o.min[i], b.min[i]); o.max[i] = Math.max(o.max[i], b.max[i]); } o.n++; }
}
for (const [k, b] of byBrk) console.log(k.padEnd(7), 'x', r(b.min[0]), r(b.max[0]), ' y', r(b.min[1]), r(b.max[1]), ' z', r(b.min[2]), r(b.max[2]));
