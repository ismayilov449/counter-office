// Disguise (classic bomb/hostage rounds): crouch over a dead enemy and hold E for 3 s to put on their uniform. Until it
// breaks you look like one of them to the other team (their model, colours and the dead player's name tag), their radar
// doesn't spot you and their bots hold fire. Used by the server (lib/disguise.js) and the browser (public/js/disguise.js).
export const DISGUISE = {
  take: 3, // seconds crouched over the body
  reach: 1.4, // metres from the body (along the ground) to start
  reachY: 1.2, // and up or down
  still: 0.25, // moving this far (m) while changing cancels it
  recognise: 3, // an enemy this close who sees you (in sight, you in front of them) knows you (metres)
  recogniseFov: 1.0, // "in front of them": within this angle (radians) either side of where they look
  touch: 1.0, // this close they notice you whichever way they look (a knife reaches 1.9 m: sneak up from behind)
  revealRange: 20, // enemies this close hear the reveal and get the message
  rustleRange: 12, // the changing sound (cloth rustling) carries this far
};

// Why a disguise broke, as the HUD says it.
export const DISGUISE_WHY = {
  shot: 'you fired a shot',
  knife: 'you knifed someone',
  nade: 'you threw a grenade',
  plant: 'you started planting the bomb',
  defuse: 'you started defusing the bomb',
  near: 'an enemy saw you up close',
  hurt: 'an enemy hit you',
  downed: 'you went down',
  gone: 'its owner is back on his feet or has left',
};

// For the enemies who see through it: how they found out.
export const DISGUISE_THEY = {
  shot: 'opened fire',
  knife: 'pulled a knife',
  nade: 'threw a grenade',
  plant: 'started planting the bomb',
  defuse: 'started defusing the bomb',
  near: 'was recognised up close',
  hurt: 'took a hit from your side',
  downed: 'went down',
};

// Disguises exist only in classic matches' live rounds (not warmup, Deathmatch, Gun Game, Zombie or Hide and Seek).
export const disguiseAllowed = (mode, phase) => mode === 'classic' && phase === 'live';
