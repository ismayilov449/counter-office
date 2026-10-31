// "Downed, not dead" + "Play dead" with the Mansion's gadgets, in the browser (cs_mansion or cs_mansion_night: MAP= as
// the server's; GAME_PORT/CDP_PORT, BOTS=0 START_MONEY=16000 MAP_ROTATION=0 ROUND_TIME=600). Each part starts a fresh
// round (admin restart). Parts 1-5: the browser is a CT (Rider) with a scripted CT teammate (C2, parked) and two
// scripted Terrorists (T1 shoots, T2 parked):
//  1 K in mid-air (a jump) and on a ladder: refused ("Stand on the ground to play dead").
//  2 shot down on the zip line just after hooking on: off the cable, falls; lands on the deck and crawls on (or, if
//    the drop hurts, the landing finishes him); to the others he lies there, not hanging; E does nothing.
//  3 K on the zip line: the view falls with you, eyes half closed, ends on the floor (a drop that hurts gets you up);
//    3b the same about 1.4 s down the cable: the body flies on with the cable's speed and lands on the lower roof (a
//    3.6 m fall, no damage): still a corpse where it landed.
//  4 K at the CCTV desk: the camera picture closes, on the floor beside the chair, no hint, E does nothing; K: up.
//  5 shot down sitting at the CCTV desk: back to your own eyes, down beside the chair, no hint, E does nothing.
//  6 the browser is a Terrorist on the deck: a scripted CT plays dead on the zip line (a corpse falls onto the lower
//    roof, its pistol only after it lands, lies there, then gets up: "C1 was playing dead!"); then, watched from the
//    neighbour's roof, he's shot down on it (falls and lies on the deck, not hanging).
// (The deck at y 7 is small, x 33-34.9: let go more than ~1 s after hooking on and you fall to the neighbour's roof
// (y 6), the street (7 m: fall damage) or the lower roof at x 28.8-30.6 (y 3.45).)
// Screenshots in OUT (g2_*.png; PREFIX to change), page errors printed.
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { fallDamage } from '../../../shared/gadgets.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await cond()) return true; await sleep(50); } return !!(await cond()); };
const MAP = MAPS[process.env.MAP || 'cs_mansion'], Z = MAP.zip, world = new CollisionWorld(MAP);
const PF = process.env.PREFIX || 'g2';
const deck = Z.stands[0].p, desk = [-10.0, 4.27, -12.0], seat = MAP.cctv.seat;
const groundAt = p => { const h = world.raycast([p[0], p[1] + 0.1, p[2]], [0, -1, 0], 30, 'solid'); return p[1] + 0.1 - h.t; };
const KEEP = ['msg', 'zip', 'zipEnd', 'cctv', 'bodyDown', 'bodyUp', 'bodyKill', 'bodyPlayDead', 'kill', 'dmg', 'spawn'];
// the page size (VIEW=WxH, default 960x540); on a cold page the team buttons are still disabled when game.mjs clicks
// one: click again until we're in
const [VW, VH] = (process.env.VIEW || '960x540').split('x').map(Number);
const view = async (g, team) => {
  for (let i = 0; i < 60 && !(await g.ev("document.getElementById('join').classList.contains('hidden')")); i++) {
    await g.ev(`(b => { if (b && !b.disabled) b.click(); })(document.querySelector('#join .team-btn[data-team="${team}"]')), 1`);
    await sleep(500);
  }
  await sleep(1000);
  await g.ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 'ok'");
  await g.cmd('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
};
let g = await open('CT', 'Rider', KEEP);
await view(g, 'CT');
let { tp, key, keyDown, keyUp, shot, msgs, errors, ev, look } = g;
const T1 = await player('T1', 'T'), C2 = await player('C2', 'CT'), T2 = await player('T2', 'T');
const all = [T1, C2, T2];
const wire = c => { c.on.s = m => { c.snap = { ...m, dr: 'dr' in m ? m.dr : c.snap?.dr }; }; c.on.me = m => { c.inv = m.inv; }; c.on.roster = m => { c.roster = m.list; }; };
all.forEach(wire);
const idOf = name => T1.roster?.find(e => e.name === name)?.id;
const row = (c, id) => c.snap?.pl?.find(r => r[0] === id);
const text = id => ev(`document.getElementById('${id}')?.textContent || ''`);
const snap = n => shot(`${PF}_${n}.png`);
let seen = [];
const pull = async () => { seen = seen.concat(await msgs()); return seen; };
const has = async pred => (await pull()).some(pred);
const first = async pred => (await pull()).findIndex(pred);
const EYE = 1.62;
const shoot = async (c, to, w, wait = 300) => {
  const o = [c.p[0], c.p[1] + EYE, c.p[2]], d = to.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w });
  await sleep(wait);
};
// a scripted player off the cable falls, flying on with the cable's speed (as a browser would; no walls), sending its
// position
const fall = async (c, m) => {
  let [x, y, z] = m.p, vy = m.v[1];
  const y0 = y;
  for (;;) {
    const ground = groundAt([x, y, z]);
    vy -= 20 * 0.02;
    if (y + vy * 0.02 <= ground) { y = ground; c.at([x, y, z]); break; }
    x += m.v[0] * 0.02; z += m.v[2] * 0.02; y += vy * 0.02;
    c.at([x, y, z]);
    await sleep(20);
  }
  c.landed = { p: [x, y, z], drop: y0 - y };
};
// wait until player id (in c's snapshots) stops falling: its height the same for ~1 s
const settle = async (c, id, ms = 10000) => {
  let last = null, same = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const y = row(c, id)?.[2];
    if (y != null && last != null && Math.abs(y - last) < 0.005) { if (++same >= 4) break; } else same = 0;
    last = y;
    await sleep(250);
  }
  return row(c, id);
};
const fresh = async (buy = true) => {
  for (const c of all) { c.clear(); c.landed = null; c.on.zipEnd = null; }
  await admin({ action: 'restart' });
  await until(() => T1.got('round').length > 0, 15000);
  await until(() => T1.snap?.ph === 'freeze', 5000);
  ok('a fresh round is live', await until(() => T1.snap?.ph === 'live', 15000));
  await sleep(300);
  for (let i = 0; i < 5 && buy && !(T1.inv?.primary?.id === 'ak47' && T1.inv?.secondary?.id === 'deagle'); i++) {
    T1.send({ t: 'buy', item: 'ak47' }); await sleep(150); T1.send({ t: 'buy', item: 'deagle' }); await sleep(250);
  }
  if (T2.ws.readyState === 1) T2.at([-14, 0.81, 6], 0);
  C2.at([10, 0, 4], 0);
  await msgs(); seen = [];
  for (const c of all) c.clear();
};
const lastHp = () => seen.filter(m => m.t === 'dmg').pop()?.hp;

// ---------------------------------------------------------------- 1: K in mid-air, on a ladder
await fresh();
const me = idOf('Rider');
T1.at([-14, 0.81, 4], 0);
await tp([9, 0, 1], Math.PI / 2); await sleep(600);
await keyDown('Space'); await sleep(350); await key('KeyK'); await keyUp('Space'); await sleep(150);
const jumpMsg = await text('small-msg');
ok(`K while jumping is refused ("${jumpMsg}")`, /Stand on the ground to play dead/.test(jumpMsg) && !(await has(m => m.t === 'bodyPlayDead')));
await sleep(1500);
const L = MAP.ladders[0], lx = (L.min[0] + L.max[0]) / 2, lz = L.min[2] - 0.2; // (n [0, -1]: climbed facing +z)
await tp([lx, 2.0, lz], Math.PI, 0.3); await sleep(800);
await snap('ladder');
await key('KeyK'); await sleep(150);
const ladderMsg = await text('small-msg');
ok(`K on a ladder is refused ("${ladderMsg}")`, /Stand on the ground to play dead/.test(ladderMsg) && !(await has(m => m.t === 'bodyPlayDead')));

// ---------------------------------------------------------------- 2: shot down on the zip line
await fresh();
// hurt at the deck first (two AK hits: one more downs him on the cable)
T1.at([33.2, 7.0, -8.6], -Math.PI / 2); T1.w = 'ak47';
await tp(deck, Math.PI / 2, -0.1); await sleep(600);
for (let i = 0; i < 6 && !(lastHp() <= 34); i++) { await shoot(T1, [deck[0], deck[1] + 1.2, deck[2]], 'ak47', 400); await pull(); }
ok(`the browser hurt at the deck (hp ${lastHp()})`, lastHp() > 0 && lastHp() <= 34);
await key('KeyE');
ok('hooked on (zip)', await until(() => has(m => m.t === 'zip'), 2000));
for (let i = 0; i < 10 && !(await has(m => m.t === 'bodyDown' && m.v === me)); i++) {
  const r = row(T1, me);
  if (r) await shoot(T1, [r[1], r[2] + 1.2, r[3]], 'ak47', 150);
}
ok('the browser is shot down on the cable (bodyDown)', await has(m => m.t === 'bodyDown' && m.v === me));
const ze = seen.find(m => m.t === 'zipEnd');
ok(`off the cable first (zipEnd ${ze?.why}, at x ${ze?.p?.[0].toFixed(2)}, y ${ze?.p?.[1].toFixed(2)})`, ze?.why === 'letgo' && (await first(m => m.t === 'zipEnd')) < (await first(m => m.t === 'bodyDown')));
await snap('zipdown_fall');
const r2 = await settle(T1, me);
const drop2 = ze ? ze.p[1] - groundAt(ze.p) : -1, dmg2 = fallDamage(drop2);
if (dmg2 > 0) {
  ok(`a ${drop2.toFixed(1)} m drop (fall damage ${dmg2}) finishes him`, await until(() => has(m => m.t === 'kill' && m.v === me), 3000));
} else {
  ok(`a ${drop2.toFixed(2)} m drop: to the others he lies there, not hanging (y ${r2?.[2]}, pose ${r2?.[13]}, alive ${r2?.[8]})`, r2 && r2[13] === 0 && r2[8] === 1 && Math.abs(r2[2] - groundAt(ze.p)) < 0.05);
  ok(`still down ("${(await text('bd-panel')).slice(0, 30)}")`, !(await has(m => m.t === 'kill' && m.v === me)) && /YOU'RE DOWN/.test(await text('bd-panel')));
  ok(`no gadget hint from the floor ("${await text('hint')}")`, (await text('hint')) === '');
}
await snap('zipdown_landed');
await look(0, 1.0); await sleep(500);
await snap('zipdown_lookup'); // (no trolley over your head)
await look(0, -1.0);
if (dmg2 <= 0) {
  await tp(deck, Math.PI / 2); await sleep(300); // (crawl back to the stand)
  seen = [];
  await key('KeyE'); await sleep(600);
  ok('downed, E at the deck does nothing', !(await has(m => m.t === 'zip')));
}

// ---------------------------------------------------------------- 3: K on the zip line
await fresh(false);
T1.at([-14, 0.81, 4], 0);
await tp(deck, Math.PI / 2, -0.1); await sleep(600);
await key('KeyE');
ok('hooked on (zip)', await until(() => has(m => m.t === 'zip'), 2000));
await key('KeyK');
ok('playing dead on the cable (bodyPlayDead)', await until(() => has(m => m.t === 'bodyPlayDead' && m.v === me), 2000));
const ze3 = seen.find(m => m.t === 'zipEnd');
ok(`off the cable first (zipEnd ${ze3?.why} at x ${ze3?.p?.[0].toFixed(2)}, y ${ze3?.p?.[1].toFixed(2)})`, ze3?.why === 'letgo' && (await first(m => m.t === 'zipEnd')) < (await first(m => m.t === 'bodyPlayDead')));
await snap('zippd_fall');
const r3 = await settle(C2, me);
const drop3 = ze3 ? ze3.p[1] - groundAt(ze3.p) : -1, dmg3 = fallDamage(drop3);
if (dmg3 > 0) {
  ok(`a ${drop3.toFixed(1)} m drop (fall damage ${dmg3}) gets him up (bodyUp ${seen.find(m => m.t === 'bodyUp')?.why})`, await until(() => has(m => m.t === 'bodyUp' && m.v === me && m.why === 'hit'), 3000));
  await snap('zippd_landed');
} else {
  ok(`a ${drop3.toFixed(2)} m drop: landed (to his teammate y ${r3?.[2]}, pose ${r3?.[13]}), eyes half closed (${await ev("document.getElementById('bd-eyes').style.opacity")})`,
    r3 && r3[13] === 0 && Math.abs(r3[2] - groundAt(ze3.p)) < 0.05 && +(await ev("document.getElementById('bd-eyes').style.opacity")) > 0.9);
  ok('the drop did not get him up', !(await has(m => m.t === 'bodyUp')));
  await snap('zippd_landed');
  await key('KeyK');
  ok('K gets him up', await until(() => has(m => m.t === 'bodyUp' && m.v === me && m.pd), 2500));
  await sleep(1500);
  await snap('zippd_up');
}

// ---------------------------------------------------------------- 3b: K on the zip line over the lower roof
// (letting go keeps the cable's speed, so the body flies on as it falls: let go about 1.4 s after hooking on, over the
// street at x ~31.6, and it lands on the lower roof between the neighbour's house and the street (x 28.8-30.6, y 3.45):
// a 3.6 m fall, no damage, so he stays a corpse and the view must fall with him; a 7 m fall to the street would hurt
// and get him up)
await fresh(false);
T1.at([-14, 0.81, 4], 0);
await tp(deck, Math.PI / 2, -0.25); await sleep(600);
const t3b = Date.now();
await key('KeyE');
ok('hooked on (zip)', await until(() => has(m => m.t === 'zip'), 1500));
await sleep(Math.max(0, 1400 - (Date.now() - t3b)));
await key('KeyK');
await snap('zippd_roof_fall');
ok('playing dead on the cable (bodyPlayDead)', await until(() => has(m => m.t === 'bodyPlayDead' && m.v === me), 2000));
const zb = seen.find(m => m.t === 'zipEnd');
const rb = await settle(C2, me);
const dropB = zb && rb ? zb.p[1] - rb[2] : -1, hurtB = fallDamage(dropB);
console.log(`  let go at x ${zb?.p?.[0].toFixed(2)} (y ${zb?.p?.[1].toFixed(2)}, speed ${zb && Math.hypot(zb.v[0], zb.v[2]).toFixed(1)} m/s), landed at x ${rb?.[1]}, y ${rb?.[2]}`);
if (hurtB === 0) {
  ok(`a ${dropB.toFixed(2)} m fall onto the lower roof: he lies where he landed (to his teammate y ${rb?.[2]}, pose ${rb?.[13]}), eyes half closed (${await ev("document.getElementById('bd-eyes').style.opacity")}), still a corpse`,
    rb && Math.abs(rb[2] - 3.45) < 0.05 && rb[13] === 0 && +(await ev("document.getElementById('bd-eyes').style.opacity")) > 0.9 && !(await has(m => m.t === 'bodyUp')));
  await snap('zippd_roof_landed');
  await key('KeyK');
  ok('K gets him up', await until(() => has(m => m.t === 'bodyUp' && m.v === me && m.pd), 2500));
} else {
  ok(`(missed the lower roof) a ${dropB.toFixed(1)} m fall (damage ${hurtB}) gets him up (${seen.find(m => m.t === 'bodyUp')?.why})`, await has(m => m.t === 'bodyUp' && m.v === me && m.why === 'hit'));
  await snap('zippd_roof_landed');
}
await sleep(1500);
await snap('zippd_roof_up');

// ---------------------------------------------------------------- 4: K at the CCTV desk
await fresh(false);
T1.at([-14, 0.81, 4], 0);
await tp(desk, 0, -0.25); await sleep(800);
console.log('hint at the desk:', await text('hint'));
await key('KeyE');
ok('sitting at the desk (cctv on)', await until(() => has(m => m.t === 'cctv' && m.on), 2000));
await sleep(1200);
await snap('desk_cam');
await key('KeyK');
ok('playing dead at the desk (bodyPlayDead)', await until(() => has(m => m.t === 'bodyPlayDead' && m.v === me), 2000));
const co4 = seen.find(m => m.t === 'cctv' && !m.on);
ok(`up from the desk first (cctv off, why ${co4?.why})`, co4?.why === 'left' && (await first(m => m.t === 'cctv' && !m.on)) < (await first(m => m.t === 'bodyPlayDead')));
await sleep(1500);
ok(`no hint while playing dead ("${await text('hint')}")`, (await text('hint')) === '');
await snap('desk_pd');
seen = [];
await key('KeyE'); await sleep(600);
ok('playing dead, E at the desk does nothing', !(await has(m => m.t === 'cctv')));
await key('KeyK');
ok('K gets him up', await until(() => has(m => m.t === 'bodyUp' && m.v === me && m.pd), 2500));
await sleep(1500);
await snap('desk_pdup');

// ---------------------------------------------------------------- 5: shot down at the CCTV desk
await fresh();
T1.at([-12.5, 4.27, -9.3], 0); T1.w = 'deagle';
await tp(desk, 0, -0.25); await sleep(800);
for (let i = 0; i < 3 && !(lastHp() <= 50); i++) { await shoot(T1, [desk[0], desk[1] + 1.2, desk[2]], 'deagle', 450); await pull(); }
ok(`hurt by the desk (hp ${lastHp()})`, lastHp() > 0 && lastHp() <= 50);
await key('KeyE');
ok('sitting at the desk (cctv on)', await until(() => has(m => m.t === 'cctv' && m.on), 2000));
await sleep(1200);
seen = [];
for (let i = 0; i < 4 && !(await has(m => m.t === 'bodyDown' && m.v === me)); i++) await shoot(T1, [seat[0] + 0.25, seat[1] + 0.55, seat[2]], 'deagle', 450);
ok('downed at the desk (bodyDown)', await has(m => m.t === 'bodyDown' && m.v === me));
const co5 = seen.find(m => m.t === 'cctv' && !m.on);
ok(`up from the desk first (cctv off, why ${co5?.why})`, co5?.why === 'hurt' && (await first(m => m.t === 'cctv' && !m.on)) < (await first(m => m.t === 'bodyDown')));
await sleep(1500);
ok(`no hint while down ("${await text('hint')}"); the down overlay ("${(await text('bd-panel')).slice(0, 30)}")`, (await text('hint')) === '' && /YOU'RE DOWN/.test(await text('bd-panel')));
await snap('desk_down');
await look(Math.PI * 0.75, 0); await sleep(500);
await snap('desk_down_chair'); // (the chair beside him, empty)
seen = [];
await key('KeyE'); await sleep(600);
ok('downed, E at the desk does nothing', !(await has(m => m.t === 'cctv')));
console.log('errors (parts 1-5):', errors.length ? errors.slice(0, 5).join('\n') : 'none');

// ---------------------------------------------------------------- 6: the browser is a Terrorist on the deck
// (teams stay even: T2 leaves, the browser comes back as a T, then a scripted CT rider joins)
T2.close();
// (close the page's connection first: the browser may keep the old page, socket open, in its back/forward cache, and
// the server would keep "Rider" in the game)
await ev('window.__ws?.close(), 1'); await sleep(800);
g = await open('T', 'Watcher', KEEP);
await view(g, 'T');
({ tp, key, keyDown, keyUp, shot, msgs, errors, ev, look } = g);
const C1 = await player('C1', 'CT');
wire(C1);
all.splice(0, all.length, T1, C2, C1);
await sleep(500);
const c1 = idOf('C1');
// stand at p (feet) and look at the point at
const lookAt = async (p, at) => {
  const d = [at[0] - p[0], at[1] - p[1] - EYE, at[2] - p[2]];
  await tp(p, Math.atan2(-d[0], -d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))); await sleep(600);
};
const usps = () => (T1.snap?.dr || []).filter(d => d[1] === 'usp');
// C1 plays dead on the cable 1.4 s down it: the body flies on and lands on the lower roof (x 28.8-30.6, y 3.45); the
// browser watches from the deck's west edge
await fresh(false);
T1.at([-14, 0.81, 4], 0);
await lookAt([33.3, 7.0, -7.3], [30.4, 4.6, -8]);
C1.at(deck, Math.PI / 2); await sleep(300);
C1.on.zipEnd = m => { C1.p = m.p.slice(); fall(C1, m); };
const t6 = Date.now();
C1.use(true); await sleep(80); C1.use(false);
await sleep(Math.max(0, 1400 - (Date.now() - t6)));
C1.send({ t: 'bodyPlayDead' });
ok('the T browser gets the kill message', await until(() => has(m => m.t === 'kill' && m.v === c1), 2000));
// (read before the screenshot: the fall takes 0.6 s, a headless screenshot can take that long)
const falling6 = !C1.landed, onGround6 = usps().length;
if (falling6) ok(`falling, his pistol is still with him (${onGround6} USP on the ground)`, !onGround6);
else console.log('  (he had landed before the check: the pistol-while-falling check is skipped)');
await snap('t_corpse_falling');
await until(() => C1.landed, 4000);
await sleep(1200);
const pd6 = !C1.got('bodyUp').length, u6 = usps()[0], l6 = C1.landed?.p;
ok(`C1 landed (a ${C1.landed?.drop.toFixed(2)} m fall, at x ${l6?.[0].toFixed(2)}, y ${l6?.[1].toFixed(2)})${pd6 ? ' and lies there as a corpse' : ', got up from the fall'}`, !!C1.landed && pd6);
ok(`landed, his pistol lies by the body (${u6 ? Math.hypot(u6[2] - l6[0], u6[4] - l6[2]).toFixed(2) + ' m' : 'none'})`, u6 && Math.hypot(u6[2] - l6[0], u6[4] - l6[2]) < 1);
await snap('t_corpse_landed');
if (pd6) {
  C1.send({ t: 'bodyPlayDead' });
  const told = await until(async () => /C1 was playing dead/.test(await text('small-msg')), 2500);
  ok(`"C1 was playing dead!" ("${await text('small-msg')}")`, told);
  await sleep(300);
  await snap('t_corpse_up');
  await sleep(1000);
}
// C1 shot down on the cable (hurt at the deck first); the browser watches from the neighbour's roof
await fresh();
await lookAt([38.5, 6.0, -6.0], [34.0, 7.2, -8.0]);
T1.at([33.2, 7.0, -8.6], -Math.PI / 2); T1.w = 'ak47';
C1.at(deck, Math.PI / 2); await sleep(400);
for (let i = 0; i < 2; i++) await shoot(T1, [deck[0], deck[1] + 1.2, deck[2]], 'ak47', 400);
C1.clear();
C1.on.zipEnd = m => { C1.p = m.p.slice(); fall(C1, m); };
C1.use(true); await sleep(80); C1.use(false);
await sleep(200);
for (let i = 0; i < 10 && !C1.got('bodyDown').length && !C1.got('kill').some(m => m.v === c1); i++) {
  const r = row(T1, c1);
  if (r) await shoot(T1, [r[1], r[2] + 1.2, r[3]], 'ak47', 150);
}
ok('C1 is shot down on the cable', C1.got('bodyDown').length === 1);
await snap('t_down_falling');
await until(() => C1.landed, 4000);
await sleep(1200);
const r6 = row(T1, c1), dmg6 = C1.landed ? fallDamage(C1.landed.drop) : -1;
if (dmg6 > 0) ok(`a ${C1.landed.drop.toFixed(1)} m drop finishes him`, C1.got('kill').some(m => m.v === c1));
else ok(`C1 lies there, not hanging (y ${r6?.[2]}, pose ${r6?.[13]}, alive ${r6?.[8]})`, r6 && r6[13] === 0 && r6[8] === 1 && Math.abs(r6[2] - C1.landed.p[1]) < 0.05);
await snap('t_down_landed');
console.log('errors (part 6):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
for (const c of [T1, C2, C1]) c.close();
process.exit();
