// Every map still starts with the cat in (server on GAME_PORT 4060, any MAP): the admin changes to each of the 7 maps
// in turn; a scripted player checks snapshots keep coming, with the `cat` key on the two Mansions only.
import { player, sleep, until } from './catclient.mjs';
import { MAPS } from '../../../shared/maps/index.js';
const PORT = +(process.env.GAME_PORT || 4060);
const admin = async action => (await fetch(`http://127.0.0.1:${PORT}/api/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'testpass', ...action }) })).json();
let fails = 0;
const c = await player('Mapper', 'CT', PORT);
let snaps = 0, catSnaps = 0;
c.ws.addEventListener('message', e => { try { const m = JSON.parse(e.data); if (m.t === 's') { snaps++; if (m.cat) catSnaps++; } } catch { /* */ } });
for (const id of Object.keys(MAPS)) {
  const r = await admin({ action: 'map', map: id });
  await sleep(2500);
  snaps = 0; catSnaps = 0;
  await sleep(2000);
  const want = id === 'cs_mansion' || id === 'cs_mansion_night';
  const good = !r.error && snaps > 20 && (want ? catSnaps === snaps : catSnaps === 0);
  console.log(`${good ? 'OK  ' : 'FAIL'} ${id.padEnd(17)} ${r.error || 'loaded'}: ${snaps} snapshots in 2 s, ${catSnaps} with the cat`);
  if (!good) fails++;
}
c.close();
console.log(fails ? `${fails} FAILED` : 'all 7 maps start');
process.exit(fails ? 1 : 0);
