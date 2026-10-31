// The lift in the browser (MAP from the server: cs_mansion or cs_mansion_night; test server with BOTS=0
// START_MONEY=16000, headless Edge on CDP_PORT — see dev/test-scripts/mansion/game.mjs). Not run yet: the architect runs
// the browser tests once every agent has finished. Screenshots in OUT (prefix PREFIX, default gel), hints, the player's
// height during the ride (from the 'state' messages the page sends), the server's messages and page errors printed.
//   1. the browser is a CT at the living room's landing: the call button's hint, E opens the doors; in, the panel's
//      hint, E sends it upstairs: the ride (the height sampled: smooth, ending on the upper floor), the doors, out.
//   2. back in, down towards the cellar; a scripted T cuts the power half way: dark, stuck (hint); the roof hatch (look
//      up, E): on the roof (the shaft, the ladder); pry the upper landing's doors (hold E: progress bar); climb out (E).
//      A scripted CT brings the power back: the doors shut and the cabin goes on down (heard).
//   3. riding with a scripted player standing in the cabin: he's drawn standing on its floor (not sunk, not floating).
import { open, sleep } from '../mansion/game.mjs';
import { player, admin } from '../mansion/client.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const { MAPS } = await import(pathToFileURL(path.join(repo, 'shared/maps/index.js')).href);
const { motionAt, roofAt } = await import(pathToFileURL(path.join(repo, 'shared/elevator.js')).href);
const P = process.env.PREFIX || 'gel';
const E = MAPS.cs_mansion.elevator, S = E.stops, doorX = (E.door.x1 + E.door.x2) / 2;
const mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];

const g = await open('CT', 'Rider', ['msg', 'elevState', 'elevSfx', 'elevTo', 'lights']);
const { tp, key, keyDown, keyUp, shot, msgs, errors, ev, look } = g;
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
// the page's own position: the last 'state' message it sent
await ev("if (!window.__stateWired) { window.__stateWired = true; const s0 = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.startsWith('{\"t\":\"state\"')) window.__state = d; return s0.call(this, d); }; } 1");
const myPos = async () => JSON.parse((await ev('window.__state || "{}"')) || '{}').p;
// stand at p and look at q (yaw from the direction, pitch with the mouse)
async function lookAt(p, q) {
  const eye = [p[0], p[1] + 1.62, p[2]], d = q.map((v, k) => v - eye[k]);
  await tp(p, Math.atan2(-d[0], -d[2]));
  await sleep(150);
  await look(0, Math.asin(d[1] / Math.hypot(...d)));
  await sleep(250);
}

// ---- 1. call it, ride up, out
const landing = [doorX + 0.2, 0.91, E.out.z2 + 0.8];
await lookAt(landing, E.call[1]);
console.log('hint at the call button:', await hint());
await shot(P + '_landing.png');
await key('KeyE'); await sleep(1500);
await shot(P + '_open.png');
const inCab = [mid[0], S[1] + 0.01, mid[1]];
await lookAt(inCab, [E.panel.x, S[1] + E.panel.ys[2], E.panel.z]);
console.log('hint at the panel (upper floor):', await hint());
await shot(P + '_panel.png');
await key('KeyE');
const heights = [], t0 = Date.now();
for (let i = 0; i < 40; i++) { await sleep(250); heights.push(+((await myPos())?.[1] ?? NaN).toFixed(3)); }
console.log(`our height every 0.25 s from pressing the button (${((Date.now() - t0) / 1000).toFixed(1)} s):`, heights.join(' '));
const steps = heights.slice(1).map((h, i) => h - heights[i]);
console.log(`  smooth: never down (${steps.every(s => s > -0.01)}), never more than 0.3 m a step (${steps.every(s => s < 0.3)}), on the upper floor at the end (${Math.abs(heights.at(-1) - S[2]) < 0.02})`);
await shot(P + '_top.png');
await tp([doorX, S[2] + 0.01, E.cabin.z2 - 0.4], Math.PI); await sleep(200);
await keyDown('KeyW'); await sleep(1300); await keyUp('KeyW'); await sleep(300);
console.log('walked out upstairs at', await myPos());
await tp([doorX + 0.6, S[2], E.out.z2 + 2.5], 0, -0.05); await sleep(400);
await shot(P + '_upstairs.png'); // (the shaft built into the bookcase wall, its doors shutting)
console.log('messages (part 1):', (await msgs()).map(m => m.t + (m.s ? ' ' + m.s : '') + (m.text ? ': ' + m.text : '')).filter(t => t !== 'elevState').join(' | '));

// ---- 2. the blackout half way down; the hatch; out through the upper landing; the power back
const t = await player('Cutter', 'T'), fixer = await player('Fixer', 'CT');
await sleep(500);
await lookAt([doorX + 0.2, S[2], E.out.z2 + 0.8], E.call[2]);
await key('KeyE'); await sleep(1400);
await lookAt([mid[0], S[2] + 0.01, mid[1]], [E.panel.x, S[2] + E.panel.ys[0], E.panel.z]);
console.log('hint at the panel (cellar):', await hint());
t.at([-18.3, S[0], -4.6], 0); await sleep(200);
t.use(true); await sleep(600);
await key('KeyE');
await sleep(2700); t.use(false);
await sleep(1200);
await look(0, -0.4); await sleep(300);
console.log('hint stuck in the dark:', await hint());
await shot(P + '_dark.png');
const pos = await myPos();
console.log('stuck at', pos);
await lookAt(pos, [(E.hatch.x1 + E.hatch.x2) / 2, pos[1] + E.cabin.ceil, (E.hatch.z1 + E.hatch.z2) / 2]);
console.log('hint looking up:', await hint());
await key('KeyE'); await sleep(800);
const roof = await myPos();
console.log('on the roof at', roof, '(roof at', roofAt(E, pos[1]).toFixed(3) + ')');
await look(0, 0.5); await sleep(300); await shot(P + '_roof_up.png'); // (the shaft, the ladder)
await lookAt(roof, [doorX, S[2] + 1.0, E.shaft.z2]);
console.log('hint at the upper landing\'s doors:', await hint());
await keyDown('KeyE'); await sleep(1600);
await shot(P + '_prying.png');
await sleep(1800); await keyUp('KeyE'); await sleep(1900);
await shot(P + '_pried.png');
console.log('hint when they\'re open:', await hint());
await key('KeyE'); await sleep(600);
console.log('climbed out at', await myPos());
fixer.at([-18.3, S[0], -4.6], 0); await sleep(200);
fixer.use(true); await sleep(5600); fixer.use(false);
await sleep(4000);
console.log('messages (part 2):', (await msgs()).map(m => m.t + (m.s ? ' ' + m.s : '') + (m.power ? ' ' + m.power : '') + (m.text ? ': ' + m.text : '')).filter(x => x !== 'elevState').join(' | '));
t.close(); fixer.close();

// ---- 3. riding with someone: he stands on the cabin's floor in our picture
const mate = await player('Mate', 'CT');
let el = null, off = 0;
mate.on.elevState = m => { el = m; };
mate.on.s = m => { off = m.time - Date.now(); };
await sleep(800);
const cabY = () => (el ? motionAt({ y0: el.m[0], y1: el.m[1], t0: el.m[2], tb: el.m[3] }, Date.now() + off).y : S[0]);
const ride = setInterval(() => mate.at([mid[0] + 0.35, cabY(), mid[1] - 0.3], Math.PI / 2), 30);
await lookAt([doorX, S[0], E.out.z2 + 0.8], E.call[0]);
await key('KeyE'); await sleep(14000); // (it comes down from wherever it is)
await lookAt([mid[0] - 0.3, S[0] + 0.01, mid[1] + 0.3], [E.panel.x, S[0] + E.panel.ys[1], E.panel.z]);
await key('KeyE');
await sleep(3800);
await lookAt([mid[0] - 0.35, (await myPos())[1], mid[1] + 0.35], [mid[0] + 0.35, (await myPos())[1] + 0.3, mid[1] - 0.3]);
await shot(P + '_mate.png'); // (his feet on the floor while it moves)
await sleep(2500);
clearInterval(ride);
mate.close();
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
