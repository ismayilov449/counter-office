// A top-down ASCII plan of cs_mansion at one height (a planning aid for the stealth geometry): '#' solid, 'G' glass,
// '+' breakable solid, 'L' ladder, 'D' door (closed), '.' free; decor and switches are listed under it.
// node dev/test-scripts/stealth/plan.mjs x1 x2 z1 z2 y [step] [map]
const [x1, x2, z1, z2, y] = process.argv.slice(2, 7).map(Number);
const step = Number(process.argv[7] || 0.2);
const id = process.argv[8] || 'mansion';
const { doorBox } = await import('../../../shared/doors.js');
const M = (await import(`../../../shared/maps/${id}.js`)).default;
const at = (x, z) => {
  let c = '.';
  for (const b of M.boxes) {
    if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && y > b.min[1] && y < b.max[1]) {
      if (b.glass) return 'G';
      c = b.brk != null ? '+' : '#';
      if (c === '#') return c;
    }
  }
  for (const l of M.ladders) {
    const lx = l.x ?? l.p?.[0], lz = l.z ?? l.p?.[2];
    if (lx != null && Math.abs(x - lx) < 0.4 && Math.abs(z - lz) < 0.4 && y > (l.y1 ?? l.bottom ?? -99) && y < (l.y2 ?? l.top ?? 99)) return 'L';
  }
  for (const d of M.doors || []) {
    const b = doorBox(d, 0);
    if (x > b.min[0] && x < b.max[0] && z > b.min[2] - 0.05 && z < b.max[2] + 0.05 && y > b.min[1] && y < b.max[1]) return 'D';
  }
  return c;
};
const xs = [];
for (let x = x1; x <= x2 + 1e-9; x += step) xs.push(x);
console.log(`y=${y}  x ${x1}..${x2} (left to right), z ${z1} (top) .. ${z2} (bottom), step ${step}`);
let head = '        ';
for (const x of xs) head += (Math.round(x * 10) % 10 === 0 && Math.abs(x - Math.round(x)) < step / 2) ? String(Math.abs(Math.round(x)) % 10) : ' ';
console.log(head);
for (let z = z1; z <= z2 + 1e-9; z += step) {
  let row = (z.toFixed(2)).padStart(7) + ' ';
  for (const x of xs) row += at(x, z);
  console.log(row);
}
console.log('decor:');
for (const d of M.decor) {
  const p = d.p || (d.min && d.min.length === 3 ? d.min : null);
  if (!p || p.length < 3) continue;
  if (p[0] > x1 && p[0] < x2 && p[2] > z1 && p[2] < z2 && Math.abs(p[1] - y) < 3) console.log(' ', JSON.stringify(d).slice(0, 200));
}
console.log('switches:');
for (const s of M.switches) if (s.p[0] > x1 && s.p[0] < x2 && s.p[2] > z1 && s.p[2] < z2) console.log(' ', JSON.stringify(s));
console.log('lights:');
for (const d of M.decor) if (d.type === 'light' && d.p[0] > x1 && d.p[0] < x2 && d.p[2] > z1 && d.p[2] < z2) console.log(' ', JSON.stringify(d));
