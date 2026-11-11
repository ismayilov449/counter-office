// Close combat (ROADMAP group 8, rules in shared/closecombat.js; docs/features/closecombat.md): the browser side.
// main.js calls in at a few hooks marked "closecombat:".
import * as THREE from 'three';
import { WEAPONS, slotKey } from '/shared/weapons.js';
import { CC, supFits, behind } from '/shared/closecombat.js';

let C = null; // { me, game, remotes, switchSlot, eyePos, coll(), isMate(r), lying(r), off() } from main.js
export function initCloseCombat(ctx) { C = ctx; }

// ---- 8.1 suppressors
// Is this gun of ours suppressed? (quiet, no muzzle flash)
export const sup = id => !!C?.me.inv?.sup && supFits(id);

// A small dark tube on the muzzle of the gun in our hands (one shared mesh's worth per view model, built once).
let tubeGeo = null, tubeMat = null;
export function frame(vm, id) {
  if (!vm?.userData.muzzle) return;
  let t = vm.userData.ccTube;
  if (!t) {
    if (!sup(id)) return;
    tubeGeo ||= new THREE.CylinderGeometry(0.022, 0.022, 0.17, 10).rotateX(Math.PI / 2).translate(0, 0, -0.08);
    tubeMat ||= new THREE.MeshBasicMaterial({ color: 0x1b1b1d });
    t = vm.userData.ccTube = new THREE.Mesh(tubeGeo, tubeMat);
    vm.userData.muzzle.add(t);
  }
  t.visible = sup(id);
}

// ---- 8.2 disarming from behind: the E hint over an enemy's back (the server decides; see lib/closecombat.js)
function disarmTarget() {
  const { me } = C;
  if (!me.alive || me.zombie || C.off() || C.game.phase === 'freeze') return null;
  const eye = C.eyePos();
  for (const r of C.remotes.values()) {
    if (!r.alive || C.isMate(r) || !slotKey(r.w) || C.lying(r)) continue;
    if (Math.hypot(r.p[0] - me.p[0], r.p[2] - me.p[2]) > CC.reach || Math.abs(r.p[1] - me.p[1]) > CC.reachY || !behind(me.p, r.p, r.yaw)) continue;
    const head = [r.p[0], r.p[1] + (r.c ? 0.76 : 1.62), r.p[2]], d = head.map((v, i) => v - eye[i]), len = Math.hypot(...d);
    const wall = C.coll().raycast(eye, d.map(v => v / len), len, 'bullet');
    if (!wall || wall.t >= len - 0.2) return r;
  }
  return null;
}
// The E hint: an enemy's back (over everything but a trunk, as on the server); a closed door: running kicks it,
// crouched holds it shut (the server's order: the disarm comes long before the doors).
export function hint(h) {
  const r = disarmTarget();
  if (r) return `Press E to disarm ${r.name || 'him'} (snatch his ${WEAPONS[r.w]?.name || 'gun'})`;
  if (h !== 'Press E to open the door') return h;
  if (Math.hypot(C.me.v[0], C.me.v[2]) >= CC.run) return 'Press E to KICK the door open (you\'re running)';
  return C.me.crouch ? 'Press E to open the door · hold E to hold it shut' : 'Press E to open the door · crouch + hold E to hold it shut · run + E kicks it';
}

// ---- 8.3 door fights: the progress bar while holding a door shut or pushing it (counts from the server)
let counts = { h: 0, p: 0 };
export function progress(a) {
  if (a === 'ccHold') return `Holding the door shut (${counts.h} holding vs ${counts.p} pushing)`;
  if (a === 'ccPush') return counts.p > counts.h ? `Forcing the door (${counts.p} vs ${counts.h})...` : `Pushing the door: they're holding it (${counts.p} vs ${counts.h}), get help!`;
  return null;
}

export const handlers = {
  // our gun was snatched: the knife comes out (the server has already taken the gun from our inventory)
  ccDisarmed() { C.switchSlot('knife', true); },
  ccDoor(m) { counts = { h: m.h, p: m.p }; },
  // a door swung into where we stood: moved beside its leaf (the knock follows in its own message)
  ccShove(m) { C.me.p[0] = m.p[0]; C.me.p[2] = m.p[2]; },
};
