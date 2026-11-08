// Walls & water in the browser (GAME_PORT=4220, CDP_PORT=9620; `sh srv.sh START_MONEY=16000 ROUND_TIME=600
// AUTO_BALANCE=0 [MAP=cs_mansion_night]` and `edge.ps1` first; ~8 minutes). The page is a CT; three scripted Ts (one a
// target, two parked) keep the rounds going. Screenshots in OUT (prefix MAP's), page errors printed.
//   round 1: a. a burst of M4A1 bullets through the hall's plaster wall: holes (rings both sides), seen through from
//   the hall and from the living room, and from the living room with its light off (the lit hall shines through);
//   b. the brick outer wall stops them (no holes, the T behind it unhurt); c. the radiators and sockets; d. a pistol
//   shot bursts the pipe in the hall's south wall: two sprays, the wet patch grows; e. the cable in the same wall cut:
//   its ends spark; the T in the puddle is electrocuted (seen from beside), then the page steps in (the victim's view)
//   and dies, which ends the round;
//   round 2: f. the holes, sprays and puddles are gone; g. a swim in the pool: the gun still fires (wet guns were
//   removed); h. the T shot dead in the pool floats up; i. the floodgate opened, a T on
//   the cellar floor electrocuted by the flood: his body floats up and bobs at the top, seen from the stairs.
import fs from 'node:fs';
import { open, sleep, OUT } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { PLAYER, overlapsAny } from '../../../shared/physics.js';

const MAPID = process.env.MAP || 'cs_mansion', P = MAPID === 'cs_mansion' ? 'wd' : 'wn';
const map = MAPS[MAPID], world = new CollisionWorld(map);
const free = p => !overlapsAny(world.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height);
const KEEP = ['msg', 'kill', 'round', 'dmg', 'waZap', 'lights', 'floodValve', 'floodZap', 'world', 'roundEnd'];
const g = await open('CT', 'Tester', KEEP);
const { tp, ev, look, shot, msgs, errors, keyDown, keyUp } = g;
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await sleep(500);
for (let i = 0; i < 8 && !(await ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await sleep(1500);
}
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const W = async () => JSON.parse(await ev("import('/js/walls.js').then(m => { const d = m.debug(); delete d.list; delete d.hintSpots; return JSON.stringify(d); })"));
const F = async () => JSON.parse(await ev("import('/js/flood.js').then(m => JSON.stringify(m.debug()))"));
const ammo = () => ev("document.getElementById('ammo').textContent");
const waitFor = async (fn, ms, step = 250) => { for (let i = 0; i < ms / step; i++) { if (await fn()) return true; await sleep(step); } return false; };
const EYE = PLAYER.eye;
// stand at `from`, looking at `target`
async function aim(from, target) {
  const e = [from[0], from[1] + EYE, from[2]], dx = target[0] - e[0], dy = target[1] - e[1], dz = target[2] - e[2];
  await tp(from, Math.atan2(-dx, -dz));
  await sleep(250);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (Math.abs(pitch) > 0.002) await look(0, pitch);
  await sleep(350);
}
const fire = async (ms = 700) => { await g.click(0, ms); await sleep(300); };

const t1 = await player('Target', 'T'), t2 = await player('Parked2', 'T'), t3 = await player('Parked3', 'T');
let ph = null;
t3.on.s = m => { ph = m.ph; };
for (const c of [t1, t2, t3]) {
  const push = c.log.push.bind(c.log);
  c.hp = 100;
  c.log.push = m => { if (m.t === 'dmg') c.hp = m.hp; if (m.t === 'spawn') c.hp = 100; return m.t === 's' ? 0 : push(m); };
}
const ids = { t1: t1.log.find(m => m.t === 'welcome').id, t2: t2.log.find(m => m.t === 'welcome').id };
const park = () => { t2.at([-37.5, 0, 3.5]); t3.at([-37.5, 0, 5.5]); };
async function freshRound() {
  await waitFor(() => ph === 'live' || ph === 'freeze', 30000);
  await waitFor(async () => (await msgs(false)).some(m => m.t === 'round'), 15000);
  await sleep(300);
  park();
  t1.at([-37.5, 0, 1.5]);
  // buy an M4A1 on the street (where the CTs buy) and take it out
  await tp([26.5, 0, 0], Math.PI / 2);
  await sleep(400);
  await g.send({ t: 'buy', item: 'm4a1' });
  await sleep(800);
  await g.key('Digit1');
  await waitFor(() => ph === 'live', 15000);
  await sleep(500);
}
console.log('waiting for a live round on', MAPID);
await freshRound();

// ---- a. holes through the hall's plaster wall into the living room
check((await W()).holes === 0, 'a. a fresh round: no holes');
const HALL = [-10, 0.813, -2.5], WALL_X = -12.9, EYEY = 0.813 + EYE;
// the brightness (0..255) of the few pixels in the middle of the picture, read right after the next frame is drawn
const probe = () => ev(`new Promise(res => { const raf = window.requestAnimationFrame; window.requestAnimationFrame = cb => raf(t => { cb(t); window.requestAnimationFrame = raf;
  const c = document.querySelector('#game canvas'), gl = c.getContext('webgl2'), n = 3, px = new Uint8Array(4 * n * n);
  // (integration 2026-11-08: the brightest of five 3x3 spots, the middle and 12 px each way, all inside a hole at
  // these distances: with lamps lighting only their own rooms the middle alone often fell on a dark door or a night
  // window behind the hole)
  let best = 0;
  for (const [dx, dy] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) {
    gl.readPixels((c.width >> 1) - 1 + dx, (c.height >> 1) - 1 + dy, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = 0; for (let i = 0; i < n * n; i++) s += px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2];
    best = Math.max(best, Math.round(s / (n * n * 3)));
  }
  res(best); }); })`);
const cutOn = on => ev(`import('/js/walls.js').then(m => (m.debugCut(${on}), 1))`);
// looking at a hole's middle from where you stand: the picture there with the holes cut out, and with none cut
async function throughHole(label) {
  await sleep(1200);
  const on = await probe(); await cutOn(false); await sleep(600);
  const off = await probe(); await cutOn(true); await sleep(300);
  console.log(`   ${label}: the hole's middle ${on} cut out, ${off} not cut`);
  return { on, off };
}
// a burst at eye height, straight at the wall (so you can look back through the holes standing on either side)
await aim(HALL, [WALL_X, EYEY, -2.5]);
for (let i = 0; i < 7; i++) { await fire(650); await aim(HALL, [WALL_X, EYEY + (i % 3 - 1) * 0.03, -2.5 + ((i % 2) - 0.5) * 0.05]); }
let w = await W();
check(w.holes >= 4 && w.rings === w.holes * 2, `a. bullets through the plaster wall leave holes, a ring on each side (${w.holes} holes, ${w.rings} rings)`);
const holeList = JSON.parse(await ev("import('/js/walls.js').then(m => JSON.stringify(m.debug().list))"));
const big = holeList.sort((p, q) => q.r - p.r)[0], dir = [0, 1, 2].map(k => big.b[k] - big.a[k]), len = Math.hypot(...dir);
const entry = [0, 1, 2].map(k => big.a[k] + (dir[k] / len) * 0.04), exit = [0, 1, 2].map(k => big.b[k] - (dir[k] / len) * 0.04);
console.log(`   the biggest hole: r ${big.r.toFixed(3)} from (${entry.map(v => v.toFixed(2))}) to (${exit.map(v => v.toFixed(2))})`);
await aim([-12.2, 0.813, entry[2]], entry);
let pr = await throughHole('from the hall, 0.7 m off');
await shot(`${P}_a1_holes_hall.png`);
check(Math.abs(pr.on - pr.off) > 12, `a. from the hall you see through the hole (its middle ${pr.on} with it cut out, ${pr.off} without)`);
await aim([-14.3, 0.813, exit[2]], exit);
pr = await throughHole('from the living room, 1 m off');
await shot(`${P}_a2_holes_living.png`);
check(Math.abs(pr.on - pr.off) > 12, `a. and from the living room (${pr.on} / ${pr.off})`);
// the living room dark, the hall lit: the hall's light through the holes
// (every lamp on the map off but the hall's: the lamps' light goes through walls and floors, so with the kitchen's or
// the cellar's on the living room's walls stay lit; only in this browser, for the picture)
const lightsOn = on => ev(`import('/shared/maps/index.js').then(({ MAPS }) => { const m = MAPS['${MAPID}'], L = {};
  for (const g of new Set([...(m.rooms || []).map(r => r.group), ...(m.switches || []).map(s => s.group)])) L[g] = ${on} || g === 'lampa5';
  L.power = true; __onmsg({ data: JSON.stringify({ t: 'lights', lights: L }) }); return 1; })`);
await lightsOn(false);
pr = await throughHole('the living room dark');
await shot(`${P}_a3_holes_dark_living.png`);
// (the wall beside the hole, in the dark room)
await aim([-14.3, 0.813, exit[2]], [exit[0], exit[1], exit[2] + 0.22]);
await sleep(1200);
const beside = await probe();
console.log(`   the living room's wall beside the hole: ${beside}`);
check(beside < 60 && pr.on > pr.off + 12, `a. with the living room dark (its wall ${beside}) you still see through the hole straight on (${pr.on} / ${pr.off}: the hall's front door, dark wood, is behind it)`);
// at an angle (from 0.9 m to the side): still see-through (the hole is wider inside the wall), onto the hall's lit wall
await aim([-14.3, 0.813, exit[2] + 0.45], exit);
pr = await throughHole('the living room dark, at an angle');
await shot(`${P}_a4_holes_dark_angle.png`);
check(pr.on > pr.off + 8 && pr.on > beside + 40, `a. at a 24° angle too, and the lit hall shines through it into the dark room (the hole ${pr.on}, the dark wall beside it ${beside}, the hole not cut ${pr.off})`);
await lightsOn(true);
await aim([-18.5, 0.813, -2.5], [-13.31, EYEY, -2.5]);
await sleep(1500);
await shot(`${P}_a5_holes_far.png`);
// a few more lower down, at an angle, for the screenshots of a shot-up wall
await aim(HALL, [WALL_X, 1.6, -2.3]);
for (let i = 0; i < 4; i++) { await fire(650); await aim(HALL, [WALL_X, 1.6 + i * 0.05, -2.3 + i * 0.04]); }
await aim([-12.2, 0.813, -2.4], [WALL_X, 1.9, -2.4]);
await sleep(1500);
await shot(`${P}_a6_holes_close.png`);
if (process.env.ONLY === 'a') await finish(); // (ONLY=a: just the holes)

// ---- b. the brick outer wall (the T outside, behind it)
const holesB = (await W()).holes;
t1.at([-25.0, 0, -4.5]);
await aim([-22.4, 0.813, -4.5], [-25.0, 1.3, -4.5]);
const hpB = t1.hp;
await fire(1500);
await sleep(500);
w = await W();
await shot(`${P}_b_brick.png`);
check(w.holes === holesB && t1.hp === hpB, `b. the brick wall stops the bullets: no new holes (${w.holes - holesB}), the T behind it unhurt (hp ${t1.hp})`);
t1.at([-37.5, 0, 1.5]);

// ---- c. the radiators and sockets
await aim([-7.5, 0.813, 4.6], [-7.5, 1.0, 6.5]);
await sleep(1500);
await shot(`${P}_c1_radiator_hall.png`);
const kitchen = [[-14.6, 0.813, -10.75], [-15.0, 0.813, -10.75], [-15.0, 0.813, -11.2]].find(free);
await aim(kitchen, [-13.31, 1.1, -10.75]);
await sleep(1500);
await shot(`${P}_c2_radiator_kitchen.png`);
const nOut = [[-15.6, 0.813, 8.0], [-15.2, 0.813, 8.0]].find(free);
await aim(nOut, [-16.15, 1.1, 7.95]);
await sleep(1500);
await shot(`${P}_c3_radiator_south.png`);
await aim([-9.0, 4.267, -8.6], [-9.2, 4.6, -9.75]);
await sleep(1500);
await shot(`${P}_c4_radiator_upstairs.png`);
check((await W()).hints > 1000, `c. the hints on the walls are drawn (${(await W()).hints} vertices; see the screenshots)`);

// ---- d. the pipe in the hall's south wall
await g.key('Digit2'); // (the pistol: one shot a click)
await sleep(600);
await aim([-7.8, 0.813, 4.8], [-7.8, 1.66, 6.70]); // (the pipe: in the middle of the wall)
await fire(500);
await waitFor(async () => (await W()).sprays >= 2, 4000);
w = await W();
check(w.sprays === 2 && w.patches === 2, `d. the pipe bursts: ${w.sprays} sprays, ${w.patches} wet patches`);
const r0 = Math.max(...w.patchList.map(p => p.r));
await aim([-9.6, 0.813, 3.6], [-7.8, 1.2, 6.4]);
await sleep(2000);
await shot(`${P}_d1_spray.png`);
const sprayAt = Date.now();
await waitFor(async () => Date.now() - sprayAt > 9000, 12000);
w = await W();
const r1 = Math.max(...w.patchList.map(p => p.r));
await shot(`${P}_d2_puddle.png`);
check(r1 > r0 + 0.3 && w.wetMesh && w.sprayMesh, `d. the puddle grows (r ${r0.toFixed(2)} → ${r1.toFixed(2)} in ~10 s), sprays and puddle drawn`);

// ---- e. the cable: sparks; the T in the puddle; then the page in it
await aim([-7.65, 0.813, 4.1], [-7.65, 1.11, 6.70]); // (from outside the puddle)
await fire(500);
await waitFor(async () => (await W()).ends >= 2, 4000);
check((await W()).ends === 2, 'e. the cable is cut: two live ends');
await msgs(true);
await aim([-9.8, 0.813, 4.4], [-7.65, 1.05, 6.5]);
await sleep(2500);
await shot(`${P}_e1_sparks.png`);
t1.at([-8.3, 0.813, 5.85]);
await aim([-10.6, 0.813, 4.4], [-8.3, 1.2, 5.85]);
const zapped = await waitFor(async () => (await msgs(false)).some(m => m.t === 'waZap'), 8000, 150);
await shot(`${P}_e2_zap_seen.png`);
await waitFor(async () => (await msgs(false)).some(m => m.t === 'kill' && m.v === ids.t1), 8000);
const k1 = (await msgs(false)).find(m => m.t === 'kill' && m.v === ids.t1);
check(zapped && k1?.w === 'electrocuted', `e. the T in the puddle is electrocuted (kill ${k1?.w}, by ${k1?.k === null ? 'nobody' : k1?.k})`);
await msgs(true);
await tp([-8.4, 0.813, 5.6], Math.PI);
await sleep(200);
const hit = await waitFor(async () => (await msgs(false)).some(m => m.t === 'dmg'), 8000, 150);
const flash = await ev("[...document.querySelectorAll('div')].some(d => (d.style.background || '').includes('60, 140, 255') && d.style.opacity === '1')");
await shot(`${P}_e3_zap_victim.png`);
const dm = (await msgs(false)).filter(m => m.t === 'dmg');
check(hit && dm[0]?.d === 35 && flash, `e. the page steps into the puddle: shocked (${dm.map(m => m.d).join(', ')} damage), the screen flashes blue (${flash})`);

// ---- f. the next round
await msgs(true);
await waitFor(async () => (await msgs(false)).some(m => m.t === 'round'), 25000);
await sleep(1500);
w = await W();
check(w.holes === 0 && w.rings === 0 && w.patches === 0 && w.sprays === 0 && w.ends === 0, `f. a new round: no holes, puddles, sprays or live ends (${w.holes}/${w.patches}/${w.sprays}/${w.ends})`);
await freshRound();
await aim([-12.3, 0.813, -2.5], [WALL_X, 1.72, -2.5]);
await sleep(1500);
await shot(`${P}_f_wall_whole.png`);

// ---- g. wet guns were removed (2026-11-09): after a swim the gun fires as usual, and nothing says WET or JAMMED
await tp([-40, -2.0, -12], 0);
await sleep(2000);
await tp([-34.8, 0, -12], -Math.PI / 2);
await sleep(800);
await look(0, -0.6);
const magBefore = await ammo();
for (let i = 0; i < 3; i++) await fire(900);
const magWet = await ammo(), hudText = await ev("document.getElementById('bottom-right')?.textContent || ''");
check(magWet !== magBefore && !/WET|JAMMED/.test(hudText), `g. after a swim the gun fires as usual (ammo ${magBefore} → ${magWet}), no WET or JAMMED on the HUD`);

// ---- h. a body floating in the pool
t1.at([-40, -2.0, -12]);
await aim([-34.8, 0, -12], [-40, -1.0, -12]);
await msgs(true);
for (let i = 0; i < 8; i++) {
  if ((await msgs(false)).some(m => m.t === 'kill' && m.v === ids.t1)) break;
  await fire(900);
  if (/^0/.test(await ammo())) { await g.key('KeyR'); await sleep(4000); }
}
// (down, not dead, he drowns in a few seconds: a downed player's breath runs out fast)
const kPool = await waitFor(async () => (await msgs(false)).some(m => m.t === 'kill' && m.v === ids.t1), 25000, 500);
await sleep(4000);
w = await W();
const fp = w.floating.find(f => f.id === ids.t1);
await aim([-35.2, 0, -12], [-40, -0.4, -12]);
await sleep(1500);
await shot(`${P}_h_float_pool.png`);
check(kPool && fp && fp.y > -0.55 && fp.y < -0.25, `h. the T shot in the pool floats up (${fp ? fp.y.toFixed(2) : 'not floating'}; the surface at -0.25)`);

// ---- i. the flooded cellar: the floodgate opened, a T on the cellar floor electrocuted, his body floats
const VALVE = [23.8, -5.0, -1.75];
await tp(VALVE, 0);
await sleep(500);
await keyDown('KeyE'); await sleep(3600); await keyUp('KeyE'); await sleep(500);
check((await msgs(false)).some(m => m.t === 'floodValve' && m.open), 'i. the floodgate is open');
const cellar = [[-14.6, -2.2, -4.4], [-14.5, -2.2, -4.0], [-15.0, -2.2, -4.6]].find(free); // (at the foot of the stairs)
t2.at(cellar);
await aim([-14.4, 0.011, -8.3], [cellar[0], -0.6, cellar[2]]); // (the stairwell's top step: dry)
const zap = await waitFor(async () => (await msgs(false)).some(m => m.t === 'floodZap'), 45000, 500);
const k2 = (await msgs(false)).find(m => m.t === 'kill' && m.v === ids.t2);
check(zap && !!k2, `i. the water reaches the fuse box: the T in the cellar is killed (${k2?.w})`);
await waitFor(async () => (await F()).level > -0.6, 20000, 500);
await g.key('KeyF'); // (the fuse blew: the flashlight)
await sleep(5000);
w = await W();
const fc = w.floating.find(f => f.id === ids.t2);
await shot(`${P}_i_float_cellar.png`);
check(fc && fc.y > -0.75 && fc.y < -0.45, `i. his body floats at the top of the flooded cellar (${fc ? fc.y.toFixed(2) : 'not floating'}; the water at ${(await F()).level.toFixed(2)})`);
await g.key('KeyF');
await finish();

async function finish() {
  console.log('page errors:', errors.length ? errors.join('\n') : 'none');
  check(!errors.length, 'no page errors');
  for (const c of [t1, t2, t3]) c.close();
  const failed = checks.filter(c => !c).length;
  console.log(`\n${checks.length - failed} passed, ${failed} failed; screenshots in ${OUT}`);
  fs.writeFileSync(`${OUT}/${P}_result.txt`, `${checks.length - failed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
