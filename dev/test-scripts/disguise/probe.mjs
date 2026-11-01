// Ground heights and lines of sight between the spots a test uses (MAP=aim_map by default).
import { ground, los, MAP_ID } from './lib.mjs';
const pts = JSON.parse(process.argv[2] || '[[0,0],[0,5],[8,8],[-15,20],[5,-10],[0,15],[-8,5]]');
console.log(MAP_ID);
for (const [x, z] of pts) console.log(x, z, 'ground', ground(x, z));
for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
  const a = [pts[i][0], ground(...pts[i]) + 1.6, pts[i][1]], b = [pts[j][0], ground(...pts[j]) + 1.2, pts[j][1]];
  console.log(JSON.stringify(pts[i]), '->', JSON.stringify(pts[j]), los(a, b) ? 'clear' : 'BLOCKED');
}
