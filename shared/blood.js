// Blood trails: a player wounded by a bullet, a knife, a zombie's claws (on armor) or shrapnel bleeds for a while,
// leaving drops of blood on the floor, until it stops by itself or they bandage (P). The server decides who bleeds
// and how much (lib/blood.js) and says so in every snapshot (`bl`); each browser drops the blood itself behind the
// players it sees bleeding (public/js/blood.js), so no drop crosses the network.
export const BLOOD = {
  secs: 20,                    // a wound bleeds this long (counted from the last wound)
  medium: 30, heavy: 60,       // wound damage, added up while bleeding, for a medium and a heavy bleed
  spacing: [0, 0.85, 0.7, 0.5], // metres moved between two drops (by level: 1 light, 2 medium, 3 heavy)
  idle: [0, 4, 2.2, 1.1],      // seconds between drops while standing still
  size: [0, 0.16, 0.22, 0.3],  // a drop's size (m; the drop itself is about half of it, the rest small splashes)
  drain: [0, 0, 5, 2.5],       // seconds per 1 HP lost to bleeding (0: none) ...
  minHp: 10,                   // ... never below this: bleeding alone never kills
  life: 40,                    // seconds a drop stays on the floor (fading out over the last `fade`)
  fade: 10,
  max: 600,                    // drops at once, all maps: the oldest go first
  bandage: 2,                  // seconds to bandage (no shooting, slow walking)
  bandages: 2,                 // bandages per life
  slow: 0.45,                  // walking speed while bandaging
  downed: 3,                   // a downed player (p.downed) bleeds like a heavy wound, all the time
};

// The bleeding level for the wound damage added up so far.
export const bleedLevel = dmg => (dmg >= BLOOD.heavy ? 3 : dmg >= BLOOD.medium ? 2 : 1);

// Snapshot `bl`: [id, level 1..3, flags]; flags: BL_BANDAGING (bandaging now), BL_NODROPS (in a car: no drops).
export const BL_BANDAGING = 1, BL_NODROPS = 2;
