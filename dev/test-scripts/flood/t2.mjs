// Floodgate, server side, the rest (GAME_PORT=4040; run srv.sh MAP=cs_mansion_night START_MONEY=16000 first; ~1 min):
// on the night map: letting go of E too early, or moving, doesn't turn the valve; while it's turned the snapshot
// says so (fl: [level, 0, 1]); the rising water puts out a Molotov's fire on the cellar floor; changing the map in
// the middle of a flood drains it; on Dust II nothing happens at the same spot (no fl, no valve).
import { player, admin, sleep } from '../mansion/client.mjs';

const T1 = await player('Tee', 'T'), C1 = await player('Cee', 'CT');
let fl = null, ph = null, flSeen = [];
const ev = [], checks = [];
const check = (ok, what) => { checks.push(ok); console.log(ok ? 'PASS' : 'FAIL', what); };
T1.on.s = m => { fl = m.fl || null; ph = m.ph; if (m.fl) flSeen.push(m.fl); };
for (const t of ['floodValve', 'fire', 'fireOut', 'map', 'floodFizzle']) T1.on[t] = m => ev.push({ at: Date.now(), ...m });
for (const c of [T1, C1]) { const push = c.log.push.bind(c.log); c.log.push = m => (m.t === 's' ? 0 : push(m)); }
const evs = t => ev.filter(e => e.t === t);
const waitFor = async (fn, ms, step = 100) => { for (let i = 0; i < ms / step; i++) { if (fn()) return true; await sleep(step); } return false; };
const VALVE = [23.8, -5.0, -1.9];

await waitFor(() => ph === 'live', 30000);
console.log('live on', T1.log.find(m => m.t === 'welcome').map);
T1.send({ t: 'buy', item: 'molotov' });
C1.at([27.5, 0, 1]);
T1.at(VALVE); await sleep(300);
flSeen = [];
T1.use(true); await sleep(1500);
const turning = flSeen.some(f => f[0] === -4.88 && f[1] === 0 && f[2] === 1);
T1.use(false); await sleep(400);
check(turning && !evs('floodValve').length, `letting go after 1.5 s: nothing (while turning, fl ${JSON.stringify(flSeen.at(-1))})`);
check(fl === null, 'dry and the valve shut again: no fl in the snapshot');
T1.use(true); await sleep(1000); T1.at([23.8, -5.0, -0.7]); await sleep(2600); T1.use(false); await sleep(300);
check(!evs('floodValve').length, 'walking away while holding E: nothing');
T1.at(VALVE); await sleep(300);
T1.use(true); await sleep(3300); T1.use(false); await sleep(300);
check(evs('floodValve').some(e => e.open), 'held 3 s: open');
// a Molotov on the cellar floor just before the water gets there
await waitFor(() => fl && fl[0] > -2.45, 25000);
T1.at([-15.5, -2.2, 1.5]); await sleep(200);
T1.send({ t: 'nade', k: 'molotov', o: [-15.5, -0.6, 1.5], v: [0, -2, 2] });
await waitFor(() => evs('fire').length, 3000);
T1.at([-14.4, -0.193, -8.27]); // (up the stairs)
const fire = evs('fire')[0];
await waitFor(() => evs('fireOut').length, 9000);
const out = evs('fireOut')[0];
console.log('   fire at', fire?.p, 'level then', fl?.[0], '; out after', out && fire ? ((out.at - fire.at) / 1000).toFixed(1) : '-', 's');
check(!!fire && !!out && out.at - fire.at < 6000, `the water puts the fire out before it burns down by itself (7 s)`);
// change the map in the middle of the flood
await admin({ action: 'map', map: 'de_dust2' }, +(process.env.GAME_PORT || 4040));
await waitFor(() => evs('map').length, 5000);
await sleep(1500);
flSeen = [];
T1.at(VALVE); await sleep(300);
T1.use(true); await sleep(3300); T1.use(false); await sleep(1000);
check(!flSeen.length && evs('floodValve').length === 1, `on Dust II: no water, no valve (fl seen ${flSeen.length})`);
await admin({ action: 'map', map: 'cs_mansion' }, +(process.env.GAME_PORT || 4040));
await waitFor(() => evs('map').length > 1, 5000);
await sleep(1500);
check(fl === null, 'back on Mansion: dry');
console.log(`\n${checks.filter(Boolean).length}/${checks.length} passed`);
T1.close(); C1.close();
process.exit(0);
