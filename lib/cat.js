// The mansion's cat (cs_mansion, cs_mansion_night): one cat, moved by the server and sent in every snapshot (see
// shared/cat.js). It wanders between its favourite spots (the sofa, its basket, the bowl, the stairs, a sunny window
// sill, the terrace, the garden...), sits, loafs, sleeps and washes there; follows a player who stands still next to
// it; runs from gunfire and blasts and hides (under something if it finds a spot); now and then goes to a hidden player
// (ghillie camo on, crouched in a dark room, or playing dead) and meows at them; purrs when someone is right next to
// it. It sets off mines it walks onto. It never dies: a blast or a bullet throws it, it screeches and runs off to hide.
// Back in its basket at the start of every round.
//
// Walking: along paths on the bots' nav grid (lib/nav.js), cat-sized — no ladders, no drops of more than DROP m, no
// deep water, and not through doors (closed ones, or an open leaf in the way). It moves from point to point at a fixed
// speed (no physics: every point is a floor the nav grid knows, so it can't end up inside a wall or under the map).
// Cheap: it thinks CAT.think ms apart; paths are found on the main thread but only when it picks somewhere new.
//
// api (from server.js): map(), world(), nav() (the bots' grid for the current map, or null while it's being built),
// players(), game(), broadcast(msg), detonateMine(mine), and optionally deepWater(pos) — true where water too deep for a
// cat is (the cellar's floodgate, at integration); the map's own water (pool, fountain, tunnel) is known already.
import { CAT, CAT_STATE as S, catMap } from '../shared/cat.js';
import { MINE, REAL } from '../shared/weapons.js';
import { rayAABB, overlapsAny } from '../shared/physics.js';

const DROP = 1.1; // the deepest drop it takes on its own (the nav grid has drops of up to 4 m, some through floors)
const R_BODY = 0.12; // half its width, for clear lines
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const r2 = v => Math.round(v * 100) / 100;
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
// three.js yaw facing from a to b (forward is [-sin yaw, -cos yaw])
const yawTo = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
const CALM = new Set([S.sit, S.walk, S.trot, S.wash, S.stretch, S.loaf, S.sleep]);

export function createCat(api) {
  let cat = null; // the cat's state (null: not on a cat map)
  let last = 0;
  const per = new WeakMap(); // nav -> { wet, spots, scratch }
  const stats = { setup: 0, plans: 0, planMs: 0, planMax: 0, fails: 0 }; // (how much its thinking costs: see debug())

  // ---- what the nav grid tells about the cat's world (worked out once per grid)
  function navInfo(nav) {
    let info = per.get(nav);
    if (info) return info;
    const map = api.map(), world = api.world();
    const t0 = performance.now();
    const { Y, N, min, cellStart, count } = nav;
    // deep water: the map's water boxes (deeper than a paw)
    const wet = new Uint8Array(count);
    for (const w of map.water || []) {
      const i0 = Math.max(0, Math.floor((w.min[0] - 0.25 - min) / 0.5)), i1 = Math.min(N - 1, Math.floor((w.max[0] + 0.25 - min) / 0.5));
      const j0 = Math.max(0, Math.floor((w.min[2] - 0.25 - min) / 0.5)), j1 = Math.min(N - 1, Math.floor((w.max[2] + 0.25 - min) / 0.5));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          for (let n = cellStart[i * N + j]; n < cellStart[i * N + j + 1]; n++) if (Y[n] > w.min[1] - 0.3 && w.max[1] - Y[n] > 0.12) wet[n] = 1;
        }
      }
    }
    info = { wet, scratch: null, spots: [] };
    per.set(nav, info);
    // its favourite spots on this grid; a perch must be a floor it fits on, a hop from the node
    for (const s of CAT.spots) {
      const n = nav.nodeAt(s.pos, 4);
      if (n < 0 || wet[n]) continue;
      const at = nav.pos(n);
      let perch = null;
      if (s.perch && hopOk(world, at, s.perch)) perch = s.perch;
      info.spots.push({ ...s, node: n, at, perch, until: 0 });
    }
    stats.setup = performance.now() - t0;
    return info;
  }

  // A hop from a floor to a perch (sofa, sill, basket): close, not too high, a floor under it, room for the cat, and
  // nothing in between.
  function hopOk(world, from, to) {
    const d = dist2(from, to), up = to[1] - from[1];
    if (d > 1.4 || up > 1.05 || up < -1.2) return false;
    const floor = world.raycast([to[0], to[1] + 0.1, to[2]], [0, -1, 0], 0.25, 'solid');
    if (!floor) return false;
    if (overlapsAny(world.move(null, to, 1), to[0], to[1] + 0.03, to[2], 0.06, 0.24)) return false;
    return clearLine(world, from, to, Math.max(from[1], to[1]) + 0.18);
  }

  // Nothing (walls, glass, doors, cars) along a line at height y, across the cat's width.
  function clearLine(world, a, b, y) {
    const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
    if (len < 0.02) return true;
    const d = [dx / len, 0, dz / len], side = [-d[2] * R_BODY, 0, d[0] * R_BODY];
    for (const s of [-1, 0, 1]) {
      for (const h of [0, 0.22]) {
        if (world.raycast([a[0] + side[0] * s, y + h, a[2] + side[2] * s], d, len, 'move')) return false;
      }
    }
    return true;
  }

  // ---- paths: A* over the nav grid's links, skipping ladders, big drops, deep water and doors
  function doorNodes(nav) {
    const world = api.world(), out = new Set();
    const boxes = world.doorBoxes.concat(world.carBoxes());
    const { N, min, cellStart, Y } = nav;
    for (const b of boxes) {
      if (b.max[1] < -500) continue; // (a door blown off)
      const i0 = Math.max(0, Math.floor((b.min[0] - 0.3 - min) / 0.5)), i1 = Math.min(N - 1, Math.floor((b.max[0] + 0.3 - min) / 0.5));
      const j0 = Math.max(0, Math.floor((b.min[2] - 0.3 - min) / 0.5)), j1 = Math.min(N - 1, Math.floor((b.max[2] + 0.3 - min) / 0.5));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          for (let m = cellStart[i * N + j]; m < cellStart[i * N + j + 1]; m++) if (Y[m] > b.min[1] - 0.6 && Y[m] < b.max[1]) out.add(m);
        }
      }
    }
    return out;
  }

  function findNodes(nav, s, g, maxExpand = 15000) {
    if (s < 0 || g < 0) return null;
    if (s === g) return [s];
    const info = navInfo(nav), wet = info.wet, deep = api.deepWater;
    const { X, Y, Z, link, count } = nav;
    const blocked = doorNodes(nav);
    blocked.delete(s);
    if (blocked.has(g) || wet[g]) return null;
    const Sc = info.scratch ||= { gs: new Float32Array(count), from: new Int32Array(count), seen: new Uint32Array(count), shut: new Uint32Array(count), gen: 0, heap: new Heap() };
    const gen = ++Sc.gen;
    const { gs, from, seen, shut, heap } = Sc;
    heap.clear();
    const gx = X[g], gy = Y[g], gz = Z[g];
    const h = n => Math.hypot(X[n] - gx, (Y[n] - gy) * 1.5, Z[n] - gz) * 2;
    seen[s] = gen; gs[s] = 0; from[s] = -1;
    heap.push(h(s), s);
    let expanded = 0;
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
        if (b < 0 || shut[b] === gen || wet[b] || blocked.has(b) || Y[b] - Y[a] < -DROP) continue;
        if (deep && deep([X[b], Y[b], Z[b]])) continue;
        const ng = gs[a] + (k < 4 ? 0.5 : 0.707) + Math.abs(Y[b] - Y[a]) * 0.5;
        if (seen[b] === gen && ng >= gs[b]) continue;
        seen[b] = gen; gs[b] = ng; from[b] = a;
        heap.push(ng + h(b), b);
      }
    }
    return null;
  }

  // Node path -> the points it walks through: straight lines where the floor is flat and nothing (doors included) is
  // in the way.
  function smooth(nav, nodes) {
    const world = api.world(), P = nodes.map(n => nav.pos(n));
    const out = [P[0]];
    let i = 0;
    while (i < P.length - 1) {
      let j = i + 1;
      for (const step of [12, 6, 3]) {
        const k = Math.min(P.length - 1, i + step);
        if (k > i + 1 && flatRun(nav, P, i, k) && clearLine(world, P[i], P[k], P[i][1] + 0.07)) { j = k; break; }
      }
      out.push(P[j]);
      i = j;
    }
    return out;
  }
  function flatRun(nav, P, i, j) {
    for (let k = i + 1; k <= j; k++) if (Math.abs(P[k][1] - P[i][1]) > 0.05) return false;
    const a = P[i], b = P[j], len = dist2(a, b);
    for (let t = 0.5; t < len; t += 0.5) {
      const f = t / len, n = nav.nodeAt([a[0] + (b[0] - a[0]) * f, a[1] + 0.1, a[2] + (b[2] - a[2]) * f], 0);
      if (n < 0 || Math.abs(nav.Y[n] - a[1]) > 0.05) return false;
    }
    return true;
  }

  // A path from where the cat is to a node (and on to an extra point: a perch or a hiding spot), or null.
  function plan(nav, goal, extra = null, maxExpand) {
    const t0 = performance.now();
    const here = nav.nodeAt(cat.p, 3);
    const nodes = findNodes(nav, here, goal, maxExpand);
    const pts = nodes && smooth(nav, nodes);
    const ms = performance.now() - t0;
    stats.plans++; stats.planMs += ms; stats.planMax = Math.max(stats.planMax, ms);
    if (!pts) { stats.fails++; return null; }
    // (from where it really stands to the first point)
    if (dist3(pts[0], cat.p) < 0.05) pts.shift();
    if (extra) pts.push(extra);
    return pts;
  }

  // ---- the cat's life
  function reset() {
    const map = api.map();
    if (!catMap(map)) { cat = null; return; }
    const t = api.now();
    cat = {
      p: CAT.basket.slice(), yaw: -Math.PI / 2, state: S.sleep, until: t + rnd(6000, 14000), doing: 'rest',
      path: null, pi: 0, speed: 0, then: null, spot: null, purr: 0, nextThink: t + 500,
      follow: null, seek: null, still: new Map(), seekAt: t + CAT.seek.every * 1000, seekCool: new Map(),
      air: null, scaredAt: -1e9, fleeFrom: null, hideUntil: 0, stretchNext: true, faceYaw: null,
    };
    cat.p[1] = CAT.basket[1] + 0.05;
    last = t;
  }

  const say = k => api.broadcast({ t: 'catMeow', p: [r2(cat.p[0]), r2(cat.p[1] + 0.25), r2(cat.p[2])], k });

  function go(pts, speed, state, then) {
    cat.path = pts;
    cat.pi = 0;
    cat.speed = speed;
    cat.state = state;
    cat.then = then;
    cat.faceYaw = null;
  }
  function stop(state, ms, doing = null) {
    cat.path = null;
    cat.state = state;
    cat.until = api.now() + ms;
    cat.doing = doing;
  }

  // At a favourite spot: do one of its things there for a while.
  function settle(spot) {
    const what = pick(spot.do);
    const ms = { sit: rnd(7000, 16000), wash: rnd(6000, 10000), loaf: rnd(14000, 30000), sleep: rnd(22000, 45000) }[what];
    if (spot.yaw != null && (spot.perch || spot.id === 'basket')) cat.faceYaw = spot.yaw;
    stop(S[what], ms, 'spot');
    if (what === 'sleep') cat.stretchNext = true;
  }

  // Somewhere new to go (weighted by how much it likes each spot; not where it is; not one it couldn't reach lately).
  function wander(nav, t) {
    const info = navInfo(nav);
    for (let tries = 0; tries < 3; tries++) {
      const list = info.spots.filter(s => s !== cat.spot && s.until <= t);
      if (!list.length) break;
      let r = Math.random() * list.reduce((a, s) => a + s.w, 0), s = list[0];
      for (const x of list) { r -= x.w; if (r <= 0) { s = x; break; } }
      const pts = plan(nav, s.node, s.perch);
      if (!pts) { s.until = t + 45000; continue; }
      const far = pts.reduce((a, q, i) => a + (i ? dist3(q, pts[i - 1]) : dist3(q, cat.p)), 0);
      cat.spot = s;
      const trot = far > 25 || Math.random() < 0.15;
      go(pts, trot ? CAT.trot : CAT.walk, trot ? S.trot : S.walk, 'spot');
      return true;
    }
    stop(S.sit, rnd(4000, 8000), 'wait');
    return false;
  }

  // Scared by gunfire or a blast at `from`: run (away from it) and hide, under something if there's a spot.
  function scare(from, t, loud = false) {
    if (!cat || cat.air) { if (cat) cat.fleeFrom = from; return; }
    const nav = api.nav();
    if (!nav) return;
    // already running from something nearby: keep going
    if (cat.then === 'hide' && cat.path && t - cat.scaredAt < 2500) return;
    cat.scaredAt = t;
    cat.follow = null;
    cat.seek = null;
    if (loud) say('hiss');
    const here = nav.nodeAt(cat.p, 3), info = navInfo(nav), dHere = dist2(cat.p, from);
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const n = nav.randomNear(here, cat.p, 15, 2.5);
      if (n < 0 || info.wet[n]) continue;
      const q = nav.pos(n), dq = dist2(q, from);
      if (dq < dHere + 3) continue;
      const score = dq - dist2(q, cat.p) * 0.35 + (nav.tight[n] ? 2 : 0);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    let pts = best >= 0 ? plan(nav, best, null, 9000) : null;
    if (pts && pts.length) {
      const end = pts[pts.length - 1], cover = coverNear(end, from);
      if (cover) pts.push(cover);
    } else {
      // nowhere better to run: hide right here
      const cover = coverNear(cat.p, from);
      pts = cover ? [cover] : null;
    }
    if (pts) go(pts, CAT.run, S.run, 'hide');
    else { cat.hideUntil = t + rnd(...CAT.hide) * 1000; stop(S.hide, cat.hideUntil - t, 'hide'); }
  }

  // A spot under something (a table, a bench, the stairs) within a few metres of p, reachable in a straight line,
  // away from the danger; or null.
  function coverNear(p, from) {
    const world = api.world();
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 3.5;
      const x = p[0] + Math.sin(a) * r, z = p[2] + Math.cos(a) * r;
      const floor = world.raycast([x, p[1] + 0.5, z], [0, -1, 0], 0.9, 'solid');
      if (!floor) continue;
      const y = p[1] + 0.5 - floor.t;
      if (Math.abs(y - p[1]) > 0.3) continue;
      const roof = world.raycast([x, y + 0.05, z], [0, 1, 0], 1.3, 'move');
      if (!roof || roof.t < 0.3) continue;
      const q = [x, y, z];
      if (overlapsAny(world.move(null, q, 1), x, y + 0.03, z, 0.08, 0.26)) continue;
      if (!clearLine(world, p, q, Math.max(p[1], y) + 0.12)) continue;
      const score = -roof.t * 2 + dist2(q, from) * 0.3;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best;
  }

  // Thrown by a blast or a bullet: a hop through the air away from it (landing on a floor it can get to, short of
  // any wall), a screech, then it runs and hides.
  function launch(dir, power, from, t) {
    const nav = api.nav(), world = api.world();
    if (!cat) return;
    say('screech');
    cat.fleeFrom = from;
    cat.follow = null;
    cat.seek = null;
    const p = cat.p;
    let land = null;
    if (nav) {
      const D = 1 + power * 3;
      for (const dd of [D, D * 0.6, D * 0.3]) {
        const n = nav.nodeAt([p[0] + dir[0] * dd, p[1] + 0.3, p[2] + dir[2] * dd], 1);
        if (n < 0 || navInfo(nav).wet[n]) continue;
        const q = nav.pos(n);
        if (q[1] > p[1] + 0.6 || q[1] < p[1] - 2.5) continue;
        if (!clearLine(world, p, q, Math.max(p[1], q[1]) + 0.3)) continue;
        land = q;
        break;
      }
    }
    land ||= p.slice();
    const d = dist3(p, land);
    cat.air = { from: p.slice(), to: land, t0: t, dur: 350 + d * 90 + power * 150, h: 0.35 + power * 0.8 };
    cat.path = null;
    cat.state = S.air;
  }

  // ---- hidden players: ghillie camo on (and still), crouched in a dark room, or playing dead (p.playingDead, from
  // the play-dead feature)
  function darkAt(p) {
    const map = api.map(), L = api.game().lights || {}, y = p[1] + 0.5;
    let dark = false;
    for (const r of map.rooms || []) {
      if (p[0] > r.min[0] && p[0] < r.max[0] && y > r.min[1] && y < r.max[1] && p[2] > r.min[2] && p[2] < r.max[2]) {
        if (L[r.group] === false || (L.power === false && r.power)) dark = true;
      }
    }
    return dark;
  }
  const hiddenPlayer = q => q.alive && (q.team === 'T' || q.team === 'CT') && q.driving == null && q.riding == null &&
    (q.hidden || q.playingDead || (q.c && darkAt(q.p)));

  function think(t) {
    const nav = api.nav();
    if (!nav) return;
    const players = api.players();
    // standing in water too deep (a flooded cellar): out of it
    if (api.deepWater?.(cat.p) && cat.then !== 'hide') { scare(cat.p, t); return; }
    // purring: someone right next to it, and it's calm
    let close = false;
    for (const q of players.values()) if (q.alive && dist2(q.p, cat.p) < CAT.purr && Math.abs(q.p[1] - cat.p[1]) < 1) { close = true; break; }
    cat.purr = close && CALM.has(cat.state) ? 1 : 0;

    const calm = CALM.has(cat.state) && cat.then !== 'hide' && cat.doing !== 'hide';
    // players standing still near it: after a while it follows one
    const F = CAT.follow;
    for (const q of players.values()) {
      if (!q.alive || q.driving != null || q.riding != null || dist2(q.p, cat.p) > F.near || Math.abs(q.p[1] - cat.p[1]) > 1.2) { cat.still.delete(q.id); continue; }
      const s = cat.still.get(q.id);
      if (!s || dist2(s.p, q.p) > 0.12) cat.still.set(q.id, { p: q.p.slice(), since: t });
      else if (calm && !cat.follow && !cat.seek && t - s.since > F.still * 1000) {
        cat.follow = { id: q.id, until: t + F.max * 1000, goal: null, repath: 0 };
        cat.still.delete(q.id);
        say('mrrp');
      }
    }
    for (const id of cat.still.keys()) if (!players.has(id)) cat.still.delete(id);

    if (cat.follow) return followStep(nav, t);
    if (cat.seek) return seekStep(nav, t);

    // now and then: a hidden player within reach? Go and meow at them.
    if (calm && t >= cat.seekAt) {
      cat.seekAt = t + CAT.seek.every * 1000;
      const K = CAT.seek;
      let target = null, bd = K.range;
      for (const q of players.values()) {
        if (!hiddenPlayer(q) || (cat.seekCool.get(q.id) || 0) > t) continue;
        const d = dist3(q.p, cat.p);
        if (d < bd) { bd = d; target = q; }
      }
      if (target && Math.random() < K.chance && startSeek(nav, target, t)) return;
    }

    if (cat.path) return; // walking somewhere: carry on
    if (t < cat.until) return;
    // done with what it was doing
    if (cat.state === S.hide || cat.doing === 'hide') { cat.doing = null; cat.stretchNext = true; }
    if (cat.stretchNext) { cat.stretchNext = false; stop(S.stretch, 2600, 'stretch'); return; }
    if (cat.doing === 'spot' && cat.state !== S.wash && Math.random() < 0.3) { stop(S.wash, rnd(5000, 9000), 'spot'); return; }
    wander(nav, t);
  }

  function followStep(nav, t) {
    const F = CAT.follow, q = api.players().get(cat.follow.id);
    if (!q || !q.alive || q.driving != null || q.riding != null || t > cat.follow.until || dist3(q.p, cat.p) > F.lose) {
      cat.follow = null;
      stop(S.sit, rnd(3000, 6000), 'wait');
      return;
    }
    const d = dist2(q.p, cat.p);
    if (d < F.keep + 0.3 && Math.abs(q.p[1] - cat.p[1]) < 1) {
      // next to them: sit and look up at them
      if (cat.path || cat.state !== S.sit) { cat.path = null; cat.state = S.sit; cat.doing = 'follow'; }
      cat.faceYaw = yawTo(cat.p, q.p);
      return;
    }
    if (cat.path && cat.follow.goal && dist2(cat.follow.goal, q.p) < 1.2 && t < cat.follow.repath) return;
    const goal = nav.nodeAt(q.p, 3);
    const pts = goal >= 0 ? plan(nav, goal, null, 6000) : null;
    cat.follow.repath = t + 1500;
    cat.follow.goal = q.p.slice();
    if (!pts) { cat.follow = null; stop(S.sit, rnd(3000, 6000), 'wait'); return; }
    // stop a little short of them
    while (pts.length > 1 && dist2(pts[pts.length - 1], q.p) < F.keep && dist2(pts[pts.length - 2], q.p) < F.keep) pts.pop();
    const fast = d > 6;
    go(pts, fast ? CAT.trot : CAT.walk, fast ? S.trot : S.walk, 'follow');
  }

  function startSeek(nav, q, t) {
    const goal = nav.nodeAt(q.p, 3);
    const pts = goal >= 0 ? plan(nav, goal, null, 12000) : null;
    if (!pts) { cat.seekCool.set(q.id, t + 15000); return false; }
    cat.seek = { id: q.id, at: q.p.slice(), meows: 0, nextMeow: 0, until: t + 40000, arrived: false };
    if (dist3(q.p, cat.p) < 12) say('meow');
    go(pts, CAT.walk, S.walk, 'seek');
    return true;
  }

  function seekStep(nav, t) {
    const K = CAT.seek, s = cat.seek, q = api.players().get(s.id);
    const done = () => { cat.seekCool.set(s.id, t + K.cooldown * 1000); cat.seek = null; stop(S.sit, rnd(2000, 5000), 'wait'); };
    if (!q || !hiddenPlayer(q) || t > s.until || dist2(q.p, s.at) > 2.5) return done();
    if (!s.arrived) {
      if (dist2(q.p, cat.p) < 1.4 && Math.abs(q.p[1] - cat.p[1]) < 1.2) { s.arrived = true; cat.path = null; }
      else if (!cat.path) return done(); // (got as close as it could)
      else return;
    }
    cat.state = S.sit;
    cat.doing = 'seek';
    cat.faceYaw = yawTo(cat.p, q.p);
    if (t >= s.nextMeow) {
      if (s.meows >= K.meows) return done();
      say('meow');
      s.meows++;
      s.nextMeow = t + rnd(3500, 6000);
    }
  }

  // Walking along the path; a door shut (or a car parked) in its way stops it.
  function step(dt, t) {
    const world = api.world();
    let left = cat.speed * dt;
    let moved = false;
    while (left > 1e-4 && cat.path && cat.pi < cat.path.length) {
      const to = cat.path[cat.pi], p = cat.p;
      const h = dist2(p, to);
      const seg = cat.seg?.to === to ? cat.seg : (cat.seg = leg(world, p, to, h));
      if (h > 0.01) {
        const dir = [(to[0] - p[0]) / h, 0, (to[2] - p[2]) / h];
        const o = [p[0], Math.max(p[1], to[1]) + 0.18, p[2]], reach = Math.min(h, left) + 0.2;
        // (not a door or car it's already under or in: a door swung onto it mustn't hold it there)
        const inWay = b => !(o[0] > b.min[0] && o[0] < b.max[0] && o[1] > b.min[1] && o[1] < b.max[1] && o[2] > b.min[2] && o[2] < b.max[2]) && rayAABB(o, dir, b.min, b.max, reach);
        if (world.doorBoxes.some(inWay) || world.carBoxes().some(inWay)) {
          blocked(t);
          return;
        }
        cat.yaw += angleDiff(cat.yaw, yawTo(p, to)) * Math.min(1, dt * 12);
      }
      if (h <= left) { cat.p = to.slice(); left -= Math.max(h, 0.02); cat.pi++; } else {
        const k = left / h;
        cat.p = [p[0] + (to[0] - p[0]) * k, 0, p[2] + (to[2] - p[2]) * k];
        cat.p[1] = legY(seg, seg.len - dist2(cat.p, to));
        left = 0;
      }
      moved = true;
    }
    if (moved && cat.path && cat.pi >= cat.path.length) arrive(t);
  }

  // A leg of the path from p to `to`. Up or down steps (stairs, a sofa, a sill) its height follows the floor under
  // it — sampled once along the leg — so it hops up just before a step and down just past it, and never cuts through
  // the edge of one (a straight line from floor to floor would) or floats over the lower steps.
  function leg(world, p, to, h) {
    const lo = Math.min(p[1], to[1]), hi = Math.max(p[1], to[1]);
    const seg = { to, from: p.slice(), len: Math.max(h, 1e-3), lo, hi, prof: null };
    // (flat legs that are long are clear lines already (see smooth); short ones are single steps of the nav grid, which
    // can cut the corner of something low, like the bottom step of the stairs)
    if ((hi - lo < 0.05 && h > 0.8) || h < 0.02) return seg;
    // (it hops over the corner of a step a little higher than both ends, as a diagonal past the side of the stairs)
    const n = Math.max(2, Math.ceil(h / 0.04)), top = hi + 0.55;
    seg.prof = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, x = p[0] + (to[0] - p[0]) * f, z = p[2] + (to[2] - p[2]) * f;
      const hit = world.raycast([x, top, z], [0, -1, 0], top - lo + 0.3, 'solid');
      seg.prof.push([f * h, Math.max(lo, Math.min(hi + 0.5, hit ? top - hit.t : lo))]);
    }
    return seg;
  }
  function legY(seg, s) {
    if (!seg.prof) return seg.from[1] + (seg.to[1] - seg.from[1]) * Math.min(1, s / seg.len);
    // the highest floor under its paws, and a little ahead (to hop up before a step)
    let under = seg.lo, ahead = seg.lo;
    for (const [at, fy] of seg.prof) {
      if (at > s - 0.07 && at < s + 0.07 && fy > under) under = fy;
      if (at > s - 0.07 && at < s + 0.15 && fy > ahead) ahead = fy;
    }
    // (and lands where the leg ends)
    return s > seg.len - 0.1 ? Math.max(under, seg.to[1], Math.min(ahead, seg.to[1] + (seg.len - s) * 4)) : ahead;
  }

  function blocked(t) {
    const then = cat.then;
    cat.path = null;
    if (then === 'spot' && cat.spot) cat.spot.until = t + 40000;
    if (then === 'follow' && cat.follow) cat.follow.repath = 0;
    if (then === 'seek') { cat.seekCool.set(cat.seek?.id, t + 30000); cat.seek = null; }
    stop(S.sit, rnd(2500, 5000), then === 'hide' ? 'hide' : 'wait');
  }

  function arrive(t) {
    const then = cat.then;
    cat.path = null;
    cat.then = null;
    if (then === 'spot' && cat.spot) settle(cat.spot);
    else if (then === 'hide') { cat.hideUntil = t + rnd(...CAT.hide) * 1000; stop(S.hide, cat.hideUntil - t, 'hide'); }
    else if (then === 'follow') { cat.state = S.sit; cat.doing = 'follow'; }
    else if (then === 'seek') cat.state = S.sit;
    else stop(S.sit, rnd(3000, 6000), 'wait');
  }

  function stepAir(t) {
    const a = cat.air, f = Math.min(1, (t - a.t0) / a.dur);
    cat.p = [a.from[0] + (a.to[0] - a.from[0]) * f, a.from[1] + (a.to[1] - a.from[1]) * f + a.h * 4 * f * (1 - f), a.from[2] + (a.to[2] - a.from[2]) * f];
    if (f < 1) return;
    cat.p = a.to.slice();
    cat.air = null;
    cat.state = S.sit;
    cat.then = null;
    const from = cat.fleeFrom || a.from;
    cat.fleeFrom = null;
    scare(from, t);
  }

  // Mines: it steps on a PMN, or walks into a MON-50's tripwire, and sets it off (whoever's it is).
  function mines(t) {
    for (const mine of api.game().mines || []) {
      if (mine.armAt > t) continue;
      const dy = cat.p[1] - mine.p[1];
      let hit = false;
      if (mine.k === 'pmn') hit = dy > -0.3 && dy < 0.5 && dist2(cat.p, mine.p) < MINE.pmn.trigger;
      else {
        const W = MINE.mon50, fx = -Math.sin(mine.yaw), fz = -Math.cos(mine.yaw);
        const cx = mine.p[0] + fx * W.wire, cz = mine.p[2] + fz * W.wire;
        const s = Math.max(-W.wireHalf, Math.min(W.wireHalf, (cat.p[0] - cx) * -fz + (cat.p[2] - cz) * fx));
        hit = dy > -0.4 && dy < 0.6 && Math.hypot(cat.p[0] - (cx - fz * s), cat.p[2] - (cz + fx * s)) < 0.3;
      }
      if (hit) { api.detonateMine(mine); return; }
    }
  }

  return {
    reset,
    tick(t) {
      if (!catMap(api.map())) { cat = null; return; }
      if (!cat) reset();
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
      last = t;
      if (cat.air) { stepAir(t); return; }
      if (cat.path) step(dt, t);
      else if (cat.faceYaw != null) cat.yaw += angleDiff(cat.yaw, cat.faceYaw) * Math.min(1, dt * 6);
      if (!cat || cat.air) return;
      if (cat.path || (api.game().mines || []).length) mines(t);
      if (cat.air) return;
      if (t >= cat.nextThink) { cat.nextThink = t + CAT.think; think(t); }
    },

    // A shot fired from o along dirs (by p): a bullet through the cat throws it; gunfire nearby scares it.
    shot(p, o, dirs, melee = false) {
      if (!cat) return;
      const t = api.now(), c = cat.p, world = api.world();
      for (const d of dirs) {
        const hit = rayAABB(o, d, [c[0] - 0.22, c[1], c[2] - 0.22], [c[0] + 0.22, c[1] + 0.32, c[2] + 0.22], melee ? 2.2 : 250);
        if (!hit || cat.air || world.raycast(o, d, hit.t, 'bullet')) continue;
        const h = Math.hypot(d[0], d[2]) || 1;
        launch([d[0] / h, 0, d[2] / h], 0.25, o, t);
        return;
      }
      if (melee) return;
      const d = dist3(o, c);
      if (d < CAT.hear) scare(o, t, d < 6);
    },

    // An explosion at `at` (weapon: the blast's kind, see REAL.push): close by, it's thrown; further off, scared. A
    // grenade that doesn't blow things up (a flashbang, smoke, a Molotov) only scares it.
    blast(at, weapon) {
      if (!cat) return;
      const P = REAL.push[weapon], t = api.now(), R = P ? P[0] : 4, c = [cat.p[0], cat.p[1] + 0.15, cat.p[2]];
      const d = dist3(at, c);
      if (P && d < R * 0.6 && !cat.air) {
        const h = Math.hypot(c[0] - at[0], c[2] - at[2]);
        const dir = h > 0.05 ? [(c[0] - at[0]) / h, 0, (c[2] - at[2]) / h] : (a => [Math.sin(a), 0, Math.cos(a)])(Math.random() * 6.28);
        launch(dir, 1 - d / (R * 0.6), at, t);
      } else if (d < R * CAT.blastHear || d < 12) scare(at, t);
    },

    // The snapshot's part: { cat: [x, y, z, yaw, state, purring] } on a cat map, else nothing.
    snap() {
      return cat ? { cat: [r2(cat.p[0]), r2(cat.p[1]), r2(cat.p[2]), r2(cat.yaw), cat.state, cat.purr] } : {};
    },

    // (tests) its favourite spots on the current grid: where each one is, and whether its perch works
    spots() {
      const nav = api.nav();
      return nav ? navInfo(nav).spots.map(s => ({ id: s.id, at: s.at, perch: s.perch })) : null;
    },
    // (tests) what it's up to
    debug() {
      return cat && { p: cat.p, state: cat.state, then: cat.then, doing: cat.doing, spot: cat.spot?.id, path: cat.path?.length ?? 0, follow: cat.follow?.id ?? null, seek: cat.seek?.id ?? null, air: !!cat.air, stats };
    },
  };
}

// Binary min-heap of (key, node) pairs in growable typed arrays (like lib/nav.js's).
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
