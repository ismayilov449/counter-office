// The bomb still works with "Downed, not dead" (de_dust2, GAME_PORT test server with BOTS=0 START_MONEY=16000):
// 2 v 2 scripted on site A. The bomb carrier is downed on the site and can't plant (or use anything); his teammate
// revives him; he plants (3 s); a CT defuses (10 s, no kit) and the round ends "Bomb has been defused".
import { player, sleep } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };
const world = new CollisionWorld(MAPS.de_dust2);
const ground = (x, z, from = 12) => { const h = world.raycast([x, from, z], [0, -1, 0], 20, 'solid'); return h ? from - h.t : 0; };
const los = (a, b) => { const d = b.map((v, i) => v - a[i]), l = Math.hypot(...d); const h = world.raycast(a, d.map(v => v / l), l, 'bullet'); return !h || h.t >= l - 0.05; };
// a spot on site A, and a spot 6 m away with a clear shot at a man standing there and at the floor
const site = [39, 0, -35]; site[1] = ground(site[0], site[2]);
let gun = null;
for (const [dx, dz] of [[-6, 0], [6, 0], [0, 6], [0, -6], [-4, 4], [4, 4], [-4, -4], [4, -4]]) {
  const p = [site[0] + dx, 0, site[2] + dz]; p[1] = ground(p[0], p[2]);
  const eye = [p[0], p[1] + 1.62, p[2]];
  if (Math.abs(p[1] - site[1]) < 0.3 && los(eye, [site[0], site[1] + 1.2, site[2]]) && los(eye, [site[0], site[1] + 0.2, site[2]])) { gun = p; break; }
}
ok(`a shooting spot by site A ${JSON.stringify(gun)} (site floor ${site[1].toFixed(2)})`, !!gun);
const A = await player('Alpha', 'T'), C1 = await player('Charlie', 'CT'), B = await player('Bravo', 'T'), C2 = await player('Cathy', 'CT');
const all = [A, B, C1, C2];
for (const c of all) { c.slow = {}; c.on.s = m => { c.snap = m; if ('b' in m) c.slow.b = m.b; }; }
const ids = {}; for (const c of all) ids[c === A ? 'A' : c === B ? 'B' : c === C1 ? 'C1' : 'C2'] = c.log.find(m => m.t === 'welcome')?.id;
C1.w = 'usp'; C2.w = 'usp';
ok('round starts', await until(() => A.got('round').length > 0, 30000));
const carrier = [A, B].find(c => c.got('msg').some(m => /You have the bomb/.test(m.text)));
const mate = carrier === A ? B : A;
ok('a Terrorist carries the bomb', !!carrier);
await sleep(3400);
const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
carrier.at(site, 0); mate.at([site[0] + 0.6, site[1], site[2]], Math.PI / 2); C1.at(gun, yawTo(gun, site)); C2.at([site[0] - 20, ground(site[0] - 20, site[2]), site[2] + 30], 0);
await sleep(700);
// downed on the site (the teammate steps aside so he isn't in the line of fire)
mate.at([site[0] + 3, site[1], site[2] + 3], 0); await sleep(500);
for (let i = 0; i < 12 && !carrier.got('bodyDown').length; i++) {
  const o = [gun[0], gun[1] + 1.62, gun[2]], to = [site[0], site[1] + 1.2, site[2]], d = to.map((v, j) => v - o[j]), l = Math.hypot(...d);
  C1.send({ t: 'shoot', o, d: d.map(v => v / l), w: 'usp', rt: 0 }); await sleep(380);
}
ok('the bomb carrier is down on the site', carrier.got('bodyDown').length === 1);
carrier.use(true); await sleep(3600); carrier.use(false);
ok(`a downed carrier can't plant (bomb ${C1.slow.b?.s})`, C1.slow.b?.s !== 'planted' && !carrier.snap?.me);
mate.at([site[0] + 0.6, site[1], site[2]], Math.PI / 2); await sleep(400);
mate.use(true);
ok('revived by his teammate', await until(() => carrier.got('bodyUp').some(m => m.v === ids[carrier === A ? 'A' : 'B']), 6500));
mate.use(false);
await sleep(300);
carrier.use(true);
ok(`planting (act ${carrier.snap?.me?.a})`, await until(() => carrier.snap?.me?.a === 'plant', 1000));
ok('planted after 3 s', await until(() => C1.slow.b?.s === 'planted', 4000));
carrier.use(false);
const bp = C1.slow.b.p;
C1.at([bp[0] + 0.5, bp[1], bp[2]], 0); await sleep(400);
C1.use(true);
ok(`defusing (act ${C1.snap?.me?.a})`, await until(() => C1.snap?.me?.a === 'defuse', 1000));
const re = await until(() => C1.got('roundEnd').length > 0, 11500);
ok(`defused: ${C1.got('roundEnd')[0]?.reason}`, re && /defused/.test(C1.got('roundEnd')[0].reason));
for (const c of all) c.close();
process.exit();
