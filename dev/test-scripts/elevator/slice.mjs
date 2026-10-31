// node slice.mjs y [x1 x2 z1 z2 step] — top-down map of solids at height y in the worktree's cs_mansion
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = (await import('node:url')).fileURLToPath(new URL('../../../', import.meta.url));
const MAP = (await import(pathToFileURL(path.join(repo, 'shared/maps/mansion.js')).href)).default;
const [y, x1 = -25, x2 = -5, z1 = -16, z2 = 13, st = 0.25] = process.argv.slice(2).map(Number);
const boxes = MAP.boxes;
const doors = MAP.doors;
let out = '      ';
for (let x = x1; x < x2; x += st) out += (Math.abs(x - Math.round(x)) < 1e-6 && Math.round(x) % 2 === 0) ? '|' : ' ';
out += '\n';
for (let z = z1; z < z2; z += st) {
  let row = (Math.abs(z - Math.round(z)) < 1e-6 ? z.toFixed(0) : '').padStart(5) + ' ';
  for (let x = x1; x < x2; x += st) {
    const px = x + st / 2, pz = z + st / 2;
    const hit = boxes.filter(b => px > b.min[0] && px < b.max[0] && pz > b.min[2] && pz < b.max[2] && y > b.min[1] && y < b.max[1]);
    let c = '.';
    if (hit.some(b => b.glass)) c = 'g';
    else if (hit.length) c = hit.some(b => b.brk != null) ? '#' : '@';
    else {
      // floor height under: digit = tenths? show '_' when a floor within 1.2 m below
      let top = -Infinity;
      for (const b of boxes) if (!b.glass && px > b.min[0] && px < b.max[0] && pz > b.min[2] && pz < b.max[2] && b.max[1] <= y && b.max[1] > top) top = b.max[1];
      const d = y - top;
      c = d < 1.3 ? '.' : d < 2.5 ? ',' : ' ';
    }
    for (const d of doors) {
      const h = d.hinge; if (!h) continue;
      if (d.axis === 'x' && Math.abs(pz - h[2]) < st / 2 && px > Math.min(h[0], h[0] + d.len * d.dir) && px < Math.max(h[0], h[0] + d.len * d.dir) && y > h[1] && y < h[1] + d.h) c = 'D';
      if (d.axis === 'z' && Math.abs(px - h[0]) < st / 2 && pz > Math.min(h[2], h[2] + d.len * d.dir) && pz < Math.max(h[2], h[2] + d.len * d.dir) && y > h[1] && y < h[1] + d.h) c = 'D';
    }
    row += c;
  }
  out += row + '\n';
}
console.log(out);
