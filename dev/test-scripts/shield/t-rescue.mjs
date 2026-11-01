// Human shield: a hostage that was held and let go can still be rescued (GAME_PORT test server, BOTS=0; MAP=cs_mansion
// or cs_assault). Round 1: a T grabs a hostage, walks a metre with it and lets it go (E); a CT takes it along (E) and
// walks the bots' path (lib/nav.js, standing) to the rescue zone, opening doors on the way and waiting for the hostage
// when it falls behind; the hostage is rescued (+$1000 for him, the 'rescue' sound).
import { player, sleep } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { overlapsAny, movePlayer, PLAYER } from '../../../shared/physics.js';
import { doorCenter } from '../../../shared/doors.js';
import { buildNav, smoothPath } from '../../../lib/nav.js';

const MAPID = process.env.MAP || 'cs_mansion';
const M = MAPS[MAPID], world = new CollisionWorld(M);
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const fits = p => !overlapsAny(world.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height - 0.05);
const fwd = yaw => [-Math.sin(yaw), 0, -Math.cos(yaw)];
const add = (p, d, k) => p.map((v, i) => v + d[i] * k);
const f2 = a => a.map(v => v.toFixed(2)).join(',');
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

const nav = buildNav(M, world);
const R = M.zones.rescue, goal = [(R.min[0] + R.max[0]) / 2, 0, (R.min[1] + R.max[1]) / 2];
// the hostage (and a way for the T to face it) with a standing path out
// (hostages don't climb ladders: on cs_mansion the shortest way runs through the storm drain or the smugglers' tunnel,
// so the walk goes by a point outside, in front of the house, when the direct one has a ladder)
// (nor drop down a floor: the nav has some false "drop through the floor" links, see RESUME.md)
const leg = (a, b) => {
  const from = nav.nodeAt(a), to = nav.nodeAt(b, 6), n = from >= 0 && to >= 0 ? nav.path(from, to, true) : null;
  const pts = n ? smoothPath(nav, n, world) : null;
  // (the walk follows the grid's nodes, not the smoothed corners: the hostage walks the same line behind)
  return pts && !pts.some((w, i) => w.ladder || (i && Math.abs(w.p[1] - pts[i - 1].p[1]) > 1)) ? n.map(k => ({ p: nav.pos(k) })) : null;
};
const ground = M.spawns.CT[0].p[1];
// (on cs_mansion: out of the south door, which is wide; the hostage sticks at narrower doorways' corners, as it does
// without the shield)
// (and round the south side of the plaza: the grid passes too close to the fountain's low walls for a body)
const VIAS = process.env.VIAS ? [JSON.parse(process.env.VIAS)] : MAPID.startsWith('cs_mansion') ? [[[-14.6, 0.3, 13.4], [-3, 0, 19.5], [10, 0, 19.5]]] : [[], [[0, ground, 0]]];
let plan = null;
for (const [hi, h] of M.hostages.entries()) {
  let pts = null;
  for (const vias of VIAS) {
    const stops = [h.p, ...vias, [goal[0], ground, goal[2]]], legs = [];
    for (let i = 1; i < stops.length && legs.length === i - 1; i++) { const l = leg(stops[i - 1], stops[i]); if (l) legs.push(l); }
    if (legs.length === stops.length - 1) { pts = legs.flat(); break; }
  }
  if (!pts) continue;
  for (let a = 0; a < 8 && !plan; a++) {
    const yaw = (a * Math.PI) / 4, T = add(h.p, fwd(yaw), -1);
    if (fits(T) && fits(add(T, fwd(yaw), 1.4))) plan = { hi, yaw, T, pts };
  }
  if (plan) break;
}
if (!plan) { console.log('FAIL no hostage with a path out on ' + MAPID); process.exit(1); }
console.log(`${MAPID}: hostage ${plan.hi}, path of ${plan.pts.length} points to ${f2(plan.pts[plan.pts.length - 1].p)}${plan.pts.some(w => w.ladder) ? ' (with a ladder!)' : ''}`);

const t = await player('Taker', 'T'), ct = await player('Rescuer', 'CT');
let hs = [], sh = null, doors = ct.log.find(m => m.t === 'welcome')?.doors || [];
ct.on.s = m => { if (m.hs) hs = m.hs; sh = m.sh || null; };
hs = [...ct.log].reverse().find(m => m.t === 's' && m.hs)?.hs || []; // (the hostages come only when they change)
ct.on.doors = m => { doors = m.doors; };
ct.on.world = m => { if (m.doors) doors = m.doors; }; // (a new round closes them all)
let rescued = false;
ct.on.sfx = m => { if (m.s === 'rescue') rescued = true; };
const H = () => hs.find(x => x[0] === plan.hi);
const hpos = () => H().slice(1, 4);

for (let i = 0; i < 200 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
await sleep(3300);

// the T grabs it, walks 1 m and lets it go (NOSHIELD=1: not, to compare)
if (!process.env.NOSHIELD) {
  t.at(plan.T, plan.yaw); await sleep(300);
  t.use(); await sleep(100); t.use(false); await sleep(250);
  ok('the T holds the hostage', sh?.[0]?.[0] === plan.hi);
  for (let i = 1; i <= 10; i++) { t.at(add(plan.T, fwd(plan.yaw), 0.1 * i), plan.yaw); await sleep(60); }
  await sleep(150);
  t.use(); await sleep(100); t.use(false); await sleep(500);
  ok('and lets it go at ' + f2(hpos()), sh === null && H()[5] === 0);
  const tAt = add(plan.T, fwd(plan.yaw), 1.0);
  t.at(add(tAt, fwd(plan.yaw), -0.8), plan.yaw); // (a step back, out of the way)
}
if (process.env.TRACE) setInterval(() => console.log('  ct', f2(ct.p), 'hostage', f2(hpos()), 'state', H()[5]), 500).unref();

// the CT first opens the doors on the way (E near a hostage would tell it to wait instead), then takes it along and
// walks it out
const money0 = ct.me.money, opened = new Set();
for (const [i, d] of (M.doors || []).entries()) {
  const c = doorCenter(d), w = plan.pts.find(x => d2(x.p, c) < 1.2 && Math.abs(x.p[1] + 1 - c[1]) < 1.6);
  if (!w || doors[i]) continue;
  ct.at(w.p, 0); await sleep(200);
  ct.use(); await sleep(100); ct.use(false); await sleep(1900);
  opened.add(i);
}
const start = add(hpos(), fwd(plan.yaw), -0.9);
ct.at(fits(start) ? start : hpos().slice(), plan.yaw); await sleep(250);
ct.use(); await sleep(100); ct.use(false); await sleep(300);
ok('the CT leads it (follow)', H()[5] === 1);
// (the CT walks with the game's physics, as a player would, so the trail the hostage follows is one a body fits along)
world.setDoors(doors);
const body = { p: ct.p.slice(), v: [0, 0, 0], onGround: true, crouch: false };
let waits = 0;
for (const w of plan.pts) {
  for (let n = 0; d2(body.p, w.p) > 0.3 && !rescued && n < 60; n++) {
    // the hostage fell behind: wait for it
    if (d2(body.p, hpos()) > 4 && waits < 400) { waits++; n--; await sleep(50); continue; }
    const dx = w.p[0] - body.p[0], dz = w.p[2] - body.p[2], l = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < 3; s++) { body.v[0] = (dx / l) * 4; body.v[2] = (dz / l) * 4; movePlayer(body, 1 / 60, world.move(null, body.p, 3)); }
    ct.at(body.p.slice(), Math.atan2(-dx, -dz));
    await sleep(50);
    if (H()[5] !== 1) break;
  }
  if (H()[5] !== 1 || rescued) break;
}
for (let i = 0; i < 60 && !rescued; i++) await sleep(100);
console.log(`  (doors opened: ${[...opened].join(',') || 'none'}; waited ${waits * 50} ms for the hostage; it ended at ${f2(hpos())}, state ${H()[5]})`);
ok('the hostage that was a shield is rescued', rescued && H()[5] === 2);
await sleep(300);
ok('everyone is told: ' + (ct.got('msg').map(m => m.text).find(x => /rescued/.test(x)) || '-'), ct.got('msg').some(m => /Rescuer rescued a hostage/.test(m.text)));
if (money0 < 15000) ok(`the CT got the rescue money ($${money0} -> $${ct.me.money})`, ct.me.money >= money0 + 1000);
t.close(); ct.close();
process.exit();
