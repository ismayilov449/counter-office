// Lists what cs_mansion has in a box: solids, decor, switches, doors, windows, rooms (a planning aid for the stealth
// geometry). node dev/test-scripts/stealth/dump.mjs x1 x2 y1 y2 z1 z2 [map]
const [x1, x2, y1, y2, z1, z2] = process.argv.slice(2, 8).map(Number);
const id = process.argv[8] || 'mansion';
const M = (await import(`../../../shared/maps/${id}.js`)).default;
const inR = (mn, mx) => mx[0] > x1 && mn[0] < x2 && mx[1] > y1 && mn[1] < y2 && mx[2] > z1 && mn[2] < z2;
const f = v => +v.toFixed(3);
console.log('boxes:');
for (const b of M.boxes) if (inR(b.min, b.max)) console.log(' ', b.min.map(f).join(','), '..', b.max.map(f).join(','), b.brk != null ? 'brk' + b.brk : '', b.glass ? 'GLASS' : '', b.mat !== 'none' ? b.mat : '');
console.log('decor:');
for (const d of M.decor) {
  const p = d.p || (d.min && d.min.length === 3 ? d.min : null);
  if (!p) continue;
  if (p[0] > x1 && p[0] < x2 && p[2] > z1 && p[2] < z2 && p[1] > y1 - 1 && p[1] < y2 + 1) console.log(' ', JSON.stringify(d).slice(0, 220));
}
console.log('switches:');
for (const s of M.switches) if (s.p[0] > x1 && s.p[0] < x2 && s.p[2] > z1 && s.p[2] < z2) console.log(' ', JSON.stringify(s));
console.log('doors:');
for (const d of M.doors) if (d.hinge[0] > x1 - 2 && d.hinge[0] < x2 + 2 && d.hinge[2] > z1 - 2 && d.hinge[2] < z2 + 2) console.log(' ', JSON.stringify(d));
console.log('rooms:');
for (const r of M.rooms) if (inR(r.min, r.max)) console.log(' ', r.group, r.min.map(f).join(','), '..', r.max.map(f).join(','));
console.log('ladders:');
for (const l of M.ladders) console.log(' ', JSON.stringify(l));
