// Step 15: the drone's battery runs out after DRONE.battery seconds (40) and it falls (warmup, a T alone).
import { player, sleep } from './client.mjs';
const t = await player('Battery', 'T');
await sleep(500);
const t0 = Date.now();
t.on.droneEnd = m => console.log(((Date.now() - t0) / 1000).toFixed(1), 's: droneEnd', m.why);
t.on.droneDown = m => console.log(((Date.now() - t0) / 1000).toFixed(1), 's: droneDown');
t.at([-6, 0, -18], Math.PI / 2, 0, 1); await sleep(300);
t.send({ t: 'buy', item: 'drone' }); await sleep(300);
t.send({ t: 'drone', launch: 1, p: [-6.6, 0.86, -18], yaw: Math.PI / 2 });
for (let i = 0; i < 44 * 20 && !t.got('droneEnd').length; i++) { t.send({ t: 'drone', p: [-6.6, 3, -18], yaw: Math.PI / 2, pitch: 0 }); await sleep(50); }
await sleep(1500);
t.close(); process.exit(0);
