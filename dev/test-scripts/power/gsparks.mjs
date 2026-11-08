// Do the effects' sparks show in a headless screenshot at all? (A control for the bulbs' bursts.) The browser T fires
// at a wall 1.5 m away (bullet impacts use the same fx.sparks) and screenshots right away; then a scripted T cuts the
// cellar's breaker and a scripted CT switches it back on while the browser looks at the cellar's bulb from 2 m, and
// screenshots the moment the burst (pwPop) reaches the page. OUT/PREFIX as the other browser tests.
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
const P = process.env.PREFIX || 'gsp';
const g = await open('T', 'Sparker', ['msg', 'pwPop', 'power']);
const { tp, shot, ev, look, cmd, click, errors } = g;
await cmd('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 8 && !(await ev('document.getElementById("join").classList.contains("hidden")')); i++) { await ev('document.querySelector(\'#join .team-btn[data-team="T"]\').click(), 1'); await sleep(1500); }
await ev("Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('#game canvas') }); document.dispatchEvent(new Event('pointerlockchange')); document.getElementById('paused').classList.add('hidden'); 1");
const ct = await player('Fixer', 'CT'), t2 = await player('Breaker', 'T');
for (const c of [ct, t2]) { c.on.power = m => { c.pw = m; }; }
await sleep(9000);
ct.at([-6, 0, 18], 0); t2.at([-6, 0, 16], 0);
// a wall in the cellar, 1.5 m away
await tp([-17.0, -2.2, -3.9], 0); await sleep(1500);
await click(0, 80);
await shot(`${P}_impact_0.png`); await shot(`${P}_impact_1.png`);
// the cellar's bulb
const press = async (c, a, hold) => { c.at([-16.95, -2.2, -4.6], 0); await sleep(250); c.send({ t: 'pwAim', a }); await sleep(80); c.use(true); await sleep(hold); c.use(false); await sleep(200); };
await press(t2, 'b2', 1400); t2.at([-6, 0, 16], 0);
await tp([-17.6, -2.2, 0.6], Math.atan2(1.0, 1.2)); await sleep(400); await look(0, 0.75); await sleep(1500);
await ev('__in.length = 0, 1');
await press(ct, 'b2', 1400); ct.at([-6, 0, 18], 0);
let i = 0;
for (const t0 = Date.now(); Date.now() - t0 < 4000 && i < 6;) { if (+(await ev("__in.filter(m => m.t === 'pwPop').length"))) { await shot(`${P}_pop_${i++}.png`); } await sleep(30); }
console.log('shots', i, 'errors', errors.length ? errors.join(' | ') : 'none');
ct.close(); t2.close();
process.exit(0);
