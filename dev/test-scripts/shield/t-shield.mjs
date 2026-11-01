// Human shield, server side (GAME_PORT test server, START_MONEY=16000, BOTS=0; MAP=cs_mansion or cs_assault).
// A Terrorist and two CTs, round 1: the T buys an AK and an HE, a CT leads a hostage and the T grabs it from him
// (E), walks with it (it stays in front of him), can't fire the AK or the knife or throw the HE but fires his pistol.
// A CT in front hits the hostage (and is told so), one at the side hits the T, one at an angle with lag compensation
// (rt) while the T walks hits the hostage; a CT can't lead it; E lets it go, the CT leads it again; the T grabs it
// again and dies from a head shot from the front: it's let go. The positions are picked from the map's collision boxes.
import { player, sleep } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { overlapsAny, PLAYER } from '../../../shared/physics.js';
import { SHIELD } from '../../../shared/shield.js';

const MAPID = process.env.MAP || 'cs_mansion';
const M = MAPS[MAPID], world = new CollisionWorld(M);
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const fits = p => !overlapsAny(world.move(null, p, 2), p[0], p[1] + 0.05, p[2], PLAYER.radius, PLAYER.height - 0.05);
const sees = (a, b) => { const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d); const h = world.raycast(a, d.map(v => v / l), l, 'bullet'); return !h || h.t >= l - 0.05; };
const fwd = yaw => [-Math.sin(yaw), 0, -Math.cos(yaw)];
const add = (p, d, k) => p.map((v, i) => v + d[i] * k);
const f2 = a => a.map(v => v.toFixed(2)).join(',');

// A hostage with room around it: the T stands 1 m behind it facing it, with a free line ahead, and shooters at the
// front, the side and 20 degrees off can see his chest (also 0.4 m further on) and the hostage's.
let plan = null;
for (const [hi, h] of M.hostages.entries()) {
  for (let a = 0; a < 16 && !plan; a++) {
    const yaw = (a * Math.PI) / 8, f = fwd(yaw), T = add(h.p, f, -1);
    if (!fits(T) || !fits(add(T, f, 2.4))) continue;
    const chest = [T[0], T[1] + 1.3, T[2]];
    const at = (deg, dist) => { const y = yaw + (deg * Math.PI) / 180; return add(T, fwd(y), dist); };
    const pick = deg => [4.5, 4, 3.5, 3].map(d => at(deg, d)).find(p => fits(p) && sees([p[0], p[1] + 1.62, p[2]], chest) && sees([p[0], p[1] + 1.62, p[2]], add(chest, f, 0.4)) && Math.abs(p[1] - T[1]) < 0.01);
    const front = pick(0), side = pick(90) || pick(-90), angle = pick(20) || pick(-20);
    if (front && side && angle) plan = { hi, yaw, T, front, side, angle };
  }
  if (plan) break;
}
if (!plan) { console.log('FAIL no hostage with room for the test on ' + MAPID); process.exit(1); }
console.log(`${MAPID}: hostage ${plan.hi}, T at ${f2(plan.T)} yaw ${plan.yaw.toFixed(2)}, CTs front ${f2(plan.front)} side ${f2(plan.side)} angle ${f2(plan.angle)}`);

const t = await player('Taker', 'T'), ct = await player('Front', 'CT'), ct2 = await player('Side', 'CT');
const tId = t.log.find(m => m.t === 'welcome')?.id;
let hs = [], sh = null, snapTime = 0;
const traces = [];
t.on.shot = m => traces.push(m);
t.on.s = m => { if (m.hs) hs = m.hs; sh = m.sh || null; snapTime = m.time; };
hs = [...t.log].reverse().find(m => m.t === 's' && m.hs)?.hs || []; // (the hostages come only when they change)
const H = () => hs.find(x => x[0] === plan.hi);
const hpos = () => H().slice(1, 4);
const shots = [];
ct.on.shot = m => shots.push(m);
const nades = [];
ct.on.nade = m => nades.push(m);

// round 1 (after the warmup and the freeze time)
for (let i = 0; i < 200 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
await sleep(3300);
t.clear(); ct.clear(); ct2.clear();

// the T buys in the house (on cs_mansion the hostage room is in the T buy zone; elsewhere he buys at his spawn)
const spawnT = t.p.slice();
t.at(spawnT, 0); await sleep(150);
t.send({ t: 'buy', item: 'ak47' }); await sleep(150); t.send({ t: 'buy', item: 'he' }); await sleep(250);
ok('the T bought an AK and an HE', t.me?.inv?.primary?.id === 'ak47' && t.me?.inv?.he === 1);
const pistol = t.me?.inv?.secondary?.id;

// a CT leads the hostage, then the T grabs it from him
const h0 = M.hostages[plan.hi].p;
// (the CT stays within 2.2 m, so the hostage stands still while following him)
ct.at(add(h0, fwd(plan.yaw), 1.4), plan.yaw + Math.PI); await sleep(200);
ct.use(); await sleep(150); ct.use(false); await sleep(300);
ok('the CT leads the hostage (state follow)', H()?.[5] === 1);
t.w = 'ak47';
t.at(plan.T, plan.yaw); await sleep(300);
t.clear(); ct.clear();
t.use(); await sleep(100); t.use(false); await sleep(250);
const grab = t.got('shieldGrab')[0];
ok('E on the hostage: shieldGrab to everyone ' + JSON.stringify(grab), !!grab && grab.id === tId && grab.h === plan.hi && ct.got('shieldGrab').length === 1 && ct2.got('shieldGrab').length === 1);
ok('the snapshot says who holds it: sh ' + JSON.stringify(sh), JSON.stringify(sh) === JSON.stringify([[plan.hi, tId]]));
ok('it no longer follows the CT (idle, no leader)', H()?.[5] === 0 && H()?.[6] === 0);
ok('the CT is told: ' + (ct.got('msg').map(m => m.text).find(x => /grabbed/.test(x)) || '-'), ct.got('msg').some(m => /grabbed the hostage you were leading/.test(m.text)));
const exp = add(plan.T, fwd(plan.yaw), SHIELD.ahead);
ok(`held ${SHIELD.ahead} m in front of him: ${f2(hpos())} (expected ${f2(exp)})`, Math.hypot(hpos()[0] - exp[0], hpos()[2] - exp[2]) < 0.05 && Math.abs(hpos()[1] - exp[1]) < 0.05);
ok('the hostage faces his way: yaw ' + H()[4], Math.abs(Math.sin(H()[4] - plan.yaw)) < 0.02 && Math.cos(H()[4] - plan.yaw) > 0);

// walk 1.2 m forward: it stays in front
const walkTo = add(plan.T, fwd(plan.yaw), 1.2);
for (let i = 1; i <= 12; i++) { t.at(add(plan.T, fwd(plan.yaw), 0.1 * i), plan.yaw); await sleep(60); }
await sleep(150);
const exp2 = add(walkTo, fwd(plan.yaw), SHIELD.ahead);
ok(`walked 1.2 m: the hostage went along: ${f2(hpos())} (expected ${f2(exp2)})`, Math.hypot(hpos()[0] - exp2[0], hpos()[2] - exp2[2]) < 0.05);
for (let i = 11; i >= 0; i--) { t.at(add(plan.T, fwd(plan.yaw), 0.1 * i), plan.yaw); await sleep(40); }
await sleep(200);

// only the pistol
const up = [0, 1, 0], teye = [plan.T[0], plan.T[1] + PLAYER.eye, plan.T[2]];
shots.length = 0;
t.send({ t: 'shoot', o: teye, d: up, w: 'ak47' }); await sleep(250);
ok('the AK fires nothing while he holds it', shots.length === 0);
t.send({ t: 'shoot', o: teye, d: up, w: 'knife' }); await sleep(250);
ok('nor the knife', shots.length === 0);
t.send({ t: 'nade', k: 'he', o: teye, v: [0, 5, 0] }); await sleep(250);
ok('nor the HE grenade', nades.length === 0);
t.w = pistol;
t.send({ t: 'shoot', o: teye, d: up, w: pistol }); await sleep(250);
ok(`his pistol (${pistol}) fires`, shots.length === 1 && shots[0].w === pistol);

// shots at the T's chest
const shoot = async (c, from, at, rt) => {
  const o = [from[0], from[1] + PLAYER.eye, from[2]], d = at.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.w = 'usp';
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w: c.me?.inv?.secondary?.id || 'usp', rt });
  await sleep(350);
};
const tHp = () => t.me?.hp;
let hurt = [];
t.on.sfx = m => { if (m.s === 'hurt') hurt.push(m.p); };
const tDmg = () => t.got('dmg').length;
const chestOf = p => [p[0], p[1] + 1.3, p[2]];

ct.at(plan.front, plan.yaw + Math.PI); await sleep(300);
ct.clear(); hurt = []; traces.length = 0; let d0 = tDmg();
await shoot(ct, plan.front, chestOf(plan.T));
const atHostage = () => hurt.filter(p => Math.hypot(p[0] - hpos()[0], p[2] - hpos()[2]) < 0.05).length;
ok('from the front, a shot at his chest hits the hostage: hurt at ' + (hurt.map(f2).join(' ') || '-'), hurt.length === 1 && atHostage() === 1 && tDmg() === d0);
ok('and the CT is told: ' + (ct.got('msg').map(m => m.text).join(' | ') || '-'), ct.got('msg').some(m => /You hit the hostage/.test(m.text)));
const tr = traces[0]?.tr?.[0], toT = Math.hypot(plan.front[0] - plan.T[0], plan.front[2] - plan.T[2]);
ok(`the shot's trace ends on the hostage with blood (${tr?.[3]} m; the T is ${toT.toFixed(2)} m away)`, !!tr && tr[4] === 1 && tr[3] < toT - SHIELD.ahead + 0.35 && tr[3] > toT - SHIELD.ahead - 0.45);

ct2.at(plan.side, plan.yaw); await sleep(300);
hurt = []; d0 = tDmg(); const hp0 = tHp();
await shoot(ct2, plan.side, chestOf(plan.T));
ok(`from the side the T is hit (hp ${hp0} -> ${t.got('dmg').slice(-1)[0]?.hp}), not the hostage`, tDmg() === d0 + 1 && atHostage() === 0);
ct2.at(plan.angle, plan.yaw); await sleep(200);

// a CT can't lead it
ct.at(add(hpos(), fwd(plan.yaw), 1.0), plan.yaw + Math.PI); await sleep(250);
ct.clear();
ct.use(); await sleep(100); ct.use(false); await sleep(250);
ok('a CT pressing E on it is told no: ' + (ct.got('msg').map(m => m.text).join(' | ') || '-'), ct.got('msg').some(m => /can't lead it/.test(m.text)));
ok('it stays with the T (held, idle)', H()?.[5] === 0 && JSON.stringify(sh) === JSON.stringify([[plan.hi, tId]]));
ct.at(plan.front, plan.yaw + Math.PI); await sleep(200);

// lag compensation: the T walks; a CT 20 degrees off aims at where he was at a snapshot time (rt): the hostage,
// rewound with him, is hit
const path = i => add(plan.T, fwd(plan.yaw), 0.1 * i);
let seenAt = null, seenT = null;
hurt = []; d0 = tDmg();
for (let i = 1; i <= 12; i++) {
  t.at(path(i), plan.yaw); await sleep(60);
  if (i === 4) { await sleep(40); seenAt = snapTime; seenT = path(4); }
}
await shoot(ct2, plan.angle, chestOf(seenT), seenAt);
ok(`20 degrees off, lag-compensated (rt ${seenAt}): the hostage is hit, not the T (hurt ${hurt.map(f2).join(' ') || '-'})`, hurt.length === 1 && tDmg() === d0);
for (let i = 11; i >= 0; i--) { t.at(path(i), plan.yaw); await sleep(40); }
await sleep(200);

// E lets it go; a CT leads it again
t.clear(); ct.clear();
t.use(); await sleep(100); t.use(false); await sleep(400);
ok('E again lets it go: shieldDrop ' + JSON.stringify(t.got('shieldDrop')[0]), t.got('shieldDrop')[0]?.why === 'let go' && sh === null);
const rel = hpos();
await sleep(600);
ok(`it stays where it was let go (${f2(rel)} -> ${f2(hpos())})`, Math.hypot(rel[0] - hpos()[0], rel[2] - hpos()[2]) < 0.1 && Math.abs(rel[1] - hpos()[1]) < 0.3);
ct.at(add(hpos(), fwd(plan.yaw), 1.0), plan.yaw + Math.PI); await sleep(250);
ct.use(); await sleep(100); ct.use(false); await sleep(300);
ok('a CT leads it again', H()?.[5] === 1);
ct.at(plan.front, plan.yaw + Math.PI); await sleep(100);

// grab again, then a head shot from the front (his head shows past the hostage's) kills him: it's let go
t.at(add(hpos(), fwd(plan.yaw), -1), plan.yaw); plan.T = add(hpos(), fwd(plan.yaw), -1); await sleep(250);
t.clear();
t.use(); await sleep(100); t.use(false); await sleep(300);
ok('grabbed again (from the CT leading it)', t.got('shieldGrab').length === 1 && sh?.[0]?.[1] === tId);
ct.at(plan.front, plan.yaw + Math.PI); await sleep(300);
const right = [Math.cos(plan.yaw), 0, -Math.sin(plan.yaw)];
const head = add([plan.T[0], plan.T[1] + 1.62, plan.T[2]], right, 0.1);
hurt = []; t.clear();
await shoot(ct, plan.front, head);
await sleep(200);
ok('a head shot from the front at the side of his head that shows kills him', t.me?.alive === false || t.got('dmg').some(m => m.hp <= 0));
const drop = t.got('shieldDrop')[0];
ok('dying lets the hostage go: ' + JSON.stringify(drop), drop?.why === 'died' && sh === null);
ok('the hostage is unhurt by that shot', atHostage() === 0);
ok('the hostage is a waiting hostage again (idle)', H()?.[5] === 0);

t.close(); ct.close(); ct2.close();
process.exit();
