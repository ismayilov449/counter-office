// The cat with bots playing (server: srv.sh MAP=cs_mansion BOTS=4 DEBUG_TICK=1, GAME_PORT 4060): one scripted T
// stands out in the street for SECS seconds (default 60) while 4 bots a side fight. Checks the cat is in every
// snapshot, on a floor, inside the map, and lists what it did and said (the bots' gunfire scares it). Read the server
// log afterwards for errors and [tick] times.
import { player, sleep, dist3 } from './catclient.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
const SECS = +(process.env.SECS || 60), PORT = +(process.env.GAME_PORT || 4060);
const map = MAPS[process.env.MAP || 'cs_mansion'], world = new CollisionWorld(map);
const c = await player('Watcher', 'T', PORT);
c.at([25.5, 0, -8], 0, 0);
let snaps = 0, withCat = 0, bad = 0, moved = 0, last = null;
const states = new Map();
c.ws.addEventListener('message', e => {
  let m; try { m = JSON.parse(e.data); } catch { return; }
  if (m.t !== 's') return;
  snaps++;
  if (!m.cat) return;
  withCat++;
  const p = m.cat.slice(0, 3), st = m.cat[4];
  states.set(st, (states.get(st) || 0) + 1);
  if (last) moved += dist3(p, last);
  last = p;
  const B = map.bounds;
  if (p[0] < B.min || p[0] > B.max || p[2] < B.min || p[2] > B.max) bad++;
  else if (st !== 7 && !world.raycast([p[0], p[1] + 0.15, p[2]], [0, -1, 0], 1.6, 'solid')) bad++;
});
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) { await sleep(1000); if (!c.alive) c.at([25.5, 0, -8], 0, 0); }
const STATE = ['sit', 'walk', 'trot', 'run', 'wash', 'stretch', 'hide', 'air', 'sleep', 'loaf'];
const said = {}; for (const m of c.meows) said[m.k] = (said[m.k] || 0) + 1;
console.log(`${SECS} s with bots: ${snaps} snapshots, ${withCat} with the cat, ${bad} off a floor or outside the map; it moved ${moved.toFixed(1)} m`);
console.log('states:', [...states].map(([k, v]) => `${STATE[k]} ${v}`).join(', '), '| said:', JSON.stringify(said), '| booms heard:', c.got('boom').length, '| kills:', c.got('kill').length);
const okAll = snaps > SECS * 20 && withCat === snaps && bad === 0;
console.log(okAll ? 'OK' : 'FAIL');
c.close();
process.exit(okAll ? 0 : 1);
