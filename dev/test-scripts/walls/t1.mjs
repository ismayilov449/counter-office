// Walls & water, server side, 2.1: bullets through walls (GAME_PORT=4220; run `sh srv.sh START_MONEY=16000
// ROUND_TIME=600` first; ~1 minute). Two scripted players, a CT shooting and a T standing behind walls:
//   a. a USP through the plaster wall between the hall and the living room: the damage the shared code predicts
//      (the wall keeps ~54 %), and the shooter is told he hit;
//   b. the same through the brick outer wall: nothing;
//   c. an M4A1 through two walls (a line the test finds in the map): hit, less again; a Glock (one wall) on the same
//      line: nothing;
//   d. a weak door shot through: the man behind it is hit, and the door gives way after enough bullets;
//   e. on de_dust2 (no materials) a wall stops a bullet as before.
import { player, sleep, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { penetrate } from '../../../shared/walls.js';
import { PLAYER, rayPlayer, overlapsAny } from '../../../shared/physics.js';
import { WEAPONS } from '../../../shared/weapons.js';
import { doorCenter } from '../../../shared/doors.js';

const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const waitFor = async (fn, ms, step = 100) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return false; };

let map = MAPS.cs_mansion, world = new CollisionWorld(map);
const free = p => !overlapsAny(world.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height);
const eye = p => [p[0], p[1] + PLAYER.eye, p[2]];
// what the server should deal: the shared trace, the body part the ray hits, range falloff, the walls' share
function expect(from, to, w) {
  const o = eye(from), aim = [to[0], to[1] + 1.25, to[2]], d = norm([aim[0] - o[0], aim[1] - o[1], aim[2] - o[2]]);
  const r = penetrate(map, world, o, d, 250, w);
  const hit = rayPlayer(o, d, to, 0, r.wallT, 1);
  if (!hit) return { o, d, r, dmg: 0 };
  const def = WEAPONS[w], mult = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 }[hit.part] ?? 1;
  const before = r.passes.filter(p => p.t1 <= hit.t); // (the walls between: not the ones beyond the target)
  return { o, d, r: { ...r, passes: before }, hit, dmg: Math.max(1, Math.round(def.damage * Math.pow(def.rangeMod, hit.t / 12.7) * r.keep(hit.t) * mult)) };
}

const CT = await player('Shooter', 'CT'), T = await player('Target', 'T');
let ph = null;
CT.on.s = m => { ph = m.ph; };
for (const c of [CT, T]) {
  const push = c.log.push.bind(c.log);
  c.hp = 100;
  c.log.push = m => { if (m.t === 'dmg') c.hp = m.hp; if (m.t === 'spawn') c.hp = 100; return m.t === 's' ? 0 : push(m); };
}
const shoot = (c, o, d, w) => c.send({ t: 'shoot', o, d, w });
// one shot at T from `from` (T stands at `to`), after both are in place; T's damage
async function shotAt(from, to, w, label) {
  T.at(to); CT.w = w; CT.at(from);
  await sleep(250);
  const e = expect(from, to, w), hp0 = T.hp, hits0 = CT.got('hit').length;
  shoot(CT, e.o, e.d, w);
  await sleep(400);
  const dealt = hp0 - T.hp, told = CT.got('hit').length > hits0;
  console.log(`  ${label}: ${w} ${e.r.passes.map(p => p.mat + ' ' + p.keep.toFixed(2)).join(', ') || 'no wall'}, part ${e.hit?.part}, expected ${e.dmg}, dealt ${dealt}${told ? ' (hit marker)' : ''}`);
  return { e, dealt, told };
}
async function respawnT() { // a fresh round when the target is hurt too much
  if (T.hp > 60) return;
  await admin({ action: 'restart' });
  await sleep(600);
  await waitFor(() => ph === 'live', 8000);
  await sleep(300);
}

console.log('waiting for a live round...');
await waitFor(() => ph === 'live', 30000);
await sleep(300);
console.log('teams:', CT.me?.team, T.me?.team);
// buy: the CT an M4A1 (on the street, where CTs buy), the T nothing (a Glock)
CT.at([26.5, 0, 0]);
await sleep(200);
CT.send({ t: 'buy', item: 'm4a1' });
await sleep(300);
check(CT.me?.inv?.primary?.id === 'm4a1', 'the CT bought an M4A1');

// ---- a. USP through the hall's wall into the living room
const A_FROM = [-10, 0.813, 1.0], A_TO = [-15.5, 0.813, 1.0]; // (clear of the hostage in the living room)
let s = await shotAt(A_FROM, A_TO, 'usp', 'a');
check(s.e.r.passes.length === 1 && s.dealt > 0 && Math.abs(s.dealt - s.e.dmg) <= 1 && s.told, `a. a USP through the plaster wall: ${s.dealt} damage (expected ${s.e.dmg}, the wall kept ${s.e.r.passes[0]?.keep.toFixed(2)}), hit marker`);
const full = Math.round(WEAPONS.usp.damage * Math.pow(WEAPONS.usp.rangeMod, (s.e.hit?.t || 5) / 12.7));
check(s.dealt < full * 0.65, `   less than without the wall (${full})`);

// ---- b. through the brick outer wall: the T inside by the west wall, the CT outside in the back
await respawnT();
let B_FROM = null, B_TO = null;
for (let z = -4.5; z < 4.5 && !B_FROM; z += 0.25) {
  const f = [-25.0, 0, z], t = [-22.4, 0.813, z], e = expect(f, t, 'm4a1');
  if (free(f) && free(t) && e.r.wall && e.r.wallT < 2.2 && !e.r.passes.length && e.r.wall.box.brk != null) { B_FROM = f; B_TO = t; }
}
check(!!B_FROM, `b. a spot by the west outer wall (z ${B_FROM?.[2]})`);
s = await shotAt(B_FROM, B_TO, 'm4a1', 'b');
check(s.dealt === 0 && !s.told && s.e.r.passes.length === 0, `b. nothing through the brick outer wall (dealt ${s.dealt})`);

// ---- c. two walls: a line found in the map, a CT and a T standing free at both ends
let line = null;
for (let i = 0; i < 40000 && !line; i++) {
  const a = [-22 + Math.random() * 15, 0.813, -13.5 + Math.random() * 24], b = [-22 + Math.random() * 15, 0.813, -13.5 + Math.random() * 24];
  const dist = Math.hypot(a[0] - b[0], a[2] - b[2]);
  if (dist < 5 || dist > 12 || !free(a) || !free(b)) continue;
  if (map.hostages.some(h => Math.hypot(h.p[0] - b[0], h.p[2] - b[2]) < 2.5 || Math.hypot(h.p[0] - a[0], h.p[2] - a[2]) < 2.5)) continue;
  const e = expect(a, b, 'm4a1');
  if (e.hit && e.r.passes.length === 2 && e.dmg >= 5 && !expect(a, b, 'usp').hit) line = { a, b };
}
check(!!line, `c. found a two-wall line (${line && line.a.map(v => v.toFixed(1))} → ${line && line.b.map(v => v.toFixed(1))})`);
if (line) {
  await respawnT();
  s = await shotAt(line.a, line.b, 'm4a1', 'c');
  check(s.dealt > 0 && Math.abs(s.dealt - s.e.dmg) <= 1, `c. an M4A1 through two walls: ${s.dealt} damage (expected ${s.e.dmg}; walls kept ${s.e.r.passes.map(p => p.keep.toFixed(2)).join(' then ')})`);
  s = await shotAt(line.a, line.b, 'usp', 'c2');
  check(s.dealt === 0, `c. a USP on the same line stops in the second wall (dealt ${s.dealt})`);
}

// ---- d. a weak door: shoot through it at the man behind it until it gives way
const di = map.doors.findIndex(d => d.weak && !d.hatch && !d.roller);
check(di >= 0, `d. a weak door (#${di})`);
if (di >= 0) {
  await respawnT();
  const dr = map.doors[di], c = doorCenter(dr), n = dr.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
  const floorY = dr.hinge[1];
  const side = k => [c[0] + n[0] * k, floorY, c[2] + n[2] * k];
  const from = free(side(-2.5)) ? side(-2.5) : side(-1.8), to = free(side(1.5)) ? side(1.5) : side(1.0);
  const hp0 = T.hp;
  let doorsMsg = null;
  CT.on.doors = m => { if (m.i === di || (m.doors && m.doors[di] !== undefined)) doorsMsg = m; };
  const brk0 = CT.got('doors').length;
  s = await shotAt(from, to, 'usp', 'd');
  check(s.e.r.passes[0]?.mat === 'wood' && s.dealt > 0, `d. through the door (wood, kept ${s.e.r.passes[0]?.keep.toFixed(2)}): ${s.dealt} damage`);
  T.at([to[0] + 8, to[1], to[2]]); // (out of the way while the door is shot down)
  let shots = 1;
  for (; shots < 20; shots++) {
    if (CT.got('doors').length > brk0) break;
    const e = expect(from, to, 'usp');
    shoot(CT, e.o, e.d, 'usp');
    await sleep(220);
    if (CT.me?.inv?.secondary?.mag === 0) { CT.send({ t: 'reload', w: 'usp' }); await sleep(2900); }
  }
  check(CT.got('doors').length > brk0, `d. the door gave way after ${shots} shots through it`);
  void hp0;
}

// ---- e. de_dust2: walls stop bullets as before
await admin({ action: 'map', map: 'de_dust2' });
map = MAPS.de_dust2; world = new CollisionWorld(map);
await sleep(1500);
await waitFor(() => ph === 'live' || ph === 'warmup', 15000);
await sleep(800);
let pair = null;
for (const sp of [...map.spawns.T, ...map.spawns.CT]) {
  for (let i = 0; i < 200 && !pair; i++) {
    const a = sp.p.slice(), ang = Math.random() * Math.PI * 2, d = [Math.cos(ang), 0, Math.sin(ang)];
    const h = world.raycast(eye(a), d, 3, 'bullet');
    if (!h || h.t < 0.6) continue;
    for (let k = 0.15; k < 1.5 && !pair; k += 0.1) {
      const q = [a[0] + d[0] * (h.t + k), a[1], a[2] + d[2] * (h.t + k)];
      if (!free(q)) continue;
      const fl = world.raycast([q[0], q[1] + 0.5, q[2]], [0, -1, 0], 1.2, 'solid');
      if (!fl) break;
      q[1] = q[1] + 0.5 - fl.t;
      const e = expect(a, q, 'usp');
      if (!e.hit && e.r.wall && free(q)) pair = { a, b: q };
      break;
    }
  }
  if (pair) break;
}
check(!!pair, 'e. a spot on de_dust2 with a wall between two players');
if (pair) {
  const hp0 = T.hp;
  T.at(pair.b); CT.w = 'usp'; CT.at(pair.a);
  await sleep(300);
  const e = expect(pair.a, pair.b, 'usp');
  shoot(CT, e.o, e.d, 'usp');
  await sleep(300);
  check(T.hp === hp0, `e. de_dust2: the wall stops the bullet (hp ${hp0} → ${T.hp})`);
}

await admin({ action: 'map', map: 'cs_mansion' });
await sleep(500);
CT.close(); T.close();
const failed = checks.filter(c => !c).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
