// Which surface is under someone's feet, for footstep sounds. Built once per map from the floors:
// the textured polygons of converted maps (via their painter) or the tops of a hand-made map's boxes.

// painter / box material -> footstep sound
const SURFACE = {
  sand: 'sand', dustsand: 'sand', gravel: 'sand', grass: 'grass', grassdirt: 'grass', hedge: 'grass',
  wood: 'wood', parquet: 'wood', mfloor: 'wood', deck: 'wood', crate: 'wood', ammobox: 'wood', piano: 'wood', shelf: 'wood',
  books: 'wood', cabinet: 'wood', cardboard: 'wood', door1: 'wood', d2door: 'wood',
  metal: 'metal', sewer: 'metal',
  marble: 'tile', checker: 'tile', pooltile: 'tile',
  carpet: 'carpet', fabric: 'carpet',
};

const CELL = 0.5;
const key = (cx, cz) => cx * 100003 + cz;

export class SurfaceGrid {
  constructor(map) {
    this.cells = new Map(); // key -> [y, surface, y, surface, ...]
    if (map.faces) this.addFaces(map);
    for (const b of map.boxes) {
      if (b.glass || !b.mat || b.mat === 'none') continue;
      this.addRect(b.min[0], b.min[2], b.max[0], b.max[2], b.max[1], SURFACE[b.mat] || 'concrete');
    }
  }

  add(x, z, y, s) {
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(y, s);
  }

  addRect(x1, z1, x2, z2, y, s) {
    for (let cx = Math.floor(x1 / CELL); cx * CELL < x2; cx++) {
      for (let cz = Math.floor(z1 / CELL); cz * CELL < z2; cz++) this.add((cx + 0.5) * CELL, (cz + 0.5) * CELL, y, s);
    }
  }

  // Every upward-facing polygon: mark the cells whose centre it covers, at its height there.
  addFaces(map) {
    for (const [tex, polys] of Object.entries(map.faces)) {
      const s = map.faceSounds?.[tex] || SURFACE[map.faceMats?.[tex]] || 'concrete';
      for (const f of polys) {
        const n = f.length / 5;
        if (n < 3) continue;
        const ax = f[0], ay = f[1], az = f[2];
        const ux = f[5] - ax, uy = f[6] - ay, uz = f[7] - az;
        const vx = f[10] - ax, vy = f[11] - ay, vz = f[12] - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (!len || Math.abs(ny) / len < 0.6) continue;
        let x1 = Infinity, x2 = -Infinity, z1 = Infinity, z2 = -Infinity;
        for (let i = 0; i < n; i++) {
          x1 = Math.min(x1, f[i * 5]); x2 = Math.max(x2, f[i * 5]);
          z1 = Math.min(z1, f[i * 5 + 2]); z2 = Math.max(z2, f[i * 5 + 2]);
        }
        for (let cx = Math.floor(x1 / CELL); cx * CELL <= x2; cx++) {
          for (let cz = Math.floor(z1 / CELL); cz * CELL <= z2; cz++) {
            const px = (cx + 0.5) * CELL, pz = (cz + 0.5) * CELL;
            if (!inside(f, n, px, pz)) continue;
            this.add(px, pz, ay - (nx * (px - ax) + nz * (pz - az)) / ny, s);
          }
        }
      }
    }
  }

  // The highest floor at most a little above the feet (and not far below them).
  at(x, y, z) {
    const list = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return 'concrete';
    let best = -Infinity, s = 'concrete';
    for (let i = 0; i < list.length; i += 2) {
      const fy = list[i];
      if (fy <= y + 0.3 && fy > y - 1.2 && fy > best) { best = fy; s = list[i + 1]; }
    }
    return s;
  }
}

function inside(f, n, x, z) {
  let c = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = f[i * 5], zi = f[i * 5 + 2], xj = f[j * 5], zj = f[j * 5 + 2];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
