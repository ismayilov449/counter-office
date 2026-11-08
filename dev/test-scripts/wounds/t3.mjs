// 1.3 Wounds, server side. Test server (fresh, BOTS=0): GAME_PORT=4210 MAP=cs_mansion (or cs_mansion_night) BOTS=0
// START_MONEY=16000 MAP_ROTATION=0 ROUND_TIME=600; then  GAME_PORT=4210 MAP=cs_mansion node dev/test-scripts/wounds/t3.mjs
// T1 shoots C1 (kevlar and helmet) with a Glock from 17 m on the back garden's lawn:
//  a leg hit: a leg wound; the middle of the chest: none; the chest out at the side: an arm wound; the head (the helmet
//  holds): a graze; a bandage (P) halves them all; a fresh hit on a bandaged leg makes it fresh again; once the bleeding
//  has stopped (20 s), P still bandages a fresh wound; the wounds are gone in the next round
import { player, sleep, ok, summary, until } from './lib.mjs';

const T1 = await player('Tango', 'T'), C1 = await player('Charlie', 'CT'), T2 = await player('Toby', 'T'), C2 = await player('Cathy', 'CT');
const all = [T1, T2, C1, C2];
T1.w = T2.w = 'glock'; C1.w = C2.w = 'usp';
const last = () => C1.got('wdWounds').at(-1);
const wounds = () => C1.got('wdWounds').length;

console.log('(waiting for the first round)');
ok('round starts', await until(() => T1.got('round').length > 0, 40000));
C1.send({ t: 'buy', item: 'vesthelm' });
await sleep(3600);
const V = [-31, 0, -3]; // (17 m: a Glock does about 17 there, 32 to a helmeted head)
C1.at(V, Math.PI / 2); // facing west, towards T1
T1.at([-48, 0, -3], -Math.PI / 2);
T2.at([-39, 0, 4], 0); C2.at([-30, 0, 4], 0);
await sleep(500);
const hp0 = C1.hp;

T1.shootAt([V[0], 0.45, V[2]]); await sleep(350);
ok(`a leg hit (hp ${hp0} -> ${C1.hp}): a leg wound (${JSON.stringify(last())})`, last()?.l === 1 && last().n === 'l' && C1.hp > 0);
let n0 = wounds();
T1.shootAt([V[0], 1.3, V[2]]); await sleep(350);
ok(`the middle of the chest (hp ${C1.hp}): no new wound`, wounds() === n0);
T1.shootAt([V[0], 1.3, V[2] + 0.26]); await sleep(350);
ok(`the chest out at the side (hp ${C1.hp}): an arm wound (${JSON.stringify(last())})`, last()?.a === 1 && last().n === 'a' && last().l === 1);
T1.shootAt([V[0], 1.62, V[2]]); await sleep(350);
ok(`the head, the helmet holds (hp ${C1.hp}): a graze (${JSON.stringify(last())})`, last()?.h === 1 && last().n === 'h' && C1.alive && C1.hp > 0);
n0 = wounds();
T1.shootAt([V[0], 0.45, V[2]]); await sleep(350);
ok(`the leg again: still one leg wound, nothing new to say (hp ${C1.hp})`, wounds() === n0);

// a bandage halves them
C1.send({ t: 'bloodBandage' });
ok('P: bandaging', await until(() => C1.got('bloodBandage').some(m => m.s === 'start'), 600));
ok('done: the wounds are half as bad', await until(() => last()?.n === 'band', 4000));
ok(`(${JSON.stringify(last())})`, last().l === 0.5 && last().a === 0.5 && last().h === 0.5);
// hit in the bandaged arm: it's fresh again
T1.shootAt([V[0], 1.3, V[2] - 0.26]); await sleep(350);
ok(`hit in the bandaged arm (hp ${C1.hp}): fresh again (${JSON.stringify(last())})`, last()?.a === 1 && last().l === 0.5 && last().n === 'a');
// the bleeding stops by itself after 20 s; a fresh wound can still be bandaged
console.log('     (waiting 21 s for the bleeding to stop)');
await sleep(21000);
C1.clear();
ok(`the bleeding has stopped (bl ${JSON.stringify(C1.snap?.bl || [])})`, !C1.snap?.bl?.some(e => e[0] === C1.id));
C1.send({ t: 'bloodBandage' });
await sleep(300);
ok(`not bleeding any more, P still bandages the fresh arm (${C1.got('msg').map(m => m.text).join(' | ') || 'no refusal'})`, C1.got('bloodBandage').some(m => m.s === 'start'));
ok('done: the arm half as bad', await until(() => last()?.n === 'band' && last().a === 0.5, 4000));
C1.clear();
C1.send({ t: 'bloodBandage' }); await sleep(300);
ok(`nothing fresh, not bleeding: P is refused ("${C1.got('msg').map(m => m.text).join(' | ')}")`, !C1.got('bloodBandage').length && C1.got('msg').some(m => /not bleeding|No bandages/.test(m.text)));

// the next round: gone
T1.w = 'glock';
for (let i = 0; i < 20 && C1.alive; i++) { T1.shootAt([V[0], 0.2, V[2]]); T1.shootAt([V[0], 1.3, V[2]]); await sleep(400); }
for (let i = 0; i < 20 && C2.alive; i++) { T1.at([-33, 0, 1], Math.PI); T1.shootAt([C2.p[0], 1.62, C2.p[2]]); await sleep(400); }
ok('the CTs are dead: the round ends', await until(() => T1.got('roundEnd').length > 0, 3000));
C1.clear();
ok('a new round', await until(() => C1.got('spawn').length > 0, 12000));
await sleep(300);
ok(`the wounds are gone (${JSON.stringify(last())})`, last() && !last().l && !last().a && !last().h);

summary();
for (const c of all) c.close();
process.exit();
