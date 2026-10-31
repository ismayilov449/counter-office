// Step 11 in the browser: a Terrorist (warmup) rolls up the garage door with E, gets into the car, drives it out onto
// the lawn and gets out; the kitchen's side door. Screenshots in OUT, page errors printed.
import { open, sleep } from './game.mjs';
const g = await open('T', 'Garage');
const { tp, key, keyDown, keyUp, shot, msgs, errors, ev } = g;
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
await tp([-12.5, 0, -17.9], Math.PI / 2); await sleep(800);
await shot('g11_closed.png');
await tp([-14.6, 0, -17.9], Math.PI / 2); await sleep(400);
console.log('hint at the door:', await hint());
await key('KeyE'); await sleep(900);
await shot('g11_rolling.png');
await sleep(1800);
await tp([-12.5, 0, -17.9], Math.PI / 2); await sleep(600);
await shot('g11_open.png');
console.log('doors:', (await msgs()).filter(m => m.t === 'doors').map(m => (m.creak ? 'creak' : m.open ? 'open' : 'closed') + ' ' + m.doors[6]).join(', '));
// get into the car (stand by its driver's door) and drive out
await tp([-19.75, 0, -19.5], Math.PI / 2); await sleep(400);
console.log('hint by the car:', await hint());
await key('KeyE'); await sleep(700);
console.log('in the car:', (await msgs()).filter(m => m.t === 'drive').length ? 'yes' : 'no');
await shot('g11_incar.png');
await keyDown('KeyW'); await sleep(1600); await keyUp('KeyW');
await sleep(1500);
await shot('g11_driven.png');
await key('KeyE'); await sleep(600);
const out = (await msgs()).filter(m => m.t === 'exited')[0];
console.log('got out at', out ? out.p.map(v => v.toFixed(1)).join(',') : 'none');
// the kitchen's side door, from the kitchen
await tp([-21.55, 0.82, -12.6], 0); await sleep(400);
console.log('hint in the kitchen:', await hint());
await key('KeyE'); await sleep(800);
await shot('g11_sidedoor.png');
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
process.exit(0);
