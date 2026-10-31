// The mansion's cat (cs_mansion and cs_mansion_night): what the server (lib/cat.js) and the browsers
// (public/js/cat.js) both need to know. The server moves it and sends it in every snapshot as
//   cat: [x, y, z, yaw, state, purring]
// and its voice as { t: 'catMeow', p, k } (k: one of CAT.SOUNDS).

export const CAT_MAPS = ['cs_mansion', 'cs_mansion_night'];
export const catMap = map => !!map && CAT_MAPS.includes(map.id);

// What it's doing (the snapshot's state): the browsers pose and animate it from this.
export const CAT_STATE = { sit: 0, walk: 1, trot: 2, run: 3, wash: 4, stretch: 5, hide: 6, air: 7, sleep: 8, loaf: 9 };
export const CAT_SOUNDS = ['meow', 'mrrp', 'screech', 'hiss'];

export const CAT = {
  // Its basket (in the living room, by the sofa) and its bowl (in the kitchen): drawn by the browsers, it starts
  // every round asleep in the basket.
  basket: [-22.55, 0.91, 3.85],
  bowl: [-17.2, 0.81, -13.55],
  // speeds (m/s)
  walk: 0.85, trot: 2.0, run: 5.2,
  // the AI thinks this often (ms); moving along its path happens every tick
  think: 200,
  // Its favourite spots: where it goes (pos: about where, snapped to the nearest floor the bots' nav grid knows; perch:
  // an exact spot it hops onto from there, like the sofa or a window sill), which way it faces there, what it does
  // there and how much it likes it. Spots it can't reach (a closed door in the way) are skipped for a while.
  spots: [
    { id: 'sofa', pos: [-22.3, 0.91, 0.0], perch: [-22.86, 1.32, 0.0], yaw: -Math.PI / 2, do: ['loaf', 'sleep', 'wash'], w: 3 },
    { id: 'basket', pos: [-22.1, 0.91, 3.7], perch: [-22.55, 0.96, 3.85], yaw: -Math.PI / 2, do: ['sleep', 'loaf'], w: 2 },
    { id: 'bowl', pos: [-17.2, 0.81, -13.0], perch: [-17.2, 0.81, -13.25], yaw: 0, do: ['sit', 'wash'], w: 2 },
    { id: 'kitchen', pos: [-19.5, 0.81, -9.0], do: ['sit', 'wash', 'loaf'], w: 1 },
    { id: 'stairs', pos: [-12.2, 2.5, -6.6], do: ['sit', 'loaf'], w: 2 },
    { id: 'sunwindow', pos: [-7.4, 0.81, -11.98], perch: [-6.72, 1.63, -11.98], yaw: -Math.PI / 2, do: ['sit', 'loaf', 'wash'], w: 3 },
    { id: 'upwindow', pos: [-7.4, 4.27, 8.95], perch: [-6.72, 5.08, 8.95], yaw: -Math.PI / 2, do: ['sit', 'loaf'], w: 1 },
    { id: 'bedroom', pos: [-20.0, 4.27, 8.5], do: ['loaf', 'sleep', 'wash'], w: 1 },
    { id: 'terrace', pos: [-5.3, 4.27, 3.3], perch: [-6.1, 4.72, 3.3], yaw: -Math.PI / 2, do: ['loaf', 'sit', 'wash'], w: 2 },
    { id: 'cellar', pos: [-18.0, -2.2, -1.5], do: ['sit', 'loaf'], w: 1 },
    { id: 'garden', pos: [-37.5, 0.0, 1.5], do: ['sit', 'wash', 'loaf'], w: 2 },
    { id: 'gazebo', pos: [-45.2, 0.3, 0.0], do: ['loaf', 'sleep'], w: 1 },
    { id: 'lawn', pos: [2.0, 0.0, 9.0], do: ['sit', 'wash', 'loaf'], w: 1 },
    { id: 'shed', pos: [15.5, 0.2, 16.4], do: ['sit', 'loaf'], w: 1 },
  ],
  // following a player who stood still next to it
  follow: { near: 3.5, still: 3, keep: 1.3, lose: 14, max: 45 },
  // going to a hidden player (camo on, crouched in a dark room, or playing dead) and meowing at them
  seek: { every: 8, chance: 0.35, range: 16, cooldown: 50, meows: 3 },
  // purring when someone is right next to it
  purr: 1.15,
  // scared: gunfire within `hear` m, a blast within REAL.push radius × `blastHear`; thrown by a blast within its push
  // radius (or a bullet); then it runs and hides for hide seconds
  hear: 22, blastHear: 3, hide: [12, 22],
};
