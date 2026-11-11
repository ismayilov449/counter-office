// Close combat (ROADMAP group 8, rules in shared/closecombat.js; docs/features/closecombat.md). server.js calls in at a
// few hooks marked "closecombat:". Bots don't use any of it.
// State: p.inv.sup = 1 with a suppressor (bought; lost with a death, like the rest of the inventory).
import { WEAPONS, slotKey } from '../shared/weapons.js';
import { CC, supFits, behind } from '../shared/closecombat.js';

// api: { game, players, send, broadcast, sendMe, now, mates(a, b), eyeOf(p), lineOfSight(a, b), spawnDrop(p, item, at, thrown),
//   blocked(p) (in a car, on a gadget, holding or carrying a hostage, lying on the floor...), noDisarm() (Gun Game, Zombie) }
export function createCloseCombat(api) {
  const { game, players, send, broadcast } = api;
  // ---- 8.1 suppressors
  const suppressed = (p, w) => !!p.inv?.sup && supFits(w);
  // onShoot's weapon: a suppressed gun is a copy with less damage and `sup` set (onShoot reads def.damage everywhere).
  function def(p, w) {
    const d = WEAPONS[w];
    return d && suppressed(p, w) ? { ...d, damage: d.damage * CC.damage, sup: true } : d;
  }

  // ---- 8.2 disarming from behind: E within reach of an enemy, inside his back arc, snatches the gun in his hands.
  // The gun goes into the same slot of ours if it's free, else onto the floor in front of us. He keeps his other
  // weapons and is switched to his knife.
  const gunInHands = q => { const slot = slotKey(q.w); return slot && q.inv[slot]?.id === q.w ? slot : null; };
  function victim(p) {
    for (const q of players.values()) {
      if (q === p || !q.alive || q.downed || q.bot || q.zombie || api.mates(p, q) || !inTeam(q) || api.blocked(q) || !gunInHands(q)) continue;
      if (Math.hypot(q.p[0] - p.p[0], q.p[2] - p.p[2]) > CC.reach || Math.abs(q.p[1] - p.p[1]) > CC.reachY) continue;
      if (behind(p.p, q.p, q.yaw) && api.lineOfSight(api.eyeOf(p), api.eyeOf(q))) return q;
    }
    return null;
  }
  function disarm(p, t) {
    if (!p.alive || p.downed || p.bot || p.zombie || !inTeam(p) || api.noDisarm() || game.phase === 'freeze' || api.blocked(p)) return false;
    if (t - (p.ccDisarmAt || 0) < CC.cooldown * 1000) return false;
    const v = victim(p);
    if (!v) return false;
    const slot = gunInHands(v), item = v.inv[slot], name = WEAPONS[item.id].name;
    v.inv[slot] = null;
    if (v.reloadWeapon === item.id) v.reloadUntil = 0;
    const kept = !p.inv[slot];
    if (kept) p.inv[slot] = item;
    // (on the floor half a metre in front of us; it's his drop, so for dropGuard s he can't walk over it to take it back)
    else api.spawnDrop(v, item, [p.p[0] - Math.sin(p.yaw) * 0.5, p.p[1], p.p[2] - Math.cos(p.yaw) * 0.5]).until = t + CC.dropGuard * 1000;
    p.ccDisarmAt = t;
    api.sendMe(p);
    api.sendMe(v);
    send(v, { t: 'ccDisarmed', by: p.id, w: item.id });
    send(v, { t: 'msg', text: `You were disarmed! ${p.name} snatched your ${name} from behind.`, big: true });
    send(p, { t: 'msg', text: kept ? `You snatched his ${name}.` : `You snatched his ${name}: it's on the floor in front of you.` });
    broadcast({ t: 'sfx', s: 'pickup', p: v.p });
    return true;
  }

  return { def, suppressed, disarm };
}
const inTeam = p => p.team === 'T' || p.team === 'CT';
