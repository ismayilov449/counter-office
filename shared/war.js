// War (ROADMAP group 13): make it feel like a war, not a game. Both features work only on the two Mansion maps, each
// behind its own admin switch (CFG.medicCalls, CFG.noKillConfirm; off by default, like the RPG-7's).
// 13.1 the wounded call for help: a downed player screams for a medic every `every` s (a groan in between), heard by
//      both teams within `heard` m, muffled through walls (public/js/gore.js).
// 13.2 no kill confirmation: while the round is on, no hit marker, kill feed, kill announcements or kill money, and on
//      the team bar and the scoreboard the enemies all look alive and nobody's kills move, even for the dead. The
//      round's kill feed shows when it ends, and the kill money is paid then (server.js; the browser: main.js).
export const WAR_MAPS = ['cs_mansion', 'cs_mansion_night'];
export const MEDIC = { every: 5, heard: 30 };
// flag: the admin's switch; map: the map now
export const warOn = (flag, map) => !!flag && WAR_MAPS.includes(map?.id);
