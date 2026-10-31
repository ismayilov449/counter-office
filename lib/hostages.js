// Hostages for hostage-rescue maps: they wait until a CT presses E on them, then follow that CT
// along the path the CT walked (breadcrumbs), so they make it through doors and down stairs.
import { PLAYER, movePlayer, overlapsAny, overlapsBox } from '../shared/physics.js';

export const HOSTAGE_STATE = { idle: 0, follow: 1, rescued: 2, dead: 3 };
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// Steering, so a hostage doesn't cut corners into door frames (the path a CT walks often grazes a jamb):
// - the body at (x, y, z) against anything it can't step onto (stairs and kerbs don't count)
const blockedAt = (boxes, x, y, z) =>
  overlapsAny(boxes, x, y + PLAYER.step + 0.05, z, PLAYER.radius, PLAYER.height - PLAYER.step - 0.05);
// - a straight walk from a to b with nothing in the way (sampled every 0.25 m, the height going from a's to b's)
function clearLine(boxes, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], n = Math.ceil(Math.hypot(dx, dz) / 0.25);
  for (let i = 1; i <= n; i++) if (blockedAt(boxes, a[0] + (dx * i) / n, a[1] + (dy * i) / n, a[2] + (dz * i) / n)) return false;
  return true;
}
// - heading (ux, uz) runs into a corner the body only clips: the short side step (signed, along (-uz, ux)) that
//   clears it, the smaller of the two ways; 0 when the way is clear or only a longer detour would do.
function sideStep(boxes, p, ux, uz) {
  const qx = p[0] + ux * 0.25, qz = p[2] + uz * 0.25, nx = -uz, nz = ux, R = PLAYER.radius;
  if (!blockedAt(boxes, qx, p[1], qz)) return 0;
  let best = 0;
  for (const sign of [1, -1]) {
    let s = 0, b;
    for (let i = 0; i < 6 && s <= 0.6 && (b = blockedAt(boxes, qx + nx * sign * s, p[1], qz + nz * sign * s)); i++) {
      let need = Infinity;
      for (const [k, d] of [[0, nx * sign], [2, nz * sign]]) {
        const c = (k === 0 ? qx : qz) + d * s;
        if (d > 1e-3) need = Math.min(need, (b.max[k] + R - c) / d);
        else if (d < -1e-3) need = Math.min(need, (c - b.min[k] + R) / -d);
      }
      s += need + 0.02;
    }
    if (s <= 0.6 && !b && (!best || s < Math.abs(best))) best = sign * s;
  }
  return best;
}

export function createHostages(map) {
  return (map.hostages || []).map((h, id) => ({
    id, p: h.p.slice(), v: [0, 0, 0], yaw: h.yaw || 0, hp: 100, state: 'idle', leader: null,
    trail: [], onGround: true, crouch: false, checkAt: 0, checkPos: h.p.slice(),
  }));
}

// Returns events: [{ type: 'lost', h, leader }]
// near(p): the collision boxes around a point (CollisionWorld.move).
export function updateHostages(list, players, dt, near, t) {
  const events = [];
  for (const h of list) {
    if (h.state === 'dead' || h.state === 'rescued') continue;
    let moving = false;
    const boxes = near(h.p);
    if (h.state === 'follow') {
      const leader = players.get(h.leader);
      if (!leader || !leader.alive || leader.team !== 'CT' || leader.driving != null) {
        h.state = 'idle';
        h.leader = null;
      } else {
        const last = h.trail[h.trail.length - 1];
        if (!last || dist2(last, leader.p) > 0.6 || Math.abs(last[1] - leader.p[1]) > 0.4) h.trail.push(leader.p.slice());
        if (h.trail.length > 300) h.trail.shift();
        // A breadcrumb is done with once reached, or once near it with a straight walk on to the next one
        // (not just near it: heading for the next one from there cut corners into door jambs).
        while (h.trail.length > 1 && dist2(h.trail[0], h.p) < 0.7 && (dist2(h.trail[0], h.p) < 0.3 || clearLine(boxes, h.p, h.trail[1]))) h.trail.shift();
        const toLeader = dist2(h.p, leader.p);
        const target = h.trail[0];
        if (toLeader > 2.2 && target) {
          const dx = target[0] - h.p[0], dz = target[2] - h.p[2], d = Math.hypot(dx, dz) || 1;
          // Clipping a door frame's corner on the way: side-step around it (still facing the breadcrumb).
          const side = sideStep(boxes, h.p, dx / d, dz / d);
          const mx = side ? (dx / d) * 0.25 - (dz / d) * side : dx, mz = side ? (dz / d) * 0.25 + (dx / d) * side : dz, m = Math.hypot(mx, mz) || 1;
          const speed = toLeader > 7 ? 5.8 : 4.4;
          h.v[0] = (mx / m) * speed;
          h.v[2] = (mz / m) * speed;
          h.yaw = Math.atan2(-dx, -dz);
          moving = true;
          // A small hop when the path climbs over something low
          if (h.onGround && target[1] > h.p[1] + 0.55 && d < 1.5) { h.v[1] = PLAYER.jump; h.onGround = false; }
        }
        // Lost: stuck for 3 s while the leader is far away, or the leader is very far.
        if (t >= h.checkAt) {
          const progress = dist2(h.p, h.checkPos);
          if ((moving && progress < 0.3 && toLeader > 6) || toLeader > 30) {
            h.state = 'idle';
            h.leader = null;
            h.trail = [];
            events.push({ type: 'lost', h, leader });
          }
          h.checkAt = t + 3000;
          h.checkPos = h.p.slice();
        }
      }
    }
    if (!moving) { h.v[0] = 0; h.v[2] = 0; }
    // Standing a hair inside a thin floor board (the mansion's closet floor has 3 mm ones), a step pushed the body out
    // of the far side of the whole floor, metres away (out of the house): stand on the board, and never jump that far.
    const x0 = h.p[0], y0 = h.p[1], z0 = h.p[2];
    if (moving) for (const b of boxes) if (b.max[1] > y0 && b.max[1] < y0 + 0.05 && overlapsBox(x0, y0, z0, PLAYER.radius, PLAYER.height, b)) h.p[1] = Math.max(h.p[1], b.max[1]);
    movePlayer(h, dt, boxes);
    if (Math.hypot(h.p[0] - x0, h.p[2] - z0) > 6 * dt + 0.3) { h.p[0] = x0; h.p[1] = y0; h.p[2] = z0; h.v[0] = h.v[2] = 0; }
    // Not getting anywhere for half a second (a breadcrumb it can't get to): head for the next one.
    if (!moving) h.unstickAt = 0;
    else if (t >= (h.unstickAt || 0)) {
      if (h.unstickAt && dist2(h.p, h.unstickPos) < 0.25 && h.trail.length > 1) h.trail.shift();
      h.unstickAt = t + 500;
      h.unstickPos = h.p.slice();
    }
  }
  return events;
}
