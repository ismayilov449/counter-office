// Walls & water with bots (run srv.sh BOTS=4 DEBUG_TICK=1 [MAP=cs_mansion_night] first): one scripted player on the
// server for N seconds (default 60) so the bots play; counts their shots, kills, the bullets that went through walls
// (worked out from the 'shot' messages with the shared code, as a browser does), and whether pipes or cables got hit
// (`wa` in the snapshot). Then check the server log for errors and the tick times.
//   GAME_PORT=4220 node dev/test-scripts/walls/soak.mjs [secs] [map id for the trace]
import { player, sleep } from '../mansion/client.mjs';
import { MAPS } from '../../../shared/maps/index.js';
import { CollisionWorld } from '../../../shared/collision.js';
import { penetrate } from '../../../shared/walls.js';

const secs = +(process.argv[2] || 60), map = MAPS[process.argv[3] || 'cs_mansion'], world = new CollisionWorld(map);
const c = await player('Soak', 'CT');
let snaps = 0, shots = 0, through = 0, kills = 0, waSeen = 0, rounds = 0;
c.on.s = m => { snaps++; if (m.wa) waSeen++; };
c.on.kill = () => kills++;
c.on.round = () => rounds++;
c.on.shot = m => {
  shots++;
  for (const [dx, dy, dz, e] of m.tr || []) {
    const l = Math.hypot(dx, dy, dz) || 1, r = penetrate(map, world, m.o, [dx / l, dy / l, dz / l], e + 0.02, m.w);
    if (r.passes.some(p => p.t1 <= e)) through++;
  }
};
const push = c.log.push.bind(c.log);
c.log.push = m => (m.t === 's' || m.t === 'shot' ? 0 : push(m));
await sleep(secs * 1000);
console.log(`${secs} s: snapshots ${snaps}, bot shots ${shots} (${through} bullets through a wall), kills ${kills}, rounds ${rounds}, snapshots with wa ${waSeen}`);
c.close();
process.exit(0);
