// The lift in the browser (MAP from the server: cs_mansion or cs_mansion_night; test server with BOTS=0
// START_MONEY=16000 ROUND_TIME=600, headless Edge on CDP_PORT — see dev/test-scripts/mansion/game.mjs). Screenshots in
// OUT (prefix PREFIX, default gel), the hints, the player's height every frame of the ride against the cabin's (from the
// 'state' messages the page sends and the server's elevState), the server's messages and page errors printed.
// Headless Edge draws one or two frames a second, and the page works out what E would do once a frame: so before each
// E the script waits for the hint that says the page has seen where we look.
//   0. a scripted T and CT join first (the game starts: everyone respawns), then the test begins in the live round.
//   1. the browser is a CT in the living room: the shaft; at the landing the call button's hint, E opens the doors; in,
//      the panel's hint, E sends it upstairs: the ride (on the cabin's floor every frame, ending on the upper floor), out.
//   2. back in, down towards the cellar; the T cuts the power on the way: dark, stuck (hint); the roof hatch (look up,
//      E): on the roof (the lid, the shaft, the ladder); pry the upper landing's doors (hold E: progress bar); climb out
//      (E). The CT brings the power back: the pried doors shut and the cabin goes on down.
//   3. riding with a scripted player standing in the cabin: he's drawn standing on its floor (not sunk, not floating).
import { open, sleep } from '../mansion/game.mjs';
import { player } from '../mansion/client.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const { MAPS } = await import(pathToFileURL(path.join(repo, 'shared/maps/index.js')).href);
const { motionAt, roofAt, doorAt } = await import(pathToFileURL(path.join(repo, 'shared/elevator.js')).href);
const P = process.env.PREFIX || 'gel';
const E = MAPS.cs_mansion.elevator, S = E.stops, doorX = (E.door.x1 + E.door.x2) / 2;
const mid = [(E.cabin.x1 + E.cabin.x2) / 2, (E.cabin.z1 + E.cabin.z2) / 2 - 0.1];
const fails = [];
const check = (what, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const g = await open('CT', 'Rider', ['msg', 'elevSfx', 'elevTo', 'lights']);
const { tp, key, keyDown, keyUp, shot, msgs, errors, ev, look } = g;
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
async function waitHint(re, ms = 6000) {
  const t0 = Date.now(); let h = '';
  while (Date.now() - t0 < ms) { h = await hint(); if (re.test(h)) return h; await sleep(150); }
  return h;
}
const progress = () => ev("(() => { const b = document.getElementById('progress'); return b && !b.classList.contains('hidden') ? document.getElementById('progress-label').textContent + ' ' + document.getElementById('progress-fill').style.width : ''; })()");
// every 'state' message the page sends (once a frame): [Date.now(), y]
await ev("window.__ys = []; if (!window.__stateWired) { window.__stateWired = true; const s0 = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.startsWith('{\"t\":\"state\"')) { window.__state = d; window.__ys.push([Date.now(), JSON.parse(d).p[1]]); if (window.__ys.length > 4000) window.__ys.shift(); } return s0.call(this, d); }; } 1");
const myPos = async () => JSON.parse((await ev('window.__state || "{}"')) || '{}').p;
// stand at p and look at q (yaw from the direction, pitch with the mouse)
async function lookAt(p, q) {
  const eye = [p[0], p[1] + 1.62, p[2]], d = q.map((v, k) => v - eye[k]);
  await tp(p, Math.atan2(-d[0], -d[2]));
  await sleep(300);
  await look(0, Math.asin(d[1] / Math.hypot(...d)));
  await sleep(400);
}

// ---- 0. the other two join: the game starts (everyone respawns after 3 s, then 3 s frozen)
// (Mate joins now too: someone joining a live round waits dead for the next one)
const t = await player('Cutter', 'T'), fixer = await player('Fixer', 'CT'), mate = await player('Mate', 'CT');
// the T watches the lift for the test: its state and the server's clock
let el = null, off = 0;
t.on.elevState = m => { el = m; };
t.on.s = m => { off = m.time - Date.now(); };
const cabY = (at = Date.now(), m = el) => (m ? motionAt({ y0: m.m[0], y1: m.m[1], t0: m.m[2], tb: m.m[3] }, at + off) : { y: S[1], moving: false });
const doorsOpen = k => el && doorAt(el.d[k], Date.now() + off) > 0.95;
async function waitLift(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(100); } return false; }
await sleep(8000);
await msgs();
const park = () => { t.at([-17.5, S[0], -6.5], 0); fixer.at([-17.5, S[0], -7.5], 0); mate.at([-16.5, S[0], -7.5], 0); }; // (the cellar, out of the way)
park();

// ---- 1. the shaft in the living room; call it, ride up, out
await tp([doorX + 2.6, 0.813, E.out.z2 + 4.2], Math.atan2(2.6, 4.2) , 0); await sleep(1500);
await shot(P + '_living.png'); // (the shaft standing out into the living room, its doors and call button)
const landing = [doorX + 0.2, 0.813, E.out.z2 + 0.8];
await lookAt(landing, E.call[1]);
const h1 = await waitHint(/call the lift/);
check('hint at the call button: ' + h1, /Press E to call the lift/.test(h1));
await shot(P + '_landing.png');
await key('KeyE');
check('the doors open at the ground floor', await waitLift(() => doorsOpen(0) && doorsOpen(2), 6000));
await sleep(600);
await shot(P + '_open.png');
const inCab = [mid[0], S[1] + 0.01, mid[1]];
await lookAt(inCab, [E.panel.x, S[1] + E.panel.ys[2], E.panel.z]);
const h2 = await waitHint(/upper floor/);
check('hint at the panel (upper floor): ' + h2, /Press E to go to the upper floor/.test(h2));
await shot(P + '_panel.png');
await lookAt(inCab, [(E.hatch.x1 + E.hatch.x2) / 2, S[1] + E.cabin.ceil, (E.hatch.z1 + E.hatch.z2) / 2]);
await sleep(800);
await shot(P + '_ceiling.png'); // (the hatch shut, the ceiling light)
await lookAt(inCab, [E.panel.x, S[1] + E.panel.ys[2], E.panel.z]);
await waitHint(/upper floor/);
await ev('window.__ys.length = 0, 1');
await key('KeyE');
check('it sets off', await waitLift(() => cabY().moving, 6000));
const rideEl = el; // (the trip's motion: the state after it arrives is another)
await sleep(2000);
await look(0.6, 0); await sleep(1200);
await shot(P + '_riding.png'); // (inside, on the way up)
await waitLift(() => !cabY().moving && Math.abs(cabY().y - S[2]) < 1e-3, 12000);
await sleep(800);
{
  const ys = JSON.parse(await ev('JSON.stringify(window.__ys)'));
  const moving = ys.filter(([at]) => cabY(at, rideEl).moving);
  const dev = moving.map(([at, yy]) => yy - cabY(at, rideEl).y);
  const worst = dev.reduce((a, d) => Math.max(a, Math.abs(d)), 0);
  console.log(`  ride: ${ys.length} frames sent, ${moving.length} while moving; our height minus the cabin floor's: worst ${worst.toFixed(3)} m`);
  console.log('  heights while moving:', moving.map(m => m[1].toFixed(2)).join(' '));
  check('on the cabin\'s floor every frame of the ride (within 3 cm)', moving.length > 2 && worst < 0.03);
  check('on the upper floor at the end', Math.abs(ys.at(-1)[1] - S[2]) < 0.02);
}
await shot(P + '_top.png');
await tp([doorX, S[2] + 0.01, E.cabin.z2 - 0.4], Math.PI); await sleep(500);
await keyDown('KeyW'); await sleep(2500); await keyUp('KeyW'); await sleep(500);
const out1 = await myPos();
check('walked out upstairs ' + JSON.stringify(out1), out1[2] > E.out.z2 + 0.2 && Math.abs(out1[1] - S[2]) < 0.05);
await tp([doorX + 0.6, S[2], E.out.z2 + 2.5], 0, -0.05); await sleep(1500);
await shot(P + '_upstairs.png'); // (the shaft built into the bookcase wall, its doors shutting)
console.log('messages (part 1):', (await msgs()).map(m => m.t + (m.s ? ' ' + m.s : '') + (m.text ? ': ' + m.text : '')).join(' | '));

// ---- 2. the blackout half way down; the hatch; out through the upper landing; the power back
await lookAt([doorX + 0.2, S[2], E.out.z2 + 0.8], E.call[2]);
await waitHint(/call the lift/);
await key('KeyE');
check('the doors open upstairs', await waitLift(() => doorsOpen(0) && doorsOpen(3), 6000));
await lookAt([mid[0], S[2] + 0.01, mid[1]], [E.panel.x, S[2] + E.panel.ys[0], E.panel.z]);
const h3 = await waitHint(/cellar/);
check('hint at the panel (cellar): ' + h3, /Press E to go to the cellar/.test(h3));
t.at([-18.3, S[0], -4.6], 0); await sleep(300);
await key('KeyE');
// (the doors first wait out their open time and shut: the T starts cutting (3 s) once it's on its way down)
await waitLift(() => cabY().moving, 8000);
t.use(true); await sleep(3300); t.use(false);
check('the power is cut and it stops between floors', await waitLift(() => el && !el.p && !cabY().moving, 4000) && S.every(s => Math.abs(cabY().y - s) > 0.05));
park();
await look(0, -0.4); await sleep(2500);
const h4 = await waitHint(/stuck in the dark|pry/);
check('hint stuck in the dark: ' + h4, /stuck in the dark|pry the doors/.test(h4));
await shot(P + '_dark.png');
const pos = await myPos();
console.log('  stuck at', pos, 'cabin at', cabY().y.toFixed(3));
await key('KeyF'); await sleep(1500);
await shot(P + '_dark_flashlight.png');
await lookAt(pos, [(E.hatch.x1 + E.hatch.x2) / 2, pos[1] + E.cabin.ceil, (E.hatch.z1 + E.hatch.z2) / 2]);
const h5 = await waitHint(/hatch/);
check('hint looking up: ' + h5, /climb out through the roof hatch/.test(h5));
await shot(P + '_hatch_shut.png');
await key('KeyE'); await sleep(1500);
const roof = await myPos();
check(`on the roof at ${JSON.stringify(roof)} (roof at ${roofAt(E, cabY().y).toFixed(3)})`, roof && Math.abs(roof[1] - roofAt(E, cabY().y)) < 0.05);
await look(0, -0.9); await sleep(1500);
await shot(P + '_dark_roof.png'); // (on the roof in the dark: the flashlight)
await look(0, 1.6); await sleep(1500);
await shot(P + '_dark_shaft.png');
await lookAt(roof, [doorX, S[2] + 1.0, E.shaft.z2]);
const h6 = await waitHint(/pry the landing/);
check('hint at the upper landing\'s doors: ' + h6, /pry the landing's doors/.test(h6));
await keyDown('KeyE'); await sleep(1600);
const pr = await progress();
console.log('  progress bar while prying:', JSON.stringify(pr));
await shot(P + '_prying.png');
await sleep(1900); await keyUp('KeyE');
check('the landing\'s doors give', await waitLift(() => doorsOpen(3), 4000));
await sleep(1200);
await shot(P + '_pried.png');
const h7 = await waitHint(/climb out/);
check('hint when they\'re open: ' + h7, /climb out of the shaft/.test(h7));
await key('KeyE'); await sleep(1500);
const out2 = await myPos();
check('climbed out upstairs ' + JSON.stringify(out2), out2 && Math.abs(out2[1] - S[2]) < 0.05 && out2[2] > E.shaft.z2);
fixer.at([-18.3, S[0], -4.6], 0); await sleep(300);
fixer.use(true); await sleep(5600); fixer.use(false);
park();
check('the power back: it goes on down to the cellar and opens', await waitLift(() => el && el.p && !cabY().moving && Math.abs(cabY().y - S[0]) < 1e-3 && doorsOpen(0), 15000));
console.log('messages (part 2):', (await msgs()).map(m => m.t + (m.s ? ' ' + m.s : '') + (m.lights ? ' power ' + m.lights.power : '') + (m.text ? ': ' + m.text : '')).join(' | '));

await key('KeyF'); // (the flashlight off again)

// ---- 3. riding with someone: he stands on the cabin's floor in our picture; then onto the roof with the power on
const ride = setInterval(() => mate.at([mid[0] + 0.35, cabY().y, mid[1] - 0.3], Math.PI / 2), 30);
await lookAt([doorX, S[0], E.out.z2 + 0.8], E.call[0]);
await waitHint(/call the lift|on its way/);
await key('KeyE');
await waitLift(() => !cabY().moving && Math.abs(cabY().y - S[0]) < 1e-3 && doorsOpen(0), 20000);
await lookAt([mid[0] - 0.3, S[0] + 0.01, mid[1] + 0.3], [E.panel.x, S[0] + E.panel.ys[1], E.panel.z]);
await waitHint(/ground floor/);
await key('KeyE');
await waitLift(() => cabY().moving, 6000);
await sleep(1000);
const me3 = await myPos();
await lookAt([mid[0] - 0.35, me3[1], mid[1] + 0.35], [mid[0] + 0.35, me3[1] + 0.4, mid[1] - 0.3]);
await shot(P + '_mate.png'); // (his feet on the floor while it moves)
console.log('  mate shot at cabin height', cabY().y.toFixed(2), 'moving', cabY().moving);
await waitLift(() => !cabY().moving, 8000);
await sleep(600);
await shot(P + '_mate_stopped.png');
clearInterval(ride);
park();
// in the cabin at the ground floor, by the east wall (the living room's light switch is just the other side)
const in3 = [E.cabin.x2 - 0.35, S[1] + 0.01, mid[1]];
await lookAt(in3, [E.cabin.x1, S[1] + 1.2, mid[1]]);
await sleep(1500);
const h8 = await hint();
check('no light switch through the cabin\'s wall (hint: ' + JSON.stringify(h8) + ')', !/switch the lights/.test(h8));
const hc = [(E.hatch.x1 + E.hatch.x2) / 2, S[1] + E.cabin.ceil, (E.hatch.z1 + E.hatch.z2) / 2];
await lookAt([mid[0], S[1] + 0.01, mid[1]], hc);
const h9 = await waitHint(/roof hatch/);
check('hint at the hatch (power on, ground floor): ' + h9, /climb out through the roof hatch/.test(h9));
await key('KeyE'); await sleep(1500);
const roof3 = await myPos(), r3 = roofAt(E, S[1]);
check(`on the roof ${JSON.stringify(roof3)} (roof at ${r3.toFixed(3)})`, roof3 && Math.abs(roof3[1] - r3) < 0.05);
await lookAt(roof3, [E.hatch.x1 + 0.15, r3 + 0.2, hc[2]]);
await sleep(1200);
await shot(P + '_roof_lid.png'); // (the hatch open, its lid standing up on the west edge)
await lookAt(roof3, [-21.4, r3 + 2.6, -3.95]);
await sleep(1200);
await shot(P + '_roof_up.png'); // (the shaft over the cabin, the ladder on its west wall)
await lookAt(roof3, [hc[0], r3, hc[2]]);
const h10 = await waitHint(/drop back/);
check('hint at the hatch from the roof: ' + h10, /drop back into the cabin/.test(h10));
await key('KeyE'); await sleep(1500);
const back = await myPos();
check('back in the cabin ' + JSON.stringify(back), back && Math.abs(back[1] - S[1]) < 0.02);
await lookAt([mid[0], S[1] + 0.01, mid[1]], hc);
await sleep(1200);
await shot(P + '_hatch_open.png'); // (looking up through the open hatch)
mate.close(); t.close(); fixer.close();
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
console.log(fails.length ? `FAILED: ${fails.length}\n  ` + fails.join('\n  ') : 'all checks passed');
process.exit(fails.length || errors.length ? 1 : 0);
