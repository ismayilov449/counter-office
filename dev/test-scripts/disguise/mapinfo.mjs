// Prints spawns, zones and bounds of a few maps (helper for picking test spots).
import { MAPS } from '../../../shared/maps/index.js';
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['de_dust2', 'aim_map']) {
  const m = MAPS[id];
  console.log(id, 'bounds', JSON.stringify(m.bounds));
  console.log(' T', JSON.stringify(m.spawns.T.slice(0, 4).map(s => s.p)));
  console.log(' CT', JSON.stringify(m.spawns.CT.slice(0, 4).map(s => s.p)));
  console.log(' zones', JSON.stringify(m.zones));
}
