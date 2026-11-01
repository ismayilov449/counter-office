// Floodgate (see shared/flood.js): the valve in the storm drain's street leg, a few steps from the ladder down from
// the street grate. A supply pipe comes down through the drain's ceiling into an iron valve body on the north wall,
// and out of it a pipe runs west and up to an outlet pointing down just under the ceiling, where the water gushes
// out when the valve is open. Called once from remodel() in mansion2.js with its helpers. The wheel and the pipes are
// drawn by public/js/flood.js (the wheel turns; the pipes are one mesh there: as map decor each pipe was a draw call
// of its own). Nothing here is solid: the drain is only 1.2 m wide.
import { FLOOD } from '../flood.js';

export function floodWorks({ brush }) {
  const [vx, vy] = FLOOD.valve.p, wall = -2.6, [ox, oy, oz] = FLOOD.outlet;
  // the valve body (its back against the wall: no face there) and the stem out to the wheel
  brush(vx - 0.18, vy - 0.22, wall, vx + 0.18, vy + 0.22, wall + 0.28, 'x_metal', ['-z'], false);
  brush(vx - 0.04, vy - 0.04, wall + 0.28, vx + 0.04, vy + 0.04, FLOOD.valve.p[2], 'x_metal', ['-z', '+z'], false);
  // a flange round the mouth
  brush(ox - 0.15, oy, wall, ox + 0.15, oy + 0.06, oz + 0.15, 'x_metal', ['-z'], false);
}

// The pipes, [from, to] (radius 0.12, like the map's 'pipe' decor): the supply pipe down from the ceiling into the
// valve; the pipe west out of the valve, up, west under the ceiling, down to the mouth.
export function floodPipes() {
  const [vx, vy] = FLOOD.valve.p, [ox, oy, oz] = FLOOD.outlet, r = 0.12, top = -3.15, up = 23.0;
  return [
    [[vx, -3.0, oz], [vx, vy + 0.22, oz]],
    [[vx - 0.18, vy, oz], [up - r, vy, oz]],
    [[up, vy - r, oz], [up, top + r, oz]],
    [[up + r, top, oz], [ox - r, top, oz]],
    [[ox, top + r, oz], [ox, oy + 0.06, oz]],
  ];
}
