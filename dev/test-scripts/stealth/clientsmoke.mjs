// public/js/stealth.js in Node (no browser, no server): a fake page, real three.js, the real maps and collision. Runs
// what main.js calls (init, setMap, onSnapshot, frame, hint, progressLabel, the message handlers) and checks what they
// do. Run:  node --import ./dev/test-scripts/stealth/register.mjs dev/test-scripts/stealth/clientsmoke.mjs
import * as THREE from 'three';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { STEALTH, stealthOf } from '../../../shared/stealth.js';
import { CHIMNEY as C } from '../../../shared/maps/mansion_stealth.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

// ---- a fake page; the clock is ours (T, ms)
let T = 100000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => T }, configurable: true, writable: true });
const element = tag => ({ tag, style: {}, children: [], appendChild(c) { this.children.push(c); return c; }, classList: { toggle() {}, add() {}, remove() {} } });
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}) });
const els = new Map();
globalThis.document = {
  createElement: tag => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx2d } : element(tag)),
  getElementById: id => els.get(id) || null,
  body: element('body'),
};
globalThis.window = { speechSynthesis: null }; // (audio.js looks for the speech voices on load)
await import('../../../public/js/roomlight.js');
const stealth = await import('../../../public/js/stealth.js');

let map = MAPS.cs_mansion, coll = new CollisionWorld(map);
const said = [], sent = [];
const me = { id: 1, alive: true, p: [-17.5, 0.813, 1.0], v: [0, 0, 0], yaw: 0, pitch: 0, driving: null, riding: null, act: null, crouch: false, onGround: true, eyeH: 1.62 };
const remotes = new Map(), cars = new Map();
const net = { handlers: { s() {} }, send: m => sent.push(m) };
const hud = { small: t => said.push(t), progress() {} };
const fires = [], puffs = [];
const fx = {
  fires,
  fire(id, p, life, r, ceil) { fires.push({ id, p, life, r, ceil, nextSmoke: 0 }); },
  fireOut(id) { const i = fires.findIndex(f => f.id === id); if (i >= 0) fires.splice(i, 1); },
  puff(p) { puffs.push(p); },
};
const scene = new THREE.Scene();
stealth.init({ scene, me, net, hud, fx, game: {}, remotes, cars, coll: () => coll, map: () => map });
const step = (dt = 1 / 60) => { T += dt * 1000; stealth.frame(dt, T); };
const setMap = id => { map = MAPS[id]; coll = new CollisionWorld(map); stealth.setMap(map); };

ok('handlers on the game\'s Net', typeof net.handlers.stTo === 'function' && typeof net.handlers.stSfx === 'function' && typeof net.handlers.s === 'function');
ok('one instanced mesh for the footprints, hidden while empty', scene.children.filter(o => o.isInstancedMesh).length === 1 && !scene.children.find(o => o.isInstancedMesh).visible);
const mesh = scene.children.find(o => o.isInstancedMesh);
{
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  mesh.material.onBeforeCompile(sh, null);
  ok('its shader: room lighting, each print\'s darkness and fading by age, its own program', sh.vertexShader.includes('vDark = aDark') && sh.fragmentShader.includes('uSootNow - vBorn')
    && sh.vertexShader.includes('vRoomPos') && mesh.material.customProgramCacheKey() === 'room-light-soot');
}

// ---- the ladder in the flue
setMap('cs_mansion');
const lad = map.ladders.filter(l => l.chimney);
ok('cs_mansion: the chimney\'s rungs are a ladder (once)', lad.length === 1 && Math.abs(lad[0].min[1] - C.hearth) < 1e-6 && Math.abs(lad[0].max[1] - 10.4) < 1e-6
  && lad[0].min[2] > C.fz1 && lad[0].max[2] <= C.fz2 + 1e-6 && lad[0].min[0] >= C.fx1 && lad[0].max[0] <= C.fx2 && lad[0].n[1] === -1);
setMap('cs_mansion_night');
ok('cs_mansion_night: the same ladder, still once', map.ladders.filter(l => l.chimney).length === 1 && map.ladders.includes(lad[0]));
setMap('de_dust2');
ok('de_dust2: no chimney, no ladder, no hint', !map.ladders.some(l => l.chimney) && stealth.hint() === null && !stealthOf(map));
step();
setMap('cs_mansion');

// ---- E's hints
me.p = [-19.3, C.hearth, 3.85];
ok('at the hearth: hold E to light it', /^Hold E to light the fire/.test(stealth.hint() || ''));
me.p = [-17.5, 0.813, 1.0];
ok('in the middle of the living room: nothing', stealth.hint() === null);
me.p = [-19.3, 9.75, 5.7];
ok('on the roof by the stack: E climbs down', stealth.hint() === 'Press E to climb down the chimney');
me.p = [-19.3, 5.0, 4.8];
ok('inside the flue: nothing of ours (the ladder\'s own hint)', stealth.hint() === null);
ok('the progress label for lighting', stealth.progressLabel('fireplace') === 'Lighting the fire...' && stealth.progressLabel('flood') === null);

// ---- the fire
stealth.onSnapshot({ f: 1 });
ok('lit: the rungs are taken away', lad[0].max[1] < -100);
step();
const f = fires.find(x => x.id === 'fireplace');
ok('lit: the Molotov\'s flames in the firebox, no smoke in the room', f && Math.abs(f.p[0] + 19.3) < 0.01 && f.p[2] > C.fz1 && f.p[2] < C.fz2 && Math.abs(f.p[1] - C.hearth) < 1e-6 && f.nextSmoke === Infinity);
for (let i = 0; i < 60; i++) step();
ok('smoke out of the top of the stack', puffs.length >= 2 && puffs.every(p => p[1] > C.top && Math.abs(p[0] + 19.3) < 0.3));
fires.length = 0; step();
ok('the flames come back if the effects lost them (a new round\'s clear)', fires.some(x => x.id === 'fireplace'));
me.p = [-19.3, C.hearth, 3.85];
ok('lit: no hint at the hearth', stealth.hint() === null);
me.p = [-19.3, 9.75, 5.7];
ok('lit: at the top, "the fire below is lit"', /fire below is lit/.test(stealth.hint() || ''));
stealth.onSnapshot(undefined);
ok('out: the rungs are back, the flames gone', lad[0].max[1] === 10.4 && !fires.some(x => x.id === 'fireplace'));

// ---- the server puts us somewhere
net.handlers.stTo({ p: [-19.3, 10.1, 4.82], c: 1 });
ok('stTo: there, crouched, still', me.p[1] === 10.1 && me.crouch && me.v.every(v => v === 0));
me.crouch = false;

// ---- soot: footprints behind a sooty player (a remote walking through the living room, then across the roof)
const r = { id: 2, alive: true, buf: [1], p: [-21.5, 0.8128, 2.0] };
remotes.set(2, r);
stealth.onSnapshot({ s: [[2, 20]] });
step();
for (let i = 0; i < 120; i++) { r.p = [-21.5 + i * 0.04, 0.8128, 2.0 - i * 0.02]; step(); } // 4.8 m east and 2.4 m north, 2 s
const prints = () => {
  const m = new THREE.Matrix4(), out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    const e = m.elements;
    out.push({ x: e[12], y: e[13], z: e[14], up: [e[8], e[9], e[10]].map(v => v / Math.hypot(e[8], e[9], e[10])), toe: [e[4], e[5], e[6]].map(v => v / Math.hypot(e[4], e[5], e[6])) });
  }
  return out;
};
let pr = prints();
const walk = [0.04, -0.02].map(v => v / Math.hypot(0.04, 0.02));
ok(`a print every step: ${pr.length} for 5.4 m (about 12)`, pr.length >= 11 && pr.length <= 13 && mesh.visible);
ok('flat on the living room\'s floor', pr.every(p => Math.abs(p.y - 0.8228) < 0.02 && p.up[1] > 0.99));
ok('toes along the walk', pr.every(p => Math.abs(p.toe[0] - walk[0]) < 0.05 && Math.abs(p.toe[2] - walk[1]) < 0.05));
const side = pr.map(p => (p.x - (-21.5)) * walk[1] - (p.z - 2.0) * walk[0]); // signed distance from the walk's line
ok('left, right, left...', side.every((s, i) => Math.abs(Math.abs(s) - 0.09) < 0.02 && (i === 0 || Math.sign(s) !== Math.sign(side[i - 1]))));
ok('fresh soot: dark prints', [...stealth._debug().dark().slice(0, pr.length)].every(d => d > 0.85));
// the roof: up the west slope, south of the stack (the faces' slope, not the collision's steps)
const n0 = mesh.count;
r.p = [-20.6, 9.25, 5.8]; step(); // (a jump: no print)
const roofY = x => { const h = coll.raycast([x, 13, 5.8], [0, -1, 0], 6, 'solid'); return 13 - h.t; };
for (let i = 0; i <= 50; i++) { const x = -20.6 + i * 0.04; r.p = [x, roofY(x), 5.8]; step(); }
pr = prints().slice(n0);
ok(`prints on the roof too: ${pr.length}`, pr.length >= 3);
ok('lying on the roof\'s slope (tilted, not on the collision\'s steps)', pr.length && pr.every(p => p.up[1] < 0.95 && p.up[0] < -0.2) && pr.every(p => Math.abs(p.y - (9.32 + (p.x + 20.15) * 1.044 / 1.7) - 0.01 * p.up[1]) < 0.03));
// the soot wears off: fainter prints
stealth.onSnapshot({ s: [[2, 3]] });
for (let i = 0; i < 40; i++) { r.p = [-21.5 + i * 0.04, 0.8128, 3.0]; step(); }
ok('worn soot: faint prints', [...stealth._debug().dark().slice(n0 + pr.length, mesh.count)].every(d => d < 0.45 && d > 0.25));
stealth.onSnapshot({});
const n1 = mesh.count;
for (let i = 0; i < 40; i++) { r.p = [-21.5 + i * 0.04, 0.8128, 3.5]; step(); }
ok('no longer sooty: no more prints', mesh.count === n1);
// the local player, out of the flue: told once
said.length = 0;
me.p = [-17.5, 0.813, 1.0];
stealth.onSnapshot({ s: [[1, 19]] });
stealth.onSnapshot({ s: [[1, 18.9]] });
ok('sooty yourself: told once', said.filter(t => /covered in soot/.test(t)).length === 1);
for (let i = 0; i < 40; i++) { me.p = [-17.5 - i * 0.04, 0.813, 1.0]; step(); }
ok('and you leave prints too', mesh.count > n1 + 2);
// a new map clears them
setMap('cs_mansion_night');
ok('a new map: no prints', mesh.count === 0 && !mesh.visible);
console.log(process.exitCode ? 'SOME FAILED' : 'all ok');
