// Mansion scares, the browser's part (rules in shared/haunt.js; the server's part: lib/haunt.js). Dead this round, G
// floats free as a ghost (the camera flies through walls), 1 / 2 / 3 spend the round's haunt; the room a ghost flickers
// flickers here (only how it's drawn: the real lights stay the server's); grenades tied to doors and the lift (a small
// grenade on the handle / the cabin's floor: Terrorists see their side's from afar, CTs only up close).
import * as THREE from 'three';
import { HAUNT, RIG, hauntOn } from '/shared/haunt.js';
import { doorCenter } from '/shared/doors.js';
import { inCabin } from '/shared/elevator.js';

// ctx: { me, game, hud, audio, send(m), map(), keys(), coll(), scene, liftY(), showLights(lights) }
export function createHaunt(ctx) {
  const { me, game, hud, audio } = ctx;
  let ghost = null, used = false, flick = null;
  const able = () => hauntOn(ctx.map()) && me.joined && !me.alive && (me.team === 'T' || me.team === 'CT') && game.phase === 'live';
  const aim = () => { const c = Math.cos(me.pitch); return [-Math.sin(me.yaw) * c, Math.sin(me.pitch), -Math.cos(me.yaw) * c]; };

  // ---- rigged grenades: key (door index | 'lift') -> { team, mesh }
  const rigs = new Map();
  const geo = new THREE.SphereGeometry(0.045, 8, 6), mat = new THREE.MeshBasicMaterial({ color: 0x4f5a2c });
  function syncRigs(list) {
    for (const r of rigs.values()) ctx.scene.remove(r.mesh);
    rigs.clear();
    for (const [k, team, x, y, z] of list) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.visible = false;
      ctx.scene.add(mesh);
      rigs.set(k, { team, mesh, y });
    }
  }

  return {
    handlers: {
      haunt(m) { if (m.k === 'flicker') flick = { g: m.g, t0: performance.now() }; },
      hauntUsed() { used = true; hud.small('Boo.', 2); },
      rigs(m) { syncRigs(m.list); },
    },
    reset() { used = false; ghost = null; },
    // G while dead: float free / back to watching. True when it took the key.
    toggle() {
      if (!able()) return false;
      if (ghost) ghost = null;
      else { const c = me.p; ghost = [c[0], c[1] + 1.6, c[2]]; }
      audio.play('click');
      return true;
    },
    // 1 / 2 / 3 as a ghost: knock / flicker / slam.
    key(code) {
      const k = { Digit1: 'knock', Digit2: 'flicker', Digit3: 'slam' }[code];
      if (!ghost || !k || !able()) return false;
      if (used) { hud.small('Your haunt is spent this round.', 2); return true; }
      let p = ghost;
      if (k === 'knock') { const d = aim(), hit = ctx.coll().raycast(ghost, d, HAUNT.reach, 'move'); if (hit) p = ghost.map((v, i) => v + d[i] * Math.max(0, hit.t - 0.1)); }
      ctx.send({ t: 'haunt', k, p: p.map(v => Math.round(v * 100) / 100) });
      return true;
    },
    // updateCamera, for the dead: the ghost's camera (true when it set it).
    camera(camera, dt) {
      if (!ghost || !able()) { ghost = null; return false; }
      const keys = ctx.keys(), f = aim(), s = HAUNT.fly * dt;
      const fw = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), rt = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const up = (keys.has('Space') ? 1 : 0) - (keys.has('ControlLeft') || keys.has('KeyC') ? 1 : 0);
      ghost[0] += (f[0] * fw + Math.cos(me.yaw) * rt) * s;
      ghost[1] += (f[1] * fw + up) * s;
      ghost[2] += (f[2] * fw - Math.sin(me.yaw) * rt) * s;
      camera.position.set(ghost[0], ghost[1], ghost[2]);
      camera.rotation.set(me.pitch, me.yaw, 0);
      return true;
    },
    floating: () => !!ghost,
    hint() {
      if (!able()) return null;
      if (!ghost) return used ? null : 'G: float as a ghost and haunt an enemy (once a round)';
      if (used) return 'GHOST: your haunt is spent · G: back to watching';
      return `GHOST (WASD, Space / Ctrl) · near an enemy: 1 knock on the wall · 2 flicker the room's lights · 3 slam a door · G: back`;
    },
    progress(a) {
      if (a === 'rig') return 'Tying the grenade...';
      if (a === 'rigOff') return me.team === 'CT' ? 'Taking the grenade off...' : 'Taking your grenade back...';
      return null;
    },
    // The E hint (over the doors, as on the server's order): a crouched player at a rig, a Terrorist with the HE out.
    useHint(text, current) {
      const M = ctx.map(), ly = ctx.liftY();
      if (!hauntOn(M) || game.phase !== 'live') return text;
      const inLift = !!M.elevator && ly != null && inCabin(M.elevator, ly, me.p, 0.35);
      let door = null, bd = RIG.reach;
      (M.doors || []).forEach((d, i) => {
        if (d.hatch || d.roller || d.grate || game.doors?.[i] !== 0) return;
        const c = doorCenter(d), dd = Math.hypot(me.p[0] - c[0], me.p[2] - c[2]);
        if (dd < bd && Math.abs(me.p[1] + 1 - c[1]) < 1.6) { bd = dd; door = i; }
      });
      for (const [k, r] of rigs) {
        const near = k === 'lift' ? inLift : Math.hypot(r.mesh.position.x - me.p[0], r.mesh.position.z - me.p[2]) < RIG.reach && Math.abs(me.p[1] + 1 - r.y) < 1.2;
        if (!near || (r.team !== me.team && !r.mesh.visible)) continue;
        if (r.team === me.team) return me.crouch ? 'RIGGED by your side · hold E to take the grenade back' : 'RIGGED by your side: don\'t open it · crouch + E takes the grenade back';
        return me.crouch ? `A grenade is tied here · hold E to take it off (${RIG.disarm} s)` : 'A GRENADE IS TIED HERE · crouch and hold E to take it off';
      }
      if (me.team !== 'T' || current !== 'he' || !(me.inv.he > 0)) return text;
      if (inLift && !rigs.has('lift')) return 'Hold E to tie your grenade in the lift: it goes off when the doors open at another floor';
      if (door != null && !rigs.has(door)) return `Hold E to tie your grenade to the door (${RIG.time} s): whoever opens it pulls the pin`;
      return text;
    },
    frame(now) {
      // the flicker: off, on, off, on over HAUNT.flicker s (in a dark room the other way round)
      if (flick) {
        const s = (now - flick.t0) / 1000, done = s > HAUNT.flicker;
        const flip = !done && [0, 0.12, 0.25, 0.5, 0.62, 1.1, 1.25].filter(x => s >= x).length % 2 === 1;
        ctx.showLights(flip ? { ...game.lights, [flick.g]: game.lights[flick.g] === false } : game.lights);
        if (done) flick = null;
      }
      const ly = ctx.liftY();
      for (const [k, r] of rigs) {
        if (k === 'lift') { if (ly == null) continue; r.mesh.position.y = ly + r.y; }
        const d = Math.hypot(r.mesh.position.x - me.p[0], r.mesh.position.y - me.p[1] - 1, r.mesh.position.z - me.p[2]);
        r.mesh.visible = !me.alive || (r.team === me.team ? d < RIG.mates : d < RIG.seen);
      }
    },
  };
}
