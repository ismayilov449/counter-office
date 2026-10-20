// Movement, collision and ray tests shared by the server and the browser.
// The world is made only of axis-aligned boxes: { min: [x, y, z], max: [x, y, z] }.

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  crouchHeight: 0.9,  // as in CS (36 units), so you fit through vents
  eye: 1.62,
  crouchEye: 0.76,
  step: 0.5,
  gravity: 20,
  jump: 8,
};

export const NADE = { gravity: 15, fuse: 1.6, radius: 0.08, bounce: 0.45, friction: 0.7, dt: 1 / 60 };

export function overlapsBox(x, y, z, r, h, b) {
  return x + r > b.min[0] && x - r < b.max[0] &&
         z + r > b.min[2] && z - r < b.max[2] &&
         y + h > b.min[1] && y < b.max[1];
}

export function overlapsAny(boxes, x, y, z, r, h) {
  for (const b of boxes) if (overlapsBox(x, y, z, r, h, b)) return b;
  return null;
}

// Highest top among the boxes the body would overlap at (x, y, z).
function highestTop(boxes, x, y, z, r, h) {
  let top = -Infinity;
  for (const b of boxes) if (overlapsBox(x, y, z, r, h, b) && b.max[1] > top) top = b.max[1];
  return top;
}

// Highest floor under the body's footprint between y - depth and y (for sticking to slopes going down).
function floorBelow(boxes, x, y, z, r, depth) {
  let top = -Infinity;
  for (const b of boxes) {
    if (x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2] &&
        b.max[1] <= y + 1e-3 && b.max[1] >= y - depth && b.max[1] > top) top = b.max[1];
  }
  return top;
}

// Moves a player-like body { p, v, onGround, crouch } through the world with gravity,
// stepping up small ledges and sliding along walls. On slopes (stairs of thin boxes) it steps onto the
// highest box in the way and sticks to the ground going down, so walking up and down hills is smooth.
export function movePlayer(s, dt, boxes, gravity = PLAYER.gravity) {
  const h = s.crouch ? PLAYER.crouchHeight : PLAYER.height;
  const r = PLAYER.radius;
  const startedGrounded = s.onGround && s.v[1] <= 0;
  const maxV = Math.max(Math.abs(s.v[0]), Math.abs(s.v[1]), Math.abs(s.v[2]));
  const steps = Math.max(1, Math.ceil((maxV * dt) / 0.15));
  const sdt = dt / steps;
  let grounded = s.onGround;
  s.onGround = false;

  for (let i = 0; i < steps; i++) {
    s.v[1] -= gravity * sdt;

    for (const ax of [0, 2]) {
      const d = s.v[ax] * sdt;
      if (!d) continue;
      s.p[ax] += d;
      for (let tries = 0; tries < 3; tries++) {
        const b = overlapsAny(boxes, s.p[0], s.p[1], s.p[2], r, h);
        if (!b) break;
        // (On a ladder too, and higher: its top often ends below the floor or over a low wall at the top.)
        if (grounded || s.climbing) {
          const top = highestTop(boxes, s.p[0], s.p[1], s.p[2], r, h);
          const rise = top - s.p[1];
          if (rise > 0 && rise <= (s.climbing ? 1 : PLAYER.step) && !overlapsAny(boxes, s.p[0], top + 0.001, s.p[2], r, h)) {
            s.p[1] = top + 0.001;
            break;
          }
        }
        s.p[ax] = d > 0 ? b.min[ax] - r - 1e-4 : b.max[ax] + r + 1e-4;
        s.v[ax] = 0;
      }
    }

    s.p[1] += s.v[1] * sdt;
    const b = overlapsAny(boxes, s.p[0], s.p[1], s.p[2], r, h);
    if (b) {
      if (s.v[1] <= 0) {
        s.p[1] = b.max[1];
        s.onGround = grounded = true;
      } else {
        s.p[1] = b.min[1] - h - 1e-4;
      }
      s.v[1] = 0;
    } else if (startedGrounded && s.v[1] <= 0) {
      // Walking down a slope or off a small step: stay on the ground instead of falling.
      const floor = floorBelow(boxes, s.p[0], s.p[1], s.p[2], r, PLAYER.step + 0.05);
      if (floor > -Infinity && !overlapsAny(boxes, s.p[0], floor + 0.001, s.p[2], r, h)) {
        s.p[1] = floor;
        s.v[1] = 0;
        s.onGround = grounded = true;
      } else {
        grounded = false;
      }
    } else {
      grounded = false;
    }
  }
}

// Slab test. Returns { t, axis, sign } where the hit normal is `sign` along `axis`.
export function rayAABB(o, d, min, max, maxT) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (min[i] - o[i]) * inv;
    let t2 = (max[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { t: tmin, axis: Math.max(axis, 0), sign };
}

export function raySphere(o, d, c, r, maxT) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= maxT ? t : null;
}

// Nearest world hit: { t, n: [nx, ny, nz], box } or null.
export function raycastMap(boxes, o, d, maxT) {
  let best = null;
  for (const b of boxes) {
    const hit = rayAABB(o, d, b.min, b.max, best ? best.t : maxT);
    if (hit && (!best || hit.t < best.t)) best = { t: hit.t, axis: hit.axis, sign: hit.sign, box: b };
  }
  if (!best) return null;
  const n = [0, 0, 0];
  n[best.axis] = best.sign;
  return { t: best.t, n, box: best.box };
}

// Hitboxes for a player standing at feet position p. Crouching shortens the legs and hunches the body.
// head > 1 makes the head bigger (party mode "big heads").
export function hitboxes(p, crouch, head = 1) {
  const leg = crouch ? 0.2 : 0.85, u = crouch ? 0.75 : 1;
  const [x, y, z] = p;
  return [
    { part: 'head', c: [x, y + leg + (0.77 + 0.15 * (head - 1)) * u, z], r: 0.19 * head },
    { part: 'chest', min: [x - 0.3, y + leg + 0.3 * u, z - 0.3], max: [x + 0.3, y + leg + 0.64 * u, z + 0.3] },
    { part: 'stomach', min: [x - 0.28, y + leg, z - 0.28], max: [x + 0.28, y + leg + 0.3 * u, z + 0.28] },
    { part: 'legs', min: [x - 0.24, y, z - 0.24], max: [x + 0.24, y + leg, z + 0.24] },
  ];
}

// Ray against a player's hitboxes; returns { t, part } of the nearest hit or null.
export function rayPlayer(o, d, p, crouch, maxT, head = 1) {
  let best = null;
  for (const hb of hitboxes(p, crouch, head)) {
    const t = hb.r ? raySphere(o, d, hb.c, hb.r, maxT) : rayAABB(o, d, hb.min, hb.max, maxT)?.t;
    if (t != null && t <= maxT && (!best || t < best.t)) best = { t, part: hb.part };
  }
  return best;
}

function pointInAny(boxes, p, r) {
  for (const b of boxes) {
    if (p[0] > b.min[0] - r && p[0] < b.max[0] + r &&
        p[1] > b.min[1] - r && p[1] < b.max[1] + r &&
        p[2] > b.min[2] - r && p[2] < b.max[2] + r) return b;
  }
  return null;
}

// Deterministic grenade flight. Returns the final position; pushes every step into `path` if given.
// `boxes` is a list of boxes or a query { pointHit(p, r) } (see CollisionWorld.nade).
// impact: stop at the first floor it lands on (a Molotov breaks there).
export function simulateNade(boxes, o, v, duration, path, impact = false) {
  const p = o.slice(), vel = v.slice();
  const hit = boxes.pointHit ? q => boxes.pointHit(q, NADE.radius) : q => pointInAny(boxes, q, NADE.radius);
  const n = Math.round(duration / NADE.dt);
  for (let i = 0; i < n; i++) {
    vel[1] -= NADE.gravity * NADE.dt;
    for (let ax = 0; ax < 3; ax++) {
      const d = vel[ax] * NADE.dt;
      p[ax] += d;
      if (hit(p)) {
        p[ax] -= d;
        if (impact && ax === 1 && vel[1] < 0) { if (path) path.push(p.slice()); return p; }
        vel[ax] *= -NADE.bounce;
        if (ax === 1) { vel[0] *= NADE.friction; vel[2] *= NADE.friction; }
      }
    }
    if (path) path.push(p.slice());
  }
  return p;
}

// Ladder the player is touching, if any.
export function ladderAt(ladders, p, h) {
  for (const l of ladders || []) {
    if (p[0] + PLAYER.radius > l.min[0] && p[0] - PLAYER.radius < l.max[0] && p[2] + PLAYER.radius > l.min[2] &&
        p[2] - PLAYER.radius < l.max[2] && p[1] < l.max[1] && p[1] + h > l.min[1]) return l;
  }
  return null;
}

// Horizontal speed that pulls a climber in against the ladder (its wall side), so they fit up through a hatch.
export function ladderPull(l, p) {
  const k = l.n[0] ? 0 : 2, n = l.n[0] || l.n[1];
  const want = (n > 0 ? l.min[k] : l.max[k]) + n * (PLAYER.radius + 0.15);
  const v = Math.max(-1.5, Math.min(1.5, (want - p[k]) * 6));
  return k ? [0, v] : [v, 0];
}

// At the top of a ladder that ends beside a ledge rather than in front of one: which way to shuffle off
// (a horizontal speed), or null when the way ahead is open.
export function ladderExit(l, p, boxes) {
  const k = l.n[0] ? 0 : 2, j = 2 - k, n = l.n[0] || l.n[1], h = PLAYER.crouchHeight;
  const ahead = p.slice(); ahead[k] -= n * 0.4;
  if (!overlapsAny(boxes, ahead[0], p[1] + 1.01, ahead[2], PLAYER.radius, h)) return null; // (or a step over a low wall)
  for (const d of [0.6, 1]) {
    for (const s of [1, -1]) {
      const q = p.slice(); q[j] += s * d;
      if (overlapsAny(boxes, q[0], p[1] + 0.05, q[2], PLAYER.radius, h)) continue;
      if (floorBelow(boxes, q[0], p[1], q[2], PLAYER.radius, 1.5) > -Infinity) return j ? [0, s * 2.5] : [s * 2.5, 0];
    }
  }
  return null;
}

export function inWater(water, p) {
  for (const w of water || []) {
    if (p[0] > w.min[0] && p[0] < w.max[0] && p[2] > w.min[2] && p[2] < w.max[2] && p[1] > w.min[1] && p[1] < w.max[1]) return w;
  }
  return null;
}
