// The Mansion's gadgets, shared by the server and the browsers (where they are: shared/maps/mansion2.js; how they're
// used: server.js and public/js/gadgets.js).

// ---- Zip line: map.zip = { a, b: the cable's top and bottom ends [x, y, z]; hang: from the cable down to a rider's
// feet; stands: where you hook on [{ p, s, dir }]; endDown, endUp: where a ride down / up stops; cut: the tensioner a
// Terrorist cuts; floor: the terrace's floor }. s is metres along the cable from a (the top).
// Going down a rider speeds up (accel m/s²) to vmax m/s and slows down to `slow` over the last metres (brake m/s²);
// going up it's hand over hand at `up` m/s. You hook on within reach m of a stand; a Terrorist cuts the cable within
// cutReach m of the tensioner, holding E for cut seconds; without rounds it's mended after mend seconds.
export const ZIP = { vmax: 10, accel: 2.5, up: 2.5, slow: 3, brake: 4, reach: 1.3, cutReach: 0.9, cut: 3, mend: 60 };

export const zipLen = z => Math.hypot(z.b[0] - z.a[0], z.b[1] - z.a[1], z.b[2] - z.a[2]);
// The point s metres down the cable, and the feet of someone hanging there.
export function zipPoint(z, s) {
  const f = s / zipLen(z);
  return [0, 1, 2].map(k => z.a[k] + (z.b[k] - z.a[k]) * f);
}
export function zipFeet(z, s) {
  const p = zipPoint(z, s);
  p[1] -= z.hang;
  return p;
}
// Down the cable, one metre of it (a unit vector).
export const zipDir = z => { const L = zipLen(z); return [0, 1, 2].map(k => (z.b[k] - z.a[k]) / L); };

// Where a rider is t seconds after hooking on at s0, going down (dir 1) or up (dir -1): { s, v (m/s, + down the cable),
// done }. Worked out in fixed steps from the start, so the server and the rider's browser agree exactly.
export function zipRide(z, s0, dir, t) {
  if (dir < 0) {
    const s = Math.max(z.endUp, s0 - ZIP.up * t);
    return { s, v: -ZIP.up, done: s <= z.endUp };
  }
  const h = 1 / 120, n = Math.floor(t / h);
  let s = s0, v = 0;
  const speed = (s, v) => Math.min(ZIP.vmax, v + ZIP.accel * h, Math.sqrt(ZIP.slow ** 2 + 2 * ZIP.brake * Math.max(0, z.endDown - s)));
  for (let i = 0; i < n; i++) {
    v = speed(s, v);
    s += v * h;
    if (s >= z.endDown) return { s: z.endDown, v, done: true };
  }
  s = Math.min(z.endDown, s + speed(s, v) * (t - n * h)); // (the part of a step: smooth at any frame rate)
  return { s, v, done: false };
}

// Falling off the zip line (letting go, or the cable cut): CS 1.6's fall damage — nothing up to 14.7 m/s (about a
// 5.4 m drop), 100 at 26 m/s (17 m). The rest of the game has no fall damage.
export function fallDamage(drop, gravity = 20) {
  const v = Math.sqrt(2 * gravity * Math.max(0, drop));
  return v <= 14.7 ? 0 : Math.round(((v - 14.7) * 100) / (26 - 14.7));
}
