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
const els = new Map([['crosshair', element('div')]]);
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
const game = { phase: 'live' };
stealth.init({ scene, me, net, hud, fx, game, remotes, cars, coll: () => coll, map: () => map });
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
  && lad[0].min[2] > C.fz1 && Math.abs(lad[0].max[2] - (C.fz2 + 0.1)) < 1e-6 && lad[0].min[0] >= C.fx1 && lad[0].max[0] <= C.fx2 && lad[0].n[1] === -1);
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
me.p = [-19.3, C.hearth, 4.8]; me.onGround = true;
ok('standing in the firebox: how to climb (not the light switch behind the wall)', stealth.hint('Press E to switch the lights off') === 'The chimney: look up and hold W to climb');
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
// along the slope (south, level that way), with the feet where a body really stands on the stepped roof: on the
// highest box under it, up to 0.3 m above the box under each print (the browser test found none like that at first)
{
  const n = mesh.count, feetY = (x, z) => Math.max(...[-0.35, -0.17, 0, 0.17, 0.35].map(dx => { const h = coll.raycast([x + dx, 13, z], [0, -1, 0], 6, 'solid'); return 13 - h.t; }));
  r.p = [-19.3, feetY(-19.3, 6.0), 6.0]; step();
  for (let i = 0; i <= 75; i++) { const z = 6.0 + i * 0.04; r.p = [-19.3, feetY(-19.3, z), z]; step(); }
  const along = prints().slice(n);
  ok(`walking along the roof's slope (feet on the highest step under the body, ${(feetY(-19.3, 7) - 9.75).toFixed(2)} m over the print's): ${along.length} prints, tilted`, along.length >= 5 && along.every(p => p.up[1] < 0.95 && p.y > 9.5));
}
// the soot wears off: fainter prints
stealth.onSnapshot({ s: [[2, 3]] });
const nWorn = mesh.count;
for (let i = 0; i < 40; i++) { r.p = [-21.5 + i * 0.04, 0.8128, 3.0]; step(); }
ok('worn soot: faint prints', mesh.count > nWorn && [...stealth._debug().dark().slice(nWorn, mesh.count)].every(d => d < 0.45 && d > 0.25));
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
stealth.onSnapshot({});

// ---- 4.2 creaks: whoever steps on a creaky spot is heard (the local player too), walking or crouching
const log = stealth._debug().creakLog;
const heard = () => log.splice(0, log.length);
const top = (x, z, y) => { const h = coll.raycast([x, y + 0.5, z], [0, -1, 0], 1.5, 'solid'); return h ? y + 0.5 - h.t : y; };
// a remote walking up the hall's south flight at walking (Shift) speed, 2.6 m/s, in the middle of the treads
const climb = (who, x, z0, z1, speed, crouch = false) => {
  let y = 0.813;
  const n = Math.ceil((Math.abs(z1 - z0) / speed) * 60);
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n, t = top(x, z, y + 0.45);
    if (t <= y + 0.5) y = t;
    who.p = [x, y, z]; who.c = crouch ? 1 : 0; who.crouch = crouch;
    step();
  }
};
heard();
climb(r, -12.18, 0.0, 5.4, 2.6);
let h = heard();
ok(`a remote walking (Shift) up the middle of the south flight: 3 creaks (${h.length}), on the stairs, full`, h.length === 3 && h.every(c => c.kind === 'step' && c.g === 1));
climb(r, -11.7, 5.4, 0.0, 5);
ok('running down along the open side: none', heard().length === 0);
climb(r, -12.18, 0.0, 5.4, 1.7, true);
h = heard();
ok(`crouching up the middle: still 3, quieter (${h.map(c => c.g).join(' ')})`, h.length === 3 && h.every(c => c.g < 0.7));
// a floorboard: stepping on creaks once; standing still, nothing more; walking along it, again every 0.7 m
r.p = [-17.0, 0.813, 1.0]; r.c = 0; step(); heard();
for (let i = 0; i <= 30; i++) { r.p = [-17.0 - i * 0.04, 0.813, -4.5]; step(); } // into "by the doorway to the kitchen" (x -18.4..-17.4) and 0.8 m along it
h = heard();
ok(`along a floorboard 0.8 m: 2 creaks (${h.length}), board`, h.length === 2 && h.every(c => c.kind === 'board'));
for (let i = 0; i < 60; i++) step();
ok('standing still on it: no more', heard().length === 0);
// the local player
remotes.delete(2);
me.p = [-17.0, 0.813, 3.3]; me.onGround = true; step(); heard();
for (let i = 0; i < 40; i++) { me.p = [-18.5 - i * 0.02, 0.813, 3.3]; step(); } // in front of the fireplace (x -19.7..-18.9, z 3.0..3.6)
ok('you hear your own creak (in front of the fireplace)', heard().length === 1);
me.onGround = false;
for (let i = 0; i < 40; i++) { me.p = [-19.5 + i * 0.02, 0.813, 3.3]; step(); }
ok('not in the air', heard().length === 0);
me.onGround = true;

// ---- 4.3 the trunk
setMap('cs_mansion');
const gcar = { id: 1, type: 'car', p: [-19.75, 0, -17.9], yaw: -Math.PI / 2, wrecked: false };
const pickup = { id: 0, type: 'pickup', p: [-4, 0, 17], yaw: -Math.PI / 2, wrecked: false };
cars.set(0, pickup); cars.set(1, gcar);
me.p = [-21.6, 0, -16.6]; // beside the back end of the garage's car
ok('beside the back of the car: E opens the trunk', stealth.hint('Press E to drive the car') === 'Press E to open the trunk and hide in it' && stealth.hint('') === 'Press E to open the trunk and hide in it');
ok('not over a door or a switch (they come first on the server)', stealth.hint('Press E to open the door') === null && stealth.hint('Press E to switch the lights off') === null);
game.phase = 'freeze';
ok('not in freeze time', stealth.hint('Press B to buy') === null);
game.phase = 'live';
me.p = [-19.75, 0, -16.3];
ok('beside its doors: nothing of ours (E gets in)', stealth.hint('Press E to drive the car') === null);
me.p = [-4 - 2.8, 0, 17];
ok('behind the pickup: nothing', stealth.hint('Press E to drive the car') === null);
// someone else in it: not drawn, no name, no footsteps from the car
const hid = { id: 3, alive: true, buf: [1], p: [-21.35, -0.2, -17.9], c: 1, model: { visible: true }, tag: { visible: true }, stepAcc: 2 };
remotes.set(3, hid);
stealth.onSnapshot({ k: [[3, 1]] });
step();
ok('a hider: not drawn, no name over him, no footsteps', hid.inTrunk && !hid.model.visible && !hid.tag.visible && hid.stepAcc === 0);
stealth.onSnapshot({});
hid.model.visible = true; step();
ok('out again: drawn (main.js shows him; we leave him alone)', !hid.inTrunk && hid.model.visible);
remotes.delete(3);
// ourselves in it
me.spawnSeq = 4;
stealth.onSnapshot({ k: [[1, 1]] });
const cover = document.body.children.find(e => e.id === 'stealth-trunk');
ok('in the trunk: the dark view (black but a strip of light), no crosshair', me.trunk === 1 && stealth.inTrunk() && cover && cover.style.display === 'block' && /linear-gradient/.test(cover.style.background) && els.get('crosshair').style.visibility === 'hidden');
ok('looking out the back', Math.abs(Math.atan2(Math.sin(me.yaw - (gcar.yaw + Math.PI)), Math.cos(me.yaw - (gcar.yaw + Math.PI)))) < 1e-9);
ok('E jumps out (over everything); nothing else of ours', /Press E to jump out/.test(stealth.inside() || '') && stealth.hint('') === null);
me.p = [0, 0, 0];
ok('updateLocal: we go where the car goes, nothing else', stealth.local() === true && Math.hypot(me.p[0] - (-21.35), me.p[2] + 17.9) < 1e-6);
const cam = new THREE.PerspectiveCamera();
me.yaw = gcar.yaw + Math.PI + 1.5; me.pitch = -1;
stealth.frame(1 / 60, T, cam);
ok('the camera under the lid at the back, turning at most 0.7 rad, a little up and down', Math.abs(cam.position.x - (-19.75 - 1.95)) < 1e-6 && Math.abs(cam.position.y - 0.95) < 1e-6 && Math.abs(cam.rotation.y - (gcar.yaw + Math.PI + 0.7)) < 1e-6 && Math.abs(cam.rotation.x + 0.4) < 1e-6);
gcar.p = [-11.75, 0, -17.9]; stealth.local();
ok('driven away: still in it, where the car is', Math.abs(me.p[0] - (-13.35)) < 1e-6);
net.handlers.stTo({ p: [-14.75, 0, -17.9], c: 0 });
ok('out (stTo): where the server says, the view and the crosshair back', me.trunk == null && !stealth.inTrunk() && cover.style.display === 'none' && els.get('crosshair').style.visibility === '' && me.p[0] === -14.75 && stealth.local() === false);
stealth.onSnapshot({ k: [[1, 1]] });
me.spawnSeq = 5; me.p = [27, 0, 1]; // a new life (main.js's spawn put us on the street)
ok('a new life: out of it (and where the spawn put us)', stealth.local() === false && me.trunk == null && me.p[0] === 27);
stealth.onSnapshot({});
setMap('de_dust2');
me.p = [0, 0, 0];
ok('de_dust2: no trunk hints (the trunk is the Mansion maps\' only)', stealth.hint('') === null);
console.log(process.exitCode ? 'SOME FAILED' : 'all ok');
