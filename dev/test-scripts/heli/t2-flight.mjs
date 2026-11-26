// The helicopter's flying (shared/heli.js stepHeli) against cs_mansion's collision, offline (no server):
// node dev/test-scripts/heli/t2-flight.mjs
// From its pad it lifts off; it can't go over the ceiling; it flies over the estate wall; it hits the house's wall
// (a crash); it lands on the roof terrace softly; with no fuel it drops.
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { HELI, stepHeli } from '../../../shared/heli.js';
const M = MAPS.cs_mansion, w = new CollisionWorld(M);
let fails = 0;
const ok = (what, c) => { console.log((c ? 'OK   ' : 'FAIL ') + what); if (!c) { fails++; process.exitCode = 1; } };
const h = { p: M.heli.p.slice(), yaw: M.heli.yaw, v: [0, 0, 0], tilt: 0, roll: 0, landed: true };
const run = (input, secs, engine = true) => { let worst = 0; for (let t = 0; t < secs; t += 1 / 60) worst = Math.max(worst, stepHeli(h, input, 1 / 60, w.move('heli', h.p, 9), engine)); return worst; };
ok('on its pad, it stays put', run({ fwd: 1, side: 0, up: 0 }, 1) === 0 && h.landed && Math.hypot(h.p[0] - M.heli.p[0], h.p[2] - M.heli.p[2]) < 0.01);
Object.assign(h, { p: [26.4, 0, 15.5], yaw: 0, okYaw: 0, v: [0, 0, 0], landed: true }); // (the rest from the CT street: over the estate wall, into the house)
run({ fwd: 0, side: 0, up: 1 }, 2.5);
ok(`it lifts off (${h.p[1].toFixed(2)} m)`, h.p[1] > 6 && !h.landed);
run({ fwd: 0, side: 0, up: 1 }, 4);
ok(`not over the ceiling (${h.p[1].toFixed(2)})`, h.p[1] <= HELI.ceiling + 1e-6);
run({ fwd: 0, side: 0, up: -1 }, 1.4);
h.yaw = Math.PI / 2; // (nose to the west, over the estate)
const c1 = run({ fwd: 1, side: 0, up: 0 }, 2);
ok(`over the estate wall, no crash (x ${h.p[0].toFixed(1)}, y ${h.p[1].toFixed(1)}, crash ${c1.toFixed(1)})`, h.p[0] < 23 && c1 === 0);
// down to 2 m over the garden in front of the house, then west into its east wall
run({ fwd: 0, side: 0, up: -1 }, 1.5); h.v = [0, 0, 0];
const y0 = h.p[1];
run({ fwd: 0, side: 0, up: -1 }, (y0 - 1.5) / HELI.climb + 1);
ok(`down in the garden (y ${h.p[1].toFixed(2)})`, h.p[1] < 2.5);
run({ fwd: 0, side: 0, up: 1 }, 0.6); // (back up off the grass: on the ground it only lifts off)
const c2 = run({ fwd: 1, side: 0, up: 0.0 }, 5);
ok(`it hits the house (crash ${c2.toFixed(1)} m/s at x ${h.p[0].toFixed(1)})`, c2 > 3 && h.p[0] > -7.5);
// up over the roof terrace (the east balcony at 4.3, x -6.5..-3, z -9..6) and down onto it
Object.assign(h, { p: [-4.6, 7, -1.5], v: [0, 0, 0], yaw: 0, landed: false });
const c3 = run({ fwd: 0, side: 0, up: -0.5 }, 3);
ok(`it lands on the balcony softly (y ${h.p[1].toFixed(2)}, crash ${c3.toFixed(1)})`, h.landed && Math.abs(h.p[1] - 4.27) < 0.15 && c3 < HELI.hard);
// out of fuel high up: it drops hard
Object.assign(h, { p: [5, 11, 5], v: [0, 0, 0], landed: false });
const c4 = run({ fwd: 0, side: 0, up: 1 }, 3, false);
ok(`no fuel: it drops (crash ${c4.toFixed(1)} m/s)`, h.landed && c4 > HELI.crash);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
