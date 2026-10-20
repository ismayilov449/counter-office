// Helpers for describing a map as axis-aligned boxes (collision + rendering) plus decor (render only).
export function createBuilder() {
  const boxes = [];
  const decor = [];

  // A solid box from (x1, z1) to (x2, z2), `h` tall, starting at height y0.
  function box(x1, z1, x2, z2, h, mat = 'block', y0 = 0, extra = {}) {
    const b = {
      min: [Math.min(x1, x2), y0, Math.min(z1, z2)],
      max: [Math.max(x1, x2), y0 + h, Math.max(z1, z2)],
      mat,
      ...extra,
    };
    boxes.push(b);
    return b;
  }

  // Ground slab whose top is at y = 0 (or `top`).
  const floor = (x1, z1, x2, z2, mat, top = 0) => box(x1, z1, x2, z2, 1, mat, top - 1, { floor: true });

  // Invisible collision volume (the visible part comes from decor).
  const solid = (x1, z1, x2, z2, h, y0 = 0) => box(x1, z1, x2, z2, h, 'none', y0, { hidden: true });

  // Wall along X or Z with openings [{ from, to, height, bottom = 0, glass, group }].
  // A door starts at the floor; a window has a sill (`bottom`) and gets a breakable glass pane.
  let glassId = 0;
  function wall(axis, at, from, to, thick, h, mat, openings = []) {
    const t = thick / 2;
    const seg = (a, b, y0, y1) => {
      if (b - a <= 0.001 || y1 - y0 <= 0.001) return;
      if (axis === 'x') box(a, at - t, b, at + t, y1 - y0, mat, y0);
      else box(at - t, a, at + t, b, y1 - y0, mat, y0);
    };
    const cuts = [...new Set([from, to, ...openings.flatMap(o => [o.from, o.to])])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1];
      const holes = openings.filter(o => o.from <= a && o.to >= b)
        .map(o => [o.bottom || 0, Math.min(h, o.height)]).sort((p, q) => p[0] - q[0]);
      let y = 0;
      for (const [y0, y1] of holes) { seg(a, b, y, y0); y = Math.max(y, y1); }
      seg(a, b, y, h);
    }
    for (const o of openings) {
      if (!o.glass) continue;
      const g = 0.03, extra = { glass: true, id: glassId++, group: o.group || null };
      if (axis === 'x') box(o.from, at - g, o.to, at + g, o.height - o.bottom, 'glass', o.bottom, extra);
      else box(at - g, o.from, at + g, o.to, o.height - o.bottom, 'glass', o.bottom, extra);
    }
  }

  const add = d => decor.push(d);

  function tree(x, z, kind = 'palm', scale = 1) {
    solid(x - 0.22 * scale, z - 0.22 * scale, x + 0.22 * scale, z + 0.22 * scale, 3 * scale);
    add({ type: 'tree', kind, p: [x, 0, z], s: scale });
  }

  function car(x, z, rotY, color) {
    const along = Math.abs(Math.sin(rotY)) > 0.5;
    const hw = along ? 2.2 : 0.95, hd = along ? 0.95 : 2.2;
    solid(x - hw, z - hd, x + hw, z + hd, 1.45);
    add({ type: 'car', p: [x, 0, z], rot: rotY, color });
  }

  // Ladder against a wall face at (x, z) whose outward normal is n = [nx, nz] (axis-aligned).
  // The climbable volume sticks out 0.5 m from the face.
  const ladders = [];
  function ladder(x, z, n, y0, y1, width = 0.9) {
    const d = 0.5, hw = width / 2;
    const [x1, x2] = n[0] ? [Math.min(x, x + n[0] * d), Math.max(x, x + n[0] * d)] : [x - hw, x + hw];
    const [z1, z2] = n[1] ? [Math.min(z, z + n[1] * d), Math.max(z, z + n[1] * d)] : [z - hw, z + hw];
    ladders.push({ min: [x1, y0, z1], max: [x2, y1, z2], n });
    add({ type: 'ladder', p: [x + n[0] * 0.07, y0, z + n[1] * 0.07], h: y1 - y0, w: width, rot: Math.atan2(n[0], n[1]) });
  }

  // Ground slab with rectangular holes cut out (pool, manholes).
  function floorCut(x1, z1, x2, z2, mat, holes) {
    for (const r of cutRect(x1, z1, x2, z2, holes)) floor(r[0], r[1], r[2], r[3], mat);
  }

  // Tunnel network under the ground: corridors are rectangles [x1, z1, x2, z2]; walls are added on every
  // side except where corridors meet. Shafts { x, z, ladder: 'n'|'s'|'e'|'w' } lead up to the surface.
  const rooms = [], water = [];
  function tunnels(rects, shafts, { floorY = -6, ceilY = -2.6, wallMat = 'sewer', floorMat = 'concrete', waterY = -5.6 } = {}) {
    const T = 0.4, eps = 0.01;
    const holes = shafts.map(s => [s.x - 0.8, s.z - 0.8, s.x + 0.8, s.z + 0.8]);
    for (const r of rects) {
      const [x1, z1, x2, z2] = r;
      box(x1, z1, x2, z2, 1, floorMat, floorY - 1, { floor: true });
      for (const c of cutRect(x1, z1, x2, z2, holes)) box(c[0], c[1], c[2], c[3], -1 - ceilY, floorMat, ceilY);
      const sides = [
        { along: 'x', at: z1, a: x1, b: x2, out: -1 }, { along: 'x', at: z2, a: x1, b: x2, out: 1 },
        { along: 'z', at: x1, a: z1, b: z2, out: -1 }, { along: 'z', at: x2, a: z1, b: z2, out: 1 },
      ];
      for (const s of sides) {
        let segs = [[s.a, s.b]];
        for (const q of rects) {
          if (q === r) continue;
          const [lo, hi, ca, cb] = s.along === 'x' ? [q[1], q[3], q[0], q[2]] : [q[0], q[2], q[1], q[3]];
          const beyond = s.out < 0 ? lo < s.at - eps : hi > s.at + eps;
          if (!(lo <= s.at + eps && hi >= s.at - eps && beyond)) continue;
          const u = Math.max(s.a, ca), v = Math.min(s.b, cb);
          if (v - u < eps) continue;
          segs = segs.flatMap(([p, q2]) => [[p, Math.min(q2, u)], [Math.max(p, v), q2]]).filter(([p, q2]) => q2 - p > eps);
        }
        for (let [u, v] of segs) {
          if (Math.abs(u - s.a) < eps) u -= T;
          if (Math.abs(v - s.b) < eps) v += T;
          const w0 = s.out < 0 ? s.at - T : s.at, w1 = s.out < 0 ? s.at : s.at + T;
          if (s.along === 'x') box(u, w0, v, w1, -1 - (floorY - 1), wallMat, floorY - 1);
          else box(w0, u, w1, v, -1 - (floorY - 1), wallMat, floorY - 1);
        }
      }
      rooms.push({ group: 'tunnel', amb: 1.0, min: [x1 - 0.05, floorY - 1, z1 - 0.05], max: [x2 + 0.05, ceilY + 0.05, z2 + 0.05] });
      water.push({ min: [x1, floorY - 1, z1], max: [x2, waterY, z2] });
      add({ type: 'water', min: [x1, z1], max: [x2, z2], y: waterY, color: '#2e4a3a', murky: true });
      // Lamps along the corridor
      const len = Math.max(x2 - x1, z2 - z1), alongX = x2 - x1 > z2 - z1;
      for (let k = 6; k < len; k += 12) {
        const p = alongX ? [x1 + k, ceilY - 0.15, (z1 + z2) / 2] : [(x1 + x2) / 2, ceilY - 0.15, z1 + k];
        add({ type: 'tunnel-lamp', p });
      }
      add({ type: 'pipe', from: alongX ? [x1, ceilY - 0.3, z1 + 0.35] : [x1 + 0.35, ceilY - 0.3, z1], to: alongX ? [x2, ceilY - 0.3, z1 + 0.35] : [x1 + 0.35, ceilY - 0.3, z2] });
    }
    for (const s of shafts) {
      const [hx1, hz1, hx2, hz2] = [s.x - 0.8, s.z - 0.8, s.x + 0.8, s.z + 0.8];
      const R = 0.25, H = 0.4;
      box(hx1 - R, hz1 - R, hx2 + R, hz1, H, 'stone');
      box(hx1 - R, hz2, hx2 + R, hz2 + R, H, 'stone');
      box(hx1 - R, hz1, hx1, hz2, H, 'stone');
      box(hx2, hz1, hx2 + R, hz2, H, 'stone');
      const L = { n: [s.x, hz1, [0, 1]], s: [s.x, hz2, [0, -1]], w: [hx1, s.z, [1, 0]], e: [hx2, s.z, [-1, 0]] }[s.ladder || 'n'];
      ladder(L[0], L[1], L[2], floorY, H + 0.15, 1.0);
    }
  }

  // Smooth ramp from height y0 to y1 over the rectangle, rising towards `dir` ('+x', '-x', '+z', '-z').
  // Collision is a staircase of 0.1 m steps (players step up them); the visible part is a sloped wedge.
  function ramp(x1, z1, x2, z2, y0, y1, dir, mat = 'sand') {
    const n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 0.1));
    const alongX = dir[1] === 'x', up = dir[0] === '+';
    const [a0, a1] = alongX ? [x1, x2] : [z1, z2];
    for (let i = 0; i < n; i++) {
      const f0 = i / n, f1 = (i + 1) / n;
      const [s0, s1] = up ? [a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1] : [a1 - (a1 - a0) * f1, a1 - (a1 - a0) * f0];
      const top = y0 + (y1 - y0) * (f0 + f1) / 2;
      const lo = Math.min(y0, y1) - 1;
      if (alongX) box(s0, z1, s1, z2, top - lo, 'none', lo, { hidden: true });
      else box(x1, s0, x2, s1, top - lo, 'none', lo, { hidden: true });
    }
    add({ type: 'ramp', min: [x1, z1], max: [x2, z2], y0, y1, dir, mat });
  }

  return { boxes, decor, ladders, rooms, water, box, floor, floorCut, solid, wall, add, tree, car, ladder, tunnels, ramp };
}

// Rectangle minus rectangular holes, returned as non-overlapping rectangles.
export function cutRect(x1, z1, x2, z2, holes) {
  const inHole = (x, z) => holes.some(h => x > h[0] && x < h[2] && z > h[1] && z < h[3]);
  const xs = [...new Set([x1, x2, ...holes.flatMap(h => [h[0], h[2]]).filter(v => v > x1 && v < x2)])].sort((a, b) => a - b);
  const zs = [...new Set([z1, z2, ...holes.flatMap(h => [h[1], h[3]]).filter(v => v > z1 && v < z2)])].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    let start = null;
    for (let j = 0; j < zs.length - 1; j++) {
      const solid = !inHole((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
      if (solid && start === null) start = zs[j];
      if (!solid && start !== null) { out.push([xs[i], start, xs[i + 1], zs[j]]); start = null; }
    }
    if (start !== null) out.push([xs[i], start, xs[i + 1], zs[zs.length - 1]]);
  }
  return out;
}

export function rowSpawns(z, xs, yaw) {
  return xs.map(x => ({ p: [x, 0, z], yaw }));
}
