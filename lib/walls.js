// Walls & water on the server (see shared/walls.js): bullets through wood and plaster walls (onShoot in server.js
// asks trace() for each bullet instead of a plain raycast), and what a bullet does to the walls it goes through:
// a weak door is shot, the heavy guns chip the wall, a hidden water pipe bursts (it sprays out of both holes and soaks
// the floor on both sides: lib/wetfloor.js), a hidden cable is cut (it sparks every second or so while the power is
// on: each spark is a spark for the gas, and electrocutes whoever stands in a wet patch it reaches). Only on the
// Mansion maps (materialsOn); elsewhere trace() is a plain raycast and every other call does nothing. server.js
// creates it once and calls it from hooks marked "walls:". Everything is mended at round start.
import { penetrate, runHit } from '../shared/walls.js';
import { materialsOn } from '../shared/materials.js';
import { wallRuns } from '../shared/maps/mansion_walls.js';
import { WETFLOOR } from '../shared/wetfloor.js';
import { WEAPONS, BREAK } from '../shared/weapons.js';
import { createWetFloor } from './wetfloor.js';

// A burst pipe sprays for `life` s (its flow falling from 1 to `tail`); at most `jets` at once, `wires` cut cables.
// A cut cable sparks every `spark` [min, max] ms. A second hit within `same` m of a burst or cut on the same run is
// the same one.
export const PIPES = { life: 40, tail: 0.35, jets: 6, wires: 8, spark: [350, 1400], same: 0.35, out: 0.35 };

const r2 = v => Math.round(v * 100) / 100;
const inBox = (r, p, pad = 0.1) => [0, 1, 2].every(k => p[k] > r.min[k] - pad && p[k] < r.max[k] + pad);

// deps: what it needs from server.js —
//   game, players, map(), world(), broadcast, send, notify, now, applyDamage, hurtHostage, sparkAt(pos, kind, by),
//   shootDoor(i, dmg), hurtPiece(pc, dmg, out), breakPieces(ids), mates(a, b), cfg
export function createWalls(deps) {
  const { game, players } = deps;
  const on = () => materialsOn(deps.map());
  let shot = []; // this shot's bullets: [penetrate result] in the order onShoot traced them
  let jets = [], wires = [];

  // ---- THE power check for the live wires and the wet floors: one function, so group 3's circuits (per floor, the
  // generator) can replace it at merge. For now: the house's mains (the fuse box: game.lights.power) for anything in a
  // room on it (map.rooms with `power`), always on elsewhere.
  function powerAt(pos) {
    const room = (deps.map().rooms || []).find(r => inBox(r, pos));
    if (room && room.power === false) return true;
    return game.lights?.power !== false;
  }

  const wet = createWetFloor({ game, players, now: deps.now, broadcast: m => deps.broadcast(m), applyDamage: (...a) => deps.applyDamage(...a),
    hurtHostage: (...a) => deps.hurtHostage(...a), mates: (a, b) => deps.mates(a, b), powerAt });

  // A bullet from o along d (see penetrate): what stops it, the walls it went through, and the damage left.
  function trace(o, d, range, w, exceptCar = null) {
    const r = penetrate(deps.map(), deps.world(), o, d, range, w, exceptCar);
    shot.push(r);
    return r;
  }

  // After onShoot has worked out its hits: traces are its [dx, dy, dz, end, hit someone, hit a wall] per bullet (the
  // bullet's real end: the player it hit, or the wall that stopped it). The walls each bullet went through on the
  // way take their share.
  function onShot(p, w, traces) {
    const list = shot.slice(-traces.length);
    shot = [];
    if (!on()) return;
    const def = WEAPONS[w], map = deps.map(), runs = wallRuns(map), chipped = [];
    list.forEach((r, i) => {
      const end = traces[i]?.[3] ?? Infinity;
      let keep = 1;
      for (const ps of r.passes) {
        if (ps.t0 > end + 0.01) break;
        const dmg = def.damage * keep;
        for (const b of ps.boxes) {
          if (b.door != null && map.doors[b.door]?.weak) deps.shootDoor(b.door, dmg);
          else if (b.brk != null && BREAK.chip[w]) deps.hurtPiece(map.breakables[b.brk], dmg * BREAK.chip[w], chipped);
        }
        const hit = ps.boxes.some(b => b.door == null) ? runHit(runs, ps) : null;
        if (hit?.run.kind === 'pipe') burst(hit, ps, p);
        else if (hit?.run.kind === 'cable') cut(hit, ps, p);
        keep = ps.keep;
      }
    });
    if (chipped.length) deps.breakPieces([...new Set(chipped)]);
  }

  // Where a bullet came out of the wall on each side: [point, outward normal] for the side it went in and the one it
  // came out of (the wall's faces at the pipe's or cable's height).
  function faces(ps, at) {
    const k = ps.n[0] !== 0 ? 0 : 2, last = ps.boxes[ps.boxes.length - 1], first = ps.boxes[0];
    const sIn = ps.n[k] || 1, aIn = sIn > 0 ? first.max[k] : first.min[k];
    const aOut = sIn > 0 ? last.min[k] : last.max[k];
    const pIn = at.slice(), pOut = at.slice();
    pIn[k] = aIn; pOut[k] = aOut;
    const nIn = [0, 0, 0], nOut = [0, 0, 0];
    nIn[k] = sIn; nOut[k] = -sIn;
    return [[pIn, nIn], [pOut, nOut]];
  }

  // The floor under a point (the solid map's top within 3 m below), or null.
  function floorUnder(p) {
    const h = deps.world().raycast([p[0], p[1], p[2]], [0, -1, 0], 3, 'solid');
    return h ? p[1] - h.t : null;
  }

  // A pipe bursts: water out of both holes, each side's floor a growing wet patch.
  function burst(hit, ps, p) {
    const t = deps.now();
    if (jets.some(j => j.run === hit.run && Math.hypot(j.p[0] - hit.p[0], j.p[1] - hit.p[1], j.p[2] - hit.p[2]) < PIPES.same)) return;
    const sides = faces(ps, hit.p).map(([fp, n]) => {
      const out = [fp[0] + n[0] * PIPES.out, fp[1], fp[2] + n[2] * PIPES.out];
      const y = floorUnder(out);
      if (y == null) return { p: fp, n, patch: null };
      const k = n[0] !== 0 ? 0 : 2;
      return { p: fp, n, patch: wet.add([out[0], y, out[2]], [k, fp[k], n[k]], p) };
    });
    jets.push({ run: hit.run, p: hit.p, sides, at: t, by: p?.id ?? null });
    if (jets.length > PIPES.jets) jets.shift();
  }

  // A cable is cut: it sparks at both holes while the power is on.
  function cut(hit, ps, p) {
    const t = deps.now();
    if (wires.some(w => w.run === hit.run && Math.hypot(w.p[0] - hit.p[0], w.p[1] - hit.p[1], w.p[2] - hit.p[2]) < PIPES.same)) return;
    wires.push({ run: hit.run, p: hit.p, sides: faces(ps, hit.p).map(([fp, n]) => ({ p: fp, n })), next: t + 80, by: p?.id ?? null, on: powerAt(hit.p) });
    if (wires.length > PIPES.wires) wires.shift();
  }

  const flow = (j, t) => { const f = (t - j.at) / 1000 / PIPES.life; return f >= 1 ? 0 : 1 - (1 - PIPES.tail) * f; };

  function tick(t, dt) {
    if (!on() || (!jets.length && !wires.length && !wet.list().length)) return;
    // the jets feed their patches
    for (const j of jets) {
      const f = flow(j, t);
      if (f <= 0) continue;
      for (const s of j.sides) if (s.patch) wet.feed(s.patch, WETFLOOR.flow * f * dt);
    }
    jets = jets.filter(j => flow(j, t) > 0);
    // the cut cables spark while the power is on
    for (const w of wires) {
      w.on = powerAt(w.p);
      if (!w.on || t < w.next) continue;
      w.next = t + PIPES.spark[0] + Math.random() * (PIPES.spark[1] - PIPES.spark[0]);
      const by = w.by != null ? players.get(w.by) || null : null;
      for (const s of w.sides) {
        deps.sparkAt?.(s.p, 'electric', by); // walls → gas: a spark in a gassy room sets it off
        wet.spark(s.p, by);
      }
    }
    wet.tick(t);
  }

  function reset() {
    shot = [];
    jets = [];
    wires = [];
    wet.reset();
  }

  // The snapshot's `wa` while there's anything: [patches (see packPatch), sprays [x, y, z, nx, nz, flow], cut cables'
  // ends [x, y, z, nx, nz, live (power on) 1/0]].
  function snap() {
    if (!on()) return {};
    const patches = wet.snap();
    if (!patches.length && !jets.length && !wires.length) return {};
    const t = deps.now();
    const sprays = [], ends = [];
    for (const j of jets) for (const s of j.sides) sprays.push([r2(s.p[0]), r2(s.p[1]), r2(s.p[2]), s.n[0], s.n[2], r2(flow(j, t))]);
    for (const w of wires) for (const s of w.sides) ends.push([r2(s.p[0]), r2(s.p[1]), r2(s.p[2]), s.n[0], s.n[2], w.on ? 1 : 0]);
    return { wa: [patches, sprays, ends] };
  }

  return { on, trace, onShot, tick, reset, snap, powerAt, wet, state: () => ({ jets, wires }) };
}
