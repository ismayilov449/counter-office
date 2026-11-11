// 7.4 Cut the wire, the bomb (GAME_PORT=3995 MAP=de_dusty BOTS=0 FREEZE_TIME=1). Bob (T) plants at site A; Alice
// (CT) starts defusing (10 s without a kit) and cuts a wire at once: within half a second it's either defused (sfx
// 'defused') or it goes off (boom 'c4'), never both, never neither. Four rounds.
import { player, sleep, until, checker, nextLive, got, spot } from './lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const all = [alice, bob];
const A = spot(34, -34), seen = { right: 0, wrong: 0 };

for (let i = 0; i < 4; i++) {
  await nextLive(all, st);
  await until(() => alice.snap?.ph === 'live', 5000);
  bob.at(A, 0, 0);
  alice.at([A[0] + 5, A[1], A[2]], 0, 0);
  await sleep(300);
  bob.use(true);
  const planted = await until(() => got(alice, 'sfx', m => m.s === 'planted').length > 0, 5000);
  bob.use(false);
  if (!ok(`round ${i}: planted`, planted)) continue;
  bob.at([A[0] - 30, A[1], A[2]], 0, 0);
  alice.at([A[0] + 1, A[1], A[2]], 0, 0);
  await sleep(300);
  alice.use(true);
  if (!ok(`round ${i}: defusing`, await until(() => alice.snap?.me?.a === 'defuse', 1000))) { alice.use(false); continue; }
  alice.clear();
  alice.send({ t: 'xpWire', c: i % 2 });
  await sleep(500);
  alice.use(false);
  const right = got(alice, 'sfx', m => m.s === 'defused').length > 0, wrong = got(alice, 'boom', m => m.k === 'c4').length > 0;
  ok(`round ${i}: ${right ? 'right wire: defused' : wrong ? 'wrong wire: it went off' : 'nothing'}`, right !== wrong);
  if (right) seen.right++;
  if (wrong) seen.wrong++;
}
console.log(`  right ${seen.right}, wrong ${seen.wrong}`);

for (const c of all) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
