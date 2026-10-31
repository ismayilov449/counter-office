// Step 11: the garage. The roller door rolls up slowly (E) and comes down again, won't come down on someone, the car
// inside can be driven, and an HE grenade by the door tears it out and breaks some of the garage. Warmup (one T only).
import { player, sleep } from './client.mjs';
const t = await player('Tee', 'T');
await sleep(1500);
const t0 = Date.now(), ev = [];
const i = 6; // the roller door
t.on.doors = m => { if (m.i === i) ev.push([Date.now() - t0, m.creak ? 'creak ' + m.creak : m.open ? 'open' : m.blown ? 'blown' : 'closed', m.doors[i]]); };
const use = async () => { t.use(true); await sleep(60); t.use(false); await sleep(150); };
// outside the door, on the lawn
t.at([-14.6, 0, -17.9], -Math.PI / 2); await sleep(300);
await use(); await sleep(2400);
await use(); await sleep(300);
// open it again, then stand in the doorway and try to close it
await use(); await sleep(2300);
t.at([-15.72, 0, -17.9], -Math.PI / 2); await sleep(300);
await use(); await sleep(300);
console.log('door events', JSON.stringify(ev));
console.log('msgs', t.got('msg').map(m => m.text).slice(-2).join(' | '));
// the car: walk in and get in behind the wheel, then out
t.at([-19.75, 0, -16.2], 0); await sleep(300);
t.clear();
await use(); await sleep(300);
console.log('car:', JSON.stringify(t.got('drive')));
await use(); await sleep(300);
console.log('out:', JSON.stringify(t.got('exited')));
// close the door from inside, then throw an HE grenade against it from the lawn
t.at([-16.6, 0, -17.4], 0); await sleep(300);
await use(); await sleep(400);
t.send({ t: 'buy', item: 'he' }); await sleep(300);
t.at([-13.0, 0, -17.9], Math.PI / 2); await sleep(300);
t.clear();
t.send({ t: 'nade', k: 'he', o: [-13.0, 1.6, -17.9], v: [-4, 1, 0] }); await sleep(2600);
const brk = t.got('brk').flatMap(m => m.ids);
console.log('after the HE: door events', JSON.stringify(ev.slice(-2)), 'pieces broken', brk.length, 'boom', t.got('boom').length);
console.log('state of the doors', JSON.stringify(t.got('doors').slice(-1)[0]?.doors));
console.log('booms', JSON.stringify(t.got('boom').map(b => b.p)));
t.close(); process.exit(0);
