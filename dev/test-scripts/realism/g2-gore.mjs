// Blood & horror in the browser (headless Edge on CDP_PORT, fresh test server GAME_PORT, MAP=cs_mansion, BOTS=0,
// START_MONEY=16000, ROUND_TIME=180, AUTO_BALANCE=0). The page (CT) stands 2 m from Terry (T) by a wall; Gunner (CT) shoots Terry in
// the head: blood sprays on the wall behind him, the page's screen gets blood (a kill within 2 m), a pool grows under
// the body (screenshots at once and 10 s later). Tom (T) stays away so the round goes on.
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../disguise/lib.mjs';
const g = await open('CT', 'Pagey');
const gun = await player('Gunner', 'CT');
const rounds = []; gun.on.round = m => rounds.push(m.n);
const terry = await player('Terry', 'T'), tom = await player('Tom', 'T');
for (let i = 0; i < 150 && !rounds.length; i++) await sleep(100);
for (let i = 0; i < 100 && gun.snap?.ph !== 'live'; i++) await sleep(100);
await sleep(2000);
let ok = true;
const check = (what, c) => { console.log((c ? 'OK   ' : 'FAIL ') + what); ok &&= !!c; };
const T = [-21.5, 4.27, 9.5]; // (upstairs, a room with no hostage in the line of fire)
terry.at(T, Math.PI, 0); tom.at([-14, 0.81, -2], 0, 0);
await g.tp([-20.3, 4.27, 8.6], 2.58, -0.05); await sleep(1500);
gun.at([-21.5, 4.27, 6.0], Math.PI, 0); await sleep(600);
const w = gun.me?.inv?.secondary?.id || 'usp';
for (let i = 0; i < 8 && terry.alive; i++) { gun.shootAt(terry, w, 'head'); await sleep(350); }
if (terry.alive) console.log('DBG gun', gun.alive, JSON.stringify(gun.p), 'terry', JSON.stringify(terry.p), JSON.stringify(gun.row(terry.id())), 'hits', gun.log.filter(m => m.t === 'hit').length, gun.log.filter(m => m.t === 'msg').map(m => m.text).slice(-4), 'rounds', rounds, gun.snap?.ph);
check('Terry is dead', !terry.alive);
await sleep(400);
const op = await g.ev(`document.getElementById('gore-screen').style.opacity + ' now ' + getComputedStyle(document.getElementById('gore-screen')).opacity`);
const gs = JSON.parse(await g.ev(`import('/js/gore.js').then(m => JSON.stringify(m.stats()))`));
console.log('gore', JSON.stringify(gs));
check('blood on the wall behind', gs.splats > 0);
check('blood on our screen: ' + op, +op.split(' now ')[1] > 0.2);
console.log(await g.shot('gore-now.png'));
await sleep(10000);
console.log(await g.shot('gore-10s.png'));
const gs2 = JSON.parse(await g.ev(`import('/js/gore.js').then(m => JSON.stringify(m.stats()))`));
check('a pool under the body (10 s on)', gs2.pools === 1);
check('no page errors: ' + JSON.stringify(g.errors), !g.errors.length);
console.log(ok ? 'ALL OK' : 'FAILED');
process.exit(ok ? 0 : 1);
