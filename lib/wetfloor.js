// Wet floors on the server (see shared/wetfloor.js): the soaked patches and the electrocution. Made for the burst
// pipes (lib/walls.js) and meant to be reused: the fire hose soaks floors with soak(), any live spark calls spark().
//   add(p, clip)       a patch on the floor at p (or the one already there): returns it
//   feed(patch, area)  more water: it grows (area m²)
//   soak(p, area, clip, by)  both at once (the fire hose)
//   spark(s, by)       a spark at s: if the power is on there (deps.powerAt), everyone standing in a patch it reaches
//                      is electrocuted (WETFLOOR.shock, at most every WETFLOOR.every s each); returns who was hit
//   at(feet)           the patch someone's feet are in, or null
//   reset() / tick(t) / snap() (the packed list for the snapshot) / list()
import { WETFLOOR, inPatch, sparkReaches, grown, packPatch } from '../shared/wetfloor.js';

const r2 = v => Math.round(v * 100) / 100;
const sameClip = (a, b) => (!a && !b) || (a && b && a[0] === b[0] && Math.abs(a[1] - b[1]) < 0.05 && a[2] === b[2]);

// deps: game, players, now, broadcast, applyDamage, hurtHostage, mates(a, b), powerAt(pos)
export function createWetFloor(deps) {
  const { game, players } = deps;
  let patches = [], nextId = 1;

  function reset() {
    patches = [];
  }

  function add(p, clip = null, by = null) {
    const same = patches.find(pt => Math.abs(pt.p[1] - p[1]) < 0.15 && Math.hypot(pt.p[0] - p[0], pt.p[2] - p[2]) < Math.max(0.4, pt.r * 0.8) && sameClip(pt.clip, clip));
    if (same) return same;
    const pt = { id: nextId++, p: p.slice(), r: WETFLOOR.start, clip, by, live: false, liveUntil: 0 };
    patches.push(pt);
    if (patches.length > WETFLOOR.most) patches.shift();
    return pt;
  }

  const feed = (pt, area) => { pt.r = grown(pt.r, area); };

  function soak(p, area, clip = null, by = null) {
    const pt = add(p, clip, by);
    feed(pt, area);
    return pt;
  }

  // A spark at s; by: the player who made it (credited for an enemy's death), or null.
  function spark(s, by = null) {
    if (!patches.length || !deps.powerAt(s)) return [];
    const t = deps.now(), hit = [];
    for (const pt of patches) {
      if (!sparkReaches(pt, s)) continue;
      pt.liveUntil = t + 500;
      pt.live = true;
      for (const q of players.values()) {
        if (!q.alive || !inPatch(pt, q.p) || (q.wetShockAt || 0) > t) continue;
        q.wetShockAt = t + WETFLOOR.every * 1000;
        hit.push([r2(q.p[0]), r2(q.p[1] + 0.9), r2(q.p[2])]);
        const att = by && by !== q && !deps.mates(by, q) ? by : null;
        deps.applyDamage(q, att, WETFLOOR.shock, null, 'electrocuted', 1);
      }
      for (const h of game.hostages || []) {
        if (h.state === 'dead' || h.state === 'rescued' || !inPatch(pt, h.p) || (h.wetShockAt || 0) > t) continue;
        h.wetShockAt = t + WETFLOOR.every * 1000;
        hit.push([r2(h.p[0]), r2(h.p[1] + 0.9), r2(h.p[2])]);
        deps.hurtHostage(h, null, WETFLOOR.shock, 'electrocuted');
      }
    }
    if (hit.length) deps.broadcast({ t: 'waZap', p: s.map(r2), v: hit });
    return hit;
  }

  const at = feet => patches.find(pt => inPatch(pt, feet)) || null;

  function tick(t) {
    for (const pt of patches) if (pt.live && t >= pt.liveUntil) pt.live = false;
  }

  const snap = () => patches.map(packPatch);

  return { reset, add, feed, soak, spark, at, tick, snap, list: () => patches };
}
