// "Downed, not dead" and "Play dead" (docs/features/body.md): the numbers, and the hitboxes of a body lying on the
// floor, shared by the server and the browser.
import { rayAABB, raySphere } from './physics.js';

export const BODY = {
  bleed: 30, // seconds a downed player has before bleeding out
  revive: 5, // seconds a teammate holds E on them
  reviveHp: 30, // health after a revive
  reach: 1.6, // metres (flat) from the reviver to the downed body
  crawl: 1, // crawling speed, m/s
  downEye: 0.42, // camera height while downed
  crawlTilt: 1.4, // how far a crawling body leans forward (radians from upright)
  crawlBack: 0.75, // the crawling model's feet are this far behind where the player is
  playDead: 10, // the longest you can play dead, seconds
  rise: 1, // getting up from playing dead, seconds
  deadEye: 0.2, // camera height while playing dead (the head on the floor)
  fakeBy: 5, // seconds: the last enemy who hit you in that time is shown as having "killed" you
  outright: ['electrocuted'], // deaths with no downed state (the floodgate's shock: the water would finish you anyway)
};

// Body parts lying on the floor, in the body's own frame: x to the side, y up, z backwards (the player faces -z).
// down: crawling on the belly, head forward. dead: on the back like a corpse, feet where the player stood and the head
// behind (main.js tips a dead body over backwards: rotation.x = PI / 2). A crouched corpse is shorter.
const S = (part, x, y0, y1, z0, z1) => ({ part, min: [-x, y0, z0], max: [x, y1, z1] });
const LYING = {
  down: { head: [0, 0.3, -0.83, 0.19], boxes: [S('chest', 0.27, 0, 0.42, -0.65, -0.2), S('stomach', 0.25, 0, 0.36, -0.2, 0.15), S('legs', 0.25, 0, 0.28, 0.15, 0.95)] },
  dead: { head: [0, 0.1, 1.64, 0.19], boxes: [S('legs', 0.25, 0, 0.2, 0, 0.85), S('stomach', 0.28, 0, 0.22, 0.85, 1.15), S('chest', 0.3, 0, 0.45, 1.15, 1.5)] },
  deadLow: { head: [0, 0.1, 0.82, 0.19], boxes: [S('legs', 0.25, 0, 0.2, 0, 0.2), S('stomach', 0.28, 0, 0.22, 0.2, 0.42), S('chest', 0.3, 0, 0.45, 0.42, 0.7)] },
};

// Ray (o, unit d) against a body lying at feet position p facing yaw; returns { t, part } or null.
export function rayLying(o, d, p, yaw, kind, maxT) {
  const L = LYING[kind];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const rx = o[0] - p[0], rz = o[2] - p[2];
  const lo = [c * rx - s * rz, o[1] - p[1], s * rx + c * rz];
  const ld = [c * d[0] - s * d[2], d[1], s * d[0] + c * d[2]];
  let best = null;
  for (const b of L.boxes) {
    const h = rayAABB(lo, ld, b.min, b.max, best ? best.t : maxT);
    if (h && h.t <= maxT && (!best || h.t < best.t)) best = { t: h.t, part: b.part };
  }
  const [hx, hy, hz, r] = L.head;
  const t = raySphere(lo, ld, [hx, hy, hz], r, best ? best.t : maxT);
  if (t != null) best = { t, part: 'head' };
  return best;
}
