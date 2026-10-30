// Open sky, and where something falling from the sky lands (the mortar's shells).
// Maps converted from BSP levels close their sky with solid (invisible) ceilings, so for them these look at the
// drawn surfaces instead: a roof is any flat-ish face above you. Hand-built maps have no sky ceiling and use the
// collision boxes. Shared by the server and the browser; one per map.
// On maps with breakable roofs (cs_mansion) a broken piece no longer covers anything, and roofOver(p) names the
// roof pieces right over p when nothing else is above (a mortar there can blast its way out, see onMortar).
const CELL = 2;
const cache = new Map();

export function skyOf(map, world) {
  if (cache.get(map.id)?.world === world) return cache.get(map.id);
  const sky = map.faces ? fromFaces(map, world) : {
    open: p => !world.raycast([p[0], p[1] + 0.9, p[2]], [0, 1, 0], 60, 'solid'),
    roofOver: () => null,
    ground: (x, z, fallback) => { const h = world.raycast([x, 60, z], [0, -1, 0], 160, 'solid'); return h ? 60 - h.t : fallback; },
  };
  sky.world = world;
  cache.set(map.id, sky);
  return sky;
}

function fromFaces(map, world) {
  const min = map.bounds.min, N = Math.ceil((map.bounds.max - min) / CELL) + 1;
  const cells = new Map(), held = new Map();
  const cellOf = v => Math.max(0, Math.min(N - 1, Math.floor((v - min) / CELL)));
  const add = (grid, polys, piece) => {
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
      const poly = { xs, zs, a: nx, b: ny, c: nz, d: -(nx * xs[0] + ny * ys[0] + nz * zs[0]), up: ny > 0, piece };
      const i0 = cellOf(Math.min(...xs)), i1 = cellOf(Math.max(...xs)), j0 = cellOf(Math.min(...zs)), j1 = cellOf(Math.max(...zs));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i * N + j;
        (grid.get(k) || grid.set(k, []).get(k)).push(poly);
      }
    }
  };
  for (const polys of Object.values(map.faces)) add(cells, polys, -1);
  // what covers what, piece by piece: the level's own faces, and each breakable piece's (gone when it breaks)
  if (map.pieceFaces) {
    for (const polys of Object.values(map.staticFaces)) add(held, polys, -1);
    for (const [id, tex] of Object.entries(map.pieceFaces)) for (const polys of Object.values(tex)) add(held, polys, +id);
  }
  const covering = (x, z, grid = cells) => (grid.get(cellOf(x) * N + cellOf(z)) || []).filter(p => inside(p, x, z));
  const heightAt = (p, x, z) => -(p.a * x + p.c * z + p.d) / p.b;
  const over = (p, x = p[0], z = p[2]) => covering(x, z, map.pieceFaces ? held : cells)
    .filter(q => (q.piece < 0 || !world.gone.has(q.piece)) && heightAt(q, x, z) > p[1] + 0.9);
  return {
    open: p => !over(p).length,
    // The unbroken roof pieces over p (within r metres, for a hole the tube fits through), or null if anything
    // that can't break is above it too (a floor, a ceiling between storeys) or nothing is.
    roofOver: (p, r = 0.6) => {
      if (!map.pieceFaces) return null;
      const ids = new Set();
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        for (const q of over(p, p[0] + dx, p[2] + dz)) {
          if (q.piece < 0 || map.breakables[q.piece]?.kind !== 'roof') { if (!dx && !dz) return null; continue; }
          ids.add(q.piece);
        }
      }
      return ids.size ? [...ids] : null;
    },
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
