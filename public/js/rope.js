// The roof rope (ROADMAP 16.2), the browser's part (rules in shared/safe.js; the server's part lib/rope.js): the CT's
// hint on the eaves, the progress label, his swing (the server says where; we follow the same path), the rope drawn
// from the eaves to whoever is swinging.
import * as THREE from 'three';
import { ROPE, ropeKeys, ropeAt } from '/shared/safe.js';

// ctx: { me, game, scene, map(), remotes }
export function createRope(ctx) {
  const { me } = ctx;
  const lines = new Map(); // player id -> { line, i, until }
  const mat = new THREE.LineBasicMaterial({ color: 0x3b3226 });
  const spot = () => (ctx.map().ropes || []).findIndex(r => Math.hypot(me.p[0] - r.a[0], me.p[2] - r.a[2]) < ROPE.reach && Math.abs(me.p[1] - r.a[1]) < 0.6);
  return {
    handlers: {
      rope(m) {
        const now = performance.now();
        if (m.id === me.id) me.rope = { i: m.i, t0: now, ms: m.ms };
        const old = lines.get(m.id);
        if (old) ctx.scene.remove(old.line);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mat);
        line.frustumCulled = false;
        ctx.scene.add(line);
        lines.set(m.id, { line, i: m.i, until: now + m.ms + 300 });
      },
      ropeEnd(m) { me.rope = null; me.p = m.p.slice(); me.v = [0, 0, 0]; me.onGround = false; me.viewY = me.p[1]; },
    },
    // Our own movement while swinging (true: handled).
    local() {
      if (!me.rope) return false;
      const r = ctx.map().ropes?.[me.rope.i];
      if (!r) { me.rope = null; return false; }
      me.p = ropeAt(ropeKeys(r), (performance.now() - me.rope.t0) / me.rope.ms);
      me.v = [0, 0, 0]; me.crouch = false; me.jumpQueued = false; me.viewY = me.p[1];
      return true;
    },
    hint(text) {
      if (me.team !== 'CT' || me.rope || spot() < 0) return text;
      return `Hold E to hook the rope (${ROPE.hook} s) and swing in through the window below`;
    },
    progress: a => (a === 'rope' ? 'Hooking the rope... (they can hear it inside)' : null),
    frame() {
      const now = performance.now();
      for (const [id, l] of lines) {
        const r = ctx.map().ropes?.[l.i], who = id === me.id ? me : ctx.remotes.get(id);
        if (now > l.until || !r || !who) { ctx.scene.remove(l.line); l.line.geometry.dispose(); lines.delete(id); continue; }
        const pos = l.line.geometry.attributes.position;
        pos.setXYZ(0, r.a[0], r.a[1] + 0.05, r.a[2]);
        pos.setXYZ(1, who.p[0], who.p[1] + 1.5, who.p[2]);
        pos.needsUpdate = true;
      }
    },
    died() { me.rope = null; },
  };
}
