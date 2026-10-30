// Step 5: the kitchen back door creaks open slowly, and gunfire breaks it.
import { player, sleep } from './client.mjs';
const t = await player('Tee', 'T');
const ct = await player('Cee', 'CT');
await sleep(3000);
console.log('T alive', t.alive, 'at', t.p, 'CT alive', ct.alive);
t.at([-22.6, 0.81, -8.7], Math.PI / 2);
await sleep(300);
t.clear();
const t0 = Date.now();
const times = [];
t.on.doors = m => times.push([Date.now() - t0, m.creak ? 'creak' : m.open ? 'open' : m.blown ? 'blown' : 'closed', m.doors[2]]);
t.use(true); await sleep(50); t.use(false);
await sleep(2200);
console.log('door events:', JSON.stringify(times));
// close it again (instantly), then shoot it with the pistol
t.use(true); await sleep(50); t.use(false);
await sleep(300);
console.log('after closing:', JSON.stringify(times.slice(-1)), t.got('msg').map(m => m.text).join('|'), JSON.stringify(t.p));
const w = t.me?.inv?.pistol?.id || 'glock';
console.log('inventory', JSON.stringify(t.me?.inv));
t.w = w;
t.at([-21.0, 0.81, -8.7], Math.PI / 2);
await sleep(200);
for (let i = 0; i < 16; i++) {
  t.send({ t: 'shoot', w, o: [-21.0, 0.81 + 1.62, -8.7], d: [-1, -0.2, 0].map(v => v / Math.hypot(1, 0.2)), rt: Date.now() });
  await sleep(220);
}
await sleep(300);
console.log('after shooting:', JSON.stringify(times.slice(-2)));
console.log('msgs', t.got('msg').map(m => m.text).join(' | '));
t.close(); ct.close();
process.exit(0);
