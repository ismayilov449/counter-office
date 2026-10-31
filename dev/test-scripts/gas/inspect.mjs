// Lists what is inside a box of the map (non-breakable solids, breakable props, glass, switches, doors, rooms, decor):
// node inspect.mjs x1 y1 z1 x2 y2 z2 [map]
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const a = process.argv.slice(2, 8).map(Number), map = MAPS[process.argv[8] || 'cs_mansion'];
const inBox = (min, max) => [0, 1, 2].every(k => min[k] <= a[k + 3] && max[k] >= a[k]);
const f = v => v.map(x => x.toFixed(2)).join(' ');
console.log('static solids:');
for (const b of map.boxes) if (!b.glass && b.brk == null && inBox(b.min, b.max)) console.log('  ', f(b.min), '|', f(b.max), b.mat);
const pcs = map.breakables.filter(pc => inBox(pc.min, pc.max));
console.log('pieces:', pcs.length, 'walls', pcs.filter(p => p.kind === 'wall').length, 'props', pcs.filter(p => p.kind === 'prop').length);
if (process.env.PROPS) for (const pc of pcs.filter(p => p.kind === 'prop')) console.log('   prop', pc.id, f(pc.min), '|', f(pc.max), Object.keys(map.pieceFaces[pc.id] || {}).join(','));
if (process.env.WALLS) for (const pc of pcs.filter(p => p.kind === 'wall')) console.log('   wall', pc.id, f(pc.min), '|', f(pc.max), Object.keys(map.pieceFaces[pc.id] || {}).join(','));
console.log('glass:'); for (const b of map.boxes) if (b.glass && inBox(b.min, b.max)) console.log('  ', b.id, f(b.min), '|', f(b.max), b.group);
console.log('switches:'); for (const s of map.switches) if (inBox(s.p, s.p)) console.log('  ', s.group, f(s.p));
console.log('doors:'); map.doors.forEach((d, i) => { console.log('  ', i, JSON.stringify(d)); });
console.log('rooms:'); for (const r of map.rooms) console.log('  ', r.group, f(r.min), '|', f(r.max));
console.log('decor in box:'); for (const d of map.decor) if (d.p && inBox(d.p, d.p)) console.log('  ', d.type, f(d.p), d.group || '');
