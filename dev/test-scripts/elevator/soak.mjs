// node soak.mjs [secs] — run against a server with BOTS=4 (and DEBUG_TICK=1 for tick times): one scripted CT keeps
// sending the lift between the floors (from the landings' call buttons) while the bots play. Prints the rounds played,
// how often a bot was in the shaft and the longest it stayed there, and the lift's trips.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { player, sleep } from '../mansion/client.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const { MAPS } = await import(pathToFileURL(path.join(repo, 'shared/maps/index.js')).href);
const { inShaft } = await import(pathToFileURL(path.join(repo, 'shared/elevator.js')).href);
const E = MAPS[process.env.MAP || 'cs_mansion'].elevator, secs = +(process.argv[2] || 60);
const c = await player('Soak', 'CT');
let snaps = 0, inside = 0, trips = 0, lastY1 = null;
const since = new Map(), longest = { ms: 0 };
c.on.s = m => {
  snaps++;
  const t = Date.now();
  for (const q of m.pl) {
    if (q[0] === c.id) continue;
    const p = [q[1], q[2], q[3]];
    if (q[8] && inShaft(E, p)) { inside++; if (!since.has(q[0])) since.set(q[0], t); longest.ms = Math.max(longest.ms, t - since.get(q[0])); }
    else since.delete(q[0]);
  }
};
c.on.elevState = m => { if (m.m[1] !== lastY1 && m.m[0] !== m.m[1]) trips++; lastY1 = m.m[1]; };
c.id = c.log.find(m => m.t === 'welcome')?.id;
const doorX = (E.door.x1 + E.door.x2) / 2, t0 = Date.now();
for (let k = 0; Date.now() - t0 < secs * 1000; k++) {
  const s = k % 3, y = E.stops[s];
  c.at([doorX + 0.2, y, E.out.z2 + 0.8], 0);
  await sleep(200);
  c.send({ t: 'elevAim', a: 'c' + s }); await sleep(40);
  c.use(true); await sleep(80); c.use(false);
  await sleep(9000);
}
console.log(`snapshots ${snaps}; the lift made ${trips} trips; bots seen in the shaft in ${inside} snapshot rows, the longest ${(longest.ms / 1000).toFixed(1)} s`);
console.log('last messages:', c.got('msg').map(m => m.text).slice(-4).join(' | '));
c.close(); process.exit(0);
