// The drone takes DRONE.hits (4) bullets (Mansion; GAME_PORT test server with START_MONEY=16000, BOTS=0). A T and a CT,
// round 1: the CT buys an M3, the T a drone and hovers it; one M3 blast (every pellet on it) is one hit (hp 3), a USP
// shot another (hp 2; the snapshot says so); the T lands it by himself and relaunches it (still 2); two more shots
// bring it down (droneDown).
import { player, sleep } from './client.mjs';
const t = await player('Pilot', 'T'), ct = await player('Gunner', 'CT');
const ev = [], ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
let dn = null;
t.on.s = m => { dn = m.dn || null; };
for (const [c, who] of [[t, 'T'], [ct, 'CT']]) {
  c.on.droneHit = m => ev.push(`${who} droneHit hp ${m.hp}`);
  c.on.droneDown = () => ev.push(`${who} droneDown`);
}
const pilotAt = [-6, 0, -18], eye = [-6, 0.76, -18];
const fly = async (from, to, secs) => {
  const n = Math.ceil(secs / 0.05);
  for (let i = 1; i <= n; i++) { t.send({ t: 'drone', p: from.map((v, j) => v + (to[j] - v) * (i / n)), yaw: Math.PI / 2, pitch: 0 }); await sleep(50); }
  return to;
};
const launch = async () => { const p = [eye[0] - 0.6, eye[1] + 0.1, eye[2]]; t.send({ t: 'drone', launch: 1, p, yaw: Math.PI / 2 }); await sleep(250); return p; };
const roundStart = async () => {
  t.clear();
  for (let i = 0; i < 150 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
  await sleep(3300); // the freeze time
};
const ctEye = [4, 1.62, -18];
// (a shotgun sends a direction per pellet, ds: here all 9 straight at the drone, a little apart)
const shoot = async (p, w) => {
  const d = p.map((v, i) => v - ctEye[i]), l = Math.hypot(...d), dir = d.map(v => v / l);
  ct.send(w === 'm3' ? { t: 'shoot', o: ctEye, ds: Array.from({ length: 9 }, (_, k) => [dir[0], dir[1] + (k - 4) * 0.01, dir[2] + ((k % 3) - 1) * 0.01]), w, rt: 0 } : { t: 'shoot', o: ctEye, d: dir, w, rt: 0 });
  await sleep(900);
};
const hpNow = () => dn?.[0]?.[8];

// ---- round 1: the CT buys an M3 in the CT spawn, the T a drone in the house
await roundStart();
ct.at([26.5, 0, -8], Math.PI / 2); await sleep(200); ct.send({ t: 'buy', item: 'm3' }); await sleep(300);
ok('the CT bought an M3', ct.me?.inv?.primary?.w === 'm3' || JSON.stringify(ct.me?.inv?.primary || '').includes('m3'));
t.at([-10, 4.27, -5], 0, 0, 0); await sleep(200); t.send({ t: 'buy', item: 'drone' }); await sleep(250);
t.at(pilotAt, Math.PI / 2, 0, 1); ct.at([4, 0, -18], Math.PI / 2); ct.w = 'm3'; await sleep(300);
let p = await launch();
p = await fly(p, [-6, 3, -18], 0.6);
ok(`a new drone can take ${hpNow()} hits (snapshot)`, hpNow() === 4);
// from 3 m at eye height every pellet of the blast hits it: still one hit
p = await fly(p, [1, 1.62, -18], 0.6);
await shoot(p, 'm3');
ok('one M3 blast = one hit: ' + (ev.join(', ') || '(nothing)'), ev.filter(e => e.startsWith('CT ')).join() === 'CT droneHit hp 3');
ct.w = 'usp'; await sleep(200);
await shoot(p, 'usp');
ok('then a USP shot: hp 2: ' + ev.join(', '), ev.filter(e => e.startsWith('CT droneHit')).map(e => +e.slice(-1)).join() === '3,2' && !ev.some(e => e.includes('Down')));
ok(`snapshot hp after two hits: ${hpNow()}`, hpNow() === 2);
p = await fly(p, [-7.5, 2, -18], 0.8);
p = await fly(p, [-7.5, 0.15, -18], 0.6);
t.send({ t: 'drone', p, land: 1 }); await sleep(400);
ok('landed by the pilot: back in the bag', t.me?.inv?.drone === 1);
p = await launch();
p = await fly(p, [-6, 3, -18], 0.6);
ok(`relaunched, still damaged: hp ${hpNow()}`, hpNow() === 2);
ev.length = 0;
await shoot(p, 'usp');
ok('third hit: droneHit hp 1, still flying', ev.includes('CT droneHit hp 1') && !ev.some(e => e.includes('Down')));
await shoot(p, 'usp');
ok('fourth hit brings it down: ' + ev.join(', '), ev.includes('CT droneDown') && ev.includes('T droneDown'));
t.close(); ct.close(); process.exit();
