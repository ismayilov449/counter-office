// Billboards: every particle of one kind (smoke puffs, fireballs, flames) drawn in a single draw call. A sprite
// per puff meant hundreds of draw calls after an explosion, and that was where the frame time went. Each particle
// looks like a three.js Sprite to the code moving it — position, scale, center, and a material with opacity,
// rotation and color — and every frame flush() packs the live ones into instanced attributes.
import * as THREE from 'three';

const vertexShader = `
attribute vec3 offset;
attribute vec2 size;
attribute vec2 pivot;
attribute vec4 tint;
attribute float spin;
varying vec2 vUv;
varying vec4 vTint;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4( offset, 1.0 );
  // fade out what is right in front of the camera: a screen full of overlapping puffs is the costliest thing to draw
  vTint.a *= smoothstep( 0.4, 2.0, -mvPosition.z );
  vec2 c = ( position.xy + 0.5 - pivot ) * size;
  float s = sin( spin ), k = cos( spin );
  mvPosition.xy += vec2( k * c.x - s * c.y, s * c.x + k * c.y );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vTint;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D( map, vUv );
  gl_FragColor = vec4( t.rgb * vTint.rgb, t.a * vTint.a );
  if ( gl_FragColor.a < 0.002 ) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// One particle: the bits of a Sprite that effects.js touches.
class Particle {
  constructor(board) {
    this.board = board;
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.center = new THREE.Vector2(0.5, 0.5);
    this.material = { opacity: 1, rotation: 0, color: new THREE.Color() };
    this.userData = {};
    this.visible = true;
    this.live = false;
  }
}

export class Billboards {
  constructor(group, map, { additive = false, max = 512, sort = false } = {}) {
    this.max = max;
    this.sort = sort;
    this.items = [];
    this.free = [];
    const g = new THREE.InstancedBufferGeometry();
    g.copy(new THREE.PlaneGeometry(1, 1));
    const attr = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.a = { offset: attr('offset', 3), size: attr('size', 2), pivot: attr('pivot', 2), tint: attr('tint', 4), spin: attr('spin', 1) };
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map } }]),
      vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.material.uniforms.map.value = map;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 2 : 1;
    group.add(this.mesh);
  }

  take() {
    if (this.items.length >= this.max) return null;
    const p = this.free.pop() || new Particle(this);
    p.position.set(0, 0, 0);
    p.scale.set(1, 1, 1);
    p.center.set(0.5, 0.5);
    p.material.opacity = 1;
    p.material.rotation = 0;
    p.material.color.set(0xffffff);
    p.userData = {};
    p.visible = true;
    p.live = true;
    this.items.push(p);
    return p;
  }

  drop(p) {
    if (!p.live) return;
    p.live = false;
    const i = this.items.indexOf(p);
    if (i >= 0) { this.items[i] = this.items[this.items.length - 1]; this.items.pop(); }
    this.free.push(p);
  }

  clear() {
    for (const p of this.items) { p.live = false; this.free.push(p); }
    this.items = [];
    this.mesh.geometry.instanceCount = 0;
  }

  // Pack the live particles into the instance attributes (far ones first when sorted, for smoke).
  flush(camera) {
    const list = this.items;
    if (this.sort && list.length > 1) {
      const c = camera.position;
      for (const p of list) p.d = p.position.distanceToSquared(c);
      list.sort((x, y) => y.d - x.d);
    }
    const { offset, size, pivot, tint, spin } = this.a;
    let n = 0;
    for (const p of list) {
      if (!p.visible || p.material.opacity <= 0.002) continue;
      offset.array.set([p.position.x, p.position.y, p.position.z], n * 3);
      size.array[n * 2] = p.scale.x; size.array[n * 2 + 1] = p.scale.y;
      pivot.array[n * 2] = p.center.x; pivot.array[n * 2 + 1] = p.center.y;
      const col = p.material.color;
      tint.array[n * 4] = col.r; tint.array[n * 4 + 1] = col.g; tint.array[n * 4 + 2] = col.b; tint.array[n * 4 + 3] = p.material.opacity;
      spin.array[n] = p.material.rotation;
      n++;
    }
    for (const [a, k] of [[offset, 3], [size, 2], [pivot, 2], [tint, 4], [spin, 1]]) {
      a.clearUpdateRanges();
      if (n) { a.addUpdateRange(0, n * k); a.needsUpdate = true; }
    }
    this.mesh.geometry.instanceCount = n;
  }
}
