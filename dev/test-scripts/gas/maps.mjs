// Every map with the gas system in: the admin changes to each map in turn while a scripted player is on; a shot is
// fired on each; snapshots carry 'gs' only on the Mansion maps, and only once a pipe is holed (here: never).
import { player, admin, sleep } from '../mansion/client.mjs';
const G = new URL('../../../', import.meta.url).href;
const { MAP_IDS } = await import(G + 'shared/maps/index.js');
const c = await player('Mapper', 'T');
let gsSeen = 0;
c.on.s = m => { if (m.gs) gsSeen++; };
for (const id of MAP_IDS) {
  const r = await admin({ action: 'map', map: id });
  await sleep(1200); gsSeen = 0; await sleep(1300);
  c.at(c.p || [0, 0, 0], 0); await sleep(200);
  const o = [c.p[0], c.p[1] + 1.62, c.p[2]];
  c.send({ t: 'shoot', o, d: [0, 0, -1], w: 'glock', rt: 0 }); await sleep(800);
  console.log(id.padEnd(18), r.ok ? 'loaded' : JSON.stringify(r), '| snapshots with gs after the change:', gsSeen);
}
c.close(); process.exit(0);
