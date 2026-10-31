// Step 15 in the browser (Mansion, warmup). 1: a Terrorist buys the drone, takes out the remote (6), launches it
// (Mouse1) and flies it through its camera (grain, signal, battery), climbs, drops the bomb, dives into the ground.
// 2: the browser is a CT watching a scripted Terrorist fly a drone in front of him while crouching with the remote,
// and shoots it down. Screenshots in OUT, page errors printed.
import { open, sleep } from './game.mjs';
import { player } from './client.mjs';
let g = await open('T', 'Pilot', ['msg', 'droneStart', 'droneEnd', 'nade', 'boom', 'droneDown']);
let { tp, key, keyDown, keyUp, click, shot, msgs, errors, ev, send, look } = g;
await tp([2, 0, -18], Math.PI / 2); await sleep(400);
await key('KeyB'); await sleep(1500);
await shot('g15_buymenu.png');
await key('KeyB'); await sleep(300);
await send({ t: 'buy', item: 'drone' }); await sleep(400);
await key('Digit6'); await sleep(1200);
console.log('in hand:', await ev("document.getElementById('hud-weapon')?.textContent || document.querySelector('.weapon-name, #weapon-name')?.textContent || ''"));
await shot('g15_remote.png');
await click(0, 450); await sleep(900);
await shot('g15_launched.png');
await keyDown('Space'); await keyDown('KeyW'); await sleep(1500); await keyUp('Space'); await sleep(1200); await keyUp('KeyW'); await sleep(300);
await look(0, -0.5); await sleep(300);
await shot('g15_flying.png');
await click(0, 450); await sleep(2500); // the bomb
await shot('g15_bombed.png');
await click(2, 450); await sleep(2500); // dive
const m1 = await msgs();
console.log('pilot saw:', m1.map(m => m.t + (m.why ? ' ' + m.why : '') + (m.k ? ' ' + m.k : '') + (m.text ? ': ' + m.text : '')).join(' | '));
await shot('g15_after.png');
console.log('errors (pilot):', errors.length ? errors.slice(0, 5).join('\n') : 'none');

// ---- part 2: the browser is a CT; a scripted T flies a drone in front of him
g = await open('CT', 'Watcher', ['msg', 'droneDown', 'droneEnd']); // (the browser's Terrorist leaves first)
({ tp, key, click, shot, msgs, errors, ev, look } = g);
const pilot = await player('Flyer', 'T');
// (both teams now: the match starts; wait for the round to go live, buy in the house, go out onto the lawn)
for (let i = 0; i < 120 && !pilot.got('msg').some(m => /Guard the hostages/.test(m.text)); i++) await sleep(100);
await sleep(3400);
pilot.at([-10, 4.27, -5], 0); await sleep(200);
pilot.send({ t: 'buy', item: 'drone' }); await sleep(300);
pilot.at([-2, 0, -16], 0, 0, 1); await sleep(200);
const start = [-2, 0.86, -16.6];
pilot.send({ t: 'drone', launch: 1, p: start, yaw: 0 }); await sleep(200);
let dp = start;
for (let i = 1; i <= 30; i++) { dp = [-2 + i * 0.05, 0.86 + i * 0.07, -16.6 + i * 0.02]; pilot.send({ t: 'drone', p: dp, yaw: Math.PI / 2, pitch: -0.4 }); await sleep(50); }
// the CT stands 6 m east, looking at the drone
await tp([6, 0, -16], Math.PI / 2); await sleep(200);
const to = [dp[0] - 6, dp[1] - 1.62, dp[2] + 16], yaw = Math.atan2(-to[0], -to[2]), pitch = Math.atan2(to[1], Math.hypot(to[0], to[2]));
await tp([6, 0, -16], yaw, pitch); await sleep(200);
for (let i = 0; i < 12; i++) { pilot.send({ t: 'drone', p: dp, yaw: Math.PI / 2, pitch: -0.4 }); await sleep(60); } // (keep it alive, hovering)
await shot('g15_watch.png');
// and the pilot, crouching on the lawn with the remote
{
  const to = [-2 - 6, 0.6 - 1.62, -16 + 16], yaw = Math.atan2(-to[0], -to[2]), pitch = Math.atan2(to[1], Math.hypot(to[0], to[2]));
  await tp([6, 0, -16], yaw, pitch);
  for (let i = 0; i < 10; i++) { pilot.send({ t: 'drone', p: dp, yaw: Math.PI / 2, pitch: -0.4 }); await sleep(60); }
  await shot('g15_pilot.png');
  const to2 = [dp[0] - 6, dp[1] - 1.62, dp[2] + 16];
  await tp([6, 0, -16], Math.atan2(-to2[0], -to2[2]), Math.atan2(to2[1], Math.hypot(to2[0], to2[2])));
}
await key('Digit2'); await sleep(1500);
for (let i = 0; i < 6; i++) { pilot.send({ t: 'drone', p: dp, yaw: Math.PI / 2, pitch: -0.4 }); await sleep(60); }
await click(0, 450); await sleep(900);
console.log('CT saw:', (await msgs()).map(m => m.t + (m.text ? ': ' + m.text : '')).join(' | '));
console.log('pilot got:', pilot.got('droneEnd').map(m => m.why).join(','), '| msgs:', pilot.got('msg').map(m => m.text).slice(-6).join(' | '), '| inv', JSON.stringify(pilot.me?.inv?.drone), 'alive', pilot.me?.alive);
await shot('g15_shotdown.png');
console.log('errors (watcher):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
pilot.close();
process.exit(0);
