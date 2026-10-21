// Open sky, and where something falling from the sky lands (the mortar's shells).
// Maps converted from BSP levels close their sky with solid (invisible) ceilings, so for them these look at the
// drawn surfaces instead: a roof is any flat-ish face above you. Hand-built maps have no sky ceiling and use the
// collision boxes. Shared by the server and the browser; one per map.
const CELL = 2;
const cache = new Map();

export function skyOf(map, world) {
  if (cache.get(map.id)?.world === world) return cache.get(map.id);
  const sky = map.faces ? fromFaces(map, world) : {
    open: p => !world.raycast([p[0], p[1] + 0.9, p[2]], [0, 1, 0], 60, 'solid'),
    ground: (x, z, fallback) => { const h = world.raycast([x, 60, z], [0, -1, 0], 160, 'solid'); return h ? 60 - h.t : fallback; },
  };
  sky.world = world;
  cache.set(map.id, sky);
  return sky;
}

function fromFaces(map, world) {
  const min = map.bounds.min, N = Math.ceil((map.bounds.max - min) / CELL) + 1;
  const cells = new Map();
  const cellOf = v => Math.max(0, Math.min(N - 1, Math.floor((v - min) / CELL)));
  for (const polys of Object.values(map.faces)) {
    for (const f of polys) {
      // vertices are [x, y, z, u, v] in a row; the normal from all the edges (Newell: points may be in a line)
      const n = f.length / 5, xs = [], ys = [], zs = [];
      for (let i = 0; i < n; i++) { xs.push(f[i * 5]); ys.push(f[i * 5 + 1]); zs.push(f[i * 5 + 2]); }
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        nx += (ys[j] - ys[i]) * (zs[j] + zs[i]);
        ny += (zs[j] - zs[i]) * (xs[j] + xs[i]);
        nz += (xs[j] - xs[i]) * (ys[j] + ys[i]);
      }
      const len = Math.hypot(nx, ny, nz);
      if (!len || Math.abs(ny / len) < 0.3) continue; // walls don't cover anything
      const poly = { xs, zs, a: nx, b: ny, c: nz, d: -(nx * xs[0] + ny * ys[0] + nz * zs[0]), up: ny > 0 };
      const i0 = cellOf(Math.min(...xs)), i1 = cellOf(Math.max(...xs)), j0 = cellOf(Math.min(...zs)), j1 = cellOf(Math.max(...zs));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i * N + j;
        (cells.get(k) || cells.set(k, []).get(k)).push(poly);
      }
    }
  }
  const covering = (x, z) => (cells.get(cellOf(x) * N + cellOf(z)) || []).filter(p => inside(p, x, z));
  const heightAt = (p, x, z) => -(p.a * x + p.c * z + p.d) / p.b;
  return {
    open: p => !covering(p[0], p[2]).some(q => heightAt(q, p[0], p[2]) > p[1] + 0.9),
    // The first solid thing below the sky there (a roof or the floor), from the collision boxes: going down, a box
    // with nothing drawn at or above its underside is the sky's ceiling, so the fall goes on below it.
    ground: (x, z, fallback) => {
      const drawn = covering(x, z).reduce((top, q) => Math.max(top, heightAt(q, x, z)), -Infinity);
      let y = 60;
      for (let i = 0; i < 6; i++) {
        const h = world.raycast([x, y, z], [0, -1, 0], y + 100, 'solid');
        if (!h) return fallback;
        if (h.box.min[1] < drawn - 0.01) return y - h.t;
        y = h.box.min[1] - 0.01;
      }
      return fallback;
    },
  };
}

// Point in polygon, seen from above.
function inside(p, x, z) {
  const { xs, zs } = p;
  let hit = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if ((zs[i] > z) !== (zs[j] > z) && x < ((xs[j] - xs[i]) * (z - zs[i])) / (zs[j] - zs[i]) + xs[i]) hit = !hit;
  }
  return hit;
}
