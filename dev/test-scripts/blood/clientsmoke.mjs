// public/js/blood.js in Node (no browser, no server): a fake page, real three.js, the real maps and collision. Runs every
// entry point main.js calls (constructor, warm, onSnapshot, update, clear, bandage, speedMul, the message handlers) on
// cs_mansion and cs_mansion_night and checks what they do, and where the drops land: along a street, down the cellar
// stairs, and at every spot a player can stand on the whole map (against the floor under it). Run:
//   node --import ./dev/test-scripts/blood/register.mjs dev/test-scripts/blood/clientsmoke.mjs
import * as THREE from 'three';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { BLOOD, BL_BANDAGING, BL_NODROPS } from '../../../shared/blood.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };

// ---- a fake page; the clock is ours (T, ms), so seconds of game time pass in no time
let T = 100000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => T }, configurable: true, writable: true });
const element = tag => {
  const cls = new Set();
  const e = {
    tag, style: {}, children: [], textContent: '', id: '',
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), toggle(c, f = !cls.has(c)) { if (f) cls.add(c); else cls.delete(c); return f; } },
    appendChild(c) { this.children.push(c); return c; },
  };
  let html = '';
  Object.defineProperties(e, {
    className: { get: () => [...cls].join(' '), set: v => { cls.clear(); for (const c of String(v).split(/\s+/)) if (c) cls.add(c); } },
    innerHTML: { get: () => html, set: v => { html = v; e.lastChild = { firstChild: element('div') }; } },
  });
  return e;
};
const els = new Map(['bottom-left', 'hud'].map(id => [id, element('div')]));
const controls = element('div');
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}) }); // (a canvas: drawing does nothing)
globalThis.document = {
  createElement: tag => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx2d } : element(tag)),
  getElementById: id => els.get(id) || null,
  querySelector: q => (q === '.controls' ? controls : null),
};

await import('../../../public/js/roomlight.js'); // (the page has it: the room lighting on every Lambert material)
const { BloodTrails } = await import('../../../public/js/blood.js');

let map = MAPS.cs_mansion, coll = new CollisionWorld(map);
const said = [], sent = [], sounds = [];
const me = { id: 1, alive: true, p: [27, 0, -10], driving: null, riding: null, nextShot: 0, drawUntil: 0, scope: 2, nadeHold: { k: 'he' } };
const remotes = new Map();
const net = { handlers: { s() {} }, send: m => sent.push(m) };
const hud = { small: t => said.push(t) };
const audio = { play: n => sounds.push(n) };
const scene = new THREE.Scene();
const bt = new BloodTrails(scene, { me, remotes, net, hud, audio, coll: () => coll, map: () => map });
const step = (dt = 1 / 60, replay = false) => { T += dt * 1000; bt.update(dt, T, replay); };
const drops = (from = 0) => {
  const m = new THREE.Matrix4(), out = [];
  for (let i = from; i < bt.count; i++) {
    bt.mesh.getMatrixAt(i, m);
    const e = m.elements, s = Math.hypot(e[0], e[1], e[2]);
    out.push({ x: e[12], y: e[13], z: e[14], n: [e[8], e[9], e[10]], size: s });
  }
  return out;
};
// the top of the floor under (x, y, z) in the collision, from just above
const floorY = (x, z, hint) => { const h = coll.raycast([x, hint + 0.6, z], [0, -1, 0], 3, 'solid'); return h && h.n[1] > 0 ? hint + 0.6 - h.t : null; };

// ---- set-up
ok('the message handlers are on the game\'s Net', typeof net.handlers.bloodBandage === 'function' && typeof net.handlers.bloodKit === 'function' && typeof net.handlers.s === 'function');
ok('one instanced mesh in the scene (one draw call), hidden while empty', scene.children.filter(o => o.isInstancedMesh).length === 1 && bt.mesh.count === 0 && !bt.mesh.visible && bt.mesh.instanceMatrix.count === BLOOD.max);
ok('the badge and the bandage bar are on the HUD', els.get('bottom-left').children.includes(bt.badge) && els.get('hud').children.includes(bt.bar));
ok('P is in the Esc menu\'s controls list', controls.children.some(d => /<kbd>P<\/kbd> bandage/.test(d.innerHTML)));
{
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  bt.mesh.material.onBeforeCompile(sh, null);
  ok('the shader: room lighting plus the drying and fading by age, its own program', sh.vertexShader.includes('vBorn = aBorn') && sh.fragmentShader.includes('uBloodNow - vBorn')
    && sh.uniforms.uBloodNow === bt.uNow && sh.vertexShader.includes('vRoomPos') && sh.fragmentShader.includes('roomAmb') && bt.mesh.material.customProgramCacheKey() === 'room-light-blood');
}

// ---- prewarm: one drop now, gone on the next frame
bt.warm([27, 0.01, -9]);
ok('prewarm: one drop to compile the shader', bt.count === 1 && bt.mesh.visible && bt.index && bt.index.polys.length > 100);
step();
ok('gone on the next frame', bt.count === 0 && !bt.mesh.visible);

// ---- a remote player bleeding along the street (x 27, z -16 .. -4: flat, y 0)
const runner = { buf: [{}], p: [27, 0, -16] };
remotes.set(2, runner);
bt.onSnapshot([[2, 2, 0]]);
step();
ok(`the wound: a few drops at once (${bt.count})`, bt.count === 3);
for (let z = -16; z <= -4; z += 0.05) { runner.p = [27, 0, z]; bt.onSnapshot([[2, 2, 0]]); step(); }
const street = drops(3);
ok(`walking 12 m bleeding (medium): ${street.length} drops, about one every ${(12 / street.length).toFixed(2)} m`, street.length >= 12 && street.length <= 24);
ok('they lie flat on the street, 1 cm up', street.every(d => Math.abs(d.y - 0.01) < 0.005 && d.n[1] > 0.999));
ok(`sizes around ${BLOOD.size[2]} m`, street.every(d => d.size > BLOOD.size[2] * 0.69 && d.size < BLOOD.size[2] * 1.31));
ok('the mesh draws them all', bt.mesh.count === bt.count && bt.mesh.visible);
{
  const n0 = bt.count;
  for (let i = 0; i < 600; i++) { bt.onSnapshot([[2, 2, 0]]); step(); } // 10 s standing still
  const n = bt.count - n0;
  ok(`10 s standing still: ${n} drops (one every ~${BLOOD.idle[2]} s)`, n >= 3 && n <= 8);
}
{
  const n0 = bt.count;
  runner.p = [27, 0, -14];
  bt.onSnapshot([[2, 3, 0]]); step();
  for (let z = -14; z <= -8; z += 0.05) { runner.p = [27, 0, z]; bt.onSnapshot([[2, 3, 0]]); step(); }
  const heavy = drops(n0);
  ok(`a heavy bleed: ${heavy.length} drops in 6 m (more, bigger)`, heavy.length >= 9 && heavy.every(d => d.size > BLOOD.size[3] * 0.69));
}
{
  const n0 = bt.count;
  runner.p = [27, 0, 10]; bt.onSnapshot([[2, 1, 0]]); step();
  ok('a jump of more than 5 m (a respawn, a teleport): no line of drops', bt.count === n0);
  for (let z = 10; z <= 14; z += 0.05) { runner.p = [27, 0, z]; bt.onSnapshot([[2, 1, BL_NODROPS]]); step(); }
  ok('in a car (flag 2): no drops', bt.count === n0);
  for (let z = 14; z <= 18; z += 0.05) { runner.p = [27, 0, z]; bt.onSnapshot([[2, 1, BL_BANDAGING]]); step(1 / 60, true); }
  ok('in the kill cam: no drops', bt.count === n0);
  bt.onSnapshot(undefined);
  for (let z = 18; z <= 20; z += 0.05) { runner.p = [27, 0, z]; step(); }
  ok('no longer listed: no drops, forgotten', bt.count === n0 && !bt.bleeders.has(2));
  remotes.set(3, { buf: [], p: [27, 0, 0] });
  bt.onSnapshot([[3, 3, 0]]); step();
  ok('a player with no position yet: nothing', bt.count === n0);
  remotes.delete(3);
}

// ---- the cap: the oldest go first
bt.clear();
for (let i = 0; i < BLOOD.max + 150; i++) bt.drip([25.5 + (i % 30) * 0.1, 0, -8 + Math.floor(i / 30) * 0.2], 1 + (i % 3));
ok(`the cap: ${bt.count} drops after ${BLOOD.max + 150} (max ${BLOOD.max}), the ring goes on at ${bt.next}`, bt.count === BLOOD.max && bt.mesh.count === BLOOD.max && bt.next === 150);
// fading: after BLOOD.life seconds nothing is left to draw
T += (BLOOD.life + 1) * 1000; bt.onSnapshot(undefined); step();
ok(`after ${BLOOD.life} s all have faded: nothing drawn`, bt.count === 0 && !bt.mesh.visible);
for (let i = 0; i < 5; i++) bt.drip([27, 0, -8 + i], 2);
bt.clear();
ok('a new round clears them', bt.count === 0 && !bt.mesh.visible);

// ---- the fountain: no drops in water
ok('in the fountain\'s water: no drop', bt.floor(6, -0.81, -1) === null);

// ---- down the cellar stairs (the house, x -14.4, z -10.4 .. -4)
{
  bt.clear();
  const runnerS = { buf: [{}], p: [-14.4, 0.81, -10.4] };
  remotes.set(2, runnerS);
  bt.onSnapshot([[2, 2, 0]]); step();
  let y = 0.81;
  for (let z = -10.4; z <= -4.0; z += 0.05) { y = floorY(-14.4, z, y) ?? y; runnerS.p = [-14.4, y, z]; bt.onSnapshot([[2, 2, 0]]); step(); }
  const st = drops();
  const off = st.filter(d => { const f = floorY(d.x, d.z, d.y + 0.1); return f == null || Math.abs(f + 0.01 - d.y) > 0.05; });
  ok(`down the stairs to y ${y.toFixed(2)}: ${st.length} drops, ${off.length} more than 5 cm off the step under them${off.length ? ' ' + JSON.stringify(off.slice(0, 3)) : ''}`, st.length >= 8 && !off.length && y < -1.5);
  bt.onSnapshot(undefined); remotes.delete(2);
}

// ---- every spot a player can stand on: where would a drop at his feet go?
function survey(gridStep) {
  const b = map.bounds;
  let n = 0, none = 0, wet = 0, sunk = 0, raised = 0, steep = 0, sum = 0, out = 0;
  const ex = { none: [], sunk: [], raised: [] };
  for (let x = b.min + 0.31; x < b.max; x += gridStep) {
    for (let z = b.min + 0.47; z < b.max; z += gridStep) {
      let top = 40;
      for (let k = 0; k < 8; k++) {
        const h = coll.raycast([x, top, z], [0, -1, 0], 80, 'solid');
        if (!h) break;
        const fy = top - h.t;
        top = h.box.min[1] - 0.01;
        if (h.n[1] <= 0) continue;
        const head = coll.raycast([x, fy + 0.05, z], [0, 1, 0], 1.0, 'solid');
        if (head) continue; // (no room to stand)
        if (map.water?.some(w => x > w.min[0] && x < w.max[0] && z > w.min[2] && z < w.max[2] && fy + 0.05 > w.min[1] && fy + 0.05 < w.max[1])) { wet++; continue; }
        n++;
        const r = bt.floor(x, fy, z);
        if (!r) { none++; if (ex.none.length < 4) ex.none.push([x, fy].map(v => +v.toFixed(2)).concat(+z.toFixed(2))); continue; }
        const dy = r.y - fy;
        sum += Math.abs(dy);
        if (r.n[1] < 0.55) steep++;
        if (dy < -0.12) { sunk++; if (ex.sunk.length < 4) ex.sunk.push([x, fy, z, dy].map(v => +v.toFixed(2))); }
        if (dy > 0.12) { raised++; if (ex.raised.length < 4) ex.raised.push([x, fy, z, dy].map(v => +v.toFixed(2))); }
        if (dy < -0.201 || dy > 0.301) out++;
      }
    }
  }
  return { n, none, wet, sunk, raised, steep, out, mean: sum / Math.max(1, n - none), ex };
}
// the gazebo in the back garden: its floor (0.25 m) is a decor model on the lawn's face; the collision box is the floor
{
  const g = bt.floor(-45.2, 0.25, 0.3);
  ok(`the gazebo: a drop lies on its floor, not on the lawn under it (y ${g?.y.toFixed(3)})`, g && Math.abs(g.y - 0.25) < 0.01);
  const l = bt.floor(-19, 0.91, -2);
  ok(`the living room over the cellar: on the drawn floor (y ${l?.y.toFixed(3)}), under the collision's 0.91`, l && Math.abs(l.y - 0.813) < 0.01);
}
for (const id of ['cs_mansion', 'cs_mansion_night']) {
  if (id !== map.id) {
    map = MAPS[id]; coll = new CollisionWorld(map);
    for (let i = 0; i < 3; i++) bt.drip([27, 0, -8 + i], 2);
    step();
    ok(`a new map (${id}): the drops are cleared, its floors indexed`, bt.count === 0 && bt.map === map && bt.index.polys.length > 100);
  }
  const t0 = Date.now();
  const s = survey(id === 'cs_mansion' ? 0.5 : 1.5);
  const ms = Date.now() - t0;
  console.log(`     ${id}: ${s.n} standing spots (${s.wet} in water left out), ${(ms / Math.max(1, s.n) * 1000).toFixed(0)} us a drop; drawn floor - collision floor: mean ${s.mean.toFixed(3)} m`);
  console.log(`     no floor found: ${s.none} ${JSON.stringify(s.ex.none)}; > 12 cm under the collision top: ${s.sunk} ${JSON.stringify(s.ex.sunk)}; > 12 cm over it: ${s.raised} ${JSON.stringify(s.ex.raised)}`);
  ok(`${id}: a drop finds the floor at ${(100 * (1 - s.none / s.n)).toFixed(2)}% of the spots, within 12 cm of the collision top at ${(100 * (1 - (s.sunk + s.raised) / s.n)).toFixed(2)}% (the rest on a drawn floor up to 0.2 m under it or 0.3 m over it: ${s.out} beyond), never on anything steep`,
    s.n > 1000 && s.none / s.n < 0.005 && (s.sunk + s.raised) / s.n < 0.03 && !s.out && !s.steep);
}
map = MAPS.cs_mansion; coll = new CollisionWorld(map); step();

// ---- the local player: bleeding, the badge, P
said.length = 0;
me.p = [27, 0, -12];
bt.onSnapshot([[1, 2, 0]]); step();
ok(`I bleed: "${said[0]}"`, said[0] === 'You are bleeding — press P to bandage');
ok(`the badge: "${bt.badge.textContent}"`, !bt.badge.classList.contains('hidden') && bt.badge.textContent === `BLEEDING · P bandage (${BLOOD.bandages})`);
{
  const n0 = bt.count;
  for (let z = -12; z <= -6; z += 0.05) { me.p = [27, 0, z]; bt.onSnapshot([[1, 2, 0]]); step(); }
  ok(`my own drops as I walk: ${bt.count - n0}`, bt.count - n0 >= 6);
  me.driving = 0;
  const n1 = bt.count;
  for (let z = -6; z <= -2; z += 0.05) { me.p = [27, 0, z]; bt.onSnapshot([[1, 2, 0]]); step(); }
  ok('driving: no drops (even before the server\'s flag)', bt.count === n1);
  me.driving = null;
}
bt.bandage();
ok('P sends bloodBandage', sent.at(-1)?.t === 'bloodBandage');
net.handlers.bloodBandage({ t: 'bloodBandage', s: 'start', dur: BLOOD.bandage * 1000, left: BLOOD.bandages - 1 });
const until = T + BLOOD.bandage * 1000;
// (the gun goes down: main.js lowers it by (drawUntil - now) / 600, so more than 600 ms ahead swings it round)
ok(`bandaging: slow (x${bt.speedMul()}), no shooting, the gun down (${me.drawUntil - T} ms ahead), no scope, no grenade in hand, a sound`, bt.speedMul() === BLOOD.slow && me.nextShot >= until && me.drawUntil - T === 600 && me.scope === 0 && me.nadeHold === null && sounds.includes('pickup'));
sent.length = 0;
bt.bandage();
ok('P again while bandaging: nothing sent', !sent.length);
bt.onSnapshot([[1, 2, BL_BANDAGING]]); step();
me.nextShot = 0; // (a weapon switch can't let you shoot either)
T += 1000; bt.onSnapshot([[1, 2, BL_BANDAGING]]); step();
ok(`half way: the bar at ${bt.fill.style.width}, the badge hidden, still no shooting`, !bt.bar.classList.contains('hidden') && bt.badge.classList.contains('hidden') && /^(4\d|5\d)%$/.test(bt.fill.style.width) && me.nextShot >= until);
ok(`half way: the gun still down (${me.drawUntil - T} ms ahead)`, me.drawUntil - T === 600);
T += 600; step();
ok(`the last 0.4 s: the gun comes back up (${Math.round(until - T)} ms left, down until the end: ${me.drawUntil === until})`, me.drawUntil === until);
T -= 600 + 1000 / 60;
T += 1000;
net.handlers.bloodBandage({ t: 'bloodBandage', s: 'done', left: BLOOD.bandages - 1 });
bt.onSnapshot(undefined); step();
ok(`done: "${said.at(-1)}", full speed, bar and badge gone`, /Bandaged/.test(said.at(-1)) && bt.speedMul() === 1 && bt.bar.classList.contains('hidden') && bt.badge.classList.contains('hidden'));
bt.onSnapshot([[1, 3, 0]]); step();
ok(`bleeding heavily again: "${bt.badge.textContent}"`, bt.badge.textContent === `BLEEDING HEAVILY · P bandage (${BLOOD.bandages - 1})`);
net.handlers.bloodBandage({ t: 'bloodBandage', s: 'start', dur: BLOOD.bandage * 1000, left: 0 });
me.alive = false; step();
ok('killed while bandaging: the bandaging is forgotten, full speed', bt.bandaging === null && bt.speedMul() === 1);
sent.length = 0;
bt.bandage();
ok('dead: P does nothing', !sent.length);
ok('dead: no badge', bt.badge.classList.contains('hidden'));
me.alive = true;
net.handlers.bloodKit({ t: 'bloodKit', left: BLOOD.bandages });
bt.onSnapshot([[1, 1, 0]]); step();
ok(`a new life: fresh bandages ("${bt.badge.textContent}")`, bt.badge.textContent === `BLEEDING · P bandage (${BLOOD.bandages})`);
said.length = 0;
net.handlers.bloodKit({ t: 'bloodKit', left: 0 });
bt.onSnapshot(undefined); step();
bt.onSnapshot([[1, 1, 0]]); step();
ok(`none left: "${said[0]}" / "${bt.badge.textContent}"`, said[0] === 'You are bleeding (no bandages left)' && bt.badge.textContent === 'BLEEDING · no bandages');
console.log(process.exitCode ? 'SOME FAILED' : 'all passed');
