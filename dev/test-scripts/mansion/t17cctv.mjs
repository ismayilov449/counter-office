// Step 17: CCTV, server side (Mansion; GAME_PORT test server with START_MONEY=16000, BOTS=0). A T and a CT, round 1:
// the T sits down at the security desk (the snapshot shows him sitting: pose 2, on the chair); a CT on the lawn isn't on
// the T radar while CAM 3 (the back door) is watched, and is once he switches to CAM 2 (the lawn); turned away, he isn't.
// A second player can't sit down too. A jammer near CAM 2 blinds it; the CT shoots CAM 1 (one bullet: broken, for
// everyone); the blackout turns all of them off; the CT shoots the T at the desk (he gets up); a restart mends them.
import { player, sleep, admin } from './client.mjs';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const t = await player('Watcher', 'T'), ct = await player('Sneaker', 'CT');
const TID = t.log.find(m => m.t === 'welcome').id, CTID = ct.log.find(m => m.t === 'welcome').id;
let sp = [], row = null, phase = '';
t.on.s = m => { if (m.sp) sp = m.sp; row = m.pl.find(q => q[0] === TID) || row; phase = m.ph; };
for (let i = 0; i < 150 && phase !== 'live'; i++) await sleep(100);
await sleep(300);
const seen = async () => { await sleep(700); return sp.some(q => q[0] === CTID); };

// ---- sit down; the CT out on the lawn, out of the T's own sight
const desk = [-10.0, 4.27, -12.0];
ct.at([8, 0, 2], Math.PI / 2);
t.at(desk, 0); await sleep(300);
t.clear();
t.use(true); await sleep(80); t.use(false); await sleep(400);
const on = t.got('cctv')[0];
ok(`E at the desk sits him down (cctv on, cam ${on?.cam}, at ${on?.p})`, on && on.on === 1 && on.cam === 0);
ok(`the snapshot shows him sitting on the chair (pose ${row?.[13]}, crouched ${row?.[6]}, y ${row?.[2]})`, row && row[13] === 2 && row[6] === 1 && Math.abs(row[2] - 4.72) < 0.05);
t.send({ t: 'cctv', cam: 2, yaw: 0, pitch: 0 });
ok('watching CAM 3 (the back door), the CT on the lawn is not on the T radar', !(await seen()));
t.send({ t: 'cctv', cam: 1, yaw: 0, pitch: 0 });
ok('switched to CAM 2 (the lawn): the CT is on the T radar', await seen());
// near the right edge of its picture (0.75 rad off): seen; the camera turned 0.55 rad left: not
ct.at([5.9, 0, 12.1], Math.PI / 2); await sleep(200);
ok('at the edge of the picture of CAM 2, seen', await seen());
t.send({ t: 'cctv', cam: 1, yaw: 0.55, pitch: 0 });
ok('CAM 2 turned away (0.55 rad left), not seen', !(await seen()));
t.send({ t: 'cctv', cam: 1, yaw: 0, pitch: 0 });
// in the main hall: CAM 4
ct.at([-9, 0.81, -4], 0); await sleep(200);
t.send({ t: 'cctv', cam: 3, yaw: 0, pitch: 0 });
ok('the CT in the main hall is seen on CAM 4', await seen());
t.send({ t: 'cctv', cam: 1, yaw: 0, pitch: 0 });
ct.at([8, 0, 2], Math.PI / 2);
await sleep(300);
// someone else can't sit down too
ct.at(desk, 0); await sleep(250);
ct.clear(); ct.use(true); await sleep(80); ct.use(false); await sleep(300);
ok(`a second player can't sit down (${ct.got('msg').map(m => m.text).join('; ')})`, !ct.got('cctv').length && ct.got('msg').some(m => /already watching/.test(m.text)));
ct.at([8, 0, 2], Math.PI / 2); await sleep(200);
ok('back on the lawn, he is seen again', await seen());

// ---- get up, put a jammer down near CAM 2 (inside, by the south rooms), sit down again: CAM 2 is blind
t.clear();
t.use(true); await sleep(80); t.use(false); await sleep(300);
ok(`E gets him up again, back where he stood (${t.got('cctv')[0]?.p})`, t.got('cctv')[0]?.off === 1 && Math.abs(t.got('cctv')[0].p[2] - desk[2]) < 0.01);
t.send({ t: 'buy', item: 'jammer' }); await sleep(300);
t.at([-8, 0.81, 9], 0); await sleep(300);
t.send({ t: 'jammer', p: [-8, 0.81, 9], yaw: 0 }); await sleep(300);
t.at(desk, 0); await sleep(300);
t.use(true); await sleep(80); t.use(false); await sleep(300);
t.send({ t: 'cctv', cam: 1, yaw: 0, pitch: 0 });
ok(`a jammer 10 m from CAM 2 blinds it: the CT is not seen (${t.got('jammers').slice(-1)[0]?.list?.length} jammer down)`, !(await seen()));

// ---- the CT shoots CAM 1 (the gate) from the street: broken for everyone
ct.at([25.0, 0, -6], 0); await sleep(300);
ct.clear(); t.clear();
const eye = [25.0, 1.62, -6], cam = [28.5, 3.2, -0.75], d = cam.map((v, k) => v - eye[k]), l = Math.hypot(...d);
ct.send({ t: 'shoot', o: eye, d: d.map(v => v / l), w: 'usp' }); await sleep(400);
ok(`one bullet breaks CAM 1 (gadgets ${JSON.stringify(t.got('gadgets').slice(-1)[0]?.cams)}, ${ct.got('msg').map(m => m.text).join('; ')})`, JSON.stringify(t.got('gadgets').slice(-1)[0]?.cams) === '[0]' && t.got('sfx').some(m => m.s === 'cambreak'));

// ---- the CT on the back lawn is seen on CAM 3 (the back door, far from the jammer); then the blackout (the T gets up,
// cuts it at the fuse box, sits down again): CAM 3 is off
ct.at([-27, 0, -5], 0); await sleep(300);
t.send({ t: 'cctv', cam: 2, yaw: 0, pitch: 0 });
ok('the CT on the back lawn is seen on CAM 3', await seen());
t.use(true); await sleep(80); t.use(false); await sleep(300);
t.at([-18.3, -2.2, -4.6], 0); await sleep(300);
t.use(true); await sleep(3400); t.use(false); await sleep(300);
ok('the T cut the power', t.got('lights').some(m => m.power === 'off'));
t.at(desk, 0); await sleep(300);
t.use(true); await sleep(80); t.use(false); await sleep(300);
t.send({ t: 'cctv', cam: 2, yaw: 0, pitch: 0 });
ok('with the power off CAM 3 shows nothing: the CT is not seen', !(await seen()));

// ---- the CT comes up the stairs and shoots the T at the desk: he jumps up
ct.at([-12.5, 4.27, -9.3], 0); await sleep(400);
ct.clear(); t.clear();
const e2 = [-12.5, 4.27 + 1.62, -9.3], tgt = [-10.0, 4.72 + 0.55, -12.75], d2 = tgt.map((v, k) => v - e2[k]), l2 = Math.hypot(...d2);
ct.send({ t: 'shoot', o: e2, d: d2.map(v => v / l2), w: 'usp' }); await sleep(400);
ok(`shot at the desk (hp ${t.got('dmg')[0]?.hp}), he gets up (${t.got('cctv')[0]?.why})`, t.got('dmg').length === 1 && t.got('cctv')[0]?.why === 'hurt');

// ---- a restart: the camera is back
t.clear();
await admin({ action: 'restart' });
for (let i = 0; i < 60 && !t.got('gadgets').some(m => (m.cams || []).length === 0); i++) await sleep(100);
ok('after a restart CAM 1 works again', t.got('gadgets').some(m => (m.cams || []).length === 0));
t.close(); ct.close();
process.exit();
