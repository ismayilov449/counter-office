// Human shield (hostage maps), the browser's side: who holds which hostage (the snapshot's `sh`), the holder's limits
// (walk, no jumping or ducking, pistol only), the poses (the Terrorist's arm round the hostage's neck, the hostage
// leaning against him with its hands at his arm), hits on a held hostage, the hints, a muffled scream and the CTs'
// message. The server's side is lib/shield.js; main.js calls these from small hooks marked "shield".
import { PLAYER, overlapsAny } from '/shared/physics.js';
import { SHIELD, heldSpot, rayHeld } from '/shared/shield.js';

let C = null; // from main.js: { me, net, hud, audio, hostages, game, switchSlot, coll() }
const held = new Map(); // hostage id -> holder id

export function initShield(ctx) {
  C = ctx;
  C.net.handlers.shieldGrab = m => {
    held.set(m.h, m.id);
    scream(m.p);
    if (m.id === C.me.id) C.switchSlot('secondary', true);
    else if (C.me.team === 'CT') C.hud.small('A hostage is being used as a shield!', 3);
  };
  C.net.handlers.shieldDrop = m => {
    for (const [h, id] of held) if (h === m.h || (m.h < 0 && id === m.id)) held.delete(h);
  };
}

// The snapshot's `sh`: [[hostage id, holder id], ...] (missing: nobody holds one).
export function shieldSnap(list) {
  held.clear();
  for (const [h, id] of list || []) held.set(h, id);
}

export const shieldHeldBy = id => held.get(id) ?? null;
const holderOf = id => { for (const v of held.values()) if (v === id) return true; return false; };
export const shieldHolding = () => !!C && C.me.alive && holderOf(C.me.id);

// ---- the holder's limits
export const shieldSlotOk = slot => !shieldHolding() || slot === 'secondary';
// (called before the crouch and jump are read: no ducking or jumping with a hostage)
export function shieldLimitKeys(keys) {
  if (!shieldHolding()) return;
  keys.delete('ControlLeft');
  keys.delete('ControlRight');
  C.me.jumpQueued = false;
}
export const shieldSpeed = (speed, def) => (shieldHolding() ? Math.min(speed, def.speed * SHIELD.speed) : speed);

// A shot of ours against a held hostage (its own hitboxes; our own hostage is never in the way).
export function shieldRay(hs, o, d, maxT) {
  if (held.get(hs.id) === C.me.id) return null;
  return rayHeld(o, d, hs.p, hs.yaw ?? 0, maxT);
}

// ---- hints
export function shieldHint(hint) {
  if (!C || !C.me.alive) return hint;
  if (shieldHolding()) return 'Press E to let the hostage go';
  const me = C.me;
  // on the zip line, at the CCTV desk, in a car or flying the drone, E does that first (as on the server)
  if (me.zip || me.cctv || me.driving != null || me.riding || me.drone) return hint;
  if (me.team === 'T' && !me.act && (C.game.phase === 'live' || C.game.phase === 'warmup')) {
    for (const h of C.hostages.values()) {
      if (h.state > 1 || held.has(h.id)) continue;
      if (Math.hypot(me.p[0] - h.p[0], me.p[1] - h.p[1], me.p[2] - h.p[2]) < SHIELD.reach && Math.abs(me.p[1] - h.p[1]) < 1) return 'Press E to grab the hostage as a human shield';
    }
  }
  if (me.team === 'CT') {
    let best = null, bd = 2.2;
    for (const h of C.hostages.values()) {
      if (h.state > 1) continue;
      const d = Math.hypot(me.p[0] - h.p[0], me.p[1] - h.p[1], me.p[2] - h.p[2]);
      if (d < bd) { bd = d; best = h; }
    }
    if (best && held.has(best.id)) return 'A Terrorist holds this hostage as a shield';
  }
  return hint;
}

// ---- poses
const blocked = (x, y, z) => !!overlapsAny(C.coll().move(null, [x, y, z], 2), x, y + PLAYER.step, z, 0.22, PLAYER.height - PLAYER.step);

// A remote player (after posePlayer and emotes): the holder's free arm round the hostage's neck, the pistol beside
// its head.
export function shieldPoseRemote(r) {
  const u = r.model.userData;
  const on = r.alive && holderOf(r.id);
  if (on) {
    u.shieldPose = true;
    // the left forearm across the hostage's throat (longer, to reach round it; kept level whatever the aim)
    u.lArm.rotation.set(0.24 - u.arms.rotation.x, -0.31, 0);
    u.lArm.scale.set(1, 1, 1.4);
    u.rArm.rotation.set(0.28, -0.2, 0);
    u.hand.position.set(0.3, 0.08, -0.45);
  } else if (u.shieldPose) {
    u.shieldPose = false;
    u.lArm.rotation.set(0, 0, 0);
    u.lArm.scale.set(1, 1, 1);
    u.rArm.rotation.set(0, 0, 0);
    u.hand.position.set(0.1, -0.05, -0.4);
  }
}

// A hostage (after the usual pose): held, it leans back against the holder with its head to his left and its hands at
// his arm. Our own hostage is drawn where our own (predicted) movement puts it, not where the server last saw it.
export function shieldPoseHostage(h) {
  const u = h.model.userData;
  const by = held.get(h.id);
  if (by != null && h.state === 0) {
    if (by === C.me.id && C.me.alive) {
      const me = C.me, y = Number.isFinite(me.viewY) ? me.viewY : me.p[1];
      h.p = heldSpot([me.p[0], y, me.p[2]], me.yaw, blocked);
      h.yaw = me.yaw;
      h.model.position.set(...h.p);
      h.model.rotation.y = me.yaw;
    } else h.yaw = h.model.rotation.y; // (the holder's facing: for shieldRay)
    u.shieldPose = true;
    u.upper.rotation.set(0.1, 0, 0.18);
    u.headG.rotation.set(0.05, 0, 0.5);
    u.arms.rotation.x = 0.55;
    u.rArm.rotation.set(0, 0.35, 0);
    u.lArm.rotation.set(0, -0.3, 0);
  } else if (u.shieldPose) {
    u.shieldPose = false;
    u.upper.rotation.set(0, 0, 0);
    u.headG.rotation.set(0, 0, 0);
    u.rArm.rotation.set(0, 0, 0);
    u.lArm.rotation.set(0, 0, 0);
  }
}

// ---- a muffled scream (a voice behind a hand): a buzzy rising cry through a low, narrow "mouth", and breath
function scream(pos) {
  const master = C.audio.out(null);
  if (!master || master.context.state !== 'running' || !pos) return;
  const ctx = master.context, t = ctx.currentTime, out = C.audio.out(pos, [6, 0.9]);
  const f0 = 300 + Math.random() * 80;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * 0.8, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 1.55, t + 0.16);
  o.frequency.setValueAtTime(f0 * 1.55, t + 0.3);
  o.frequency.exponentialRampToValueAtTime(f0 * 1.05, t + 0.85);
  const lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.frequency.value = 7.5;
  depth.gain.value = f0 * 0.05;
  lfo.connect(depth).connect(o.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.Q.value = 5;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 480;
  bp.Q.value = 1.3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
  g.gain.setValueAtTime(0.9, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  o.connect(lp).connect(bp).connect(g).connect(out);
  o.start(t); lfo.start(t);
  o.stop(t + 0.95); lfo.stop(t + 0.95);
  // breath forced out through the fingers
  const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.9), ctx.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = n;
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 1100;
  nf.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.25, t + 0.08);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  src.connect(nf).connect(ng).connect(out);
  src.start(t);
}
