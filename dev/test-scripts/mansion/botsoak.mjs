// Keeps one scripted player on the server for N seconds (default 60) so the bots play (BOTS>0), then prints how many
// bots were seen in the snapshots and the round messages. Run against a server started with BOTS=4.
import { player, sleep } from './client.mjs';
const secs = +(process.argv[2] || 60);
const c = await player('Soak', process.argv[3] || 'CT');
const seen = new Set(); let snaps = 0;
c.on.s = m => { snaps++; for (const q of m.pl || m.p || []) if (Array.isArray(q)) seen.add(q[0]); };
await sleep(secs * 1000);
console.log('snapshots', snaps, 'msgs', c.got('msg').map(m => m.text).slice(-6).join(' | '));
c.close(); process.exit(0);
