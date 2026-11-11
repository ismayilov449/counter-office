// Hostages try to escape (ROADMAP 6.1): a hostage no Terrorist has watched for `after` s sneaks off to the street on
// its own (speed m/s). A Terrorist who gets within `catchAt` m of it in sight stops it. A crouched Terrorist holds E
// on a hostage `tie` s to zip-tie it: a tied hostage can't escape or be led until a CT holds E `untie` s to cut the
// ties (then it follows him). The ties work loose after `loose` s, so the Terrorists have to keep going round.
// sight: how far a Terrorist watches a hostage from (with nothing in between). Snapshot: `hs` entries get a 8th value,
// 1 while tied.
export const ESCAPE = { after: 20, sight: 12, catchAt: 4, speed: 1.7, tie: 2, untie: 2, loose: 60, reach: 2.2 };
