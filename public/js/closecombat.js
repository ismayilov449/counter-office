// Close combat (ROADMAP group 8, rules in shared/closecombat.js; docs/features/closecombat.md): the browser side.
// main.js calls in at a few hooks marked "closecombat:".
import * as THREE from 'three';
import { supFits } from '/shared/closecombat.js';

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
