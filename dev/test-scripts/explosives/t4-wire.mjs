// 7.4 Cut the wire, satchels (GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1 ROUND_TIME=40).
// Bob (T) throws a satchel by Alice (CT); she starts defusing it (E) and cuts a wire (xpWire): within half a second
// it's either defused ("Satchel charge defused.") or it goes off (boom 'satchel'), never both, never neither; a wire
// sent when not defusing does nothing. Six tries: both outcomes should turn up (1 in 32 they don't).
import { player, sleep, until, checker, nextLive, got } from './lib.mjs';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const all = [alice, bob];
const base = [-22.25, 4.27, 8.941];
const seen = { right: 0, wrong: 0 };

alice.send({ t: 'xpWire', c: 0 });
for (let i = 0; i < 6; i++) {
  if (!st.round || !all.every(c => c.alive)) await nextLive(all, st);
  else for (const c of all) c.clear();
  bob.at(base, 0, 0); // (in the buy zone)
  await sleep(200);
  bob.send({ t: 'buy', item: 'satchel' });
  await sleep(300);
  alice.at([base[0] + 3, base[1], base[2]], 0, 0);
  await sleep(300);
  bob.send({ t: 'satchel', o: [base[0] + 1.5, base[1] + 1.5, base[2]], v: [2, -6, 0] });
  if (!await until(() => (got(alice, 'satchels').at(-1)?.list || []).length > 0, 2000)) { ok(`try ${i}: satchel placed`, false); continue; }
  bob.at([base[0] - 12, base[1], base[2]], 0, 0); // (out of the blast)
  alice.use(true);
  if (!ok(`try ${i}: defusing`, await until(() => alice.snap?.me?.a === 'satchel', 1000))) { alice.use(false); continue; }
  alice.clear();
  alice.send({ t: 'xpWire', c: i % 2 });
  await sleep(500);
  alice.use(false);
  const right = got(alice, 'msg', m => m.text === 'Satchel charge defused.').length > 0, wrong = got(alice, 'boom', m => m.k === 'satchel').length > 0;
  ok(`try ${i}: ${right ? 'right wire: defused' : wrong ? 'wrong wire: it went off' : 'nothing'}`, right !== wrong);
  if (right) seen.right++;
  if (wrong) seen.wrong++;
}
ok(`both outcomes turned up (right ${seen.right}, wrong ${seen.wrong})`, seen.right > 0 && seen.wrong > 0);

for (const c of all) c.close();
console.log(ok.fails() ? `${ok.fails()} FAILED` : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
