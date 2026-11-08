// The chimney, server side (start the server first: bash dev/test-scripts/stealth/srv.sh ROUND_TIME=600 [MAP=...];
// GAME_PORT 4240 by default; about a minute). Two scripted players, a T and a CT:
//   1. soot: up the flue you get sooty (the snapshot's st.s), crawling into the firebox you don't; out of it the soot
//      lasts 20 s of game time (measured with the snapshots' clock), then it's gone;
//   2. E on the roof by the stack puts you on the rungs under the rim (stTo, crouched);
//   3. holding E 2 s at the hearth lights the fire (st.f, the sound to everyone, a message to the lighter); E there
//      again does nothing more; E at the top now only says the fire is lit;
//   4. the fire hurts: about 20 a second in the firebox, 10 a second up the flue; the kill (an enemy who lit it) is
//      the lighter's, weapon 'fireplace';
//   5. a new round (admin restart) puts the fire out and clears the soot.
import { player, admin, sleep } from '../mansion/client.mjs';
import { CHIMNEY as C } from '../../../shared/maps/mansion_stealth.js';

const PORT = +(process.env.GAME_PORT || 4240);
const checks = [];
const check = (ok, what) => { checks.push([ok, what]); console.log(ok ? 'PASS' : 'FAIL', what); };
const waitFor = async (fn, ms, step = 50) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return !!fn(); };

const T = await player('Tee', 'T', PORT), CT = await player('Cee', 'CT', PORT);
let snap = null;
for (const c of [T, CT]) {
  const push = c.log.push.bind(c.log);
  c.hp = 100;
  c.log.push = m => { if (m.t === 'dmg') c.hp = m.hp; if (m.t === 'spawn') c.hp = 100; if (m.t === 's') { if (c === T) snap = m; return 0; } return push(m); };
}
const idOf = c => c.log.find(m => m.t === 'welcome').id;
const tid = idOf(T), cid = idOf(CT);
const sootOf = id => snap?.st?.s?.find(r => r[0] === id)?.[1] ?? null;
const hold = async (c, ms) => { c.use(true); await sleep(ms); c.use(false); };
console.log('map', T.log.find(m => m.t === 'welcome')?.map || '?', '— waiting for a live round...');
await waitFor(() => snap?.ph === 'live', 40000);
console.log('phase', snap?.ph);

const living = [-17.5, 0.813, 1.0], hearthFront = [-19.3, 0.85, 3.85];
// ---- 1. soot
CT.at([-19.3, C.hearth, 4.8], 0, 0, 1); // crawled into the firebox
await sleep(500);
check(sootOf(cid) == null, 'crawling into the firebox: no soot');
CT.at([-19.3, 4.0, 4.8]); // up the flue
await waitFor(() => sootOf(cid) != null, 1500);
check(sootOf(cid) > 19, `up the flue: sooty (st.s says ${sootOf(cid)} s)`);
CT.at(living);
await sleep(300);
const out = { t: snap.time, left: sootOf(cid) };
await waitFor(() => sootOf(cid) == null, 25000);
const gone = snap.time;
check(Math.abs((gone - out.t) / 1000 + 0.3 - out.left) < 1.0 && out.left > 19, `out of the flue the soot lasts 20 s of game time (left ${out.left} s at ${out.t}, gone at ${gone}: ${((gone - out.t) / 1000).toFixed(1)} s later)`);

// ---- 2. E at the top
T.at([-19.3, 9.75, 5.7]); // on the roof just south of the stack
await sleep(300);
T.clear();
T.use(true); await sleep(150); T.use(false);
const to = await waitFor(() => T.got('stTo').length, 1500) && T.got('stTo')[0];
check(to && Math.abs(to.p[0] + 19.3) < 0.05 && Math.abs(to.p[1] - 10.1) < 0.05 && Math.abs(to.p[2] - 4.82) < 0.05 && to.c === 1, `E on the roof by the stack: into the flue on the rungs (${to ? to.p.join(', ') + ' c ' + to.c : 'nothing'})`);
T.at(living);
await sleep(200);

// ---- 3. lighting it
CT.clear(); T.clear();
CT.at(hearthFront);
await sleep(300);
CT.use(true);
await sleep(800);
const prog = snap?.st?.f;
await sleep(1500);
CT.use(false);
await waitFor(() => snap?.st?.f === 1, 1000);
check(!prog && snap?.st?.f === 1, 'holding E 2 s at the hearth lights it (not before)');
check(T.got('stSfx').some(m => m.s === 'light'), 'everyone hears it being lit (stSfx light)');
check(CT.got('msg').some(m => /lit the fire/.test(m.text)), 'the lighter is told');
CT.clear();
await hold(CT, 600);
check(!CT.got('msg').length, 'E at the hearth again: nothing (it burns already)');
T.at([-19.3, 9.75, 5.7]);
await sleep(300);
T.clear();
T.use(true); await sleep(150); T.use(false);
await sleep(300);
check(!T.got('stTo').length && T.got('msg').some(m => /fire below is lit/.test(m.text)), 'E at the top while it burns: only "the fire below is lit"');

// ---- 4. the fire hurts
T.at([-19.3, 5.0, 4.8]); // up the flue
await sleep(400);
let hp0 = T.hp, t0 = snap.time;
await sleep(2000);
const flueRate = (hp0 - T.hp) / ((snap.time - t0) / 1000);
check(flueRate > 7 && flueRate < 13, `up the flue: ${flueRate.toFixed(1)} damage a second (10)`);
T.at([-19.3, C.hearth, 4.8], 0, 0, 1); // down in the flames
await sleep(300);
hp0 = T.hp; t0 = snap.time;
const killed = await waitFor(() => T.got('kill').length, 6000);
const k = T.got('kill')[0];
check(killed && k.v === tid && k.k === cid && k.w === 'fireplace', `in the flames he dies; the kill is the lighter's, weapon fireplace (${JSON.stringify(k)})`);
const fireRate = hp0 / ((snap.time - t0) / 1000);
check(fireRate > 14, `in the firebox: about ${fireRate.toFixed(1)} damage a second (20)`);

// ---- 5. a new round
CT.at([-19.3, 4.0, 4.8]);
await sleep(400);
CT.at(living);
await sleep(200);
check(snap?.st?.f === 1 && sootOf(cid) > 0, 'before the restart: burning, the CT sooty');
await admin({ action: 'restart' }, PORT);
await waitFor(() => !snap?.st, 5000);
check(!snap?.st, 'a new round: the fire is out and nobody is sooty (no st)');

T.close(); CT.close();
const bad = checks.filter(c => !c[0]).length;
console.log(`${checks.length - bad}/${checks.length} passed`);
process.exit(bad ? 1 : 0);
