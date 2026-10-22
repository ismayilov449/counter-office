// Fewer draw calls. Every mesh costs the renderer a draw call (and another for its shadow), so models built from
// many small boxes are merged here:
//   bake(root, deep)  the plain-coloured meshes under root become one mesh with the colours in its vertices (one
//                     shared material); textured, see-through and glowing parts stay as they are.
//   Batch             many static objects in one mesh per material, each of which can still be hidden on its own
//                     (its triangles are collapsed, see breakables in world.js for the same trick).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const painted = new THREE.MeshLambertMaterial({ vertexColors: true });
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();

// Can this mesh's look be carried by vertex colours?
const plain = m =>
  m.isMesh && !m.isInstancedMesh && !Array.isArray(m.material) && (m.material.isMeshLambertMaterial || m.material.isMeshPhongMaterial) &&
  !m.material.map && !m.material.transparent && !m.material.vertexColors && m.material.visible && m.visible &&
  (!m.material.emissive || m.material.emissive.getHex() === 0);

// A geometry in root's space with only position, normal and colour (what the painted material needs).
function painted3(mesh, matrix) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  const c = mesh.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Merge root's plain meshes (only its own children, or everything under it when deep) into one mesh, added to root.
export function bake(root, deep = false) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const parts = [];
  const visit = o => {
    for (const c of [...o.children]) {
      if (plain(c) && c.children.length === 0) parts.push(c);
      else if (deep) visit(c);
    }
  };
  visit(root);
  if (parts.length < 2) return null;
  const geos = parts.map(m => painted3(m, _m.multiplyMatrices(_inv, m.matrixWorld)));
  const merged = new THREE.Mesh(mergeGeometries(geos), painted);
  merged.geometry.userData.own = true; // belongs to this model alone: disposeOwn frees it
  for (const g of geos) g.dispose();
  merged.castShadow = parts.some(m => m.castShadow);
  merged.receiveShadow = parts.some(m => m.receiveShadow);
  for (const m of parts) m.parent.remove(m);
  root.add(merged);
  return merged;
}

// Free the GPU buffers that belong to this model alone (shared geometry — unit boxes, guns copied from a cache —
// stays).
export function disposeOwn(root) {
  root.traverse(o => { if (o.geometry?.userData.own) o.geometry.dispose(); });
}

// Static objects merged per material; each added object can be shown or hidden later. With cell (metres) the
// merging is also per square of the map, so what's off screen (or outside the shadow) still isn't drawn.
export class Batch {
  constructor(group, { castShadow = false, receiveShadow = false, cell = 0 } = {}) {
    this.group = group;
    this.shadow = [castShadow, receiveShadow];
    this.cell = cell;
    this.parts = new Map(); // material (and square) -> { mat, geos, count }
    this.items = [];
  }

  // Every mesh under obj (in world space; only those passing keep) goes in and leaves obj. Returns a handle for
  // setVisible.
  add(obj, keep = () => true) {
    obj.updateMatrixWorld(true);
    const handle = { ranges: [], on: true };
    const meshes = [];
    obj.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material) && keep(o)) meshes.push(o); });
    for (const m of meshes) {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(m.matrixWorld);
      let key = m.material.uuid;
      if (this.cell) {
        g.computeBoundingBox();
        const c = g.boundingBox.getCenter(new THREE.Vector3());
        key += `:${Math.floor(c.x / this.cell)},${Math.floor(c.z / this.cell)}`;
      }
      if (!this.parts.has(key)) this.parts.set(key, { mat: m.material, geos: [], count: 0 });
      const p = this.parts.get(key);
      handle.ranges.push([key, p.count, p.count + g.attributes.position.count]);
      p.count += g.attributes.position.count;
      p.geos.push(g);
      m.parent?.remove(m);
    }
    this.items.push(handle);
    return handle;
  }

  // Build the merged meshes (after all add calls).
  build() {
    this.meshes = new Map();
    if (!this.parts) return this;
    for (const [key, p] of this.parts) {
      // the same attributes everywhere, or mergeGeometries refuses
      const names = ['position', 'normal', 'uv', 'color'].filter(n => p.geos.some(g => g.attributes[n]));
      for (const g of p.geos) {
        for (const n of names) {
          if (g.attributes[n]) continue;
          const size = n === 'uv' ? 2 : 3, arr = new Float32Array(g.attributes.position.count * size);
          if (n === 'color') arr.fill(1);
          g.setAttribute(n, new THREE.BufferAttribute(arr, size));
        }
        if (!g.attributes.normal) g.computeVertexNormals();
      }
      const geo = mergeGeometries(p.geos);
      for (const g of p.geos) g.dispose();
      const mesh = new THREE.Mesh(geo, p.mat);
      [mesh.castShadow, mesh.receiveShadow] = this.shadow;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.meshes.set(key, { mesh, orig: Float32Array.from(geo.attributes.position.array) });
    }
    this.parts = null;
    return this;
  }

  setVisible(handle, on) {
    if (handle.on === on) return;
    handle.on = on;
    for (const [key, a, b] of handle.ranges) {
      const { mesh, orig } = this.meshes.get(key), arr = mesh.geometry.attributes.position.array;
      if (on) arr.set(orig.subarray(a * 3, b * 3), a * 3);
      else arr.fill(0, a * 3, b * 3);
      mesh.geometry.attributes.position.addUpdateRange(a * 3, (b - a) * 3); // just the changed part to the GPU
      mesh.geometry.attributes.position.needsUpdate = true;
    }
  }
}
