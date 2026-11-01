import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = (await import('node:url')).fileURLToPath(new URL('../../../', import.meta.url));
const MAP = (await import(pathToFileURL(path.join(repo, 'shared/maps/mansion.js')).href)).default;
// for a line along z at x, print floor tops (stack of box tops with free space above) between y -3 and 7
const [x, z1, z2, st] = process.argv.slice(2).map(Number);
for (let z = z1; z <= z2; z += st) {
  const bs = MAP.boxes.filter(b => !b.glass && x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && b.max[1] > -4 && b.min[1] < 8);
  const iv = bs.map(b => [b.min[1], b.max[1]]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of iv) { const l = merged[merged.length - 1]; if (l && a <= l[1] + 1e-3) l[1] = Math.max(l[1], b); else merged.push([a, b]); }
  console.log(z.toFixed(2).padStart(7), merged.map(([a, b]) => `${a.toFixed(2)}..${b.toFixed(2)}`).join('  '));
}
