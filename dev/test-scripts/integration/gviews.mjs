// Draw calls in a few key views of the Mansion, in the real game (headless Edge on CDP_PORT, server on GAME_PORT with
// BOTS=0; the map is the server's). Counts every WebGL draw per frame (min / median / max over 40 frames) at each view,
// and takes a screenshot of each (OUT, prefix PREFIX). LIVING_Y: the living room's floor (0.813; main before the
// integration walked on 0.91). Also: the black blocks reported at x 28.5, z 5..7 and the cellar stairwell (bugs 5, 6):
// screenshots and the scene's meshes in those spots.
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
const PREFIX = process.env.PREFIX || 'gv';
const LY = +(process.env.LIVING_Y || 0.813);
const g = await open('CT', 'Viewer', ['round', 'msg']);
await g.cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 6 && !(await g.ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await g.ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await sleep(1500);
}
const t = await player('Parked', 'T');
for (let i = 0; i < 100 && !(JSON.parse(await g.ev('JSON.stringify(__in)')).some(m => m.t === 'round')); i++) await sleep(200);
t.at([-37.5, 0, 1.5], 0);
await sleep(4000); // (the freeze time, and the first frames' extra shader work)
await g.ev(`(async () => {
  const THREE = await import('three');
  window.__dc = { n: 0, frames: [] };
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const o = C.prototype[f]; if (o) C.prototype[f] = function (...a) { window.__dc.n++; return o.apply(this, a); };
  }
  const tick = () => { __dc.frames.push(__dc.n); __dc.n = 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__scenes = new Set();
  const umw = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (f) { if (this.isScene) window.__scenes.add(this); return umw.call(this, f); };
  // the meshes whose world box meets [min, max]
  window.__meshesIn = (min, max) => {
    const b = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), out = [];
    for (const s of __scenes) s.traverse(o => {
      if (!(o.isMesh || o.isPoints || o.isSprite) || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (o.isInstancedMesh || !wb.intersectsBox(b)) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      out.push({ name: o.name || o.type, mat: m?.type, color: m?.color?.getHexString?.(), map: !!m?.map, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 | 0,
        box: [wb.min.x, wb.min.y, wb.min.z, wb.max.x, wb.max.y, wb.max.z].map(v => +v.toFixed(2)), parent: o.parent?.type });
    });
    return out.filter(o => o.box[3] - o.box[0] < 30 && o.box[5] - o.box[2] < 30); // (not the whole map's merged meshes)
  };
  return 1;
})()`);
const measure = async () => JSON.parse(await g.ev(`(async () => {
  await new Promise(r => setTimeout(r, 600)); __dc.frames.length = 0;
  while (__dc.frames.length < 42) await new Promise(r => setTimeout(r, 100));
  const f = __dc.frames.slice(2).sort((a, b) => a - b);
  return JSON.stringify({ min: f[0], med: f[f.length >> 1], max: f[f.length - 1], mean: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1) });
})()`));
const VIEWS = [
  ['living', [-16.0, LY, 0.5], -Math.PI / 2, 0],  // the living room, looking west at the sofa, the basket and the lift
  ['kitchen', [-17.5, 0.81, -11.5], 0, 0],        // the kitchen, looking north at the gas pipe
  ['cellar', [-15.5, -2.2, 0.5], Math.PI / 2, 0], // the cellar, looking west along it to the lift and the fuse box
  ['street', [26.5, 0, 0.5], Math.PI / 2, 0],     // the street at the gate, looking west at the house
];
const res = {};
for (const [name, p, yaw, pitch] of VIEWS) {
  await g.tp(p, yaw, pitch); await sleep(2500);
  res[name] = await measure();
  await g.shot(`${PREFIX}_${name}.png`);
  console.log(`${name.padEnd(8)} draws/frame min ${res[name].min} median ${res[name].med} max ${res[name].max} mean ${res[name].mean}`);
}
// bug 6: the black blocks at about x 28.5, z 5..7 (south of the gate along the street)
await g.tp([26.0, 0, 2.5], -2.45, 0); await sleep(2500);
await g.shot(`${PREFIX}_blocks.png`);
console.log('meshes at x 27.8..29.4, z 4..8:', JSON.stringify(JSON.parse(await g.ev('JSON.stringify(__meshesIn([27.8, -0.5, 4], [29.4, 4.5, 8]))'))));
// bug 5: the cellar stairwell, looking at its walls' tops and the doorway from the steps
for (const [n, p, yaw, pitch] of [['stair_e', [-14.4, -0.59, -7.6], -Math.PI / 2, 0.25], ['stair_w', [-14.4, -0.59, -7.6], Math.PI / 2, 0.25], ['stair_n', [-14.4, 0.21, -8.8], 0, -0.1]]) {
  await g.tp(p, yaw, pitch); await sleep(2500);
  await g.shot(`${PREFIX}_${n}.png`);
}
// the cat's shadow (CAT=1; the integrated build): drawn into the sun's (moon's) shadow map, never a room lamp's. A test
// point light with a shadow is put right over the cat; for 20 frames the cat's shadow draws are counted by the kind of
// shadow camera (orthographic: the sun's; perspective: a point light's cube faces).
if (process.env.CAT) {
  await g.tp([-19.5, LY, 2.5], Math.PI / 2 + 0.6, 0); await sleep(2000); // (near the basket, looking at it)
  const r = JSON.parse(await g.ev(`(async () => {
    const THREE = await import('three');
    let mesh = null, scene = null;
    for (const s of __scenes) s.traverse(o => { if (o.userData?.eyes && o.userData?.mesh && o.parent === s) { mesh = o.userData.mesh; scene = s; } });
    if (!mesh) return JSON.stringify({ error: 'no cat' });
    const n = { ortho: 0, persp: 0 }, own = mesh.onBeforeShadow;
    mesh.onBeforeShadow = function (r, o, cam, sc, ...a) { n[sc.isOrthographicCamera ? 'ortho' : 'persp']++; return own.call(this, r, o, cam, sc, ...a); };
    const p = new THREE.Vector3(); mesh.getWorldPosition(p);
    const L = new THREE.PointLight(0xffffff, 5, 8); L.castShadow = true; L.position.set(p.x, p.y + 1.4, p.z); scene.add(L);
    await new Promise(r => setTimeout(r, 1500)); n.ortho = n.persp = 0; // (the new light's shaders)
    __dc.frames.length = 0; while (__dc.frames.length < 22) await new Promise(r => setTimeout(r, 100));
    const on = __dc.frames.slice(2).reduce((a, b) => a + b, 0) / 20;
    mesh.layers.set(31); __dc.frames.length = 0; while (__dc.frames.length < 22) await new Promise(r => setTimeout(r, 100));
    const off = __dc.frames.slice(2).reduce((a, b) => a + b, 0) / 20;
    mesh.layers.set(0); scene.remove(L); mesh.onBeforeShadow = own;
    return JSON.stringify({ ...n, cat: [p.x, p.y, p.z].map(v => +v.toFixed(2)), drawsWithCat: on, drawsWithout: off });
  })()`));
  console.log(`cat shadow, a shadow-casting point light over it: ${JSON.stringify(r)} (perspective must be 0)`);
  await g.shot(`${PREFIX}_cat.png`);
}
console.log('page errors:', g.errors.length ? g.errors.join(' | ') : 'none');
console.log('RESULT ' + JSON.stringify(res));
t.close();
process.exit(0);
