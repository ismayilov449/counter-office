// Walkability grid for bots, built once per map from its collision boxes.
// Every 0.5 m cell holds the floors a player can stand on (several on multi-storey maps). Neighbouring
// floors are linked when you can walk (step up to 0.55 m), jump (up to 1.05 m) or drop (down to 4 m) between
// them with nothing in the way. A* finds paths; they are then straightened where a direct line is clear.
// Building takes a few seconds on the big maps, so the server does it in a worker thread (lib/navworker.js):
// buildNavData() makes plain transferable data there, navFrom() adds the lookups and path finding here.
import { PLAYER, overlapsAny } from '../shared/physics.js';

const R = 0.5;            // cell size
const STEP = 0.55, JUMP = 1.05, DROP = 4;
const BODY = 0.12;        // clearance radius tested at a cell centre (paths prefer roomy cells, see `tight`)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const buildNav = (map, world) => navFrom(buildNavData(map, world));

export function buildNavData(map, world) {
  const t0 = Date.now();
  const min = map.bounds.min, size = map.bounds.max - map.bounds.min;
  const N = Math.ceil(size / R);
  // Boxes by 1 m square (each square lists every box within 0.7 m of it), so each test only looks nearby.
  const G = 1, GN = Math.ceil(size / G), pad = 0.7;
  const grid = Array.from({ length: GN * GN }, () => []);
  for (const b of [...world.solids, ...map.boxes.filter(q => q.glass)]) {
    if (b.max[1] < -40 || b.min[1] > 60) continue;
    const i0 = Math.max(0, Math.floor((b.min[0] - pad - min) / G)), i1 = Math.min(GN - 1, Math.floor((b.max[0] + pad - min) / G));
    const j0 = Math.max(0, Math.floor((b.min[2] - pad - min) / G)), j1 = Math.min(GN - 1, Math.floor((b.max[2] + pad - min) / G));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[i * GN + j].push(b);
  }
  const near = (x, z) => {
    const i = Math.floor((x - min) / G), j = Math.floor((z - min) / G);
    return i < 0 || j < 0 || i >= GN || j >= GN ? [] : grid[i * GN + j];
  };
  const cellStart = new Int32Array(N * N + 1);
  const X = [], Y = [], Z = [], low = [], tight = [];
  // Anything lower than this above the floor is stepped over, so it doesn't block a spot.
  const KNEE = 0.45;

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      cellStart[i * N + j] = X.length;
      const x = min + (i + 0.5) * R, z = min + (j + 0.5) * R;
      const boxes = near(x, z);
      const tops = [];
      for (const b of boxes) {
        if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
        const y = b.max[1];
        if (y < -40 || y > 60 || tops.some(v => Math.abs(v - y) < 0.05)) continue;
        tops.push(y);
      }
      tops.sort((a, b) => a - b);
      for (const y of tops) {
        // A floor directly on top of another one (stacked boxes) is only a step: keep the highest.
        if (overlapsAny(boxes, x, y + 0.01, z, 0.001, KNEE)) continue;
        if (overlapsAny(boxes, x, y + KNEE, z, BODY, PLAYER.crouchHeight - KNEE)) continue;
        X.push(x); Y.push(y); Z.push(z);
        low.push(overlapsAny(boxes, x, y + KNEE, z, BODY, PLAYER.height - KNEE) ? 1 : 0);
        tight.push(overlapsAny(boxes, x, y + KNEE, z, 0.5, 1.0) ? 1 : 0);
      }
    }
  }
  cellStart[N * N] = X.length;
  const count = X.length;

  // Links: for each node and direction, the neighbour floor it reaches (or -1), and how (0 walk, 1 jump, 2 drop).
  const link = new Int32Array(count * 8).fill(-1);
  const how = new Uint8Array(count * 8);
  const cellOf = (x, z) => [Math.floor((x - min) / R), Math.floor((z - min) / R)];
  for (let n = 0; n < count; n++) {
    const [i, j] = cellOf(X[n], Z[n]);
    for (let k = 0; k < 8; k++) {
      const [di, dj] = DIRS[k];
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      let best = -1, bestDy = Infinity;
      for (let m = cellStart[ni * N + nj]; m < cellStart[ni * N + nj + 1]; m++) {
        const dy = Y[m] - Y[n];
        if (dy > JUMP || dy < -DROP) continue;
        if (Math.abs(dy) < Math.abs(bestDy)) { best = m; bestDy = dy; }
      }
      if (best < 0) continue;
      // Diagonals only where both straight neighbours are open too (no cutting corners).
      if (k >= 4 && (!hasFloor(i + di, j, Y[n]) || !hasFloor(i, j + dj, Y[n]))) continue;
      // Nothing between the two centres (thin walls fall between cells).
      const mx = (X[n] + X[best]) / 2, mz = (Z[n] + Z[best]) / 2, my = Math.max(Y[n], Y[best]);
      const boxes = near(mx, mz);
      if (overlapsAny(boxes, mx, my + KNEE, mz, 0.1, PLAYER.crouchHeight - KNEE)) continue;
      // Jumping up needs headroom above the takeoff spot (bots duck while jumping, like a crouch-jump).
      if (bestDy > STEP && overlapsAny(near(X[n], Z[n]), X[n], Y[n] + KNEE, Z[n], 0.15, PLAYER.crouchHeight + bestDy - KNEE)) continue;
      // Dropping down needs a clear fall (not through the floor under a thin wall upstairs, onto the room below).
      if (bestDy < -STEP && overlapsAny(near(X[best], Z[best]), X[best], Y[best] + KNEE, Z[best], 0.1, -bestDy)) continue;
      link[n * 8 + k] = best;
      how[n * 8 + k] = bestDy > STEP ? 1 : bestDy < -STEP ? 2 : 0;
    }
  }
  function hasFloor(i, j, y) {
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    for (let m = cellStart[i * N + j]; m < cellStart[i * N + j + 1]; m++) if (Math.abs(Y[m] - y) <= JUMP) return true;
    return false;
  }

  // Ladders: a two-way link between the floor at the foot of the ladder and the floor where it ends.
  const extra = new Map(); // node -> [{ to, ladder }]
  const nearestFloor = (x, z, y, maxDy, maxD, ok = () => true) => {
    const [ci, cj] = cellOf(x, z), r = Math.ceil(maxD / R);
    let best = -1, bd = Infinity;
    for (let i = ci - r; i <= ci + r; i++) {
      for (let j = cj - r; j <= cj + r; j++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        for (let m = cellStart[i * N + j]; m < cellStart[i * N + j + 1]; m++) {
          const d = Math.hypot(X[m] - x, Z[m] - z);
          if (d > maxD || Math.abs(Y[m] - y) > maxDy || !ok(m)) continue;
          if (d + Math.abs(Y[m] - y) < bd) { bd = d + Math.abs(Y[m] - y); best = m; }
        }
      }
    }
    return best;
  };
  for (const l of map.ladders || []) {
    const cx = (l.min[0] + l.max[0]) / 2, cz = (l.min[2] + l.max[2]) / 2;
    const [nx, nz] = l.n;
    const bottom = nearestFloor(cx + nx * 0.5, cz + nz * 0.5, l.min[1], 0.9, 1.3);
    // The top: past the ladder's face (into where the wall was), at about the height it ends.
    const top = nearestFloor(cx - nx * 0.6, cz - nz * 0.6, l.max[1] - 0.4, 1.0, 1.4, m => (X[m] - cx) * -nx + (Z[m] - cz) * -nz > 0.05);
    if (bottom < 0 || top < 0 || Y[top] - Y[bottom] < 1) continue;
    const add = (a, b) => (extra.get(a) || extra.set(a, []).get(a)).push({ to: b, ladder: l });
    add(bottom, top);
    add(top, bottom);
  }

  // Areas you can get from any spot to any other and back (strongly connected components, Kosaraju): random goals
  // are picked in the bot's own area, so it never heads for a roof it could only drop down from.
  const out = i => { const r = []; for (let k = 0; k < 8; k++) if (link[i * 8 + k] >= 0) r.push(link[i * 8 + k]); for (const e of extra.get(i) || []) r.push(e.to); return r; };
  const order = [], done = new Uint8Array(count);
  for (let s0 = 0; s0 < count; s0++) {
    if (done[s0]) continue;
    const stack = [[s0, out(s0), 0]];
    done[s0] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top[2] < top[1].length) {
        const b = top[1][top[2]++];
        if (!done[b]) { done[b] = 1; stack.push([b, out(b), 0]); }
      } else { order.push(top[0]); stack.pop(); }
    }
  }
  const revStart = new Int32Array(count + 1), revCount = new Int32Array(count);
  for (let a = 0; a < count; a++) for (const b of out(a)) revCount[b]++;
  for (let a = 0; a < count; a++) revStart[a + 1] = revStart[a] + revCount[a];
  const rev = new Int32Array(revStart[count]), fill = revStart.slice(0, count);
  for (let a = 0; a < count; a++) for (const b of out(a)) rev[fill[b]++] = a;
  const comp = new Int32Array(count).fill(-1), sizes = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const s0 = order[i];
    if (comp[s0] >= 0) continue;
    const c = sizes.length;
    let n = 0;
    const stack = [s0];
    comp[s0] = c;
    while (stack.length) {
      const a = stack.pop();
      n++;
      for (let k = revStart[a]; k < revStart[a + 1]; k++) if (comp[rev[k]] < 0) { comp[rev[k]] = c; stack.push(rev[k]); }
    }
    sizes.push(n);
  }

  // The playable area: the one around the spawns (the biggest can be roofs you only ever drop down from).
  const spawnNode = sp => {
    const i = Math.floor((sp[0] - min) / R), j = Math.floor((sp[2] - min) / R);
    let best = -1;
    for (let m = cellStart[i * N + j]; m < cellStart[i * N + j + 1]; m++) if (best < 0 || Math.abs(Y[m] - sp[1]) < Math.abs(Y[best] - sp[1])) best = m;
    return best;
  };
  const votes = new Map();
  for (const sp of [...map.spawns.T, ...map.spawns.CT]) { const n = spawnNode(sp.p); if (n >= 0) votes.set(comp[n], (votes.get(comp[n]) || 0) + 1); }
  const main = votes.size ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] : sizes.indexOf(Math.max(...sizes));

  return {
    main, map: map.id, N, min, count, X: Float32Array.from(X), Y: Float32Array.from(Y), Z: Float32Array.from(Z), low: Uint8Array.from(low),
    tight: Uint8Array.from(tight), link, how, extra, comp, sizes, cellStart, ms: Date.now() - t0,
  };
}

// The buffers worth transferring (instead of copying) out of a worker.
export const navBuffers = d => [d.X, d.Y, d.Z, d.low, d.tight, d.link, d.how, d.comp, d.cellStart].map(a => a.buffer);

export function navFrom(data) {
  const nav = { ...data };
  const { N, min, count, X, Y, Z, low, comp, sizes, cellStart } = nav;
  const cellOf = (x, z) => [Math.floor((x - min) / R), Math.floor((z - min) / R)];

  // The floor node under (or nearest to) a position.
  nav.nodeAt = (p, reach = 3) => {
    const [ci, cj] = cellOf(p[0], p[2]);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= reach && best < 0; r++) {
      for (let i = ci - r; i <= ci + r; i++) {
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= N || j >= N) continue;
          for (let m = cellStart[i * N + j]; m < cellStart[i * N + j + 1]; m++) {
            const dy = p[1] - Y[m];
            if (dy < -0.7 || dy > 3) continue;
            const d = Math.hypot(X[m] - p[0], Z[m] - p[2]) + Math.abs(dy) * 0.5;
            if (d < bd) { bd = d; best = m; }
          }
        }
      }
    }
    return best;
  };

  nav.pos = n => [X[n], Y[n], Z[n]];

  // A random floor in the same area as `from` (a node), optionally filtered.
  // (With a filter, the matching floors are found once and remembered.)
  const matches = new Map();
  const main = nav.main;
  const areaOf = from => (from >= 0 && sizes[comp[from]] >= 400 ? comp[from] : main);
  nav.random = (from, filter = null, key = null) => {
    const c = areaOf(from);
    if (!filter) {
      for (let i = 0; i < 400; i++) {
        const n = Math.floor(Math.random() * count);
        if (comp[n] === c && !low[n]) return n;
      }
      return -1;
    }
    let list = key ? matches.get(key) : null;
    if (!list) {
      list = [];
      for (let n = 0; n < count; n++) if (!low[n] && filter(n)) list.push(n);
      if (key) matches.set(key, list);
    }
    const same = list.filter(n => comp[n] === c);
    const pool = same.length ? same : list;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1;
  };

  // standing: avoid spots you have to crouch through and ladders (a bot leading a hostage: it can do neither).
  // A random floor within r of pos (and at most maxDy above or below it), in the same area as `from`.
  nav.randomNear = (from, pos, r, maxDy = 3) => {
    const c = areaOf(from);
    const [ci, cj] = cellOf(pos[0], pos[2]), cr = Math.ceil(r / R);
    for (let tries = 0; tries < 60; tries++) {
      const i = ci + Math.round((Math.random() * 2 - 1) * cr), j = cj + Math.round((Math.random() * 2 - 1) * cr);
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      for (let m = cellStart[i * N + j]; m < cellStart[i * N + j + 1]; m++) {
        if (!low[m] && Math.abs(Y[m] - pos[1]) <= maxDy && comp[m] === c && Math.hypot(X[m] - pos[0], Z[m] - pos[2]) <= r) return m;
      }
    }
    return -1;
  };

  nav.path = (from, to, standing = false, maxExpand = 30000) => astar(nav, from, to, maxExpand, standing);
  return nav;
}

// ---- A* over typed arrays (scratch space kept on the nav, reset by a generation stamp instead of clearing)
function astar(nav, s, g, maxExpand, standing) {
  if (s < 0 || g < 0) return null;
  if (s === g) return [s];
  const { X, Y, Z, link, how, tight, low, extra, count } = nav;
  if (!nav.scratch) nav.scratch = { gs: new Float32Array(count), from: new Int32Array(count), seen: new Uint32Array(count), shut: new Uint32Array(count), gen: 0, heap: new Heap() };
  const S = nav.scratch;
  const gen = ++S.gen;
  const { gs, from, seen, shut, heap } = S;
  heap.clear();
  const gx = X[g], gy = Y[g], gz = Z[g];
  // A slightly greedy heuristic (x1.2): paths a touch less than perfect, found several times faster.
  const h = n => Math.hypot(X[n] - gx, (Y[n] - gy) * 1.5, Z[n] - gz) * 2.2;
  seen[s] = gen; gs[s] = 0; from[s] = -1;
  heap.push(h(s), s);
  let expanded = 0;
  const relax = (a, b, cost) => {
    const ng = gs[a] + cost;
    if (seen[b] === gen && ng >= gs[b]) return;
    seen[b] = gen; gs[b] = ng; from[b] = a;
    heap.push(ng + h(b), b);
  };
  while (heap.size) {
    const a = heap.pop();
    if (a === g) {
      const out = [g];
      for (let c = from[g]; c >= 0; c = from[c]) out.push(c);
      return out.reverse();
    }
    if (shut[a] === gen) continue;
    shut[a] = gen;
    if (++expanded > maxExpand) return null;
    for (let k = 0; k < 8; k++) {
      const b = link[a * 8 + k];
      if (b < 0 || shut[b] === gen || (standing && low[b])) continue;
      // Hug the middle of corridors; jumps and crouch-only spots cost extra (drops a lot extra for a bot leading a
      // hostage: the stairs rather than off a gallery, when there are some).
      const hw = how[a * 8 + k];
      relax(a, b, ((k < 4 ? 1 : 1.414) * (1 + tight[b] * 0.8 + low[b] * 1.5) + (hw === 1 ? 2 : hw === 2 ? (standing ? 30 : 1) : 0)) * 0.5);
    }
    const ex = extra.get(a);
    if (ex && !standing) for (const e of ex) if (shut[e.to] !== gen) relax(a, e.to, 2 + Math.abs(Y[e.to] - Y[a]));
  }
  return null;
}

// Binary min-heap of (key, node) pairs in growable typed arrays.
class Heap {
  constructor() { this.k = new Float64Array(1024); this.v = new Int32Array(1024); this.size = 0; }
  clear() { this.size = 0; }
  push(key, val) {
    if (this.size === this.k.length) {
      const k = new Float64Array(this.size * 2), v = new Int32Array(this.size * 2);
      k.set(this.k); v.set(this.v); this.k = k; this.v = v;
    }
    let i = this.size++;
    const K = this.k, V = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = key; V[i] = val;
  }
  pop() {
    const K = this.k, V = this.v, top = V[0];
    const key = K[--this.size], val = V[this.size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      if (l >= this.size) break;
      const c = r < this.size && K[r] < K[l] ? r : l;
      if (K[c] >= key) break;
      K[i] = K[c]; V[i] = V[c]; i = c;
    }
    K[i] = key; V[i] = val;
    return top;
  }
}

// Waypoints for a node path, skipping nodes a straight walk can cut past (same floor height, clear line).
export function smoothPath(nav, nodes, world) {
  // jump: hop up to this point; ladder: climb the ladder to get to it
  const pts = nodes.map(n => ({ p: nav.pos(n), jump: false, ladder: null, n }));
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    for (let k = 0; k < 8; k++) if (nav.link[a * 8 + k] === b && nav.how[a * 8 + k] === 1) pts[i].jump = true;
    const e = (nav.extra.get(a) || []).find(x => x.to === b);
    if (e) pts[i].ladder = e.ladder;
  }
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    for (const step of [12, 6, 3]) {
      const k = Math.min(pts.length - 1, i + step);
      if (k > i + 1 && straight(nav, pts, i, k, world)) { j = k; break; }
    }
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function straight(nav, pts, i, j, world) {
  const a = pts[i].p, b = pts[j].p;
  // (Never skip a jump, a ladder or a spot you have to crouch through: the bot has to see those coming.)
  for (let k = i; k <= j; k++) if (nav.low[pts[k].n]) return false;
  for (let k = i + 1; k <= j; k++) if (pts[k].jump || pts[k].ladder || Math.abs(pts[k].p[1] - pts[k - 1].p[1]) > 0.3) return false;
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
  if (len < 0.01) return true;
  const d = [dx / len, 0, dz / len];
  // Floor all the way (no cutting across a hole the path went around)
  for (let t = 0.5; t < len; t += 0.5) {
    const n = nav.nodeAt([a[0] + d[0] * t, a[1] + 0.1, a[2] + d[2] * t], 0);
    if (n < 0 || Math.abs(nav.Y[n] - a[1]) > 0.3) return false;
  }
  const side = [-d[2] * 0.42, 0, d[0] * 0.42]; // a little wider than a player
  for (const s of [-1, 0, 1]) {
    for (const hgt of [0.35, 1.0]) {
      const o = [a[0] + side[0] * s, a[1] + hgt, a[2] + side[2] * s];
      if (world.raycast(o, d, len, 'solid')) return false;
    }
  }
  return true;
}

