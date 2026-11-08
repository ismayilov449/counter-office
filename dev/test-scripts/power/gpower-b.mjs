// Power & machinery in the browser, run B (MAP from the server; srv.sh with POWER_SURGE=1 POWER_CATCH=0,0,1
// ROUND_TIME=600 AUTO_BALANCE=0; the headless Edge from edge.ps1 on CDP_PORT 9630). The browser is a CT ("Rider"); a
// scripted T ("Cutty") cuts things, a scripted CT ("Ride2") rides the lift once. Screenshots in OUT (PREFIX, default
// gpb); hints, progress bars, the page's own height every frame of a fall, the server's messages and page errors.
//   1. bulbs bursting: Cutty cuts the cellar's breaker, the browser CT switches it back on (hint, progress bar) and
//      watches the cellar's bulb: it bursts with sparks a second later and stays dark; the same upstairs (five bulbs)
//   2. the fall seen from outside: Ride2 rides up to the upper floor and holds the doors open; the browser stands on
//      the upper landing looking in; Cutty cuts the cable: the cabin drops away (the doors stay open on an empty
//      shaft), crashes into the pit; the call buttons say out of order
//   3. riding it down from inside (new round): the browser in the cabin on the ground floor; the cut: the page's
//      height follows the falling cabin onto the buffers; the fall damage (43); dark; prying the doors open; E climbs
//      out (the cellar's floor is 0.85 m up: no stepping up into it under the cabin's ceiling)
//   4. the brake catching (new round): it drops less than a metre and holds; nobody hurt; out of order; pry out
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
import { meanLum } from './png.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const { MAPS } = await import(pathToFileURL(path.join(repo, 'shared/maps/index.js')).href);
const { motionAt } = await import(pathToFileURL(path.join(repo, 'shared/elevator.js')).href);
const { CABLE, crashDamage, caughtDrop } = await import(pathToFileURL(path.join(repo, 'shared/power.js')).href);
const P = process.env.PREFIX || 'gpb';
const fails = [];
const check = (what, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const g = await open('CT', 'Rider', ['msg', 'lights', 'power', 'pwSfx', 'pwPop', 'elevState', 'elevSfx', 'welcome', 'dmg', 'kill', 'bodyDown']);
const { tp, key, keyDown, keyUp, shot, msgs, errors, ev, look, cmd } = g;
await cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 8 && !(await ev('document.getElementById("join").classList.contains("hidden")')); i++) {
  await ev('document.querySelector(\'#join .team-btn[data-team="CT"]\').click(), 1'); await sleep(1500);
}
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 1");
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
async function waitHint(re, ms = 8000) { const t0 = Date.now(); let h = ''; while (Date.now() - t0 < ms) { h = await hint(); if (re.test(h)) return h; await sleep(150); } return h; }
const progress = () => ev("(() => { const b = document.getElementById('progress'); return b && !b.classList.contains('hidden') ? document.getElementById('progress-label').textContent : ''; })()");
const hpNow = async () => +(await ev("document.getElementById('hp')?.textContent || '0'")).replace(/\D/g, '');
await ev("window.__ys = []; if (!window.__stateWired) { window.__stateWired = true; const s0 = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.startsWith('{\"t\":\"state\"')) { window.__state = d; window.__ys.push([Date.now(), JSON.parse(d).p[1]]); if (window.__ys.length > 4000) window.__ys.shift(); } return s0.call(this, d); }; } 1");
const myPos = async () => JSON.parse((await ev('window.__state || "{}"')) || '{}').p;
async function lookAt(p, q, settle = 700) {
  const eye = [p[0], p[1] + 1.62, p[2]], d = q.map((v, k) => v - eye[k]);
  await tp(p, Math.atan2(-d[0], -d[2]));
  await sleep(300);
  await look(0, Math.asin(d[1] / Math.hypot(...d)));
  await sleep(settle);
}
const seen = [];
const pull = async () => { seen.push(...JSON.parse(await ev('JSON.stringify(__in.splice(0))'))); return seen; }; // (one call: read and empty the page's list at once, or a message arriving in between is lost)
async function waitMsg(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await pull()).some(fn)) return true; await sleep(150); } return false; }
const shotL = async (name, rect) => { const f = await shot(`${P}_${name}.png`); const l = meanLum(f, rect); console.log(`  [shot] ${P}_${name}.png  brightness ${l.toFixed(1)}`); return l; };

const mapId = (await pull()).find(m => m.t === 'welcome')?.map || 'cs_mansion';
const MAP = MAPS[mapId], PW = MAP.power, E = MAP.elevator, S = E.stops;
console.log('map', mapId);
const pn = PW.panel, colX = i => pn.min[0] + ((pn.max[0] - pn.min[0]) * (i + 0.5)) / 5, PY = (pn.min[1] + pn.max[1]) / 2;
const PANEL = [-16.95, -2.2, -4.6], WSPOT = [-19.85, PW.winch.floor, -4.47];
const doorX = (E.door.x1 + E.door.x2) / 2, mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];
const landing = s => [doorX + 0.2, S[s], E.out.z2 + 0.8];

// ---- 0. the scripted players
const cutty = await player('Cutty', 'T'), ride2 = await player('Ride2', 'CT');
for (const c of [cutty, ride2]) {
  c.id = c.log.find(m => m.t === 'welcome')?.id;
  c.off = 0;
  c.on.power = m => { c.pw = m; }; c.on.elevState = m => { c.el = m; }; c.on.s = m => { c.off = m.time - Date.now(); };
  c.pw = c.log.filter(m => m.t === 'power').pop(); c.el = c.log.filter(m => m.t === 'elevState').pop();
}
const motion = c => { const m = c.el.m; return { y0: m[0], y1: m[1], t0: m[2], tb: m[3], fall: m[4], tc: m[5] }; };
const cab = (c = cutty, at = Date.now()) => (c.el ? motionAt(motion(c), at + c.off) : { y: S[1], moving: false });
setInterval(() => { for (const c of [cutty, ride2]) if (c.ride && c.el && c.alive) c.at([c.ride.x, cab(c).y, c.ride.z], c.yaw); }, 20);
const park = () => { cutty.at([-6, 0, 16], 0); if (!ride2.ride) ride2.at([-6, 0, 18], 0); };
const pressS = async (c, aim, hold) => { c.send({ t: 'pwAim', a: aim }); await sleep(80); c.use(true); await sleep(hold); c.use(false); await sleep(150); };
const pressE = async (c, aim, hold = 80) => { c.send({ t: 'elevAim', a: aim }); await sleep(50); c.use(true); await sleep(hold); c.use(false); await sleep(80); };
const flipS = async (c, k, to) => { c.at(PANEL, 0); await sleep(250); await pressS(c, 'b' + k, 1400); for (let i = 0; i < 40 && c.pw?.b[k] !== to; i++) await sleep(100); park(); return c.pw?.b[k] === to; };
const cutCable = async () => { cutty.at(WSPOT, Math.PI / 2); await sleep(300); await pressS(cutty, 'w', CABLE.hold * 1000 + 400); park(); };
async function liveRound() { for (let i = 0; i < 100 && !(await pull()).some(m => m.t === 'msg' && /Rescue the hostages|Guard the hostages/.test(m.text)); i++) await sleep(200); await sleep(3600); }
await liveRound();
park();

// ---- 1. bulbs bursting
async function restoreAndWatch(k, name, spot, bulb, tag) {
  check(`Cutty switched off the breaker for ${name}`, await flipS(cutty, k, 0));
  await lookAt(PANEL, [colX(k), PY, pn.max[2]]);
  const h = await waitHint(new RegExp(`switch the breaker for ${name} back on`));
  check(`the CT's hint: ${h}`, new RegExp(`Hold E to switch the breaker for ${name} back on \\(1 s\\)`).test(h));
  await keyDown('KeyE'); await sleep(500);
  const pr = await progress();
  await sleep(1000); await keyUp('KeyE');
  check(`progress bar: ${pr}`, /Switching the breaker/.test(pr));
  check(`switched back on`, await waitMsg(m => m.t === 'power' && m.b[k] === 1, 3000));
  await lookAt(spot, bulb, 100);
  // (a burst's sparks live half a second: a screenshot the moment each pwPop reaches the page, and one just after)
  let n = 0, i = 0;
  for (const t0 = Date.now(); Date.now() - t0 < 4000;) {
    const k2 = +(await ev("__in.filter(m => m.t === 'pwPop').length"));
    if (k2 > n) { n = k2; await shot(`${P}_${tag}_${i++}.png`); await shot(`${P}_${tag}_${i++}.png`); }
    await sleep(40);
  }
  await sleep(500);
  await pull();
  const pops = seen.filter(m => m.t === 'pwPop');
  console.log(`  pops so far: ${pops.map(m => m.g).join(', ')}`);
  return pops;
}
let pops = await restoreAndWatch(2, 'the cellar', [-16.9, -2.2, 1.4], [-18.6, 0.46, -0.6], 'pop_cellar');
check('the cellar\'s bulb burst (pwPop)', pops.some(m => m.g === 'cellar'));
const lc = seen.filter(m => m.t === 'lights').pop();
check('it stays dark although the circuit is live', lc?.lights.cellar === false && !lc.lights.dead.includes('cellar'));
await shotL('cellar_after');
pops = await restoreAndWatch(0, 'the upper floor', [-17.6, 4.27, 1.6], [-19.61, 6.56, 0], 'pop_upper');
check(`the upper floor's five bulbs burst (${pops.filter(m => /lampa(9|3|10|11|1)$/.test(m.g)).length})`, ['lampa9', 'lampa3', 'lampa10', 'lampa11', 'lampa1'].every(gr => pops.some(m => m.g === gr)));
await shotL('upper_after');

// ---- 2. the fall seen from outside: Ride2 rides up and holds the doors open
ride2.at(landing(1), 0); await sleep(300);
await pressE(ride2, 'c1');
for (let i = 0; i < 60 && !(cutty.el && cutty.el.d[0][1] > 0); i++) await sleep(100);
await sleep(1300);
ride2.ride = { x: mid[0], z: mid[1] }; await sleep(300);
await pressE(ride2, 'b2');
for (let i = 0; i < 80 && !cab().moving; i++) await sleep(100);
for (let i = 0; i < 120 && !(Math.abs(cab().y - S[2]) < 1e-3 && !cab().moving); i++) await sleep(100);
ride2.ride = { x: mid[0], z: E.cabin.z2 - 0.04 }; // (in the doorway, inside: the doors stay open)
await sleep(2500);
check(`Ride2 is upstairs in the cabin, its doors open (${cab().y.toFixed(3)})`, Math.abs(cab().y - S[2]) < 1e-3);
await tp([doorX, S[2], E.out.z2 + 1.6], 0); await sleep(400); await look(0, -0.12); await sleep(1500);
await shotL('cab_open');
await pull();
const before = seen.length;
const cutP = cutCable();
check('the cable snaps', await waitMsg(m => m.t === 'power' && m.cut === 1, 9000));
for (let i = 0; i < 5; i++) { await shot(`${P}_fall_${i}.png`); await sleep(200); }
await cutP;
check('the crash (heard)', await waitMsg(m => m.t === 'pwSfx' && m.s === 'crash', 5000));
const k2 = seen.slice(before).find(m => (m.t === 'kill' || m.t === 'bodyDown') && m.v === ride2.id);
check(`Ride2, riding it down from the upper floor: ${k2 ? k2.t + ' (' + (k2.w || '') + ')' : 'nothing'}`, !!k2);
ride2.ride = null;
await sleep(800);
await shotL('after_fall');
await tp([doorX, S[2], E.out.z2 + 0.32], 0); await sleep(400); await look(0, -1.25); await sleep(1500);
await shotL('shaft_down');
await lookAt(landing(2), E.call[2]);
const ho = await waitHint(/Out of order/);
check('the call button: ' + ho, /Out of order — someone cut the lift's cable/.test(ho));
await shotL('out_of_order');

// ---- 3. riding it down from inside (a new round)
async function intoCabin() {
  await lookAt(landing(1), E.call[1]);
  await waitHint(/call the lift/);
  await key('KeyE');
  for (let i = 0; i < 60 && !(cutty.el && cutty.el.d[0][1] > 0); i++) await sleep(100);
  await sleep(1300);
  await tp([mid[0], S[1] + 0.01, mid[1]], Math.PI); await sleep(1500);
}
async function prOut(tag, from) {
  await tp([mid[0], from + 0.01, mid[1] + 0.3], Math.PI); await sleep(300); await look(0, -0.05); await sleep(1200);
  const h = await waitHint(/pry the doors/);
  check(`facing the doors: ${h}`, /Hold E to pry the doors open \(3 s, loud\)/.test(h));
  await keyDown('KeyE'); await sleep(1200);
  const pr = await progress();
  await sleep(2300); await keyUp('KeyE');
  check(`prying: ${pr}`, /Prying the lift's doors open/.test(pr));
  check('they give', await waitMsg(m => m.t === 'elevSfx' && m.s === 'forced', 4000));
  await sleep(2000);
  await shotL(tag + '_open');
  const h2 = await waitHint(/climb out/);
  check(`then, facing the open doors: ${h2}`, /Press E to climb out/.test(h2));
  await key('KeyE'); await sleep(1800);
  return myPos();
}
await admin({ action: 'restart' });
seen.length = 0;
await liveRound();
park();
await intoCabin();
const hp0 = await hpNow();
await ev('window.__ys.length = 0, 1');
await pull();
const t3 = seen.length;
await cutCable();
check('the crash', await waitMsg(m => m.t === 'pwSfx' && m.s === 'crash', 5000));
const fallEl = seen.slice(t3).filter(m => m.t === 'elevState' && m.m[4] === 1).pop();
await sleep(1500);
{
  const ys = JSON.parse(await ev('JSON.stringify(window.__ys)'));
  const fm = fallEl ? { y0: fallEl.m[0], y1: fallEl.m[1], t0: fallEl.m[2], tb: fallEl.m[3], fall: 1, tc: fallEl.m[5] } : null;
  const during = fm ? ys.filter(([at]) => motionAt(fm, at + cutty.off).moving) : [];
  const dev = during.map(([at, y]) => Math.abs(y - motionAt(fm, at + cutty.off).y));
  console.log(`  the fall: ${during.length} frames sent while falling (heights ${during.map(d => d[1].toFixed(2)).join(' ')}), worst off the cabin's floor ${dev.length ? Math.max(...dev).toFixed(3) : '-'} m; last height ${ys.at(-1)?.[1]}`);
  check('the page\'s height ends on the crashed cabin\'s floor (-3.05)', ys.length && Math.abs(ys.at(-1)[1] - CABLE.land) < 0.03);
  check('every frame sent while falling on its floor (within 0.3 m: the server\'s clock against ours)', dev.every(d => d < 0.3));
}
const hp1 = await hpNow();
const want = crashDamage(S[1] - CABLE.land);
check(`the fall damage: hp ${hp0} -> ${hp1} (want -${want})`, hp0 - hp1 === want);
await look(0, -0.3); await sleep(1500);
await shotL('wreck_inside');
const out1 = await prOut('wreck', CABLE.land);
check(`climbed out into the cellar ${JSON.stringify(out1)}`, out1 && Math.abs(out1[1] - S[0]) < 0.05 && out1[2] > E.out.z2 - 0.1);
await shotL('wreck_from_cellar');

// ---- 4. the brake catching (a new round)
await admin({ action: 'restart' });
seen.length = 0;
await liveRound();
park();
await intoCabin();
const hp2 = await hpNow();
await cutCable();
check('the brake catches it (its screech)', await waitMsg(m => m.t === 'pwSfx' && m.s === 'caught', 5000));
await sleep(1500);
const yc = cab().y, p4 = await myPos();
check(`it dropped ${(S[1] - yc).toFixed(2)} m (${caughtDrop().toFixed(2)}) and holds; we're on its floor (${p4?.[1]})`, Math.abs(S[1] - yc - caughtDrop()) < 0.02 && !cab().moving && Math.abs(p4[1] - yc) < 0.03);
check(`nobody hurt (hp ${hp2} -> ${await hpNow()})`, (await hpNow()) === hp2);
await lookAt([mid[0], yc + 0.01, mid[1]], [E.panel.x, yc + E.panel.ys[2], E.panel.z]);
const hb = await waitHint(/Out of order/);
check('its buttons: ' + hb, /Out of order/.test(hb));
await shotL('caught_inside');
const out2 = await prOut('caught', yc);
check(`climbed out into the living room ${JSON.stringify(out2)}`, out2 && Math.abs(out2[1] - S[1]) < 0.12 && out2[2] > E.out.z2 - 0.1);

console.log('server messages:', seen.filter(m => m.t === 'msg').map(m => m.text).slice(-20).join(' | '));
console.log('page errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
check('no page errors', errors.length === 0);
console.log(fails.length ? `FAILED: ${fails.length}\n - ${fails.join('\n - ')}` : 'all passed');
cutty.close(); ride2.close();
process.exit(fails.length ? 1 : 0);
