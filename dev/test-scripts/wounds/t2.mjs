// 1.2 Interrogating a downed enemy, and the downed suicide, server side. Test server (fresh, BOTS=0): GAME_PORT=4210
// MAP=cs_mansion (or cs_mansion_night) BOTS=0 START_MONEY=16000 MAP_ROTATION=0 ROUND_TIME=600; then
//   GAME_PORT=4210 MAP=cs_mansion node dev/test-scripts/wounds/t2.mjs
// Two Terrorists and three CTs, scripted, on the back garden's lawn; the Terrorists look away from the CTs (no red dots
// of their own):
//  a. C1 downed by T2; E with him behind does nothing; E in front: the interrogation (3 s; no shooting meanwhile; the
//     downed man sees it); then the nearest standing CT (C2, not C3) is on both Terrorists' radar for 5 s, and only
//     theirs; C1 is told whom he gave away; once per downing
//  b. C1 holds K 5 s: the shot (to everyone), "shot himself", the kill to T2 who downed him (the roster too)
//  c. C2 down: K let go after 2 s stops it; then K again, and an interrogation started 2.5 s later gets nothing
import { player, sleep, ok, summary, until, r2 } from './lib.mjs';

const T1 = await player('Tango', 'T'), C1 = await player('Charlie', 'CT'), T2 = await player('Toby', 'T'), C2 = await player('Cathy', 'CT');
const C3 = await player('Chris', 'CT');
const all = [T1, T2, C1, C2, C3];
T1.w = T2.w = 'glock'; C1.w = C2.w = C3.w = 'usp';
const chest = p => [p[0], p[1] + 1.2, p[2]];
const roster = {};
for (const c of all) c.on.roster = m => { roster[c.name] = m.list; };
const wdOf = c => c.snap?.wd || { d: [], k: [], i: [], a: [] };
const spotted = (c, id) => !!c.snap?.sp?.some(e => e[0] === id);

console.log('(waiting for the first round)');
ok('round starts', await until(() => T1.got('round').length > 0, 40000));
await sleep(3600);

// ---------------------------------------------------------------- a. the interrogation
const A = [-33, 0, -3];
C1.at(A, 0);
C2.at([-36, 0, -6], 0); // 4.2 m from C1: the nearest
C3.at([-40, 0, -6], 0); // 7.6 m
T1.at([-33, 0, -4.4], 0); // north of C1, facing north (away from everyone)
T2.at([-30, 0, 5], Math.PI); // facing south (+z), away from the CTs
await sleep(800);
ok(`before: the Terrorists see neither C2 nor C3 on the radar (sp ${JSON.stringify(T1.snap?.sp)})`, !spotted(T1, C2.id) && !spotted(T1, C3.id) && !spotted(T2, C2.id));
for (let i = 0; i < 12 && !C3.got('bodyDown').length; i++) { T2.shootAt(chest(C1.p)); await sleep(380); }
ok('C1 down (by T2)', C3.got('bodyDown').some(m => m.v === C1.id && m.k === T2.id));
T1.use(true); await sleep(300);
ok(`E with him behind: nothing (act ${T1.snap?.me?.a ?? 'none'})`, !T1.snap?.me);
T1.use(false);
T1.at([-33, 0, -3.8], Math.PI); await sleep(300); // facing him, 0.8 m
for (const c of all) c.clear();
T1.use(true); await sleep(300);
ok(`E in front: interrogating (act ${T1.snap?.me?.a}, ${r2(T1.snap?.me?.pr ?? 0)})`, T1.snap?.me?.a === 'wdAsk');
ok(`the downed man sees it (wd.i ${JSON.stringify(wdOf(C1).i)})`, wdOf(C1).i.some(e => e[0] === T1.id && e[1] === C1.id));
T1.shootAt([T1.p[0], 30, T1.p[2] - 1], 'glock'); await sleep(200);
ok("interrogating: he can't shoot", !C2.got('shot').some(m => m.id === T1.id));
ok('he talks after 3 s', await until(() => T1.got('wdReveal').length > 0, 3500));
const rv = T1.got('wdReveal')[0];
ok(`the nearest standing teammate, C2 (id ${rv?.id === C2.id ? 'C2' : rv?.id === C3.id ? 'C3' : rv?.id}, ${rv?.s} s)`, rv?.id === C2.id && rv.v === C1.id && rv.by === T1.id && rv.s === 5);
ok('the whole team is told (T2 too), not the CTs', T2.got('wdReveal').some(m => m.id === C2.id) && !C2.got('wdReveal').length && !C1.got('wdReveal').length);
ok(`C1 is told whom he gave away`, C1.got('wdTalked').some(m => m.id === C2.id && m.by === T1.id));
const t0 = Date.now();
ok('C2 on the Terrorists\' radar', await until(() => spotted(T1, C2.id) && spotted(T2, C2.id), 600));
ok('not C3', !spotted(T1, C3.id));
ok('not on the CTs\' own (their radar shows Terrorists)', !C3.snap?.sp?.some(e => e[0] === C2.id));
await sleep(4300 - (Date.now() - t0));
ok(`still there after ${r2((Date.now() - t0) / 1000)} s`, spotted(T1, C2.id));
await sleep(6000 - (Date.now() - t0));
ok(`gone after ${r2((Date.now() - t0) / 1000)} s`, !spotted(T1, C2.id) && !spotted(T2, C2.id));
T1.use(false); await sleep(150);
T1.use(true); await sleep(300);
ok(`once per downing: E again does nothing (act ${T1.snap?.me?.a ?? 'none'}; wd.a ${JSON.stringify(wdOf(T1).a)})`, !T1.snap?.me && wdOf(T1).a.includes(C1.id));
T1.use(false);

// ---------------------------------------------------------------- b. the downed suicide
for (const c of all) c.clear();
const k0 = roster.Tango?.find(e => e.id === T2.id)?.k ?? 0;
C1.send({ t: 'wdEnd', on: 1 });
await sleep(400);
ok(`C1 holds K: everyone sees the pistol at his head (wd.k ${JSON.stringify(wdOf(T1).k)})`, wdOf(T1).k.some(e => e[0] === C1.id && e[1] > 0));
ok('the shot after 5 s', await until(() => T1.got('wdShot').some(m => m.v === C1.id), 5200));
const shot = T1.got('wdShot').find(m => m.v === C1.id);
ok(`heard by everyone, with his pistol (${shot?.w})`, shot?.w === 'usp' && C2.got('wdShot').length === 1 && T2.got('wdShot').length === 1);
await sleep(200);
const bk = T1.got('bodyKill').find(m => m.v === C1.id), kill = T1.got('kill').find(m => m.v === C1.id);
ok(`"shot himself" (bodyKill ${bk?.how}); the kill to T2 who downed him (k ${kill?.k === T2.id ? 'T2' : kill?.k}, w ${kill?.w}, hs ${kill?.hs})`, bk?.how === 'suicide' && kill?.k === T2.id && kill.w === 'glock' && kill.hs === false);
await sleep(300);
const k1 = roster.Tango?.find(e => e.id === T2.id)?.k ?? 0;
ok(`the roster counts it for T2 (${k0} -> ${k1})`, k1 === k0 + 1);

// ---------------------------------------------------------------- c. let go; and an interrogation too late
for (const c of all) c.clear();
C2.at([-33, 0, -3], 0); await sleep(400);
for (let i = 0; i < 12 && !C3.got('bodyDown').length; i++) { T2.shootAt(chest(C2.p)); await sleep(380); }
ok('C2 down', C3.got('bodyDown').some(m => m.v === C2.id));
C2.send({ t: 'wdEnd', on: 1 }); await sleep(2000);
C2.send({ t: 'wdEnd', on: 0 }); await sleep(300);
ok('K let go after 2 s: it stops', !wdOf(T1).k.length);
await sleep(3500);
ok('and he is still alive, down', !T1.got('wdShot').length && C2.alive && T1.snap?.bd?.d?.some(e => e[0] === C2.id));
C2.send({ t: 'wdEnd', on: 1 });
await sleep(2500);
T1.at([-33, 0, -3.8], Math.PI); await sleep(100);
T1.use(true); await sleep(300);
ok(`T1 interrogating him meanwhile (act ${T1.snap?.me?.a})`, T1.snap?.me?.a === 'wdAsk');
ok('he shoots himself first', await until(() => T1.got('wdShot').some(m => m.v === C2.id), 3000));
await sleep(400);
ok(`the interrogation gets nothing ("${T1.got('msg').map(m => m.text).find(t => /talked/.test(t))}"), no reveal`, !T1.got('wdReveal').length && !T1.snap?.me && T1.got('msg').some(m => /shot himself before he talked/.test(m.text)));
T1.use(false);

summary();
for (const c of all) c.close();
process.exit();
