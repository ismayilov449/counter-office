// Swinging doors shared by the server and the browser.
// A door { id, hinge: [x, y, z], axis: 'x'|'z', dir: 1|-1, len, h } is closed when its leaf runs `len` metres
// from the hinge along `axis` (towards `dir`). State 0 is closed; 1 / -1 is swung 90° so the leaf points
// along the other axis towards + / -. Doors always open away from the person using them.

const HALF = 0.05;

export function doorBox(d, state) {
  const [hx, y0, hz] = d.hinge;
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
  const [hx, y0, hz] = d.hinge;
  const half = (d.dir * d.len) / 2;
  return d.axis === 'x' ? [hx + half, y0 + d.h / 2, hz] : [hx, y0 + d.h / 2, hz + half];
}

// Which way the door swings when opened by someone standing at p: away from them.
export function openingSide(d, p) {
  const k = d.axis === 'x' ? 2 : 0;
  return p[k] >= d.hinge[k] ? -1 : 1;
}

// Rotation (around y) of a leaf that points along local +x, for a door state.
export function doorAngle(d, state) {
  const dir = state === 0 ? (d.axis === 'x' ? [d.dir, 0] : [0, d.dir]) : d.axis === 'x' ? [0, state] : [state, 0];
  return Math.atan2(-dir[1], dir[0]);
}
