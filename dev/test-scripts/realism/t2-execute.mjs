// Executions (ROADMAP 12.6). GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1.
// Alice (CT) shoots Bob (T) in the chest until he's down (Carl, his teammate, is alive, so he goes down, not dies).
// a. standing, E starts an interrogation (wdAsk), not an execution; letting go stops it.
// b. crouched, E for 1 s then a step: the execution stops, Bob lives.
// c. crouched, E held 2 s, keeping still: Bob dies, the kill is Alice's with the knife; the victim was told (wd.i 1).
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got } from '../explosives/lib.mjs';
import { WOUNDS } from '../../../shared/wounds.js';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T'), carl = await player('Carl', 'T');
const ID = { alice: alice.id(), bob: bob.id() };
await nextLive([alice, bob, carl], st);
await sleep(1500);
const base = [-22.25, 4.27, 8.941];
bob.at(base, 0, 0); carl.at([base[0], base[1], base[2] - 6], 0, 0);
const A = [base[0] + 1.2, base[1], base[2]];
alice.at(A, Math.PI / 2, 0); await sleep(400);
const w = alice.me?.inv?.secondary?.id || 'usp';
for (let i = 0; i < 12 && !got(alice, 'bodyDown', m => m.v === ID.bob).length && bob.alive; i++) { alice.shootAt(bob, w, 'chest'); await sleep(350); }
ok('Bob is down', got(alice, 'bodyDown', m => m.v === ID.bob).length > 0 && bob.alive);
const act = () => alice.snap?.wd?.i?.find(e => e[0] === ID.alice);
// a
alice.at(A, Math.PI / 2, 0); await sleep(200);
alice.use(true); await sleep(400);
ok(`a: standing, E interrogates (${JSON.stringify(act())})`, act()?.[3] === 0);
alice.use(false); await sleep(200);
// (an interrogation goes on without E held, as before: wait it out so the next one can start)
await until(() => !act(), 4000);
// b
alice.at(A, Math.PI / 2, 1); await sleep(300);
alice.use(true); await sleep(1000);
ok(`b: crouched, E executes (${JSON.stringify(act())})`, act()?.[3] === 1);
ok('b: Bob is told', bob.snap?.wd?.i?.some(e => e[1] === ID.bob && e[3] === 1));
alice.at([A[0] + 0.5, A[1], A[2]], Math.PI / 2, 1); await sleep(400);
ok('b: a step stops it', !act());
alice.use(false); await sleep(1500);
ok('b: Bob still alive', bob.alive);
// c
alice.at(A, Math.PI / 2, 1); await sleep(300);
alice.clear();
alice.use(true);
const died = await until(() => !bob.alive, (WOUNDS.exec + 1.5) * 1000);
alice.use(false);
ok('c: held 2 s: Bob dies', died);
const k = got(alice, 'kill', m => m.v === ID.bob)[0];
ok(`c: Alice's kill with the knife (${JSON.stringify(k && { k: k.k, w: k.w })})`, k?.k === ID.alice && k?.w === 'knife');
ok('c: Alice is told', got(alice, 'msg', m => /finished Bob off/.test(m.text)).length > 0);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
