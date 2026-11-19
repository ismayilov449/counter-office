// Self-check for collapse() in server.js (perf item 5): the local search from the broken pieces' neighbours must find
// exactly the pieces the old walk over the whole house from the anchors found. Run: node dev/test-scripts/perf-collapse.mjs
import { MAPS } from '../../shared/maps/index.js';
const P = MAPS.cs_mansion.breakables;
const full = gone => { // the old way
  const held = new Uint8Array(P.length), q = [];
  for (const pc of P) if (pc.anchor && !gone.has(pc.id)) { held[pc.id] = 1; q.push(pc.id); }
  while (q.length) for (const n of P[q.pop()].links) if (!held[n] && !gone.has(n)) { held[n] = 1; q.push(n); }
  return P.filter(pc => !held[pc.id] && !gone.has(pc.id)).map(pc => pc.id).sort((a, b) => a - b);
};
const local = (gone, broken) => { // the new way (a copy of collapse's search)
  const held = new Set(), loose = new Set();
  for (const id of broken) for (const n of P[id].links) {
    if (gone.has(n) || held.has(n) || loose.has(n)) continue;
    const group = [n], seen = new Set(group);
    let anchored = false;
    for (let i = 0; i < group.length && !anchored; i++) {
      const pc = P[group[i]];
      if (pc.anchor || held.has(pc.id)) { anchored = true; break; }
      for (const m of pc.links) if (!seen.has(m) && !gone.has(m)) { seen.add(m); group.push(m); }
    }
    for (const m of seen) (anchored ? held : loose).add(m);
  }
  return [...loose].sort((a, b) => a - b);
};
let bad = 0, fell = 0, tFull = 0, tLocal = 0;
for (let trial = 0; trial < 400; trial++) {
  const gone = new Set();
  for (let step = 0; step < 30; step++) {
    const c = P[Math.floor(Math.random() * P.length)], broken = [];
    for (const pc of P) if (!gone.has(pc.id) && Math.hypot(pc.min[0] - c.min[0], pc.min[1] - c.min[1], pc.min[2] - c.min[2]) < 1 + Math.random() * 3) broken.push(pc.id);
    for (const id of broken) gone.add(id);
    let t = performance.now(); const a = full(gone); tFull += performance.now() - t;
    t = performance.now(); const b = local(gone, broken); tLocal += performance.now() - t;
    if (a.join() !== b.join()) bad++;
    for (const id of a) gone.add(id); // they fall (as breakPieces(fallen) does)
    fell += a.length;
  }
}
console.log(`${P.length} pieces, 12000 breaks, ${fell} fell; mismatches: ${bad}; full walk ${tFull.toFixed(0)} ms, local ${tLocal.toFixed(0)} ms`);
if (bad) process.exit(1);
