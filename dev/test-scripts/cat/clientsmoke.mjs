// public/js/cat.js in Node (no browser): a fake page and a fake WebAudio, real three.js. Runs every entry point main.js
// calls — catLoadMap, catSync, catUpdate, catSound, catWarmModel — plus the poses, and checks what they do: the model's
// cost (one skinned mesh, shared geometry and material), the basket and bowl, the eyes at night, the smoothing between
// snapshots and up a step, every animation without NaNs, the sounds (positional) and the purr starting and stopping.
// Run: node --import ./dev/test-scripts/cat/register.mjs dev/test-scripts/cat/clientsmoke.mjs
import * as THREE from 'three';
let fails = 0;
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) fails++; };

// ---- fakes: anything called on them works and returns another fake; numbers read as 0
const fake = (base = {}) => new Proxy(base, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === 'then') return undefined;
    return (t[k] = fake(function () {}));
  },
  apply() { return fake(); },
});
const audioNodes = [];
let stopped = 0;
class FakeAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 8000; this.destination = fake(); this.listener = fake(); }
  node(kind) { const n = fake({ kind, context: this, connect: d => d, disconnect() {}, start() {}, stop() { stopped++; } }); audioNodes.push(n); return n; }
  createGain() { return this.node('gain'); }
  createBiquadFilter() { return this.node('filter'); }
  createOscillator() { return this.node('osc'); }
  createPanner() { return this.node('panner'); }
  createBufferSource() { return this.node('source'); }
  createConvolver() { return this.node('convolver'); }
  createDynamicsCompressor() { return this.node('comp'); }
  createBuffer(ch, len) { return { sampleRate: this.sampleRate, getChannelData: () => new Float32Array(len) }; }
  resume() {}
  decodeAudioData() { return Promise.reject(new Error('no')); }
}
globalThis.window = { AudioContext: FakeAudioContext };
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.document = { createElement: tag => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => fake() } : { style: {} }), getElementById: () => ({ style: {} }) };

const { audio } = await import('../../../public/js/audio.js');
const C = await import('../../../public/js/cat.js');
const { CAT, CAT_STATE: S } = await import('../../../shared/cat.js');
const { MAPS } = await import('../../../shared/maps/index.js');
audio.init();

// ---- the model
const m1 = C.createCatModel(), m2 = C.createCatModel();
const meshes = [], points = [];
m1.traverse(o => { if (o.isMesh) meshes.push(o); if (o.isPoints) points.push(o); });
const sk = meshes[0];
const tris = sk.geometry.index ? sk.geometry.index.count / 3 : sk.geometry.attributes.position.count / 3;
ok(`one skinned mesh (${meshes.length} mesh, skinned ${!!sk?.isSkinnedMesh}, ${sk?.skeleton?.bones.length} bones, ${tris} triangles) and the 2-point eyes`, meshes.length === 1 && sk.isSkinnedMesh && sk.skeleton.bones.length === 10 && tris < 800 && points.length === 1 && points[0].geometry.attributes.position.count === 2);
let sk2 = null; m2.traverse(o => { if (o.isSkinnedMesh) sk2 = o; });
ok('two cats share one geometry and one material', sk2.geometry === sk.geometry && sk2.material === sk.material);
ok('it casts a shadow; eyes off by default', sk.castShadow && !points[0].visible);
ok('catWarmModel: always the same one, eyes on (for the shader warm-up)', C.catWarmModel() === C.catWarmModel() && C.catWarmModel().userData.eyes.visible);

// ---- every pose: no NaN anywhere, different poses look different
const sig = m => { const out = []; m.userData.bones.root.traverse(b => out.push(b.position.x, b.position.y, b.position.z, b.rotation.x, b.rotation.y, b.rotation.z)); return out; };
const poses = {};
for (const [name, s] of Object.entries(S)) {
  C.catPoseModel(m1, s, 1.3, 1.1);
  poses[name] = sig(m1);
}
ok(`every pose (${Object.keys(poses).join(', ')}) is made of numbers`, Object.values(poses).every(a => a.every(Number.isFinite)));
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
ok('sit, walk, run, loaf, stretch and air all differ', ['walk', 'run', 'loaf', 'stretch', 'air'].every(n => !same(poses[n], poses.sit)));
C.catPoseModel(m1, S.walk, 1, 0); const w0 = sig(m1); C.catPoseModel(m1, S.walk, 1, Math.PI / 2); const w1 = sig(m1);
ok('walking: the legs move through the step', !same(w0, w1));
C.catPoseModel(m1, S.wash, 1); const wa = sig(m1); C.catPoseModel(m1, S.wash, 4); const wb = sig(m1);
ok('washing: licks the paw, then rubs the face', !same(wa, wb));

// ---- on the floor: no paw under it in any pose (all through a step cycle, a stretch); walking and trotting paws stay
// put while they're down (the model moved forward a stride a cycle, as catUpdate keys the steps to the distance)
const skin = m1.userData.mesh, vp = skin.geometry.attributes.position, vsi = skin.geometry.attributes.skinIndex, vv = new THREE.Vector3();
const world = fn => { m1.updateMatrixWorld(true); skin.skeleton.update(); for (let i = 0; i < vp.count; i++) { skin.getVertexPosition(i, vv); vv.applyMatrix4(skin.matrixWorld); fn(vv, i); } };
let sunk = 0, sunkAt = '';
for (const name of ['sit', 'wash', 'walk', 'trot', 'run', 'stretch', 'hide', 'sleep', 'loaf']) {
  for (let i = 0; i < 32; i++) {
    C.catPoseModel(m1, S[name], name === 'stretch' ? i / 32 * 2.4 : 0.4 + i * 0.13, i / 32 * Math.PI * 2);
    let low = 9; world(v => { low = Math.min(low, v.y); });
    if (low < sunk) { sunk = low; sunkAt = name; }
  }
}
ok(`no pose puts a paw through the floor (lowest ${(sunk * 100).toFixed(1)} cm${sunkAt ? ', ' + sunkAt : ''})`, sunk > -0.005);
const strideOf = { walk: 0.36, trot: 0.48 }; // (GAIT in public/js/cat.js)
for (const [name, stride] of Object.entries(strideOf)) {
  let slip = 0; const prev = {};
  for (let i = 0; i <= 256; i++) {
    const ph = i / 128 * Math.PI * 2;
    C.catPoseModel(m1, S[name], 1, ph);
    m1.position.z = -ph / (Math.PI * 2) * stride;
    const sole = {}, low = {};
    world((v, j) => { const b = vsi.getX(j); if (b < 3 || b > 6) return; low[b] = Math.min(low[b] ?? 9, v.y); if (vp.getY(j) < 0) (sole[b] ||= []).push(v.z); });
    for (const b in sole) {
      const z = sole[b].reduce((a, c) => a + c) / sole[b].length; // (the middle of the paw's sole)
      if (low[b] < 0.004 && prev[b] !== undefined) slip += Math.abs(z - prev[b]);
      prev[b] = low[b] < 0.004 ? z : undefined;
    }
  }
  m1.position.z = 0;
  ok(`${name}: a paw that's down stays put (it slides ${(slip / 8 * 100).toFixed(1)} cm a step cycle, the stride is ${stride * 100} cm)`, slip / 8 < 0.03);
}

// ---- on the Mansion: added with its basket and bowl
const scene = new THREE.Scene();
C.catLoadMap(scene, MAPS.cs_mansion);
const added = scene.children.slice();
const cat = added.find(o => o.userData?.bones), props = added.find(o => o !== cat);
ok(`catLoadMap(cs_mansion): the cat and its props in the scene (${added.length} objects), the cat hidden until a snapshot`, added.length === 2 && cat && !cat.visible);
const propMeshes = []; props.traverse(o => { if (o.isMesh) propMeshes.push(o); });
const near = (o, p) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return Math.hypot(v.x - p[0], v.z - p[2]) < 0.4; };
ok(`basket and bowl: one baked mesh each (${propMeshes.length}), where shared/cat.js says`, propMeshes.length === 2 && props.children.some(g => near(g, CAT.basket)) && props.children.some(g => near(g, CAT.bowl)));
ok('by day: no glowing eyes', !cat.userData.eyes.visible);

// ---- snapshots: [x, y, z, yaw, state, purring]; smooth between them
const camFar = new THREE.Vector3(0, 10, 0);
C.catSync([-20, 0.91, 0, 0, S.walk, 0], 1000);
C.catSync([-20, 0.91, 1, 0, S.walk, 0], 1100);
C.catUpdate(0.016, 5000, 1050, camFar);
ok(`between two snapshots it's half way (z ${cat.position.z.toFixed(2)}), shown`, cat.visible && Math.abs(cat.position.z - 0.5) < 0.01 && Math.abs(cat.position.x + 20) < 0.01);
let legs = [];
for (let i = 0; i < 6; i++) { C.catUpdate(0.016, 5016 + i * 16, 1050 + i * 8, camFar); legs.push(cat.userData.bones.fl.rotation.x); }
ok(`walking along: its front leg swings (${legs.map(v => v.toFixed(2)).join(' ')})`, new Set(legs.map(v => v.toFixed(3))).size > 3);
// up a step: quick, not instant
C.catSync([-20, 1.32, 1.05, 0, S.walk, 0], 1200);
C.catUpdate(0.016, 5200, 1200, camFar);
const y1 = cat.position.y;
for (let i = 0; i < 20; i++) C.catUpdate(0.016, 5216 + i * 16, 1200, camFar);
ok(`a hop up 0.41 m is eased (${y1.toFixed(2)} after one frame, ${cat.position.y.toFixed(2)} a third of a second later)`, y1 > 0.92 && y1 < 1.3 && Math.abs(cat.position.y - 1.32) < 0.01);
// a new round: the snapshot jumps back to the basket: no slide across the map
C.catSync([CAT.basket[0], CAT.basket[1], CAT.basket[2], 0, S.sleep, 0], 1300);
C.catUpdate(0.016, 5600, 1250, camFar);
ok(`a jump back to its basket (a new round) is a jump, not a slide (${cat.position.x.toFixed(2)}, ${cat.position.z.toFixed(2)})`, Math.hypot(cat.position.x - CAT.basket[0], cat.position.z - CAT.basket[2]) < 0.01);
C.catSync([-20, 1.32, 1.05, 0, S.walk, 0], 1301);
C.catUpdate(0.016, 5616, 1310, camFar);
// every state animates for a while without NaN
let t = 6000, tt = 1400, bad = 0;
for (const s of Object.values(S)) {
  C.catSync([-20, 1.32, 1.05, 0.5, s, 0], tt);
  for (let i = 0; i < 40; i++) { t += 16; C.catUpdate(0.016, t, tt, camFar); if (!sig(cat).every(Number.isFinite) || !Number.isFinite(cat.position.y)) bad++; }
  tt += 100;
}
ok(`all ${Object.keys(S).length} states animate (40 frames each) without NaN (${bad} bad frames)`, bad === 0);
C.catSync([-20, 1.32, 1.05, 0.5, S.air, 0], tt);
const spin0 = cat.userData.bones.root.rotation.z;
for (let i = 0; i < 5; i++) C.catUpdate(0.016, t += 16, tt, camFar);
ok('thrown (air): it tumbles', Math.abs(cat.userData.bones.root.rotation.z - spin0) > 0.3);
C.catSync([-20, 1.32, 1.05, 0.5, S.sit, 0], tt += 100);
for (let i = 0; i < 5; i++) C.catUpdate(0.016, t += 16, tt, camFar);
ok('landed: upright again', cat.userData.bones.root.rotation.z === 0);

// ---- sounds: positional, each kind
for (const k of ['meow', 'mrrp', 'screech', 'hiss']) {
  audioNodes.length = 0;
  C.catSound({ t: 'catMeow', p: [-20, 1.5, 1], k });
  ok(`catSound ${k}: ${audioNodes.length} audio nodes, through a panner`, audioNodes.length > 2 && audioNodes.some(n => n.kind === 'panner'));
}
// ---- purring: only with purring set and the camera close
audioNodes.length = 0;
C.catSync([-20, 1.32, 1.05, 0.5, S.sit, 1], tt += 100);
C.catUpdate(0.016, t += 16, tt, new THREE.Vector3(-20, 2.9, 2.5));
const purrNodes = audioNodes.length;
C.catUpdate(0.016, t += 16, tt, new THREE.Vector3(-20, 2.9, 2.5));
ok(`purring, someone close: a purr starts (${purrNodes} nodes), once`, purrNodes > 3 && audioNodes.length === purrNodes);
stopped = 0;
C.catUpdate(0.016, t += 16, tt, camFar);
ok(`the camera 10 m off: it stops (${stopped} sources stopped)`, stopped >= 3);
C.catUpdate(0.016, t += 16, tt, new THREE.Vector3(-20, 2.9, 2.5));
stopped = 0;
C.catSync([-20, 1.32, 1.05, 0.5, S.sit, 0], tt += 100);
C.catUpdate(0.016, t += 16, tt, new THREE.Vector3(-20, 2.9, 2.5));
ok('purring off in the snapshot: it stops', stopped >= 3);

// ---- the night map: eyes glow (shut asleep); another map: gone; a snapshot without the cat hides it
C.catLoadMap(scene, MAPS.cs_mansion_night);
ok('cs_mansion_night: loaded again (the same cat), eyes on', scene.children.filter(o => o === cat).length === 1 && cat.userData.eyes.visible);
C.catSync([-20, 0.91, 0, 0, S.sit, 0], 2000);
C.catUpdate(0.016, t += 16, 2000, camFar);
ok('awake at night: eyes glowing', cat.userData.eyes.visible);
C.catSync([-20, 0.91, 0, 0, S.sleep, 0], 2100);
C.catUpdate(0.016, t += 16, 2100, camFar);
ok('asleep at night: eyes shut', !cat.userData.eyes.visible);
C.catSync(undefined, 2200);
ok('a snapshot with no cat: hidden', !cat.visible);
const other = Object.values(MAPS).find(m => !m.id.startsWith('cs_mansion'));
C.catLoadMap(scene, other);
ok(`${other.id}: the cat and its props taken out of the scene`, !scene.children.includes(cat) && !scene.children.includes(props));
C.catSync([-20, 0.91, 0, 0, S.sit, 0], 2300);
C.catUpdate(0.016, t += 16, 2300, camFar);
ok('and snapshots there do nothing', !cat.visible && !scene.children.includes(cat));
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
