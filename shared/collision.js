// Collision sets that change during a round: breakable glass, moving cars and swinging doors.
//   move:   what players, cars and grenades bump into (walls, intact glass, cars, doors)
//   bullet: what stops bullets (walls, cars, doors) — bullets go through glass and break it
// The static walls sit in a grid so big maps (thousands of boxes) only test what is nearby:
// pass a position to move()/bullet() for short-range work, and use raycast() for long rays.
import { carBoxes } from './vehicles.js';
import { doorBox } from './doors.js';
import { rayAABB } from './physics.js';

const CELL = 4;
const cellKey = (cx, cz) => cx * 65536 + cz;

export class CollisionWorld {
  constructor(map) {
    this.solids = map.boxes.filter(b => !b.glass);
    this.glass = map.boxes.filter(b => b.glass);
    this.broken = new Set();
    this.intactGlass = this.glass;
    this.gone = new Set(); // broken walls and furniture: piece ids (see shared/maps/breakables.js)
    this.cars = [];
    this.doorDefs = map.doors || [];
    this.setDoors(this.doorDefs.map(() => 0));
    this.cells = new Map();
    this.stamp = 0;
    this.marks = new Map(this.solids.map(b => [b, 0]));
    for (const b of this.solids) {
      for (let cx = Math.floor(b.min[0] / CELL); cx <= Math.floor(b.max[0] / CELL); cx++) {
        for (let cz = Math.floor(b.min[2] / CELL); cz <= Math.floor(b.max[2] / CELL); cz++) {
          const k = cellKey(cx, cz);
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(b);
        }
      }
    }
  }

  setBroken(ids) {
    this.broken = new Set(ids);
    this.intactGlass = this.glass.filter(g => !this.broken.has(g.id));
  }

  // Broken chunks stop colliding.
  setGone(ids) {
    this.gone = new Set(ids);
  }

  breakGlass(id) {
    if (this.broken.has(id)) return false;
    this.broken.add(id);
    this.intactGlass = this.glass.filter(g => !this.broken.has(g.id));
    return true;
  }

  setDoors(states) {
    this.doorStates = this.doorDefs.map((_, i) => states?.[i] || 0);
    this.doorBoxes = this.doorDefs.map((d, i) => doorBox(d, this.doorStates[i]));
  }

  carBoxes(exceptId = null) {
    const out = [];
    for (const c of this.cars) if (c.id !== exceptId) out.push(...carBoxes(c));
    return out;
  }

  // Static walls overlapping the horizontal square of half-size r around p (every wall when p is null).
  near(p, r = 4) {
    if (!p) return this.gone.size ? this.solids.filter(b => b.brk == null || !this.gone.has(b.brk)) : this.solids;
    const s = ++this.stamp, out = [];
    for (let cx = Math.floor((p[0] - r) / CELL); cx <= Math.floor((p[0] + r) / CELL); cx++) {
      for (let cz = Math.floor((p[2] - r) / CELL); cz <= Math.floor((p[2] + r) / CELL); cz++) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (const b of list) if (this.marks.get(b) !== s && (b.brk == null || !this.gone.has(b.brk))) { this.marks.set(b, s); out.push(b); }
      }
    }
    return out;
  }

  move(exceptCar = null, p = null, r = 4) {
    return this.near(p, r).concat(this.intactGlass, this.doorBoxes, this.carBoxes(exceptCar));
  }

  // Grenades smash through windows (the server breaks the glass they cross), so they ignore glass.
  // A point query for simulateNade.
  nade() {
    const dyn = this.doorBoxes.concat(this.carBoxes());
    const pointHit = (p, r) => {
      const inside = b => p[0] > b.min[0] - r && p[0] < b.max[0] + r && p[1] > b.min[1] - r && p[1] < b.max[1] + r &&
        p[2] > b.min[2] - r && p[2] < b.max[2] + r;
      return this.near(p, r + 0.01).some(inside) || dyn.some(inside);
    };
    return { pointHit };
  }

  // Bullets fly through car windows: only the body below the window line stops them. A shooter's own car
  // never blocks their shots (passengers shoot out of it).
  bullet(exceptCar = null, p = null, r = 4) {
    const body = this.carBoxes(exceptCar).map(b => ({ ...b, max: [b.max[0], b.min[1] + 1.0, b.max[2]] }));
    return this.near(p, r).concat(this.doorBoxes, body);
  }

  // Nearest hit along a ray: { t, n, box } or null, walking the grid cells the ray crosses.
  // what: 'bullet' (walls, doors, car bodies), 'move' (also intact glass and whole cars) or 'solid' (walls).
  raycast(o, d, maxT, what = 'bullet', exceptCar = null) {
    let best = null;
    const test = b => {
      const h = rayAABB(o, d, b.min, b.max, best ? best.t : maxT);
      if (h && (!best || h.t < best.t)) best = { t: h.t, axis: h.axis, sign: h.sign, box: b };
    };
    if (what !== 'solid') {
      for (const b of this.doorBoxes) test(b);
      for (const b of this.carBoxes(exceptCar)) test(what === 'bullet' ? { ...b, max: [b.max[0], b.min[1] + 1.0, b.max[2]] } : b);
      if (what === 'move') for (const b of this.intactGlass) test(b);
    }
    const s = ++this.stamp;
    let cx = Math.floor(o[0] / CELL), cz = Math.floor(o[2] / CELL);
    const sx = Math.sign(d[0]), sz = Math.sign(d[2]);
    const tdx = sx ? CELL / Math.abs(d[0]) : Infinity, tdz = sz ? CELL / Math.abs(d[2]) : Infinity;
    let tx = sx ? (sx > 0 ? (cx + 1) * CELL - o[0] : o[0] - cx * CELL) / Math.abs(d[0]) : Infinity;
    let tz = sz ? (sz > 0 ? (cz + 1) * CELL - o[2] : o[2] - cz * CELL) / Math.abs(d[2]) : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      const list = this.cells.get(cellKey(cx, cz));
      if (list) for (const b of list) if (this.marks.get(b) !== s && (b.brk == null || !this.gone.has(b.brk))) { this.marks.set(b, s); test(b); }
      const next = Math.min(tx, tz);
      if (next > maxT || (best && best.t <= next)) break;
      if (tx < tz) { cx += sx; tx += tdx; } else { cz += sz; tz += tdz; }
    }
    if (!best) return null;
    const n = [0, 0, 0];
    n[best.axis] = best.sign;
    return { t: best.t, n, box: best.box };
  }
}
