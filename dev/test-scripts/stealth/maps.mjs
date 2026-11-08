// Every map still starts with stealth in (server on GAME_PORT, default 4240, BOTS=0): the admin changes to each map
// in turn while a scripted player is on; on each, snapshots keep coming in, the player uses E (nothing of ours fires
// off the Mansion maps) and there's no `st` key unless something stealthy happens. Check the server log for errors.
import { player, admin, sleep } from '../mansion/client.mjs';
import { MAP_IDS } from '../../../shared/maps/index.js';
const PORT = +(process.env.GAME_PORT || 4240);
const c = await player('Mapper', 'T', PORT);
let snaps = 0, st = 0, map = null;
c.on.s = m => { snaps++; if (m.st) st++; };
c.on.welcome = m => { map = m.map; };
c.on.map = m => { map = m.map?.id || m.id || m.map; };
let bad = 0;
for (const id of MAP_IDS) {
  const r = await admin({ action: 'map', map: id }, PORT);
  await sleep(2500);
  snaps = 0; st = 0;
  c.at(c.p || [0, 0, 0], 0);
  c.use(true); await sleep(150); c.use(false);
  await sleep(1200);
  const ok = !r.error && snaps > 20 && st === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: ${r.error || 'loaded'}, ${snaps} snapshots in 1.35 s, st ${st}`);
}
c.close();
console.log(bad ? `${bad} FAILED` : `all ${MAP_IDS.length} maps ok`);
process.exit(bad ? 1 : 0);
