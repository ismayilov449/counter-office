// Underground & vents in the browser (cs_mansion, cs_mansion_night; see shared/underground.js and lib/underground.js).
//   1. No radar underground: down there the radar shows static ("NO SIGNAL", main.js passes noSignal() to hud.radar
//      like a jammer), a ping or a target call says why it can't (blocked()), and the first time you go down a short
//      message says so.
//   2. Echo: a shot (shot()) or a blast (boom()) underground: above ground, wherever you are, a muffled boom from below
//      that rolls on (only the lows get through the floors: a low-passed thump into a feedback delay); underground a
//      ringing echo along the tunnels on top of the shot itself. Two buses made once (cheap per shot: a burst and a
//      tone into a bus), at most one echo per UG.echo.gap seconds, so a spraying rifle is one rolling rumble.
//   3. Air vents: the six grilles (one mesh, one draw call, lit like the walls round them); listening: near a grille
//      (your ears within UG.listen m), a sound in the room at the other end of its duct comes out of your grille,
//      as near as its way through the duct (audio.js asks ventPos() for every sound it places), so it's louder and
//      clearer the closer you are (crouch by a low one); the hint by a grille; a grenade rattling through a duct
//      ('ugDuct'). The grenade itself comes in 'nade' messages (main.js: `fu`, `vent`).
// main.js calls init() once, setMap() on every map load and update() every frame.
import * as THREE from 'three';
import { UG, isUnderground, undergroundMap, ventsOf, grilleDist, grilleRoom, inGrilleSpace } from '/shared/underground.js';
import { WEAPONS } from '/shared/weapons.js';
import { audio, floodKit } from './audio.js';

let D = null; // what it needs from main.js (see init)
let map = null, on = false;
let wasUnder = false, toldAt = -1e9;
const ear = [0, 0, 0]; // where we hear from (the camera)
const BLOCKED = 'No signal underground — no radar, pings or target calls down here';
let vents = null, rooms = [], roomOf = [], mesh = null, mat = null;
let near = null; // the grille we listen at: { g, d, links: [{ h (the far grille), room, len }] }
let heard = 0, rattles = 0;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const kitNow = () => (D?.kit ? D.kit() : floodKit()); // (tests pass their own kit)

// deps: { scene, net, me, hud, fx, coll(), indoors(p) }
export function init(deps) {
  D = deps;
  Object.assign(deps.net.handlers, { ugDuct });
  audio.vent = ventPos; // audio.js: a sound heard through an air vent comes out of the grille
}

export function setMap(m) {
  map = m;
  on = undergroundMap(m);
  wasUnder = false;
  toldAt = -1e9;
  near = null;
  vents = ventsOf(m);
  rooms = m?.rooms || [];
  roomOf = vents ? vents.grilles.map(g => grilleRoom(rooms, g)) : [];
  buildGrilles();
}

const under = p => on && isUnderground(map, p);
// Our radar has no signal: we're alive and underground.
export const noSignal = () => !!(D && D.me.alive && D.me.team !== 'SPEC' && under(D.me.p));
// A ping or a target call from underground: says why not (true: don't send it).
export function blocked() {
  if (!noSignal()) return false;
  D.hud.small(BLOCKED, 2);
  return true;
}

// ---------------------------------------------------------------- 2. the echo
// (the M4A1 is always heard with its silencer on: see main.js's 'shot')
const SUPPRESSED = new Set(['usp', 'tmp', 'm4a1', 'm4a1s']);
const LOUD = { pistol: 0.7, smg: 0.75, rifle: 1, mg: 1.05, shotgun: 1.2, sniper: 1.25, launcher: 1.2 };
const BLAST = { he: 1, c4: 1.6, rpg: 1.3, rpg26: 1.1, mortar: 1.5, satchel: 1.4, drone: 1.2, dronebomb: 1, car: 1.4, pmn: 0.9, mon50: 1, flash: 0.45, molotov: 0.4 };
let bus = null, lastEcho = -1, echoes = 0;

// The two buses, made once per audio context.
function buses(kit) {
  if (bus && bus.ctx === kit.ctx) return bus;
  const { ctx } = kit, out = audio.out(null);
  const node = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // from below: a low-pass (laptop speakers play little under ~150 Hz, so it keeps up to ~450 Hz), the dry boom, and
  // a feedback delay that darkens each time round (the boom rolling through the cellar and the tunnels)
  const below = gain(1), lp = node('lowpass', 450, 0.5), dl = ctx.createDelay(1), fb = gain(0.5), damp = node('lowpass', 300, 0.5);
  dl.delayTime.value = 0.23;
  below.connect(lp);
  lp.connect(gain(0.85)).connect(out);
  lp.connect(dl); dl.connect(damp); damp.connect(fb).connect(dl);
  damp.connect(gain(0.75)).connect(out);
  // in the tunnels: band-passed slap-backs that keep coming back, and a second, later one
  const tunnel = gain(1), bp = node('bandpass', 1100, 0.6), d1 = ctx.createDelay(1), d2 = ctx.createDelay(1), fb1 = gain(0.45), damp1 = node('lowpass', 1800, 0.5);
  d1.delayTime.value = 0.14; d2.delayTime.value = 0.31;
  tunnel.connect(bp);
  bp.connect(d1); d1.connect(damp1); damp1.connect(fb1).connect(d1);
  damp1.connect(gain(0.8)).connect(out);
  bp.connect(d2); d2.connect(gain(0.45)).connect(out);
  bus = { ctx, below, tunnel };
  return bus;
}

// One echo of loudness g (1: a rifle) from a sound underground at `from`.
function echo(from, g, long) {
  const kit = kitNow();
  if (!kit) return false;
  const b = buses(kit), t = kit.ctx.currentTime;
  if (t - lastEcho < UG.echo.gap && !long) return false;
  lastEcho = t;
  echoes++;
  if (!under(ear)) {
    // above ground: a muffled boom from below (whatever the distance)
    const k = UG.echo.gain * g;
    kit.tone(b.below, t, { freq: long ? 95 : 130, freqEnd: 45, dur: long ? 0.9 : 0.4, gain: k * 0.8 });
    kit.burst(b.below, t, { dur: long ? 0.8 : 0.28, type: 'lowpass', freq: 650, freqEnd: 140, gain: k });
  } else {
    // down there: it rings along the tunnels (less, further away; never gone)
    const d = dist(from, ear);
    const k = UG.echo.gain * g * (0.35 + 0.65 / (1 + d / 12));
    kit.burst(b.tunnel, t, { dur: long ? 0.35 : 0.12, type: 'bandpass', freq: 1500, freqEnd: 500, q: 0.7, gain: k });
    kit.tone(b.below, t, { freq: 110, freqEnd: 50, dur: long ? 0.7 : 0.25, gain: k * 0.5 });
  }
  return true;
}

// A shot (any player's, ours too) from `o` with weapon w: its echo if it was fired underground.
export function shot(o, w) {
  if (!on || !o || !under(o)) return false;
  const def = WEAPONS[w];
  if (!def || def.melee) return false;
  const g = SUPPRESSED.has(w) ? UG.echo.suppressed : LOUD[def.cls] ?? 1;
  return echo(o, g, false);
}

// A blast at p of kind k: its echo if it went off underground (a smoke grenade makes none).
export function boom(p, k) {
  if (!on || !p || !under(p) || !(k in BLAST)) return false;
  return echo(p, UG.echo.blast * BLAST[k], true);
}

// ---------------------------------------------------------------- 3. the air vents
// A grille's face: a dark duct behind a frame and slats (64 px, drawn once).
function grilleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9c98'; g.fillRect(0, 0, 64, 64); // the frame
  g.fillStyle = '#141414'; g.fillRect(6, 6, 52, 52); // the dark duct behind
  for (let y = 9; y < 56; y += 7) {
    g.fillStyle = '#a8aaa6'; g.fillRect(6, y, 52, 3); // a slat, lit on top
    g.fillStyle = '#5c5e5a'; g.fillRect(6, y + 3, 52, 1); // and its shadow
  }
  g.strokeStyle = '#6e706c'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// All the grilles in one mesh: a quad each, 4 mm in front of its wall, floor or ceiling.
function buildGrilles() {
  if (mesh) { D.scene.remove(mesh); mesh.geometry.dispose(); mesh = null; }
  if (!vents || !D?.scene) return;
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of vents.grilles) {
    const [U, V] = g.axis === 1 ? [0, 2] : [g.axis === 0 ? 2 : 0, 1];
    const at = g.lo[g.axis] + g.n * 0.004;
    const corner = (u, v) => { const p = [0, 0, 0]; p[g.axis] = at; p[U] = u ? g.hi[U] : g.lo[U]; p[V] = v ? g.hi[V] : g.lo[V]; return p; };
    // (counter-clockwise seen from its room: e_U x e_V must point along the normal)
    const eU = [0, 0, 0], eV = [0, 0, 0]; eU[U] = 1; eV[V] = 1;
    const cross = [eU[1] * eV[2] - eU[2] * eV[1], eU[2] * eV[0] - eU[0] * eV[2], eU[0] * eV[1] - eU[1] * eV[0]];
    const flip = cross[g.axis] * g.n < 0;
    const quad = flip ? [[0, 0], [0, 1], [1, 1], [1, 0]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    const n = pos.length / 3;
    for (const [u, v] of quad) { pos.push(...corner(u, v)); nor.push(...g.nv); uv.push(u, v); }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  mat ||= new THREE.MeshLambertMaterial({ map: grilleTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'vent grilles';
  mesh.matrixAutoUpdate = false;
  D.scene.add(mesh);
}

// Where a sound at `pos` is heard from, when it comes to us through an air vent (null: as it is). Near a grille, a
// sound in the space at the other end of its duct: out of our grille, as far away as our ears from the grille plus
// UG.via times its way through the duct (when that's nearer than it really is).
export function ventPos(pos) {
  if (!near || !pos) return null;
  const direct = dist(ear, pos);
  for (const l of near.links) {
    if (!inGrilleSpace(rooms, l.h, l.room, pos, p => !D.indoors(p))) continue;
    const via = near.d + UG.via * (l.len + dist(l.h.c, pos));
    if (via >= direct * 0.9) continue;
    const g = near.g, to = [g.c[0] - ear[0], g.c[1] - ear[1], g.c[2] - ear[2]], len = Math.hypot(...to);
    const dir = len > 0.05 ? to.map(c => c / len) : g.nv.map(c => -c);
    heard++;
    return [ear[0] + dir[0] * via, ear[1] + dir[1] * via, ear[2] + dir[2] * via];
  }
  return null;
}

// The hint by a grille (no E use: it says what it is). Only alive, close (standing over a floor grille your ears are
// 1.62 m from it) and on its side.
export function hint() {
  if (!near || !D?.me.alive || near.d > 1.8) return null;
  const to = near.links.map(l => l.h.name).join(' and ');
  return near.g.kind === 'floor'
    ? `Air vent to ${to}: you hear it from here — a grenade dropped in falls out there`
    : `Air vent to ${to}: listen here — a grenade thrown in comes out there`;
}

// A grenade going through a duct: it rattles in at grille a and clanks out of grille b.
function ugDuct(m) {
  if (!vents) return;
  const a = vents.grilles[m.a], b = vents.grilles[m.b];
  if (!a || !b) return;
  setTimeout(() => rattle(a, (m.d || 300) / 1000, false), m.in || 0);
  setTimeout(() => rattle(b, 0.12, true), (m.in || 0) + (m.d || 300));
}
function rattle(g, dur, clank) {
  const kit = kitNow();
  if (!kit) return;
  rattles++;
  const out = kit.out ? kit.out(g.c) : audio.out(g.c, [4, 1]), t = kit.ctx.currentTime;
  if (clank) {
    kit.tone(out, t, { freq: 420 + Math.random() * 80, dur: 0.18, type: 'triangle', gain: 0.22 });
    kit.burst(out, t, { dur: 0.06, type: 'highpass', freq: 2500, gain: 0.25 });
    return;
  }
  const n = Math.max(3, Math.round(dur / 0.06));
  for (let i = 0; i < n; i++) kit.tone(out, t + (i * dur) / n + Math.random() * 0.02, { freq: 700 + Math.random() * 900, dur: 0.035, type: 'square', gain: 0.07 * (1 - (0.5 * i) / n) });
  kit.burst(out, t, { dur, type: 'bandpass', freq: 2200, q: 1.2, gain: 0.12 });
}

export function update(dt, now, camera) {
  if (!D || !on) return;
  if (camera) { ear[0] = camera.position.x; ear[1] = camera.position.y; ear[2] = camera.position.z; }
  // going down: once, a short word about the radar (again only after a while above ground)
  const u = noSignal();
  if (u && !wasUnder && now - toldAt > 60000) { D.hud.small('Underground: no radar signal down here — listen', 3); toldAt = now; }
  wasUnder = u;
  // the grille we listen at: the nearest within reach, on its side (dead or alive: a spectator's camera listens too)
  near = null;
  if (vents) {
    let best = null;
    for (const g of vents.grilles) {
      const d = grilleDist(g, ear);
      if (d < UG.listen && (!best || d < best.d) && (ear[g.axis] - g.c[g.axis]) * g.n > -0.05) best = { g, d };
    }
    if (best) near = { g: best.g, d: best.d, links: best.g.links.map(l => ({ h: vents.grilles[l.to], room: roomOf[l.to], len: l.len })) };
  }
}

// (tests)
export const debug = () => ({ on, echoes, ear: ear.slice(), under: under(ear), bus, mesh, near: near && { i: near.g.i, d: near.d }, heard, rattles, roomOf });
