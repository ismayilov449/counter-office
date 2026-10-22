// Low-poly models built from boxes: players, first-person arms, dropped weapons and the bomb (guns: guns.js).
import * as THREE from 'three';
import { WEAPONS } from '/shared/weapons.js';
import { buildGun } from './guns.js';
import { bake } from './batch.js';

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

// Every box of every model is the same unit box, scaled: making a body, a gib or a scrap never adds anything to the
// graphics card (a new BoxGeometry per box did, and none of them were ever freed).
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
function bx(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT_BOX, typeof color === 'object' ? color : mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export { buildGun };

const TEAM = {
  T: { shirt: 0x8a7550, pants: 0x5a4c38, head: 0x2a2622, vest: 0x5e5340, hat: 0x3a2e22, sleeve: 0x7a6748 },
  CT: { shirt: 0x34507a, pants: 0x2a3550, head: 0xc49a78, vest: 0x22304a, hat: 0x2b3a2b, sleeve: 0x2e4468 },
  H: { shirt: 0xdcd8cc, pants: 0x3a3a46, head: 0xc8a07a, vest: 0xc8c2b4, hat: 0x9a7a5a, sleeve: 0xdcd8cc },
  // Zombie: rotten green skin, bare arms, torn dark clothes, no helmet.
  Z: { shirt: 0x3a4232, pants: 0x2a2a24, head: 0x6f8a4e, vest: 0x2e3428, hat: 0x55703c, sleeve: 0x6f8a4e, eyes: 0xd03020 },
};

// A camouflaged player keeping still: enemies see only a faint shimmer of them.
const fadeMats = new Map();
export function setFaded(model, on) {
  if (!!model.userData.faded === on) return;
  model.userData.faded = on;
  model.traverse(o => {
    if (!o.isMesh) return;
    if (on) {
      o.userData.solid = o.material;
      let f = fadeMats.get(o.material);
      if (!f) { f = o.material.clone(); f.transparent = true; f.opacity = 0.12; f.depthWrite = false; fadeMats.set(o.material, f); }
      o.material = f;
      o.castShadow = false;
    } else if (o.userData.solid) {
      o.material = o.userData.solid;
      o.castShadow = true;
    }
  });
}

// Civilian hostage: same rig as a player, no weapon, hands raised while waiting.
export function createHostageModel() {
  const m = createPlayerModel('H');
  m.userData.arms.rotation.x = 1.1;
  return m;
}

export function createPlayerModel(team) {
  const C = TEAM[team] || TEAM.T;
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hip = new THREE.Group();
  hip.position.y = 0.85;
  root.add(hip);

  const legs = [-0.12, 0.12].map(x => {
    const leg = new THREE.Group();
    leg.position.x = x;
    bx(leg, 0.18, 0.78, 0.2, C.pants, 0, -0.39, 0);
    bx(leg, 0.2, 0.1, 0.28, 0x1c1c1c, 0, -0.8, -0.03);
    hip.add(leg);
    return leg;
  });

  const upper = new THREE.Group();
  hip.add(upper);
  bx(upper, 0.48, 0.62, 0.28, C.shirt, 0, 0.31, 0);
  bx(upper, 0.52, 0.42, 0.32, C.vest, 0, 0.36, 0);
  const headG = new THREE.Group();
  headG.position.set(0, 0.64, 0);
  upper.add(headG);
  bx(headG, 0.28, 0.3, 0.28, C.head, 0, 0.13, 0);
  bx(headG, 0.22, 0.05, 0.02, C.eyes || 0x111111, 0, 0.16, -0.145);
  if (team === 'Z') bx(headG, 0.3, 0.06, 0.3, C.hat, 0, 0.3, 0.02); // matted hair
  else bx(headG, 0.32, 0.1, 0.32, C.hat, 0, 0.31, 0);

  const arms = new THREE.Group();
  arms.position.set(0, 0.52, 0);
  upper.add(arms);
  // Each arm turns at the shoulder.
  const rArm = new THREE.Group();
  rArm.position.set(0.2, -0.06, 0.03);
  arms.add(rArm);
  bx(rArm, 0.1, 0.1, 0.42, C.sleeve, 0, 0, -0.21);
  const lArm = new THREE.Group();
  lArm.position.set(-0.2, -0.06, 0.03);
  arms.add(lArm);
  bx(lArm, 0.1, 0.1, 0.42, C.sleeve, 0.06, 0, -0.27).rotation.y = 0.45;
  const hand = new THREE.Group();
  hand.position.set(0.1, -0.05, -0.4);
  arms.add(hand);

  // Flashlight glow, shown when the player has the flashlight on
  const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xfff6d8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  light.scale.set(0.6, 0.6, 1);
  light.position.set(0.1, 0.0, -0.75);
  light.visible = false;
  arms.add(light);

  root.userData = { hip, legs, upper, arms, rArm, lArm, headG, hand, gun: null, gunId: null, team, light };
  // one mesh per moving part instead of one per box
  for (const part of [...legs, upper, headG, rArm, lArm]) bake(part);
  return root;
}

// Emotes: poses over time t (seconds). Call after posePlayer each frame; clearEmote puts everything back.
export function poseEmote(model, id, t) {
  const u = model.userData;
  const w = (a, b) => Math.sin(t * a + b);
  u.arms.rotation.x = 0;
  u.hand.visible = id === 'beckon' || id === 'laugh';
  u.upper.rotation.set(0, 0, 0);
  u.headG.rotation.set(0, 0, 0);
  u.rArm.rotation.set(0, 0, 0);
  u.lArm.rotation.set(0, 0, 0);
  switch (id) {
    case 'dance':
      u.upper.rotation.y = 0.5 * w(5, 0);
      u.upper.rotation.z = 0.15 * w(10, 0);
      u.rArm.rotation.x = 1.3 + 0.9 * w(10, 0);
      u.lArm.rotation.x = 1.3 + 0.9 * w(10, Math.PI);
      u.legs[0].rotation.x = 0.6 * Math.max(0, w(10, 0));
      u.legs[1].rotation.x = 0.6 * Math.max(0, -w(10, 0));
      model.position.y += 0.06 * Math.abs(w(10, 0));
      break;
    case 'laugh':
      u.upper.rotation.x = -0.28 + 0.05 * w(32, 0);
      u.headG.rotation.x = -0.35;
      u.rArm.rotation.x = 0.15; // pointing
      u.lArm.rotation.set(-0.5, 0.9, 0);
      break;
    case 'wave':
      u.lArm.rotation.x = 2.5;
      u.lArm.rotation.z = 0.45 * w(10, 0);
      u.headG.rotation.z = 0.1;
      break;
    case 'salute':
      u.rArm.rotation.set(2.1, 0.95, 0);
      u.upper.rotation.x = -0.05;
      break;
    case 'beckon':
      u.upper.rotation.x = -0.12;
      u.rArm.rotation.set(0.25 + 0.55 * Math.max(0, w(8, 0)), -0.3, 0);
      u.lArm.rotation.set(0.25 + 0.55 * Math.max(0, w(8, 0)), 0.3, 0);
      break;
    case 'cheer':
      u.rArm.rotation.set(2.9 + 0.2 * w(12, 0), 0, -0.3);
      u.lArm.rotation.set(2.9 + 0.2 * w(12, 1), 0, 0.3);
      model.position.y += 0.28 * Math.abs(w(6, 0));
      break;
    case 'facepalm':
      u.upper.rotation.x = 0.2;
      u.headG.rotation.x = 0.45;
      u.rArm.rotation.set(1.75, 0.75, 0);
      break;
  }
}

export function clearEmote(model) {
  const u = model.userData;
  u.hand.visible = true;
  u.upper.rotation.set(0, 0, 0);
  u.headG.rotation.set(0, 0, 0);
  u.rArm.rotation.set(0, 0, 0);
  u.lArm.rotation.set(0, 0, 0);
}

export function setPlayerWeapon(model, id) {
  const u = model.userData;
  if (u.gunId === id) return;
  if (u.gun) u.hand.remove(u.gun);
  u.gun = heldGun(id);
  u.hand.add(u.gun);
  u.gunId = id;
  u.shadow = null; // (see the shadows of far players in main.js)
}

// A gun in someone's hands: built and baked once per weapon (one mesh for its plain parts), then copied.
const heldGuns = new Map();
function heldGun(id) {
  if (!heldGuns.has(id)) {
    const g = buildGun(id);
    g.traverse(o => { o.castShadow = true; });
    if (g.userData.muzzle) g.userData.muzzle.name = 'muzzle';
    bake(g, true);
    heldGuns.set(id, g);
  }
  const src = heldGuns.get(id), ud = src.userData;
  src.userData = {};
  const g = src.clone();
  src.userData = ud;
  g.userData = { muzzle: g.getObjectByName('muzzle') || null };
  return g;
}

// ---- body pieces for a heavy kill (see Effects.gib): head, torso, arms and legs with bloody stumps, and scraps.
const FLESH = 0x7a0c0c, MEAT = [0x6a0808, 0x8e1414, 0x5a0606], BONE = 0xd8cfc0;
const PIECE = {
  head: (g, C) => { bx(g, 0.28, 0.3, 0.28, C.head); bx(g, 0.32, 0.1, 0.32, C.hat, 0, 0.18, 0); bx(g, 0.15, 0.06, 0.15, FLESH, 0, -0.17, 0); return 1.62; },
  torso: (g, C) => { bx(g, 0.48, 0.62, 0.28, C.shirt); bx(g, 0.52, 0.42, 0.32, C.vest, 0, 0.05, 0); bx(g, 0.18, 0.05, 0.18, FLESH, 0, 0.33, 0); bx(g, 0.4, 0.05, 0.22, FLESH, 0, -0.32, 0); return 1.16; },
  rArm: (g, C) => { bx(g, 0.1, 0.42, 0.1, C.sleeve); bx(g, 0.08, 0.05, 0.08, FLESH, 0, 0.22, 0); bx(g, 0.03, 0.06, 0.03, BONE, 0, 0.26, 0); return 1.25; },
  lArm: (g, C) => { bx(g, 0.1, 0.42, 0.1, C.sleeve); bx(g, 0.08, 0.05, 0.08, FLESH, 0, 0.22, 0); bx(g, 0.03, 0.06, 0.03, BONE, 0, 0.26, 0); return 1.25; },
  lLeg: (g, C) => { bx(g, 0.18, 0.7, 0.2, C.pants); bx(g, 0.2, 0.1, 0.28, 0x1c1c1c, 0, -0.38, -0.03); bx(g, 0.15, 0.05, 0.17, FLESH, 0, 0.36, 0); bx(g, 0.05, 0.07, 0.05, BONE, 0, 0.4, 0); return 0.45; },
  rLeg: (g, C) => { bx(g, 0.18, 0.7, 0.2, C.pants); bx(g, 0.2, 0.1, 0.28, 0x1c1c1c, 0, -0.38, -0.03); bx(g, 0.15, 0.05, 0.17, FLESH, 0, 0.36, 0); bx(g, 0.05, 0.07, 0.05, BONE, 0, 0.4, 0); return 0.45; },
};
const PIECE_X = { head: 0, torso: 0, rArm: 0.27, lArm: -0.27, lLeg: -0.12, rLeg: 0.12 };

// The pieces as meshes, each with where it sat on the body (local, feet at 0, facing -z) and its rough size.
export function createGibPieces(look, parts, scraps) {
  const C = TEAM[look] || TEAM.T;
  const out = [];
  for (const part of parts) {
    const g = new THREE.Group();
    const y = PIECE[part](g, C);
    out.push({ mesh: g, at: [PIECE_X[part], y, 0], r: part === 'torso' ? 0.3 : part.endsWith('Leg') ? 0.25 : 0.16 });
  }
  for (let i = 0; i < scraps; i++) {
    const g = new THREE.Group(), s = 0.05 + Math.random() * 0.09;
    bx(g, s, s * (0.6 + Math.random() * 0.6), s * (0.7 + Math.random() * 0.6), Math.random() < 0.15 ? BONE : MEAT[i % MEAT.length]);
    out.push({ mesh: g, at: [(Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 1.1, (Math.random() - 0.5) * 0.3], r: s / 2 });
  }
  for (const p of out) p.mesh.traverse(o => { o.castShadow = true; });
  return out;
}

// Hide the parts that were torn off a body (all: the whole body); mendModel puts them back when it respawns.
export function tearOff(model, parts) {
  const u = model.userData;
  const node = { head: u.headG, rArm: u.rArm, lArm: u.lArm, lLeg: u.legs[0], rLeg: u.legs[1] };
  for (const part of parts) if (node[part]) node[part].visible = false;
  u.torn = true;
}
export function mendModel(model) {
  const u = model.userData;
  if (!u.torn) return;
  for (const n of [u.headG, u.rArm, u.lArm, ...u.legs]) n.visible = true;
  u.torn = false;
}

// Pose the model: crouch, look pitch, walk cycle.
export function posePlayer(model, crouch, pitch, walkPhase, walkAmount) {
  const u = model.userData;
  // Crouched: legs folded and the body hunched, about 0.9 m tall (the crouch hitboxes in physics.js).
  const s = crouch ? 0.235 : 1, hunch = crouch ? 0.75 : 1;
  u.hip.position.y += (0.85 * s - u.hip.position.y) * 0.4;
  for (const leg of u.legs) leg.scale.y += (s - leg.scale.y) * 0.4;
  u.upper.scale.y += (hunch - u.upper.scale.y) * 0.4;
  u.arms.rotation.x = pitch;
  const swing = Math.sin(walkPhase) * 0.6 * walkAmount;
  u.legs[0].rotation.x = swing;
  u.legs[1].rotation.x = -swing;
}

export function createNameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 28px Verdana, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(1.4, 0.35, 1);
  s.position.y = 2.15;
  return s;
}

const VM_BASE = {
  knife: [0.16, -0.17, -0.3],
  grenade: [0.16, -0.16, -0.3],
  mine: [0.16, -0.17, -0.32],
  c4: [0.12, -0.2, -0.32],
  pistol: [0.15, -0.15, -0.42],
};

// First-person weapon with arms. Lives in the separate view-model scene.
export function createViewModel(id, team) {
  const C = TEAM[team] || TEAM.T;
  const bare = team === 'Z';
  const cls = WEAPONS[id]?.cls;
  const root = new THREE.Group();
  const gun = buildGun(id);
  root.add(gun);
  const glove = bare ? C.head : 0x1e1e1e;
  const twoHanded = ['rifle', 'sniper', 'shotgun', 'mg', 'smg', 'launcher', 'mortar'].includes(cls);

  const ra = new THREE.Group();
  ra.position.set(0.02, -0.08, 0.03);
  bx(ra, 0.07, 0.07, 0.09, glove, 0, 0, 0);
  bx(ra, 0.09, 0.09, 0.45, C.sleeve, 0.03, -0.06, 0.26).rotation.x = 0.35;
  root.add(ra);

  if (twoHanded) {
    const la = new THREE.Group();
    la.position.set(0, -0.02, cls === 'smg' ? -0.28 : -0.45);
    bx(la, 0.08, 0.06, 0.1, glove, 0, 0, 0);
    bx(la, 0.09, 0.09, 0.5, C.sleeve, -0.12, -0.1, 0.22).rotation.set(0.3, 0.55, 0);
    root.add(la);
  } else if (cls === 'pistol') {
    const la = new THREE.Group();
    la.position.set(-0.04, -0.06, 0.04);
    bx(la, 0.07, 0.07, 0.08, glove, 0, 0, 0);
    bx(la, 0.09, 0.09, 0.45, C.sleeve, -0.08, -0.08, 0.26).rotation.set(0.35, 0.3, 0);
    root.add(la);
  }

  const base = VM_BASE[id] || VM_BASE[cls] || [0.15, -0.16, -0.28];
  root.scale.setScalar(0.62);
  root.position.set(...base);
  const gu = gun.userData;
  root.userData = { base: new THREE.Vector3(...base), muzzle: gu.muzzle, mag: gu.mag, magBase: gu.magBase, action: gu.action, actionBase: gu.actionBase, pump: gu.pump, pumpBase: gu.pumpBase };

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffd080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.scale.set(0.22, 0.22, 1);
  flash.visible = false;
  gun.userData.muzzle.add(flash);
  root.userData.flash = flash;
  return root;
}

let _flashTex = null;
export function flashTexture() {
  if (_flashTex) return _flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  grad.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _flashTex = new THREE.CanvasTexture(c);
  return _flashTex;
}

// Weapon lying on the ground.
// A weapon lying on the ground: built once per weapon, then copied (the copies share its geometry, so the drops of a
// long match don't pile up on the graphics card).
const dropModels = new Map();
export function createDropModel(id) {
  if (!dropModels.has(id)) {
    const g = new THREE.Group();
    const gun = buildGun(id);
    gun.userData = {}; // (its references to its own parts don't survive a copy)
    const flat = id !== 'c4' && !WEAPONS[id]?.grenade;
    if (flat) gun.rotation.z = Math.PI / 2;
    gun.position.y = id === 'c4' ? 0.04 : 0.05;
    g.add(gun);
    dropModels.set(id, g);
  }
  return dropModels.get(id).clone();
}

export function createPlantedBomb() {
  const g = new THREE.Group();
  const c4 = buildGun('c4');
  c4.position.y = 0.04;
  g.add(c4);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  led.position.set(0.06, 0.1, -0.02);
  g.add(led);
  g.userData.led = led;
  return g;
}
