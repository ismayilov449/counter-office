// A real gas system (Mansion maps; see shared/gas.js for the numbers). Server side: the pipes, the gas in every room,
// how it spreads and vents, choking, and what sets it off.
//
// The rooms are the map's lighting volumes (map.rooms). Between two rooms that touch, and from each room to the outside,
// the openings are found once per map by sampling their shared face every SAMPLE metres: a short line across the face
// is open unless something crosses it. Whatever crosses it decides when it's open: a wall that never breaks (never), a
// breakable wall piece (once it's broken), a window's glass (once it's shattered) or a door (while it's open or blown
// off). So doorways, doors, windows and walls blown open all let the gas through, and nothing has to be marked by hand.
//
// Every GAS.step seconds: a holed pipe pours gas into its room; through each opening flows spread (vent, to the
// outside) × area × the difference in concentration; a little seeps away everywhere. Sparks (sparkAt) set off a room
// over GAS.ignite: a blast that grows with the concentration and the room's size hurts everyone in it (and near it,
// in sight), breaks its walls and furniture, blows its doors off and its windows out, leaves it burning for a moment,
// and sets off the rooms next to it that have enough gas, one after the other.
import { GAS, PIPE, gasRoomAt, gasPipes } from '../shared/gas.js';
import { rayAABB } from '../shared/physics.js';
import { doorBox, doorCenter, GONE } from '../shared/doors.js';
import { FIRE } from '../shared/weapons.js';

const SAMPLE = 0.25; // m between the samples of a face
const LEAK = GAS.leak * (+process.env.GAS_LEAK_X || 1); // (tests: GAS_LEAK_X=3 fills rooms three times as fast)
const CELL = 2; // the collision grid's cell (see shared/collision.js)
const graphs = new WeakMap(); // map -> { rooms, links, anchors } (made once per map)

const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// the two axes of a face across axis k
const OTHER = [[1, 2], [0, 2], [0, 1]];

// ---- the rooms and the openings between them (and to the outside)
function buildGraph(map, world) {
  const t0 = performance.now();
  const rooms = map.rooms.map((r, i) => ({ i, group: r.group, min: r.min, max: r.max, vol: (r.max[0] - r.min[0]) * (r.max[1] - r.min[1]) * (r.max[2] - r.min[2]) }));
  const doors = (map.doors || []).map((d, i) => (d.grate ? null : { i, ...doorBox(d, 0) })); // (gas goes through a grate)
  const glass = world.glass;

  // What crosses the region lo..hi (static walls, wall pieces, glass, closed doors): boxes overlapping it.
  const gather = (lo, hi) => {
    const out = new Set();
    for (let cx = Math.floor(lo[0] / CELL); cx <= Math.floor(hi[0] / CELL); cx++) {
      for (let cz = Math.floor(lo[2] / CELL); cz <= Math.floor(hi[2] / CELL); cz++) {
        for (const b of world.cells.get(cx * 65536 + cz) || []) out.add(b);
      }
    }
    const over = b => [0, 1, 2].every(k => b.min[k] < hi[k] && b.max[k] > lo[k]);
    const list = [];
    for (const b of out) if (over(b)) list.push({ min: b.min, max: b.max, kind: b.brk == null ? 'wall' : 'piece', id: b.brk });
    for (const g of glass) if (over(g)) list.push({ min: g.min, max: g.max, kind: 'glass', id: g.id });
    for (const d of doors) if (d && over(d)) list.push({ min: d.min, max: d.max, kind: 'door', id: d.i });
    return list;
  };

  // Samples of the face across axis k from `from` to `to` (along k) over the rectangle u0..u1 x v0..v1 (the other two
  // axes): the openings grouped by what crosses them. skip(u, v): a sample to leave out.
  const sampleFace = (k, from, to, u0, u1, v0, v1, skip = null) => {
    const [U, V] = OTHER[k];
    const lo = [0, 0, 0], hi = [0, 0, 0];
    lo[k] = Math.min(from, to); hi[k] = Math.max(from, to); lo[U] = u0; hi[U] = u1; lo[V] = v0; hi[V] = v1;
    const nu = Math.floor((u1 - u0) / SAMPLE), nv = Math.floor((v1 - v0) / SAMPLE);
    if (nu < 1 || nv < 1) return [];
    const du = (u1 - u0) / nu, dv = (v1 - v0) / nv;
    // the boxes by column of samples along U, so each sample only looks at its own column
    const cols = Array.from({ length: nu }, () => []);
    for (const b of gather(lo, hi)) {
      const a = Math.max(0, Math.ceil((b.min[U] - u0) / du - 0.5)), z = Math.min(nu - 1, Math.floor((b.max[U] - u0) / du - 0.5));
      for (let i = a; i <= z; i++) cols[i].push(b);
    }
    const groups = new Map();
    for (let i = 0; i < nu; i++) {
      const u = u0 + (i + 0.5) * du;
      for (let j = 0; j < nv; j++) {
        const v = v0 + (j + 0.5) * dv;
        if (skip && skip(u, v)) continue;
        let wall = false;
        const by = [];
        for (const b of cols[i]) {
          if (!(b.min[U] < u && b.max[U] > u && b.min[V] < v && b.max[V] > v)) continue;
          if (b.kind === 'wall') { wall = true; break; }
          by.push(b);
        }
        if (wall) continue;
        const key = by.map(b => b.kind[0] + b.id).sort().join(',');
        let g = groups.get(key);
        if (!g) {
          g = { area: 0, pieces: [...new Set(by.filter(b => b.kind === 'piece').map(b => b.id))], glass: [...new Set(by.filter(b => b.kind === 'glass').map(b => b.id))], doors: [...new Set(by.filter(b => b.kind === 'door').map(b => b.id))] };
          groups.set(key, g);
        }
        g.area += du * dv;
      }
    }
    return [...groups.values()];
  };
  const linkOf = (a, b, openings) => {
    const fixed = openings.filter(o => !o.pieces.length && !o.glass.length && !o.doors.length).reduce((s, o) => s + o.area, 0);
    return { a, b, fixed, gated: openings.filter(o => o.pieces.length || o.glass.length || o.doors.length), area: 0 };
  };

  // Rooms that touch (or nearly: walls between them up to 0.7 m thick, or overlapping a little): along axis k, A below B.
  const touching = (A, B, k) => {
    const gap = B.min[k] - A.max[k];
    if (gap < -0.3 || gap > 0.7) return false;
    return OTHER[k].every(o => Math.min(A.max[o], B.max[o]) - Math.max(A.min[o], B.min[o]) > 0.2);
  };
  const links = [];
  const faces = rooms.map(() => ({})); // room -> face ('0-', '0+', ...) -> rooms across it
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      for (let k = 0; k < 3; k++) {
        for (const [A, B] of [[rooms[a], rooms[b]], [rooms[b], rooms[a]]]) {
          if (!touching(A, B, k)) continue;
          const gap = B.min[k] - A.max[k], plane = (A.max[k] + B.min[k]) / 2, D = Math.max(0.45, Math.abs(gap) / 2 + 0.3);
          const from = clamp(plane - D, A.min[k] + 0.02, plane), to = clamp(plane + D, plane, B.max[k] - 0.02);
          const [U, V] = OTHER[k];
          const u0 = Math.max(A.min[U], B.min[U]), u1 = Math.min(A.max[U], B.max[U]), v0 = Math.max(A.min[V], B.min[V]), v1 = Math.min(A.max[V], B.max[V]);
          (faces[A.i][k + '+'] ||= []).push(B);
          (faces[B.i][k + '-'] ||= []).push(A);
          const openings = sampleFace(k, from, to, u0, u1, v0, v1);
          if (openings.length) links.push(linkOf(A.i, B.i, openings));
        }
      }
    }
  }
  // To the outside: every side and the top of each room, where no other room is across it.
  const inRoom = p => rooms.some(r => [0, 1, 2].every(k => p[k] > r.min[k] - 0.02 && p[k] < r.max[k] + 0.02));
  for (const A of rooms) {
    const openings = [];
    for (const [k, s] of [[0, -1], [0, 1], [2, -1], [2, 1], [1, 1]]) {
      const [U, V] = OTHER[k], at = s > 0 ? A.max[k] : A.min[k], D = 0.6;
      const across = faces[A.i][k + (s > 0 ? '+' : '-')] || [];
      const skip = (u, v) => {
        if (across.some(B => u > B.min[U] && u < B.max[U] && v > B.min[V] && v < B.max[V])) return true;
        const p = [0, 0, 0];
        p[k] = at + s * D; p[U] = u; p[V] = v;
        return inRoom(p);
      };
      const from = s > 0 ? Math.max(A.min[k] + 0.02, at - D) : at + D, to = s > 0 ? at + D : at - D;
      openings.push(...sampleFace(k, Math.min(from, to), Math.max(from, to), A.min[U], A.max[U], A.min[V], A.max[V], skip));
    }
    if (openings.length) links.push(linkOf(A.i, -1, openings));
  }
  const byRoom = rooms.map(() => []);
  for (const l of links) { byRoom[l.a].push(l); if (l.b >= 0) byRoom[l.b].push(l); }

  // The pipes, and the wall pieces they hang on (a pipe whose wall is blown out is torn open)
  const pipes = gasPipes(map).map(d => ({
    def: d, room: gasRoomAt(rooms, d.leak, 0.1),
    hits: d.hits.map(h => ({ min: h.slice(0, 3), max: h.slice(3) })),
    anchors: (map.breakables || []).filter(pc => d.hits.some(h => [0, 1, 2].every(k => pc.min[k] < h[k + 3] + 0.12 && pc.max[k] > h[k] - 0.12))).map(pc => pc.id),
  }));
  const g = { rooms, links, byRoom, pipes, ms: performance.now() - t0 };
  if (process.env.GAS_DEBUG) {
    console.log(`  [gas] ${map.id}: ${rooms.length} rooms, ${links.length} links in ${g.ms.toFixed(0)} ms`);
    for (const l of links) {
      const name = i => (i < 0 ? 'outside' : `${i}:${rooms[i].group}`);
      console.log(`    ${name(l.a)} - ${name(l.b)}: open ${l.fixed.toFixed(2)} m², ${l.gated.length} gated (${l.gated.reduce((s, o) => s + o.area, 0).toFixed(1)} m²; doors ${[...new Set(l.gated.flatMap(o => o.doors))].join(' ')}, glass ${[...new Set(l.gated.flatMap(o => o.glass))].join(' ')})`);
    }
  }
  return g;
}

export function createGas(api) {
  // api: map(), world(), game, players, now(), broadcast(msg), send(p, msg), applyDamage, hurtHostage, damageCar,
  // breakPieces, piecesNear, hurtPiece, breakGlass, blowDoor, lineOfSight, mates, inTeam, roundless()
  const st = { map: null, g: null, c: null, pipes: [], next: 0, steps: 0, pending: [], active: false, cough: new Map() };
  const world = () => api.world();

  // ---- how open each link is now
  function openArea(l) {
    const w = world();
    let a = l.fixed;
    for (const o of l.gated) {
      if (o.pieces.some(id => !w.gone.has(id))) continue;
      if (o.glass.some(id => !w.broken.has(id))) continue;
      if (o.doors.some(i => w.doorStates[i] === 0)) continue;
      a += o.area;
    }
    return a;
  }

  function reset() {
    const map = api.map();
    st.map = map;
    st.pending = [];
    st.cough.clear();
    st.active = false;
    if (!map.mansion2 || !gasPipes(map).length) { st.g = null; st.pipes = []; st.c = null; return; }
    let g = graphs.get(map);
    if (!g) { g = buildGraph(map, world()); graphs.set(map, g); }
    st.g = g;
    st.c = new Float64Array(g.rooms.length);
    st.pipes = g.pipes.map(() => ({ s: PIPE.ok, at: null, since: 0 }));
    st.next = api.now();
  }

  const anyGas = () => st.c && st.c.some(v => v > 0.002);
  const pipesBusy = () => st.pipes.some(p => p.s !== PIPE.ok);

  function setPipe(i, s, at = null, by = null) {
    const p = st.pipes[i];
    if (!p || p.s === s) return;
    p.s = s;
    p.since = api.now();
    if (at) p.at = at.map(r2);
    if (s === PIPE.leak) p.by = by?.id ?? null;
    if (s === PIPE.ok) p.at = null;
    api.broadcast({ t: 'gasLeak', i, s, p: p.at || st.g.pipes[i].def.leak });
    st.active = true;
  }

  // A pipe holed (by a bullet, a blast or its wall coming down): it hisses and pours gas into its room.
  function rupture(i, at, by) {
    if (st.pipes[i]?.s !== PIPE.ok) return;
    setPipe(i, PIPE.leak, at || st.g.pipes[i].def.leak, by);
  }

  // ---- one step of the gas: leaks, flows through the openings, a little lost everywhere
  function step(dt) {
    const { rooms, links } = st.g, c = st.c, d = new Float64Array(c.length);
    st.pipes.forEach((p, i) => { const r = st.g.pipes[i].room; if (p.s === PIPE.leak && r >= 0) d[r] += (LEAK * dt) / rooms[r].vol; });
    for (const l of links) {
      const ca = c[l.a], cb = l.b >= 0 ? c[l.b] : 0;
      if (Math.abs(ca - cb) < 1e-5) continue;
      l.area = openArea(l);
      if (l.area <= 0) continue;
      const Va = rooms[l.a].vol;
      if (l.b < 0) {
        const flow = Math.min(GAS.vent * l.area * ca * dt, 0.45 * ca * Va);
        d[l.a] -= flow / Va;
        continue;
      }
      const Vb = rooms[l.b].vol;
      const most = 0.45 * Math.abs(ca - cb) * (Va * Vb) / (Va + Vb);
      const flow = Math.sign(ca - cb) * Math.min(GAS.spread * l.area * Math.abs(ca - cb) * dt, most);
      d[l.a] -= flow / Va;
      d[l.b] += flow / Vb;
    }
    const keep = 1 - GAS.seep * dt;
    for (let i = 0; i < c.length; i++) {
      const v = (c[i] + d[i]) * keep;
      c[i] = v < 1e-4 ? 0 : Math.min(1, v);
    }
  }

  // ---- the blast of a room's gas
  function explode(i, by, kind) {
    const { rooms } = st.g, r = rooms[i], w = world(), game = api.game, t = api.now();
    const conc = st.c[i];
    st.c[i] = 0;
    const s = clamp((conc - GAS.ignite) / (GAS.rich - GAS.ignite), 0, 1), E = conc * r.vol;
    const pad = (v, k, m) => [v.min[0] - m, v.min[1] - m, v.min[2] - m, v.max[0] + m, v.max[1] + m, v.max[2] + m][k];
    const inBox = (p, m) => p[0] > r.min[0] - m && p[0] < r.max[0] + m && p[1] > r.min[1] - m && p[1] < r.max[1] + m && p[2] > r.min[2] - m && p[2] < r.max[2] + m;
    const center = [(r.min[0] + r.max[0]) / 2, Math.min((r.min[1] + r.max[1]) / 2, r.min[1] + 1.5), (r.min[2] + r.max[2]) / 2];
    api.broadcast({ t: 'gasBoom', i, p: center.map(r2), s: r2(s), e: Math.round(E), k: kind || null });
    // the pipes in it are torn apart
    st.g.pipes.forEach((gp, k) => { if (gp.room === i && st.pipes[k].s !== PIPE.wrecked) setPipe(k, PIPE.wrecked); });
    // people: everyone in the room, and near it in sight (walls protect: the people are hurt before the walls break)
    const hurtIn = 45 + 125 * s, R = 1.5 + 0.55 * Math.sqrt(E);
    const reach = chest => {
      if (inBox(chest, 0.1)) return 1;
      const near = [0, 1, 2].map(k => clamp(chest[k], r.min[k], r.max[k]));
      const dd = dist3(near, chest);
      if (dd > R) return 0;
      const from = [0, 1, 2].map(k => clamp(chest[k], Math.min(r.min[k] + 0.4, (r.min[k] + r.max[k]) / 2), Math.max(r.max[k] - 0.4, (r.min[k] + r.max[k]) / 2)));
      return api.lineOfSight(from, chest) ? 0.75 * (1 - dd / R) : 0;
    };
    for (const q of api.players.values()) {
      if (!q.alive || !api.inTeam(q)) continue;
      const chest = [q.p[0], q.p[1] + 1.1, q.p[2]], k = reach(chest);
      if (!k) continue;
      const attacker = by && by !== q && !api.mates(by, q) ? by : null;
      api.applyDamage(q, attacker, hurtIn * k, 'he', 'gas', 1, null, center);
      if (!q.bot && q.alive) {
        const dx = chest[0] - center[0], dz = chest[2] - center[2], h = Math.hypot(dx, dz) || 1, sp = (5 + 6 * s) * k;
        api.send(q, { t: 'knock', v: [(dx / h) * sp, sp * 0.35, (dz / h) * sp], aim: 0.3 * k });
      }
    }
    for (const h of game.hostages) {
      if (h.state === 'dead' || h.state === 'rescued') continue;
      const k = reach([h.p[0], h.p[1] + 1.1, h.p[2]]);
      if (k) api.hurtHostage(h, by, hurtIn * k, 'gas');
    }
    for (const car of w.cars) if (inBox([car.p[0], car.p[1] + 0.7, car.p[2]], 1)) api.damageCar(car, 300 + 700 * s, by);
    // its walls and furniture
    if (api.map().breakables) {
      const D = 90 + 270 * s, m = 0.5, out = [];
      const lo = [pad(r, 0, m), pad(r, 1, m), pad(r, 2, m)], hi = [pad(r, 3, m), pad(r, 4, m), pad(r, 5, m)];
      for (const pc of api.piecesNear(lo, hi)) {
        if (w.gone.has(pc.id) || ![0, 1, 2].every(k => pc.min[k] < hi[k] && pc.max[k] > lo[k])) continue;
        const k = pc.kind === 'prop' ? 1.4 : pc.kind === 'roof' ? 0.6 : 1;
        api.hurtPiece(pc, D * k * (0.6 + Math.random() * 0.8), out);
      }
      api.breakPieces(out, center);
    }
    // its doors are blown off, its windows out
    (api.map().doors || []).forEach((d, k) => { if (w.doorStates[k] !== GONE && inBox(doorCenter(d), 0.7)) api.blowDoor(k); });
    api.breakGlass(w.intactGlass.filter(gl => inBox([0, 1, 2].map(k => (gl.min[k] + gl.max[k]) / 2), 0.7)).map(gl => gl.id));
    // a moment of fire on its floor
    const fires = 1 + Math.round(2 * s), life = 5 + 3 * s, fr = 1.4 + 0.6 * s;
    for (let n = 0; n < fires; n++) {
      const x = r.min[0] + 0.8 + Math.random() * Math.max(0, r.max[0] - r.min[0] - 1.6), z = r.min[2] + 0.8 + Math.random() * Math.max(0, r.max[2] - r.min[2] - 1.6);
      const y = Math.min(r.max[1] - 0.2, r.min[1] + 1.5), h = w.raycast([x, y, z], [0, -1, 0], y - r.min[1] + 0.5, 'solid');
      if (!h) continue;
      const fire = { id: game.nextNadeId++, p: [r2(x), r2(y - h.t), r2(z)], owner: by?.id ?? null, until: t + life * 1000, nextTick: t + FIRE.tick * 1000, round: game.round, r: fr, w: 'gas' };
      game.fires.push(fire);
      api.broadcast({ t: 'fire', id: fire.id, p: fire.p, life, r: fr });
    }
    (game.smokes ||= []).push({ p: center, until: t + 5000 }); // (the bots can't see through the smoke)
    // the rooms next to it: enough gas goes off next, a little burns away
    for (const l of st.g.byRoom[i]) {
      const j = l.a === i ? l.b : l.a;
      if (j < 0 || openArea(l) <= 0) continue;
      if (st.c[j] >= GAS.ignite) { if (!st.pending.some(p => p.i === j)) st.pending.push({ i: j, at: t + 180 + Math.random() * 120, by }); }
      else st.c[j] *= 0.5;
    }
    st.active = true;
  }

  // ---- sparks: true when it set the gas off
  function sparkAt(pos, kind = 'spark', by = null) {
    if (!st.g || !Array.isArray(pos) || pos.length < 3) return false;
    // a blast next to a pipe tears it open
    if (kind !== 'shot' && kind !== 'impact' && kind !== 'switch' && kind !== 'fusebox' && kind !== 'fire' && kind !== 'flash' && kind !== 'motor' && kind !== 'electric') { // ('electric': the flooded fuse box shorting)
      st.g.pipes.forEach((gp, i) => { if (st.pipes[i].s === PIPE.ok && dist3(pos, gp.def.leak) < 2.5 && api.lineOfSight(pos, gp.def.leak)) rupture(i, null, by); });
    }
    if (!anyGas()) return false;
    const i = gasRoomAt(st.g.rooms, pos, 0.05);
    if (i < 0 || st.c[i] < GAS.ignite) return false;
    explode(i, by, kind);
    return true;
  }

  // ---- a shot: it may hole a pipe; its muzzle flash and where it hits are sparks
  function onShot(p, o, traces, def) {
    if (!st.g || !traces?.length) return;
    for (const tr of traces) {
      const d = [tr[0], tr[1], tr[2]], len = tr[3];
      st.g.pipes.forEach((gp, i) => {
        if (st.pipes[i].s !== PIPE.ok) return;
        let best = null;
        for (const h of gp.hits) { const hit = rayAABB(o, d, h.min, h.max, len + 0.05); if (hit && (!best || hit.t < best.t)) best = hit; }
        if (best) rupture(i, [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t], p);
      });
    }
    if (def?.melee || !anyGas()) return;
    const d0 = traces[0];
    if (sparkAt([o[0] + d0[0] * 0.5, o[1] + d0[1] * 0.5, o[2] + d0[2] * 0.5], 'shot', p)) return;
    for (const tr of traces) if (tr[5] && !tr[4] && sparkAt([o[0] + tr[0] * (tr[3] - 0.05), o[1] + tr[1] * (tr[3] - 0.05), o[2] + tr[2] * (tr[3] - 0.05)], 'impact', p)) return;
  }

  // ---- the valve: hold E by a leaking pipe's valve to shut it (onUse / updateActions)
  function use(p, t) {
    if (!st.g || p.bot || !p.alive) return false;
    const ph = api.game.phase;
    if (ph !== 'live' && ph !== 'warmup') return false;
    const chest = [p.p[0], p.p[1] + 1.0, p.p[2]];
    const i = st.g.pipes.findIndex((gp, k) => st.pipes[k].s === PIPE.leak && dist3(chest, gp.def.valve) < GAS.reach);
    if (i < 0) return false;
    p.act = { type: 'gasValve', pipe: i, start: t, pos: p.p.slice(), dur: GAS.valve * 1000 };
    return true;
  }
  function valve(p, a, t) {
    const ph = api.game.phase;
    if (!p.alive || (ph !== 'live' && ph !== 'warmup') || Math.hypot(p.p[0] - a.pos[0], p.p[2] - a.pos[2]) > 0.6 || st.pipes[a.pipe]?.s !== PIPE.leak) { p.act = null; return; }
    if (t - a.start < a.dur) return;
    p.act = null;
    setPipe(a.pipe, PIPE.shut);
    api.send(p, { t: 'msg', text: 'You closed the gas valve. The gas is still there: open the windows, or keep sparks away.' });
  }

  // ---- every tick (does its work every GAS.step seconds)
  function tick(t) {
    if (!st.g) return;
    for (let k = st.pending.length - 1; k >= 0; k--) {
      const e = st.pending[k];
      if (t < e.at) continue;
      st.pending.splice(k, 1);
      if (st.c[e.i] >= GAS.ignite) explode(e.i, e.by && api.players.get(e.by.id) === e.by ? e.by : null, 'chain');
    }
    if (t < st.next) return;
    st.next = Math.max(st.next + GAS.step * 1000, t - 1000);
    if (!st.active && !pipesBusy()) return;
    const w = world();
    // without rounds the pipes are mended a while after they broke
    if (api.roundless()) st.pipes.forEach((p, i) => { if (p.s !== PIPE.ok && t - p.since > GAS.mend * 1000) setPipe(i, PIPE.ok); });
    // a pipe whose wall came down is torn open
    st.g.pipes.forEach((gp, i) => { if (st.pipes[i].s === PIPE.ok && gp.anchors.some(id => w.gone.has(id))) rupture(i, null, null); });
    if (!st.pipes.some(p => p.s === PIPE.leak) && !anyGas()) { st.active = pipesBusy(); return; }
    step(GAS.step);
    st.steps++;
    // a fire in a room with enough gas sets it off
    for (const f of api.game.fires) {
      const i = gasRoomAt(st.g.rooms, [f.p[0], f.p[1] + 0.4, f.p[2]], 0.05);
      if (i >= 0 && st.c[i] >= GAS.ignite) explode(i, api.players.get(f.owner) || null, 'fire');
    }
    // choking in thick gas, once a second
    if (st.steps % Math.round(1 / GAS.step) === 0) {
      for (const q of api.players.values()) {
        if (!q.alive || !api.inTeam(q)) continue;
        const i = gasRoomAt(st.g.rooms, [q.p[0], q.p[1] + 1.4, q.p[2]]);
        const c = i >= 0 ? st.c[i] : 0;
        if (c < GAS.choke) continue;
        const k = (c - GAS.choke) / (1 - GAS.choke), dmg = GAS.chokeDps[0] + (GAS.chokeDps[1] - GAS.chokeDps[0]) * k;
        if ((st.cough.get(q.id) || 0) <= t) {
          st.cough.set(q.id, t + 1800 + Math.random() * 800);
          api.broadcast({ t: 'gasCough', id: q.id, p: [r2(q.p[0]), r2(q.p[1] + 1.5), r2(q.p[2])] });
        }
        api.applyDamage(q, null, dmg, 'chest', 'gas', 1);
      }
    }
  }

  // ---- the snapshot's part: pipe states and every room with gas (0..GAS.Q), only while there is any
  function snap() {
    if (!st.g || (!pipesBusy() && !anyGas())) return {};
    const r = [];
    st.c.forEach((v, i) => { const q = Math.round(v * GAS.Q); if (q > 0) r.push(i, q); });
    return { gs: { p: st.pipes.map(p => p.s), r } };
  }

  // for tests: the concentrations, the pipes, the open area of every link
  function debug() {
    if (!st.g) return null;
    return { c: [...st.c].map(v => +v.toFixed(4)), pipes: st.pipes.map(p => p.s), rooms: st.g.rooms.map(r => r.group), links: st.g.links.map(l => [l.a, l.b, +openArea(l).toFixed(2)]), ms: st.g.ms };
  }

  return { reset, tick, snap, onShot, sparkAt, use, valve, debug, rupture };
}
