// Drivable cars: simple arcade physics shared by the driver's client and the server.
// A car is { id, p: [x, y, z], yaw, speed, steer, vy }. Front faces -z at yaw 0, like players.
import { raycastMap } from './physics.js';

export const CAR = {
  maxSpeed: 17, maxReverse: 6, accel: 9, brake: 18, drag: 3, handbrake: 22,
  wheelBase: 2.6, maxSteer: 0.6, step: 0.62, radius: 0.95, height: 1.45,
  offsets: [-1.3, 0, 1.3], enterRange: 3.2,
  // Seat 0 is the driver; 1 and 2 are passengers. Bullets and grenades wear the car down until it explodes.
  seats: 3, hp: 400, blastRadius: 7,
};
// [right, forward, up] offsets of each seat from the car's centre. The pickup's gunner stands in the bed.
const SEATS = { car: [[-0.42, 0.15, 0.2], [0.42, 0.15, 0.2], [0, -0.95, 0.2]], pickup: [[-0.42, 0.7, 0.2], [0, -1.0, 0.95]] };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function carForward(yaw) {
  return [-Math.sin(yaw), 0, -Math.cos(yaw)];
}

// Three square blocks along the car's length: good enough for walking into it and shooting at it.
export function carBoxes(c) {
  const f = carForward(c.yaw);
  return CAR.offsets.map(k => {
    const x = c.p[0] + f[0] * k, z = c.p[2] + f[2] * k;
    return { min: [x - 0.9, c.p[1], z - 0.9], max: [x + 0.9, c.p[1] + CAR.height, z + 0.9], mat: 'none', car: c.id };
  });
}

// Where someone sits: seat 0 is the driver (left front), 1 the front passenger, 2 the back seat.
export function seatPos(c, seat = 0) {
  const f = carForward(c.yaw);
  const right = [-f[2], 0, f[0]];
  const seats = SEATS[c.type] || SEATS.car;
  const [r, fw, up] = seats[seat] || seats[0];
  return [c.p[0] + right[0] * r + f[0] * fw, c.p[1] + up, c.p[2] + right[2] * r + f[2] * fw];
}

// Spots to get out at: driver side, passenger side, behind, in front.
export function exitSpots(c) {
  const f = carForward(c.yaw);
  const right = [-f[2], 0, f[0]];
  return [[-1.7, 0], [1.7, 0], [0, 3.2], [0, -3.2]].map(([r, b]) =>
    [c.p[0] + right[0] * r - f[0] * b, c.p[1], c.p[2] + right[2] * r - f[2] * b]);
}

function circleHitsBox(x, z, r, y0, y1, b) {
  if (b.max[1] <= y0 || b.min[1] >= y1) return false;
  const cx = clamp(x, b.min[0], b.max[0]), cz = clamp(z, b.min[2], b.max[2]);
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

function groundUnder(boxes, x, y, z) {
  const top = y + CAR.step + 0.05;
  const hit = raycastMap(boxes, [x, top, z], [0, -1, 0], 60);
  return hit ? top - hit.t : -60;
}

function blocked(boxes, x, y, z, yaw) {
  const f = carForward(yaw);
  for (const k of CAR.offsets) {
    const cx = x + f[0] * k, cz = z + f[2] * k;
    for (const b of boxes) if (circleHitsBox(cx, cz, CAR.radius, y + CAR.step, y + CAR.height, b)) return true;
  }
  return false;
}

// Advance one step. input: { throttle: -1..1, steer: -1..1 (right +), handbrake }.
// Returns the speed lost in a crash (0 if none).
export function stepCar(c, input, dt, boxes) {
  c.steer += (input.steer * CAR.maxSteer - c.steer) * Math.min(1, dt * 6);
  const s = Math.sign(c.speed);
  if (input.handbrake) c.speed -= s * Math.min(Math.abs(c.speed), CAR.handbrake * dt);
  else if (input.throttle > 0) c.speed += (c.speed < 0 ? CAR.brake : CAR.accel * input.throttle) * dt;
  else if (input.throttle < 0) c.speed -= (c.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
  else c.speed -= s * Math.min(Math.abs(c.speed), CAR.drag * dt);
  c.speed = clamp(c.speed, -CAR.maxReverse, CAR.maxSpeed);

  const yaw = c.yaw - (c.speed / CAR.wheelBase) * Math.tan(c.steer) * dt;
  const f = carForward(yaw);
  const x = c.p[0] + f[0] * c.speed * dt, z = c.p[2] + f[2] * c.speed * dt;
  let crash = 0;
  if (blocked(boxes, x, c.p[1], z, yaw)) {
    crash = Math.abs(c.speed);
    c.speed *= -0.25;
    // Still allow steering away from what we hit.
    if (!blocked(boxes, c.p[0], c.p[1], c.p[2], yaw)) c.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  } else {
    c.p[0] = x;
    c.p[2] = z;
    c.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }

  // Follow the ground: climb small steps, fall off ledges.
  let g = groundUnder(boxes, c.p[0], c.p[1], c.p[2]);
  // Never drive over a deep drop (manholes, ledges): back off instead.
  if (g < c.p[1] - 1.5 && !crash) {
    c.p[0] -= f[0] * c.speed * dt;
    c.p[2] -= f[2] * c.speed * dt;
    crash = Math.abs(c.speed);
    c.speed *= -0.25;
    g = groundUnder(boxes, c.p[0], c.p[1], c.p[2]);
  }
  if (g >= c.p[1] - 0.02) {
    c.p[1] = g;
    c.vy = 0;
  } else {
    c.vy = (c.vy || 0) - 20 * dt;
    c.p[1] = Math.max(g, c.p[1] + c.vy * dt);
    if (c.p[1] === g) c.vy = 0;
  }
  return crash;
}
