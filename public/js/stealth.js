// Stealth & hiding in the browser (ROADMAP group 4; the rules both sides use: shared/stealth.js; the server's part:
// lib/stealth.js; the geometry: shared/maps/mansion_stealth.js). main.js calls it from a few lines marked "stealth:".
//   4.1 the chimney: its rungs as a ladder (added here, like the lift's, so the bots' grid never takes them; taken away
//       while the fire burns), the fire in the hearth (the Molotov's flames, smoke out of the stack), the soot: black
//       footprints behind everyone the snapshot says is sooty, for everyone to see (one instanced mesh: one draw call);
//   4.2 the creaking boards (each browser hears whoever steps on a creaky spot, like footsteps);
//   4.3 the trunk: hiders aren't drawn; in one yourself, a dark view through the gap under the lid.
import * as THREE from 'three';
import { STEALTH, stealthOf, chimneyLadder, inFlue, atHearth, atTop } from '/shared/stealth.js';
import { PLAYER, inWater } from '/shared/physics.js';
import { audio, floodKit } from './audio.js';

let ctx = null; // { scene, me, net, hud, fx, game, remotes, cars: Map, coll(), map() }
let S = null; // the map's stealth data ({ chimney, creaks }) or null
let C = null; // its chimney
let ladder = null; // the chimney's rungs, in map.ladders
let lit = false; // the fireplace burns
const soot = new Map(); // player id -> performance.now() when their soot is gone
let prints = null; // the footprints (see Prints)
let smokeAt = 0, sootTold = false;

// ---------------------------------------------------------------- sounds (made like the flood's: audio.js's parts)
function sound(name, pos) {
  const k = floodKit();
  if (!k) return;
  const { ctx: ac, burst, tone } = k, t = ac.currentTime;
  if (name === 'light') {
    // a match struck, then the kindling catching with a whoosh
    const out = audio.out(pos, [5, 1]);
    burst(out, t, { dur: 0.12, type: 'highpass', freq: 2500, gain: 0.35 });
    burst(out, t + 0.15, { dur: 1.2, type: 'bandpass', freq: 300, freqEnd: 1400, q: 0.6, gain: 0.5 });
    tone(out, t + 0.15, { freq: 60, freqEnd: 90, dur: 0.9, gain: 0.25 });
    for (let i = 0; i < 8; i++) burst(out, t + 0.5 + Math.random() * 1.2, { dur: 0.02, type: 'highpass', freq: 3000, gain: 0.18 });
  } else if (name === 'trunk') {
    // the lid: a hollow metal thump and the latch
    const out = audio.out(pos, [5, 1]);
    burst(out, t, { dur: 0.12, freq: 380, gain: 0.8 });
    tone(out, t, { freq: 110, freqEnd: 70, dur: 0.18, gain: 0.45 });
    tone(out, t + 0.02, { freq: 900, dur: 0.15, type: 'triangle', gain: 0.05 });
    burst(out, t + 0.16, { dur: 0.03, type: 'highpass', freq: 3500, gain: 0.3 });
  }
}

// ---------------------------------------------------------------- the footprints
// The level's upward faces in a 2 m grid, for the floor under a footprint as it's drawn (a slope like the roof is a
// stair of 0.1 m boxes in the collision). The same as blood.js's floor index (copied: blood.js keeps its own).
const CELL = 2, key = (cx, cz) => cx * 65536 + cz;
function floorIndex(map) {
  if (!map.faces) return null;
  const polys = [], cells = new Map();
  for (const [tex, list] of Object.entries(map.faces)) {
    if (map.faceMats && !map.faceMats[tex]) continue;
    for (const f of list) {
      const n = f.length / 5;
      if (n < 3) continue;
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = i * 5, b = j * 5;
        nx += (f[a + 1] - f[b + 1]) * (f[a + 2] + f[b + 2]);
        ny += (f[a + 2] - f[b + 2]) * (f[a] + f[b]);
        nz += (f[a] - f[b]) * (f[a + 1] + f[b + 1]);
      }
      const l = Math.hypot(nx, ny, nz);
      if (!l || ny / l < 0.55) continue;
      nx /= l; ny /= l; nz /= l;
      const xz = new Float32Array(n * 2);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = f[i * 5], z = f[i * 5 + 2];
        xz[i * 2] = x; xz[i * 2 + 1] = z;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      const k = polys.length;
      polys.push({ xz, x0, x1, z0, z1, n: [nx, ny, nz], d: nx * f[0] + ny * f[1] + nz * f[2] });
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
          const c = key(cx, cz);
          if (!cells.has(c)) cells.set(c, []);
          cells.get(c).push(k);
        }
      }
    }
  }
  return { polys, cells };
}
function faceFloor(ix, x, z, lo, hi) {
  const list = ix.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return null;
  let best = null;
  for (const k of list) {
    const p = ix.polys[k];
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    const y = (p.d - p.n[0] * x - p.n[2] * z) / p.n[1];
    if (y < lo || y > hi || (best && y <= best.y)) continue;
    const v = p.xz, m = v.length / 2;
    let pos = false, neg = false;
    for (let i = 0; i < m && !(pos && neg); i++) {
      const j = (i + 1) % m;
      const cr = (v[j * 2] - v[i * 2]) * (z - v[i * 2 + 1]) - (v[j * 2 + 1] - v[i * 2 + 1]) * (x - v[i * 2]);
      if (cr > 1e-5) pos = true; else if (cr < -1e-5) neg = true;
    }
    if (!(pos && neg)) best = { y, n: p.n };
  }
  return best;
}

// A sooty shoe print: the sole and the heel, smudged (alpha in the texture).
function printTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,12,11,0.95)';
  g.beginPath(); g.ellipse(16, 20, 10, 15, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(16, 50, 8, 9, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.5})`; g.fillRect(Math.random() * 32, Math.random() * 64, 2, 2); }
  for (let y = 8; y < 34; y += 5) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(6, y, 20, 1.5); } // the sole's tread
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PRINT = { max: 240, life: 60, fade: 12, step: 0.42, w: 0.12, l: 0.28, side: 0.09 };
const _o = new THREE.Object3D(), _n = new THREE.Vector3(), _f = new THREE.Vector3();
class Prints {
  constructor(scene) {
    this.uNow = { value: 0 };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(PRINT.max).fill(-1e5), 1);
    this.dark = new THREE.InstancedBufferAttribute(new Float32Array(PRINT.max).fill(0), 1);
    geo.setAttribute('aBorn', this.born);
    geo.setAttribute('aDark', this.dark);
    const mat = new THREE.MeshLambertMaterial({ map: printTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    // the room lighting every Lambert material has (roomlight.js), then each print's darkness and its fading by age
    mat.onBeforeCompile = (shader, renderer) => {
      THREE.MeshLambertMaterial.prototype.onBeforeCompile.call(mat, shader, renderer);
      shader.uniforms.uSootNow = this.uNow;
      shader.vertexShader = 'attribute float aBorn;\nattribute float aDark;\nvarying float vBorn;\nvarying float vDark;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBorn = aBorn;\n\tvDark = aDark;');
      shader.fragmentShader = 'uniform float uSootNow;\nvarying float vBorn;\nvarying float vDark;\n' + shader.fragmentShader
        .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
	diffuseColor.a *= vDark * clamp( ( ${PRINT.life.toFixed(1)} - ( uSootNow - vBorn ) ) / ${PRINT.fade.toFixed(1)}, 0.0, 1.0 );
	if ( diffuseColor.a < 0.01 ) discard;`);
    };
    mat.customProgramCacheKey = () => 'room-light-soot';
    this.mesh = new THREE.InstancedMesh(geo, mat, PRINT.max);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.count = 0;
    this.next = 0;
    this.walkers = new Map(); // player id -> { last: [x, y, z], acc, side }
    this.index = null;
    this.map = null;
  }

  setMap(map) {
    this.clear();
    if (map !== this.map) { this.map = map; this.index = S ? floorIndex(map) : null; }
  }

  clear() {
    this.count = 0; this.next = 0; this.mesh.count = 0; this.mesh.visible = false;
    this.walkers.clear();
  }

  // The floor right under feet p, as drawn: { y, n } or null (in the air, up a ladder, in water).
  floor(x, y, z) {
    const coll = ctx.coll(), h = coll.raycast([x, y + 0.4, z], [0, -1, 0], 0.8, 'solid');
    let fy = h && h.n[1] > 0 ? y + 0.4 - h.t : null, n = [0, 1, 0];
    if (fy == null || Math.abs(fy - y) > 0.25) return null;
    if (this.index) { const f = faceFloor(this.index, x, z, fy - 0.2, fy + 0.3); if (f) { fy = f.y; n = f.n; } }
    if (inWater(this.map.water, [x, fy + 0.05, z])) return null;
    return { y: fy, n };
  }

  put(x, z, f, yaw, dark) {
    const i = this.next;
    this.next = (i + 1) % PRINT.max;
    this.count = Math.min(PRINT.max, this.count + 1);
    // flat on the floor (tilted with a slope), its toe along the walk
    _n.set(f.n[0], f.n[1], f.n[2]);
    _f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _f.addScaledVector(_n, -_f.dot(_n)).normalize();
    _o.position.set(x + f.n[0] * 0.01, f.y + f.n[1] * 0.01, z + f.n[2] * 0.01);
    _o.up.copy(_f); // (the texture's top, the toe, along the walk)
    _o.lookAt(x + f.n[0], f.y + f.n[1], z + f.n[2]);
    _o.scale.set(PRINT.w, PRINT.l, 1);
    _o.updateMatrix();
    const m = this.mesh;
    m.setMatrixAt(i, _o.matrix);
    this.born.array[i] = performance.now() / 1000;
    this.dark.array[i] = dark;
    m.instanceMatrix.addUpdateRange(i * 16, 16);
    m.instanceMatrix.needsUpdate = true;
    this.born.addUpdateRange(i, 1); this.born.needsUpdate = true;
    this.dark.addUpdateRange(i, 1); this.dark.needsUpdate = true;
    m.count = this.count;
    m.visible = true;
  }

  // Every frame: a print every step behind everyone who is sooty (where this browser sees them).
  update(now) {
    this.uNow.value = now / 1000;
    const { me, remotes } = ctx;
    for (const [id, until] of soot) {
      let p = null;
      if (id === me.id) p = me.alive && me.driving == null && !me.riding && me.trunk == null ? me.p : null;
      else { const r = remotes.get(id); if (r && r.alive && r.buf.length && !r.inTrunk) p = r.p; }
      let w = this.walkers.get(id);
      if (!p) { if (w) w.last = null; continue; }
      if (!w) this.walkers.set(id, w = { last: null, acc: 0, side: 1 });
      if (!w.last) { w.last = p.slice(); w.acc = 0; continue; }
      const dx = p[0] - w.last[0], dz = p[2] - w.last[2], d = Math.hypot(dx, dz);
      if (d > 1.5 || Math.abs(p[1] - w.last[1]) > 1.2) { w.last = p.slice(); w.acc = 0; continue; } // (a jump: up the flue, a teleport)
      if (d < 0.02) continue;
      w.acc += d;
      const yaw = Math.atan2(-dx, -dz);
      w.last = p.slice();
      if (w.acc < PRINT.step) continue;
      w.acc = 0;
      w.side = -w.side;
      const x = p[0] + Math.cos(yaw) * PRINT.side * w.side, z = p[2] - Math.sin(yaw) * PRINT.side * w.side;
      const f = this.floor(x, p[1], z);
      if (!f) continue;
      // the soot wears off: dark at first, faint by the end
      const left = Math.max(0, Math.min(1, (until - now) / (STEALTH.soot * 1000)));
      this.put(x, z, f, yaw, 0.3 + 0.62 * left);
    }
    for (const id of this.walkers.keys()) if (!soot.has(id)) this.walkers.delete(id);
  }
}

// ---------------------------------------------------------------- the API main.js uses

export function init(c) {
  ctx = c;
  prints = new Prints(c.scene);
  Object.assign(c.net.handlers, handlers);
}

export function setMap(map) {
  S = stealthOf(map);
  C = S?.chimney || null;
  ladder = null;
  lit = false;
  soot.clear();
  if (C) {
    ladder = S._ladder ||= chimneyLadder(C); // (the night map shares the day map's decor and ladders)
    if (!map.ladders.includes(ladder)) map.ladders.push(ladder);
    setLadder(true);
  }
  prints?.setMap(map);
}

// The rungs climbable, or taken away (a fire burns: whoever is in the flue falls).
function setLadder(on) {
  if (!ladder) return;
  const l = chimneyLadder(C, !on);
  ladder.min = l.min; ladder.max = l.max;
}

const handlers = {
  // the server put us somewhere (into the chimney from the top, out of a trunk)
  stTo(m) {
    const { me } = ctx;
    me.p = m.p.slice();
    me.v = [0, 0, 0];
    me.onGround = !m.c;
    me.crouch = !!m.c;
    me.eyeH = m.c ? PLAYER.crouchEye : PLAYER.eye;
    me.viewY = me.p[1];
  },
  stSfx(m) {
    sound(m.s, m.p);
  },
};

// The snapshot's `st` (or nothing): the fire, who is sooty, who hides in which trunk.
export function onSnapshot(st) {
  const now = performance.now();
  const f = !!st?.f;
  if (f !== lit) { lit = f; setLadder(!lit); if (!lit) ctx.fx.fireOut('fireplace', true); }
  const seen = new Set();
  for (const [id, left] of st?.s || []) { seen.add(id); soot.set(id, now + left * 1000); }
  for (const id of [...soot.keys()]) if (!seen.has(id)) soot.delete(id);
  // coming out of the flue: you're told once
  const { me } = ctx;
  if (soot.has(me.id) && C && !inFlue(C, me.p)) {
    if (!sootTold && me.alive) ctx.hud.small(`You're covered in soot: you leave black footprints for ${STEALTH.soot} s`, 4);
    sootTold = true;
  } else if (!soot.has(me.id)) sootTold = false;
}

// Every frame (after the camera is placed; vm: the gun in your hands).
export function frame(dt, now) {
  if (!ctx) return;
  if (C && lit) fire(now);
  prints.update(now);
}

// The fire in the hearth: the Molotov's flames and glow (and their crackle and burning screen, main.js's), no smoke in
// the room — it goes up the flue and out of the stack.
function fire(now) {
  const fx = ctx.fx;
  if (!fx.fires.some(f => f.id === 'fireplace')) {
    fx.fire('fireplace', [(C.fx1 + C.fx2) / 2, C.hearth, (C.fz1 + C.fz2) / 2 + 0.03], 1e6, 0.3, null);
    const f = fx.fires.find(x => x.id === 'fireplace');
    if (f) f.nextSmoke = Infinity;
  }
  if (now > smokeAt) {
    smokeAt = now + 320;
    fx.puff([(C.fx1 + C.fx2) / 2 + (Math.random() - 0.5) * 0.3, C.top + 0.25, (C.fz1 + C.fz2) / 2 + (Math.random() - 0.5) * 0.3], 0x3a3632, 1.6, 3.2, 1.4);
  }
}

// ---- E: the hint for what E does here, over `hint` (main.js's so far), in the server's order (onUse): the fireplace
// comes after the valves (main.js applies them after this), the chimney's top likewise. Null: nothing of ours here.
export function hint() {
  if (!C || !ctx) return null;
  const { me } = ctx;
  if (!me.alive || me.act) return null;
  if (atTop(C, me.p)) return lit ? 'Smoke and heat pour out of the chimney: the fire below is lit' : 'Press E to climb down the chimney';
  if (atHearth(C, me.p) && !lit) return `Hold E to light the fire (${STEALTH.light} s): nobody gets up or down the chimney until the round ends`;
  return null;
}

// The progress bar's label while holding E for one of ours (null: not ours).
export function progressLabel(a) {
  return a === 'fireplace' ? 'Lighting the fire...' : null;
}

export const fireLit = () => lit;

// (for the node tests: dev/test-scripts/stealth/clientsmoke.mjs)
export const _debug = () => ({ dark: () => prints.dark.array, prints, soot, ladder: () => ladder });
