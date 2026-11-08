// Every map starts with the power feature in (srv.sh, BOTS=0): the admin changes to each map in turn while a scripted
// player is on. On the two Mansion maps a fresh 'power' state comes with the change (and the lamps' 'dead' list); on the
// others no 'power' message and no 'dead' list; snapshots keep coming everywhere. Then back to the Mansion.
import { player, admin, sleep } from '../mansion/client.mjs';
const G = new URL('../../../', import.meta.url).href;
const { MAP_IDS, MAPS } = await import(G + 'shared/maps/index.js');
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const c = await player('Mapper', 'T');
let snaps = 0;
c.on.s = () => { snaps++; };
for (const id of [...MAP_IDS.filter(i => i !== 'cs_mansion'), 'cs_mansion']) {
  c.clear();
  const r = await admin({ action: 'map', map: id });
  await sleep(2500);
  snaps = 0;
  await sleep(1000);
  const pw = c.got('power').pop(), world = c.got('world').pop() || c.got('welcome').pop();
  const mansion = !!MAPS[id].power;
  ok(`${id.padEnd(17)} loaded (${r.ok ? 'ok' : JSON.stringify(r)}), ${snaps} snapshots a second, ${mansion ? `power state ${JSON.stringify(pw && { b: pw.b, g: pw.g[0], cut: pw.cut })}` : 'no power state'}`,
    r.ok && snaps > 20 && (mansion ? pw && pw.b.every(v => v === 1) && pw.cut === 0 && pw.main === 1 && Array.isArray(world?.lights?.dead) : !pw && !world?.lights?.dead));
}
c.close();
process.exit(process.exitCode || 0);
