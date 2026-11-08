// 5.1 No radar underground, on the server (GAME_PORT=4250; run srv.sh first, MAP=cs_mansion or cs_mansion_night).
// Three scripted players (T, CT, CT2):
//   a. control: T and CT face each other in the living room: each team's snapshot has the other as a red dot
//   b. both in the cellar, facing each other: no red dot for either (and an underground player's "sp" is empty)
//   c. the CT at the foot of the cellar stairs sees the T at the top (in the kitchen): neither is spotted (the CT is
//      underground, so he spots nobody either); CT2 in the kitchen sees the T: CT2's radar has him, the CT's (still
//      underground) doesn't
//   d. a ping and a target call from underground are refused with the message; a ping from above ground works
import { player, sleep } from '../mansion/client.mjs';

const MAPID = process.env.MAP || 'cs_mansion';
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
const T = await player('Tee', 'T'), C = await player('Cee', 'CT'), C2 = await player('Cee2', 'CT');
const id = c => c.log.find(m => m.t === 'welcome')?.id;
const ids = { T: id(T), C: id(C), C2: id(C2) };
for (const c of [T, C, C2]) {
  c.sp = null; c.ph = null;
  c.on.s = m => { if ('sp' in m) c.sp = m.sp; c.ph = m.ph ?? c.ph; };
  const push = c.log.push.bind(c.log);
  c.log.push = m => (m.t === 's' ? 0 : push(m)); // (no snapshots in the log)
}
const waitFor = async (fn, ms, step = 100) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return fn(); };
const face = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));
const put = (c, p, look) => c.at(p, face(p, look));
const has = (c, who) => (c.sp || []).some(e => e[0] === who);

console.log('map', MAPID, 'ids', JSON.stringify(ids), '— waiting for a live round...');
await waitFor(() => T.ph === 'live' || T.ph === 'freeze', 20000);
await waitFor(() => T.ph === 'live', 8000);
console.log('phase', T.ph, 'teams', [T, C, C2].map(c => c.me?.team).join(' '));
const AWAY = [27.5, 0, 12]; // the street (CT side), looking at nothing

// a. control
let tp = [-18, 0.813, 1], cp = [-18, 0.813, -3];
put(T, tp, cp); put(C, cp, tp); put(C2, AWAY, [27.5, 0, 20]);
await sleep(900);
check(has(C, ids.T) && has(C2, ids.T), `a. living room: the CTs' radar has the T (C ${JSON.stringify(C.sp)}, C2 ${JSON.stringify(C2.sp)})`);
check(has(T, ids.C), `a. living room: the T's radar has the CT (${JSON.stringify(T.sp)})`);

// b. both in the cellar
tp = [-15.5, -2.2, 2.5]; cp = [-15.5, -2.2, -2.5];
put(T, tp, cp); put(C, cp, tp);
await sleep(1200);
check(!has(C2, ids.T) && !has(T, ids.C), `b. cellar: no red dots (C2 ${JSON.stringify(C2.sp)}, T ${JSON.stringify(T.sp)})`);
check(Array.isArray(C.sp) && C.sp.length === 0 && Array.isArray(T.sp) && T.sp.length === 0, `b. cellar: both underground players get an empty "sp" (C ${JSON.stringify(C.sp)}, T ${JSON.stringify(T.sp)})`);

// c. the stairs: the CT below, the T above
tp = [-14.6, 0.813, -11.5]; cp = [-14.4, -2.2, -4.6];
put(T, tp, cp); put(C, cp, tp);
await sleep(1200);
check(!has(C2, ids.T), `c. the CT under ground sees the T in the kitchen: not spotted for his team (C2 ${JSON.stringify(C2.sp)})`);
check(!has(T, ids.C), `c. the T sees the CT on the cellar stairs: not spotted (T ${JSON.stringify(T.sp)})`);
const c2p = [-19.5, 0.813, -9.5];
put(C2, c2p, tp);
put(T, tp, [-17, 0.813, -6]); // (between the two CTs: both within his field of view)
await sleep(1200);
check(has(C2, ids.T), `c. CT2 in the kitchen sees the T: on CT2's radar (${JSON.stringify(C2.sp)})`);
check(Array.isArray(C.sp) && C.sp.length === 0, `c. ...but not on the radar of the CT still underground (${JSON.stringify(C.sp)})`);
check(has(T, ids.C2) && !has(T, ids.C), `c. the T's radar: CT2 yes, the CT underground no (${JSON.stringify(T.sp)})`);

// d. pings and target calls
for (const c of [C, C2]) c.clear();
C.send({ t: 'mark', p: [-15.5, -2.2, 0] });
C.send({ t: 'spot', p: [-15.5, -2.2, 0] });
await sleep(400);
const msgs = C.got('msg').map(m => m.text);
check(msgs.filter(t => /underground/i.test(t)).length === 2 && !C.got('mark').length && !C2.got('mark').length, `d. a ping and a target call from underground: refused (${JSON.stringify(msgs)})`);
C2.send({ t: 'mark', p: [-19.5, 0.813, -11] });
await sleep(400);
check(C2.got('mark').length === 1 && C.got('mark').length === 1, `d. a ping from the kitchen goes to the team (C2 ${C2.got('mark').length}, C ${C.got('mark').length})`);
// the mortar: no CT has one, so above ground the server says so (it isn't refused for the underground)
C2.send({ t: 'spot', p: [-19.5, 0.813, -11] });
await sleep(400);
check(C2.got('msg').some(m => /mortar/i.test(m.text)), `d. a target call from above ground gets the usual answer (${JSON.stringify(C2.got('msg').map(m => m.text))})`);

const pass = checks.filter(Boolean).length;
console.log(`${pass}/${checks.length} passed`);
for (const c of [T, C, C2]) c.close();
process.exit(pass === checks.length ? 0 : 1);
