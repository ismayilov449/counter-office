// Throws into the air vents' grilles, for the tests: from a spot, the browser's own throw (main.js throwNade: from
// the eye, 0.4 m out and 0.1 m down, 21 m/s or a 10 m/s lob, plus a little lift) aimed at the grille, searched over
// the pitch and a little yaw until the game's grenade physics (simulateNade on a fresh world: doors shut, nothing
// broken) takes it into that grille's mouth first.
const G = new URL('../../../', import.meta.url).href;
const { NADE, simulateNade, PLAYER } = await import(G + 'shared/physics.js');
const { nadeIntoVent } = await import(G + 'shared/underground.js');

// The spot each grille is thrown at from (feet; on clear floor at the room's height) and how.
export const SPOTS = [
  { g: 0, from: [-21.4, -2.2, 1.5] }, // in the cellar, 1.5 m out from its west wall
  { g: 1, from: [-26.5, 0, 1.5] }, // on the back lawn, 2.8 m from the house
  { g: 2, from: [-20.05, 0.813, -8.9] }, // in the kitchen, under its ceiling grille
  { g: 3, from: [-18.35, 4.267, -9.9] }, // in the bedroom upstairs, by the floor grille
  { g: 4, from: [-9.35, 0.813, -12.6] }, // in the room downstairs, under its ceiling grille
  { g: 5, from: [-7.75, 4.267, -11.9] }, // in the security room, by the floor grille
];

export function throwFrom(feet, yaw, pitch, strong) {
  const eye = [feet[0], feet[1] + PLAYER.eye, feet[2]];
  const p = pitch + (strong ? 0.08 : 0.2), cp = Math.cos(p);
  const d = [-Math.sin(yaw) * cp, Math.sin(p), -Math.cos(yaw) * cp];
  const o = [eye[0] + d[0] * 0.4, eye[1] + d[1] * 0.4 - 0.1, eye[2] + d[2] * 0.4];
  const sp = strong ? 21 : 10;
  return { o, v: [d[0] * sp, d[1] * sp + (strong ? 1.5 : 1), d[2] * sp], yaw, pitch };
}

// The quickest throw from `feet` that goes into grille g first (null if none found), with where in its path it goes in.
export function findThrow(world, vents, g, feet, fuse = 1.6, impact = false) {
  const c = g.c, yaw0 = Math.atan2(-(c[0] - feet[0]), -(c[2] - feet[2]));
  let best = null;
  for (const strong of [false, true]) {
    for (let dy = 0; dy <= 0.3; dy += 0.1) {
      for (const sy of dy ? [1, -1] : [1]) {
        for (let pitch = -1.45; pitch <= 1.45; pitch += 0.05) {
          const t = throwFrom(feet, yaw0 + dy * sy, pitch, strong);
          const path = [];
          simulateNade(world.nade(), t.o, t.v, fuse, path, impact);
          const hit = nadeIntoVent(vents, path);
          if (hit && hit.g === g && (!best || hit.i < best.i)) best = { ...t, strong, i: hit.i, tIn: (hit.i + 1) * NADE.dt };
        }
      }
    }
  }
  return best;
}
