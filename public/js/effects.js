// Visual effects: tracers, bullet holes, particles, shell casings, grenades, explosions, smoke, Molotov fire, sprays.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { simulateNade } from '/shared/physics.js';
import { WEAPONS, FIRE } from '/shared/weapons.js';
import { flashTexture } from './models.js';

const MAX_PARTICLES = 1000;

// A tongue of flame: bright round base narrowing to a soft tip.
function flameTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.filter = 'blur(5px)';
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 6);
  g.bezierCurveTo(44, 40, 58, 70, 54, 98);
  g.bezierCurveTo(50, 122, 14, 122, 10, 98);
  g.bezierCurveTo(6, 70, 20, 40, 32, 6);
  g.fill();
  return new THREE.CanvasTexture(c);
}
const MAX_DECALS = 160;
const MAX_SPRITES = 260; // smoke puffs and dust at once (each is drawn on its own)
const MAX_FLAMES = 600;

// Flat marks stuck on surfaces (bullet holes, soot), all drawn as one instanced mesh. tag: what the mark is on, so
// remove() can take the marks off something that broke.
const _o = new THREE.Object3D();
class Stamps {
  constructor(group, geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    group.add(this.mesh);
    this.max = max;
    this.list = [];
    this.next = 0;
  }

  add(p, n, size, tag = null) {
    _o.position.set(p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012);
    _o.scale.set(1, 1, 1);
    _o.rotation.set(0, 0, 0);
    _o.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
    _o.rotateZ(Math.random() * Math.PI * 2);
    _o.scale.set(size, size, 1);
    _o.updateMatrix();
    const e = { m: _o.matrix.clone(), tag };
    let i = this.list.length;
    if (i < this.max) this.list.push(e);
    else { i = this.next++ % this.max; this.list[i] = e; }
    this.mesh.setMatrixAt(i, e.m);
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  remove(gone) {
    const keep = this.list.filter(e => !gone(e.tag));
    if (keep.length === this.list.length) return;
    this.list = keep;
    keep.forEach((e, i) => this.mesh.setMatrixAt(i, e.m));
    this.mesh.count = keep.length;
    this.next = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.list = [];
    this.next = 0;
    this.mesh.count = 0;
  }
}
const MAX_TRACERS = 24;
const MAX_CASINGS = 48;
const MAX_GIB_SETS = 12;

// An irregular blood splat: a dark pool with blobs and droplets around it (alpha in the texture).
function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => { g.fillStyle = `rgba(${90 + Math.floor(Math.random() * 40)},0,0,${a})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (let i = 0; i < 9; i++) blob(64 + (Math.random() - 0.5) * 40, 64 + (Math.random() - 0.5) * 40, 10 + Math.random() * 18, 0.85);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = 28 + Math.random() * 30;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + Math.random() * 5, 0.8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene, getWorld) {
    this.scene = scene;
    this.getWorld = getWorld;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.craters = [];
    this.soots = null;
    this.smolders = [];

    // Particles (sparks, blood, debris)
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3).fill(-1000);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pGrav = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, depthWrite: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.pi = 0;
    this.pActive = 0;

    // Bullet holes
    this.decalGeo = new THREE.PlaneGeometry(0.1, 0.1);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x1a140e, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decals = null; // Stamps, made the first time

    // Pooled tracers
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffeaa0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.ti = 0;

    // Shell casings (instanced)
    this.casings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 6), new THREE.MeshLambertMaterial({ color: 0xc8a040 }), MAX_CASINGS);
    this.casings.frustumCulled = false;
    this.casingData = Array.from({ length: MAX_CASINGS }, () => ({ p: new THREE.Vector3(0, -1000, 0), v: new THREE.Vector3(), r: new THREE.Euler(), spin: 0, life: 0, rest: false }));
    this.ci = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < MAX_CASINGS; i++) this.casings.setMatrixAt(i, this._m.makeTranslation(0, -1000, 0));
    scene.add(this.casings);

    this.light = new THREE.PointLight(0xffb060, 0, 14, 2);
    scene.add(this.light);
    this.lightLife = 0;
    this.lightMax = 1;
    this.lightPeak = 0;

    this.softTex = softTexture();
    this.flameTex = flameTexture();
    this.sprites = [];
    this.smokes = [];
    this.nades = [];
    this.rockets = [];
    this.fires = [];
    this.nadeGeo = new THREE.SphereGeometry(0.07, 8, 6);
    this.nadeMats = {
      he: new THREE.MeshLambertMaterial({ color: 0x3f5a2a }),
      flash: new THREE.MeshLambertMaterial({ color: 0xaaaaaa }),
      smoke: new THREE.MeshLambertMaterial({ color: 0x4a4a52 }),
      molotov: new THREE.MeshLambertMaterial({ color: 0x4a6a24 }),
    };
    this.thirdFlashes = [];
    this.sprayMeshes = new Map();
    this.gibs = [];
    this.gibSets = [];
    this.shells = [];
  }

  emit(p, v, color, life, gravity = 9) {
    const i = this.pi++ % MAX_PARTICLES;
    this.pPos.set(p, i * 3);
    this.pVel.set(v, i * 3);
    this.pCol.set(color, i * 3);
    this.pLife[i] = life;
    this.pGrav[i] = gravity;
    this.pActive = Math.min(MAX_PARTICLES, this.pActive + 1);
  }

  puff(p, color, size, life, rise = 0.3, ceil = null) {
    if (this.sprites.length >= MAX_SPRITES) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color, transparent: true, opacity: 0.6, depthWrite: false }));
    s.position.set(p[0], p[1], p[2]);
    s.scale.set(size * 0.3, size * 0.3, 1);
    this.group.add(s);
    this.sprites.push({ s, life, max: life, grow: size, rise, base: 0.6, ceil });
  }

  sparks(p, n) {
    for (let i = 0; i < 6; i++) {
      const v = [n[0] * 2 + (Math.random() - 0.5) * 3, n[1] * 2 + Math.random() * 2, n[2] * 2 + (Math.random() - 0.5) * 3];
      this.emit(p, v, [1, 0.8 + Math.random() * 0.2, 0.4], 0.25 + Math.random() * 0.2);
    }
    for (let i = 0; i < 5; i++) {
      const v = [n[0] + (Math.random() - 0.5), n[1] + Math.random() * 0.8, n[2] + (Math.random() - 0.5)];
      this.emit(p, v, [0.7, 0.62, 0.48], 0.5 + Math.random() * 0.3, 2);
    }
    this.puff([p[0] + n[0] * 0.1, p[1] + n[1] * 0.1, p[2] + n[2] * 0.1], 0xb8a888, 0.6, 0.6, 0.2);
  }

  blood(p) {
    for (let i = 0; i < 12; i++) {
      const v = [(Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3];
      this.emit(p, v, [0.55 + Math.random() * 0.2, 0, 0], 0.4 + Math.random() * 0.3);
    }
    this.puff(p, 0x8a1010, 0.5, 0.35, 0);
  }

  decal(p, n) {
    (this.decals ||= new Stamps(this.group, this.decalGeo, this.decalMat, MAX_DECALS)).add(p, n, 1);
  }

  clearDecals() {
    this.decals?.clear();
  }

  tracer(a, b) {
    const tr = this.tracers[this.ti++ % MAX_TRACERS];
    const pos = tr.line.geometry.attributes.position;
    pos.setXYZ(0, a[0], a[1], a[2]);
    pos.setXYZ(1, b[0], b[1], b[2]);
    pos.needsUpdate = true;
    tr.line.visible = true;
    tr.life = 0.07;
  }

  // Brass flying out to the right of the gun.
  casing(origin, right, up) {
    const c = this.casingData[this.ci++ % MAX_CASINGS];
    c.p.set(...origin);
    c.v.set(right[0] * 2.2 + up[0] * 1.5, right[1] * 2.2 + 1.8 + Math.random(), right[2] * 2.2 + up[2] * 1.5);
    c.r.set(Math.random() * 3, Math.random() * 3, 0);
    c.spin = 15 + Math.random() * 10;
    c.life = 6;
    c.rest = false;
  }

  flashLight(p, intensity, dur, color = 0xffb060) {
    this.light.position.set(p[0], p[1], p[2]);
    this.light.color.setHex(color);
    this.lightPeak = intensity;
    this.lightMax = this.lightLife = dur;
  }

  thirdPersonFlash(object) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.35, 0.35, 1);
    object.add(s);
    this.thirdFlashes.push({ s, parent: object, life: 0.05 });
  }

  explosion(p, big) {
    const scale = big ? 3 : 1;
    this.flashLight([p[0], p[1] + 1, p[2]], big ? 4000 : 800, big ? 0.8 : 0.4, 0xffa040);
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fire.position.set(p[0], p[1] + 0.6 * scale, p[2]);
    this.group.add(fire);
    this.sprites.push({ s: fire, life: 0.45, max: 0.45, grow: 7 * scale, base: 1 });
    for (let i = 0; i < (big ? 14 : 6); i++) {
      this.puff([p[0] + (Math.random() - 0.5) * 2 * scale, p[1] + 0.5 + Math.random() * 1.5 * scale, p[2] + (Math.random() - 0.5) * 2 * scale],
        0x6a645a, 2 * scale + 1.5, 1.5 + Math.random() * 1.5, 0.6);
    }
    for (let i = 0; i < (big ? 120 : 50); i++) {
      const a = Math.random() * Math.PI * 2, sp = (3 + Math.random() * 8) * (big ? 1.5 : 1);
      this.emit([p[0], p[1] + 0.3, p[2]], [Math.cos(a) * sp, 2 + Math.random() * 7, Math.sin(a) * sp], [1, 0.5 + Math.random() * 0.4, 0.1], 0.5 + Math.random() * 0.6);
    }
  }

  // Window pane bursting into shards.
  // A wall chunk or piece of furniture breaking: bits of plaster and brick thrown out, and a cloud of dust.
  rubble(center, min, max) {
    const COLORS = [[0.78, 0.72, 0.6], [0.55, 0.5, 0.42], [0.62, 0.38, 0.28], [0.85, 0.82, 0.74], [0.4, 0.36, 0.3]];
    for (let i = 0; i < 45; i++) {
      const p = [0, 1, 2].map(k => min[k] + Math.random() * (max[k] - min[k]));
      const v = [(Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6];
      this.emit(p, v, COLORS[i % COLORS.length], 0.8 + Math.random() * 1.2, 12);
    }
    for (let i = 0; i < 3; i++) {
      const p = [center[0] + (Math.random() - 0.5), center[1] + (Math.random() - 0.5), center[2] + (Math.random() - 0.5)];
      this.puff(p, 0xb8ae9c, 3 + Math.random() * 2, 2.5 + Math.random(), 0.15);
    }
  }

  // A blast mark where a shell or a rocket hit the ground: soot and, in soft ground (dig: grass, sand), a crater —
  // a dark pit ringed by a rough lip of thrown-up earth, with clods around it. They stay until the next round
  // (with no rounds the oldest go first, past 30).
  crater(p, r, dig) {
    this.blastTextures();
    const g = new THREE.Group();
    const flat = (tex, size, y, offset) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(size, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({
        map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset,
      }));
      m.position.y = y;
      m.rotation.y = Math.random() * Math.PI * 2;
      m.renderOrder = 1;
      g.add(m);
    };
    flat(this.scorchTex, r * 1.7, 0.012, -4);
    if (dig) {
      flat(this.pitTex, r * 0.8, 0.02, -6);
      // the lip: a low, uneven ring of earth
      const pts = [[0.55, 0], [0.68, 0.11], [0.82, 0.17], [0.97, 0.09], [1.2, 0]].map(([x, y]) => new THREE.Vector2(x * r, y * r));
      const lip = new THREE.LatheGeometry(pts, 32);
      const pos = lip.attributes.position, ph = Math.random() * 6, ph2 = Math.random() * 6;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x);
        const k = 1 + 0.05 * Math.sin(a * 6 + ph) + 0.04 * Math.sin(a * 13 + ph2) + 0.03 * Math.sin(a * 23 + ph);
        pos.setXYZ(i, x * k, y * (0.6 + 0.8 * (0.5 + 0.5 * Math.sin(a * 7 + ph2))), z * k);
      }
      lip.computeVertexNormals();
      g.add(new THREE.Mesh(lip, new THREE.MeshLambertMaterial({ map: this.dirtTex, color: 0x6a5440, side: THREE.DoubleSide })));
      const clods = [];
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, d = r * (1.05 + Math.random() * 1.4);
        _o.position.set(Math.cos(a) * d, 0.03, Math.sin(a) * d);
        _o.scale.set(0.05 + Math.random() * 0.1, 0.04 + Math.random() * 0.06, 0.05 + Math.random() * 0.1);
        _o.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        _o.updateMatrix();
        clods.push(this.clodGeo.clone().applyMatrix4(_o.matrix));
      }
      g.add(new THREE.Mesh(mergeGeometries(clods), this.clodMat));
    }
    g.position.set(p[0], p[1], p[2]);
    this.group.add(g);
    this.craters.push(g);
    if (this.craters.length > 30) this.group.remove(this.craters.shift());
  }


  // ---- realism (cs_mansion)
  // Soot: a black blast mark on a wall, ceiling or floor (n: its normal). On a breakable chunk (brk) it goes when
  // the chunk does (dropSoot).
  soot(p, n, size, brk) {
    this.blastTextures();
    this.soots ||= new Stamps(this.group, new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({
      map: this.sootTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }), 300);
    this.soots.add(p, n, size, brk);
  }

  dropSoot(gone) {
    this.soots?.remove(brk => brk != null && gone.has(brk));
  }

  // Rubble: bricks and lumps of plaster thrown out of a broken chunk (away from the blast at `from`, or just
  // dropping when it fell), bouncing and coming to rest on the floor until the next round.
  debris(min, max, from, n) {
    if (!this.bitMesh) {
      this.bitMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 700);
      this.bitMesh.count = 0;
      this.bitMesh.frustumCulled = false;
      this.bitMesh.castShadow = true;
      this.group.add(this.bitMesh);
      this.bits = [];
    }
    const COLORS = [0xcfc4ae, 0x9a8f7c, 0xa05a42, 0xe2dccb, 0x6e655a, 0x7a4a30];
    const c = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
    for (let i = 0; i < n; i++) {
      let slot = this.bits.length;
      if (slot >= 700) slot = this.bitNext = ((this.bitNext ?? -1) + 1) % 700;
      const p = new THREE.Vector3(...[0, 1, 2].map(k => min[k] + Math.random() * (max[k] - min[k])));
      const out = from ? new THREE.Vector3(c[0] - from[0], c[1] - from[1] + 0.5, c[2] - from[2]).normalize() : new THREE.Vector3(0, 0, 0);
      const sp = from ? 2 + Math.random() * 5 : 0.5;
      const bit = {
        p, v: out.multiplyScalar(sp).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)),
        r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3), spin: (Math.random() - 0.5) * 12,
        s: new THREE.Vector3(0.08 + Math.random() * 0.24, 0.05 + Math.random() * 0.12, 0.08 + Math.random() * 0.2), rest: false, age: 0,
      };
      this.bits[slot] = bit;
      this.bitMesh.setColorAt(slot, new THREE.Color(COLORS[(Math.random() * COLORS.length) | 0]));
      this.placeBit(slot);
    }
    this.bitMesh.count = this.bits.length;
    if (this.bitMesh.instanceColor) this.bitMesh.instanceColor.needsUpdate = true;
  }

  placeBit(i) {
    const b = this.bits[i];
    this._q.setFromEuler(b.r);
    this._m.compose(b.p, this._q, b.s);
    this.bitMesh.setMatrixAt(i, this._m);
    this.bitMesh.instanceMatrix.needsUpdate = true;
  }

  updateRubble(dt) {
    const world = this.getWorld();
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      if (b.rest) continue;
      b.age += dt;
      b.v.y -= 15 * dt;
      const step = b.v.length() * dt;
      if (step > 1e-4) {
        const dir = b.v.clone().normalize();
        const hit = world.raycast([b.p.x, b.p.y, b.p.z], [dir.x, dir.y, dir.z], step + 0.03, 'solid');
        if (hit) {
          b.p.addScaledVector(dir, Math.max(0, hit.t - 0.03));
          const n = new THREE.Vector3(...hit.n);
          if (n.y > 0.5 && b.v.y < 0) {
            b.v.y *= -0.25; b.v.x *= 0.5; b.v.z *= 0.5;
            if (Math.abs(b.v.y) < 0.6) { b.rest = true; b.r.x = 0; b.r.z = 0; b.p.y += b.s.y / 2 - 0.03; }
          } else b.v.addScaledVector(n, -1.6 * b.v.dot(n)).multiplyScalar(0.5);
        } else b.p.addScaledVector(b.v, dt);
      }
      b.r.x += b.spin * dt;
      b.r.y += b.spin * 0.6 * dt;
      if (b.age > 6) b.rest = true;
      this.placeBit(i);
    }
  }

  clearRubble() {
    if (!this.bitMesh) return;
    this.bits = [];
    this.bitNext = -1;
    this.bitMesh.count = 0;
  }

  // A cloud of dust and smoke hanging where something blew up (size: the blast's reach).
  dust(p, size) {
    for (let i = 0; i < 9; i++) {
      const q = [p[0] + (Math.random() - 0.5) * size, p[1] + Math.random() * size * 0.5, p[2] + (Math.random() - 0.5) * size];
      this.puff(q, i % 3 ? 0x9a8e7c : 0x6a625a, size * (1.3 + Math.random() * 0.8), 6 + Math.random() * 3, 0.08);
    }
  }

  // Dust shaken down from a ceiling (top: its height) over p.
  ceilingDust(p, top) {
    for (let i = 0; i < 50; i++) {
      this.emit([p[0] + (Math.random() - 0.5) * 4, top - 0.05, p[2] + (Math.random() - 0.5) * 4], [0, -0.2, 0], [0.82, 0.78, 0.7], 1.5 + Math.random(), 2.5);
    }
    for (let i = 0; i < 2; i++) this.puff([p[0] + (Math.random() - 0.5) * 2, top - 0.4, p[2] + (Math.random() - 0.5) * 2], 0xc8c0b0, 2.5, 3, -0.15);
  }

  // Smoke still curling out of a fresh hole for a while.
  smolder(p, secs) {
    this.smolders.push({ p, until: secs, t: 0, next: 0 });
  }

  // The canvases for blast marks, made the first time one is needed.
  blastTextures() {
    if (!this.scorchTex) {
      const tex = draw => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        draw(c.getContext('2d'));
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      this.scorchTex = tex(g => {
        const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
        grad.addColorStop(0, 'rgba(10,8,6,0.95)');
        grad.addColorStop(0.55, 'rgba(25,20,15,0.75)');
        grad.addColorStop(1, 'rgba(30,25,20,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        // streaks thrown out from the middle
        g.strokeStyle = 'rgba(15,12,9,0.5)';
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2, l = 30 + Math.random() * 32;
          g.lineWidth = 1 + Math.random() * 3;
          g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * l, 64 + Math.sin(a) * l); g.stroke();
        }
      });
      // soot: a soft, blotchy smudge
      this.sootTex = tex(g => {
        const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
        grad.addColorStop(0, 'rgba(12,10,8,0.7)');
        grad.addColorStop(0.5, 'rgba(18,15,12,0.45)');
        grad.addColorStop(1, 'rgba(20,18,15,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * 40, r = 4 + Math.random() * 14;
          const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
          const b = g.createRadialGradient(x, y, 0, x, y, r);
          b.addColorStop(0, `rgba(10,8,6,${(0.15 + Math.random() * 0.25).toFixed(2)})`);
          b.addColorStop(1, 'rgba(10,8,6,0)');
          g.fillStyle = b;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      });
      this.pitTex = tex(g => {
        const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
        grad.addColorStop(0, 'rgba(12,9,6,1)');
        grad.addColorStop(0.6, 'rgba(40,30,20,0.95)');
        grad.addColorStop(1, 'rgba(70,52,34,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
      });
      this.dirtTex = tex(g => {
        g.fillStyle = '#6e5538';
        g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = ['#4a3824', '#856846', '#5c4630', '#2e241a', '#9a805c'][i % 5];
          g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3);
        }
      });
      this.dirtTex.wrapS = this.dirtTex.wrapT = THREE.RepeatWrapping;
      this.dirtTex.repeat.set(6, 1);
      this.clodGeo = new THREE.IcosahedronGeometry(1, 0);
      this.clodMat = new THREE.MeshLambertMaterial({ color: 0x4e3c28, flatShading: true });
    }
  }

  clearCraters() {
    for (const c of this.craters) this.group.remove(c);
    this.craters = [];
    this.soots?.clear();
    this.smolders = [];
    this.clearRubble();
  }

  glassShatter(center, size) {
    for (let i = 0; i < 70; i++) {
      const p = [center[0] + (Math.random() - 0.5) * size[0], center[1] + (Math.random() - 0.5) * size[1], center[2] + (Math.random() - 0.5) * size[2]];
      const v = [(Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4];
      const tint = 0.75 + Math.random() * 0.25;
      this.emit(p, v, [0.7 * tint, 0.85 * tint, 0.95 * tint], 0.6 + Math.random() * 0.8, 12);
    }
  }

  // ---- heavy kills: the body bursts into pieces that fly, bounce and bleed, and blood splats around.
  // Everything stays until the next round (clearGibs); with no rounds (Deathmatch, Gun Game) the oldest go first.
  // pieces: from createGibPieces; at: the victim's feet; yaw: its facing; push(p): how a piece at p is thrown.
  gib(pieces, at, yaw, push, blast) {
    const set = { meshes: [], splats: [] };
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (const pc of pieces) {
      const [lx, ly, lz] = pc.at;
      const p = new THREE.Vector3(at[0] + lx * cy + lz * sy, at[1] + ly, at[2] - lx * sy + lz * cy);
      pc.mesh.position.copy(p);
      pc.mesh.rotation.set(0, yaw, 0);
      this.group.add(pc.mesh);
      const v = new THREE.Vector3(...push([p.x, p.y, p.z]));
      const spin = v.length() * 1.6 + 3;
      this.gibs.push({
        mesh: pc.mesh, v, r: pc.r, rest: false, landed: false, bleed: 1.2 + Math.random() * 2, dripAt: 0,
        w: new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin), set,
      });
      set.meshes.push(pc.mesh);
    }
    // a burst of blood and a red mist
    const chest = [at[0], at[1] + 1.1, at[2]];
    for (let i = 0; i < (blast ? 140 : 70); i++) {
      const v = push(chest).map((c, k) => c * (0.3 + Math.random() * 0.6) + (Math.random() - 0.5) * (blast ? 7 : 4) + (k === 1 ? Math.random() * 2 : 0));
      this.emit([chest[0] + (Math.random() - 0.5) * 0.4, chest[1] + (Math.random() - 0.5) * 0.8, chest[2] + (Math.random() - 0.5) * 0.4], v, [0.45 + Math.random() * 0.3, 0, 0], 0.6 + Math.random() * 0.8, 12);
    }
    for (let i = 0; i < (blast ? 5 : 3); i++) this.puff([chest[0] + (Math.random() - 0.5) * 0.6, chest[1] + (Math.random() - 0.5) * 0.6, chest[2] + (Math.random() - 0.5) * 0.6], 0x7a0808, blast ? 2.6 : 1.6, 0.9 + Math.random() * 0.6, 0.05);
    // pools and splashes: under the body, and on what's nearby in the direction everything flew
    const world = this.getWorld();
    const splashAt = (o, d, len, size) => {
      const hit = world.raycast(o, d, len, 'solid');
      if (hit) this.splat([o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t], hit.n, size, set);
    };
    splashAt([at[0], at[1] + 0.5, at[2]], [0, -1, 0], 3, blast ? 2.4 : 1.6);
    for (let i = 0; i < (blast ? 9 : 4); i++) {
      const v = push(chest), l = Math.hypot(...v) || 1;
      const d = [v[0] / l + (Math.random() - 0.5) * 0.9, v[1] / l * 0.3 - Math.random() * 0.5, v[2] / l + (Math.random() - 0.5) * 0.9];
      const dl = Math.hypot(...d);
      splashAt(chest, d.map(c => c / dl), blast ? 4 : 3, 0.6 + Math.random() * 0.8);
    }
    this.gibSets.push(set);
    while (this.gibSets.length > MAX_GIB_SETS) this.dropGibSet(this.gibSets[0]);
  }

  // A blood splat flat on a surface (n: its normal).
  splat(p, n, size, set) {
    if (!this.splatMats) {
      this.splatMats = Array.from({ length: 4 }, () => new THREE.MeshLambertMaterial({
        map: splatTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      }));
      this.splatGeo = new THREE.PlaneGeometry(1, 1);
    }
    const m = new THREE.Mesh(this.splatGeo, this.splatMats[Math.floor(Math.random() * this.splatMats.length)]);
    m.position.set(p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012);
    m.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.scale.set(size, size, 1);
    this.group.add(m);
    set.splats.push(m);
  }

  dropGibSet(set) {
    for (const m of [...set.meshes, ...set.splats]) this.group.remove(m);
    this.gibs = this.gibs.filter(g => g.set !== set);
    this.gibSets = this.gibSets.filter(s => s !== set);
  }

  clearGibs() {
    for (const set of [...this.gibSets]) this.dropGibSet(set);
  }

  updateGibs(dt) {
    const world = this.getWorld();
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      if (g.rest) continue;
      const m = g.mesh, p = m.position;
      g.v.y -= 15 * dt;
      // walls: bounce off
      const hs = Math.hypot(g.v.x, g.v.z);
      if (hs > 0.01) {
        const d = [g.v.x / hs, 0, g.v.z / hs];
        const hit = world.raycast([p.x, p.y, p.z], d, hs * dt + g.r, 'solid');
        if (hit) {
          if (hit.n[0]) g.v.x *= -0.35; else g.v.z *= -0.35;
          if (!g.wallSplat && hs > 3) { g.wallSplat = true; this.splat([p.x + d[0] * hit.t, p.y, p.z + d[2] * hit.t], hit.n, 0.3 + g.r * 1.5, g.set); }
        }
      }
      p.x += g.v.x * dt;
      p.z += g.v.z * dt;
      // floor: land, bounce a little, slide to a stop
      if (g.v.y <= 0) {
        const hit = world.raycast([p.x, p.y + 0.05, p.z], [0, -1, 0], -g.v.y * dt + g.r + 0.05, 'solid');
        if (hit) {
          const floor = p.y + 0.05 - hit.t;
          p.y = floor + g.r * 0.6;
          if (!g.landed) {
            g.landed = true;
            this.splat([p.x, floor, p.z], [0, 1, 0], 0.35 + g.r * 2.2, g.set);
            if (g.r > 0.12) this.onSplat?.([p.x, floor, p.z]);
          }
          g.v.y *= -0.25; g.v.x *= 0.55; g.v.z *= 0.55; g.w.multiplyScalar(0.5);
          if (Math.abs(g.v.y) < 0.6 && Math.hypot(g.v.x, g.v.z) < 0.5) {
            // settle lying flat on the floor
            g.rest = true;
            m.rotation.x = Math.round(m.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
            m.rotation.z = Math.round(m.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
            m.updateMatrixWorld(true);
            p.y += floor - new THREE.Box3().setFromObject(m).min.y + 0.002;
            continue;
          }
        } else p.y += g.v.y * dt;
      } else p.y += g.v.y * dt;
      if (p.y < -60) { g.rest = true; m.visible = false; continue; }
      m.rotation.x += g.w.x * dt;
      m.rotation.y += g.w.y * dt;
      m.rotation.z += g.w.z * dt;
      // a trail of drips while it bleeds
      if (g.bleed > 0) {
        g.bleed -= dt;
        g.dripAt -= dt;
        if (g.dripAt <= 0) {
          g.dripAt = 0.025;
          this.emit([p.x, p.y, p.z], [g.v.x * 0.2 + (Math.random() - 0.5) * 0.6, g.v.y * 0.2, g.v.z * 0.2 + (Math.random() - 0.5) * 0.6], [0.5 + Math.random() * 0.2, 0, 0], 0.5, 12);
        }
      }
    }
  }

  flashPop(p) {
    this.flashLight([p[0], p[1] + 0.3, p[2]], 1500, 0.25, 0xffffff);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(p[0], p[1] + 0.2, p[2]);
    this.group.add(s);
    this.sprites.push({ s, life: 0.25, max: 0.25, grow: 4, base: 1 });
  }

  // A smoke grenade cloud that lingers ~18 s.
  smoke(p) {
    const parts = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color: 0xb8b8b8, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3.2;
      s.userData.target = new THREE.Vector3(p[0] + Math.cos(a) * r, p[1] + 0.6 + Math.random() * 2.6, p[2] + Math.sin(a) * r);
      s.position.set(p[0], p[1] + 0.3, p[2]);
      s.userData.size = 3 + Math.random() * 2;
      s.userData.phase = Math.random() * 10;
      this.group.add(s);
      parts.push(s);
    }
    this.smokes.push({ parts, t: 0, life: 18 });
  }

  // An RPG rocket flying straight from o along d for dist metres, trailing smoke and a flame.
  rocket(o, d, dist, speed) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4a5236 }));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a4028 }));
    head.position.z = -0.38;
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffb050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flame.scale.set(0.6, 0.6, 1);
    flame.position.z = 0.32;
    mesh.add(body, head, flame);
    mesh.position.set(...o);
    mesh.lookAt(o[0] + d[0], o[1] + d[1], o[2] + d[2]);
    mesh.rotateY(Math.PI);
    this.group.add(mesh);
    this.rockets.push({ mesh, o, d, dist, speed, t: 0, puffAt: 0 });
  }

  // A mortar shell: a high arc from the tube (o) to where it lands (at) in flight ms, nose along its path.
  shell(o, at, flight) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1, 2.6), new THREE.MeshLambertMaterial({ color: 0x3e4630 }));
    const fins = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a2e22 }));
    fins.position.z = 0.17;
    mesh.add(body, fins);
    mesh.position.set(...o);
    this.group.add(mesh);
    const dist = Math.hypot(at[0] - o[0], at[2] - o[2]);
    this.shells.push({ mesh, o, at, flight: flight / 1000, h: 25 + dist * 0.3, t: 0 });
    this.puff([o[0], o[1] + 1, o[2]], 0xc8c4bc, 2.2, 1.6, 0.4);
    this.flashLight([o[0], o[1] + 1.2, o[2]], 80, 0.1);
  }

  nade(kind, o, v, fuse, onBounce) {
    const path = [];
    const impact = !!WEAPONS[kind]?.impact;
    simulateNade(this.getWorld().nade(), o, v, fuse, path, impact);
    if (impact) fuse = path.length / 60;
    const m = new THREE.Mesh(this.nadeGeo, this.nadeMats[kind] || this.nadeMats.he);
    m.castShadow = true;
    m.position.set(...o);
    this.group.add(m);
    this.nades.push({ mesh: m, path, t: 0, fuse, lastVy: v[1], onBounce, lit: kind === 'molotov' });
  }

  // A Molotov fire: flames over a patch of floor that walls cut off, burning for `life` seconds.
  fire(id, p, life, r = FIRE.radius, ceil = null) {
    this.fireOut(id, true);
    const world = this.getWorld();
    const flames = [];
    // as many flames as the fire is big, and fewer when lots are burning already
    const burning = this.fires.reduce((s, f) => s + f.flames.length, 0);
    const n = Math.round(Math.min(burning > MAX_FLAMES ? 8 : 34, Math.max(10, r * 10)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      let d = r * Math.sqrt(Math.random()) * 0.95;
      // Flames stop at walls.
      const o = [p[0], p[1] + 0.35, p[2]], dir = [Math.cos(a), 0, Math.sin(a)];
      const hit = world.raycast(o, dir, d + 0.3);
      if (hit) d = Math.max(0, hit.t - 0.35);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.flameTex, color: i % 3 ? 0xff6a14 : 0xffb030, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      s.center.set(0.5, 0.04);
      s.position.set(p[0] + dir[0] * d, p[1] + 0.02, p[2] + dir[2] * d);
      s.userData = { w: 0.45 + Math.random() * 0.35, h: 0.8 + Math.random() * 0.9, ph: Math.random() * 10, sp: 7 + Math.random() * 6 };
      this.group.add(s);
      flames.push(s);
    }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({
      map: this.softTex, color: 0xff6a10, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(p[0], p[1] + 0.03, p[2]);
    this.group.add(glow);
    this.fires.push({ id, p: p.slice(), r, t: 0, life, flames, glow, nextEmber: 0, nextSmoke: 0, ceil: ceil != null ? ceil - 0.5 : null });
  }

  fireOut(id, now = false) {
    const f = this.fires.find(x => x.id === id);
    if (!f) return;
    if (now) f.life = f.t;
    else f.life = Math.min(f.life, f.t + 0.6);
  }

  clearFires() {
    for (const f of this.fires) this.removeFire(f);
    this.fires = [];
  }

  removeFire(f) {
    for (const s of f.flames) { this.group.remove(s); s.material.dispose(); }
    this.group.remove(f.glow);
    f.glow.geometry.dispose();
    f.glow.material.dispose();
  }

  // The fire someone standing at pos (feet) is caught in, if any. Same rule as the server.
  fireAt(pos) {
    for (const f of this.fires) {
      if (f.t >= f.life - 0.3) continue;
      if (Math.hypot(pos[0] - f.p[0], pos[2] - f.p[2]) > f.r) continue;
      if (pos[1] < f.p[1] - 1 || pos[1] > f.p[1] + 1.4) continue;
      const o = [f.p[0], f.p[1] + 0.35, f.p[2]], d = [pos[0] - f.p[0], 0, pos[2] - f.p[2]];
      const len = Math.hypot(d[0], d[2]);
      if (len > 0.2) {
        const hit = this.getWorld().raycast(o, [d[0] / len, 0, d[2] / len], len);
        if (hit && hit.t < len - 0.2) continue;
      }
      return f;
    }
    return null;
  }

  // Flames licking up a burning player's body.
  burn(p) {
    const a = Math.random() * Math.PI * 2;
    this.emit([p[0] + Math.cos(a) * 0.25, p[1] + 0.2 + Math.random() * 1.3, p[2] + Math.sin(a) * 0.25],
      [(Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4], [1, 0.45 + Math.random() * 0.35, 0.08], 0.35 + Math.random() * 0.25, -1);
  }

  // Player graffiti: one per player, replaced when they spray again.
  spray(id, texture, p, n, yaw) {
    const old = this.sprayMeshes.get(id);
    if (old) { this.group.remove(old); old.material.dispose(); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshLambertMaterial({
      map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, alphaTest: 0.02,
    }));
    m.position.set(p[0] + n[0] * 0.02, p[1] + n[1] * 0.02, p[2] + n[2] * 0.02);
    if (Math.abs(n[1]) > 0.7) m.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    m.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
    m.receiveShadow = true;
    this.group.add(m);
    this.sprayMeshes.set(id, m);
  }

  removeSpray(id) {
    const m = this.sprayMeshes.get(id);
    if (m) { this.group.remove(m); m.material.dispose(); this.sprayMeshes.delete(id); }
  }

  // Remove everything that belongs to a map (on map change).
  reset() {
    this.clearDecals();
    this.clearCraters();
    this.clearGibs();
    for (const id of [...this.sprayMeshes.keys()]) this.removeSpray(id);
    for (const s of this.smokes) for (const p of s.parts) this.group.remove(p);
    this.smokes = [];
    for (const n of this.nades) this.group.remove(n.mesh);
    this.nades = [];
    for (const r of this.rockets) this.group.remove(r.mesh);
    this.rockets = [];
    for (const s of this.shells) this.group.remove(s.mesh);
    this.shells = [];
    this.clearFires();
    for (const c of this.casingData) { c.life = 0; c.p.y = -1000; }
  }

  update(dt, camera) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.flight);
      const at = k2 => [s.o[0] + (s.at[0] - s.o[0]) * k2, s.o[1] + (s.at[1] - s.o[1]) * k2 + 4 * s.h * k2 * (1 - k2), s.o[2] + (s.at[2] - s.o[2]) * k2];
      const p = at(k), ahead = at(Math.min(1, k + 0.01));
      s.mesh.position.set(...p);
      s.mesh.lookAt(2 * p[0] - ahead[0], 2 * p[1] - ahead[1], 2 * p[2] - ahead[2]);
      if (k >= 1) { this.group.remove(s.mesh); this.shells.splice(i, 1); }
    }
    if (this.gibs.length) this.updateGibs(dt);
    if (this.bits?.length) this.updateRubble(dt);
    for (let i = this.smolders.length - 1; i >= 0; i--) {
      const s = this.smolders[i];
      s.t += dt;
      if (s.t >= s.next) { s.next = s.t + 0.5; this.puff([s.p[0] + (Math.random() - 0.5) * 0.4, s.p[1], s.p[2] + (Math.random() - 0.5) * 0.4], 0x4a4540, 1.6, 3, 0.6); }
      if (s.t >= s.until) this.smolders.splice(i, 1);
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      const s = Math.min(r.dist, r.t * r.speed);
      const p = [r.o[0] + r.d[0] * s, r.o[1] + r.d[1] * s, r.o[2] + r.d[2] * s];
      r.mesh.position.set(...p);
      if (r.t >= r.puffAt) { r.puffAt = r.t + 0.025; this.puff([p[0] - r.d[0] * 0.4, p[1] - r.d[1] * 0.4, p[2] - r.d[2] * 0.4], 0xc8c4bc, 0.9, 1.4, 0.15); }
      if (s >= r.dist) { this.group.remove(r.mesh); this.rockets.splice(i, 1); }
    }
    if (this.pActive > 0) {
      let alive = 0;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (this.pLife[i] <= 0) continue;
        this.pLife[i] -= dt;
        const k = i * 3;
        if (this.pLife[i] <= 0) { this.pPos[k + 1] = -1000; continue; }
        alive++;
        this.pVel[k + 1] -= this.pGrav[i] * dt;
        this.pPos[k] += this.pVel[k] * dt;
        this.pPos[k + 1] += this.pVel[k + 1] * dt;
        this.pPos[k + 2] += this.pVel[k + 2] * dt;
      }
      this.pActive = alive;
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }

    for (const tr of this.tracers) {
      if (tr.life <= 0) continue;
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.7;
      if (tr.life <= 0) tr.line.visible = false;
    }

    // Casings
    const world = this.getWorld();
    let dirty = false;
    this.casingData.forEach((c, i) => {
      if (c.life <= 0) return;
      c.life -= dt;
      dirty = true;
      if (!c.rest) {
        c.v.y -= 15 * dt;
        const next = c.p.clone().addScaledVector(c.v, dt);
        if (c.v.y < 0) {
          const hit = world.raycast([c.p.x, c.p.y, c.p.z], [0, -1, 0], -c.v.y * dt + 0.02, 'solid');
          if (hit) {
            next.y = c.p.y - hit.t + 0.008;
            c.v.y *= -0.35; c.v.x *= 0.5; c.v.z *= 0.5;
            if (Math.abs(c.v.y) < 0.4) { c.rest = true; c.r.x = Math.PI / 2; }
          }
        }
        c.p.copy(next);
        c.r.x += c.spin * dt;
        c.r.y += c.spin * 0.5 * dt;
      }
      const y = c.life <= 0 ? -1000 : c.p.y;
      this._q.setFromEuler(c.r);
      this._m.compose(new THREE.Vector3(c.p.x, y, c.p.z), this._q, this._s);
      this.casings.setMatrixAt(i, this._m);
    });
    if (dirty) this.casings.instanceMatrix.needsUpdate = true;

    if (this.lightLife > 0) {
      this.lightLife -= dt;
      this.light.intensity = this.lightPeak * Math.max(0, this.lightLife / this.lightMax);
    } else {
      this.light.intensity = 0;
    }

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sp = this.sprites[i];
      sp.life -= dt;
      const f = 1 - sp.life / sp.max;
      const size = 0.3 + sp.grow * Math.sqrt(f);
      sp.s.scale.set(size, size, 1);
      if (sp.rise) sp.s.position.y += sp.rise * dt;
      if (sp.ceil != null && sp.s.position.y > sp.ceil) sp.s.position.y = sp.ceil; // smoke gathers under the ceiling
      sp.s.material.opacity = Math.max(0, 1 - f) * (sp.base ?? 0.8);
      if (sp.life <= 0) {
        this.group.remove(sp.s);
        sp.s.material.dispose();
        this.sprites.splice(i, 1);
      }
    }

    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.t += dt;
      const fadeIn = Math.min(1, sm.t / 1.5), fadeOut = Math.min(1, (sm.life - sm.t) / 3);
      for (const s of sm.parts) {
        s.position.lerp(s.userData.target, Math.min(1, dt * 1.2));
        const size = s.userData.size * (0.4 + 0.6 * fadeIn);
        s.scale.set(size, size, 1);
        s.material.opacity = 0.92 * Math.max(0, Math.min(fadeIn, fadeOut));
        s.material.rotation = Math.sin(sm.t * 0.2 + s.userData.phase) * 0.5;
      }
      if (sm.t >= sm.life) {
        for (const s of sm.parts) { this.group.remove(s); s.material.dispose(); }
        this.smokes.splice(i, 1);
      }
    }

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      const k = Math.max(0, Math.min(1, f.t / 0.35, (f.life - f.t) / 0.8));
      for (const s of f.flames) {
        const u = s.userData;
        const flick = 0.75 + 0.25 * Math.sin(f.t * u.sp + u.ph) + 0.1 * Math.sin(f.t * u.sp * 2.3 + u.ph * 3);
        s.scale.set(u.w * (0.6 + 0.4 * k), u.h * flick * k, 1);
        s.material.opacity = 0.8 * k;
        s.material.rotation = 0.12 * Math.sin(f.t * u.sp * 0.7 + u.ph);
      }
      f.glow.material.opacity = 0.55 * k * (0.85 + 0.15 * Math.sin(f.t * 9));
      if (f.t >= f.nextEmber) {
        f.nextEmber = f.t + 0.03;
        const a = Math.random() * Math.PI * 2;
        const fl = f.flames[Math.floor(Math.random() * f.flames.length)].position;
        this.emit([fl.x + Math.cos(a) * 0.2, fl.y + 0.3, fl.z + Math.sin(a) * 0.2], [(Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6],
          [1, 0.5 + Math.random() * 0.4, 0.1], 0.5 + Math.random() * 0.5, -0.5);
      }
      if (f.t >= f.nextSmoke && k > 0.3) {
        f.nextSmoke = f.t + 0.22;
        const fl = f.flames[Math.floor(Math.random() * f.flames.length)].position;
        if (f.ceil != null) this.puff([fl.x, Math.min(fl.y + 1.4, f.ceil), fl.z], 0x1e1a17, 3, 9, 0.9, f.ceil); // indoors: thick, it fills the room
        else this.puff([fl.x, fl.y + 1.4, fl.z], 0x2a2622, 2.2, 2.2, 1.1);
      }
      if (f.t >= f.life) {
        this.removeFire(f);
        this.fires.splice(i, 1);
      }
    }

    for (let i = this.thirdFlashes.length - 1; i >= 0; i--) {
      const f = this.thirdFlashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        f.parent.remove(f.s);
        f.s.material.dispose();
        this.thirdFlashes.splice(i, 1);
      }
    }

    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.t += dt;
      const idx = Math.min(n.path.length - 1, Math.floor(n.t * 60));
      const p = n.path[idx];
      const prev = n.path[Math.max(0, idx - 1)];
      const vy = p[1] - prev[1];
      if (n.lastVy < -0.01 && vy >= 0) n.onBounce?.(p);
      n.lastVy = vy;
      n.mesh.position.set(p[0], p[1], p[2]);
      n.mesh.rotation.x += dt * 8;
      if (n.lit) this.emit(p, [(Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3], [1, 0.55, 0.1], 0.25, -1);
      if (n.t >= n.fuse) {
        this.group.remove(n.mesh);
        this.nades.splice(i, 1);
      }
    }
  }
}

export const nadeFuse = k => WEAPONS[k]?.fuse ?? 1.6;
