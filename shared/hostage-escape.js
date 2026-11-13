// Hostages try to escape (ROADMAP 6.1): a hostage no Terrorist has watched for `after` s sneaks off to the CT base (the rescue zone) on
// its own (speed m/s). A Terrorist who gets within `catchAt` m of it in sight stops it. A crouched Terrorist holds E
// on a hostage `tie` s to zip-tie it: a tied hostage can't escape or be led until a CT holds E `untie` s to cut the
// ties (then it follows him). The ties work loose after `loose` s, so the Terrorists have to keep going round.
// sight: how far a Terrorist watches a hostage from (with nothing in between). Snapshot: `hs` entries get a 8th value,
// 1 while tied.
export const ESCAPE = { after: 20, sight: 12, catchAt: 4, speed: 1.7, tie: 2, untie: 2, loose: 60, reach: 2.2 };
// Hostages panic (ROADMAP 11.2): a gunshot within `shot` m (a suppressed one within `quiet` m) or a blast within
// `blast` m scares the hostages there (heard, walls or not): they duck, hands over their heads, for `duck` s (the
// bullets' hitbox is the crouched one). For `fight` s after a scare a hostage no Terrorist watches bolts after only
// `after` s (instead of ESCAPE.after), running (`speed` m/s) the escape's way, and can be hit in the crossfire.
// Snapshot: `hs` entries get an 11th value, 1 while ducking.
export const PANIC = { shot: 12, quiet: 3, blast: 20, duck: 4, fight: 10, after: 6, speed: 4.2 };
// Hostages talk (ROADMAP 11.3): a hostage remembers the Terrorists it saw (within `sees` m, in sight) for `memory`
// s; the first time a CT gets it to follow him (led or untied) it tells the CTs where, on their radio.
export const TALK = { sees: 20, memory: 30 };
