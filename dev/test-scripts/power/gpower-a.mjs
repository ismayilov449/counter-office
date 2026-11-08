// Power & machinery in the browser, run A (MAP from the server: cs_mansion or cs_mansion_night; srv.sh with
// POWER_SURGE=0 GEN_TANK=25 ROUND_TIME=600 AUTO_BALANCE=0; the headless Edge from edge.ps1 on CDP_PORT 9630).
// The browser is a Terrorist ("Cutter"); a scripted CT ("Sparky") puts things back, a scripted T ("Mate") helps.
// Screenshots in OUT (PREFIX, default gpa), with their mean brightness where it matters; hints, progress bars, the
// server's messages and page errors printed. Headless Edge draws 1-3 frames a second: before each E the script waits
// for the hint that says the page has seen where we look.
//   1. the models: the breaker panel (its hint), the generator (its hint), the terrace's ladder (climbed: up onto the
//      roof), the machine room on the roof, the winch inside (its hint, the progress bar, let go: nothing cut), the house
//      from the street
//   2. the rooms dark by circuit: the upper floor's, the ground floor's, the cellar's breaker, each on its own (the three
//      views' brightness against lit), the CT switching each back on
//   3. the CCTV's breaker: the monitors go black; sitting down: NO POWER
//   4. the lift's breaker while riding it: it stops in the dark (hint), the house still lit; back on, it goes on
//   5. the fuse box: everything dark; the CT starts the generator: the two floors lit again, not the cellar; the
//      generator shaking and smoking (its hint for a T); it runs out of fuel: dark again; the mains back
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
import { meanLum } from './png.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const { MAPS } = await import(pathToFileURL(path.join(repo, 'shared/maps/index.js')).href);
const P = process.env.PREFIX || 'gpa';
const fails = [];
const check = (what, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const g = await open('T', 'Cutter', ['msg', 'lights', 'power', 'pwSfx', 'pwPop', 'cctv', 'elevState', 'welcome']);
const { tp, key, keyDown, keyUp, shot, msgs, errors, ev, look, cmd } = g;
await cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 8 && !(await ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await ev('document.querySelector(\'#join .team-btn[data-team="T"]\').click(), 1'); await sleep(1500);
}
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 1");
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
async function waitHint(re, ms = 8000) { const t0 = Date.now(); let h = ''; while (Date.now() - t0 < ms) { h = await hint(); if (re.test(h)) return h; await sleep(150); } return h; }
const progress = () => ev("(() => { const b = document.getElementById('progress'); return b && !b.classList.contains('hidden') ? document.getElementById('progress-label').textContent : ''; })()");
await ev("window.__ys = []; if (!window.__stateWired) { window.__stateWired = true; const s0 = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.startsWith('{\"t\":\"state\"')) { window.__state = d; window.__ys.push([Date.now(), JSON.parse(d).p[1]]); if (window.__ys.length > 4000) window.__ys.shift(); } return s0.call(this, d); }; } 1");
const myPos = async () => JSON.parse((await ev('window.__state || "{}"')) || '{}').p;
async function lookAt(p, q, settle = 700) {
  const eye = [p[0], p[1] + 1.62, p[2]], d = q.map((v, k) => v - eye[k]);
  await tp(p, Math.atan2(-d[0], -d[2]));
  await sleep(300);
  await look(0, Math.asin(d[1] / Math.hypot(...d)));
  await sleep(settle);
}
// all messages kept so far (the page's list is emptied; we keep our own)
const seen = [];
const pull = async () => { seen.push(...(await msgs())); return seen; };
const last = async t => (await pull()).filter(m => m.t === t).pop();
async function waitMsg(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await pull()).some(fn)) return true; await sleep(200); } return false; }
const shotL = async (name, rect) => { const f = await shot(`${P}_${name}.png`); const l = meanLum(f, rect); console.log(`  [shot] ${P}_${name}.png  brightness ${l.toFixed(1)}`); return l; };

const mapId = seen.find(m => m.t === 'welcome')?.map || (await pull()).find(m => m.t === 'welcome')?.map || 'cs_mansion';
const MAP = MAPS[mapId], PW = MAP.power, E = MAP.elevator, S = E.stops;
console.log('map', mapId);
const pn = PW.panel, colX = i => pn.min[0] + ((pn.max[0] - pn.min[0]) * (i + 0.5)) / 5, PY = (pn.min[1] + pn.max[1]) / 2;
const PANEL = [-16.95, -2.2, -4.6], FUSE = [-18.3, -2.2, -4.5], GEN = [-19.6, 0, -16.0];
const panelAim = i => [colX(i), PY, pn.max[2]];

// ---- 0. the scripted players join (the game starts), then out of the way on the south lawn
const sparky = await player('Sparky', 'CT'), mate = await player('Mate', 'T');
for (const c of [sparky, mate]) { c.on.power = m => { c.pw = m; }; c.on.elevState = m => { c.el = m; }; c.on.s = m => { c.off = m.time - Date.now(); }; c.pw = c.log.filter(m => m.t === 'power').pop(); c.el = c.log.filter(m => m.t === 'elevState').pop(); }
const park = () => { sparky.at([-6, 0, 18], 0); mate.at([-6, 0, 16], 0); };
for (let i = 0; i < 150 && !(await pull()).some(m => m.t === 'msg' && /Guard the hostages/.test(m.text)); i++) await sleep(200);
await sleep(3500);
park();
const pressS = async (c, aim, hold) => { c.send({ t: 'pwAim', a: aim }); await sleep(80); c.use(true); await sleep(hold); c.use(false); await sleep(150); };
const flipS = async (c, k, to) => { c.at(PANEL, 0); await sleep(250); await pressS(c, 'b' + k, 1400); for (let i = 0; i < 40 && c.pw?.b[k] !== to; i++) await sleep(100); park(); return c.pw?.b[k] === to; };
// the browser T switches breaker k off at the panel (hint, progress bar)
async function cutBreaker(k, name) {
  await lookAt(PANEL, panelAim(k));
  const h = await waitHint(new RegExp(`switch off the breaker for ${name}`));
  check(`hint at breaker ${k}: ${h}`, new RegExp(`Hold E to switch off the breaker for ${name} \\(1 s\\)`).test(h));
  await keyDown('KeyE'); await sleep(500);
  const pr = await progress();
  await sleep(1000); await keyUp('KeyE');
  check(`progress bar: ${pr}`, /Switching the breaker/.test(pr));
  const done = await waitMsg(m => m.t === 'power' && m.b[k] === 0, 4000);
  check(`breaker ${k} off`, done);
}

// ---- 1. the models
await lookAt([-16.95, -2.2, -3.7], [-16.95, -0.85, -5.37], 1500);
await shotL('panel');
await cutBreaker(0, 'the upper floor'); // (and back on: a first look at the hint and the progress bar)
check('the CT switches it back on', await flipS(sparky, 0, 1));
await lookAt([-19.6, 0, -16.7], [-19.6, 0.45, -14.9], 1500);
const hg = await waitHint(/generator/);
check('the generator\'s hint for a T: ' + hg, /The generator is off \(the CTs can start it\)/.test(hg));
await shotL('generator');
await lookAt([-3.9, 4.27, -2.2], [-6.2, 6.0, -3.9], 1500);
await shotL('ladder');
// climb it: at its foot facing the wall, look up, W
await tp([-5.65, 4.27, -3.9], Math.PI / 2); await sleep(400);
await look(0, 0.7); await sleep(600);
const hl = await waitHint(/Ladder/, 4000);
console.log('  hint on the ladder:', hl);
await keyDown('KeyW'); await sleep(7000); await keyUp('KeyW'); await sleep(800);
let pos = await myPos();
console.log('  after climbing:', pos);
await look(0, -0.7); await sleep(300);
await keyDown('KeyW'); await sleep(1500); await keyUp('KeyW'); await sleep(800);
pos = await myPos();
check(`up the ladder and onto the roof ${JSON.stringify(pos)}`, pos && pos[1] > 7.2 && pos[0] < -6.3);
await sleep(600);
await shotL('roof_from_ladder');
await tp([-15.6, 12.05, -4.4], Math.PI / 2); await sleep(400); await look(0, -0.3); await sleep(1500);
await shotL('roof_room');
const WIN = PW.winch, wc = [(WIN.min[0] + WIN.max[0]) / 2, WIN.min[1] + 0.7, (WIN.min[2] + WIN.max[2]) / 2];
await lookAt([-19.75, WIN.floor, -4.47], wc, 1500);
const hw = await waitHint(/cable/);
check('the winch\'s hint for a T: ' + hw, /Hold E to cut the lift's cable \(4 s\)/.test(hw));
await shotL('winch');
await keyDown('KeyE'); await sleep(1200);
const pw1 = await progress();
await shotL('winch_cutting');
await keyUp('KeyE'); await sleep(1500);
check(`cutting shows its progress bar (${pw1}); let go early: nothing cut`, /Cutting the lift's cable/.test(pw1) && !(await pull()).some(m => m.t === 'power' && m.cut));
await lookAt([-19.75, WIN.floor, -4.0], [-21.3, WIN.floor + 0.6, -5.2], 1000);
await shotL('machine_room_inside');
await tp([27.5, 0, -2.0], Math.PI / 2); await sleep(400); await look(0, 0.12); await sleep(1500);
await shotL('street');

// ---- 2. the rooms dark by circuit
const VIEWS = {
  upper: async () => { await tp([-14.6, 4.27, -2.5], Math.PI / 2); await sleep(300); await look(0, -0.08); await sleep(1300); },
  ground: async () => { await lookAt([-14.6, 0.813, 0.0], [-21.5, 1.4, -2.0], 1300); },
  cellar: async () => { await lookAt([-15.2, -2.2, 3.0], [-21.5, -1.2, -1.0], 1300); },
};
const lit = {};
for (const [v, go] of Object.entries(VIEWS)) { await go(); lit[v] = await shotL('lit_' + v); }
const NAMES = ['the upper floor', 'the ground floor', 'the cellar'];
for (const [k, v] of [[0, 'upper'], [1, 'ground'], [2, 'cellar']]) {
  await cutBreaker(k, NAMES[k]);
  const lv = await last('lights');
  console.log(`  lights.dead: ${JSON.stringify(lv?.lights?.dead)}`);
  const now = {};
  for (const [w, go] of Object.entries(VIEWS)) { await go(); now[w] = await shotL(`${v}off_${w}`); }
  check(`${v} breaker off: ${v} dark (${now[v].toFixed(1)} vs ${lit[v].toFixed(1)} lit), the others lit (${Object.keys(VIEWS).filter(w => w !== v).map(w => `${w} ${now[w].toFixed(1)}/${lit[w].toFixed(1)}`).join(', ')})`,
    now[v] < lit[v] * 0.6 && Object.keys(VIEWS).filter(w => w !== v).every(w => now[w] > lit[w] * 0.75));
  check(`the CT switches the ${v} breaker back on`, await flipS(sparky, k, 1));
  await sleep(500);
}

// ---- 3. the CCTV's breaker: the monitors
const MON = [-10.25, 5.48, -13.555];
await lookAt([-10.25, 4.27, -11.4], MON, 2500);
const monOn = await shotL('monitors_on', [0.36, 0.4, 0.44, 0.6]);
await cutBreaker(3, 'the CCTV');
await lookAt([-10.25, 4.27, -11.4], MON, 2500);
const monOff = await shotL('monitors_off', [0.36, 0.4, 0.44, 0.6]);
check(`the CCTV's breaker off: the monitors black (${monOff.toFixed(1)} vs ${monOn.toFixed(1)})`, monOff < monOn * 0.4);
await tp([-10.0, 4.27, -12.0], 0); await sleep(300); await look(0, -0.25); await sleep(1200);
const hd = await hint();
console.log('  hint at the desk:', hd);
check('the desk\'s hint says no power: ' + hd, /no power: the cameras are off/.test(hd));
await key('KeyE'); await sleep(2000);
await shotL('cctv_nopower');
await key('Escape'); await sleep(1200);
check('the CT switches the CCTV back on', await flipS(sparky, 3, 1));

// ---- 4. the lift's breaker while riding it
const doorX = (E.door.x1 + E.door.x2) / 2, mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];
const cabY = (c = sparky) => { const m = c.el?.m; if (!m) return { y: S[1], moving: false }; const t = Date.now() + (c.off || 0); const mo = { y0: m[0], y1: m[1], t0: m[2], tb: m[3], fall: m[4], tc: m[5] }; return motionAtF(mo, t); };
const { motionAt: motionAtF } = await import(pathToFileURL(path.join(repo, 'shared/elevator.js')).href);
await lookAt([doorX + 0.2, S[1], E.out.z2 + 0.8], E.call[1]);
await waitHint(/call the lift/);
await key('KeyE'); await sleep(2500);
await lookAt([mid[0], S[1] + 0.01, mid[1]], [E.panel.x, S[1] + E.panel.ys[2], E.panel.z]);
const hp2 = await waitHint(/upper floor/);
check('in the cabin, the panel\'s hint: ' + hp2, /Press E to go to the upper floor/.test(hp2));
await key('KeyE');
for (let i = 0; i < 80 && !cabY().moving; i++) await sleep(100);
await sleep(1200);
mate.at(PANEL, 0); await sleep(250); await pressS(mate, 'b4', 1400); park();
for (let i = 0; i < 40 && sparky.el?.p !== 0; i++) await sleep(100);
await sleep(1500);
await look(0, -0.5); await sleep(1500);
const hs = await waitHint(/stuck|stopped/, 5000);
const yStuck = cabY().y;
check(`the lift's breaker off while riding: it stops between floors (${yStuck.toFixed(2)}), hint: ${hs}`, sparky.el?.p === 0 && !cabY().moving && S.every(s => Math.abs(yStuck - s) > 0.05) && /stuck in the dark/.test(hs));
await shotL('lift_stopped');
const lv4 = await last('lights');
check('the house still lit (only the lift dead)', lv4 && lv4.lights.lampa7 === true && lv4.lights.lampa9 === true && JSON.stringify(lv4.lights.dead) === '["elevator"]');
check('the CT switches the lift back on', await flipS(sparky, 4, 1));
let went = false;
for (let i = 0; i < 100; i++) { if (S.some(s => Math.abs(cabY().y - s) < 0.002) && !cabY().moving && Math.abs(cabY().y - yStuck) > 0.05) { went = true; break; } await sleep(100); }
check(`power back: it goes on to a floor (${cabY().y.toFixed(3)})`, went);
await tp([doorX, S[1], E.out.z2 + 3], 0); await sleep(500);

// ---- 5. the fuse box, the generator
const GV = VIEWS;
await lookAt(FUSE, [-18.3, -0.95, -5.3]);
const hf = await waitHint(/cut the power/);
check('the fuse box\'s hint: ' + hf, /Hold E to cut the power to the house/.test(hf));
await keyDown('KeyE'); await sleep(3600); await keyUp('KeyE');
check('the mains off', await waitMsg(m => m.t === 'power' && m.main === 0, 4000));
const off = {};
for (const [w, go] of Object.entries(GV)) { await go(); off[w] = await shotL('mainsoff_' + w); }
sparky.at(GEN, Math.PI); await sleep(250); await pressS(sparky, 'g', 3400); park();
check('the CT started the generator', await waitMsg(m => m.t === 'power' && m.g[0] === 1, 4000));
await sleep(800);
const on = {};
for (const [w, go] of Object.entries(GV)) { await go(); on[w] = await shotL('gen_' + w); }
check(`the generator lights both floors (upper ${on.upper.toFixed(1)} vs ${off.upper.toFixed(1)} off, ground ${on.ground.toFixed(1)} vs ${off.ground.toFixed(1)}), not the cellar (${on.cellar.toFixed(1)} vs ${off.cellar.toFixed(1)})`,
  on.upper > off.upper * 1.6 && on.ground > off.ground * 1.6 && on.cellar < lit.cellar * 0.6);
await lookAt([-19.6, 0, -16.7], [-19.6, 0.45, -14.9], 800);
const hg2 = await waitHint(/switch the generator off/);
check('the running generator\'s hint for a T: ' + hg2, /Hold E to switch the generator off \(2 s\) — \d+ s of fuel left/.test(hg2));
await shotL('gen_running_1'); await sleep(700); await shotL('gen_running_2');
check('it runs out of fuel', await waitMsg(m => m.t === 'pwSfx' && m.s === 'genout', 40000));
await sleep(1000);
const dry = {};
for (const w of ['upper', 'ground']) { await GV[w](); dry[w] = await shotL('genout_' + w); }
check(`out of fuel: dark again (upper ${dry.upper.toFixed(1)}, ground ${dry.ground.toFixed(1)})`, dry.upper < on.upper * 0.6 && dry.ground < on.ground * 0.6);
sparky.at(FUSE, 0); await sleep(250); sparky.send({ t: 'pwAim', a: null }); await sleep(80); sparky.use(true); await sleep(5400); sparky.use(false); park();
check('the CT pulled the lever back', await waitMsg(m => m.t === 'power' && m.main === 1, 4000));
await GV.upper(); await sleep(1500);
const back = await shotL('mains_back_upper');
check(`all lit again (${back.toFixed(1)})`, back > lit.upper * 0.75);

console.log('server messages:', seen.filter(m => m.t === 'msg').map(m => m.text).slice(-25).join(' | '));
console.log('page errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
check('no page errors', errors.length === 0);
console.log(fails.length ? `FAILED: ${fails.length}\n - ${fails.join('\n - ')}` : 'all passed');
sparky.close(); mate.close();
process.exit(fails.length ? 1 : 0);
