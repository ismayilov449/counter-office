// Bots on a hostage map: keeps one scripted Terrorist parked at a spawn for N seconds (default 60) on the GAME_PORT
// server (started with BOTS=4, so 4 CT bots go for the hostages), then prints how often a bot started leading a hostage,
// how many were rescued or killed, and how the rounds ended. Check the server's log for errors afterwards.
//   node dev/test-scripts/hostages/botsoak.mjs [seconds]
import { player, sleep } from '../mansion/client.mjs';
const secs = +(process.argv[2] || 60);
const c = await player('Soak', 'T');
const state = new Map();
let follows = 0, snaps = 0;
c.on.s = m => {
  snaps++;
  for (const h of m.hs || []) {
    if (h[5] === 1 && state.get(h[0]) !== 1) follows++;
    state.set(h[0], h[5]);
  }
};
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  if (c.me?.alive === false || !c.p) { await sleep(500); continue; }
  await sleep(500);
}
const rescues = c.got('sfx').filter(m => m.s === 'rescue').length, killed = c.got('hostageKilled').length;
const rounds = c.got('roundEnd').map(m => `${m.winner}: ${m.reason}`);
console.log(`${secs} s, ${snaps} snapshots: a bot started leading a hostage ${follows} times, ${rescues} rescued, ${killed} killed`);
console.log(`rounds: ${rounds.join(' | ') || '-'}`);
c.close(); process.exit(0);
