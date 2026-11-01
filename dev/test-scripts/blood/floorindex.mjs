// No server needed: builds the blood drops' floor index (floorIndex/faceFloor from public/js/blood.js, evaluated here
// without three) for every map, with its time, and samples the Mansion (day and night; the other maps aren't tuned):
// the drawn floor against the collision top under it (how far a drop put on the collision boxes would sink into a
// slope or float over it). clientsmoke.mjs checks the real BloodTrails.floor() at every standing spot of the Mansion.
import fs from 'node:fs';
import { MAPS, MAP_IDS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
const src = fs.readFileSync(new URL('../../../public/js/blood.js', import.meta.url), 'utf8');
const pick = name => { const i = src.indexOf(`function ${name}(`); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } return src.slice(i, j + 1); };
const { floorIndex, faceFloor } = new Function(`const CELL = 2; const key = (cx, cz) => cx * 65536 + cz;\n${pick('floorIndex')}\n${pick('faceFloor')}\nreturn { floorIndex, faceFloor };`)();
for (const id of MAP_IDS) {
  const t0 = performance.now();
  const ix = floorIndex(MAPS[id]);
  const ms = performance.now() - t0;
  console.log(id.padEnd(18), ix ? `${ix.polys.length} floor faces, ${ix.cells.size} cells, ${ms.toFixed(1)} ms` : 'no faces (boxes only)');
}
// Points inside every floor face (between its middle and each corner): the collision top under each, found the way
// the drops find it (down from half a metre above the feet), against the face's height there.
for (const id of ['cs_mansion', 'cs_mansion_night']) {
  const map = MAPS[id], coll = new CollisionWorld(map), ix = floorIndex(map);
  let n = 0, noColl = 0, tilted = 0, maxDiff = 0, sum = 0, big = 0, slopeSum = 0, slopeN = 0, slopeMax = 0, found = 0;
  for (const p of ix.polys) {
    const m = p.xz.length / 2;
    let cx = 0, cz = 0;
    for (let i = 0; i < m; i++) { cx += p.xz[i * 2] / m; cz += p.xz[i * 2 + 1] / m; }
    for (let i = 0; i < m; i++) {
      const x = cx + (p.xz[i * 2] - cx) * 0.6, z = cz + (p.xz[i * 2 + 1] - cz) * 0.6;
      const yf = (p.d - p.n[0] * x - p.n[2] * z) / p.n[1];
      const h = coll.raycast([x, yf + 0.5, z], [0, -1, 0], 2.3, 'solid');
      if (!h || h.n[1] <= 0) { noColl++; continue; }
      const yc = yf + 0.5 - h.t, d = Math.abs(yf - yc);
      if (d > 0.3) { noColl++; continue; } // (a hole in the collision under a drawn floor, or a thing standing on it)
      n++;
      const ff = faceFloor(ix, x, z, yc - 0.2, yc + 0.3); // (the range BloodTrails.floor() looks in)
      if (ff && ff.y >= yf - 0.005) found++; // (this face, or one drawn over it)
      sum += d; maxDiff = Math.max(maxDiff, d); if (d > 0.03) big++;
      if (p.n[1] < 0.995) { tilted++; slopeSum += d; slopeN++; slopeMax = Math.max(slopeMax, d); }
    }
  }
  console.log(`${id}: ${n} points (${noColl} without collision within 0.3 m), the index finds a floor at ${found} (the rest: a face drawn more than 0.2 m under the collision top, like the lawn under the gazebo, where the collision wins); |drawn - collision| mean ${(sum / n).toFixed(3)} m, max ${maxDiff.toFixed(3)}, ${big} over 3 cm; on slopes (${tilted}) mean ${(slopeSum / (slopeN || 1)).toFixed(3)} m, max ${slopeMax.toFixed(3)}`);
}
