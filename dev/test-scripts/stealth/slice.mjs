// A vertical ASCII section of cs_mansion (a planning aid for the stealth geometry): '#' solid, 'G' glass,
// '+' breakable solid, '.' free. axis x: the section at x = at, columns along z; axis z: at z = at, columns along x.
// node dev/test-scripts/stealth/slice.mjs x|z at c1 c2 y1 y2 [step] [map]
const [axis] = process.argv.slice(2, 3);
const [at, c1, c2, y1, y2] = process.argv.slice(3, 8).map(Number);
const step = Number(process.argv[8] || 0.1);
const id = process.argv[9] || 'mansion';
const M = (await import(`../../../shared/maps/${id}.js`)).default;
const cell = (x, y, z) => {
  let c = '.';
  for (const b of M.boxes) {
    if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && y > b.min[1] && y < b.max[1]) {
      if (b.glass) return 'G';
      c = b.brk != null ? '+' : '#';
      if (c === '#') return c;
    }
  }
  return c;
};
console.log(`section ${axis}=${at}, columns ${axis === 'x' ? 'z' : 'x'} ${c1}..${c2}, rows y ${y2} (top) .. ${y1}, step ${step}`);
for (let y = y2; y >= y1 - 1e-9; y -= step) {
  let row = y.toFixed(2).padStart(6) + ' ';
  for (let c = c1; c <= c2 + 1e-9; c += step) row += axis === 'x' ? cell(at, y, c) : cell(c, y, at);
  console.log(row);
}
