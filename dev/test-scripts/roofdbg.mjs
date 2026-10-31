// What covers a point on Mansion: faces above it (static vs a breakable piece's), and breakable boxes above it.
const G = new URL('../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const map = MAPS.cs_mansion;
const inside = (xs, zs, x, z) => { let hit = false; for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) if ((zs[i] > z) !== (zs[j] > z) && x < ((xs[j] - xs[i]) * (z - zs[i])) / (zs[j] - zs[i]) + xs[i]) hit = !hit; return hit; };
function facesOver(faces, x, z, y) {
  const out = [];
  for (const [tex, polys] of Object.entries(faces)) for (const f of polys) {
    const xs = [], ys = [], zs = []; for (let i = 0; i < f.length; i += 5) { xs.push(f[i]); ys.push(f[i + 1]); zs.push(f[i + 2]); }
    if (Math.max(...ys) - Math.min(...ys) > 3) continue;
    if (!inside(xs, zs, x, z)) continue;
    const yy = ys.reduce((a, b) => a + b) / ys.length;
    if (yy > y) out.push(tex + '@' + yy.toFixed(2));
  }
  return out;
}
const pts = process.argv.slice(2).length ? [process.argv.slice(2).map(Number)] : [map.spawns.T[0].p, map.spawns.T[1].p, [-15, 0.81, 0]];
for (const p of pts) {
  console.log('point', p.map(v => v.toFixed(1)).join(','));
  console.log('  all faces above:', facesOver(map.faces, p[0], p[2], p[1] + 0.9).join(' '));
  console.log('  static faces above:', facesOver(map.staticFaces, p[0], p[2], p[1] + 0.9).join(' '));
  const pcs = map.breakables.filter(pc => pc.boxes.some(b => b.min[0] <= p[0] && b.max[0] >= p[0] && b.min[2] <= p[2] && b.max[2] >= p[2] && b.min[1] > p[1] + 0.9));
  console.log('  breakable pieces above:', pcs.map(pc => `${pc.id}:${pc.kind}@${Math.min(...pc.boxes.map(b => b.min[1])).toFixed(2)}`).join(' '));
  const statics = map.boxes.filter(b => !b.brk && b.min[0] <= p[0] && b.max[0] >= p[0] && b.min[2] <= p[2] && b.max[2] >= p[2] && b.min[1] > p[1] + 0.9);
  console.log('  static boxes above:', statics.map(b => `${b.min[1].toFixed(2)}-${b.max[1].toFixed(2)}${b.hidden ? 'h' : ''}`).join(' '));
}
