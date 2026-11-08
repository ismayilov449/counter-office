// The trunk, server side (start the server first: bash dev/test-scripts/stealth/srv.sh ROUND_TIME=600 [MAP=...];
// GAME_PORT 4240 by default; about 40 s). Three scripted players: a T (who drives, then opens the trunk and blows the car
// up), a CT (who hides) and a second CT:
//   1. E beside the back of the garage's car: into its trunk (st.k, the lid's sound); the snapshot keeps him inside
//      the car's body, crouched, wherever his browser says he is; he can't shoot;
//   2. the T drives the car out of the garage: the hider goes along;
//   3. E: out of the trunk, behind the car (stTo), and his own position counts again;
//   4. the pickup has no trunk;
//   5. a teammate opening the trunk is told who's in it; an enemy opening it finds him (he tumbles out);
//   6. the car blown up with him inside: he dies, the kill is whoever blew it up ('car').
import { player, sleep } from '../mansion/client.mjs';
import { trunkPos, trunkBack } from '../../../shared/stealth.js';
import { carForward } from '../../../shared/vehicles.js';

const PORT = +(process.env.GAME_PORT || 4240);
const checks = [];
const check = (ok, what) => { checks.push([ok, what]); console.log(ok ? 'PASS' : 'FAIL', what); };
const waitFor = async (fn, ms, step = 50) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return !!fn(); };

const T = await player('Tee', 'T', PORT), CT = await player('Cee', 'CT', PORT), CT2 = await player('Cee2', 'CT', PORT);
let snap = null;
const slow = {}; // (the snapshot's slow parts come only when they change: keep the last ones, as the browsers do)
for (const m of T.log) if (m.t === 's') for (const k of ['cars', 'hs', 'dr']) if (k in m) slow[k] = m[k]; // (the first ones came before the hook)
for (const c of [T, CT, CT2]) {
  const push = c.log.push.bind(c.log);
  c.log.push = m => { if (m.t === 's') { if (c === T) { for (const k of ['cars', 'hs', 'dr']) { if (k in m) slow[k] = m[k]; else m[k] = slow[k]; } snap = m; } return 0; } return push(m); };
}
const idOf = c => c.log.find(m => m.t === 'welcome').id;
const tid = idOf(T), cid = idOf(CT), c2id = idOf(CT2);
const row = id => snap?.pl?.find(r => r[0] === id);
const car = id => { const r = snap?.cars?.find(c => c[0] === id); return r && { id, p: [r[1], r[2], r[3]], yaw: r[4], hp: r[8], wrecked: r[11] }; };
const hidden = () => snap?.st?.k || [];
const press = async c => { c.use(true); await sleep(120); c.use(false); await sleep(150); };
console.log('waiting for a live round...');
await waitFor(() => snap?.ph === 'live' && snap.cars, 40000);
const garage = car(1);
console.log('phase', snap?.ph, 'garage car', JSON.stringify(garage), 'pickup', JSON.stringify(car(0)));
const f = carForward(garage.yaw), right = [-f[2], 0, f[0]];
const at = (c, along, side) => [c.p[0] + f[0] * along + right[0] * side, c.p[1], c.p[2] + f[2] * along + right[2] * side];

// ---- 1. into the trunk (from beside its back end: the garage's wall is right behind it)
CT.at(at(garage, -1.85, -1.3));
CT2.at(at(garage, 1.0, 2.6)); // (by the garage's side, out of the way)
T.at(at(garage, 0.3, 1.5)); // beside the driver's door
await sleep(300);
T.clear();
await press(CT);
await waitFor(() => hidden().some(k => k[0] === cid), 1500);
check(hidden().some(k => k[0] === cid && k[1] === 1), `E beside the back of the car: in its trunk (st.k ${JSON.stringify(hidden())})`);
check(T.got('stSfx').some(m => m.s === 'trunk'), 'everyone hears the lid');
check(CT.got('msg').some(m => /hiding in the trunk/.test(m.text)), 'the hider is told');
const want = trunkPos(garage);
CT.at([0, 0, 0]); // his browser says he's somewhere else
await sleep(400);
let r = row(cid);
check(r && Math.hypot(r[1] - want[0], r[3] - want[2]) < 0.05 && Math.abs(r[2] - want[1]) < 0.05 && r[6] === 1, `the snapshot keeps him inside the car, crouched (${r && r.slice(1, 4).join(', ')} c ${r && r[6]}; trunk ${want.map(v => v.toFixed(2)).join(', ')})`);
CT.clear(); T.clear();
CT.send({ t: 'shoot', w: 'usp', o: [want[0], want[1] + 0.8, want[2]], d: [0, 0, 1], rt: snap.time });
await sleep(300);
check(!T.got('shot').length, 'he can\'t shoot from inside');

// ---- 2. the T drives it out of the garage (through the roller door, his browser's physics: the server trusts it)
await press(T);
check(T.got('drive').length === 1, 'the T gets in to drive (from beside the door)');
const start = car(1).p;
for (let i = 1; i <= 15; i++) {
  T.send({ t: 'car', id: 1, p: [start[0] + i * 0.8, start[1], start[2]], yaw: garage.yaw, speed: 6, steer: 0 });
  await sleep(80);
}
T.send({ t: 'car', id: 1, p: [start[0] + 12, start[1], start[2]], yaw: garage.yaw, speed: 0, steer: 0 }); // (well clear of the roller door: E behind the car there would roll it)
await sleep(300);
const moved = car(1);
r = row(cid);
const want2 = trunkPos(moved);
check(Math.abs(moved.p[0] - start[0] - 12) < 0.05 && r && Math.hypot(r[1] - want2[0], r[3] - want2[2]) < 0.05, `driven 12 m out onto the lawn: the hider went along (${r && r.slice(1, 4).join(', ')})`);
check(hidden().some(k => k[0] === cid), 'still hidden');

// ---- 3. out
CT.clear();
await press(CT);
const to = await waitFor(() => CT.got('stTo').length, 1000) && CT.got('stTo')[0];
const back = trunkBack(moved);
check(to && to.c === 0 && Math.hypot(to.p[0] - back[0], to.p[2] - back[2]) < 1.6 && !hidden().some(k => k[0] === cid), `E: out, behind the car (${to && to.p.join(', ')})`);
CT.at([to.p[0], to.p[1], to.p[2] + 0.5]);
await sleep(400);
r = row(cid);
check(r && Math.abs(r[3] - (to.p[2] + 0.5)) < 0.05, 'his own position counts again');

// ---- 4. the pickup has no trunk
const pk = car(0), pf = carForward(pk.yaw);
CT2.at([pk.p[0] - pf[0] * 2.8, pk.p[1], pk.p[2] - pf[2] * 2.8]);
await sleep(300);
CT2.clear();
await press(CT2);
await sleep(300);
const inPickup = CT2.got('ride').length || CT2.got('drive').length;
check(!hidden().some(k => k[0] === c2id), `behind the pickup: no trunk (${inPickup ? 'E got him into the pickup instead' : 'nothing'})`);
if (inPickup) await press(CT2);

// ---- 5. a teammate opens it, then an enemy
const behind = [back[0] - f[0] * 0.5, back[1], back[2] - f[2] * 0.5];
CT.at(behind);
await sleep(300);
await press(CT);
await waitFor(() => hidden().some(k => k[0] === cid), 1000);
check(hidden().some(k => k[0] === cid), 'back into the trunk (the T still at the wheel)');
await press(T); // the driver gets out first
const tOut = T.got('exited').slice(-1)[0];
CT2.at([behind[0] + right[0] * 0.3, behind[1], behind[2] + right[2] * 0.3]);
await sleep(300);
CT2.clear(); CT.clear();
await press(CT2);
check(CT2.got('msg').some(m => /Cee is already curled up/.test(m.text)) && hidden().some(k => k[0] === cid), 'a teammate opening it is told who\'s in it; he stays');
CT2.at(at(garage, 1.0, 2.6));
T.at([behind[0] - right[0] * 0.3, behind[1], behind[2] - right[2] * 0.3]);
await sleep(300);
T.clear(); CT.clear();
await press(T);
await waitFor(() => CT.got('stTo').length, 1000);
check(CT.got('stTo').length && !hidden().some(k => k[0] === cid) && T.got('msg').some(m => /Cee was hiding/.test(m.text)) && CT.got('msg').some(m => /you've been found/.test(m.text)),
  `an enemy opening it finds him: he tumbles out, both are told (${tOut ? 'the driver got out first' : ''})`);

// ---- 6. blown up with him inside
CT.at(behind);
await sleep(300);
await press(CT);
await waitFor(() => hidden().some(k => k[0] === cid), 1000);
const c1 = car(1);
const eye = [c1.p[0] + f[0] * 7, c1.p[1] + 1.6, c1.p[2] + f[2] * 7]; // (in front of it on the north lawn: the house is on its south side)
T.at([eye[0], c1.p[1], eye[2]]);
await sleep(300);
T.clear(); CT.clear();
const aim = [c1.p[0] - eye[0], c1.p[1] + 0.6 - eye[1], c1.p[2] - eye[2]], len = Math.hypot(...aim), d = aim.map(v => v / len);
for (let i = 0; i < 40 && !car(1).wrecked; i++) {
  T.send({ t: 'shoot', w: 'glock', o: eye, d, rt: snap.time });
  await sleep(170);
  if (i === 18) { T.send({ t: 'reload', w: 'glock' }); await sleep(2400); }
}
await waitFor(() => T.got('kill').some(m => m.v === cid), 1500);
const k = T.got('kill').find(m => m.v === cid);
check(car(1).wrecked && k && k.k === tid && k.w === 'car' && !hidden().length, `shot until it blows up: the hider dies with it, the T's kill (${JSON.stringify(k)})`);

for (const c of [T, CT, CT2]) c.close();
const bad = checks.filter(c => !c[0]).length;
console.log(`${checks.length - bad}/${checks.length} passed`);
process.exit(bad ? 1 : 0);
