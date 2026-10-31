// Floodgate, server side (GAME_PORT=4040, run srv.sh START_MONEY=16000 first; ~3 minutes). Four scripted players:
//  1. power on: a T opens the valve; the level rises; a CT on the cellar floor and a T "swimming" at the top of the
//     street shaft are electrocuted when the water reaches the fuse box; a CT on a dry step is not; the fuse blows.
//  2. a CT brings the power back with the cellar full: electrocuted too; that ends the round; the new round is dry.
//  3. power cut first: no electrocution; a CT left in the drain drowns (10 s of breath, then 10 a second); a Molotov
//     into the water fizzles, an HE under water hurts only who's in the water; closing the valve drains it slowly.
import { player, sleep } from '../mansion/client.mjs';

const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(1);
// (joining in turns: the server moves a newcomer to the smaller team)
const T1 = await player('Tee', 'T'), C1 = await player('Cee', 'CT'), T2 = await player('Tee2', 'T'), C2 = await player('Cee2', 'CT');
let fl = null, ph = null, lights = null;
const ev = [], checks = [];
const check = (ok, what) => { checks.push([ok, what]); console.log(ok ? 'PASS' : 'FAIL', what); };
T1.on.s = m => { fl = m.fl || null; ph = m.ph; };
for (const t of ['kill', 'floodZap', 'floodValve', 'floodFizzle', 'floodBoom', 'round', 'lights', 'world', 'msg', 'fire', 'boom']) {
  T1.on[t] = m => { ev.push({ at: sec(), ...m }); if (m.lights) lights = m.lights; };
}
// (the client keeps every message: drop the snapshots so a long test doesn't pile them up; health from 'dmg')
for (const c of [T1, T2, C1, C2]) {
  const push = c.log.push.bind(c.log);
  c.hp = 100;
  c.log.push = m => { if (m.t === 'dmg') c.hp = m.hp; if (m.t === 'spawn') c.hp = 100; return m.t === 's' ? 0 : push(m); };
}
const evs = (t, since = 0) => ev.filter(e => e.t === t && +e.at >= since);
const level = () => (fl ? fl[0] : null);
const ids = Object.fromEntries([T1, T2, C1, C2].map((c, i) => [['Tee', 'Tee2', 'Cee', 'Cee2'][i], c.log.find(m => m.t === 'welcome').id]));
const nameOf = i => Object.keys(ids).find(k => ids[k] === i) || i;
const hold = async (c, ms) => { c.use(true); await sleep(ms); c.use(false); };
const waitFor = async (fn, ms, step = 100) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return false; };

console.log('waiting for a live round...');
await waitFor(() => ph === 'live', 30000);
console.log(sec(), 'live; teams:', [T1, T2, C1, C2].map(c => c.me?.team).join(' '));

// ---- 1. power on
const VALVE = [23.8, -5.0, -1.9];
T1.at(VALVE);
C1.at([-15.5, -2.2, 1.5]); // the cellar floor
C2.at([-14.4, -0.996, -6.95]); // a step of the cellar stairs, above where the water will be at the fuse box
T2.at([26.4, -5.0, -2.0]); // the drain under the street shaft
await sleep(300);
await hold(T1, 3300);
await sleep(200);
check(evs('floodValve').some(e => e.open), 'the valve opens after holding E 3 s');
const opened = Date.now();
T1.at([27.5, 0, 1]); // up on the street, dry
// T2 keeps his head above the water: up the street shaft as it fills (feet 1.3 m under the surface)
const swim = setInterval(() => { const l = level(); if (l != null) T2.at([26.4, Math.min(-1.82, Math.max(-5.0, l - 1.3)), -2.0]); }, 150);
const samples = [];
let zapAt = null;
while (Date.now() - opened < 44000) {
  await sleep(1000);
  samples.push([((Date.now() - opened) / 1000).toFixed(0), level()]);
  if (!zapAt && evs('floodZap').length) zapAt = (Date.now() - opened) / 1000;
}
clearInterval(swim);
console.log('level by second after opening:', samples.map(s => s.join(':')).join(' '));
const lv = s => samples.find(x => +x[0] === s)?.[1];
check(lv(10) > -4.2 && lv(10) < -3.3 && lv(16) > -3.0 && lv(16) < -2.2 && lv(25) > -2.0 && lv(25) < -1.4, `the level rises: drain, shaft, cellar (10 s ${lv(10)}, 16 s ${lv(16)}, 25 s ${lv(25)})`);
check(samples.at(-1)[1] === -0.45, `full at -0.45 after about 40 s (${samples.find(s => s[1] === -0.45)?.[0]} s)`);
const zap1 = evs('floodZap')[0];
check(!!zap1 && zapAt > 26 && zapAt < 33, `electrocution when the water reaches the fuse box (at ${zapAt?.toFixed(1)} s, ${zap1?.v.length} in the water)`);
const k1 = evs('kill').filter(k => k.w === 'electrocuted').map(k => nameOf(k.v));
check(k1.includes('Cee') && k1.includes('Tee2') && !k1.includes('Cee2') && !k1.includes('Tee'), `electrocuted: ${k1.join(', ')} (not the dry ones)`);
check(lights?.power === false && evs('lights').some(e => e.power === 'off'), 'the fuse blew: the power is off');
check(C2.hp === 100, `the CT on the dry step is unhurt (hp ${C2.hp})`);

// ---- 2. bringing the power back with the cellar full
const before = evs('floodZap').length;
C2.at([-18.3, -2.2, -4.4]);
await sleep(300);
await hold(C2, 5400);
await sleep(500);
check(evs('floodZap').length === before + 1 && evs('kill').some(k => k.w === 'electrocuted' && nameOf(k.v) === 'Cee2'), 'power back on with the cellar full: the CT at the fuse box is electrocuted');
const roundsBefore = evs('round').length;
await waitFor(() => evs('round').length > roundsBefore && ph === 'freeze', 12000);
await sleep(300);
check(ph === 'freeze' && fl === null && lights?.power !== false, `the new round: dry (fl ${JSON.stringify(fl)}), power on (${lights?.power})`);

// ---- 3. power cut first; drowning; grenades; closing
for (const k of ['molotov', 'he']) T1.send({ t: 'buy', item: k });
await waitFor(() => ph === 'live', 8000);
await sleep(300);
check(T1.me?.inv?.molotov > 0 && T1.me?.inv?.he > 0, 'the T bought a Molotov and an HE');
T1.at([-18.3, -2.2, -4.4]);
await sleep(300);
await hold(T1, 3300);
await sleep(300);
check(lights?.power === false, 'the T cut the power at the fuse box');
const zapsBefore = evs('floodZap').length, s3 = +sec();
T1.at(VALVE);
C1.at([10, -5.0, -1.9]); // stays in the drain: drowns
C2.at([-15.5, -2.2, 1.5]); // the cellar floor
T2.at([27.5, 0, 1]);
await sleep(300);
await hold(T1, 3300);
const opened3 = Date.now();
const STEP = [-14.4, -0.193, -8.27]; // a stair step the water never reaches (full: -0.45)
T1.at(STEP);
const hp = [];
C1.on.dmg = m => hp.push([((Date.now() - opened3) / 1000).toFixed(1), m.hp, m.d]);
await waitFor(() => level() >= -1.0, 40000);
check(evs('floodZap').length === zapsBefore, `power off: no electrocution as the water passes the fuse box (level ${level()})`);
// a Molotov from the stairs into the flooded cellar, then an HE (C2 is in the water, T1 on a dry step)
T1.send({ t: 'nade', k: 'molotov', o: [-14.4, 0.5, -7.5], v: [-3, -1, 6] });
await sleep(2500);
check(evs('floodFizzle', s3).some(e => e.k === 'molotov') && !evs('fire', s3).length, 'a Molotov into the water fizzles (no fire)');
const c2hp = C2.hp, t1hp = T1.hp;
T1.send({ t: 'nade', k: 'he', o: [-14.4, 0.5, -7.5], v: [-3, -1, 5] });
await sleep(2500);
const boom = evs('floodBoom', s3)[0];
check(!!boom, `an HE under water: the blast stays in the water (${boom ? 'at ' + boom.p.map(v => v.toFixed(1)).join(',') : 'no floodBoom'})`);
console.log('   C2 hp', c2hp, '->', C2.hp, '; T1 hp', t1hp, '->', T1.hp);
check(C2.hp < c2hp && T1.hp === t1hp, 'it hurt the CT in the water, not the T on the dry step');
C2.at(STEP); // out of the water before it's over his head
await waitFor(() => level() === -0.45, 20000);
console.log('C1 damage [s after opening, hp, d]:', hp.map(h => h.join('/')).join(' '));
const firstDrown = hp.find(h => h[2] === 10);
check(evs('kill', s3).some(k => k.w === 'drowned' && nameOf(k.v) === 'Cee'), `the CT left in the drain drowned (first damage at ${firstDrown?.[0]} s)`);
// close it again (from under the water)
T1.at(VALVE);
await sleep(300);
await hold(T1, 3300);
await sleep(300);
check(evs('floodValve').filter(e => !e.open).length === 1, 'the valve closes after holding E 3 s again');
const l0 = level();
await sleep(8000);
const l1 = level();
console.log('closing: level', l0, '->', l1, 'in 8 s');
check(l1 < l0 - 0.15 && l1 > l0 - 0.5, 'the water drains slowly');
T1.at([-14.4, -0.996, -6.95]);
await sleep(200);
console.log('messages:', ev.filter(e => e.t === 'msg').map(e => `${e.at} ${e.text}`).slice(-12).join('\n  '));
console.log(`\n${checks.filter(c => c[0]).length}/${checks.length} passed`);
for (const c of [T1, T2, C1, C2]) c.close();
process.exit(0);
