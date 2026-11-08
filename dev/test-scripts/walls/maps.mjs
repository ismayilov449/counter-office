// Every map with the walls feature in (run srv.sh first): the admin changes to each map in turn while a scripted player
// is on; on each a few shots are fired in every direction (through whatever walls there are) and the snapshots are
// watched for `wa` (only the Mansion maps can have it, and only once a pipe or cable is hit: here, never). Then check
// the server log for errors.   GAME_PORT=4220 node dev/test-scripts/walls/maps.mjs
import { player, admin, sleep } from '../mansion/client.mjs';
import { MAP_IDS } from '../../../shared/maps/index.js';

const c = await player('Mapper', 'T');
let waSeen = 0, snaps = 0, fails = 0;
c.on.s = () => { snaps++; };
const push = c.log.push.bind(c.log);
c.log.push = m => { if (m.t === 's' && m.wa) waSeen++; return m.t === 's' ? 0 : push(m); };
for (const id of MAP_IDS) {
  const r = await admin({ action: 'map', map: id });
  await sleep(1500);
  waSeen = 0; snaps = 0;
  await sleep(1200);
  c.at(c.p || [0, 0, 0], 0);
  await sleep(200);
  const o = [c.p[0], c.p[1] + 1.62, c.p[2]];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.send({ t: 'shoot', o, d: [Math.cos(a), 0, Math.sin(a)], w: 'glock' }); await sleep(220); }
  const ok = r.ok && snaps > 20 && waSeen === 0;
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + id.padEnd(18), r.ok ? 'loaded' : JSON.stringify(r), `| ${snaps} snapshots, ${waSeen} with wa`);
}
await admin({ action: 'map', map: 'cs_mansion' });
c.close();
process.exit(fails ? 1 : 0);
