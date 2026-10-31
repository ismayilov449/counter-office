// Floodgate (see shared/flood.js): the valve in the storm drain's street leg, a few steps from the ladder down from
// the street grate. A supply pipe comes down through the drain's ceiling into an iron valve body on the north wall,
// and out of it a pipe runs west to an outlet pointing down, where the water gushes out when the valve is open.
// Called once from remodel() in mansion2.js with its helpers. The wheel itself is drawn (and turned) by
// public/js/flood.js. Nothing here is solid: the drain is only 1.2 m wide.
import { FLOOD } from '../flood.js';

export function floodWorks({ brush, decor }) {
  const [vx, vy] = FLOOD.valve.p, wall = -2.6, [ox, oy, oz] = FLOOD.outlet;
  // the valve body (its back against the wall: no face there) and the stem out to the wheel
  brush(vx - 0.18, vy - 0.22, wall, vx + 0.18, vy + 0.22, wall + 0.28, 'x_metal', ['-z'], false);
  brush(vx - 0.04, vy - 0.04, wall + 0.28, vx + 0.04, vy + 0.04, FLOOD.valve.p[2], 'x_metal', ['-z', '+z'], false);
  // the supply pipe down from the ceiling, and the pipe west to the outlet (bending down at its end)
  decor.push({ type: 'pipe', from: [vx, -3.0, oz], to: [vx, vy + 0.22, oz] });
  decor.push({ type: 'pipe', from: [vx - 0.18, oy + 0.25, oz], to: [ox - 0.1, oy + 0.25, oz] });
  decor.push({ type: 'pipe', from: [ox, oy + 0.36, oz], to: [ox, oy, oz] });
  // a flange round the outlet's mouth
  brush(ox - 0.15, oy - 0.06, wall, ox + 0.15, oy, oz + 0.15, 'x_metal', ['-z'], false);
}
