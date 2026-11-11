// Helpers for the explosives tests (GAME_PORT=3995 MAP=cs_mansion BOTS=0 START_MONEY=16000 FREEZE_TIME=1): the disguise
// tests' scripted players (crouch, snapshots, shooting) plus waiting for a live round and buying at spawn.
import { player, sleep, until, checker, yawTo, spot, los, admin } from '../disguise/lib.mjs';
export { player, sleep, until, checker, yawTo, spot, los, admin };

// Wait for a fresh live round (round messages), then a moment for the spawn.
export async function nextLive(cs, state) {
  const want = (state.round || 0) + 1;
  await until(() => state.rounds.some(n => n >= want), 90000, 100);
  state.round = Math.max(...state.rounds);
  await until(() => cs[0].snap?.ph === 'live' || cs[0].snap?.ph === 'freeze', 10000, 50);
  await sleep(300);
  for (const c of cs) c.clear();
}
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const got = (c, t, f = () => true) => c.log.filter(m => m.t === t && f(m));
