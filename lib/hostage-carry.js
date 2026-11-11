// Carrying wounded hostages (ROADMAP 6.2, rules in shared/hostage-carry.js). State: h.carriedBy = the carrier's id,
// p.carry = the hostage's id; the hostage stays 'idle' (the round logic doesn't change) and sits at the carrier's feet
// on the server (h.p, for blasts), its hitbox across his shoulders (ray). Carried into the CT base: rescued.
import { PLAYER, overlapsAny, rayAABB, ladderAt } from '../shared/physics.js';
import { CARRY, carriedBox } from '../shared/hostage-carry.js';
import { heldSpot } from '../shared/shield.js';

const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// api: { game, players, send, broadcast, world(), map(), reach(p, h), rewind(q, rt), inRescueZone(pos), rescue(h) }
export function createCarry(api) {
  const { game, players, send } = api;
  const msg = (p, text) => send(p, { t: 'msg', text });
  const hurt = h => h.state !== 'dead' && h.state !== 'rescued' && h.hp <= CARRY.hurt;
  // (p.carry outlives a new round's hostages: only a hostage that names him as its carrier counts)
  const carried = p => (p.carry != null && game.hostages.find(h => h.id === p.carry && h.carriedBy === p.id)) || null;
  const fits = (x, y, z) => !overlapsAny(api.world().move(null, [x, y, z], 2), x, y + 0.05, z, PLAYER.radius, PLAYER.height - 0.05);

  // Why a carry ends now (or null).
  function ends(p, h) {
    if (!p) return 'left';
    if (h.state !== 'idle') return 'gone';
    if (!p.alive || p.downed || p.team !== 'CT') return 'down';
    if (game.phase !== 'live' && game.phase !== 'warmup') return 'round';
    if (p.driving != null || p.riding != null || p.piloting != null || p.zip || p.cctv) return 'busy';
    const l = ladderAt(api.map().ladders, p.p, PLAYER.height);
    if (l && p.p[1] > l.min[1] + 0.4) return 'ladder';
    return null;
  }

  function drop(h, p, text) {
    h.carriedBy = null;
    if (p) {
      if (p.carry === h.id) p.carry = null;
      const s = heldSpot(p.p, p.yaw, (x, y, z) => !fits(x, y, z));
      h.p = fits(...s) ? s : p.p.slice();
      if (text) msg(p, text);
    }
    h.v = [0, 0, 0];
    h.onGround = false;
  }

  return {
    hurt: h => (hurt(h) ? 1 : 0),
    // every tick, after the hostages move: badly hurt ones stop walking; carried ones go with their carriers
    tick() {
      for (const h of game.hostages) {
        if ((h.state === 'follow' || h.state === 'escape') && hurt(h)) {
          const l = players.get(h.leader);
          Object.assign(h, { state: 'idle', leader: null, trail: [] });
          h.v[0] = h.v[2] = 0;
          if (l) msg(l, 'The hostage is badly hurt and can\'t walk. Carry it: press E on it.');
        }
        if (h.carriedBy == null) continue;
        const p = players.get(h.carriedBy), why = ends(p, h);
        if (why) { drop(h, why === 'left' ? null : p, why === 'ladder' ? "You can't climb with a hostage on your shoulders: you put it down." : null); continue; }
        h.p = p.p.slice();
        h.yaw = p.yaw;
        h.v = [0, 0, 0];
        if (api.inRescueZone(h.p)) { h.carriedBy = null; p.carry = null; h.leader = p.id; api.rescue(h); }
      }
    },
    // E: a carrier puts his hostage down; a CT picks up a badly hurt one (a tied one: cut the ties first).
    use(p, t) {
      const mine = carried(p);
      if (mine) { drop(mine, p, 'You put the hostage down.'); return true; }
      p.carry = null;
      if (p.team !== 'CT' || p.bot || !p.alive || !game.hostages.length || (game.phase !== 'live' && game.phase !== 'warmup')) return false;
      const h = game.hostages
        .filter(x => x.state === 'idle' && hurt(x) && x.heldBy == null && x.carriedBy == null && !((x.tiedUntil || 0) > t) && api.reach(p, x))
        .sort((a, b) => d3(p.p, a.p) - d3(p.p, b.p))[0];
      if (!h) return false;
      if (!p.inv.secondary) { msg(p, 'You need a pistol to carry a hostage (your hands are full).'); return true; }
      Object.assign(h, { carriedBy: p.id, leader: null, trail: [] });
      p.carry = h.id;
      p.act = null;
      msg(p, 'You carry the wounded hostage: walk it to the CT base. Pistol only; E puts it down.');
      api.broadcast({ t: 'sfx', s: 'hostage', p: h.p });
      return true;
    },
    // a carrier fires only his pistol
    noFire: (p, w) => !!carried(p) && w !== p.inv.secondary?.id,
    // a shot against a carried hostage: the box across its carrier's shoulders where the shooter saw him (never the
    // carrier's own shot)
    ray(h, shooter, o, d, rt, maxT) {
      const p = players.get(h.carriedBy);
      if (!p || p === shooter) return null;
      const b = carriedBox(api.rewind(p, rt).p, p.yaw);
      const hit = rayAABB(o, d, b.min, b.max, maxT);
      return hit && hit.t <= maxT ? { t: hit.t, part: 'chest' } : null;
    },
  };
}
