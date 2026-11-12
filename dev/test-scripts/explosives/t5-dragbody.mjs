// Dragging dead bodies (GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1).
// Alice (CT) kills Carl (T).
// a. Bob (T) holds E by the body and walks 3 m away: the body follows him (the snapshot's Carl moves) and the drag
//    shows in wd.d; letting go of E drops it there.
// b. next round, Bob hides an HE under Carl's body; Alice (an enemy) starts dragging it: it goes off.
import { player, sleep, until, checker, nextLive, got } from './lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T'), carl = await player('Carl', 'T');
const all = [alice, bob, carl];
const ID = { alice: alice.id(), bob: bob.id(), carl: carl.id() };
const gun = c => (c.w = c.me?.inv?.primary?.id || c.me?.inv?.secondary?.id || 'knife');
const carlAt = () => { const e = alice.snap?.pl?.find(x => x[0] === ID.carl); return e && [e[1], e[2], e[3]]; };
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const base = [-22.25, 4.27, 8.941]; // (an open floor by the T spawn)

async function setup(trap) {
  await nextLive(all, st);
  if (trap) bob.send({ t: 'buy', item: 'he' });
  await sleep(300);
  const C = [base[0] + 2, base[1], base[2]];
  carl.at(C, 0, 0); alice.at([base[0] + 4, base[1], base[2]], Math.PI / 2, 0); bob.at([base[0] - 3, base[1], base[2]], -Math.PI / 2, 0);
  await sleep(400);
  const w = gun(alice);
  for (let i = 0; i < 10 && carl.alive; i++) { alice.shootAt(carl, w, 'head'); await sleep(400); }
  ok('Alice kills Carl', !carl.alive);
  await sleep(300);
  return C;
}
// walk c from a to b in 0.25 m steps
async function walk(c, a, b, yaw) {
  const n = Math.ceil(flat(a, b) / 0.25);
  for (let i = 1; i <= n; i++) { c.at([a[0] + (b[0] - a[0]) * i / n, a[1], a[2] + (b[2] - a[2]) * i / n], yaw, 0); await sleep(160); }
}

// a
let C = await setup(false);
const from = [C[0] - 0.6, C[1], C[2]], to = [C[0] - 3.6, C[1], C[2]];
bob.at(from, Math.PI / 2, 0); await sleep(300);
bob.use(true); await sleep(150);
bob.send({ t: 'wdDrag', on: 1 }); await sleep(150);
ok('a: the drag starts (wd.d: Bob drags Carl)', await until(() => alice.snap?.wd?.d?.some(e => e[0] === ID.bob && e[1] === ID.carl), 1000));
await walk(bob, from, to, Math.PI / 2);
await sleep(600);
const moved = carlAt();
ok(`a: the body followed him (${flat(C, moved).toFixed(2)} m)`, flat(C, moved) > 2);
bob.send({ t: 'wdDrag', on: 0 }); await sleep(300);
ok('a: standing still keeps hold of it', alice.snap?.wd?.d?.some(e => e[0] === ID.bob));
bob.use(false); await sleep(400);
ok('a: letting go of E drops it', !alice.snap?.wd?.d?.length);
const dropped = carlAt();
await sleep(500);
ok('a: it stays where it was dropped', flat(dropped, carlAt()) < 0.05);

// b
C = await setup(true);
bob.at([C[0] - 0.6, C[1], C[2]], -Math.PI / 2, 1); await sleep(250);
bob.use(true);
ok('b: trapped', await until(() => got(alice, 'xpTraps', m => m.list.some(r => r[0] === ID.carl)).length > 0, 3500));
bob.use(false); bob.at([base[0] - 6, base[1], base[2]], 0, 0); await sleep(300);
// Alice holds E away from the body (nothing there), walks up to it and starts dragging it: it goes off
const far = [C[0] + 3, C[1], C[2]], near = [C[0] + 0.8, C[1], C[2]];
alice.at(far, Math.PI / 2, 0); await sleep(300);
alice.use(true); await sleep(200);
alice.clear();
await walk(alice, far, near, Math.PI / 2);
ok('b: holding E and walking up: nothing yet', !got(alice, 'boom').length);
alice.send({ t: 'wdDrag', on: 1 });
ok('b: dragging it sets it off', await until(() => got(alice, 'boom', m => m.k === 'he').length > 0, 1000));
alice.use(false);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
