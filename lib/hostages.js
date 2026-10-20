// Hostages for hostage-rescue maps: they wait until a CT presses E on them, then follow that CT
// along the path the CT walked (breadcrumbs), so they make it through doors and down stairs.
import { PLAYER, movePlayer } from '../shared/physics.js';

export const HOSTAGE_STATE = { idle: 0, follow: 1, rescued: 2, dead: 3 };
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function createHostages(map) {
  return (map.hostages || []).map((h, id) => ({
    id, p: h.p.slice(), v: [0, 0, 0], yaw: h.yaw || 0, hp: 100, state: 'idle', leader: null,
    trail: [], onGround: true, crouch: false, checkAt: 0, checkPos: h.p.slice(),
  }));
}

// Returns events: [{ type: 'lost', h, leader }]
export function updateHostages(list, players, dt, boxes, t) {
  const events = [];
  for (const h of list) {
    if (h.state === 'dead' || h.state === 'rescued') continue;
    let moving = false;
    if (h.state === 'follow') {
      const leader = players.get(h.leader);
      if (!leader || !leader.alive || leader.team !== 'CT' || leader.driving != null) {
        h.state = 'idle';
        h.leader = null;
      } else {
        const last = h.trail[h.trail.length - 1];
        if (!last || dist2(last, leader.p) > 0.6 || Math.abs(last[1] - leader.p[1]) > 0.4) h.trail.push(leader.p.slice());
        if (h.trail.length > 300) h.trail.shift();
        while (h.trail.length > 1 && dist2(h.trail[0], h.p) < 0.7) h.trail.shift();
        const toLeader = dist2(h.p, leader.p);
        const target = h.trail[0];
        if (toLeader > 2.2 && target) {
          const dx = target[0] - h.p[0], dz = target[2] - h.p[2], d = Math.hypot(dx, dz) || 1;
          const speed = toLeader > 7 ? 5.8 : 4.4;
          h.v[0] = (dx / d) * speed;
          h.v[2] = (dz / d) * speed;
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
    movePlayer(h, dt, boxes);
  }
  return events;
}
