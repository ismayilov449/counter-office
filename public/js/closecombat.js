// Close combat (ROADMAP group 8, rules in shared/closecombat.js; docs/features/closecombat.md): the browser side.
// main.js calls in at a few hooks marked "closecombat:".
import * as THREE from 'three';
import { WEAPONS, slotKey } from '/shared/weapons.js';
import { CC, supFits, behind } from '/shared/closecombat.js';

let C = null; // { me, ... } from main.js
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
export function hint(h) {
  const r = disarmTarget();
  return r ? `Press E to disarm ${r.name || 'him'} (snatch his ${WEAPONS[r.w]?.name || 'gun'})` : h;
}

export const handlers = {
  // our gun was snatched: the knife comes out (the server has already taken the gun from our inventory)
  ccDisarmed() { C.switchSlot('knife', true); },
};
