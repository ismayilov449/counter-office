// Bots and gas (server started with BOTS=4, Mansion): one scripted CT stays for N seconds (default 60); in every live
// round it holes both pipes (kitchen and cellar), then waits on the lawn while the bots play in the gas. Prints the
// gas events seen. The server's log should show no errors.
import { player, sleep } from '../mansion/client.mjs';
const secs = +(process.argv[2] || 60);
const c = await player('Soak', 'CT');
let round = 0, holed = 0, gs = null;
const ev = { gasLeak: 0, gasBoom: 0, gasCough: 0, gasKills: 0 };
c.on.round = () => { round++; holed = 0; };
c.on.s = m => { gs = m.gs || null; };
for (const k of ['gasLeak', 'gasBoom', 'gasCough']) c.on[k] = () => ev[k]++;
c.on.kill = m => { if (m.w === 'gas') ev.gasKills++; };
const shootAt = (from, at) => { const o = [from[0], from[1] + 1.62, from[2]], d = at.map((v, i) => v - o[i]), l = Math.hypot(...d); c.send({ t: 'shoot', o, d: d.map(v => v / l), w: 'usp', rt: 0 }); };
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  if (c.alive && holed < round && Date.now() - t0 > 4000) {
    holed = round;
    c.at([-17.5, 0.81, -11.5], 0); await sleep(300);
    shootAt([-17.5, 0.81, -11.5], [-16.6, 1.5, -13.92]); await sleep(500);
    c.at([-16.5, -2.2, 2.15], Math.PI / 2); await sleep(300);
    shootAt([-16.5, -2.2, 2.15], [-13.405, -0.22, 2.15]); await sleep(500);
    c.at([-6, 0, 18], 0);
  }
  await sleep(500);
}
console.log('rounds', round, 'gas events', JSON.stringify(ev), 'last gs', JSON.stringify(gs));
c.close(); process.exit(0);
