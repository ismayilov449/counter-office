const G = new URL('../../../', import.meta.url).href;
const B = await import(G + 'shared/maps/cs_mansion_bsp.js');
const f2 = v => v.toFixed(2);
const Y = +process.argv[2];
for (const [tex, polys] of Object.entries(B.FACES)) for (const f of polys) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < f.length; i += 5) { x0 = Math.min(x0, f[i]); x1 = Math.max(x1, f[i]); y0 = Math.min(y0, f[i + 1]); y1 = Math.max(y1, f[i + 1]); z0 = Math.min(z0, f[i + 2]); z1 = Math.max(z1, f[i + 2]); }
  if (Math.abs(y0 - Y) < 0.02 && Math.abs(y1 - Y) < 0.02 && (x1 - x0) * (z1 - z0) > 0.5) console.log(tex.padEnd(16), [x0, z0, x1, z1].map(f2).join(','), 'verts', f.length / 5);
}
