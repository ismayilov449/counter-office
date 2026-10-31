// Step 14 in the browser, on cs_mansion_night (start the test server with MAP=cs_mansion_night): a Terrorist at the
// spawn upstairs, on the lawn, with the flashlight, with nightvision; then cuts the power at the fuse box and looks
// out over the dark estate. Screenshots in OUT, page errors printed.
import { open, sleep } from './game.mjs';
const g = await open('T', 'Night', ['msg', 'lights']);
const { tp, key, keyDown, keyUp, shot, msgs, errors, ev, send } = g;
console.log('map:', await ev("document.querySelector('#radar-name, .radar-name, #map-name')?.textContent || ''"));
await sleep(500);
await shot('g14_spawn.png');
await tp([3.0, 0, -8.0], Math.PI / 2 + 0.3); await sleep(700);
await shot('g14_lawn.png');
await key('KeyF'); await sleep(500);
await shot('g14_flashlight.png');
await key('KeyF'); await sleep(200);
await send({ t: 'buy', item: 'nvg' }); await sleep(400);
await key('KeyN'); await sleep(600);
await shot('g14_nvg.png');
await key('KeyN'); await sleep(200);
// the fuse box in the cellar (warmup: the lever works): hold E for 3 s
await tp([-18.3, -2.2, -4.4], 0); await sleep(400);
await keyDown('KeyE'); await sleep(3400); await keyUp('KeyE'); await sleep(500);
console.log('lights:', JSON.stringify((await msgs()).filter(m => m.t === 'lights').map(m => [m.power, m.lights.estate, m.lights.lampa5])));
await tp([3.0, 0, -8.0], Math.PI / 2 + 0.3); await sleep(700);
await shot('g14_blackout.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
