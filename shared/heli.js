// The SWAT helicopter (ROADMAP 18, stage 1; both Mansion maps, map.heli: its pad on the CT street). Used by
// lib/heli.js, public/js/heli.js and shared/collision.js (its boxes, world.heli).
// The CTs' only: a pilot and four passengers (E gets in while it stands or hovers low; E gets out: from up high you
// fall). The pilot's browser flies it (W/S forward and back, A/D sideways, Space / Ctrl up and down, the mouse turns),
// like a car's driver; the server keeps its fuel (`fuel` s in the air: then the engine stops and it drops), its hull
// (`hp`: bullets on its metal wear it down, the cockpit's glass lets them through to whoever sits behind it; an RPG
// does `rpg`), and its fall when it's shot down (it spins down and explodes, killing whoever is still inside).
export const HELI = {
  speed: 13, side: 7, climb: 4.5, accel: 7, fall: 9.8, ceiling: 12.6, // (the map's sky is at 15.65: the rotor's top stays under it)
  fuel: 90, hp: 1500, rpg: 800, crash: 9, hard: 6, hurt: 90, // (an impact over `hard` m/s costs `hurt` hp per m/s over it)
  reach: 3.6, low: 2.5, blast: 9, spin: 2.6, rotor: 4.3,
};
// Seats: [right, up, forward] from its base (the skids' bottom, in the middle): the pilot (front right), then the
// passengers.
export const SEATS = [[0.45, 0.45, 1.0], [-0.45, 0.45, 1.0], [0.5, 0.45, -0.5], [-0.5, 0.45, -0.5], [0, 0.45, -1.3]];

export const heliForward = yaw => [-Math.sin(yaw), 0, -Math.cos(yaw)];
export const heliRight = yaw => [Math.cos(yaw), 0, -Math.sin(yaw)];
export function seatPos(h, i) {
  const f = heliForward(h.yaw), r = heliRight(h.yaw), o = SEATS[i];
  return [h.p[0] + r[0] * o[0] + f[0] * o[2], h.p[1] + o[1], h.p[2] + r[2] * o[0] + f[2] * o[2]];
}

// The world-axis box round a w (across) x l (along) rectangle centred `along` m forward of p, from y0 to y1 over it.
function rotBox(p, yaw, along, w, l, y0, y1, extra) {
  const f = heliForward(yaw), r = heliRight(yaw), cx = p[0] + f[0] * along, cz = p[2] + f[2] * along;
  const hx = Math.abs(r[0]) * w / 2 + Math.abs(f[0]) * l / 2, hz = Math.abs(r[2]) * w / 2 + Math.abs(f[2]) * l / 2;
  return { min: [cx - hx, p[1] + y0, cz - hz], max: [cx + hx, p[1] + y1, cz + hz], mat: 'metal', heli: 1, ...extra };
}
// Its boxes: the body below the windows (metal), the cabin's glass over it (bullets go through: hglass), the tail boom.
export function heliBoxes(h) {
  if (!h) return [];
  return [rotBox(h.p, h.yaw, 0, 2.0, 4.4, 0.45, 1.35), rotBox(h.p, h.yaw, 0, 2.0, 4.4, 1.35, 2.35, { hglass: 1 }), rotBox(h.p, h.yaw, -4.1, 0.5, 3.8, 1.35, 1.95)];
}

// Its hull for bumping into things: three discs along the body (r 1.0) from its belly to its roof, and the tail's end.
const HULL = [[1.4, 1.0], [0, 1.0], [-1.4, 1.0], [-5.6, 0.4]];
function hits(boxes, p, yaw) {
  const f = heliForward(yaw);
  for (const [k, rad] of HULL) {
    const x = p[0] + f[0] * k, z = p[2] + f[2] * k;
    for (const b of boxes) {
      if (b.max[1] <= p[1] + 0.5 || b.min[1] >= p[1] + 2.35) continue;
      const dx = Math.max(b.min[0] - x, 0, x - b.max[0]), dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
      if (dx * dx + dz * dz < rad * rad) return true;
    }
  }
  return false;
}
// The highest floor under its skids (the body's three points) no higher than its belly.
export function heliGround(boxes, p, yaw) {
  const f = heliForward(yaw);
  let g = -50;
  for (const k of [1.4, 0, -1.4]) {
    const x = p[0] + f[0] * k, z = p[2] + f[2] * k;
    for (const b of boxes) if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && b.max[1] <= p[1] + 0.5 && b.max[1] > g) g = b.max[1];
  }
  return g;
}

// One step of the pilot's flying. input: { fwd, side, up } (-1..1); engine: false when it's out of fuel (it drops).
// Returns the speed of a crash into something or onto the ground (0: none). h: { p, yaw, v, tilt, roll, landed }.
export function stepHeli(h, input, dt, boxes, engine = true) {
  // (the mouse turned it: not into a wall, its tail swinging round; already caught in one, it may move out of it)
  // (swept in small steps: a quick turn would swing the tail's end through a thin wall)
  if (h.okYaw != null && h.yaw !== h.okYaw && !hits(boxes, h.p, h.okYaw)) {
    const d = Math.atan2(Math.sin(h.yaw - h.okYaw), Math.cos(h.yaw - h.okYaw)), n = Math.ceil(Math.abs(d) / 0.05);
    for (let i = 1; i <= n; i++) if (hits(boxes, h.p, h.okYaw + (d * i) / n)) { h.yaw = h.okYaw + (d * (i - 1)) / n; break; }
  }
  const stuck = hits(boxes, h.p, h.yaw);
  h.okYaw = h.yaw;
  const f = heliForward(h.yaw), r = heliRight(h.yaw), v = h.v;
  const ease = (cur, want) => cur + Math.max(-HELI.accel * dt, Math.min(HELI.accel * dt, want - cur));
  if (engine) {
    const want = [f[0] * input.fwd * HELI.speed + r[0] * input.side * HELI.side, input.up * HELI.climb, f[2] * input.fwd * HELI.speed + r[2] * input.side * HELI.side];
    if (h.landed && input.up <= 0) { want[0] = want[2] = 0; } // (on the ground it only lifts off)
    v[0] = ease(v[0], want[0]); v[1] = ease(v[1], want[1]); v[2] = ease(v[2], want[2]);
  } else {
    v[1] -= HELI.fall * dt;
    v[0] *= 1 - Math.min(1, dt * 0.5); v[2] *= 1 - Math.min(1, dt * 0.5);
  }
  let crash = 0;
  const next = [h.p[0] + v[0] * dt, Math.min(HELI.ceiling, h.p[1] + v[1] * dt), h.p[2] + v[2] * dt];
  if (next[1] >= HELI.ceiling) v[1] = Math.min(0, v[1]);
  if (!stuck && hits(boxes, next, h.yaw)) {
    crash = Math.hypot(v[0], v[2]);
    v[0] *= -0.2; v[2] *= -0.2;
    next[0] = h.p[0]; next[2] = h.p[2];
  }
  let rest = false; // (sitting on something its belly caught, the fountain's rim, a car)
  if (!stuck && hits(boxes, next, h.yaw)) { crash = Math.max(crash, Math.abs(v[1])); rest = v[1] < 0; next[1] = h.p[1]; v[1] = 0; }
  const g = heliGround(boxes, next, h.yaw);
  if (next[1] <= g) {
    crash = Math.max(crash, -v[1]);
    next[1] = g;
    v[1] = Math.max(0, v[1]);
  }
  h.p = next;
  h.landed = rest || h.p[1] <= g + 0.02;
  h.tilt = -((v[0] * f[0] + v[2] * f[2]) / HELI.speed) * 0.22;
  h.roll = ((v[0] * r[0] + v[2] * r[2]) / HELI.side) * 0.18;
  return crash;
}
