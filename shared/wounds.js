// "Downed & wounds" (ROADMAP group 1, docs/features/wounds.md): the numbers, shared by the server and the browser,
// and the two small rules both sides need (where on the body a bullet hit; what the wounds do).
//
// 1.1 Dragging a downed teammate: hold E on him and walk. 1.2 Interrogating a downed enemy (hold E 3 s: one of his
// mates shows on your team's radar for 5 s), and the downed suicide (hold K 5 s). 1.3 Wounds: a leg hit limps, an arm
// hit shakes the aim, a head graze blurs the sight; a bandage (P) halves them. 1.4 The adrenaline syringe: a 2 s revive,
// but the revived man gets up shaky and blurred for a while.
export const WOUNDS = {
  drag: {
    speed: 1.3, // m/s: the dragger's top speed (one hand on the collar, the pistol in the other)
    gap: 0.95, // m (flat) the body trails behind the dragger: the rope's length
    reach: 1.8, // m (flat) from the dragger to the downed teammate to take hold of him
    lose: 2.6, // m (flat): the body further than this from the dragger (he ran off, was moved): he lets go
    still: 0.35, // s without a movement key, E still held: the drag stops and the revive goes on
    hold: 800, // ms after a drag the server keeps the body where the drag left it, until his browser agrees (lib/wounds.js)
  },
  ask: 3, // s holding E on a downed enemy to interrogate him
  reveal: 5, // s the teammate he gives away shows on the interrogator's team's radar
  suicide: 5, // s a downed player holds K to shoot himself
  // wounds: level 1 fresh, 0.5 bandaged (a bandage halves the effect), 0 none; they last until death or the round ends
  leg: 0.7, // walking speed with a fresh leg wound (bandaged: 0.85)
  armSpread: 0.012, // spread (radians) a fresh arm wound adds to every shot
  armShake: 0.011, // radians the aim sways with a fresh arm wound
  headBlur: 3, // px: the sight's blur at the worst of a wave with a fresh head graze
  armSide: 0.2, // m: a chest or stomach hit this far out from the body's middle line is an arm hit
  adren: { // (its price: ITEMS.adren in shared/weapons.js, $400)
    revive: 2, // s: a revive with the syringe (5 without)
    after: 20, // s of shaking aim and blurred sight after getting up (fading out)
    shake: 0.016, // radians of sway at the start
    spread: 0.016, // spread at the start
    blur: 3.5, // px at the start
  },
};

// Is a torso hit an arm hit? hit: where the bullet struck; pos: the victim's feet (rewound); yaw: his facing. The
// hitbox is an upright box, so a shot from the side always lands on its side face, where the arm hangs.
export function armSide(hit, pos, yaw) {
  const dx = hit[0] - pos[0], dz = hit[2] - pos[2];
  return Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) >= WOUNDS.armSide;
}

// What the wounds do. w: { l, a, h } (0, 0.5 or 1 each); ad: 0..1, how much of the adrenaline's after-effect is left.
// speed: a factor on the walking speed; spread: radians added to every shot; shake: radians of aim sway; blur: px.
export function woundFx(w, ad = 0) {
  const A = WOUNDS.adren;
  return {
    speed: 1 - (1 - WOUNDS.leg) * (w?.l || 0),
    spread: WOUNDS.armSpread * (w?.a || 0) + A.spread * ad,
    shake: WOUNDS.armShake * (w?.a || 0) + A.shake * ad,
    blur: Math.max(WOUNDS.headBlur * (w?.h || 0), A.blur * ad),
  };
}
