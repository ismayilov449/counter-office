// The links between the ROADMAP wave-1 groups merged on 2026-11-08 (wounds, power, stealth, underground, walls), server
// side (Mansion). Test server on GAME_PORT with
//   MAP=cs_mansion BOTS=0 START_MONEY=16000 ROUND_TIME=600 FREEZE_TIME=1 AUTO_BALANCE=0 POWER_SURGE=0
// Two Terrorists (Tango, Toby) and three CTs (Charlie, Cathy, Chris), scripted; each part is a fresh round (admin
// restart). PARTS=a,c to run some.
//   a. walls x power: a cut cable in the hall's south wall (ground floor) sparks while its circuit is live: the upper
//      floor's breaker leaves it live, the ground floor's kills it, back on it's live again (lib/walls.js powerAt ->
//      circuits.poweredAt)
//   b. walls x stealth: the chimney is brick (shared/materials.js): an AK through the breast doesn't reach a T behind it
//      (the same shot through the plaster wall beside it does)
//   c. walls x stealth: a CT in the garage car's trunk: bullets from all round the car (and through a wall onto it)
//      never reach him
//   d. wounds x stealth: dragging a downed teammate, the dragger gets into the car's trunk: the drag ends; and the
//      snapshot keys of the wave-1 groups (wd, st, wa) each appear once, with the older ones
//   e. E's order: in the trunk with a downed teammate right behind the car, E gets out of the trunk (no revive)
//   f. wounds x underground: the interrogation gives away the nearest standing teammate who is NOT underground; with
//      all of them underground, nobody (and he's told why)
//   g. wounds: the revive started by standing still after a drag survives the dragged man's browser still saying where
//      its smoothing had got to (0.7 m behind) for a moment (the intermittent miss of the wounds browser test)
//   h. power x body: 'crushed' is one of shared/body.js's outright deaths (no downed state)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, sleep, until, ok, summary, ground } from '../wounds/lib.mjs';
import { admin } from '../mansion/client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { CollisionWorld } = await G('shared/collision.js');
const { PLAYER, overlapsAny } = await G('shared/physics.js');
const { penetrate, runHit } = await G('shared/walls.js');
const { wallRuns } = await G('shared/maps/mansion_walls.js');
const { boxMaterial } = await G('shared/materials.js');
const { trunkPos } = await G('shared/stealth.js');
const { carForward } = await G('shared/vehicles.js');
const { BODY } = await G('shared/body.js');
const MAP_ID = process.env.MAP || 'cs_mansion';
const MAP = MAPS[MAP_ID], world = new CollisionWorld(MAP), runs = wallRuns(MAP);
const want = k => !process.env.PARTS || process.env.PARTS.split(',').includes(k);
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
const EYE = PLAYER.eye;
// free floor for a body (the level only: the cars are not in it), a clear line for a bullet
const fits = p => !overlapsAny(world.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height - 0.05);
const clearLine = (a, b) => { const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d); const h = world.raycast(a, d.map(v => v / l), l, 'bullet'); return !h || h.t >= l - 0.2; };

// (joined in turns: no team balance needed with AUTO_BALANCE=0, but the match starts once both teams have someone)
const T1 = await player('Tango', 'T'), C1 = await player('Charlie', 'CT'), T2 = await player('Toby', 'T'), C2 = await player('Cathy', 'CT');
const C3 = await player('Chris', 'CT');
const all = [T1, T2, C1, C2, C3];
T1.w = T2.w = 'glock'; C1.w = C2.w = C3.w = 'usp';
// the snapshot's slow parts (cars) come only when they change; the raw snapshot text (for the keys); power messages
const slow = {};
let raw = '';
for (const c of all) {
  c.ws.addEventListener('message', e => {
    const s = typeof e.data === 'string' ? e.data : e.data.toString();
    if (!s.startsWith('{"t":"s"')) return;
    if (c === C1) raw = s;
    const m = JSON.parse(s);
    if (m.cars) slow.cars = m.cars;
  });
  c.on.power = m => { c.pw = m; };
}
const car = id => { const r = slow.cars?.find(k => k[0] === id); return r && { id, p: [r[1], r[2], r[3]], yaw: r[4] }; };
// (a new round puts the cars home; the snapshot only says so when something changed)
const home = id => { const v = MAP.vehicles[id]; return { id, p: [v.p[0], ground(v.p[0], v.p[1], v.y ?? 10), v.p[1]], yaw: v.yaw }; };
const wa = () => C1.snap?.wa || null;
const press = async (c, hold = 150, aim) => { if (aim !== undefined) { c.send({ t: 'pwAim', a: aim }); await sleep(80); } c.use(true); await sleep(hold); c.use(false); await sleep(150); };
const away = { T1: [-33, 0, -6], T2: [-30, 0, 5], C1: [-39, 0, 3], C2: [-39, 0, -3], C3: [-40, 0, -6] }; // the back lawn
const park = () => { T1.at(away.T1, 0); T2.at(away.T2, 0); C1.at(away.C1, 0); C2.at(away.C2, 0); C3.at(away.C3, 0); };
const chest = c => [c.p[0], c.p[1] + 1.2, c.p[2]];
const downs = (c) => C1.got('bodyDown').some(m => m.v === c.id) || C2.got('bodyDown').some(m => m.v === c.id) || C3.got('bodyDown').some(m => m.v === c.id) || T1.got('bodyDown').some(m => m.v === c.id);
const dropBy = async (shooter, c) => { for (let i = 0; i < 14 && !downs(c); i++) { shooter.shootAt(chest(c)); await sleep(380); } return downs(c); };
let rounds = 0;
const nextRound = async label => {
  for (const c of all) { c.clear(); c.crouch = 0; c.w = c === T1 || c === T2 ? 'glock' : 'usp'; }
  const r0 = T1.got('round').length;
  await admin({ action: 'restart' });
  ok(`${label}: a fresh round`, await until(() => T1.got('round').length > r0, 15000));
  park();
  for (const c of [C1, C2, C3]) c.send({ t: 'reload', w: 'usp' });
  for (const c of [T1, T2]) c.send({ t: 'reload', w: 'glock' });
  await sleep(1700); // freeze time 1 s
  rounds++;
};
console.log('(waiting for the first round)');
ok('round starts', await until(() => T1.got('round').length > 0, 40000));
await sleep(500);

// ---------------------------------------------------------------- a. walls x power
if (want('a')) {
  await nextRound('a');
  const PANEL = [-16.95, -2.2, -4.6];
  // the cable E2 in the hall's south wall, shot from the south-east room (walls' t2.mjs layout)
  const r = runs.find(x => x.name === 'E2'), dir = norm([r.b[0] - r.a[0], 0, r.b[2] - r.a[2]]);
  const target = [r.a[0] + dir[0] * 3.6, r.a[1], r.a[2] + dir[2] * 3.6], from = [-7.8, 0.813, 8.6];
  const o = [from[0], from[1] + EYE, from[2]], d = norm(target.map((v, i) => v - o[i]));
  const pen = penetrate(MAP, world, o, d, 250, 'usp'), h = pen.passes.length ? runHit(runs, pen.passes[0]) : null;
  ok(`a: the shared trace cuts the cable E2 (${h?.run.name})`, h?.run.name === 'E2');
  C1.w = 'usp'; C1.at(from, yawTo(from, target)); await sleep(250);
  C1.send({ t: 'shoot', o, d, w: 'usp', rt: C1.snap?.time ?? 0 });
  const cut = await until(() => wa()?.[2]?.length > 0, 2000);
  ok(`a: a cut cable's ends in the snapshot (wa ends ${JSON.stringify(wa()?.[2])})`, cut);
  const live = () => (wa()?.[2] || []).map(e => e[5]);
  ok(`a: live with the power on (${live()})`, live().length && live().every(v => v === 1));
  T1.at(PANEL, 0); await sleep(300);
  await press(T1, 1300, 'b0');
  await until(() => C1.pw?.b?.[0] === 0, 2000);
  await sleep(300);
  ok(`a: the upper floor's breaker off: the ground floor's cable still live (b ${C1.pw?.b}; ${live()})`, C1.pw?.b?.[0] === 0 && live().every(v => v === 1));
  await press(T1, 1300, 'b1');
  await until(() => C1.pw?.b?.[1] === 0, 2000);
  ok(`a: the ground floor's breaker off: the cable is dead (b ${C1.pw?.b}; ${live()})`, await until(() => live().length && live().every(v => v === 0), 2000));
  C2.at(PANEL, 0); await sleep(300);
  await press(C2, 1300, 'b1');
  await until(() => C1.pw?.b?.[1] === 1, 2000);
  ok(`a: a CT switches it back on: live again (b ${C1.pw?.b}; ${live()})`, await until(() => live().length && live().every(v => v === 1), 2000));
}

// ---------------------------------------------------------------- b. walls x stealth: the chimney is brick
if (want('b')) {
  await nextRound('b');
  // (the CTs' own USP: a pistol goes through one wall of plaster)
  const shotThrough = async (x, label, expectHit) => {
    const sp = [x, 0.813, 3.0], tp = [x, 0.813, 6.6];
    const o = [sp[0], sp[1] + EYE, sp[2]], to = [tp[0], tp[1] + 1.2, tp[2]], d = norm(to.map((v, i) => v - o[i]));
    const pen = penetrate(MAP, world, o, d, 250, 'usp');
    T1.at(tp, 0); C1.w = 'usp'; C1.at(sp, yawTo(sp, tp)); await sleep(400);
    const hp0 = T1.hp ?? 100;
    C1.clear(); T1.clear();
    for (let i = 0; i < 3; i++) { C1.send({ t: 'shoot', o, d, w: 'usp', rt: C1.snap?.time ?? 0 }); await sleep(250); }
    await sleep(300);
    const hurt = T1.got('dmg').length > 0;
    ok(`b: ${label}: the trace ${pen.passes.length ? `goes through ${pen.passes.map(p => p.mat).join('+')}` : `stops at ${pen.wall ? boxMaterial(MAP, pen.wall.box) : 'nothing'}`}, the T ${hurt ? `hurt (${hp0} → ${T1.hp})` : 'unhurt'}`, expectHit ? hurt : !hurt && !pen.passes.length && boxMaterial(MAP, pen.wall?.box) === 'brick');
  };
  await shotThrough(-19.8, 'through the chimney breast (its west wall)', false);
  await shotThrough(-19.0, 'through the breast over the firebox and the back of the flue', false);
  await shotThrough(-17.5, 'control: the plaster wall east of the chimney', true);
}

// ---------------------------------------------------------------- c. walls x stealth: nothing reaches a trunk hider
let garage = null;
if (want('c') || want('d') || want('e')) {
  garage = home(1);
}
const atCar = (along, side) => { const f = carForward(garage.yaw), right = [-f[2], 0, f[0]]; return [garage.p[0] + f[0] * along + right[0] * side, garage.p[1], garage.p[2] + f[2] * along + right[2] * side]; };
const hidden = () => C1.snap?.st?.k || [];
if (want('c')) {
  await nextRound('c');
  garage = home(1);
  ok(`c: the garage car (${garage && garage.p.map(v => v.toFixed(2))})`, !!garage);
  C3.at(atCar(-1.85, -1.3), 0); await sleep(300);
  await press(C3);
  ok(`c: Chris is in its trunk (st.k ${JSON.stringify(hidden())})`, await until(() => hidden().some(k => k[0] === C3.id), 1500));
  const tp = trunkPos(garage), aim = [tp[0], tp[1] + 0.45, tp[2]];
  // round the trunk at 3.5 and 6 m (never inside the car: 3 m or more from its middle), standing and crouched; the
  // Terrorists' Glock (through one wall of plaster), reloaded as it runs low
  // (bullets wear the car down: 400 hp, ~24 a Glock shot, and blown up it kills the hider as designed: so 12 shots)
  const spots = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (const rr of [3.5, 6]) {
      const x = tp[0] + Math.sin(a) * rr, z = tp[2] + Math.cos(a) * rr, y = ground(x, z, garage.p[1] + 1.5);
      if (Math.abs(y - garage.p[1]) > 1 || Math.hypot(x - garage.p[0], z - garage.p[2]) < 3) continue;
      spots.push([x, y, z]);
    }
  }
  const pick = [];
  for (let i = 0; i < spots.length && pick.length < 12; i += Math.max(1, Math.floor(spots.length / 12))) pick.push(spots[i]);
  let shots = 0, throughWall = 0, mag = 20;
  const hp0 = C3.hp ?? 100;
  C3.clear();
  T1.w = 'glock';
  for (const sp of pick) {
    for (const crouch of [pick.indexOf(sp) % 3 === 0 ? 1 : 0]) {
      if (mag <= 1) { T1.send({ t: 'reload', w: 'glock' }); await sleep(2600); mag = 20; }
      const o = [sp[0], sp[1] + (crouch ? 1.0 : EYE), sp[2]], d = norm(aim.map((v, i) => v - o[i]));
      const pen = penetrate(MAP, world, o, d, 250, 'glock');
      if (pen.passes.length) throughWall++;
      T1.at(sp, yawTo(sp, aim), crouch); await sleep(60);
      T1.send({ t: 'shoot', o, d, w: 'glock', rt: T1.snap?.time ?? 0 });
      shots++; mag--;
      await sleep(160);
    }
  }
  T1.crouch = 0;
  await sleep(400);
  const hpCar = slow.cars?.find(k => k[0] === 1)?.[8];
  ok(`c: ${shots} Glock shots at the hider from round the car (${throughWall} through a wall first; the car's hp now ${hpCar}): never hurt (hp ${hp0} → ${C3.hp ?? 100}, ${C3.got('dmg').length} hits)`, shots >= 10 && !C3.got('dmg').length);
  ok('c: still hidden', hidden().some(k => k[0] === C3.id));
  await press(C3); // out
}

// ---------------------------------------------------------------- d. wounds x stealth: into the trunk ends a drag; the keys
if (want('d')) {
  await nextRound('d');
  garage = home(1);
  // (for the keys: the fire lit (st), a pipe burst (wa); then a drag (wd))
  const hf = [-19.3, 0.813, 3.83];
  T1.at(hf, Math.PI); await sleep(300);
  await press(T1, 2300);
  ok(`d: the fireplace lit (st.f ${C1.snap?.st?.f})`, await until(() => C1.snap?.st?.f === 1, 1500));
  {
    const r = runs.find(x => x.name === 'W2'), dir = norm([r.b[0] - r.a[0], 0, r.b[2] - r.a[2]]);
    const target = [r.a[0] + dir[0] * 3.6, r.a[1], r.a[2] + dir[2] * 3.6], from = [-7.8, 0.813, 8.6];
    const o = [from[0], from[1] + EYE, from[2]], d = norm(target.map((v, i) => v - o[i]));
    C1.at(from, yawTo(from, target)); await sleep(250);
    C1.send({ t: 'shoot', o, d, w: 'usp', rt: C1.snap?.time ?? 0 });
    ok('d: a pipe burst (wa)', await until(() => wa()?.[1]?.length > 0, 2000));
    C1.at(away.C1, 0);
  }
  // Cathy down beside the car (towards its front), Toby shoots her from further along its side; Chris, nearer its back
  // end, takes hold (E held + walking: she's behind him) and pulls her along to the trunk
  const downAt = atCar(1.2, -1.35), dragFrom = atCar(0.4, -1.35);
  const shooter = [atCar(3.6, -1.35), atCar(3.6, -2.2), atCar(2.6, -2.6), atCar(1.2, -3.2)].find(s => fits(s) && clearLine([s[0], s[1] + EYE, s[2]], [downAt[0], downAt[1] + 1.2, downAt[2]]));
  ok(`d: free floor beside the car (${[downAt, dragFrom].map(s => fits(s)).join(', ')}), a spot for Toby (${shooter && shooter.map(v => v.toFixed(2))})`, fits(downAt) && fits(dragFrom) && !!shooter);
  C2.at(downAt, 0); T2.at(shooter, yawTo(shooter, downAt)); await sleep(400);
  ok('d: Cathy down by the car', await dropBy(T2, C2));
  T2.at(away.T2, 0);
  await sleep(300);
  C3.at(dragFrom, yawTo(downAt, dragFrom)); await sleep(300);
  C3.use(true); await sleep(200);
  C3.send({ t: 'wdDrag', on: 1 }); await sleep(300);
  ok(`d: Chris drags her (wd.d ${JSON.stringify(C1.snap?.wd?.d)})`, await until(() => C1.snap?.wd?.d?.some(e => e[0] === C3.id && e[1] === C2.id), 1500));
  const goal = atCar(-1.85, -1.3);
  for (let i = 1; i <= 16; i++) { const f = i / 16; C3.at([dragFrom[0] + (goal[0] - dragFrom[0]) * f, goal[1], dragFrom[2] + (goal[2] - dragFrom[2]) * f], yawTo(dragFrom, goal)); await sleep(150); }
  await sleep(300);
  // the keys, while all three are on
  const keys = ['wd', 'st', 'wa', 'bd', 'bl', 'gs', 'fl', 'sh', 'cat', 'dg', 'el'];
  const count = k => (raw.match(new RegExp(`"${k}":`, 'g')) || []).length;
  const counts = keys.map(k => `${k}${count(k)}`).join(' ');
  ok(`d: wd, st and wa all in one snapshot, once each; no older key twice (${counts})`, ['wd', 'st', 'wa'].every(k => count(k) === 1) && keys.every(k => count(k) <= 1));
  // E again (the other use button: E is still held) by the back of the car, facing away from her (in front of him a
  // downed teammate's revive comes first in E's order): into the trunk
  const her = C1.posOf(C2.id) || downAt;
  C3.at(goal, yawTo(her, goal)); await sleep(250);
  C3.use(true); await sleep(250);
  ok(`d: Chris climbs into the trunk (st.k ${JSON.stringify(hidden())})`, await until(() => hidden().some(k => k[0] === C3.id), 1500));
  ok(`d: ... and the drag is over (wd.d ${JSON.stringify(C1.snap?.wd?.d || [])}); Cathy still down (bd ${JSON.stringify(C1.snap?.bd)})`, await until(() => !(C1.snap?.wd?.d || []).some(e => e[0] === C3.id), 1500) && !!C1.snap?.bd?.d?.some(r => r[0] === C2.id));
  C3.use(false);

  // ---------------------------------------------------------------- e. E's order: out of the trunk beats a revive
  if (want('e')) {
    await sleep(300);
    const her = C1.posOf(C2.id), tp = trunkPos(garage), dist = her ? Math.hypot(her[0] - tp[0], her[2] - tp[2]) : NaN;
    C3.clear();
    C3.use(true); await sleep(250); C3.use(false); await sleep(300);
    ok(`e: in the trunk with downed Cathy beside the car (${dist.toFixed(2)} m from where he lies; a revive reaches 1.6 m), E gets him out (stTo ${C3.got('stTo').length}) and starts no revive (act ${C3.snap?.me?.a ?? 'none'})`, C3.got('stTo').length === 1 && !hidden().some(k => k[0] === C3.id) && C3.snap?.me?.a !== 'bodyRevive');
  }
}

// ---------------------------------------------------------------- f. wounds x underground: the interrogation
if (want('f')) {
  await nextRound('f');
  const down = [-18, 0.813, 1], cellar = [-15.5, -2.2, 0.5], above = [-15, 0.813, -3];
  C1.at(down, 0); C2.at(cellar, 0); C3.at(above, Math.PI);
  T2.at([-18, 0.813, -2.5], Math.PI); await sleep(500);
  ok('f: Charlie down in the living room (Toby)', await dropBy(T2, C1));
  T2.at(away.T2, 0);
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  T1.at([down[0], down[1], down[2] - 0.8], Math.PI); await sleep(300); // 0.8 m north of him, facing him (yaw pi looks +z)
  for (const c of all) c.clear();
  T1.use(true);
  ok(`f: Tango interrogates him (act ${T1.snap?.me?.a})`, await until(() => T1.snap?.me?.a === 'wdAsk', 1000));
  ok('f: he talks after 3 s', await until(() => T1.got('wdReveal').length > 0 || T1.got('msg').some(m => /left to give away|underground/.test(m.text)), 4000));
  const rv = T1.got('wdReveal')[0];
  ok(`f: Cathy in the cellar is nearer (${d3(cellar, down).toFixed(1)} m against ${d3(above, down).toFixed(1)} m) but underground: he gives away Chris (${rv?.id === C3.id ? 'Chris' : rv?.id === C2.id ? 'Cathy' : rv?.id})`, rv?.id === C3.id);
  T1.use(false);
  // a new round: both standing CTs underground
  await nextRound('f2');
  C1.at(down, 0); C2.at(cellar, 0); C3.at([-15.5, -2.2, -2.5], 0);
  T2.at([-18, 0.813, -2.5], Math.PI); await sleep(500);
  ok('f2: Charlie down again', await dropBy(T2, C1));
  T2.at(away.T2, 0);
  T1.at([down[0], down[1], down[2] - 0.8], Math.PI); await sleep(300);
  for (const c of all) c.clear();
  T1.use(true);
  await until(() => T1.got('wdReveal').length > 0 || T1.got('msg').some(m => /underground/.test(m.text)), 4500);
  const said = T1.got('msg').find(m => /underground/.test(m.text))?.text;
  ok(`f2: both his teammates underground: nobody shows, and he's told why ("${said}")`, !T1.got('wdReveal').length && !!said);
  T1.use(false);
}

// ---------------------------------------------------------------- g. the revive right after a drag
if (want('g')) {
  await nextRound('g');
  const A = [-33, 0, -3];
  C1.at(A, 0); C2.at([-33, 0, -4.4], Math.PI); T2.at([-30, 0, 5], Math.PI); await sleep(500);
  ok('g: Charlie down (Toby)', await dropBy(T2, C1));
  T2.at(away.T2, 0);
  // Cathy drags him 2.4 m north
  C2.use(true); await sleep(150);
  C2.send({ t: 'wdDrag', on: 1 });
  ok('g: Cathy drags him', await until(() => C1.snap?.wd?.d?.some(e => e[0] === C2.id), 1500));
  const s0 = C2.p.slice();
  for (let i = 1; i <= 12; i++) { C2.at([s0[0], s0[1], s0[2] - i * 0.2], Math.PI); await sleep(160); }
  await sleep(500);
  const at = C1.posOf(C1.id) || C1.p.slice(); // where the server has him
  // she stands still (the browser says so 0.35 s later): the revive goes on; his browser still says he's 0.7 m back
  const stale = [at[0], at[1], at[2] + 0.7];
  C2.send({ t: 'wdDrag', on: 0 });
  const t0 = Date.now();
  await until(() => !C1.snap?.wd?.d?.length, 600);
  C1.p = stale; // (lib.mjs's timer keeps sending c.p: the stale spot, as a smoothing browser would for a moment)
  await sleep(500);
  C1.p = at.slice(); // then where the server put him
  const up = await until(() => C1.got('bodyUp').length > 0 || C2.got('bodyUp').length > 0, 7000);
  ok(`g: the revive went on and got him up (${up ? ((Date.now() - t0) / 1000).toFixed(1) + ' s' : 'not up'}), lying where the drag left him (server ${at.map(v => v.toFixed(2))})`, up);
  C2.use(false);
}

// ---------------------------------------------------------------- h. power x body
if (want('h')) {
  const powerSrc = fs.readFileSync(path.join(repo, 'lib/power.js'), 'utf8');
  ok(`h: 'crushed' is in shared/body.js's outright deaths (${JSON.stringify(BODY.outright)}), lib/power.js no longer adds it`, BODY.outright.includes('crushed') && BODY.outright.includes('electrocuted') && !/outright\.push/.test(powerSrc));
}

summary();
for (const c of all) c.close?.();
process.exit(process.exitCode || 0);
