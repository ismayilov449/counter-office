// Close combat (ROADMAP group 8; docs/features/closecombat.md). Used by lib/closecombat.js and public/js/closecombat.js.
// 8.1 Suppressor (buy menu, Equipment, ITEMS.sup): on all your pistols, SMGs and rifles until you die. A suppressed
//     shot does `damage` of the damage, is heard only nearby, has no muzzle flash (no light in the dark, no spark
//     for the gas).
// 8.2 Disarm from behind: E within `reach` m of an enemy, inside his back arc (`arc` radians each side of straight
//     behind), snatches the gun in his hands. `cooldown` s between tries. Dropped (our slot is full): he can't walk
//     over it to take it back for `dropGuard` s.
// 8.3 Door fights: E while running (at least `run` m/s) kicks a closed door open: `damage` and a shove (`push` m/s)
//     to anyone within `hitReach` m behind it. Crouched, hold E on a closed door to hold it shut (a tap under `tap` s
//     still just opens it); E from the other side pushes. More pushers than holders for `win` s: it bursts open.
import { WEAPONS } from './weapons.js';

export const CC = {
  damage: 0.9,
  reach: 1.5, reachY: 0.8, arc: Math.PI / 3, cooldown: 3, dropGuard: 3,
  run: 4.2, hitReach: 1.5, kickDamage: 15, push: 7, aim: 0.4,
  tap: 0.3, win: 1,
};

// Guns a suppressor fits: pistols, SMGs and rifles (the snipers are their own class, as are shotguns and the M249).
export const supFits = id => ['pistol', 'smg', 'rifle'].includes(WEAPONS[id]?.cls);

// Is a (attacker's feet) inside the back arc of a victim at v looking along yaw? (forward is (-sin yaw, -cos yaw))
export function behind(a, v, yaw) {
  const off = Math.atan2(-(a[0] - v[0]), -(a[2] - v[2])) - yaw;
  return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) >= Math.PI - CC.arc;
}
