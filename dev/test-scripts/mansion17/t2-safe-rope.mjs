// ROADMAP 16: the safe and the roof rope, the server's part. Fresh test server: GAME_PORT=3995 MAP=cs_mansion BOTS=0
// START_MONEY=800 FREEZE_TIME=1 (no browser). Alice (CT), Bob (T).
// Bob cracks the safe: 8 s, lets go, then the rest (what he did stays done); Alice hears the dial; cracked, Bob gets
// $1500. Alice on the east eaves hooks the rope (Bob hears it), swings in: the window's glass smashes and she ends up
// on the floor inside.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { SAFE, ROPE } from '../../../shared/safe.js';
const ok = checker();
const M = MAPS.cs_mansion, st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
await nextLive([alice, bob], st);
await until(() => alice.snap?.ph === 'live', 8000);
await sleep(300);
const use = async (p, ms) => { p.send({ t: 'use', on: true }); await sleep(ms); p.send({ t: 'use', on: false }); await sleep(200); };

// the safe
bob.at(M.safe.stand, 0, 0);
alice.at([-10.5, 4.27, 7.5], Math.PI, 0);
await sleep(300);
const money0 = bob.me.money;
await use(bob, 8000);
const half = got(bob, 'safe').at(-1);
ok(`after 8 s it isn't open (${JSON.stringify(half)})`, !got(bob, 'safe').some(m => m.open));
ok(`Alice hears the dial (${got(alice, 'sfx', m => m.s === 'safeclick').length} clicks)`, got(alice, 'sfx', m => m.s === 'safeclick').length >= 5);
await use(bob, (SAFE.crack - 8) * 1000 + 600);
ok('the rest of it, and it opens', got(bob, 'safe').some(m => m.open));
await sleep(300);
ok(`Bob gets $${SAFE.pay} (${money0} -> ${bob.me.money})`, bob.me.money === money0 + SAFE.pay);
await use(bob, 500);
ok('once a round: E again does nothing', got(bob, 'safe').filter(m => m.open).length === 1);

// the rope (the east eaves over the upper floor's north-east window)
const R = M.ropes[0];
alice.at(R.a, -Math.PI / 2, 0);
bob.at([R.w[0] - 2, 4.27, R.w[2]], Math.PI / 2, 0);
bob.clear(); alice.clear();
await sleep(300);
await use(alice, ROPE.hook * 1000 + 300);
ok('Bob, inside, hears the hook', got(bob, 'sfx', m => m.s === 'ropehook').length > 0);
ok('Alice swings (everyone told)', got(bob, 'rope', m => m.i === 0).length > 0);
ok('the window smashes', await until(() => got(bob, 'glass').length > 0, ROPE.swing * 1000 + 500));
ok('she ends up inside', await until(() => got(alice, 'ropeEnd').length > 0, 2000));
const e = got(alice, 'ropeEnd').at(-1)?.p;
ok(`on the floor inside (${JSON.stringify(e)})`, e && e[0] < R.w[0] - 0.5 && Math.abs(e[1] - R.floor) < 0.05);
process.exit();
