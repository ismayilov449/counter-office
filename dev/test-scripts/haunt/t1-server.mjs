// Mansion scares, the server's part (shared/haunt.js). Fresh test server: GAME_PORT=3995 MAP=cs_mansion BOTS=0
// START_MONEY=16000 FREEZE_TIME=1 (no browser). Alice (CT), Bob (T).
// Rigged door: Bob, HE in hand, ties it to the hall door; Alice crouched takes it off (and keeps the grenade). Bob ties
// another; Alice opens the door: the pin pings, 0.5 s later it goes off on her side of the doorway, Alice is hurt.
// Ghosts: Alice dead: a haunt far from any enemy is refused (not spent); a knock by Bob is heard; a second haunt is refused.
// Next round, the lift: Bob ties his grenade in the cabin, rides it up: when its doors open upstairs, the pin.
import { player, sleep, until, checker, spot } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { doorCenter } from '../../../shared/doors.js';
import { RIG } from '../../../shared/haunt.js';
const ok = checker();
const M = MAPS.cs_mansion, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const carol = await player('Carol', 'CT'); // (stays alive, so the round goes on when Alice dies)
const told = { a: [], b: [] };
alice.on.msg = m => told.a.push(m.text);
bob.on.msg = m => told.b.push(m.text);
let locked = [];
alice.on.locks = m => { locked = m.ids; };
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
carol.at(spot(30, 30), 0, 0);
bob.send({ t: 'buy', item: 'he' });
await sleep(300);
ok(`Bob bought an HE (${bob.me?.inv?.he})`, bob.me?.inv?.he > 0);

const D = 0, c = doorCenter(M.doors[D]);
const BOBP = spot(c[0] - 0.8, c[2], 3), ALIP = spot(c[0] + 0.8, c[2], 3);
const use = async (p, ms) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(150); };
bob.w = 'he';
bob.at(BOBP, -Math.PI / 2, 0);
alice.at([ALIP[0] + 3, ALIP[1], ALIP[2]], Math.PI / 2, 0);
await sleep(300);
if (locked.includes(D)) { bob.send({ t: 'lock' }); await sleep(300); } // (locks: the door may start locked; Bob has the key)
await use(bob, RIG.time * 1000 + 400);
ok('Bob ties it to the door', told.b.some(t => /tied to the door/.test(t)));
ok(`everyone gets the rig (${JSON.stringify(got(alice, 'rigs').at(-1)?.list)})`, got(alice, 'rigs').at(-1)?.list?.[0]?.[0] === D);
ok(`Bob's HE is gone (${bob.me?.inv?.he})`, !(bob.me?.inv?.he > 0));
// Alice crouched takes it off
alice.at(ALIP, Math.PI / 2, 1);
await sleep(300);
await use(alice, RIG.disarm * 1000 + 400);
ok('Alice took it off', told.a.some(t => /took the grenade off/.test(t)));
ok(`Alice keeps the grenade (${alice.me?.inv?.he})`, alice.me?.inv?.he > 0);
ok('no rigs left', got(alice, 'rigs').at(-1)?.list?.length === 0);
// again, and Alice opens it
bob.send({ t: 'buy', item: 'he' });
await sleep(300);
await use(bob, RIG.time * 1000 + 400);
ok('Bob ties another', told.b.filter(t => /tied to the door/.test(t)).length === 2);
alice.at(ALIP, Math.PI / 2, 0);
alice.clear();
await sleep(300);
await use(alice, 100);
ok('the door opens: the pin', await until(() => got(alice, 'sfx', m => m.s === 'rigpin').length > 0, 1000));
ok('the grenade drops', got(alice, 'nade').length > 0);
ok('it goes off about 0.5 s later', await until(() => got(alice, 'boom').length > 0, 900));
ok(`on Alice's side of the doorway (x ${got(alice, 'boom')[0]?.p[0]}, the door at ${c[0].toFixed(2)})`, got(alice, 'boom')[0]?.p[0] > c[0] + 0.5);
await sleep(300);
ok(`Alice is hurt (${got(alice, 'dmg')[0]?.d} damage)`, got(alice, 'dmg').length > 0);

// ghosts: make sure Alice is dead
if (alice.me?.alive !== false && !(await until(() => alice.me?.alive === false, 300))) {
  bob.w = bob.me?.inv?.secondary?.id || 'glock';
  for (let i = 0; i < 20 && alice.me?.alive !== false; i++) { // (a downed body lies low: shoot at the floor by her)
    const o = bob.eye(), aim = [alice.p[0], alice.p[1] + (i < 2 ? 1.1 : 0.25), alice.p[2]], d = aim.map((v, k) => v - o[k]), l = Math.hypot(...d);
    bob.send({ t: 'shoot', o, d: d.map(v => v / l), w: bob.w, rt: 0 });
    await sleep(300);
  }
}
ok('Alice is dead', await until(() => alice.me?.alive === false, 2000));
bob.clear();
alice.send({ t: 'haunt', k: 'knock', p: [40, 1, 40] });
await sleep(300);
ok('a haunt far from any enemy is refused', told.a.some(t => /No living enemy/.test(t)));
alice.send({ t: 'haunt', k: 'knock', p: [bob.p[0] + 2, bob.p[1] + 1.2, bob.p[2]] });
ok('a knock by Bob: he hears it', await until(() => got(bob, 'sfx', m => m.s === 'knock').length > 0, 1000));
ok('Alice is told it is spent', got(alice, 'hauntUsed').length === 1);
alice.send({ t: 'haunt', k: 'slam', p: bob.p });
await sleep(300);
ok('a second haunt is refused', told.a.some(t => /used your haunt/.test(t)));
// (end the round: Bob shoots Carol)
bob.w = bob.me?.inv?.secondary?.id || 'glock';
bob.at([carol.p[0] + 3, carol.p[1], carol.p[2]], Math.PI / 2, 0);
await sleep(300);
  for (let i = 0; i < 20 && carol.me?.alive !== false; i++) {
    const o = bob.eye(), aim = [carol.p[0], carol.p[1] + (i < 2 ? 1.1 : 0.25), carol.p[2]], d = aim.map((v, k) => v - o[k]), l = Math.hypot(...d);
    bob.send({ t: 'shoot', o, d: d.map(v => v / l), w: bob.w, rt: 0 });
    await sleep(300);
  }

// next round: the lift
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
bob.send({ t: 'buy', item: 'he' });
await sleep(300);
const E = M.elevator, cab = [(E.cabin.x1 + E.cabin.x2) / 2, E.stops[1], (E.cabin.z1 + E.cabin.z2) / 2];
bob.w = 'he';
bob.at(cab, 0, 0);
await sleep(400);
bob.send({ t: 'elevAim', a: null });
await sleep(50);
await use(bob, RIG.time * 1000 + 400);
ok('Bob ties it in the lift', told.b.some(t => /tied in the lift/.test(t)));
bob.clear();
bob.send({ t: 'elevAim', a: 'b2' });
await sleep(50);
await use(bob, 100);
ok('the lift goes up, the doors open upstairs: the pin', await until(() => got(bob, 'sfx', m => m.s === 'rigpin').length > 0, 15000));
ok('it goes off within about 1 s', await until(() => got(bob, 'boom').length > 0, 1400));
process.exit();
