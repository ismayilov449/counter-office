// public/js/walls.js in Node (no browser, no server): a fake page, real three.js, the real maps and collision. Runs the
// entry points main.js calls (init, setMap, localShot, remoteShot, update, round, onSnapshot, and the wet gun and the
// floating bodies once they exist) on cs_mansion and cs_mansion_night and checks what they do. Run:
//   node --import ./dev/test-scripts/walls/register.mjs dev/test-scripts/walls/clientsmoke.mjs
import * as THREE from 'three';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { WALLS } from '../../../shared/walls.js';

let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) passes++; else fails++; console.log((cond ? 'PASS ' : 'FAIL ') + what); };
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };

// ---- a fake page; the clock is ours (T, ms)
let T = 100000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => T }, configurable: true, writable: true });
const element = tag => {
  const cls = new Set();
  const e = {
    tag, style: {}, children: [], textContent: '', id: '', parentNode: null,
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle(c, f = !cls.has(c)) { if (f) cls.add(c); else cls.delete(c); return f; } },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { this.children.push(c); c.parentNode = this; return c; },
    after() {}, remove() {},
  };
  let html = '';
  Object.defineProperties(e, {
    className: { get: () => [...cls].join(' '), set: v => { cls.clear(); for (const c of String(v).split(/\s+/)) if (c) cls.add(c); } },
    innerHTML: { get: () => html, set: v => { html = v; } },
  });
  return e;
};
const els = new Map(['hud', 'ammo', 'bottom-right', 'game'].map(id => [id, element('div')]));
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) });
globalThis.document = {
  createElement: tag => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx2d } : element(tag)),
  getElementById: id => els.get(id) || null,
  querySelector: () => null,
  body: element('body'),
};

globalThis.window = globalThis.window || {}; // (audio.js looks for speech; no sound here: floodKit() is null)
await import('../../../public/js/roomlight.js'); // (the page has it: the room light on every Lambert material)
const walls = await import('../../../public/js/walls.js');

let map = MAPS.cs_mansion, coll = new CollisionWorld(map);
const scene = new THREE.Scene();
const puffs = [], emits = [];
const fx = { decalMat: new THREE.MeshBasicMaterial(), puff: (...a) => puffs.push(a), emit: (...a) => emits.push(a), sparks() {}, flashLight() {}, tracer() {} };
const me = { id: 1, alive: true, p: [-10, 0.813, -1], v: [0, 0, 0], driving: null, riding: null, slot: 'primary', inv: {} };
const remotes = new Map();
const net = { handlers: {}, send() {} };
const hud = { small() {}, center() {} };
const game = { phase: 'live', lights: { power: true } };
walls.init({ scene, net, fx, me, game, coll: () => coll, remotes, hud, map: () => map });
const camera = new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 300);
const look = (p, d) => { camera.position.set(...p); camera.lookAt(p[0] + d[0], p[1] + d[1], p[2] + d[2]); camera.updateMatrixWorld(); };

for (const id of ['cs_mansion', 'cs_mansion_night']) {
  console.log(`---- ${id}`);
  map = MAPS[id];
  coll = new CollisionWorld(map);
  walls.setMap(map);
  let dbg = walls.debug();
  ok(dbg.on && dbg.patched >= 6, `on, ${dbg.patched} materials patched (the walls' paints, the rubble, the decals, the rings)`);
  // the patched shaders: both patches applied (the room light and the holes) on a Lambert and a basic material
  const lam = new THREE.MeshLambertMaterial();
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  fx.decalMat.onBeforeCompile(sh);
  ok(sh.fragmentShader.includes('wallsA[ i ]') && sh.vertexShader.includes('vWallsPos') && sh.uniforms.wallsN, 'the decals\' shader gets the hole cut');
  ok(fx.decalMat.customProgramCacheKey().endsWith('+walls'), 'and its own program key');
  const { paintMaterial } = await import('../../../public/js/world.js');
  const plaster = paintMaterial('mplaster');
  const sh2 = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  plaster.onBeforeCompile(sh2);
  ok(sh2.fragmentShader.includes('wallsA[ i ]') && sh2.fragmentShader.includes('uRoomAmb') && sh2.vertexShader.includes('vRoomPos') && sh2.vertexShader.includes('vWallsPos'),
    'a plaster wall\'s Lambert shader gets the room light and the hole cut');
  ok(plaster.customProgramCacheKey() === 'room-light+walls' && lam.customProgramCacheKey() === 'room-light', 'patched walls share one program key; other Lambert materials keep theirs');
  ok(!new Set([...['brick', 'stone', 'slate', 'mblock']].map(k => paintMaterial(k).customProgramCacheKey())).has('room-light+walls'), 'brick, stone and slate aren\'t patched');

  // your own shot through the hall's wall into the living room
  walls.round();
  puffs.length = 0;
  walls.localShot([-10, 2.0, -1], [-1, 0, 0], 'ak47');
  dbg = walls.debug();
  const h = dbg.list[0];
  ok(dbg.holes === 1 && dbg.rings === 2, `one hole, a ring on each side (${dbg.holes}, ${dbg.rings})`);
  ok(h && h.a[0] > -12.9 && h.a[0] < -12.8 && h.b[0] < -13.31 && h.b[0] > -13.4 && Math.abs(h.a[1] - 2) < 1e-6 && h.r > 0.015 && h.r < 0.04, `the hole runs through the wall (${h?.a.map(v => v.toFixed(2))} → ${h?.b.map(v => v.toFixed(2))}, r ${h?.r.toFixed(3)})`);
  ok(puffs.length === 1 && puffs[0][0][0] < -13.31, 'plaster dust out of the far side');
  look([-10, 2, -1], [-1, 0, 0]);
  walls.update(1 / 60, T, camera);
  ok(walls.debug().cut === 1, 'cut out of the walls while it\'s in front of you');
  look([-10, 2, -1], [1, 0, 0]);
  walls.update(1 / 60, T, camera);
  ok(walls.debug().cut === 0, 'not while you look away (beyond 2 m)');
  look([-45, 2, -1], [1, 0, 0]);
  walls.update(1 / 60, T, camera);
  ok(walls.debug().cut === 0, `not from further than ${WALLS.far} m`);
  // a cluster of holes grows
  for (let i = 0; i < 8; i++) walls.localShot([-10, 2.0 + i * 0.01, -1 + i * 0.01], [-1, 0, 0], 'ak47');
  dbg = walls.debug();
  ok(dbg.list.at(-1).r > dbg.list[0].r * 2, `a wall shot full of holes: the later holes are bigger (${dbg.list[0].r.toFixed(3)} → ${dbg.list.at(-1).r.toFixed(3)})`);
  // someone else's shots: AWP from the street through the front door and the hall's wall; a shotgun's pellets
  walls.round();
  const o = [0, 2.0, -1], d = [-1, 0, 0];
  walls.remoteShot({ t: 'shot', id: 2, o, w: 'awp', tr: [[...d, 23.27, 0, 1]] });
  ok(walls.debug().holes === 2, `an AWP from the street: holes in the front door and the hall's wall (${walls.debug().holes})`);
  walls.remoteShot({ t: 'shot', id: 2, o, w: 'awp', tr: [[...d, 9.0, 1, 0]] });
  ok(walls.debug().holes === 3, 'a bullet that stopped in someone between the walls holes only the first wall');
  walls.round();
  const pellets = Array.from({ length: 9 }, (_, i) => [...norm([-1, (i % 3 - 1) * 0.02, (Math.floor(i / 3) - 1) * 0.02]), 13.3, 0, 1]);
  walls.remoteShot({ t: 'shot', id: 2, o: [-10, 2, -1], w: 'm3', tr: pellets });
  ok(walls.debug().holes === 9 && walls.debug().rings === 18, `a shotgun through the wall: 9 holes (${walls.debug().holes})`);
  walls.remoteShot({ t: 'shot', id: 2, o: [-10, 2, -1], w: 'knife', tr: [[-1, 0, 0, 1.9, 0, 0]] });
  ok(walls.debug().holes === 9, 'a knife holes nothing');
  // the cap
  for (let i = 0; i < WALLS.keep + 40; i++) walls.localShot([-10, 1.2 + (i % 20) * 0.1, -3 + Math.floor(i / 20) * 0.2], [-1, 0, 0], 'ak47');
  dbg = walls.debug();
  ok(dbg.holes === WALLS.keep && dbg.rings === WALLS.keep * 2, `at most ${WALLS.keep} holes kept (${dbg.holes})`);
  look([-11, 2, -1], [-1, 0, 0]);
  walls.update(1 / 60, T, camera);
  ok(walls.debug().cut === WALLS.cut, `the nearest ${WALLS.cut} are cut (${walls.debug().cut})`);
  walls.round();
  ok(walls.debug().holes === 0 && walls.debug().rings === 0 && walls.debug().cut === 0, 'a new round: no holes');

  // ---- 2.2: burst pipes and cut cables from the snapshot's `wa`
  dbg = walls.debug();
  ok(dbg.hints > 200, `the hints on the walls (radiators, sockets) are one mesh (${dbg.hints} vertices)`);
  const solidAt = p => map.boxes.some(b => !b.glass && [0, 1, 2].every(k => p[k] > b.min[k] + 0.005 && p[k] < b.max[k] - 0.005));
  const rads = dbg.hintSpots.filter(h => h.kind === 'radiator'), socks = dbg.hintSpots.filter(h => h.kind === 'socket');
  const badRad = rads.filter(h => solidAt(h.c)), badSock = socks.filter(h => solidAt(h.c));
  console.log('  radiators:', rads.map(h => `${h.run} (${h.c.map(v => v.toFixed(2)).join(', ')})`).join('; '), `| ${socks.length} sockets`);
  ok(rads.length === 4 && !badRad.length && socks.length >= 10 && !badSock.length, `the four radiators stand in the open by their walls, ${socks.length} sockets (${badRad.map(h => h.run).join(' ') || 'none inside anything'})`);
  const wa = [
    [[-7.8, 0.81, 6.15, 0.8, 2, 6.5, -1, 0], [-7.8, 0.81, 7.26, 0.8, 2, 6.91, 1, 1]],
    [[-7.8, 1.66, 6.5, 0, -1, 0.9], [-7.8, 1.66, 6.91, 0, 1, 0.9]],
    [[-7.65, 1.11, 6.5, 0, -1, 1], [-7.65, 1.11, 6.91, 0, 1, 0]],
  ];
  look([-9, 2.4, 4], [1, -0.3, 1]);
  walls.onSnapshot(wa);
  for (let i = 0; i < 30; i++) { T += 50; walls.update(0.05, T, camera); }
  dbg = walls.debug();
  ok(dbg.patches === 2 && dbg.wetMesh && dbg.sprays === 2 && dbg.sprayMesh && dbg.ends === 2, `the wet patches, the sprays and the cut cable's ends are drawn (${dbg.patches}, ${dbg.sprays}, ${dbg.ends})`);
  const emitted = emits.length;
  ok(emitted > 0, `drops splash and the live end sparks (${emitted} particles)`);
  let threw = null;
  try { net.handlers.waZap({ t: 'waZap', p: [-7.65, 1.11, 6.5], v: [[-8.3, 1.7, 5.85]] }); } catch (e) { threw = e; }
  ok(!threw, `the electrocution's flash and crackle ('waZap')${threw ? ': ' + threw.message : ''}`);
  walls.onSnapshot(undefined);
  T += 50; walls.update(0.05, T, camera);
  dbg = walls.debug();
  ok(dbg.patches === 0 && !dbg.wetMesh && !dbg.sprayMesh && dbg.ends === 0, 'nothing in the snapshot: nothing drawn');
  walls.onSnapshot(wa);
  walls.round();
  T += 50; walls.update(0.05, T, camera);
  ok(walls.debug().patches === 0 && !walls.debug().sprayMesh, 'a new round clears them at once');
}
// other maps: nothing
map = MAPS.de_dust2;
coll = new CollisionWorld(map);
walls.setMap(map);
walls.localShot([0, 1.5, 0], [1, 0, 0], 'awp');
ok(!walls.debug().on && walls.debug().holes === 0 && walls.debug().hints === 0, 'de_dust2: off, no holes, no hints');
walls.onSnapshot([[[-7.8, 0.81, 6.15, 0.8, 2, 6.5, -1, 0]], [], []]);
walls.update(0.05, T, camera);
ok(walls.debug().patches === 0, 'de_dust2: a stray `wa` is ignored');

console.log(`\n${passes} passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
