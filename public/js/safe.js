// The safe (ROADMAP 16.1), the browser's part (rules in shared/safe.js; the server's part lib/safe.js): its door and
// dial (the body is the map's), the door swinging open once it's cracked, the Terrorists' hint, the progress label.
import * as THREE from 'three';
import { SAFE } from '/shared/safe.js';

// ctx: { me, game, scene, map() }
export function createSafe(ctx) {
  const { me } = ctx;
  let model = null, open = false, left = SAFE.crack, swing = 0;
  function build() {
    const S = ctx.map().safe;
    if (model) { ctx.scene.remove(model); model = null; }
    if (!S) return;
    const { min, max } = S.box, w = max[0] - min[0] - 0.12, h = max[1] - min[1] - 0.16;
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a3d40 }), steel = new THREE.MeshLambertMaterial({ color: 0x9a9ea2 });
    model = new THREE.Group(); // (the hinge: the door's west edge, on the front face)
    model.position.set(min[0] + 0.06, min[1] + 0.08, min[2] - 0.005);
    const door = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat);
    door.position.set(w / 2, h / 2, -0.025);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16).rotateX(Math.PI / 2), steel);
    dial.position.set(w * 0.55, h * 0.6, -0.065);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.04), steel);
    handle.position.set(w * 0.82, h * 0.45, -0.07);
    model.add(door, dial, handle);
    model.userData.dial = dial;
    ctx.scene.add(model);
  }
  const at = () => { const S = ctx.map().safe; return !!S && Math.hypot(me.p[0] - S.stand[0], me.p[2] - S.stand[2]) < SAFE.reach && Math.abs(me.p[1] - S.stand[1]) < 0.8; };
  return {
    load() { build(); open = false; swing = 0; },
    handlers: { safe(m) { open = !!m.open; left = m.left; if (!open) swing = 0; } },
    hint(text) {
      if (!ctx.map().safe || me.team !== 'T' || open || ctx.game.phase !== 'live' || !at()) return text;
      return `Hold E to crack the safe: $${SAFE.pay} for every Terrorist (${Math.ceil(left)} s of work left; its clicks are heard)`;
    },
    progress: a => (a === 'safe' ? 'Cracking the safe...' : null),
    frame(dt) {
      if (!model) return;
      if (me.act?.a === 'safe') model.userData.dial.rotation.z += dt * 3;
      swing += ((open ? 1 : 0) - swing) * Math.min(1, dt * 3);
      model.rotation.y = swing * 1.9;
    },
  };
}
