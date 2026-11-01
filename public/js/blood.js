// Blood trails, the browser's side. Drops of blood fall behind every player the server says is bleeding (the
// snapshot's `bl`), placed from where this browser sees them, so no drop crosses the network. All the drops are one
// instanced mesh (one draw call), at most BLOOD.max of them (the oldest go first). They lie on floors, stairs and
// slopes (on the converted levels, on the slope as drawn, not on the collision boxes' steps), darken as they dry and
// fade out after BLOOD.life seconds — the graphics card does that from each drop's birth time, so nothing is
// updated per frame. Cleared every round and on a new map.
// The local player's side: the BLEEDING badge, and bandaging with P (BLOOD.bandage seconds: no shooting, slow walking).
import * as THREE from 'three';
import { BLOOD, BL_BANDAGING, BL_NODROPS } from '/shared/blood.js';
import { inWater } from '/shared/physics.js';

const MAX = BLOOD.max;
const LOWER = 600; // main.js lowers the gun by (me.drawUntil - now) / 600: at most this far ahead, or it swings round
const CELL = 2; // the floor index's grid (m)
const UP = [0, 1, 0];
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const key = (cx, cz) => cx * 65536 + cz;
const clock = () => performance.now() / 1000;

// A drop: a few overlapping blobs and tiny splashes around them (alpha in the texture), turned at random.
function dropTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => { g.fillStyle = `rgba(${120 + Math.floor(Math.random() * 40)},${Math.floor(Math.random() * 8)},0,${a})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (let i = 0; i < 6; i++) blob(32 + (Math.random() - 0.5) * 10, 32 + (Math.random() - 0.5) * 10, 10 + Math.random() * 6, 0.92);
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 9;
    blob(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.2 + Math.random() * 2.3, 0.88);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The level's upward faces as drawn (map.faces: the converted levels — Mansion, Dust II, Inferno, Assault) in a 2 m
// grid. Their collision is boxes, and a slope is a stair of 0.1 m steps there, so a drop put on the box under the
// player would sink into the slope or float over it; the face gives the real height and tilt. Maps made only of
// boxes (de_dusty, aim_map) need none: there the boxes are what you see.
function floorIndex(map) {
  if (!map.faces) return null;
  const polys = [], cells = new Map();
  for (const [tex, list] of Object.entries(map.faces)) {
    if (map.faceMats && !map.faceMats[tex]) continue; // not drawn
    for (const f of list) {
      const n = f.length / 5;
      if (n < 3) continue;
      let nx = 0, ny = 0, nz = 0; // Newell's normal (the faces wind so that it points out of the solid)
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = i * 5, b = j * 5;
        nx += (f[a + 1] - f[b + 1]) * (f[a + 2] + f[b + 2]);
        ny += (f[a + 2] - f[b + 2]) * (f[a] + f[b]);
        nz += (f[a] - f[b]) * (f[a + 1] + f[b + 1]);
      }
      const l = Math.hypot(nx, ny, nz);
      if (!l || ny / l < 0.55) continue; // walls, ceilings and anything too steep to stand on
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

// The highest drawn floor at (x, z) between lo and hi: { y, n } or null.
function faceFloor(ix, x, z, lo, hi) {
  const list = ix.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return null;
  let best = null;
  for (const k of list) {
    const p = ix.polys[k];
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    const y = (p.d - p.n[0] * x - p.n[2] * z) / p.n[1];
    if (y < lo || y > hi || (best && y <= best.y)) continue;
    // inside the (convex) polygon, seen from above
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

export class BloodTrails {
  // ctx: { me, remotes, net, hud, audio, coll: () => CollisionWorld, map: () => map }
  constructor(scene, ctx) {
    this.ctx = ctx;
    this.uNow = { value: clock() };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(MAX).fill(-1e5), 1);
    geo.setAttribute('aBorn', this.born);
    const mat = new THREE.MeshLambertMaterial({
      map: dropTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    });
    // the room lighting every Lambert material has (roomlight.js), then the drying and fading by age
    mat.onBeforeCompile = (shader, renderer) => {
      THREE.MeshLambertMaterial.prototype.onBeforeCompile.call(mat, shader, renderer);
      shader.uniforms.uBloodNow = this.uNow;
      shader.vertexShader = 'attribute float aBorn;\nvarying float vBorn;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBorn = aBorn;');
      shader.fragmentShader = 'uniform float uBloodNow;\nvarying float vBorn;\n' + shader.fragmentShader
        .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
	float bAge = uBloodNow - vBorn;
	diffuseColor.a *= clamp( ( ${BLOOD.life.toFixed(1)} - bAge ) / ${BLOOD.fade.toFixed(1)}, 0.0, 1.0 );
	diffuseColor.rgb *= mix( 1.0, 0.5, clamp( bAge / 15.0, 0.0, 1.0 ) );
	if ( diffuseColor.a < 0.01 ) discard;`);
    };
    mat.customProgramCacheKey = () => 'room-light-blood';
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.count = 0;
    this.next = 0;
    this.lastBorn = -1e5;
    this.coll = null;
    this.map = null;
    this.index = null;
    this.bleeders = new Map(); // id -> { lv, fl, last, idle, k, fresh, n }
    this.snapN = 0;
    this.mine = 0; // the local player's bleeding level
    this.left = BLOOD.bandages;
    this.bandaging = null; // { start, until } (performance.now() ms)
    this.warmed = false;
    this.handlers = {
      bloodBandage: m => this.onBandage(m),
      bloodKit: m => { this.left = m.left; this.bandaging = null; this.hudKey = null; },
    };
    Object.assign(ctx.net.handlers, this.handlers);
    this.makeHud();
  }

  // ---- the drops

  // A new map (its collision world is new): drop everything, index its floors.
  sync() {
    const coll = this.ctx.coll();
    if (coll === this.coll) return;
    this.coll = coll;
    this.clear();
    const map = this.ctx.map();
    if (map !== this.map) { this.map = map; this.index = floorIndex(map); }
  }

  clear() {
    this.count = 0;
    this.next = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
    for (const b of this.bleeders.values()) b.last = null;
  }

  // The floor under (x, y, z) (y: the feet): { y, n } or null (nothing within reach, or water). The drawn face near
  // the collision's top wins: up to 0.3 m over it (a slope drawn above its steps, a roof) or 0.2 m under it (a slope
  // drawn below its steps; on the Mansion, the living room's collision over the cellar, 0.1 m above the drawn floor).
  // A face lower than that is under something the faces don't draw (the gazebo's floor, a decor model 0.25 m up):
  // then the collision's top is the floor.
  floor(x, y, z) {
    const h = this.coll.raycast([x, y + 0.5, z], [0, -1, 0], 2.3, 'solid');
    let fy = h && h.n[1] > 0 ? y + 0.5 - h.t : null, n = UP;
    if (this.index) {
      const f = faceFloor(this.index, x, z, fy != null ? fy - 0.2 : y - 1.8, fy != null ? fy + 0.3 : y + 0.5);
      if (f) { fy = f.y; n = f.n; }
    }
    if (fy == null || inWater(this.map.water, [x, fy + 0.05, z])) return null;
    return { y: fy, n };
  }

  put(x, y, z, n, size) {
    const i = this.next;
    this.next = (i + 1) % MAX;
    this.count = Math.min(MAX, this.count + 1);
    _o.position.set(x + n[0] * 0.01, y + n[1] * 0.01, z + n[2] * 0.01);
    _o.rotation.set(0, 0, 0);
    _o.scale.set(1, 1, 1);
    _o.lookAt(x + n[0], y + n[1], z + n[2]);
    _o.rotateZ(Math.random() * Math.PI * 2);
    _o.scale.set(size, size, 1);
    _o.updateMatrix();
    const m = this.mesh;
    m.setMatrixAt(i, _o.matrix);
    m.setColorAt(i, _c.setScalar(0.8 + Math.random() * 0.35));
    this.born.array[i] = this.lastBorn = clock();
    // (upload only this drop)
    m.instanceMatrix.addUpdateRange(i * 16, 16);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.addUpdateRange(i * 3, 3);
    m.instanceColor.needsUpdate = true;
    this.born.addUpdateRange(i, 1);
    this.born.needsUpdate = true;
    m.count = this.count;
    m.visible = true;
  }

  // One drop near p (a bleeding player's feet).
  drip(p, lv) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.14;
    const size = BLOOD.size[lv] * (0.7 + Math.random() * 0.6);
    let x = p[0] + Math.cos(a) * r, z = p[2] + Math.sin(a) * r;
    let f = this.floor(x, p[1], z);
    if (!f) { x = p[0]; z = p[2]; f = this.floor(x, p[1], z); }
    if (f) this.put(x, f.y, z, f.n, size);
  }

  // Who is bleeding, from the snapshot's `bl` ([id, level, flags], or nothing).
  onSnapshot(bl) {
    const n = ++this.snapN;
    if (bl) {
      for (const [id, lv, fl] of bl) {
        let b = this.bleeders.get(id);
        if (!b) this.bleeders.set(id, b = { last: null, idle: 0, k: 1, fresh: true });
        b.lv = Math.max(1, Math.min(3, lv | 0));
        b.fl = fl | 0;
        b.n = n;
      }
    }
    for (const [id, b] of this.bleeders) if (b.n !== n) this.bleeders.delete(id);
    const was = this.mine, mine = this.bleeders.get(this.ctx.me.id);
    this.mine = mine ? mine.lv : 0;
    if (this.mine && !was && this.ctx.me.alive && !(mine.fl & BL_BANDAGING)) {
      this.ctx.hud.small(this.left > 0 ? 'You are bleeding — press P to bandage' : 'You are bleeding (no bandages left)', 3);
    }
  }

  // Every frame. replay: the kill cam is on (others are drawn in the past: no drops).
  update(dt, now, replay) {
    this.sync();
    this.uNow.value = now / 1000;
    if (this.warmed) { this.warmed = false; this.clear(); }
    const { me, remotes } = this.ctx;
    for (const [id, b] of this.bleeders) {
      let p = null;
      if (id === me.id) p = me.alive && me.driving == null && !me.riding ? me.p : null;
      else { const r = remotes.get(id); if (r && r.buf.length) p = r.p; }
      if (!p || replay || (b.fl & BL_NODROPS)) { b.last = null; continue; }
      if (!b.last) {
        b.last = [p[0], p[1], p[2]];
        b.idle = 0;
        // the wound: a few drops at once
        if (b.fresh) { b.fresh = false; for (let i = 0; i <= b.lv; i++) this.drip(p, b.lv); }
        continue;
      }
      const d = Math.hypot(p[0] - b.last[0], p[2] - b.last[2]);
      if (d > 5) { b.last = [p[0], p[1], p[2]]; continue; } // a respawn or a teleport: no line of drops
      if (d >= BLOOD.spacing[b.lv] * b.k || (b.idle += dt) >= BLOOD.idle[b.lv] * b.k) {
        this.drip(p, b.lv);
        b.last = [p[0], p[1], p[2]];
        b.idle = 0;
        b.k = 0.75 + Math.random() * 0.5; // not like a ruler
      }
    }
    // all faded: stop drawing them
    if (this.count && now / 1000 - this.lastBorn > BLOOD.life) this.clear();
    if (this.bandaging && (!me.alive || now > this.bandaging.until + 1500)) this.bandaging = null;
    if (this.bandaging) {
      me.nextShot = Math.max(me.nextShot, this.bandaging.until);
      // the gun stays down, and comes back up over the last 0.6 s
      me.drawUntil = Math.max(me.drawUntil, Math.min(this.bandaging.until, now + LOWER));
    }
    this.updateHud(now);
  }

  // Map load (prewarm): one drop where the warm-up camera sees it, so its shader is compiled now; gone next frame.
  warm(p) {
    this.sync();
    this.put(p[0], p[1], p[2], UP, 0.3);
    this.warmed = true;
  }

  // ---- bandaging (the local player)

  bandage() {
    const { me, net } = this.ctx;
    if (!me.alive || this.bandaging) return;
    net.send({ t: 'bloodBandage' });
  }

  onBandage(m) {
    const { me, hud, audio } = this.ctx;
    const now = performance.now();
    if (m.s === 'start') {
      this.left = m.left;
      this.bandaging = { start: now, until: now + m.dur };
      // no shooting, and the gun goes down (it comes back up over the last 0.6 s)
      me.nextShot = Math.max(me.nextShot, this.bandaging.until);
      me.drawUntil = Math.max(me.drawUntil, Math.min(this.bandaging.until, now + LOWER));
      me.scope = 0;
      me.nadeHold = null;
      audio.play('pickup');
    } else if (m.s === 'done') {
      this.bandaging = null;
      if (m.left != null) this.left = m.left;
      hud.small('Bandaged — the bleeding has stopped', 2);
    }
    this.hudKey = null;
  }

  // Walking speed while bandaging.
  speedMul() {
    return this.bandaging && performance.now() < this.bandaging.until ? BLOOD.slow : 1;
  }

  // ---- HUD: a badge next to HP and AP, and the bandage's progress bar

  makeHud() {
    this.badge = document.createElement('div');
    this.badge.className = 'badge hidden';
    this.badge.id = 'bleed-badge';
    document.getElementById('bottom-left')?.appendChild(this.badge);
    this.bar = document.createElement('div');
    this.bar.className = 'hidden';
    this.bar.style.cssText = 'position:absolute;top:72%;left:50%;transform:translateX(-50%);width:240px;text-align:center;font-family:Consolas,monospace;color:var(--hud)';
    this.bar.innerHTML = '<div>Bandaging...</div><div style="height:8px;margin-top:4px;background:rgba(0,0,0,0.5);border:1px solid var(--hud-dim)"><div style="height:100%;width:0;background:#c8281e"></div></div>';
    this.fill = this.bar.lastChild.firstChild;
    document.getElementById('hud')?.appendChild(this.bar);
    this.hudKey = null;
    // the key in the Esc menu's controls list
    const keys = document.querySelector?.('.controls');
    if (keys) { const d = document.createElement('div'); d.innerHTML = '<kbd>P</kbd> bandage (when bleeding)'; keys.appendChild(d); }
  }

  updateHud(now) {
    const me = this.ctx.me;
    const lv = me.alive ? this.mine : 0;
    const k = this.bandaging ? 'b' : lv ? `${lv}:${this.left}` : '';
    if (k !== this.hudKey) {
      this.hudKey = k;
      this.badge.classList.toggle('hidden', !lv || !!this.bandaging);
      if (lv) this.badge.textContent = `${lv === 3 ? 'BLEEDING HEAVILY' : 'BLEEDING'} · ${this.left > 0 ? `P bandage (${this.left})` : 'no bandages'}`;
      this.bar.classList.toggle('hidden', !this.bandaging);
    }
    if (this.bandaging) {
      const f = Math.min(1, (now - this.bandaging.start) / (this.bandaging.until - this.bandaging.start));
      this.fill.style.width = `${Math.round(f * 100)}%`;
    }
  }
}
