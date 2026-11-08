// Wet floors in the browser (see shared/wetfloor.js): every soaked patch the server lists, drawn as one mesh (one
// draw call): a dark, shiny film of water on the floor, soft at its edge and cut off at the wall it lies against.
// It flashes blue when a spark electrocutes someone in it. Made for the burst pipes (public/js/walls.js) and meant to
// be reused (the fire hose's patches come through the same list).
//   const view = createWetFloorView(scene); view.set(packed list); view.update(dt, now); view.zap(now);
//   view.at(feet): the patch someone's feet are in (wet guns); view.clear(); view.list()
import * as THREE from 'three';
import { unpackPatch, inPatch } from '/shared/wetfloor.js';

const SEG = 28;

export function createWetFloorView(scene) {
  let patches = [], key = '', flashUntil = 0;
  const mat = new THREE.MeshPhongMaterial({
    color: 0x2a3a48, specular: 0xc0d8ee, shininess: 180, transparent: true, opacity: 0.5, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, vertexColors: true,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.visible = false;
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // A soft disc for each patch (middle, a ring at 3/4 and the edge, fading out), flattened against its wall.
  function build() {
    const pos = [], col = [], nor = [], idx = [];
    for (const pt of patches) {
      const [cx, cy, cz] = pt.p, y = cy + 0.012, base = pos.length / 3;
      const put = (x, z, a) => {
        if (pt.clip) { const k = pt.clip[0], v = k === 0 ? x : z, lim = pt.clip[1] + pt.clip[2] * 0.01; if ((v - lim) * pt.clip[2] < 0) { if (k === 0) x = lim; else z = lim; } }
        pos.push(x, y, z); nor.push(0, 1, 0); col.push(1, 1, 1, a);
      };
      put(cx, cz, 1);
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), w = 0.92 + 0.08 * Math.sin(i * 2.7 + cx * 3.1);
        put(cx + c * pt.r * 0.72 * w, cz + s * pt.r * 0.72 * w, 0.95);
        put(cx + c * pt.r * w, cz + s * pt.r * w, 0);
      }
      for (let i = 0; i < SEG; i++) {
        const j = (i + 1) % SEG, a = base + 1 + i * 2, b = base + 1 + j * 2;
        idx.push(base, b, a, a, b, b + 1, a, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    mesh.geometry.dispose();
    mesh.geometry = g;
  }

  return {
    set(list) { patches = (list || []).map(unpackPatch); },
    update(dt, now) {
      // rebuilt only when a patch appears, goes or grows by a few centimetres
      const k = patches.map(pt => `${pt.p[0]},${pt.p[2]},${Math.round(pt.r * 30)}`).join(';');
      if (k !== key) { key = k; build(); }
      mesh.visible = patches.length > 0;
      const live = now < flashUntil || patches.some(pt => pt.live);
      mat.emissive.setHex(live && Math.random() < 0.7 ? 0x3a78c8 : 0x000000);
    },
    zap(now) { flashUntil = now + 220; },
    at: feet => patches.find(pt => inPatch(pt, feet)) || null,
    clear() { patches = []; },
    list: () => patches,
    mesh,
  };
}
