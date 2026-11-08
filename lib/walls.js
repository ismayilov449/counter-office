// Walls & water on the server (see shared/walls.js): bullets through wood and plaster walls (onShoot in server.js
// asks trace() for each bullet instead of a plain raycast), and what a bullet does to the walls it goes through:
// a weak door is shot, the heavy guns chip the wall. Only on the Mansion maps (materialsOn); elsewhere trace() is a
// plain raycast and every other call does nothing. server.js creates it once and calls it from hooks marked "walls:".
import { penetrate } from '../shared/walls.js';
import { materialsOn } from '../shared/materials.js';
import { WEAPONS, BREAK } from '../shared/weapons.js';

// deps: what it needs from server.js —
//   game, players, map(), world(), broadcast, send, notify, now, applyDamage, hurtHostage, sparkAt(pos, kind, by),
//   shootDoor(i, dmg), hurtPiece(pc, dmg, out), breakPieces(ids), mates(a, b), cfg
export function createWalls(deps) {
  const on = () => materialsOn(deps.map());
  let shot = []; // this shot's bullets: [penetrate result] in the order onShoot traced them

  // A bullet from o along d (see penetrate): what stops it, the walls it went through, and the damage left.
  function trace(o, d, range, w, exceptCar = null) {
    const r = penetrate(deps.map(), deps.world(), o, d, range, w, exceptCar);
    shot.push(r);
    return r;
  }

  // After onShoot has worked out its hits: traces are its [dx, dy, dz, end, hit someone, hit a wall] per bullet (the
  // bullet's real end: the player it hit, or the wall that stopped it). The walls each bullet went through on the
  // way take their share: a weak door is shot, a heavy gun chips the wall.
  function onShot(p, w, traces) {
    const list = shot.slice(-traces.length);
    shot = [];
    if (!on()) return;
    const def = WEAPONS[w], map = deps.map(), chipped = [];
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
        keep = ps.keep;
      }
    });
    if (chipped.length) deps.breakPieces([...new Set(chipped)]);
  }

  function reset() {
    shot = [];
  }

  return { on, trace, onShot, reset };
}
