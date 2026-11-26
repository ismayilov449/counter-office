// The cars' and the helicopter's models build under Node (three from node_modules, a stub canvas), without a browser:
//   node dev/test-scripts/models/check.mjs
// Each is the size of its collision boxes, the cars keep their four wheels (two that steer), and the fixed parts are
// merged (few draw calls on the Intel laptops).
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };

const THREE = await import('three');
const { MAPS } = await import('../../../shared/maps/index.js');
const { S } = await import('../../../shared/heli.js');
const { createCarModel, createPickupModel } = await import('../../../public/js/world.js');
const { createHeli } = await import('../../../public/js/heli.js');
let fails = 0;
const ok = (w, c) => { console.log((c ? 'OK   ' : 'FAIL ') + w); if (!c) { fails++; process.exitCode = 1; } };
const box = o => new THREE.Box3().setFromObject(o);
const fin = b => [b.min, b.max].every(v => [v.x, v.y, v.z].every(Number.isFinite));
const meshes = o => { const n = []; o.traverse(x => x.isMesh && n.push(x)); return n; };
for (const [name, make, len] of [['car', createCarModel, 4.3], ['pickup', createPickupModel, 4.7]]) {
  const m = make('#7a1e1a'), bb = box(m), n = meshes(m).length;
  ok(`${name}: ${n} meshes, ${(bb.max.x - bb.min.x).toFixed(2)} x ${(bb.max.y - bb.min.y).toFixed(2)} x ${(bb.max.z - bb.min.z).toFixed(2)} m`,
    fin(bb) && Math.abs(bb.max.z - bb.min.z - len) < 0.4 && bb.max.x - bb.min.x < 2.25 && bb.min.y > -0.01 && n <= 20 && m.userData.spins.length === 4 && m.userData.steers.length === 2);
}
const scene = new THREE.Scene();
const hc = createHeli({ me: { p: [0, 0, 0], alive: false }, game: {}, scene, audio: { engine() {}, play() {} }, hud: { small() {} }, send() {}, map: () => MAPS.cs_mansion, coll: () => ({ heli: [] }), keys: () => new Set(), remotes: new Map(), camera: null });
hc.load();
const model = scene.children.find(o => o.isGroup), bb = box(model), n = meshes(model).length;
ok(`helicopter: ${n} meshes, ${(bb.max.x - bb.min.x).toFixed(2)} x ${(bb.max.y - bb.min.y).toFixed(2)} x ${(bb.max.z - bb.min.z).toFixed(2)} m (scale ${S}, the rotor's span included)`, fin(bb) && n <= 25 && bb.max.y - bb.min.y < 2.4);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
