// Human shield (hostage maps): a Terrorist presses E on a hostage and holds it in front of him, an arm round its neck.
// Shared by the server (lib/shield.js) and the browser (public/js/shield.js): where the hostage is held and its
// hitboxes while held.
import { hitboxes, raySphere, rayAABB } from './physics.js';

export const SHIELD = {
  reach: 1.6,   // a Terrorist grabs a hostage this close (m, feet to feet)
  ahead: 0.42,  // the hostage is held this far in front of him
  speed: 0.52,  // his top speed while holding it: walking pace (a share of his pistol's speed, like Shift)
  // The hostage's head leans to the holder's left (his free arm is round its neck) and back against his shoulder, so
  // he peeks past its right side: from the front the hostage covers his body, not most of his head.
  side: 0.21,
  back: 0.06,
  drop: 0.05,
};

const fwd = yaw => [-Math.sin(yaw), -Math.cos(yaw)];

// Where the hostage stands, held by someone standing at p and looking along yaw. blocked(x, y, z): a body there would
// be in a wall (then it's held closer).
export function heldSpot(p, yaw, blocked) {
  const [fx, fz] = fwd(yaw);
  for (const a of [SHIELD.ahead, SHIELD.ahead * 0.6, 0.12]) {
    const x = p[0] + fx * a, z = p[2] + fz * a;
    if (!blocked || !blocked(x, p[1], z)) return [x, p[1], z];
  }
  return [p[0], p[1], p[2]];
}

// The held hostage's hitboxes (hp: its feet; yaw: the way the holder faces): a standing body with its head to the side.
export function heldHitboxes(hp, yaw) {
  const b = hitboxes(hp, false);
  const [fx, fz] = fwd(yaw), lx = -Math.cos(yaw), lz = Math.sin(yaw); // (forward and the holder's left)
  const head = b[0];
  head.c = [hp[0] + lx * SHIELD.side - fx * SHIELD.back, head.c[1] - SHIELD.drop, hp[2] + lz * SHIELD.side - fz * SHIELD.back];
  return b;
}

// A ray against a held hostage: { t, part } of the nearest hit, or null (like rayPlayer).
export function rayHeld(o, d, hp, yaw, maxT) {
  let best = null;
  for (const hb of heldHitboxes(hp, yaw)) {
    const t = hb.r ? raySphere(o, d, hb.c, hb.r, maxT) : rayAABB(o, d, hb.min, hb.max, maxT)?.t;
    if (t != null && t <= maxT && (!best || t < best.t)) best = { t, part: hb.part };
  }
  return best;
}
