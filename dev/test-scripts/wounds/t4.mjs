// 1.4 The adrenaline syringe, server side. Test server (fresh, BOTS=0): GAME_PORT=4210 MAP=cs_mansion (or
// cs_mansion_night) BOTS=0 START_MONEY=16000 MAP_ROTATION=0 ROUND_TIME=600; then
//   GAME_PORT=4210 MAP=cs_mansion node dev/test-scripts/wounds/t4.mjs
//  a. buying it ($400, in the inventory), not twice, selling it back, buying it again
//  b. a revive with it takes 2 s and uses it up; the revived man gets the after-effect (shaky, blurred, 20 s)
//  c. the next revive (no syringe) takes 5 s again; the after-effect runs out after 20 s
import { player, sleep, ok, summary, until, r2 } from './lib.mjs';

const T1 = await player('Tango', 'T'), C1 = await player('Charlie', 'CT'), T2 = await player('Toby', 'T'), C2 = await player('Cathy', 'CT');
const all = [T1, T2, C1, C2];
T1.w = T2.w = 'glock'; C1.w = C2.w = 'usp';
const chest = p => [p[0], p[1] + 1.2, p[2]];

console.log('(waiting for the first round)');
ok('round starts', await until(() => T1.got('round').length > 0, 40000));
await sleep(300);
// ---------------------------------------------------------------- a
const m0 = T1.money;
T1.send({ t: 'buy', item: 'adren' }); await sleep(300);
ok(`bought: $${m0} -> $${T1.money}, in the inventory (adren ${T1.inv?.adren})`, T1.money === m0 - 400 && T1.inv?.adren === 1);
T1.clear();
T1.send({ t: 'buy', item: 'adren' }); await sleep(300);
ok(`not twice ("${T1.got('msg').map(m => m.text).join(' | ')}")`, T1.money === m0 - 400 && T1.got('msg').some(m => /already have an adrenaline/.test(m.text)));
T1.send({ t: 'sell', item: 'adren' }); await sleep(300);
ok(`sold back: $${T1.money}, gone (adren ${T1.inv?.adren})`, T1.money === m0 && !T1.inv?.adren);
T1.send({ t: 'buy', item: 'adren' }); await sleep(300);
ok('bought again', T1.inv?.adren === 1 && T1.money === m0 - 400);
C2.send({ t: 'buy', item: 'adren' }); await sleep(300);
ok('C2 buys one too', C2.inv?.adren === 1);
await sleep(3100);

// ---------------------------------------------------------------- b
const A = [-33, 0, -3];
T2.at(A, 0); T1.at([-32.4, 0, -3], Math.PI / 2); C1.at([-39, 0, -3], -Math.PI / 2); C2.at([-39, 0, 3], -Math.PI / 2);
await sleep(500);
for (let i = 0; i < 12 && !C2.got('bodyDown').length; i++) { C1.shootAt(chest(T2.p)); await sleep(380); }
ok('T2 down', C2.got('bodyDown').some(m => m.v === T2.id));
for (const c of all) c.clear();
let t0 = Date.now();
T1.use(true);
await sleep(250);
ok(`reviving with the syringe (act ${T1.snap?.me?.a}, ${r2(T1.snap?.me?.pr)}: 2 s worth already ${r2(0.25 / 2)})`, T1.snap?.me?.a === 'bodyRevive' && T1.snap.me.pr > 0.09);
ok('up', await until(() => C2.got('bodyUp').some(m => m.v === T2.id && m.by === T1.id), 3500));
let took = (Date.now() - t0) / 1000;
ok(`in 2 s (${r2(took)} s)`, took > 1.7 && took < 2.6);
T1.use(false);
await sleep(300);
ok(`the syringe is used up (adren ${T1.inv?.adren})`, !T1.inv?.adren);
const w = T2.got('wdWounds').at(-1);
ok(`T2 gets up shaky and blurred (${JSON.stringify(w)})`, w?.n === 'ad' && w.ad > 19000 && w.adT === 20000);
ok(`T1 is told ("${T1.got('msg').map(m => m.text).find(t => /Adrenaline/.test(t))}")`, T1.got('msg').some(m => /Adrenaline: Toby is up/.test(m.text)));
ok(`T2 has 30 HP (${T2.hp})`, T2.hp === 30);

// ---------------------------------------------------------------- c
for (const c of all) c.clear();
T2.at(A, 0); await sleep(300);
for (let i = 0; i < 6 && !C2.got('bodyDown').length; i++) { C1.shootAt(chest(T2.p)); await sleep(380); }
ok('T2 down again', C2.got('bodyDown').some(m => m.v === T2.id));
t0 = Date.now();
T1.use(true);
ok('up again', await until(() => C2.got('bodyUp').some(m => m.v === T2.id), 6500));
took = (Date.now() - t0) / 1000;
ok(`without the syringe: 5 s (${r2(took)} s)`, took > 4.7 && took < 5.6);
T1.use(false);
console.log('     (waiting for the after-effect to run out)');
ok('the after-effect runs out after 20 s', await until(() => T2.got('wdWounds').some(m => !m.ad && m.n == null), 16000));

// ---------------------------------------------------------------- d. the syringe and a drag: 1 s, drag, the last 1 s
for (const c of all) c.clear();
C1.at([-36, 0, 3], 0); C2.at([-35.4, 0, 3], Math.PI / 2); T1.at([-36, 0, -3], Math.PI); T2.at([-30, 0, -3], 0);
await sleep(500);
for (let i = 0; i < 12 && !T2.got('bodyDown').length; i++) { T1.shootAt(chest(C1.p)); await sleep(380); }
ok('C1 down', T2.got('bodyDown').some(m => m.v === C1.id));
C2.use(true); await sleep(1000);
const pr = C2.snap?.me?.pr ?? 0;
ok(`C2 revives with the syringe: half done after 1 s (${r2(pr)})`, C2.snap?.me?.a === 'bodyRevive' && pr > 0.4 && pr < 0.62);
C2.send({ t: 'wdDrag', on: 1 }); await sleep(150);
for (let i = 1; i <= 25; i++) { C2.at([-35.4 - 0.04 * i, 0, 3]); await sleep(31); }
await sleep(300);
t0 = Date.now();
C2.send({ t: 'wdDrag', on: 0 });
ok('stands still: up', await until(() => T2.got('bodyUp').some(m => m.v === C1.id && m.by === C2.id), 2500));
took = (Date.now() - t0) / 1000;
ok(`in the second that was left (${r2(took)} s)`, took < 2 * (1 - pr) + 0.5);
await sleep(300);
ok(`used up (adren ${C2.inv?.adren}); C1 gets up shaky (${JSON.stringify(C1.got('wdWounds').at(-1))})`, !C2.inv?.adren && C1.got('wdWounds').at(-1)?.n === 'ad');
C2.use(false);

summary();
for (const c of all) c.close();
process.exit();
