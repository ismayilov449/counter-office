// Blood & horror (ROADMAP group 12), the browser's side; main.js calls in at the hooks marked "gore:". All of it is
// cheap to draw on the Intel laptops: one instanced mesh for the pools, one for the wall splatter, two CSS overlays,
// sounds. 12.6 (executions) is the server's: lib/wounds.js, with its hints in public/js/wounds.js.
// 12.1 a pool of blood grows under every dead body (and goes with it when it's dragged).
// 12.2 a head shot, or a shotgun up close, sprays blood on the wall behind.
// 12.3 a kill right next to us splashes blood on our screen, which runs down and fades.
// 12.4 the dying groan (a head shot dies silent); downed players moan now and then.
// 12.5 alone, hurt and in the dark, we hear our own heart, and the edges of the view pulse dark.
import * as THREE from 'three';
import { WEAPONS } from '/shared/weapons.js';
import { Stamps, splatTexture } from './effects.js';
import { eyesUsedTo } from './eyes.js';

export const GORE = {
  pool: { grow: 10, size: 1.6, max: 16 }, // s to full size, m across, bodies at once
  wall: { reach: 2.5, size: 0.8, shotgun: 6, max: 48 }, // m behind the victim, m across, a shotgun within this, marks
  screen: { near: 2, secs: 4 }, // m from us, s it takes to run down and fade
  dying: 25, // m: the groan is heard within
  moan: [7, 14], // s between a downed man's moans
  beat: { hp: 30, mates: 15, dark: 0.45 }, // HP or less, no teammate within m, eyes used to darker than this
};

let C = null; // from main.js: { scene, me, remotes, audio, coll(), floor(x, y, z) (blood.js), lying(r) (body.js) }
let pools = null, splats = null, screenEl = null, beatEl = null;
const live = new Map(); // dead body id -> { born, at: [x, y, z], f: its floor }
const _o = new THREE.Object3D();

export function initGore(ctx) {
  C = ctx;
  const mat = () => new THREE.MeshLambertMaterial({ map: splatTexture(), color: 0x8a8a8a, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 });
  pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat(), GORE.pool.max);
  pools.count = 0;
  pools.frustumCulled = false;
  pools.renderOrder = 1;
  C.scene.add(pools);
  splats = new Stamps(C.scene, new THREE.PlaneGeometry(1, 1), mat(), GORE.wall.max);
  screenEl = overlay('gore-screen', `background: url(${dropsImage()}) center / cover no-repeat;`);
  beatEl = overlay('gore-beat', 'background: radial-gradient(ellipse at center, transparent 45%, rgba(60, 0, 0, 0.55) 80%, rgba(20, 0, 0, 0.9) 100%); transition: opacity 0.35s;');
}

function overlay(id, css) {
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText = `position: fixed; inset: 0; pointer-events: none; z-index: 5; opacity: 0; will-change: opacity, transform; ${css}`;
  document.body.appendChild(el);
  return el;
}

// Drops and smears over the top and the edges (drawn once, a canvas as a picture).
function dropsImage() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => { g.fillStyle = `rgba(${110 + Math.floor(Math.random() * 50)},0,0,${a})`; g.beginPath(); g.ellipse(x, y, r, r * (1 + Math.random()), 0, 0, Math.PI * 2); g.fill(); };
  for (let i = 0; i < 70; i++) {
    const edge = Math.random() < 0.5, x = edge ? (Math.random() < 0.5 ? Math.random() * 120 : 640 - Math.random() * 120) : Math.random() * 640;
    const y = edge ? Math.random() * 360 : Math.random() * 140;
    blob(x, y, 2 + Math.random() * 14, 0.55 + Math.random() * 0.35);
    if (Math.random() < 0.35) g.fillRect(x - 1.5, y, 3, 10 + Math.random() * 50); // a run
  }
  return c.toDataURL();
}

// ---- 12.1 pools under the dead

// Every frame.
function updatePools(now) {
  const seen = new Set();
  for (const r of C.remotes.values()) {
    if (r.alive || !r.buf.length || r.model.userData.gibAll || !r.model.visible) continue;
    let e = live.get(r.id);
    if (!e) live.set(r.id, e = { born: now, at: null, f: null });
    if (!e.at || Math.hypot(r.p[0] - e.at[0], r.p[1] - e.at[1], r.p[2] - e.at[2]) > 0.05) { e.at = r.p.slice(); e.f = C.floor(r.p[0], r.p[1], r.p[2]); }
    if (e.f) seen.add(r.id);
  }
  for (const id of live.keys()) if (!C.remotes.get(id) || C.remotes.get(id).alive) live.delete(id);
  let i = 0;
  for (const id of seen) {
    if (i >= GORE.pool.max) break;
    const e = live.get(id), n = e.f.n, k = Math.min(1, (now - e.born) / 1000 / GORE.pool.grow);
    const s = GORE.pool.size * (0.15 + 0.85 * Math.sqrt(k));
    _o.position.set(e.at[0] + n[0] * 0.015, e.f.y + n[1] * 0.015, e.at[2] + n[2] * 0.015);
    _o.rotation.set(0, 0, 0);
    _o.scale.set(1, 1, 1);
    _o.lookAt(e.at[0] + n[0], e.f.y + n[1], e.at[2] + n[2]);
    _o.rotateZ(id * 1.7); // (each pool its own way round, steady)
    _o.scale.set(s, s, 1);
    _o.updateMatrix();
    pools.setMatrixAt(i++, _o.matrix);
  }
  if (pools.count !== i || i) { pools.count = i; pools.instanceMatrix.needsUpdate = true; }
}

// ---- 12.2 splatter on the wall behind

// A bullet that hit someone, from main.js (ours and others'): from `o` along `d`, it hit at `end`, fired with `w`.
let hitN = 0, missN = 0;
export function hit(o, d, end, w) {
  const def = WEAPONS[w];
  if (!C || !def || def.melee) return;
  const close = def.pellets && Math.hypot(end[0] - o[0], end[1] - o[1], end[2] - o[2]) < GORE.wall.shotgun;
  if (def.pellets ? !close || Math.random() > 0.35 : !headHigh(end)) return;
  const from = [end[0] + d[0] * 0.35, end[1] + d[1] * 0.35, end[2] + d[2] * 0.35];
  const h = C.coll().raycast(from, d, GORE.wall.reach, 'bullet');
  if (!h) { missN++; return; }
  hitN++;
  const at = [from[0] + d[0] * h.t, from[1] + d[1] * h.t, from[2] + d[2] * h.t];
  splats.add(at, h.n, GORE.wall.size * (0.7 + Math.random() * 0.6) * (1 - h.t / GORE.wall.reach * 0.5));
}
// the hit was at someone's head height (the nearest player to it)
function headHigh(end) {
  let best = null, bd = 0.7;
  for (const r of [...C.remotes.values(), C.me]) {
    if (!r.p) continue;
    const dd = Math.hypot(r.p[0] - end[0], r.p[2] - end[2]);
    if (dd < bd) { bd = dd; best = r; }
  }
  return !!best && end[1] - best.p[1] > ((best === C.me ? C.me.crouch : best.c) ? 0.72 : 1.42);
}

// ---- 12.3 blood on our screen, 12.4 the dying groan (main.js's kill handler)

export function kill(m, at) {
  if (!C || !at) return;
  const me = C.me;
  if (me.alive && m.v !== me.id && Math.hypot(at[0] - me.p[0], at[1] - me.p[1], at[2] - me.p[2]) < GORE.screen.near) splash();
  if (m.v === me.id || m.hs || m.gib) return; // (a head shot dies silent; a body blown apart doesn't groan)
  if (Math.hypot(at[0] - me.p[0], at[2] - me.p[2]) < GORE.dying) C.audio.play(Math.random() < 0.7 ? 'groan' : 'breath', [at[0], at[1] + 0.5, at[2]]);
}

function splash() {
  const el = screenEl, s = GORE.screen.secs;
  el.style.transition = 'none';
  el.style.opacity = '0.95';
  el.style.transform = `translateY(0) scaleX(${Math.random() < 0.5 ? -1 : 1})`;
  void el.offsetWidth; // (start the run from here)
  el.style.transition = `opacity ${s}s ease-in, transform ${s}s ease-in`;
  el.style.opacity = '0';
  el.style.transform = el.style.transform.replace('translateY(0)', 'translateY(18%)');
}

// ---- 12.4 the downed moan, 12.5 the heartbeat (every frame)

const moans = new Map(); // downed id -> next moan at (ms)
let nextBeat = 0, beatOn = false;
function updateSounds(now) {
  for (const r of C.remotes.values()) {
    if (!r.alive || !C.lying(r)) { moans.delete(r.id); continue; }
    const at = moans.get(r.id);
    if (at == null) { moans.set(r.id, now + 1500 + Math.random() * 3000); continue; }
    if (now < at) continue;
    moans.set(r.id, now + (GORE.moan[0] + Math.random() * (GORE.moan[1] - GORE.moan[0])) * 1000);
    if (Math.hypot(r.p[0] - C.me.p[0], r.p[2] - C.me.p[2]) < GORE.dying) C.audio.play('moan', [r.p[0], r.p[1] + 0.3, r.p[2]]);
  }
  const me = C.me, B = GORE.beat;
  const alone = ![...C.remotes.values()].some(r => r.alive && r.team === me.team && Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]) < B.mates);
  const on = me.alive && me.hp > 0 && me.hp <= B.hp && eyesUsedTo() < B.dark && alone;
  if (!on) { if (beatOn) { beatOn = false; beatEl.style.opacity = '0'; } return; }
  beatOn = true;
  if (now < nextBeat) { if (now > nextBeat - 60000 / bpm(me.hp) + 180) beatEl.style.opacity = '0'; return; }
  const k = 1 - me.hp / B.hp; // 0 .. 1 as it gets worse
  nextBeat = now + 60000 / bpm(me.hp);
  C.audio.play('heartbeat', null, k);
  beatEl.style.opacity = String(0.45 + 0.5 * k);
}
const bpm = hp => 70 + (GORE.beat.hp - hp) * 2.5; // 70 at 30 HP, 140 at 2 HP

// Every frame (main.js). replay: the kill cam (others are drawn in the past).
export function frame(now, replay) {
  if (!C) return;
  updatePools(now);
  if (!replay) updateSounds(now);
}

// A new round (main.js's round handler): the walls are clean, the bodies are gone.
export function round() {
  if (!C) return;
  splats.clear();
  live.clear();
  moans.clear();
  pools.count = 0;
}

// for the tests (dev/test-scripts/realism/g2-gore.mjs)
export const stats = () => ({ pools: pools?.count || 0, splats: splats?.list.length || 0, hits: hitN, misses: missN });
