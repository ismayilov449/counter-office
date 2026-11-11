// Carrying wounded hostages (ROADMAP 6.2), the browser's side: the carrier's limits (walk, no jumping or ducking,
// pistol only), the carried hostage lying across his shoulders (hidden in his own view), and its hitbox for our shots.
// Who carries whom comes in the snapshot's `hs` (h.carrier, h.hurt: main.js syncHostages). Server: lib/hostage-carry.js.
import { CARRY, carriedBox } from '/shared/hostage-carry.js';
import { rayAABB } from '/shared/physics.js';

let C = null; // from main.js: { me, remotes, hostages }
export const initCarry = ctx => { C = ctx; };

export const carrying = () => !!C && C.me.alive && [...C.hostages.values()].some(h => h.carrier === C.me.id && h.state === 0);
export const carrySlotOk = slot => !carrying() || slot === 'secondary';
// (before the crouch and jump are read)
export function carryLimitKeys(keys) {
  if (!carrying()) return;
  keys.delete('ControlLeft');
  keys.delete('ControlRight');
  C.me.jumpQueued = false;
}
export const carrySpeed = (speed, def) => (carrying() ? Math.min(speed, def.speed * CARRY.speed) : speed);

// The carrier's feet and facing as we draw him, or null when he isn't drawn.
function carrierAt(id) {
  if (id === C.me.id) return C.me.alive ? { p: [C.me.p[0], Number.isFinite(C.me.viewY) ? C.me.viewY : C.me.p[1], C.me.p[2]], yaw: C.me.yaw } : null;
  const r = C.remotes.get(id);
  return r?.alive && r.model?.visible !== false ? { p: r.model.position.toArray(), yaw: r.model.rotation.y } : null;
}

// After the usual pose: lying across the shoulders, head to his right (feet at -0.9 m along his right, 1.45 m up).
export function carryPose(h) {
  const m = h.model;
  if (!h.carrier || h.state !== 0) {
    if (m.userData.carried) { m.userData.carried = false; m.rotation.order = 'XYZ'; m.rotation.z = 0; }
    return;
  }
  const at = carrierAt(h.carrier);
  m.userData.carried = true;
  m.visible = !!at && h.carrier !== C.me.id; // (in his own view it would fill the screen)
  if (!at) return;
  const rx = Math.cos(at.yaw), rz = -Math.sin(at.yaw);
  m.position.set(at.p[0] - rx * 0.9, at.p[1] + 1.45, at.p[2] - rz * 0.9);
  m.rotation.order = 'YXZ';
  m.rotation.set(0, at.yaw, -Math.PI / 2);
}

// Our shot against a carried hostage: the box across its carrier's shoulders (never our own one).
export function carryRay(h, o, d, maxT) {
  if (h.carrier === C.me.id) return null;
  const at = carrierAt(h.carrier);
  if (!at) return null;
  const b = carriedBox(at.p, at.yaw), hit = rayAABB(o, d, b.min, b.max, maxT);
  return hit && hit.t <= maxT ? hit : null;
}
