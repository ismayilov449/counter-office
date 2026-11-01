// The cat in the real game, in the headless Edge. Run it once per Mansion map.
// Server (fresh, restarted before each run): PORT=4060 MAP=cs_mansion (then cs_mansion_night) BOTS=0 ROUND_TIME=600
// START_MONEY=16000; headless Edge on CDP_PORT 9460 (stop it by its port only).
//   node dev/test-scripts/cat/g1.mjs        (screenshots in OUT, PREFIX default cat_<map>; WANDER: seconds, 90)
// The browser is a T ("Owner") who watches; a scripted T ("Tom") and CT ("Shooter") act. In order:
//   1. round start: asleep in its basket (and the bowl); the draw calls with and without the cat, basket and bowl;
//   2. the browser's player stands still by it: "mrrp", it comes over and sits looking up; he moves, it walks after him;
//   3. Tom lays a PMN under it: it goes off, the cat is thrown (screech), lands, runs and hides, never dies;
//   4. the CT fires into the air near it: it hisses and bolts;
//   5. the CT shoots it: thrown, screech, unhurt;
//   6. Tom in ghillie camo, crouched a few metres off: it goes up to him and meows;
//   7. left alone for WANDER seconds: it moves about; a picture whenever it's up on the sofa, a sill or the terrace;
//   8. (cs_mansion_night) the living room's lights off: its eyes glow; the draw calls off screen.
// What to look at: the size next to the sofa, no paws sliding or sinking, the tail curling, the hops, the eyes.
import { open, sleep } from '../mansion/game.mjs';
import { player, until, dist2 } from './catclient.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav } from '../../../lib/nav.js';
import { CAT } from '../../../shared/cat.js';

const PORT = process.env.GAME_PORT || 4060, WANDER = +(process.env.WANDER || 90);
const admin = action => fetch(`http://127.0.0.1:${PORT}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'testpass', ...action }) }).then(r => r.json());
const mapId = (await admin({ action: 'state' })).state?.map;
const M = MAPS[mapId], world = new CollisionWorld(M), nav = buildNav(M, world);
const P = process.env.PREFIX || `cat_${mapId}`;
let fails = 0;
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) fails++; };
const f2 = p => (p ? p.map(v => v.toFixed(2)).join(', ') : '-');
const los = (a, b) => { const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d); return !world.raycast(a, d.map(v => v / l), l, 'bullet'); };
const floorUnder = p => world.raycast([p[0], p[1] + 0.15, p[2]], [0, -1, 0], 1.6, 'solid');
// a floor rMin..rMax m from p (about the same level), optionally with a clear line from eye height to p
function spotNear(p, rMin, rMax, needLos = false) {
  const here = nav.nodeAt(p, 3), at = here >= 0 ? nav.pos(here) : p;
  for (const [k, dy] of [[1, 0.3], [1, 0.9], [1.5, 0.9]]) {
    for (let i = 0; i < 500; i++) {
      const n = nav.randomNear(here, at, rMax * k, dy);
      if (n < 0) continue;
      const q = nav.pos(n), d = dist2(q, p);
      if (d < rMin || d > rMax * k || nav.low[n] || nav.tight[n]) continue;
      if (needLos && !los([q[0], q[1] + 1.6, q[2]], [p[0], p[1] + 0.15, p[2]])) continue;
      return q;
    }
  }
  return null;
}

const g = await open('T', 'Owner', ['msg', 'catMeow', 'boom']);
const { tp, shot, msgs, errors, cmd, ev } = g;
await cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false }); // (a light load)
const ct = await player('Shooter', 'CT'), tom = await player('Tom', 'T');
const cat = () => ct.cat;
const meows = k => ct.meows.filter(m => m.k === k);
const away = { ct: [25.5, 0, -5], tom: [25.5, 0, -8], me: [24, 0, -2] }; // (out in the street, where the cat never goes)
const park = () => tp(away.me, 0, 0);
// the browser's player looks at `at` from a floor dMin..dMax m away with a clear line (beyond following range)
// (avoid: someone who mustn't stand in the way, like the shooter)
const offLine = (who, from, at) => { // is `who` well clear of the line from `from` to `at`?
  const ax = at[0] - from[0], az = at[2] - from[2], l2 = ax * ax + az * az || 1;
  const s = Math.max(0, Math.min(1, ((who[0] - from[0]) * ax + (who[2] - from[2]) * az) / l2));
  return Math.hypot(from[0] + ax * s - who[0], from[2] + az * s - who[2]) > 1.2;
};
async function watch(at, dMin = 3.7, dMax = 5.5, avoid = null) {
  const clear = q => !!q && (!avoid || offLine(avoid, q, at));
  let v = null;
  for (let i = 0; i < 30 && !clear(v); i++) v = spotNear(at, dMin, dMax, true) || spotNear(at, 2.4, 8, true);
  if (!clear(v)) v = spotNear(at, dMin, dMax, true);
  if (!v) return null;
  const dx = at[0] - v[0], dz = at[2] - v[2];
  await tp(v, Math.atan2(-dx, -dz), Math.atan2(at[1] + 0.15 - (v[1] + 1.6), Math.hypot(dx, dz)));
  return v;
}
const CALM = ['sit', 'walk', 'trot', 'wash', 'stretch', 'loaf', 'sleep'];
const calm = async () => { await until(() => CALM.includes(cat()?.state), 40000); return until(() => ['sit', 'loaf', 'sleep', 'wash'].includes(cat()?.state), 30000); };

// the draw calls: every WebGL draw counted per frame; the cat, its basket and its bowl switched off by layer
await ev(`(async () => {
  const THREE = await import('three');
  window.__dc = { n: 0, frames: [] };
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const o = C.prototype[f]; if (o) C.prototype[f] = function (...a) { window.__dc.n++; return o.apply(this, a); };
  }
  const tick = () => { window.__dc.frames.push(window.__dc.n); window.__dc.n = 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__scenes = new Set();
  const umw = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (f) { if (this.isScene) window.__scenes.add(this); return umw.call(this, f); };
  const B = new THREE.Vector3(...${JSON.stringify(CAT.basket)});
  window.__catHide = hide => {
    const objs = [];
    for (const s of window.__scenes) s.traverse(o => {
      if (o.userData?.eyes && o.userData?.mesh) objs.push(o.userData.mesh, o.userData.eyes);
      if (o.isGroup && o.children.length === 2 && o.children[0].position.distanceTo(B) < 0.01) o.traverse(m => m.isMesh && objs.push(m));
    });
    for (const o of objs) o.layers.set(hide ? 31 : 0);
    return objs.length;
  };
  return 1;
})()`);
async function drawCost(label) {
  const r = JSON.parse(await ev(`(async () => {
    const avg = async () => { await new Promise(r => setTimeout(r, 400)); __dc.frames.length = 0; while (__dc.frames.length < 12) await new Promise(r => setTimeout(r, 100)); const f = __dc.frames.slice(2); return f.reduce((a, b) => a + b, 0) / f.length; };
    const on = await avg(), n = __catHide(true), off = await avg(); __catHide(false);
    return JSON.stringify({ on, off, n });
  })()`));
  console.log(`  draw calls, ${label}: ${r.on.toFixed(1)} with the cat, basket and bowl, ${r.off.toFixed(1)} without (+${(r.on - r.off).toFixed(1)}; ${r.n} objects)`);
  return r.on - r.off;
}

// ---- 1. round start: asleep in its basket
await until(() => ct.phase === 'freeze' || ct.phase === 'live', 8000);
await sleep(500);
await admin({ action: 'restart' });
await until(() => ct.phase === 'freeze', 6000);
await sleep(300);
tom.send({ t: 'buy', item: 'camo' }); tom.send({ t: 'buy', item: 'pmn' });
ok(`round start: the cat asleep in its basket (${f2(cat()?.p)}, ${cat()?.state})`, cat() && dist2(cat().p, CAT.basket) < 0.1 && cat().state === 'sleep');
await until(() => ct.phase === 'live', 10000);
ok(`the round is live; Tom has camo and a PMN`, ct.phase === 'live' && tom.me?.camo && tom.me?.inv?.pmn > 0);
ct.at(away.ct); tom.at(away.tom);
await tp([-19.0, 0.813, 2.2], Math.PI / 2 + 0.44, -0.27); await sleep(1500); // (3.9 m off: beyond following range)
await shot(`${P}_1basket.png`);
const dcIn = await drawCost('looking at the basket (the cat in it)');
await tp([-16.6, 0.81, -12.3], 0.45, -0.45); await sleep(1200);
await shot(`${P}_1bowl.png`);
await tp([-16.0, 0.813, 0.5], -Math.PI / 2, 0); await sleep(800); // (the living room, looking away from the cat)
const dcOut = await drawCost('looking away from it');

// ---- 2. following the browser's player: he goes up to it, wherever it has got to, and stands still 1.5 m off
const face = (from, at, pitch) => tp(from, Math.atan2(-(at[0] - from[0]), -(at[2] - from[2])), pitch);
ok(`it settles somewhere (${cat()?.state} at ${f2(cat()?.p)})`, await calm());
const c2 = cat().p.slice(), me2 = spotNear(c2, 1.3, 1.8, true);
ct.clear();
await face(me2, c2, -0.6);
ok(`standing still ${dist2(me2, c2).toFixed(1)} m from it: "mrrp", it follows`, await until(() => meows('mrrp').length > 0, 10000));
await sleep(600);
await shot(`${P}_2wake.png`);
await until(() => cat().state === 'sit' && dist2(cat().p, me2) < 1.9, 9000);
await face(me2, cat().p, -0.75); await sleep(500);
await shot(`${P}_2follow.png`);
ok(`it comes over and sits at his feet (${dist2(cat().p, me2).toFixed(2)} m, ${cat().state})`, cat().state === 'sit' && dist2(cat().p, me2) < 1.9);
const to = spotNear(cat().p, 4.5, 6, true) || me2; // (where he still sees it)
await face(to, cat().p, -0.45); // (he walks off 5 m, looking back at it)
await until(() => ['walk', 'trot'].includes(cat().state), 4000);
for (let i = 0; i < 4; i++) { await shot(`${P}_2walk${i}.png`); await sleep(180); } // (the legs over a step or two)
ok(`it walks after him (${cat().state})`, ['walk', 'trot', 'sit'].includes(cat().state));
ok('and catches him up', await until(() => dist2(cat().p, to) < 1.9 && cat().state === 'sit', 12000));
await face(to, cat().p, -0.75); await sleep(1200);
await shot(`${P}_2sitting.png`);

// ---- 3. Tom's PMN under it
ct.clear();
await until(() => ['sit', 'loaf', 'wash', 'sleep'].includes(cat().state), 15000); // (sitting still, or it walks off the mine before it arms)
const c3 = cat().p.slice();
let tomAt = null; // (by it, but not between the browser's player and it)
for (let i = 0; i < 30 && !(tomAt && offLine(tomAt, to, c3)); i++) tomAt = spotNear(c3, 1.0, 2.0);
tomAt ||= [c3[0] + 1.2, c3[1], c3[2]];
tom.at(tomAt, 0, 0);
// (the browser's player stays where he is, the cat sitting at his feet, and looks down at it; Tom is his team mate,
// so the mine doesn't hurt him with friendly fire off)
{ const dx = c3[0] - to[0], dz = c3[2] - to[2]; await tp(to, Math.atan2(-dx, -dz), -0.75); }
await sleep(600);
tom.send({ t: 'mine', k: 'pmn', p: cat().p.slice(), yaw: 0 });
await sleep(300);
const laid = tom.got('mines').slice(-1)[0]?.list?.[0];
ok(`Tom lays a PMN under it (the cat at ${f2(cat().p)}, ${cat().state}; the mine at ${laid ? f2(laid.slice(3, 6)) : '-'})`, tom.me?.inv?.pmn === 0);
const boom = await until(() => cat().state === 'air', 6000);
ok('armed, it goes off under the cat: thrown, screeching', boom && meows('screech').length > 0);
await shot(`${P}_3thrown.png`);
tom.at(away.tom, 0, 0);
await until(() => cat().state !== 'air', 3000);
await sleep(200);
ok(`it lands on a floor (${f2(cat().p)}) and runs (${cat().state})`, !!floorUnder(cat().p) && ['run', 'hide'].includes(cat().state));
await watch(cat().p, 3.7, 7); await sleep(300);
await shot(`${P}_3landed.png`);
const hid = await until(() => cat().state === 'hide', 12000);
ok(`it hides, still in every snapshot (it never dies)`, hid && ct.cats.slice(-50).every(Boolean));
if (hid) { await watch(cat().p, 2.5, 5); await sleep(800); await shot(`${P}_3hiding.png`); }
await park();

// ---- 4. gunfire near it
ok('it comes out of hiding', await calm());
const c4 = cat().p.slice(), gun = spotNear(c4, 3.5, 5);
await watch(c4, 4, 6.5, gun); await sleep(400);
ct.at(gun, 0, 0); await sleep(500);
ct.clear();
ct.shoot([gun[0], gun[1] + 1.6, gun[2]], [gun[0] + 0.3, gun[1] + 9, gun[2]]); // (into the air)
const ran = await until(() => cat().state === 'run', 1500);
await shot(`${P}_4bolt.png`);
ok(`the CT fires into the air ${dist2(gun, c4).toFixed(1)} m from it: it hisses and bolts`, ran && meows('hiss').length > 0);
await sleep(900);
await shot(`${P}_4gone.png`);
ct.at(away.ct, 0, 0); await park();

// ---- 5. a bullet through it
ok('it comes out of hiding', await calm());
const c5 = cat().p.slice(), shooter = spotNear(c5, 2.5, 4, true);
if (shooter) {
  await watch(c5, 3.7, 6, shooter); await sleep(300);
  ct.at(shooter, 0, 0); await sleep(600);
  ct.clear();
  ct.shoot([shooter[0], shooter[1] + 1.6, shooter[2]], [cat().p[0], cat().p[1] + 0.15, cat().p[2]]);
  const hit = await until(() => cat().state === 'air', 1500);
  await shot(`${P}_5shot.png`);
  ok(`the CT shoots it from ${dist2(shooter, c5).toFixed(1)} m: thrown, screeching`, hit && meows('screech').length > 0);
  await until(() => cat().state !== 'air', 3000);
  ok(`back on its feet on a floor (${f2(cat().p)}), unhurt (still there)`, !!floorUnder(cat().p) && !!cat());
} else console.log('  (no clear shot at it from 2.5-4 m: skipped)');
ct.at(away.ct, 0, 0); await park();

// ---- 6. Tom in camo, crouched a few metres off: it gives him away
ok('it comes out of hiding', await calm());
const c6 = cat().p.slice(), lurk = spotNear(c6, 4, 7);
tom.send({ t: 'camo', on: true });
tom.at(lurk, 0, 1);
await sleep(400);
ok(`Tom in camo (${tom.me?.camoOn}), crouched ${dist2(lurk, c6).toFixed(1)} m from it`, !!tom.me?.camoOn);
ct.clear();
// (the browser's player stays away meanwhile: a player standing still near it would be followed instead; he comes to
// look once the meowing starts)
const met = await until(() => meows('meow').length > 0 && dist2(cat().p, lurk) < 1.8, 150000);
ok(`it goes up to him and meows (${meows('meow').length} meows, ${dist2(cat().p, lurk).toFixed(2)} m)`, met);
await watch(lurk, 4, 6.5); await sleep(700);
await shot(`${P}_6meow.png`);
await until(() => meows('meow').length >= 2, 8000);
await shot(`${P}_6meow2.png`);
tom.send({ t: 'camo', on: false });
tom.at(away.tom, 0, 0); await park();

// ---- 7. left alone: it wanders; a picture of each perch it gets up on
ct.cats.length = 0;
const perches = CAT.spots.filter(s => s.perch && s.id !== 'basket' && s.id !== 'bowl'), seenPerch = new Set();
let next = Date.now() + 30000, n7 = 0;
for (const end = Date.now() + WANDER * 1000; Date.now() < end;) {
  const c = cat();
  const on = c && perches.find(s => dist2(c.p, s.perch) < 0.35 && Math.abs(c.p[1] - s.perch[1]) < 0.12 && !seenPerch.has(s.id));
  if (on) {
    seenPerch.add(on.id);
    if (await watch(c.p, 2.6, 4.5)) { await sleep(900); await shot(`${P}_7perch_${on.id}.png`); }
    await park();
  } else if (Date.now() > next && c) {
    next = Date.now() + 30000;
    if (await watch(c.p, 3.7, 5.5)) { await sleep(900); await shot(`${P}_7wander${n7++}.png`); }
    await park();
  }
  await sleep(250);
}
const seen = ct.cats.slice();
let moved = 0, bad = 0;
for (let i = 1; i < seen.length; i++) moved += Math.hypot(seen[i].p[0] - seen[i - 1].p[0], seen[i].p[2] - seen[i - 1].p[2]);
for (const s of seen) if (s.state !== 'air' && !floorUnder(s.p)) bad++;
ok(`${WANDER} s alone: it moved ${moved.toFixed(1)} m (${[...new Set(seen.map(s => s.state))].join(', ')}); ${bad} snapshots off a floor; up on: ${[...seenPerch].join(', ') || '(no perch)'}`, moved > 3 && bad === 0);

// ---- 8. night: the living room dark, the cat awake: its eyes glow
let dcNight = null;
if (M.night) {
  await admin({ action: 'restart' }); await sleep(1500);
  await until(() => ct.phase === 'live', 10000);
  // the CT flips the living room's switch (lampa7, by the door at z -5) and goes away again
  ct.at([-19.71, 0.813, -4.6]); await sleep(400);
  ct.send({ t: 'use', on: true }); await sleep(100); ct.send({ t: 'use', on: false }); await sleep(400);
  ct.at(away.ct);
  await tp([-21.0, 0.813, 3.0], Math.PI / 2 + 0.3, -0.6); // (by the basket: it wakes up and comes over)
  ct.clear();
  await until(() => meows('mrrp').length > 0, 10000);
  await until(() => cat().state === 'sit', 9000); await sleep(800);
  await shot(`${P}_8eyes.png`);
  await tp([-15.8, 0.813, 1.2], Math.PI / 2 + 0.25, -0.1); await sleep(500); // (across the room: it comes after him)
  await shot(`${P}_8eyesfar.png`);
  ok(`the cat awake in the dark room (${cat()?.state}): its eyes are drawn (see the pictures)`, cat()?.state !== 'sleep');
  await tp([-16.0, 0.813, 0.5], -Math.PI / 2, 0); await sleep(800);
  dcNight = await drawCost('night, looking away from it');
}
console.log(`draw cost: +${dcIn.toFixed(1)} with the cat and basket in view, +${dcOut.toFixed(1)} looking away${dcNight !== null ? `, +${dcNight.toFixed(1)} at night looking away` : ''}`);
console.log('cat messages:', (await msgs()).filter(m => m.t === 'catMeow').map(m => m.k).join(', ') || '(none)');
console.log('ERRORS:', errors.join('\n') || '(none)');
ok('no page errors', !errors.length);
ct.close(); tom.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
