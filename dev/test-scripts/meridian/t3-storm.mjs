// cs_meridian stage 3, offline (no server; node dev/test-scripts/meridian/t3-storm.mjs):
//  - the storm (lib/storm.js) over 20 simulated minutes: strikes every 7-16 s, some knock the power out (every room's
//    lights off, 'lights' marked storm), it always comes back on by itself within 10-18 s, never two cuts at once;
//    a new round brings the power back
//  - the guest-room hostage starts in a different room from round to round (createHostages, map.hostages[3].anyOf)
//  - every one of its 16 spots stands on a floor, free, and the bots' grid reaches it from the CT spawn
import { MAPS } from '../../../shared/maps/index.js';
import { createStorm, STORM } from '../../../lib/storm.js';
import { createHostages } from '../../../lib/hostages.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { overlapsAny, PLAYER } from '../../../shared/physics.js';
import { buildNav } from '../../../lib/nav.js';
const M = MAPS.cs_meridian;
let fails = 0;
const ok = (what, c) => { console.log((c ? 'OK   ' : 'FAIL ') + what); if (!c) fails++; };
let seed = 12345; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const game = { lights: {} }, sent = [];
let T = 0;
const storm = createStorm({ game, map: () => M, now: () => T, broadcast: m => sent.push({ ...m, at: T, lights: m.lights && { ...m.lights } }) });
storm.roundStart(0);
for (T = 0; T < 20 * 60000; T += 31) storm.tick(T);
const strikes = sent.filter(m => m.t === 'storm'), cuts = sent.filter(m => m.t === 'lights' && Object.values(m.lights).some(v => v === false)), backs = sent.filter(m => m.t === 'lights' && !Object.keys(m.lights).length);
const gaps = strikes.slice(1).map((m, i) => (m.at - strikes[i].at) / 1000);
ok(`${strikes.length} strikes in 20 min, ${Math.min(...gaps).toFixed(1)}-${Math.max(...gaps).toFixed(1)} s apart`, strikes.length > 60 && Math.min(...gaps) >= STORM.every[0] - 0.1 && Math.max(...gaps) <= STORM.every[1] + 0.1);
ok(`${cuts.length} power cuts, each putting out all ${new Set(M.rooms.map(r => r.group)).size} rooms' lights`, cuts.length >= 3 && cuts.every(m => m.storm === 1 && M.rooms.every(r => m.lights[r.group] === false)));
const lens = cuts.filter(c => c.at < 20 * 60000 - STORM.dark[1] * 1000).map(c => { const b = backs.find(x => x.at > c.at); return b ? (b.at - c.at) / 1000 : Infinity; });
ok(`the power always comes back by itself (${Math.min(...lens).toFixed(1)}-${Math.max(...lens).toFixed(1)} s)`, lens.every(s => s >= STORM.dark[0] - 0.1 && s <= STORM.dark[1] + 0.1));
ok('never a second cut while the power is out', cuts.every((c, i) => !cuts[i + 1] || cuts[i + 1].at > c.at + lens[i] * 1000 - 1));
game.lights = { lobby: false }; storm.roundStart(T); for (let k = 0; k < 5; k++) storm.tick(T += 31);
const spots = new Set(Array.from({ length: 30 }, () => createHostages(M)[3].p.join(',')));
ok(`the guest-room hostage starts in ${spots.size} different rooms over 30 rounds (of ${M.hostages[3].anyOf.length})`, spots.size >= 8 && [...spots].every(s => M.hostages[3].anyOf.some(a => a.join(',') === s)));
ok('the other hostages stay where they are', createHostages(M).slice(0, 3).every((h, i) => h.p.join(',') === M.hostages[i].p.join(',')));
const w = new CollisionWorld(M), nav = buildNav(M, w);
const floorUnder = p => { const h = w.raycast([p[0], p[1] + 0.5, p[2]], [0, -1, 0], 1.5, 'solid'); return h ? p[1] + 0.5 - h.t : null; };
const ct = nav.nodeAt(M.spawns.CT[0].p, 4);
const bad = M.hostages[3].anyOf.filter(p => {
  const f = floorUnder(p);
  if (f == null || Math.abs(f - p[1]) > 0.1 || overlapsAny(w.move(null, p, 2), p[0], f + 0.05, p[2], PLAYER.radius, PLAYER.height - 0.05)) return true;
  const n = nav.nodeAt(p, 3);
  return n < 0 || !nav.path(ct, n, false);
});
ok(`all 16 spots on a floor, free and reachable from the CT spawn (${bad.length ? 'bad: ' + JSON.stringify(bad) : 'all'})`, !bad.length);
console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
