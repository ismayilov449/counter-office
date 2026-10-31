// Bots and blood trails: one scripted player on the server for N seconds (default 60) so the bots play (start the
// server with BOTS=4), recording the snapshots' `bl`. Checks: the bots bleed when hurt, every row is a player in the
// snapshot with a level 1..3, no bot ever bandages (flag 1), the snapshots kept coming. Then look at the server log.
//   GAME_PORT=4020 node dev/test-scripts/blood/soak.mjs [secs] [team]
import { player, sleep } from '../mansion/client.mjs';
const ok = (what, cond) => { console.log((cond ? 'OK   ' : 'FAIL ') + what); if (!cond) process.exitCode = 1; };
const secs = +(process.argv[2] || 60);
const c = await player('Soak', process.argv[3] || 'CT');
const myId = c.log.find(m => m.t === 'welcome')?.id;
let snaps = 0, withBl = 0, bad = 0, bandaging = 0, maxRows = 0;
const bled = new Set(), levels = new Set(), names = new Map();
c.on.s = m => {
  snaps++;
  const ids = new Set((m.pl || []).map(q => q[0]));
  if (!m.bl) return;
  withBl++;
  maxRows = Math.max(maxRows, m.bl.length);
  for (const [id, lv, fl] of m.bl) {
    if (!ids.has(id) || !(lv >= 1 && lv <= 3) || !Number.isInteger(fl)) bad++;
    if (id !== myId) { bled.add(id); levels.add(lv); if (fl & 1) bandaging++; }
  }
};
c.on.roster = m => { for (const r of m.r || m.players || m.list || []) if (r && r.id != null) names.set(r.id, r.name); };
await sleep(secs * 1000);
ok(`${snaps} snapshots in ${secs} s`, snaps > secs * 25);
ok(`bots bled: ${bled.size} of them (${[...bled].map(id => names.get(id) || id).join(', ')}), levels ${[...levels].sort().join('/')}, in ${withBl} snapshots (at most ${maxRows} at once)`, bled.size > 0);
ok('every row is a player in the snapshot with a level 1..3', !bad);
ok('no bot ever bandaged', !bandaging);
console.log('last messages:', c.got('msg').map(m => m.text).slice(-4).join(' | '));
c.close(); process.exit();
