// The helicopter's room in the air (shared/heli.js airBoxes, map.heli.area), offline: node dev/test-scripts/heli/t6-airspace.mjs
// Up at its ceiling it flies the whole estate (over the house, along the estate walls) without touching anything; the
// estate's edge stops it softly (low down, the house still stops it: t2-flight.mjs).
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { HELI, stepHeli, airBoxes } from '../../../shared/heli.js';
const M = MAPS.cs_mansion, w = new CollisionWorld(M), A = M.heli.area;
let fails = 0;
const ok = (what, c) => { console.log((c ? 'OK   ' : 'FAIL ') + what); if (!c) { fails++; process.exitCode = 1; } };
const h = { p: [-36, HELI.ceiling, 0], yaw: 0, okYaw: 0, v: [0, 0, 0], tilt: 0, roll: 0, landed: false };
const run = (input, secs) => { let worst = 0; for (let t = 0; t < secs; t += 1 / 60) worst = Math.max(worst, stepHeli(h, input, 1 / 60, airBoxes(M, w.move('heli', h.p, 9)), true, A)); return worst; };
// a lap round the estate up high, nose first: north, east over the house, south, west
let worst = 0;
for (const yaw of [0, -Math.PI / 2, Math.PI, Math.PI / 2]) { h.yaw = yaw; worst = Math.max(worst, run({ fwd: 1, side: 0, up: 1 }, 8)); }
ok(`up high: a lap of the estate without touching anything (worst ${worst.toFixed(1)} m/s, y ${h.p[1].toFixed(1)})`, worst === 0);
h.p = [-36, HELI.ceiling, 0]; h.yaw = -Math.PI / 2; h.v = [0, 0, 0];
run({ fwd: 1, side: 0, up: 0 }, 9);
ok(`across the house to the estate's east edge (x ${h.p[0].toFixed(1)})`, Math.abs(h.p[0] - A[1][0]) < 0.01);
h.yaw = Math.PI / 2; h.v = [0, 0, 0];
const c = run({ fwd: 1, side: 0, up: 0 }, 9);
ok(`back to its west edge, no crash (x ${h.p[0].toFixed(1)}, ${c})`, Math.abs(h.p[0] - A[0][0]) < 0.01 && c === 0);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
