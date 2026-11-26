// Mansion scares (both Mansion maps only; lib/haunt.js and public/js/haunt.js).
// Ghosts: a player killed this round presses G to float free as a ghost (WASD, Space up, Ctrl down, through walls) and
//   once a round scares a living enemy near them (within near m): 1 knocks hard on the wall they look at, 2 flickers the
//   lights of the room they're in, 3 slams the nearest open door shut (within door m; a shut one rattles violently).
// Rigged doors and the lift: a Terrorist with the HE grenade in hand holds E at a closed door (or inside the lift's
//   cabin) for `time` s to tie it there. The door opening (by anyone, any way) pulls the pin: a ping, the grenade drops
//   and goes off `fuse` s later. The lift's goes off `liftFuse` s after its doors next open at another floor. A crouched
//   CT holds E at
//   it for `disarm` s to take it apart (and keep the grenade); the Ts' own side takes it back in `undo` s. CTs see the
//   grenade only up close (seen m); Terrorists see their side's from `mates` m.
export const HAUNT = { near: 10, fly: 6, reach: 6, door: 4, flicker: 1.6 };
export const RIG = { time: 2.5, disarm: 3, undo: 1, reach: 1.6, fuse: 1.5, liftFuse: 1, seen: 2.5, mates: 15 };
export const KINDS = ['knock', 'flicker', 'slam'];
export const hauntOn = map => !!map?.mansion2;
