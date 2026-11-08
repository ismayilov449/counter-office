// Walls & water in the browser (see shared/walls.js): the see-through bullet holes. Every bullet's way through the
// walls is worked out here too, from the same shared code (penetrate) the server uses: for your own shots at once,
// for everyone else's from the server's 'shot' message (its direction and where the bullet stopped). Each wall a
// bullet went through gets a hole on both sides.
//   The holes are cut out of the walls themselves: the materials the penetrable walls are drawn with (and the bullet
//   hole decals) get a few lines of shader that throw away every pixel inside a hole (a thin capsule along the
//   bullet's way through the wall), so you see through them, and a lit room behind shines out of them in the dark.
//   The nearest WALLS.cut holes in front of you are cut; the rest are drawn as dark holes. No new draw calls for the
//   walls; the ring of splinters round each hole is one instanced mesh (one draw call while there are holes).
// Only on the Mansion maps. main.js calls init() once, setMap() on every map load, update() every frame,
// localShot() for each of your bullets, remoteShot() with each 'shot' message and round() at a new round.
import * as THREE from 'three';
import { penetrate, WALLS } from '/shared/walls.js';
import { MATERIALS, PAINT_MATERIAL, pieceMaterial, materialsOn } from '/shared/materials.js';
import { WEAPONS } from '/shared/weapons.js';
import { paintMaterial } from './world.js';

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

// ---------------------------------------------------------------- set-up

// deps: { scene, net, fx, me, game, coll() (the collision world), remotes, hud }
export function init(deps) {
  D = deps;
  buildRings();
  patch(D.fx.decalMat);
}

export function setMap(m) {
  map = m;
  on = materialsOn(m);
  clearHoles();
  if (!on) return;
  for (const key of wallPaints(m)) patch(paintMaterial(key));
}

export function round() {
  clearHoles();
}

// every frame
export function update(dt, now, camera) {
  if (!on) return;
  pickHoles(camera);
}

// (for the tests)
export const debug = () => ({ on, holes: holes.length, cut: U.wallsN.value, rings: rings?.count ?? 0, patched: patched.size,
  list: holes.map(h => ({ a: h.a, b: h.b, r: h.r })) });
