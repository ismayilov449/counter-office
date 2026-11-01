// Floodgate in the browser (see shared/flood.js): the valve wheel (it turns while someone holds E on it), the water
// surface at the server's level (one mesh for every area the water stands in: one draw call), the water gushing out
// of the outlet while the valve is open, swimming (the flood's boxes are added to map.water, so the usual swimming
// works), the underwater tint and fog, your breath, and the sounds and sparks of the electrocution. Only on the
// Mansion maps. main.js calls init() once, setMap() on every map load, onSnapshot() with the snapshot's `fl`, and
// update() every frame; hint() and actLabel() feed the HUD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOOD, FLOOD_AREAS, floodMap, waterTop, makeFloodBoxes, setFloodBoxes, atValve } from '/shared/flood.js';
import { floodPipes } from '/shared/maps/mansion_flood.js';
import { PLAYER } from '/shared/physics.js';
import { audio, floodKit } from './audio.js';

let D = null; // what it needs from main.js (see init)
let map = null, on = false;
const boxes = makeFloodBoxes();
const st = { target: FLOOD.base, level: FLOOD.base, open: false, turning: false, wasTurning: false, air: FLOOD.breath, gasp: false, bubbleAt: 0, blubAt: 0, foamAt: 0 };
let group = null, surf = null, surfKey = null, wheel = null, gush = null, surfTex = null, gushTex = null;
let tint = null, breathEl = null, breathFill = null, fogSaved = null, gushSound = null;
const _v = new THREE.Vector3();

// deps: { scene, net, fx, me, game, applyLights }
export function init(deps) {
  D = deps;
  Object.assign(deps.net.handlers, { floodValve, floodZap, floodFizzle, floodBoom });
  tint = document.createElement('div');
  tint.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;display:none;' +
    'background:radial-gradient(ellipse at center, rgba(40,80,64,0.38) 25%, rgba(6,26,20,0.86) 100%)';
  (document.getElementById('game') || document.body).after(tint);
  breathEl = document.createElement('div');
  breathEl.style.cssText = 'position:absolute;left:50%;bottom:92px;transform:translateX(-50%);width:180px;display:none;' +
    'font:bold 11px Consolas,monospace;color:#bfe6ff;text-align:center;text-shadow:0 0 3px #000';
  breathEl.innerHTML = 'AIR<div style="height:7px;margin-top:2px;background:rgba(0,0,0,0.55);border:1px solid rgba(190,230,255,0.6)"><div style="height:100%;width:100%;background:#7cc8ff"></div></div>';
  breathFill = breathEl.lastChild.firstChild;
  (document.getElementById('hud') || document.body).appendChild(breathEl);
}

// ---- building the meshes
function waterTexture(color, streaks) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.32)';
  g.lineWidth = 1.5;
  for (let i = 0; i < (streaks ? 26 : 22); i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    g.beginPath();
    if (streaks) { g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + 20 + Math.random() * 30); }
    else { g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + (Math.random() - 0.5) * 6, x + 12, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// (Phong, a map, transparent, no depth writes, receiving shadows: the same shader as the map's own water)
const waterMat = (map, opacity) => new THREE.MeshPhongMaterial({ map, transparent: true, opacity, shininess: 90, specular: 0x445544, depthWrite: false });

// Quads facing up and down (seen from above and from under the water) for each area with water in it, at y 0.
function surfaceGeometry(list) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const [x1, z1, x2, z2] of list) {
    for (const up of [1, -1]) {
      const n = pos.length / 3;
      const pts = [[x1, z1], [x1, z2], [x2, z2], [x2, z1]];
      for (const [x, z] of pts) { pos.push(x, 0, z); nor.push(0, up, 0); uv.push(x / 3, z / 3); }
      if (up > 0) idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      else idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// The valve wheel: a rim, four spokes and a hub, red paint (one mesh). It faces +z.
function buildWheel() {
  const parts = [new THREE.TorusGeometry(0.28, 0.028, 6, 20), new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10).rotateX(Math.PI / 2)];
  for (let i = 0; i < 2; i++) parts.push(new THREE.BoxGeometry(0.56, 0.026, 0.026).rotateZ((i * Math.PI) / 2));
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0x9a2a1c }));
  for (const p of parts) p.dispose();
  m.position.set(...FLOOD.valve.p);
  return m;
}

// The pipes from the ceiling to the valve and on to the outlet: one mesh (as map decor each pipe was a draw call of its
// own: five more in every view with the drain in it). The map's pipe colour; lit like the map (room light), no shadow
// cast (there's no sun down there).
function buildPipes() {
  const parts = floodPipes().map(([from, to]) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const g = new THREE.CylinderGeometry(0.12, 0.12, a.distanceTo(b), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  });
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0x5a4636 }));
  for (const p of parts) p.dispose();
  m.receiveShadow = true;
  return m;
}

// The water falling out of the outlet: two crossed sheets, each drawn both ways, 1 m tall (scaled to the drop).
function buildGush() {
  const sheets = [];
  for (const [ry, flip] of [[0, 0], [0, 1], [Math.PI / 2, 0], [Math.PI / 2, 1]]) sheets.push(new THREE.PlaneGeometry(0.2, 1).rotateY(ry + flip * Math.PI).translate(0, -0.5, 0));
  gushTex = waterTexture('#5f8a7a', true);
  gushTex.repeat.set(1, 2);
  const m = new THREE.Mesh(mergeGeometries(sheets), waterMat(gushTex, 0.75));
  for (const s of sheets) s.dispose();
  m.position.set(...FLOOD.outlet);
  m.visible = false;
  return m;
}

function clear() {
  if (group) {
    D.scene.remove(group);
    group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    surfTex?.dispose(); gushTex?.dispose();
  }
  group = surf = wheel = gush = surfTex = gushTex = null;
  surfKey = null;
  stopGush();
  underwater(false);
  if (breathEl) breathEl.style.display = 'none';
}

export function setMap(m) {
  clear();
  map = m;
  on = floodMap(m);
  fogSaved = null;
  Object.assign(st, { target: FLOOD.base, level: FLOOD.base, open: false, turning: false, wasTurning: false, air: FLOOD.breath });
  setFloodBoxes(boxes, st.level);
  if (!on) return;
  if (m.water && !m.water.includes(boxes[0])) m.water.push(...boxes); // (swimming: see inWater in physics.js)
  group = new THREE.Group();
  surfTex = waterTexture('#34503f', false);
  surf = new THREE.Mesh(new THREE.BufferGeometry(), waterMat(surfTex, 0.86));
  surf.receiveShadow = true;
  surf.visible = false;
  wheel = buildWheel();
  gush = buildGush();
  group.add(surf, wheel, gush, buildPipes());
  D.scene.add(group);
}

// ---- from the server
export function onSnapshot(fl) {
  if (!on) return;
  if (!fl) { st.target = FLOOD.base; st.open = false; st.turning = false; return; }
  st.target = fl[0];
  st.open = !!fl[1];
  st.turning = !!fl[2];
}

function floodValve(m) {
  if (!on) return;
  st.open = !!m.open;
  const k = floodKit();
  if (!k) return;
  const { ctx, burst, tone } = k, t = ctx.currentTime, out = audio.out(m.p, [9, 0.7]);
  // the wheel hits its stop with a heavy iron clunk; opening, the pipes bang as the water hits them
  burst(out, t, { dur: 0.22, freq: 650, gain: 1.1 });
  tone(out, t, { freq: 85, freqEnd: 40, dur: 0.35, gain: 0.7 });
  if (m.open) for (let i = 0; i < 4; i++) burst(out, t + 0.25 + i * 0.18 + Math.random() * 0.06, { dur: 0.12, type: 'bandpass', freq: 300 + Math.random() * 200, q: 3, gain: 0.8 });
}

// Electrocution: sparks and a blue flash at the fuse box and on everyone hit, a crackle, the lights flicker out.
function floodZap(m) {
  if (!on) return;
  const { fx } = D;
  for (let i = 0; i < 4; i++) fx.sparks(m.p, [0, -0.3, 1]);
  fx.flashLight(m.p, 45, 0.5, 0x9fd8ff);
  for (const v of m.v || []) {
    for (let i = 0; i < 14; i++) fx.emit(v, [(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4], [0.7, 0.85, 1], 0.2 + Math.random() * 0.25);
  }
  const k = floodKit();
  if (k) {
    const { ctx, burst, tone } = k, t = ctx.currentTime, out = audio.out(m.p, [10, 0.6]);
    burst(out, t, { dur: 0.3, freq: 1200, gain: 1.2 }); // the bang of the short
    tone(out, t, { freq: 50, freqEnd: 100, dur: 1.3, type: 'sawtooth', gain: 0.3 }); // the mains buzzing through the water
    tone(out, t, { freq: 150, freqEnd: 300, dur: 1.1, type: 'square', gain: 0.07 });
    for (let i = 0; i < 40; i++) burst(out, t + Math.random() * 1.3, { dur: 0.02 + Math.random() * 0.03, type: 'highpass', freq: 2500 + Math.random() * 4000, gain: 0.6 });
    burst(out, t + 1.3, { dur: 0.4, type: 'lowpass', freq: 500, gain: 1.0 }); // the fuse blowing
  }
  // the lights flicker, then go out (the server's 'lights' message right after this one switches them off)
  const lit = { ...D.game.lights }, dark = { ...lit, power: false };
  for (const g of map.fusebox?.groups || []) dark[g] = false;
  [[0, dark], [70, lit], [150, dark], [260, lit], [340, dark], [480, lit], [560, dark], [900, dark]].forEach(([ms, l]) => setTimeout(() => { if (on) D.applyLights(l); }, ms));
}

// A grenade under water: a Molotov, flashbang or smoke grenade fizzles out with a hiss and a splash.
function floodFizzle(m) {
  if (!on) return;
  splash(m.p, 18, 2.5);
  const k = floodKit();
  if (!k) return;
  const { ctx, burst } = k, t = ctx.currentTime, out = audio.out(m.p);
  burst(out, t, { dur: 0.7, type: 'highpass', freq: 2600, gain: 0.45 });
  burst(out, t, { dur: 0.3, type: 'bandpass', freq: 700, freqEnd: 1800, q: 0.8, gain: 0.5 });
}

// An HE grenade under water: a muffled thump and a column of water thrown up.
function floodBoom(m) {
  if (!on) return;
  const top = waterTop(st.level, [m.p[0], m.p[1] + 0.1, m.p[2]]);
  splash([m.p[0], Number.isFinite(top) ? top : m.p[1], m.p[2]], 40, 6);
  audio.muffled = true;
  try { audio.play('heboom', m.p); } finally { audio.muffled = false; }
  const d = Math.hypot(D.me.p[0] - m.p[0], D.me.p[1] - m.p[1], D.me.p[2] - m.p[2]);
  D.me.shake = Math.max(D.me.shake || 0, Math.max(0, 1 - d / 12) * 0.6);
}

function splash(p, n, up) {
  for (let i = 0; i < n; i++) D.fx.emit(p, [(Math.random() - 0.5) * 2.5, Math.random() * up + 1, (Math.random() - 0.5) * 2.5], [0.75, 0.85, 0.9], 0.4 + Math.random() * 0.4);
}

// ---- the gushing outlet's sound: running water, loud and carrying along the drain; a deep rumble once its mouth is
// under the water
function startGush() {
  const k = floodKit();
  if (!k || gushSound) return;
  const { ctx, noise } = k;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), out = audio.out(FLOOD.outlet, [8, 0.7]);
  src.buffer = noise;
  src.loop = true;
  f.type = 'bandpass';
  f.frequency.value = 700;
  f.Q.value = 0.5;
  g.gain.setValueAtTime(0.001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.8);
  src.connect(f).connect(g).connect(out);
  src.start();
  gushSound = { src, f, g, ctx, under: false };
}
function stopGush() {
  if (!gushSound) return;
  const { src, g, ctx } = gushSound, t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0, t + 0.6);
  src.stop(t + 0.7);
  gushSound = null;
}

// ---- the camera under the water: a murky tint, and the fog closes in
function underwater(yes) {
  if (tint) tint.style.display = yes ? 'block' : 'none';
  const fog = D?.scene.fog;
  if (yes && fog && !fogSaved) {
    fogSaved = { fog, color: fog.color.clone(), near: fog.near, far: fog.far };
    fog.color.set(0x16302a);
    fog.near = 0.2;
    fog.far = 11;
  } else if (!yes && fogSaved) {
    if (fogSaved.fog === fog) { fog.color.copy(fogSaved.color); fog.near = fogSaved.near; fog.far = fogSaved.far; }
    fogSaved = null;
  }
}

// ---- every frame
export function update(dt, now, camera) {
  if (!on || !group) return;
  const { me } = D;
  // the level: eased towards the server's
  const diff = st.target - st.level; // (it moves ~0.1 m a second; a jump is a new round or joining: at once)
  st.level = Math.abs(diff) < 0.003 || Math.abs(diff) > 0.5 ? st.target : st.level + diff * Math.min(1, dt * 4);
  setFloodBoxes(boxes, st.level);
  const wet = st.level > FLOOD.base + 0.03;

  // the surface: the areas the water's top is in (rebuilt only when that changes)
  const list = wet ? FLOOD_AREAS.filter(([, , , , floor, ceil, from = -Infinity]) => st.level > floor + 0.02 && st.level < ceil - 0.02 && st.level > from) : [];
  const key = list.map(a => FLOOD_AREAS.indexOf(a)).join(',');
  if (key !== surfKey) {
    surfKey = key;
    surf.geometry.dispose();
    surf.geometry = list.length ? surfaceGeometry(list) : new THREE.BufferGeometry();
  }
  surf.visible = list.length > 0;
  surf.position.y = st.level;
  if (surf.visible) { surfTex.offset.x += dt * 0.03; surfTex.offset.y = Math.sin(now * 0.0004) * 0.05; }

  // the wheel turns while someone holds E on it
  if (st.turning) wheel.rotation.z += dt * 2.4 * (st.open ? 1 : -1);
  if (st.turning && !st.wasTurning) audio.play('creak', FLOOD.valve.p, FLOOD.hold);
  st.wasTurning = st.turning;

  // the water gushing out of the outlet (until its mouth is under the water)
  const [ox, oy, oz] = FLOOD.outlet, mouthUnder = st.level > oy - 0.05;
  gush.visible = st.open && !mouthUnder;
  if (gush.visible) {
    gush.scale.y = Math.max(0.05, oy - Math.max(st.level, FLOOD.valve.floor));
    gushTex.offset.y += dt * 2.5;
  }
  const near = camera.position.distanceToSquared(_v.set(ox, oy, oz)) < 30 * 30;
  if (st.open && near && now > st.foamAt) {
    st.foamAt = now + 50;
    const y = Math.max(st.level, FLOOD.valve.floor);
    if (mouthUnder) D.fx.emit([ox + (Math.random() - 0.5) * 0.3, oy, oz + (Math.random() - 0.5) * 0.3], [0, 1.2, 0], [0.8, 0.9, 0.9], 0.4 + Math.random() * 0.4, -1);
    else for (let i = 0; i < 2; i++) D.fx.emit([ox, y + 0.05, oz], [(Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2], [0.85, 0.92, 0.95], 0.35 + Math.random() * 0.2);
  }
  if (st.open) {
    startGush();
    if (gushSound && gushSound.under !== mouthUnder) {
      gushSound.under = mouthUnder;
      const t = gushSound.ctx.currentTime;
      gushSound.f.frequency.setTargetAtTime(mouthUnder ? 180 : 700, t, 0.3);
      gushSound.g.gain.setTargetAtTime(mouthUnder ? 0.35 : 0.6, t, 0.3);
    }
  } else stopGush();

  // the camera under the water
  const cam = camera.position, camUnder = wet && cam.y < waterTop(st.level, [cam.x, cam.y, cam.z]);
  underwater(camUnder);

  // your breath (the server keeps the real count; this follows the same rule)
  const eye = [me.p[0], me.p[1] + (me.crouch ? PLAYER.crouchEye : PLAYER.eye), me.p[2]];
  const headUnder = me.alive && wet && eye[1] < waterTop(st.level, eye);
  if (!me.alive) st.air = FLOOD.breath;
  else if (headUnder) st.air = Math.max(0, st.air - dt);
  else {
    if (st.gasp && st.air < FLOOD.breath * 0.5) gasp();
    st.air = Math.min(FLOOD.breath, st.air + dt * FLOOD.recover);
  }
  st.gasp = headUnder;
  breathEl.style.display = me.alive && st.air < FLOOD.breath - 0.05 ? 'block' : 'none';
  breathFill.style.width = `${Math.round((100 * st.air) / FLOOD.breath)}%`;
  breathFill.style.background = st.air < 3 ? '#ff6a5a' : '#7cc8ff';
  // bubbles out of your mouth while you hold your breath, and a blub when it's running out
  if (headUnder && camUnder && now > st.bubbleAt) {
    st.bubbleAt = now + (st.air < 3 ? 120 : 400);
    camera.getWorldDirection(_v);
    D.fx.emit([cam.x + _v.x * 0.5, cam.y - 0.15, cam.z + _v.z * 0.5], [(Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3], [0.75, 0.9, 0.95], 1.2, -2);
  }
  if (headUnder && st.air < 3 && now > st.blubAt) {
    st.blubAt = now + 900;
    const k = floodKit();
    if (k) k.tone(audio.out(null), k.ctx.currentTime, { freq: 260 + Math.random() * 80, freqEnd: 520, dur: 0.12, gain: 0.12 });
  }
}

function gasp() {
  const k = floodKit();
  if (!k) return;
  k.burst(audio.out(null), k.ctx.currentTime, { dur: 0.45, type: 'bandpass', freq: 900, freqEnd: 2000, q: 1.2, gain: 0.35 });
}

// ---- for the HUD
const usable = () => on && D.me.alive && (D.game.phase === 'live' || D.game.phase === 'warmup') && atValve(D.me.p);
export function hint() {
  if (!usable()) return '';
  return st.open ? `Hold E to close the valve (${FLOOD.hold} s) — the water drains away slowly` : `Hold E to open the valve (${FLOOD.hold} s) — it floods the drain, then the cellar and the tunnel`;
}
export const actLabel = () => (st.open ? 'Closing the valve...' : 'Opening the valve...');
// (for the tests: dev/test-scripts/flood/)
export const debug = () => ({ level: st.level, target: st.target, open: st.open, turning: st.turning, air: st.air, surf: !!surf?.visible, areas: surfKey,
  gush: !!gush?.visible, under: tint?.style.display === 'block', breath: breathEl?.style.display === 'block', wheel: wheel?.rotation.z, p: D?.me.p, onGround: D?.me.onGround });
