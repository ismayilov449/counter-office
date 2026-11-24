// Phone tracker, version 2, the server's part (ROADMAP 14.5-14.7). Fresh test server: GAME_PORT=3995 MAP=cs_mansion
// BOTS=0 START_MONEY=16000 FREEZE_TIME=1 PHONE_TRACKER=1 (no browser).
// Alice (CT, the tracker) and Bob (T). 14.7: a scan shows the 4 hostages' phones (white circles); Bob zip-ties one and
// takes its phone: the next scan shows 3. 14.5: Bob shoots the garage tower's cabinet: it's down (everyone told, the
// snapshot's tw), and the next scan says so and its circles are bigger; Alice repairs it (hold E 5 s). 14.6: Alice
// launches a drone and scans from it (R): the result says it came from the drone, and Bob, outdoors, gets a sharper
// circle than from the ground at the same spot.
import { player, sleep, until, checker } from '../disguise/lib.mjs';
import { nextLive, got, dist3 } from '../explosives/lib.mjs';
import { TRACKER } from '../../../shared/phonetracker.js';
import { TOWERS } from '../../../shared/maps/mansion_phonetracker.js';
const ok = checker();
const st = { rounds: [], round: 0 };
const alice = await player('Alice', 'CT');
alice.on.round = m => st.rounds.push(m.n);
const bob = await player('Bob', 'T');
const told = [];
for (const c of [alice, bob]) c.on.msg = m => told.push(m.text);
await nextLive([alice, bob], st);
alice.send({ t: 'buy', item: 'drone' });
await until(() => alice.snap?.ph === 'live', 8000);
await sleep(400);
ok('Alice has the tracker', alice.me?.inv?.tracker > 0);
ok(`Alice bought a drone (${alice.me?.inv?.drone})`, alice.me?.inv?.drone > 0);
alice.w = 'tracker';
const APOS = [-1, 0, -6];
alice.at(APOS, Math.PI / 2);
async function scan(drone = false) {
  const n = got(alice, 'trk').length;
  alice.send(drone ? { t: 'scan', drone: 1 } : { t: 'scan' });
  await until(() => got(alice, 'trk').length > n, (TRACKER.scanTime + 2) * 1000);
  return got(alice, 'trk').at(-1);
}
// Bob waits in the back garden (outdoors)
const BOB = [-40, 0, 2];
bob.at(BOB, 0);
await sleep(500);
await scan(); // (the first one only counts)
const s2 = await scan();
ok(`14.7: the 4 hostages' phones show (${s2?.h?.length} white circles)`, s2?.h?.length === 4);

// 14.7: Bob zip-ties the downstairs hostage and takes its phone
const H2 = [-22.25, 4.27, -3.658]; // (the upstairs hostage by the T spawn)
bob.at([-21.4, 4.27, -3.2], Math.PI / 2, 1);
await sleep(400);
bob.send({ t: 'use', on: true });
ok('Bob zip-ties it and takes its phone', await until(() => told.some(t => /took the hostage's phone/.test(t)), 4000));
bob.send({ t: 'use', on: false });
const s3 = await scan();
ok(`the next scan shows 3 hostages' phones (${s3?.h?.length})`, s3?.h?.length === 3);

// 14.5: Bob shoots the garage tower's cabinet
const G = TOWERS[1].box, gc = G.min.map((v, i) => (v + G.max[i]) / 2);
const BPOS = [gc[0], 0, gc[2] + 3];
bob.at(BPOS, 0, 0);
await sleep(400);
for (let i = 0; i < TRACKER.tower.hits + 2 && !told.some(t => /garage cell tower is down/.test(t)); i++) {
  const o = bob.eye(), d = gc.map((v, k) => v - o[k]), l = Math.hypot(...d);
  bob.send({ t: 'shoot', o, d: d.map(v => v / l), w: bob.me?.inv?.secondary?.id || 'glock', rt: 0 });
  await sleep(300);
}
ok('the garage tower is down, everyone is told', told.some(t => /garage cell tower is down/.test(t)));
await sleep(300);
ok(`the snapshot says so (${JSON.stringify(alice.snap?.tw)})`, JSON.stringify(alice.snap?.tw) === '[0,1,0]');
bob.at(BOB, 0, 0);
await sleep(1500);
const s4 = await scan();
ok(`the scan knows a tower is down (down ${s4?.down})`, s4?.down === 1);

// Alice repairs it
alice.w = 'knife';
alice.at([gc[0], 0, G.max[2] + 0.5], Math.PI);
await sleep(400);
alice.send({ t: 'use', on: true });
ok(`Alice repairs it in ${TRACKER.tower.repair} s`, await until(() => told.some(t => /repaired the garage cell tower/.test(t)), (TRACKER.tower.repair + 2) * 1000));
alice.send({ t: 'use', on: false });
await sleep(300);
ok(`the snapshot: no tower down (${JSON.stringify(alice.snap?.tw)})`, alice.snap?.tw == null);

// 14.6: from the drone, over the back garden (Bob outdoors: sharper than from the ground at the same spot)
const DPOS = [-30, 6, 2];
alice.at([DPOS[0], 0, DPOS[2]], Math.PI / 2);
alice.w = 'tracker';
// Bob walks up and down (a walking phone never shrinks or hits the smallest circle: a fair comparison)
let wk = 0;
const walker = setInterval(() => { wk += 0.2; bob.at([BOB[0], 0, BOB[2] + Math.abs((wk % 8) - 4) - 2], 0, 0); }, 50); // (4 m/s, back and forth over 4 m)
await sleep(1000);
const ground = await scan();
alice.w = 'drone';
alice.send({ t: 'drone', launch: 1, p: alice.eye(), yaw: Math.PI / 2 });
await sleep(400);
// the pilot's browser keeps telling the server where the drone is (or it falls after 3 s)
let dy = 1.62;
const flying = setInterval(() => { dy = Math.min(DPOS[1], dy + 1); alice.send({ t: 'drone', p: [DPOS[0], dy, DPOS[2]], yaw: Math.PI / 2 }); }, 100);
await sleep(800);
const fromDrone = await scan(true);
clearInterval(flying);
clearInterval(walker);
const r = s => s?.c?.[0]?.[2];
ok(`the drone scan says it came from the drone (drone ${fromDrone?.drone})`, fromDrone?.drone === 1);
ok(`and Bob's circle (outdoors, walking) is sharper from the drone (${r(fromDrone)} vs ${r(ground)} from the ground)`, r(fromDrone) < r(ground) * 0.7);
console.log(ok.fails() ? ok.fails() + ' FAILED' : 'ALL OK');
process.exit(ok.fails() ? 1 : 0);
