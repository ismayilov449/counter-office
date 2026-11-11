// Explosives (ROADMAP group 7), the browser's side (rules in shared/explosives.js; server: lib/explosives.js).
// main.js calls in at a few hooks marked "explosives:".
// 7.1 the E hint over an HE grenade by our feet, the grenade in our hand (a countdown; Mouse1 throws it back).
import * as THREE from 'three';
import { XP } from '/shared/explosives.js';

let C = null; // from main.js: { scene, me, game, remotes, net, hud, fx, audio, current(), coll(), eyePos(), aimDir(yaw, pitch), busy() }
let hot = null; // the grenade in our hand: { until (performance.now() ms) }

const flat3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function initExplosives(ctx) {
  C = ctx;
  // Over everything but a gadget, the drone or a trunk (as on the server, E grabs a grenade before a revive).
  const hint0 = C.hud.hint;
  C.hud.hint = function (text) {
    return hint0.call(this, ourHint() ?? text);
  };
  const progress0 = C.hud.progress;
  C.hud.progress = function (label, frac) {
    if (label != null) label = progressLabel(C.me.act?.a) ?? label;
    return progress0.call(this, label, frac);
  };
}

function progressLabel(a) {
  if (a === 'xpTrap') return 'Hiding the grenade under the body...';
  return null;
}

function ourHint() {
  const me = C.me;
  if (!me.alive) { hot = null; return null; }
  if (hot) {
    const left = Math.max(0, (hot.until - performance.now()) / 1000);
    return `GRENADE IN YOUR HAND: CLICK TO THROW IT BACK! (${left.toFixed(1)} s)`;
  }
  if (me.act || me.driving != null || me.riding || C.busy()) return null;
  return grabbable() ? 'Press E to grab the grenade and throw it back!' : null;
}

// An HE grenade (as we draw it) by our feet with enough fuse left.
function grabbable() {
  for (const n of C.fx.nades) {
    if (n.xpK !== 'he' || n.fuse - n.t < XP.grabLeft + 0.05) continue;
    const p = n.mesh.position;
    if (flat3([p.x, p.y, p.z], C.me.p) < XP.reach - 0.1) return n;
  }
  return null;
}

// main.js's nade handler: tag the grenade fx.nade just made with its id and kind.
export function tagNade(m) {
  const n = C.fx.nades[C.fx.nades.length - 1];
  if (n) { n.xpId = m.id; n.xpK = m.k; }
}

// Mouse1 while the grenade is in our hand: throw it (as a strong throw). True when it took the click.
export function throwBack() {
  if (!hot || !C.me.alive) return false;
  const me = C.me, o = C.eyePos(), d = C.aimDir(me.yaw, me.pitch + 0.08);
  const k = C.coll().raycast(o, d, 0.6, 'move') ? 0 : 0.4;
  const v = [d[0] * 21 + me.v[0] * 0.5, d[1] * 21 + 1.5 + me.v[1] * 0.3, d[2] * 21 + me.v[2] * 0.5];
  C.net.send({ t: 'xpThrow', o: [o[0] + d[0] * k, o[1] + d[1] * k - 0.1, o[2] + d[2] * k], v });
  C.audio.play('throw');
  me.swing = 1;
  hot = null;
  return true;
}

// ---- 7.2 booby-trapped bodies: a Terrorist's hint over a dead teammate, the progress label, a tiny pin up close.
const traps = new Map(); // body id -> the pin (a mesh), at the body as the server has it
let pinGeo = null, pinMat = null;

function mateBody() {
  const me = C.me;
  for (const r of C.remotes.values()) {
    if (r.alive || r.team !== me.team || r.model.userData.gibAll || !r.buf.length || traps.has(r.id)) continue;
    if (Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]) < XP.trapReach && Math.abs(r.p[1] - me.p[1]) < XP.trapReachY) return r;
  }
  return null;
}
// The hint chain (main.js, just over the uniform's line, as on the server); with the detonator out, the switch.
export function hint(text) {
  const me = C.me;
  if (C.current() === 'phone') return dmsIds.has(me.id) ? "DEAD MAN'S SWITCH ARMED: if you die or go down, your satchels go off (right-click to let go)" : `${text} · right-click: dead man's switch`;
  if (me.team !== 'T' || !(me.inv.he > 0) || C.game.phase !== 'live' || me.act) return text;
  const r = mateBody();
  if (!r) return text;
  if (me.crouch) return `Hold E to hide your HE grenade under ${r.name}'s body (${XP.trap} s): the first enemy who touches it sets it off`;
  return text || `Crouch and hold E to booby-trap ${r.name}'s body with your HE grenade`;
}
// Every frame: the pins show only up close; armed switches blink red in their holders' hands, and a CT who sees one
// is told (every few seconds while he does).
let warnedAt = 0;
export function frame() {
  const me = C.me, now = performance.now();
  for (const m of traps.values()) m.visible = Math.hypot(m.position.x - me.p[0], m.position.y - me.p[1], m.position.z - me.p[2]) < XP.pinSeen;
  for (const r of C.remotes.values()) {
    const l = r.model.userData.xpDms, on = dmsIds.has(r.id) && r.alive;
    if (!on) { if (l) l.visible = false; continue; }
    if (!l) r.model.add(r.model.userData.xpDms = dmsLight());
    r.model.userData.xpDms.visible = Math.floor(now / 250) % 2 === 0;
    if (me.team !== 'CT' || !me.alive || now - warnedAt < 3000) continue;
    const e = C.eyePos(), c = [r.p[0], r.p[1] + 1.1, r.p[2]], d = [c[0] - e[0], c[1] - e[1], c[2] - e[2]], len = Math.hypot(...d);
    const look = C.aimDir(me.yaw, me.pitch);
    if (len > XP.warn || (d[0] * look[0] + d[1] * look[1] + d[2] * look[2]) / len < 0.6) continue;
    const wall = C.coll().raycast(e, d.map(v => v / len), len);
    if (wall && wall.t < len - 0.3) continue;
    warnedAt = now;
    C.hud.small(`${r.name} holds a DEAD MAN'S SWITCH: kill him or knock him down and his satchels go off`, 3);
  }
}
const dmsIds = new Set();
let dmsGeo = null, dmsMat = null;
function dmsLight() {
  dmsGeo ||= new THREE.SphereGeometry(0.035, 6, 4);
  dmsMat ||= new THREE.MeshBasicMaterial({ color: 0xff2010 });
  const m = new THREE.Mesh(dmsGeo, dmsMat);
  m.position.set(0.28, 1.15, -0.25); // (about his right hand, held out in front)
  return m;
}
// Right-click with the detonator out (main.js secondary()).
export function dms() {
  C.net.send({ t: 'xpDms' });
  C.audio.play('click');
}
function syncTraps(list) {
  for (const [id, m] of traps) { m.parent?.remove(m); traps.delete(id); }
  pinGeo ||= new THREE.TorusGeometry(0.02, 0.004, 4, 10).rotateX(Math.PI / 2);
  pinMat ||= new THREE.MeshBasicMaterial({ color: 0xb8a060 });
  for (const [id, x, y, z] of list) {
    const m = new THREE.Mesh(pinGeo, pinMat);
    m.position.set(x + 0.18, y + 0.03, z + 0.12); // (by the body's side, on the floor)
    m.visible = false;
    C.scene.add(m);
    traps.set(id, m);
  }
}

export const handlers = {
  xpTraps(m) { syncTraps(m.list); },
  xpDms(m) { dmsIds.clear(); for (const id of m.ids) dmsIds.add(id); },
  // somebody picked a grenade up: it's gone from the floor
  xpGrab(m) {
    const i = C.fx.nades.findIndex(n => n.xpId === m.id);
    if (i < 0) return;
    C.fx.nades[i].mesh.parent?.remove(C.fx.nades[i].mesh);
    C.fx.nades.splice(i, 1);
    if (m.by === C.me.id) C.audio.play('pin');
  },
  // the grenade in our hand (ms left), or ms 0: not any more
  xpHot(m) {
    hot = m.ms > 0 ? { until: performance.now() + m.ms } : null;
  },
};
