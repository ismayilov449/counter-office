// Carrying wounded hostages (ROADMAP 6.2): a hostage at `hurt` HP or less can't walk (it won't follow, escape or be
// led). A CT presses E on it to carry it across his shoulders: walking pace (`speed`, a share of his pistol's speed),
// pistol only, no jumping or ducking; E again puts it down, and so does going down or dying. Carried into the CT base
// it's rescued. The carried body's hitbox is a box across his shoulders (carriedBox). Snapshot: `hs` entries get a
// 9th value (1: badly hurt) and a 10th (the carrier's id, 0 when none).
export const CARRY = { hurt: 40, speed: 0.55, reach: 2.2 };

// The carried body across the shoulders of a carrier standing at p facing yaw (0: north, -z): an axis-aligned box
// round a 1.6 m long body lying along his left-right line, 1.3-1.75 m up.
export function carriedBox(p, yaw) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const ex = c * 0.8 + s * 0.2, ez = s * 0.8 + c * 0.2;
  return { min: [p[0] - ex, p[1] + 1.3, p[2] - ez], max: [p[0] + ex, p[1] + 1.75, p[2] + ez] };
}
