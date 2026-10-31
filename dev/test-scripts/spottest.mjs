// Radar spotting: join as a CT with bots around, watch the "sp" lists in snapshots for ~25 s.
// Checks: only enemies (Terrorists) ever listed; positions match the snapshot; counts over time.
if (!globalThis.WebSocket) globalThis.WebSocket = (await import('ws')).default; // Node 20 has no global WebSocket
const ws = new WebSocket(`ws://127.0.0.1:${process.env.GAME_PORT || 3999}/ws`);
let me = null, team = process.argv[2] || 'CT';
const stats = { snaps: 0, withSp: 0, maxSp: 0, wrongTeam: 0, mismatch: 0, ids: new Set() };
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.t === 'welcome') { me = m.id; ws.send(JSON.stringify({ t: 'join', name: 'Spotter', team })); }
  if (m.t === 'spawn') { /* stand still, looking around */ }
  if (m.t === 's') {
    stats.snaps++;
    if (!m.sp) return;
    if (m.sp.length) stats.withSp++;
    stats.maxSp = Math.max(stats.maxSp, m.sp.length);
    for (const [id, x, z] of m.sp) {
      stats.ids.add(id);
      const row = m.pl.find(r => r[0] === id);
      if (!row || (row[9] === 1 ? 'T' : 'CT') === team) stats.wrongTeam++;
      else if (Math.hypot(row[1] - x, row[3] - z) > 0.05) stats.mismatch++;
    }
  }
};
await new Promise(r => setTimeout(r, +(process.argv[3] || 25000)));
console.log(JSON.stringify({ ...stats, ids: [...stats.ids] }));
process.exit(0);
