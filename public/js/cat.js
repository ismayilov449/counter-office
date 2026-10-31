// The mansion's cat in the browser (cs_mansion, cs_mansion_night; the server moves it, see lib/cat.js): its model, its
// procedural animation, its basket and bowl, and its voice.
// Cheap: the cat is ONE skinned mesh (a few boxes with their colours in the vertices, bent by 10 bones), so one draw
// call and one for its shadow; on the night map two glowing eyes are one more (a 2-point Points). The basket and the bowl
// are one baked mesh each (the shared vertex-colour material the player models use). Its sounds are made on the fly
// (no files), positional, through audio.js's output.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAT, CAT_STATE as S, catMap } from '/shared/cat.js';
import { bake } from './batch.js';
import { audio } from './audio.js';

const lerp = (a, b, f) => a + (b - a) * f;
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// ---- the model
const COL = { fur: 0xc9772f, dark: 0x8a4a1c, cream: 0xf0dcb8, white: 0xf4f0e8, pink: 0xe08a90, eye: 0x2c3a0c, nose: 0xc0606a };
let sharedGeo = null, sharedMat = null, eyeMat = null;
const BONES = ['root', 'body', 'head', 'fl', 'fr', 'bl', 'br', 't1', 't2', 't3'];

// The skeleton (bind pose: standing, facing -z like the players): [name, parent, x, y, z].
const RIG = [
  ['root', null, 0, 0, 0], ['body', 'root', 0, 0.2, 0], ['head', 'body', 0, 0.06, -0.19],
  ['fl', 'body', -0.042, -0.02, -0.145], ['fr', 'body', 0.042, -0.02, -0.145], ['bl', 'body', -0.042, -0.02, 0.15], ['br', 'body', 0.042, -0.02, 0.15],
  ['t1', 'body', 0, 0.035, 0.18], ['t2', 't1', 0, 0, 0.11], ['t3', 't2', 0, 0, 0.11],
];
// Its boxes: [bone, w, h, d, colour, x, y, z (in the bone's space), rx, ry, rz].
const BOXES = [
  ['body', 0.13, 0.12, 0.37, 'fur', 0, 0, 0], ['body', 0.11, 0.03, 0.3, 'cream', 0, -0.052, -0.01],
  ['body', 0.136, 0.022, 0.035, 'dark', 0, 0.052, -0.06], ['body', 0.136, 0.022, 0.035, 'dark', 0, 0.052, 0.03], ['body', 0.136, 0.022, 0.035, 'dark', 0, 0.052, 0.11],
  ['body', 0.12, 0.1, 0.06, 'cream', 0, -0.005, -0.18], // the chest
  ['head', 0.12, 0.1, 0.1, 'fur', 0, 0.03, -0.045], ['head', 0.062, 0.042, 0.032, 'cream', 0, 0.002, -0.106],
  ['head', 0.02, 0.014, 0.01, 'nose', 0, 0.024, -0.124], ['head', 0.124, 0.02, 0.06, 'dark', 0, 0.072, -0.03],
  ['head', 0.036, 0.05, 0.016, 'fur', -0.034, 0.094, -0.03, 0, 0, 0.28], ['head', 0.036, 0.05, 0.016, 'fur', 0.034, 0.094, -0.03, 0, 0, -0.28],
  ['head', 0.02, 0.03, 0.006, 'pink', -0.034, 0.09, -0.039, 0, 0, 0.28], ['head', 0.02, 0.03, 0.006, 'pink', 0.034, 0.09, -0.039, 0, 0, -0.28],
  ['head', 0.022, 0.016, 0.006, 'eye', -0.028, 0.046, -0.096], ['head', 0.022, 0.016, 0.006, 'eye', 0.028, 0.046, -0.096],
  ...['fl', 'fr', 'bl', 'br'].flatMap(b => [[b, 0.04, 0.17, 0.042, 'fur', 0, -0.085, 0], [b, 0.046, 0.026, 0.056, 'white', 0, -0.17, -0.008]]),
  ['t1', 0.034, 0.034, 0.116, 'fur', 0, 0, 0.055], ['t2', 0.032, 0.032, 0.116, 'dark', 0, 0, 0.055], ['t3', 0.03, 0.03, 0.11, 'fur', 0, 0, 0.05],
];
const EYES = [[-0.028, 0.046, -0.1], [0.028, 0.046, -0.1]];

function rig() {
  const bones = {};
  for (const [name, parent, x, y, z] of RIG) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) bones[parent].add(b);
    bones[name] = b;
  }
  bones.root.updateMatrixWorld(true);
  return bones;
}

function catGeometry() {
  if (sharedGeo) return sharedGeo;
  const bones = rig(), geos = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (const [bone, w, h, d, col, x, y, z, rx = 0, ry = 0, rz = 0] of BOXES) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    g.applyMatrix4(m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    g.applyMatrix4(bones[bone].matrixWorld);
    const n = g.attributes.position.count, colors = new Float32Array(n * 3), idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
    c.setHex(COL[col]);
    for (let i = 0; i < n; i++) { colors.set([c.r, c.g, c.b], i * 3); idx[i * 4] = BONES.indexOf(bone); wt[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    geos.push(g);
  }
  sharedGeo = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return sharedGeo;
}

// The glowing eyes (night map): two round dots, at least a couple of pixels however far away the cat is.
function eyeMaterial() {
  return eyeMat ||= new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xd8ff6a) }, size: { value: 0.03 }, scale: { value: 400 } },
    vertexShader: `uniform float size; uniform float scale;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(2.5, size * scale / -mv.z); }`,
    fragmentShader: `uniform vec3 color;
      void main() { vec2 d = gl_PointCoord - 0.5; float a = 1.0 - smoothstep(0.25, 0.5, length(d)); if (a < 0.02) discard; gl_FragColor = vec4(color * (1.0 + a), a); }`,
    transparent: true, depthWrite: false,
  });
}

export function createCatModel() {
  const bones = rig();
  sharedMat ||= new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.SkinnedMesh(catGeometry(), sharedMat);
  mesh.add(bones.root);
  mesh.bind(new THREE.Skeleton(BONES.map(n => bones[n])));
  mesh.castShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 0.75); // (bent any way it still fits)
  const eyes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(EYES.flat(), 3)), eyeMaterial());
  eyes.frustumCulled = false;
  eyes.visible = false;
  bones.head.add(eyes);
  const root = new THREE.Group();
  root.add(mesh);
  root.userData = { bones, eyes, mesh };
  return root;
}

// One more cat, with its eyes on, for main.js's shader warm-up when a map loads (always the same one).
let warmCat = null;
export function catWarmModel() {
  warmCat ||= createCatModel();
  warmCat.userData.eyes.visible = true;
  return warmCat;
}

// Its basket and its bowl (drawn here: they're the cat's, not the map's).
function buildProps() {
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (g, w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); g.add(m); };
  const basket = new THREE.Group(), wick = 0x9a7040;
  box(basket, 0.52, 0.03, 0.42, wick, 0, 0.015, 0);
  box(basket, 0.52, 0.16, 0.04, wick, 0, 0.08, -0.19);
  box(basket, 0.52, 0.08, 0.04, wick, 0, 0.04, 0.19);
  box(basket, 0.04, 0.12, 0.42, wick, -0.24, 0.06, 0);
  box(basket, 0.04, 0.12, 0.42, wick, 0.24, 0.06, 0);
  box(basket, 0.44, 0.04, 0.34, 0xa8343a, 0, 0.045, 0);
  basket.position.set(...CAT.basket);
  basket.rotation.y = -Math.PI / 2; // (its high side against the wall)
  const bowl = new THREE.Group();
  box(bowl, 0.17, 0.045, 0.17, 0x3a66b0, 0, 0.0225, 0);
  box(bowl, 0.12, 0.012, 0.12, 0x6a4424, 0, 0.046, 0);
  box(bowl, 0.15, 0.03, 0.15, 0x3a66b0, 0.21, 0.015, 0); // and its water
  box(bowl, 0.11, 0.004, 0.11, 0x8ab8d8, 0.21, 0.031, 0);
  bowl.position.set(...CAT.bowl);
  const group = new THREE.Group();
  for (const g of [basket, bowl]) {
    const parts = [...g.children], merged = bake(g);
    for (const o of parts) { o.geometry.dispose(); o.material.dispose(); }
    if (merged) merged.receiveShadow = true;
    group.add(g);
  }
  return group;
}

// ---- state
let scene = null, map = null, cat = null, props = null;
let buf = [], state = S.sleep, purr = 0, shown = false;
const pose = {}; // the current (blended) pose
let phase = 0, lastP = null, yDisp = null, meowAt = -1e9, airSpin = 0, stateAt = 0, purrSound = null;

export function catLoadMap(sc, m) {
  scene = sc;
  map = m;
  buf = [];
  yDisp = null;
  lastP = null;
  stopPurr();
  if (!catMap(m)) {
    if (cat) { scene.remove(cat); scene.remove(props); }
    shown = false;
    return;
  }
  cat ||= createCatModel();
  props ||= buildProps();
  scene.add(cat, props);
  cat.visible = false;
  cat.userData.eyes.visible = !!m.night;
  shown = true;
}

// From each snapshot: [x, y, z, yaw, state, purring], or nothing (not a cat map).
export function catSync(data, time) {
  if (!data || !cat || !shown) { if (cat) cat.visible = false; return; }
  if (data[4] !== state) { state = data[4]; stateAt = performance.now(); }
  purr = data[5];
  // (a jump of metres between two snapshots is a new round putting it back in its basket: no sliding there)
  const last = buf[buf.length - 1];
  if (last && Math.hypot(data[0] - last.p[0], data[1] - last.p[1], data[2] - last.p[2]) > 3) { buf = []; yDisp = null; lastP = null; }
  buf.push({ t: time, p: [data[0], data[1], data[2]], yaw: data[3] });
  if (buf.length > 40) buf.shift();
}

export function catUpdate(dt, now, rt, camPos) {
  if (!cat || !shown || !buf.length) { stopPurr(); return; }
  cat.visible = true;
  // where it was a moment ago (like the other players: between two snapshots)
  let a = buf[0], b = buf[buf.length - 1], f = 0;
  if (rt <= a.t) b = a;
  else if (rt >= b.t) a = b;
  else for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].t <= rt && rt <= buf[i].t) { a = buf[i - 1]; b = buf[i]; f = (rt - a.t) / (b.t - a.t || 1); break; }
  const p = [lerp(a.p[0], b.p[0], f), lerp(a.p[1], b.p[1], f), lerp(a.p[2], b.p[2], f)];
  const yaw = a.yaw + angleDiff(a.yaw, b.yaw) * f;
  // hops up and down steps are quick, not instant (the server's height jumps at the edge of a step)
  if (yDisp === null || state === S.air || Math.abs(p[1] - yDisp) > 1.5) yDisp = p[1];
  else yDisp += (p[1] - yDisp) * Math.min(1, dt * 22);
  const moved = lastP ? Math.hypot(p[0] - lastP[0], p[2] - lastP[2]) : 0;
  lastP = p;
  cat.position.set(p[0], yDisp, p[2]);
  cat.rotation.y = yaw;
  animate(dt, now, moved);
  updatePurr(p, camPos);
}

// ---- the animation: a target pose for what it's doing, blended into smoothly
const ZERO = { by: 0.2, bz: 0, bp: 0, roll: 0, hp: 0, hy: 0, fl: 0, fr: 0, bl: 0, br: 0, fls: 1, t1p: -0.9, t1y: 0, t2p: 0.3, t2y: 0, t3p: 0.35, t3y: 0, breathe: 0 };
const STRIDE = { [S.walk]: 0.42, [S.trot]: 0.75, [S.run]: 1.15 }; // metres a step cycle
// The pose for doing `state` (t: now in seconds, since: seconds in this state, phase: of the step cycle).
function target(state, t, since, phase) {
  const T = { ...ZERO };
  const sway = Math.sin(t * 1.7);
  switch (state) {
    case S.walk: case S.trot: case S.run: {
      const s = Math.sin(phase), A = state === S.walk ? 0.42 : state === S.trot ? 0.6 : 0.85;
      if (state === S.run) {
        // a gallop: the front legs together, then the back ones, the back arching
        T.fl = T.fr = A * s; T.bl = T.br = -A * s;
        T.bp = 0.12 * Math.cos(phase); T.by = 0.19 + 0.03 * Math.abs(s);
        T.t1p = -0.15; T.t2p = 0.05; T.t3p = 0.05; T.hp = 0.1;
      } else {
        T.fl = T.br = A * s; T.fr = T.bl = -A * s;
        T.by = 0.2 + 0.006 * Math.abs(Math.cos(phase));
        T.hp = 0.04 * Math.sin(phase * 2);
        T.t1p = state === S.walk ? -1.05 : -0.6; T.t1y = 0.18 * sway; T.t3p = 0.5; T.t3y = 0.3 * Math.sin(t * 2.3);
      }
      break;
    }
    case S.sit: case S.wash: {
      // haunches on the floor, front legs straight down (a little longer, so the paws reach), tail curled round
      T.bp = 0.6; T.by = 0.155; T.bz = 0.02;
      T.fl = T.fr = -0.6; T.fls = 1.2; T.bl = T.br = 0.75;
      T.hp = -0.55; T.hy = 0.25 * Math.sin(t * 0.4);
      T.t1p = -0.2; T.t1y = 0.7; T.t2p = -0.3; T.t2y = 0.9; T.t3p = 0; T.t3y = 0.75 + 0.3 * Math.sin(t * 1.3);
      if (state === S.wash) {
        // licking a paw, then rubbing the face with it
        const lick = Math.floor(since / 3) % 2 === 0, k = Math.sin(t * 9);
        T.fr = lick ? 1.0 + 0.15 * k : 1.5 + 0.2 * k;
        T.hp = lick ? -1.05 + 0.1 * k : -0.5; T.hy = lick ? -0.3 : -0.2 + 0.25 * k;
      }
      break;
    }
    case S.loaf: case S.sleep: case S.hide: {
      T.by = state === S.hide ? 0.1 : 0.09; T.bz = 0.02;
      T.fl = T.fr = -1.45; T.bl = T.br = 1.45;
      T.t1p = 0.25; T.t1y = 1.0; T.t2p = 0.05; T.t2y = 0.9; T.t3p = 0; T.t3y = 0.55 + (state === S.loaf ? 0.15 * sway : 0);
      if (state === S.sleep) { T.hp = -0.35; T.hy = 0.85; T.roll = 0.18; T.t1y = 1.25; T.t2y = 1.1; T.t3y = 0.9; T.breathe = 1; }
      if (state === S.hide) { T.hp = -0.12; T.t1p = 0.45; T.t1y = 0.35; T.t2y = 0.4; T.t3y = 0.2; T.by += 0.004 * Math.sin(t * 40); }
      if (state === S.loaf) T.hp = -0.08 + 0.05 * Math.sin(t * 0.3);
      break;
    }
    case S.stretch: {
      // front legs out, chest down, rear up; then back to standing
      const k = Math.sin(Math.min(1, since / 2.4) * Math.PI);
      T.bp = -0.38 * k; T.by = 0.2 - 0.06 * k; T.fl = T.fr = 1.25 * k; T.bl = T.br = -0.35 * k;
      T.hp = 0.45 * k; T.t1p = -1.25; T.t2p = 0.15; T.t3p = 0.2;
      break;
    }
    case S.air: {
      T.fl = T.fr = 0.95; T.bl = T.br = -0.95; T.t1p = -1.1; T.t2p = -0.2; T.t3p = -0.2; T.hp = 0.3;
      break;
    }
  }
  return T;
}

function applyPose(model, P, t, spin = 0) {
  const B = model.userData.bones;
  B.body.position.set(0, P.by, P.bz);
  B.body.rotation.set(P.bp, 0, P.roll);
  B.body.scale.y = 1 + 0.035 * P.breathe * Math.sin(t * 2.4);
  B.head.rotation.set(P.hp, P.hy, 0);
  B.fl.rotation.x = P.fl; B.fr.rotation.x = P.fr; B.bl.rotation.x = P.bl; B.br.rotation.x = P.br;
  B.fl.scale.y = B.fr.scale.y = P.fls;
  B.t1.rotation.set(P.t1p, P.t1y, 0); B.t2.rotation.set(P.t2p, P.t2y, 0); B.t3.rotation.set(P.t3p, P.t3y, 0);
  B.root.rotation.set(0, 0, spin);
}

// (tests) a model posed as doing `state` at time t (seconds), with no blending
export function catPoseModel(model, state, t = 1, ph = 0) {
  applyPose(model, target(state, t, t, ph), t, state === S.air ? 1.2 : 0);
}

function animate(dt, now, moved) {
  const t = now / 1000;
  if (STRIDE[state]) phase += (moved / STRIDE[state]) * Math.PI * 2;
  airSpin = state === S.air ? airSpin + dt * 11 : 0;
  const T = target(state, t, (now - stateAt) / 1000, phase), k = Math.min(1, dt * (state === S.air ? 20 : 9));
  // meowing: the head goes up
  const m = (now - meowAt) / 700;
  if (m >= 0 && m < 1) T.hp += 0.38 * Math.sin(m * Math.PI);
  for (const key in T) pose[key] = pose[key] === undefined ? T[key] : lerp(pose[key], T[key], k);
  applyPose(cat, pose, t, airSpin);
  // eyes shut asleep
  cat.userData.eyes.visible = !!map?.night && state !== S.sleep;
}

// ---- sounds (made here, through audio.js's positional output)
function out(pos, ref = 3, roll = 1.1) {
  const master = audio.out(null);
  if (!master || master.context.state !== 'running') return null;
  return audio.out(pos, [ref, roll]);
}
// A sawtooth through two formant filters: a cat's "mi-aow" (the formants slide from an "ee" to an "ow").
function voice(o, t, dur, f0, f1, f2, F, gain) {
  const ctx = o.context;
  const osc = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.linearRampToValueAtTime(f1, t + dur * 0.3);
  osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
  vib.frequency.value = 6; vg.gain.value = f1 * 0.015;
  vib.connect(vg).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.06);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const [a, b2, q] of F) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(a, t);
    bp.frequency.linearRampToValueAtTime(a * 1.15, t + dur * 0.3);
    bp.frequency.exponentialRampToValueAtTime(b2, t + dur);
    osc.connect(bp).connect(g);
  }
  g.connect(o);
  osc.start(t); vib.start(t);
  osc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
}
function noise(o, t, dur, type, freq, q, gain) {
  const ctx = o.context, n = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = n;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o);
  src.start(t);
}

// { t: 'catMeow', p, k }: meow (at a hidden player), mrrp (it starts following you), screech (thrown), hiss (scared)
export function catSound(m) {
  meowAt = performance.now();
  const o = out(m.p, m.k === 'screech' ? 6 : 4, 1);
  if (!o) return;
  const t = o.context.currentTime, r = 0.92 + Math.random() * 0.16;
  if (m.k === 'meow') voice(o, t, 0.75, 520 * r, 760 * r, 430 * r, [[1100, 700, 5], [2600, 1300, 6]], 0.5);
  else if (m.k === 'mrrp') {
    voice(o, t, 0.28, 380 * r, 560 * r, 520 * r, [[900, 800, 4], [2200, 1900, 5]], 0.35);
  } else if (m.k === 'screech') {
    voice(o, t, 0.9, 900 * r, 1400 * r, 600 * r, [[1800, 1200, 2], [3400, 2400, 3]], 0.7);
    noise(o, t, 0.6, 'bandpass', 3200, 1.2, 0.35);
  } else if (m.k === 'hiss') noise(o, t, 0.7, 'highpass', 2600, 0.7, 0.4);
}

// Purring: a soft, low rumble while someone is right next to it (the server says when).
function updatePurr(p, camPos) {
  const near = purr && camPos && Math.hypot(camPos.x - p[0], camPos.y - p[1], camPos.z - p[2]) < 7;
  if (!near) { stopPurr(); return; }
  if (!purrSound) {
    const o = out([p[0], p[1] + 0.2, p[2]], 0.7, 1.6);
    if (!o) return;
    const ctx = o.context, src = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createOscillator(), amg = ctx.createGain(), breath = ctx.createOscillator(), bg = ctx.createGain();
    src.type = 'sawtooth'; src.frequency.value = 27;
    lp.type = 'lowpass'; lp.frequency.value = 320;
    g.gain.value = 0.12;
    am.type = 'square'; am.frequency.value = 26; amg.gain.value = 0.08; // the rattle
    breath.frequency.value = 0.55; bg.gain.value = 0.05; // in and out
    am.connect(amg).connect(g.gain);
    breath.connect(bg).connect(g.gain);
    src.connect(lp).connect(g).connect(o);
    for (const x of [src, am, breath]) x.start();
    purrSound = { o, nodes: [src, am, breath], g };
  }
  const o = purrSound.o;
  if (o.positionX) { o.positionX.value = p[0]; o.positionY.value = p[1] + 0.2; o.positionZ.value = p[2]; }
}
function stopPurr() {
  if (!purrSound) return;
  for (const n of purrSound.nodes) { try { n.stop(); } catch { /* stopped */ } }
  purrSound.g.disconnect();
  purrSound = null;
}
