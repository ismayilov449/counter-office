// Explosives (ROADMAP group 7, rules in shared/explosives.js; docs/features/explosives.md). server.js calls in at a few
// hooks marked "explosives:". Bots don't use any of it.
// State: p.xpHot = the grenade in a player's hand { id, owner, at (ms it goes off), round }.
import { NADE, simulateNade } from '../shared/physics.js';
import { XP } from '../shared/explosives.js';

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = a => (Array.isArray(a) && a.length === 3 && a.every(isNum) ? a : null);

// api: { game, players, send, broadcast, sendMe, now, world(), eyeOf(p), mates(a, b), applyDamage(...), explodeNade(n),
//   corpses() (lib/disguise.js's bodies: id -> { id, team, p, seq, round, gibbed }) }
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

  // ---- 7.2 booby-trapped bodies: body (player id) -> { owner, p }, this round only
  const traps = new Map();
  let round = -1;
  const sendTraps = () => broadcast({ t: 'xpTraps', list: [...traps].map(([id, x]) => [id, ...x.p.map(v => Math.round(v * 100) / 100)]) });
  // A body lying dead this round (lib/disguise.js keeps them) within reach of p, of `team`.
  function bodyNear(p, team) {
    let best = null, bd = XP.trapReach;
    for (const c of api.corpses().values()) {
      const v = players.get(c.id);
      if (c.team !== team || c.round !== game.round || c.gibbed || !v || v.alive || v.downed || v.spawnSeq !== c.seq) continue;
      const d = Math.hypot(p.p[0] - c.p[0], p.p[2] - c.p[2]);
      if (d < bd && Math.abs(p.p[1] - c.p[1]) < XP.trapReachY) { bd = d; best = c; }
    }
    return best;
  }
  function blowTrap(id) {
    const x = traps.get(id);
    traps.delete(id);
    sendTraps();
    api.explodeNade({ id: game.nextNadeId++, k: 'he', owner: x.owner, end: x.p.slice() });
  }
  // E (before the uniform): a CT on a trapped Terrorist's body sets it off (looking at it, or starting to take its
  // uniform); a crouched Terrorist with an HE over a dead teammate starts hiding it there.
  function useBody(p, t) {
    if (!p.alive || p.downed || game.phase !== 'live') return false;
    if (p.team === 'CT') {
      const c = bodyNear(p, 'T');
      if (!c || !traps.has(c.id)) return false;
      blowTrap(c.id);
      return true;
    }
    if (p.team !== 'T' || p.bot || !p.c || !(p.inv.he > 0)) return false;
    const c = bodyNear(p, 'T');
    if (!c || traps.has(c.id)) return false;
    p.act = { type: 'xpTrap', start: t, pos: p.p.slice(), dur: XP.trap * 1000, body: c.id };
    return true;
  }
  // updateActions, after its own checks (alive, live round, not walked off): still crouched, the body still there.
  function act(p, a, t) {
    const c = api.corpses().get(a.body);
    if (!p.c || !(p.inv.he > 0) || !c || traps.has(c.id)) { p.act = null; return; }
    if (t - a.start < a.dur) return;
    p.act = null;
    p.inv.he--;
    api.sendMe(p);
    traps.set(c.id, { owner: p.id, p: c.p.slice() });
    sendTraps();
    msg(p, 'Grenade hidden under the body. The first enemy who touches it gets a surprise.');
  }

  // Every tick: a grenade held too long goes off in the hand; dropped when its holder dies or goes down.
  function tick(t) {
    if (game.round !== round) { round = game.round; if (traps.size) { traps.clear(); sendTraps(); } }
    for (const [id] of traps) { const v = players.get(id); if (!v || v.alive) { traps.delete(id); sendTraps(); } } // (its man is back up or gone)
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

  return {
    thrown, grab, throwBack, useBody, act, tick,
    message(p, m) { if (m.t === 'xpThrow') throwBack(p, m); },
  };
}
