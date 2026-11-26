// The SWAT helicopter, stage 2, the server's part (ROADMAP 18): the door gunners and the fast rope. Fresh test server:
// GAME_PORT=3995 MAP=cs_mansion BOTS=0 FREEZE_TIME=1 (no browser). Alice (the pilot), Carol (a passenger), Dave (a door
// gunner), all CT; Bob (T) on the street.
// Alice flies it up and hovers; Dave fires his door gun down at Bob: hit (the helicopter's own floor isn't in the way);
// Carol slides down the rope to the street, unhurt; Alice flies off fast and Dave gets out: no rope at that speed, he
// jumps (and falls).
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { HELI, GUNNERS } from '../../../shared/heli.js';
const ok = checker();
const H = MAPS.cs_mansion.heli, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const carol = await player('Carol', 'CT');
const dave = await player('Dave', 'CT');
await until(() => dave.id() != null, 3000);
const daveId = dave.id();
await nextLive([alice, bob, carol, dave], st);
await until(() => alice.snap?.ph === 'live', 8000);
await sleep(300);
const use = async (p, ms = 100) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(200); };
const hl = () => alice.snap?.hl;
for (const c of [alice, carol, dave]) { c.at([H.p[0] - 2.2, 0, H.p[2]], 0, 0); await sleep(150); await use(c); }
ok(`seats: Alice the pilot, Carol 1, Dave a door gunner (${[alice, carol, dave].map(c => got(c, 'heliIn').at(-1)?.seat)})`, got(alice, 'heliIn').at(-1)?.seat === 0 && got(carol, 'heliIn').at(-1)?.seat === 1 && GUNNERS.includes(got(dave, 'heliIn').at(-1)?.seat));
// Q on the ground: Carol to the free door gun and back
carol.send({ t: 'heliSeat' });
ok(`on the ground, Q takes Carol to the other door gun (${got(carol, 'heliIn').at(-1)?.seat})`, await until(() => GUNNERS.includes(got(carol, 'heliIn').at(-1)?.seat), 1000));
carol.send({ t: 'heliSeat' });
ok(`and Q again back to her seat (${got(carol, 'heliIn').at(-1)?.seat})`, await until(() => got(carol, 'heliIn').at(-1)?.seat === 1, 1000));
const fly = async (to, secs, v = null) => {
  const from = hl().slice(0, 3), n = Math.round(secs * 20);
  for (let i = 1; i <= n; i++) {
    const p = from.map((x, k) => x + ((to[k] - x) * i) / n);
    alice.send({ t: 'heli', p, yaw: 0, v: v || [0, 0, 0], tilt: 0, roll: 0, air: p[1] > 0.2 ? 1 : 0 });
    await sleep(50);
  }
};
await fly([H.p[0], 8, H.p[2] + 3], 3); // (over the lawn: north of the pad is the pool)
const hover = setInterval(() => alice.send({ t: 'heli', p: hl().slice(0, 3), yaw: 0, v: [0, 0, 0], tilt: 0, roll: 0, air: 1 }), 50);
await sleep(300);
const n0 = got(carol, 'heliIn').length;
carol.send({ t: 'heliSeat' });
await sleep(400);
ok('in the air, Q changes nothing', got(carol, 'heliIn').length === n0);
// Dave fires the door gun at Bob below
bob.at([H.p[0], 0, H.p[2] + 6], 0, 0);
await sleep(300);
const drow = carol.snap.pl.find(r => r[0] === daveId);
const eye = [drow[1], drow[2] + 1.0, drow[3]];
for (let i = 0; i < 6; i++) {
  const aim = [bob.p[0], bob.p[1] + 1.1, bob.p[2]], d = aim.map((v, k) => v - eye[k]), l = Math.hypot(...d);
  dave.send({ t: 'shoot', o: eye, d: d.map(v => v / l), w: 'pkt', rt: 0 });
  await sleep(150);
}
ok(`Dave's door gun hits Bob below (${got(bob, 'dmg').length} hits)`, await until(() => got(bob, 'dmg').length > 0, 1000));
// Carol slides down
await use(carol);
const s = got(carol, 'slide').at(-1);
ok(`Carol slides down the rope (${JSON.stringify(s)})`, s && s.y0 > 7 && Math.abs(s.g) < 0.05);
ok('she reaches the ground', await until(() => got(carol, 'slideEnd').length > 0, ((s?.y0 ?? 8) / HELI.slide) * 1000 + 800));
await sleep(500);
ok(`unhurt (${got(carol, 'dmg').length} hits)`, !got(carol, 'dmg').length);
ok('everyone sees the rope', got(bob, 'slide').length > 0);
// fast: no rope
clearInterval(hover);
const fast = setInterval(() => { const p = hl().slice(0, 3); p[2] -= 0.4; alice.send({ t: 'heli', p, yaw: 0, v: [0, 0, -8], tilt: 0, roll: 0, air: 1 }); }, 50);
await sleep(400);
await use(dave);
clearInterval(fast);
ok('Dave gets out going fast: no rope, he jumps', got(dave, 'heliOut').length > 0 && !got(dave, 'slide', m => m.id !== s.id).length);
process.exit();
