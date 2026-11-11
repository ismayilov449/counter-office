// Close combat (ROADMAP group 8, rules in shared/closecombat.js; docs/features/closecombat.md). server.js calls in at a
// few hooks marked "closecombat:". Bots don't use any of it.
// State: p.inv.sup = 1 with a suppressor (bought; lost with a death, like the rest of the inventory).
import { WEAPONS } from '../shared/weapons.js';
import { CC, supFits } from '../shared/closecombat.js';

// api: { game, players, send, broadcast, sendMe, now }
export function createCloseCombat(api) {
  // ---- 8.1 suppressors
  const suppressed = (p, w) => !!p.inv?.sup && supFits(w);
  // onShoot's weapon: a suppressed gun is a copy with less damage and `sup` set (onShoot reads def.damage everywhere).
  function def(p, w) {
    const d = WEAPONS[w];
    return d && suppressed(p, w) ? { ...d, damage: d.damage * CC.damage, sup: true } : d;
  }

  return { def, suppressed };
}
