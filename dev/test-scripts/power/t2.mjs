// 3.2 Power surge, server side (Mansion). Two ways to run it (srv.sh, ROUND_TIME=600):
//   POWER_SURGE=1 GAS_LEAK_X=6 (every lit bulb on a circuit that comes back bursts):
//     - the T switches off the upper floor's breaker, the CT back on: a moment later (after the flicker) its five
//       bulbs burst one after another (pwPop), are listed burst and stay dark although the circuit is live; their
//       switches say the bulb has burst
//     - a bulb switched off doesn't burst (the cellar's); switched on, it works; lit, it bursts on the next restore
//     - the CCTV's and the lift's circuits have no bulbs: nothing bursts
//     - gas: the mains off, the kitchen's meter shot, the kitchen full of gas: the CT starts the generator, the ground
//       floor's bulbs burst and the kitchen's sets the gas off ('electric', credited to the CT)
//     - a restart: no burst bulbs
//   SURGE_RANDOM=1 on a default server (a bulb's chance 0.25, one for sure from three lit bulbs): the upper floor's restore
//     bursts 1 to 4 of its 5 bulbs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, sleep, admin } from '../mansion/client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const G = rel => import(pathToFileURL(path.join(repo, rel)).href);
const { MAPS } = await G('shared/maps/index.js');
const { GAS } = await G('shared/gas.js');
const { SURGE } = await G('shared/power.js');
const MAP = MAPS[process.env.MAP || 'cs_mansion'];

const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const until = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await sleep(50); return cond(); };
const UPPER = ['lampa9', 'lampa3', 'lampa10', 'lampa11', 'lampa1'];
const PANEL = [-16.95, -2.2, -4.6], FUSE = [-18.3, -2.2, -4.5], GEN = [-19.6, 0, -16.0], SW_UP = [-17.0, 4.267, 1.32], SW_CELLAR = [-14.0, -2.2, -3.6];

const ct = await player('Sparky', 'CT'), t = await player('Cutter', 'T');
for (const c of [ct, t]) {
  c.L = c.log.find(m => m.t === 'welcome')?.lights || {};
  c.pw = c.log.filter(m => m.t === 'power').pop() || null;
  c.on.power = m => { c.pw = m; c.pwAt = Date.now(); };
  c.on.lights = m => { c.L = m.lights; };
  c.on.world = m => { if (m.lights) c.L = m.lights; };
  c.on.pwPop = () => { c.popAt ||= Date.now(); };
}
t.w = 'glock';
const press = async (c, aim, hold = 120) => { c.send({ t: 'pwAim', a: aim }); await sleep(60); c.use(true); await sleep(hold); c.use(false); await sleep(120); };
const flip = async (c, k, to) => { c.at(PANEL, 0); await sleep(150); await press(c, 'b' + k, 1300); await until(() => c.pw.b[k] === to, 2000); };
const pops = c => c.got('pwPop');

for (let i = 0; i < 150 && !t.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
ok('round 1 started', t.got('msg').some(m => /Guard the hostages/.test(m.text)));
await sleep(3400);

if (process.env.SURGE_RANDOM) {
  await flip(t, 0, 0);
  ct.clear();
  await flip(ct, 0, 1);
  await sleep((SURGE.delay + 5 * SURGE.gap) * 1000 + 600);
  const n = pops(ct).length;
  ok(`the upper floor back: ${n} of its 5 bulbs burst (${pops(ct).map(m => m.g).join(', ')}), burst list ${JSON.stringify(ct.pw.burst)}`, n >= 1 && n <= 4 && ct.pw.burst.length === n);
} else {
  // ---- the upper floor: every lit bulb bursts, a moment later
  await flip(t, 0, 0);
  ok('the upper floor\'s breaker off: no bulb burst', pops(ct).length === 0);
  ct.clear();
  ct.popAt = 0;
  await flip(ct, 0, 1);
  const backAt = ct.pwAt;
  ok('back on: its lamps are lit at first', UPPER.every(g => ct.L[g] === true));
  await until(() => pops(ct).length >= 5, 4000);
  ok(`its five bulbs burst (${pops(ct).map(m => m.g).join(', ')})`, pops(ct).length === 5 && UPPER.every(g => pops(ct).some(m => m.g === g)));
  ok('each burst at its lamp', pops(ct).every(m => { const d = MAP.decor.find(x => x.type === 'ceilinglamp' && x.group === m.g); return d && Math.hypot(d.p[0] - m.p[0], d.p[1] - 0.15 - m.p[1], d.p[2] - m.p[2]) < 0.02; }));
  ok(`listed burst, dark although the circuit is live (${JSON.stringify(ct.pw.burst)})`, UPPER.every(g => ct.pw.burst.includes(g) && ct.L[g] === false) && ct.L.dead.length === 0 && ct.pw.b[0] === 1);
  ok(`not at once: after the flicker (the first burst ${((ct.popAt - backAt) / 1000).toFixed(2)} s after the power came back; ${SURGE.delay} s)`, ct.popAt - backAt >= SURGE.delay * 1000 - 120 && ct.popAt - backAt < SURGE.delay * 1000 + 400);
  t.at(SW_UP, 0); await sleep(200);
  t.clear();
  await press(t, null);
  ok('the switch upstairs: the bulb has burst', t.got('msg').some(m => /The bulb has burst/.test(m.text)));

  // ---- a bulb switched off doesn't burst (the cellar's)
  ct.at(SW_CELLAR, 0); await sleep(200);
  await press(ct, null);
  await until(() => ct.L.cellar === false, 2000);
  ok('the CT switched the cellar\'s lamp off', ct.L.cellar === false);
  await flip(t, 2, 0);
  ct.clear();
  await flip(ct, 2, 1);
  await sleep((SURGE.delay + SURGE.gap) * 1000 + 600);
  ok('the cellar\'s circuit back: its bulb (switched off) doesn\'t burst', pops(ct).length === 0 && !ct.pw.burst.includes('cellar'));
  ct.at(SW_CELLAR, 0); await sleep(200);
  await press(ct, null);
  await until(() => ct.L.cellar === true, 2000);
  ok('switched on, it works', ct.L.cellar === true);
  await flip(t, 2, 0);
  ct.clear();
  await flip(ct, 2, 1);
  await until(() => pops(ct).length >= 1, 3000);
  ok('lit, it bursts on the next restore', pops(ct).length === 1 && pops(ct)[0].g === 'cellar' && ct.pw.burst.includes('cellar') && ct.L.cellar === false);

  // ---- no bulbs on the CCTV's and the lift's circuits
  await flip(t, 3, 0); await flip(t, 4, 0);
  ct.clear();
  await flip(ct, 3, 1); await flip(ct, 4, 1);
  await sleep((SURGE.delay + SURGE.gap) * 1000 + 600);
  ok('the CCTV and the lift back: nothing bursts', pops(ct).length === 0);

  // ---- gas: the generator brings the ground floor back, a bulb sets the kitchen's gas off
  let gs = null;
  ct.on.s = m => { gs = m.gs || null; };
  const conc = i => { const r = gs?.r || []; for (let k = 0; k < r.length; k += 2) if (r[k] === i) return r[k + 1] / GAS.Q; return 0; };
  const KITCHEN = MAP.rooms.findIndex(r => r.group === 'lampa6');
  t.at(FUSE, 0); await sleep(200);
  await press(t, null, 3300);
  await until(() => ct.pw.main === 0, 2000);
  ok('the T pulled the fuse box\'s lever', ct.pw.main === 0);
  t.at([-17.5, 0.81, -11.5], 0); await sleep(300);
  for (let i = 0; i < 3 && !t.got('gasLeak').length; i++) { t.send({ t: 'shoot', o: [-17.5, 0.81 + 1.62, -11.5], d: (() => { const d = [-16.6 + 17.5, 1.5 - 2.43, -13.92 + 11.5], l = Math.hypot(...d); return d.map(v => v / l); })(), w: 'glock', rt: 0 }); await sleep(400); }
  ok('the T holed the kitchen\'s gas meter', t.got('gasLeak').length > 0);
  t.at([-6, 0, 18], 0);
  ct.at(GEN, Math.PI); await sleep(200);
  const thick = await until(() => conc(KITCHEN) >= GAS.ignite + 0.05, 90000);
  ok(`the kitchen is full of gas (${conc(KITCHEN).toFixed(2)})`, thick);
  ct.clear();
  await press(ct, 'g', 3300);
  await until(() => ct.pw.g[0] === 1, 2000);
  ok('the CT started the generator (no gas in the garage: nothing yet)', ct.pw.g[0] === 1 && !ct.got('gasBoom').length);
  const boom = await until(() => ct.got('gasBoom').length > 0, 5000);
  const b = ct.got('gasBoom')[0];
  ok(`the ground floor's bulbs burst and the kitchen's sets the gas off (${JSON.stringify(b && { i: b.i, k: b.k })}; bursts ${pops(ct).map(m => m.g).join(', ')})`, boom && b.k === 'electric' && pops(ct).some(m => m.g === 'lampa6'));
  await sleep(1500);
  // ---- a restart: whole again
  ct.clear();
  await admin({ action: 'restart' });
  await until(() => ct.got('power').length && ct.pw.burst.length === 0 && ct.pw.main === 1, 6000);
  await until(() => ct.L.lampa9 === true, 3000);
  ok(`a restart: no burst bulbs, every lamp on (${JSON.stringify(ct.pw.burst)})`, ct.pw.burst.length === 0 && [...UPPER, 'cellar', 'lampa6'].every(g => ct.L[g] === true));
}

ct.close(); t.close();
process.exit(process.exitCode || 0);
