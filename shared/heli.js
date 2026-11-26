// The SWAT helicopter (ROADMAP 18, stage 1; both Mansion maps, map.heli: its pad on the CT street). Used by
// lib/heli.js, public/js/heli.js and shared/collision.js (its boxes, world.heli).
// The CTs' only: a pilot and four passengers (E gets in while it stands or hovers low; E gets out: from up high you
// fall). The pilot's browser flies it (W/S forward and back, A/D sideways, Space / Ctrl up and down, the mouse turns),
// like a car's driver; the server keeps its fuel (`fuel` s in the air: then the engine stops and it drops), its hull
// (`hp`: bullets on its metal wear it down, the cockpit's glass lets them through to whoever sits behind it; an RPG
// does `rpg`), and its fall when it's shot down (it spins down and explodes, killing whoever is still inside).
// Its size: everything below is in the full-size model's metres times S (the user found it too big to fly, 2026-11-26).
export const S = 0.7;
export const HELI = {
  speed: 13, side: 7, climb: 4.5, accel: 7, fall: 9.8, ceiling: 22, // (over the map's sky ceiling at 15.65: bullets fly through it, shared/collision.js b.sky)
  fuel: 90, hp: 1500, rpg: 800, crash: 9, hard: 6, hurt: 90, // (an impact over `hard` m/s costs `hurt` hp per m/s over it)
  reach: 3.0, low: 2.5, blast: 9, spin: 2.6, rotor: 4.3, // (rotor: the full-size model's)
  slide: 6, ropeMax: 4, // (stage 2: down the rope at `slide` m/s, while it moves slower than `ropeMax` m/s)
  // the pilot's: Mouse1 fires the nose PKT (the user swapped its rockets for it, 2026-11-26); G fires flares (`flares`
  // a round): for `flareTime` s rockets miss it (they fly past, their blasts don't hurt it)
  flares: 2, flareTime: 3,
};
// Seats: [right, up, forward] from its base (the skids' bottom, in the middle): the pilot (front right), a passenger,
// the two door gunners (in the open doors, each on a mounted PKT: GUNNERS), a passenger.
export const SEATS = [[0.45, 0.45, 0.75], [-0.45, 0.45, 0.75], [0.75, 0.45, -0.5], [-0.75, 0.45, -0.5], [0, 0.45, -1.3]].map(s => s.map(v => v * S));
export const GUNNERS = [2, 3];
// Where each seat's gun may point (the door gunners could shoot their own pilot, 2026-11-26): a door gun GUN_ARC rad
// either side of straight out of its door, the pilot's nose gun NOSE_ARC either side of ahead; nearly straight down is
// always fine.
export const GUN_ARC = 1.1, NOSE_ARC = 1.0;
export const gunYaw = (yaw, seat) => yaw + (seat === 0 ? 0 : SEATS[seat][0] >= 0 ? -Math.PI / 2 : Math.PI / 2);
export function aimOk(yaw, seat, d) {
  const l = Math.hypot(d[0], d[2]), f = heliForward(gunYaw(yaw, seat));
  return l < 0.25 || (d[0] * f[0] + d[2] * f[2]) / l >= Math.cos((seat === 0 ? NOSE_ARC : GUN_ARC) + 0.1);
}
// Where the nose gun fires from: under the nose.
export const nosePos = h => { const f = heliForward(h.yaw); return [h.p[0] + f[0] * 1.9 * S, h.p[1] + 0.55 * S, h.p[2] + f[2] * 1.9 * S]; };

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
  return [rotBox(h.p, h.yaw, 0, 2.0 * S, 4.4 * S, 0.45 * S, 1.35 * S), rotBox(h.p, h.yaw, 0, 2.0 * S, 4.4 * S, 1.35 * S, 2.35 * S, { hglass: 1 }), rotBox(h.p, h.yaw, -4.1 * S, 0.5 * S, 3.8 * S, 1.35 * S, 1.95 * S)];
}

// Its hull for bumping into things: three discs along the body (r 1.0) from its belly to its roof, and the tail's end.
const HULL = [[1.4, 1.0], [0, 1.0], [-1.4, 1.0], [-5.6, 0.4]].map(([k, r]) => [k * S, r * S]);
function hits(boxes, p, yaw) {
  const f = heliForward(yaw);
  for (const [k, rad] of HULL) {
    const x = p[0] + f[0] * k, z = p[2] + f[2] * k;
    for (const b of boxes) {
      if (b.max[1] <= p[1] + 0.5 * S || b.min[1] >= p[1] + 2.35 * S) continue;
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
  for (const k of [1.4 * S, 0, -1.4 * S]) {
    const x = p[0] + f[0] * k, z = p[2] + f[2] * k;
    for (const b of boxes) if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && b.max[1] <= p[1] + 0.5 * S && b.max[1] > g) g = b.max[1];
  }
  return g;
}

// What it bumps into in the air (the user kept touching things up there, 2026-11-26): the BSP map seals its sky with
// invisible boxes (over the house, and above the estate walls up to 20 m); each box reaching that high is cut down to
// the top of what's drawn inside it (nothing drawn: gone). map.heli.area keeps it over the estate instead (stepHeli).
const SEAL = 15.5, cut = new WeakMap(), drawn = new WeakMap();
function trim(map, b) {
  if (!b.hidden || b.max[1] < SEAL || !map.faces) return b;
  if (cut.has(b)) return cut.get(b);
  if (!drawn.has(map)) drawn.set(map, [...Object.values(map.faces), ...Object.values(map.staticFaces || {})].flat());
  let top = -Infinity;
  for (const f of drawn.get(map)) for (let i = 0; i < f.length; i += 5) {
    const x = f[i], y = f[i + 1], z = f[i + 2];
    if (x >= b.min[0] - 0.05 && x <= b.max[0] + 0.05 && z >= b.min[2] - 0.05 && z <= b.max[2] + 0.05 && y >= b.min[1] - 0.05 && y <= b.max[1] + 0.05) top = Math.max(top, y);
  }
  const t = top > b.min[1] + 0.05 ? { ...b, max: [b.max[0], top, b.max[2]] } : null;
  cut.set(b, t);
  return t;
}
export const airBoxes = (map, boxes) => boxes.map(b => trim(map, b)).filter(Boolean);

// One step of the pilot's flying. input: { fwd, side, up } (-1..1); engine: false when it's out of fuel (it drops).
// Returns the speed of a crash into something or onto the ground (0: none). h: { p, yaw, v, tilt, roll, landed }.
// area: [[x0, z0], [x1, z1]] it stays inside (map.heli.area; a soft edge, no crash).
export function stepHeli(h, input, dt, boxes, engine = true, area = null) {
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
  if (area) for (const [k, i] of [[0, 0], [2, 1]]) { const c = Math.max(area[0][i], Math.min(area[1][i], next[k])); if (c !== next[k]) { next[k] = c; v[k] = 0; } }
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
