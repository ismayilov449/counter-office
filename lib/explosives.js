// Explosives (ROADMAP group 7, rules in shared/explosives.js; docs/features/explosives.md). server.js calls in at a few
// hooks marked "explosives:". Bots don't use any of it.
// State: p.xpHot = the grenade in a player's hand { id, owner, at (ms it goes off), round }.
import { NADE, simulateNade } from '../shared/physics.js';
import { XP } from '../shared/explosives.js';

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = a => (Array.isArray(a) && a.length === 3 && a.every(isNum) ? a : null);

// api: { game, players, send, broadcast, now, world(), eyeOf(p), mates(a, b), applyDamage(...), explodeNade(n) }
export function createExplosives(api) {
  const { game, players, send, broadcast, now } = api;
  const msg = (p, text) => send(p, { t: 'msg', text });

  // ---- 7.1 throwing a grenade back
  // From onNade, right after a grenade is pushed: keep its flight path (null: into an air vent, not grabbable).
  function thrown(n, path) {
    if (n && path) { n.xpPath = path; n.xpT0 = now(); }
  }
  const nadeAt = (n, t) => n.xpPath[Math.min(n.xpPath.length - 1, Math.max(0, Math.floor((t - n.xpT0) / 1000 / NADE.dt)))];

  // E: an HE by your feet with enough fuse left goes into your hand.
  function grab(p, t) {
    if (!p.alive || p.downed || p.act || p.xpHot || p.bot) return false;
    const n = game.nades.find(x => x.k === 'he' && x.xpPath && x.at - t >= XP.grabLeft * 1000 && d3(p.p, nadeAt(x, t)) < XP.reach);
    if (!n) return false;
    game.nades.splice(game.nades.indexOf(n), 1);
    p.xpHot = { id: n.id, owner: n.owner, at: n.at, round: game.round };
    broadcast({ t: 'xpGrab', id: n.id, by: p.id });
    send(p, { t: 'xpHot', ms: Math.round(n.at - t) });
    return true;
  }

  // Mouse1 with the grenade in hand: thrown from o at v with the fuse it has left; its kills are the thrower's now.
  function throwBack(p, m) {
    const h = p.xpHot, o = vec3(m.o), v = vec3(m.v), t = now();
    if (!h || !p.alive || !o || !v || Math.hypot(...v) > 30 || d3(o, api.eyeOf(p)) > 2.5) return;
    p.xpHot = null;
    const fuse = Math.max(0.05, (h.at - t) / 1000), path = [];
    const end = simulateNade(api.world().nade(), o, v, fuse, path, false);
    const n = { id: h.id, k: 'he', owner: p.id, at: h.at, end };
    game.nades.push(n);
    thrown(n, path);
    broadcast({ t: 'nade', id: n.id, k: 'he', o, v, owner: p.id, fu: fuse });
    send(p, { t: 'xpHot', ms: 0 });
  }

  // Every tick: a grenade held too long goes off in the hand; dropped when its holder dies or goes down.
  function tick(t) {
    for (const p of players.values()) {
      const h = p.xpHot;
      if (!h) continue;
      if (h.round !== game.round) { p.xpHot = null; continue; }
      if (p.alive && !p.downed && t < h.at) continue;
      p.xpHot = null;
      send(p, { t: 'xpHot', ms: 0 });
      // (an enemy's grenade kills you as his; your own side's is your own mistake)
      const ownerP = players.get(h.owner);
      const owner = ownerP && ownerP !== p && !api.mates(ownerP, p) ? ownerP : p;
      if (t >= h.at) {
        if (p.alive) api.applyDamage(p, owner, XP.inHand, 'he', 'he', 1, null, p.p);
        api.explodeNade({ id: h.id, k: 'he', owner: owner.id, end: [p.p[0], p.p[1] + 0.9, p.p[2]] });
      } else {
        const n = { id: h.id, k: 'he', owner: h.owner, at: h.at, end: p.p.slice() };
        game.nades.push(n);
        thrown(n, [n.end]);
        broadcast({ t: 'nade', id: n.id, k: 'he', o: [p.p[0], p.p[1] + 0.9, p.p[2]], v: [0, 0, 0], owner: h.owner, fu: (h.at - t) / 1000 });
      }
    }
  }

  return { thrown, grab, throwBack, tick, message(p, m) { if (m.t === 'xpThrow') throwBack(p, m); } };
}
