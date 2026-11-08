// node unit.mjs — shared/power.js and the Mansion's power geometry, without a server:
//   - which circuit every light group and a few spots are on (both Mansion maps); other maps have none
//   - live(): breakers, the mains, the generator (and its fuel running out), deadGroups
//   - the cut cable's fall (fallAt): free fall at g, smooth, never back up; the brake stops it within caughtDrop() and
//     on time; it lands on the buffers otherwise; motionAt (shared/elevator.js) gives the same; crashDamage by height
//   - aimAt: each breaker, the generator, the winch; nothing from too far
//   - the geometry: the machine room straight over the shaft; you can climb the terrace's ladder, walk over the roof
//     and into the machine room (the game's physics); the generator and the winch are solid; the zip line's stands
//     and the CCTV desk untouched
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const P = await G('shared/power.js');
const { motionAt } = await G('shared/elevator.js');
const { CollisionWorld } = await G('shared/collision.js');
const { movePlayer, ladderAt, PLAYER } = await G('shared/physics.js');

let fails = 0, checks = 0;
const ok = (cond, what) => { checks++; if (!cond) { fails++; console.log('FAIL', what); } else if (process.env.V) console.log('ok  ', what); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ---- circuits
for (const id of ['cs_mansion', 'cs_mansion_night']) {
  const M = MAPS[id], tab = P.circuitTable(M);
  ok(['lampa9', 'lampa3', 'lampa10', 'lampa11', 'lampa1'].every(g => tab[g] === 'upper'), `${id}: the upper floor's groups`);
  ok(['lampa6', 'lampa4', 'lampa5', 'lampa7', 'lampa8', 'lampa2', 'garage'].every(g => tab[g] === 'ground'), `${id}: the ground floor's groups (the stair hall, the garage)`);
  ok(tab.cellar === 'cellar' && tab.elevator === 'lift' && !tab.tunnel && !tab.shed && !tab.neighbour, `${id}: the cellar, the lift; the tunnels, the shed, the neighbour's not on the house's power`);
  ok(id === 'cs_mansion' ? !('estate' in tab) : tab.estate === 'ground', `${id}: the estate's lamps (night only) on the ground floor's circuit`);
  ok(P.circuitAt(M, [-20.6, 1, -4.5]) === 'lift' && P.circuitAt(M, [-15, 5, 0]) === 'upper' && P.circuitAt(M, [-18, -1, 0]) === 'cellar' && P.circuitAt(M, [-19, 1, -17]) === 'ground' && P.circuitAt(M, [0, 0, 0]) === null, `${id}: circuitAt the lift, upstairs, the cellar, the garage, the lawn`);
  ok(!!M.power, `${id}: map.power`);
}
for (const id of ['de_dust2', 'cs_assault', 'de_inferno', 'aim_map', 'de_dusty']) ok(!MAPS[id].power && Object.keys(P.circuitTable(MAPS[id])).length === 0, `${id}: no house power`);

// ---- live()
const s = P.freshState();
ok(P.CIRCUITS.every(c => P.live(s, c, 0)) && P.live(s, null, 0), 'fresh: every circuit live (and null: not on the house)');
s.b[0] = 0;
ok(!P.live(s, 'upper', 0) && P.live(s, 'ground', 0), 'the upper floor\'s breaker off: only it dead');
s.b[0] = 1; s.main = 0;
ok(P.CIRCUITS.every(c => !P.live(s, c, 0)), 'mains off: every circuit dead');
s.g = [1, 10, 1000];
ok(P.live(s, 'upper', 2000) && P.live(s, 'ground', 2000) && !P.live(s, 'cellar', 2000) && !P.live(s, 'cctv', 2000) && !P.live(s, 'lift', 2000), 'the generator: the two floors, not the cellar, the CCTV, the lift');
ok(near(P.genFuel(s, 4000), 7) && P.genRunning(s, 10999) && !P.genRunning(s, 11001) && !P.live(s, 'upper', 11001), 'its fuel burns: 10 s at 1 s, 7 left at 4 s, out at 11 s');
s.b[1] = 0;
ok(!P.live(s, 'ground', 2000) && P.live(s, 'upper', 2000), 'the generator doesn\'t beat a breaker');
const dead = P.deadGroups(MAPS.cs_mansion, s, 2000);
ok(dead.includes('lampa6') && dead.includes('cellar') && dead.includes('elevator') && !dead.includes('lampa9'), `deadGroups (${dead.join(',')})`);

// ---- the fall
const C = P.CABLE;
for (const [y0, tc] of [[4.267, 0], [0.813, 0], [4.267, C.tc], [0.813, C.tc], [-2.2, 0], [-2.2, C.tc], [2.5, C.tc]]) {
  const m = { y0, y1: C.land, t0: 1000, tb: 0, fall: 1, tc };
  let prev = y0, smooth = true, t = 1000, stopAt = null;
  for (; t < 5000; t += 5) {
    const r = P.fallAt(m, t);
    if (r.y > prev + 1e-9 || prev - r.y > 0.12) smooth = false;
    prev = r.y;
    const r2 = motionAt(m, t);
    if (r2.y !== r.y || r2.moving !== r.moving) smooth = false;
    if (!r.moving) { stopAt = t; break; }
  }
  const drop = y0 - prev, free = Math.sqrt((2 * (y0 - C.land)) / C.g);
  if (!tc) ok(smooth && near(prev, C.land) && stopAt != null && Math.abs((stopAt - 1000) / 1000 - free) < 0.01, `from ${y0} uncaught: falls ${drop.toFixed(2)} m onto the buffers in ${((stopAt - 1000) / 1000).toFixed(2)} s (free fall ${free.toFixed(2)} s), smooth, motionAt the same`);
  else {
    const want = Math.min(P.caughtDrop(), y0 - C.land);
    ok(smooth && near(drop, want, 0.01) && stopAt != null && (stopAt - 1000) / 1000 < C.tc + (C.g * C.tc) / C.decel + 0.02, `from ${y0} caught: drops ${drop.toFixed(2)} m (${want.toFixed(2)}), stopped after ${((stopAt - 1000) / 1000).toFixed(2)} s`);
  }
}
ok(near(P.fallAt({ y0: 4.267, y1: C.land, t0: 0, fall: 1, tc: 0 }, 500).y, 4.267 - (C.g * 0.25) / 2), 'free fall at g: 1.23 m in the first half second');
ok(P.crashDamage(4.267 - C.land) >= 100 && P.crashDamage(0.813 - C.land) > 30 && P.crashDamage(0.813 - C.land) < 60 && P.crashDamage(-2.2 - C.land) === 0 && P.crashDamage(P.caughtDrop()) === 0,
  `crash damage: from the upper floor ${P.crashDamage(4.267 - C.land)} (deadly), the ground floor ${P.crashDamage(0.813 - C.land)}, the cellar ${P.crashDamage(-2.2 - C.land)}, caught ${P.crashDamage(P.caughtDrop())}`);

// ---- aiming
const W = MAPS.cs_mansion.power, aim = (feet, q) => { const e = [feet[0], feet[1] + PLAYER.eye, feet[2]], d = [q[0] - e[0], q[1] - e[1], q[2] - e[2]], l = Math.hypot(...d); return P.aimAt(W, e, d.map(v => v / l))?.a ?? null; };
const pn = W.panel, colX = i => pn.min[0] + ((pn.max[0] - pn.min[0]) * (i + 0.5)) / 5;
for (let i = 0; i < 5; i++) ok(aim([-16.95, -2.2, -4.6], [colX(i), -0.85, pn.max[2]]) === 'b' + i, `aimAt breaker ${i}`);
ok(aim([-19.6, 0, -16.1], [-19.6, 0.6, -14.9]) === 'g' && aim([-19.6, 0, -18.0], [-19.6, 0.6, -14.9]) === null, 'aimAt the generator (and not from 2.5 m)');
ok(aim([-19.85, W.winch.floor, -4.47], [-21.15, W.winch.floor + 0.7, -4.47]) === 'w', 'aimAt the winch');
ok(P.targetSpot(W, 'b3').floor === -2.2 && P.targetSpot(W, 'g').floor === 0 && P.targetSpot(W, 'w').floor === W.winch.floor, 'targetSpot floors');

// ---- the geometry
const M = MAPS.cs_mansion, E = M.elevator, R = W.room;
ok(R.x1 <= E.out.x1 && R.x2 >= E.out.x2 && R.z1 <= E.out.z1 && R.z2 >= E.out.z2, 'the machine room stands over the whole shaft');
ok(W.winch.rope[0] > E.shaft.x1 && W.winch.rope[0] < E.shaft.x2 && W.winch.rope[2] > E.shaft.z1 && W.winch.rope[2] < E.shaft.z2, 'the ropes go down over the shaft');
const coll = new CollisionWorld(M);
const solidAt = p => coll.raycast([p[0], p[1] + 0.5, p[2]], [0, -1, 0], 1, 'solid');
const top = (x, z, y) => { const h = coll.raycast([x, y, z], [0, -1, 0], 20, 'solid'); return h ? y - h.t : null; };
ok(near(top(-19.6, -15.6 + 0.7, 2), W.gen.max[1], 0.01), `the generator is solid (its top ${top(-19.6, -14.9, 2)?.toFixed(2)})`);
ok(near(top(-21.15, -4.47, 12), W.winch.max[1], 0.01), `the winch is solid (its top ${top(-21.15, -4.47, 12)?.toFixed(2)})`);
ok(near(top(-19.8, -4.47, 11.5), R.floor, 0.01) && near(top(-20.7, -3.6, 11.5), R.floor, 0.01), 'the machine room\'s floor');
ok(near(top(-20.7, -4.47, 14), R.top, 0.01), 'its roof');
// walk it: the terrace, up the ladder, over the roof, into the room (the game's physics, 60 fps)
const body = { p: [-5.7, 4.27, -3.9], v: [0, 0, 0], onGround: true, crouch: false };
const step = (vx, vz, secs, vy = 0) => { for (let t = 0; t < secs; t += 1 / 60) { body.v[0] = vx; body.v[2] = vz; const l = ladderAt(M.ladders, body.p, PLAYER.height); if (l && vy) { body.v[1] = vy; movePlayer(body, 1 / 60, coll.move(null, body.p, 3), 0); } else movePlayer(body, 1 / 60, coll.move(null, body.p, 3)); } };
ok(!!ladderAt(M.ladders, body.p, PLAYER.height), 'the terrace\'s ladder is there');
step(0, 0, 2.6, 1.5);
ok(body.p[1] > 7.6, `up the ladder (${body.p[1].toFixed(2)})`);
step(-2, 0, 0.6, 1.5); step(-3, 0, 1.0);
ok(body.p[0] < -8 && body.p[1] > 8, `onto the roof (${body.p.map(v => v.toFixed(2))})`);
step(-4, -0.15, 3.2); step(-1.5, 0, 0.8);
ok(body.p[0] < R.x2 - 0.3 && near(body.p[1], R.floor, 0.01) && body.onGround, `over the ridge and into the machine room (${body.p.map(v => v.toFixed(2))})`);
// the gadgets' spots untouched
for (const st of M.zip.stands) ok(near(top(st.p[0], st.p[2], st.p[1] + 1), st.p[1], 0.02), `the zip line's stand at ${st.p} still on its floor`);
ok(near(top(M.cctv.seat[0], M.cctv.seat[2], 6), M.cctv.seat[1], 0.02), 'the CCTV desk\'s chair untouched');
ok(!ladderAt(M.ladders, [M.zip.stands[1].p[0], 4.27, M.zip.stands[1].p[2]], PLAYER.height), 'the ladder is away from the zip line\'s stand');

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
