// Explosives (ROADMAP group 7; docs/features/explosives.md). Used by lib/explosives.js and public/js/explosives.js.
// 7.1 Throw a grenade back: E on an HE grenade by your feet (reach m, with at least grabLeft s of fuse left) puts it in
//     your hand; Mouse1 throws it with what's left of its fuse. Too slow: it goes off in your hand (inHand damage).
// 7.2 Booby-trapped body: a crouched Terrorist with an HE holds E over a dead teammate (trap s) to hide it under him.
//     A CT pressing E on that body (looking, or starting to take the uniform) sets it off: an HE blast at the body.
//     Up close (pinSeen m) a tiny grenade pin shows by the body.
// 7.3 Dead man's switch: right-click with the detonator (phone) out arms it; switching away lets go of it safely.
//     Killed or downed while armed: all his satchels go off. CTs who see him (within warn m) are told.
// 7.4 Cut the wire: while defusing the bomb or a satchel, 1 cuts the red wire, 2 the blue: right, defused at once;
//     wrong, it goes off.
export const XP = { reach: 1.5, grabLeft: 0.8, inHand: 400, trap: 2, trapReach: 1.4, trapReachY: 1.2, warn: 20, pinSeen: 2.5 };
export const WIRES = ['red', 'blue'];
