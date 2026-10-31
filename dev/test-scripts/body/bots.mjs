// Bots with "Downed, not dead": one scripted player parked far outside the map (so the bots fight each other and the
// rounds aren't cut short by his death) for N seconds (default 60) on a server started with BOTS=4. Counts downs,
// finishes (and by whom: bots finish downed enemies), bleed-outs, revives, deaths and round ends, and how far downed
// bots crawl (they must not get stuck). Usage: node bots.mjs [secs] [team]
import { player, sleep } from '../mansion/client.mjs';
const secs = +(process.argv[2] || 60);
const c = await player('Soak', process.argv[3] || 'CT');
const names = new Map(), bots = new Set();
c.on.roster = m => { for (const e of m.list) { names.set(e.id, e.name); if (e.bot) bots.add(e.id); } };
const down = new Map(); // id -> { at, p0, maxMove }
const ev = { down: 0, finished: 0, bled: 0, revived: 0, kills: 0, finishedByBot: 0, rounds: [] };
let pendingFinish = null;
c.on.bodyDown = m => { ev.down++; down.set(m.v, { at: Date.now(), p0: null, max: 0 }); };
c.on.bodyKill = m => { ev[m.how]++; pendingFinish = m.how === 'finished' ? m.v : null; };
c.on.kill = m => { ev.kills++; if (pendingFinish === m.v && bots.has(m.k)) ev.finishedByBot++; pendingFinish = null; down.delete(m.v); };
c.on.bodyUp = m => { if (!m.pd) ev.revived++; down.delete(m.v); };
c.on.roundEnd = m => ev.rounds.push(m.reason);
let rescues = 0;
c.on.sfx = m => { if (m.s === 'rescue') rescues++; };
const crawls = [];
c.on.s = m => {
  for (const r of m.pl) {
    const d = down.get(r[0]);
    if (!d) continue;
    if (!d.p0) d.p0 = [r[1], r[3]];
    d.max = Math.max(d.max, Math.hypot(r[1] - d.p0[0], r[3] - d.p0[1]));
    d.c = r[6]; d.w = r[7];
  }
};
const park = () => c.at([500, 0, 500], 0);
c.on.spawn = () => setTimeout(park, 50);
park();
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  await sleep(1000);
  for (const [id, d] of down) if (Date.now() - d.at > 4000 && !d.logged) { d.logged = true; crawls.push(`${names.get(id)}: ${d.max.toFixed(1)} m in 4 s, crouched ${d.c}, holding ${d.w}`); }
}
console.log('downs', ev.down, '| finished', ev.finished, `(by bots ${ev.finishedByBot})`, '| bled out', ev.bled, '| revived', ev.revived, '| kills', ev.kills);
console.log('hostages rescued:', rescues);
console.log('rounds ended:', ev.rounds.length, ev.rounds.join(' | '));
console.log('downed bots after 4 s:', crawls.slice(0, 12).join('; ') || '(none lasted 4 s)');
c.close(); process.exit(0);
