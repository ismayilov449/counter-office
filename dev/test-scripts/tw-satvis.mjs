// Satchel visuals: held bag, thrown onto the floor a few metres ahead, the phone in hand; then a CT's view of it
// isn't possible here, so just the thrower's. Warmup (one player).
import { open, sleep } from './tw-lib.mjs';
const { ev, send, msgs, click, key, shot, errors, mouse } = await open('T', 'Viewer');
await send({ t: 'buy', item: 'satchel' }); await sleep(500);
await key('Digit6'); await sleep(1000);
await shot('vis-hold.png');
await mouse('mousemove', { movementX: 0, movementY: 120 }); await sleep(200);
await click(0, 900); await sleep(1500);
console.log('holding', await ev("document.getElementById('weapon-name').textContent"), 'list', JSON.stringify((await msgs(false)).filter(m => m.t === 'satchels').pop()?.list));
await shot('vis-phone.png');
await sleep(600);
await shot('vis-phone2.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
