// Underground & vents on the server (cs_mansion, cs_mansion_night; see shared/underground.js).
//   1. No radar underground: a player down there gets no enemies in his snapshot ("sp": his radar shows static), can't
//      ping or call in a target, isn't spotted onto anyone's radar and spots nobody onto his team's (server.js asks
//      under() in spots(), the snapshot, onPing and onSpot).
//   2. The echo needs nothing here: every shot and blast already goes to everyone (public/js/underground.js).
//   3. Grenades through the air vents: onNade's path (simulated at the throw) is cut where it first enters a grille's
//      mouth (nade()); the grenade rattles through the duct (ductTime) and drops out of the grille at the other end,
//      where tick() simulates the rest of its flight (from the world as it is then) and tells everyone (a second
//      'nade' message with `vent`, and `fu`: how long it has left). A bouncing grenade keeps its fuse: if that runs out
//      in the duct it goes off at the mouth of the grille it's nearer to. A Molotov breaks where it lands after coming
//      out. A grenade in a duct is in game.nades like any other, so a new round (which empties game.nades) clears it;
//      reset() drops what was still to come out. (The gas: lib/gas.js adds the ducts to its graph, see ventLinks.)
import { isUnderground, ventsOf, nadeIntoVent, ventExit, ductTime } from '../shared/underground.js';
import { NADE, simulateNade } from '../shared/physics.js';
import { WEAPONS } from '../shared/weapons.js';

export const UG_MSG = 'No signal underground — no radar, pings or target calls down here.';

export function createUnderground(api) {
  // api: map(), world(), game, now(), broadcast(msg), send(p, msg)
  const under = p => isUnderground(api.map(), p);

  // 1. the radar: a live player underground gets no spotted enemies (his radar shows static)
  const noRadar = p => !!p.alive && under(p.p);
  // a ping or a target call from underground: refused, with a message (true: refused)
  function refuse(p) {
    if (!p.alive || !under(p.p)) return false;
    api.send(p, { t: 'msg', text: UG_MSG });
    return true;
  }

  // 3. grenades through the vents
  const pending = []; // { id, k, owner, g (the grille it comes out of), at (ms), impact }
  // the point just in front of a grille, where a grenade that goes off in its duct goes off
  const mouthOf = g => g.c.map((v, k) => v + g.nv[k] * 0.15);

  // A grenade just thrown (onNade): if its path goes into a grille, cut the path there (in place) and return what to
  // add to the game.nades entry (n) and to the 'nade' message (m); null if it never goes near a grille.
  function nade(id, k, owner, path, fuse) {
    const vents = ventsOf(api.map());
    const hit = vents && nadeIntoVent(vents, path);
    if (!hit) return null;
    const { i, g } = hit, link = g.links[Math.floor(Math.random() * g.links.length)];
    const out = vents.grilles[link.to], impact = !!WEAPONS[k]?.impact;
    const tIn = (i + 1) * NADE.dt, T = ductTime(link.len), left = fuse - tIn - T, t0 = api.now();
    path.length = i + 1; // (the flight ends at the grille: the windows after it don't break)
    api.broadcast({ t: 'ugDuct', id, a: g.i, b: out.i, in: Math.round(tIn * 1000), d: Math.round(T * 1000) });
    const m = { fu: tIn };
    if (left <= 0.05) {
      // no time left: it goes off in the duct, out of the grille it's nearer to (a Molotov breaks at the one it went in)
      const near = impact || (fuse - tIn) / T < 0.5 ? g : out;
      return { n: impact ? { end: mouthOf(near), at: t0 + tIn * 1000 } : { end: mouthOf(near) }, m };
    }
    pending.push({ id, k, owner, g: out, at: t0 + (tIn + T) * 1000, impact, left });
    // (until it comes out: it would go off at the far grille; a Molotov's time is set when it comes out)
    return { n: impact ? { end: mouthOf(out), at: t0 + (tIn + T + left) * 1000 } : { end: mouthOf(out) }, m };
  }

  // Every tick: grenades coming out of a duct.
  function tick(t) {
    for (let j = pending.length - 1; j >= 0; j--) {
      const q = pending[j];
      if (t < q.at) continue;
      pending.splice(j, 1);
      const n = api.game.nades.find(x => x.id === q.id);
      if (!n) continue; // a new round (or it went off already): nothing comes out
      const { o, v } = ventExit(q.g, [Math.random() * 2 - 1, Math.random() * 2 - 1]);
      const fu = q.impact ? q.left : Math.max(0.05, (n.at - t) / 1000);
      const path = [];
      n.end = simulateNade(api.world().nade(), o, v, fu, path, q.impact);
      if (q.impact) n.at = t + path.length * NADE.dt * 1000;
      api.broadcast({ t: 'nade', id: q.id, k: q.k, o, v, owner: q.owner, fu, vent: q.g.i });
    }
  }

  function reset() {
    pending.length = 0;
  }

  return { under, noRadar, refuse, nade, tick, reset, pending: () => pending.length };
}
