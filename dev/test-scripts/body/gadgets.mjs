// "Downed, not dead" + "Play dead" with the Mansion's gadgets, server side (cs_mansion, GAME_PORT test server with
// BOTS=0 START_MONEY=16000, e.g. `srv.sh MAP=cs_mansion BOTS=0 START_MONEY=16000 MAP_ROTATION=0`). Three Terrorists
// and three CTs, scripted. Each part starts a fresh round (admin restart).
//  1 a CT on the zip line is shot down over the street: he comes off the cable (zipEnd 'letgo' before bodyDown, no
//    longer hanging in the snapshot) and falls; the landing hurts, which finishes him (the kill to the shooter).
//    A CT sitting at the CCTV desk is downed there: he gets up from the desk first ('hurt'), back where he stood.
//    Downed, E at the desk and at the zip line does nothing. A CT at the desk with a downed teammate at his feet: E
//    gets him up from the desk (no revive).
//  2 a T at the desk plays dead: up from the desk first ('left'), the corpse where he stood, the CTs get the kill; E
//    does nothing. A CT on the zip line over the neighbour's roof plays dead: off the cable, his weapons stay with him
//    until he lands (a short drop: no damage), then fall where he lies; the server then keeps the corpse there.
//  3 a CT on the zip line over the street plays dead: the fall hurts, which gets him up (nothing dropped).
import { player, sleep, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { fallDamage } from '../../../shared/gadgets.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };
const MAP = MAPS[process.env.MAP || 'cs_mansion'], Z = MAP.zip, world = new CollisionWorld(MAP);
const T1 = await player('T1', 'T'), C1 = await player('C1', 'CT'), T2 = await player('T2', 'T'), C2 = await player('C2', 'CT');
const T3 = await player('T3', 'T'), C3 = await player('C3', 'CT');
const all = [T1, T2, T3, C1, C2, C3];
const ids = {};
for (const [k, c] of Object.entries({ T1, T2, T3, C1, C2, C3 })) { ids[k] = c.log.find(m => m.t === 'welcome')?.id; c.name = k; }
for (const c of all) {
  c.on.s = m => { c.snap = m; if ('dr' in m) c.dr = m.dr; };
  c.on.dmg = m => { c.hp = m.hp; };
  c.on.me = m => { c.hp = m.hp; c.inv = m.inv; };
}
const row = (c, pid) => c.snap?.pl?.find(r => r[0] === pid);
const idx = (c, t) => c.log.findIndex(m => m.t === t);
const EYE = 1.62;
const shoot = async (c, to, w, wait = 350) => {
  const o = [c.p[0], c.p[1] + EYE, c.p[2]], d = to.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w }); // (no rt: where the server has them now)
  await sleep(wait);
};
const press = async c => { c.use(true); await sleep(80); c.use(false); await sleep(350); };
// like a browser: off the cable it falls (straight down here), sending its position; returns the landing
const fall = async (c, m) => {
  const from = m.p, g = world.raycast([from[0], from[1] + 0.1, from[2]], [0, -1, 0], 30, 'solid'), ground = from[1] + 0.1 - g.t;
  let y = from[1], vy = m.v[1];
  while (y > ground) { vy -= 20 * 0.02; y = Math.max(ground, y + vy * 0.02); c.at([from[0], y, from[2]]); await sleep(20); }
  c.landed = { p: [from[0], ground, from[2]], drop: from[1] - ground };
};
const fresh = async () => {
  for (const c of all) { c.clear(); c.landed = null; c.on.zipEnd = null; }
  await admin({ action: 'restart' });
  ok('a new round', await until(() => T1.got('round').length > 0, 15000));
  await until(() => T1.snap?.ph === 'freeze', 5000); // (not the last snapshot from before the restart)
  await until(() => T1.snap?.ph === 'live', 15000);
  await sleep(300);
  // (buy once the round is live: the round can start over once more after a restart; still in the spawn's buy zone)
  for (let i = 0; i < 5 && !(T1.inv?.primary?.id === 'ak47' && T1.inv?.secondary?.id === 'deagle'); i++) {
    T1.send({ t: 'buy', item: 'ak47' }); await sleep(150); T1.send({ t: 'buy', item: 'deagle' }); await sleep(250);
  }
  ok(`T1 bought an AK-47 and a Desert Eagle (${T1.inv?.primary?.id}, ${T1.inv?.secondary?.id})`, T1.inv?.primary?.id === 'ak47' && T1.inv?.secondary?.id === 'deagle');
  for (const c of all) c.clear();
};
const deck = Z.stands[0].p, terrace = Z.stands[1].p, desk = [-10.0, 4.27, -12.0], seat = MAP.cctv.seat;
const park = () => { T2.at([-14, 0.81, 6], 0); T3.at([-16, 0.81, 6], 0); C2.at([10, 0, 4], 0); C3.at([12, 0, 4], 0); };

// ---------------------------------------------------------------- 1
await fresh();
park();
// C1 at the deck, hurt first (28 HP left: one AK bullet from the terrace downs him on the cable)
T1.at([33.2, 7.0, -8.6], -Math.PI / 2); C1.at(deck, -Math.PI / 2); await sleep(400);
for (let i = 0; i < 6 && !(C1.hp <= 34); i++) await shoot(T1, [deck[0], deck[1] + 1.2, deck[2]], 'ak47');
ok(`C1 hurt at the deck (hp ${C1.hp})`, C1.hp > 0 && C1.hp <= 34);
T1.at([-5.0, 4.27, -6.6], Math.PI / 2); await sleep(300);
C1.on.zipEnd = m => { C1.p = m.p.slice(); fall(C1, m); };
await press(C1);
ok('C1 hooks on at the deck', C1.got('zip').length === 1);
await sleep(2000);
for (let i = 0; i < 10 && !C1.got('bodyDown').length && !C1.got('kill').length; i++) {
  const r = row(T1, ids.C1);
  await shoot(T1, [r[1], r[2] + 1.2, r[3]], 'ak47', 150);
}
ok('C1 is shot down on the cable (bodyDown, not a kill)', C1.got('bodyDown').length === 1);
const ze = C1.got('zipEnd')[0];
ok(`he comes off the cable first (zipEnd ${ze?.why} at x ${ze?.p?.[0].toFixed(1)}, before bodyDown)`, ze?.why === 'letgo' && idx(C1, 'zipEnd') < idx(C1, 'bodyDown'));
await sleep(150);
ok(`the snapshot no longer shows him hanging (pose ${row(T1, ids.C1)?.[13]})`, row(T1, ids.C1)?.[13] === 0);
await until(() => C1.landed, 4000);
await sleep(700);
const want = C1.landed ? fallDamage(C1.landed.drop) : -1;
const kill1 = C1.got('kill').find(m => m.v === ids.C1);
if (want > 0) {
  ok(`a ${C1.landed.drop.toFixed(1)} m drop (fall damage ${want}) finishes him: the kill to the shooter (k ${kill1?.k}, w ${kill1?.w}, ${C1.got('bodyKill')[0]?.how})`,
    kill1 && kill1.k === ids.T1 && kill1.w === 'ak47' && C1.got('bodyKill').length === 1);
} else ok(`a ${C1.landed?.drop.toFixed(1)} m drop doesn't hurt: still down`, !kill1 && row(T1, ids.C1)?.[8] === 1);

// C2 at the desk: hurt standing, sits down, downed there
T1.w = 'deagle';
T1.at([-12.5, 4.27, -9.3], 0); C2.at(desk, 0); await sleep(400);
for (let i = 0; i < 3 && !(C2.hp <= 50); i++) await shoot(T1, [desk[0], desk[1] + 1.2, desk[2]], 'deagle');
ok(`C2 hurt by the desk (hp ${C2.hp})`, C2.hp > 0 && C2.hp <= 50);
await press(C2);
ok(`C2 sits down at the desk (pose ${row(T1, ids.C2)?.[13]})`, C2.got('cctv')[0]?.on === 1 && row(T1, ids.C2)?.[13] === 2);
C2.clear();
await shoot(T1, [seat[0] + 0.25, seat[1] + 0.55, seat[2]], 'deagle', 400);
ok('C2 is downed at the desk', C2.got('bodyDown').length === 1);
const co = C2.got('cctv')[0];
ok(`he gets up from the desk first (cctv off, why ${co?.why}, back at ${co?.p}), before bodyDown`, co?.off === 1 && co.why === 'hurt' && Math.abs(co.p[2] - desk[2]) < 0.01 && idx(C2, 'cctv') < idx(C2, 'bodyDown'));
ok(`the snapshot: on the floor where he stood (pose ${row(T1, ids.C2)?.[13]}, z ${row(T1, ids.C2)?.[3]})`, row(T1, ids.C2)?.[13] === 0 && Math.abs(row(T1, ids.C2)[3] - desk[2]) < 0.05);
C2.clear();
C2.at(desk, 0); await sleep(200);
await press(C2);
ok(`downed, E at the desk does nothing (${C2.got('cctv').length} cctv, ${C2.got('msg').map(m => m.text).join('; ') || 'no message'})`, !C2.got('cctv').length);
C2.at(terrace, Math.PI / 2); await sleep(250);
await press(C2);
ok('downed, E at the zip line does nothing', !C2.got('zip').length);
C2.at(deck, -Math.PI / 2); await sleep(250);
await press(C2);
ok('(nor at the deck)', !C2.got('zip').length);

// C3 sits at the desk; downed C2 is put at his feet: E gets C3 up (the gadget first), it doesn't start a revive
C2.at([20, 0, 6], 0);
C3.at(desk, 0); await sleep(300);
await press(C3);
ok('C3 sits down at the desk', C3.got('cctv')[0]?.on === 1);
C2.at([seat[0], 4.27, seat[2] + 0.45], 0); await sleep(300);
C3.clear();
C3.use(true); await sleep(600);
ok(`with downed C2 at his feet, E gets C3 up from the desk (${C3.got('cctv')[0]?.why}), no revive (act ${C3.snap?.me?.a ?? 'none'})`,
  C3.got('cctv')[0]?.off === 1 && C3.got('cctv')[0].why === 'left' && C3.snap?.me?.a !== 'bodyRevive');
C3.use(false);

// ---------------------------------------------------------------- 2
await fresh();
park();
T1.at([-14, 0.81, 4], 0);
T2.at(desk, 0); await sleep(300);
await press(T2);
ok('T2 sits down at the desk', T2.got('cctv')[0]?.on === 1);
T2.clear(); C1.clear();
T2.send({ t: 'bodyPlayDead' }); await sleep(400);
const co2 = T2.got('cctv')[0];
ok(`T2 plays dead at the desk: up from it first (cctv off, why ${co2?.why}) before bodyPlayDead`, co2?.off === 1 && co2.why === 'left' && idx(T2, 'cctv') >= 0 && idx(T2, 'cctv') < idx(T2, 'bodyPlayDead'));
ok('the CTs get the kill', C1.got('kill').some(m => m.v === ids.T2));
const r2 = row(C1, ids.T2);
ok(`to the CTs: a corpse where he stood (alive ${r2?.[8]}, pose ${r2?.[13]}, z ${r2?.[3]})`, r2 && r2[8] === 0 && r2[13] === 0 && Math.abs(r2[3] - desk[2]) < 0.05);
T2.clear();
await press(T2);
ok('playing dead, E at the desk does nothing', !T2.got('cctv').length);
T2.send({ t: 'bodyPlayDead' }); await sleep(1300);
ok('T2 gets up', T2.got('bodyUp').some(m => m.pd && m.why === 'self'));

// C1 on the zip line over the neighbour's roof plays dead
C1.at(deck, -Math.PI / 2); await sleep(300);
C1.on.zipEnd = m => { C1.p = m.p.slice(); fall(C1, m); };
await press(C1);
ok('C1 hooks on at the deck', C1.got('zip').length === 1);
await sleep(650);
C1.clear(); T1.clear();
C1.send({ t: 'bodyPlayDead' });
await until(() => C1.got('bodyPlayDead').length, 1000);
await sleep(80);
const ze2 = C1.got('zipEnd')[0];
ok(`C1 plays dead on the cable: off it first (zipEnd ${ze2?.why} at x ${ze2?.p?.[0].toFixed(1)}), then bodyPlayDead`, ze2?.why === 'letgo' && idx(C1, 'zipEnd') < idx(C1, 'bodyPlayDead'));
ok('the Ts get the kill', T1.got('kill').some(m => m.v === ids.C1));
const usp = () => (T1.dr || []).filter(d => d[1] === 'usp');
ok(`falling, his weapons are still with him (usp ${C1.inv?.secondary?.id}, ${usp().length} usp on the ground)`, C1.inv?.secondary?.id === 'usp' && !usp().length);
await until(() => C1.landed, 3000);
await sleep(900);
const land = C1.landed?.p;
ok(`a ${C1.landed?.drop.toFixed(2)} m drop: no damage (fall damage ${C1.landed && fallDamage(C1.landed.drop)}), still playing dead`, !C1.got('dmg').length && !C1.got('bodyUp').length);
const u = usp()[0];
ok(`landed, the pistol falls where he lies (${u ? Math.hypot(u[2] - land[0], u[4] - land[2]).toFixed(2) : '-'} m away), out of his hands`, u && Math.hypot(u[2] - land[0], u[4] - land[2]) < 1 && !C1.inv?.secondary);
C1.at([land[0] - 3, land[1], land[2]], 0); await sleep(400);
const r3 = row(T1, ids.C1);
ok(`the server keeps the corpse where it landed (x ${r3?.[1]} vs ${land?.[0].toFixed(2)}, y ${r3?.[2]})`, r3 && Math.abs(r3[1] - land[0]) < 0.05 && Math.abs(r3[2] - land[1]) < 0.05);
C1.send({ t: 'bodyPlayDead' }); await sleep(500);
ok(`K gets him up with his pistol back (${C1.inv?.secondary?.id})`, C1.got('bodyUp').some(m => m.pd && m.why === 'self') && C1.inv?.secondary?.id === 'usp');

// ---------------------------------------------------------------- 3
await fresh();
park();
C1.at(deck, -Math.PI / 2); await sleep(300);
C1.on.zipEnd = m => { C1.p = m.p.slice(); fall(C1, m); };
await press(C1);
await sleep(2100);
C1.clear();
C1.send({ t: 'bodyPlayDead' });
await until(() => C1.landed, 4000);
await sleep(700);
const want3 = C1.landed ? fallDamage(C1.landed.drop) : -1;
ok(`C1 plays dead over the street: off the cable (${C1.got('zipEnd')[0]?.why}), a ${C1.landed?.drop.toFixed(1)} m fall`, C1.got('zipEnd')[0]?.why === 'letgo' && C1.got('bodyPlayDead').length === 1);
ok(`the landing hurts (${C1.got('dmg').map(m => m.d).join(',') || 'nothing'}; fall damage ${want3}) and gets him up (${C1.got('bodyUp')[0]?.why}), nothing dropped`,
  want3 > 0 && C1.got('dmg')[0]?.d === want3 && C1.got('bodyUp').some(m => m.pd && m.why === 'hit') && C1.inv?.secondary?.id === 'usp');

for (const c of all) c.close();
process.exit();
