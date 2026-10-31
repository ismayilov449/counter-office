import dusty from './dust.js';
import mansion from './mansion.js';
import dust2 from './dust2.js';
import aim from './aim.js';
import inferno from './inferno.js';
import assault from './assault.js';
import mansionNight from './mansion_night.js';

export const MAPS = { [dusty.id]: dusty, [dust2.id]: dust2, [mansion.id]: mansion, [aim.id]: aim, [inferno.id]: inferno, [assault.id]: assault, [mansionNight.id]: mansionNight };
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = dusty.id;

// Zones only count above ground (not in the tunnels).
function inRect(z, p) {
  return p[1] > -1.5 && p[0] >= z.min[0] && p[0] <= z.max[0] && p[2] >= z.min[1] && p[2] <= z.max[1];
}

export function siteAt(map, p) {
  if (map.zones.A && inRect(map.zones.A, p)) return 'A';
  if (map.zones.B && inRect(map.zones.B, p)) return 'B';
  return null;
}

export function inRescueZone(map, p) {
  return !!map.zones.rescue && inRect(map.zones.rescue, p);
}

export const mapMode = map => map.mode || 'bomb';

export function inBuyZone(map, team, p) {
  return inRect(team === 'CT' ? map.zones.buyCT : map.zones.buyT, p);
}
