// 7.1 Throw a grenade back (GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1).
// Bob (T) buys HE grenades and drops one at Alice's (CT) feet:
// a. Alice presses E at once: it's in her hand (xpHot, ms > 800), gone from the floor for everyone (xpGrab); she
//    throws it at Bob: it goes off by him (boom), he's hurt or dead by Alice's HE.
// b. Next one: she grabs it and keeps it: it goes off in her hand, she dies (killed by Bob, HE).
// c. Next one: she waits 1 s (0.6 s of fuse left): E doesn't grab it.
import { player, sleep, until, checker, nextLive, dist3, got } from './lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const all = [alice, bob];
const ID = { alice: alice.id(), bob: bob.id() };

async function setup() {
  if (!st.round || !all.every(c => c.alive)) await nextLive(all, st);
  else for (const c of all) c.clear();
  bob.send({ t: 'buy', item: 'he' });
  await sleep(300);
  const base = bob.p.slice();
  // Alice 2 m east of Bob, both on Bob's spawn spot's floor
  alice.at([base[0] + 2, base[1], base[2]], -Math.PI / 2);
  bob.at(base, Math.PI / 2);
  await sleep(400);
  return base;
}
// Bob drops one at Alice's feet (from 0.3 m over them)
function drop() {
  const a = alice.p;
  bob.send({ t: 'nade', k: 'he', o: [a[0] - 0.3, a[1] + 0.4, a[2]], v: [0, 0, 0] });
}

// a
let base = await setup();
ok('Bob has an HE', bob.me?.inv?.he > 0);
drop();
await sleep(150);
alice.use(true);
ok('a: in Alice\'s hand (xpHot > 800 ms)', await until(() => got(alice, 'xpHot', m => m.ms > 800).length > 0, 1000));
ok('a: gone from the floor for Bob (xpGrab)', got(bob, 'xpGrab', m => m.by === ID.alice).length > 0);
alice.use(false);
const hpBefore = bob.me.hp;
const e = [alice.p[0], alice.p[1] + 1.62, alice.p[2]];
alice.send({ t: 'xpThrow', o: e, v: [-4, 1, 0] }); // towards Bob, 2 m west
ok('a: thrown (nade from Alice)', await until(() => got(bob, 'nade', m => m.owner === ID.alice).length > 0, 1000));
ok('a: it goes off near Bob', await until(() => got(bob, 'boom', m => m.k === 'he').length > 0, 2500) && dist3(got(bob, 'boom')[0].p, base) < 2);
await sleep(200);
ok(`a: Bob hurt or dead (dmg ${JSON.stringify(got(bob, "dmg"))}, alive ${bob.alive})`, !bob.alive || got(bob, "dmg").some(m => m.hp < hpBefore));

// b
base = await setup();
drop();
await sleep(150);
alice.use(true);
await sleep(100);
alice.use(false);
ok('b: in hand', got(alice, 'xpHot', m => m.ms > 0).length > 0);
ok('b: she keeps it: dead, killed by Bob\'s HE', await until(() => got(alice, 'kill', m => m.v === ID.alice).length > 0, 2500) &&
  got(alice, 'kill', m => m.v === ID.alice)[0].k === ID.bob && !alice.alive);
ok('b: the hand is empty again (xpHot 0)', got(alice, 'xpHot', m => m.ms === 0).length > 0);

// c
base = await setup();
drop();
await sleep(1000);
alice.use(true);
await sleep(100);
alice.use(false);
ok('c: too late (0.6 s left): not grabbed', got(alice, 'xpHot').length === 0);
ok('c: it goes off on the floor', await until(() => got(alice, 'boom', m => m.k === 'he').length > 0, 1500));

for (const c of all) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
