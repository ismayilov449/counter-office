// Walls & water, server side, 2.2: burst pipes and live wires (GAME_PORT=4220; run
// `sh srv.sh START_MONEY=16000 ROUND_TIME=600 GAS_LEAK_X=6` first; ~2 minutes). A CT shooting, two Ts.
//   a. a bullet through the hall's south wall at the pipe's height bursts the pipe: sprays out of both holes, a wet
//      patch on each side's floor (snapshot `wa`), growing;
//   b. the water alone hurts nobody; cutting the cable in the same wall makes it spark, and the T standing in the hall's
//      wet patch is electrocuted (kill 'electrocuted', credited to the CT), the T standing dry beside it is not;
//   c. with the power cut at the fuse box: the cut cable is dead (no sparks, nobody hurt in the water); a CT brings the
//      power back and it shocks again;
//   d. a cut cable's sparks set off gas: the kitchen's gas pipe shot open, the cable in the kitchen's wall cut while the
//      power is off, the power brought back: the kitchen blows up ('electric');
//   e. a new round: dry, mended, dead (no `wa`).
import { player, sleep, admin } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { penetrate, runHit } from '../../../shared/walls.js';
import { wallRuns } from '../../../shared/maps/mansion_walls.js';
import { PLAYER } from '../../../shared/physics.js';

const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const waitFor = async (fn, ms, step = 100) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return false; };
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(1);

const map = MAPS.cs_mansion, world = new CollisionWorld(map), runs = wallRuns(map);
const run = n => runs.find(r => r.name === n);

const CT = await player('Shooter', 'CT'), T1 = await player('Wet', 'T'), T2 = await player('Dry', 'T');
let ph = null, wa = null, gs = null, lights = null;
const ev = [];
CT.on.s = m => { ph = m.ph; wa = m.wa || null; gs = m.gs || null; };
for (const t of ['kill', 'waZap', 'gasBoom', 'gasLeak', 'lights', 'round']) CT.on[t] = m => { ev.push({ at: +sec(), ...m }); if (m.lights) lights = m.lights; };
for (const c of [CT, T1, T2]) {
  const push = c.log.push.bind(c.log);
  c.hp = 100;
  c.log.push = m => { if (m.t === 'dmg') c.hp = m.hp; if (m.t === 'spawn') c.hp = 100; return m.t === 's' ? 0 : push(m); };
}
const ids = { CT: CT.log.find(m => m.t === 'welcome').id, T1: T1.log.find(m => m.t === 'welcome').id, T2: T2.log.find(m => m.t === 'welcome').id };
const evs = (t, since = 0) => ev.filter(e => e.t === t && e.at >= since);
const hold = async (c, ms) => { c.use(true); await sleep(ms); c.use(false); };
// shoot through a wall at a run's point `along` metres from its start, from `from` (feet)
async function shootRun(name, along, from, w = 'usp') {
  const r = run(name), dir = norm([r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]]);
  const target = [r.a[0] + dir[0] * along, r.a[1], r.a[2] + dir[2] * along];
  const o = [from[0], from[1] + PLAYER.eye, from[2]], d = norm([target[0] - o[0], target[1] - o[1], target[2] - o[2]]);
  const pen = penetrate(map, world, o, d, 250, w), h = pen.passes.length ? runHit(runs, pen.passes[0]) : null;
  CT.w = w; CT.at(from);
  await sleep(200);
  CT.send({ t: 'shoot', o, d, w });
  await sleep(150);
  return h?.run.name;
}
async function newRound() {
  await admin({ action: 'restart' });
  await sleep(800);
  await waitFor(() => ph === 'live', 10000);
  await sleep(400);
}

console.log('waiting for a live round...');
await waitFor(() => ph === 'live', 30000);
await sleep(300);
console.log('teams:', CT.me?.team, T1.me?.team, T2.me?.team);

// ---- a. the pipe in the hall's south wall (W2), shot from the south-east room
T1.at([-9.5, 0.813, 4.0]); // (out of the bullets' way while the CT shoots)
T2.at([-10.2, 0.813, 4.6]); // in the hall, 2.4 m off: dry
let hit = await shootRun('W2', 3.6, [-7.8, 0.813, 8.6]);
T1.at([-8.3, 0.813, 5.85]); // in the hall, by the wall, where the water will be (beside the bullets' way)
check(hit === 'W2', `a. the shared trace says the bullet cuts the pipe (${hit})`);
await waitFor(() => wa?.[1]?.length, 2000);
const sprays = wa?.[1] || [], patches0 = (wa?.[0] || []).map(p => p.slice());
check(sprays.length === 2 && sprays.some(s => s[4] === -1) && sprays.some(s => s[4] === 1), `a. water sprays out of both holes (${sprays.length} sprays, normals ${sprays.map(s => s[4]).join(' ')})`);
check(patches0.length === 2 && patches0.every(p => Math.abs(p[1] - 0.81) < 0.02), `a. a wet patch on each side's floor (${patches0.map(p => `[${p.slice(0, 4).join(', ')}]`).join(' ')})`);
await sleep(6000);
const patches6 = wa?.[0] || [];
check(patches6.length === 2 && patches6.every((p, i) => p[3] > patches0[i][3] + 0.3), `a. they grow while the pipe sprays (r ${patches0.map(p => p[3]).join('/')} → ${patches6.map(p => p[3]).join('/')} after 6 s)`);

// ---- b. the water alone hurts nobody; the cable cut next to the pipe's hole: the man in the water is electrocuted
check(T1.hp === 100 && T2.hp === 100 && !evs('waZap').length, `b. standing in the water is harmless without a live wire (hp ${T1.hp})`);
// first a cut 3 m along the wall from the water: too far for its sparks
hit = await shootRun('E2', 0.5, [-10.9, 0.813, 8.6]);
await sleep(3000);
check(hit === 'E2' && wa?.[2]?.length === 2 && !evs('waZap').length && T1.hp === 100, `b. a cable cut 3 m from the water sparks, but its sparks don't reach the patch (hp ${T1.hp})`);
const zap0 = evs('waZap').length, cutAt = +sec();
hit = await shootRun('E2', 3.75, [-7.65, 0.813, 8.6]);
check(hit === 'E2', `b. the shared trace says the bullet cuts the cable (${hit})`);
await waitFor(() => wa?.[2]?.length, 2000);
check(wa?.[2]?.length === 4 && wa[2].every(e => e[5] === 1), `b. the cable's ends spark at both holes, live (${JSON.stringify(wa?.[2])})`);
await waitFor(() => evs('kill', cutAt).some(k => k.v === ids.T1), 8000);
const k1 = evs('kill', cutAt).find(k => k.v === ids.T1);
check(evs('waZap').length > zap0 && !!k1 && k1.w === 'electrocuted', `b. the T in the wet patch is electrocuted (${evs('waZap').length - zap0} shocks, kill weapon ${k1?.w})`);
check(k1?.k === ids.CT, `b. the kill is the CT's, who cut the cable (killer ${k1?.k})`);
check(T2.hp === 100, `b. the T standing dry 2 m off isn't hurt (hp ${T2.hp})`);

// ---- c. the power cut: a dead cable
await newRound();
check(!wa, `e. a new round: dry and mended (wa ${JSON.stringify(wa)})`);
T2.at([-18.3, -2.2, -4.4]); // the fuse box
await sleep(300);
await hold(T2, 3400);
await waitFor(() => lights?.power === false, 2000);
check(lights?.power === false, 'c. the T cut the power at the fuse box');
T1.at([-9.5, 0.813, 4.0]);
await shootRun('W2', 3.6, [-7.8, 0.813, 8.6]);
await shootRun('E2', 3.75, [-7.65, 0.813, 8.6]);
T1.at([-8.3, 0.813, 5.85]);
await sleep(4000);
const deadZaps = evs('waZap', +sec() - 4).length;
check(wa?.[2]?.length === 2 && wa[2].every(e => e[5] === 0) && T1.hp === 100 && deadZaps === 0, `c. with the power off the cut cable is dead (ends ${JSON.stringify(wa?.[2]?.map(e => e[5]))}, T in the water hp ${T1.hp})`);
CT.at([-18.3, -2.2, -4.4]);
await sleep(300);
const back = +sec();
await hold(CT, 5400);
await waitFor(() => lights?.power !== false, 2000);
await waitFor(() => evs('waZap', back).length > 0, 5000);
check(lights?.power !== false && evs('waZap', back).length > 0 && T1.hp < 100, `c. the CT brought the power back: it shocks again (T hp ${T1.hp})`);

// ---- d. the kitchen: gas, the cable in its east wall cut with the power off, the power back
await newRound();
T1.at([-9, 4.27, 0]); T2.at([-18.3, -2.2, -4.4]);
await sleep(300);
await hold(T2, 3400);
await waitFor(() => lights?.power === false, 2000);
T2.at([-9, 4.27, 2]);
hit = await shootRun('E1', 3.25, [-11.0, 0.813, -10.7]); // from the north-east room into the kitchen's wall
check(hit === 'E1' && wa?.[2]?.length === 2, `d. the kitchen wall's cable cut with the power off (${hit})`);
// the kitchen's gas pipe, shot from inside the kitchen
CT.w = 'usp'; CT.at([-16.6, 0.813, -11.6]);
await sleep(200);
{ const o = [-16.6, 0.813 + PLAYER.eye, -11.6], d = norm([0, 2.6 - o[1], -13.95 - o[2]]); CT.send({ t: 'shoot', o, d, w: 'usp' }); }
await waitFor(() => evs('gasLeak').length, 2000);
check(evs('gasLeak').length > 0, 'd. the kitchen\'s gas pipe is shot open');
CT.at([-11, 0.813, -2]);
const gasRoom = () => Math.max(0, ...((gs?.r || []).filter((_, i) => i % 2 === 1)));
await waitFor(() => gasRoom() >= 0.3 * 250, 40000, 250);
check(gasRoom() >= 0.3 * 250, `d. the kitchen fills with gas (${(gasRoom() / 250).toFixed(2)}) and nothing sets it off while the cable is dead`);
check(!evs('gasBoom').length, 'd. no blast yet');
CT.at([-18.3, -2.2, -4.4]);
await sleep(300);
const back2 = +sec();
await hold(CT, 5400);
await waitFor(() => evs('gasBoom', back2).length, 6000);
const boom = evs('gasBoom', back2)[0];
check(!!boom && boom.k === 'electric', `d. the power back on: the cut cable's spark sets the kitchen off (gasBoom kind ${boom?.k})`);

// ---- e. a new round
await newRound();
check(!wa, 'e. the next round starts dry, with no live wires');

CT.close(); T1.close(); T2.close();
const failed = checks.filter(c => !c).length;
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
