// node client-node.mjs — runs public/js/elevator.js (the browser's part) in node, without a browser: the import paths
// the browser uses ('/shared/…', 'three', 'three/addons/…') are mapped onto the repo and node_modules. Builds the models
// for cs_mansion, then plays the server's states through it (a ride up with our player standing in the cabin, the
// blackout braking it, the hatch) frame by frame at 60 fps and checks: no errors, the player rides on the cabin's floor,
// the panels and the lit buttons are placed, the hint and E's target are right, the elevAim messages go out.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
register('data:text/javascript,' + encodeURIComponent(`
const repo = ${JSON.stringify(pathToFileURL(repo).href)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('/shared/')) return { url: repo + spec.slice(1), shortCircuit: true };
  if (spec === 'three') return { url: repo + 'node_modules/three/build/three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: repo + 'node_modules/three/examples/jsm/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}`));
const { createElevator } = await import(pathToFileURL(repo + 'public/js/elevator.js').href);
const THREE = await import(pathToFileURL(repo + 'node_modules/three/build/three.module.js').href);
const { MAPS } = await import(pathToFileURL(repo + 'shared/maps/index.js').href);
const { CollisionWorld } = await import(pathToFileURL(repo + 'shared/collision.js').href);
const { movePlayer, PLAYER } = await import(pathToFileURL(repo + 'shared/physics.js').href);
const { tripTime, roofAt } = await import(pathToFileURL(repo + 'shared/elevator.js').href);

let fails = 0, checks = 0;
const ok = (cond, what) => { checks++; if (!cond) { fails++; console.log('FAIL', what); } };
const map = MAPS.cs_mansion, E = map.elevator, S = E.stops;
const scene = new THREE.Scene(), sent = [], played = [];
let clock = 100000; // the server's clock (ms); performance.now stands in for the frame clock
const audio = { muffled: false, loop: (id, p, kind, lv) => played.push(['loop', id, kind, lv]), play: (n) => played.push(['play', n]), out: () => { throw new Error('no audio in node'); } };
const me = { p: [0, 0, 0], v: [0, 0, 0], onGround: true, crouch: false, alive: true, yaw: 0, pitch: 0, eyeH: PLAYER.eye, viewY: 0 };
let coll = new CollisionWorld(map);
const mines = new Map(), satchels = new Map();
const el = createElevator({ scene, me, net: { send: m => sent.push(m) }, audio, serverNow: () => clock, coll: () => coll, mines, satchels });
el.load(map);
ok(scene.children.length === 4, `the models are in the scene (${scene.children.length}: cabin, panels, lights, plates)`);
ok(coll.elev.length === 28 && map.ladders.filter(l => l.elev).length === 2, 'its boxes in the collision world, its two ladders in map.ladders');
el.load(map);
ok(scene.children.length === 4 && map.ladders.filter(l => l.elev).length === 2, 'loading the map again: nothing twice');
const state = (m, d = [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]], extra = {}) => el.onState({ t: 'elevState', m, d, h: 0, q: [], p: 1, rm: [], rs: [], ...extra });
let frameNo = 0;
const frame = (ms = 1000 / 60) => {
  clock += ms; frameNo += ms;
  el.local(ms / 1000, frameNo);
  movePlayer(me, ms / 1000, coll.move(null, me.p, 2));
  el.update(ms / 1000, frameNo);
};
// standing in front of the ground floor's call button, looking at it
state([S[1], S[1], clock, 0]);
const c = E.call[1];
Object.assign(me, { p: [c[0] + 0.2, 0.91, E.out.z2 + 0.8], yaw: 0 });
const eye = [me.p[0], me.p[1] + PLAYER.eye, me.p[2]], dv = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
me.yaw = Math.atan2(-dv[0], -dv[2]); me.pitch = Math.asin(dv[1] / Math.hypot(...dv));
frame();
ok(sent.at(-1)?.t === 'elevAim' && sent.at(-1).a === 'c1', `looking at the call button: E aims at it (${JSON.stringify(sent.at(-1))})`);
ok(el.hint() === 'Press E to call the lift', `hint: ${el.hint()}`);
// in the cabin, riding up (doors shut), at uneven frame rates
const mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2];
Object.assign(me, { p: [mid[0], S[1], mid[1]], v: [0, 0, 0], yaw: 0, pitch: 0, onGround: true, viewY: S[1] });
frame();
const t0 = clock + 50;
state([S[1], S[2], t0, 0], undefined, { q: [2] });
let worst = 0;
const T = tripTime(S[1], S[2]) * 1000 + 400;
while (clock < t0 + T) { frame(8 + Math.random() * 30); worst = Math.max(worst, Math.abs(me.p[1] - coll.elev[0].max[1])); }
ok(Math.abs(me.p[1] - S[2]) < 0.002 && me.onGround && worst < 0.002, `rode up on the cabin's floor every frame (8-38 ms frames; off by ${worst.toFixed(4)} m at worst)`);
ok(Math.abs(me.viewY - S[2]) < 0.01, `the view came along (${me.viewY.toFixed(3)})`);
ok(played.some(p => p[0] === 'loop' && p[2] === 'hum' && p[3] === 1) && played.at(-1)?.[3] === 0, 'the motor hummed while it moved, quiet now');
// the blackout half way down: braked, then the hint says stuck; aiming up: the hatch
const t1 = clock + 20;
state([S[2], S[0], t1, 0], undefined, { q: [0] });
while (clock < t1 + 2500) frame();
const tb = Math.round(clock);
state([S[2], S[0], t1, tb], [[0, 0, tb, 1], [0, 0, tb, 1], [0, 0, tb, 1], [0, 0, tb, 1]], { p: 0, q: [0] });
for (let i = 0; i < 60; i++) frame();
const stuck = coll.elev[0].max[1];
ok(Math.abs(me.p[1] - stuck) < 0.002 && stuck > S[1] + 1 && stuck < S[2] - 0.5, `braked between floors at ${stuck.toFixed(2)}: still on its floor`);
ok(/stuck in the dark/.test(el.hint() || ''), `hint: ${el.hint()}`);
const H = E.hatch, hc = [(H.x1 + H.x2) / 2, stuck + E.cabin.ceil, (H.z1 + H.z2) / 2], e2 = [me.p[0], me.p[1] + me.eyeH, me.p[2]], up = hc.map((v, k) => v - e2[k]);
me.yaw = Math.atan2(-up[0], -up[2]); me.pitch = Math.asin(up[1] / Math.hypot(...up));
frame();
ok(sent.at(-1)?.a === 'h' && el.hint() === 'Press E to climb out through the roof hatch', `looking up: the hatch (${sent.at(-1)?.a}, "${el.hint()}")`);
el.onTo({ t: 'elevTo', p: [-20.515, roofAt(E, stuck) + 0.001, -4.01], c: 1 });
for (let i = 0; i < 30; i++) frame();
ok(me.crouch && Math.abs(me.p[1] - roofAt(E, stuck)) < 0.002, `out on the roof, crouching (${me.p[1].toFixed(3)})`);
ok(el.progress('elevforce') && !el.progress('plant'), 'progress label for prying');
// a remote player drawn 100 ms in the past, in the moving cabin: put where the cabin is now
state([S[0], S[1], clock - 1500, 0]);
frame();
const yNow = coll.elev[0].max[1], p = [mid[0], 0, mid[1]];
// (where the cabin was 100 ms ago)
const { motionAt } = await import(pathToFileURL(repo + 'shared/elevator.js').href);
p[1] = motionAt({ y0: S[0], y1: S[1], t0: clock - 1500 - 1000 / 60, tb: 0 }, clock - 100).y;
el.remote(p, clock - 100);
ok(Math.abs(p[1] - yNow) < 1e-6, `a remote rider drawn on the cabin's floor now (${p[1].toFixed(3)} vs ${yNow.toFixed(3)})`);
// the next map without a lift: all gone
el.load(MAPS.de_dust2);
ok(scene.children.length === 0, 'another map: the models are gone');
console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
