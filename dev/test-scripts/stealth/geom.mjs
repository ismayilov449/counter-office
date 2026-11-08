// The chimney's geometry (shared/maps/mansion_stealth.js), no server needed:
//   1. faces: every wall of the flue, the breast (living room, Ts' room), the stack over the roof and its rim are drawn
//      once (no hole, nothing twice), and the faces next to it (the walls it stands against, the floors and ceilings
//      round it, the roof round the stack) are still there;
//   2. rays from inside the flue in every direction hit a drawn face before leaving it (no see-through seams), except
//      up out of the top and out through the mouth;
//   3. collision: the flue is open from the hearth to the top, a body fits up it, its walls are solid, the hearth and
//      the firebox's mouth are where they should be.
// node dev/test-scripts/stealth/geom.mjs [map]   (exit code 1 on any failure)
import { CHIMNEY as C } from '../../../shared/maps/mansion_stealth.js';
import { overlapsAny, PLAYER } from '../../../shared/physics.js';
const id = process.argv[2] || 'mansion';
const M = (await import(`../../../shared/maps/${id}.js`)).default;
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); };

// faces near the chimney (all of them: static and the breakable pieces')
const near = f => { for (let i = 0; i < f.length; i += 5) if (f[i] > -22 && f[i] < -16.5 && f[i + 2] > 2.5 && f[i + 2] < 7) return true; return false; };
const faces = [];
for (const [t, ps] of Object.entries(M.faces)) for (const f of ps) if (near(f)) faces.push({ t, f });
const AX = [[1, 2], [2, 0], [0, 1]];
const onPlane = (axis, at) => faces.filter(({ f }) => { for (let i = axis; i < f.length; i += 5) if (Math.abs(f[i] - at) > 2e-3) return false; return true; });
function inPoly(x, y, pts) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}
// sign of a face's normal along `axis` (Newell)
function normal(f) {
  let nx = 0, ny = 0, nz = 0;
  const n = f.length / 5;
  for (let i = 0; i < n; i++) {
    const a = i * 5, b = ((i + 1) % n) * 5;
    nx += (f[a + 1] - f[b + 1]) * (f[a + 2] + f[b + 2]);
    ny += (f[a + 2] - f[b + 2]) * (f[a] + f[b]);
    nz += (f[a] - f[b]) * (f[a + 1] + f[b + 1]);
  }
  return [nx, ny, nz];
}
// How many faces on the plane cover each sample of a rectangle (u along AX[axis][0], v along AX[axis][1]), facing `sign`.
function cover(name, axis, at, sign, u1, u2, v1, v2, want = 1, step = 0.1) {
  const [b, c] = AX[axis], polys = onPlane(axis, at).filter(({ f }) => Math.sign(normal(f)[axis]) === sign)
    .map(({ t, f }) => { const pts = []; for (let i = 0; i < f.length; i += 5) pts.push([f[i + b], f[i + c]]); return { t, pts }; });
  let bad = 0, first = null;
  const E = 0.02;
  for (let u = u1 + E; u < u2 - E + 1e-9; u += step) for (let v = v1 + E; v < v2 - E + 1e-9; v += step) {
    const n = polys.filter(q => inPoly(u, v, q.pts)).length;
    if (n !== want) { bad++; first ||= `${u.toFixed(2)},${v.toFixed(2)}: ${n}`; }
  }
  ok(!bad, `${name}: ${bad ? `${bad} samples wrong (first ${first})` : 'drawn once everywhere'}`);
}

console.log(`-- faces (${id})`);
// the flue, inside (x walls: u = y, v = z; z walls: u = x, v = y)
cover('flue west wall', 0, C.fx1, 1, C.hearth, C.top, C.fz1, C.fz2);
cover('flue east wall', 0, C.fx2, -1, C.hearth, C.top, C.fz1, C.fz2);
cover('flue back (south) wall', 2, C.fz2, -1, C.fx1, C.fx2, C.hearth, C.top);
cover('flue front (north) wall over the mouth', 2, C.fz1, 1, C.fx1, C.fx2, C.mouth, C.top);
cover('the firebox floor', 1, C.hearth, 1, C.z1, C.fz2, C.fx1, C.fx2);
cover('the mouth: west side', 0, C.fx1, 1, C.hearth, C.mouth, C.z1, C.fz1);
cover('the mouth: east side', 0, C.fx2, -1, C.hearth, C.mouth, C.z1, C.fz1);
cover('the mouth: lintel', 1, C.mouth, -1, C.z1, C.fz1, C.fx1, C.fx2);
// the breast in the living room (its north face round the mouth, over the hearth stone; its sides)
cover('breast, living room, west of the mouth', 2, C.z1, -1, C.x1, C.fx1, C.hearth, C.ceil);
cover('breast, living room, east of the mouth', 2, C.z1, -1, C.fx2, C.x2, C.hearth, C.ceil);
cover('breast, living room, over the mouth', 2, C.z1, -1, C.fx1, C.fx2, C.mouth, C.ceil);
cover('breast, living room, west side', 0, C.x1, -1, C.hearth, C.ceil, C.z1, 4.877);
cover('breast, living room, east side', 0, C.x2, 1, C.hearth, C.ceil, C.z1, 4.877);
cover('hearth stone top', 1, C.hearth, 1, C.hearthStone.z1, C.z1, C.hearthStone.x1, C.hearthStone.x2);
// upstairs
cover('breast, Ts\' room, north face', 2, C.z1, -1, C.x1, C.x2, C.up, C.upCeil);
cover('breast, Ts\' room, west side', 0, C.x1, -1, C.up, C.upCeil, C.z1, 4.47);
cover('breast, Ts\' room, east side', 0, C.x2, 1, C.up, C.upCeil, C.z1, 4.47);
cover('the Ts\' room bookcase\'s top niche, its new end', 0, C.x1, -1, 6.096, 6.502, 4.47, 4.877);
// the stack over the roof (above 10.4 the roof is lower everywhere round it) and its rim
cover('stack north face', 2, C.z1, -1, C.x1, C.x2, 10.45, C.top);
cover('stack south face', 2, C.z2, 1, C.x1, C.x2, 10.45, C.top);
cover('stack west face', 0, C.x1, -1, 10.45, C.top, C.z1, C.z2);
cover('stack east face', 0, C.x2, 1, 10.45, C.top, C.z1, C.z2);
for (const [n, z1, x1, z2, x2] of [['west', C.z1, C.x1, C.z2, C.fx1], ['east', C.z1, C.fx2, C.z2, C.x2], ['north', C.z1, C.fx1, C.fz1, C.fx2], ['south', C.fz2, C.fx1, C.z2, C.fx2]]) {
  cover(`stack rim, ${n}`, 1, C.top, 1, z1, z2, x1, x2);
}
// what's round it is still there
cover('living room south wall, west of the breast', 2, 4.877, -1, -20.8, C.x1, 0.9, 2.0);
cover('living room south wall, east of the breast', 2, 4.877, -1, C.x2, -16.2, 0.9, 4.0);
cover('the south-west room\'s north wall behind the flue', 2, 5.283, 1, C.x1, C.x2, 0.9, 2.0);
cover('living room floor in front of the hearth', 1, 0.8128, 1, 3.0, C.hearthStone.z1, -20.2, -18.4);
cover('Ts\' room floor in front of the breast', 1, C.up, 1, 3.6, C.z1, C.x1, C.x2);
cover('Ts\' room ceiling in front of the breast', 1, C.upCeil, -1, 3.8, C.z1, C.x1, C.x2);
cover('living room ceiling in front of the breast', 1, C.ceil, -1, 3.8, C.z1, C.x1, C.x2);

// ---- 2. rays from inside the flue
console.log('-- rays from inside the flue');
const tris = [];
for (const { f } of faces) { const n = f.length / 5; for (let i = 1; i < n - 1; i++) tris.push([0, i, i + 1].map(k => [f[k * 5], f[k * 5 + 1], f[k * 5 + 2]])); }
function rayTri(o, d, [a, b, c]) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det, s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > 1e-5 ? t : null;
}
let rays = 0, leaks = 0, firstLeak = null;
for (let y = 1.0; y < C.top - 0.2; y += 0.6) {
  for (const [x, z] of [[-19.3, 4.78], [-19.6, 4.5], [-19.0, 5.05], [-19.6, 5.05], [-19.0, 4.5]]) {
    const o = [x, y, z];
    for (let i = 0; i < 64; i++) {
      const th = (i / 64) * Math.PI * 2;
      for (const el of [-0.6, -0.25, 0, 0.25, 0.6]) {
        const d = [Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)];
        let best = Infinity;
        for (const tr of tris) { const t = rayTri(o, d, tr); if (t != null && t < best) best = t; }
        // where it leaves the flue's box (the walls' inner faces)
        const tx = d[0] > 0 ? (C.fx2 - x) / d[0] : d[0] < 0 ? (C.fx1 - x) / d[0] : Infinity;
        const tz = d[2] > 0 ? (C.fz2 - z) / d[2] : d[2] < 0 ? (C.fz1 - z) / d[2] : Infinity;
        const ty = d[1] > 0 ? (C.top - y) / d[1] : d[1] < 0 ? (C.hearth - y) / d[1] : Infinity;
        const tOut = Math.min(tx, tz, ty);
        if (tOut === ty && d[1] > 0) continue; // out of the top: the sky
        const at = [x + d[0] * tOut, y + d[1] * tOut, z + d[2] * tOut];
        if (tOut === tz && d[2] < 0 && at[1] < C.mouth) continue; // out of the mouth into the living room
        rays++;
        if (best > tOut + 0.01) { leaks++; firstLeak ||= `from ${o.map(v => v.toFixed(2))} dir ${d.map(v => v.toFixed(2))} leaves at ${at.map(v => v.toFixed(2))}`; }
      }
    }
  }
}
ok(!leaks, `${rays} rays from inside the flue: ${leaks} leave it without hitting a face${firstLeak ? ` (first ${firstLeak})` : ''}`);

// ---- 3. collision
console.log('-- collision');
const boxes = M.boxes;
const cx = (C.fx1 + C.fx2) / 2, cz = (C.fz1 + C.fz2) / 2;
let blocked = null;
for (let y = C.hearth + 0.01; y < C.top; y += 0.05) if (overlapsAny(boxes, cx, y, cz, PLAYER.radius, PLAYER.crouchHeight)) { blocked = y; break; }
ok(blocked == null, `a crouched body fits up the flue from the hearth to the top${blocked != null ? ` (blocked at y ${blocked.toFixed(2)})` : ''}`);
const solidAt = p => boxes.some(b => [0, 1, 2].every(k => p[k] > b.min[k] && p[k] < b.max[k]));
ok([[C.x1 + 0.1, 5, 4.8], [C.x2 - 0.1, 8, 4.8], [-19.3, 3, C.z1 + 0.05], [-19.3, 9, C.z2 - 0.05]].every(solidAt), 'the flue\'s walls are solid (west, east, north over the mouth, south)');
ok(!solidAt([-19.3, 1.5, C.z1 + 0.05]), 'the mouth is open (y 1.5)');
ok(solidAt([-19.3, C.hearth - 0.01, 4.0]) && !solidAt([-19.3, C.hearth + 0.01, 4.0]), `the hearth stone's top is at ${C.hearth}`);
// in through the mouth crouched, then stand up under the flue
const inMouth = !overlapsAny(boxes, -19.3, C.hearth + 0.001, 4.3, PLAYER.radius, PLAYER.crouchHeight);
const standUp = !overlapsAny(boxes, -19.3, C.hearth + 0.001, C.fz2 - PLAYER.radius - 0.01, PLAYER.radius, PLAYER.height);
const noStandMouth = overlapsAny(boxes, -19.3, C.hearth + 0.001, 4.3, PLAYER.radius, PLAYER.height);
ok(inMouth && standUp && noStandMouth, 'crouched you fit through the mouth (not standing), and stand up at the back of the firebox');
// the rim: you can step out over the south rim at the ladder's top
const [, , , , ltop] = C.ladder;
const rim = !overlapsAny(boxes, -19.3, C.top + 0.001, C.z2 + 0.2, PLAYER.radius, PLAYER.crouchHeight);
ok(C.top - (ltop - 0.12) <= 1 && rim, `from the rungs' top (feet ${(ltop - 0.12).toFixed(2)}) the rim is ${(C.top - ltop + 0.12).toFixed(2)} m up, and there's room on it`);

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
