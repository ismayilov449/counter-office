// Floodgate (see shared/flood.js): the valve in the storm drain's street leg, a few steps from the ladder down from
// the street grate. A supply pipe comes down through the drain's ceiling into an iron valve body on the north wall,
// and out of it a pipe runs west and up to an outlet pointing down just under the ceiling, where the water gushes
// out when the valve is open. Called once from remodel() in mansion2.js with its helpers. The wheel itself is drawn
// (and turned) by public/js/flood.js. Nothing here is solid: the drain is only 1.2 m wide.
import { FLOOD } from '../flood.js';

export function floodWorks({ brush, decor }) {
  const [vx, vy] = FLOOD.valve.p, wall = -2.6, [ox, oy, oz] = FLOOD.outlet, r = 0.12, top = -3.15, up = 23.0;
  // the valve body (its back against the wall: no face there) and the stem out to the wheel
  brush(vx - 0.18, vy - 0.22, wall, vx + 0.18, vy + 0.22, wall + 0.28, 'x_metal', ['-z'], false);
  brush(vx - 0.04, vy - 0.04, wall + 0.28, vx + 0.04, vy + 0.04, FLOOD.valve.p[2], 'x_metal', ['-z', '+z'], false);
  // the supply pipe down from the ceiling; the pipe west out of the valve, up, west under the ceiling, down to the mouth
  decor.push({ type: 'pipe', from: [vx, -3.0, oz], to: [vx, vy + 0.22, oz] });
  decor.push({ type: 'pipe', from: [vx - 0.18, vy, oz], to: [up - r, vy, oz] });
  decor.push({ type: 'pipe', from: [up, vy - r, oz], to: [up, top + r, oz] });
  decor.push({ type: 'pipe', from: [up + r, top, oz], to: [ox - r, top, oz] });
  decor.push({ type: 'pipe', from: [ox, top + r, oz], to: [ox, oy + 0.06, oz] });
  // a flange round the mouth
  brush(ox - 0.15, oy, wall, ox + 0.15, oy + 0.06, oz + 0.15, 'x_metal', ['-z'], false);
}
