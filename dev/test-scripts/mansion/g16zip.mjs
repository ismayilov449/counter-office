// Step 16 in the browser (MAP from the server, cs_mansion or cs_mansion_night). 1: a CT on the deck on the neighbour's
// roof (the hint), E hooks on, the ride down (looking ahead, looking up at the trolley), dropping off on the terrace.
// 2: the browser is a Terrorist on the terrace: a scripted CT hooks on there and climbs away up the cable (screenshots
// of the body hanging under the trolley), then the T holds E at the tensioner and cuts the cable: the CT falls (the
// loose ends). Screenshots in OUT, the hints and page errors printed.
import { open, sleep } from './game.mjs';
import { player, admin } from './client.mjs';
const P = process.env.PREFIX || 'g16';
let g = await open('CT', 'Rider', ['msg', 'zip', 'zipEnd', 'gadgets', 'sfx']);
let { tp, key, keyDown, keyUp, shot, msgs, errors, ev, look } = g;
const hint = () => ev("document.getElementById('hint')?.textContent || ''");
await tp([34.1, 7.0, -8.0], Math.PI / 2); await sleep(800);
console.log('hint on the deck:', await hint());
await shot(P + '_deck.png');
await key('KeyE'); await sleep(1200);
console.log('hint riding:', await hint());
await shot(P + '_ride1.png');
await sleep(1200);
await look(0, 1.2); await sleep(300);
await shot(P + '_rideup.png'); // (the trolley over our head)
await look(0, -1.2); await sleep(1500);
await shot(P + '_ride2.png');
await sleep(3500);
const m1 = await msgs();
console.log('rider got:', m1.filter(m => m.t !== 'sfx').map(m => m.t + (m.why ? ' ' + m.why : '') + (m.dir ? ' dir ' + m.dir : '') + (m.text ? ': ' + m.text : '')).join(' | '));
await sleep(800);
await shot(P + '_terrace.png');
console.log('hint on the terrace:', await hint());
console.log('errors (rider):', errors.length ? errors.slice(0, 5).join('\n') : 'none');

// ---- part 2: a Terrorist on the terrace; a scripted CT rides down towards him
g = await open('T', 'Cutter', ['msg', 'gadgets', 'sfx']);
({ tp, key, keyDown, keyUp, shot, msgs, errors, ev, look } = g);
const ct = await player('Rider2', 'CT');
// (a fresh match, so both are alive in a live round)
let phase = '';
ct.on.s = m => { phase = m.ph; };
await sleep(500);
await admin({ action: 'restart' });
await sleep(1500);
for (let i = 0; i < 150 && phase !== 'live'; i++) await sleep(100);
await sleep(300);
await tp([-5.4, 4.27, -8.0], -Math.PI / 2, 0.3); await sleep(300);
ct.at([-4.5, 4.27, -8.0], Math.PI / 2); await sleep(400);
ct.use(true); await sleep(80); ct.use(false);
await sleep(1500);
await shot(P + '_watch1.png');
await sleep(1500);
await look(0, -0.15); await sleep(300);
await shot(P + '_watch2.png');
// at the tensioner: hold E for 3 s
await tp([-5.4, 4.27, -8.0], Math.PI / 2, -0.2); await sleep(500);
console.log('hint at the tensioner:', await hint());
await keyDown('KeyE'); await sleep(1500);
await shot(P + '_cutting.png');
await sleep(1900); await keyUp('KeyE'); await sleep(600);
const m2 = await msgs();
console.log('T got:', m2.map(m => m.t + (m.s ? ' ' + m.s : '') + (m.zipCut != null ? ' cut ' + m.zipCut : '') + (m.text ? ': ' + m.text : '')).join(' | '));
console.log('the CT got:', ct.got('zipEnd').map(m => m.why).join(','));
await tp([-4.0, 4.27, -6.0], -Math.PI / 2 - 0.3, 0.25); await sleep(500);
await shot(P + '_cut.png');
await tp([-3.9, 4.27, -7.0], Math.PI / 2 + 0.2, 0.25); await sleep(500);
await shot(P + '_cutpole.png');
console.log('hint at the stand after:', await (async () => { await tp([-4.5, 4.27, -8.0], -Math.PI / 2); await sleep(300); return hint(); })());
console.log('errors (cutter):', errors.length ? errors.slice(0, 5).join('\n') : 'none');
ct.close();
process.exit(0);
