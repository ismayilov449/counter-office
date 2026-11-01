// node unit.mjs — the lift's maths without a server: the motion (exact ends, smooth, never faster than 1 m/s, the
// emergency brake), the doors' timing, and riding it with the game's own movement code (shared/physics.js) the way
// the browser does it (the cabin moves, whoever is in it moves by as much, then movePlayer): standing, walking about,
// jumping, on the roof, at any frame rate; walking in and out at each stop; nothing gets through the closed doors;
// the hatch's spot on the roof; up the shaft's ladder from the roof to the upper landing.
const G = new URL('../../../', import.meta.url).href;
const { MAPS } = await import(G + 'shared/maps/index.js');
const { CollisionWorld } = await import(G + 'shared/collision.js');
const { movePlayer, overlapsAny, ladderAt, ladderPull, PLAYER } = await import(G + 'shared/physics.js');
const L = await import(G + 'shared/elevator.js');
const { ELEV, motionAt, tripTime, doorAt, makeBoxes, placeCabin, placeDoor, inCabin, onRoof, makeLadders, placeLadders, roofSpot, cabinSpot, roofAt, aimAt, nearestStop, doorway, touches, panelZ } = L;

let fails = 0, checks = 0;
const ok = (cond, what) => { checks++; if (!cond) { fails++; console.log('FAIL', what); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

for (const id of ['cs_mansion', 'cs_mansion_night']) ok(!!MAPS[id].elevator, `${id} has the lift`);
const map = MAPS.cs_mansion, E = map.elevator, S = E.stops;

// ---- motion
for (const [a, b] of [[S[1], S[2]], [S[2], S[0]], [S[0], S[1]], [S[1], S[1] + 0.3], [S[2], S[2] - 0.05]]) {
  const m = { y0: a, y1: b, t0: 1000, tb: 0 }, T = tripTime(a, b) * 1000;
  ok(near(motionAt(m, 1000).y, a) && near(motionAt(m, 0).y, a), `trip ${a}->${b} starts at y0`);
  ok(near(motionAt(m, 1000 + T + 1).y, b, 1e-9) && !motionAt(m, 1000 + T + 1).moving, `trip ${a}->${b} ends exactly at y1 after ${(T / 1000).toFixed(2)} s`);
  let prev = a, maxJump = 0, maxV = 0, mono = true;
  for (let t = 1000; t <= 1000 + T + 50; t += 1) {
    const r = motionAt(m, t);
    maxJump = Math.max(maxJump, Math.abs(r.y - prev));
    maxV = Math.max(maxV, Math.abs(r.v));
    if ((b > a && r.y < prev - 1e-12) || (b < a && r.y > prev + 1e-12)) mono = false;
    prev = r.y;
  }
  ok(maxJump <= 0.0011 && maxV <= ELEV.v + 1e-9 && mono, `trip ${a}->${b} smooth (max step ${maxJump.toFixed(4)} m/ms, v ${maxV.toFixed(3)})`);
}
ok(near(tripTime(S[1], S[2]), S[2] - S[1] + 1), 'ground -> upper takes the distance + 1 s');
// the brake, at any moment of a trip: stops within v²/2B, never past the end, continuous
for (let k = 0; k < 200; k++) {
  const a = S[k % 3], b = S[(k + 1 + (k % 2)) % 3], T = tripTime(a, b) * 1000, tb = 1000 + Math.random() * T;
  const m = { y0: a, y1: b, t0: 1000, tb: 0 }, before = motionAt(m, tb);
  m.tb = tb;
  const after = motionAt(m, tb + 0.001), end = motionAt(m, tb + 5000);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  ok(Math.abs(after.y - before.y) < 1e-4, 'brake: no jump');
  ok(!end.moving && Math.abs(end.y - before.y) <= (before.v * before.v) / (2 * ELEV.brake) + 1e-9 && end.y >= lo - 1e-9 && end.y <= hi + 1e-9, 'brake: stops within v²/2B, on the way');
  ok(motionAt(m, tb + 401).moving === false, 'brake: stopped within 0.4 s');
}
// doors
const d = [0, 1, 1000, ELEV.door];
ok(doorAt(d, 1000) === 0 && near(doorAt(d, 1500), 0.5) && doorAt(d, 2500) === 1, 'doors slide open in 1 s');
ok(near(doorAt([1, -1, 0, 1], 250), 0.75) && doorAt([0.4, 0, 0, 1], 9e9) === 0.4, 'doors shut / stopped by the blackout');

// ---- riding with the game's movement
const world = new CollisionWorld(map), B = makeBoxes(), lads = makeLadders(E);
world.elev = B.all;
const doorOpen = [0, 0, 0, 0];
function place(y, hatch = false) { placeCabin(E, B, y, hatch); for (let k = 0; k < 4; k++) placeDoor(E, B, k, y, doorOpen[k]); placeLadders(E, lads, y); }
const body = p => ({ p: p.slice(), v: [0, 0, 0], onGround: true, crouch: false });
// One browser frame: the cabin moves to y, whoever was in it (or on its roof) moves along, then the player moves.
function frame(s, yPrev, y, dt, wish = [0, 0], jump = false) {
  if (inCabin(E, yPrev, s.p) || onRoof(E, yPrev, s.p)) s.p[1] += y - yPrev;
  place(y);
  if (s.onGround) { s.v[0] = wish[0]; s.v[2] = wish[1]; if (jump) { s.v[1] = PLAYER.jump; s.onGround = false; } }
  movePlayer(s, dt, world.move(null, s.p, 2));
}
const cab = E.cabin, mid = cabinSpot(E, 0);
function ride(a, b, opts = {}) {
  const m = { y0: a, y1: b, t0: 0, tb: opts.tb || 0 }, T = tripTime(a, b) * 1000 + 300;
  const s = body(opts.roof ? roofSpot(E, a) : [mid[0], a, mid[2]]);
  if (opts.roof) s.crouch = true;
  place(a, !!opts.roof);
  let t = 0, y = a, worst = 0, out = false, jumps = 0, high = 0;
  while (t < T) {
    const dt = opts.dt ? opts.dt() : 1 / 60;
    t += dt * 1000;
    const yn = motionAt(m, t).y;
    const wish = opts.walk ? [Math.sin(t / 300) * 2.5, Math.cos(t / 470) * 2.5] : [0, 0];
    const jump = opts.jump && s.onGround && Math.random() < 0.05;
    if (jump) jumps++;
    frame(s, y, yn, dt, wish, jump);
    y = yn;
    const floor = opts.roof ? roofAt(E, y) : y;
    if (s.onGround) worst = Math.max(worst, Math.abs(s.p[1] - floor));
    if (s.p[1] < floor - 0.01) out = true;
    high = Math.max(high, s.p[1] - floor);
    if (!opts.roof && !inCabin(E, y, s.p, 0.01)) out = true;
  }
  return { s, y, worst, out, jumps, high };
}
for (const [a, b] of [[S[1], S[2]], [S[2], S[0]], [S[0], S[1]], [S[1], S[0]]]) {
  let r = ride(a, b);
  ok(!r.out && r.worst < 0.002 && near(r.s.p[1], b, 0.002), `standing in the cabin ${a}->${b}: on its floor all the way (off by ${r.worst.toFixed(4)} m at worst)`);
  r = ride(a, b, { dt: () => 0.005 + Math.random() * 0.045 });
  ok(!r.out && r.worst < 0.002, `standing, uneven frames (5-50 ms) ${a}->${b}`);
  r = ride(a, b, { walk: true, dt: () => 0.008 + Math.random() * 0.03 });
  ok(!r.out && r.worst < 0.002, `walking about in it ${a}->${b}: stays in, on the floor`);
  r = ride(a, b, { walk: true, jump: true });
  ok(!r.out && r.jumps > 3 && r.high < cab.ceil - PLAYER.height + 0.01, `jumping in it ${a}->${b} (${r.jumps} jumps, ${r.high.toFixed(2)} m up at most): never through the floor or the ceiling`);
}
// braked half way (the blackout): still on the floor
{ const T = tripTime(S[1], S[2]) * 1000; const r = ride(S[1], S[2], { tb: T / 2 }); ok(!r.out && r.worst < 0.002 && r.y > S[1] + 0.5 && r.y < S[2] - 0.5, `braked between floors at ${r.y.toFixed(2)}: on the floor`); }
// on the roof (crouching), as far as the cabin goes with someone up there
{
  const maxY = E.top - ELEV.headroom - cab.ceil - cab.roof;
  ok(maxY > S[1] + 0.3 && maxY < S[2], `with someone on the roof it goes no higher than ${maxY.toFixed(2)} (between the ground floor and upstairs)`);
  for (const [a, b] of [[S[1], maxY], [maxY, S[0]], [S[0], S[1]]]) {
    const r = ride(a, b, { roof: true });
    ok(!r.out && r.worst < 0.002, `on the roof ${a.toFixed(2)}->${b.toFixed(2)}: rides it`);
    ok(!overlapsAny(world.move(null, r.s.p, 2), r.s.p[0], r.s.p[1] + 0.001, r.s.p[2], PLAYER.radius, PLAYER.crouchHeight), 'on the roof: room to crouch');
  }
}
// the hatch's spot on the roof: free, standing on it, not on the ladder; the cabin's middle too
for (const y of [S[0], S[1], 2.0]) {
  doorOpen.fill(0); place(y, true);
  const p = roofSpot(E, y), s = body(p);
  ok(!overlapsAny(world.move(null, p, 2), p[0], p[1], p[2], PLAYER.radius, PLAYER.crouchHeight) && !ladderAt(map.ladders.concat(lads), p, PLAYER.crouchHeight), `hatch at ${y}: the roof spot is free and off the ladder`);
  movePlayer(s, 1 / 60, world.move(null, s.p, 2));
  ok(s.onGround && near(s.p[1], roofAt(E, y), 0.002), `hatch at ${y}: you stand on the roof`);
  const c = cabinSpot(E, y);
  ok(!overlapsAny(world.move(null, c, 2), c[0], c[1], c[2], PLAYER.radius, PLAYER.height) && inCabin(E, y, c), `hatch at ${y}: back down into the cabin's middle`);
}
// walking out and in at each stop with the doors open; the closed doors hold. (Every landing's floor is the one you
// see; until the integration's floor fix the living room's was 0.91 to walk on, 10 cm over the cabin's.)
const floorAt = (x, y, z) => { const h = world.raycast([x, y + 0.4, z], [0, -1, 0], 1, 'solid'); return y + 0.4 - h.t; };
for (let st = 0; st < 3; st++) {
  const y = S[st], land = floorAt(mid[0], y, E.out.z2 + 1);
  doorOpen.fill(0); doorOpen[0] = doorOpen[1 + st] = 1; place(y);
  let s = body([mid[0], y, mid[2]]);
  for (let i = 0; i < 120; i++) { s.v[0] = 0; s.v[2] = 2.5; movePlayer(s, 1 / 60, world.move(null, s.p, 2)); }
  ok(s.p[2] > E.out.z2 + 0.5 && Math.abs(s.p[1] - land) < 0.01, `stop ${st}: walked out onto the landing (${s.p.map(v => v.toFixed(2))})`);
  for (let i = 0; i < 120; i++) { s.v[0] = 0; s.v[2] = -2.5; movePlayer(s, 1 / 60, world.move(null, s.p, 2)); }
  ok(inCabin(E, y, s.p), `stop ${st}: and back in`);
  doorOpen.fill(0); place(y);
  s = body([mid[0], y, mid[2]]);
  for (let i = 0; i < 120; i++) { s.v[0] = 0; s.v[2] = 2.5; movePlayer(s, 1 / 60, world.move(null, s.p, 2)); }
  ok(inCabin(E, y, s.p), `stop ${st}: the shut doors hold you in`);
  s = body([mid[0], land, E.out.z2 + 1]);
  for (let i = 0; i < 120; i++) { s.v[0] = 0; s.v[2] = -2.5; movePlayer(s, 1 / 60, world.move(null, s.p, 2)); }
  ok(s.p[2] > E.out.z2, `stop ${st}: the shut landing doors keep you out`);
  // with the cabin elsewhere the landing's own doors hold too
  place(st === 1 ? S[2] : S[1]);
  s = body([mid[0], land, E.out.z2 + 1]);
  for (let i = 0; i < 120; i++) { s.v[0] = 0; s.v[2] = -2.5; movePlayer(s, 1 / 60, world.move(null, s.p, 2)); }
  ok(s.p[2] > E.out.z2 && Math.abs(s.p[1] - land) < 0.01, `stop ${st}: no falling into the empty shaft`);
}
// from the roof (cabin at the ground floor, the upper landing's doors pried open): over to the ladder and up it until
// the doorway is in reach (looking south, E climbs out through it)
{
  doorOpen.fill(0); doorOpen[3] = 1; place(S[1], true);
  const ls = map.ladders.concat(lads), s = body(roofSpot(E, S[1]));
  let reach = null;
  for (let t = 0; t < 6 && !reach; t += 1 / 60) {
    const lad = ladderAt(ls, s.p, PLAYER.height);
    if (lad) { const [px] = ladderPull(lad, s.p); s.v = [px, 3.4, 0]; movePlayer(s, 1 / 60, world.move(null, s.p, 2), 0); }
    else { s.v[0] = -2; s.v[2] = 0; movePlayer(s, 1 / 60, world.move(null, s.p, 2)); }
    const eye = [s.p[0], s.p[1] + PLAYER.eye, s.p[2]];
    if (aimAt(E, S[1], s.p, eye, [0.5, -0.3, 0.81].map(v => v / Math.hypot(0.5, 0.3, 0.81))) === 'l2') reach = s.p.slice();
  }
  ok(!!reach, `up the ladder from the roof until the upper landing's doorway is in reach (at ${reach?.map(v => v.toFixed(2))})`);
}
// the ladders are only where the cabin isn't
for (const y of [S[0], S[1], S[2]]) {
  place(y);
  const inside = [E.ladder.x + 0.3, y, (E.ladder.z1 + E.ladder.z2) / 2];
  ok(!ladderAt(lads, inside, PLAYER.height), `cabin at ${y}: no ladder inside the cabin`);
}
// aiming: the panel's buttons, the hatch, the doors, the call buttons
{
  const y = S[1], eye = [E.panel.x - 0.6, y + 1.62, E.panel.z], feet = [eye[0], y, eye[2]];
  E.panel.ys.forEach((h, s) => {
    const dir = [0.6, y + h - eye[1], 0], l = Math.hypot(...dir);
    ok(aimAt(E, y, feet, eye, dir.map(v => v / l)) === 'b' + s, `aiming at cabin button ${s}`);
  });
  const H = E.hatch, hc = [(H.x1 + H.x2) / 2, y + cab.ceil, (H.z1 + H.z2) / 2], from = [hc[0] - 0.2, y + 1.62, hc[2] + 0.3];
  const up = [hc[0] - from[0], hc[1] - from[1], hc[2] - from[2]], lu = Math.hypot(...up);
  ok(aimAt(E, y, [from[0], y, from[2]], from, up.map(v => v / lu)) === 'h', 'aiming up at the hatch');
  // from the roof, standing (eyes 1.62 m over the hatch) and crouching, at the spot the hatch puts you
  for (const eh of [PLAYER.eye, PLAYER.crouchEye]) {
    const rs = roofSpot(E, y), re = [rs[0], rs[1] + eh, rs[2]], hr = [hc[0], roofAt(E, y), hc[2]];
    const dn = [hr[0] - re[0], hr[1] - re[1], hr[2] - re[2]], ld = Math.hypot(...dn);
    ok(aimAt(E, y, rs, re, dn.map(v => v / ld)) === 'h', `aiming down at the hatch from the roof (eyes ${eh} m up)`);
  }
  ok(aimAt(E, y, [mid[0], y, mid[2]], [mid[0], y + 1.62, mid[2]], [0, 0, 1]) === 'f', 'aiming at the cabin doors');
  for (let s = 0; s < 3; s++) {
    const c = E.call[s], e2 = [c[0] + 0.2, S[s] + 1.62, E.out.z2 + 0.8], dir = [c[0] - e2[0], c[1] - e2[1], c[2] - e2[2]], l = Math.hypot(...dir);
    ok(aimAt(E, 0, [e2[0], S[s], e2[2]], e2, dir.map(v => v / l)) === 'c' + s, `aiming at call button ${s}`);
    const e3 = [-20.565, S[s] + 1.62, E.out.z2 + 0.8];
    ok(aimAt(E, 0, [e3[0], S[s], e3[2]], e3, [0, -0.2, -0.98], false) === 'l' + s, `aiming at landing ${s}'s doors in a blackout`);
  }
  ok(nearestStop(E, 3.5).s === 2 && near(nearestStop(E, 3.5).d, S[2] - 3.5), 'nearest stop');
}

// the doors' light curtain: someone in the doorway holds them; someone waiting outside, or inside near them, doesn't
for (let k = 0; k < 4; k++) {
  const y = k ? S[k - 1] : S[1], b = doorway(E, k, y), x = (E.door.x1 + E.door.x2) / 2;
  ok(touches(b, [x, y, E.cabin.z2 + 0.03]), `doors ${k}: someone on the threshold holds them`);
  ok(!touches(b, [x, y, E.out.z2 + PLAYER.radius + 0.001]) && !touches(b, [x, y, panelZ(E, 0)[0] - PLAYER.radius - 0.001]), `doors ${k}: not someone just outside, or just inside`);
}
console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
