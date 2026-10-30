// Swinging doors shared by the server and the browser.
// A door { id, hinge: [x, y, z], axis: 'x'|'z', dir: 1|-1, len, h } is closed when its leaf runs `len` metres
// from the hinge along `axis` (towards `dir`). State 0 is closed; 1 / -1 is swung 90° so the leaf points
// along the other axis towards + / -. Doors always open away from the person using them.

const HALF = 0.05;

// A hatch { hatch: { min: [x, z], max: [x, z], y, side } } is a lid flush with the floor at y over a hole; open,
// it stands up on its hinge (the edge on `side`: '-x', '+x', '-z' or '+z').
function hatchBox(d, state) {
  const { min: [x1, z1], max: [x2, z2], y, side } = d.hatch, T = 0.08;
  if (state === 0) return { min: [x1, y - T, z1], max: [x2, y, z2], mat: 'none', door: d.id };
  const up = side[1] === 'x' ? x2 - x1 : z2 - z1;
  const box = { '-x': [x1 - T, z1, x1, z2], '+x': [x2, z1, x2 + T, z2], '-z': [x1, z1 - T, x2, z1], '+z': [x1, z2, x2, z2 + T] }[side];
  return { min: [box[0], y, box[1]], max: [box[2], y + up, box[3]], mat: 'none', door: d.id };
}

// State 9: blown off (a blast or a fire on cs_mansion) — nothing there any more.
export const GONE = 9;

export function doorBox(d, state) {
  const [hx, y0, hz] = d.hinge;
  if (state === GONE) return { min: [hx, -1000, hz], max: [hx, -1000, hz], mat: 'none', door: d.id };
  if (d.hatch) return hatchBox(d, state);
  let x1, x2, z1, z2;
  const along = state === 0 ? d.axis : d.axis === 'x' ? 'z' : 'x';
  const reach = (state === 0 ? d.dir : state) * d.len;
  if (along === 'x') { x1 = hx; x2 = hx + reach; z1 = hz - HALF; z2 = hz + HALF; }
  else { z1 = hz; z2 = hz + reach; x1 = hx - HALF; x2 = hx + HALF; }
  return {
    min: [Math.min(x1, x2), y0, Math.min(z1, z2)],
    max: [Math.max(x1, x2), y0 + d.h, Math.max(z1, z2)],
    mat: 'none', door: d.id,
  };
}

// Middle of the doorway (where the closed leaf is).
export function doorCenter(d) {
  if (d.hatch) return [(d.hatch.min[0] + d.hatch.max[0]) / 2, d.hatch.y, (d.hatch.min[1] + d.hatch.max[1]) / 2];
  const [hx, y0, hz] = d.hinge;
  const half = (d.dir * d.len) / 2;
  return d.axis === 'x' ? [hx + half, y0 + d.h / 2, hz] : [hx, y0 + d.h / 2, hz + half];
}

// Which way the door swings when opened by someone standing at p: away from them.
export function openingSide(d, p) {
  if (d.hatch) return 1;
  const k = d.axis === 'x' ? 2 : 0;
  return p[k] >= d.hinge[k] ? -1 : 1;
}

// Rotation (around y) of a leaf that points along local +x, for a door state.
export function doorAngle(d, state) {
  const dir = state === 0 ? (d.axis === 'x' ? [d.dir, 0] : [0, d.dir]) : d.axis === 'x' ? [0, state] : [state, 0];
  return Math.atan2(-dir[1], dir[0]);
}
