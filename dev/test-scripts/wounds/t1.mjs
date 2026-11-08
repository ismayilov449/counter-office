// 1.1 Dragging a downed teammate, server side. Test server (fresh, BOTS=0): GAME_PORT=4210 MAP=cs_mansion (or
// cs_mansion_night) BOTS=0 START_MONEY=16000 MAP_ROTATION=0 ROUND_TIME=600; then
//   GAME_PORT=4210 MAP=cs_mansion node dev/test-scripts/wounds/t1.mjs
// Two Terrorists and two CTs, scripted, on the back garden's lawn (and by the ladder at the house's west side):
//  a. down; the revive starts; walking with E held drags him (the revive pauses: no act), his own positions are
//     ignored, he follows 0.95 m behind, keeps bleeding (bl, the bleed-out clock runs); the dragger fires only his
//     pistol; standing still again: the revive goes on from where it was, and ends in the time that was left
//  b. a drag without a revive first (the body behind him); letting go of E drops him (no revive)
//  c. running off: 'lost', "You lost your grip"
//  d. onto a ladder: the drag ends ("can't drag him up a ladder")
//  e. finished while dragged (a shot at where the server put him): the drag ends, the kill to the shooter
import { player, sleep, ok, summary, until, flat, r2, ground } from './lib.mjs';

const T1 = await player('Tango', 'T'), C1 = await player('Charlie', 'CT'), T2 = await player('Toby', 'T'), C2 = await player('Cathy', 'CT');
const all = [T1, T2, C1, C2];
T1.w = T2.w = 'glock'; C1.w = C2.w = 'usp';
const wdOf = c => c.snap?.wd || { d: [], k: [], i: [], a: [] };
const dragOf = (c, id) => wdOf(c).d.find(e => e[0] === id);
const chest = p => [p[0], p[1] + 1.2, p[2]];
const floorOf = p => [p[0], p[1] + 0.22, p[2]]; // a downed body (crawling) is hit at 0.2 m

console.log('(waiting for the first round)');
ok('round starts', await until(() => T1.got('round').length > 0, 40000));
T2.send({ t: 'buy', item: 'ak47' });
await sleep(3600); // freeze time
ok(`T2 has an AK-47 (${T2.inv?.primary?.id})`, T2.inv?.primary?.id === 'ak47');

// ---------------------------------------------------------------- a
const A = [-33, 0, -3];
T1.at(A, 0); T2.at([-32.4, 0, -3], Math.PI / 2); C1.at([-39, 0, -3], -Math.PI / 2); C2.at([-39, 0, 3], -Math.PI / 2);
await sleep(500);
for (let i = 0; i < 12 && !C2.got('bodyDown').length; i++) { C1.shootAt(chest(T1.p)); await sleep(380); }
ok('T1 down', C2.got('bodyDown').some(m => m.v === T1.id));
T2.use(true);
await sleep(1000);
const pr0 = T2.snap?.me?.pr ?? 0;
ok(`T2 reviving (act ${T2.snap?.me?.a}, ${r2(pr0)})`, T2.snap?.me?.a === 'bodyRevive' && pr0 > 0.12);
const bleed0 = T2.snap?.bd?.d?.find(e => e[0] === T1.id)?.[1];
T2.send({ t: 'wdDrag', on: 1 });
await sleep(200);
ok(`walking with E held: dragging (wd.d ${JSON.stringify(dragOf(C2, T2.id))}), the revive paused (act ${T2.snap?.me?.a ?? 'none'})`, dragOf(C2, T2.id)?.[1] === T1.id && !T2.snap?.me);
ok(`T1 is told (${T1.got('msg').map(m => m.text).find(t => /dragging/.test(t))})`, T1.got('msg').some(m => /Toby is dragging you/.test(m.text)));
const start = C2.posOf(T1.id);
// walk 2.4 m east at 1.3 m/s (half way, T1's client says he's somewhere else: ignored)
for (let i = 1; i <= 60; i++) {
  T2.at([-32.4 + 0.04 * i, 0, -3]);
  if (i >= 30 && i < 34) T1.send({ t: 'state', sq: T1.sq, p: [-40, 0, -3], yaw: 0, pitch: 0, c: 0, w: 'glock' });
  await sleep(31);
}
await sleep(400);
const at = C2.posOf(T1.id), d2 = C2.posOf(T2.id);
ok(`T1 dragged along (${r2(flat(start, at))} m, from ${start} to ${at}); his own positions ignored`, flat(start, at) > 1.8 && at[0] > -32);
ok(`T1 trails 0.95 m behind T2 (${r2(flat(at, d2))})`, Math.abs(flat(at, d2) - 0.95) < 0.15 && at[0] < d2[0]);
ok(`the snapshot's wd says where the body is (${dragOf(C2, T2.id)?.slice(2)})`, flat(dragOf(C2, T2.id).slice(2), at) < 0.1);
ok(`T1 bleeds while dragged: a blood trail (bl ${JSON.stringify(C2.snap?.bl?.find(e => e[0] === T1.id))})`, (C2.snap?.bl?.find(e => e[0] === T1.id)?.[1] || 0) >= 2);
const bleed1 = T2.snap?.bd?.d?.find(e => e[0] === T1.id)?.[1];
ok(`and the bleed-out clock runs (${bleed0} -> ${bleed1})`, bleed1 < bleed0 - 0.05);
ok(`T1 faces the dragger, head first (yaw ${C2.row(T1.id)?.[4]})`, Math.abs(C2.row(T1.id)[4] - -Math.PI / 2) < 0.2);
// only the pistol
C1.clear();
T2.shootAt([d2[0], 30, d2[2] - 1], 'ak47'); await sleep(250);
ok("dragging: the AK-47 won't fire", !C1.got('shot').some(m => m.id === T2.id));
T2.shootAt([d2[0], 30, d2[2] - 1], 'glock'); await sleep(250);
ok('the pistol does', C1.got('shot').some(m => m.id === T2.id && m.w === 'glock'));
T2.send({ t: 'nade', k: 'he', o: [d2[0], 1.6, d2[2]], v: [0, 5, 0] }); await sleep(200);
// stop walking, E still held: the revive goes on from where it was
const t0 = Date.now();
T2.send({ t: 'wdDrag', on: 0 });
await sleep(200);
const pr1 = T2.snap?.me?.pr ?? 0;
ok(`standing still: the revive goes on (act ${T2.snap?.me?.a}, from ${r2(pr1)}: kept ${r2(pr0)})`, T2.snap?.me?.a === 'bodyRevive' && pr1 >= pr0 - 0.02 && !dragOf(C2, T2.id));
ok('revived', await until(() => C2.got('bodyUp').some(m => m.v === T1.id && m.by === T2.id), 6000));
const took = (Date.now() - t0) / 1000;
ok(`in the time that was left (${r2(took)} s; 5 s × (1 − ${r2(pr0)}) = ${r2(5 * (1 - pr0))})`, took < 5 * (1 - pr0) + 0.6 && took > 5 * (1 - pr0) - 0.8);
T2.use(false);
await sleep(300);
ok(`T1 up with 30 HP (${T1.hp})`, T1.hp === 30);
// his own client takes over again where the drag left him
T1.at(at, 0);

// ---------------------------------------------------------------- b
for (const c of all) c.clear();
T1.at([-33, 0, -3], 0); T2.at([-31.8, 0, -3], -Math.PI / 2); // 1.2 m east of him, facing away
await sleep(400);
for (let i = 0; i < 6 && !C2.got('bodyDown').length; i++) { C1.shootAt(chest(T1.p)); await sleep(380); }
ok('T1 down again', C2.got('bodyDown').some(m => m.v === T1.id));
T2.use(true); await sleep(300);
ok(`E with the body behind: no revive (act ${T2.snap?.me?.a ?? 'none'})`, !T2.snap?.me);
T2.send({ t: 'wdDrag', on: 1 }); await sleep(200);
ok('walking with E held drags him anyway', dragOf(C2, T2.id)?.[1] === T1.id);
for (let i = 1; i <= 20; i++) { T2.at([-31.8 + 0.04 * i, 0, -3]); await sleep(31); }
T2.use(false); await sleep(250);
ok(`letting go of E drops him (wd.d ${JSON.stringify(wdOf(C2).d)}), no revive`, !dragOf(C2, T2.id) && !T2.snap?.me);
const dropped = C2.posOf(T1.id);
await sleep(300);
ok('he stays where he was dropped', flat(C2.posOf(T1.id), dropped) < 0.05);
T1.at(dropped, 0);

// ---------------------------------------------------------------- c
T2.at([dropped[0] + 0.8, 0, dropped[2]], -Math.PI / 2); await sleep(200);
T2.clear();
T2.use(true); await sleep(100); T2.send({ t: 'wdDrag', on: 1 }); await sleep(200);
ok('dragging again', dragOf(C2, T2.id)?.[1] === T1.id);
T2.at([dropped[0] + 6, 0, dropped[2]]); await sleep(250);
ok(`running off: he lets go ("${T2.got('msg').map(m => m.text).find(t => /grip/.test(t))}")`, !dragOf(C2, T2.id) && T2.got('msg').some(m => /lost your grip/.test(m.text)));
T2.use(false);

// ---------------------------------------------------------------- d: the ladder by the house's west side
const L = [-14.73, ground(-14.73, -16.3), -16.3];
T1.at(L, 0); await sleep(300); // (down, not dragged: he crawls wherever his client says)
T2.at([L[0], L[1], L[2] + 0.7], Math.PI); await sleep(300);
T2.clear();
T2.use(true); await sleep(100); T2.send({ t: 'wdDrag', on: 1 }); await sleep(200);
ok('dragging him by the ladder', dragOf(C2, T2.id)?.[1] === T1.id);
T2.at([L[0], L[1], -14.68]); await sleep(250);
ok(`onto the ladder: he lets go ("${T2.got('msg').map(m => m.text).find(t => /ladder/.test(t))}")`, !dragOf(C2, T2.id) && T2.got('msg').some(m => /ladder/.test(m.text)));
T2.use(false);

// ---------------------------------------------------------------- e: finished while dragged
T1.at([-33, 0, -3], 0); T2.at([-32.2, 0, -3], -Math.PI / 2); await sleep(400);
T2.use(true); await sleep(100); T2.send({ t: 'wdDrag', on: 1 }); await sleep(200);
ok('dragging on the lawn', dragOf(C2, T2.id)?.[1] === T1.id);
for (let i = 1; i <= 30; i++) { T2.at([-32.2 + 0.04 * i, 0, -3]); await sleep(31); }
for (const c of all) c.clear();
const body = C1.posOf(T1.id);
C1.shootAt(floorOf(body)); await sleep(400);
const fin = C2.got('bodyKill').find(m => m.v === T1.id), kill = C2.got('kill').find(m => m.v === T1.id);
ok(`a shot at where the server put him finishes him (bodyKill ${fin?.how}, kill k ${kill?.k === C1.id ? 'C1' : kill?.k})`, fin?.how === 'finished' && kill?.k === C1.id);
await sleep(100);
ok('the drag ended with him', !dragOf(C2, T2.id) && !T2.snap?.wd);
T2.use(false);

summary();
for (const c of all) c.close();
process.exit();
