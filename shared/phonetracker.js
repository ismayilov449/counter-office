// Phone tracker (ROADMAP group 14, version 1): every living Terrorist carries a phone that is always on; the CTs have
// one tracker (a cell-site simulator) per team and hunt the phones with it. A phone that sits still gets found, a
// phone that moves stays fuzzy. Both Mansion maps, behind the admin switch CFG.phoneTracker (warOn, shared/war.js).
// Server: lib/phonetracker.js; browser: public/js/phonetracker.js.
// Version 2: cell towers (map.towers, shared/maps/mansion_phonetracker.js) a Terrorist can knock out and a CT repairs;
// scans from a CT's drone; the hostages' phones (white circles; a Terrorist takes one when he zip-ties the hostage).
//
// scans: per round (the team's one device); scanTime: s a scan takes (it shows where the phones were when it started);
// radar: s the circles stay on the CTs' radar; dead: s a dead Terrorist's phone keeps answering; heard: m round a
// scanned phone that its vibration is heard; floor: m within which a circle says the floor; finder: m within which the
// tracker turns into a direction finder; jam: m round a jammer that the tracker points at it; speed: m/s with it out;
// draw: ms to get a gun out after it.
export const TRACKER = {
  scans: 8, scanTime: 3, radar: 6, dead: 20, heard: 3, floor: 10, finder: 20, jam: 30, speed: 5.2, draw: 1000,
  // a circle's radius (m): base, + perM per metre away, + perWall per wall or floor in between (at most walls), x under
  // underground; x still for every scan in a row the phone hasn't moved more than `moved` m (not below min); a phone
  // walking (more than `walking` m in the half second before the scan) gets x moving and starts over
  circle: { base: 1, perM: 0.06, perWall: 0.75, walls: 6, under: 2, still: 0.6, min: 0.8, moved: 1.5, walking: 1, moving: 1.3 }, // (halved 2026-11-25: the user found them too big)
  // cell towers (14.5): bullets that knock one out, a blast within `blast` m does at once; s a CT holds E to repair one
  // from within `reach` m; every tower down makes the circles x(1 + worse) bigger
  tower: { hits: 10, blast: 4, repair: 5, reach: 1.6, worse: 0.5 },
  // the drone's antenna (14.6): a scan from a CT's drone (R while flying it) draws the circles of phones that are
  // outdoors x `outdoors` (sharper)
  drone: { outdoors: 0.5 },
};

// The radius of a phone's circle. d: m from the tracker; walls: walls/floors in between; under: underground; still:
// scans in a row it stood still; moving: it was walking when the scan began.
// towersDown: cell towers knocked out; sharp: x this (the drone's antenna on a phone outdoors)
export function circleRadius({ d, walls = 0, under = false, still = 0, moving = false, towersDown = 0, sharp = 1 }) {
  const C = TRACKER.circle;
  let r = C.base + d * C.perM + Math.min(walls, C.walls) * C.perWall;
  if (under) r *= C.under;
  r *= (1 + towersDown * TRACKER.tower.worse) * sharp;
  if (moving) return r * C.moving;
  return Math.max(C.min, r * C.still ** still);
}

// Where the circle is drawn: somewhere within half its radius of the phone (rnd: two numbers 0..1), so the phone is
// always inside it.
export function circleCentre(p, r, rnd = [Math.random(), Math.random()]) {
  const a = rnd[0] * Math.PI * 2, k = Math.sqrt(rnd[1]) * r * 0.5;
  return [p[0] + Math.cos(a) * k, p[2] + Math.sin(a) * k];
}

// The floor a circle names (within TRACKER.floor m).
export const floorOf = (p, under) => (under ? 'UNDERGROUND' : p[1] > 3 ? 'UPSTAIRS' : 'GROUND');

// Which way `to` lies from `from`, as a compass word (north: -z, the radar's up).
const WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function compass(from, to) {
  const a = Math.atan2(to[0] - from[0], -(to[2] - from[2])); // 0 north, clockwise
  return WORDS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
