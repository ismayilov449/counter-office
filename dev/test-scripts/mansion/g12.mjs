// Step 12 in the browser: a CT (warmup) goes through the gap in the street wall to the neighbour's front door (E),
// stands at the bedroom window looking at the mansion, and shoots the glass out. Screenshots in OUT, errors printed.
import { open, sleep } from './game.mjs';
const g = await open('CT', 'Neighbour', ['msg', 'doors', 'glass']);
const { tp, key, click, shot, msgs, errors, ev } = g;
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
await tp([27.0, 0, -7.0], -Math.PI / 2); await sleep(700);
await shot('g12_street.png');
await tp([31.3, 0, -7.0], -Math.PI / 2); await sleep(400);
console.log('hint at the front door:', await hint());
await key('KeyE'); await sleep(900);
console.log('door:', (await msgs()).filter(m => m.t === 'doors').map(m => (m.open ? 'open ' : 'closed ') + m.doors[8]).join(', '));
await shot('g12_door.png');
// upstairs at the window, looking west at the mansion
await tp([33.3, 3.2, -7.0], Math.PI / 2); await sleep(800);
await shot('g12_window.png');
await key('Digit2'); await sleep(1500); // the pistol, and wait out the draw
await click(0, 120); await sleep(700);
const glass = (await msgs()).filter(m => m.t === 'glass');
console.log('glass broken:', JSON.stringify(glass.map(m => m.ids)));
await shot('g12_shot.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
