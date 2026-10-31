// Mansion's gas pipes (see shared/gas.js, lib/gas.js and public/js/gas.js): called once from remodel() in mansion2.js.
//   - the kitchen: a yellow gas pipe up the north wall (the one the garage is behind) through a meter with a valve under
//     it, then along under the ceiling into the corner
//   - the cellar: a boiler against the east wall, its gas pipe down from the ceiling through a meter and a valve
// Each is a { type: 'gaspipe' } decor entry: `parts` for the browser to draw (world.js leaves decor types it doesn't
// know alone), `hits` (boxes a bullet holes it in), `leak` (where it hisses when shot elsewhere than a hit box's
// middle) and `valve` (where to hold E). The boiler is also a solid.
const box = (min, max) => [...min, ...max];
// a pipe segment's hit box: a little fatter than the pipe, so it isn't a pixel-hunt
const pipeHit = (a, b, r = 0.06) => box([0, 1, 2].map(k => Math.min(a[k], b[k]) - r), [0, 1, 2].map(k => Math.max(a[k], b[k]) + r));

export function addGasPipes({ decor, solids }) {
  // ---- the kitchen: on the inside of the north wall (z -14.02), east of the window to the garage
  {
    const x = -16.6, wz = -14.02, z = wz + 0.07, m1 = 1.27, m2 = 1.73, top = 3.86, r = 0.024;
    const parts = [
      { k: 'pipe', a: [x, 0.81, z], b: [x, m1, z], r },
      { k: 'pipe', a: [x, m2, z], b: [x, top, z], r },
      { k: 'pipe', a: [x, top, z], b: [-13.33, top, z], r },
      { k: 'pipe', a: [x - 0.06, 0.83, z], b: [x + 0.06, 0.83, z], r: 0.035 }, // (the collar at the floor)
      { k: 'box', min: [x - 0.17, m1, wz], max: [x + 0.17, m2, wz + 0.19] },
      { k: 'dial', p: [x, 1.55, wz + 0.193], n: [0, 0, 1] },
      { k: 'valve', p: [x, 1.06, z], open: [1, 0, 0], shut: [0, 0, 1] },
    ];
    const hits = [pipeHit(parts[0].a, parts[0].b), pipeHit(parts[1].a, parts[1].b), pipeHit(parts[2].a, parts[2].b),
      box([x - 0.18, m1 - 0.01, wz], [x + 0.18, m2 + 0.01, wz + 0.2])];
    decor.push({ type: 'gaspipe', name: 'kitchen', parts, hits, leak: [x, 1.5, wz + 0.2], valve: [x, 1.06, z] });
  }
  // ---- the cellar: a boiler against the east wall (x -13.31), between the light switch and the tunnel
  {
    const wx = -13.31, cx = -13.72, cz = 1.6, R = 0.36, y0 = -2.2, h = 1.5, px = wx - 0.07, pz = 2.15, ceil = 0.61, r = 0.024;
    const m1 = -0.45, m2 = 0.0, low = -1.25;
    solids.push([cx - R, y0, cz - R, wx, y0 + h, cz + R]);
    const parts = [
      { k: 'tank', p: [cx, y0, cz], r: R, h },
      { k: 'pipe', a: [cx, y0 + h, cz], b: [cx, ceil, cz], r: 0.07, c: 'flue' },
      { k: 'pipe', a: [px, ceil, pz], b: [px, m2, pz], r },
      { k: 'pipe', a: [px, m1, pz], b: [px, low, pz], r },
      { k: 'pipe', a: [px, low, pz], b: [px, low, cz + R - 0.02], r },
      { k: 'box', min: [wx - 0.19, m1, pz - 0.17], max: [wx, m2, pz + 0.17] },
      { k: 'dial', p: [wx - 0.193, -0.22, pz], n: [-1, 0, 0] },
      { k: 'valve', p: [px, -0.85, pz], open: [0, 0, 1], shut: [-1, 0, 0] },
    ];
    const hits = [pipeHit(parts[2].a, parts[2].b), pipeHit(parts[3].a, parts[3].b), pipeHit(parts[4].a, parts[4].b),
      box([wx - 0.2, m1 - 0.01, pz - 0.18], [wx, m2 + 0.01, pz + 0.18])];
    decor.push({ type: 'gaspipe', name: 'cellar', parts, hits, leak: [wx - 0.2, -0.22, pz], valve: [px, -0.85, pz] });
  }
}
