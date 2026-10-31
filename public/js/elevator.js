// The lift in the Mansion, in the browser (the server runs it: lib/elevator.js; the maths both share: shared/elevator.js;
// the shaft is part of the level). main.js makes one with createElevator(ctx) and calls into it: load() with each map,
// local() at the start of the player's own movement (the cabin moves, and if we're in it or on its roof we move by as
// much before movePlayer: smooth at any frame rate, never through its floor), remote() for each other player it draws
// (they're drawn a moment in the past: whoever is in the cabin is put where the cabin is now), update() every frame
// (the boxes, the models, the motor's hum, what E would do), hint() and progress() for the help line, and the server's
// messages (elevState, elevSfx, elevTo).
// Cheap to draw: the cabin is one merged mesh (vertex colours), the 16 door panels one instanced mesh, the lit buttons
// and the cabin's ceiling light one more, the call buttons' plates one static mesh, the hatch's lid a small one; shared
// materials, no lights, no shadows. The hum is the game's 'hum' loop (audio.loop); the other sounds are made here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYER } from '/shared/physics.js';
import { ELEV, motionAt, doorAt, inCabin, onRoof, inShaft, roofAt, nearestStop, makeBoxes, placeCabin, placeDoor, makeLadders, placeLadders, aimAt, touches } from '/shared/elevator.js';

const aimDir = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export function createElevator(ctx) {
  const { scene, me, net, audio, serverNow } = ctx;
  let map = null, E = null, B = null, lads = null, bound = null;
  let st = null, last = null, y = 0, yPrev = 0, lastT = null, dy = 0, hum = false, aim = null, sentAim;
  let cabin = null, lid = null, panels = null, lit = null, plates = null;
  const mats = [];

  // ---------------------------------------------------------------- models
  const tint = (g, hex) => {
    const col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const boxGeo = (b, hex, oy = 0) => tint(new THREE.BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]).translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2 - oy, (b.min[2] + b.max[2]) / 2), hex);
  const bx = (x1, y1, z1, x2, y2, z2) => ({ min: [x1, y1, z1], max: [x2, y2, z2] });

  function build() {
    const c = E.cabin, P = E.panel, H = E.hatch;
    // the cabin, its floor at local y 0: the collision boxes themselves (brushed steel walls, a dark rubber floor, the
    // roof plate), a handrail along the back, the button panel by the doors
    placeCabin(E, B, 0, false);
    const [floor, ...rest] = B.cabin, parts = [boxGeo(floor, 0x34363a)];
    rest.slice(0, 6).forEach(b => parts.push(boxGeo(b, 0xa9aeb3)));
    rest.slice(6, 10).forEach(b => parts.push(boxGeo(b, 0x707478)));
    parts.push(boxGeo(bx(c.x1 + c.wall, 0.88, c.z1 + c.wall, c.x2 - c.wall, 0.93, c.z1 + c.wall + 0.05), 0x5f6366));
    parts.push(boxGeo(bx(c.x1 + c.wall, 0.005, c.z1 + c.wall, c.x2 - c.wall, 0.01, c.z2 - c.wall), 0x2a2b2e)); // (the floor's top: a darker mat)
    parts.push(boxGeo(bx(P.x - 0.012, P.ys[0] - 0.1, P.z - 0.075, P.x + 0.005, P.ys[2] + 0.12, P.z + 0.075), 0x2b2d30));
    P.ys.forEach(h => parts.push(boxGeo(bx(P.x - 0.022, h - 0.025, P.z - 0.025, P.x - 0.012, h + 0.025, P.z + 0.025), 0xcfd2d4)));
    parts.push(boxGeo(bx(c.x1 + 0.2, c.ceil - 0.004, c.z2 - 0.75, c.x1 + 0.6, c.ceil - 0.001, c.z2 - 0.25), 0xdedede)); // (the light's frame)
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mats.push(mat);
    cabin = new THREE.Group();
    const body = new THREE.Mesh(mergeGeometries(parts), mat);
    cabin.add(body);
    // the hatch's lid: shut, flush with the roof; open, standing up on its west edge
    lid = new THREE.Mesh(tint(new THREE.BoxGeometry(H.x2 - H.x1, c.roof, H.z2 - H.z1).translate((H.x2 - H.x1) / 2, c.roof / 2, 0), 0x63676b), mat);
    lid.position.set(H.x1, c.ceil, (H.z1 + H.z2) / 2);
    cabin.add(lid);
    scene.add(cabin);
    // the door panels (4 per door set: the cabin's and the three landings'), brushed steel
    const steel = new THREE.MeshLambertMaterial({ color: 0xb4b9be });
    mats.push(steel);
    panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, 16);
    panels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // lit things: the cabin's ceiling light, its three buttons, the three call buttons (unlit: scaled away)
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mats.push(glow);
    lit = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glow, 7);
    lit.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 7; i++) lit.setColorAt(i, _c.set(i === 0 ? 0xfff6e0 : 0xffb347));
    // (both span the shaft: one fixed bounding sphere round it, never recomputed)
    const ctr = new THREE.Vector3((E.out.x1 + E.out.x2) / 2, (E.pit + E.top) / 2, (E.out.z1 + E.out.z2) / 2), rad = (E.top - E.pit) / 2 + 2;
    panels.boundingSphere = new THREE.Sphere(ctr.clone(), rad);
    lit.boundingSphere = new THREE.Sphere(ctr.clone(), rad);
    for (const o of [body, lid, panels, lit]) { o.castShadow = false; o.receiveShadow = false; }
    scene.add(panels, lit);
    // the call buttons' plates beside each landing's doorway
    const pl = [];
    for (const [x, h, z] of E.call) {
      pl.push(boxGeo(bx(x - 0.06, h - 0.09, z - 0.005, x + 0.06, h + 0.09, z + 0.008), 0x2b2d30));
      pl.push(boxGeo(bx(x - 0.025, h - 0.025, z + 0.008, x + 0.025, h + 0.025, z + 0.018), 0xcfd2d4));
    }
    plates = new THREE.Mesh(mergeGeometries(pl), mat);
    scene.add(plates);
  }
  function dispose() {
    for (const o of [cabin, panels, lit, plates]) if (o) { scene.remove(o); o.traverse?.(m => m.geometry?.dispose()); }
    for (const m of mats) m.dispose();
    mats.length = 0;
    cabin = lid = panels = lit = plates = null;
    audio.loop('elev', null);
    hum = false;
  }

  // ---------------------------------------------------------------- the state, the boxes, things riding along
  const motion = () => ({ y0: st.m[0], y1: st.m[1], t0: st.m[2], tb: st.m[3] });
  const atStop = () => { const n = nearestStop(E, y); return n.d < 0.002 ? n.s : -1; };
  function fresh() {
    const t = serverNow();
    st = { m: [E.stops[1], E.stops[1], t, 0], d: [0, 1, 2, 3].map(() => [0, 0, t, ELEV.door]), h: 0, q: [], p: 1, rm: [], rs: [] };
    y = yPrev = E.stops[1];
  }
  // Once per frame (local() or update(), whichever comes first; `frame` is the frame's clock): the cabin's height now, its
  // boxes and ladders, and the mines and satchels on it moved along.
  function step(frame) {
    if (!E || frame === lastT) return;
    lastT = frame;
    const t = serverNow();
    yPrev = y;
    y = motionAt(motion(), t).y;
    dy = y - yPrev;
    if (Math.abs(dy) > 0.15) dy = 0; // (a jump, not a ride: a new round put it back on the ground floor)
    if (dy) {
      for (const id of st.rm) { const e = ctx.mines.get(id); if (e) { e.obj.position.y += dy; if (e.m) e.m.p[1] += dy; } }
      for (const id of st.rs) { const e = ctx.satchels.get(id); if (e && e.obj.parent === scene) e.obj.position.y += dy; }
    }
    placeCabin(E, B, y, !!st.h);
    for (let k = 0; k < 4; k++) placeDoor(E, B, k, y, doorAt(st.d[k], t));
    placeLadders(E, lads, y);
    const coll = ctx.coll();
    if (coll.elev !== B.all) { coll.elev = B.all; coll.elevBound = bound; }
  }

  // ---------------------------------------------------------------- sounds (made here; the hum is audio.loop's)
  let noiseBuf = null;
  function sound(pos, ref, fn) {
    try {
      const out = audio.out(pos, ref, audio.muffled), c = out.context;
      if (c.state !== 'running') return;
      if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
        noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const tone = (t0, freq, dur, { type = 'sine', gain = 0.2, to, attack = 0.005 } = {}) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t0);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(out);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
      };
      const hiss = (t0, dur, { freq = 1200, to, q = 1, gain = 0.2, type = 'bandpass', attack = 0.01 } = {}) => {
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = noiseBuf;
        s.loop = true;
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(freq, t0);
        if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        s.connect(f).connect(g).connect(out);
        s.start(t0);
        s.stop(t0 + dur + 0.05);
      };
      fn(c.currentTime, tone, hiss);
    } catch { /* no sound yet (before the first click) */ }
  }
  const SFX = {
    // arriving: a two-note chime
    ding: (t, tone) => { tone(t, 1318, 1.1, { gain: 0.12 }); tone(t, 2636, 0.5, { gain: 0.02, type: 'triangle' }); tone(t + 0.42, 1046, 1.4, { gain: 0.12 }); tone(t + 0.42, 2092, 0.6, { gain: 0.02, type: 'triangle' }); },
    // the doors sliding (open or shut): a rumble of rollers, a soft bump at the end
    doors: (t, tone, hiss) => { hiss(t, 1.0, { freq: 700, to: 450, q: 0.8, gain: 0.12, attack: 0.15 }); tone(t, 95, 1.0, { type: 'triangle', gain: 0.05, attack: 0.15 }); tone(t + 0.95, 70, 0.12, { gain: 0.25 }); hiss(t + 0.95, 0.08, { freq: 300, gain: 0.3, type: 'lowpass' }); },
    // the emergency brake: a relay's clack, a heavy clunk, steel screeching on the guide rails
    brake: (t, tone, hiss) => { tone(t, 1800, 0.02, { type: 'square', gain: 0.1 }); hiss(t, 0.15, { freq: 260, gain: 0.9, type: 'lowpass' }); tone(t, 55, 0.3, { gain: 0.5 }); tone(t + 0.03, 1250, 0.45, { type: 'sawtooth', gain: 0.05, to: 700 }); hiss(t + 0.03, 0.45, { freq: 3200, to: 1800, q: 6, gain: 0.25 }); },
    // prying the doors (as long as it takes): grinding steel, a crowbar's creaks, the doors' rubber squealing
    pry: (t, tone, hiss) => {
      for (let k = 0; k < 7; k++) { const t0 = t + k * 0.43 + Math.random() * 0.08; hiss(t0, 0.32, { freq: 2400 + Math.random() * 1500, q: 5, gain: 0.35 }); tone(t0, 160 + Math.random() * 60, 0.3, { type: 'sawtooth', gain: 0.07, to: 240 }); }
      tone(t + 0.4, 620, 2.4, { type: 'sawtooth', gain: 0.025, to: 900, attack: 0.3 });
    },
    // they give: a bang, then sliding open
    forced: (t, tone, hiss) => { hiss(t, 0.12, { freq: 500, gain: 1.0, type: 'lowpass' }); tone(t, 80, 0.25, { gain: 0.5 }); tone(t, 2100, 0.3, { type: 'square', gain: 0.04, to: 900 }); hiss(t + 0.1, 1.4, { freq: 600, to: 350, q: 0.8, gain: 0.15, attack: 0.1 }); },
    // the roof hatch: a steel lid clanging
    hatch: (t, tone, hiss) => { tone(t, 310, 0.25, { type: 'square', gain: 0.06 }); tone(t, 465, 0.18, { type: 'triangle', gain: 0.08 }); hiss(t, 0.1, { freq: 2600, q: 2, gain: 0.4 }); },
    // a button
    click: (t, tone) => { tone(t, 2400, 0.02, { type: 'square', gain: 0.06 }); tone(t + 0.02, 1200, 0.04, { type: 'square', gain: 0.03 }); },
  };
  const FAR = { pry: [9, 0.7], forced: [8, 0.7], brake: [7, 0.8], ding: [3, 1.1], doors: [3, 1.1], hatch: [3, 1.1], click: [1.5, 1.2] };

  // ---------------------------------------------------------------- the hint for what E would do
  function hintFor(a) {
    const power = !!st.p, r = motionAt(motion(), serverNow()), inside = inCabin(E, y, me.p, 0.3);
    if (!a) {
      if (inside && !r.moving && atStop() < 0) return power ? 'The lift has stopped between floors' : 'The lift is stuck in the dark — pry the doors open near a floor, or look up: the roof hatch';
      return null;
    }
    const s = +a[1];
    switch (a[0]) {
      case 'c': return !power ? 'The lift has no power (the fuse box is in the cellar)' : st.q.includes(s) ? 'The lift is on its way' : 'Press E to call the lift';
      case 'b': return !power ? 'No power — the buttons are dead' : `Press E to go to ${E.names[s]}`;
      case 'h':
        if (!inside) return 'Press E to drop back into the cabin through the hatch';
        if (r.moving) return 'The roof hatch (once the lift stops)';
        return roofAt(E, y) + ELEV.headroom > E.top ? 'The roof hatch — no room above the cabin up here' : 'Press E to climb out through the roof hatch';
      case 'f': {
        if (r.moving) return null;
        if (power && atStop() >= 0) return doorAt(st.d[0], serverNow()) > 0.9 ? null : 'Press E to open the doors';
        const n = nearestStop(E, y);
        if (doorAt(st.d[0], serverNow()) > 0.9 && doorAt(st.d[1 + n.s], serverNow()) > 0.9) return null;
        return n.d > ELEV.near ? 'Too far from a floor to get out this way — look up: the roof hatch' : `Hold E to pry the doors open (${ELEV.force} s, loud)`;
      }
      case 'l': {
        const shaft = inShaft(E, me.p) && !inside;
        if (shaft) return doorAt(st.d[1 + s], serverNow()) > 0.9 ? 'Press E to climb out of the shaft' : `Hold E to pry the landing's doors open (${ELEV.force} s, loud)`;
        return doorAt(st.d[1 + s], serverNow()) > 0.9 ? null : `Hold E to pry the lift's doors open (${ELEV.force} s, loud) — mind the empty shaft`;
      }
    }
    return null;
  }

  return {
    load(m) {
      dispose();
      map = m;
      E = m.elevator || null;
      if (!E) { B = null; return; }
      B = makeBoxes();
      lads = E._ladders ||= makeLadders(E); // (the night map shares the day map's ladders list)
      if (!map.ladders.includes(lads[0])) map.ladders.push(...lads);
      bound = { min: [E.out.x1, E.pit - 0.2, E.out.z1], max: [E.out.x2, E.top + 0.1, E.out.z2] };
      fresh();
      if (last) st = last;
      lastT = null;
      sentAim = undefined;
      build();
      step(-1);
    },
    onState(m) {
      last = m;
      if (E) st = m;
    },
    onSfx(m) {
      if (!E) return;
      if (m.s === 'click') { audio.play('click'); return; }
      const f = SFX[m.s];
      if (f) sound(m.p, FAR[m.s], f);
      if (m.s === 'pry' || m.s === 'forced') audio.play('creak', m.p, m.s === 'pry' ? ELEV.force : 0.8);
    },
    // The server put us somewhere (out of the hatch, back down it, out of the shaft).
    onTo(m) {
      me.p = m.p.slice();
      me.v = [0, 0, 0];
      me.onGround = true;
      me.crouch = !!m.c;
      me.eyeH = m.c ? PLAYER.crouchEye : PLAYER.eye;
      me.viewY = me.p[1];
    },
    // Our own movement, before movePlayer: in the cabin or on its roof we go up and down with it.
    local(dt, now) {
      if (!E) return;
      step(now);
      const was = inCabin(E, yPrev, me.p, 0.12) || onRoof(E, yPrev, me.p, 0.12);
      if (was && dy) {
        me.p[1] += dy;
        if (Number.isFinite(me.viewY)) me.viewY += dy;
      }
      // no room to stand: crouch (on the roof near the shaft's top, under the cabin coming down)
      if (onRoof(E, y, me.p, 0.15) && roofAt(E, y) + PLAYER.height + 0.02 > E.top) me.crouch = true;
      if (inShaft(E, me.p) && me.p[1] < y && me.p[1] + PLAYER.height > y - E.cabin.floor - 0.03) me.crouch = true;
      // never let a moving box catch us (movePlayer would lift us onto it or push us through a wall): a door closing on
      // us lets us be (the server opens it again); the cabin rising into our feet lifts us, coming down onto us pushes
      // us down
      const h = me.crouch ? PLAYER.crouchHeight : PLAYER.height;
      for (const b of B.all) {
        if (!touches(b, me.p, PLAYER.radius - 0.01, h)) continue;
        if (b.elevDoor != null) { b.min[1] = b.max[1] = -1000; continue; }
        if (!dy) continue;
        if (b.max[1] - me.p[1] < 0.6) { me.p[1] = b.max[1] + 0.001; me.v[1] = Math.max(0, me.v[1]); }
        else me.p[1] = Math.min(me.p[1], b.min[1] - h - 0.001);
      }
    },
    // Another player drawn at time rt: if they were in the cabin then, they're in it now.
    remote(p, rt) {
      if (!E || !st) return;
      const yr = motionAt(motion(), rt).y;
      if (Math.abs(yr - y) > 1e-4 && Math.abs(yr - y) < 1 && (inCabin(E, yr, p, 0.2) || onRoof(E, yr, p, 0.2))) p[1] += y - yr;
    },
    update(dt, now) {
      if (!E) return;
      step(now);
      const t = serverNow(), r = motionAt(motion(), t);
      cabin.position.y = y;
      const H = E.hatch;
      lid.rotation.z = st.h ? Math.PI / 2 : 0;
      lid.position.set(H.x1, E.cabin.ceil, (H.z1 + H.z2) / 2);
      // the door panels (placed again: local() may have let one that was closing on us through, for the movement only)
      let i = 0;
      for (let k = 0; k < 4; k++) placeDoor(E, B, k, y, doorAt(st.d[k], t));
      for (const b of B.all) {
        if (b.elevDoor == null) continue;
        _p.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
        _s.set(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
        panels.setMatrixAt(i++, _m.compose(_p, _q.identity(), _s));
      }
      panels.instanceMatrix.needsUpdate = true;
      // lit: the cabin's light (with the power), its buttons and the call buttons (while called)
      const c = E.cabin, P = E.panel, on = !!st.p;
      const put = (k, x, yy, z, sx, sy, sz, show) => lit.setMatrixAt(k, _m.compose(_p.set(x, yy, z), _q.identity(), _s.set(show ? sx : 1e-4, show ? sy : 1e-4, show ? sz : 1e-4)));
      put(0, c.x1 + 0.4, y + c.ceil - 0.006, c.z2 - 0.5, 0.36, 0.004, 0.46, on);
      P.ys.forEach((h, s) => put(1 + s, P.x - 0.023, y + h, P.z, 0.004, 0.036, 0.036, on && st.q.includes(s)));
      E.call.forEach(([x, h, z], s) => put(4 + s, x, h, z + 0.019, 0.036, 0.036, 0.004, on && st.q.includes(s)));
      lit.instanceMatrix.needsUpdate = true;
      for (const m of mats) if (m.emissive) m.emissive.setHex(on ? 0x1a1a1a : 0);
      // the motor's hum while it moves (from the machine room over the shaft and the cabin itself)
      if (r.moving || hum) {
        hum = true;
        audio.loop('elev', [(E.shaft.x1 + E.shaft.x2) / 2, y + 1.2, (E.shaft.z1 + E.shaft.z2) / 2], 'hum', r.moving ? 1 : 0);
      }
      // what E would do: told to the server when it changes
      aim = me.alive ? aimAt(E, y, me.p, [me.p[0], me.p[1] + (me.eyeH || PLAYER.eye), me.p[2]], aimDir(me.yaw, me.pitch), !!st.p) : null;
      if (aim !== sentAim) { sentAim = aim; net.send({ t: 'elevAim', a: aim }); }
    },
    hint() { return E && st && me.alive ? hintFor(aim) : null; },
    progress(a) { return a === 'elevforce' ? 'Prying the lift\'s doors open...' : null; },
  };
}
