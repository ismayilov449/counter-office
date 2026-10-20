import fs from 'fs';
const buf = fs.readFileSync(process.argv[2]);
const ver = buf.readInt32LE(0);
const L = i => ({ off: buf.readInt32LE(4 + i * 8), len: buf.readInt32LE(8 + i * 8) });
const lump = i => buf.subarray(L(i).off, L(i).off + L(i).len);
export const bsp = { ver };
// entities
bsp.ents = lump(0).toString('latin1').match(/\{[^}]*\}/g).map(b => Object.fromEntries([...b.matchAll(/"([^"]*)"\s+"([^"]*)"/g)].map(m => [m[1], m[2]])));
// planes
const pl = lump(1); bsp.planes = [];
for (let o = 0; o < pl.length; o += 20) bsp.planes.push({ n: [pl.readFloatLE(o), pl.readFloatLE(o + 4), pl.readFloatLE(o + 8)], d: pl.readFloatLE(o + 12), t: pl.readInt32LE(o + 16) });
// textures
const tx = lump(2); const nt = tx.readInt32LE(0); bsp.tex = [];
for (let i = 0; i < nt; i++) { const o = tx.readInt32LE(4 + i * 4); if (o < 0) { bsp.tex.push({ name: '?' }); continue; } bsp.tex.push({ name: tx.toString('latin1', o, o + 16).replace(/\0.*$/s, ''), w: tx.readUInt32LE(o + 16), h: tx.readUInt32LE(o + 20) }); }
const vv = lump(3); bsp.verts = [];
for (let o = 0; o < vv.length; o += 12) bsp.verts.push([vv.readFloatLE(o), vv.readFloatLE(o + 4), vv.readFloatLE(o + 8)]);
const ti = lump(6); bsp.texinfo = [];
for (let o = 0; o < ti.length; o += 40) bsp.texinfo.push({ s: [ti.readFloatLE(o), ti.readFloatLE(o + 4), ti.readFloatLE(o + 8), ti.readFloatLE(o + 12)], t: [ti.readFloatLE(o + 16), ti.readFloatLE(o + 20), ti.readFloatLE(o + 24), ti.readFloatLE(o + 28)], mip: ti.readInt32LE(o + 32), flags: ti.readInt32LE(o + 36) });
const ed = lump(12); const edges = []; for (let o = 0; o < ed.length; o += 4) edges.push([ed.readUInt16LE(o), ed.readUInt16LE(o + 2)]);
const se = lump(13); const surf = []; for (let o = 0; o < se.length; o += 4) surf.push(se.readInt32LE(o));
const fc = lump(7); bsp.faces = [];
for (let o = 0; o < fc.length; o += 20) {
  const plane = fc.readUInt16LE(o), side = fc.readUInt16LE(o + 2), first = fc.readInt32LE(o + 4), n = fc.readUInt16LE(o + 8), tinfo = fc.readUInt16LE(o + 10);
  const pts = [];
  for (let k = 0; k < n; k++) { const e = surf[first + k]; pts.push(bsp.verts[e >= 0 ? edges[e][0] : edges[-e][1]]); }
  const P = bsp.planes[plane]; const nn = side ? P.n.map(v => -v) : P.n;
  bsp.faces.push({ pts, n: nn, tex: bsp.tex[bsp.texinfo[tinfo].mip].name, ti: tinfo, lightOff: fc.readInt32LE(o + 16) });
}
const md = lump(14); bsp.models = [];
for (let o = 0; o < md.length; o += 64) bsp.models.push({ min: [md.readFloatLE(o), md.readFloatLE(o + 4), md.readFloatLE(o + 8)], max: [md.readFloatLE(o + 12), md.readFloatLE(o + 16), md.readFloatLE(o + 20)], origin: [md.readFloatLE(o + 24), md.readFloatLE(o + 28), md.readFloatLE(o + 32)], firstFace: md.readInt32LE(o + 56), nFaces: md.readInt32LE(o + 60) });
const nd = lump(5); bsp.nodes = [];
for (let o = 0; o < nd.length; o += 24) bsp.nodes.push({ plane: nd.readInt32LE(o), ch: [nd.readInt16LE(o + 4), nd.readInt16LE(o + 6)] });
const lf = lump(10); bsp.leaves = [];
for (let o = 0; o < lf.length; o += 28) bsp.leaves.push({ c: lf.readInt32LE(o), min: [lf.readInt16LE(o + 8), lf.readInt16LE(o + 10), lf.readInt16LE(o + 12)], max: [lf.readInt16LE(o + 14), lf.readInt16LE(o + 16), lf.readInt16LE(o + 18)] });
for (let i = 0; i < bsp.models.length; i++) bsp.models[i].head = md.readInt32LE(i * 64 + 36);
// Walk a hull-0 tree; returns solid regions as { planes: [[n,d,side]] }, where inside means n.p >= d (front) or < d.
bsp.regions = function (head, want = c => c === -2) {
  const out = [];
  const rec = (node, path) => {
    if (node < 0) { const leaf = bsp.leaves[-(node + 1)]; if (want(leaf.c)) out.push({ path: [...path], c: leaf.c }); return; }
    const N = bsp.nodes[node], P = bsp.planes[N.plane];
    path.push({ P, front: true }); rec(N.ch[0], path); path.pop();
    path.push({ P, front: false }); rec(N.ch[1], path); path.pop();
  };
  rec(head, []);
  return out;
};
