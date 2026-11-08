// The links, server side (Mansion; srv.sh with ROUND_TIME=600 POWER_SURGE=0 FREEZE_TIME=1; about 2 minutes). Two Ts
// ("Watcher", "Cutter") and two CTs ("Lawn", "Wet"), round 1:
//   a. CCTV: the Watcher at the security desk sees the Lawn CT on CAM 2; the Cutter switches off the CCTV's breaker
//      (the mains still on): not seen; the Wet CT switches it back on: seen again
//   b. flood x the cellar's circuit: the Cutter switches off the cellar's breaker and opens the floodgate; the Wet CT
//      stands in the cellar; the water passes the fuse box: nobody electrocuted (no 'floodZap'), the mains still on.
//      The Wet CT switches the cellar's breaker back on, standing in the water: electrocuted, and the fuse blows
//   c. flood x the generator: the mains blown, the Lawn CT starts the generator: the floors' lamps come back, the
//      cellar stays dead and nobody in the water is electrocuted
import { player, sleep } from '../mansion/client.mjs';

const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(50); return cond(); };
const PANEL = [-16.95, -2.2, -4.6], GEN = [-19.6, 0, -16.0], DESK = [-10.0, 4.27, -12.0], VALVE = [23.8, -5.0, -1.9];

const watcher = await player('Watcher', 'T'), lawn = await player('Lawn', 'CT'), cutter = await player('Cutter', 'T'), wet = await player('Wet', 'CT');
const all = [watcher, lawn, cutter, wet];
let sp = [], fl = null;
for (const c of all) {
  c.id = c.log.find(m => m.t === 'welcome')?.id;
  c.L = c.log.find(m => m.t === 'welcome')?.lights || {};
  c.pw = c.log.filter(m => m.t === 'power').pop() || null;
  c.on.power = m => { c.pw = m; };
  c.on.lights = m => { c.L = m.lights; };
}
watcher.on.s = m => { if (m.sp) sp = m.sp; fl = m.fl || null; };
const press = async (c, aim, hold = 120) => { c.send({ t: 'pwAim', a: aim }); await sleep(60); c.use(true); await sleep(hold); c.use(false); await sleep(120); };
const flip = async (c, k, to) => { c.at(PANEL, 0); await sleep(150); await press(c, 'b' + k, 1300); await until(() => c.pw.b[k] === to, 2000); };
const seen = async () => { await sleep(800); return sp.some(q => q[0] === lawn.id); };
const zaps = () => watcher.got('floodZap').length;

for (let i = 0; i < 150 && !cutter.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
ok('round 1 started', cutter.got('msg').some(m => /Guard the hostages/.test(m.text)));
await sleep(1500);

// ---- a. CCTV
lawn.at([8, 0, 2], Math.PI / 2);
watcher.at(DESK, 0); await sleep(300);
watcher.use(true); await sleep(80); watcher.use(false); await sleep(400);
watcher.send({ t: 'cctv', cam: 1, yaw: 0, pitch: 0 });
ok('a: watching CAM 2, the Lawn CT is on the T radar', await seen());
await flip(cutter, 3, 0);
ok('a: the CCTV\'s breaker off (the mains on): he isn\'t', cutter.pw.b[3] === 0 && cutter.pw.main === 1 && !(await seen()));
await flip(wet, 3, 1);
ok('a: back on: seen again', await seen());
watcher.use(true); await sleep(80); watcher.use(false); await sleep(300);
watcher.at([-6, 0, 18], 0);

// ---- b. the flood and the cellar's circuit
await flip(cutter, 2, 0);
ok('b: the cellar\'s breaker off', cutter.pw.b[2] === 0 && cutter.L.cellar === false);
cutter.at(VALVE, 0); await sleep(300);
cutter.use(true); await sleep(3300); cutter.use(false); await sleep(300);
ok('b: the Cutter opened the floodgate', watcher.got('floodValve').some(m => m.open));
cutter.at([27.5, 0, 1], 0);
wet.at([-15.5, -2.2, 1.5], 0); // the cellar's floor
const passed = await until(() => fl && fl[0] >= -1.0, 50000);
await sleep(800);
ok(`b: the water passes the fuse box (level ${fl?.[0]}): nobody electrocuted, the mains still on`, passed && zaps() === 0 && cutter.pw.main === 1 && wet.alive);
wet.at(PANEL, 0); await sleep(300);
await press(wet, 'b2', 1300);
await until(() => zaps() > 0, 3000);
await sleep(500);
const k = watcher.got('kill').find(m => m.v === wet.id);
ok(`b: the Wet CT switches the cellar back on, in the water: electrocuted (${JSON.stringify(k && { w: k.w })}), the fuse blows`, zaps() === 1 && k && k.w === 'electrocuted' && watcher.pw.main === 0 && watcher.L.power === false);

// ---- c. the generator doesn't feed the cellar
lawn.at(GEN, Math.PI); await sleep(300);
await press(lawn, 'g', 3300);
await until(() => lawn.pw.g[0] === 1, 2000);
await sleep(1000);
ok('c: the generator runs: the floors\' lamps are back, the cellar dead, nobody else electrocuted', lawn.pw.g[0] === 1 && lawn.L.lampa9 === true && lawn.L.lampa6 === true && lawn.L.cellar === false && lawn.L.dead.includes('cellar') && zaps() === 1);

for (const c of all) c.close();
process.exit(process.exitCode || 0);
