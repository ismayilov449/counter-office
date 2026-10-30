// Step 8: the shed's trapdoor — opened from the ladder below it creaks open, closes again; from above too.
import { player, sleep } from './client.mjs';
const t = await player('Tee', 'T');
const ct = await player('Cee', 'CT');
await sleep(3000);
const t0 = Date.now(), ev = [];
const i = +(process.argv[2] || 3);
t.on.doors = m => ev.push([Date.now() - t0, m.creak ? 'creak' : m.open ? 'open' : m.blown ? 'blown' : 'closed', m.doors[i]]);
t.at([14.1, -1.0, 16.25], 0); await sleep(300);
t.use(true); await sleep(50); t.use(false); await sleep(1400);
t.use(true); await sleep(50); t.use(false); await sleep(400);
t.at([15.6, 0.2, 16.2], 0); await sleep(300);
t.use(true); await sleep(50); t.use(false); await sleep(1400);
console.log('events', JSON.stringify(ev));
console.log('msgs', t.got('msg').map(m => m.text).slice(-3).join(' | '));
t.close(); ct.close(); process.exit(0);
