// The cat on a live server: the hooks in server.js (snapshot key `cat`, the catMeow message, shots, mines, rounds).
// Server: srv.sh with MAP=cs_mansion START_MONEY=16000 BOTS=0 ROUND_TIME=900 (GAME_PORT 4060). A T and a CT:
//   1. round start: the cat asleep in its basket;
//   2. the T stands still next to it: it follows him ("mrrp"), and walks after him when he moves;
//   3. the T lays a PMN under it: it sets it off, is thrown (screech), lands on a floor, runs and hides, never dies;
//   4. the CT fires a shot near it: it hisses, runs away from him and hides;
//   5. the CT shoots it: thrown, screech, unhurt;
//   6. the T, in ghillie camo, crouches a few metres off: it goes to him and meows;
//   7. left alone for WANDER seconds (default 150): it moves about, always on a floor, inside the map;
//   8. a new round (the CT kills the T) and an admin restart: back asleep in its basket each time.
import { player, sleep, until, dist2, dist3, STATE } from './catclient.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav } from '../../../lib/nav.js';
import { CAT } from '../../../shared/cat.js';

const PORT = +(process.env.GAME_PORT || 4060), WANDER = +(process.env.WANDER || 150);
const map = MAPS.cs_mansion, world = new CollisionWorld(map), nav = buildNav(map, world);
let fails = 0;
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) fails++; };
const f2 = p => (p ? p.map(v => v.toFixed(2)).join(', ') : '-');
const admin = async action => (await fetch(`http://127.0.0.1:${PORT}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'testpass', ...action }) })).json();
const floorUnder = p => world.raycast([p[0], p[1] + 0.15, p[2]], [0, -1, 0], 1.6, 'solid');
const los = (a, b) => { const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d); return !world.raycast(a, d.map(v => v / l), l, 'bullet'); };
const CALM = ['sit', 'walk', 'trot', 'wash', 'stretch', 'loaf', 'sleep'];
// a floor near p, between rMin and rMax metres off on the same level, optionally with a clear line to the cat
function spotNear(p, rMin, rMax, needLos = false) {
  const here = nav.nodeAt(p, 3), at = here >= 0 ? nav.pos(here) : p; // (the floor under it: it may be on a sill)
  for (let i = 0; i < 400; i++) {
    const n = nav.randomNear(here, at, rMax, 0.15);
    if (n < 0) continue;
    const q = nav.pos(n), d = dist2(q, p);
    if (d < rMin || nav.tight[n] || nav.low[n]) continue;
    if (needLos && !los([q[0], q[1] + 1.6, q[2]], [p[0], p[1] + 0.15, p[2]])) continue;
    return q;
  }
  return null;
}

const t = await player('Tom', 'T', PORT), ct = await player('Carl', 'CT', PORT);
const away = { t: [25.5, 0, -8], ct: [25.5, 0, -5] }; // (out in the street, where the cat never goes)
const cat = () => t.cat;
const meows = k => t.meows.filter(m => m.k === k);
ok('both joined', t.alive !== undefined && ct.ws.readyState === 1);

// ---- 1. a fresh match: the cat in its basket
// (the second player starts the game "in 3 seconds": let that happen first, or it would undo the restart's buying)
await until(() => t.phase === 'freeze' || t.phase === 'live', 8000);
await sleep(500);
await admin({ action: 'restart' });
await until(() => t.phase === 'freeze', 6000);
await sleep(300);
ok(`round start: the cat in its basket (${f2(cat()?.p)}), ${cat()?.state}`, cat() && dist2(cat().p, CAT.basket) < 0.1 && cat().state === 'sleep');
t.send({ t: 'buy', item: 'camo' }); t.send({ t: 'buy', item: 'pmn' });
await until(() => t.phase === 'live', 8000);
ok(`the round is live (${t.phase}); camo and a PMN bought (${t.got('msg').slice(-2).map(m => m.text).join('; ')})`, t.phase === 'live' && t.me?.camo && t.me?.inv?.pmn > 0);
ct.at(away.ct);

// ---- 2. following
t.clear();
const by = [-21.0, 0.91, 3.4];
t.at(by, Math.PI / 2, 0);
ok('the T stands still 1.6 m from it: it follows him ("mrrp")', await until(() => meows('mrrp').length > 0, 9000));
await until(() => dist2(cat().p, by) < 1.9 && cat().state === 'sit', 8000);
ok(`it comes up to him and sits (${dist2(cat().p, by).toFixed(2)} m, ${cat().state})`, dist2(cat().p, by) < 1.9 && cat().state === 'sit');
const by2 = [-20.0, 0.91, -1.5];
t.at(by2, 0, 0);
ok('he walks 5 m off: it walks after him', await until(() => ['walk', 'trot'].includes(cat().state), 4000));
const caught = await until(() => dist2(cat().p, by2) < 1.9 && cat().state === 'sit', 12000);
ok(`and catches him up (${dist2(cat().p, by2).toFixed(2)} m)`, caught);

// ---- 3. a PMN under it
t.clear();
const c3 = cat().p.slice();
t.send({ t: 'mine', k: 'pmn', p: c3, yaw: 0 });
await sleep(300);
ok(`the T lays a PMN under it (${f2(c3)})`, t.got('mines').some(m => m.list.length > 0) && t.me?.inv?.pmn === 0);
ok('armed, it goes off under the cat', await until(() => t.got('boom').some(b => b.k === 'pmn'), 4000));
const thrown = await until(() => cat().state === 'air', 1500);
ok(`the cat is thrown (${cat().state}), screeching`, thrown && meows('screech').length > 0);
await until(() => cat().state !== 'air', 3000);
await sleep(150);
ok(`it lands on a floor (${f2(cat().p)}) and runs (${cat().state})`, !!floorUnder(cat().p) && ['run', 'hide'].includes(cat().state));
const hid = await until(() => cat().state === 'hide', 12000);
ok(`and hides (${cat().state}); still in every snapshot (it never dies)`, hid && t.cats.slice(-50).every(Boolean));
ok(`the T (who laid it) is unhurt and alive (${t.got('dmg').length} hits)`, t.alive !== false && !t.got('kill').some(k => k.v === t.me?.id));
t.at(away.t, 0, 0);

// ---- 4. a shot near it
ok('it comes out of hiding', await until(() => CALM.includes(cat().state), 40000));
await until(() => ['sit', 'loaf', 'sleep', 'wash'].includes(cat().state), 30000);
const c4 = cat().p.slice(), gun = spotNear(c4, 3.5, 4.5);
ct.at(gun, 0, 0); await sleep(400);
t.clear();
ct.shoot([gun[0], gun[1] + 1.6, gun[2]], [gun[0] + 0.3, gun[1] + 9, gun[2]]); // (into the air)
const ran = await until(() => cat().state === 'run', 1500);
ok(`the CT fires into the air ${dist2(gun, c4).toFixed(1)} m from it: it hisses and runs`, ran && meows('hiss').length > 0);
await until(() => cat().state === 'hide', 12000);
ok(`it hides (${cat().state}) further from him (${dist2(gun, c4).toFixed(1)} -> ${dist2(gun, cat().p).toFixed(1)} m)`, cat().state === 'hide' && dist2(gun, cat().p) > dist2(gun, c4) + 2);
ct.at(away.ct, 0, 0);

// ---- 5. a bullet through it
ok('it comes out of hiding', await until(() => CALM.includes(cat().state), 40000));
await until(() => ['sit', 'loaf', 'sleep', 'wash'].includes(cat().state), 30000);
const c5 = cat().p.slice(), shooter = spotNear(c5, 2.5, 4, true);
if (shooter) {
  ct.at(shooter, 0, 0); await sleep(600);
  t.clear();
  const eye = [shooter[0], shooter[1] + 1.6, shooter[2]];
  ct.shoot(eye, [cat().p[0], cat().p[1] + 0.15, cat().p[2]]);
  const hit = await until(() => cat().state === 'air', 1500);
  ok(`the CT shoots it from ${dist2(shooter, c5).toFixed(1)} m: thrown, screeching`, hit && meows('screech').length > 0);
  await until(() => cat().state !== 'air', 3000);
  ok(`back on its feet on a floor (${f2(cat().p)}), running; still there`, !!floorUnder(cat().p) && ['run', 'hide'].includes(cat().state));
} else console.log('  (no clear shot at it from 2.5-4 m: skipped)');
ct.at(away.ct, 0, 0);

// ---- 6. the T in camo, crouched a few metres off: it gives him away
ok('it comes out of hiding', await until(() => CALM.includes(cat().state), 40000));
await until(() => ['sit', 'loaf', 'sleep', 'wash'].includes(cat().state), 30000);
const c6 = cat().p.slice(), lurk = spotNear(c6, 4, 7) || spotNear(c6, 2.5, 10);
t.send({ t: 'camo', on: true });
t.at(lurk, 0, 1);
await sleep(300);
ok(`camo on (${t.me?.camoOn}), crouched ${dist2(lurk, c6).toFixed(1)} m from it`, !!t.me?.camoOn);
t.clear();
const met = await until(() => meows('meow').length > 0 && dist2(cat().p, lurk) < 1.8, 150000);
ok(`it goes up to him and meows (${meows('meow').length} meows, ${dist2(cat().p, lurk).toFixed(2)} m)`, met);
ok(`a meow is positional: sent with where the cat is (${JSON.stringify(meows('meow')[0]?.p)})`, meows('meow')[0]?.p?.length === 3);
const again = await until(() => meows('meow').length >= 2 && dist2(cat().p, lurk) < 1.3 && cat().state === 'sit', 15000);
ok(`and again, sitting at his feet (${meows('meow').length} meows, ${dist2(cat().p, lurk).toFixed(2)} m, ${cat().state})`, again);
t.send({ t: 'camo', on: false });
t.at(away.t, 0, 0);

// ---- 7. left alone: it moves about, on floors, inside the map
t.cats.length = 0;
const t7 = Date.now();
await sleep(WANDER * 1000);
const seen = t.cats.slice(), B = map.bounds;
let bad = 0, moved = 0, far = 0;
for (let i = 0; i < seen.length; i++) {
  const p = seen[i].p;
  if (p[0] < B.min || p[0] > B.max || p[2] < B.min || p[2] > B.max || p[1] < -10) bad++;
  else if (seen[i].state !== 'air' && !floorUnder(p)) { if (bad < 5) console.log('  no floor under', f2(p), seen[i].state); bad++; }
  if (i) moved += dist3(p, seen[i - 1].p);
  far = Math.max(far, dist3(p, seen[0].p));
}
const states = [...new Set(seen.map(s => s.state))];
ok(`${((Date.now() - t7) / 1000).toFixed(0)} s alone: ${seen.length} snapshots, ${bad} off a floor or outside the map`, seen.length > WANDER * 10 && bad === 0);
ok(`it moved about: ${moved.toFixed(1)} m walked, up to ${far.toFixed(1)} m from where it was (${states.join(', ')})`, moved > 5);

// ---- 8. a new round, and a restart: back in its basket each time
t.clear(); ct.clear();
t.at(away.t, 0, 0); ct.at([27, 0, -8], Math.PI / 2, 0);
await sleep(600);
for (let i = 0; i < 12 && !ct.got('kill').length; i++) {
  ct.shoot([27, 1.62, -8], [25.5, 1.55, -8]); // (in the head)
  await sleep(350);
}
ok(`the CT kills the T (${ct.got('kill').length})`, ct.got('kill').length > 0);
const ended = await until(() => ct.got('roundEnd').length > 0, 3000);
ok('the round ends', ended);
await until(() => ct.got('round').length > 0 || t.phase === 'freeze', 12000);
await sleep(300);
ok(`a new round: the cat back in its basket asleep (${f2(cat()?.p)}, ${cat()?.state})`, cat() && dist2(cat().p, CAT.basket) < 0.1 && cat().state === 'sleep');
await until(() => t.phase === 'live', 8000);
await sleep(4000);
t.clear();
await admin({ action: 'restart' });
await until(() => t.phase === 'freeze', 6000);
await sleep(300);
ok(`an admin restart: in its basket again (${f2(cat()?.p)}, ${cat()?.state})`, cat() && dist2(cat().p, CAT.basket) < 0.1 && cat().state === 'sleep');
t.close(); ct.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
