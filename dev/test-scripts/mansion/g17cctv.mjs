// Step 17 in the browser (MAP from the server, cs_mansion or cs_mansion_night). 1: a Terrorist at the security desk
// (the hint, the monitors), E sits him down: CAM 1, 2 (turned with the mouse), 3, 4, Mouse 1 back round to CAM 1; Esc
// gets him up. A scripted CT shoots CAM 2: NO SIGNAL on it. A scripted T cuts the power: NO POWER, black monitors.
// 2: the browser is a CT: a scripted T sits at the desk (seen from the doorway), and the camera on the front of the
// house seen from the lawn. Screenshots in OUT (PREFIX, default g17), hints and page errors printed.
import { open, sleep } from './game.mjs';
import { player, admin } from './client.mjs';
const P = process.env.PREFIX || 'g17';
let g = await open('T', 'Guard', ['msg', 'cctv', 'gadgets', 'lights']);
let { tp, key, click, shot, msgs, errors, ev, look, mouse } = g;
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
const desk = [-10.0, 4.27, -12.0];
await tp(desk, 0, -0.25); await sleep(1500);
console.log('hint at the desk:', await hint());
await shot(P + '_desk.png');
await key('KeyE'); await sleep(1500);
console.log('hint watching:', await hint());
await shot(P + '_cam1.png');
await key('Digit2'); await sleep(1500);
await shot(P + '_cam2.png');
await mouse('mousemove', { movementX: -250, movementY: 60 }); await sleep(1200);
await shot(P + '_cam2turned.png');
await key('Digit3'); await sleep(1500);
await shot(P + '_cam3.png');
await key('Digit4'); await sleep(1500);
await shot(P + '_cam4.png');
await click(0, 100); await sleep(1200);
console.log('after Mouse 1 from CAM 4:', await hint());
await key('Escape'); await sleep(800);
console.log('after Esc:', await hint(), '| messages:', (await msgs()).filter(m => m.t === 'cctv').map(m => (m.on ? 'on' : 'off ' + m.why)).join(', '));
await shot(P + '_up.png');

// ---- a scripted CT shoots CAM 2 (the lawn) from the lawn; the T watches it: NO SIGNAL
const ct = await player('Shooter', 'CT'), t2 = await player('Cutter', 'T');
let phase = '';
ct.on.s = m => { phase = m.ph; };
await sleep(500);
await admin({ action: 'restart' });
await sleep(1500);
for (let i = 0; i < 150 && phase !== 'live'; i++) await sleep(100);
await sleep(300);
await tp(desk, 0, -0.25); await sleep(500);
const eye = [9, 1.62, 1], cam = [-6.3, 6.35, 1.0], d = cam.map((v, k) => v - eye[k]), l = Math.hypot(...d);
ct.at([9, 0, 1], Math.PI / 2); await sleep(300);
ct.send({ t: 'shoot', o: eye, d: d.map(v => v / l), w: 'usp' }); await sleep(500);
console.log('CT got:', ct.got('msg').map(m => m.text).filter(t => /Camera/.test(t)).join(' | '));
await key('KeyE'); await sleep(1000);
await key('Digit2'); await sleep(1500);
await shot(P + '_nosignal.png');
await key('Digit1'); await sleep(800);
// a scripted T cuts the power at the fuse box
t2.at([-18.3, -2.2, -4.6], 0); await sleep(300);
t2.use(true); await sleep(3400); t2.use(false); await sleep(1500);
await shot(P + '_nopower.png');
await key('Escape'); await sleep(800);
await tp(desk, 0, -0.25); await sleep(1200);
await shot(P + '_deskdark.png');
console.log('errors (guard):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
t2.close();

// ---- part 2: the browser is a CT; a scripted T sits at the desk
g = await open('CT', 'Visitor', ['msg', 'gadgets']);
({ tp, key, click, shot, msgs, errors, ev, look, mouse } = g);
const t3 = await player('Sitter', 'T');
phase = '';
t3.on.s = m => { phase = m.ph; };
await sleep(500);
await admin({ action: 'restart' });
await sleep(1500);
for (let i = 0; i < 150 && phase !== 'live'; i++) await sleep(100);
await sleep(300);
t3.at(desk, 0); await sleep(300);
t3.use(true); await sleep(80); t3.use(false); await sleep(500);
await tp([-12.3, 4.27, -9.2], Math.atan2(-2.3, 3.55), -0.3); await sleep(1500);
await shot(P + '_sitting.png');
await tp([12.0, 0, 1.0], Math.PI / 2, 0.255); await sleep(1500);
await shot(P + '_camlawn.png');
console.log('errors (visitor):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
ct.close(); t3.close();
process.exit(0);
