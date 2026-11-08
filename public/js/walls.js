// Walls & water in the browser (see shared/walls.js).
// - The see-through bullet holes. Every bullet's way through the walls is worked out here too, from the same shared
//   code (penetrate) the server uses: for your own shots at once, for everyone else's from the server's 'shot'
//   message (its direction and where the bullet stopped). Each wall a bullet went through gets a hole on both sides.
//   The holes are cut out of the walls themselves: the materials the penetrable walls are drawn with (and the bullet
//   hole decals) get a few lines of shader that throw away every pixel inside a hole (a thin capsule along the
//   bullet's way through the wall), so you see through them, and a lit room behind shines out of them in the dark.
//   The nearest WALLS.cut holes in front of you are cut; the rest are drawn as dark holes. No new draw calls for the
//   walls; the ring of splinters round each hole is one instanced mesh (one draw call while there are holes).
// - Burst pipes and cut cables (the server's snapshot `wa`): water spraying out of the holes (one mesh for every
//   spray), the wet patches on the floor (public/js/wetfloor.js, one mesh), sparks out of a cut cable's holes while
//   the power is on, the electrocution's flash and crackle ('waZap'), and the hints on the walls where pipes and
//   cables run: radiators and sockets (one mesh).
// Only on the Mansion maps. main.js calls init() once, setMap() on every map load, update() every frame,
// onSnapshot() with the snapshot's `wa`, localShot() for each of your bullets, remoteShot() with each 'shot' message
// and round() at a new round.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { penetrate, WALLS } from '/shared/walls.js';
import { MATERIALS, PAINT_MATERIAL, pieceMaterial, boxMaterial, materialsOn } from '/shared/materials.js';
import { wallRuns } from '/shared/maps/mansion_walls.js';
import { WEAPONS } from '/shared/weapons.js';
import { paintMaterial } from './world.js';
import { createWetFloorView } from './wetfloor.js';
import { audio, floodKit } from './audio.js';

let D = null; // what it needs from main.js (see init)
let map = null, on = false;

// ---------------------------------------------------------------- the see-through holes

const N = WALLS.cut;
// shared by every patched material: the holes cut out this frame, [a.xyz, radius] and [b.xyz, 1 / |b - a|²]
const U = {
  wallsN: { value: 0 },
  wallsA: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
  wallsB: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
};
const holes = []; // { a, b (the capsule, a little past both faces), r, faces: [[p, n] in, [p, n] out], at (entry) }
let rings = null, ringMat = null;
const patched = new Set();

function patchShader(shader) {
  shader.uniforms.wallsN = U.wallsN;
  shader.uniforms.wallsA = U.wallsA;
  shader.uniforms.wallsB = U.wallsB;
  shader.vertexShader = 'varying vec3 vWallsPos;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    vec4 wallsWp = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      wallsWp = instanceMatrix * wallsWp;
    #endif
    vWallsPos = ( modelMatrix * wallsWp ).xyz;`);
  shader.fragmentShader = `varying vec3 vWallsPos;
uniform int wallsN;
uniform vec4 wallsA[ ${N} ];
uniform vec4 wallsB[ ${N} ];
` + shader.fragmentShader.replace('void main() {', `void main() {
  for ( int i = 0; i < ${N}; i ++ ) {
    if ( i >= wallsN ) break;
    vec3 wd = vWallsPos - wallsA[ i ].xyz, wab = wallsB[ i ].xyz - wallsA[ i ].xyz;
    vec3 wq = wd - wab * clamp( dot( wd, wab ) * wallsB[ i ].w, 0.0, 1.0 );
    if ( dot( wq, wq ) < wallsA[ i ].w * wallsA[ i ].w ) discard;
  }`);
}

// Give a material the holes (once): on top of what it already does before compiling (the room light on Lambert).
function patch(mat) {
  if (!mat || patched.has(mat)) return;
  const base = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = function (shader, renderer) { base.call(this, shader, renderer); patchShader(shader); };
  mat.customProgramCacheKey = () => `${key}+walls`;
  mat.needsUpdate = true;
  patched.add(mat);
}

// A ring of splinters with a dark middle (the hole itself, cut out when it's one of the nearest).
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(8,6,4,1)');
  grad.addColorStop(0.36, 'rgba(8,6,4,1)');
  grad.addColorStop(0.42, 'rgba(60,48,36,0.9)');
  grad.addColorStop(0.7, 'rgba(120,104,84,0.35)');
  grad.addColorStop(1, 'rgba(120,104,84,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // splinters
  g.strokeStyle = 'rgba(40,30,22,0.7)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, r0 = 13, r1 = 18 + Math.random() * 10;
    g.beginPath();
    g.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0);
    g.lineTo(32 + Math.cos(a) * r1, 32 + Math.sin(a) * r1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const RING = 0.39; // the dark middle's radius, as a share of the ring's half size

function buildRings() {
  ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  rings = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), ringMat, WALLS.keep * 2);
  rings.count = 0;
  rings.visible = false;
  rings.frustumCulled = false;
  rings.renderOrder = 1;
  patch(ringMat);
  D.scene.add(rings);
}

const _o = new THREE.Object3D();
function setRing(i, p, n, r) {
  _o.position.set(p[0] + n[0] * 0.013, p[1] + n[1] * 0.013, p[2] + n[2] * 0.013);
  _o.rotation.set(0, 0, 0);
  _o.scale.set(1, 1, 1);
  _o.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
  _o.rotateZ(((i * 2.399) % 6.283));
  const s = r / RING;
  _o.scale.set(s, s, 1);
  _o.updateMatrix();
  rings.setMatrixAt(i, _o.matrix);
}
function redrawRings() {
  if (!rings) return;
  holes.forEach((h, k) => { setRing(k * 2, h.faces[0][0], h.faces[0][1], h.r); setRing(k * 2 + 1, h.faces[1][0], h.faces[1][1], h.r); });
  rings.count = holes.length * 2;
  rings.visible = holes.length > 0;
  rings.instanceMatrix.needsUpdate = true;
}

// A bullet went through a wall (a pass from penetrate): a hole in it, bigger where it's already shot full of holes.
function addHole(ps, d, w) {
  const def = WEAPONS[w] || {};
  const base = MATERIALS[ps.mat]?.hole || 0.02;
  let near = 0;
  for (const h of holes) if (Math.hypot(h.at[0] - ps.a[0], h.at[1] - ps.a[1], h.at[2] - ps.a[2]) < WALLS.cluster) near++;
  const r = base * (0.85 + 0.3 * Math.min(1, (def.damage || 30) / 60)) * Math.min(WALLS.grow, 1 + 0.3 * near);
  // the way out: the far side of the last box it crossed
  const last = ps.boxes[ps.boxes.length - 1], nOut = [0, 0, 0];
  let best = Infinity, axis = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) continue;
    const tk = ((d[k] > 0 ? last.max[k] : last.min[k]) - ps.a[k]) / d[k];
    if (tk < best) { best = tk; axis = k; }
  }
  nOut[axis] = Math.sign(d[axis]);
  const e = 0.04; // (a little past both faces, so the decals on them are cut too)
  const a = [ps.a[0] - d[0] * e, ps.a[1] - d[1] * e, ps.a[2] - d[2] * e], b = [ps.b[0] + d[0] * e, ps.b[1] + d[1] * e, ps.b[2] + d[2] * e];
  holes.push({ a, b, r, at: ps.a, faces: [[ps.a, ps.n], [ps.b, nOut]] });
  if (holes.length > WALLS.keep) holes.splice(0, holes.length - WALLS.keep);
  return nOut;
}

// Every bullet: its walls' holes, and plaster dust out of the far side.
function bullet(o, d, range, w, dust) {
  const r = penetrate(map, D.coll(), o, d, range, w, D.me.driving ?? D.me.riding?.id ?? null);
  for (const ps of r.passes) {
    if (ps.t0 > range) break;
    const nOut = addHole(ps, d, w);
    if (dust.n-- > 0) {
      const p = [ps.b[0] + nOut[0] * 0.05, ps.b[1], ps.b[2] + nOut[2] * 0.05];
      D.fx.puff(p, ps.mat === 'wood' ? 0x9a8064 : 0xd8d0c4, 0.5, 0.6, 0.15);
      for (let i = 0; i < 5; i++) D.fx.emit(p, [nOut[0] * 2 + (Math.random() - 0.5), Math.random(), nOut[2] * 2 + (Math.random() - 0.5)], [0.75, 0.7, 0.62], 0.4 + Math.random() * 0.3);
    }
  }
  return r;
}

// Your own bullet (main.js fireBullet): the server works out the same.
export function localShot(o, d, w) {
  if (!on || WEAPONS[w]?.melee) return;
  if (bullet(o, d, 250, w, { n: 1 }).passes.length) redrawRings();
}

// Someone else's shot (the 'shot' message): each bullet's direction and how far it really went.
export function remoteShot(m) {
  if (!on || WEAPONS[m.w]?.melee || !m.tr) return;
  const dust = { n: 2 };
  let any = false;
  for (const [dx, dy, dz, e] of m.tr) {
    const l = Math.hypot(dx, dy, dz) || 1;
    if (bullet(m.o, [dx / l, dy / l, dz / l], e + 0.02, m.w, dust).passes.length) any = true;
  }
  if (any) redrawRings();
}

// The holes to cut this frame: the nearest ones in front of the camera.
const _f = new THREE.Vector3();
function pickHoles(camera) {
  const c = camera.position;
  camera.getWorldDirection(_f);
  const list = [];
  for (const h of holes) {
    const dx = h.at[0] - c.x, dy = h.at[1] - c.y, dz = h.at[2] - c.z, dd = dx * dx + dy * dy + dz * dz;
    if (dd > WALLS.far * WALLS.far) continue;
    if (dd > 4 && dx * _f.x + dy * _f.y + dz * _f.z < 0) continue; // (behind you)
    list.push([dd, h]);
  }
  list.sort((p, q) => p[0] - q[0]);
  const n = Math.min(N, list.length);
  for (let i = 0; i < n; i++) {
    const h = list[i][1], ab2 = (h.b[0] - h.a[0]) ** 2 + (h.b[1] - h.a[1]) ** 2 + (h.b[2] - h.a[2]) ** 2;
    U.wallsA.value[i].set(h.a[0], h.a[1], h.a[2], h.r);
    U.wallsB.value[i].set(h.b[0], h.b[1], h.b[2], ab2 > 1e-9 ? 1 / ab2 : 0);
  }
  U.wallsN.value = n;
}

function clearHoles() {
  holes.length = 0;
  U.wallsN.value = 0;
  redrawRings();
}

// The paints the penetrable walls are drawn with on their sides (patched: the holes can be cut out of them), and the
// rubble inside the breakable chunks.
function wallPaints(m) {
  const keys = new Set(['rubble']);
  for (const pc of m.breakables || []) {
    if (!MATERIALS[pieceMaterial(m, pc)]?.pen) continue;
    for (const [tex, polys] of Object.entries(m.pieceFaces?.[pc.id] || {})) {
      const key = m.faceMats?.[tex];
      if (!key || !MATERIALS[PAINT_MATERIAL[key]]) continue;
      // (only a wall's sides: a hole never goes through a top or a bottom)
      if (polys.some(f => { let y0 = Infinity, y1 = -Infinity; for (let i = 1; i < f.length; i += 5) { y0 = Math.min(y0, f[i]); y1 = Math.max(y1, f[i]); } return y1 - y0 > 0.01; })) keys.add(key);
    }
  }
  return keys;
}

// ---------------------------------------------------------------- burst pipes and cut cables

let wet = null; // the wet floor's view (public/js/wetfloor.js)
let sprays = [], ends = []; // from the snapshot: [x, y, z, nx, nz, flow] and [x, y, z, nx, nz, live]
let sprayMesh = null, sprayTex = null, sprayKey = '', sprayAt = 0;
let hints = null, hintSpots = []; // (hintSpots: where they are, for the tests)
const sparkNext = new Map(); // a cable end ("x,y,z") -> when it sparks next (ms)
let hiss = null; // the nearest spray's sound

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8fb4c4';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 64, y = Math.random() * 64;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 2, y + 10 + Math.random() * 14);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The floor under a point (from the collision), or 2 m down.
const floorCache = new Map();
function floorUnder(p) {
  const k = `${p[0]},${p[1]},${p[2]}`;
  if (floorCache.has(k)) return floorCache.get(k);
  const h = D.coll().raycast([p[0], p[1], p[2]], [0, -1, 0], 3, 'solid');
  const y = h ? p[1] - h.t : p[1] - 2;
  floorCache.set(k, y);
  return y;
}

// Each spray: water thrown out of the hole and falling to the floor, two crossed ribbons along its arc (one mesh).
function sprayGeometry() {
  const parts = [];
  for (const [x, y, z, nx, nz, f] of sprays) {
    const v0 = 0.9 + 2.4 * f, floor = floorUnder([x + nx * 0.3, y, z + nz * 0.3]), fall = Math.max(0.2, y - floor);
    const tEnd = Math.sqrt((2 * fall) / 9.8), n = 8, side = [-nz, 0, nx];
    const pos = [], uv = [], idx = [];
    for (const across of [side, [0, 1, 0]]) {
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * tEnd, px = x + nx * v0 * t, py = y - 4.9 * t * t, pz = z + nz * v0 * t, w = 0.015 + 0.05 * (i / n);
        pos.push(px - across[0] * w, py - across[1] * w, pz - across[2] * w, px + across[0] * w, py + across[1] * w, pz + across[2] * w);
        uv.push(0, i / n * 2, 1, i / n * 2);
        if (i < n) { const a = base + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  const g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  return g;
}

function buildSprays() {
  sprayTex = waterTexture();
  sprayTex.repeat.set(1, 2);
  sprayMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhongMaterial({ map: sprayTex, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, shininess: 80 }));
  sprayMesh.visible = false;
  sprayMesh.renderOrder = 1;
  D.scene.add(sprayMesh);
}

// The hints where the pipes and cables run: a radiator on one side under each pipe, sockets on both sides along each
// cable (where the wall is there). One mesh.
function buildHints(m) {
  if (hints) { D.scene.remove(hints); hints.geometry.dispose(); hints = null; }
  hintSpots = [];
  if (!materialsOn(m)) return;
  const boxes = m.boxes.filter(b => !b.glass && MATERIALS[boxMaterial(m, b)]?.pen);
  const inWall = p => boxes.some(b => p[0] > b.min[0] && p[0] < b.max[0] && p[1] > b.min[1] && p[1] < b.max[1] && p[2] > b.min[2] && p[2] < b.max[2]);
  // the wall's two faces at a point inside it, across axis k
  const facesAt = (p, k) => {
    const out = [];
    for (const s of [-1, 1]) {
      const q = p.slice();
      let i = 0;
      while (i < 40 && inWall(q)) { q[k] += s * 0.02; i++; }
      if (i >= 40) return null;
      out.push([q[k] - s * 0.01, s]);
    }
    return out;
  };
  const parts = [];
  const box = (c, size, k, color) => {
    const sz = k === 0 ? [size[2], size[1], size[0]] : size;
    const g = new THREE.BoxGeometry(...sz).translate(...c);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set(color, i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  };
  for (const run of wallRuns(m)) {
    if (run.name.startsWith('switch')) continue;
    const along = run.a[0] === run.b[0] ? 2 : 0, k = along === 0 ? 2 : 0, len = Math.abs(run.b[along] - run.a[along]), dir = Math.sign(run.b[along] - run.a[along]);
    const at = s => { const p = run.a.slice(); p[along] += dir * s; return p; };
    if (run.kind === 'cable') {
      for (let s = 0.6; s < len - 0.3; s += 2.2) {
        const p = at(s);
        if (!inWall(p)) continue;
        const fs = facesAt(p, k);
        if (!fs) continue;
        for (const [f, sg] of fs) { const c = p.slice(); c[k] = f + sg * 0.03; hintSpots.push({ run: run.name, kind: 'socket', c: c.slice() }); c[k] = f + sg * 0.006; box(c, [0.075, 0.075, 0.012], k, [0.93, 0.91, 0.86]); c[k] = f + sg * 0.013; box(c, [0.03, 0.04, 0.004], k, [0.3, 0.29, 0.27]); }
      }
    } else {
      // the radiator: in the middle of the longest stretch of wall along the pipe
      let best = null, cur = null;
      for (let s = 0.1; s < len - 0.05; s += 0.1) {
        if (inWall(at(s))) { cur ||= { from: s, to: s }; cur.to = s; if (!best || cur.to - cur.from > best.to - best.from) best = { ...cur }; } else cur = null;
      }
      if (!best || best.to - best.from < 0.65) continue;
      const p = at((best.from + best.to) / 2), fs = facesAt(p, k);
      if (!fs) continue;
      const [f, sg] = fs.find(([, s]) => s === run.side) || fs[0];
      const c = p.slice();
      c[k] = f + sg * 0.06;
      c[1] = run.a[1] - 0.42;
      box(c, [0.6, 0.55, 0.07], k, [0.85, 0.84, 0.8]);
      hintSpots.push({ run: run.name, kind: 'radiator', c: c.slice() });
      for (const e of [-0.26, 0.26]) { const s2 = c.slice(); s2[along] += e; s2[1] = run.a[1] - 0.08; s2[k] = f + sg * 0.03; box(s2, [0.035, 0.09, 0.06], k, [0.66, 0.6, 0.5]); }
    }
  }
  if (!parts.length) return;
  hints = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const p of parts) p.dispose();
  hints.receiveShadow = true;
  D.scene.add(hints);
}

export function onSnapshot(wa) {
  if (!on) return;
  wet.set(wa?.[0]);
  sprays = wa?.[1] || [];
  ends = wa?.[2] || [];
}

// Electrocution in a wet patch: a blue flash, sparks on whoever was hit, a crackle and the mains' buzz.
function waZap(m) {
  if (!on) return;
  const { fx } = D;
  wet.zap(performance.now());
  fx.flashLight(m.p, 40, 0.35, 0x9fd8ff);
  for (let i = 0; i < 3; i++) fx.sparks(m.p, [0, 0.4, 0]);
  for (const v of m.v || []) {
    for (let i = 0; i < 12; i++) fx.emit(v, [(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4], [0.7, 0.85, 1], 0.2 + Math.random() * 0.25);
    if (Math.hypot(v[0] - D.me.p[0], v[2] - D.me.p[2]) < 0.6) D.me.shake = Math.max(D.me.shake || 0, 0.6);
  }
  const k = floodKit();
  if (!k) return;
  const { ctx, burst, tone } = k, t = ctx.currentTime, out = audio.out(m.p, [8, 0.7]);
  burst(out, t, { dur: 0.25, freq: 1400, gain: 1.1 });
  tone(out, t, { freq: 50, freqEnd: 90, dur: 0.6, type: 'sawtooth', gain: 0.28 });
  for (let i = 0; i < 18; i++) burst(out, t + Math.random() * 0.6, { dur: 0.02 + Math.random() * 0.03, type: 'highpass', freq: 2500 + Math.random() * 4000, gain: 0.55 });
}

function updateSprays(dt, now, camera) {
  // the ribbons: rebuilt when the sprays change (their flow a few times a second)
  const k = sprays.map(s => `${s[0]},${s[1]},${s[2]},${Math.round(s[5] * 10)}`).join(';');
  if (k !== sprayKey && now - sprayAt > 200) {
    sprayKey = k;
    sprayAt = now;
    sprayMesh.geometry.dispose();
    sprayMesh.geometry = sprayGeometry();
  }
  sprayMesh.visible = sprays.length > 0;
  if (sprayMesh.visible) sprayTex.offset.y -= dt * 3;
  // drops splashing where they land, the hiss of the nearest
  const cam = camera.position;
  let near = null, nd = 14 * 14;
  for (const [x, y, z, nx, nz, f] of sprays) {
    const d2 = (x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2;
    if (d2 < nd) { nd = d2; near = [x, y, z, f]; }
    if (d2 < 400 && Math.random() < dt * 25) {
      const v0 = 0.9 + 2.4 * f, floor = floorUnder([x + nx * 0.3, y, z + nz * 0.3]), tEnd = Math.sqrt((2 * Math.max(0.2, y - floor)) / 9.8);
      D.fx.emit([x + nx * v0 * tEnd, floor + 0.03, z + nz * v0 * tEnd], [(Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2], [0.75, 0.85, 0.92], 0.3 + Math.random() * 0.2);
    }
  }
  sprayHiss(near);
}

function sprayHiss(near) {
  const k = floodKit();
  if (!near || !k) { if (hiss) { const { src, g, ctx } = hiss, t = ctx.currentTime; g.gain.setTargetAtTime(0, t, 0.15); src.stop(t + 0.6); hiss = null; } return; }
  const { ctx, noise } = k;
  if (!hiss) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), panner = audio.out(near, [3, 1.1]);
    src.buffer = noise;
    src.loop = true;
    f.type = 'bandpass';
    f.frequency.value = 2600;
    f.Q.value = 0.6;
    g.gain.value = 0;
    src.connect(f).connect(g).connect(panner);
    src.start();
    hiss = { src, g, ctx, panner };
  }
  hiss.g.gain.setTargetAtTime(0.25 + 0.35 * near[3], ctx.currentTime, 0.2);
  if (hiss.panner.positionX) { hiss.panner.positionX.value = near[0]; hiss.panner.positionY.value = near[1]; hiss.panner.positionZ.value = near[2]; }
}

// A cut cable's ends spark at random while the power is on (the server's sparks, the ones that count, keep their own time).
function updateWires(now, camera) {
  const cam = camera.position, k = floodKit();
  for (const [x, y, z, nx, nz, live] of ends) {
    if (!live) continue;
    const key = `${x},${y},${z}`, next = sparkNext.get(key) ?? now;
    if (now < next) continue;
    sparkNext.set(key, now + 300 + Math.random() * 1100);
    const d2 = (x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2;
    if (d2 > 900) continue;
    const p = [x + nx * 0.02, y, z + nz * 0.02];
    D.fx.sparks(p, [nx, 0.2, nz]);
    for (let i = 0; i < 6; i++) D.fx.emit(p, [nx * 1.5 + (Math.random() - 0.5) * 2, Math.random() * 1.5, nz * 1.5 + (Math.random() - 0.5) * 2], [0.75, 0.9, 1], 0.15 + Math.random() * 0.2);
    if (d2 < 100 && Math.random() < 0.35) D.fx.flashLight(p, 8, 0.07, 0x9fd8ff);
    if (k && d2 < 400) {
      const t = k.ctx.currentTime, out = audio.out(p, [3, 1.2]);
      for (let i = 0; i < 6; i++) k.burst(out, t + Math.random() * 0.15, { dur: 0.015 + Math.random() * 0.025, type: 'highpass', freq: 3000 + Math.random() * 3500, gain: 0.45 });
    }
  }
}

// ---------------------------------------------------------------- set-up

// deps: { scene, net, fx, me, game, coll() (the collision world), remotes, hud, map() }
export function init(deps) {
  D = deps;
  buildRings();
  buildSprays();
  wet = createWetFloorView(D.scene);
  patch(D.fx.decalMat);
  Object.assign(D.net.handlers, { waZap });
}

export function setMap(m) {
  map = m;
  on = materialsOn(m);
  clearHoles();
  clearWater();
  floorCache.clear();
  buildHints(m);
  if (!on) return;
  for (const key of wallPaints(m)) patch(paintMaterial(key));
}

function clearWater() {
  wet?.clear();
  sprays = [];
  ends = [];
  sparkNext.clear();
  sprayHiss(null);
}

export function round() {
  clearHoles();
  clearWater();
}

// every frame
export function update(dt, now, camera) {
  if (!on) { if (sprayMesh) sprayMesh.visible = false; if (wet) wet.mesh.visible = false; return; }
  pickHoles(camera);
  wet.update(dt, now);
  updateSprays(dt, now, camera);
  updateWires(now, camera);
}

// (for the tests)
export const debug = () => ({ on, holes: holes.length, cut: U.wallsN.value, rings: rings?.count ?? 0, patched: patched.size,
  list: holes.map(h => ({ a: h.a, b: h.b, r: h.r })),
  patches: wet?.list().length ?? 0, wetMesh: !!wet?.mesh.visible, sprays: sprays.length, sprayMesh: !!sprayMesh?.visible, ends: ends.length,
  hints: hints ? hints.geometry.attributes.position.count : 0, hintSpots });
