// "Downed, not dead" + "Play dead", server side (de_dust2, GAME_PORT test server with BOTS=0 START_MONEY=16000, e.g.
// GAME_PORT=4010 MAP=de_dust2 BOTS=0 START_MONEY=16000 via srv.sh). Two Terrorists and two CTs, scripted, in the
// open CT spawn. Seven rounds:
//  1 a headshot kills outright; the last one standing dies outright too (nobody to revive him)
//  2 down (feed, snapshot, the lying hitbox), revive (5 s, the reviver can't shoot, 30 HP), down again, finished
//  3 bleeding out after 30 s (the kill goes to whoever downed him)
//  4 the last one standing dies: the downed bleed out at once and the round ends
//  5 play dead: the fake kill for the other side only, snapshot / roster / team bar / radar say dead, real drops, can't
//    move or shoot, a shot at the "corpse" wakes him (the damage counts, the weapons come back)
//  6 the last one standing can't play dead
//  7 playing dead ends after 10 s; only once a round
import { player, sleep } from '../mansion/client.mjs';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
// (joined in turns: auto team balance won't let a team get two ahead)
const T1 = await player('Tango', 'T'), C1 = await player('Charlie', 'CT'), T2 = await player('Toby', 'T'), C2 = await player('Cathy', 'CT');
const all = [T1, T2, C1, C2];
for (const c of all) { c.slow = {}; c.on.s = m => { c.snap = m; for (const k of ['dr', 'sc', 'b', 'hs', 'cars']) if (k in m) c.slow[k] = m[k]; }; c.on.roster = m => { c.roster = m.list; }; c.on.dmg = m => { c.hp = m.hp; }; c.on.me = m => { c.hp = m.hp; }; c.on.bar = m => { c.bar = m.l; }; }
const ids = {};
for (const [k, c] of Object.entries({ T1, T2, C1, C2 })) ids[k] = c.log.find(m => m.t === 'welcome')?.id;
const until = async (cond, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { if (cond()) return true; await sleep(50); } return !!cond(); };
const row = (c, pid) => c.snap?.pl?.find(r => r[0] === pid);
let roundNo = 0;
const nextRound = async () => {
  roundNo++;
  for (const c of all) c.clear();
  ok(`round ${roundNo} starts`, await until(() => T1.got('round').length > 0, 30000));
  for (const c of [C1, C2]) c.send({ t: 'reload', w: 'usp' }); // (a fresh magazine during the freeze time)
  await sleep(3400); // freeze time
};
const EYE = 1.62;
const shoot = async (c, to, w, wait = 380) => {
  const o = [c.p[0], c.p[1] + EYE, c.p[2]], d = to.map((v, i) => v - o[i]), l = Math.hypot(...d);
  c.send({ t: 'shoot', o, d: d.map(v => v / l), w, rt: 0 });
  await sleep(wait);
};
const chest = c => [c.p[0], c.p[1] + 1.2, c.p[2]], head = c => [c.p[0], c.p[1] + 1.62, c.p[2]];
// shoot c's chest until it's down or dead
const drop = async (shooter, c, w = 'usp') => {
  for (let i = 0; i < 12 && !c.got('bodyDown').length && !c.got('kill').some(m => m.v === ids[c.name]); i++) await shoot(shooter, chest(c), w);
};
T1.name = 'T1'; T2.name = 'T2'; C1.name = 'C1'; C2.name = 'C2';
for (const c of all) c.w = c === T1 || c === T2 ? 'glock' : 'usp';

// ---------------------------------------------------------------- round 1
await nextRound();
T1.at([20, 0, -30], 0); T2.at([20, 0, -33], 0); C1.at([14, 0, -30], -Math.PI / 2); C2.at([14, 0, -24], -Math.PI / 2);
await sleep(600);
await shoot(C1, head(T2), 'usp', 500);
ok('a headshot kills outright (no bodyDown)', T2.got('kill').some(m => m.v === ids.T2 && m.hs) && !C2.got('bodyDown').length);
await drop(C1, T1);
ok('the last T standing dies outright (nobody to revive him)', C2.got('kill').some(m => m.v === ids.T1) && !C2.got('bodyDown').length);
ok('round 1 over', await until(() => T1.got('roundEnd').length > 0, 2000));

// ---------------------------------------------------------------- round 2
await nextRound();
T1.at([20, 0, -30], 0); T2.at([20, 0, -33], 0); C1.at([14, 0, -30], -Math.PI / 2); C2.at([14, 0, -24], -Math.PI / 2);
await sleep(600);
await drop(C1, T1);
const dn = C2.got('bodyDown')[0];
ok(`T1 down: bodyDown to everyone (k ${dn?.k}, w ${dn?.w})`, dn && dn.v === ids.T1 && dn.k === ids.C1 && dn.w === 'usp' && T2.got('bodyDown').length === 1);
ok('no kill message for a down', !C2.got('kill').some(m => m.v === ids.T1));
ok(`T1 is alive with 0 HP (me: alive ${T1.me?.alive}, hp ${T1.me?.hp})`, T1.me?.alive === true && T1.me?.hp === 0);
await sleep(200);
const dE = C2.snap?.bd?.d?.find(e => e[0] === ids.T1), dM = T2.snap?.bd?.d?.find(e => e[0] === ids.T1);
ok(`snapshot bd: the enemy sees only who (${JSON.stringify(dE)}), the team the bleeding (${JSON.stringify(dM)})`, dE && dE.length === 1 && dM && dM.length === 4 && dM[1] > 0.9);
ok('T1 still alive in the snapshot', row(C2, ids.T1)?.[8] === 1);
// a shot at where a standing man's chest would be passes over him
T1.clear();
await shoot(C1, chest(T1), 'usp', 450);
ok('a shot at standing chest height misses someone crawling', !T1.got('dmg').length && !T1.got('kill').length);
// T2 can't revive from 3 m away; from 0.6 m, facing him, he can
T2.at([20.6, 0, -30], Math.PI / 2); await sleep(400);
T2.use(true); await sleep(400);
ok(`T2 reviving (act ${T2.snap?.me?.a})`, T2.snap?.me?.a === 'bodyRevive');
C1.clear();
T2.send({ t: 'shoot', o: [20.6, EYE, -30], d: [0, 0, -1], w: 'glock', rt: 0 }); await sleep(300);
ok("the reviver can't shoot", !C1.got('shot').length);
await sleep(1500);
ok(`the bleeding stops while reviving (${T2.snap?.bd?.d?.find(e => e[0] === ids.T1)?.[1]}), revive ${T2.snap?.bd?.d?.find(e => e[0] === ids.T1)?.[2]}`, (T2.snap?.bd?.d?.find(e => e[0] === ids.T1)?.[1] ?? 0) > 0.85);
ok('revived after 5 s (bodyUp by T2)', await until(() => C2.got('bodyUp').some(m => m.v === ids.T1 && m.by === ids.T2), 4500));
T2.use(false);
await sleep(200);
ok(`T1 up with 30 HP (${T1.me?.hp})`, T1.me?.hp === 30 && !T2.snap?.bd);
T2.at([20, 0, -33], 0); await sleep(500);
T1.clear(); C2.clear();
await drop(C1, T1);
ok('down again', C2.got('bodyDown').some(m => m.v === ids.T1));
await sleep(450);
await shoot(C1, [20, 0.2, -30], 'usp', 500);
const fin = C2.got('bodyKill').find(m => m.v === ids.T1), kill = C2.got('kill').find(m => m.v === ids.T1);
ok(`finished by a shot at the body on the floor (bodyKill ${fin?.how}; kill k ${kill?.k}, hs ${kill?.hs})`, fin?.how === 'finished' && kill?.k === ids.C1 && kill.hs === false);
await sleep(300);
ok(`scoreboard: C1 ${C2.roster?.find(e => e.id === ids.C1)?.k} kills (one per T killed so far), T1 ${C2.roster?.find(e => e.id === ids.T1)?.d} deaths`, C2.roster?.find(e => e.id === ids.C1)?.k === 3 && C2.roster?.find(e => e.id === ids.T1)?.d === 2);
await shoot(C1, head(T2), 'usp', 400);
ok('round 2 over', await until(() => T1.got('roundEnd').length > 0, 2000));

// ---------------------------------------------------------------- round 3: bleeding out
await nextRound();
T1.at([20, 0, -30], 0); T2.at([20, 0, -33], 0); C1.at([14, 0, -30], -Math.PI / 2); C2.at([14, 0, -24], -Math.PI / 2);
await sleep(600);
await drop(C1, T1);
ok('T1 down', C2.got('bodyDown').some(m => m.v === ids.T1));
console.log('     (waiting 30 s for the bleed-out)');
ok('bled out after ~30 s', await until(() => C2.got('bodyKill').some(m => m.v === ids.T1), 32000));
const bk = C2.got('kill').find(m => m.v === ids.T1);
ok(`the kill goes to whoever downed him (k ${bk?.k}, w ${bk?.w}, how ${C2.got('bodyKill')[0]?.how})`, bk?.k === ids.C1 && bk.w === 'usp' && C2.got('bodyKill')[0].how === 'bled');
await shoot(C1, head(T2), 'usp', 400);
await until(() => T1.got('roundEnd').length > 0, 2000);

// ---------------------------------------------------------------- round 4: the last one standing dies
await nextRound();
T1.at([20, 0, -30], 0); T2.at([20, 0, -33], 0); C1.at([14, 0, -30], -Math.PI / 2); C2.at([14, 0, -24], -Math.PI / 2);
await sleep(600);
await drop(C1, T1);
ok('T1 down', C2.got('bodyDown').some(m => m.v === ids.T1));
await shoot(C1, head(T2), 'usp', 300);
ok('T2 (the last one standing) killed: T1 bleeds out at once', await until(() => C2.got('bodyKill').some(m => m.v === ids.T1 && m.how === 'bled'), 500));
const re = await until(() => T1.got('roundEnd').length > 0, 1000);
ok(`and the round ends (${T1.got('roundEnd')[0]?.reason})`, re && /Terrorists eliminated/.test(T1.got('roundEnd')[0].reason));

// ---------------------------------------------------------------- round 5: play dead
await nextRound();
T2.send({ t: 'buy', item: 'ak47' }); await sleep(300);
ok('T2 bought an AK-47', T2.me?.inv?.primary?.id === 'ak47');
T1.at([20, 0, -33], 0); T2.at([20, 0, -26], 0); C1.at([14, 0, -25], -Math.PI / 2); C2.at([14, 0, -26], -Math.PI / 2);
T2.w = 'ak47';
await sleep(1200);
ok(`before: CT2 spots T2 on the radar (sp ${JSON.stringify(C2.snap?.sp)})`, C2.snap?.sp?.some(e => e[0] === ids.T2));
await shoot(C1, [20, 0.4, -26], 'usp', 300); // a leg shot: C1 will be the one who "killed" him
ok(`T2 hit in the leg (hp ${T2.hp})`, T2.hp < 100 && T2.hp > 50);
const hpBefore = T2.hp;
for (const c of all) c.clear();
T2.send({ t: 'bodyPlayDead' }); await sleep(400);
const fk = C2.got('kill').find(m => m.v === ids.T2);
ok(`the CTs get a kill message (k ${fk?.k}, w ${fk?.w})`, fk && fk.k === ids.C1 && fk.w === 'usp' && C1.got('kill').length === 1);
ok('the Terrorists get no kill, but bodyPlayDead (with the fake killer)', !T1.got('kill').length && T1.got('bodyPlayDead')[0]?.v === ids.T2 && T1.got('bodyPlayDead')[0]?.by === ids.C1 && T2.got('bodyPlayDead').length === 1);
ok('the CTs get no bodyPlayDead', !C1.got('bodyPlayDead').length && !C2.got('bodyPlayDead').length);
await sleep(300);
ok('snapshot: dead to the CTs', row(C2, ids.T2)?.[8] === 0 && !C2.snap?.bd);
ok(`snapshot: the Terrorists are told in bd.p (${JSON.stringify(T1.snap?.bd?.p)})`, T1.snap?.bd?.p?.some(e => e[0] === ids.T2 && e[1] === ids.C1));
ok(`the CTs' radar: no red dot (sp ${JSON.stringify(C2.snap?.sp)})`, !C2.snap?.sp?.some(e => e[0] === ids.T2));
const rT2 = C2.roster?.find(e => e.id === ids.T2), rC1 = C2.roster?.find(e => e.id === ids.C1);
ok(`roster: dead with one more death (alive ${rT2?.alive}, d ${rT2?.d}), one more kill for C1 (${rC1?.k})`, rT2?.alive === false && rT2.d === 5 && rC1?.k === 9);
await sleep(300);
ok(`team bar: dead (${JSON.stringify(C2.bar?.find(r => r[0] === ids.T2))})`, C2.bar?.find(r => r[0] === ids.T2)?.[1] === 0);
const drops = C2.slow.dr || [];
ok(`his weapons fell out of his hands (drops ${JSON.stringify(drops.map(d => d[1]))}), his hands are empty`, drops.some(d => d[1] === 'ak47') && drops.some(d => d[1] === 'glock') && !T2.me?.inv?.primary && !T2.me?.inv?.secondary);
T2.at([21, 0, -26], 0); await sleep(300);
ok(`a "corpse" doesn't move (x ${row(C2, ids.T2)?.[1]})`, row(C2, ids.T2)?.[1] === 20);
T2.at([20, 0, -26], 0);
T2.send({ t: 'shoot', o: [20, EYE, -26], d: [-1, 0, 0], w: 'knife', rt: 0 }); await sleep(250);
ok("a \"corpse\" can't shoot (or knife)", !C1.got('shot').length);
T2.send({ t: 'chat', text: 'boo' }); await sleep(200);
ok('no all-chat from a "corpse"', !C1.got('chat').length);
await sleep(500);
await shoot(C1, [20, 0.12, -25.1], 'usp', 400);
const up = C2.got('bodyUp').find(m => m.v === ids.T2);
ok(`a shot at the "corpse" wakes him (bodyUp pd ${up?.pd} why ${up?.why}) and hurts (hp ${hpBefore} -> ${T2.hp})`, up?.pd === 1 && up.why === 'hit' && T2.hp < hpBefore);
ok('his weapons are back', T2.me?.inv?.primary?.id === 'ak47' && T2.me?.inv?.secondary?.id === 'glock');
await sleep(200);
ok('alive again in the CTs\' snapshot and roster', row(C2, ids.T2)?.[8] === 1 && C2.roster?.find(e => e.id === ids.T2)?.alive === true && C2.roster?.find(e => e.id === ids.C1)?.k === 8);
C1.clear();
T2.send({ t: 'shoot', o: [20, EYE, -26], d: [-1, 0, 0], w: 'ak47', rt: 0 }); await sleep(200);
ok("getting up (1 s): can't shoot yet", !C1.got('shot').length);
await sleep(1000);
T2.send({ t: 'shoot', o: [20, EYE, -26], d: [-1, 0, 0.3], w: 'ak47', rt: 0 }); await sleep(250);
ok('then he can', C1.got('shot').length === 1);
T2.clear();
T2.send({ t: 'bodyPlayDead' }); await sleep(300);
ok('only once a round', T2.got('msg').some(m => /once a round/.test(m.text)) && !T2.got('bodyPlayDead').length);
await shoot(C1, head(T1), 'usp', 400);
await shoot(C1, head(T2), 'usp', 400);
await until(() => T1.got('roundEnd').length > 0, 2000);

// ---------------------------------------------------------------- round 6: the last one standing can't play dead
await nextRound();
T1.at([20, 0, -33], 0); T2.at([20, 0, -26], 0); C1.at([14, 0, -25], -Math.PI / 2); C2.at([14, 0, -26], -Math.PI / 2);
await sleep(600);
await shoot(C1, head(T1), 'usp', 400);
T2.clear();
T2.send({ t: 'bodyPlayDead' }); await sleep(300);
ok("the last one standing can't play dead", T2.got('msg').some(m => /last one standing/.test(m.text)) && !T2.got('bodyPlayDead').length);
await shoot(C1, head(T2), 'usp', 400);
await until(() => T1.got('roundEnd').length > 0, 2000);

// ---------------------------------------------------------------- round 7: 10 s at most
await nextRound();
T1.at([20, 0, -33], 0); T2.at([20, 0, -26], 0); C1.at([14, 0, -25], -Math.PI / 2); C2.at([14, 0, -26], -Math.PI / 2);
await sleep(600);
T2.send({ t: 'bodyPlayDead' }); await sleep(300);
ok('playing dead again in a new round', T2.got('bodyPlayDead').length === 1);
ok('(no fake killer: nobody hit him) kill k null, w world', C2.got('kill').find(m => m.v === ids.T2)?.k === null && C2.got('kill').find(m => m.v === ids.T2)?.w === 'world');
ok('gets up by himself after 10 s', await until(() => C2.got('bodyUp').some(m => m.v === ids.T2 && m.why === 'time'), 11000));
ok('glock back', T2.me?.inv?.secondary?.id === 'glock');

for (const c of all) c.close();
process.exit();
