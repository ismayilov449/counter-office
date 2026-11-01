// The cat's AI (lib/cat.js) in scenes, without a server: the real map, nav grid and collision world, a virtual clock
// and fake players. Checks: it starts asleep in its basket; follows a player who stands still next to it; runs from a
// shot and hides; a bullet throws it (it screeches and never dies); it goes and meows at a hidden player (camo, crouched
// in a dark room, playing dead); it sets off a PMN under it and a MON-50 tripwire across it and survives; it wades out
// of a flooded cellar (the deepWater hook) and never goes back in; a reset puts it back in its basket; nothing on other maps.
// usage: node dev/test-scripts/cat/ai.mjs [map=cs_mansion]
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { buildNav } from '../../../lib/nav.js';
import { createCat } from '../../../lib/cat.js';
import { CAT, CAT_STATE } from '../../../shared/cat.js';

const mapId = process.argv[2] || 'cs_mansion';
let map = MAPS[mapId];
const world = new CollisionWorld(map);
const nav = buildNav(map, world);
const STATE = Object.fromEntries(Object.entries(CAT_STATE).map(([k, v]) => [v, k]));
let fails = 0;
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) fails++; };
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const f2 = p => p.map(v => v.toFixed(2)).join(', ');

let clock = 0, deep = null;
const players = new Map(), game = { lights: {}, mines: [] }, sounds = [], booms = [];
const cat = createCat({
  map: () => map, world: () => world, nav: () => (map.id === mapId ? nav : null), players: () => players, game: () => game, now: () => clock,
  broadcast: m => sounds.push({ at: clock, ...m }),
  // like server.js: the mine is gone, its blast (blastMap -> cat.blast) follows
  detonateMine: m => { game.mines.splice(game.mines.indexOf(m), 1); booms.push({ at: clock, k: m.k }); cat.blast([m.p[0], m.p[1] + 0.15, m.p[2]], m.k); },
  deepWater: p => !!deep?.(p),
});
const dt = 1000 / 32;
// run the clock for ms (or until cond() is true); returns whether cond happened
function run(ms, cond = null) {
  const end = clock + ms;
  while (clock < end) {
    clock += dt;
    cat.tick(clock);
    if (cond && cond()) return true;
  }
  return !cond;
}
const C = () => cat.debug();
const heard = k => sounds.filter(s => s.k === k);
const floorUnder = p => world.raycast([p[0], p[1] + 0.15, p[2]], [0, -1, 0], 1.6, 'solid');
const player = (id, p, extra = {}) => { const q = { id, p, alive: true, team: 'T', c: 0, hidden: false, ...extra }; players.set(id, q); return q; };

// ---- round start: asleep in the basket
cat.reset();
ok(`round start: in its basket (${f2(C().p)}), asleep`, d2(C().p, CAT.basket) < 0.05 && C().state === CAT_STATE.sleep);
ok('the snapshot part: cat: [x, y, z, yaw, state, purring]', Array.isArray(cat.snap().cat) && cat.snap().cat.length === 6);

// ---- following: a player stands still 2 m from it
const A = player(1, [-20.6, 0.813, 3.6]);
sounds.length = 0;
ok('a player standing still next to it: after ~3 s it follows him ("mrrp")', run(6000, () => C().follow === 1) && heard('mrrp').length === 1);
run(4000);
ok(`it comes up to him and sits (${STATE[C().state]}, ${d2(C().p, A.p).toFixed(2)} m)`, d2(C().p, A.p) < CAT.follow.keep + 0.6 && C().state === CAT_STATE.sit);
ok(`not purring 1.4 m away (${cat.snap().cat[5]})`, d2(C().p, A.p) < CAT.purr || cat.snap().cat[5] === 0);
const by = A.p.slice();
A.p = [C().p[0] + 0.8, A.p[1], C().p[2]];
run(1000);
ok(`he steps right up to it (${d2(C().p, A.p).toFixed(2)} m): it purrs (${cat.snap().cat[5]})`, cat.snap().cat[5] === 1);
A.p = by;
run(1000);
A.p = [-20.0, 0.813, -1.5];
ok('he walks off 5 m and stands: it walks after him', run(1000, () => C().path > 0 && (C().state === CAT_STATE.walk || C().state === CAT_STATE.trot)));
run(8000);
ok(`and catches up (${d2(C().p, A.p).toFixed(2)} m, ${STATE[C().state]})`, d2(C().p, A.p) < CAT.follow.keep + 0.6 && C().follow === 1);
A.p = [2, 0, 9]; // (out on the lawn, 25 m away in an instant: it gives up)
run(1000);
ok(`he's suddenly far off: it stops following (${C().follow})`, C().follow === null);
players.delete(1);

// ---- a shot 7 m away (not at it): it hisses, runs away and hides
run(30000);
const c0 = C().p.slice(), gun = [c0[0] + 5, c0[1] + 1.5, c0[2] + 5];
const dGun0 = d2(c0, gun);
sounds.length = 0;
if (process.env.VERBOSE) console.log('  before the shot:', JSON.stringify(C()));
cat.shot({ id: 9 }, gun, [[1, 0, 0]], false);
if (process.env.VERBOSE) console.log('  after the shot:', JSON.stringify(C()));
ok(`a shot ${dGun0.toFixed(1)} m away: it runs (${STATE[C().state]}, then ${C().then})${dGun0 < 6 ? ' and hisses' : ''}`, (C().state === CAT_STATE.run || C().state === CAT_STATE.hide) && (dGun0 >= 6 || heard('hiss').length === 1));
run(15000, () => C().state === CAT_STATE.hide);
ok(`it hides (${STATE[C().state]}) further from the gun (${dGun0.toFixed(1)} -> ${d2(C().p, gun).toFixed(1)} m)`, C().state === CAT_STATE.hide && d2(C().p, gun) > dGun0 + 2);
ok(`on a floor (${f2(C().p)})`, !!floorUnder(C().p));
const hidAt = clock;
run(40000, () => C().state !== CAT_STATE.hide);
ok(`it stays hidden for ${((clock - hidAt) / 1000).toFixed(0)} s (${CAT.hide.join('-')}), then stretches`, clock - hidAt >= CAT.hide[0] * 1000 - 500 && C().state === CAT_STATE.stretch);

// ---- a bullet through it: thrown, screech, back on its feet, running
run(5000);
// (a shooter 3 m off on whichever side has a clear line to it)
const c1 = C().p.slice(), aim = [c1[0], c1[1] + 0.15, c1[2]];
let eye = null, dir = null, dl = 0, clear = false;
for (let k = 0; k < 16 && !clear; k++) {
  eye = [c1[0] + Math.sin(k * 0.4) * 3, c1[1] + 1.2, c1[2] + Math.cos(k * 0.4) * 3];
  dir = aim.map((v, i) => v - eye[i]); dl = Math.hypot(...dir);
  clear = !world.raycast(eye, dir.map(v => v / dl), dl, 'bullet');
}
sounds.length = 0;
cat.shot({ id: 9 }, eye, [dir.map(v => v / dl)], false);
if (clear) {
  ok('shot: thrown through the air with a screech', C().air && heard('screech').length === 1);
  run(3000, () => !C().air);
  ok(`lands on a floor (${f2(C().p)}) and runs off (${STATE[C().state]})`, !C().air && !!floorUnder(C().p) && (C().state === CAT_STATE.run || C().state === CAT_STATE.hide));
} else console.log('  (no clear shot at it where it is: skipped)');
ok('still there (it never dies)', !!cat.snap().cat);
run(45000, () => CALM());
function CALM() { return [CAT_STATE.sit, CAT_STATE.walk, CAT_STATE.trot, CAT_STATE.wash, CAT_STATE.stretch, CAT_STATE.loaf, CAT_STATE.sleep].includes(C().state) && C().then !== 'hide'; }

// ---- hidden players: it goes and meows at them
function seekTest(what, q) {
  sounds.length = 0;
  const met = run(240000, () => C().seek === q.id && heard('meow').length && d2(C().p, q.p) < 1.8);
  ok(`${what}: it goes up to him (${d2(C().p, q.p).toFixed(2)} m) and meows (${heard('meow').length})`, met);
  let trace = '';
  const again = run(15000, () => { if (process.env.VERBOSE && Math.round(clock) % 250 < dt) trace += `  ${(clock / 1000).toFixed(2)} ${f2(C().p)} ${STATE[C().state]} then ${C().then} seek ${C().seek} path ${C().path} d ${d2(C().p, q.p).toFixed(2)}
`; return heard('meow').length >= 2 && d2(C().p, q.p) < 1.3 && C().state === CAT_STATE.sit; });
  if (!again && trace) console.log(`  him at ${f2(q.p)}
` + trace);
  ok(`  and meows again, sitting at his feet (${heard('meow').length} meows, ${d2(C().p, q.p).toFixed(2)} m, ${STATE[C().state]})`, again);
  players.delete(q.id);
  run(20000, () => !C().seek);
}
// near the living room (the cat's way back from hiding is random: put him where it is now, a few metres off)
function near(p, r = 5) {
  const here = nav.nodeAt(p, 3);
  for (let i = 0; i < 200; i++) {
    const n = nav.randomNear(here, p, r, 0.3);
    if (n < 0 || d2(nav.pos(n), p) <= 3) continue;
    // (in the same room: a clear line from the cat, so it can get to him)
    const q = nav.pos(n), a = [p[0], p[1] + 0.3, p[2]], dir = [q[0] - a[0], q[1] + 0.3 - a[1], q[2] - a[2]], l = Math.hypot(...dir);
    if (!world.raycast(a, dir.map(v => v / l), l, 'move')) return q;
  }
  return null;
}
cat.reset();
run(500);
seekTest('ghillie camo on', player(2, near(C().p), { hidden: true, c: 1 }));
// crouched in a dark room: the room it's in, lights off
const roomOf = p => (map.rooms || []).find(r => p[0] > r.min[0] && p[0] < r.max[0] && p[1] + 0.5 > r.min[1] && p[1] + 0.5 < r.max[1] && p[2] > r.min[2] && p[2] < r.max[2]);
cat.reset();
run(500);
const darkSpot = near(C().p), room = roomOf(darkSpot);
if (room) {
  game.lights[room.group] = false;
  const q = player(3, darkSpot, { c: 0 });
  sounds.length = 0;
  run(30000);
  ok(`standing up in the dark room (${room.group}): left alone (${heard('meow').length} meows)`, !heard('meow').length || C().seek !== 3);
  q.c = 1;
  seekTest(`crouched in the dark room (${room.group})`, q);
  delete game.lights[room.group];
} else console.log('  (no room with a light there: dark-room test skipped)');
cat.reset();
run(500);
seekTest('playing dead (p.playingDead)', player(4, near(C().p), { playingDead: true }));
player(5, near(C().p));
sounds.length = 0;
run(60000);
ok(`a player in plain sight (not still long next to it): no meows (${heard('meow').length})`, !heard('meow').length);
players.delete(5);

// ---- a PMN under it: it sets it off, is thrown, screeches, survives and hides
cat.reset();
run(1000);
sounds.length = 0; booms.length = 0;
const c2 = C().p.slice();
game.mines.push({ id: 1, k: 'pmn', p: [c2[0], c2[1], c2[2]], yaw: 0, armAt: clock + 1500 });
run(1400);
ok('a PMN under it, not armed yet: nothing', !booms.length);
run(400);
ok(`armed: it sets it off (${booms.map(b => b.k)})`, booms.length === 1 && booms[0].k === 'pmn');
ok('thrown, with a screech', C().air && heard('screech').length === 1);
run(3000, () => !C().air);
ok(`it lands on a floor (${f2(C().p)}, ${d3(C().p, c2).toFixed(2)} m off) and runs (${STATE[C().state]})`, !!floorUnder(C().p) && (C().state === CAT_STATE.run || C().state === CAT_STATE.hide));
run(20000, () => C().state === CAT_STATE.hide);
ok(`and hides (${STATE[C().state]}); still there`, C().state === CAT_STATE.hide && !!cat.snap().cat);

// ---- a MON-50's tripwire across it
cat.reset();
run(1000);
booms.length = 0;
const c3 = C().p.slice(), yaw = 0.7, fwd = [-Math.sin(yaw), 0, -Math.cos(yaw)];
game.mines.push({ id: 2, k: 'mon50', p: [c3[0] - fwd[0] * 3, c3[1], c3[2] - fwd[2] * 3], yaw, armAt: clock + 1500 });
run(2000);
ok(`a MON-50's tripwire across it: it sets it off (${booms.map(b => b.k)}), scared (${STATE[C().state]})`, booms.length === 1 && booms[0].k === 'mon50' && !!cat.snap().cat);

// ---- blasts: close by in the open it's thrown; behind a wall, only scared
cat.reset();
run(1000);
const c4 = C().p.slice();
cat.blast([c4[0] + 1, c4[1] + 0.3, c4[2]], 'he');
ok(`an HE 1 m away: thrown`, C().air);
run(30000, () => CALM());

// ---- the floodgate hook: deep water in the cellar
// (leading it there: a player stands still next to it until it follows him, then goes down into the cellar)
cat.reset();
run(500);
const cellar = cat.spots().find(s => s.id === 'cellar');
deep = null;
const guide = player(6, [-21.2, 0.813, 3.0]);
run(8000, () => C().follow === 6);
guide.p = cellar.at.slice();
const inCellar = run(60000, () => d2(C().p, guide.p) < 2 && Math.abs(C().p[1] - guide.p[1]) < 0.3);
ok(`it follows him down into the cellar (${f2(C().p)})`, inCellar);
players.delete(6);
if (inCellar) {
  // (the water 0.8 m deep in the cellar, its stairwell and the smugglers' tunnel: FLOOD_AREAS on the flood branch)
  const AREAS = [[-22.9, -5.49, -13.31, 4.5], [-15.54, -9.75, -13.31, -5.49], [-14.8, 4.5, -13.5, 5.0], [-14.8, 5.0, 14.8, 6.3], [13.5, 6.3, 14.8, 16.8]];
  deep = p => p[1] < -1.4 - 0.12 && p[1] > -2.6 && AREAS.some(([x1, z1, x2, z2]) => p[0] > x1 && p[0] < x2 && p[2] > z1 && p[2] < z2);
  run(40000, () => C().p[1] > -1);
  ok(`the cellar floods (deepWater): it gets out (${f2(C().p)})`, C().p[1] > -1);
  let back = 0;
  for (let i = 0; i < 20 * 32 * 60 / 32; i++) { run(1000); if (deep(C().p)) back++; }
  ok(`and keeps out of it for the next 20 minutes (${back} s in the water)`, back === 0);
  deep = null;
} else console.log('  (it never went to the cellar in 20 min: flood test skipped)');

// ---- a new round: back in its basket
run(5000);
cat.reset();
ok(`reset (a new round): back in its basket asleep (${f2(C().p)})`, d2(C().p, CAT.basket) < 0.05 && C().state === CAT_STATE.sleep && !C().path && !C().follow && !C().seek);
// other maps: no cat
map = MAPS.de_dust2 || Object.values(MAPS).find(m => !m.id.startsWith('cs_mansion'));
cat.reset();
cat.tick(clock += 50);
ok(`on ${map.id}: no cat (snapshot ${JSON.stringify(cat.snap())})`, !cat.snap().cat && cat.debug() === null);
cat.shot({ id: 9 }, [0, 1, 0], [[1, 0, 0]], false); cat.blast([0, 0, 0], 'he');
ok('shots and blasts there do nothing', cat.debug() === null);
map = MAPS[mapId];
cat.tick(clock += 50);
ok('back on the Mansion: in its basket again', d2(C().p, CAT.basket) < 0.05);
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
