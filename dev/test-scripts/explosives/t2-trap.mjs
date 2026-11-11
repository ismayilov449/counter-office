// 7.2 Booby-trapped body (GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1).
// Alice (CT) kills Carl (T). Bob (T) buys an HE:
// a. standing over Carl, E starts nothing; crouched, E for 2 s hides the grenade (xpTraps lists Carl's body; Bob's HE
//    is used up). Alice presses E standing by the body: an HE blast at the body, she's hurt (dmg) or dead.
// b. next round, again: Alice crouches over the body for its uniform: it goes off (no disguise).
// c. a body without a trap: Alice crouched takes the uniform as before (control).
import { player, sleep, until, checker, nextLive, got, los } from './lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T'), carl = await player('Carl', 'T');
const all = [alice, bob, carl];
const ID = { alice: alice.id(), bob: bob.id(), carl: carl.id() };
const gun = c => (c.w = c.me?.inv?.primary?.id || c.me?.inv?.secondary?.id || 'knife');
const actOf = c => c.snap?.me?.a || null;

async function killCarl() {
  const w = gun(alice);
  for (let i = 0; i < 10 && carl.alive; i++) { alice.shootAt(carl, w, 'head'); await sleep(400); }
  return !carl.alive;
}
async function setup(trap) {
  await nextLive(all, st);
  if (trap) bob.send({ t: 'buy', item: 'he' });
  await sleep(300);
  const base = [-22.25, 4.27, 8.941]; // (an open floor by the T spawn)
  const C = [base[0] + 2, base[1], base[2]], A = [base[0] + 4, base[1], base[2]];
  carl.at(C, 0, 0); alice.at(A, Math.PI / 2, 0); bob.at(base, -Math.PI / 2, 0);
  await sleep(400);
  ok('Alice sees Carl', los([A[0], A[1] + 1.6, A[2]], [C[0], C[1] + 1.6, C[2]]));
  ok('Alice kills Carl', await killCarl());
  await sleep(300);
  if (!trap) return C;
  // Bob over the body
  bob.at([C[0] - 0.6, C[1], C[2]], -Math.PI / 2, 0);
  await sleep(200);
  bob.use(true); await sleep(400); bob.use(false);
  ok('standing, E starts nothing', actOf(bob) === null && got(bob, 'xpTraps').length === 0);
  bob.at([C[0] - 0.6, C[1], C[2]], -Math.PI / 2, 1);
  await sleep(250);
  bob.use(true);
  ok('crouched, E starts hiding it (xpTrap)', await until(() => actOf(bob) === 'xpTrap', 1000));
  ok('after 2 s: trapped (xpTraps lists Carl\'s body)', await until(() => got(alice, 'xpTraps', m => m.list.some(r => r[0] === ID.carl)).length > 0, 3000));
  bob.use(false);
  await sleep(200);
  ok('Bob\'s HE used up', !(bob.me.inv.he > 0));
  bob.at([base[0] - 6, base[1], base[2]], 0, 0); // (out of the blast)
  await sleep(200);
  return C;
}

// a
let C = await setup(true);
alice.at([C[0] + 0.7, C[1], C[2]], Math.PI / 2, 0);
await sleep(200);
alice.use(true); await sleep(200); alice.use(false);
ok('a: E on the body: an HE blast at it', await until(() => got(alice, 'boom', m => m.k === 'he').length > 0, 1000) && Math.hypot(got(alice, 'boom')[0].p[0] - C[0], got(alice, 'boom')[0].p[2] - C[2]) < 0.5);
await sleep(200);
ok('a: Alice hurt or dead', !alice.alive || got(alice, 'dmg').length > 0);
ok('a: the trap is gone (empty xpTraps)', got(alice, 'xpTraps', m => !m.list.length).length > 0);
if (!alice.alive) ok('a: killed by Bob\'s HE', got(alice, 'kill', m => m.v === ID.alice && m.k === ID.bob && m.w === 'he').length > 0);

// b
C = await setup(true);
alice.at([C[0] + 0.7, C[1], C[2]], Math.PI / 2, 1);
await sleep(250);
alice.use(true); await sleep(300); alice.use(false);
ok('b: crouched for the uniform: it goes off', await until(() => got(alice, 'boom', m => m.k === 'he').length > 0, 1000));
ok('b: no disguise', got(alice, 'disguiseOn').length === 0);
alice.at(alice.p, Math.PI / 2, 0);

// c
C = await setup(false);
alice.at([C[0] + 0.7, C[1], C[2]], Math.PI / 2, 1);
await sleep(250);
alice.use(true);
ok('c: no trap: the uniform as before', await until(() => got(alice, 'disguiseOn').length > 0, 4500) && got(alice, 'boom').length === 0);
alice.use(false);

for (const c of all) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
