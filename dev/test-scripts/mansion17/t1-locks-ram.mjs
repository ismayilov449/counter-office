// ROADMAP 17: locked doors and ramming the gate, the server's part. Fresh test server: GAME_PORT=3995 MAP=cs_mansion
// BOTS=0 START_MONEY=16000 FREEZE_TIME=1 (no browser). Alice (CT), Bob (T).
// Two of the house's four outer doors start locked. Alice outside one: E says it's locked; crouched she picks it (6 s,
// Bob hears the clicks). The other: she runs into it with E three times and it bursts open. Bob locks the estate gate
// with L: Alice can't open it from the street, but Bob opens it with his key. Alice drives the CTs' car into the gate:
// it's smashed.
import { player, sleep, until, checker, spot } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { doorCenter } from '../../../shared/doors.js';
import { LOCK } from '../../../shared/locks.js';
import { GONE } from '../../../shared/doors.js';
const ok = checker();
const M = MAPS.cs_mansion, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const told = { a: [], b: [] };
alice.on.msg = m => told.a.push(m.text);
bob.on.msg = m => told.b.push(m.text);
let locked = [];
alice.on.locks = m => { locked = m.ids; };
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
await sleep(300);
ok(`two doors start locked (${JSON.stringify(locked)})`, locked.length === 2 && locked.every(i => [0, 1, 2, 7].includes(i)));
const outside = i => { const d = M.doors[i], c = doorCenter(d), n = d.axis === 'x' ? 2 : 0, p = [c[0], 0, c[2]]; p[n] += d.lock * 0.9; return spot(p[0], p[2], c[1] + 0.5); };
const use = async (p, ms) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(150); };
const state = () => alice.snap && got(alice, 'doors').at(-1)?.doors;
const L1 = locked.find(i => i !== 7) ?? locked[0], L2 = locked.find(i => i !== L1); // (by door 7 a light switch is nearer: a standing E works it)
bob.at(spot(-15, 0, 3), 0, 0); // (in the house)

// 1: E standing: locked; crouched: picked
alice.at(outside(L1), 0, 0);
await sleep(300);
await use(alice, 100);
ok('E on the locked door: told it is locked', L1 === 7 || told.a.some(t => /^Locked/.test(t)));
ok('it stays shut', !got(alice, 'doors').some(m => m.i === L1));
alice.at(outside(L1), 0, 1);
await sleep(200);
bob.clear();
await use(alice, LOCK.pick * 1000 + 500);
ok('crouched, she picks it', told.a.some(t => /Lock picked/.test(t)));
ok(`Bob hears the clicks (${got(bob, 'sfx', m => m.s === 'lockpick').length})`, got(bob, 'sfx', m => m.s === 'lockpick').length >= 4);
ok('it is unlocked', !locked.includes(L1));
await use(alice, 100);
alice.at(outside(L1), 0, 0);
await use(alice, 100);
ok('now E opens it', await until(() => got(alice, 'doors').some(m => m.i === L1 && m.doors[L1] !== 0), 1500));

// 2: kicked in (running into it with E)
const o2 = outside(L2), d2 = M.doors[L2], n2 = d2.axis === 'x' ? 2 : 0;
for (let k = 0; k < LOCK.kicks; k++) {
  for (let s = 0; s < 8; s++) { const p = o2.slice(); p[n2] += d2.lock * (2.2 - s * 0.25); alice.at(p, 0, 0); await sleep(50); }
  await use(alice, 60);
  await sleep(LOCK.kickGap * 1000);
}
ok(`kicked ${LOCK.kicks} times (${got(alice, 'sfx', m => m.s === 'kick').length})`, got(alice, 'sfx', m => m.s === 'kick').length >= LOCK.kicks);
ok('it bursts open', await until(() => got(alice, 'doors').some(m => m.i === L2 && m.doors[L2] !== 0), 1500));
ok('and is unlocked', !locked.includes(L2));

// 3: the gate: Bob locks it from the estate side, Alice can't open it from the street, Bob can
const G = M.doors.findIndex(d => d.lockOpen);
const gc = doorCenter(M.doors[G]);
bob.at(spot(gc[0] - 0.9, gc[2], 3), 0, 0);
await sleep(300);
bob.send({ t: 'lock' });
ok('Bob locks the gate with L', await until(() => locked.includes(G), 1000));
alice.at(spot(gc[0] + 0.9, gc[2], 3), 0, 0);
await sleep(300);
told.a.length = 0;
await use(alice, 100);
ok('Alice, on the street, is told it is locked', told.a.some(t => /^Locked/.test(t)));
await use(bob, 100);
ok('Bob opens it with his key', await until(() => got(alice, 'doors').some(m => m.i === G && m.doors[G] !== 0), 1500));
await use(bob, 100); // (shut again)
await until(() => got(alice, 'doors').at(-1)?.doors?.[G] === 0, 1500);

// 4: the car into the gate
const car = M.vehicles.findIndex(v => v.p[0] > 24);
const cv = M.vehicles[car];
alice.at(spot(cv.p[0] + 1.7, cv.p[1], 3), 0, 0);
await sleep(300);
await use(alice, 100);
ok('Alice gets into the CTs\' car', await until(() => got(alice, 'drive').length > 0, 1500));
const id = got(alice, 'drive').at(-1).id;
// drive to just short of the gate at speed (a few metres a message)
const path = [[26.4, -9], [26.4, -6], [26, -3.5], [25.4, -1.5], [24.9, -0.9]];
for (const [x, z] of path) { alice.send({ t: 'car', id, p: [x, 0, z], yaw: Math.PI / 2, speed: 8, steer: 0 }); await sleep(120); }
alice.send({ t: 'ram', car: id, door: G, speed: 8 });
ok('the gate is smashed', await until(() => got(alice, 'doors').some(m => m.i === G && m.blown && m.doors[G] === GONE), 1500));
ok('with a crash', got(alice, 'sfx', m => m.s === 'crash').length > 0);
process.exit();
